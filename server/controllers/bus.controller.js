/**
 * Bus Management Controller (server/controllers/bus.controller.js)
 * Admin-only CRUD for buses and bus-details with student counts.
 */

const { supabaseAdmin, isConfigured } = require('../config/supabase');
const { logAuditEvent } = require('./audit.controller');

// ---------------------------------------------------------------------------
// GET /api/admin/buses?search=
// Returns all buses with assigned-student counts and available-seat counts.
// ---------------------------------------------------------------------------
async function handleGetBuses(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { search } = req.query;

    let query = supabaseAdmin
      .from('buses')
      .select('id, bus_number, route_name, seating_capacity, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (search && search.trim()) {
      const term = search.trim();
      query = query.or(`bus_number.ilike.%${term}%,route_name.ilike.%${term}%`);
    }

    const { data: buses, error: busErr } = await query;

    if (busErr) {
      const err = new Error('Failed to fetch buses: ' + busErr.message);
      err.status = 500;
      throw err;
    }

    // Fetch assigned-student counts per bus in one query
    const { data: assignments } = await supabaseAdmin
      .from('students')
      .select('bus_id')
      .not('bus_id', 'is', null);

    const countMap = {};
    if (assignments) {
      assignments.forEach(({ bus_id }) => {
        countMap[bus_id] = (countMap[bus_id] || 0) + 1;
      });
    }

    const enriched = (buses || []).map(bus => ({
      ...bus,
      assigned_students: countMap[bus.id] || 0,
      available_seats:   bus.seating_capacity - (countMap[bus.id] || 0)
    }));

    return res.status(200).json({ success: true, buses: enriched, total: enriched.length });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/buses/:id
// Returns single bus with its full student list.
// ---------------------------------------------------------------------------
async function handleGetBusDetails(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { id } = req.params;

    const { data: bus, error: busErr } = await supabaseAdmin
      .from('buses')
      .select('id, bus_number, route_name, seating_capacity, is_active, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();

    if (busErr || !bus) {
      return res.status(404).json({ success: false, error: 'Bus not found.' });
    }

    const { data: students } = await supabaseAdmin
      .from('students')
      .select('id, full_name, roll_number, seat_number, is_active')
      .eq('bus_id', id)
      .order('seat_number', { ascending: true, nullsFirst: false });

    const studentList = students || [];

    return res.status(200).json({
      success: true,
      bus: {
        ...bus,
        assigned_students: studentList.length,
        available_seats:   bus.seating_capacity - studentList.length
      },
      students: studentList
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/buses
// ---------------------------------------------------------------------------
async function handleCreateBus(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { busNumber, routeName, seatingCapacity } = req.body;

    if (!busNumber || !String(busNumber).trim()) {
      return res.status(400).json({ success: false, error: 'Bus number is required.' });
    }
    if (!routeName || !String(routeName).trim()) {
      return res.status(400).json({ success: false, error: 'Route name is required.' });
    }
    const capacity = parseInt(seatingCapacity, 10);
    if (isNaN(capacity) || capacity <= 0) {
      return res.status(400).json({ success: false, error: 'Seating capacity must be a positive number.' });
    }

    const cleanNumber = String(busNumber).trim().toUpperCase();
    const cleanRoute  = String(routeName).trim();

    // Duplicate check
    const { data: dup } = await supabaseAdmin
      .from('buses').select('id').eq('bus_number', cleanNumber).maybeSingle();
    if (dup) {
      return res.status(409).json({ success: false, error: `Bus number "${cleanNumber}" already exists.` });
    }

    const { data: created, error: insertErr } = await supabaseAdmin
      .from('buses')
      .insert([{ bus_number: cleanNumber, route_name: cleanRoute, seating_capacity: capacity, is_active: true }])
      .select('id, bus_number, route_name, seating_capacity, is_active, created_at, updated_at')
      .single();

    if (insertErr) {
      const err = new Error('Failed to create bus: ' + insertErr.message);
      err.status = 500;
      throw err;
    }

    await logAuditEvent({
      action: 'BUS_CREATED',
      entityType: 'bus',
      entityId: created.id,
      performedBy: req.user?.id,
      details: { bus_number: created.bus_number, route_name: created.route_name, seating_capacity: created.seating_capacity }
    });

    return res.status(201).json({
      success: true,
      message: `Bus "${created.bus_number}" created successfully.`,
      bus: { ...created, assigned_students: 0, available_seats: created.seating_capacity }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/admin/buses/:id
// ---------------------------------------------------------------------------
async function handleUpdateBus(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { id }   = req.params;
    const { busNumber, routeName, seatingCapacity } = req.body;

    if (!busNumber || !String(busNumber).trim()) {
      return res.status(400).json({ success: false, error: 'Bus number is required.' });
    }
    if (!routeName || !String(routeName).trim()) {
      return res.status(400).json({ success: false, error: 'Route name is required.' });
    }
    const capacity = parseInt(seatingCapacity, 10);
    if (isNaN(capacity) || capacity <= 0) {
      return res.status(400).json({ success: false, error: 'Seating capacity must be a positive number.' });
    }

    const cleanNumber = String(busNumber).trim().toUpperCase();
    const cleanRoute  = String(routeName).trim();

    // Existence check
    const { data: existing } = await supabaseAdmin
      .from('buses').select('id, seating_capacity').eq('id', id).maybeSingle();
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Bus not found.' });
    }

    // Duplicate bus_number check (exclude current)
    const { data: dup } = await supabaseAdmin
      .from('buses').select('id').eq('bus_number', cleanNumber).neq('id', id).maybeSingle();
    if (dup) {
      return res.status(409).json({ success: false, error: `Bus number "${cleanNumber}" is already in use by another bus.` });
    }

    // Capacity reduction safety: count seated students
    if (capacity < existing.seating_capacity) {
      const { data: seated } = await supabaseAdmin
        .from('students').select('id').eq('bus_id', id).not('seat_number', 'is', null);
      const seatedCount = (seated || []).length;
      if (capacity < seatedCount) {
        return res.status(400).json({
          success: false,
          error: `Cannot reduce capacity to ${capacity}. Bus has ${seatedCount} student(s) with assigned seats. Capacity must be at least ${seatedCount}.`
        });
      }
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('buses')
      .update({ bus_number: cleanNumber, route_name: cleanRoute, seating_capacity: capacity })
      .eq('id', id)
      .select('id, bus_number, route_name, seating_capacity, is_active, created_at, updated_at')
      .single();

    if (updateErr) {
      const err = new Error('Failed to update bus: ' + updateErr.message);
      err.status = 500;
      throw err;
    }

    await logAuditEvent({
      action: 'BUS_UPDATED',
      entityType: 'bus',
      entityId: updated.id,
      performedBy: req.user?.id,
      details: { bus_number: updated.bus_number, route_name: updated.route_name, seating_capacity: updated.seating_capacity }
    });

    return res.status(200).json({
      success: true,
      message: `Bus "${updated.bus_number}" updated successfully.`,
      bus: updated
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/buses/:id
// Blocked if any students are still assigned to this bus.
// ---------------------------------------------------------------------------
async function handleDeleteBus(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const { id } = req.params;

    const { data: existing } = await supabaseAdmin
      .from('buses').select('id, bus_number').eq('id', id).maybeSingle();
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Bus not found.' });
    }

    const { data: assigned } = await supabaseAdmin
      .from('students').select('id').eq('bus_id', id);
    const assignedCount = (assigned || []).length;
    if (assignedCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete bus "${existing.bus_number}". It has ${assignedCount} student(s) assigned. Please reassign or remove them first.`
      });
    }

    const { error: deleteErr } = await supabaseAdmin.from('buses').delete().eq('id', id);
    if (deleteErr) {
      const err = new Error('Failed to delete bus: ' + deleteErr.message);
      err.status = 500;
      throw err;
    }

    await logAuditEvent({
      action: 'BUS_DELETED',
      entityType: 'bus',
      entityId: id,
      performedBy: req.user?.id,
      details: { bus_number: existing.bus_number }
    });

    return res.status(200).json({
      success: true,
      message: `Bus "${existing.bus_number}" deleted successfully.`
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleGetBuses,
  handleGetBusDetails,
  handleCreateBus,
  handleUpdateBus,
  handleDeleteBus
};
