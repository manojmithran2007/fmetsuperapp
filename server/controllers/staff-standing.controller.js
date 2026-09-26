/**
 * Staff Standing Students Controller (server/controllers/staff-standing.controller.js)
 * Manages daily non-seated / standing student entries per bus.
 * Strictly enforces fixed standing reasons and anti-duplicate rules.
 */

const { supabaseAdmin, isConfigured } = require('../config/supabase');

const VALID_STANDING_REASONS = [
  'temporary',
  'missed_regular_bus',
  'route_change',
  'no_capacity'
];

function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// GET /api/staff/standing/today?busId=&date=
// Returns list of standing students recorded for a bus on a date
// ---------------------------------------------------------------------------
async function handleGetTodayStanding(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { busId } = req.query;
    const date = req.query.date || getTodayDateString();

    if (!busId) {
      return res.status(400).json({ success: false, error: 'Bus ID is required.' });
    }

    const { data: logs, error: logErr } = await supabaseAdmin
      .from('daily_standing_log')
      .select(`
        id,
        log_date,
        bus_id,
        student_id,
        student_name,
        student_roll,
        standing_reason,
        created_at,
        students (
          id,
          full_name,
          roll_number,
          seat_number,
          bus_id,
          buses (
            bus_number
          )
        ),
        staff_profiles (
          full_name
        )
      `)
      .eq('bus_id', busId)
      .eq('log_date', date)
      .order('created_at', { ascending: true });

    if (logErr) {
      const err = new Error('Failed to fetch standing log: ' + logErr.message);
      err.status = 500;
      throw err;
    }

    const formatted = (logs || []).map(l => ({
      id: l.id,
      date: l.log_date,
      busId: l.bus_id,
      studentId: l.student_id,
      studentName: l.student_name || l.students?.full_name || 'Unknown',
      rollNumber: l.student_roll || l.students?.roll_number || 'N/A',
      regularBusNumber: l.students?.buses?.bus_number || 'Unassigned',
      regularSeatNumber: l.students?.seat_number || 'None',
      standingReason: l.standing_reason,
      recordedBy: l.staff_profiles?.full_name || 'Staff',
      createdAt: l.created_at
    }));

    res.json({
      success: true,
      date,
      busId,
      standingStudents: formatted,
      count: formatted.length
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/staff/standing
// Adds a standing student to a bus for the day (direct entry supported)
// ---------------------------------------------------------------------------
async function handleAddStandingStudent(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { busId, studentName, rollNumber, studentId, reason, assignmentId, date } = req.body;

    if (!busId) {
      return res.status(400).json({ success: false, error: 'Bus ID is required.' });
    }

    const cleanName = (studentName || '').trim();
    const cleanRoll = (rollNumber || '').trim().toUpperCase();

    if (!cleanRoll) {
      return res.status(400).json({ success: false, error: 'Student roll number is required.' });
    }

    if (!reason) {
      return res.status(400).json({ success: false, error: 'Standing reason is required.' });
    }

    const normalizedReason = reason.toLowerCase().trim();
    if (!VALID_STANDING_REASONS.includes(normalizedReason)) {
      return res.status(400).json({
        success: false,
        error: `Invalid standing reason. Allowed values: ${VALID_STANDING_REASONS.join(', ')}.`
      });
    }

    const logDate = date || getTodayDateString();
    const staffId = req.profile.id;

    // 1. Check if student matches an existing record in regular students list (optional link)
    let resolvedStudentId = studentId || null;
    let finalStudentName = cleanName;
    let regularBusNumber = 'Unassigned';

    if (cleanRoll) {
      const { data: matchedStudent } = await supabaseAdmin
        .from('students')
        .select('id, full_name, roll_number, bus_id, buses(bus_number)')
        .ilike('roll_number', cleanRoll)
        .maybeSingle();

      if (matchedStudent) {
        resolvedStudentId = matchedStudent.id;
        if (!finalStudentName) {
          finalStudentName = matchedStudent.full_name;
        }
        if (matchedStudent.buses?.bus_number) {
          regularBusNumber = matchedStudent.buses.bus_number;
        }
      }
    }

    if (!finalStudentName) {
      return res.status(400).json({ success: false, error: 'Student name is required.' });
    }

    // 2. Check if already marked standing on this date
    let dupQuery = supabaseAdmin
      .from('daily_standing_log')
      .select('id, bus_id, log_date, student_roll, student_name, buses(bus_number)')
      .eq('log_date', logDate);

    if (resolvedStudentId) {
      dupQuery = dupQuery.or(`student_id.eq.${resolvedStudentId},student_roll.ilike.${cleanRoll}`);
    } else {
      dupQuery = dupQuery.ilike('student_roll', cleanRoll);
    }

    const { data: existingLogs } = await dupQuery;
    if (existingLogs && existingLogs.length > 0) {
      const existing = existingLogs[0];
      return res.status(409).json({
        success: false,
        error: `Student ${finalStudentName} (${cleanRoll}) is already logged as standing today on Bus ${existing.buses?.bus_number || ''}.`
      });
    }

    // 3. Insert into daily_standing_log
    const insertPayload = {
      log_date: logDate,
      bus_id: busId,
      student_id: resolvedStudentId || null,
      student_name: finalStudentName,
      student_roll: cleanRoll,
      daily_assignment_id: assignmentId || null,
      standing_reason: normalizedReason,
      recorded_by: staffId
    };

    const { data: newLog, error: insertErr } = await supabaseAdmin
      .from('daily_standing_log')
      .insert(insertPayload)
      .select(`
        id,
        log_date,
        bus_id,
        student_id,
        student_name,
        student_roll,
        standing_reason,
        created_at
      `)
      .single();

    if (insertErr) {
      if (insertErr.code === '23505' || insertErr.message?.includes('duplicate key')) {
        return res.status(409).json({
          success: false,
          error: 'This student has already been recorded as standing for today.'
        });
      }
      const err = new Error('Failed to record standing student: ' + insertErr.message);
      err.status = 500;
      throw err;
    }

    res.status(201).json({
      success: true,
      message: `${finalStudentName} (${cleanRoll}) recorded as standing for today.`,
      standingStudent: {
        id: newLog.id,
        date: newLog.log_date,
        busId: newLog.bus_id,
        studentId: newLog.student_id,
        studentName: newLog.student_name || finalStudentName,
        rollNumber: newLog.student_roll || cleanRoll,
        regularBusNumber,
        standingReason: newLog.standing_reason,
        createdAt: newLog.created_at
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/staff/standing/:id
// Removes a standing student record
// ---------------------------------------------------------------------------
async function handleRemoveStandingStudent(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Standing record ID is required.' });
    }

    const { error: delErr } = await supabaseAdmin
      .from('daily_standing_log')
      .delete()
      .eq('id', id);

    if (delErr) {
      const err = new Error('Failed to remove standing student record: ' + delErr.message);
      err.status = 500;
      throw err;
    }

    res.json({
      success: true,
      message: 'Standing student record removed successfully.'
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/staff/standing/search-students?q=
// Quick autocomplete search for existing students by roll number or name
// ---------------------------------------------------------------------------
async function handleSearchStudents(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ success: true, students: [] });
    }

    const { data: students, error: sErr } = await supabaseAdmin
      .from('students')
      .select('id, full_name, roll_number, seat_number, bus_id, buses(bus_number)')
      .eq('is_active', true)
      .or(`roll_number.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(10);

    if (sErr) {
      const err = new Error('Student search failed: ' + sErr.message);
      err.status = 500;
      throw err;
    }

    res.json({
      success: true,
      students: (students || []).map(s => ({
        id: s.id,
        fullName: s.full_name,
        rollNumber: s.roll_number,
        regularBusNumber: s.buses?.bus_number || 'Unassigned',
        seatNumber: s.seat_number || 'None'
      }))
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleGetTodayStanding,
  handleAddStandingStudent,
  handleRemoveStandingStudent,
  handleSearchStudents
};
