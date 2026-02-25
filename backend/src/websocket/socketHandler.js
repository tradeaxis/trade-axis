const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const marketDataService = require('../services/marketDataService');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> socket
    this.userSubscriptions = new Map(); // userId -> [symbols]
    this.priceUpdateInterval = null;
    this.pnlUpdateInterval = null;

    this.initialize();
  }

  initialize() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const { data: user, error } = await supabase
          .from('users')
          .select('id, email, first_name, last_name, role')
          .eq('id', decoded.id)
          .single();

        if (error || !user) {
          return next(new Error('User not found'));
        }

        socket.userId = user.id;
        socket.user = user;
        next();

      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket) => this.handleConnection(socket));

    // Start background updates
    this.startPriceUpdates();
    this.startPnLUpdates();
  }

  handleConnection(socket) {
    console.log(`✅ WebSocket connected: ${socket.user.email}`);

    // Store connected user
    this.connectedUsers.set(socket.userId, socket);

    // Join user's private room
    socket.join(`user:${socket.userId}`);

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to Trade Axis',
      user: socket.user,
      timestamp: new Date().toISOString()
    });

    // Event handlers
    socket.on('subscribe:symbols', (symbols) => this.handleSubscribeSymbols(socket, symbols));
    socket.on('unsubscribe:symbols', (symbols) => this.handleUnsubscribeSymbols(socket, symbols));
    socket.on('subscribe:account', (accountId) => this.handleSubscribeAccount(socket, accountId));
    socket.on('get:quote', (symbol) => this.handleGetQuote(socket, symbol));
    socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));
    
    socket.on('disconnect', () => this.handleDisconnect(socket));

    // Send initial data
    this.sendInitialData(socket);
  }

  async sendInitialData(socket) {
    try {
      // Get user's accounts
      const { data: accounts } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', socket.userId)
        .eq('is_active', true);

      socket.emit('accounts:update', accounts);

      // Get open trades
      const { data: trades } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', socket.userId)
        .eq('status', 'open');

      socket.emit('trades:update', trades || []);

    } catch (error) {
      console.error('Error sending initial data:', error);
    }
  }

  handleSubscribeSymbols(socket, symbols) {
    if (!Array.isArray(symbols)) {
      symbols = [symbols];
    }

    const userSubs = this.userSubscriptions.get(socket.userId) || new Set();
    
    symbols.forEach(symbol => {
      userSubs.add(symbol.toUpperCase());
      socket.join(`symbol:${symbol.toUpperCase()}`);
    });

    this.userSubscriptions.set(socket.userId, userSubs);

    socket.emit('subscribed', {
      symbols: Array.from(userSubs),
      message: `Subscribed to ${symbols.length} symbols`
    });

    console.log(`📊 ${socket.user.email} subscribed to: ${symbols.join(', ')}`);
  }

  handleUnsubscribeSymbols(socket, symbols) {
    if (!Array.isArray(symbols)) {
      symbols = [symbols];
    }

    const userSubs = this.userSubscriptions.get(socket.userId);
    
    if (userSubs) {
      symbols.forEach(symbol => {
        userSubs.delete(symbol.toUpperCase());
        socket.leave(`symbol:${symbol.toUpperCase()}`);
      });
    }

    socket.emit('unsubscribed', { symbols });
  }

  handleSubscribeAccount(socket, accountId) {
    socket.join(`account:${accountId}`);
    socket.emit('account:subscribed', { accountId });
    console.log(`💰 ${socket.user.email} subscribed to account: ${accountId}`);
  }

  async handleGetQuote(socket, symbol) {
    try {
      const quote = await marketDataService.getQuote(symbol);
      socket.emit('quote', quote);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  }

  handleDisconnect(socket) {
    console.log(`❌ WebSocket disconnected: ${socket.user.email}`);
    this.connectedUsers.delete(socket.userId);
    this.userSubscriptions.delete(socket.userId);
  }

  // Broadcast price updates every 1 second
  startPriceUpdates() {
    this.priceUpdateInterval = setInterval(async () => {
      try {
        // Get all active symbols
        const { data: symbols } = await supabase
          .from('symbols')
          .select('*')
          .eq('is_active', true);

        if (!symbols) return;

        // Update prices and broadcast
        for (const symbol of symbols) {
          const quote = marketDataService.simulatePriceMovement(symbol);

          // Update database
          await supabase
            .from('symbols')
            .update({
              last_price: quote.lastPrice,
              bid: quote.bid,
              ask: quote.ask,
              change_value: quote.change,
              change_percent: quote.changePercent,
              last_update: new Date().toISOString()
            })
            .eq('id', symbol.id);

          // Broadcast to subscribers
          this.io.to(`symbol:${symbol.symbol}`).emit('price:update', {
            symbol: symbol.symbol,
            bid: quote.bid,
            ask: quote.ask,
            last: quote.lastPrice,
            change: quote.change,
            changePercent: quote.changePercent,
            timestamp: Date.now()
          });
        }

      } catch (error) {
        console.error('Price update error:', error.message);
      }
    }, 1000); // Update every second

    console.log('📈 Price updates started (1s interval)');
  }

  // Update P&L for open trades every 2 seconds
  startPnLUpdates() {
    this.pnlUpdateInterval = setInterval(async () => {
      try {
        // Get all users with open trades
        const { data: openTrades } = await supabase
          .from('trades')
          .select('*, accounts!inner(user_id)')
          .eq('status', 'open');

        if (!openTrades || openTrades.length === 0) return;

        // Group by user
        const tradesByUser = {};
        openTrades.forEach(trade => {
          const userId = trade.accounts.user_id;
          if (!tradesByUser[userId]) {
            tradesByUser[userId] = [];
          }
          tradesByUser[userId].push(trade);
        });

        // Update each user's trades
        for (const [userId, trades] of Object.entries(tradesByUser)) {
          let totalPnL = 0;

          for (const trade of trades) {
            // Get current price
            const { data: symbolData } = await supabase
              .from('symbols')
              .select('bid, ask, lot_size')
              .eq('symbol', trade.symbol)
              .single();

            if (!symbolData) continue;

            const currentPrice = trade.trade_type === 'buy' ? symbolData.bid : symbolData.ask;
            
            // Calculate P&L
            const direction = trade.trade_type === 'buy' ? 1 : -1;
            const priceDiff = (currentPrice - parseFloat(trade.open_price)) * direction;
            const pnl = priceDiff * trade.quantity * (symbolData.lot_size || 1);
            const netPnl = pnl - parseFloat(trade.brokerage || 0);

            totalPnL += netPnl;

            // Update trade in database
            await supabase
              .from('trades')
              .update({
                current_price: currentPrice,
                profit: netPnl
              })
              .eq('id', trade.id);

            // Send update to user
            this.io.to(`user:${userId}`).emit('trade:pnl', {
              tradeId: trade.id,
              symbol: trade.symbol,
              currentPrice,
              profit: netPnl.toFixed(2),
              timestamp: Date.now()
            });
          }

          // Update account equity
          const accountIds = [...new Set(trades.map(t => t.account_id))];
          
          for (const accountId of accountIds) {
            const { data: account } = await supabase
              .from('accounts')
              .select('*')
              .eq('id', accountId)
              .single();

            if (account) {
              const accountTrades = trades.filter(t => t.account_id === accountId);
              const accountPnL = accountTrades.reduce((sum, t) => {
                const direction = t.trade_type === 'buy' ? 1 : -1;
                const { data: sym } = supabase.from('symbols').select('bid, ask').eq('symbol', t.symbol).single();
                return sum + parseFloat(t.profit || 0);
              }, 0);

              const newEquity = parseFloat(account.balance) + accountPnL;
              const newFreeMargin = newEquity - parseFloat(account.margin);

              await supabase
                .from('accounts')
                .update({
                  profit: accountPnL,
                  equity: newEquity,
                  free_margin: newFreeMargin
                })
                .eq('id', accountId);

              // Broadcast account update
              this.io.to(`account:${accountId}`).emit('account:update', {
                accountId,
                balance: account.balance,
                equity: newEquity.toFixed(2),
                profit: accountPnL.toFixed(2),
                freeMargin: newFreeMargin.toFixed(2),
                timestamp: Date.now()
              });
            }
          }
        }

      } catch (error) {
        console.error('P&L update error:', error.message);
      }
    }, 2000); // Update every 2 seconds

    console.log('💹 P&L updates started (2s interval)');
  }

  // Broadcast trade notification
  broadcastTradeNotification(userId, type, trade) {
    this.io.to(`user:${userId}`).emit('trade:notification', {
      type, // 'opened', 'closed', 'modified'
      trade,
      timestamp: Date.now()
    });
  }

  // Broadcast transaction notification
  broadcastTransactionNotification(userId, transaction) {
    this.io.to(`user:${userId}`).emit('transaction:notification', {
      transaction,
      timestamp: Date.now()
    });
  }

  // Stop all intervals
  stop() {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
    }
    if (this.pnlUpdateInterval) {
      clearInterval(this.pnlUpdateInterval);
    }
    console.log('WebSocket intervals stopped');
  }
}

module.exports = SocketHandler;