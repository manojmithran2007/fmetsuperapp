/**
 * COLLEGE BUS MANAGEMENT PLATFORM - API CLIENT
 * HTTP wrapper communicating with Express backend and managing JWT headers
 */

const Api = {
  /**
   * Helper to perform authenticated fetch requests to Express backend
   */
  async request(endpoint, options = {}) {
    const url = `${window.APP_CONFIG.API_BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    // Attach Bearer token if user is logged in via Supabase Auth
    if (window.Auth && window.Auth.getAccessToken()) {
      headers['Authorization'] = `Bearer ${window.Auth.getAccessToken()}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const contentType = response.headers.get('content-type');
      let data = null;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { message: text };
      }

      if (!response.ok) {
        const error = new Error(data?.error || `Request failed with status ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err);
      throw err;
    }
  },

  // Health check endpoint
  async getHealth() {
    return this.request('/health', { method: 'GET' });
  },

  // Staff registration endpoint
  async registerStaff(payload) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Authenticated user profile verification endpoint
  async getMe() {
    return this.request('/auth/me', { method: 'GET' });
  },

  // Admin access test endpoint
  async checkAdminAccess() {
    return this.request('/auth/admin-check', { method: 'GET' });
  },

  // Staff access test endpoint
  async checkStaffAccess() {
    return this.request('/auth/staff-check', { method: 'GET' });
  },

  // -------------------------------------------------------------------------
  // Admin Staff Management (Phase 1)
  // -------------------------------------------------------------------------
  async getStaffList(status = 'all') {
    return this.request(`/admin/staff?status=${encodeURIComponent(status)}`, { method: 'GET' });
  },

  async approveStaff(staffId) {
    return this.request(`/admin/staff/${encodeURIComponent(staffId)}/approve`, { method: 'POST' });
  },

  async rejectStaff(staffId) {
    return this.request(`/admin/staff/${encodeURIComponent(staffId)}/reject`, { method: 'POST' });
  },

  // -------------------------------------------------------------------------
  // Dashboard & Analytics (Phase 2)
  // -------------------------------------------------------------------------
  async getDashboardStats() {
    return this.request('/admin/dashboard/stats', { method: 'GET' });
  },

  async getRecentActivity() {
    return this.request('/admin/dashboard/recent', { method: 'GET' });
  },

  async getAnalytics() {
    return this.request('/admin/analytics', { method: 'GET' });
  },

  // -------------------------------------------------------------------------
  // Bus Management (Phase 2)
  // -------------------------------------------------------------------------
  async getBuses(search = '') {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.request(`/admin/buses${qs}`, { method: 'GET' });
  },

  async getBusDetails(busId) {
    return this.request(`/admin/buses/${encodeURIComponent(busId)}`, { method: 'GET' });
  },

  async createBus(payload) {
    return this.request('/admin/buses', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updateBus(busId, payload) {
    return this.request(`/admin/buses/${encodeURIComponent(busId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  async deleteBus(busId) {
    return this.request(`/admin/buses/${encodeURIComponent(busId)}`, { method: 'DELETE' });
  },

  // -------------------------------------------------------------------------
  // Student Management (Phase 2)
  // -------------------------------------------------------------------------
  async getStudents({ search = '', busId = '' } = {}) {
    const params = new URLSearchParams();
    if (search)  params.set('search', search);
    if (busId)   params.set('busId', busId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/admin/students${qs}`, { method: 'GET' });
  },

  async createStudent(payload) {
    return this.request('/admin/students', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updateStudent(studentId, payload) {
    return this.request(`/admin/students/${encodeURIComponent(studentId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  async deleteStudent(studentId) {
    return this.request(`/admin/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
  },

  async assignStudent(studentId, payload) {
    return this.request(`/admin/students/${encodeURIComponent(studentId)}/assign`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async moveStudent(studentId, payload) {
    return this.request(`/admin/students/${encodeURIComponent(studentId)}/move`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async unassignStudent(studentId) {
    return this.request(`/admin/students/${encodeURIComponent(studentId)}/unassign`, { method: 'POST' });
  },

  // =========================================================================
  // Phase 3: Staff Daily Bus Operations
  // =========================================================================
  async getStaffAvailableBuses(date = '') {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request(`/staff/buses/available${qs}`, { method: 'GET' });
  },

  async staffClaimBus(busId) {
    return this.request('/staff/buses/claim', {
      method: 'POST',
      body: JSON.stringify({ busId })
    });
  },

  async getStaffActiveDuty(date = '') {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request(`/staff/buses/active${qs}`, { method: 'GET' });
  },

  async completeStaffDuty(assignmentId = '') {
    return this.request('/staff/buses/complete-duty', {
      method: 'POST',
      body: JSON.stringify({ assignmentId })
    });
  },

  async getStaffBusStudents(busId) {
    return this.request(`/staff/buses/students?busId=${encodeURIComponent(busId)}`, { method: 'GET' });
  },

  async staffCreateStudent(payload) {
    return this.request('/staff/students', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getStaffTodayAttendance(busId, date = '') {
    const qs = date ? `&date=${encodeURIComponent(date)}` : '';
    return this.request(`/staff/attendance/today?busId=${encodeURIComponent(busId)}${qs}`, { method: 'GET' });
  },

  async saveStaffAttendance(payload) {
    return this.request('/staff/attendance', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getStaffTodayStanding(busId, date = '') {
    const qs = date ? `&date=${encodeURIComponent(date)}` : '';
    return this.request(`/staff/standing/today?busId=${encodeURIComponent(busId)}${qs}`, { method: 'GET' });
  },

  async addStaffStandingStudent(payload) {
    return this.request('/staff/standing', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async removeStaffStandingStudent(id) {
    return this.request(`/staff/standing/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async searchStudentsForStanding(q) {
    return this.request(`/staff/standing/search-students?q=${encodeURIComponent(q)}`, { method: 'GET' });
  },

  async getStaffTodayReport(busId, date = '') {
    const qs = date ? `&date=${encodeURIComponent(date)}` : '';
    return this.request(`/staff/report/today?busId=${encodeURIComponent(busId)}${qs}`, { method: 'GET' });
  },

  async getStaffHistory() {
    return this.request('/staff/history', { method: 'GET' });
  },

  async getStaffHistoryDetail(assignmentId) {
    return this.request(`/staff/history/${encodeURIComponent(assignmentId)}`, { method: 'GET' });
  },

  // =========================================================================
  // Phase 4: Monitoring, Reports, Analytics & Audit Trail
  // =========================================================================
  async getAdminTodayMonitoring() {
    return this.request('/admin/monitoring/today', { method: 'GET' });
  },

  async getAdminDailyReports(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/admin/reports/daily${qs}`, { method: 'GET' });
  },

  async getAdminBusReports(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/admin/reports/buses${qs}`, { method: 'GET' });
  },

  async getAdminStaffReports(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/admin/reports/staff${qs}`, { method: 'GET' });
  },

  async getAdminAttendanceReports(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/admin/reports/attendance${qs}`, { method: 'GET' });
  },

  async getAdminStandingReports(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/admin/reports/standing${qs}`, { method: 'GET' });
  },

  async getAdminAdvancedAnalytics(days = 14) {
    return this.request(`/admin/analytics/advanced?days=${encodeURIComponent(days)}`, { method: 'GET' });
  },

  async getAdminAuditLogs(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/admin/audit-logs${qs}`, { method: 'GET' });
  },

  async downloadAdminReportCSV(type, filters = {}, filename = 'bus-report.csv') {
    const params = new URLSearchParams({ type });
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });

    const url = `${window.APP_CONFIG.API_BASE_URL}/admin/reports/export?${params.toString()}`;
    const headers = {};
    if (window.Auth && window.Auth.getAccessToken()) {
      headers['Authorization'] = `Bearer ${window.Auth.getAccessToken()}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(err.error || 'Failed to export CSV');
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }
};

window.Api = Api;

