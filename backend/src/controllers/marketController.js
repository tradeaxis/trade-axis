// backend/src/controllers/marketController.js
const { supabase } = require('../config/supabase');
const kiteService = require('../services/kiteService');

// ============ MOCK DATA for when Kite isn't connected ============
const MOCK_SYMBOLS = [
  // Index Futures
  { symbol: 'NIFTY-I', display_name: 'NIFTY Near Month', underlying: 'NIFTY', category: 'index_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 24500, bid: 24498, ask: 24502 },
  { symbol: 'NIFTY-II', display_name: 'NIFTY Next Month', underlying: 'NIFTY', category: 'index_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 24550, bid: 24548, ask: 24552 },
  { symbol: 'BANKNIFTY-I', display_name: 'BANKNIFTY Near Month', underlying: 'BANKNIFTY', category: 'index_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 51800, bid: 51795, ask: 51805 },
  { symbol: 'BANKNIFTY-II', display_name: 'BANKNIFTY Next Month', underlying: 'BANKNIFTY', category: 'index_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 51900, bid: 51895, ask: 51905 },
  { symbol: 'FINNIFTY-I', display_name: 'FINNIFTY Near Month', underlying: 'FINNIFTY', category: 'index_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 23200, bid: 23198, ask: 23202 },
  { symbol: 'MIDCPNIFTY-I', display_name: 'MIDCPNIFTY Near Month', underlying: 'MIDCPNIFTY', category: 'index_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 12500, bid: 12498, ask: 12502 },
  
  // Sensex Futures
  { symbol: 'SENSEX-I', display_name: 'SENSEX Near Month', underlying: 'SENSEX', category: 'sensex_futures', exchange: 'BSE', segment: 'BFO', lot_size: 1, tick_size: 0.05, last_price: 80500, bid: 80495, ask: 80505 },
  { symbol: 'BANKEX-I', display_name: 'BANKEX Near Month', underlying: 'BANKEX', category: 'sensex_futures', exchange: 'BSE', segment: 'BFO', lot_size: 1, tick_size: 0.05, last_price: 55000, bid: 54995, ask: 55005 },
  
  // Stock Futures - Popular
  { symbol: 'RELIANCE-I', display_name: 'RELIANCE Near Month', underlying: 'RELIANCE', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 2950, bid: 2949, ask: 2951 },
  { symbol: 'TCS-I', display_name: 'TCS Near Month', underlying: 'TCS', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 4200, bid: 4199, ask: 4201 },
  { symbol: 'INFY-I', display_name: 'INFY Near Month', underlying: 'INFY', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 1850, bid: 1849, ask: 1851 },
  { symbol: 'HDFCBANK-I', display_name: 'HDFCBANK Near Month', underlying: 'HDFCBANK', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 1720, bid: 1719, ask: 1721 },
  { symbol: 'ICICIBANK-I', display_name: 'ICICIBANK Near Month', underlying: 'ICICIBANK', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 1280, bid: 1279, ask: 1281 },
  { symbol: 'SBIN-I', display_name: 'SBIN Near Month', underlying: 'SBIN', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 820, bid: 819, ask: 821 },
  { symbol: 'TATAMOTORS-I', display_name: 'TATAMOTORS Near Month', underlying: 'TATAMOTORS', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 780, bid: 779, ask: 781 },
  { symbol: 'TATASTEEL-I', display_name: 'TATASTEEL Near Month', underlying: 'TATASTEEL', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 155, bid: 154.95, ask: 155.05 },
  { symbol: 'AXISBANK-I', display_name: 'AXISBANK Near Month', underlying: 'AXISBANK', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 1150, bid: 1149, ask: 1151 },
  { symbol: 'KOTAKBANK-I', display_name: 'KOTAKBANK Near Month', underlying: 'KOTAKBANK', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 1850, bid: 1849, ask: 1851 },
  { symbol: 'BHARTIARTL-I', display_name: 'BHARTIARTL Near Month', underlying: 'BHARTIARTL', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 1650, bid: 1649, ask: 1651 },
  { symbol: 'ITC-I', display_name: 'ITC Near Month', underlying: 'ITC', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 465, bid: 464.5, ask: 465.5 },
  { symbol: 'LT-I', display_name: 'L&T Near Month', underlying: 'LT', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 3550, bid: 3549, ask: 3551 },
  { symbol: 'MARUTI-I', display_name: 'MARUTI Near Month', underlying: 'MARUTI', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 12500, bid: 12498, ask: 12502 },
  { symbol: 'WIPRO-I', display_name: 'WIPRO Near Month', underlying: 'WIPRO', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 295, bid: 294.5, ask: 295.5 },
  { symbol: 'HCLTECH-I', display_name: 'HCLTECH Near Month', underlying: 'HCLTECH', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 1780, bid: 1779, ask: 1781 },
  { symbol: 'SUNPHARMA-I', display_name: 'SUNPHARMA Near Month', underlying: 'SUNPHARMA', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 1850, bid: 1849, ask: 1851 },
  { symbol: 'BAJFINANCE-I', display_name: 'BAJFINANCE Near Month', underlying: 'BAJFINANCE', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 6800, bid: 6798, ask: 6802 },
  { symbol: 'ADANIENT-I', display_name: 'ADANIENT Near Month', underlying: 'ADANIENT', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 2400, bid: 2399, ask: 2401 },
  { symbol: 'ADANIPORTS-I', display_name: 'ADANIPORTS Near Month', underlying: 'ADANIPORTS', category: 'stock_futures', exchange: 'NSE', segment: 'NFO', lot_size: 1, tick_size: 0.05, last_price: 1380, bid: 1379, ask: 1381 },
  
  // MCX Commodity Futures
  { symbol: 'GOLD-I', display_name: 'GOLD Near Month', underlying: 'GOLD', category: 'commodity_futures', exchange: 'MCX', segment: 'MCX', lot_size: 1, tick_size: 1, last_price: 72500, bid: 72490, ask: 72510 },
  { symbol: 'GOLDM-I', display_name: 'GOLDM Near Month', underlying: 'GOLDM', category: 'commodity_futures', exchange: 'MCX', segment: 'MCX', lot_size: 1, tick_size: 1, last_price: 72450, bid: 72440, ask: 72460 },
  { symbol: 'SILVER-I', display_name: 'SILVER Near Month', underlying: 'SILVER', category: 'commodity_futures', exchange: 'MCX', segment: 'MCX', lot_size: 1, tick_size: 1, last_price: 85000, bid: 84990, ask: 85010 },
  { symbol: 'SILVERM-I', display_name: 'SILVERM Near Month', underlying: 'SILVERM', category: 'commodity_futures', exchange: 'MCX', segment: 'MCX', lot_size: 1, tick_size: 1, last_price: 84900, bid: 84890, ask: 84910 },
  { symbol: 'CRUDEOIL-I', display_name: 'CRUDEOIL Near Month', underlying: 'CRUDEOIL', category: 'commodity_futures', exchange: 'MCX', segment: 'MCX', lot_size: 1, tick_size: 1, last_price: 6200, bid: 6198, ask: 6202 },
  { symbol: 'NATURALGAS-I', display_name: 'NATURALGAS Near Month', underlying: 'NATURALGAS', category: 'commodity_futures', exchange: 'MCX', segment: 'MCX', lot_size: 1, tick_size: 0.1, last_price: 195, bid: 194.9, ask: 195.1 },
  { symbol: 'COPPER-I', display_name: 'COPPER Near Month', underlying: 'COPPER', category: 'commodity_futures', exchange: 'MCX', segment: 'MCX', lot_size: 1, tick_size: 0.05, last_price: 850, bid: 849.9, ask: 850.1 },
  { symbol: 'ZINC-I', display_name: 'ZINC Near Month', underlying: 'ZINC', category: 'commodity_futures', exchange: 'MCX', segment: 'MCX', lot_size: 1, tick_size: 0.05, last_price: 265, bid: 264.9, ask: 265.1 },
  { symbol: 'ALUMINIUM-I', display_name: 'ALUMINIUM Near Month', underlying: 'ALUMINIUM', category: 'commodity_futures', exchange: 'MCX', segment: 'MCX', lot_size: 1, tick_size: 0.05, last_price: 235, bid: 234.9, ask: 235.1 },
];

// Add some variance to mock prices
const addMockPriceVariance = (symbols) => {
  return symbols.map(s => {
    const variance = (Math.random() - 0.5) * 0.002 * s.last_price; // ±0.1% variance
    const newPrice = s.last_price + variance;
    const spread = s.tick_size * (1 + Math.random());
    return {
      ...s,
      last_price: parseFloat(newPrice.toFixed(2)),
      bid: parseFloat((newPrice - spread/2).toFixed(2)),
      ask: parseFloat((newPrice + spread/2).toFixed(2)),
      change: parseFloat((variance).toFixed(2)),
      change_percent: parseFloat(((variance / s.last_price) * 100).toFixed(2)),
      instrument_type: 'FUT',
      series: 'I',
    };
  });
};

/**
 * Get all symbols (futures only)
 * Filters: NSE Index Futures, Stock Futures, Sensex Futures, MCX Commodity Futures
 * No options, no equity, no other segments
 */
exports.getSymbols = async (req, res) => {
  try {
    const { category, search, limit = 5000 } = req.query;
    
    // Allowed categories as per client requirement
    const ALLOWED_CATEGORIES = [
      'index_futures',    // NSE Index Futures (NIFTY, BANKNIFTY, etc.)
      'stock_futures',    // Stock Futures (RELIANCE, TCS, etc.)
      'sensex_futures',   // Sensex Futures (SENSEX, BANKEX)
      'commodity_futures' // MCX Commodity Futures (GOLD, SILVER, etc.)
    ];

    let allSymbols = [];
    const batchSize = 1000; // Supabase default limit
    let offset = 0;
    let hasMore = true;

    // Fetch all symbols using pagination to bypass Supabase 1000 row limit
    while (hasMore) {
      let query = supabase
        .from('symbols')
        .select('*')
        .eq('is_active', true)
        .eq('instrument_type', 'FUT')
        .in('category', ALLOWED_CATEGORIES)  // Only allowed categories
        .order('underlying', { ascending: true })
        .order('expiry_date', { ascending: true })
        .range(offset, offset + batchSize - 1);

      // Apply category filter if specific category requested
      if (category && category !== 'all' && ALLOWED_CATEGORIES.includes(category)) {
        query = supabase
          .from('symbols')
          .select('*')
          .eq('is_active', true)
          .eq('instrument_type', 'FUT')
          .eq('category', category)
          .order('underlying', { ascending: true })
          .order('expiry_date', { ascending: true })
          .range(offset, offset + batchSize - 1);
      }

      // Apply search filter
      if (search && search.trim()) {
        const term = search.trim();
        query = supabase
          .from('symbols')
          .select('*')
          .eq('is_active', true)
          .eq('instrument_type', 'FUT')
          .in('category', ALLOWED_CATEGORIES)
          .or(`symbol.ilike.%${term}%,display_name.ilike.%${term}%,underlying.ilike.%${term}%`)
          .order('underlying', { ascending: true })
          .order('expiry_date', { ascending: true })
          .range(offset, offset + batchSize - 1);
      }

      const { data: batch, error } = await query;

      if (error) {
        console.error('getSymbols batch error:', error);
        throw error;
      }

      if (batch && batch.length > 0) {
        allSymbols = allSymbols.concat(batch);
        offset += batchSize;
        
        // Stop if we got less than batch size (no more data) or reached limit
        if (batch.length < batchSize || allSymbols.length >= parseInt(limit)) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }

      // Safety: don't fetch more than 10 batches (10,000 symbols)
      if (offset >= 10000) {
        hasMore = false;
      }
    }

    // Trim to requested limit
    if (allSymbols.length > parseInt(limit)) {
      allSymbols = allSymbols.slice(0, parseInt(limit));
    }

    console.log(`📊 getSymbols: Returning ${allSymbols.length} symbols (source: zerodha)`);

    if (allSymbols.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No symbols found. Please sync symbols from Kite Connect.',
        symbols: [],
        source: 'zerodha'
      });
    }

    res.json({ 
      success: true, 
      symbols: allSymbols, 
      source: 'zerodha',
      total: allSymbols.length
    });
    
  } catch (error) {
    console.error('getSymbols error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch symbols: ' + error.message,
      source: 'zerodha'
    });
  }
};

/**
 * Get quote for a specific symbol
 */
exports.getQuote = async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({ success: false, message: 'Symbol required' });
    }

    // Try to get from DB
    const { data: sym, error } = await supabase
      .from('symbols')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (error || !sym) {
      // Check mock data
      const mockSym = MOCK_SYMBOLS.find(s => s.symbol === symbol.toUpperCase());
      if (mockSym) {
        const withVariance = addMockPriceVariance([mockSym])[0];
        return res.json({ success: true, quote: withVariance, source: 'mock' });
      }
      
      return res.status(404).json({ success: false, message: 'Symbol not found' });
    }

    // Add simulated price movement if no live data
    const quote = {
      ...sym,
      bid: sym.bid || sym.last_price * 0.9999,
      ask: sym.ask || sym.last_price * 1.0001,
      change_percent: sym.change_percent || 0,
    };

    res.json({ success: true, quote, source: 'database' });
  } catch (error) {
    console.error('getQuote error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get historical candles
 */
exports.getCandles = async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '15m', count = 300 } = req.query;

    // Try Kite first
    const candles = await kiteService.getHistoricalCandles(symbol, timeframe, parseInt(count));

    if (candles && candles.length > 0) {
      return res.json({ success: true, candles, source: 'kite' });
    }

    // Generate mock candles
    const mockCandles = generateMockCandles(symbol, timeframe, parseInt(count));
    res.json({ success: true, candles: mockCandles, source: 'mock' });
  } catch (error) {
    console.error('getCandles error:', error);
    
    // Return mock candles on error
    const mockCandles = generateMockCandles(req.params.symbol, req.query.timeframe || '15m', 300);
    res.json({ success: true, candles: mockCandles, source: 'mock' });
  }
};

