// frontend/src/components/admin/AdminUsers.jsx
import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-hot-toast';
import { 
  ChevronDown, 
  ChevronUp, 
  Settings, 
  RefreshCw, 
  Lock, 
  Unlock, 
  Copy, 
  Plus,
  X,
  Wallet
} from 'lucide-react';

// Leverage options (1:1 to 1:200)
const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 25, 50, 100, 200];

// Brokerage rate options (in percentage)
const BROKERAGE_OPTIONS = [
  { value: 0, label: '0% (No Brokerage)' },
  { value: 0.0001, label: '0.01%' },
  { value: 0.0002, label: '0.02%' },
  { value: 0.0003, label: '0.03% (Default)' },
  { value: 0.0005, label: '0.05%' },
  { value: 0.001, label: '0.10%' },
  { value: 0.002, label: '0.20%' },
  { value: 0.005, label: '0.50%' },
];

export default function AdminUsers() {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Money Modal State
  const [addMoneyModal, setAddMoneyModal] = useState(null);
  const [addMoneyAmount, setAddMoneyAmount] = useState('');
  const [addMoneyNote, setAddMoneyNote] = useState('');
  const [addMoneyLoading, setAddMoneyLoading] = useState(false);

  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    role: 'user',
    password: '',
    leverage: 5,
    maxSavedAccounts: 3,
    brokerageRate: 0.0003,
    demoBalance: 100000,
    createDemo: true,
    createLive: true,
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/users?limit=500&q=${searchQuery}`);
      
      // ✅ Handle both response formats for compatibility
      if (res.data?.success) {
        const userData = res.data.data || res.data.users || [];
        setUsers(userData);
      } else {
        setUsers([]);
      }
    } catch (e) {
      console.error('Load users error:', e);
      toast.error(e.response?.data?.message || 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Copy Login ID to clipboard
  const copyLoginId = (loginId) => {
    if (!loginId) return;
    navigator.clipboard.writeText(loginId);
    toast.success(`Copied: ${loginId}`);
  };

  const createUser = async () => {
    if (!form.email || !form.firstName || !form.lastName) {
      return toast.error('Email, First name, Last name required');
    }

    if (!form.createDemo && !form.createLive) {
      return toast.error('Select at least one account type (Demo or Live)');
    }

    try {
      const res = await api.post('/admin/users', {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        role: form.role,
        password: form.password || undefined, // Let backend generate if empty
        leverage: Number(form.leverage),
        brokerageRate: Number(form.brokerageRate),
        maxSavedAccounts: Number(form.maxSavedAccounts),
        demoBalance: Number(form.demoBalance),
        createDemo: form.createDemo,
        createLive: form.createLive,
      });
      
      if (res.data?.success) {
        const data = res.data.data;
        const tempPassword = data?.tempPassword;
        const loginId = data?.loginId;
        
        toast.success('User created successfully!');

        // Show credentials if available
        if (loginId && tempPassword) {
          const credentials = `Login ID: ${loginId}\nPassword: ${tempPassword}`;
          window.prompt('User credentials (copy now):', credentials);
        } else if (loginId) {
          window.prompt('Login ID:', loginId);
        }

        // Reset form
        setForm({
          email: '',
          firstName: '',
          lastName: '',
          phone: '',
          role: 'user',
          password: '',
          leverage: 5,
          maxSavedAccounts: 3,
          brokerageRate: 0.0003,
          demoBalance: 100000,
          createDemo: true,
          createLive: true,
        });

        loadUsers();
      } else {
        toast.error(res.data?.message || 'Create user failed');
      }
    } catch (e) {
      console.error('Create user error:', e);
      toast.error(e.response?.data?.message || 'Create user failed');
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.patch(`/admin/users/${u.id}/active`, { isActive: !u.is_active });
      toast.success('Updated');
      loadUsers();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Update failed');
    }
  };

  const toggleClosingMode = async (u) => {
    try {
      const newMode = !u.closing_mode;
      await api.patch(`/admin/users/${u.id}/closing-mode`, { closingMode: newMode });
      toast.success(newMode 
        ? 'Closing mode ON - User can only close positions' 
        : 'Closing mode OFF - User can trade normally'
      );
      loadUsers();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Update failed');
    }
  };

  const resetPassword = async (u) => {
    try {
      const res = await api.post(`/admin/users/${u.id}/reset-password`, {});
      const tempPassword = res.data?.data?.tempPassword;
      toast.success('Password reset');
      if (tempPassword) {
        window.prompt(`New password for ${u.login_id || u.email}:`, tempPassword);
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Reset failed');
    }
  };

  const updateLeverage = async (userId, accountId, leverage) => {
    try {
      await api.patch(`/admin/users/${userId}/leverage`, { 
        leverage: Number(leverage),
        accountId 
      });
      toast.success(`Leverage updated to 1:${leverage}`);
      loadUsers();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Update leverage failed');
    }
  };

  const updateBrokerageRate = async (userId, brokerageRate) => {
    try {
      await api.patch(`/admin/users/${userId}/brokerage`, { 
        brokerageRate: Number(brokerageRate)
      });
      toast.success(`Brokerage updated to ${(Number(brokerageRate) * 100).toFixed(2)}%`);
      loadUsers();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Update brokerage failed');
    }
  };

  // Add Money to Account
  const handleAddMoney = async () => {
    if (!addMoneyModal || !addMoneyAmount || Number(addMoneyAmount) <= 0) {
      return toast.error('Enter a valid amount');
    }

    setAddMoneyLoading(true);
    try {
      const res = await api.post(`/admin/users/${addMoneyModal.user.id}/add-balance`, {
        accountId: addMoneyModal.account.id,
        amount: Number(addMoneyAmount),
        note: addMoneyNote || 'Admin deposit - Cash received offline',
      });

      if (res.data?.success) {
        toast.success(`₹${Number(addMoneyAmount).toLocaleString('en-IN')} added to ${addMoneyModal.account.account_number}`);
        setAddMoneyModal(null);
        setAddMoneyAmount('');
        setAddMoneyNote('');
        loadUsers();
      } else {
        toast.error(res.data?.message || 'Failed to add money');
      }
    } catch (e) {
      console.error('Add money error:', e);
      toast.error(e.response?.data?.message || 'Failed to add money');
    } finally {
      setAddMoneyLoading(false);
    }
  };

  // Add Money Modal Component
  const AddMoneyModal = () => {
    if (!addMoneyModal) return null;

    const { user, account } = addMoneyModal;

    return (
      <div 
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        onClick={() => setAddMoneyModal(null)}
      >
        <div 
          className="w-full max-w-sm rounded-xl"
          style={{ background: '#1e222d', border: '1px solid #363a45' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#363a45' }}>
            <div className="flex items-center gap-2">
              <Wallet size={20} color="#26a69a" />
              <h3 className="font-bold text-lg" style={{ color: '#d1d4dc' }}>Add Money</h3>
            </div>
            <button onClick={() => setAddMoneyModal(null)}>
              <X size={22} color="#787b86" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* User & Account Info */}
            <div className="p-3 rounded-lg" style={{ background: '#2a2e39' }}>
              <div className="text-sm" style={{ color: '#787b86' }}>User</div>
              <div className="font-bold" style={{ color: '#d1d4dc' }}>
                {user.login_id || 'N/A'} - {user.first_name} {user.last_name}
              </div>
              <div className="text-xs mt-1" style={{ color: '#787b86' }}>{user.email}</div>
              
              <div className="mt-3 pt-3 border-t" style={{ borderColor: '#363a45' }}>
                <div className="text-sm" style={{ color: '#787b86' }}>Account</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold" style={{ color: '#d1d4dc' }}>{account.account_number}</span>
                  <span 
                    className="px-2 py-0.5 rounded text-xs"
                    style={{ 
                      background: account.is_demo ? '#f5c54220' : '#26a69a20',
                      color: account.is_demo ? '#f5c542' : '#26a69a'
                    }}
                  >
                    {account.is_demo ? 'DEMO' : 'LIVE'}
                  </span>
                </div>
                <div className="text-sm mt-1" style={{ color: '#787b86' }}>
                  Current Balance: <span style={{ color: '#26a69a' }}>₹{parseFloat(account.balance || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-sm mb-2" style={{ color: '#787b86' }}>
                Amount to Add (₹)
              </label>
              <input
                type="number"
                value={addMoneyAmount}
                onChange={(e) => setAddMoneyAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full px-4 py-3 rounded-lg text-lg font-bold text-center"
                style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
                min="1"
                autoFocus
              />
            </div>

            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-4 gap-2">
              {[1000, 5000, 10000, 50000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setAddMoneyAmount(String(amt))}
                  className="py-2 rounded-lg text-xs font-medium"
                  style={{
                    background: Number(addMoneyAmount) === amt ? '#26a69a' : '#2a2e39',
                    color: Number(addMoneyAmount) === amt ? '#fff' : '#787b86',
                    border: '1px solid #363a45',
                  }}
                >
                  ₹{(amt / 1000)}K
                </button>
              ))}
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm mb-2" style={{ color: '#787b86' }}>
                Note (Optional)
              </label>
              <input
                type="text"
                value={addMoneyNote}
                onChange={(e) => setAddMoneyNote(e.target.value)}
                placeholder="e.g., Cash received at office"
                className="w-full px-4 py-2.5 rounded-lg text-sm"
                style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
              />
            </div>

            {/* Preview */}
            {addMoneyAmount && Number(addMoneyAmount) > 0 && (
              <div className="p-3 rounded-lg" style={{ background: '#26a69a20', border: '1px solid #26a69a50' }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#787b86' }}>Current Balance</span>
                  <span style={{ color: '#d1d4dc' }}>₹{parseFloat(account.balance || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span style={{ color: '#787b86' }}>Adding</span>
                  <span style={{ color: '#26a69a' }}>+₹{Number(addMoneyAmount).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm mt-2 pt-2 border-t" style={{ borderColor: '#26a69a50' }}>
                  <span className="font-medium" style={{ color: '#d1d4dc' }}>New Balance</span>
                  <span className="font-bold" style={{ color: '#26a69a' }}>
                    ₹{(parseFloat(account.balance || 0) + Number(addMoneyAmount)).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleAddMoney}
              disabled={addMoneyLoading || !addMoneyAmount || Number(addMoneyAmount) <= 0}
              className="w-full py-3.5 rounded-lg font-semibold text-base disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: '#26a69a', color: '#fff' }}
            >
              {addMoneyLoading ? (
                'Processing...'
              ) : (
                <>
                  <Plus size={20} />
                  Add ₹{Number(addMoneyAmount || 0).toLocaleString('en-IN')} to Account
                </>
              )}
            </button>

            <div className="text-xs text-center" style={{ color: '#787b86' }}>
              This will directly add funds to the user's account balance.
              A transaction record will be created.
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col" style={{ background: '#1e222d' }}>
      <div className="p-4 border-b" style={{ borderColor: '#363a45' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold" style={{ color: '#d1d4dc' }}>
              Admin • Users
            </div>
            <div className="text-xs mt-1" style={{ color: '#787b86' }}>
              Manage users, leverage, brokerage & closing mode
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search TA1000..."
              className="px-3 py-2 rounded text-sm w-32"
              style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
              onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
            />
            <button
              onClick={loadUsers}
              className="p-2 rounded-lg flex items-center gap-2 text-sm"
              style={{ background: '#2a2e39', color: '#d1d4dc' }}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Create user form */}
        <div className="p-4 rounded-lg mb-4" style={{ background: '#2a2e39', border: '1px solid #363a45' }}>
          <div className="text-sm font-semibold mb-3" style={{ color: '#d1d4dc' }}>
            Create New User
          </div>

          <div className="grid grid-cols-1 gap-2">
            <input
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="Email"
              className="px-3 py-2 rounded text-sm"
              style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
            />
            
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.firstName}
                onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                placeholder="First name"
                className="px-3 py-2 rounded text-sm"
                style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
              />
              <input
                value={form.lastName}
                onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                placeholder="Last name"
                className="px-3 py-2 rounded text-sm"
                style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="Phone (optional)"
                className="px-3 py-2 rounded text-sm"
                style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
              />
              <input
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Password (auto if empty)"
                type="password"
                className="px-3 py-2 rounded text-sm"
                style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
              />
            </div>

            {/* Account Type Checkboxes */}
            <div className="p-3 rounded-lg" style={{ background: '#1e222d', border: '1px solid #363a45' }}>
              <label className="text-xs mb-2 block font-medium" style={{ color: '#787b86' }}>
                Create Account Types
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.createDemo}
                    onChange={(e) => setForm((p) => ({ ...p, createDemo: e.target.checked }))}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: '#f5c542' }}
                  />
                  <span className="text-sm font-medium" style={{ color: '#f5c542' }}>
                    Demo Account
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.createLive}
                    onChange={(e) => setForm((p) => ({ ...p, createLive: e.target.checked }))}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: '#26a69a' }}
                  />
                  <span className="text-sm font-medium" style={{ color: '#26a69a' }}>
                    Live Account
                  </span>
                </label>
              </div>

              {!form.createDemo && !form.createLive && (
                <div className="mt-2 text-xs" style={{ color: '#ef5350' }}>
                  ⚠️ Please select at least one account type
                </div>
              )}
            </div>

            {/* Trading Settings */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#787b86' }}>Leverage</label>
                <select
                  value={form.leverage}
                  onChange={(e) => setForm((p) => ({ ...p, leverage: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
                >
                  {LEVERAGE_OPTIONS.map((lev) => (
                    <option key={lev} value={lev}>1:{lev}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: '#787b86' }}>Brokerage</label>
                <select
                  value={form.brokerageRate}
                  onChange={(e) => setForm((p) => ({ ...p, brokerageRate: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
                >
                  {BROKERAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: '#787b86' }}>
                  Demo Balance {!form.createDemo && '(N/A)'}
                </label>
                <input
                  value={form.demoBalance}
                  onChange={(e) => setForm((p) => ({ ...p, demoBalance: e.target.value }))}
                  type="number"
                  disabled={!form.createDemo}
                  className="w-full px-3 py-2 rounded text-sm disabled:opacity-50"
                  style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
                />
              </div>
            </div>

            {/* Info about Login ID */}
            <div className="p-2 rounded text-xs" style={{ background: '#2962ff20', color: '#2962ff' }}>
              💡 A unique Login ID (TA1000, TA1001, etc.) will be auto-generated
            </div>

            <button
              onClick={createUser}
              disabled={!form.createDemo && !form.createLive}
              className="py-2.5 rounded font-semibold text-sm disabled:opacity-50"
              style={{ background: '#2962ff', color: '#fff' }}
            >
              Create User
            </button>
          </div>
        </div>

        {/* Users list */}
        <div className="text-sm font-semibold mb-2" style={{ color: '#d1d4dc' }}>
          Users ({users.length})
          {loading && <span className="ml-2 text-xs font-normal" style={{ color: '#787b86' }}>(Loading...)</span>}
        </div>

        <div className="space-y-2">
          {loading && users.length === 0 ? (
            <div className="text-center py-8" style={{ color: '#787b86' }}>Loading users...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8" style={{ color: '#787b86' }}>No users found</div>
          ) : (
            users.map((u) => {
              const isExpanded = expandedUserId === u.id;
              
              return (
                <div
                  key={u.id}
                  className="rounded-lg overflow-hidden"
                  style={{ background: '#2a2e39', border: '1px solid #363a45' }}
                >
                  {/* User header row */}
                  <div 
                    className="p-3 cursor-pointer hover:bg-white/5"
                    onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyLoginId(u.login_id); }}
                            className="flex items-center gap-1 px-2 py-1 rounded font-mono text-sm font-bold"
                            style={{ background: '#2962ff20', color: '#2962ff' }}
                            title="Click to copy"
                          >
                            {u.login_id || 'TA????'}
                            <Copy size={12} />
                          </button>
                          
                          <span 
                            className="px-2 py-0.5 rounded text-[10px] font-medium"
                            style={{ 
                              background: u.role === 'admin' ? '#2962ff20' : '#26a69a20',
                              color: u.role === 'admin' ? '#2962ff' : '#26a69a'
                            }}
                          >
                            {u.role || 'user'}
                          </span>
                          
                          {u.is_active ? (
                            <span className="text-[10px]" style={{ color: '#26a69a' }}>● Active</span>
                          ) : (
                            <span className="text-[10px]" style={{ color: '#ef5350' }}>● Inactive</span>
                          )}

                          {u.closing_mode && (
                            <span 
                              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                              style={{ background: '#ff980020', color: '#ff9800' }}
                            >
                              <Lock size={10} />
                              Closing Mode
                            </span>
                          )}
                        </div>
                        
                        <div className="text-xs mt-1" style={{ color: '#787b86' }}>
                          {u.first_name} {u.last_name} • {u.email}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleClosingMode(u); }}
                          className="p-2 rounded"
                          style={{ 
                            background: u.closing_mode ? '#ff980030' : '#1e222d',
                            border: '1px solid #363a45'
                          }}
                          title={u.closing_mode ? 'Disable Closing Mode' : 'Enable Closing Mode'}
                        >
                          {u.closing_mode ? (
                            <Lock size={16} color="#ff9800" />
                          ) : (
                            <Unlock size={16} color="#787b86" />
                          )}
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); toggleActive(u); }}
                          className="px-3 py-1.5 rounded text-xs font-medium"
                          style={{ 
                            background: u.is_active ? '#ef535020' : '#26a69a20', 
                            color: u.is_active ? '#ef5350' : '#26a69a' 
                          }}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>

                        {isExpanded ? (
                          <ChevronUp size={18} color="#787b86" />
                        ) : (
                          <ChevronDown size={18} color="#787b86" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded section */}
                  {isExpanded && (
                    <div 
                      className="p-3 border-t"
                      style={{ borderColor: '#363a45', background: '#252832' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Settings size={14} color="#787b86" />
                        <span className="text-xs font-semibold" style={{ color: '#787b86' }}>
                          Account Settings
                        </span>
                      </div>

                      {/* User Settings */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {/* Brokerage Rate */}
                        <div className="p-2 rounded" style={{ background: '#1e222d' }}>
                          <label className="text-xs block mb-1" style={{ color: '#787b86' }}>Brokerage Rate</label>
                          <select
                            value={u.brokerage_rate || 0.0003}
                            onChange={(e) => updateBrokerageRate(u.id, e.target.value)}
                            className="w-full px-2 py-1 rounded text-xs"
                            style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
                          >
                            {BROKERAGE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* Reset Password */}
                        <div className="p-2 rounded flex items-end" style={{ background: '#1e222d' }}>
                          <button
                            onClick={() => resetPassword(u)}
                            className="w-full px-3 py-1.5 rounded text-xs font-medium"
                            style={{ background: '#363a45', color: '#d1d4dc' }}
                          >
                            Reset Password
                          </button>
                        </div>
                      </div>

                      {/* Individual Accounts */}
                      {u.accounts && u.accounts.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium" style={{ color: '#d1d4dc' }}>
                            Trading Accounts:
                          </div>
                          
                          {u.accounts.map((acc) => (
                            <div 
                              key={acc.id}
                              className="p-2 rounded"
                              style={{ background: '#1e222d' }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium" style={{ color: '#d1d4dc' }}>
                                    {acc.account_number}
                                  </span>
                                  <span 
                                    className="px-1.5 py-0.5 rounded text-[10px]"
                                    style={{ 
                                      background: acc.is_demo ? '#f5c54220' : '#26a69a20',
                                      color: acc.is_demo ? '#f5c542' : '#26a69a'
                                    }}
                                  >
                                    {acc.is_demo ? 'DEMO' : 'LIVE'}
                                  </span>
                                  <span className="text-[10px]" style={{ color: '#787b86' }}>
                                    ₹{parseFloat(acc.balance || 0).toLocaleString('en-IN')}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  {/* Add Money Button (for both demo and live) */}
                                  <button
                                    onClick={() => setAddMoneyModal({ user: u, account: acc })}
                                    className="px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1"
                                    style={{ 
                                      background: '#26a69a20', 
                                      border: '1px solid #26a69a50', 
                                      color: '#26a69a' 
                                    }}
                                    title="Add money to this account"
                                  >
                                    <Plus size={12} />
                                    Add Money
                                  </button>

                                  <span className="text-xs" style={{ color: '#787b86' }}>Leverage:</span>
                                  <select
                                    value={acc.leverage || 5}
                                    onChange={(e) => updateLeverage(u.id, acc.id, e.target.value)}
                                    className="px-2 py-1 rounded text-xs font-medium"
                                    style={{ 
                                      background: '#2962ff20', 
                                      border: '1px solid #2962ff50', 
                                      color: '#2962ff' 
                                    }}
                                  >
                                    {LEVERAGE_OPTIONS.map((lev) => (
                                      <option key={lev} value={lev}>1:{lev}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Money Modal */}
      <AddMoneyModal />
    </div>
  );
}