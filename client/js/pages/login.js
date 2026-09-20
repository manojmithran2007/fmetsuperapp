/**
 * Login Page Controller (login.html)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Check if user is already authenticated
  await window.Guards.redirectIfAuthenticated();

  // Setup password toggle
  window.Ui.initPasswordToggle('toggle-password-btn', 'password-input');

  const loginForm = document.getElementById('login-form');
  const submitBtn = document.getElementById('login-submit-btn');
  const alertContainerId = 'login-alert';

  // Check URL query params for reasons (e.g. session expired or redirected)
  const urlParams = new URLSearchParams(window.location.search);
  const reason = urlParams.get('reason');
  if (reason === 'pending') {
    window.Ui.showAlert(alertContainerId, 'Your staff account is waiting for Admin approval.', 'warning');
  } else if (reason === 'rejected') {
    window.Ui.showAlert(alertContainerId, 'Your staff account has not been approved.', 'error');
  } else if (reason === 'admin_required') {
    window.Ui.showAlert(alertContainerId, 'Access denied. Administrator privileges required.', 'error');
  } else if (reason === 'session_expired') {
    window.Ui.showAlert(alertContainerId, 'Your session has expired. Please sign in again.', 'warning');
  }

  // Handle Form Submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    window.Ui.hideAlert(alertContainerId);

    const emailInput = document.getElementById('email-input');
    const passwordInput = document.getElementById('password-input');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      window.Ui.showAlert(alertContainerId, 'Please enter both your email and password.', 'error');
      return;
    }

    window.Ui.setButtonLoading(submitBtn, true, 'Signing In...');

    try {
      // 1. Authenticate with Supabase Auth and fetch verified profile from backend
      const result = await window.Auth.login(email, password);
      const profile = result.profile;

      if (!profile) {
        throw new Error('User profile record could not be retrieved from the server.');
      }

      // 2. Enforce Role & Approval rules strictly
      if (profile.role === 'admin') {
        if (!profile.isActive) {
          await window.Auth.logout();
          window.Ui.showAlert(alertContainerId, 'Administrator account has been deactivated.', 'error');
          return;
        }
        // Admin Access Granted
        window.location.href = 'admin-dashboard.html';
        return;
      }

      if (profile.role === 'staff') {
        if (!profile.isActive) {
          await window.Auth.logout();
          window.Ui.showAlert(alertContainerId, 'Your account has been deactivated.', 'error');
          return;
        }

        if (profile.approvalStatus === 'pending') {
          await window.Auth.logout();
          window.Ui.showAlert(alertContainerId, 'Your staff account is waiting for Admin approval.', 'warning');
          return;
        }

        if (profile.approvalStatus === 'rejected') {
          await window.Auth.logout();
          window.Ui.showAlert(alertContainerId, 'Your staff account has not been approved.', 'error');
          return;
        }

        if (profile.approvalStatus === 'approved') {
          // Approved Staff Access Granted
          window.location.href = 'staff-dashboard.html';
          return;
        }
      }

      // Unrecognized role or state
      await window.Auth.logout();
      window.Ui.showAlert(alertContainerId, 'Access denied. Unrecognized user role.', 'error');
    } catch (err) {
      console.error('Login failed:', err);
      // Generic safe error message to not reveal account existence
      const msg = err.message.includes('Invalid login credentials')
        ? 'Invalid email or password. Please try again.'
        : err.message;
      window.Ui.showAlert(alertContainerId, msg, 'error');
    } finally {
      window.Ui.setButtonLoading(submitBtn, false);
    }
  });
});
