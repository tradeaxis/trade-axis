const { supabase } = require('../config/supabase');

class TradingService {

  // Calculate required margin
  calculateMargin(price, quantity, leverage, lotSize = 1) {
    const contractValue = price * quantity * lotSize;
    return contractValue / leverage;
  }

  // Calculate profit/loss
  calculatePnL(openPrice, currentPrice, quantity, type, lotSize = 1) {
    const direction = type === 'buy' ? 1 : -1;
    const priceDiff = (currentPrice - openPrice) * direction;
    return priceDiff * quantity * lotSize;
  }

  // Validate trade
  async validateTrade(accountId, symbol, quantity, type) {
    // Get account
    const { data: account, error: accError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (accError || !account) {
      return { valid: false, error: 'Account not found' };
    }

    // Get symbol
    const { data: symbolData, error: symError } = await supabase
      .from('symbols')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (symError || !symbolData) {
      return { valid: false, error: 'Symbol not found' };
    }

    if (!symbolData.is_tradeable) {
      return { valid: false, error: 'Symbol is not tradeable' };
    }

    // Calculate margin required
    const price = type === 'buy' ? symbolData.ask : symbolData.bid;
    const marginRequired = this.calculateMargin(
      price, 
      quantity, 
      account.leverage, 
      symbolData.lot_size
    );

    if (marginRequired > parseFloat(account.free_margin)) {
      return { 
        valid: false, 
        error: `Insufficient margin. Required: ₹${marginRequired.toFixed(2)}, Available: ₹${account.free_margin}` 
      };
    }

    return {
      valid: true,
      account,
      symbol: symbolData,
      price,
      marginRequired
    };
  }

  // Execute market order
  async executeMarketOrder(userId, accountId, symbol, type, quantity, stopLoss = 0, takeProfit = 0) {
    // Validate
    const validation = await this.validateTrade(accountId, symbol, quantity, type);
    
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const { account, symbol: symbolData, price, marginRequired } = validation;

    // Verify account belongs to user
    if (account.user_id !== userId) {
      throw new Error('Unauthorized');
    }

    // Calculate brokerage (0.03% for delivery, simplified)
    const contractValue = price * quantity * symbolData.lot_size;
    const brokerage = contractValue * 0.0003;

    // Create trade
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert([{
        user_id: userId,
        account_id: accountId,
        symbol: symbol.toUpperCase(),
        exchange: symbolData.exchange,
        trade_type: type,
        order_type: 'market',
        quantity: quantity,
        open_price: price,
        current_price: price,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        profit: 0,
        brokerage: brokerage,
        status: 'open',
        open_time: new Date().toISOString()
      }])
      .select()
      .single();

    if (tradeError) throw tradeError;

    // Update account
    const newMargin = parseFloat(account.margin) + marginRequired;
    const newFreeMargin = parseFloat(account.equity) - newMargin;

    await supabase
      .from('accounts')
      .update({
        margin: newMargin,
        free_margin: newFreeMargin
      })
      .eq('id', accountId);

    return trade;
  }

  // Close trade
  async closeTrade(userId, tradeId, closePrice = null) {
    // Get trade
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .eq('user_id', userId)
      .eq('status', 'open')
      .single();

    if (tradeError || !trade) {
      throw new Error('Trade not found or already closed');
    }

    // Get current price if not provided
    if (!closePrice) {
      const { data: symbolData } = await supabase
        .from('symbols')
        .select('bid, ask')
        .eq('symbol', trade.symbol)
        .single();

      closePrice = trade.trade_type === 'buy' ? symbolData.bid : symbolData.ask;
    }

    // Get symbol for lot size
    const { data: symbolData } = await supabase
      .from('symbols')
      .select('lot_size')
      .eq('symbol', trade.symbol)
      .single();

    // Calculate final P&L
    const pnl = this.calculatePnL(
      parseFloat(trade.open_price),
      closePrice,
      trade.quantity,
      trade.trade_type,
      symbolData?.lot_size || 1
    );

    const netPnl = pnl - parseFloat(trade.brokerage);

    // Update trade
    const { data: closedTrade, error: updateError } = await supabase
      .from('trades')
      .update({
        close_price: closePrice,
        profit: netPnl,
        status: 'closed',
        close_time: new Date().toISOString()
      })
      .eq('id', tradeId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update account
    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', trade.account_id)
      .single();

    // Calculate margin to release
    const marginToRelease = this.calculateMargin(
      parseFloat(trade.open_price),
      trade.quantity,
      account.leverage,
      symbolData?.lot_size || 1
    );

    const newBalance = parseFloat(account.balance) + netPnl;
    const newMargin = Math.max(0, parseFloat(account.margin) - marginToRelease);
    const newEquity = newBalance + parseFloat(account.profit) - netPnl;
    const newFreeMargin = newEquity - newMargin;

    // Update statistics
    const totalTrades = account.total_trades + 1;
    const winningTrades = netPnl > 0 ? account.winning_trades + 1 : account.winning_trades;
    const losingTrades = netPnl < 0 ? account.losing_trades + 1 : account.losing_trades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    await supabase
      .from('accounts')
      .update({
        balance: newBalance,
        margin: newMargin,
        equity: newEquity,
        free_margin: newFreeMargin,
        total_trades: totalTrades,
        winning_trades: winningTrades,
        losing_trades: losingTrades,
        total_profit: netPnl > 0 ? account.total_profit + netPnl : account.total_profit,
        total_loss: netPnl < 0 ? account.total_loss + Math.abs(netPnl) : account.total_loss,
        win_rate: winRate
      })
      .eq('id', trade.account_id);

    return closedTrade;
  }

  // Update open trades P&L
  async updateOpenTradesPnL(accountId) {
    const { data: trades } = await supabase
      .from('trades')
      .select('*, symbols:symbol(lot_size, bid, ask)')
      .eq('account_id', accountId)
      .eq('status', 'open');

    if (!trades || trades.length === 0) return { totalPnL: 0, trades: [] };

    let totalPnL = 0;

    for (const trade of trades) {
      const { data: symbolData } = await supabase
        .from('symbols')
        .select('bid, ask, lot_size')
        .eq('symbol', trade.symbol)
        .single();

      const currentPrice = trade.trade_type === 'buy' ? symbolData.bid : symbolData.ask;
      
      const pnl = this.calculatePnL(
        parseFloat(trade.open_price),
        currentPrice,
        trade.quantity,
        trade.trade_type,
        symbolData.lot_size
      );

      totalPnL += pnl;

      // Update trade current price and profit
      await supabase
        .from('trades')
        .update({
          current_price: currentPrice,
          profit: pnl - parseFloat(trade.brokerage)
        })
        .eq('id', trade.id);
    }

    return { totalPnL, trades };
  }

  // Modify trade (SL/TP)
  async modifyTrade(userId, tradeId, stopLoss, takeProfit) {
    const { data: trade, error } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .eq('user_id', userId)
      .eq('status', 'open')
      .single();

    if (error || !trade) {
      throw new Error('Trade not found');
    }

    const updates = {};
    if (stopLoss !== undefined) updates.stop_loss = stopLoss;
    if (takeProfit !== undefined) updates.take_profit = takeProfit;

    const { data: updatedTrade, error: updateError } = await supabase
      .from('trades')
      .update(updates)
      .eq('id', tradeId)
      .select()
      .single();

    if (updateError) throw updateError;

    return updatedTrade;
  }
}

module.exports = new TradingService();