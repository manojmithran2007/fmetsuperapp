const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireAdmin, requireApprovedStaff } = require('../middleware/role.middleware');

// Public route: Staff registration
router.post('/register', authController.handleRegister);

// Protected route: Current authenticated user profile
router.get('/me', requireAuth, authController.handleGetMe);

// Verification test endpoints for Phase 1 authorization verification
router.get('/admin-check', requireAuth, requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: 'Authorized as Administrator',
    profile: req.profile
  });
});

router.get('/staff-check', requireAuth, requireApprovedStaff, (req, res) => {
  res.json({
    success: true,
    message: 'Authorized as Approved Staff',
    profile: req.profile
  });
});

module.exports = router;
