// backend/src/controllers/marketController.js
const { supabase } = require('../config/supabase');
const kiteService = require('../services/kiteService');
const kiteStreamService = require('../services/kiteStreamService');

const ALLOWED_CATEGORIES = [
  'index_futures',
  'stock_futures',
  'sensex_futures',
  'commodity_futures',
];

/**
 * Get all symbols (futures only) — WITH PROPER PAGINATION
 */
exports.getSymbols = async (req, res) => {
  try {
    const { category, search, limit = 10000 } = req.query;
    const maxLimit = parseInt(limit);

    let allSymbols = [];
    const BATCH_SIZE = 1000; // Supabase max per query
    let offset = 0;
    let hasMore = true;

    // ✅ Paginate to get ALL symbols (bypass 1000 row limit)
    while (hasMore && allSymbols.length < maxLimit) {
      let query = supabase
        .from('symbols')
        .select('*')
        .eq('is_active', true)
        .eq('instrument_type', 'FUT')
        .order('underlying', { ascending: true })
        .order('expiry_date', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      // Category filter
      if (category && category !== 'all' && ALLOWED_CATEGORIES.includes(category)) {
        query = query.eq('category', category);
      } else {
        query = query.in('category', ALLOWED_CATEGORIES);
      }

      // Search filter (if provided, search on backend)
      if (search && search.trim()) {
        const term = search.trim().toLowerCase();
        query = supabase
          .from('symbols')
          .select('*')
          .eq('is_active', true)
          .eq('instrument_type', 'FUT')
          .in('category', category && ALLOWED_CATEGORIES.includes(category) ? [category] : ALLOWED_CATEGORIES)
          .or(`symbol.ilike.%${term}%,display_name.ilike.%${term}%,underlying.ilike.%${term}%`)
          .order('underlying', { ascending: true })
          .order('expiry_date', { ascending: true })
          .range(offset, offset + BATCH_SIZE - 1);
      }

      const { data: batch, error } = await query;

      if (error) {
        console.error('getSymbols batch error:', error);
        throw error;
      }

      if (batch && batch.length > 0) {
        allSymbols = allSymbols.concat(batch);
        offset += BATCH_SIZE;

        // Stop if we got less than batch size (no more data)
        if (batch.length < BATCH_SIZE) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }

      // Safety: max 20 batches (20,000 symbols)
      if (offset >= 20000) {
        hasMore = false;
      }
    }

    // Trim to requested limit
    if (allSymbols.length > maxLimit) {
      allSymbols = allSymbols.slice(0, maxLimit);
    }

    // ✅ Merge live prices from Kite stream if running
    if (kiteStreamService.isRunning()) {
      allSymbols = allSymbols.map((s) => {
        const livePrice = kiteStreamService.getLatestPrice(s.symbol);
        if (livePrice && livePrice.last > 0) {
          return {
            ...s,
            last_price: livePrice.last,
            bid: livePrice.bid,
            ask: livePrice.ask,
            change_value: livePrice.change,
            change_percent: livePrice.changePercent,
          };
        }
        return s;
      });
    }

    console.log(`📊 getSymbols: Returning ${allSymbols.length} symbols`);

    res.json({
      success: true,
      symbols: allSymbols,
      source: 'zerodha',
      total: allSymbols.length,
    });
  } catch (error) {
    console.error('getSymbols error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch symbols: ' + error.message,
      source: 'zerodha',
    });
  }
};

/**
 * Get quote for a specific symbol — real data only
 */
exports.getQuote = async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({ success: false, message: 'Symbol required' });
    }

    const sym = symbol.toUpperCase();

    // Try in-memory Kite cache first
    const livePrice = kiteStreamService.getLatestPrice(sym);

    // Get full symbol data from DB
    const { data: dbSym, error } = await supabase
      .from('symbols')
      .select('*')
      .eq('symbol', sym)
      .single();

    if (error || !dbSym) {
      return res.status(404).json({ success: false, message: 'Symbol not found' });
    }

    // Merge live prices if available
    const quote = { ...dbSym };
    if (livePrice && livePrice.last > 0) {
      quote.last_price = livePrice.last;
      quote.bid = livePrice.bid;
      quote.ask = livePrice.ask;
      quote.change_value = livePrice.change;
      quote.change_percent = livePrice.changePercent;
    }

    res.json({ success: true, quote, source: livePrice ? 'kite' : 'database' });
  } catch (error) {
    console.error('getQuote error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get historical candles — Kite data only
 */
exports.getCandles = async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '15m', count = 300 } = req.query;

    const candles = await kiteService.getHistoricalCandles(symbol, timeframe, parseInt(count));

    if (candles && candles.length > 0) {
      return res.json({ success: true, candles, source: 'kite' });
    }

    res.json({
      success: true,
      candles: [],
      source: 'none',
      message: 'No historical data available. Kite session may not be active.',
    });
  } catch (error) {
    console.error('getCandles error:', error);
    res.json({
      success: true,
      candles: [],
      source: 'none',
      message: 'Failed to fetch candles: ' + error.message,
    });
  }
};

/**
 * Search symbols — optimized for quick search
 */
exports.searchSymbols = async (req, res) => {
  try {
    const { q, category, limit = 50 } = req.query;

    if (!q || q.trim().length < 1) {
      return res.json({ success: true, symbols: [], source: 'zerodha' });
    }

    const term = q.trim();

    let query = supabase
      .from('symbols')
      .select('*')
      .eq('is_active', true)
      .eq('instrument_type', 'FUT')
      .or(`symbol.ilike.%${term}%,display_name.ilike.%${term}%,underlying.ilike.%${term}%`)
      .order('underlying', { ascending: true })
      .order('expiry_date', { ascending: true })
      .limit(parseInt(limit));

    // Add category filter if specified
    if (category && category !== 'all' && ALLOWED_CATEGORIES.includes(category)) {
      query = query.eq('category', category);
    } else {
      query = query.in('category', ALLOWED_CATEGORIES);
    }

    const { data: symbols, error } = await query;

    if (error) {
      console.error('searchSymbols error:', error);
      throw error;
    }

    // Merge live prices
    let enrichedSymbols = symbols || [];
    if (kiteStreamService.isRunning()) {
      enrichedSymbols = enrichedSymbols.map((s) => {
        const livePrice = kiteStreamService.getLatestPrice(s.symbol);
        if (livePrice && livePrice.last > 0) {
          return {
            ...s,
            last_price: livePrice.last,
            bid: livePrice.bid,
            ask: livePrice.ask,
            change_value: livePrice.change,
            change_percent: livePrice.changePercent,
          };
        }
        return s;
      });
    }

    res.json({
      success: true,
      symbols: enrichedSymbols,
      source: 'zerodha',
      query: term,
      total: enrichedSymbols.length,
    });
  } catch (error) {
    console.error('searchSymbols error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      source: 'zerodha',
    });
  }
};