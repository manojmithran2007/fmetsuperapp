/**
 * Audit Logging Controller (server/controllers/audit.controller.js)
 * Records and retrieves administrative audit trails for security compliance.
 */

const { supabaseAdmin, isConfigured } = require('../config/supabase');

/**
 * Log an administrative audit event.
 * Designed to fail gracefully without disrupting primary workflows.
 */
async function logAuditEvent({ action, performedBy, performedByName, entityType, entityId, details = null }) {
  if (!isConfigured || !supabaseAdmin) return;

  try {
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        action,
        performed_by: performedBy || null,
        performed_by_name: performedByName || 'Administrator',
        entity_type: entityType,
        entity_id: String(entityId || ''),
        details: details ? details : null,
        created_at: new Date().toISOString()
      });
  } catch (err) {
    console.error('[AUDIT LOG ERROR]', err.message);
  }
}

/**
 * GET /api/admin/audit-logs
 * Retrieves chronological audit records with limit.
 */
async function handleGetAuditLogs(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);

    const { data: logs, error: logErr } = await supabaseAdmin
      .from('audit_logs')
      .select('id, action, performed_by_name, entity_type, entity_id, details, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (logErr) {
      const err = new Error('Failed to fetch audit logs: ' + logErr.message);
      err.status = 500;
      throw err;
    }

    res.json({
      success: true,
      logs: (logs || []).map(l => ({
        id: l.id,
        action: l.action,
        performedBy: l.performed_by_name,
        entityType: l.entity_type,
        entityId: l.entity_id,
        details: l.details,
        createdAt: l.created_at
      }))
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  logAuditEvent,
  handleGetAuditLogs
};
