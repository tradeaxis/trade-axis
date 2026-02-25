const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');

const {
  getRazorpayKey,
  createDeposit,
  verifyDeposit,
  withdraw,
  getTransactions,
  getTransaction
} = require('../controllers/transactionController');

// Public
router.get('/razorpay-key', getRazorpayKey);

// Protected
router.use(protect);

// Deposits
router.post('/deposit/create', [
  body('accountId').notEmpty().withMessage('Account ID required'),
  body('amount').isFloat({ min: 100, max: 1000000 }).withMessage('Amount must be ₹100 - ₹10,00,000')
], validate, createDeposit);

router.post('/deposit/verify', [
  body('orderId').notEmpty(),
  body('paymentId').notEmpty(),
  body('signature').notEmpty()
], validate, verifyDeposit);

// Withdrawals
router.post('/withdraw', [
  body('accountId').notEmpty(),
  body('amount').isFloat({ min: 100 }),
  body('bankName').notEmpty().withMessage('Bank name required'),
  body('accountNumber').notEmpty().withMessage('Account number required'),
  body('ifscCode').matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('Invalid IFSC code'),
  body('accountHolderName').notEmpty().withMessage('Account holder name required')
], validate, withdraw);

// History
router.get('/', getTransactions);
router.get('/:id', getTransaction);

module.exports = router;