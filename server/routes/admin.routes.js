const express = require('express');
const router  = express.Router();

const adminController      = require('../controllers/admin.controller');
const busController        = require('../controllers/bus.controller');
const studentController    = require('../controllers/student.controller');
const dashboardController  = require('../controllers/dashboard.controller');
const monitoringController = require('../controllers/monitoring.controller');
const reportsController    = require('../controllers/reports.controller');
const auditController      = require('../controllers/audit.controller');
const { requireAuth }      = require('../middleware/auth.middleware');
const { requireAdmin }     = require('../middleware/role.middleware');

// All admin routes require valid authentication and Administrator role
router.use(requireAuth, requireAdmin);

// ---------------------------------------------------------------------------
// Dashboard & Analytics
// ---------------------------------------------------------------------------
router.get('/dashboard/stats',   dashboardController.handleGetStats);
router.get('/dashboard/recent',  dashboardController.handleGetRecent);
router.get('/analytics',         dashboardController.handleGetAnalytics);
router.get('/analytics/advanced', dashboardController.handleGetAdvancedAnalytics);

// ---------------------------------------------------------------------------
// Today's Duty Fleet Monitoring
// ---------------------------------------------------------------------------
router.get('/monitoring/today', monitoringController.handleGetTodayMonitoring);

// ---------------------------------------------------------------------------
// Reports & CSV Export
// ---------------------------------------------------------------------------
router.get('/reports/daily',      reportsController.handleGetDailyReports);
router.get('/reports/buses',      reportsController.handleGetBusReports);
router.get('/reports/staff',      reportsController.handleGetStaffReports);
router.get('/reports/attendance', reportsController.handleGetAttendanceReports);
router.get('/reports/standing',   reportsController.handleGetStandingReports);
router.get('/reports/export',     reportsController.handleExportCSV);

// ---------------------------------------------------------------------------
// Audit Trail
// ---------------------------------------------------------------------------
router.get('/audit-logs', auditController.handleGetAuditLogs);

// ---------------------------------------------------------------------------
// Staff Management
// ---------------------------------------------------------------------------
router.get('/staff',              adminController.handleGetStaffList);
router.post('/staff/:id/approve', adminController.handleApproveStaff);
router.post('/staff/:id/reject',  adminController.handleRejectStaff);

// ---------------------------------------------------------------------------
// Bus Management
// ---------------------------------------------------------------------------
router.get('/buses',        busController.handleGetBuses);
router.get('/buses/:id',    busController.handleGetBusDetails);
router.post('/buses',       busController.handleCreateBus);
router.put('/buses/:id',    busController.handleUpdateBus);
router.delete('/buses/:id', busController.handleDeleteBus);

// ---------------------------------------------------------------------------
// Student Management
// ---------------------------------------------------------------------------
router.get('/students',                   studentController.handleGetStudents);
router.post('/students',                  studentController.handleCreateStudent);
router.put('/students/:id',               studentController.handleUpdateStudent);
router.delete('/students/:id',            studentController.handleDeleteStudent);
router.post('/students/:id/assign',       studentController.handleAssignStudent);
router.post('/students/:id/move',         studentController.handleMoveStudent);
router.post('/students/:id/unassign',     studentController.handleUnassignStudent);

module.exports = router;
