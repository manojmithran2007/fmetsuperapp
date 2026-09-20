/**
 * Duty & Attendance History Controller (client/js/pages/attendance-history.js)
 * Loads chronological list of past duties handled by the logged-in staff member,
 * along with detailed historical attendance and standing student inspection modal.
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

  // 3. Load active bus link for nav
  await setupNavLinks();

  // 4. Initial load of history
  await loadHistory();

  // 5. Refresh button
  document.getElementById('refresh-history-btn')?.addEventListener('click', async () => {
    await loadHistory();
  });

  // 6. Modal close handlers
  setupModalHandlers();
});

function setupProfileUI(profile) {
  const staffName = profile.fullName || 'Staff Incharge';
  document.getElementById('staff-name').textContent = staffName;
  if (profile.fullName) {
    document.getElementById('staff-avatar').textContent = profile.fullName.charAt(0).toUpperCase();
  }
}

async function setupNavLinks() {
  try {
    const activeRes = await window.Api.getStaffActiveDuty();
    if (activeRes.success && activeRes.hasActiveDuty && activeRes.activeDuty) {
      const busId = activeRes.activeDuty.bus.id;
      const qs = `?busId=${encodeURIComponent(busId)}`;
      document.getElementById('nav-active-bus').href = `staff-bus.html${qs}`;
      document.getElementById('nav-attendance').href = `bus-attendance.html${qs}`;
      document.getElementById('nav-standing').href = `standing-students.html${qs}`;
      document.getElementById('nav-report').href = `today-report.html${qs}`;
    }
  } catch (err) {
    console.error('Failed to setup nav links:', err);
  }
}

async function loadHistory() {
  const loading = document.getElementById('history-loading');
  const emptyState = document.getElementById('history-empty');
  const tableWrap = document.getElementById('history-table-wrap');
  const tbody = document.getElementById('history-tbody');

  loading.style.display = 'block';
  emptyState.style.display = 'none';
  tableWrap.style.display = 'none';

  try {
    const res = await window.Api.getStaffHistory();
    loading.style.display = 'none';

    if (!res.success || !res.history || res.history.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    tbody.innerHTML = '';
    res.history.forEach(item => {
      const tr = document.createElement('tr');

      const dateObj = new Date(item.date + 'T00:00:00');
      const dateFormatted = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

      let statusBadge = '';
      if (item.status === 'completed') {
        statusBadge = '<span class="badge badge-neutral">Completed</span>';
      } else {
        statusBadge = '<span class="badge badge-success">In Service</span>';
      }

      tr.innerHTML = `
        <td style="font-weight: var(--font-weight-bold);">${dateFormatted}</td>
        <td>
          <div style="font-weight: var(--font-weight-medium);">${escapeHtml(item.busNumber)}</div>
          <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${escapeHtml(item.routeName)}</div>
        </td>
        <td>${statusBadge}</td>
        <td style="text-align: center; color: var(--color-success); font-weight: var(--font-weight-bold);">${item.stats.present}</td>
        <td style="text-align: center; color: var(--color-danger); font-weight: var(--font-weight-bold);">${item.stats.absent}</td>
        <td style="text-align: center; color: var(--color-warning); font-weight: var(--font-weight-bold);">${item.stats.standing}</td>
        <td style="text-align: center; font-weight: var(--font-weight-black);">${item.stats.totalTravelling}</td>
        <td style="text-align: right;">
          <button class="btn btn-outline btn-sm view-duty-detail-btn" data-id="${item.id}" data-bus="${escapeHtml(item.busNumber)}" data-date="${dateFormatted}">
            View Details &rarr;
          </button>
        </td>
      `;

      const viewBtn = tr.querySelector('.view-duty-detail-btn');
      viewBtn.addEventListener('click', () => {
        openDutyDetailModal(item.id, item.busNumber, dateFormatted);
      });

      tbody.appendChild(tr);
    });

    tableWrap.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    window.UI?.showToast?.(err.message || 'Failed to load history', 'danger');
  }
}

async function openDutyDetailModal(assignmentId, busNumber, dateStr) {
  const modal = document.getElementById('history-detail-modal');
  const title = document.getElementById('modal-detail-title');
  const loading = document.getElementById('modal-detail-loading');
  const content = document.getElementById('modal-detail-content');

  title.textContent = `${busNumber} — Duty on ${dateStr}`;
  loading.style.display = 'block';
  content.style.display = 'none';
  modal.classList.add('active');

  try {
    const res = await window.Api.getStaffHistoryDetail(assignmentId);
    loading.style.display = 'none';

    if (!res.success || !res.dutyDetail) {
      window.UI?.showToast?.('Detail record not found', 'danger');
      return;
    }

    const detail = res.dutyDetail;
    document.getElementById('m-stat-present').textContent = detail.summary.present;
    document.getElementById('m-stat-absent').textContent = detail.summary.absent;
    document.getElementById('m-stat-standing').textContent = detail.summary.standing;
    document.getElementById('m-stat-total').textContent = detail.summary.totalTravelling;

    // Render attendance
    const attTbody = document.getElementById('m-attendance-tbody');
    attTbody.innerHTML = '';
    if (detail.attendance.length === 0) {
      attTbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 12px; color: var(--color-text-muted);">No attendance recorded.</td></tr>';
    } else {
      detail.attendance.forEach(a => {
        const tr = document.createElement('tr');
        const badge = a.status === 'present' ? '<span class="badge badge-success">Present</span>' : '<span class="badge badge-danger">Absent</span>';
        tr.innerHTML = `
          <td><span class="badge badge-neutral">${a.seatNumber || 'None'}</span></td>
          <td style="font-weight: var(--font-weight-medium);">${escapeHtml(a.studentName)}</td>
          <td><code>${escapeHtml(a.rollNumber)}</code></td>
          <td>${badge}</td>
        `;
        attTbody.appendChild(tr);
      });
    }

    // Render standing
    const standingTbody = document.getElementById('m-standing-tbody');
    standingTbody.innerHTML = '';
    if (detail.standing.length === 0) {
      standingTbody.innerHTML = '<tr><td colspan="3" class="text-center" style="padding: 12px; color: var(--color-text-muted);">No standing students on this day.</td></tr>';
    } else {
      detail.standing.forEach(st => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight: var(--font-weight-medium);">${escapeHtml(st.studentName)}</td>
          <td><code>${escapeHtml(st.rollNumber)}</code></td>
          <td><span class="badge badge-primary">${formatReason(st.reason)}</span></td>
        `;
        standingTbody.appendChild(tr);
      });
    }

    content.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    window.UI?.showToast?.(err.message || 'Failed to load details', 'danger');
  }
}

function setupModalHandlers() {
  const modal = document.getElementById('history-detail-modal');
  const closeBtn = document.getElementById('modal-detail-close-btn');

  closeBtn?.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
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
