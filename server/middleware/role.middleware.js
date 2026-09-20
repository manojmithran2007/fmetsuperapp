/**
 * Role-based and Approval-based Authorization Middlewares
 */

function requireAdmin(req, res, next) {
  if (!req.profile) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.'
    });
  }

  if (req.profile.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Administrator privileges required.'
    });
  }

  if (!req.profile.isActive) {
    return res.status(403).json({
      success: false,
      error: 'Administrator account is deactivated.'
    });
  }

  next();
}

function requireApprovedStaff(req, res, next) {
  if (!req.profile) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.'
    });
  }

  if (req.profile.role !== 'staff') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Staff privileges required.'
    });
  }

  if (!req.profile.isActive) {
    return res.status(403).json({
      success: false,
      error: 'Your account has been deactivated.'
    });
  }

  if (req.profile.approvalStatus === 'pending') {
    return res.status(403).json({
      success: false,
      approvalStatus: 'pending',
      error: 'Your staff account is waiting for Admin approval.'
    });
  }

  if (req.profile.approvalStatus === 'rejected') {
    return res.status(403).json({
      success: false,
      approvalStatus: 'rejected',
      error: 'Your staff account has not been approved.'
    });
  }

  if (req.profile.approvalStatus !== 'approved') {
    return res.status(403).json({
      success: false,
      error: 'Staff account has not been approved.'
    });
  }

  next();
}

module.exports = {
  requireAdmin,
  requireApprovedStaff
};
