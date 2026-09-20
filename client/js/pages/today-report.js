/**
 * Today's Report Controller (client/js/pages/today-report.js)
 * Renders complete daily transit summary, attendance breakdown,
 * and standing student records with print export capability.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Guard check
  const profile = await window.Guards.protectStaffPage();
  if (!profile) return;

  setupProfileUI(profile);

  // 2. Logout handler
  document.getElementById('staff-logout-btn')?.addEventListener('click', async () => {
    await window.Auth.logout();
  });

  // 3. Print handler
  document.getElementById('print-report-btn')?.addEventListener('click', () => {
    window.print();
  });

  // 4. Resolve Bus ID & Load
  await initReportPage();
});

let currentBusId = null;

function setupProfileUI(profile) {
  const staffName = profile.fullName || 'Staff Incharge';
  document.getElementById('staff-name').textContent = staffName;
  if (profile.fullName) {
    document.getElementById('staff-avatar').textContent = profile.fullName.charAt(0).toUpperCase();
  }
}

async function initReportPage() {
  const urlParams = new URLSearchParams(window.location.search);
  let busId = urlParams.get('busId');

  const activeRes = await window.Api.getStaffActiveDuty();
  if (activeRes.success && activeRes.hasActiveDuty && activeRes.activeDuty) {
    if (!busId) {
      busId = activeRes.activeDuty.bus.id;
    }
  }

  if (!busId) {
    window.location.href = 'staff-dashboard.html';
    return;
  }

  currentBusId = busId;

  // Update navigation links with busId
  const qs = `?busId=${encodeURIComponent(busId)}`;
  document.getElementById('nav-active-bus').href = `staff-bus.html${qs}`;
  document.getElementById('nav-attendance').href = `bus-attendance.html${qs}`;
  document.getElementById('nav-standing').href = `standing-students.html${qs}`;
  document.getElementById('nav-report').href = `today-report.html${qs}`;

  await loadReport();
}

async function loadReport() {
  const loading = document.getElementById('report-loading');
  const container = document.getElementById('report-container');

  loading.style.display = 'block';
  container.style.display = 'none';

  try {
    const res = await window.Api.getStaffTodayReport(currentBusId);
    loading.style.display = 'none';

    if (!res.success || !res.report) {
      window.UI?.showToast?.('Report data not found', 'danger');
      return;
    }

    const rep = res.report;
    const bus = rep.bus;
    const duty = rep.duty;
    const stats = rep.stats;

    // Dates & Titles
    const today = new Date();
    document.getElementById('rep-date-badge').textContent = today.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('rep-bus-title').textContent = `Bus ${bus.busNumber} — Daily Transit Sheet`;
    document.getElementById('rep-route-title').textContent = `Route: ${bus.routeName}`;

    const statusBadge = document.getElementById('rep-status-badge');
    if (duty.status === 'completed') {
      statusBadge.className = 'badge badge-neutral';
      statusBadge.textContent = 'Completed';
    } else {
      statusBadge.className = 'badge badge-success';
      statusBadge.textContent = 'In Service';
    }

    document.getElementById('rep-incharge').textContent = duty.staffName || 'Staff Incharge';
    document.getElementById('rep-start-time').textContent = duty.startTime ? new Date(duty.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
    document.getElementById('rep-completed-time').textContent = duty.completedAt ? new Date(duty.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'In Progress';

    // Summary Metrics
    document.getElementById('rep-stat-capacity').textContent = stats.seatingCapacity;
    document.getElementById('rep-stat-assigned').textContent = stats.assignedStudents;
    document.getElementById('rep-stat-present').textContent = stats.present;
    document.getElementById('rep-stat-absent').textContent = stats.absent;
    document.getElementById('rep-stat-standing').textContent = stats.standing;
    document.getElementById('rep-stat-total-travelling').textContent = stats.totalTravellingToday;

    // Render Attendance Roster
    renderAttendanceRoster(rep.attendanceRoster);

    // Render Standing Roster
    renderStandingRoster(rep.standingRoster);

    container.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    window.UI?.showToast?.(err.message || 'Failed to load report', 'danger');
  }
}

function renderAttendanceRoster(roster) {
  const tbody = document.getElementById('rep-att-tbody');
  const badge = document.getElementById('att-roster-badge');
  badge.textContent = `${roster.length} students`;
  tbody.innerHTML = '';

  if (roster.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: var(--spacing-4); color: var(--color-text-muted);">No students permanently assigned to this bus.</td></tr>';
    return;
  }

  roster.forEach(s => {
    const tr = document.createElement('tr');
    let statusPill = '';
    if (s.attendanceStatus === 'present') {
      statusPill = '<span class="badge badge-success">✓ Present</span>';
    } else if (s.attendanceStatus === 'absent') {
      statusPill = '<span class="badge badge-danger">✗ Absent</span>';
    } else {
      statusPill = '<span class="badge badge-neutral">Unmarked</span>';
    }

    tr.innerHTML = `
      <td><span class="badge ${s.seatNumber ? 'badge-primary' : 'badge-neutral'}">${s.seatNumber ? `Seat ${s.seatNumber}` : 'None'}</span></td>
      <td style="font-weight: var(--font-weight-medium);">${escapeHtml(s.fullName)}</td>
      <td><code>${escapeHtml(s.rollNumber)}</code></td>
      <td style="text-align: center;">${statusPill}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderStandingRoster(roster) {
  const tbody = document.getElementById('rep-standing-tbody');
  const wrap = document.getElementById('rep-standing-table-wrap');
  const empty = document.getElementById('rep-standing-empty');
  const badge = document.getElementById('standing-roster-badge');

  badge.textContent = `${roster.length} standing`;

  if (roster.length === 0) {
    wrap.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  wrap.style.display = 'block';
  tbody.innerHTML = '';

  roster.forEach(st => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: var(--font-weight-medium);">${escapeHtml(st.fullName)}</td>
      <td><code>${escapeHtml(st.rollNumber)}</code></td>
      <td><span class="badge badge-primary">${formatReason(st.reason)}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function formatReason(code) {
  switch (code) {
    case 'temporary': return 'Temporary';
    case 'missed_regular_bus': return 'Missed regular bus';
    case 'route_change': return 'Route change';
    case 'no_capacity': return 'No capacity';
    default: return code;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
