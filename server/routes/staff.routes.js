/**
 * Staff Operations Routes (server/routes/staff.routes.js)
 * Endpoints for Phase 3: Daily Bus Operations, Attendance, Standing Students & History.
 * Strictly protected: requires authenticated session + approved staff role.
 */

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth.middleware');
const { requireApprovedStaff } = require('../middleware/role.middleware');

const {
  handleGetAvailableBuses,
  handleClaimBus,
  handleGetActiveBus,
  handleCompleteBusDuty,
  handleGetBusStudents,
  handleStaffAddStudent
} = require('../controllers/staff-bus.controller');

const {
  handleGetTodayAttendance,
  handleSaveAttendance
} = require('../controllers/staff-attendance.controller');

const {
  handleGetTodayStanding,
  handleAddStandingStudent,
  handleRemoveStandingStudent,
  handleSearchStudents
} = require('../controllers/staff-standing.controller');

const {
  handleGetTodayReport,
  handleGetStaffHistory,
  handleGetHistoricalDetail
} = require('../controllers/staff-history.controller');

// Enforce authentication and approved staff role on all /api/staff routes
router.use(requireAuth);
router.use(requireApprovedStaff);

// ── 1. Bus Management & Duty Claiming ─────────────────────────────────────────
router.get('/buses/available', handleGetAvailableBuses);
router.post('/buses/claim', handleClaimBus);
router.get('/buses/active', handleGetActiveBus);
router.post('/buses/complete-duty', handleCompleteBusDuty);
router.get('/buses/students', handleGetBusStudents);

// ── 2. Staff Student Registration ─────────────────────────────────────────────
router.post('/students', handleStaffAddStudent);

// ── 3. Daily Attendance Operations ────────────────────────────────────────────
router.get('/attendance/today', handleGetTodayAttendance);
router.post('/attendance', handleSaveAttendance);

// ── 4. Standing Students Operations ───────────────────────────────────────────
router.get('/standing/today', handleGetTodayStanding);
router.post('/standing', handleAddStandingStudent);
router.delete('/standing/:id', handleRemoveStandingStudent);
router.get('/standing/search-students', handleSearchStudents);

// ── 5. Operational Reports & Duty History ─────────────────────────────────────
router.get('/report/today', handleGetTodayReport);
router.get('/history', handleGetStaffHistory);
router.get('/history/:assignmentId', handleGetHistoricalDetail);

module.exports = router;
