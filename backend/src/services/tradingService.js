// backend/src/services/tradingService.js
// ✅ Uses kiteStreamService in-memory cache for price lookups
const { supabase } = require('../config/supabase');
const kiteStreamService = require('./kiteStreamService');

class TradingService {
  // ─── Helper: get latest bid/ask ───
  async getLatestPrice(symbol) {
    // 1) In-memory cache (instant)
    const cached = kiteStreamService.getPrice(symbol);
    if (cached) return { bid: cached.bid, ask: cached.ask };

    // 2) Supabase fallback
    const { data } = await supabase
      .from('symbols')
      .select('bid, ask')
      .eq('symbol', symbol)
      .single();

    if (data) return { bid: Number(data.bid), ask: Number(data.ask) };
    return null;
  }

  // ─── Execute market order ───
  async executeMarketOrder({
    userId,
    account,
    symbolData,
    type,
    quantity,
    stopLoss = 0,
    takeProfit = 0,
    slippage = 3,
    comment = '',
    magicNumber = 0,
  }) {
    try {
      // Always use freshest price
      const live = await this.getLatestPrice(symbolData.symbol);
      if (live) {
        symbolData = { ...symbolData, bid: live.bid, ask: live.ask };
      }

      const openPrice = type === 'buy' ? parseFloat(symbolData.ask) : parseFloat(symbolData.bid);

      if (!openPrice || openPrice <= 0) {
        return { success: false, message: 'Invalid price. Market may be closed.' };
      }

      const lotSize = symbolData.lot_size || 1;
      const leverage = account.leverage || 5;
      const marginRequired = (openPrice * quantity * lotSize) / leverage;

      const freeMargin = parseFloat(account.free_margin || account.balance);
      if (marginRequired > freeMargin) {
        return {
          success: false,
          message: `Insufficient margin. Required: ₹${marginRequired.toFixed(2)}, Available: ₹${freeMargin.toFixed(2)}`,
        };
      }

      const brokerageRate = 0.0003;
      const brokerage = openPrice * quantity * lotSize * brokerageRate;

      const tradeData = {
        user_id: userId,
        account_id: account.id,
        symbol: symbolData.symbol,
        trade_type: type,
        quantity,
        lot_size: lotSize,
        open_price: openPrice,
        current_price: openPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        margin: marginRequired,
        brokerage,
        profit: 0,
        status: 'open',
        comment,
        magic_number: magicNumber,
        open_time: new Date().toISOString(),
      };

      const { data: trade, error } = await supabase
        .from('trades')
        .insert(tradeData)
        .select()
        .single();

      if (error) throw error;

      const newMargin = parseFloat(account.margin || 0) + marginRequired;
      const newFreeMargin = parseFloat(account.balance) - newMargin;

      await supabase
        .from('accounts')
        .update({ margin: newMargin, free_margin: newFreeMargin, updated_at: new Date().toISOString() })
        .eq('id', account.id);

      return {
        success: true,
        trade,
        message: `${type.toUpperCase()} ${quantity} ${symbolData.symbol} @ ${openPrice}`,
      };
    } catch (error) {
      console.error('executeMarketOrder error:', error);
      return { success: false, message: 'Failed to execute order' };
    }
  }

