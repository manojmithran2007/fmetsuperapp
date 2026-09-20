/**
 * Validation utilities for incoming authentication payloads
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistrationInput(data) {
  const errors = [];
  const { fullName, email, password, confirmPassword } = data || {};

  // Full Name validation
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
    errors.push('Full Name is required.');
  } else if (fullName.trim().length < 2) {
    errors.push('Full Name must be at least 2 characters.');
  } else if (fullName.trim().length > 100) {
    errors.push('Full Name must not exceed 100 characters.');
  }

  // Email validation
  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.push('Email is required.');
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.push('Please enter a valid email address.');
  }

  // Password validation
  if (!password || typeof password !== 'string') {
    errors.push('Password is required.');
  } else if (password.length < 8) {
    errors.push('Password must be at least 8 characters.');
  }

  // Confirm Password validation
  if (!confirmPassword || typeof confirmPassword !== 'string') {
    errors.push('Password confirmation is required.');
  } else if (password !== confirmPassword) {
    errors.push('Passwords do not match.');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateRegistrationInput
};
