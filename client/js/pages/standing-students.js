/**
 * Standing Students Controller (client/js/pages/standing-students.js)
 * Manages daily non-seated passenger registration, validation of fixed reasons,
 * duplicate protection, and deletion.
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

  // 3. Resolve bus ID & load data
  await initStandingPage();

  // 4. Form submission
  document.getElementById('standing-form')?.addEventListener('submit', handleAddStanding);
});

let currentBusId = null;
let currentDuty = null;

function setupProfileUI(profile) {
  const staffName = profile.fullName || 'Staff Incharge';
  document.getElementById('staff-name').textContent = staffName;
  if (profile.fullName) {
    document.getElementById('staff-avatar').textContent = profile.fullName.charAt(0).toUpperCase();
  }
}

async function initStandingPage() {
  const urlParams = new URLSearchParams(window.location.search);
  let busId = urlParams.get('busId');

  // If no busId in query, query active duty
  const activeRes = await window.Api.getStaffActiveDuty();
  if (activeRes.success && activeRes.hasActiveDuty && activeRes.activeDuty) {
    currentDuty = activeRes.activeDuty;
    if (!busId) {
      busId = currentDuty.bus.id;
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

  const today = new Date();
  document.getElementById('standing-date-badge').textContent = today.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (currentDuty) {
    document.getElementById('standing-bus-badge').textContent = `Bus ${currentDuty.bus.busNumber}`;
  }

  await loadStandingList();
}

async function loadStandingList() {
  const loading = document.getElementById('standing-loading');
  const emptyState = document.getElementById('standing-empty');
  const tableWrap = document.getElementById('standing-table-wrap');
  const tbody = document.getElementById('standing-tbody');
  const totalCount = document.getElementById('standing-total-count');
  const rosterBadge = document.getElementById('roster-badge');

  loading.style.display = 'block';
  emptyState.style.display = 'none';
  tableWrap.style.display = 'none';

  try {
    const res = await window.Api.getStaffTodayStanding(currentBusId);
    loading.style.display = 'none';

    if (!res.success || !res.standingStudents || res.standingStudents.length === 0) {
      emptyState.style.display = 'block';
      totalCount.textContent = '0';
      rosterBadge.textContent = '0 recorded';
      return;
    }

    const students = res.standingStudents;
    totalCount.textContent = students.length;
    rosterBadge.textContent = `${students.length} recorded`;
    tbody.innerHTML = '';

    students.forEach(st => {
      const tr = document.createElement('tr');
      const timeStr = st.createdAt ? new Date(st.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
      const formattedReason = formatReason(st.standingReason);

      tr.innerHTML = `
        <td style="font-weight: var(--font-weight-medium);">${escapeHtml(st.studentName)}</td>
        <td><code>${escapeHtml(st.rollNumber)}</code></td>
        <td>
          <span class="badge ${st.regularBusNumber !== 'Unassigned' ? 'badge-neutral' : 'badge-warning'}">
            ${escapeHtml(st.regularBusNumber)}
          </span>
        </td>
        <td>
          <span class="badge badge-primary">${formattedReason}</span>
        </td>
        <td style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${timeStr}</td>
        <td style="text-align: center;">
          <button class="btn btn-outline btn-sm delete-standing-btn" data-id="${st.id}" style="color: var(--color-danger); border-color: var(--color-danger);">
            ✕ Remove
          </button>
        </td>
      `;

      // Attach remove handler
      const removeBtn = tr.querySelector('.delete-standing-btn');
      removeBtn.addEventListener('click', async () => {
        await handleRemoveStanding(st.id, st.studentName);
      });

      tbody.appendChild(tr);
    });

    tableWrap.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    window.UI?.showToast?.(err.message || 'Failed to load standing students', 'danger');
  }
}

async function handleAddStanding(e) {
  e.preventDefault();

  const nameInput = document.getElementById('standing-name');
  const rollInput = document.getElementById('standing-roll');
  const reasonSelect = document.getElementById('standing-reason');
  const addBtn = document.getElementById('add-standing-btn');

  const studentName = nameInput ? nameInput.value.trim() : '';
  const rollNumber = rollInput ? rollInput.value.trim() : '';
  const reason = reasonSelect ? reasonSelect.value : '';

  if (!studentName) {
    window.UI?.showToast?.('Please enter a student name.', 'danger');
    if (nameInput) nameInput.focus();
    return;
  }

  if (!rollNumber) {
    window.UI?.showToast?.('Please enter a student roll number.', 'danger');
    if (rollInput) rollInput.focus();
    return;
  }

  if (!reason) {
    window.UI?.showToast?.('Please select a reason.', 'danger');
    return;
  }

  if (addBtn.disabled) return;

  addBtn.disabled = true;
  const originalText = addBtn.textContent;
  addBtn.textContent = 'Adding...';

  try {
    const payload = {
      busId: currentBusId,
      assignmentId: currentDuty?.id || null,
      studentName,
      rollNumber,
      reason
    };

    const res = await window.Api.addStaffStandingStudent(payload);
    window.UI?.showToast?.(res.message || 'Standing student recorded successfully!', 'success');
    
    // Automatically reset input form after successful submission
    if (nameInput) nameInput.value = '';
    if (rollInput) rollInput.value = '';
    if (reasonSelect) reasonSelect.selectedIndex = 0;
    if (nameInput) nameInput.focus();

    // Immediately display newly added record without page refresh
    await loadStandingList();
  } catch (err) {
    // Preserve entered form data on failure
    window.UI?.showToast?.(err.message || 'Failed to record standing student', 'danger');
  } finally {
    addBtn.disabled = false;
    addBtn.textContent = originalText;
  }
}

async function handleRemoveStanding(id, studentName) {
  const confirmed = confirm(`Are you sure you want to remove ${studentName} from today's standing list?`);
  if (!confirmed) return;

  try {
    const res = await window.Api.removeStaffStandingStudent(id);
    window.UI?.showToast?.(res.message || 'Standing student removed.', 'success');
    await loadStandingList();
  } catch (err) {
    window.UI?.showToast?.(err.message || 'Failed to remove standing student', 'danger');
  }
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
