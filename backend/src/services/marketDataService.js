// backend/src/services/marketDataService.js
const { supabase } = require('../config/supabase');
const kiteService = require('./kiteService');
const kiteStreamService = require('./kiteStreamService');

class MarketDataService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5000; // ✅ Increased to 5s (was 1.5s — too aggressive)
  }

  // ✅ Quote: Try in-memory Kite cache first, then DB. NO simulation.
  async getQuote(symbol) {
    const sym = String(symbol || '').toUpperCase();
    const cacheKey = `quote_${sym}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    // Try in-memory Kite price first (instant, real-time)
    const kitePrice = kiteStreamService.getLatestPrice(sym);

    // Then get symbol metadata from DB
    const { data, error } = await supabase
      .from('symbols')
      .select('*')
      .eq('symbol', sym)
      .single();

    if (error || !data) return null;

    // Merge: prefer Kite real-time prices, fall back to DB stored prices
    const lp = kitePrice || {};

    const quote = {
      symbol: data.symbol,
      displayName: data.display_name,
      exchange: data.exchange,
      category: data.category,

      lastPrice: Number(lp.last || data.last_price || 0),
      bid: Number(lp.bid || data.bid || data.last_price || 0),
      ask: Number(lp.ask || data.ask || data.last_price || 0),

      open: Number(lp.open || data.open_price || data.open || 0),
      high: Number(lp.high || data.high_price || data.high || 0),
      low: Number(lp.low || data.low_price || data.low || 0),
      close: Number(data.close || 0),
      previousClose: Number(lp.previousClose || data.previous_close || 0),

      change: Number(lp.change ?? data.change_value ?? 0),
      changePercent: Number(lp.changePercent ?? data.change_percent ?? 0),
      volume: Number(data.volume || 0),

      lotSize: Number(data.lot_size || 1),
      tickSize: Number(data.tick_size || 0.05),
      tradingHours: data.trading_hours || null,

      timestamp: Date.now(),
      source: kitePrice ? 'kite' : (data.kite_instrument_token ? 'db' : 'db'),
    };

    this.cache.set(cacheKey, { data: quote, timestamp: Date.now() });
    return quote;
  }

  async getQuotes(symbols) {
    const out = {};
    for (const s of symbols || []) {
      const q = await this.getQuote(s);
      if (q) out[String(s).toUpperCase()] = q;
    }
    return out;
  }

  // ✅ Candles: Kite historical ONLY. No simulated fallback.
  async getCandles(symbol, timeframe = '1h', count = 100) {
    const sym = String(symbol || '').toUpperCase();

    try {
      const candles = await kiteService.getHistoricalCandles(sym, timeframe, Number(count) || 100);
      if (candles && candles.length) return candles;
    } catch (e) {
      console.error('getCandles error:', e.message);
    }

    // ✅ Return empty array — NO fake/simulated candles
    return [];
  }

  // ✅✅✅ REMOVED: simulatePriceMovement()  — was corrupting real prices
  // ✅✅✅ REMOVED: getVolatility()           — simulation helper
  // ✅✅✅ REMOVED: getSpread()               — simulation helper
  // ✅✅✅ REMOVED: updateAllPrices()          — was writing random prices to DB
  // ✅✅✅ REMOVED: generateCandles()          — was generating fake chart data
}

module.exports = new MarketDataService();