const express = require('express');
const cors = require('cors');
const path = require('path');
const env = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const staffRoutes = require('./routes/staff.routes');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

const app = express();

// Security & Parsing Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files from /client
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

// API Routes
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/staff', staffRoutes);

// Fallback to serve index.html for root or handle 404s for API
app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// 404 Handler for API
app.use('/api/*', notFoundHandler);

// Centralized Error Handler
app.use(errorHandler);

// Start Server
const server = app.listen(env.PORT, () => {
  console.log('================================================================');
  console.log(`  COLLEGE BUS MANAGEMENT PLATFORM - PRODUCTION SERVER (PHASE 4)`);
  console.log(`  Running on: http://localhost:${env.PORT}`);
  console.log(`  Health API: http://localhost:${env.PORT}/api/health`);
  console.log(`  Supabase:   ${env.isConfigured ? 'CONNECTED' : 'WAITING FOR CREDENTIALS IN .env'}`);
  console.log('================================================================');
});

module.exports = app;
