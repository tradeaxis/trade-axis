const Razorpay = require('razorpay');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');

class PaymentService {
  constructor() {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  // Create Razorpay order for deposit
  async createDepositOrder(userId, accountId, amount) {
    try {
      // Validate amount
      if (amount < 100) {
        throw new Error('Minimum deposit is ₹100');
      }

      if (amount > 1000000) {
        throw new Error('Maximum deposit is ₹10,00,000');
      }

      // Get account
      const { data: account, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .eq('user_id', userId)
        .single();

      if (error || !account) {
        throw new Error('Account not found');
      }

      if (account.is_demo) {
        throw new Error('Cannot deposit to demo account');
      }

      // Create Razorpay order
      const order = await this.razorpay.orders.create({
        amount: amount * 100, // Razorpay expects paise
        currency: 'INR',
        receipt: `deposit_${Date.now()}`,
        notes: {
          userId,
          accountId,
          type: 'deposit'
        }
      });

      // Create transaction record
      const { data: transaction, error: txnError } = await supabase
        .from('transactions')
        .insert([{
          user_id: userId,
          account_id: accountId,
          transaction_type: 'deposit',
          amount: amount,
          payment_method: 'razorpay',
          payment_transaction_id: order.id,
          status: 'pending',
          reference: this.generateReference('deposit'),
          balance_before: account.balance
        }])
        .select()
        .single();

      if (txnError) throw txnError;

      return {
        orderId: order.id,
        amount: amount,
        currency: 'INR',
        transactionId: transaction.id,
        reference: transaction.reference
      };

    } catch (error) {
      console.error('Create order error:', error);
      throw error;
    }
  }

  // Verify Razorpay payment signature
  verifyPaymentSignature(orderId, paymentId, signature) {
    const text = `${orderId}|${paymentId}`;
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    return generated_signature === signature;
  }

  // Confirm deposit payment
  async confirmDeposit(orderId, paymentId, signature) {
    try {
      // Verify signature
      const isValid = this.verifyPaymentSignature(orderId, paymentId, signature);

      if (!isValid) {
        throw new Error('Invalid payment signature');
      }

      // Get transaction by order ID
      const { data: transaction, error: txnError } = await supabase
        .from('transactions')
        .select('*')
        .eq('payment_transaction_id', orderId)
        .single();

      if (txnError || !transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status === 'completed') {
        return transaction; // Already processed
      }

      // Get account
      const { data: account, error: accError } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', transaction.account_id)
        .single();

      if (accError || !account) {
        throw new Error('Account not found');
      }

      // Update account balance
      const newBalance = parseFloat(account.balance) + parseFloat(transaction.amount);

      await supabase
        .from('accounts')
        .update({
          balance: newBalance,
          equity: newBalance + parseFloat(account.profit || 0),
          free_margin: newBalance + parseFloat(account.profit || 0) - parseFloat(account.margin || 0)
        })
        .eq('id', transaction.account_id);

      // Update transaction
      const { data: completedTxn, error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'completed',
          payment_details: JSON.stringify({ paymentId, signature }),
          balance_after: newBalance,
          processed_at: new Date().toISOString()
        })
        .eq('id', transaction.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return completedTxn;

    } catch (error) {
      console.error('Confirm deposit error:', error);
      throw error;
    }
  }

  // Create withdrawal request
  async createWithdrawalRequest(userId, accountId, amount, bankDetails) {
    try {
      // Validate
      if (amount < 100) {
        throw new Error('Minimum withdrawal is ₹100');
      }

      // Get account
      const { data: account, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .eq('user_id', userId)
        .single();

      if (error || !account) {
        throw new Error('Account not found');
      }

      if (account.is_demo) {
        throw new Error('Cannot withdraw from demo account');
      }

      // Check balance
      if (amount > parseFloat(account.free_margin)) {
        throw new Error(`Insufficient funds. Available: ₹${account.free_margin}`);
      }

      // Create withdrawal transaction
      const { data: transaction, error: txnError } = await supabase
        .from('transactions')
        .insert([{
          user_id: userId,
          account_id: accountId,
          transaction_type: 'withdrawal',
          amount: amount,
          payment_method: 'bank_transfer',
          bank_name: bankDetails.bankName,
          account_number_masked: `XXXX${bankDetails.accountNumber.slice(-4)}`,
          ifsc_code: bankDetails.ifscCode,
          status: 'pending',
          reference: this.generateReference('withdrawal'),
          balance_before: account.balance
        }])
        .select()
        .single();

      if (txnError) throw txnError;

      // Reserve amount (deduct from balance but pending)
      const newBalance = parseFloat(account.balance) - parseFloat(amount);

      await supabase
        .from('accounts')
        .update({
          balance: newBalance,
          equity: newBalance + parseFloat(account.profit || 0),
          free_margin: newBalance + parseFloat(account.profit || 0) - parseFloat(account.margin || 0)
        })
        .eq('id', accountId);

      return transaction;

    } catch (error) {
      console.error('Withdrawal error:', error);
      throw error;
    }
  }

  // Process withdrawal (Admin approval)
  async processWithdrawal(transactionId, status, utrNumber = null) {
    try {
      const { data: transaction, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (error || !transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'pending') {
        throw new Error('Transaction already processed');
      }

      if (status === 'completed') {
        // Mark as completed
        await supabase
          .from('transactions')
          .update({
            status: 'completed',
            payment_transaction_id: utrNumber,
            processed_at: new Date().toISOString()
          })
          .eq('id', transactionId);

      } else if (status === 'failed') {
        // Refund to account
        const { data: account } = await supabase
          .from('accounts')
          .select('*')
          .eq('id', transaction.account_id)
          .single();

        const refundBalance = parseFloat(account.balance) + parseFloat(transaction.amount);

        await supabase
          .from('accounts')
          .update({
            balance: refundBalance,
            equity: refundBalance + parseFloat(account.profit || 0),
            free_margin: refundBalance + parseFloat(account.profit || 0) - parseFloat(account.margin || 0)
          })
          .eq('id', transaction.account_id);

        await supabase
          .from('transactions')
          .update({ status: 'failed', processed_at: new Date().toISOString() })
          .eq('id', transactionId);
      }

      return transaction;

    } catch (error) {
      console.error('Process withdrawal error:', error);
      throw error;
    }
  }

  // Generate reference
  generateReference(type) {
    const prefix = type === 'deposit' ? 'DEP' : 'WTH';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }

  // Get Razorpay key for frontend
  getRazorpayKey() {
    return process.env.RAZORPAY_KEY_ID;
  }
}

module.exports = new PaymentService();