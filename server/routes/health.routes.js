const express = require('express');
const router = express.Router();
const env = require('../config/env');

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    service: 'College Bus Management Platform API',
    supabaseConfigured: env.isConfigured
  });
});

module.exports = router;
