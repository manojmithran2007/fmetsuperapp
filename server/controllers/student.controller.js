/**
 * Student Management Controller (server/controllers/student.controller.js)
 * Admin-only CRUD for students, bus assignments, seat management, and moves.
 */

const { supabaseAdmin, isConfigured } = require('../config/supabase');
const { logAuditEvent } = require('./audit.controller');

// Shared select string with joined bus info
const STUDENT_SELECT = 'id, full_name, roll_number, bus_id, seat_number, is_active, created_at, updated_at, buses(bus_number, route_name, seating_capacity)';

// ---------------------------------------------------------------------------
// GET /api/admin/students?search=&busId=
// busId: UUID → filter by bus | 'unassigned' → no bus | '' or 'all' → all
// ---------------------------------------------------------------------------
async function handleGetStudents(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { search, busId } = req.query;

    let query = supabaseAdmin
      .from('students')
      .select(STUDENT_SELECT)
      .order('created_at', { ascending: false });

    if (search && search.trim()) {
      const term = search.trim();
      query = query.or(`full_name.ilike.%${term}%,roll_number.ilike.%${term}%`);
    }

    if (busId && busId !== 'all') {
      if (busId === 'unassigned') {
        query = query.is('bus_id', null);
      } else {
        query = query.eq('bus_id', busId);
      }
    }

    const { data: students, error: stuErr } = await query;

    if (stuErr) {
      const err = new Error('Failed to fetch students: ' + stuErr.message);
      err.status = 500;
      throw err;
    }

    return res.status(200).json({
      success: true,
      students: students || [],
      total: (students || []).length
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/students
// Creates a student; optionally assigns to a bus+seat immediately.
// ---------------------------------------------------------------------------
async function handleCreateStudent(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { fullName, rollNumber, busId, seatNumber } = req.body;

    if (!fullName || !String(fullName).trim()) {
      return res.status(400).json({ success: false, error: 'Student name is required.' });
    }
    if (!rollNumber || !String(rollNumber).trim()) {
      return res.status(400).json({ success: false, error: 'Roll number is required.' });
    }

    const cleanName = String(fullName).trim();
    const cleanRoll = String(rollNumber).trim().toUpperCase();

    // Duplicate roll number check
    const { data: dupRoll } = await supabaseAdmin
      .from('students').select('id').eq('roll_number', cleanRoll).maybeSingle();
    if (dupRoll) {
      return res.status(409).json({ success: false, error: `Roll number "${cleanRoll}" is already assigned to another student.` });
    }

    let busIdToSet   = null;
    let parsedSeat   = null;

    if (busId && String(busId).trim()) {
      const { data: bus } = await supabaseAdmin
        .from('buses').select('id, bus_number, seating_capacity').eq('id', String(busId).trim()).maybeSingle();
      if (!bus) {
        return res.status(400).json({ success: false, error: 'Selected bus does not exist.' });
      }
      busIdToSet = bus.id;

      if (seatNumber !== undefined && seatNumber !== null && seatNumber !== '') {
        parsedSeat = parseInt(seatNumber, 10);
        if (isNaN(parsedSeat) || parsedSeat <= 0) {
          return res.status(400).json({ success: false, error: 'Seat number must be a positive integer.' });
        }
        if (parsedSeat > bus.seating_capacity) {
          return res.status(400).json({
            success: false,
            error: `Seat ${parsedSeat} exceeds bus "${bus.bus_number}" capacity of ${bus.seating_capacity}.`
          });
        }
        // Seat occupied?
        const { data: occupied } = await supabaseAdmin
          .from('students').select('id').eq('bus_id', bus.id).eq('seat_number', parsedSeat).maybeSingle();
        if (occupied) {
          return res.status(409).json({ success: false, error: `Seat ${parsedSeat} on bus "${bus.bus_number}" is already occupied.` });
        }
      }
    }

    const { data: created, error: insertErr } = await supabaseAdmin
      .from('students')
      .insert([{ full_name: cleanName, roll_number: cleanRoll, bus_id: busIdToSet, seat_number: parsedSeat, is_active: true }])
      .select(STUDENT_SELECT)
      .single();

    if (insertErr) {
      const err = new Error('Failed to create student: ' + insertErr.message);
      err.status = 500;
      throw err;
    }

    await logAuditEvent({
      action: 'STUDENT_CREATED',
      entityType: 'student',
      entityId: created.id,
      performedBy: req.user?.id,
      details: { full_name: created.full_name, roll_number: created.roll_number, bus_id: created.bus_id, seat_number: created.seat_number }
    });

    return res.status(201).json({
      success: true,
      message: `Student "${created.full_name}" added successfully.`,
      student: created
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/admin/students/:id
// Updates name and roll number only. Bus/seat is managed via assign/move.
// ---------------------------------------------------------------------------
async function handleUpdateStudent(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { id } = req.params;
    const { fullName, rollNumber } = req.body;

    if (!fullName || !String(fullName).trim()) {
      return res.status(400).json({ success: false, error: 'Student name is required.' });
    }
    if (!rollNumber || !String(rollNumber).trim()) {
      return res.status(400).json({ success: false, error: 'Roll number is required.' });
    }

    const cleanName = String(fullName).trim();
    const cleanRoll = String(rollNumber).trim().toUpperCase();

    const { data: existing } = await supabaseAdmin
      .from('students').select('id').eq('id', id).maybeSingle();
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    // Duplicate roll check excluding self
    const { data: dupRoll } = await supabaseAdmin
      .from('students').select('id').eq('roll_number', cleanRoll).neq('id', id).maybeSingle();
    if (dupRoll) {
      return res.status(409).json({ success: false, error: `Roll number "${cleanRoll}" is already assigned to another student.` });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('students')
      .update({ full_name: cleanName, roll_number: cleanRoll })
      .eq('id', id)
      .select(STUDENT_SELECT)
      .single();

    if (updateErr) {
      const err = new Error('Failed to update student: ' + updateErr.message);
      err.status = 500;
      throw err;
    }

    return res.status(200).json({
      success: true,
      message: `Student "${updated.full_name}" updated successfully.`,
      student: updated
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/students/:id
// ---------------------------------------------------------------------------
async function handleDeleteStudent(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { id } = req.params;

    const { data: existing } = await supabaseAdmin
      .from('students').select('id, full_name, roll_number').eq('id', id).maybeSingle();
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    const { error: deleteErr } = await supabaseAdmin.from('students').delete().eq('id', id);
    if (deleteErr) {
      const err = new Error('Failed to delete student: ' + deleteErr.message);
      err.status = 500;
      throw err;
    }

    await logAuditEvent({
      action: 'STUDENT_DELETED',
      entityType: 'student',
      entityId: id,
      performedBy: req.user?.id,
      details: { full_name: existing.full_name, roll_number: existing.roll_number }
    });

    return res.status(200).json({
      success: true,
      message: `Student "${existing.full_name}" (${existing.roll_number}) removed successfully.`
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/students/:id/assign
// Assigns a student (currently unassigned or reassigning) to a bus+seat.
// ---------------------------------------------------------------------------
async function handleAssignStudent(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { id }               = req.params;
    const { busId, seatNumber } = req.body;

    if (!busId) {
      return res.status(400).json({ success: false, error: 'Bus selection is required.' });
    }

    const { data: student } = await supabaseAdmin
      .from('students').select('id, full_name').eq('id', id).maybeSingle();
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    const { data: bus } = await supabaseAdmin
      .from('buses').select('id, bus_number, seating_capacity').eq('id', busId).maybeSingle();
    if (!bus) {
      return res.status(400).json({ success: false, error: 'Selected bus does not exist.' });
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
          error: `Seat ${parsedSeat} exceeds bus "${bus.bus_number}" capacity of ${bus.seating_capacity}.`
        });
      }
      const { data: occupied } = await supabaseAdmin
        .from('students').select('id').eq('bus_id', bus.id).eq('seat_number', parsedSeat).neq('id', id).maybeSingle();
      if (occupied) {
        return res.status(409).json({ success: false, error: `Seat ${parsedSeat} on bus "${bus.bus_number}" is already occupied by another student.` });
      }
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('students')
      .update({ bus_id: bus.id, seat_number: parsedSeat })
      .eq('id', id)
      .select(STUDENT_SELECT)
      .single();

    if (updateErr) {
      const err = new Error('Failed to assign student: ' + updateErr.message);
      err.status = 500;
      throw err;
    }

    await logAuditEvent({
      action: 'STUDENT_ASSIGNED',
      entityType: 'student',
      entityId: id,
      performedBy: req.user?.id,
      details: { full_name: student.full_name, bus_number: bus.bus_number, seat_number: parsedSeat }
    });

    const seatMsg = parsedSeat ? `, seat ${parsedSeat}` : '';
    return res.status(200).json({
      success: true,
      message: `Student "${student.full_name}" assigned to bus ${bus.bus_number}${seatMsg}.`,
      student: updated
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/students/:id/move
// Moves student to a different bus (and optionally a new seat).
// ---------------------------------------------------------------------------
async function handleMoveStudent(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { id }                       = req.params;
    const { newBusId, newSeatNumber }   = req.body;

    if (!newBusId) {
      return res.status(400).json({ success: false, error: 'Destination bus is required.' });
    }

    const { data: student } = await supabaseAdmin
      .from('students').select('id, full_name').eq('id', id).maybeSingle();
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    const { data: newBus } = await supabaseAdmin
      .from('buses').select('id, bus_number, seating_capacity').eq('id', newBusId).maybeSingle();
    if (!newBus) {
      return res.status(400).json({ success: false, error: 'Destination bus does not exist.' });
    }

    let parsedSeat = null;
    if (newSeatNumber !== undefined && newSeatNumber !== null && newSeatNumber !== '') {
      parsedSeat = parseInt(newSeatNumber, 10);
      if (isNaN(parsedSeat) || parsedSeat <= 0) {
        return res.status(400).json({ success: false, error: 'Seat number must be a positive integer.' });
      }
      if (parsedSeat > newBus.seating_capacity) {
        return res.status(400).json({
          success: false,
          error: `Seat ${parsedSeat} exceeds destination bus "${newBus.bus_number}" capacity of ${newBus.seating_capacity}.`
        });
      }
      const { data: occupied } = await supabaseAdmin
        .from('students').select('id').eq('bus_id', newBus.id).eq('seat_number', parsedSeat).neq('id', id).maybeSingle();
      if (occupied) {
        return res.status(409).json({
          success: false,
          error: `Seat ${parsedSeat} on bus "${newBus.bus_number}" is already occupied by another student.`
        });
      }
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('students')
      .update({ bus_id: newBus.id, seat_number: parsedSeat })
      .eq('id', id)
      .select(STUDENT_SELECT)
      .single();

    if (updateErr) {
      const err = new Error('Failed to move student: ' + updateErr.message);
      err.status = 500;
      throw err;
    }

    await logAuditEvent({
      action: 'STUDENT_MOVED',
      entityType: 'student',
      entityId: id,
      performedBy: req.user?.id,
      details: { full_name: student.full_name, destination_bus: newBus.bus_number, new_seat: parsedSeat }
    });

    const seatMsg = parsedSeat ? `, seat ${parsedSeat}` : '';
    return res.status(200).json({
      success: true,
      message: `Student "${student.full_name}" moved to bus ${newBus.bus_number}${seatMsg}.`,
      student: updated
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/students/:id/unassign
// Removes a student's bus assignment (student record remains).
// ---------------------------------------------------------------------------
async function handleUnassignStudent(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { id } = req.params;

    const { data: student } = await supabaseAdmin
      .from('students').select('id, full_name').eq('id', id).maybeSingle();
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('students')
      .update({ bus_id: null, seat_number: null })
      .eq('id', id)
      .select(STUDENT_SELECT)
      .single();

    if (updateErr) {
      const err = new Error('Failed to unassign student: ' + updateErr.message);
      err.status = 500;
      throw err;
    }

    await logAuditEvent({
      action: 'STUDENT_UNASSIGNED',
      entityType: 'student',
      entityId: id,
      performedBy: req.user?.id,
      details: { full_name: student.full_name }
    });

    return res.status(200).json({
      success: true,
      message: `Student "${student.full_name}" removed from bus assignment.`,
      student: updated
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleGetStudents,
  handleCreateStudent,
  handleUpdateStudent,
  handleDeleteStudent,
  handleAssignStudent,
  handleMoveStudent,
  handleUnassignStudent
};
