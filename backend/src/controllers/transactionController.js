const { supabase } = require('../config/supabase');

// Generate transaction reference
const generateReference = (type) => {
  const prefix = type === 'deposit' ? 'DEP' : 'WTH';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

// @desc    Deposit funds
// @route   POST /api/transactions/deposit
const deposit = async (req, res) => {
  try {
    const { accountId, amount, paymentMethod, upiId } = req.body;

    // Validate amount
    if (amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum deposit amount is ₹100'
      });
    }

    if (amount > 1000000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum deposit amount is ₹10,00,000'
      });
    }

    // Check account exists and belongs to user
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', req.user.id)
      .single();

    if (accountError || !account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Cannot deposit to demo account
    if (account.is_demo) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deposit to demo account. Use reset instead.'
      });
    }

    // Generate reference
    const reference = generateReference('deposit');

    // Create transaction record
    const { data: transaction, error: txnError } = await supabase
      .from('transactions')
      .insert([
        {
          user_id: req.user.id,
          account_id: accountId,
          transaction_type: 'deposit',
          amount: amount,
          payment_method: paymentMethod,
          upi_id: upiId || null,
          status: 'pending',
          reference: reference,
          balance_before: account.balance
        }
      ])
      .select()
      .single();

    if (txnError) throw txnError;

    // For demo purposes, auto-approve deposit
    // In production, this would integrate with payment gateway
    const newBalance = parseFloat(account.balance) + parseFloat(amount);

    // Update account balance
    await supabase
      .from('accounts')
      .update({
        balance: newBalance,
        equity: newBalance + parseFloat(account.profit || 0),
        free_margin: newBalance + parseFloat(account.profit || 0) - parseFloat(account.margin || 0)
      })
      .eq('id', accountId);

    // Update transaction status
    const { data: completedTxn, error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'completed',
        balance_after: newBalance,
        processed_at: new Date().toISOString()
      })
      .eq('id', transaction.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.status(200).json({
      success: true,
      message: 'Deposit successful',
      data: {
        transaction: completedTxn,
        newBalance: newBalance
      }
    });

  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Withdraw funds
// @route   POST /api/transactions/withdraw
const withdraw = async (req, res) => {
  try {
    const { accountId, amount, paymentMethod, bankName, accountNumber, ifscCode } = req.body;

    // Validate amount
    if (amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum withdrawal amount is ₹100'
      });
    }

    // Check account exists and belongs to user
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', req.user.id)
      .single();

    if (accountError || !account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Cannot withdraw from demo account
    if (account.is_demo) {
      return res.status(400).json({
        success: false,
        message: 'Cannot withdraw from demo account'
      });
    }

    // Check sufficient balance (use free margin for withdrawals)
    const availableBalance = parseFloat(account.free_margin);
    if (amount > availableBalance) {
      return res.status(400).json({
        success: false,
        message: `Insufficient funds. Available: ₹${availableBalance.toFixed(2)}`
      });
    }

    // Generate reference
    const reference = generateReference('withdrawal');

    // Create transaction record
    const { data: transaction, error: txnError } = await supabase
      .from('transactions')
      .insert([
        {
          user_id: req.user.id,
          account_id: accountId,
          transaction_type: 'withdrawal',
          amount: amount,
          payment_method: paymentMethod,
          bank_name: bankName || null,
          account_number_masked: accountNumber ? `XXXX${accountNumber.slice(-4)}` : null,
          ifsc_code: ifscCode || null,
          status: 'pending',
          reference: reference,
          balance_before: account.balance
        }
      ])
      .select()
      .single();

    if (txnError) throw txnError;

    // For demo purposes, auto-approve withdrawal
    // In production, this would require admin approval
    const newBalance = parseFloat(account.balance) - parseFloat(amount);

    // Update account balance
    await supabase
      .from('accounts')
      .update({
        balance: newBalance,
        equity: newBalance + parseFloat(account.profit || 0),
        free_margin: newBalance + parseFloat(account.profit || 0) - parseFloat(account.margin || 0)
      })
      .eq('id', accountId);

    // Update transaction status
    const { data: completedTxn, error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'completed',
        balance_after: newBalance,
        processed_at: new Date().toISOString()
      })
      .eq('id', transaction.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.status(200).json({
      success: true,
      message: 'Withdrawal request processed',
      data: {
        transaction: completedTxn,
        newBalance: newBalance
      }
    });

  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get transaction history
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

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    if (type) {
      query = query.eq('transaction_type', type);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: transactions, error } = await query;

    if (error) throw error;

    // Calculate summary
    let totalDeposits = 0;
    let totalWithdrawals = 0;

    transactions.forEach(txn => {
      if (txn.transaction_type === 'deposit' && txn.status === 'completed') {
        totalDeposits += parseFloat(txn.amount);
      } else if (txn.transaction_type === 'withdrawal' && txn.status === 'completed') {
        totalWithdrawals += parseFloat(txn.amount);
      }
    });

    res.status(200).json({
      success: true,
      count: transactions.length,
      summary: {
        totalDeposits: totalDeposits.toFixed(2),
        totalWithdrawals: totalWithdrawals.toFixed(2),
        netDeposits: (totalDeposits - totalWithdrawals).toFixed(2)
      },
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

// @desc    Internal transfer between accounts
// @route   POST /api/transactions/transfer
const transfer = async (req, res) => {
  try {
    const { fromAccountId, toAccountId, amount } = req.body;

    if (fromAccountId === toAccountId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot transfer to the same account'
      });
    }

    if (amount < 1) {
      return res.status(400).json({
        success: false,
        message: 'Minimum transfer amount is ₹1'
      });
    }

    // Get both accounts
    const { data: fromAccount, error: fromError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', fromAccountId)
      .eq('user_id', req.user.id)
      .single();

    const { data: toAccount, error: toError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', toAccountId)
      .eq('user_id', req.user.id)
      .single();

    if (fromError || !fromAccount) {
      return res.status(404).json({
        success: false,
        message: 'Source account not found'
      });
    }

    if (toError || !toAccount) {
      return res.status(404).json({
        success: false,
        message: 'Destination account not found'
      });
    }

    // Cannot transfer from/to demo accounts
    if (fromAccount.is_demo || toAccount.is_demo) {
      return res.status(400).json({
        success: false,
        message: 'Cannot transfer to/from demo accounts'
      });
    }

    // Check sufficient balance
    if (amount > parseFloat(fromAccount.free_margin)) {
      return res.status(400).json({
        success: false,
        message: `Insufficient funds. Available: ₹${fromAccount.free_margin}`
      });
    }

    // Update source account
    const newFromBalance = parseFloat(fromAccount.balance) - parseFloat(amount);
    await supabase
      .from('accounts')
      .update({
        balance: newFromBalance,
        equity: newFromBalance + parseFloat(fromAccount.profit || 0),
        free_margin: newFromBalance + parseFloat(fromAccount.profit || 0) - parseFloat(fromAccount.margin || 0)
      })
      .eq('id', fromAccountId);

    // Update destination account
    const newToBalance = parseFloat(toAccount.balance) + parseFloat(amount);
    await supabase
      .from('accounts')
      .update({
        balance: newToBalance,
        equity: newToBalance + parseFloat(toAccount.profit || 0),
        free_margin: newToBalance + parseFloat(toAccount.profit || 0) - parseFloat(toAccount.margin || 0)
      })
      .eq('id', toAccountId);

    // Create transaction records for both
    const reference = generateReference('transfer');
    
    await supabase.from('transactions').insert([
      {
        user_id: req.user.id,
        account_id: fromAccountId,
        transaction_type: 'transfer',
        amount: -amount,
        payment_method: 'bank_transfer',
        status: 'completed',
        reference: reference,
        balance_before: fromAccount.balance,
        balance_after: newFromBalance,
        processed_at: new Date().toISOString()
      },
      {
        user_id: req.user.id,
        account_id: toAccountId,
        transaction_type: 'transfer',
        amount: amount,
        payment_method: 'bank_transfer',
        status: 'completed',
        reference: reference,
        balance_before: toAccount.balance,
        balance_after: newToBalance,
        processed_at: new Date().toISOString()
      }
    ]);

    res.status(200).json({
      success: true,
      message: 'Transfer successful',
      data: {
        reference,
        amount,
        fromAccount: {
          accountNumber: fromAccount.account_number,
          newBalance: newFromBalance
        },
        toAccount: {
          accountNumber: toAccount.account_number,
          newBalance: newToBalance
        }
      }
    });

  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  deposit,
  withdraw,
  getTransactions,
  getTransaction,
  transfer
};