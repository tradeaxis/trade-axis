import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import useTradingStore from '../store/tradingStore';
import useMarketStore from '../store/marketStore';
import socketService from '../services/socket';
import api from '../services/api';
import { 
  Search, TrendingUp, TrendingDown, X, 
  BarChart2, List, Clock, User, Activity
} from 'lucide-react';

const Dashboard = () => {
  const { user, accounts, logout } = useAuthStore();
  const { openTrades, tradeHistory, fetchOpenTrades, fetchTradeHistory, placeOrder, closeTrade } = useTradingStore();
  const { symbols, fetchSymbols, updatePrice } = useMarketStore();
  
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState('RELIANCE');
  const [symbolData, setSymbolData] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('equity');
  const [quantity, setQuantity] = useState(1);
  const [mobileTab, setMobileTab] = useState('trade');

  // Initialize
  useEffect(() => {
    if (accounts.length > 0) {
      const demo = accounts.find(a => a.is_demo);
      setSelectedAccount(demo || accounts[0]);
    }
    fetchSymbols();
  }, [accounts, fetchSymbols]);

  useEffect(() => {
    if (selectedAccount) {
      fetchOpenTrades(selectedAccount.id);
      fetchTradeHistory(selectedAccount.id);
    }
  }, [selectedAccount, fetchOpenTrades, fetchTradeHistory]);

  // Fetch symbol data and track price history
  useEffect(() => {
    const fetchQuote = async () => {
      try {
        const res = await api.get(`/market/quote/${selectedSymbol}`);
        const data = res.data.data;
        setSymbolData(data);
        
        // Add to price history (keep last 50 points)
        setPriceHistory(prev => {
          const newHistory = [...prev, { time: Date.now(), price: data.lastPrice }];
          return newHistory.slice(-50);
        });
      } catch (err) {
        console.error(err);
      }
    };
    fetchQuote();
    const interval = setInterval(fetchQuote, 2000);
    return () => clearInterval(interval);
  }, [selectedSymbol]);

  // WebSocket
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && selectedAccount) {
      socketService.connect(token);
      socketService.subscribe('price:update', (data) => {
        updatePrice(data);
        if (data.symbol === selectedSymbol) {
          setPriceHistory(prev => {
            const newHistory = [...prev, { time: Date.now(), price: data.last }];
            return newHistory.slice(-50);
          });
        }
      });
      socketService.subscribe('trade:pnl', (data) => {
        // Update specific trade
        fetchOpenTrades(selectedAccount.id);
      });
      socketService.subscribeSymbols(symbols.slice(0, 20).map(s => s.symbol));
    }
    return () => socketService.disconnect();
  }, [selectedAccount, symbols, updatePrice, selectedSymbol]);

  const handleOrder = async (type) => {
    if (!selectedAccount || !selectedSymbol) return;
    const result = await placeOrder({
      accountId: selectedAccount.id,
      symbol: selectedSymbol,
      type,
      quantity: parseInt(quantity),
    });
    if (result.success) {
      toast.success(`${type.toUpperCase()} ${quantity} ${selectedSymbol} @ ₹${result.data.open_price}`);
      setQuantity(1);
    } else {
      toast.error(result.message);
    }
  };

  const handleCloseTrade = async (tradeId) => {
    const result = await closeTrade(tradeId, selectedAccount?.id);
    if (result.success) {
      toast.success('Position closed');
    } else {
      toast.error(result.message);
    }
  };

  const filteredSymbols = symbols.filter(s => {
    const matchesSearch = s.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         s.display_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = category === 'all' || s.category === category;
    return matchesSearch && matchesCategory;
  });

  const bid = parseFloat(symbolData?.bid || 0);
  const ask = parseFloat(symbolData?.ask || 0);
  const totalPnL = openTrades.reduce((sum, t) => sum + parseFloat(t.profit || 0), 0);

  // Mini Price Chart Component
  const MiniChart = () => {
    if (priceHistory.length < 2) {
      return (
        <div className="flex items-center justify-center h-full" style={{ color: '#787b86' }}>
          <Activity size={40} className="opacity-20" />
        </div>
      );
    }

    const maxPrice = Math.max(...priceHistory.map(p => p.price));
    const minPrice = Math.min(...priceHistory.map(p => p.price));
    const range = maxPrice - minPrice || 1;

    const points = priceHistory.map((point, i) => {
      const x = (i / (priceHistory.length - 1)) * 100;
      const y = 100 - ((point.price - minPrice) / range) * 100;
      return `${x},${y}`;
    }).join(' ');

    const isUp = priceHistory[priceHistory.length - 1]?.price >= priceHistory[0]?.price;

    return (
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke={isUp ? '#26a69a' : '#ef5350'}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={`0,100 ${points} 100,100`}
          fill={isUp ? 'rgba(38, 166, 154, 0.1)' : 'rgba(239, 83, 80, 0.1)'}
        />
      </svg>
    );
  };

  // Mobile Bottom Nav
  const MobileNav = () => (
    <div className="fixed bottom-0 left-0 right-0 h-14 flex items-center justify-around border-t z-50 md:hidden safe-area-bottom"
         style={{ background: '#1e222d', borderColor: '#363a45' }}>
      {[
        { id: 'trade', icon: BarChart2, label: 'Trade' },
        { id: 'markets', icon: TrendingUp, label: 'Markets' },
        { id: 'positions', icon: List, label: 'Positions' },
        { id: 'history', icon: Clock, label: 'History' },
        { id: 'account', icon: User, label: 'Account' },
      ].map((tab) => (
        <button
          key={tab.id}
          onClick={() => setMobileTab(tab.id)}
          className="flex flex-col items-center justify-center flex-1 h-full"
          style={{ color: mobileTab === tab.id ? '#2962ff' : '#787b86' }}
        >
          <tab.icon size={20} />
          <span className="text-[10px] mt-0.5">{tab.label}</span>
        </button>
      ))}
    </div>
  );

  const MarketWatch = ({ fullScreen = false }) => (
    <div className={`flex flex-col ${fullScreen ? 'h-full' : 'h-full'}`} style={{ background: '#1e222d' }}>
      <div className="p-3 border-b" style={{ borderColor: '#363a45' }}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#787b86' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border"
            style={{ background: '#2a2e39', borderColor: '#363a45', color: '#d1d4dc' }}
          />
        </div>
      </div>

      <div className="flex border-b text-xs overflow-x-auto" style={{ borderColor: '#363a45' }}>
        {[
          { id: 'equity', label: 'Stocks' },
          { id: 'index', label: 'Index' },
          { id: 'commodity', label: 'MCX' },
          { id: 'currency', label: 'Forex' },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className="flex-1 py-2.5 border-b-2 whitespace-nowrap"
            style={{
              borderColor: category === cat.id ? '#2962ff' : 'transparent',
              color: category === cat.id ? '#d1d4dc' : '#787b86',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredSymbols.map((sym) => {
          const isSelected = selectedSymbol === sym.symbol;
          const change = parseFloat(sym.change_percent || 0);
          
          return (
            <div
              key={sym.symbol}
              onClick={() => {
                setSelectedSymbol(sym.symbol);
                if (fullScreen) setMobileTab('trade');
              }}
              className="flex items-center justify-between p-3 border-b cursor-pointer active:bg-opacity-80"
              style={{
                background: isSelected ? '#2a2e39' : 'transparent',
                borderColor: '#363a45',
                borderLeft: isSelected ? '3px solid #2962ff' : '3px solid transparent'
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold" style={{ color: '#d1d4dc' }}>{sym.symbol}</div>
                <div className="text-xs truncate" style={{ color: '#787b86' }}>{sym.display_name}</div>
              </div>
              <div className="text-right ml-2">
                <div className="font-semibold" style={{ color: '#d1d4dc' }}>
                  ₹{parseFloat(sym.last_price || 0).toFixed(2)}
                </div>
                <div className={`text-xs font-medium ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const OrderPanel = () => (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#1e222d' }}>
      {/* Symbol Info */}
      <div className="p-4 border-b" style={{ borderColor: '#363a45' }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-bold text-xl" style={{ color: '#d1d4dc' }}>{selectedSymbol}</div>
            <div className="text-xs" style={{ color: '#787b86' }}>{symbolData?.displayName}</div>
          </div>
          <div className="text-right">
            <div className="font-bold text-2xl" style={{ color: '#d1d4dc' }}>
              ₹{parseFloat(symbolData?.lastPrice || 0).toFixed(2)}
            </div>
            <div className={`text-sm font-medium ${(symbolData?.changePercent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {(symbolData?.changePercent || 0) >= 0 ? '+' : ''}{(symbolData?.changePercent || 0).toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Mini Chart */}
        <div className="h-24 rounded-lg p-2" style={{ background: '#131722' }}>
          <MiniChart />
        </div>

        {/* Price Stats */}
        <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
          <div>
            <div style={{ color: '#787b86' }}>Open</div>
            <div className="font-semibold" style={{ color: '#d1d4dc' }}>
              {parseFloat(symbolData?.open || 0).toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ color: '#787b86' }}>High</div>
            <div className="font-semibold text-green-500">
              {parseFloat(symbolData?.high || 0).toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ color: '#787b86' }}>Low</div>
            <div className="font-semibold text-red-500">
              {parseFloat(symbolData?.low || 0).toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ color: '#787b86' }}>Vol</div>
            <div className="font-semibold" style={{ color: '#d1d4dc' }}>
              {(symbolData?.volume || 0) > 1000 ? `${((symbolData?.volume || 0) / 1000).toFixed(1)}K` : symbolData?.volume || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Price Display */}
      <div className="p-3 border-b" style={{ borderColor: '#363a45' }}>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-4 rounded-lg" style={{ background: 'rgba(239, 83, 80, 0.15)' }}>
            <div className="text-xs mb-1" style={{ color: '#787b86' }}>SELL (Bid)</div>
            <div className="text-2xl font-bold" style={{ color: '#ef5350' }}>₹{bid.toFixed(2)}</div>
          </div>
          <div className="text-center p-4 rounded-lg" style={{ background: 'rgba(38, 166, 154, 0.15)' }}>
            <div className="text-xs mb-1" style={{ color: '#787b86' }}>BUY (Ask)</div>
            <div className="text-2xl font-bold" style={{ color: '#26a69a' }}>₹{ask.toFixed(2)}</div>
          </div>
        </div>
        <div className="text-center mt-2 text-xs" style={{ color: '#787b86' }}>
          Spread: ₹{(ask - bid).toFixed(2)}
        </div>
      </div>

      {/* Volume Selector */}
      <div className="p-3 border-b" style={{ borderColor: '#363a45' }}>
        <label className="block text-xs mb-2 font-medium" style={{ color: '#787b86' }}>Volume (Quantity)</label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="w-12 h-12 rounded-lg text-xl font-bold active:scale-95 transition"
            style={{ background: '#2a2e39', color: '#d1d4dc' }}
          >
            -
          </button>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="flex-1 text-center py-3 rounded-lg border text-lg font-bold"
            style={{ background: '#2a2e39', borderColor: '#363a45', color: '#d1d4dc' }}
          />
          <button
            onClick={() => setQuantity(quantity + 1)}
            className="w-12 h-12 rounded-lg text-xl font-bold active:scale-95 transition"
            style={{ background: '#2a2e39', color: '#d1d4dc' }}
          >
            +
          </button>
        </div>
        <div className="grid grid-cols-6 gap-2 mt-2">
          {[1, 5, 10, 25, 50, 100].map((q) => (
            <button
              key={q}
              onClick={() => setQuantity(q)}
              className="py-2 rounded text-xs font-medium active:scale-95 transition"
              style={{ 
                background: quantity === q ? '#2962ff' : '#2a2e39',
                color: quantity === q ? 'white' : '#787b86'
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Margin Info */}
      <div className="p-3 border-b" style={{ borderColor: '#363a45' }}>
        <div className="p-3 rounded-lg text-sm space-y-2" style={{ background: '#2a2e39' }}>
          <div className="flex justify-between">
            <span style={{ color: '#787b86' }}>Margin Required:</span>
            <span className="font-semibold" style={{ color: '#d1d4dc' }}>
              ₹{((ask * quantity) / (selectedAccount?.leverage || 5)).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: '#787b86' }}>Available Margin:</span>
            <span className="font-semibold" style={{ color: '#26a69a' }}>
              ₹{parseFloat(selectedAccount?.free_margin || 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Buy/Sell Buttons */}
      <div className="p-3 mt-auto">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleOrder('sell')}
            className="py-5 rounded-lg font-bold text-white text-lg active:scale-95 transition"
            style={{ background: '#ef5350' }}
          >
            <div className="text-xs opacity-80">SELL</div>
            <div>₹{bid.toFixed(2)}</div>
          </button>
          <button
            onClick={() => handleOrder('buy')}
            className="py-5 rounded-lg font-bold text-white text-lg active:scale-95 transition"
            style={{ background: '#26a69a' }}
          >
            <div className="text-xs opacity-80">BUY</div>
            <div>₹{ask.toFixed(2)}</div>
          </button>
        </div>
      </div>
    </div>
  );

  const Positions = () => (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#1e222d' }}>
      <div className="p-3 border-b sticky top-0 z-10" style={{ background: '#1e222d', borderColor: '#363a45' }}>
        <div className="flex justify-between items-center">
          <span className="font-semibold" style={{ color: '#d1d4dc' }}>
            Open Positions ({openTrades.length})
          </span>
          <span className={`font-bold ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="flex-1">
        {openTrades.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40" style={{ color: '#787b86' }}>
            <List size={40} className="opacity-20 mb-2" />
            <p>No open positions</p>
          </div>
        ) : (
          openTrades.map((trade) => {
            const pnl = parseFloat(trade.profit || 0);
            return (
              <div key={trade.id} className="p-3 border-b" style={{ borderColor: '#363a45' }}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base" style={{ color: '#d1d4dc' }}>{trade.symbol}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        trade.trade_type === 'buy' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                      }`}>
                        {trade.trade_type.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-sm mt-1" style={{ color: '#787b86' }}>
                      {trade.quantity} qty × ₹{parseFloat(trade.open_price).toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold text-lg ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                    </div>
                    <div className="text-xs" style={{ color: '#787b86' }}>
                      ₹{parseFloat(trade.current_price || trade.open_price).toFixed(2)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleCloseTrade(trade.id)}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold active:scale-95 transition"
                  style={{ background: '#ef5350', color: 'white' }}
                >
                  Close Position
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const History = () => (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#1e222d' }}>
      <div className="p-3 border-b sticky top-0" style={{ background: '#1e222d', borderColor: '#363a45' }}>
        <span className="font-semibold" style={{ color: '#d1d4dc' }}>Trade History</span>
      </div>
      <div className="flex-1">
        {tradeHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40" style={{ color: '#787b86' }}>
            <Clock size={40} className="opacity-20 mb-2" />
            <p>No trade history</p>
          </div>
        ) : (
          tradeHistory.map((trade) => {
            const pnl = parseFloat(trade.profit || 0);
            return (
              <div key={trade.id} className="p-3 border-b" style={{ borderColor: '#363a45' }}>
                <div className="flex justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold" style={{ color: '#d1d4dc' }}>{trade.symbol}</span>
                      <span className={`text-xs ${trade.trade_type === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                        {trade.trade_type.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: '#787b86' }}>
                      {trade.quantity} × ₹{parseFloat(trade.open_price).toFixed(2)}
                    </div>
                    <div className="text-xs" style={{ color: '#787b86' }}>
                      {new Date(trade.close_time).toLocaleString()}
                    </div>
                  </div>
                  <div className={`font-bold text-lg ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const Account = () => (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#1e222d' }}>
      {/* Profile */}
      <div className="p-4 border-b" style={{ borderColor: '#363a45' }}>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#2962ff' }}>
            <span className="text-xl font-bold text-white">{user?.firstName?.[0]}{user?.lastName?.[0]}</span>
          </div>
          <div>
            <div className="font-semibold" style={{ color: '#d1d4dc' }}>{user?.firstName} {user?.lastName}</div>
            <div className="text-sm" style={{ color: '#787b86' }}>{user?.email}</div>
          </div>
        </div>
      </div>

      {/* Account Selector */}
      <div className="p-4 border-b" style={{ borderColor: '#363a45' }}>
        <label className="block text-xs mb-2" style={{ color: '#787b86' }}>Select Account</label>
        <select
          value={selectedAccount?.id || ''}
          onChange={(e) => setSelectedAccount(accounts.find(a => a.id === e.target.value))}
          className="w-full px-4 py-3 rounded-lg border"
          style={{ background: '#2a2e39', borderColor: '#363a45', color: '#d1d4dc' }}
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.account_number} • {acc.is_demo ? 'Demo' : 'Live'}
            </option>
          ))}
        </select>
      </div>

      {/* Balance Cards */}
      <div className="p-4 space-y-3">
        <div className="p-4 rounded-lg" style={{ background: '#2a2e39' }}>
          <div className="text-xs mb-1" style={{ color: '#787b86' }}>Account Balance</div>
          <div className="text-3xl font-bold" style={{ color: '#d1d4dc' }}>
            ₹{parseFloat(selectedAccount?.balance || 0).toLocaleString('en-IN')}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg" style={{ background: '#2a2e39' }}>
            <div className="text-xs mb-1" style={{ color: '#787b86' }}>Equity</div>
            <div className="font-bold" style={{ color: '#d1d4dc' }}>
              ₹{parseFloat(selectedAccount?.equity || 0).toLocaleString('en-IN')}
            </div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: '#2a2e39' }}>
            <div className="text-xs mb-1" style={{ color: '#787b86' }}>Margin</div>
            <div className="font-bold" style={{ color: '#d1d4dc' }}>
              ₹{parseFloat(selectedAccount?.margin || 0).toFixed(2)}
            </div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: '#2a2e39' }}>
            <div className="text-xs mb-1" style={{ color: '#787b86' }}>Free Margin</div>
            <div className="font-bold text-green-500">
              ₹{parseFloat(selectedAccount?.free_margin || 0).toLocaleString('en-IN')}
            </div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: '#2a2e39' }}>
            <div className="text-xs mb-1" style={{ color: '#787b86' }}>Leverage</div>
            <div className="font-bold" style={{ color: '#d1d4dc' }}>
              1:{selectedAccount?.leverage || 5}
            </div>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="mt-auto p-4">
        <button
          onClick={logout}
          className="w-full py-3 rounded-lg font-semibold active:scale-95 transition"
          style={{ background: '#ef5350', color: 'white' }}
        >
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col" style={{ background: '#131722' }}>
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-3 border-b shrink-0"
              style={{ background: '#1e222d', borderColor: '#363a45' }}>
        <div className="flex items-center gap-2">
          <img 
            src="/logo.png" 
            alt="Trade Axis" 
            className="h-8 w-8 object-contain" 
            onError={(e) => { 
              e.target.onerror = null;
              e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><text y="24" font-size="24">📊</text></svg>';
            }} 
          />
          <span className="font-bold text-base md:text-lg" style={{ color: '#2962ff' }}>Trade Axis</span>
        </div>
        
        {/* Desktop Stats */}
        <div className="hidden md:flex items-center gap-4 text-xs">
          <div style={{ color: '#787b86' }}>
            Bal: <span style={{ color: '#d1d4dc' }}>₹{parseFloat(selectedAccount?.balance || 0).toLocaleString('en-IN')}</span>
          </div>
          <div className={totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}>
            P&L: {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toFixed(2)}
          </div>
        </div>

        {/* Mobile P&L */}
        <div className="md:hidden text-xs font-semibold" style={{ color: totalPnL >= 0 ? '#26a69a' : '#ef5350' }}>
          {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toFixed(2)}
        </div>
      </header>

      {/* Desktop Layout */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <div className="w-64 border-r shrink-0" style={{ borderColor: '#363a45' }}>
          <MarketWatch />
        </div>
        <div className="flex-1">
          <Positions />
        </div>
        <div className="w-80 border-l shrink-0" style={{ borderColor: '#363a45' }}>
          <OrderPanel />
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden flex-1 overflow-hidden">
        {mobileTab === 'trade' && <OrderPanel />}
        {mobileTab === 'markets' && <MarketWatch fullScreen />}
        {mobileTab === 'positions' && <Positions />}
        {mobileTab === 'history' && <History />}
        {mobileTab === 'account' && <Account />}
      </div>

      <MobileNav />
    </div>
  );
};

export default Dashboard;