  // ─── Create pending order ───
  async createPendingOrder({
    userId,
    account,
    symbolData,
    orderType,
    type,
    quantity,
    price,
    stopLoss = 0,
    takeProfit = 0,
    comment = '',
    expiration = 'gtc',
    expirationTime = null,
    magicNumber = 0,
  }) {
    try {
      if (!price || price <= 0) {
        return { success: false, message: 'Invalid price for pending order' };
      }

      const live = await this.getLatestPrice(symbolData.symbol);
      if (live) symbolData = { ...symbolData, bid: live.bid, ask: live.ask };

      const currentPrice = type === 'buy' ? parseFloat(symbolData.ask) : parseFloat(symbolData.bid);

      const validation = this.validatePendingOrderPrice(orderType, type, price, currentPrice);
      if (!validation.valid) return { success: false, message: validation.message };

      const lotSize = symbolData.lot_size || 1;
      const leverage = account.leverage || 5;
      const marginRequired = (price * quantity * lotSize) / leverage;

      const freeMargin = parseFloat(account.free_margin || account.balance);
      if (marginRequired > freeMargin) {
        return {
          success: false,
          message: `Insufficient margin. Required: ₹${marginRequired.toFixed(2)}`,
        };
      }

      const { data: order, error } = await supabase
        .from('pending_orders')
        .insert({
          user_id: userId,
          account_id: account.id,
          symbol: symbolData.symbol,
          order_type: orderType,
          trade_type: type,
          quantity,
          price,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          margin_reserved: marginRequired,
          status: 'pending',
          comment,
          expiration,
          expiration_time: expirationTime,
          magic_number: magicNumber,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, order, message: `Pending ${orderType.toUpperCase()} at ${price}` };
    } catch (error) {
      console.error('createPendingOrder error:', error);
      return { success: false, message: 'Failed to create pending order' };
    }
  }

  validatePendingOrderPrice(orderType, type, price, currentPrice) {
    switch (orderType) {
      case 'buy_limit':
        if (price >= currentPrice) return { valid: false, message: 'Buy Limit must be below current price' };
        break;
      case 'sell_limit':
        if (price <= currentPrice) return { valid: false, message: 'Sell Limit must be above current price' };
        break;
      case 'buy_stop':
        if (price <= currentPrice) return { valid: false, message: 'Buy Stop must be above current price' };
        break;
      case 'sell_stop':
        if (price >= currentPrice) return { valid: false, message: 'Sell Stop must be below current price' };
        break;
    }
    return { valid: true };
  }

  // ─── Close position ───
  async closePosition(trade) {
    try {
      const price = await this.getLatestPrice(trade.symbol);
      if (!price) return { success: false, message: 'Failed to get current price' };

      const closePrice =
        trade.trade_type === 'buy' ? parseFloat(price.bid) : parseFloat(price.ask);

      const dir = trade.trade_type === 'buy' ? 1 : -1;
      const lotSize = trade.lot_size || 1;
      const gross = (closePrice - parseFloat(trade.open_price)) * dir * trade.quantity * lotSize;
      const net = gross - parseFloat(trade.brokerage || 0);

      const closeTime = new Date().toISOString();

      const { data: closedTrade, error } = await supabase
        .from('trades')
        .update({
          close_price: closePrice,
          profit: net,
          status: 'closed',
          close_time: closeTime,
          updated_at: closeTime,
        })
        .eq('id', trade.id)
        .select()
        .single();

      if (error) throw error;

      // Update account
      const { data: account } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', trade.account_id)
        .single();

      if (account) {
        const newBalance = parseFloat(account.balance) + net;
        const newMargin = Math.max(0, parseFloat(account.margin) - parseFloat(trade.margin || 0));

        await supabase
          .from('accounts')
          .update({
            balance: newBalance,
            margin: newMargin,
            free_margin: newBalance - newMargin,
            updated_at: closeTime,
          })
          .eq('id', account.id);
      }

      return { success: true, trade: closedTrade, message: `Closed @ ${closePrice}. P&L: ${net.toFixed(2)}` };
    } catch (error) {
      console.error('closePosition error:', error);
      return { success: false, message: 'Failed to close position' };
    }
  }

  // ─── Partial close ───
  async partialClosePosition(trade, closeVolume) {
    try {
      const price = await this.getLatestPrice(trade.symbol);
      if (!price) return { success: false, message: 'Failed to get current price' };

      const closePrice =
        trade.trade_type === 'buy' ? parseFloat(price.bid) : parseFloat(price.ask);

      const totalVol = parseFloat(trade.quantity);
      const remaining = totalVol - closeVolume;

      const dir = trade.trade_type === 'buy' ? 1 : -1;
      const lotSize = trade.lot_size || 1;
      const closedProfit = (closePrice - parseFloat(trade.open_price)) * dir * closeVolume * lotSize;

      const closedBrokerage = (parseFloat(trade.brokerage || 0) / totalVol) * closeVolume;
      const closedMargin = (parseFloat(trade.margin || 0) / totalVol) * closeVolume;
      const netClosed = closedProfit - closedBrokerage;

      const closeTime = new Date().toISOString();

      const { data: closedTrade, error: e1 } = await supabase
        .from('trades')
        .insert({
          user_id: trade.user_id,
          account_id: trade.account_id,
          symbol: trade.symbol,
          trade_type: trade.trade_type,
          quantity: closeVolume,
          lot_size: lotSize,
          open_price: trade.open_price,
          close_price: closePrice,
          stop_loss: 0,
          take_profit: 0,
          margin: closedMargin,
          brokerage: closedBrokerage,
          profit: netClosed,
          status: 'closed',
          comment: `Partial close of #${trade.id}`,
          magic_number: trade.magic_number,
          open_time: trade.open_time,
          close_time: closeTime,
        })
        .select()
        .single();

      if (e1) throw e1;

      const remainBrokerage = parseFloat(trade.brokerage || 0) - closedBrokerage;
      const remainMargin = parseFloat(trade.margin || 0) - closedMargin;

      const { data: remainingTrade, error: e2 } = await supabase
        .from('trades')
        .update({ quantity: remaining, margin: remainMargin, brokerage: remainBrokerage, updated_at: closeTime })
        .eq('id', trade.id)
        .select()
        .single();

      if (e2) throw e2;

      const { data: account } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', trade.account_id)
        .single();

      if (account) {
        const newBal = parseFloat(account.balance) + netClosed;
        const newMar = Math.max(0, parseFloat(account.margin) - closedMargin);
        await supabase
          .from('accounts')
          .update({ balance: newBal, margin: newMar, free_margin: newBal - newMar, updated_at: closeTime })
          .eq('id', account.id);
      }

      return {
        success: true,
        closedTrade,
        remainingTrade,
        message: `Closed ${closeVolume} lots @ ${closePrice}. Remaining: ${remaining}`,
      };
    } catch (error) {
      console.error('partialClose error:', error);
      return { success: false, message: 'Failed to partial close' };
    }
  }

  // ─── Check pending orders (background) ───
  async checkPendingOrders() {
    try {
      const { data: orders, error } = await supabase
        .from('pending_orders')
        .select('*, accounts(*)')
        .eq('status', 'pending');

      if (error || !orders || orders.length === 0) return;

      for (const order of orders) {
        const price = await this.getLatestPrice(order.symbol);
        if (!price) continue;

        const currentBid = parseFloat(price.bid);
        const currentAsk = parseFloat(price.ask);
        const orderPrice = parseFloat(order.price);

        let shouldTrigger = false;

        switch (order.order_type) {
          case 'buy_limit':  shouldTrigger = currentAsk <= orderPrice; break;
          case 'sell_limit': shouldTrigger = currentBid >= orderPrice; break;
          case 'buy_stop':   shouldTrigger = currentAsk >= orderPrice; break;
          case 'sell_stop':  shouldTrigger = currentBid <= orderPrice; break;
        }

        if (shouldTrigger) {
          const { data: symData } = await supabase
            .from('symbols')
            .select('*')
            .eq('symbol', order.symbol)
            .single();

          if (!symData) continue;

          const result = await this.executeMarketOrder({
            userId: order.user_id,
            account: order.accounts,
            symbolData: symData,
            type: order.trade_type,
            quantity: order.quantity,
            stopLoss: order.stop_loss,
            takeProfit: order.take_profit,
            comment: `Triggered from pending #${order.id}`,
            magicNumber: order.magic_number,
          });

          if (result.success) {
            await supabase
              .from('pending_orders')
              .update({ status: 'triggered', triggered_at: new Date().toISOString(), trade_id: result.trade.id })
              .eq('id', order.id);

            console.log(`✅ Pending #${order.id} triggered`);
          }
        }

        // Expiration check
        if (order.expiration === 'today') {
          if (new Date(order.created_at).toDateString() !== new Date().toDateString()) {
            await supabase
              .from('pending_orders')
              .update({ status: 'expired', expired_at: new Date().toISOString() })
              .eq('id', order.id);
          }
        } else if (order.expiration === 'specified' && order.expiration_time) {
          if (new Date() > new Date(order.expiration_time)) {
            await supabase
              .from('pending_orders')
              .update({ status: 'expired', expired_at: new Date().toISOString() })
              .eq('id', order.id);
          }
        }
      }
    } catch (error) {
      console.error('checkPendingOrders error:', error);
    }
  }

  // ─── Check SL / TP (background) ───
  async checkStopLossAndTakeProfit() {
    try {
      const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .eq('status', 'open')
        .or('stop_loss.gt.0,take_profit.gt.0');

      if (error || !trades || trades.length === 0) return;

      for (const trade of trades) {
        const price = await this.getLatestPrice(trade.symbol);
        if (!price) continue;

        const currentPrice =
          trade.trade_type === 'buy' ? parseFloat(price.bid) : parseFloat(price.ask);

        const sl = parseFloat(trade.stop_loss);
        const tp = parseFloat(trade.take_profit);

        let shouldClose = false;
        let reason = '';

        if (sl > 0) {
          if (trade.trade_type === 'buy' && currentPrice <= sl) { shouldClose = true; reason = 'Stop Loss'; }
          if (trade.trade_type === 'sell' && currentPrice >= sl) { shouldClose = true; reason = 'Stop Loss'; }
        }

        if (!shouldClose && tp > 0) {
          if (trade.trade_type === 'buy' && currentPrice >= tp) { shouldClose = true; reason = 'Take Profit'; }
          if (trade.trade_type === 'sell' && currentPrice <= tp) { shouldClose = true; reason = 'Take Profit'; }
        }

        if (shouldClose) {
          const result = await this.closePosition(trade);
          if (result.success) console.log(`✅ ${reason} triggered for trade #${trade.id}`);
        }
      }
    } catch (error) {
      console.error('checkSL/TP error:', error);
    }
  }
}

module.exports = new TradingService();