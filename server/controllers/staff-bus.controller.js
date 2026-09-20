/**
 * Staff Bus Controller (server/controllers/staff-bus.controller.js)
 * Handles daily bus availability, claiming (atomic anti-double-claim),
 * active duty tracking, completion, and student roster access for approved staff.
 */

const { supabaseAdmin, isConfigured } = require('../config/supabase');

function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// GET /api/staff/buses/available
// Returns buses with their daily status for today (Available, In Service, Completed)
// ---------------------------------------------------------------------------
async function handleGetAvailableBuses(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const today = req.query.date || getTodayDateString();

    // 1. Fetch active buses
    const { data: buses, error: busErr } = await supabaseAdmin
      .from('buses')
      .select('id, bus_number, route_name, seating_capacity, is_active')
      .eq('is_active', true)
      .order('bus_number', { ascending: true });

    if (busErr) {
      const err = new Error('Failed to fetch buses: ' + busErr.message);
      err.status = 500;
      throw err;
    }

    // 2. Fetch today's assignments
    const { data: assignments, error: assignErr } = await supabaseAdmin
      .from('daily_bus_assignments')
      .select('id, bus_id, staff_id, status, start_time, staff_profiles(id, full_name, email)')
      .eq('assignment_date', today);

    if (assignErr) {
      const err = new Error('Failed to fetch daily assignments: ' + assignErr.message);
      err.status = 500;
      throw err;
    }

    const assignmentMap = {};
    if (assignments) {
      for (const a of assignments) {
        assignmentMap[a.bus_id] = a;
      }
    }

    // 3. Fetch student counts per bus
    const { data: studentCounts } = await supabaseAdmin
      .from('students')
      .select('bus_id')
      .eq('is_active', true)
      .not('bus_id', 'is', null);

    const countMap = {};
    if (studentCounts) {
      for (const s of studentCounts) {
        countMap[s.bus_id] = (countMap[s.bus_id] || 0) + 1;
      }
    }

    // 4. Combine into final bus list
    const busList = (buses || []).map(b => {
      const assignment = assignmentMap[b.id];
      const isClaimedByMe = assignment ? assignment.staff_id === req.profile.id : false;
      let dailyStatus = 'available';

      if (assignment) {
        dailyStatus = assignment.status; // 'in_service' or 'completed'
      }

      return {
        id: b.id,
        busNumber: b.bus_number,
        routeName: b.route_name,
        seatingCapacity: b.seating_capacity,
        assignedStudentsCount: countMap[b.id] || 0,
        availableSeats: Math.max(0, b.seating_capacity - (countMap[b.id] || 0)),
        dailyStatus, // 'available' | 'in_service' | 'completed'
        assignmentId: assignment?.id || null,
        claimedBy: assignment?.staff_profiles ? {
          id: assignment.staff_profiles.id,
          fullName: assignment.staff_profiles.full_name
        } : null,
        isClaimedByMe,
        canClaim: dailyStatus === 'available'
      };
    });

    res.json({
      success: true,
      date: today,
      buses: busList,
      availableCount: busList.filter(b => b.canClaim).length
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/staff/buses/claim
// Claims an available bus for today. Atomic prevention of double-claiming.
// ---------------------------------------------------------------------------
async function handleClaimBus(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { busId } = req.body;
    if (!busId) {
      return res.status(400).json({ success: false, error: 'Bus ID is required.' });
    }

    const today = getTodayDateString();
    const staffId = req.profile.id;

    // 1. Verify bus exists and is active
    const { data: bus, error: busErr } = await supabaseAdmin
      .from('buses')
      .select('id, bus_number, route_name, seating_capacity, is_active')
      .eq('id', busId)
      .maybeSingle();

    if (busErr || !bus) {
      return res.status(404).json({ success: false, error: 'Bus not found.' });
    }

    if (!bus.is_active) {
      return res.status(400).json({ success: false, error: 'This bus is currently marked inactive by administration.' });
    }

    // 2. Check if staff already has an active in_service duty today
    const { data: existingStaffDuty } = await supabaseAdmin
      .from('daily_bus_assignments')
      .select('id, bus_id, status, buses(bus_number)')
      .eq('staff_id', staffId)
      .eq('assignment_date', today)
      .eq('status', 'in_service')
      .maybeSingle();

    if (existingStaffDuty) {
      return res.status(400).json({
        success: false,
        error: `You already have an active duty today for Bus ${existingStaffDuty.buses?.bus_number || ''}. Please complete that duty first.`
      });
    }

    // 3. Insert assignment row. Database UNIQUE(bus_id, assignment_date) guarantees atomicity
    const { data: newAssignment, error: insertErr } = await supabaseAdmin
      .from('daily_bus_assignments')
      .insert({
        assignment_date: today,
        bus_id: busId,
        staff_id: staffId,
        start_time: new Date().toISOString(),
        status: 'in_service'
      })
      .select('id, assignment_date, bus_id, staff_id, start_time, status')
      .single();

    if (insertErr) {
      // Check for Postgres unique violation error code 23505
      if (insertErr.code === '23505' || insertErr.message?.includes('duplicate key') || insertErr.message?.includes('uq_daily_bus_assignment')) {
        return res.status(409).json({
          success: false,
          error: 'This bus has already been claimed for today by another staff member.'
        });
      }

      const err = new Error('Failed to claim bus: ' + insertErr.message);
      err.status = 500;
      throw err;
    }

    res.status(201).json({
      success: true,
      message: `Bus ${bus.bus_number} successfully claimed for today. Duty started!`,
      assignment: {
        id: newAssignment.id,
        date: newAssignment.assignment_date,
        busId: newAssignment.bus_id,
        busNumber: bus.bus_number,
        routeName: bus.route_name,
        seatingCapacity: bus.seating_capacity,
        startTime: newAssignment.start_time,
        status: newAssignment.status
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/staff/buses/active
// Returns the logged-in staff member's active bus duty for today with live summary
// ---------------------------------------------------------------------------
async function handleGetActiveBus(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const today = req.query.date || getTodayDateString();
    const staffId = req.profile.id;

    // Find assignment for today
    const { data: assignment, error: assignErr } = await supabaseAdmin
      .from('daily_bus_assignments')
      .select('id, assignment_date, bus_id, staff_id, start_time, completed_at, status, buses(id, bus_number, route_name, seating_capacity)')
      .eq('staff_id', staffId)
      .eq('assignment_date', today)
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (assignErr) {
      const err = new Error('Failed to fetch active duty: ' + assignErr.message);
      err.status = 500;
      throw err;
    }

    if (!assignment) {
      return res.json({
        success: true,
        hasActiveDuty: false,
        activeDuty: null,
        date: today
      });
    }

    const bus = assignment.buses;
    const busId = assignment.bus_id;

    // Fetch assigned students count
    const { count: assignedCount } = await supabaseAdmin
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('bus_id', busId)
      .eq('is_active', true);

    // Fetch attendance records for today
    const { data: attendanceList } = await supabaseAdmin
      .from('daily_attendance')
      .select('status')
      .eq('bus_id', busId)
      .eq('attendance_date', today);

    let presentCount = 0;
    let absentCount = 0;
    if (attendanceList) {
      for (const a of attendanceList) {
        if (a.status === 'present') presentCount++;
        else if (a.status === 'absent') absentCount++;
      }
    }

    // Fetch standing students count for today
    const { count: standingCount } = await supabaseAdmin
      .from('daily_standing_log')
      .select('*', { count: 'exact', head: true })
      .eq('bus_id', busId)
      .eq('log_date', today);

    const totalTravelling = presentCount + (standingCount || 0);

    res.json({
      success: true,
      hasActiveDuty: true,
      date: today,
      activeDuty: {
        id: assignment.id,
        date: assignment.assignment_date,
        startTime: assignment.start_time,
        completedAt: assignment.completed_at,
        status: assignment.status, // 'in_service' | 'completed'
        staffName: req.profile.fullName,
        bus: {
          id: bus.id,
          busNumber: bus.bus_number,
          routeName: bus.route_name,
          seatingCapacity: bus.seating_capacity
        },
        stats: {
          seatingCapacity: bus.seating_capacity,
          assignedStudents: assignedCount || 0,
          present: presentCount,
          absent: absentCount,
          standing: standingCount || 0,
          totalTravellingToday: totalTravelling
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/staff/buses/complete-duty
// Marks duty completed (in_service -> completed)
// ---------------------------------------------------------------------------
async function handleCompleteBusDuty(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { assignmentId } = req.body;
    const staffId = req.profile.id;
    const today = getTodayDateString();

    let query = supabaseAdmin
      .from('daily_bus_assignments')
      .select('id, bus_id, status, buses(bus_number)')
      .eq('staff_id', staffId)
      .eq('assignment_date', today);

    if (assignmentId) {
      query = query.eq('id', assignmentId);
    } else {
      query = query.eq('status', 'in_service');
    }

    const { data: duty, error: dutyErr } = await query.maybeSingle();

    if (dutyErr || !duty) {
      return res.status(404).json({ success: false, error: 'No active duty found to complete for today.' });
    }

    if (duty.status === 'completed') {
      return res.status(400).json({ success: false, error: 'This duty has already been marked completed.' });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('daily_bus_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', duty.id)
      .select('id, status, completed_at')
      .single();

    if (updateErr) {
      const err = new Error('Failed to complete duty: ' + updateErr.message);
      err.status = 500;
      throw err;
    }

    res.json({
      success: true,
      message: `Daily duty for Bus ${duty.buses?.bus_number || ''} has been completed successfully.`,
      duty: updated
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/staff/buses/students
// Fetches permanently assigned students for staff's bus
// ---------------------------------------------------------------------------
async function handleGetBusStudents(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { busId } = req.query;
    if (!busId) {
      return res.status(400).json({ success: false, error: 'Bus ID is required.' });
    }

    const { data: students, error: studErr } = await supabaseAdmin
      .from('students')
      .select('id, full_name, roll_number, seat_number, is_active, bus_id')
      .eq('bus_id', busId)
      .eq('is_active', true)
      .order('seat_number', { ascending: true, nullsFirst: false });

    if (studErr) {
      const err = new Error('Failed to fetch bus students: ' + studErr.message);
      err.status = 500;
      throw err;
    }

    res.json({
      success: true,
      students: (students || []).map(s => ({
        id: s.id,
        fullName: s.full_name,
        rollNumber: s.roll_number,
        seatNumber: s.seat_number,
        busId: s.bus_id
      }))
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/staff/students
// Staff adds a new student directly to their bus with full validation
// ---------------------------------------------------------------------------
async function handleStaffAddStudent(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { fullName, rollNumber, seatNumber, busId } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ success: false, error: 'Student full name is required.' });
    }
    if (!rollNumber || !rollNumber.trim()) {
      return res.status(400).json({ success: false, error: 'Roll number is required.' });
    }
    if (!busId) {
      return res.status(400).json({ success: false, error: 'Bus ID is required.' });
    }

    const trimmedName = fullName.trim();
    const trimmedRoll = rollNumber.trim().toUpperCase();

    // Check bus capacity
    const { data: bus, error: busErr } = await supabaseAdmin
      .from('buses')
      .select('id, bus_number, seating_capacity')
      .eq('id', busId)
      .maybeSingle();

    if (busErr || !bus) {
      return res.status(404).json({ success: false, error: 'Bus not found.' });
    }

    let parsedSeat = null;
    if (seatNumber !== undefined && seatNumber !== null && seatNumber !== '') {
      parsedSeat = parseInt(seatNumber, 10);
      if (isNaN(parsedSeat) || parsedSeat <= 0) {
        return res.status(400).json({ success: false, error: 'Seat number must be a positive integer.' });
      }
      if (parsedSeat > bus.seating_capacity) {
        return res.status(400).json({
          success: false,
          error: `Seat number ${parsedSeat} exceeds Bus ${bus.bus_number} capacity (${bus.seating_capacity} seats).`
        });
      }

      // Check if seat is already occupied
      const { data: existingSeat } = await supabaseAdmin
        .from('students')
        .select('id, full_name, roll_number')
        .eq('bus_id', busId)
        .eq('seat_number', parsedSeat)
        .maybeSingle();

      if (existingSeat) {
        return res.status(409).json({
          success: false,
          error: `Seat ${parsedSeat} is already occupied by ${existingSeat.full_name} (${existingSeat.roll_number}).`
        });
      }
    }

    // Check roll number uniqueness
    const { data: existingRoll } = await supabaseAdmin
      .from('students')
      .select('id')
      .ilike('roll_number', trimmedRoll)
      .maybeSingle();

    if (existingRoll) {
      return res.status(409).json({
        success: false,
        error: `Roll number ${trimmedRoll} is already registered in the system.`
      });
    }

    // Insert student
    const { data: newStudent, error: insertErr } = await supabaseAdmin
      .from('students')
      .insert({
        full_name: trimmedName,
        roll_number: trimmedRoll,
        bus_id: busId,
        seat_number: parsedSeat,
        is_active: true
      })
      .select('id, full_name, roll_number, bus_id, seat_number, created_at')
      .single();

    if (insertErr) {
      const err = new Error('Failed to register student: ' + insertErr.message);
      err.status = 500;
      throw err;
    }

    res.status(201).json({
      success: true,
      message: `Student ${trimmedName} successfully added to Bus ${bus.bus_number}.`,
      student: {
        id: newStudent.id,
        fullName: newStudent.full_name,
        rollNumber: newStudent.roll_number,
        busId: newStudent.bus_id,
        seatNumber: newStudent.seat_number
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleGetAvailableBuses,
  handleClaimBus,
  handleGetActiveBus,
  handleCompleteBusDuty,
  handleGetBusStudents,
  handleStaffAddStudent
};
