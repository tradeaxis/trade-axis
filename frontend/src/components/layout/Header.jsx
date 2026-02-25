import { Bell, User, LogOut, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import useAuthStore from '../../store/authStore';

const Header = ({ selectedAccount, accounts, onAccountChange }) => {
  const { user, logout } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <header className="h-14 bg-dark-300 border-b border-gray-800 flex items-center justify-between px-4 fixed top-0 left-16 lg:left-56 right-0 z-50">
      {/* Account Selector */}
      <div className="flex items-center gap-4">
        <select
          value={selectedAccount?.id || ''}
          onChange={(e) => {
            const acc = accounts.find(a => a.id === e.target.value);
            onAccountChange(acc);
          }}
          className="px-3 py-2 bg-dark-200 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.account_number} • {acc.is_demo ? 'Demo' : 'Live'} • ₹{parseFloat(acc.balance).toLocaleString('en-IN')}
            </option>
          ))}
        </select>

        {/* Connection Status */}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          <span className="text-gray-400">Connected</span>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-200 rounded-lg transition">
          <Bell size={20} />
        </button>

        {/* User Menu */}
        <div className="relative">
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 px-3 py-2 hover:bg-dark-200 rounded-lg transition"
          >
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
              <span className="text-sm font-bold">{user?.firstName?.[0]}{user?.lastName?.[0]}</span>
            </div>
            <span className="hidden md:block text-sm">{user?.firstName}</span>
            <ChevronDown size={16} className="text-gray-400" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-dark-200 border border-gray-700 rounded-lg shadow-xl">
              <div className="p-3 border-b border-gray-700">
                <p className="font-semibold">{user?.firstName} {user?.lastName}</p>
                <p className="text-sm text-gray-400">{user?.email}</p>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-red-500 hover:bg-dark-300 transition"
              >
                <LogOut size={18} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;