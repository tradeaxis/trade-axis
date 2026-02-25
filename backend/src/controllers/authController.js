const { supabase } = require('../config/supabase');
const { hashPassword, comparePassword, generateToken, generateAccountNumber } = require('../utils/auth');

// @desc    Register new user
// @route   POST /api/auth/register
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([
        {
          email: email.toLowerCase(),
          password_hash: hashedPassword,
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          is_verified: false,
          is_active: true,
          role: 'user'
        }
      ])
      .select('id, email, first_name, last_name, phone, role, is_verified')
      .single();

    if (userError) {
      throw userError;
    }

    // Create demo account
    const demoAccountNumber = generateAccountNumber(true);
    const { data: demoAccount, error: demoError } = await supabase
      .from('accounts')
      .insert([
        {
          user_id: user.id,
          account_number: demoAccountNumber,
          account_type: 'demo',
          balance: 100000, // ₹1,00,000 demo balance
          equity: 100000,
          free_margin: 100000,
          leverage: 5,
          currency: 'INR',
          is_demo: true,
          is_active: true
        }
      ])
      .select()
      .single();

    if (demoError) {
      console.error('Demo account creation error:', demoError);
    }

    // Create live account (with 0 balance)
    const liveAccountNumber = generateAccountNumber(false);
    const { data: liveAccount, error: liveError } = await supabase
      .from('accounts')
      .insert([
        {
          user_id: user.id,
          account_number: liveAccountNumber,
          account_type: 'standard',
          balance: 0,
          equity: 0,
          free_margin: 0,
          leverage: 5,
          currency: 'INR',
          is_demo: false,
          is_active: true
        }
      ])
      .select()
      .single();

    if (liveError) {
      console.error('Live account creation error:', liveError);
    }

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role,
          isVerified: user.is_verified
        },
        accounts: [demoAccount, liveAccount],
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Get user with password
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated'
      });
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // Get user's accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Generate token
    const token = generateToken(user.id, user.email);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role,
          isVerified: user.is_verified,
          kycStatus: user.kyc_status
        },
        accounts: accounts,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
const getMe = async (req, res) => {
  try {
    // User is already attached by protect middleware
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('is_active', true);

    res.status(200).json({
      success: true,
      data: {
        user: req.user,
        accounts: accounts
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Logout
// @route   POST /api/auth/logout
const logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

module.exports = {
  register,
  login,
  getMe,
  logout
};