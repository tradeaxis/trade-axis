import { create } from 'zustand';
import api from '../services/api';

const useTradingStore = create((set, get) => ({
  openTrades: [],
  tradeHistory: [],
  selectedSymbol: 'RELIANCE',
  isLoading: false,

  fetchOpenTrades: async (accountId) => {
    try {
      set({ isLoading: true });
      const url = accountId ? `/trading/open?accountId=${accountId}` : '/trading/open';
      const response = await api.get(url);
      set({ openTrades: response.data.data, isLoading: false });
    } catch (error) {
      console.error('Error:', error);
      set({ isLoading: false });
    }
  },

  fetchTradeHistory: async (accountId) => {
    try {
      const url = accountId ? `/trading/history?accountId=${accountId}` : '/trading/history';
      const response = await api.get(url);
      set({ tradeHistory: response.data.data });
    } catch (error) {
      console.error('Error:', error);
    }
  },

  placeOrder: async (orderData) => {
    try {
      const response = await api.post('/trading/order', orderData);
      get().fetchOpenTrades(orderData.accountId);
      return { success: true, data: response.data.data };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Order failed' };
    }
  },

  closeTrade: async (tradeId, accountId) => {
    try {
      await api.post(`/trading/close/${tradeId}`);
      get().fetchOpenTrades(accountId);
      get().fetchTradeHistory(accountId);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed' };
    }
  },

  closeAllTrades: async (accountId) => {
    try {
      await api.post('/trading/close-all', { accountId });
      get().fetchOpenTrades(accountId);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed' };
    }
  },

  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  updateTrade: (tradeData) => {
    set((state) => ({
      openTrades: state.openTrades.map((trade) =>
        trade.id === tradeData.tradeId
          ? { ...trade, current_price: tradeData.currentPrice, profit: tradeData.profit }
          : trade
      ),
    }));
  },
}));

export default useTradingStore;