/**
 * Daily Bus Attendance Controller (client/js/pages/bus-attendance.js)
 * High-usability mobile/tablet attendance register with Present/Absent toggles,
 * quick "Mark All Present", summary check, and atomic server upsert.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Guard check
  const profile = await window.Guards.protectStaffPage();
  if (!profile) return;

  setupProfileUI(profile);

  // 2. Logout action
  document.getElementById('staff-logout-btn')?.addEventListener('click', async () => {
    await window.Auth.logout();
  });

  // 3. Resolve Bus ID & Load
  await initAttendancePage();

  // 4. Action Handlers
  document.getElementById('mark-all-present-btn')?.addEventListener('click', () => {
    markAllStatus('present');
  });

  document.getElementById('save-attendance-btn')?.addEventListener('click', saveAttendance);
  document.getElementById('bottom-save-btn')?.addEventListener('click', saveAttendance);
});

let currentBusId = null;
let currentDuty = null;
let studentAttendanceList = []; // Array of { studentId, fullName, rollNumber, seatNumber, status }

function setupProfileUI(profile) {
  const staffName = profile.fullName || 'Staff Incharge';
  document.getElementById('staff-name').textContent = staffName;
  if (profile.fullName) {
    document.getElementById('staff-avatar').textContent = profile.fullName.charAt(0).toUpperCase();
  }
}

async function initAttendancePage() {
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

  await loadAttendanceData();
}

async function loadAttendanceData() {
  const loading = document.getElementById('att-loading');
  const emptyState = document.getElementById('att-empty');
  const container = document.getElementById('att-roster-container');

  loading.style.display = 'block';
  emptyState.style.display = 'none';
  container.style.display = 'none';

  try {
    const res = await window.Api.getStaffTodayAttendance(currentBusId);
    loading.style.display = 'none';

    if (!res.success || !res.students || res.students.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    studentAttendanceList = res.students;

    const today = new Date();
    document.getElementById('att-date-badge').textContent = today.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    if (currentDuty) {
      document.getElementById('att-bus-badge').textContent = `Bus ${currentDuty.bus.busNumber}`;
    } else {
      document.getElementById('att-bus-badge').textContent = `Bus ID: ${currentBusId.substring(0, 8)}`;
    }

    renderAttendanceRows();
    updateLiveSummary();
    container.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    window.UI?.showToast?.(err.message || 'Failed to load attendance roster', 'danger');
  }
}

function renderAttendanceRows() {
  const list = document.getElementById('att-rows-list');
  list.innerHTML = '';

  studentAttendanceList.forEach(s => {
    const row = document.createElement('div');
    row.className = 'attendance-row';
    row.id = `row-${s.studentId}`;

    const seatLabel = s.seatNumber ? `Seat ${s.seatNumber}` : 'Unassigned';
    const isPresent = s.status === 'present';
    const isAbsent = s.status === 'absent';

    row.innerHTML = `
      <div>
        <span class="badge ${s.seatNumber ? 'badge-primary' : 'badge-neutral'}">${seatLabel}</span>
      </div>
      <div>
        <strong style="color: var(--color-text-main); font-size: var(--font-size-sm);">${escapeHtml(s.fullName)}</strong>
      </div>
      <div>
        <code>${escapeHtml(s.rollNumber)}</code>
      </div>
      <div class="attendance-actions">
        <button type="button" class="btn-att ${isPresent ? 'active-present' : ''}" data-student="${s.studentId}" data-status="present">
          ✓ Present
        </button>
        <button type="button" class="btn-att ${isAbsent ? 'active-absent' : ''}" data-student="${s.studentId}" data-status="absent">
          ✗ Absent
        </button>
      </div>
    `;

    // Attach click events
    const presentBtn = row.querySelector('[data-status="present"]');
    const absentBtn = row.querySelector('[data-status="absent"]');

    presentBtn.addEventListener('click', () => {
      setStudentStatus(s.studentId, 'present', presentBtn, absentBtn);
    });

    absentBtn.addEventListener('click', () => {
      setStudentStatus(s.studentId, 'absent', presentBtn, absentBtn);
    });

    list.appendChild(row);
  });
}

function setStudentStatus(studentId, newStatus, presentBtn, absentBtn) {
  const student = studentAttendanceList.find(s => s.studentId === studentId);
  if (!student) return;

  student.status = newStatus;

  if (newStatus === 'present') {
    presentBtn.className = 'btn-att active-present';
    absentBtn.className = 'btn-att';
  } else {
    presentBtn.className = 'btn-att';
    absentBtn.className = 'btn-att active-absent';
  }

  updateLiveSummary();
}

function markAllStatus(targetStatus) {
  studentAttendanceList.forEach(s => {
    s.status = targetStatus;
  });
  renderAttendanceRows();
  updateLiveSummary();
  window.UI?.showToast?.(`All ${studentAttendanceList.length} students marked as ${targetStatus}. Click Save to persist.`, 'info');
}

function updateLiveSummary() {
  let present = 0;
  let absent = 0;
  let unmarked = 0;

  studentAttendanceList.forEach(s => {
    if (s.status === 'present') present++;
    else if (s.status === 'absent') absent++;
    else unmarked++;
  });

  const total = studentAttendanceList.length;

  document.getElementById('sum-total').textContent = total;
  document.getElementById('sum-present').textContent = present;
  document.getElementById('sum-absent').textContent = absent;
  document.getElementById('sum-unmarked').textContent = unmarked;

  document.getElementById('bottom-summary-text').textContent = `Total: ${total} | Present: ${present} | Absent: ${absent} ${unmarked > 0 ? `| Unmarked: ${unmarked}` : ''}`;
}

async function saveAttendance() {
  // Prevent accidental submission of incomplete attendance (Section 9 Requirement)
  const unmarked = studentAttendanceList.filter(s => s.status !== 'present' && s.status !== 'absent');
  if (unmarked.length > 0) {
    const confirmSave = confirm(`Notice: ${unmarked.length} student(s) are still unmarked. Would you like to mark them as Absent and save now?`);
    if (!confirmSave) return;
    unmarked.forEach(u => u.status = 'absent');
    renderAttendanceRows();
    updateLiveSummary();
  }

  const saveBtn = document.getElementById('save-attendance-btn');
  const bottomSaveBtn = document.getElementById('bottom-save-btn');

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  bottomSaveBtn.disabled = true;
  bottomSaveBtn.textContent = 'Saving...';

  try {
    const records = studentAttendanceList.map(s => ({
      studentId: s.studentId,
      status: s.status
    }));

    const payload = {
      busId: currentBusId,
      assignmentId: currentDuty?.id || null,
      records
    };

    const res = await window.Api.saveStaffAttendance(payload);
    window.UI?.showToast?.(res.message || 'Attendance saved successfully!', 'success');
  } catch (err) {
    window.UI?.showToast?.(err.message || 'Failed to save attendance', 'danger');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save Today\'s Attendance';
    bottomSaveBtn.disabled = false;
    bottomSaveBtn.textContent = '💾 Save Attendance';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
