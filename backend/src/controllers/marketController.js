const { supabase } = require('../config/supabase');
const marketDataService = require('../services/marketDataService');

// @desc    Get all symbols
// @route   GET /api/market/symbols
const getSymbols = async (req, res) => {
  try {
    const { category, exchange, search } = req.query;

    let query = supabase
      .from('symbols')
      .select('*')
      .eq('is_active', true)
      .order('symbol');

    if (category) {
      query = query.eq('category', category);
    }

    if (exchange) {
      query = query.eq('exchange', exchange);
    }

    if (search) {
      query = query.or(`symbol.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      data
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get live quote
// @route   GET /api/market/quote/:symbol
const getQuote = async (req, res) => {
  try {
    const { symbol } = req.params;

    const quote = await marketDataService.getQuote(symbol);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Symbol not found'
      });
    }

    res.status(200).json({
      success: true,
      data: quote
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get multiple quotes
// @route   POST /api/market/quotes
const getQuotes = async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of symbols'
      });
    }

    const quotes = await marketDataService.getQuotes(symbols);

    res.status(200).json({
      success: true,
      count: Object.keys(quotes).length,
      data: quotes
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get candle data (OHLC)
// @route   GET /api/market/candles/:symbol
const getCandles = async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1h', count = 100 } = req.query;

    // Get symbol info
    const { data: symbolData, error } = await supabase
      .from('symbols')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (error || !symbolData) {
      return res.status(404).json({
        success: false,
        message: 'Symbol not found'
      });
    }

    const candles = marketDataService.generateCandles(
      symbolData, 
      timeframe, 
      parseInt(count)
    );

    res.status(200).json({
      success: true,
      symbol: symbol.toUpperCase(),
      timeframe,
      count: candles.length,
      data: candles
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get market status
// @route   GET /api/market/status
const getMarketStatus = async (req, res) => {
  try {
    const exchanges = ['NSE', 'BSE', 'MCX', 'CDS'];
    const status = {};

    for (const exchange of exchanges) {
      status[exchange] = marketDataService.isMarketOpen(exchange);
    }

    res.status(200).json({
      success: true,
      serverTime: new Date().toISOString(),
      data: status
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get top gainers
// @route   GET /api/market/gainers
const getTopGainers = async (req, res) => {
  try {
    const { category, limit = 10 } = req.query;

    let query = supabase
      .from('symbols')
      .select('*')
      .eq('is_active', true)
      .gt('change_percent', 0)
      .order('change_percent', { ascending: false })
      .limit(parseInt(limit));

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      data
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get top losers
// @route   GET /api/market/losers
const getTopLosers = async (req, res) => {
  try {
    const { category, limit = 10 } = req.query;

    let query = supabase
      .from('symbols')
      .select('*')
      .eq('is_active', true)
      .lt('change_percent', 0)
      .order('change_percent', { ascending: true })
      .limit(parseInt(limit));

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      data
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getSymbols,
  getQuote,
  getQuotes,
  getCandles,
  getMarketStatus,
  getTopGainers,
  getTopLosers
};