const express = require('express');
const router = express.Router();
const env = require('../config/env');

const healthHandler = (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    service: 'College Bus Management Platform API',
    supabaseConfigured: env.isConfigured
  });
};

// Both GET /api/health and GET /api return health status
router.get('/health', healthHandler);
router.get('/', healthHandler);

// Public runtime config endpoint: provides safe client-side keys for frontend
router.get('/config', (req, res) => {
  res.status(200).json({
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseAnonKey: env.SUPABASE_ANON_KEY || '',
    supabaseConfigured: env.isConfigured
  });
});

module.exports = router;
