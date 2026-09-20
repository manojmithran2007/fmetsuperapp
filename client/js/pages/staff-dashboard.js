/**
 * Staff Dashboard Controller (client/js/pages/staff-dashboard.js)
 * Loads staff profile, today's duty status, live stats, and available buses to claim.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Staff Guard
  const profile = await window.Guards.protectStaffPage();
  if (!profile) return;

  // 2. Setup user badge & date
  setupProfileUI(profile);

  // 3. Logout action
  document.getElementById('staff-logout-btn')?.addEventListener('click', async () => {
    await window.Auth.logout();
  });

  // 4. Initial data load
  await refreshDashboard();

  // 5. Refresh fleet button
  document.getElementById('refresh-buses-btn')?.addEventListener('click', async () => {
    await loadAvailableBuses();
  });

  // 6. Complete duty modal setup
  setupCompleteDutyModal();
});

let currentActiveDuty = null;

function setupProfileUI(profile) {
  const staffName = profile.fullName || 'Staff Incharge';
  document.getElementById('staff-name').textContent = staffName;
  document.getElementById('welcome-staff-name').textContent = staffName;
  if (profile.fullName) {
    document.getElementById('staff-avatar').textContent = profile.fullName.charAt(0).toUpperCase();
  }

  const today = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('today-date-badge').textContent = 'Today: ' + today.toLocaleDateString(undefined, options);
}

async function refreshDashboard() {
  await Promise.all([
    loadActiveDuty(),
    loadAvailableBuses()
  ]);
}

async function loadActiveDuty() {
  try {
    const res = await window.Api.getStaffActiveDuty();
    const statusPill = document.getElementById('active-duty-status-pill');
    const activeSection = document.getElementById('active-bus-section');

    if (res.success && res.hasActiveDuty && res.activeDuty) {
      currentActiveDuty = res.activeDuty;
      const duty = res.activeDuty;
      const bus = duty.bus;
      const stats = duty.stats;

      statusPill.className = duty.status === 'completed' ? 'badge badge-neutral' : 'badge badge-success';
      statusPill.textContent = duty.status === 'completed' ? 'Duty Completed Today' : 'In Service: ' + bus.busNumber;

      // Populate active card
      document.getElementById('active-bus-title').textContent = `Bus ${bus.busNumber}`;
      document.getElementById('active-bus-route').textContent = `Route: ${bus.routeName}`;

      document.getElementById('stat-capacity').textContent = stats.seatingCapacity;
      document.getElementById('stat-assigned').textContent = stats.assignedStudents;
      document.getElementById('stat-present').textContent = stats.present;
      document.getElementById('stat-absent').textContent = stats.absent;
      document.getElementById('stat-standing').textContent = stats.standing;
      document.getElementById('stat-total-travelling').textContent = stats.totalTravellingToday;

      // Update subnav links with active busId
      updateSubnavLinks(bus.id);

      activeSection.style.display = 'block';

      // Hide or adjust complete duty button if already completed
      const completeBtn = document.getElementById('quick-complete-duty-btn');
      if (duty.status === 'completed') {
        completeBtn.disabled = true;
        completeBtn.textContent = 'Duty Completed';
      } else {
        completeBtn.disabled = false;
        completeBtn.textContent = 'Complete Duty';
      }
    } else {
      currentActiveDuty = null;
      statusPill.className = 'badge badge-neutral';
      statusPill.textContent = 'No Bus Claimed Today';
      activeSection.style.display = 'none';
      updateSubnavLinks(null);
    }
  } catch (err) {
    console.error('Failed to load active duty:', err);
  }
}

function updateSubnavLinks(busId) {
  const qs = busId ? `?busId=${encodeURIComponent(busId)}` : '';
  const attendanceLink = document.getElementById('nav-attendance');
  const standingLink = document.getElementById('nav-standing');
  const reportLink = document.getElementById('nav-report');
  const activeBusLink = document.getElementById('nav-active-bus');

  if (attendanceLink) attendanceLink.href = `bus-attendance.html${qs}`;
  if (standingLink) standingLink.href = `standing-students.html${qs}`;
  if (reportLink) reportLink.href = `today-report.html${qs}`;
  if (activeBusLink) activeBusLink.href = `staff-bus.html${qs}`;
}

async function loadAvailableBuses() {
  const spinner = document.getElementById('buses-loading-spinner');
  const emptyState = document.getElementById('buses-empty-state');
  const grid = document.getElementById('buses-grid');

  spinner.style.display = 'block';
  emptyState.style.display = 'none';
  grid.style.display = 'none';

  try {
    const res = await window.Api.getStaffAvailableBuses();
    spinner.style.display = 'none';

    if (!res.success || !res.buses || res.buses.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    grid.innerHTML = '';
    res.buses.forEach(bus => {
      grid.appendChild(createBusCard(bus));
    });

    grid.style.display = 'grid';
  } catch (err) {
    spinner.style.display = 'none';
    window.UI?.showToast?.(err.message || 'Failed to load fleet availability', 'danger');
  }
}

function createBusCard(bus) {
  const card = document.createElement('div');
  card.className = `bus-card-daily ${bus.dailyStatus === 'in_service' ? 'claimed' : bus.dailyStatus === 'completed' ? 'completed' : ''}`;

  let statusBadge = '<span class="badge badge-success">Available for Claim</span>';
  let actionHtml = '';

  if (bus.isClaimedByMe) {
    statusBadge = '<span class="badge badge-primary">Your Active Duty</span>';
    actionHtml = `<a href="staff-bus.html?busId=${bus.id}" class="btn btn-primary btn-sm btn-block">Open Duty Cockpit &rarr;</a>`;
  } else if (bus.dailyStatus === 'in_service') {
    statusBadge = `<span class="badge badge-neutral">Claimed by ${bus.claimedBy?.fullName || 'Staff'}</span>`;
    actionHtml = `<button class="btn btn-neutral btn-sm btn-block" disabled>In Service (Unavailable)</button>`;
  } else if (bus.dailyStatus === 'completed') {
    statusBadge = '<span class="badge badge-neutral">Completed for Today</span>';
    actionHtml = `<button class="btn btn-neutral btn-sm btn-block" disabled>Duty Completed</button>`;
  } else {
    actionHtml = `<button class="btn btn-primary btn-sm btn-block claim-bus-btn" data-bus-id="${bus.id}" data-bus-num="${bus.busNumber}">Take Bus / Start Duty</button>`;
  }

  card.innerHTML = `
    <div>
      <div class="flex items-center justify-between" style="margin-bottom: var(--spacing-2);">
        <span class="badge badge-neutral" style="font-weight: var(--font-weight-bold);">${bus.busNumber}</span>
        ${statusBadge}
      </div>
      <h3 style="font-size: var(--font-size-lg); margin-bottom: var(--spacing-2);">${bus.routeName}</h3>
      <div style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-bottom: var(--spacing-4);">
        <div class="flex justify-between" style="margin-bottom: 4px;">
          <span>Fixed Capacity:</span>
          <strong>${bus.seatingCapacity} seats</strong>
        </div>
        <div class="flex justify-between" style="margin-bottom: 4px;">
          <span>Permanently Assigned:</span>
          <strong>${bus.assignedStudentsCount} students</strong>
        </div>
        <div class="flex justify-between">
          <span>Unassigned Seats:</span>
          <strong style="color: ${bus.availableSeats > 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${bus.availableSeats}</strong>
        </div>
      </div>
    </div>
    <div style="margin-top: var(--spacing-4);">
      ${actionHtml}
    </div>
  `;

  // Attach event listener to claim button
  const claimBtn = card.querySelector('.claim-bus-btn');
  if (claimBtn) {
    claimBtn.addEventListener('click', async () => {
      await handleClaimClick(claimBtn, bus.id, bus.busNumber);
    });
  }

  return card;
}

async function handleClaimClick(button, busId, busNumber) {
  if (button.disabled) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Claiming Bus...';

  try {
    const res = await window.Api.staffClaimBus(busId);
    window.UI?.showToast?.(`Bus ${busNumber} claimed successfully!`, 'success');
    // Redirect directly to the Bus Duty Cockpit
    setTimeout(() => {
      window.location.href = `staff-bus.html?busId=${encodeURIComponent(busId)}`;
    }, 600);
  } catch (err) {
    button.disabled = false;
    button.textContent = originalText;
    window.UI?.showToast?.(err.message || 'Failed to claim bus. It may have just been claimed.', 'danger');
    await refreshDashboard();
  }
}

function setupCompleteDutyModal() {
  const modal = document.getElementById('complete-duty-modal');
  const triggerBtn = document.getElementById('quick-complete-duty-btn');
  const closeBtn = document.getElementById('modal-close-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');
  const confirmBtn = document.getElementById('modal-confirm-complete-btn');

  function openModal() {
    if (!currentActiveDuty) return;
    document.getElementById('modal-bus-name').textContent = `${currentActiveDuty.bus.busNumber} (${currentActiveDuty.bus.routeName})`;
    document.getElementById('modal-att-count').textContent = `${currentActiveDuty.stats.present} present, ${currentActiveDuty.stats.absent} absent`;
    document.getElementById('modal-standing-count').textContent = `${currentActiveDuty.stats.standing} passengers`;
    modal.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
  }

  triggerBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  confirmBtn?.addEventListener('click', async () => {
    if (!currentActiveDuty) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Completing Duty...';

    try {
      const res = await window.Api.completeStaffDuty(currentActiveDuty.id);
      window.UI?.showToast?.(res.message || 'Duty completed successfully!', 'success');
      closeModal();
      await refreshDashboard();
    } catch (err) {
      window.UI?.showToast?.(err.message || 'Failed to complete duty.', 'danger');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Yes, Complete Duty';
    }
  });
}
