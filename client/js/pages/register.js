/**
 * Staff Registration Controller (register.html)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Check if user is already authenticated
  await window.Guards.redirectIfAuthenticated();

  // Setup password toggles
  window.Ui.initPasswordToggle('toggle-password-btn', 'password-input');
  window.Ui.initPasswordToggle('toggle-confirm-password-btn', 'confirm-password-input');

  const registerForm = document.getElementById('register-form');
  const submitBtn = document.getElementById('register-submit-btn');
  const alertContainerId = 'register-alert';
  const successContainerId = 'register-success';

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    window.Ui.hideAlert(alertContainerId);

    const fullNameInput = document.getElementById('fullname-input');
    const emailInput = document.getElementById('email-input');
    const passwordInput = document.getElementById('password-input');
    const confirmPasswordInput = document.getElementById('confirm-password-input');

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Client-side quick validations
    if (!fullName) {
      window.Ui.showAlert(alertContainerId, 'Please enter your Full Name.', 'error');
      fullNameInput.focus();
      return;
    }

    if (!email) {
      window.Ui.showAlert(alertContainerId, 'Please enter your Email address.', 'error');
      emailInput.focus();
      return;
    }

    if (!password || password.length < 8) {
      window.Ui.showAlert(alertContainerId, 'Password must be at least 8 characters long.', 'error');
      passwordInput.focus();
      return;
    }

    if (password !== confirmPassword) {
      window.Ui.showAlert(alertContainerId, 'Passwords do not match. Please re-enter.', 'error');
      confirmPasswordInput.focus();
      return;
    }

    window.Ui.setButtonLoading(submitBtn, true, 'Creating Account...');

    try {
      const response = await window.Api.registerStaff({
        fullName,
        email,
        password,
        confirmPassword
      });

      // Successful registration: Show clear waiting message
      registerForm.style.display = 'none';
      const successEl = document.getElementById(successContainerId);
      if (successEl) {
        successEl.style.display = 'block';
        successEl.innerHTML = `
          <div class="alert alert-success" style="flex-direction: column; align-items: center; text-align: center; padding: var(--spacing-6);">
            <div style="font-size: 2.5rem; margin-bottom: var(--spacing-3);">⏳</div>
            <h3 style="font-size: var(--font-size-xl); margin-bottom: var(--spacing-2); color: var(--color-success-dark);">Registration Successful!</h3>
            <p style="margin-bottom: var(--spacing-4); color: var(--color-success-dark); font-size: var(--font-size-sm); line-height: var(--line-height-normal);">
              Your Staff account (<strong>${escapeHtml(response.user?.email || email)}</strong>) has been created and is <strong>waiting for Admin approval</strong>.
            </p>
            <p style="margin-bottom: var(--spacing-6); font-size: var(--font-size-xs); color: var(--color-neutral-600);">
              You will be able to log in to the bus operations dashboard once the College Administrator approves your profile.
            </p>
            <a href="login.html" class="btn btn-primary btn-block">Go to Login Page</a>
          </div>
        `;
      }
    } catch (err) {
      console.error('Registration failed:', err);
      window.Ui.showAlert(alertContainerId, err.message || 'Registration failed. Please try again.', 'error');
    } finally {
      window.Ui.setButtonLoading(submitBtn, false);
    }
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
