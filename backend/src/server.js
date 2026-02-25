const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

// Imports
const { supabase, testConnection } = require('./config/supabase');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const marketRoutes = require('./routes/market');
const tradingRoutes = require('./routes/trading');
const SocketHandler = require('./websocket/socketHandler');

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'development' ? '*' : 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Initialize WebSocket handler
const socketHandler = new SocketHandler(io);

// Make io accessible to routes
app.set('io', io);
app.set('socketHandler', socketHandler);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'development' ? '*' : 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(compression());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/trading', tradingRoutes);

// Health check
app.get('/health', async (req, res) => {
  const dbConnected = await testConnection();
  res.json({
    success: true,
    message: 'Trade Axis API',
    database: dbConnected ? 'connected' : 'disconnected',
    websocket: 'active',
    connectedClients: io.engine.clientsCount,
    timestamp: new Date().toISOString()
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Trade Axis API v1.0',
    websocket: {
      url: `ws://localhost:${process.env.PORT || 5000}`,
      events: {
        subscribe: 'subscribe:symbols, subscribe:account',
        receive: 'price:update, trade:pnl, account:update'
      }
    },
    endpoints: {
      auth: '/api/auth',
      accounts: '/api/accounts',
      transactions: '/api/transactions',
      market: '/api/market',
      trading: '/api/trading'
    }
  });
});

// 404
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Server error' });
});

// Start
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('❌ Database connection failed');
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log('');
    console.log('🚀 ══════════════════════════════════════════════════════════');
    console.log('   TRADE AXIS SERVER - Phase 6 (WebSocket)');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`   📍 HTTP Server: http://localhost:${PORT}`);
    console.log(`   ⚡ WebSocket: ws://localhost:${PORT}`);
    console.log('══════════════════════════════════════════════════════════════');
    console.log('   🔌 WEBSOCKET EVENTS:');
    console.log('      • subscribe:symbols - Subscribe to price updates');
    console.log('      • subscribe:account - Subscribe to account updates');
    console.log('      • price:update - Real-time price feed');
    console.log('      • trade:pnl - Live P&L updates');
    console.log('      • account:update - Balance updates');
    console.log('      • trade:notification - Trade alerts');
    console.log('══════════════════════════════════════════════════════════════');
    console.log('');
  });
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  socketHandler.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

startServer();