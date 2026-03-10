// backend/src/services/kiteStreamService.js
const { KiteTicker } = require('kiteconnect');
const { supabase } = require('../config/supabase');
const kiteService = require('./kiteService');

class KiteStreamService {
  constructor() {
    this.ticker = null;
    this.io = null;
    this.running = false;
    this.tokenToSymbols = new Map(); // token -> [symbolRows]
    this.lastTickAt = null;

    // ✅ NEW: In-memory price cache for instant access (no DB round-trip)
    this.latestPrices = new Map(); // symbol -> { bid, ask, last, change, changePercent, timestamp }

    // ✅ NEW: DB write buffer — emit to WebSocket instantly, write to DB in batches
    this.priceBuffer = new Map(); // token -> { symbols, payload }
    this.dbFlushInterval = null;
    this.isFlushing = false;
    this.DB_FLUSH_MS = 3000; // Flush to DB every 3 seconds
  }

  isRunning() {
    return this.running;
  }

  // ✅ NEW: Get latest real-time price from memory (sub-millisecond, no DB)
  getLatestPrice(symbol) {
    return this.latestPrices.get(String(symbol).toUpperCase()) || null;
  }

  // ✅ NEW: Get all latest prices
  getAllLatestPrices() {
    const result = {};
    for (const [sym, data] of this.latestPrices) {
      result[sym] = data;
    }
    return result;
  }

  async buildTokenMap() {
    const { data, error } = await supabase
      .from('symbols')
      .select('symbol, kite_instrument_token')
      .eq('is_active', true)
      .not('kite_instrument_token', 'is', null);

    if (error) throw error;

    const map = new Map();
    for (const row of data || []) {
      const token = Number(row.kite_instrument_token);
      if (!map.has(token)) map.set(token, []);
      map.get(token).push(row.symbol);
    }

    this.tokenToSymbols = map;
    return map;
  }

  async start(io) {
    this.io = io;

    await kiteService.init();
    if (!kiteService.isSessionReady()) {
      console.log('ℹ️ Kite session not ready. Stream not started.');
      return { started: false, reason: 'kite session not ready' };
    }

    await this.buildTokenMap();

    const tokens = Array.from(this.tokenToSymbols.keys());
    if (tokens.length === 0) {
      console.log('ℹ️ No kite instrument tokens found in symbols table.');
      return { started: false, reason: 'no tokens' };
    }

    // Create ticker
    const apiKey = process.env.KITE_API_KEY;
    const accessToken = kiteService.accessToken;

    this.ticker = new KiteTicker({ api_key: apiKey, access_token: accessToken });
    this.running = true;

    const mode = String(process.env.KITE_TICK_MODE || 'full').toLowerCase();

    this.ticker.on('connect', () => {
      console.log('✅ KiteTicker connected. Subscribing tokens:', tokens.length);
      this.ticker.subscribe(tokens);
      this.ticker.setMode(mode, tokens);
    });

    this.ticker.on('ticks', (ticks) => {
      this.lastTickAt = new Date().toISOString();
      this.handleTicks(ticks); // ✅ NOT awaited — fire and forget for speed
    });

    this.ticker.on('error', (err) => {
      console.error('❌ KiteTicker error:', err?.message || err);
    });

    this.ticker.on('close', () => {
      console.log('❌ KiteTicker closed');
      this.running = false;
    });

    this.ticker.on('reconnect', () => {
      console.log('🔄 KiteTicker reconnecting...');
    });

    this.ticker.connect();

    // ✅ Start periodic DB flusher
    this.startDbFlusher();

    return { started: true, tokens: tokens.length, mode };
  }

  async stop() {
    try {
      if (this.dbFlushInterval) {
        clearInterval(this.dbFlushInterval);
        this.dbFlushInterval = null;
      }
      // Final flush before stopping
      await this.flushPriceBuffer();

      if (this.ticker) {
        this.ticker.disconnect();
        this.ticker = null;
      }
    } finally {
      this.running = false;
    }
    return { stopped: true };
  }

