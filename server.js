require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { setupWebSocket } = require('./utils/websocket');

const authRoutes = require('./routes/auth');
const portfolioRoutes = require('./routes/portfolios');
const simulateRoutes = require('./routes/simulate');
const aiRoutes = require('./routes/ai');

// ─── App setup ───────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

// ─── Security middleware ──────────────────────────────────────────────────────

app.use(helmet());

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Global rate limiter
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Tighter rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Please wait 15 minutes.' },
});

app.use(limiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Nivesh API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/simulate', simulateRoutes);
app.use('/api/ai', aiRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// Global error handler
app.use(errorHandler);

// ─── WebSocket ────────────────────────────────────────────────────────────────

setupWebSocket(server);

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Nivesh backend running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   WebSocket:    ws://localhost:${PORT}/ws\n`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection:', err.message);
  server.close(() => process.exit(1));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

module.exports = { app, server };
