/**
 * Dashboard & Analytics Controller (server/controllers/dashboard.controller.js)
 * Admin-only aggregate stats, recent activity, and bus-wise analytics.
 */

const { supabaseAdmin, isConfigured } = require('../config/supabase');

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/stats
// ---------------------------------------------------------------------------
async function handleGetStats(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const [busResult, studentResult, staffResult] = await Promise.all([
      supabaseAdmin.from('buses').select('id, seating_capacity'),
      supabaseAdmin.from('students').select('id, bus_id'),
      supabaseAdmin.from('staff_profiles').select('id, approval_status')
    ]);

    const buses    = busResult.data    || [];
    const students = studentResult.data || [];
    const staff    = staffResult.data   || [];

    const totalCapacity    = buses.reduce((sum, b) => sum + (b.seating_capacity || 0), 0);
    const assignedStudents = students.filter(s => s.bus_id !== null).length;

    return res.status(200).json({
      success: true,
      stats: {
        totalBuses:        buses.length,
        totalStudents:     students.length,
        totalStaff:        staff.length,
        pendingStaff:      staff.filter(s => s.approval_status === 'pending').length,
        approvedStaff:     staff.filter(s => s.approval_status === 'approved').length,
        totalCapacity,
        assignedStudents,
        availableSeats:    totalCapacity - assignedStudents
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/recent
// Returns last 5 records of each category for the overview panel.
// ---------------------------------------------------------------------------
async function handleGetRecent(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const [busRes, staffRes, studentRes] = await Promise.all([
      supabaseAdmin
        .from('buses')
        .select('id, bus_number, route_name, seating_capacity, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseAdmin
        .from('staff_profiles')
        .select('id, full_name, email, approval_status, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseAdmin
        .from('students')
        .select('id, full_name, roll_number, bus_id, created_at, buses(bus_number)')
        .order('created_at', { ascending: false })
        .limit(5)
    ]);

    return res.status(200).json({
      success: true,
      recent: {
        buses:    busRes.data    || [],
        staff:    staffRes.data   || [],
        students: studentRes.data || []
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/analytics
// Full fleet overview + per-bus utilization breakdown.
// ---------------------------------------------------------------------------
async function handleGetAnalytics(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const [busResult, studentResult, staffResult] = await Promise.all([
      supabaseAdmin.from('buses').select('id, bus_number, route_name, seating_capacity, is_active').order('bus_number'),
      supabaseAdmin.from('students').select('id, bus_id'),
      supabaseAdmin.from('staff_profiles').select('id, approval_status')
    ]);

    const buses    = busResult.data    || [];
    const students = studentResult.data || [];
    const staff    = staffResult.data   || [];

    // Count students per bus
    const countMap = {};
    students.forEach(({ bus_id }) => {
      if (bus_id) countMap[bus_id] = (countMap[bus_id] || 0) + 1;
    });

    const busAnalytics = buses.map(bus => ({
      ...bus,
      assigned_students: countMap[bus.id] || 0,
      available_seats:   bus.seating_capacity - (countMap[bus.id] || 0)
    }));

    const totalCapacity  = buses.reduce((sum, b) => sum + b.seating_capacity, 0);
    const totalAssigned  = students.filter(s => s.bus_id !== null).length;

    return res.status(200).json({
      success: true,
      overview: {
        totalBuses:       buses.length,
        totalStudents:    students.length,
        totalAssigned,
        totalUnassigned:  students.length - totalAssigned,
        totalCapacity,
        availableSeats:   totalCapacity - totalAssigned,
        totalStaff:       staff.length,
        pendingStaff:     staff.filter(s => s.approval_status === 'pending').length,
        approvedStaff:    staff.filter(s => s.approval_status === 'approved').length,
        rejectedStaff:    staff.filter(s => s.approval_status === 'rejected').length
      },
      busAnalytics
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/analytics/advanced
// Returns comprehensive multi-date trends, reason distributions, and utilization
// ---------------------------------------------------------------------------
async function handleGetAdvancedAnalytics(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { from, to, days = 7 } = req.query;
    const endDate = to || new Date().toISOString().split('T')[0];
    let startDate = from;

    if (!startDate) {
      const d = new Date(endDate);
      d.setDate(d.getDate() - (parseInt(days, 10) || 7) + 1);
      startDate = d.toISOString().split('T')[0];
    }

    // 1. Fetch Fleet Overview
    const [busRes, studentRes, staffRes] = await Promise.all([
      supabaseAdmin.from('buses').select('id, bus_number, route_name, seating_capacity, is_active').order('bus_number'),
      supabaseAdmin.from('students').select('id, bus_id'),
      supabaseAdmin.from('staff_profiles').select('id, approval_status')
    ]);

    const buses = busRes.data || [];
    const students = studentRes.data || [];
    const staff = staffRes.data || [];

    const totalCapacity = buses.reduce((acc, b) => acc + (b.seating_capacity || 0), 0);
    const assignedStudents = students.filter(s => s.bus_id !== null).length;
    const fleetUtilizationRate = totalCapacity > 0 ? Math.round((assignedStudents / totalCapacity) * 100) : 0;

    // 2. Fetch Attendance in range
    const { data: attList } = await supabaseAdmin
      .from('daily_attendance')
      .select('attendance_date, bus_id, status')
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate);

    // 3. Fetch Standing in range
    const { data: standingList } = await supabaseAdmin
      .from('daily_standing_log')
      .select('log_date, bus_id, standing_reason')
      .gte('log_date', startDate)
      .lte('log_date', endDate);

    // 4. Group by date for trends
    const dateMap = {};
    const curr = new Date(startDate);
    const end = new Date(endDate);

    while (curr <= end) {
      const dStr = curr.toISOString().split('T')[0];
      dateMap[dStr] = { date: dStr, present: 0, absent: 0, standing: 0, totalTravelling: 0 };
      curr.setDate(curr.getDate() + 1);
    }

    if (attList) {
      for (const a of attList) {
        if (dateMap[a.attendance_date]) {
          if (a.status === 'present') dateMap[a.attendance_date].present++;
          else if (a.status === 'absent') dateMap[a.attendance_date].absent++;
        }
      }
    }

    if (standingList) {
      for (const st of standingList) {
        if (dateMap[st.log_date]) {
          dateMap[st.log_date].standing++;
        }
      }
    }

    const trends = Object.values(dateMap).map(d => ({
      ...d,
      totalTravelling: d.present + d.standing
    }));

    // 5. Standing Reason distribution
    const reasonCounts = {
      temporary: 0,
      missed_regular_bus: 0,
      route_change: 0,
      no_capacity: 0
    };

    if (standingList) {
      for (const st of standingList) {
        if (reasonCounts[st.standing_reason] !== undefined) {
          reasonCounts[st.standing_reason]++;
        }
      }
    }

    // 6. Bus utilization and operational totals in range
    const studentCountMap = {};
    students.forEach(s => {
      if (s.bus_id) studentCountMap[s.bus_id] = (studentCountMap[s.bus_id] || 0) + 1;
    });

    const busMetrics = buses.map(b => {
      const assigned = studentCountMap[b.id] || 0;
      const utilRate = b.seating_capacity > 0 ? Math.round((assigned / b.seating_capacity) * 100) : 0;
      return {
        id: b.id,
        busNumber: b.bus_number,
        routeName: b.route_name,
        seatingCapacity: b.seating_capacity,
        assignedStudents: assigned,
        utilizationRate: utilRate
      };
    });

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalStanding = (standingList || []).length;
    if (attList) {
      for (const a of attList) {
        if (a.status === 'present') totalPresent++;
        else if (a.status === 'absent') totalAbsent++;
      }
    }

    res.json({
      success: true,
      filter: { from: startDate, to: endDate },
      fleet: {
        totalBuses: buses.length,
        totalStudents: students.length,
        totalCapacity,
        assignedStudents,
        availableSeats: totalCapacity - assignedStudents,
        fleetUtilizationRate, // Seating Capacity Utilization %
        totalStaff: staff.length,
        approvedStaff: staff.filter(s => s.approval_status === 'approved').length,
        pendingStaff: staff.filter(s => s.approval_status === 'pending').length
      },
      rangeSummary: {
        totalPresent,
        totalAbsent,
        totalStanding,
        totalTravelling: totalPresent + totalStanding
      },
      trends,
      standingReasons: reasonCounts,
      busMetrics
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleGetStats,
  handleGetRecent,
  handleGetAnalytics,
  handleGetAdvancedAnalytics
};

