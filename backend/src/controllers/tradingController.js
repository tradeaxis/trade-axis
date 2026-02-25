const { supabase } = require('../config/supabase');
const paymentService = require('../services/paymentService');

// @desc    Get Razorpay key
// @route   GET /api/transactions/razorpay-key
const getRazorpayKey = (req, res) => {
  res.json({
    success: true,
    key: paymentService.getRazorpayKey()
  });
};

// @desc    Create deposit order
// @route   POST /api/transactions/deposit/create
const createDeposit = async (req, res) => {
  try {
    const { accountId, amount } = req.body;

    const order = await paymentService.createDepositOrder(
      req.user.id,
      accountId,
      amount
    );

    res.status(200).json({
      success: true,
      data: order
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Verify and confirm deposit
// @route   POST /api/transactions/deposit/verify
const verifyDeposit = async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;

    const transaction = await paymentService.confirmDeposit(
      orderId,
      paymentId,
      signature
    );

    res.status(200).json({
      success: true,
      message: 'Deposit successful',
      data: transaction
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create withdrawal request
// @route   POST /api/transactions/withdraw
const withdraw = async (req, res) => {
  try {
    const { accountId, amount, bankName, accountNumber, ifscCode, accountHolderName } = req.body;

    const transaction = await paymentService.createWithdrawalRequest(
      req.user.id,
      accountId,
      amount,
      {
        bankName,
        accountNumber,
        ifscCode,
        accountHolderName
      }
    );

    res.status(200).json({
      success: true,
      message: 'Withdrawal request submitted. Will be processed within 24 hours.',
      data: transaction
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get transactions
// @route   GET /api/transactions
const getTransactions = async (req, res) => {
  try {
    const { accountId, type, status, limit = 50 } = req.query;

    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (accountId) query = query.eq('account_id', accountId);
    if (type) query = query.eq('transaction_type', type);
    if (status) query = query.eq('status', status);

    const { data: transactions, error } = await query;
    if (error) throw error;

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single transaction
// @route   GET /api/transactions/:id
const getTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: transaction, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.status(200).json({
      success: true,
      data: transaction
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getRazorpayKey,
  createDeposit,
  verifyDeposit,
  withdraw,
  getTransactions,
  getTransaction
};