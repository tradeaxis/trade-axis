import { create } from 'zustand';
import api from '../services/api';

const useMarketStore = create((set) => ({
  symbols: [],
  quotes: {},
  isLoading: false,

  fetchSymbols: async (category = null) => {
    try {
      set({ isLoading: true });
      const url = category ? `/market/symbols?category=${category}` : '/market/symbols';
      const response = await api.get(url);
      set({ symbols: response.data.data, isLoading: false });
    } catch (error) {
      console.error('Error:', error);
      set({ isLoading: false });
    }
  },

  getQuote: async (symbol) => {
    try {
      const response = await api.get(`/market/quote/${symbol}`);
      set((state) => ({
        quotes: { ...state.quotes, [symbol]: response.data.data },
      }));
      return response.data.data;
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  },

  updatePrice: (priceData) => {
    set((state) => ({
      quotes: { ...state.quotes, [priceData.symbol]: { ...state.quotes[priceData.symbol], ...priceData } },
      symbols: state.symbols.map((s) =>
        s.symbol === priceData.symbol
          ? { ...s, last_price: priceData.last, bid: priceData.bid, ask: priceData.ask, change_percent: priceData.changePercent }
          : s
      ),
    }));
  },
}));

export default useMarketStore;