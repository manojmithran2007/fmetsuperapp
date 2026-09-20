/**
 * Admin Reports & CSV Export Controller (server/controllers/reports.controller.js)
 * Comprehensive reporting engine supporting Daily, Bus-wise, Staff-wise,
 * Attendance, and Standing Student reports with multi-criteria filtering and CSV export.
 */

const { supabaseAdmin, isConfigured } = require('../config/supabase');

function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// 1. GET /api/admin/reports/daily
// Daily Duty Reports with bus, incharge, attendance & standing totals
// ---------------------------------------------------------------------------
async function handleGetDailyReports(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { from, to, busId, staffId } = req.query;
    const startDate = from || getTodayDateString();
    const endDate = to || startDate;

    let query = supabaseAdmin
      .from('daily_bus_assignments')
      .select(`
        id,
        assignment_date,
        start_time,
        completed_at,
        status,
        bus_id,
        staff_id,
        buses (
          id,
          bus_number,
          route_name,
          seating_capacity
        ),
        staff_profiles (
          id,
          full_name,
          email
        )
      `)
      .gte('assignment_date', startDate)
      .lte('assignment_date', endDate)
      .order('assignment_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (busId) query = query.eq('bus_id', busId);
    if (staffId) query = query.eq('staff_id', staffId);

    const { data: duties, error: dutyErr } = await query;
    if (dutyErr) {
      const err = new Error('Failed to fetch daily reports: ' + dutyErr.message);
      err.status = 500;
      throw err;
    }

    // Enhance each duty with attendance & standing aggregates
    let totalDuties = (duties || []).length;
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalStanding = 0;

    const reportRows = await Promise.all(
      (duties || []).map(async d => {
        const bId = d.bus_id;
        const dDate = d.assignment_date;

        // Count assigned students on this bus
        const { count: assignedCount } = await supabaseAdmin
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('bus_id', bId)
          .eq('is_active', true);

        // Fetch attendance for this bus and date
        const { data: attList } = await supabaseAdmin
          .from('daily_attendance')
          .select('status')
          .eq('bus_id', bId)
          .eq('attendance_date', dDate);

        let present = 0;
        let absent = 0;
        if (attList) {
          for (const a of attList) {
            if (a.status === 'present') present++;
            else if (a.status === 'absent') absent++;
          }
        }

        // Fetch standing count for this bus and date
        const { count: standingCount } = await supabaseAdmin
          .from('daily_standing_log')
          .select('*', { count: 'exact', head: true })
          .eq('bus_id', bId)
          .eq('log_date', dDate);

        const standing = standingCount || 0;
        const travelling = present + standing;

        totalPresent += present;
        totalAbsent += absent;
        totalStanding += standing;

        return {
          id: d.id,
          date: d.assignment_date,
          busId: bId,
          busNumber: d.buses?.bus_number || 'N/A',
          routeName: d.buses?.route_name || 'N/A',
          seatingCapacity: d.buses?.seating_capacity || 0,
          staffId: d.staff_id,
          staffName: d.staff_profiles?.full_name || 'N/A',
          staffEmail: d.staff_profiles?.email || 'N/A',
          startTime: d.start_time,
          completedAt: d.completed_at,
          status: d.status,
          assignedStudents: assignedCount || 0,
          present,
          absent,
          standing,
          totalTravelling: travelling
        };
      })
    );

    res.json({
      success: true,
      filter: { from: startDate, to: endDate, busId, staffId },
      summary: {
        totalDuties,
        totalAttendance: totalPresent + totalAbsent,
        totalPresent,
        totalAbsent,
        totalStanding,
        totalTravelling: totalPresent + totalStanding
      },
      reports: reportRows
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 2. GET /api/admin/reports/buses
// Bus-wise Performance & Seating Utilization Reports
// ---------------------------------------------------------------------------
async function handleGetBusReports(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { from, to, busId } = req.query;
    const startDate = from || getTodayDateString();
    const endDate = to || startDate;

    // Fetch buses
    let busQuery = supabaseAdmin
      .from('buses')
      .select('id, bus_number, route_name, seating_capacity, is_active')
      .order('bus_number', { ascending: true });

    if (busId) busQuery = busQuery.eq('id', busId);

    const { data: buses, error: busErr } = await busQuery;
    if (busErr) {
      const err = new Error('Failed to fetch buses: ' + busErr.message);
      err.status = 500;
      throw err;
    }

    // Fetch assigned students per bus
    const { data: students } = await supabaseAdmin
      .from('students')
      .select('bus_id')
      .eq('is_active', true)
      .not('bus_id', 'is', null);

    const studentCountMap = {};
    if (students) {
      for (const s of students) {
        studentCountMap[s.bus_id] = (studentCountMap[s.bus_id] || 0) + 1;
      }
    }

    // Fetch attendance within range
    const { data: attList } = await supabaseAdmin
      .from('daily_attendance')
      .select('bus_id, status')
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate);

    const attMap = {};
    if (attList) {
      for (const a of attList) {
        if (!attMap[a.bus_id]) attMap[a.bus_id] = { present: 0, absent: 0 };
        if (a.status === 'present') attMap[a.bus_id].present++;
        else if (a.status === 'absent') attMap[a.bus_id].absent++;
      }
    }

    // Fetch standing within range
    const { data: standingList } = await supabaseAdmin
      .from('daily_standing_log')
      .select('bus_id')
      .gte('log_date', startDate)
      .lte('log_date', endDate);

    const standingMap = {};
    if (standingList) {
      for (const st of standingList) {
        standingMap[st.bus_id] = (standingMap[st.bus_id] || 0) + 1;
      }
    }

    const busReports = (buses || []).map(b => {
      const assigned = studentCountMap[b.id] || 0;
      const att = attMap[b.id] || { present: 0, absent: 0 };
      const standing = standingMap[b.id] || 0;
      const seatUtilization = b.seating_capacity > 0 ? Math.round((assigned / b.seating_capacity) * 100) : 0;
      const totalTravelling = att.present + standing;

      return {
        busId: b.id,
        busNumber: b.bus_number,
        routeName: b.route_name,
        seatingCapacity: b.seating_capacity,
        assignedStudents: assigned,
        availableSeats: Math.max(0, b.seating_capacity - assigned),
        seatUtilizationRate: seatUtilization, // (Assigned / Capacity * 100)
        rangePresent: att.present,
        rangeAbsent: att.absent,
        rangeStanding: standing,
        rangeTotalTravelling: totalTravelling
      };
    });

    res.json({
      success: true,
      filter: { from: startDate, to: endDate, busId },
      reports: busReports
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 3. GET /api/admin/reports/staff
// Staff-wise Duty and Attendance Activity Reports
// ---------------------------------------------------------------------------
async function handleGetStaffReports(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { from, to, staffId } = req.query;
    const startDate = from || '2000-01-01';
    const endDate = to || getTodayDateString();

    let staffQuery = supabaseAdmin
      .from('staff_profiles')
      .select('id, full_name, email, approval_status, is_active')
      .order('full_name', { ascending: true });

    if (staffId) staffQuery = staffQuery.eq('id', staffId);

    const { data: staffList, error: sErr } = await staffQuery;
    if (sErr) {
      const err = new Error('Failed to fetch staff list: ' + sErr.message);
      err.status = 500;
      throw err;
    }

    // Fetch all assignments within range
    const { data: duties } = await supabaseAdmin
      .from('daily_bus_assignments')
      .select('id, staff_id, bus_id, assignment_date, status, buses(bus_number)')
      .gte('assignment_date', startDate)
      .lte('assignment_date', endDate);

    // Fetch attendance marked by staff
    const { data: attList } = await supabaseAdmin
      .from('daily_attendance')
      .select('recorded_by, status')
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate);

    // Fetch standing recorded by staff
    const { data: standingList } = await supabaseAdmin
      .from('daily_standing_log')
      .select('recorded_by')
      .gte('log_date', startDate)
      .lte('log_date', endDate);

    const dutyMap = {};
    if (duties) {
      for (const d of duties) {
        if (!dutyMap[d.staff_id]) {
          dutyMap[d.staff_id] = { count: 0, dates: new Set(), buses: new Set() };
        }
        dutyMap[d.staff_id].count++;
        dutyMap[d.staff_id].dates.add(d.assignment_date);
        if (d.buses?.bus_number) dutyMap[d.staff_id].buses.add(d.buses.bus_number);
      }
    }

    const attStaffMap = {};
    if (attList) {
      for (const a of attList) {
        attStaffMap[a.recorded_by] = (attStaffMap[a.recorded_by] || 0) + 1;
      }
    }

    const standingStaffMap = {};
    if (standingList) {
      for (const st of standingList) {
        standingStaffMap[st.recorded_by] = (standingStaffMap[st.recorded_by] || 0) + 1;
      }
    }

    const staffReports = (staffList || []).map(s => {
      const dData = dutyMap[s.id] || { count: 0, dates: new Set(), buses: new Set() };
      return {
        staffId: s.id,
        staffName: s.full_name,
        email: s.email,
        approvalStatus: s.approval_status,
        isActive: s.is_active,
        totalDuties: dData.count,
        distinctDatesCount: dData.dates.size,
        distinctBusesCount: dData.buses.size,
        busesHandled: Array.from(dData.buses).join(', ') || 'None',
        attendanceRecordsMarked: attStaffMap[s.id] || 0,
        standingRecordsCreated: standingStaffMap[s.id] || 0
      };
    });

    res.json({
      success: true,
      filter: { from: startDate, to: endDate, staffId },
      reports: staffReports
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 4. GET /api/admin/reports/attendance
// Detailed Line-Item Attendance Logs
// ---------------------------------------------------------------------------
async function handleGetAttendanceReports(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { from, to, busId, status, search, limit = 100 } = req.query;
    const startDate = from || getTodayDateString();
    const endDate = to || startDate;

    let query = supabaseAdmin
      .from('daily_attendance')
      .select(`
        id,
        attendance_date,
        status,
        updated_at,
        buses (
          id,
          bus_number,
          route_name
        ),
        students (
          id,
          full_name,
          roll_number,
          seat_number
        ),
        staff_profiles (
          id,
          full_name
        )
      `)
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate)
      .order('attendance_date', { ascending: false })
      .limit(parseInt(limit, 10));

    if (busId) query = query.eq('bus_id', busId);
    if (status && (status === 'present' || status === 'absent')) {
      query = query.eq('status', status);
    }

    const { data: rows, error: attErr } = await query;
    if (attErr) {
      const err = new Error('Failed to fetch attendance reports: ' + attErr.message);
      err.status = 500;
      throw err;
    }

    let filtered = (rows || []).map(r => ({
      id: r.id,
      date: r.attendance_date,
      busNumber: r.buses?.bus_number || 'N/A',
      routeName: r.buses?.route_name || 'N/A',
      studentName: r.students?.full_name || 'Unknown',
      rollNumber: r.students?.roll_number || 'N/A',
      seatNumber: r.students?.seat_number || 'None',
      status: r.status,
      markedBy: r.staff_profiles?.full_name || 'Staff'
    }));

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      filtered = filtered.filter(f =>
        f.studentName.toLowerCase().includes(term) ||
        f.rollNumber.toLowerCase().includes(term) ||
        f.busNumber.toLowerCase().includes(term)
      );
    }

    const presentCount = filtered.filter(f => f.status === 'present').length;
    const absentCount = filtered.filter(f => f.status === 'absent').length;

    res.json({
      success: true,
      filter: { from: startDate, to: endDate, busId, status, search },
      summary: {
        total: filtered.length,
        present: presentCount,
        absent: absentCount
      },
      reports: filtered
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 5. GET /api/admin/reports/standing
// Dedicated Standing Student Operational Reports
// ---------------------------------------------------------------------------
async function handleGetStandingReports(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { from, to, busId, reason, search, limit = 100 } = req.query;
    const startDate = from || getTodayDateString();
    const endDate = to || startDate;

    let query = supabaseAdmin
      .from('daily_standing_log')
      .select(`
        id,
        log_date,
        standing_reason,
        created_at,
        buses (
          id,
          bus_number,
          route_name
        ),
        students (
          id,
          full_name,
          roll_number
        ),
        staff_profiles (
          id,
          full_name
        )
      `)
      .gte('log_date', startDate)
      .lte('log_date', endDate)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(parseInt(limit, 10));

    if (busId) query = query.eq('bus_id', busId);
    if (reason) query = query.eq('standing_reason', reason.toLowerCase().trim());

    const { data: rows, error: stErr } = await query;
    if (stErr) {
      const err = new Error('Failed to fetch standing reports: ' + stErr.message);
      err.status = 500;
      throw err;
    }

    let filtered = (rows || []).map(r => ({
      id: r.id,
      date: r.log_date,
      busNumber: r.buses?.bus_number || 'N/A',
      routeName: r.buses?.route_name || 'N/A',
      studentName: r.students?.full_name || 'Unknown',
      rollNumber: r.students?.roll_number || 'N/A',
      reason: r.standing_reason,
      recordedBy: r.staff_profiles?.full_name || 'Staff',
      createdAt: r.created_at
    }));

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      filtered = filtered.filter(f =>
        f.studentName.toLowerCase().includes(term) ||
        f.rollNumber.toLowerCase().includes(term) ||
        f.busNumber.toLowerCase().includes(term)
      );
    }

    // Breakdown by reason
    const reasonCounts = {
      temporary: 0,
      missed_regular_bus: 0,
      route_change: 0,
      no_capacity: 0
    };

    filtered.forEach(f => {
      if (reasonCounts[f.reason] !== undefined) {
        reasonCounts[f.reason]++;
      }
    });

    res.json({
      success: true,
      filter: { from: startDate, to: endDate, busId, reason, search },
      summary: {
        total: filtered.length,
        reasons: reasonCounts
      },
      reports: filtered
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 6. GET /api/admin/reports/export?type=daily|bus|staff|attendance|standing
// Export filtered reports to CSV
// ---------------------------------------------------------------------------
async function handleExportCSV(req, res, next) {
  try {
    const type = req.query.type || 'daily';
    const today = getTodayDateString();

    let csvContent = '';
    let filename = `report_${type}_${today}.csv`;

    if (type === 'daily') {
      const mockReq = { query: req.query };
      const data = await new Promise((resolve, reject) => {
        handleGetDailyReports(mockReq, { json: resolve }, reject);
      });

      const headers = ['Date', 'Bus Number', 'Route', 'Capacity', 'Incharge Staff', 'Status', 'Assigned Students', 'Present', 'Absent', 'Standing', 'Total Travelling'];
      const rows = (data.reports || []).map(r => [
        r.date,
        `"${r.busNumber}"`,
        `"${r.routeName}"`,
        r.seatingCapacity,
        `"${r.staffName}"`,
        r.status,
        r.assignedStudents,
        r.present,
        r.absent,
        r.standing,
        r.totalTravelling
      ]);

      csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    } else if (type === 'bus') {
      const mockReq = { query: req.query };
      const data = await new Promise((resolve, reject) => {
        handleGetBusReports(mockReq, { json: resolve }, reject);
      });

      const headers = ['Bus Number', 'Route', 'Capacity', 'Assigned Students', 'Available Seats', 'Seat Utilization %', 'Present in Range', 'Absent in Range', 'Standing in Range', 'Total Travelling'];
      const rows = (data.reports || []).map(r => [
        `"${r.busNumber}"`,
        `"${r.routeName}"`,
        r.seatingCapacity,
        r.assignedStudents,
        r.availableSeats,
        `${r.seatUtilizationRate}%`,
        r.rangePresent,
        r.rangeAbsent,
        r.rangeStanding,
        r.rangeTotalTravelling
      ]);

      csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    } else if (type === 'staff') {
      const mockReq = { query: req.query };
      const data = await new Promise((resolve, reject) => {
        handleGetStaffReports(mockReq, { json: resolve }, reject);
      });

      const headers = ['Staff Name', 'Email', 'Status', 'Total Duties', 'Distinct Dates', 'Distinct Buses', 'Buses Handled', 'Attendance Marked', 'Standing Created'];
      const rows = (data.reports || []).map(r => [
        `"${r.staffName}"`,
        `"${r.email}"`,
        r.approvalStatus,
        r.totalDuties,
        r.distinctDatesCount,
        r.distinctBusesCount,
        `"${r.busesHandled}"`,
        r.attendanceRecordsMarked,
        r.standingRecordsCreated
      ]);

      csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    } else if (type === 'attendance') {
      const mockReq = { query: { ...req.query, limit: 1000 } };
      const data = await new Promise((resolve, reject) => {
        handleGetAttendanceReports(mockReq, { json: resolve }, reject);
      });

      const headers = ['Date', 'Bus Number', 'Route', 'Student Name', 'Roll Number', 'Seat Number', 'Status', 'Marked By'];
      const rows = (data.reports || []).map(r => [
        r.date,
        `"${r.busNumber}"`,
        `"${r.routeName}"`,
        `"${r.studentName}"`,
        `"${r.rollNumber}"`,
        r.seatNumber,
        r.status,
        `"${r.markedBy}"`
      ]);

      csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    } else if (type === 'standing') {
      const mockReq = { query: { ...req.query, limit: 1000 } };
      const data = await new Promise((resolve, reject) => {
        handleGetStandingReports(mockReq, { json: resolve }, reject);
      });

      const headers = ['Date', 'Bus Number', 'Route', 'Student Name', 'Roll Number', 'Standing Reason', 'Recorded By', 'Created At'];
      const rows = (data.reports || []).map(r => [
        r.date,
        `"${r.busNumber}"`,
        `"${r.routeName}"`,
        `"${r.studentName}"`,
        `"${r.rollNumber}"`,
        `"${r.reason}"`,
        `"${r.recordedBy}"`,
        r.createdAt
      ]);

      csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleGetDailyReports,
  handleGetBusReports,
  handleGetStaffReports,
  handleGetAttendanceReports,
  handleGetStandingReports,
  handleExportCSV
};
