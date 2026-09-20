/**
 * Staff Bus Duty Cockpit Controller (client/js/pages/staff-bus.js)
 * Manages active bus duty details, live operational stats, student roster,
 * student addition, and duty completion.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Staff Guard
  const profile = await window.Guards.protectStaffPage();
  if (!profile) return;

  setupProfileUI(profile);

  // 2. Logout handler
  document.getElementById('staff-logout-btn')?.addEventListener('click', async () => {
    await window.Auth.logout();
  });

  // 3. Load active duty
  await loadDutyCockpit();

  // 4. Setup Modals
  setupModals();
});

let currentDuty = null;

function setupProfileUI(profile) {
  const staffName = profile.fullName || 'Staff Incharge';
  document.getElementById('staff-name').textContent = staffName;
  if (profile.fullName) {
    document.getElementById('staff-avatar').textContent = profile.fullName.charAt(0).toUpperCase();
  }
}

async function loadDutyCockpit() {
  const loading = document.getElementById('duty-loading');
  const noDuty = document.getElementById('no-duty-card');
  const content = document.getElementById('duty-content');

  loading.style.display = 'block';
  noDuty.style.display = 'none';
  content.style.display = 'none';

  try {
    const res = await window.Api.getStaffActiveDuty();
    loading.style.display = 'none';

    if (!res.success || !res.hasActiveDuty || !res.activeDuty) {
      noDuty.style.display = 'block';
      return;
    }

    currentDuty = res.activeDuty;
    const bus = currentDuty.bus;
    const stats = currentDuty.stats;

    // Set bus details
    document.getElementById('duty-bus-title').textContent = `Bus ${bus.busNumber}`;
    document.getElementById('duty-route-title').textContent = `Route: ${bus.routeName}`;
    document.getElementById('duty-incharge-name').textContent = currentDuty.staffName;

    const startTime = currentDuty.startTime ? new Date(currentDuty.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
    document.getElementById('duty-start-time').textContent = startTime;

    const statusBadge = document.getElementById('duty-status-badge');
    const completeBtn = document.getElementById('complete-duty-btn');

    if (currentDuty.status === 'completed') {
      statusBadge.className = 'badge badge-neutral';
      statusBadge.textContent = 'Duty Completed';
      completeBtn.disabled = true;
      completeBtn.textContent = 'Duty Completed';
    } else {
      statusBadge.className = 'badge badge-success';
      statusBadge.textContent = 'In Service';
      completeBtn.disabled = false;
      completeBtn.textContent = 'Complete Duty';
    }

    const today = new Date();
    document.getElementById('duty-date-badge').textContent = today.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    // Set 6 summary stats
    document.getElementById('cockpit-stat-capacity').textContent = stats.seatingCapacity;
    document.getElementById('cockpit-stat-assigned').textContent = stats.assignedStudents;
    document.getElementById('cockpit-stat-present').textContent = stats.present;
    document.getElementById('cockpit-stat-absent').textContent = stats.absent;
    document.getElementById('cockpit-stat-standing').textContent = stats.standing;
    document.getElementById('cockpit-stat-total-travelling').textContent = stats.totalTravellingToday;

    // Update Action Links
    const qs = `?busId=${encodeURIComponent(bus.id)}`;
    document.getElementById('btn-goto-attendance').href = `bus-attendance.html${qs}`;
    document.getElementById('btn-goto-standing').href = `standing-students.html${qs}`;
    document.getElementById('btn-goto-report').href = `today-report.html${qs}`;
    document.getElementById('nav-attendance').href = `bus-attendance.html${qs}`;
    document.getElementById('nav-standing').href = `standing-students.html${qs}`;
    document.getElementById('nav-report').href = `today-report.html${qs}`;

    // Load student roster
    await loadStudentRoster(bus.id);

    content.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    window.UI?.showToast?.(err.message || 'Failed to load bus duty details', 'danger');
  }
}

async function loadStudentRoster(busId) {
  const tbody = document.getElementById('assigned-students-tbody');
  const countBadge = document.getElementById('roster-count-badge');
  tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: var(--spacing-6); color: var(--color-text-muted);">Loading students roster...</td></tr>';

  try {
    const res = await window.Api.getStaffBusStudents(busId);
    if (!res.success || !res.students || res.students.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: var(--spacing-6); color: var(--color-text-muted);">No students permanently assigned to this bus yet.</td></tr>';
      countBadge.textContent = '0 students';
      return;
    }

    countBadge.textContent = `${res.students.length} students`;
    tbody.innerHTML = '';

    res.students.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <span class="badge ${s.seatNumber ? 'badge-primary' : 'badge-neutral'}">
            ${s.seatNumber ? `Seat ${s.seatNumber}` : 'Unassigned'}
          </span>
        </td>
        <td style="font-weight: var(--font-weight-medium);">${escapeHtml(s.fullName)}</td>
        <td><code>${escapeHtml(s.rollNumber)}</code></td>
        <td><span class="badge badge-success">Permanent</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="color: var(--color-danger); padding: var(--spacing-6);">${err.message || 'Failed to load roster'}</td></tr>`;
  }
}

function setupModals() {
  // ── Complete Duty Modal ──────────────────────────────────────────────────
  const completeModal = document.getElementById('complete-duty-modal');
  const triggerCompleteBtn = document.getElementById('complete-duty-btn');
  const closeCompleteBtn = document.getElementById('modal-close-btn');
  const cancelCompleteBtn = document.getElementById('modal-cancel-btn');
  const confirmCompleteBtn = document.getElementById('modal-confirm-btn');

  function openCompleteModal() {
    if (!currentDuty) return;
    completeModal.classList.add('active');
  }
  function closeCompleteModal() {
    completeModal.classList.remove('active');
  }

  triggerCompleteBtn?.addEventListener('click', openCompleteModal);
  closeCompleteBtn?.addEventListener('click', closeCompleteModal);
  cancelCompleteBtn?.addEventListener('click', closeCompleteModal);

  confirmCompleteBtn?.addEventListener('click', async () => {
    if (!currentDuty) return;
    confirmCompleteBtn.disabled = true;
    confirmCompleteBtn.textContent = 'Completing Duty...';

    try {
      const res = await window.Api.completeStaffDuty(currentDuty.id);
      window.UI?.showToast?.(res.message || 'Duty completed successfully!', 'success');
      closeCompleteModal();
      await loadDutyCockpit();
    } catch (err) {
      window.UI?.showToast?.(err.message || 'Failed to complete duty.', 'danger');
    } finally {
      confirmCompleteBtn.disabled = false;
      confirmCompleteBtn.textContent = 'Confirm & Complete Duty';
    }
  });

  // ── Add Student Modal ───────────────────────────────────────────────────
  const studentModal = document.getElementById('add-student-modal');
  const triggerStudentBtn = document.getElementById('add-student-btn');
  const closeStudentBtn = document.getElementById('student-modal-close-btn');
  const cancelStudentBtn = document.getElementById('student-modal-cancel-btn');
  const studentForm = document.getElementById('add-student-form');
  const saveStudentBtn = document.getElementById('save-student-btn');

  function openStudentModal() {
    if (!currentDuty) return;
    document.getElementById('new-student-seat-hint').textContent = `Must be between 1 and ${currentDuty.bus.seatingCapacity}.`;
    studentForm.reset();
    studentModal.classList.add('active');
  }
  function closeStudentModal() {
    studentModal.classList.remove('active');
  }

  triggerStudentBtn?.addEventListener('click', openStudentModal);
  closeStudentBtn?.addEventListener('click', closeStudentModal);
  cancelStudentBtn?.addEventListener('click', closeStudentModal);

  studentForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentDuty) return;

    const fullName = document.getElementById('new-student-name').value.trim();
    const rollNumber = document.getElementById('new-student-roll').value.trim();
    const seatVal = document.getElementById('new-student-seat').value.trim();

    if (!fullName || !rollNumber) {
      window.UI?.showToast?.('Full name and roll number are required.', 'danger');
      return;
    }

    saveStudentBtn.disabled = true;
    saveStudentBtn.textContent = 'Adding Student...';

    try {
      const payload = {
        fullName,
        rollNumber,
        busId: currentDuty.bus.id,
        seatNumber: seatVal ? parseInt(seatVal, 10) : null
      };

      const res = await window.Api.staffCreateStudent(payload);
      window.UI?.showToast?.(res.message || 'Student added successfully!', 'success');
      closeStudentModal();
      await loadDutyCockpit();
    } catch (err) {
      window.UI?.showToast?.(err.message || 'Failed to add student.', 'danger');
    } finally {
      saveStudentBtn.disabled = false;
      saveStudentBtn.textContent = 'Add Student';
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