  // ✅ NEW: Start periodic DB flush
  startDbFlusher() {
    if (this.dbFlushInterval) clearInterval(this.dbFlushInterval);
    this.dbFlushInterval = setInterval(() => this.flushPriceBuffer(), this.DB_FLUSH_MS);
    console.log(`📦 DB price flusher started (every ${this.DB_FLUSH_MS}ms)`);
  }

  // ✅ NEW: Flush buffered prices to DB in batches
  async flushPriceBuffer() {
    if (this.isFlushing || this.priceBuffer.size === 0) return;
    this.isFlushing = true;

    try {
      const entries = [...this.priceBuffer.values()];
      this.priceBuffer.clear();

      // Parallel batch updates — each entry updates 1-3 symbols sharing same token
      const BATCH = 200;
      for (let i = 0; i < entries.length; i += BATCH) {
        const batch = entries.slice(i, i + BATCH);
        await Promise.allSettled(
          batch.map(({ symbols, payload }) =>
            supabase.from('symbols').update(payload).in('symbol', symbols)
          )
        );
      }
    } catch (e) {
      console.error('DB flush error:', e.message);
    } finally {
      this.isFlushing = false;
    }
  }

  // ✅ OPTIMIZED: Emit to WebSocket INSTANTLY, buffer DB writes
  handleTicks(ticks) {
    if (!ticks || ticks.length === 0) return;

    const now = Date.now();
    const isoNow = new Date().toISOString();

    for (const t of ticks) {
      const token = Number(t.instrument_token);
      const symbols = this.tokenToSymbols.get(token);
      if (!symbols || symbols.length === 0) continue;

      const last = Number(t.last_price || 0);
      if (last <= 0) continue; // Skip invalid prices

      const ohlc = t.ohlc || {};
      const prevClose = Number(ohlc.close || 0);
      const chgVal = prevClose ? (last - prevClose) : 0;
      const chgPct = prevClose ? (chgVal / prevClose) * 100 : 0;

      let bid = last;
      let ask = last;

      // FULL mode provides depth
      if (t.depth?.buy?.length && t.depth.buy[0].price > 0) {
        bid = Number(t.depth.buy[0].price);
      }
      if (t.depth?.sell?.length && t.depth.sell[0].price > 0) {
        ask = Number(t.depth.sell[0].price);
      }

      const dbPayload = {
        last_price: last,
        bid,
        ask,
        open_price: Number(ohlc.open || last),
        high_price: Number(ohlc.high || last),
        low_price: Number(ohlc.low || last),
        previous_close: prevClose || last,
        change_value: parseFloat(chgVal.toFixed(2)),
        change_percent: parseFloat(chgPct.toFixed(2)),
        last_update: isoNow,
      };

      // ✅ STEP 1: Update in-memory cache (instant)
      for (const s of symbols) {
        this.latestPrices.set(s, {
          bid,
          ask,
          last,
          open: dbPayload.open_price,
          high: dbPayload.high_price,
          low: dbPayload.low_price,
          previousClose: prevClose,
          change: chgVal,
          changePercent: chgPct,
          timestamp: now,
          source: 'kite',
        });
      }

      // ✅ STEP 2: Buffer for DB write (async, not blocking)
      this.priceBuffer.set(token, { symbols: [...symbols], payload: dbPayload });

      // ✅ STEP 3: Emit to WebSocket rooms IMMEDIATELY (no DB wait)
      for (const s of symbols) {
        this.io?.to(`symbol:${s}`).emit('price:update', {
          symbol: s,
          bid,
          ask,
          last,
          change: parseFloat(chgVal.toFixed(2)),
          changePercent: parseFloat(chgPct.toFixed(2)),
          timestamp: now,
          source: 'kite',
        });
      }
    }
  }

  status() {
    return {
      running: this.running,
      lastTickAt: this.lastTickAt,
      tokenCount: this.tokenToSymbols?.size || 0,
      pricesCached: this.latestPrices.size,
      bufferSize: this.priceBuffer.size,
    };
  }
}

module.exports = new KiteStreamService();