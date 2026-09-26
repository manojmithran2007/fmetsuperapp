/**
 * Admin Dashboard Page Logic — Phase 2
 * Tabbed SPA: Overview | Staff | Buses | Students | Analytics
 * Phase 1 staff-approval code is preserved exactly (see STAFF TAB section).
 */

document.addEventListener('DOMContentLoaded', async () => {

  // ==========================================================================
  // 1. GUARD & INITIALIZATION
  // ==========================================================================
  const profile = await window.Guards.protectAdminPage();
  if (!profile) return;

  document.getElementById('admin-name').textContent  = profile.fullName || 'Administrator';
  document.getElementById('admin-email').textContent = profile.email    || 'admin@college.edu';
  if (profile.fullName) {
    document.getElementById('admin-avatar').textContent = profile.fullName.charAt(0).toUpperCase();
  }

  document.getElementById('admin-logout-btn').addEventListener('click', async () => {
    await window.Auth.logout();
  });

  // ==========================================================================
  // 2. HELPER FUNCTIONS
  // ==========================================================================

  function formatDate(isoString) {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return isoString; }
  }

  function formatDateShort(isoString) {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch (e) { return isoString; }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function makeLoadingRow(cols, msg = 'Loading…') {
    return `<tr><td colspan="${cols}" style="text-align:center;padding:var(--spacing-8);color:var(--color-text-muted);">
      <div class="flex items-center justify-center gap-2">
        <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
        </svg><span>${msg}</span>
      </div></td></tr>`;
  }

  function makeEmptyRow(cols, msg = 'No records found.', icon = '📋') {
    return `<tr><td colspan="${cols}" style="text-align:center;padding:var(--spacing-10);color:var(--color-text-muted);">
      <div style="font-size:2rem;margin-bottom:var(--spacing-2);">${icon}</div>
      <div style="font-weight:var(--font-weight-medium);">${msg}</div></td></tr>`;
  }

  function makeErrorRow(cols, msg = 'Error loading data.') {
    return `<tr><td colspan="${cols}" style="text-align:center;padding:var(--spacing-8);color:var(--color-error);">⚠️ ${msg}</td></tr>`;
  }

  function showInlineAlert(containerId, message, type = 'error') {
    const el = document.getElementById(containerId);
    if (!el) return;
    const typeClass = type === 'success' ? 'alert-success' : type === 'warning' ? 'alert-warning' : 'alert-error';
    el.className = `alert ${typeClass}`;
    el.innerHTML = `<div>${escapeHtml(message)}</div>`;
    el.style.display = 'flex';
  }

  function hideInlineAlert(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.style.display = 'none';
  }

  // ==========================================================================
  // 3. MODAL HELPERS
  // ==========================================================================
  function openModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.add('active');
  }

  function closeModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.remove('active');
  }

  // Close on overlay backdrop click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });

  // Close on ✕ buttons
  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.closest('.modal-overlay');
      if (m) m.classList.remove('active');
    });
  });

  // Close on footer Cancel buttons
  document.querySelectorAll('.modal-close-btn-footer').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.closest('.modal-overlay');
      if (m) m.classList.remove('active');
    });
  });

  // ==========================================================================
  // 4. CONFIRMATION DIALOG
  // ==========================================================================
  let _confirmResolve = null;

  function showConfirm(title, message, confirmText = 'Confirm', danger = false) {
    return new Promise(resolve => {
      document.getElementById('confirm-title').textContent   = title;
      document.getElementById('confirm-message').textContent = message;
      const okBtn = document.getElementById('confirm-ok-btn');
      okBtn.textContent = confirmText;
      okBtn.className   = danger ? 'btn btn-danger' : 'btn btn-primary';
      _confirmResolve   = resolve;
      openModal('modal-confirm');
    });
  }

  document.getElementById('confirm-ok-btn').addEventListener('click', () => {
    closeModal('modal-confirm');
    if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
  });

  document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
    closeModal('modal-confirm');
    if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
  });

  // ==========================================================================
  // 5. TAB NAVIGATION
  // ==========================================================================
  let activeTab     = 'overview';
  const loadedTabs  = {};

  function switchTab(tabId) {
    document.querySelectorAll('.tab-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const section = document.getElementById(`tab-${tabId}`);
    if (section) section.style.display = 'block';

    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');

    activeTab = tabId;

    if (!loadedTabs[tabId]) {
      loadedTabs[tabId] = true;
      _loadTabData(tabId);
    }
  }

  function _loadTabData(tabId) {
    switch (tabId) {
      case 'overview':   loadDashboardStats(); loadRecentActivity(); loadRecentAuditPreview(); break;
      case 'monitoring': loadTodayMonitoring(); break;
      case 'staff':      loadStaffData('pending'); break;
      case 'buses':      loadBuses(); break;
      case 'students':   loadStudents(); loadBusesForDropdowns(); break;
      case 'reports':    loadReportsInitial(); break;
      case 'analytics':  loadAnalytics(); break;
      case 'audit':      loadAuditLogs(); break;
    }
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ==========================================================================
  // 6. OVERVIEW TAB
  // ==========================================================================
  async function loadDashboardStats() {
    const ids = ['stat-buses','stat-students','stat-staff','stat-pending','stat-capacity','stat-available','stat-assigned'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '…'; });
    try {
      const res = await window.Api.getDashboardStats();
      const s   = res.stats || {};
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
      setEl('stat-buses',     s.totalBuses);
      setEl('stat-students',  s.totalStudents);
      setEl('stat-staff',     s.totalStaff);
      setEl('stat-pending',   s.pendingStaff);
      setEl('stat-capacity',  s.totalCapacity);
      setEl('stat-available', s.availableSeats);
      setEl('stat-assigned',  s.assignedStudents);
    } catch (err) {
      console.error('Stats load failed:', err);
      ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    }
  }

  async function loadRecentActivity() {
    try {
      const res = await window.Api.getRecentActivity();
      const r   = res.recent || {};

      const busesTbody = document.getElementById('recent-buses-body');
      if (busesTbody) {
        busesTbody.innerHTML = (r.buses || []).length === 0
          ? `<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted);padding:var(--spacing-4);">No buses yet.</td></tr>`
          : (r.buses || []).map(b => `<tr>
              <td><span style="font-family:monospace;font-weight:var(--font-weight-medium);">${escapeHtml(b.bus_number)}</span></td>
              <td style="color:var(--color-text-muted);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(b.route_name)}">${escapeHtml(b.route_name)}</td>
              <td style="color:var(--color-text-muted);">${formatDateShort(b.created_at)}</td>
            </tr>`).join('');
      }

      const staffTbody = document.getElementById('recent-staff-body');
      if (staffTbody) {
        staffTbody.innerHTML = (r.staff || []).length === 0
          ? `<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted);padding:var(--spacing-4);">No staff yet.</td></tr>`
          : (r.staff || []).map(s => {
              const bc = s.approval_status === 'approved' ? 'badge-success'
                       : s.approval_status === 'rejected' ? 'badge-error' : 'badge-warning';
              return `<tr>
                <td style="font-weight:var(--font-weight-medium);">${escapeHtml(s.full_name)}</td>
                <td><span class="badge ${bc}" style="font-size:10px;">${s.approval_status}</span></td>
                <td style="color:var(--color-text-muted);">${formatDateShort(s.created_at)}</td>
              </tr>`;
            }).join('');
      }

      const stuTbody = document.getElementById('recent-students-body');
      if (stuTbody) {
        stuTbody.innerHTML = (r.students || []).length === 0
          ? `<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted);padding:var(--spacing-4);">No students yet.</td></tr>`
          : (r.students || []).map(s => `<tr>
              <td style="font-weight:var(--font-weight-medium);">${escapeHtml(s.full_name)}</td>
              <td style="font-family:monospace;font-size:var(--font-size-xs);">${escapeHtml(s.roll_number)}</td>
              <td style="color:var(--color-text-muted);">${s.buses ? escapeHtml(s.buses.bus_number) : '—'}</td>
            </tr>`).join('');
      }
    } catch (err) {
      console.error('Recent activity load failed:', err);
    }
  }

  async function loadRecentAuditPreview() {
    const tbody = document.getElementById('recent-audit-body');
    if (!tbody) return;
    try {
      const res = await window.Api.getAdminAuditLogs({ limit: 5 });
      const logs = res.auditLogs || [];
      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:var(--spacing-4);">No audit logs recorded yet.</td></tr>`;
        return;
      }
      tbody.innerHTML = logs.map(l => {
        const actionBadge = l.action.includes('REJECT') || l.action.includes('DELETE') ? 'badge-error'
                          : l.action.includes('APPROVE') || l.action.includes('CREATED') ? 'badge-success'
                          : 'badge-primary';
        const detailStr = l.details ? Object.entries(l.details).map(([k,v]) => `${k}: ${v}`).join(', ') : '—';
        return `<tr>
          <td style="color:var(--color-text-muted);">${formatDate(l.created_at)}</td>
          <td><span class="badge ${actionBadge}" style="font-size:10px;">${escapeHtml(l.action)}</span></td>
          <td style="font-weight:var(--font-weight-medium);">${escapeHtml(l.entity_type || '—')}</td>
          <td style="color:var(--color-text-muted);">${escapeHtml(l.performer_email || (l.performed_by ? l.performed_by.slice(0,8)+'…' : 'System'))}</td>
          <td style="color:var(--color-text-muted);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(detailStr)}">${escapeHtml(detailStr)}</td>
        </tr>`;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--color-error);padding:var(--spacing-4);">Failed to load audit trail.</td></tr>`;
    }
  }

  // Overview quick-action buttons
  document.getElementById('quick-view-monitoring')?.addEventListener('click', () => switchTab('monitoring'));
  document.getElementById('quick-view-reports')?.addEventListener('click',    () => switchTab('reports'));
  document.getElementById('quick-view-audit')?.addEventListener('click',      () => switchTab('audit'));
  document.getElementById('quick-all-audit')?.addEventListener('click',       () => switchTab('audit'));
  document.getElementById('quick-add-bus')?.addEventListener('click', () => {
    switchTab('buses');
    setTimeout(() => openAddBusModal(), 50);
  });
  document.getElementById('quick-add-student')?.addEventListener('click', () => {
    switchTab('students');
    setTimeout(() => { loadBusesForDropdowns(); openAddStudentModal(); }, 50);
  });
  document.getElementById('quick-manage-staff')?.addEventListener('click',   () => switchTab('staff'));
  document.getElementById('quick-view-buses')?.addEventListener('click',     () => switchTab('buses'));
  document.getElementById('quick-view-students')?.addEventListener('click',  () => switchTab('students'));
  document.getElementById('quick-view-analytics')?.addEventListener('click', () => switchTab('analytics'));

  // ==========================================================================
  // 7. STAFF TAB — Phase 1 code preserved exactly
  // ==========================================================================
  let currentFilter      = 'pending';
  const alertContainerId = 'staff-alert';
  const staffTableBody   = document.getElementById('staff-table-body');
  const refreshBtn       = document.getElementById('refresh-staff-btn');

  async function loadStaffData(statusFilter = currentFilter) {
    currentFilter = statusFilter;
    window.Ui.hideAlert(alertContainerId);

    document.querySelectorAll('.staff-filter-btn').forEach(btn => {
      btn.className = btn.dataset.status === currentFilter
        ? 'btn btn-sm btn-primary staff-filter-btn'
        : 'btn btn-sm btn-outline staff-filter-btn';
    });

    staffTableBody.innerHTML = makeLoadingRow(6, 'Loading staff records…');

    try {
      const response = await window.Api.getStaffList(currentFilter);

      if (response.counts) {
        document.getElementById('count-pending').textContent  = response.counts.pending  || 0;
        document.getElementById('count-approved').textContent = response.counts.approved || 0;
        document.getElementById('count-rejected').textContent = response.counts.rejected || 0;
        document.getElementById('count-total').textContent    = response.counts.total    || 0;
      }

      renderStaffTable(response.staff || []);
    } catch (err) {
      console.error('Failed to load staff list:', err);
      window.Ui.showAlert(alertContainerId, `Failed to load staff list: ${err.message}`, 'error');
      staffTableBody.innerHTML = makeErrorRow(6, 'Error loading staff data. Please try again.');
    }
  }

  function renderStaffTable(staffList) {
    if (!staffList || staffList.length === 0) {
      const filterLabel = currentFilter === 'all' ? '' : currentFilter;
      staffTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:var(--spacing-8);">
            <div style="font-size:2rem;margin-bottom:var(--spacing-2);">📋</div>
            <div style="font-weight:var(--font-weight-medium);">No ${filterLabel} staff accounts found</div>
            <div style="font-size:var(--font-size-xs);color:var(--color-text-subtle);margin-top:4px;">
              ${currentFilter === 'pending' ? 'All new staff registration requests have been processed.' : 'No records match the selected status filter.'}
            </div>
          </td>
        </tr>`;
      return;
    }

    staffTableBody.innerHTML = staffList.map(staff => {
      const regDate = formatDate(staff.created_at);
      let statusBadge = '';
      if (staff.approval_status === 'approved') {
        statusBadge = '<span class="badge badge-success">Approved</span>';
      } else if (staff.approval_status === 'rejected') {
        statusBadge = '<span class="badge badge-error">Rejected</span>';
      } else {
        statusBadge = '<span class="badge badge-warning">Pending Approval</span>';
      }

      let approvalDetails = '-';
      if (staff.approval_status === 'approved' && staff.approved_at) {
        approvalDetails = `<span style="font-size:var(--font-size-xs);color:var(--color-text-muted);">Approved ${formatDate(staff.approved_at)}</span>`;
      } else if (staff.approval_status === 'rejected') {
        approvalDetails = `<span style="font-size:var(--font-size-xs);color:var(--color-error-dark);">Application Rejected</span>`;
      }

      let actionButtons = '';
      if (staff.approval_status === 'pending') {
        actionButtons = `
          <div class="flex items-center justify-end gap-2">
            <button class="btn btn-sm btn-primary approve-btn" data-id="${staff.id}" data-name="${escapeHtml(staff.full_name)}">Approve</button>
            <button class="btn btn-sm btn-outline reject-btn" data-id="${staff.id}" data-name="${escapeHtml(staff.full_name)}" style="color:var(--color-error);border-color:var(--color-error-border);">Reject</button>
          </div>`;
      } else if (staff.approval_status === 'approved') {
        actionButtons = `
          <div class="flex items-center justify-end gap-2">
            <button class="btn btn-sm btn-outline reject-btn" data-id="${staff.id}" data-name="${escapeHtml(staff.full_name)}" style="color:var(--color-error);border-color:var(--color-error-border);">Revoke / Reject</button>
          </div>`;
      } else if (staff.approval_status === 'rejected') {
        actionButtons = `
          <div class="flex items-center justify-end gap-2">
            <button class="btn btn-sm btn-primary approve-btn" data-id="${staff.id}" data-name="${escapeHtml(staff.full_name)}">Re-Approve</button>
          </div>`;
      }

      return `
        <tr>
          <td><div style="font-weight:var(--font-weight-medium);color:var(--color-neutral-900);">${escapeHtml(staff.full_name)}</div></td>
          <td><span style="font-family:monospace;font-size:var(--font-size-xs);">${escapeHtml(staff.email)}</span></td>
          <td style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${regDate}</td>
          <td>${statusBadge}</td>
          <td>${approvalDetails}</td>
          <td style="text-align:right;">${actionButtons}</td>
        </tr>`;
    }).join('');

    document.querySelectorAll('.approve-btn').forEach(btn => btn.addEventListener('click', () => handleApproveAction(btn)));
    document.querySelectorAll('.reject-btn').forEach(btn  => btn.addEventListener('click', () => handleRejectAction(btn)));
  }

  async function handleApproveAction(btn) {
    const staffId   = btn.dataset.id;
    const staffName = btn.dataset.name;
    window.Ui.setButtonLoading(btn, true, 'Approving…');
    window.Ui.hideAlert(alertContainerId);
    try {
      const response = await window.Api.approveStaff(staffId);
      window.Ui.showAlert(alertContainerId, response.message || `Staff member "${staffName}" approved successfully.`, 'success');
      await loadStaffData(currentFilter);
    } catch (err) {
      console.error('Approval failed:', err);
      window.Ui.showAlert(alertContainerId, `Failed to approve staff: ${err.message}`, 'error');
      window.Ui.setButtonLoading(btn, false);
    }
  }

  async function handleRejectAction(btn) {
    const staffId   = btn.dataset.id;
    const staffName = btn.dataset.name;
    window.Ui.setButtonLoading(btn, true, 'Rejecting…');
    window.Ui.hideAlert(alertContainerId);
    try {
      const response = await window.Api.rejectStaff(staffId);
      window.Ui.showAlert(alertContainerId, response.message || `Staff member "${staffName}" has been rejected.`, 'warning');
      await loadStaffData(currentFilter);
    } catch (err) {
      console.error('Rejection failed:', err);
      window.Ui.showAlert(alertContainerId, `Failed to reject staff: ${err.message}`, 'error');
      window.Ui.setButtonLoading(btn, false);
    }
  }

  document.querySelectorAll('.staff-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => loadStaffData(btn.dataset.status));
  });

  if (refreshBtn) refreshBtn.addEventListener('click', () => loadStaffData(currentFilter));

  // ==========================================================================
  // 8. BUSES TAB
  // ==========================================================================
  let _busEditId = null;
  const BUS_ALERT = 'bus-alert';

  async function loadBuses(search = '') {
    hideInlineAlert(BUS_ALERT);
    const tbody = document.getElementById('bus-table-body');
    tbody.innerHTML = makeLoadingRow(7, 'Loading buses…');
    try {
      const res = await window.Api.getBuses(search);
      renderBusTable(res.buses || []);
    } catch (err) {
      window.Ui.showAlert(BUS_ALERT, `Failed to load buses: ${err.message}`, 'error');
      tbody.innerHTML = makeErrorRow(7, 'Error loading bus data.');
    }
  }

  function renderBusTable(buses) {
    const tbody = document.getElementById('bus-table-body');
    if (!buses || buses.length === 0) {
      tbody.innerHTML = makeEmptyRow(7, 'No buses found. Add your first bus!', '🚌');
      return;
    }
    tbody.innerHTML = buses.map(bus => {
      const pct       = bus.seating_capacity > 0 ? Math.round((bus.assigned_students / bus.seating_capacity) * 100) : 0;
      const avColor   = bus.available_seats === 0 ? 'var(--color-error)' : bus.available_seats < 5 ? 'var(--color-warning-dark)' : 'var(--color-success-dark)';
      const statusBadge = bus.is_active
        ? '<span class="badge badge-success">Active</span>'
        : '<span class="badge">Inactive</span>';
      return `<tr>
        <td><span style="font-family:monospace;font-weight:var(--font-weight-bold);color:var(--color-primary-700);">${escapeHtml(bus.bus_number)}</span></td>
        <td>${escapeHtml(bus.route_name)}</td>
        <td style="text-align:center;">${bus.seating_capacity}</td>
        <td style="text-align:center;font-weight:var(--font-weight-medium);">${bus.assigned_students}</td>
        <td style="text-align:center;font-weight:var(--font-weight-medium);color:${avColor};">${bus.available_seats}</td>
        <td>${statusBadge}</td>
        <td style="text-align:right;">
          <div class="flex items-center justify-end gap-2">
            <button class="btn btn-sm btn-outline view-bus-btn"   data-id="${bus.id}">View</button>
            <button class="btn btn-sm btn-outline edit-bus-btn"   data-id="${bus.id}"
              data-number="${escapeHtml(bus.bus_number)}"
              data-route="${escapeHtml(bus.route_name)}"
              data-capacity="${bus.seating_capacity}">Edit</button>
            <button class="btn btn-sm btn-outline delete-bus-btn" data-id="${bus.id}"
              data-number="${escapeHtml(bus.bus_number)}"
              data-assigned="${bus.assigned_students}"
              style="color:var(--color-error);border-color:var(--color-error-border);">Delete</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    document.querySelectorAll('.view-bus-btn')  .forEach(b => b.addEventListener('click', () => openBusDetails(b.dataset.id)));
    document.querySelectorAll('.edit-bus-btn')  .forEach(b => b.addEventListener('click', () => openEditBusModal(b)));
    document.querySelectorAll('.delete-bus-btn').forEach(b => b.addEventListener('click', () => handleDeleteBus(b)));
  }

  function openAddBusModal() {
    _busEditId = null;
    document.getElementById('bus-modal-title').textContent = 'Add New Bus';
    document.getElementById('bus-form').reset();
    hideInlineAlert('bus-form-alert');
    const submitBtn = document.getElementById('bus-submit-btn');
    if (submitBtn) {
      window.Ui.setButtonLoading(submitBtn, false);
      submitBtn.textContent = 'Add Bus';
    }
    openModal('modal-bus-form');
  }

  function openEditBusModal(btn) {
    _busEditId = btn.dataset.id;
    document.getElementById('bus-modal-title').textContent    = 'Edit Bus';
    document.getElementById('bus-number-input').value         = btn.dataset.number;
    document.getElementById('bus-route-input').value          = btn.dataset.route;
    document.getElementById('bus-capacity-input').value       = btn.dataset.capacity;
    const submitBtn = document.getElementById('bus-submit-btn');
    if (submitBtn) {
      window.Ui.setButtonLoading(submitBtn, false);
      submitBtn.textContent = 'Save Changes';
    }
    hideInlineAlert('bus-form-alert');
    openModal('modal-bus-form');
  }

  document.getElementById('add-bus-btn').addEventListener('click', openAddBusModal);

  document.getElementById('bus-form').addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = document.getElementById('bus-submit-btn');
    hideInlineAlert('bus-form-alert');

    if (submitBtn && submitBtn.disabled) return;

    const busNumber       = document.getElementById('bus-number-input').value.trim();
    const routeName       = document.getElementById('bus-route-input').value.trim();
    const seatingCapacity = document.getElementById('bus-capacity-input').value.trim();

    if (!busNumber || !routeName || !seatingCapacity) {
      showInlineAlert('bus-form-alert', 'All fields are required.', 'error');
      return;
    }

    const capNum = parseInt(seatingCapacity, 10);
    if (isNaN(capNum) || capNum <= 0) {
      showInlineAlert('bus-form-alert', 'Seating capacity must be a positive number.', 'error');
      return;
    }

    window.Ui.setButtonLoading(submitBtn, true, _busEditId ? 'Saving…' : 'Adding…');

    try {
      let res;
      if (_busEditId) {
        res = await window.Api.updateBus(_busEditId, { busNumber, routeName, seatingCapacity: capNum });
      } else {
        res = await window.Api.createBus({ busNumber, routeName, seatingCapacity: capNum });
      }

      // Reset form after successful submission
      document.getElementById('bus-form').reset();
      _busEditId = null;

      closeModal('modal-bus-form');
      window.Ui.showAlert(BUS_ALERT, res.message || 'Bus saved successfully.', 'success');
      window.Ui.showToast?.(res.message || 'Bus saved successfully.', 'success');

      // Immediately display newly added bus in existing table
      await loadBuses(document.getElementById('bus-search-input')?.value.trim() || '');
      await loadBusesForDropdowns();
      refreshStats();
    } catch (err) {
      showInlineAlert('bus-form-alert', err.message || 'Failed to save bus.', 'error');
    } finally {
      window.Ui.setButtonLoading(submitBtn, false);
      if (submitBtn) {
        submitBtn.textContent = _busEditId ? 'Save Changes' : 'Add Bus';
      }
    }
  });

  async function handleDeleteBus(btn) {
    const busId      = btn.dataset.id;
    const busNumber  = btn.dataset.number;
    const assigned   = parseInt(btn.dataset.assigned || '0', 10);

    if (assigned > 0) {
      window.Ui.showAlert(BUS_ALERT,
        `Cannot delete bus "${busNumber}". It has ${assigned} student(s) assigned. Reassign or remove them first.`,
        'error');
      return;
    }

    const ok = await showConfirm('Delete Bus',
      `Delete bus "${busNumber}" permanently? This cannot be undone.`,
      'Delete Bus', true);
    if (!ok) return;

    try {
      const res = await window.Api.deleteBus(busId);
      window.Ui.showAlert(BUS_ALERT, res.message, 'success');
      loadBuses();
      refreshStats();
    } catch (err) {
      window.Ui.showAlert(BUS_ALERT, `Failed to delete bus: ${err.message}`, 'error');
    }
  }

  async function openBusDetails(busId) {
    const body = document.getElementById('bus-details-body');
    body.innerHTML = `<div class="flex items-center justify-center gap-2" style="padding:var(--spacing-8);color:var(--color-text-muted);">
      <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
      </svg><span>Loading bus details…</span></div>`;
    openModal('modal-bus-details');
    try {
      const res = await window.Api.getBusDetails(busId);
      const { bus, students } = res;
      document.getElementById('bus-details-modal-title').textContent = `Bus ${bus.bus_number} Details`;
      body.innerHTML = `
        <div class="grid grid-cols-3" style="gap:var(--spacing-3);margin-bottom:var(--spacing-5);">
          <div class="card" style="padding:var(--spacing-4);text-align:center;">
            <div style="font-size:var(--font-size-2xl);font-weight:var(--font-weight-black);color:var(--color-secondary-700);">${bus.seating_capacity}</div>
            <div class="stat-label">Total Seats</div>
          </div>
          <div class="card" style="padding:var(--spacing-4);text-align:center;">
            <div style="font-size:var(--font-size-2xl);font-weight:var(--font-weight-black);color:var(--color-primary-600);">${bus.assigned_students}</div>
            <div class="stat-label">Assigned Students</div>
          </div>
          <div class="card" style="padding:var(--spacing-4);text-align:center;">
            <div style="font-size:var(--font-size-2xl);font-weight:var(--font-weight-black);color:var(--color-success-dark);">${bus.available_seats}</div>
            <div class="stat-label">Available Seats</div>
          </div>
        </div>
        <p style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-bottom:var(--spacing-4);">
          <strong>Route:</strong> ${escapeHtml(bus.route_name)}
        </p>
        <h3 style="font-size:var(--font-size-base);font-weight:var(--font-weight-bold);margin-bottom:var(--spacing-3);">Assigned Students</h3>
        <div class="table-responsive">
          <table class="table">
            <thead><tr><th style="text-align:center;">Seat #</th><th>Student Name</th><th>Roll Number</th></tr></thead>
            <tbody>
              ${students.length === 0
                ? `<tr><td colspan="3" style="text-align:center;padding:var(--spacing-6);color:var(--color-text-muted);">No students assigned to this bus.</td></tr>`
                : students.map(s => `<tr>
                    <td style="text-align:center;font-weight:var(--font-weight-bold);color:var(--color-primary-600);">${s.seat_number || '—'}</td>
                    <td style="font-weight:var(--font-weight-medium);">${escapeHtml(s.full_name)}</td>
                    <td style="font-family:monospace;font-size:var(--font-size-xs);">${escapeHtml(s.roll_number)}</td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      body.innerHTML = `<div style="text-align:center;color:var(--color-error);padding:var(--spacing-8);">⚠️ Failed to load bus details: ${escapeHtml(err.message)}</div>`;
    }
  }

  // Bus search with debounce
  let _busSearchTimer;
  document.getElementById('bus-search-input')?.addEventListener('input', e => {
    clearTimeout(_busSearchTimer);
    _busSearchTimer = setTimeout(() => loadBuses(e.target.value.trim()), 400);
  });

  // ==========================================================================
  // 9. STUDENTS TAB
  // ==========================================================================
  let _studentEditId  = null;
  let _assignStudentId = null;
  let _assignMode      = 'assign'; // 'assign' | 'move'
  let _cachedBuses     = [];
  const STU_ALERT      = 'student-alert';

  async function loadBusesForDropdowns() {
    try {
      const res    = await window.Api.getBuses();
      _cachedBuses = res.buses || [];
      _populateBusDropdowns();
    } catch (err) {
      console.warn('Could not load buses for dropdowns:', err.message);
    }
  }

  function _populateBusDropdowns() {
    const targets = [
      { id: 'student-bus-select',   defaultVal: '', defaultText: 'No Bus (Unassigned)', extras: [] },
      { id: 'assign-bus-select',    defaultVal: '', defaultText: '— Choose a bus —', extras: [] },
      { id: 'student-filter-bus',   defaultVal: 'all', defaultText: 'All Buses',
        extras: [{ val: 'unassigned', text: 'Unassigned Students' }] }
    ];

    targets.forEach(({ id, defaultVal, defaultText, extras }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = `<option value="${defaultVal}">${defaultText}</option>`;
      extras.forEach(({ val, text }) => { el.innerHTML += `<option value="${val}">${text}</option>`; });
      _cachedBuses.forEach(bus => {
        el.innerHTML += `<option value="${bus.id}">${escapeHtml(bus.bus_number)} — ${escapeHtml(bus.route_name)} (Cap: ${bus.seating_capacity}, Avail: ${bus.available_seats})</option>`;
      });
    });
  }

  function _getStudentSearch() { return document.getElementById('student-search-input')?.value || ''; }
  function _getStudentBusFilter() {
    const v = document.getElementById('student-filter-bus')?.value;
    return (!v || v === 'all') ? '' : v;
  }

  async function loadStudents(search = '', busId = '') {
    hideInlineAlert(STU_ALERT);
    const tbody = document.getElementById('student-table-body');
    tbody.innerHTML = makeLoadingRow(7, 'Loading students…');
    try {
      const res = await window.Api.getStudents({ search, busId });
      renderStudentTable(res.students || []);
    } catch (err) {
      window.Ui.showAlert(STU_ALERT, `Failed to load students: ${err.message}`, 'error');
      tbody.innerHTML = makeErrorRow(7, 'Error loading student data.');
    }
  }

  function renderStudentTable(students) {
    const tbody = document.getElementById('student-table-body');
    if (!students || students.length === 0) {
      tbody.innerHTML = makeEmptyRow(7, 'No students found.', '🎓');
      return;
    }
    tbody.innerHTML = students.map(s => {
      const bus = s.buses;
      const busCell = bus
        ? `<span style="font-family:monospace;font-weight:var(--font-weight-medium);">${escapeHtml(bus.bus_number)}</span>
           <br><span style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${escapeHtml(bus.route_name)}</span>`
        : `<span style="color:var(--color-text-subtle);">Unassigned</span>`;
      const seatCell = s.seat_number
        ? `<span style="font-weight:var(--font-weight-bold);color:var(--color-primary-600);">${s.seat_number}</span>`
        : `<span style="color:var(--color-text-subtle);">—</span>`;
      const statusBadge = s.is_active
        ? `<span class="badge badge-success">Active</span>`
        : `<span class="badge">Inactive</span>`;

      const assignMoveBtn = s.bus_id
        ? `<button class="btn btn-sm btn-outline move-student-btn"
              data-id="${s.id}" data-name="${escapeHtml(s.full_name)}">Move Bus</button>
           <button class="btn btn-sm btn-outline unassign-student-btn"
              data-id="${s.id}" data-name="${escapeHtml(s.full_name)}"
              style="color:var(--color-warning-dark);border-color:var(--color-warning-border);">Remove Bus</button>`
        : `<button class="btn btn-sm btn-outline assign-student-btn"
              data-id="${s.id}" data-name="${escapeHtml(s.full_name)}">Assign Bus</button>`;

      return `<tr>
        <td><div style="font-weight:var(--font-weight-medium);">${escapeHtml(s.full_name)}</div></td>
        <td><span style="font-family:monospace;font-size:var(--font-size-xs);">${escapeHtml(s.roll_number)}</span></td>
        <td>${busCell}</td>
        <td style="text-align:center;">${seatCell}</td>
        <td>${statusBadge}</td>
        <td style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${formatDateShort(s.created_at)}</td>
        <td style="text-align:right;">
          <div class="flex items-center justify-end gap-2" style="flex-wrap:wrap;">
            <button class="btn btn-sm btn-outline edit-student-btn"
              data-id="${s.id}" data-name="${escapeHtml(s.full_name)}" data-roll="${escapeHtml(s.roll_number)}">Edit</button>
            ${assignMoveBtn}
            <button class="btn btn-sm btn-outline delete-student-btn"
              data-id="${s.id}" data-name="${escapeHtml(s.full_name)}"
              style="color:var(--color-error);border-color:var(--color-error-border);">Delete</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    document.querySelectorAll('.edit-student-btn')    .forEach(b => b.addEventListener('click', () => openEditStudentModal(b)));
    document.querySelectorAll('.assign-student-btn')  .forEach(b => b.addEventListener('click', () => openAssignModal(b, 'assign')));
    document.querySelectorAll('.move-student-btn')    .forEach(b => b.addEventListener('click', () => openAssignModal(b, 'move')));
    document.querySelectorAll('.unassign-student-btn').forEach(b => b.addEventListener('click', () => handleUnassignStudent(b)));
    document.querySelectorAll('.delete-student-btn')  .forEach(b => b.addEventListener('click', () => handleDeleteStudent(b)));
  }

  function openAddStudentModal() {
    _studentEditId = null;
    document.getElementById('student-modal-title').textContent  = 'Add New Student';
    document.getElementById('student-form').reset();
    document.getElementById('student-bus-seat-section').style.display = 'block';
    document.getElementById('student-seat-hint').textContent = '';
    const submitBtn = document.getElementById('student-submit-btn');
    if (submitBtn) {
      window.Ui.setButtonLoading(submitBtn, false);
      submitBtn.textContent = 'Add Student';
    }
    hideInlineAlert('student-form-alert');
    _populateBusDropdowns();
    openModal('modal-student-form');
  }

  function openEditStudentModal(btn) {
    _studentEditId = btn.dataset.id;
    document.getElementById('student-modal-title').textContent  = 'Edit Student';
    document.getElementById('student-name-input').value          = btn.dataset.name;
    document.getElementById('student-roll-input').value          = btn.dataset.roll;
    document.getElementById('student-bus-seat-section').style.display = 'none';
    const submitBtn = document.getElementById('student-submit-btn');
    if (submitBtn) {
      window.Ui.setButtonLoading(submitBtn, false);
      submitBtn.textContent = 'Save Changes';
    }
    hideInlineAlert('student-form-alert');
    openModal('modal-student-form');
  }

  function openAssignModal(btn, mode) {
    _assignStudentId = btn.dataset.id;
    _assignMode      = mode;
    const studentName = btn.dataset.name;
    document.getElementById('assign-modal-title').textContent = mode === 'move'
      ? `Move Student: ${studentName}`
      : `Assign Bus: ${studentName}`;
    document.getElementById('assign-bus-select').value  = '';
    document.getElementById('assign-seat-input').value  = '';
    document.getElementById('assign-seat-info').textContent = '';
    const submitBtn = document.getElementById('assign-submit-btn');
    if (submitBtn) {
      window.Ui.setButtonLoading(submitBtn, false);
      submitBtn.textContent = mode === 'move' ? 'Move Student' : 'Assign to Bus';
    }
    hideInlineAlert('assign-form-alert');
    _populateBusDropdowns();
    openModal('modal-assign-student');
  }

  // Show capacity hint when bus selected in assign modal
  document.getElementById('assign-bus-select')?.addEventListener('change', e => {
    const bus  = _cachedBuses.find(b => b.id === e.target.value);
    const info = document.getElementById('assign-seat-info');
    if (info) info.textContent = bus ? `Capacity: ${bus.seating_capacity} | Available: ${bus.available_seats} seat(s)` : '';
    const seatInput = document.getElementById('assign-seat-input');
    if (seatInput) seatInput.max = bus ? String(bus.seating_capacity) : '';
  });

  // Show capacity hint when bus selected in add-student modal
  document.getElementById('student-bus-select')?.addEventListener('change', e => {
    const bus  = _cachedBuses.find(b => b.id === e.target.value);
    const hint = document.getElementById('student-seat-hint');
    if (hint) hint.textContent = bus ? `Valid seats: 1–${bus.seating_capacity} | Available: ${bus.available_seats} seat(s)` : '';
    const seatInput = document.getElementById('student-seat-input');
    if (seatInput) { seatInput.max = bus ? String(bus.seating_capacity) : ''; }
  });

  document.getElementById('add-student-btn')?.addEventListener('click', openAddStudentModal);

  document.getElementById('student-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = document.getElementById('student-submit-btn');
    hideInlineAlert('student-form-alert');

    if (submitBtn && submitBtn.disabled) return;

    const fullName   = document.getElementById('student-name-input').value.trim();
    const rollNumber = document.getElementById('student-roll-input').value.trim();

    if (!fullName || !rollNumber) {
      showInlineAlert('student-form-alert', 'Name and roll number are required.', 'error');
      return;
    }

    window.Ui.setButtonLoading(submitBtn, true, _studentEditId ? 'Saving…' : 'Adding…');

    try {
      let res;
      if (_studentEditId) {
        res = await window.Api.updateStudent(_studentEditId, { fullName, rollNumber });
      } else {
        const busId      = document.getElementById('student-bus-select').value;
        const seatNumber = document.getElementById('student-seat-input').value;
        res = await window.Api.createStudent({ fullName, rollNumber, busId, seatNumber });
      }

      // Automatically reset form after successful submission
      document.getElementById('student-form').reset();
      _studentEditId = null;

      closeModal('modal-student-form');
      window.Ui.showAlert(STU_ALERT, res.message || 'Student saved successfully.', 'success');
      window.Ui.showToast?.(res.message || 'Student saved successfully.', 'success');

      // Immediately display newly added student in existing table
      await loadStudents(_getStudentSearch(), _getStudentBusFilter());
      await loadBusesForDropdowns();
      if (activeTab === 'buses') await loadBuses();
      refreshStats();
    } catch (err) {
      showInlineAlert('student-form-alert', err.message || 'Failed to save student.', 'error');
    } finally {
      window.Ui.setButtonLoading(submitBtn, false);
      if (submitBtn) {
        submitBtn.textContent = _studentEditId ? 'Save Changes' : 'Add Student';
      }
    }
  });

  document.getElementById('assign-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = document.getElementById('assign-submit-btn');
    hideInlineAlert('assign-form-alert');

    if (submitBtn && submitBtn.disabled) return;

    const busId      = document.getElementById('assign-bus-select').value;
    const seatNumber = document.getElementById('assign-seat-input').value;

    if (!busId) {
      showInlineAlert('assign-form-alert', 'Please select a bus.', 'error');
      return;
    }

    window.Ui.setButtonLoading(submitBtn, true, 'Saving…');

    try {
      let res;
      if (_assignMode === 'move') {
        res = await window.Api.moveStudent(_assignStudentId, { newBusId: busId, newSeatNumber: seatNumber });
      } else {
        res = await window.Api.assignStudent(_assignStudentId, { busId, seatNumber });
      }

      document.getElementById('assign-form').reset();
      closeModal('modal-assign-student');
      window.Ui.showAlert(STU_ALERT, res.message || 'Assignment updated successfully.', 'success');
      window.Ui.showToast?.(res.message || 'Assignment updated successfully.', 'success');
      await loadStudents(_getStudentSearch(), _getStudentBusFilter());
      if (activeTab === 'buses') await loadBuses();
      refreshStats();
      await loadBusesForDropdowns();
    } catch (err) {
      showInlineAlert('assign-form-alert', err.message || 'Failed to assign bus.', 'error');
    } finally {
      window.Ui.setButtonLoading(submitBtn, false);
      if (submitBtn) {
        submitBtn.textContent = _assignMode === 'move' ? 'Move Student' : 'Assign to Bus';
      }
    }
  });

  async function handleUnassignStudent(btn) {
    const studentId   = btn.dataset.id;
    const studentName = btn.dataset.name;
    const ok = await showConfirm(
      'Remove from Bus',
      `Remove "${studentName}" from their current bus assignment? The student record is kept.`,
      'Remove from Bus', false);
    if (!ok) return;
    try {
      const res = await window.Api.unassignStudent(studentId);
      window.Ui.showAlert(STU_ALERT, res.message, 'success');
      loadStudents(_getStudentSearch(), _getStudentBusFilter());
      if (activeTab === 'buses') loadBuses();
      refreshStats();
    } catch (err) {
      window.Ui.showAlert(STU_ALERT, `Failed to remove assignment: ${err.message}`, 'error');
    }
  }

  async function handleDeleteStudent(btn) {
    const studentId   = btn.dataset.id;
    const studentName = btn.dataset.name;
    const ok = await showConfirm(
      'Delete Student',
      `Permanently delete student "${studentName}"? This cannot be undone.`,
      'Delete Student', true);
    if (!ok) return;
    try {
      const res = await window.Api.deleteStudent(studentId);
      window.Ui.showAlert(STU_ALERT, res.message, 'success');
      loadStudents(_getStudentSearch(), _getStudentBusFilter());
      refreshStats();
    } catch (err) {
      window.Ui.showAlert(STU_ALERT, `Failed to delete student: ${err.message}`, 'error');
    }
  }

  // Student search & filter
  let _stuSearchTimer;
  document.getElementById('student-search-input')?.addEventListener('input', e => {
    clearTimeout(_stuSearchTimer);
    _stuSearchTimer = setTimeout(() => loadStudents(e.target.value.trim(), _getStudentBusFilter()), 400);
  });

  document.getElementById('student-filter-bus')?.addEventListener('change', () => {
    loadStudents(_getStudentSearch(), _getStudentBusFilter());
  });

  document.getElementById('refresh-student-btn')?.addEventListener('click', () => {
    loadStudents(_getStudentSearch(), _getStudentBusFilter());
  });

  // ==========================================================================
  // 10. TODAY'S DUTY MONITORING (Phase 4 Fleet Cockpit)
  // ==========================================================================
  async function loadTodayMonitoring() {
    const tbody = document.getElementById('monitoring-table-body');
    if (!tbody) return;
    tbody.innerHTML = makeLoadingRow(11, 'Loading live fleet cockpit…');

    try {
      const res = await window.Api.getAdminTodayMonitoring();
      const { date, summary: s = {}, fleet = [] } = res;

      const dateEl = document.getElementById('monitoring-date-display');
      if (dateEl) dateEl.textContent = formatDateShort(date);

      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
      setEl('mon-total-buses',      s.totalBuses);
      setEl('mon-assigned-buses',   s.assignedBuses);
      setEl('mon-in-duty',          s.inDutyBuses);
      setEl('mon-completed',        s.completedBuses);
      setEl('mon-unassigned',       s.unassignedBuses);
      setEl('mon-total-present',    s.totalPresent);
      setEl('mon-total-standing',   s.totalStanding);
      setEl('mon-total-riders',     s.totalTransitStudents);

      if (fleet.length === 0) {
        tbody.innerHTML = makeEmptyRow(11, 'No buses configured in the system.', '🚌');
        return;
      }

      tbody.innerHTML = fleet.map(b => {
        let statusBadge = '<span class="badge badge-unassigned">Unassigned</span>';
        if (b.duty_status === 'in_duty') {
          statusBadge = '<span class="badge badge-in-duty"><span class="live-pulse"></span>In-Transit</span>';
        } else if (b.duty_status === 'completed') {
          statusBadge = '<span class="badge badge-completed">Completed</span>';
        }

        const staffName = b.staff_name
          ? `<div style="font-weight:var(--font-weight-medium);">${escapeHtml(b.staff_name)}</div>
             <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${escapeHtml(b.staff_email || '')}</div>`
          : '<span style="color:var(--color-text-muted);">—</span>';

        const presentStyle = b.present_count > 0 ? 'color:var(--color-success-dark);font-weight:bold;' : 'color:var(--color-text-muted);';
        const standStyle   = b.standing_count > 0 ? 'color:var(--color-warning-dark);font-weight:bold;' : 'color:var(--color-text-muted);';

        return `<tr>
          <td><span style="font-family:monospace;font-weight:var(--font-weight-bold);color:var(--color-primary-700);">${escapeHtml(b.bus_number)}</span></td>
          <td style="color:var(--color-text-muted);">${escapeHtml(b.route_name)}</td>
          <td>${staffName}</td>
          <td>${statusBadge}</td>
          <td style="text-align:center;">${b.seating_capacity}</td>
          <td style="text-align:center;font-weight:var(--font-weight-medium);">${b.assigned_students}</td>
          <td style="text-align:center;${presentStyle}">${b.present_count}</td>
          <td style="text-align:center;${standStyle}">${b.standing_count}</td>
          <td style="text-align:center;font-weight:var(--font-weight-bold);">${b.total_transit_students}</td>
          <td style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${b.claimed_at ? formatDate(b.claimed_at) : '—'}</td>
          <td style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${b.completed_at ? formatDate(b.completed_at) : '—'}</td>
        </tr>`;
      }).join('');

    } catch (err) {
      console.error('Monitoring load failed:', err);
      tbody.innerHTML = makeErrorRow(11, 'Failed to load fleet monitoring: ' + err.message);
    }
  }

  document.getElementById('refresh-monitoring-btn')?.addEventListener('click', loadTodayMonitoring);

  // ==========================================================================
  // 11. REPORTS CENTER (Phase 4 Multi-Subtab & CSV Export)
  // ==========================================================================
  let activeReportSubtab = 'daily';
  let reportsInitialized = false;

  function loadReportsInitial() {
    if (!reportsInitialized) {
      reportsInitialized = true;
      initReportsFilters();
      initReportsSubtabs();
    }
    fetchActiveReport();
  }

  function initReportsFilters() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const startDateInput = document.getElementById('report-start-date');
    const endDateInput   = document.getElementById('report-end-date');

    if (startDateInput && !startDateInput.value) startDateInput.value = todayStr;
    if (endDateInput && !endDateInput.value)     endDateInput.value   = todayStr;

    // Load filter dropdowns
    loadReportFilterDropdowns();

    // Presets
    document.querySelectorAll('.report-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.report-preset-btn').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-outline');
        });
        btn.classList.remove('btn-outline');
        btn.classList.add('btn-primary');

        const preset = btn.dataset.preset;
        const now = new Date();
        let sDate = new Date();
        let eDate = new Date();

        if (preset === 'today') {
          sDate = now; eDate = now;
        } else if (preset === 'yesterday') {
          sDate.setDate(now.getDate() - 1);
          eDate = new Date(sDate);
        } else if (preset === 'week') {
          sDate.setDate(now.getDate() - 7);
          eDate = now;
        } else if (preset === 'month') {
          sDate = new Date(now.getFullYear(), now.getMonth(), 1);
          eDate = now;
        }

        if (startDateInput) startDateInput.value = sDate.toISOString().slice(0, 10);
        if (endDateInput)   endDateInput.value   = eDate.toISOString().slice(0, 10);

        fetchActiveReport();
      });
    });

    document.getElementById('report-apply-btn')?.addEventListener('click', () => fetchActiveReport());
    document.getElementById('report-reset-btn')?.addEventListener('click', () => {
      if (startDateInput) startDateInput.value = todayStr;
      if (endDateInput)   endDateInput.value   = todayStr;
      const bSel = document.getElementById('report-bus-filter');
      if (bSel) bSel.value = '';
      const sSel = document.getElementById('report-staff-filter');
      if (sSel) sSel.value = '';
      fetchActiveReport();
    });

    // CSV Export button
    document.getElementById('report-export-csv-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('report-export-csv-btn');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = 'Exporting…';
      try {
        const filters = getReportCurrentFilters();
        const fname = `${activeReportSubtab}-report-${new Date().toISOString().slice(0,10)}.csv`;
        await window.Api.downloadAdminReportCSV(activeReportSubtab, filters, fname);
      } catch (err) {
        alert('Failed to export CSV: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  async function loadReportFilterDropdowns() {
    try {
      const busRes = await window.Api.getBuses();
      const busSel = document.getElementById('report-bus-filter');
      if (busSel && busRes.buses) {
        const cur = busSel.value;
        busSel.innerHTML = '<option value="">All Buses</option>' +
          busRes.buses.map(b => `<option value="${b.id}">${escapeHtml(b.bus_number)} — ${escapeHtml(b.route_name)}</option>`).join('');
        busSel.value = cur;
      }

      const staffRes = await window.Api.getStaffList('all');
      const staffSel = document.getElementById('report-staff-filter');
      if (staffSel && staffRes.staff) {
        const cur = staffSel.value;
        staffSel.innerHTML = '<option value="">All Staff</option>' +
          staffRes.staff.map(s => `<option value="${s.id}">${escapeHtml(s.full_name)} (${escapeHtml(s.email)})</option>`).join('');
        staffSel.value = cur;
      }
    } catch (err) {
      console.warn('Could not populate report filters:', err);
    }
  }

  function initReportsSubtabs() {
    document.querySelectorAll('.subtab-btn[data-report-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.subtab-btn[data-report-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        activeReportSubtab = btn.dataset.reportTab;

        document.querySelectorAll('.report-subtab-view').forEach(view => view.style.display = 'none');
        const targetView = document.getElementById(`subtab-${activeReportSubtab}-container`);
        if (targetView) targetView.style.display = 'block';

        fetchActiveReport();
      });
    });
  }

  function getReportCurrentFilters() {
    return {
      startDate: document.getElementById('report-start-date')?.value || '',
      endDate:   document.getElementById('report-end-date')?.value   || '',
      busId:     document.getElementById('report-bus-filter')?.value || '',
      staffId:   document.getElementById('report-staff-filter')?.value || ''
    };
  }

  async function fetchActiveReport() {
    const filters = getReportCurrentFilters();

    try {
      switch (activeReportSubtab) {
        case 'daily':
          await renderDailyReport(filters);
          break;
        case 'buses':
          await renderBusReport(filters);
          break;
        case 'staff':
          await renderStaffReport(filters);
          break;
        case 'attendance':
          await renderAttendanceReport(filters);
          break;
        case 'standing':
          await renderStandingReport(filters);
          break;
      }
    } catch (err) {
      console.error(`Error rendering report (${activeReportSubtab}):`, err);
    }
  }

  function updateReportMetricsRibbon(trips, present, absent, standing, riders, utilPct) {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setVal('rep-summary-trips',       trips);
    setVal('rep-summary-present',     present);
    setVal('rep-summary-absent',      absent);
    setVal('rep-summary-standing',    standing);
    setVal('rep-summary-total',       riders);
    setVal('rep-summary-utilization', utilPct + '%');
  }

  async function renderDailyReport(filters) {
    const tbody = document.getElementById('report-daily-body');
    if (!tbody) return;
    tbody.innerHTML = makeLoadingRow(8, 'Loading daily report…');

    const res = await window.Api.getAdminDailyReports(filters);
    const rows = res.reports || [];

    if (rows.length === 0) {
      tbody.innerHTML = makeEmptyRow(8, 'No duty or attendance records for this date range.', '📅');
      updateReportMetricsRibbon(0, 0, 0, 0, 0, 0);
      return;
    }

    let totTrips = 0, totPres = 0, totAbs = 0, totStand = 0, totRiders = 0;
    rows.forEach(r => {
      totTrips   += r.buses_run;
      totPres    += r.present_students;
      totAbs     += r.absent_students;
      totStand   += r.standing_students;
      totRiders  += r.total_transit_riders;
    });

    const totSeated = totPres + totAbs;
    const avgUtil   = totSeated > 0 ? Math.round((totPres / totSeated) * 100) : 0;
    updateReportMetricsRibbon(totTrips, totPres, totAbs, totStand, totRiders, avgUtil);

    tbody.innerHTML = rows.map(r => `<tr>
      <td style="font-weight:var(--font-weight-medium);">${formatDateShort(r.date)}</td>
      <td style="text-align:center;">${r.buses_run}</td>
      <td style="text-align:center;">${r.staff_count}</td>
      <td style="text-align:center;color:var(--color-success-dark);font-weight:bold;">${r.present_students}</td>
      <td style="text-align:center;color:var(--color-error);">${r.absent_students}</td>
      <td style="text-align:center;color:var(--color-warning-dark);">${r.standing_students}</td>
      <td style="text-align:center;font-weight:bold;">${r.total_transit_riders}</td>
      <td style="text-align:center;">${r.attendance_rate}%</td>
    </tr>`).join('');
  }

  async function renderBusReport(filters) {
    const tbody = document.getElementById('report-buses-body');
    if (!tbody) return;
    tbody.innerHTML = makeLoadingRow(9, 'Loading bus report…');

    const res = await window.Api.getAdminBusReports(filters);
    const rows = res.reports || [];

    if (rows.length === 0) {
      tbody.innerHTML = makeEmptyRow(9, 'No bus records found.', '🚌');
      return;
    }

    let totTrips = 0, totPres = 0, totAbs = 0, totStand = 0, totCap = 0, totAssigned = 0;
    rows.forEach(r => {
      totTrips    += r.days_operated;
      totPres     += r.present_count;
      totAbs      += r.absent_count;
      totStand    += r.standing_count;
      totCap      += r.seating_capacity;
      totAssigned += r.assigned_students;
    });
    const fleetUtil = totCap > 0 ? Math.round((totAssigned / totCap) * 100) : 0;
    updateReportMetricsRibbon(totTrips, totPres, totAbs, totStand, totPres + totStand, fleetUtil);

    tbody.innerHTML = rows.map(r => {
      const uRate = r.capacity_utilization_rate;
      const uColor = uRate >= 90 ? 'var(--color-error)' : uRate >= 70 ? 'var(--color-warning)' : 'var(--color-success)';
      return `<tr>
        <td><span style="font-family:monospace;font-weight:var(--font-weight-bold);color:var(--color-primary-700);">${escapeHtml(r.bus_number)}</span></td>
        <td style="color:var(--color-text-muted);">${escapeHtml(r.route_name)}</td>
        <td style="text-align:center;">${r.seating_capacity}</td>
        <td style="text-align:center;font-weight:var(--font-weight-medium);">${r.assigned_students}</td>
        <td style="text-align:center;font-weight:bold;color:${uColor};">${r.capacity_utilization_rate}%</td>
        <td style="text-align:center;">${r.days_operated}</td>
        <td style="text-align:center;color:var(--color-success-dark);">${r.present_count}</td>
        <td style="text-align:center;color:var(--color-error);">${r.absent_count}</td>
        <td style="text-align:center;color:var(--color-warning-dark);">${r.standing_count}</td>
      </tr>`;
    }).join('');
  }

  async function renderStaffReport(filters) {
    const tbody = document.getElementById('report-staff-body');
    if (!tbody) return;
    tbody.innerHTML = makeLoadingRow(8, 'Loading staff report…');

    const res = await window.Api.getAdminStaffReports(filters);
    const rows = res.reports || [];

    if (rows.length === 0) {
      tbody.innerHTML = makeEmptyRow(8, 'No staff activity found.', '👤');
      return;
    }

    let totTrips = 0, totPres = 0, totAbs = 0, totStand = 0;
    rows.forEach(r => {
      totTrips += r.duties_conducted;
      totPres  += r.present_marked;
      totAbs   += r.absent_marked;
      totStand += r.standing_logged;
    });
    updateReportMetricsRibbon(totTrips, totPres, totAbs, totStand, totPres + totStand, 0);

    tbody.innerHTML = rows.map(r => `<tr>
      <td style="font-weight:var(--font-weight-medium);">${escapeHtml(r.full_name)}</td>
      <td style="color:var(--color-text-muted);font-size:var(--font-size-xs);">${escapeHtml(r.email)}</td>
      <td style="text-align:center;font-weight:bold;">${r.duties_conducted}</td>
      <td style="text-align:center;color:var(--color-success-dark);">${r.completed_duties}</td>
      <td style="text-align:center;color:var(--color-success-dark);">${r.present_marked}</td>
      <td style="text-align:center;color:var(--color-error);">${r.absent_marked}</td>
      <td style="text-align:center;color:var(--color-warning-dark);">${r.standing_logged}</td>
      <td style="color:var(--color-text-muted);">${r.last_duty_date ? formatDateShort(r.last_duty_date) : '—'}</td>
    </tr>`).join('');
  }

  async function renderAttendanceReport(filters) {
    const tbody = document.getElementById('report-attendance-body');
    if (!tbody) return;
    tbody.innerHTML = makeLoadingRow(8, 'Loading attendance log…');

    const res = await window.Api.getAdminAttendanceReports(filters);
    const rows = res.reports || [];

    if (rows.length === 0) {
      tbody.innerHTML = makeEmptyRow(8, 'No attendance records match filter criteria.', '📝');
      return;
    }

    let presCount = 0, absCount = 0;
    rows.forEach(r => { if (r.status === 'present') presCount++; else absCount++; });
    updateReportMetricsRibbon(0, presCount, absCount, 0, presCount, 0);

    tbody.innerHTML = rows.map(r => {
      const badge = r.status === 'present' ? 'badge-success' : 'badge-error';
      return `<tr>
        <td>${formatDateShort(r.attendance_date)}</td>
        <td style="font-weight:var(--font-weight-medium);">${escapeHtml(r.student_name)}</td>
        <td><span style="font-family:monospace;font-size:var(--font-size-xs);">${escapeHtml(r.student_roll)}</span></td>
        <td>${escapeHtml(r.bus_number || '—')}</td>
        <td style="text-align:center;">${r.seat_number ?? '—'}</td>
        <td><span class="badge ${badge}" style="font-size:10px;">${r.status}</span></td>
        <td style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${escapeHtml(r.marked_by_name || 'Staff')}</td>
        <td style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${formatDate(r.created_at)}</td>
      </tr>`;
    }).join('');
  }

  async function renderStandingReport(filters) {
    const tbody = document.getElementById('report-standing-body');
    if (!tbody) return;
    tbody.innerHTML = makeLoadingRow(8, 'Loading standing passengers…');

    const res = await window.Api.getAdminStandingReports(filters);
    const rows = res.reports || [];

    if (rows.length === 0) {
      tbody.innerHTML = makeEmptyRow(8, 'No standing passengers recorded for this filter.', '🚶');
      return;
    }

    updateReportMetricsRibbon(0, 0, 0, rows.length, rows.length, 0);

    tbody.innerHTML = rows.map(r => `<tr>
      <td>${formatDateShort(r.duty_date)}</td>
      <td style="font-weight:var(--font-weight-medium);">${escapeHtml(r.student_name)}</td>
      <td><span style="font-family:monospace;font-size:var(--font-size-xs);">${escapeHtml(r.roll_number)}</span></td>
      <td><span style="font-family:monospace;color:var(--color-primary-700);">${escapeHtml(r.bus_number)}</span></td>
      <td><span class="badge badge-warning" style="font-size:10px;">${escapeHtml(r.reason || 'General')}</span></td>
      <td style="color:var(--color-text-muted);">${escapeHtml(r.assigned_bus_number || 'None (Unassigned)')}</td>
      <td style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${escapeHtml(r.staff_name || 'Staff')}</td>
      <td style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${formatDate(r.created_at)}</td>
    </tr>`).join('');
  }

  // ==========================================================================
  // 12. ADVANCED SVG ANALYTICS (Phase 4 Real-time Visual Charts)
  // ==========================================================================
  let currentAnalyticsDays = 14;

  async function loadAnalytics(days = currentAnalyticsDays) {
    currentAnalyticsDays = days;

    // Toggle button style
    document.querySelectorAll('.analytics-days-btn').forEach(btn => {
      if (parseInt(btn.dataset.days, 10) === days) {
        btn.classList.remove('btn-outline');
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline');
      }
    });

    const sub1 = document.getElementById('chart1-subtitle');
    if (sub1) sub1.textContent = `Last ${days} Days`;

    try {
      const res = await window.Api.getAdminAdvancedAnalytics(days);
      const a = res.analytics || {};

      // Top metrics
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setVal('ana-metric-avg-daily',         a.overview?.avgDailyAttendance ?? 0);
      setVal('ana-metric-attendance-rate',   (a.overview?.overallAttendanceRate ?? 0) + '%');
      setVal('ana-metric-standing-rate',     (a.overview?.standingPassengerRate ?? 0) + '%');
      setVal('ana-metric-seat-utilization',  (a.overview?.fleetSeatingUtilization ?? 0) + '%');

      // Render 4 charts
      renderAttendanceTrendChart(a.dailyTrends || []);
      renderPresentDonutChart(a.attendanceBreakdown || {});
      renderStandingReasonsChart(a.standingReasons || []);
      renderBusUtilizationChart(a.busUtilization || []);

    } catch (err) {
      console.error('Analytics load failed:', err);
      const c = document.getElementById('chart-attendance-trend');
      if (c) c.innerHTML = `<div style="color:var(--color-error);text-align:center;padding:var(--spacing-8);">⚠️ ${escapeHtml(err.message)}</div>`;
    }
  }

  // Chart 1: SVG Trend Line / Area
  function renderAttendanceTrendChart(trends) {
    const container = document.getElementById('chart-attendance-trend');
    if (!container) return;

    if (!trends || trends.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:var(--spacing-8);color:var(--color-text-muted);">No attendance records in this period.</div>`;
      return;
    }

    const W = 540, H = 220;
    const padL = 40, padR = 20, padT = 20, padB = 35;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    let maxVal = Math.max(...trends.map(t => Math.max(t.present, t.standing)), 5);
    maxVal = Math.ceil(maxVal * 1.15); // headroom

    const n = trends.length;
    const getX = i => padL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
    const getY = v => padT + chartH - (v / maxVal) * chartH;

    // Grid lines
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
      const y = padT + chartH - ratio * chartH;
      const val = Math.round(ratio * maxVal);
      return `
        <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3"/>
        <text x="${padL - 6}" y="${y + 4}" font-size="10" fill="#94a3b8" text-anchor="end" font-family="monospace">${val}</text>
      `;
    }).join('');

    // Present Points & Path
    const presPoints = trends.map((t, i) => `${getX(i)},${getY(t.present)}`).join(' ');
    const areaPoints = `${padL},${padT + chartH} ` + presPoints + ` ${getX(n - 1)},${padT + chartH}`;

    // Standing Points & Path
    const standPoints = trends.map((t, i) => `${getX(i)},${getY(t.standing)}`).join(' ');

    // Date Labels on X
    const xLabels = trends.map((t, i) => {
      // Show every 2nd or 3rd label if many days
      if (n > 10 && i % 2 !== 0 && i !== n - 1) return '';
      const x = getX(i);
      const label = t.date ? t.date.slice(5) : ''; // MM-DD
      return `<text x="${x}" y="${H - 10}" font-size="10" fill="#64748b" text-anchor="middle">${label}</text>`;
    }).join('');

    // Interactive Dots with SVG Titles
    const presDots = trends.map((t, i) => `
      <circle cx="${getX(i)}" cy="${getY(t.present)}" r="4" fill="#2563eb" stroke="#fff" stroke-width="1.5">
        <title>${t.date}: ${t.present} Present Students</title>
      </circle>
    `).join('');

    const standDots = trends.map((t, i) => `
      <circle cx="${getX(i)}" cy="${getY(t.standing)}" r="3.5" fill="#f59e0b" stroke="#fff" stroke-width="1.5">
        <title>${t.date}: ${t.standing} Standing Riders</title>
      </circle>
    `).join('');

    container.innerHTML = `
      <svg class="svg-chart" viewBox="0 0 ${W} ${H}">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        ${gridLines}
        <polygon points="${areaPoints}" fill="url(#areaGrad)"/>
        <polyline points="${presPoints}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="${standPoints}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4,3" stroke-linecap="round"/>
        ${presDots}
        ${standDots}
        ${xLabels}
      </svg>
      <div class="flex items-center justify-center gap-4" style="font-size:var(--font-size-xs);margin-top:var(--spacing-2);">
        <span class="flex items-center gap-1"><span style="width:12px;height:3px;background:#2563eb;display:inline-block;"></span> Present Students</span>
        <span class="flex items-center gap-1"><span style="width:12px;height:3px;background:#f59e0b;display:inline-block;border-bottom:1px dashed #f59e0b;"></span> Standing Riders</span>
      </div>
    `;
  }

  // Chart 2: SVG Donut Chart for Present vs Absent
  function renderPresentDonutChart(bd) {
    const container = document.getElementById('chart-present-donut');
    if (!container) return;

    const present = bd.present || 0;
    const absent  = bd.absent  || 0;
    const total   = bd.total   || (present + absent);
    const pct     = bd.attendanceRate ?? (total > 0 ? Math.round((present / total) * 100) : 0);

    const W = 320, H = 200;
    const cx = 100, cy = 100, r = 65, strokeW = 20;
    const circ = 2 * Math.PI * r;
    const presentOffset = circ - (circ * (pct / 100));

    container.innerHTML = `
      <svg class="svg-chart" viewBox="0 0 ${W} ${H}">
        <!-- Base / Absent Track -->
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fee2e2" stroke-width="${strokeW}"/>
        <!-- Present Arc -->
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#10b981" stroke-width="${strokeW}"
                stroke-dasharray="${circ}" stroke-dashoffset="${presentOffset}"
                stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
        <!-- Center Text -->
        <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="24" font-weight="900" fill="#0f172a">${pct}%</text>
        <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="11" fill="#64748b">Present</text>

        <!-- Legend Column -->
        <g transform="translate(190, 50)">
          <!-- Present -->
          <circle cx="6" cy="6" r="6" fill="#10b981"/>
          <text x="18" y="10" font-size="12" font-weight="bold" fill="#0f172a">${present}</text>
          <text x="18" y="24" font-size="11" fill="#64748b">Present (${pct}%)</text>

          <!-- Absent -->
          <circle cx="6" cy="56" r="6" fill="#ef4444"/>
          <text x="18" y="60" font-size="12" font-weight="bold" fill="#0f172a">${absent}</text>
          <text x="18" y="74" font-size="11" fill="#64748b">Absent (${100 - pct}%)</text>

          <!-- Total -->
          <line x1="0" y1="92" x2="110" y2="92" stroke="#e2e8f0"/>
          <text x="0" y="108" font-size="11" fill="#64748b">Total Headcount: <strong style="color:#0f172a">${total}</strong></text>
        </g>
      </svg>
    `;
  }

  // Chart 3: Standing Student Reasons Horizontal Bar
  function renderStandingReasonsChart(reasons) {
    const container = document.getElementById('chart-standing-reasons');
    if (!container) return;

    if (!reasons || reasons.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:var(--spacing-8);color:var(--color-text-muted);">No standing students recorded in this period.</div>`;
      return;
    }

    const totalStanding = reasons.reduce((sum, r) => sum + (r.count || 0), 0);

    const colors = {
      'Overcrowding': '#ef4444',
      'Late Bus': '#f59e0b',
      'Missed Regular Bus': '#0284c7',
      'Temporary Pass': '#8b5cf6',
      'Emergency': '#ec4899',
      'Other': '#64748b'
    };

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--spacing-3);padding-top:var(--spacing-2);">
        ${reasons.map(item => {
          const count = item.count || 0;
          const pct   = totalStanding > 0 ? Math.round((count / totalStanding) * 100) : 0;
          const col   = colors[item.reason] || '#0284c7';
          return `
            <div>
              <div class="flex items-center justify-between" style="font-size:var(--font-size-xs);margin-bottom:3px;">
                <span style="font-weight:var(--font-weight-medium);color:var(--color-neutral-800);">${escapeHtml(item.reason)}</span>
                <span style="color:var(--color-text-muted);font-family:monospace;">${count} riders (${pct}%)</span>
              </div>
              <div class="progress-bar-track" style="height:10px;">
                <div class="progress-bar-fill" style="width:${pct}%;background:${col};"></div>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  }

  // Chart 4: Bus Seating Capacity Utilization Bars
  function renderBusUtilizationChart(buses) {
    const container = document.getElementById('chart-bus-utilization');
    if (!container) return;

    if (!buses || buses.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:var(--spacing-8);color:var(--color-text-muted);">No buses configured in fleet.</div>`;
      return;
    }

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--spacing-3);padding-top:var(--spacing-2);">
        ${buses.map(bus => {
          const rate     = bus.capacity_utilization_rate ?? 0;
          const barColor = rate >= 100 ? 'var(--color-error)' : rate >= 85 ? 'var(--color-warning)' : 'var(--color-success)';
          const badgeCol = rate >= 100 ? 'badge-error' : rate >= 85 ? 'badge-warning' : 'badge-success';

          return `
            <div style="padding-bottom:var(--spacing-2);border-bottom:1px solid var(--color-neutral-100);">
              <div class="flex items-center justify-between" style="font-size:var(--font-size-xs);margin-bottom:4px;">
                <div>
                  <strong style="font-family:monospace;color:var(--color-primary-700);">${escapeHtml(bus.bus_number)}</strong>
                  <span style="color:var(--color-text-muted);margin-left:6px;">${escapeHtml(bus.route_name)}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span style="font-size:10px;color:var(--color-text-muted);">${bus.assigned_students} / ${bus.seating_capacity} seats</span>
                  <span class="badge ${badgeCol}" style="font-size:10px;padding:2px 6px;">${rate}%</span>
                </div>
              </div>
              <div class="progress-bar-track" style="height:8px;">
                <div class="progress-bar-fill" style="width:${Math.min(rate, 100)}%;background:${barColor};"></div>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  }

  // Days selector buttons
  document.querySelectorAll('.analytics-days-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.days, 10);
      loadAnalytics(days);
    });
  });

  document.getElementById('refresh-analytics-btn')?.addEventListener('click', () => loadAnalytics());

  // ==========================================================================
  // 13. AUDIT TRAIL (Phase 4 Administrative Activity Logging)
  // ==========================================================================
  async function loadAuditLogs() {
    const tbody = document.getElementById('audit-table-body');
    if (!tbody) return;
    tbody.innerHTML = makeLoadingRow(5, 'Loading administrative audit trail…');

    const action     = document.getElementById('audit-action-filter')?.value || '';
    const entityType = document.getElementById('audit-entity-filter')?.value || '';

    try {
      const res = await window.Api.getAdminAuditLogs({ action, entityType, limit: 100 });
      const logs = res.auditLogs || [];

      if (logs.length === 0) {
        tbody.innerHTML = makeEmptyRow(5, 'No audit logs recorded for this criteria.', '🛡️');
        return;
      }

      tbody.innerHTML = logs.map(l => {
        const badge = l.action.includes('REJECT') || l.action.includes('DELETE') ? 'badge-error'
                    : l.action.includes('APPROVE') || l.action.includes('CREATED') ? 'badge-success'
                    : 'badge-primary';

        const detailFormatted = l.details
          ? `<pre style="margin:0;font-size:10px;background:var(--color-neutral-50);padding:4px 8px;border-radius:4px;overflow-x:auto;">${escapeHtml(JSON.stringify(l.details, null, 2))}</pre>`
          : '<span style="color:var(--color-text-muted);">None</span>';

        return `<tr>
          <td style="white-space:nowrap;font-size:var(--font-size-xs);color:var(--color-text-muted);">${formatDate(l.created_at)}</td>
          <td><span class="badge ${badge}" style="font-size:10px;">${escapeHtml(l.action)}</span></td>
          <td style="font-weight:var(--font-weight-medium);">${escapeHtml(l.entity_type || '—')}</td>
          <td style="font-size:var(--font-size-xs);">${escapeHtml(l.performer_email || (l.performed_by ? l.performed_by.slice(0,8)+'…' : 'System'))}</td>
          <td>${detailFormatted}</td>
        </tr>`;
      }).join('');

    } catch (err) {
      console.error('Audit log load failed:', err);
      tbody.innerHTML = makeErrorRow(5, 'Failed to load audit logs: ' + err.message);
    }
  }

  document.getElementById('audit-action-filter')?.addEventListener('change', loadAuditLogs);
  document.getElementById('audit-entity-filter')?.addEventListener('change', loadAuditLogs);
  document.getElementById('refresh-audit-btn')?.addEventListener('click', loadAuditLogs);

  // ==========================================================================
  // 14. SHARED STATS REFRESH (called after any mutation)
  // ==========================================================================
  function refreshStats() {
    if (loadedTabs['overview']) {
      loadDashboardStats();
      loadRecentActivity();
      loadRecentAuditPreview();
    }
    // Invalidate analytics, monitoring and reports caches so they reload fresh
    delete loadedTabs['analytics'];
    delete loadedTabs['monitoring'];
    delete loadedTabs['reports'];
    delete loadedTabs['audit'];
  }

  // ==========================================================================
  // BOOT — load Overview tab and pre-fetch bus dropdown data
  // ==========================================================================
  switchTab('overview');
  loadBusesForDropdowns(); // pre-warm dropdown cache in background

});
