// backend/src/controllers/adminController.js
const { supabase } = require('../config/supabase');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const kiteService = require('../services/kiteService');
const kiteStreamService = require('../services/kiteStreamService');

// ============ HELPER: Generate Login ID ============
const generateLoginId = async () => {
  // Get the highest existing login_id number
  const { data: lastUser } = await supabase
    .from('users')
    .select('login_id')
    .like('login_id', 'TA%')
    .order('created_at', { ascending: false })
    .limit(1);

  let nextNumber = 1000;
  
  if (lastUser && lastUser.length > 0 && lastUser[0].login_id) {
    const match = lastUser[0].login_id.match(/TA(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  return `TA${nextNumber}`;
};

// ============ HELPER: Generate Random Password ============
const generateTempPassword = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 char hex
};

// ============ USER FUNCTIONS ============

exports.listUsers = async (req, res) => {
  try {
    const { q, limit = 500 } = req.query;

    let query = supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    // Add search if provided
    if (q && q.trim()) {
      const searchTerm = q.trim().toLowerCase();
      query = query.or(`email.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,login_id.ilike.%${searchTerm}%`);
    }

    const { data: users, error } = await query;

    if (error) {
      console.error('listUsers query error:', error);
      throw error;
    }

    // Get accounts for each user
    const usersWithAccounts = await Promise.all(
      (users || []).map(async (user) => {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, account_number, is_demo, balance, equity, margin, free_margin, leverage')
          .eq('user_id', user.id);

        return {
          id: user.id,
          login_id: user.login_id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          role: user.role || 'user',
          is_active: user.is_active !== false,
          leverage: user.leverage || 5,
          brokerage_rate: user.brokerage_rate || 0.0003,
          max_saved_accounts: user.max_saved_accounts || 3,
          closing_mode: user.closing_mode || false,
          created_at: user.created_at,
          accounts: accounts || [],
        };
      })
    );

    // ✅ Return as 'data' to match frontend expectation
    res.json({ success: true, data: usersWithAccounts });
  } catch (error) {
    console.error('listUsers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      phone, 
      role = 'user',
      leverage = 5,
      brokerageRate = 0.0003,
      maxSavedAccounts = 3,
      demoBalance = 100000,
      createDemo = true,
      createLive = true,
    } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'First name and last name are required' });
    }

    // Check if at least one account type is selected
    if (!createDemo && !createLive) {
      return res.status(400).json({ success: false, message: 'Select at least one account type' });
    }

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Generate login_id and password
    const loginId = await generateLoginId();
    const tempPassword = password || generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        login_id: loginId,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        first_name: firstName || '',
        last_name: lastName || '',
        phone: phone || '',
        role,
        is_active: true,
        leverage: Number(leverage) || 5,
        brokerage_rate: Number(brokerageRate) || 0.0003,
        max_saved_accounts: Number(maxSavedAccounts) || 3,
        closing_mode: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Create user DB error:', error);
      throw error;
    }

    // Create accounts based on selection
    const accountsToCreate = [];
    const accountNumber = `TA${Date.now().toString().slice(-8)}`;

    if (createDemo) {
      accountsToCreate.push({
        user_id: user.id,
        account_number: `${accountNumber}D`,
        is_demo: true,
        balance: Number(demoBalance) || 100000,
        equity: Number(demoBalance) || 100000,
        margin: 0,
        free_margin: Number(demoBalance) || 100000,
        leverage: Number(leverage) || 5,
      });
    }

    if (createLive) {
      accountsToCreate.push({
        user_id: user.id,
        account_number: `${accountNumber}L`,
        is_demo: false,
        balance: 0,
        equity: 0,
        margin: 0,
        free_margin: 0,
        leverage: Number(leverage) || 5,
      });
    }

    if (accountsToCreate.length > 0) {
      const { error: accountError } = await supabase
        .from('accounts')
        .insert(accountsToCreate);

      if (accountError) {
        console.error('Create accounts error:', accountError);
        // Don't fail the whole operation, user is created
      }
    }

    // ✅ Return data in format frontend expects
    res.json({ 
      success: true, 
      data: {
        user,
        loginId,
        tempPassword: password ? null : tempPassword, // Only return if auto-generated
      },
      message: 'User created successfully' 
    });
  } catch (error) {
    console.error('createUser error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.setUserActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const { error } = await supabase
      .from('users')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: `User ${isActive ? 'activated' : 'deactivated'}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    // Generate new password if not provided
    const tempPassword = newPassword || generateTempPassword();

    if (tempPassword.length < 4) {
      return res.status(400).json({ success: false, message: 'Password must be at least 4 characters' });
    }

    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const { error } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', id);

    if (error) throw error;

    // ✅ Return tempPassword so admin can share it
    res.json({ 
      success: true, 
      data: { tempPassword },
      message: 'Password reset successfully' 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getLeverageOptions = async (req, res) => {
  res.json({
    success: true,
    options: [1, 2, 3, 5, 10, 15, 20, 25, 50, 100, 200],
  });
};

exports.updateUserLeverage = async (req, res) => {
  try {
    const { id } = req.params;
    const { leverage, accountId } = req.body;

    // If specific accountId provided, only update that account
    if (accountId) {
      const { error: accountError } = await supabase
        .from('accounts')
        .update({ leverage: Number(leverage) })
        .eq('id', accountId);

      if (accountError) throw accountError;
    } else {
      // Update user default leverage
      const { error: userError } = await supabase
        .from('users')
        .update({ leverage: Number(leverage) })
        .eq('id', id);

      if (userError) throw userError;

      // Update all user's accounts
      const { error: accountError } = await supabase
        .from('accounts')
        .update({ leverage: Number(leverage) })
        .eq('user_id', id);

      if (accountError) throw accountError;
    }

    res.json({ success: true, message: 'Leverage updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateBrokerageRate = async (req, res) => {
  try {
    const { id } = req.params;
    const { brokerageRate } = req.body;

    const { error } = await supabase
      .from('users')
      .update({ brokerage_rate: Number(brokerageRate) })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Brokerage rate updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMaxSavedAccounts = async (req, res) => {
  try {
    const { id } = req.params;
    const { maxSavedAccounts } = req.body;

    const { error } = await supabase
      .from('users')
      .update({ max_saved_accounts: Number(maxSavedAccounts) })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Max saved accounts updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleClosingMode = async (req, res) => {
  try {
    const { id } = req.params;
    const { closingMode } = req.body;

    const { error } = await supabase
      .from('users')
      .update({ closing_mode: closingMode })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: `Closing mode ${closingMode ? 'enabled' : 'disabled'}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addBalanceToAccount = async (req, res) => {
  try {
    const { id } = req.params; // user id
    const { accountId, amount, accountType = 'live', note = 'Admin deposit' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    let account;

    // Find account by accountId if provided, otherwise by user_id and type
    if (accountId) {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .single();

      if (error || !data) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }
      account = data;
    } else {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', id)
        .eq('is_demo', accountType === 'demo')
        .single();

      if (error || !data) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }
      account = data;
    }

    const newBalance = parseFloat(account.balance || 0) + parseFloat(amount);
    const newEquity = parseFloat(account.equity || 0) + parseFloat(amount);
    const newFreeMargin = newEquity - parseFloat(account.margin || 0);

    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        balance: newBalance,
        equity: newEquity,
        free_margin: newFreeMargin,
      })
      .eq('id', account.id);

    if (updateError) throw updateError;

    // Create transaction record
    await supabase.from('transactions').insert({
      user_id: id,
      account_id: account.id,
      type: 'deposit',
      amount: parseFloat(amount),
      status: 'completed',
      description: note || 'Admin deposit',
    });

    res.json({
      success: true,
      message: `₹${amount} added to account`,
      newBalance,
    });
  } catch (error) {
    console.error('addBalanceToAccount error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ WITHDRAWAL FUNCTIONS ============

exports.listWithdrawals = async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('transactions')
      .select(`
        *,
        users:user_id (email, first_name, last_name, login_id),
        accounts:account_id (account_number, is_demo)
      `)
      .eq('type', 'withdrawal')
      .order('created_at', { ascending: false });

    // Only filter by status if it's a specific status (not 'all' or empty)
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('listWithdrawals error:', error);
      throw error;
    }

    // Flatten the joined data for frontend
    const withdrawals = (data || []).map(w => ({
      ...w,
      user_email: w.users?.email || '',
      user_name: w.users ? `${w.users.first_name || ''} ${w.users.last_name || ''}`.trim() : '',
      user_login_id: w.users?.login_id || '',
      account_number: w.accounts?.account_number || '',
      is_demo: w.accounts?.is_demo || false,
    }));

    res.json({ success: true, data: withdrawals });
  } catch (error) {
    console.error('listWithdrawals error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const { data: txn, error: findError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !txn) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (txn.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Transaction is not pending' });
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'completed',
        admin_note: adminNote || 'Approved by admin',
        processed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Withdrawal approved' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const { data: txn, error: findError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !txn) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (txn.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Transaction is not pending' });
    }

    // Refund the amount back to account
    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', txn.account_id)
      .single();

    if (account) {
      const newBalance = parseFloat(account.balance || 0) + parseFloat(txn.amount || 0);
      const newEquity = parseFloat(account.equity || 0) + parseFloat(txn.amount || 0);

      await supabase
        .from('accounts')
        .update({
          balance: newBalance,
          equity: newEquity,
          free_margin: newEquity - parseFloat(account.margin || 0),
        })
        .eq('id', txn.account_id);
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'rejected',
        admin_note: adminNote || 'Rejected by admin',
        processed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Withdrawal rejected and amount refunded' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ KITE CONNECT FUNCTIONS ============

exports.getKiteLoginUrl = async (req, res) => {
  try {
    await kiteService.init();

    if (!kiteService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Kite API key/secret not configured in .env',
        instructions: [
          '1. Get API credentials from https://developers.kite.trade',
          '2. Add KITE_API_KEY and KITE_API_SECRET to backend/.env',
          '3. Restart the server',
        ],
      });
    }

    const loginUrl = kiteService.getLoginURL();

    res.json({
      success: true,
      loginUrl,
      instructions: [
        '1. Click the login URL and login with your Zerodha credentials',
        '2. After login, you will be redirected to a URL with request_token parameter',
        '3. Copy the request_token value from the URL',
        '4. Use the "Set Token" button to save it',
      ],
    });
  } catch (error) {
    console.error('getKiteLoginUrl error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createKiteSession = async (req, res) => {
  try {
    const { requestToken } = req.body;

    if (!requestToken) {
      return res.status(400).json({
        success: false,
        message: 'requestToken is required',
      });
    }

    const session = await kiteService.generateSession(requestToken.trim());

    res.json({
      success: true,
      message: 'Kite session created successfully! Token valid until tomorrow 6 AM IST.',
      userId: session.userId,
      createdAt: session.createdAt,
    });
  } catch (error) {
    console.error('createKiteSession error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.syncKiteSymbols = async (req, res) => {
  try {
    await kiteService.init();

    if (!kiteService.isSessionReady()) {
      return res.status(400).json({
        success: false,
        message: 'Kite session not ready. Please create session first.',
      });
    }

    const result = await kiteService.syncSymbolsToDB();

    res.json({
      success: true,
      message: `Synced ${result.count} symbols from ${result.underlyings} underlyings`,
      ...result,
    });
  } catch (error) {
    console.error('syncKiteSymbols error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.startKiteStream = async (req, res) => {
  try {
    const io = req.app.get('io');

    if (!io) {
      return res.status(500).json({ success: false, message: 'Socket.IO not available' });
    }

    const result = await kiteStreamService.start(io);

    if (result.started) {
      res.json({
        success: true,
        message: `Kite stream started with ${result.tokens} symbols`,
        ...result,
      });
    } else {
      res.status(400).json({
        success: false,
        message: `Stream not started: ${result.reason}`,
        ...result,
      });
    }
  } catch (error) {
    console.error('startKiteStream error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.stopKiteStream = async (req, res) => {
  try {
    const result = await kiteStreamService.stop();
    res.json({ success: true, message: 'Kite stream stopped', ...result });
  } catch (error) {
    console.error('stopKiteStream error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.kiteStatus = async (req, res) => {
  try {
    await kiteService.init();

    const streamStatus = kiteStreamService.status();
    const sessionReady = kiteService.isSessionReady();
    const configured = kiteService.isConfigured();

    // Try to validate session by getting profile
    let profileValid = false;
    let profile = null;

    if (sessionReady && kiteService.kc) {
      try {
        profile = await kiteService.kc.getProfile();
        profileValid = true;
      } catch (err) {
        profileValid = false;
      }
    }

    res.json({
      success: true,
      configured,
      sessionReady,
      profileValid,
      profile: profile
        ? {
            userName: profile.user_name,
            email: profile.email,
            userId: profile.user_id,
          }
        : null,
      stream: streamStatus,
    });
  } catch (error) {
    console.error('kiteStatus error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};