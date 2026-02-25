import { 
  LayoutDashboard, 
  LineChart, 
  Wallet, 
  History, 
  Settings, 
  HelpCircle,
  TrendingUp,
  List
} from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'trade', icon: LineChart, label: 'Trade' },
    { id: 'markets', icon: TrendingUp, label: 'Markets' },
    { id: 'positions', icon: List, label: 'Positions' },
    { id: 'history', icon: History, label: 'History' },
    { id: 'wallet', icon: Wallet, label: 'Wallet' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-16 lg:w-56 bg-dark-300 border-r border-gray-800 flex flex-col h-screen fixed left-0 top-0">
      {/* Logo */}
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-xl font-bold text-green-500 hidden lg:block">Trade Axis</h1>
        <span className="text-2xl font-bold text-green-500 lg:hidden">TA</span>
      </div>

      {/* Menu */}
      <nav className="flex-1 p-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg mb-1 transition ${
              activeTab === item.id
                ? 'bg-green-600 text-white'
                : 'text-gray-400 hover:bg-dark-200 hover:text-white'
            }`}
          >
            <item.icon size={20} />
            <span className="hidden lg:block">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Help */}
      <div className="p-2 border-t border-gray-800">
        <button className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-gray-400 hover:bg-dark-200 hover:text-white transition">
          <HelpCircle size={20} />
          <span className="hidden lg:block">Help</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;