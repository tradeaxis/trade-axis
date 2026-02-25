const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');

const {
  placeOrder,
  closeTrade,
  closeAllTrades,
  modifyTrade,
  getOpenTrades,
  getTradeHistory,
  getTrade
} = require('../controllers/tradingController');

// All routes protected
router.use(protect);

// @route   POST /api/trading/order
router.post('/order', [
  body('accountId').notEmpty().withMessage('Account ID required'),
  body('symbol').notEmpty().withMessage('Symbol required'),
  body('type').isIn(['buy', 'sell']).withMessage('Type must be buy or sell'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], validate, placeOrder);

// @route   POST /api/trading/close/:id
router.post('/close/:id', closeTrade);

// @route   POST /api/trading/close-all
router.post('/close-all', [
  body('accountId').notEmpty().withMessage('Account ID required')
], validate, closeAllTrades);

// @route   PUT /api/trading/modify/:id
router.put('/modify/:id', modifyTrade);

// @route   GET /api/trading/open
router.get('/open', getOpenTrades);

// @route   GET /api/trading/history
router.get('/history', getTradeHistory);

// @route   GET /api/trading/:id
router.get('/:id', getTrade);

module.exports = router;