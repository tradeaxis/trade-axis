import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle, XCircle } from 'lucide-react';
import api from '../../services/api';

const Wallet = ({ selectedAccount }) => {
  const [activeTab, setActiveTab] = useState('deposit');
  const [transactions, setTransactions] = useState([]);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bankDetails, setBankDetails] = useState({
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    accountHolderName: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch transactions
  useEffect(() => {
    if (selectedAccount) {
      fetchTransactions();
    }
  }, [selectedAccount]);

  const fetchTransactions = async () => {
    try {
      const res = await api.get(`/transactions?accountId=${selectedAccount.id}`);
      setTransactions(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Load Razorpay script
  const loadRazorpay = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Handle deposit
  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    
    if (!amount || amount < 100) {
      toast.error('Minimum deposit is ₹100');
      return;
    }

    if (amount > 1000000) {
      toast.error('Maximum deposit is ₹10,00,000');
      return;
    }

    setIsProcessing(true);

    try {
      // Create order
      const { data } = await api.post('/transactions/deposit/create', {
        accountId: selectedAccount.id,
        amount: amount
      });

      // Load Razorpay
      const loaded = await loadRazorpay();
      if (!loaded) {
        toast.error('Razorpay SDK failed to load');
        return;
      }

      // Get Razorpay key
      const keyRes = await api.get('/transactions/razorpay-key');
      const razorpayKey = keyRes.data.key;

      // Open Razorpay checkout
      const options = {
        key: razorpayKey,
        amount: data.data.amount * 100,
        currency: 'INR',
        name: 'Trade Axis',
        description: 'Deposit to Trading Account',
        order_id: data.data.orderId,
        handler: async (response) => {
          // Verify payment
          try {
            await api.post('/transactions/deposit/verify', {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature
            });

            toast.success('Deposit successful!');
            setDepositAmount('');
            fetchTransactions();
            window.location.reload(); // Refresh to update balance

          } catch (err) {
            toast.error('Payment verification failed');
          }
        },
        prefill: {
          name: `${api.defaults.headers.user?.firstName} ${api.defaults.headers.user?.lastName}`,
          email: api.defaults.headers.user?.email,
          contact: api.defaults.headers.user?.phone
        },
        theme: {
          color: '#2962ff'
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();

    } catch (err) {
      toast.error(err.response?.data?.message || 'Deposit failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle withdrawal
  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    
    if (!amount || amount < 100) {
      toast.error('Minimum withdrawal is ₹100');
      return;
    }

    if (!bankDetails.bankName || !bankDetails.accountNumber || !bankDetails.ifscCode) {
      toast.error('Please fill all bank details');
      return;
    }

    setIsProcessing(true);

    try {
      await api.post('/transactions/withdraw', {
        accountId: selectedAccount.id,
        amount: amount,
        ...bankDetails
      });

      toast.success('Withdrawal request submitted!');
      setWithdrawAmount('');
      setBankDetails({ bankName: '', accountNumber: '', ifscCode: '', accountHolderName: '' });
      fetchTransactions();

    } catch (err) {
      toast.error(err.response?.data?.message || 'Withdrawal failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle size={16} style={{ color: '#26a69a' }} />;
      case 'pending': return <Clock size={16} style={{ color: '#ff9800' }} />;
      case 'failed': return <XCircle size={16} style={{ color: '#ef5350' }} />;
      default: return <Clock size={16} style={{ color: '#787b86' }} />;
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#1e222d' }}>
      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: '#363a45' }}>
        {[
          { id: 'deposit', label: 'Deposit', icon: ArrowDownCircle },
          { id: 'withdraw', label: 'Withdraw', icon: ArrowUpCircle },
          { id: 'history', label: 'History', icon: Clock }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2"
            style={{
              borderColor: activeTab === tab.id ? '#2962ff' : 'transparent',
              color: activeTab === tab.id ? '#d1d4dc' : '#787b86'
            }}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Deposit Tab */}
        {activeTab === 'deposit' && (
          <div className="max-w-md mx-auto">
            <div className="mb-6">
              <label className="block text-sm mb-2" style={{ color: '#787b86' }}>
                Deposit Amount (₹)
              </label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full px-4 py-3 rounded-lg border text-lg"
                style={{ background: '#2a2e39', borderColor: '#363a45', color: '#d1d4dc' }}
              />
              <div className="flex gap-2 mt-2">
                {[500, 1000, 5000, 10000, 25000, 50000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setDepositAmount(amt.toString())}
                    className="flex-1 py-2 rounded text-sm"
                    style={{ background: '#2a2e39', color: '#787b86' }}
                  >
                    ₹{amt >= 1000 ? `${amt/1000}K` : amt}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleDeposit}
              disabled={isProcessing || !depositAmount}
              className="w-full py-4 rounded-lg font-semibold text-white text-lg disabled:opacity-50"
              style={{ background: '#26a69a' }}
            >
              {isProcessing ? 'Processing...' : 'Deposit via Razorpay'}
            </button>

            <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: '#2a2e39', color: '#787b86' }}>
              <p className="mb-1">💳 Accepted: UPI, Cards, Net Banking, Wallets</p>
              <p>🔒 Secure payment via Razorpay</p>
            </div>
          </div>
        )}

        {/* Withdraw Tab */}
        {activeTab === 'withdraw' && (
          <div className="max-w-md mx-auto">
            <div className="mb-4">
              <label className="block text-sm mb-2" style={{ color: '#787b86' }}>
                Withdrawal Amount (₹)
              </label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full px-4 py-3 rounded-lg border text-lg"
                style={{ background: '#2a2e39', borderColor: '#363a45', color: '#d1d4dc' }}
              />
              <div className="text-xs mt-1" style={{ color: '#787b86' }}>
                Available: ₹{parseFloat(selectedAccount?.free_margin || 0).toLocaleString('en-IN')}
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <input
                type="text"
                value={bankDetails.accountHolderName}
                onChange={(e) => setBankDetails({ ...bankDetails, accountHolderName: e.target.value })}
                placeholder="Account Holder Name"
                className="w-full px-4 py-2 rounded-lg border text-sm"
                style={{ background: '#2a2e39', borderColor: '#363a45', color: '#d1d4dc' }}
              />
              <input
                type="text"
                value={bankDetails.bankName}
                onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                placeholder="Bank Name"
                className="w-full px-4 py-2 rounded-lg border text-sm"
                style={{ background: '#2a2e39', borderColor: '#363a45', color: '#d1d4dc' }}
              />
              <input
                type="text"
                value={bankDetails.accountNumber}
                onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                placeholder="Account Number"
                className="w-full px-4 py-2 rounded-lg border text-sm"
                style={{ background: '#2a2e39', borderColor: '#363a45', color: '#d1d4dc' }}
              />
              <input
                type="text"
                value={bankDetails.ifscCode}
                onChange={(e) => setBankDetails({ ...bankDetails, ifscCode: e.target.value.toUpperCase() })}
                placeholder="IFSC Code (e.g., SBIN0001234)"
                className="w-full px-4 py-2 rounded-lg border text-sm"
                style={{ background: '#2a2e39', borderColor: '#363a45', color: '#d1d4dc' }}
              />
            </div>

            <button
              onClick={handleWithdraw}
              disabled={isProcessing}
              className="w-full py-4 rounded-lg font-semibold text-white text-lg disabled:opacity-50"
              style={{ background: '#ef5350' }}
            >
              {isProcessing ? 'Processing...' : 'Request Withdrawal'}
            </button>

            <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: '#2a2e39', color: '#787b86' }}>
              <p className="mb-1">⏱️ Processing time: 24-48 hours</p>
              <p>🏦 Direct bank transfer via NEFT/IMPS</p>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div>
            {transactions.length === 0 ? (
              <div className="text-center py-12" style={{ color: '#787b86' }}>
                No transactions yet
              </div>
            ) : (
              transactions.map((txn) => (
                <div key={txn.id} className="p-3 mb-2 rounded-lg border" style={{ background: '#2a2e39', borderColor: '#363a45' }}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {txn.transaction_type === 'deposit' ? (
                        <ArrowDownCircle size={20} style={{ color: '#26a69a' }} />
                      ) : (
                        <ArrowUpCircle size={20} style={{ color: '#ef5350' }} />
                      )}
                      <div>
                        <div className="font-semibold" style={{ color: '#d1d4dc' }}>
                          {txn.transaction_type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                        </div>
                        <div className="text-xs" style={{ color: '#787b86' }}>
                          {new Date(txn.created_at).toLocaleString()}
                        </div>
                        <div className="text-xs mt-1" style={{ color: '#787b86' }}>
                          Ref: {txn.reference}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg" style={{ color: '#d1d4dc' }}>
                        ₹{parseFloat(txn.amount).toLocaleString('en-IN')}
                      </div>
                      <div className="flex items-center gap-1 text-xs mt-1">
                        {getStatusIcon(txn.status)}
                        <span style={{ 
                          color: txn.status === 'completed' ? '#26a69a' : 
                                 txn.status === 'failed' ? '#ef5350' : '#ff9800' 
                        }}>
                          {txn.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wallet;