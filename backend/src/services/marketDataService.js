const { supabase } = require('../config/supabase');

class MarketDataService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5000; // 5 seconds
  }

  // Get quote for a symbol
  async getQuote(symbol) {
    const cacheKey = `quote_${symbol}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const { data, error } = await supabase
      .from('symbols')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (error || !data) {
      return null;
    }

    // Simulate live price movement
    const quote = this.simulatePriceMovement(data);
    
    this.cache.set(cacheKey, { data: quote, timestamp: Date.now() });
    return quote;
  }

  // Get quotes for multiple symbols
  async getQuotes(symbols) {
    const quotes = {};
    
    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol);
      if (quote) {
        quotes[symbol] = quote;
      }
    }
    
    return quotes;
  }

  // Simulate price movement (for demo)
  simulatePriceMovement(symbol) {
    const volatility = this.getVolatility(symbol.category);
    const lastPrice = parseFloat(symbol.last_price);
    
    // Random movement within volatility range
    const movement = (Math.random() - 0.5) * 2 * volatility * lastPrice;
    const newPrice = Math.max(0.01, lastPrice + movement);
    
    // Calculate bid/ask spread
    const spreadPercent = this.getSpread(symbol.category);
    const spread = newPrice * spreadPercent;
    
    const bid = newPrice - spread / 2;
    const ask = newPrice + spread / 2;
    
    // Calculate change from previous close
    const previousClose = parseFloat(symbol.previous_close) || newPrice;
    const change = newPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol: symbol.symbol,
      displayName: symbol.display_name,
      exchange: symbol.exchange,
      category: symbol.category,
      lastPrice: parseFloat(newPrice.toFixed(4)),
      bid: parseFloat(bid.toFixed(4)),
      ask: parseFloat(ask.toFixed(4)),
      open: parseFloat(symbol.open_price),
      high: parseFloat(symbol.high_price),
      low: parseFloat(symbol.low_price),
      previousClose: previousClose,
      change: parseFloat(change.toFixed(4)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      volume: symbol.volume,
      lotSize: symbol.lot_size,
      tickSize: symbol.tick_size,
      tradingHours: symbol.trading_hours,
      timestamp: Date.now()
    };
  }

  // Get volatility by category
  getVolatility(category) {
    const volatilities = {
      equity: 0.001,    // 0.1%
      index: 0.0005,    // 0.05%
      commodity: 0.002, // 0.2%
      currency: 0.0003  // 0.03%
    };
    return volatilities[category] || 0.001;
  }

  // Get spread by category
  getSpread(category) {
    const spreads = {
      equity: 0.001,    // 0.1%
      index: 0.0002,    // 0.02%
      commodity: 0.002, // 0.2%
      currency: 0.0001  // 0.01%
    };
    return spreads[category] || 0.001;
  }

  // Update all prices in database
  async updateAllPrices() {
    const { data: symbols } = await supabase
      .from('symbols')
      .select('*')
      .eq('is_active', true);

    if (!symbols) return;

    for (const symbol of symbols) {
      const quote = this.simulatePriceMovement(symbol);
      
      await supabase
        .from('symbols')
        .update({
          last_price: quote.lastPrice,
          bid: quote.bid,
          ask: quote.ask,
          change_value: quote.change,
          change_percent: quote.changePercent,
          last_update: new Date().toISOString()
        })
        .eq('id', symbol.id);
    }
  }

  // Check if market is open (Indian market hours)
  isMarketOpen(exchange) {
    const now = new Date();
    const istOffset = 5.5 * 60; // IST is UTC+5:30
    const istTime = new Date(now.getTime() + istOffset * 60000);
    
    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();
    const day = istTime.getUTCDay();
    const currentTime = hours * 60 + minutes;

    // Weekend check
    if (day === 0 || day === 6) {
      return { isOpen: false, reason: 'Weekend' };
    }

    const schedules = {
      NSE: { open: 9 * 60 + 15, close: 15 * 60 + 30 },  // 9:15 AM - 3:30 PM
      BSE: { open: 9 * 60 + 15, close: 15 * 60 + 30 },
      MCX: { open: 9 * 60, close: 23 * 60 + 30 },       // 9:00 AM - 11:30 PM
      CDS: { open: 9 * 60, close: 17 * 60 }              // 9:00 AM - 5:00 PM
    };

    const schedule = schedules[exchange] || schedules.NSE;
    
    if (currentTime >= schedule.open && currentTime <= schedule.close) {
      return { isOpen: true, reason: 'Market Open' };
    }

    return { 
      isOpen: false, 
      reason: currentTime < schedule.open ? 'Pre-market' : 'After-hours'
    };
  }

  // Generate candle data (OHLC)
  generateCandles(symbol, timeframe = '1h', count = 100) {
    const candles = [];
    let price = parseFloat(symbol.last_price) || 100;
    const now = Date.now();
    
    const intervals = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '30m': 1800000,
      '1h': 3600000,
      '4h': 14400000,
      '1d': 86400000
    };
    
    const interval = intervals[timeframe] || 3600000;
    const volatility = this.getVolatility(symbol.category) * 5;

    for (let i = count - 1; i >= 0; i--) {
      const timestamp = now - (i * interval);
      const open = price;
      const change = (Math.random() - 0.5) * 2 * volatility * price;
      const close = Math.max(0.01, open + change);
      const high = Math.max(open, close) + Math.random() * volatility * price;
      const low = Math.min(open, close) - Math.random() * volatility * price;
      
      candles.push({
        time: Math.floor(timestamp / 1000),
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(Math.max(0.01, low).toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: Math.floor(Math.random() * 100000)
      });
      
      price = close;
    }

    return candles;
  }
}

module.exports = new MarketDataService();