/**
 * Generate mock candles for when Kite is not available
 */
function generateMockCandles(symbol, timeframe, count) {
  const mockSym = MOCK_SYMBOLS.find(s => s.symbol === symbol?.toUpperCase());
  const basePrice = mockSym?.last_price || 100;
  
  const intervalMinutes = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
  }[timeframe] || 15;

  const now = Math.floor(Date.now() / 1000);
  const candles = [];
  let currentPrice = basePrice;

  for (let i = count - 1; i >= 0; i--) {
    const time = now - (i * intervalMinutes * 60);
    
    // Random walk
    const change = (Math.random() - 0.5) * basePrice * 0.005;
    currentPrice += change;
    currentPrice = Math.max(currentPrice, basePrice * 0.9);
    currentPrice = Math.min(currentPrice, basePrice * 1.1);

    const high = currentPrice * (1 + Math.random() * 0.002);
    const low = currentPrice * (1 - Math.random() * 0.002);
    const open = currentPrice + (Math.random() - 0.5) * (high - low);
    const close = currentPrice + (Math.random() - 0.5) * (high - low);

    candles.push({
      time,
      open: parseFloat(Math.min(high, Math.max(low, open)).toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(Math.min(high, Math.max(low, close)).toFixed(2)),
      volume: Math.floor(Math.random() * 100000),
    });
  }

  return candles;
}

