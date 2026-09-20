/**
 * COLLEGE BUS MANAGEMENT PLATFORM - ROUTE GUARDS
 * Enforces client-side navigation protection backed by server verification
 */

const Guards = {
  /**
   * Protect Admin Dashboard:
   * Requires authenticated session, role = 'admin', isActive = true
   */
  async protectAdminPage() {
    const profile = await window.Auth.getVerifiedProfile();

    if (!profile) {
      window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
      return null;
    }

    if (profile.role !== 'admin') {
      window.location.href = 'unauthorized.html?reason=admin_required';
      return null;
    }

    if (!profile.isActive) {
      window.location.href = 'unauthorized.html?reason=account_inactive';
      return null;
    }

    return profile;
  },

  /**
   * Protect Staff Dashboard:
   * Requires authenticated session, role = 'staff', approval_status = 'approved', isActive = true
   */
  async protectStaffPage() {
    const profile = await window.Auth.getVerifiedProfile();

    if (!profile) {
      window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
      return null;
    }

    if (profile.role !== 'staff') {
      // If admin visits staff dashboard, let them through or redirect
      if (profile.role === 'admin') {
        window.location.href = 'admin-dashboard.html';
        return null;
      }
      window.location.href = 'unauthorized.html?reason=staff_required';
      return null;
    }

    if (!profile.isActive) {
      window.location.href = 'unauthorized.html?reason=account_inactive';
      return null;
    }

    if (profile.approvalStatus === 'pending') {
      window.location.href = 'unauthorized.html?reason=pending';
      return null;
    }

    if (profile.approvalStatus === 'rejected') {
      window.location.href = 'unauthorized.html?reason=rejected';
      return null;
    }

    if (profile.approvalStatus !== 'approved') {
      window.location.href = 'unauthorized.html?reason=unapproved';
      return null;
    }

    return profile;
  },

  /**
   * Used on Login and Register pages:
   * If user already has an active session, forward them to their designated dashboard
   */
  async redirectIfAuthenticated() {
    const profile = await window.Auth.getVerifiedProfile();
    if (!profile) return;

    if (profile.role === 'admin' && profile.isActive) {
      window.location.href = 'admin-dashboard.html';
    } else if (profile.role === 'staff' && profile.approvalStatus === 'approved' && profile.isActive) {
      window.location.href = 'staff-dashboard.html';
    }
  }
};

window.Guards = Guards;
