const express = require('express');
const router = express.Router();

const {
  getSymbols,
  getQuote,
  getQuotes,
  getCandles,
  getMarketStatus,
  getTopGainers,
  getTopLosers
} = require('../controllers/marketController');

// Public routes (no auth required)

// @route   GET /api/market/symbols
router.get('/symbols', getSymbols);

// @route   GET /api/market/quote/:symbol
router.get('/quote/:symbol', getQuote);

// @route   POST /api/market/quotes
router.post('/quotes', getQuotes);

// @route   GET /api/market/candles/:symbol
router.get('/candles/:symbol', getCandles);

// @route   GET /api/market/status
router.get('/status', getMarketStatus);

// @route   GET /api/market/gainers
router.get('/gainers', getTopGainers);

// @route   GET /api/market/losers
router.get('/losers', getTopLosers);

module.exports = router;