const authService = require('../services/auth.service');

/**
 * Handle staff registration request
 */
async function handleRegister(req, res, next) {
  try {
    const { fullName, email, password, confirmPassword } = req.body;

    const user = await authService.registerStaff({
      fullName,
      email,
      password,
      confirmPassword
    });

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Your Staff account has been created and is waiting for Admin approval.',
      user
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handle GET /api/auth/me to fetch authenticated profile
 */
async function handleGetMe(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      user: req.profile
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleRegister,
  handleGetMe
};
