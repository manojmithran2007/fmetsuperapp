/**
 * Staff Attendance Controller (server/controllers/staff-attendance.controller.js)
 * Manages daily student attendance register, batch saving, editing, and stats.
 */

const { supabaseAdmin, isConfigured } = require('../config/supabase');

function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// GET /api/staff/attendance/today?busId=&date=
// Returns the attendance register for a specific bus and date
// ---------------------------------------------------------------------------
async function handleGetTodayAttendance(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { busId } = req.query;
    const date = req.query.date || getTodayDateString();

    if (!busId) {
      return res.status(400).json({ success: false, error: 'Bus ID is required.' });
    }

    // 1. Fetch all active students assigned to this bus
    const { data: students, error: studErr } = await supabaseAdmin
      .from('students')
      .select('id, full_name, roll_number, seat_number, bus_id')
      .eq('bus_id', busId)
      .eq('is_active', true)
      .order('seat_number', { ascending: true, nullsFirst: false });

    if (studErr) {
      const err = new Error('Failed to fetch students: ' + studErr.message);
      err.status = 500;
      throw err;
    }

    // 2. Fetch existing attendance records for this date and bus
    const { data: attendanceRows, error: attErr } = await supabaseAdmin
      .from('daily_attendance')
      .select('id, student_id, status, updated_at, recorded_by, staff_profiles(full_name)')
      .eq('bus_id', busId)
      .eq('attendance_date', date);

    if (attErr) {
      const err = new Error('Failed to fetch attendance records: ' + attErr.message);
      err.status = 500;
      throw err;
    }

    const attMap = {};
    if (attendanceRows) {
      for (const row of attendanceRows) {
        attMap[row.student_id] = row;
      }
    }

    let presentCount = 0;
    let absentCount = 0;
    let unmarkedCount = 0;

    const studentList = (students || []).map(s => {
      const record = attMap[s.id];
      const status = record ? record.status : null; // 'present' | 'absent' | null

      if (status === 'present') presentCount++;
      else if (status === 'absent') absentCount++;
      else unmarkedCount++;

      return {
        studentId: s.id,
        fullName: s.full_name,
        rollNumber: s.roll_number,
        seatNumber: s.seat_number,
        status: status || 'unmarked',
        isMarked: !!record,
        recordId: record ? record.id : null,
        updatedAt: record ? record.updated_at : null
      };
    });

    res.json({
      success: true,
      date,
      busId,
      students: studentList,
      stats: {
        total: studentList.length,
        present: presentCount,
        absent: absentCount,
        unmarked: unmarkedCount,
        isComplete: unmarkedCount === 0 && studentList.length > 0
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/staff/attendance
// Upserts attendance records for students on a specific bus and date
// ---------------------------------------------------------------------------
async function handleSaveAttendance(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { busId, assignmentId, records, date } = req.body;

    if (!busId) {
      return res.status(400).json({ success: false, error: 'Bus ID is required.' });
    }
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: 'Records array is required.' });
    }

    const attendanceDate = date || getTodayDateString();
    const staffId = req.profile.id;

    // Validate records
    const validRows = [];
    for (const r of records) {
      if (!r.studentId) continue;
      const status = (r.status || '').toLowerCase().trim();
      if (status !== 'present' && status !== 'absent') {
        return res.status(400).json({
          success: false,
          error: `Invalid status "${r.status}" for student ${r.studentId}. Status must be 'present' or 'absent'.`
        });
      }

      validRows.push({
        attendance_date: attendanceDate,
        bus_id: busId,
        student_id: r.studentId,
        daily_assignment_id: assignmentId || null,
        status,
        recorded_by: staffId,
        updated_at: new Date().toISOString()
      });
    }

    if (validRows.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid attendance rows provided.' });
    }

    // Upsert into daily_attendance on conflict (attendance_date, student_id)
    const { data: savedRows, error: upsertErr } = await supabaseAdmin
      .from('daily_attendance')
      .upsert(validRows, {
        onConflict: 'attendance_date,student_id'
      })
      .select('id, student_id, status');

    if (upsertErr) {
      const err = new Error('Failed to save attendance: ' + upsertErr.message);
      err.status = 500;
      throw err;
    }

    let present = 0;
    let absent = 0;
    for (const r of validRows) {
      if (r.status === 'present') present++;
      else if (r.status === 'absent') absent++;
    }

    res.json({
      success: true,
      message: `Attendance saved successfully for ${validRows.length} students (${present} present, ${absent} absent).`,
      savedCount: validRows.length,
      stats: {
        total: validRows.length,
        present,
        absent
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleGetTodayAttendance,
  handleSaveAttendance
};
