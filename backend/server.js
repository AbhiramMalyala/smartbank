// server.js — SmartBank Backend
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const connectDB = require('./config/db');

const app = express();
connectDB();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Device-ID'],
  credentials: true,
}));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests. Please wait and try again.' },
}));
app.use('/api/auth/login',    rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { success: false, message: 'Too many login attempts. Wait 15 minutes.' } }));
app.use('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { success: false, message: 'Too many registrations from this IP.'     } }));

// ── Parsing ───────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// ── Serve Frontend static files ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ────────────────────────────────────────────────────────────────
// app.use('/api/auth',         require('./routes/auth'));
// app.use('/api/transactions', require('./routes/transactions'));
// app.use('/api/fraud',        require('./routes/fraud'));
// app.use('/api/user',         require('./routes/user'));
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/fraud',        require('./routes/fraud'));
app.use('/api/user',         require('./routes/user'));
app.use('/api/admin',        require('./routes/admin'));

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'SmartBank API is running',
    version: '2.0',
    fraudEngine: 'ACTIVE — 24 Rules',
    timestamp: new Date(),
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

// ── SPA Catch-all ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api'))
    return res.status(404).json({ success: false, message: 'API endpoint not found.' });
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('💥 Server Error:', err.stack);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log(`║  SmartBank Server → http://localhost:${PORT}  ║`);
  console.log('║  Fraud Detection Engine: ACTIVE 🛡    ║');
  console.log('║  24 Rules | Behavioral Profiling     ║');
  console.log('╚══════════════════════════════════════╝\n');
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('unhandledRejection', err => { console.error('Unhandled Rejection:', err); server.close(() => process.exit(1)); });