/**
 * Search symbols (futures only)
 * Filters: NSE Index Futures, Stock Futures, Sensex Futures, MCX Commodity Futures
 */
exports.searchSymbols = async (req, res) => {
  try {
    const { q, limit = 100 } = req.query;

    if (!q || q.trim().length < 1) {
      return res.json({ success: true, symbols: [], source: 'zerodha' });
    }

    const term = q.trim();
    
    // Allowed categories as per client requirement
    const ALLOWED_CATEGORIES = [
      'index_futures',
      'stock_futures', 
      'sensex_futures',
      'commodity_futures'
    ];

    // Search in DB with category filter
    const { data: symbols, error } = await supabase
      .from('symbols')
      .select('*')
      .eq('is_active', true)
      .eq('instrument_type', 'FUT')
      .in('category', ALLOWED_CATEGORIES)
      .or(`symbol.ilike.%${term}%,display_name.ilike.%${term}%,underlying.ilike.%${term}%`)
      .order('underlying', { ascending: true })
      .order('expiry_date', { ascending: true })
      .limit(parseInt(limit));

    if (error) {
      console.error('searchSymbols error:', error);
      throw error;
    }

    console.log(`🔍 searchSymbols: "${term}" found ${symbols?.length || 0} results`);

    res.json({ 
      success: true, 
      symbols: symbols || [], 
      source: 'zerodha',
      query: term,
      total: symbols?.length || 0
    });
    
  } catch (error) {
    console.error('searchSymbols error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      source: 'zerodha'
    });
  }
};