/**
 * Admin Live Daily Monitoring Controller (server/controllers/monitoring.controller.js)
 * Real-time cockpit displaying today's transit operations across all active buses.
 */

const { supabaseAdmin, isConfigured } = require('../config/supabase');

function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// GET /api/admin/monitoring/today?date=
// Returns live status of all fleet buses for the selected date (defaults to today)
// ---------------------------------------------------------------------------
async function handleGetTodayMonitoring(req, res, next) {
  try {
    if (!isConfigured || !supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Backend not configured.' });
    }

    const today = req.query.date || getTodayDateString();

    // 1. Fetch all active buses
    const { data: buses, error: busErr } = await supabaseAdmin
      .from('buses')
      .select('id, bus_number, route_name, seating_capacity, is_active')
      .order('bus_number', { ascending: true });

    if (busErr) {
      const err = new Error('Failed to fetch fleet buses: ' + busErr.message);
      err.status = 500;
      throw err;
    }

    // 2. Fetch daily duty assignments for today
    const { data: assignments, error: assignErr } = await supabaseAdmin
      .from('daily_bus_assignments')
      .select('id, bus_id, staff_id, status, start_time, completed_at, staff_profiles(id, full_name, email)')
      .eq('assignment_date', today);

    if (assignErr) {
      const err = new Error('Failed to fetch duty assignments: ' + assignErr.message);
      err.status = 500;
      throw err;
    }

    const assignMap = {};
    if (assignments) {
      for (const a of assignments) {
        assignMap[a.bus_id] = a;
      }
    }

    // 3. Fetch student counts per bus
    const { data: studentList } = await supabaseAdmin
      .from('students')
      .select('bus_id')
      .eq('is_active', true)
      .not('bus_id', 'is', null);

    const studentCountMap = {};
    if (studentList) {
      for (const s of studentList) {
        studentCountMap[s.bus_id] = (studentCountMap[s.bus_id] || 0) + 1;
      }
    }

    // 4. Fetch today's attendance grouped by bus
    const { data: attList } = await supabaseAdmin
      .from('daily_attendance')
      .select('bus_id, status')
      .eq('attendance_date', today);

    const attMap = {};
    if (attList) {
      for (const att of attList) {
        if (!attMap[att.bus_id]) {
          attMap[att.bus_id] = { present: 0, absent: 0 };
        }
        if (att.status === 'present') attMap[att.bus_id].present++;
        else if (att.status === 'absent') attMap[att.bus_id].absent++;
      }
    }

    // 5. Fetch today's standing students grouped by bus
    const { data: standingList } = await supabaseAdmin
      .from('daily_standing_log')
      .select('bus_id')
      .eq('log_date', today);

    const standingCountMap = {};
    if (standingList) {
      for (const st of standingList) {
        standingCountMap[st.bus_id] = (standingCountMap[st.bus_id] || 0) + 1;
      }
    }

    // 6. Build combined roster and overall summary
    let totalFleetCapacity = 0;
    let totalAssignedStudents = 0;
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalStanding = 0;
    let inServiceCount = 0;
    let completedCount = 0;
    let availableCount = 0;

    const monitoredBuses = (buses || []).map(b => {
      const assignment = assignMap[b.id];
      const assignedCount = studentCountMap[b.id] || 0;
      const attCounts = attMap[b.id] || { present: 0, absent: 0 };
      const standingCount = standingCountMap[b.id] || 0;
      const totalTravelling = attCounts.present + standingCount;

      let status = 'available';
      if (assignment) {
        status = assignment.status; // 'in_service' or 'completed'
      }

      totalFleetCapacity += b.seating_capacity;
      totalAssignedStudents += assignedCount;
      totalPresent += attCounts.present;
      totalAbsent += attCounts.absent;
      totalStanding += standingCount;

      if (status === 'in_service') inServiceCount++;
      else if (status === 'completed') completedCount++;
      else availableCount++;

      return {
        busId: b.id,
        busNumber: b.bus_number,
        routeName: b.route_name,
        seatingCapacity: b.seating_capacity,
        assignedStudents: assignedCount,
        availableSeats: Math.max(0, b.seating_capacity - assignedCount),
        status, // 'available' | 'in_service' | 'completed'
        staffIncharge: assignment?.staff_profiles?.full_name || null,
        staffEmail: assignment?.staff_profiles?.email || null,
        startTime: assignment?.start_time || null,
        completedAt: assignment?.completed_at || null,
        stats: {
          present: attCounts.present,
          absent: attCounts.absent,
          standing: standingCount,
          totalTravelling,
          capacityUtilization: b.seating_capacity > 0 ? Math.round((assignedCount / b.seating_capacity) * 100) : 0
        }
      };
    });

    res.json({
      success: true,
      date: today,
      summary: {
        totalBuses: buses.length,
        availableBuses: availableCount,
        inServiceBuses: inServiceCount,
        completedBuses: completedCount,
        totalFleetCapacity,
        totalAssignedStudents,
        totalPresent,
        totalAbsent,
        totalStanding,
        totalTravellingToday: totalPresent + totalStanding
      },
      buses: monitoredBuses
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleGetTodayMonitoring
};
