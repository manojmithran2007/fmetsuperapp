const { supabaseAdmin, isConfigured } = require('../config/supabase');

/**
 * Authentication Middleware:
 * Verifies Supabase JWT token from Authorization header,
 * retrieves the corresponding application profile (admin or staff),
 * and attaches both req.user and req.profile.
 */
async function requireAuth(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: 'Backend is waiting for Supabase credentials in .env. Please configure them.'
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication token is required.'
      });
    }

    const token = authHeader.split(' ')[1].trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token.'
      });
    }

    // Verify token with Supabase Auth
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !userData?.user) {
      return res.status(401).json({
        success: false,
        error: 'Session expired or invalid token. Please log in again.'
      });
    }

    const authUser = userData.user;

    // Check if user is an Admin
    const { data: adminProfile, error: adminErr } = await supabaseAdmin
      .from('admin_profiles')
      .select('id, full_name, email, role, is_active, created_at')
      .eq('id', authUser.id)
      .maybeSingle();

    if (adminProfile) {
      req.user = authUser;
      req.profile = {
        id: adminProfile.id,
        fullName: adminProfile.full_name,
        email: adminProfile.email,
        role: 'admin',
        isActive: adminProfile.is_active,
        approvalStatus: 'approved' // Admins are always implicitly approved
      };
      return next();
    }

    // Check if user is a Staff member
    const { data: staffProfile, error: staffErr } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, full_name, email, role, approval_status, is_active, approved_at, approved_by, created_at')
      .eq('id', authUser.id)
      .maybeSingle();

    if (staffProfile) {
      req.user = authUser;
      req.profile = {
        id: staffProfile.id,
        fullName: staffProfile.full_name,
        email: staffProfile.email,
        role: 'staff',
        approvalStatus: staffProfile.approval_status,
        isActive: staffProfile.is_active,
        approvedAt: staffProfile.approved_at,
        approvedBy: staffProfile.approved_by
      };
      return next();
    }

    // User authenticated in Auth, but has no application profile
    return res.status(403).json({
      success: false,
      error: 'User profile not found in system records.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requireAuth
};
