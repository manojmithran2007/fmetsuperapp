const { supabaseAdmin, isConfigured } = require('../config/supabase');
const { logAuditEvent } = require('./audit.controller');

/**
 * Fetch staff profiles list with filter options and status counts
 * GET /api/admin/staff?status=all|pending|approved|rejected
 */
async function handleGetStaffList(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: 'Backend is waiting for Supabase credentials in .env.'
      });
    }

    const { status } = req.query;

    // Build query for staff list
    let query = supabaseAdmin
      .from('staff_profiles')
      .select('id, full_name, email, role, approval_status, is_active, approved_at, approved_by, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (status && ['pending', 'approved', 'rejected'].includes(status.toLowerCase())) {
      query = query.eq('approval_status', status.toLowerCase());
    }

    const { data: staffList, error: staffErr } = await query;

    if (staffErr) {
      const error = new Error('Failed to fetch staff directory: ' + staffErr.message);
      error.status = 500;
      throw error;
    }

    // Fetch counts across all statuses for dashboard badge counters
    const { data: allStaff, error: countErr } = await supabaseAdmin
      .from('staff_profiles')
      .select('approval_status');

    const counts = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    if (allStaff) {
      counts.total = allStaff.length;
      allStaff.forEach(s => {
        if (counts[s.approval_status] !== undefined) {
          counts[s.approval_status]++;
        }
      });
    }

    return res.status(200).json({
      success: true,
      filter: status || 'all',
      counts,
      staff: staffList || []
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Approve a pending/rejected staff account
 * POST /api/admin/staff/:id/approve
 */
async function handleApproveStaff(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: 'Backend is waiting for Supabase credentials in .env.'
      });
    }

    const staffId = req.params.id;
    const adminId = req.profile.id;

    if (!staffId) {
      return res.status(400).json({
        success: false,
        error: 'Staff user ID is required.'
      });
    }

    // Verify staff record exists
    const { data: existingStaff, error: fetchErr } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, full_name, email, approval_status')
      .eq('id', staffId)
      .maybeSingle();

    if (fetchErr || !existingStaff) {
      return res.status(404).json({
        success: false,
        error: 'Staff profile record not found.'
      });
    }

    const currentTimestamp = new Date().toISOString();

    // Perform database update
    const { data: updatedStaff, error: updateErr } = await supabaseAdmin
      .from('staff_profiles')
      .update({
        approval_status: 'approved',
        approved_at: currentTimestamp,
        approved_by: adminId
      })
      .eq('id', staffId)
      .select('id, full_name, email, role, approval_status, is_active, approved_at, approved_by, created_at, updated_at')
      .single();

    if (updateErr) {
      console.error('Failed to approve staff profile:', updateErr);
      const error = new Error('Failed to update staff approval status: ' + updateErr.message);
      error.status = 500;
      throw error;
    }

    logAuditEvent({
      action: 'staff_approved',
      performedBy: adminId,
      performedByName: req.profile?.fullName,
      entityType: 'staff',
      entityId: staffId,
      details: { name: updatedStaff.full_name, email: updatedStaff.email }
    });

    return res.status(200).json({
      success: true,
      message: `Staff member "${updatedStaff.full_name}" has been successfully approved.`,
      staff: updatedStaff
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Reject a staff account
 * POST /api/admin/staff/:id/reject
 */
async function handleRejectStaff(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: 'Backend is waiting for Supabase credentials in .env.'
      });
    }

    const staffId = req.params.id;

    if (!staffId) {
      return res.status(400).json({
        success: false,
        error: 'Staff user ID is required.'
      });
    }

    // Verify staff record exists
    const { data: existingStaff, error: fetchErr } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, full_name, email, approval_status')
      .eq('id', staffId)
      .maybeSingle();

    if (fetchErr || !existingStaff) {
      return res.status(404).json({
        success: false,
        error: 'Staff profile record not found.'
      });
    }

    // Perform database update
    const { data: updatedStaff, error: updateErr } = await supabaseAdmin
      .from('staff_profiles')
      .update({
        approval_status: 'rejected',
        approved_at: null,
        approved_by: null
      })
      .eq('id', staffId)
      .select('id, full_name, email, role, approval_status, is_active, approved_at, approved_by, created_at, updated_at')
      .single();

    if (updateErr) {
      console.error('Failed to reject staff profile:', updateErr);
      const error = new Error('Failed to update staff rejection status: ' + updateErr.message);
      error.status = 500;
      throw error;
    }

    logAuditEvent({
      action: 'staff_rejected',
      performedBy: req.profile?.id,
      performedByName: req.profile?.fullName,
      entityType: 'staff',
      entityId: staffId,
      details: { name: updatedStaff.full_name, email: updatedStaff.email }
    });

    return res.status(200).json({
      success: true,
      message: `Staff member "${updatedStaff.full_name}" has been rejected.`,
      staff: updatedStaff
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleGetStaffList,
  handleApproveStaff,
  handleRejectStaff
};
