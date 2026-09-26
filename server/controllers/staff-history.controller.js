/**
 * Staff History & Reporting Controller (server/controllers/staff-history.controller.js)
 * Generates Today's Operational Duty Report and Historical Transit Logs.
 */

const { supabaseAdmin, isConfigured } = require('../config/supabase');

function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// GET /api/staff/report/today?busId=&date=
// Returns full operational report for a bus on a specific date
// ---------------------------------------------------------------------------
async function handleGetTodayReport(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { busId } = req.query;
    const date = req.query.date || getTodayDateString();

    if (!busId) {
      return res.status(400).json({ success: false, error: 'Bus ID is required.' });
    }

    // 1. Fetch bus details
    const { data: bus, error: busErr } = await supabaseAdmin
      .from('buses')
      .select('id, bus_number, route_name, seating_capacity')
      .eq('id', busId)
      .maybeSingle();

    if (busErr || !bus) {
      return res.status(404).json({ success: false, error: 'Bus not found.' });
    }

    // 2. Fetch assignment for date
    const { data: assignmentRows } = await supabaseAdmin
      .from('daily_bus_assignments')
      .select('id, assignment_date, start_time, completed_at, status, staff_profiles(full_name, email)')
      .eq('bus_id', busId)
      .eq('assignment_date', date)
      .order('created_at', { ascending: false })
      .limit(1);

    const assignment = assignmentRows && assignmentRows.length > 0 ? assignmentRows[0] : null;

    // 3. Fetch assigned students
    const { data: assignedStudents } = await supabaseAdmin
      .from('students')
      .select('id, full_name, roll_number, seat_number')
      .eq('bus_id', busId)
      .eq('is_active', true)
      .order('seat_number', { ascending: true, nullsFirst: false });

    // 4. Fetch attendance records
    const { data: attendanceRows } = await supabaseAdmin
      .from('daily_attendance')
      .select('student_id, status, updated_at')
      .eq('bus_id', busId)
      .eq('attendance_date', date);

    const attMap = {};
    if (attendanceRows) {
      for (const row of attendanceRows) {
        attMap[row.student_id] = row.status;
      }
    }

    let presentCount = 0;
    let absentCount = 0;
    let unmarkedCount = 0;

    const studentRoster = (assignedStudents || []).map(s => {
      const status = attMap[s.id] || 'unmarked';
      if (status === 'present') presentCount++;
      else if (status === 'absent') absentCount++;
      else unmarkedCount++;

      return {
        id: s.id,
        fullName: s.full_name,
        rollNumber: s.roll_number,
        seatNumber: s.seat_number,
        attendanceStatus: status
      };
    });

    // 5. Fetch standing students
    const { data: standingRows } = await supabaseAdmin
      .from('daily_standing_log')
      .select(`
        id,
        student_name,
        student_roll,
        standing_reason,
        created_at,
        students (
          full_name,
          roll_number
        )
      `)
      .eq('bus_id', busId)
      .eq('log_date', date);

    const standingList = (standingRows || []).map(st => ({
      id: st.id,
      fullName: st.student_name || st.students?.full_name || 'Unknown',
      rollNumber: st.student_roll || st.students?.roll_number || 'N/A',
      reason: st.standing_reason,
      createdAt: st.created_at
    }));

    const standingCount = standingList.length;
    const totalTravelling = presentCount + standingCount;

    res.json({
      success: true,
      report: {
        date,
        bus: {
          id: bus.id,
          busNumber: bus.bus_number,
          routeName: bus.route_name,
          seatingCapacity: bus.seating_capacity
        },
        duty: {
          id: assignment?.id || null,
          staffName: assignment?.staff_profiles?.full_name || req.profile.fullName,
          staffEmail: assignment?.staff_profiles?.email || req.profile.email,
          startTime: assignment?.start_time || null,
          completedAt: assignment?.completed_at || null,
          status: assignment?.status || 'available'
        },
        stats: {
          seatingCapacity: bus.seating_capacity,
          assignedStudents: studentRoster.length,
          present: presentCount,
          absent: absentCount,
          unmarked: unmarkedCount,
          standing: standingCount,
          totalTravellingToday: totalTravelling,
          capacityUtilization: Math.round((totalTravelling / bus.seating_capacity) * 100)
        },
        attendanceRoster: studentRoster,
        standingRoster: standingList
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/staff/history
// Returns chronological list of all previous duties handled by the staff
// ---------------------------------------------------------------------------
async function handleGetStaffHistory(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const staffId = req.profile.id;

    // Fetch duties handled by this staff
    const { data: duties, error: dutyErr } = await supabaseAdmin
      .from('daily_bus_assignments')
      .select(`
        id,
        assignment_date,
        start_time,
        completed_at,
        status,
        bus_id,
        buses (
          id,
          bus_number,
          route_name,
          seating_capacity
        )
      `)
      .eq('staff_id', staffId)
      .order('assignment_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (dutyErr) {
      const err = new Error('Failed to fetch duty history: ' + dutyErr.message);
      err.status = 500;
      throw err;
    }

    if (!duties || duties.length === 0) {
      return res.json({ success: true, history: [] });
    }

    // Enhance each duty with attendance & standing summary
    const enhancedHistory = await Promise.all(
      duties.map(async d => {
        const busId = d.bus_id;
        const dutyDate = d.assignment_date;

        // Attendance stats
        const { data: attList } = await supabaseAdmin
          .from('daily_attendance')
          .select('status')
          .eq('bus_id', busId)
          .eq('attendance_date', dutyDate);

        let present = 0;
        let absent = 0;
        if (attList) {
          for (const a of attList) {
            if (a.status === 'present') present++;
            else if (a.status === 'absent') absent++;
          }
        }

        // Standing count
        const { count: standingCount } = await supabaseAdmin
          .from('daily_standing_log')
          .select('*', { count: 'exact', head: true })
          .eq('bus_id', busId)
          .eq('log_date', dutyDate);

        const totalTravelling = present + (standingCount || 0);

        return {
          id: d.id,
          date: d.assignment_date,
          startTime: d.start_time,
          completedAt: d.completed_at,
          status: d.status,
          busNumber: d.buses?.bus_number || 'N/A',
          routeName: d.buses?.route_name || 'N/A',
          seatingCapacity: d.buses?.seating_capacity || 0,
          stats: {
            present,
            absent,
            totalMarked: present + absent,
            standing: standingCount || 0,
            totalTravelling
          }
        };
      })
    );

    res.json({
      success: true,
      history: enhancedHistory
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/staff/history/:assignmentId
// Returns full attendance & standing details for a past duty
// ---------------------------------------------------------------------------
async function handleGetHistoricalDetail(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { assignmentId } = req.params;

    const { data: duty, error: dutyErr } = await supabaseAdmin
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
          full_name,
          email
        )
      `)
      .eq('id', assignmentId)
      .maybeSingle();

    if (dutyErr || !duty) {
      return res.status(404).json({ success: false, error: 'Duty record not found.' });
    }

    const busId = duty.bus_id;
    const dutyDate = duty.assignment_date;

    // Fetch attendance records
    const { data: attendanceList } = await supabaseAdmin
      .from('daily_attendance')
      .select(`
        id,
        status,
        updated_at,
        students (
          full_name,
          roll_number,
          seat_number
        )
      `)
      .eq('bus_id', busId)
      .eq('attendance_date', dutyDate)
      .order('students(seat_number)', { ascending: true, nullsFirst: false });

    // Fetch standing students
    const { data: standingList } = await supabaseAdmin
      .from('daily_standing_log')
      .select(`
        id,
        student_name,
        student_roll,
        standing_reason,
        created_at,
        students (
          full_name,
          roll_number
        )
      `)
      .eq('bus_id', busId)
      .eq('log_date', dutyDate);

    let present = 0;
    let absent = 0;
    const attendanceRecords = (attendanceList || []).map(a => {
      if (a.status === 'present') present++;
      else if (a.status === 'absent') absent++;

      return {
        id: a.id,
        studentName: a.students?.full_name || 'Unknown',
        rollNumber: a.students?.roll_number || 'N/A',
        seatNumber: a.students?.seat_number || 'N/A',
        status: a.status
      };
    });

    const standingRecords = (standingList || []).map(st => ({
      id: st.id,
      studentName: st.student_name || st.students?.full_name || 'Unknown',
      rollNumber: st.student_roll || st.students?.roll_number || 'N/A',
      reason: st.standing_reason
    }));

    res.json({
      success: true,
      dutyDetail: {
        id: duty.id,
        date: duty.assignment_date,
        startTime: duty.start_time,
        completedAt: duty.completed_at,
        status: duty.status,
        bus: duty.buses,
        staff: duty.staff_profiles,
        summary: {
          present,
          absent,
          totalMarked: present + absent,
          standing: standingRecords.length,
          totalTravelling: present + standingRecords.length
        },
        attendance: attendanceRecords,
        standing: standingRecords
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleGetTodayReport,
  handleGetStaffHistory,
  handleGetHistoricalDetail
};
