// backend/src/websocket/socketHandler.js
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const kiteStreamService = require('../services/kiteStreamService');
const tradingService = require('../services/tradingService');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map();
    this.userSubscriptions = new Map();
    this.pnlUpdateInterval = null;
    // ✅ REMOVED: priceUpdateInterval — NO MORE SIMULATION

    this.initialize();
  }

  initialize() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        if (!token) return next(new Error('Authentication required'));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const { data: user, error } = await supabase
          .from('users')
          .select('id, email, first_name, last_name, role')
          .eq('id', decoded.id)
          .single();

        if (error || !user) return next(new Error('User not found'));

        socket.userId = user.id;
        socket.user = user;
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket) => this.handleConnection(socket));

    // ✅ ONLY P&L updates — NO price simulation
    this.startPnLUpdates();
  }

  handleConnection(socket) {
    console.log(`✅ WebSocket connected: ${socket.user.email}`);

    this.connectedUsers.set(socket.userId, socket);
    socket.join(`user:${socket.userId}`);

    socket.emit('connected', {
      message: 'Connected to Trade Axis',
      user: socket.user,
      timestamp: new Date().toISOString(),
    });

    socket.on('subscribe:symbols', (symbols) => this.handleSubscribeSymbols(socket, symbols));
    socket.on('unsubscribe:symbols', (symbols) => this.handleUnsubscribeSymbols(socket, symbols));
    socket.on('subscribe:account', (accountId) => this.handleSubscribeAccount(socket, accountId));
    socket.on('get:quote', (symbol) => this.handleGetQuote(socket, symbol));
    socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));

    socket.on('disconnect', () => this.handleDisconnect(socket));
    this.sendInitialData(socket);
  }

  async sendInitialData(socket) {
    try {
      const { data: accounts } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', socket.userId)
        .eq('is_active', true);

      socket.emit('accounts:update', accounts);

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
    if (!Array.isArray(symbols)) symbols = [symbols];

    const userSubs = this.userSubscriptions.get(socket.userId) || new Set();

    symbols.forEach((symbol) => {
      userSubs.add(String(symbol).toUpperCase());
      socket.join(`symbol:${String(symbol).toUpperCase()}`);
    });

    this.userSubscriptions.set(socket.userId, userSubs);

    socket.emit('subscribed', {
      symbols: Array.from(userSubs),
      message: `Subscribed to ${symbols.length} symbols`,
    });
  }

  handleUnsubscribeSymbols(socket, symbols) {
    if (!Array.isArray(symbols)) symbols = [symbols];

    const userSubs = this.userSubscriptions.get(socket.userId);

    if (userSubs) {
      symbols.forEach((symbol) => {
        userSubs.delete(String(symbol).toUpperCase());
        socket.leave(`symbol:${String(symbol).toUpperCase()}`);
      });
    }

    socket.emit('unsubscribed', { symbols });
  }

  handleSubscribeAccount(socket, accountId) {
    socket.join(`account:${accountId}`);
    socket.emit('account:subscribed', { accountId });
  }

  // ✅ FIXED: Read from DB or in-memory cache — NO simulation
  async handleGetQuote(socket, symbol) {
    try {
      const sym = String(symbol).toUpperCase();

      // Try in-memory Kite cache first (instant, real-time)
      const kitePrice = kiteStreamService.getLatestPrice(sym);
      if (kitePrice && kitePrice.last > 0) {
        socket.emit('quote', {
          symbol: sym,
          bid: kitePrice.bid,
          ask: kitePrice.ask,
          last: kitePrice.last,
          change: kitePrice.change,
          changePercent: kitePrice.changePercent,
          timestamp: kitePrice.timestamp,
          source: 'kite',
        });
        return;
      }

      // Fallback: read from DB (last known price)
      const { data, error } = await supabase
        .from('symbols')
        .select('symbol, bid, ask, last_price, change_value, change_percent')
        .eq('symbol', sym)
        .single();

      if (error || !data) {
        socket.emit('error', { message: 'Symbol not found' });
        return;
      }

      socket.emit('quote', {
        symbol: data.symbol,
        bid: Number(data.bid || data.last_price || 0),
        ask: Number(data.ask || data.last_price || 0),
        last: Number(data.last_price || 0),
        change: Number(data.change_value || 0),
        changePercent: Number(data.change_percent || 0),
        timestamp: Date.now(),
        source: 'db',
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  }

  handleDisconnect(socket) {
    console.log(`❌ WebSocket disconnected: ${socket.user.email}`);
    this.connectedUsers.delete(socket.userId);
    this.userSubscriptions.delete(socket.userId);
  }

  // ✅✅✅ REMOVED: startPriceUpdates() — NO SIMULATION AT ALL ✅✅✅

  // ✅ OPTIMIZED: P&L updates with batch DB reads + inline SL/TP checks
  startPnLUpdates() {
    this.pnlUpdateInterval = setInterval(async () => {
      try {
        // 1. Get ALL open trades in one query
        const { data: openTrades, error: tradesError } = await supabase
          .from('trades')
          .select('*, accounts!inner(user_id, balance, margin, leverage)')
          .eq('status', 'open');

        if (tradesError || !openTrades || openTrades.length === 0) return;

        // 2. Get ALL unique symbols needed
        const uniqueSymbols = [...new Set(openTrades.map((t) => t.symbol))];

        // 3. Try in-memory Kite prices first, then DB
        const priceMap = {};

        // From Kite in-memory cache (instant)
        const missingSymbols = [];
        for (const sym of uniqueSymbols) {
          const kitePrice = kiteStreamService.getLatestPrice(sym);
          if (kitePrice && kitePrice.last > 0) {
            priceMap[sym] = {
              bid: kitePrice.bid,
              ask: kitePrice.ask,
              last_price: kitePrice.last,
              lot_size: 1,
            };
          } else {
            missingSymbols.push(sym);
          }
        }

        // Fetch remaining from DB (one query)
        if (missingSymbols.length > 0) {
          const { data: dbPrices } = await supabase
            .from('symbols')
            .select('symbol, bid, ask, last_price, lot_size')
            .in('symbol', missingSymbols);

          if (dbPrices) {
            dbPrices.forEach((s) => {
              priceMap[s.symbol] = s;
            });
          }
        }

        // 4. Calculate all P&L in memory
        const tradeDbUpdates = []; // { id, current_price, profit }
        const accountPnL = {}; // accountId -> { totalPnL, userId }
        const userTradeUpdates = {}; // userId -> [tradeInfo]
        const slTpTriggers = []; // Trades that hit SL/TP

        for (const trade of openTrades) {
          const sp = priceMap[trade.symbol];
          if (!sp) continue;

          const currentPrice =
            trade.trade_type === 'buy'
              ? parseFloat(sp.bid || sp.last_price || 0)
              : parseFloat(sp.ask || sp.last_price || 0);

          if (currentPrice <= 0) continue;

          const direction = trade.trade_type === 'buy' ? 1 : -1;
          const openPrice = parseFloat(trade.open_price || 0);
          const quantity = parseFloat(trade.quantity || 0);
          const lotSize = parseFloat(sp.lot_size || 1);
          const brokerage = parseFloat(trade.brokerage || 0);

          const priceDiff = (currentPrice - openPrice) * direction;
          const grossPnL = priceDiff * quantity * lotSize;
          const netPnL = grossPnL - brokerage;

          tradeDbUpdates.push({ id: trade.id, current_price: currentPrice, profit: netPnL });

          // Track per-account
          const accId = trade.account_id;
          if (!accountPnL[accId]) {
            accountPnL[accId] = { totalPnL: 0, userId: trade.accounts.user_id };
          }
          accountPnL[accId].totalPnL += netPnL;

          // Track per-user for WebSocket
          const userId = trade.accounts.user_id;
          if (!userTradeUpdates[userId]) userTradeUpdates[userId] = [];
          userTradeUpdates[userId].push({
            tradeId: trade.id,
            symbol: trade.symbol,
            tradeType: trade.trade_type,
            openPrice,
            currentPrice,
            quantity,
            profit: netPnL,
            timestamp: Date.now(),
          });

          // ✅ Check SL/TP inline (we already have the price)
          const sl = parseFloat(trade.stop_loss || 0);
          const tp = parseFloat(trade.take_profit || 0);
          let shouldClose = false;
          let closeReason = '';

          if (sl > 0) {
            if (trade.trade_type === 'buy' && currentPrice <= sl) {
              shouldClose = true;
              closeReason = 'Stop Loss';
            } else if (trade.trade_type === 'sell' && currentPrice >= sl) {
              shouldClose = true;
              closeReason = 'Stop Loss';
            }
          }
          if (!shouldClose && tp > 0) {
            if (trade.trade_type === 'buy' && currentPrice >= tp) {
              shouldClose = true;
              closeReason = 'Take Profit';
            } else if (trade.trade_type === 'sell' && currentPrice <= tp) {
              shouldClose = true;
              closeReason = 'Take Profit';
            }
          }

          if (shouldClose) {
            slTpTriggers.push({ trade, reason: closeReason });
          }
        }

        // 5. Batch update trades in DB (parallel)
        if (tradeDbUpdates.length > 0) {
          const BATCH = 50;
          for (let i = 0; i < tradeDbUpdates.length; i += BATCH) {
            const batch = tradeDbUpdates.slice(i, i + BATCH);
            await Promise.allSettled(
              batch.map((u) =>
                supabase
                  .from('trades')
                  .update({ current_price: u.current_price, profit: u.profit })
                  .eq('id', u.id)
              )
            );
          }
        }

        // 6. Update accounts (parallel)
        const accountIds = Object.keys(accountPnL);
        if (accountIds.length > 0) {
          const { data: accounts } = await supabase
            .from('accounts')
            .select('*')
            .in('id', accountIds);

          if (accounts) {
            await Promise.allSettled(
              accounts.map((account) => {
                const pnl = accountPnL[account.id];
                if (!pnl) return Promise.resolve();

                const balance = parseFloat(account.balance || 0);
                const margin = parseFloat(account.margin || 0);
                const equity = balance + pnl.totalPnL;
                const freeMargin = equity - margin;

                // Emit account update
                this.io.to(`account:${account.id}`).emit('account:update', {
                  accountId: account.id,
                  balance,
                  equity,
                  profit: pnl.totalPnL,
                  freeMargin,
                  margin,
                  timestamp: Date.now(),
                });

                this.io.to(`user:${pnl.userId}`).emit('account:update', {
                  accountId: account.id,
                  balance,
                  equity,
                  profit: pnl.totalPnL,
                  freeMargin,
                  margin,
                  timestamp: Date.now(),
                });

                return supabase
                  .from('accounts')
                  .update({ profit: pnl.totalPnL, equity, free_margin: freeMargin })
                  .eq('id', account.id);
              })
            );
          }
        }

        // 7. Emit trade P&L to users
        for (const [userId, trades] of Object.entries(userTradeUpdates)) {
          this.io.to(`user:${userId}`).emit('trades:pnl:batch', {
            trades,
            timestamp: Date.now(),
          });
        }

        // 8. Process SL/TP triggers
        for (const { trade, reason } of slTpTriggers) {
          try {
            const result = await tradingService.closePosition(trade);
            if (result.success) {
              console.log(`✅ ${reason} triggered for trade #${trade.id}`);
              this.io.to(`user:${trade.accounts.user_id}`).emit('trade:closed', {
                tradeId: trade.id,
                reason,
                profit: result.trade?.profit,
                timestamp: Date.now(),
              });
            }
          } catch (e) {
            console.error(`SL/TP close error for trade #${trade.id}:`, e.message);
          }
        }
      } catch (error) {
        console.error('P&L update error:', error.message);
      }
    }, 2000);

    console.log('💹 P&L updates started (2s interval) — NO simulation');
  }

  stop() {
    if (this.pnlUpdateInterval) clearInterval(this.pnlUpdateInterval);
    console.log('WebSocket intervals stopped');
  }
}

module.exports = SocketHandler;