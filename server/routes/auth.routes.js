const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireAdmin, requireApprovedStaff } = require('../middleware/role.middleware');

// Public route: Staff registration
router.post('/register', authController.handleRegister);

// Protected route: Current authenticated user profile
router.get('/me', requireAuth, authController.handleGetMe);

module.exports = router;
