import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Star, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import useMarketStore from '../../store/marketStore';

const MarketWatch = ({ onSymbolSelect, selectedSymbol }) => {
  const { 
    symbols, 
    quotes, 
    fetchSymbols, 
    searchSymbols, 
    searchResults, 
    searchLoading,
    clearSearch 
  } = useMarketStore();
  
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('market_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    fetchSymbols();
  }, [fetchSymbols]);

  // Save favorites to localStorage
  useEffect(() => {
    localStorage.setItem('market_favorites', JSON.stringify(favorites));
  }, [favorites]);

  // ✅ Debounced backend search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (search.trim().length >= 2) {
      // Debounce 300ms
      searchTimeoutRef.current = setTimeout(() => {
        searchSymbols(search.trim(), category);
      }, 300);
    } else {
      clearSearch();
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search, category, searchSymbols, clearSearch]);

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'favorites', label: '★ Fav' },
    { id: 'index_futures', label: 'Index' },
    { id: 'stock_futures', label: 'Stocks' },
    { id: 'sensex_futures', label: 'Sensex' },
    { id: 'commodity_futures', label: 'Commodity' },
  ];

  // ✅ Use search results when searching, otherwise filter locally
  const filteredSymbols = useMemo(() => {
    // If we have a search query, use backend search results
    if (search.trim().length >= 2) {
      let results = searchResults;
      
      // Apply category filter to search results
      if (category === 'favorites') {
        results = results.filter((s) => favorites.includes(s.symbol));
      } else if (category !== 'all') {
        results = results.filter((s) => s.category === category);
      }
      
      return results;
    }

    // No search - filter local symbols
    return symbols.filter((s) => {
      if (category === 'favorites') {
        return favorites.includes(s.symbol);
      }
      if (category === 'all') {
        return true;
      }
      return s.category === category;
    });
  }, [symbols, searchResults, search, category, favorites]);

  const toggleFavorite = useCallback((symbol) => {
    setFavorites((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  }, []);

  // ✅ Show a reasonable subset when not searching (for performance)
  const displaySymbols = useMemo(() => {
    if (search.trim().length >= 2) {
      return filteredSymbols; // Show all search results
    }
    // When not searching, limit display for performance
    return filteredSymbols.slice(0, 200);
  }, [filteredSymbols, search]);

  return (
    <div className="bg-dark-200 rounded-xl border border-gray-800 h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-gray-800">
        <h3 className="font-bold text-green-500 mb-3 text-lg">Market Watch</h3>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search RELIANCE, NIFTY, GOLD..."
            className="w-full pl-10 pr-10 py-2.5 bg-dark-300 border border-gray-700 rounded-lg text-base focus:outline-none focus:border-green-500"
          />
          {searchLoading && (
            <Loader2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
          )}
        </div>

        {/* Categories */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap transition ${
                category === cat.id
                  ? 'bg-green-600 text-white'
                  : 'bg-dark-300 text-gray-400 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Symbol List */}
      <div className="flex-1 overflow-y-auto">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-sm text-gray-400 border-b border-gray-800 sticky top-0 bg-dark-200 z-10">
          <div className="col-span-1"></div>
          <div className="col-span-4">Symbol</div>
          <div className="col-span-4 text-right">Price</div>
          <div className="col-span-3 text-right">Change</div>
        </div>

        {/* Loading state */}
        {searchLoading && search.trim().length >= 2 && (
          <div className="p-6 text-center text-gray-500 text-base">
            <Loader2 size={24} className="animate-spin mx-auto mb-2" />
            Searching...
          </div>
        )}

        {/* Empty state */}
        {!searchLoading && displaySymbols.length === 0 && (
          <div className="p-6 text-center text-gray-500 text-base">
            {symbols.length === 0
              ? 'No symbols loaded. Sync from Kite Connect.'
              : search.trim().length >= 2
              ? `No symbols found for "${search}"`
              : category === 'favorites' && favorites.length === 0
              ? 'No favorites yet. Star symbols to add them.'
              : 'No symbols match your filter.'}
          </div>
        )}

        {/* Info banner when showing limited results */}
        {!search.trim() && filteredSymbols.length > 200 && (
          <div className="px-3 py-2 bg-blue-900/30 text-blue-300 text-sm border-b border-gray-800">
            Showing first 200 of {filteredSymbols.length} symbols. Search to find specific ones.
          </div>
        )}

        {/* Symbols */}
        {displaySymbols.map((symbol) => {
          const quote = quotes[symbol.symbol] || {};
          const price = parseFloat(quote.last || symbol.last_price || 0);
          const change = parseFloat(quote.change_percent || symbol.change_percent || 0);
          const isFavorite = favorites.includes(symbol.symbol);
          const isSelected = selectedSymbol === symbol.symbol;

          return (
            <div
              key={symbol.symbol}
              onClick={() => onSymbolSelect?.(symbol.symbol)}
              className={`market-row grid grid-cols-12 gap-2 px-3 py-3 cursor-pointer border-b border-gray-800/50 transition ${
                isSelected ? 'bg-green-600/10 border-l-2 border-l-green-500' : 'hover:bg-dark-300'
              }`}
            >
              {/* Favorite star */}
              <div className="col-span-1 flex items-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(symbol.symbol);
                  }}
                  className={`p-1 ${isFavorite ? 'text-yellow-500' : 'text-gray-600 hover:text-yellow-500'}`}
                >
                  <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
              </div>

              {/* Symbol name */}
              <div className="col-span-4 min-w-0">
                <p className="font-semibold text-base truncate">
                  {symbol.display_name || symbol.symbol}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {symbol.exchange} · {symbol.underlying}
                </p>
              </div>

              {/* Price */}
              <div className="col-span-4 text-right flex flex-col justify-center">
                <p className="font-bold text-base tabular-nums">
                  ₹{price > 0 
                    ? price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                    : '—'}
                </p>
              </div>

              {/* Change */}
              <div className="col-span-3 text-right flex flex-col justify-center">
                <div
                  className={`flex items-center justify-end gap-1 text-base font-semibold ${
                    change >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  <span className="tabular-nums">
                    {change >= 0 ? '+' : ''}
                    {change.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MarketWatch;