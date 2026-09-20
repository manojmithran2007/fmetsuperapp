# College Bus Management Platform — Production System (Phases 1 - 4)

Welcome to the **College Bus Management Platform**. This system is an institutional transit platform designed for collegiate campuses to manage fleet buses, students, seat assignments, staff approvals, daily transit operations, attendance registers, standing riders, operational audits, and administrative reporting.

The platform has been engineered across **4 development phases**:
- **Phase 1**: Authentication, Profiles, Row Level Security (RLS), Role Authorization & Design System.
- **Phase 2**: Fleet Management (Bus CRUD), Student Directory, Seat Allocation & Admin Staff Approvals.
- **Phase 3**: Staff Daily Operations, Bus Claiming, Attendance Registers, Standing Riders & Duty Completion.
- **Phase 4 (Final)**: Live Fleet Operations Cockpit, Advanced SVG Visual Analytics, Multi-Subtab Operational Reports & CSV Export, and Administrative Audit Trail.

---

## 1. Technology Stack

* **Frontend**: HTML5, Vanilla CSS3 (Design System tokens, responsive layout), Vanilla JavaScript (Modular ES6 architecture, no heavy frameworks).
* **Backend**: Node.js & Express.js (Modular controllers, routes, error shielding & auth middleware).
* **Database**: PostgreSQL on Supabase with Row Level Security (RLS) policies, composite performance indexes, and triggers.
* **Authentication**: Supabase Auth (Email + Password).
* **Analytics**: Real-time native SVG/HTML visual charts (zero external charting bloat, instant rendering, 100% responsive).
* **Export**: Streaming CSV format generation with RFC 4180 field escaping.

---

## 2. Platform Architecture & Phases

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        COLLEGE BUS MANAGEMENT PLATFORM                       │
└───────┬──────────────────────┬───────────────────────┬───────────────────────┘
        │                      │                       │
 ┌──────▼──────┐        ┌──────▼──────┐         ┌──────▼──────┐
 │   PHASE 1   │        │   PHASE 2   │         │   PHASE 3   │
 │ Auth, RLS,  │───────►│ Buses,      │────────►│ Staff Daily │
 │ Profiles,   │        │ Students,   │         │ Operations, │
 │ Tokens      │        │ Approvals   │         │ Attendance  │
 └─────────────┘        └─────────────┘         └──────┬──────┘
                                                       │
                                                ┌──────▼──────┐
                                                │   PHASE 4   │
                                                │ Cockpit,    │
                                                │ Analytics,  │
                                                │ Reports/CSV,│
                                                │ Audit Trail │
                                                └─────────────┘
```

### Phase 1: Security & Identity Foundation
* Two profile models: `admin_profiles` and `staff_profiles`.
* Supabase Row Level Security (RLS) on all tables with privilege escalation prevention triggers.
* Backend authentication and authorization middleware (`requireAuth`, `requireAdmin`, `requireApprovedStaff`).
* Comprehensive Design System tokens (`client/css/variables.css`, `base.css`, `layout.css`, `components.css`, `pages.css`).
* Design System Showcase (`client/design-system.html`).

### Phase 2: Fleet & Student Management
* Bus Fleet CRUD (`buses` table) with seating capacity enforcement and real-time seat availability calculations.
* Student Directory (`students` table) with roll number uniqueness, bus assignment, and individual seat assignment.
* Administrative Staff Approval Center (Pending, Approved, Rejected) with instant status toggle.
* Real-time dashboard overview with fleet statistics.

### Phase 3: Staff Daily Bus Operations
* Daily bus claiming workflow (`daily_bus_assignments` table) ensuring only 1 staff member operates a bus per day.
* Live student attendance register (`daily_attendance` table) with Present / Absent marking.
* Standing passenger logging (`standing_students` table) for overcrowded buses or emergency transport.
* Real-time daily transit summary calculations and safe duty completion.
* Complete staff duty history log with detailed breakdown modals.

### Phase 4: Production Analytics, Reporting & Audit Trail
* **Today's Duty Fleet Cockpit**: Real-time monitoring of all buses, staff assignments, transit statuses (`In-Transit Duty`, `Completed Run`, `Unassigned`), and live headcount.
* **Operational Reporting Center**:
  - Date presets (`Today`, `Yesterday`, `Last 7 Days`, `This Month`) & custom date ranges.
  - Bus & Staff asset filters.
  - Dynamic summary metric ribbons.
  - 5 Report Views: Daily Summary, Bus-wise Utilization, Staff-wise Performance, Student Attendance Logs, and Standing Passenger Logs.
  - RFC 4180 compliant CSV Export for all report views.
* **Advanced Visual Analytics**:
  - Multi-line attendance trends (Present vs Standing over time).
  - Present vs Absent donut / ratio chart.
  - Standing student reason breakdown horizontal bar chart.
  - Seating capacity utilization rates (`(Assigned / Capacity) * 100`) with color-coded safety indicators.
* **Tamper-Evident Administrative Audit Trail** (`audit_logs` table):
  - Records staff approvals/rejections, bus creates/updates/deletions, and student movements.
  - Indexed for fast retrieval by action type, entity, and timestamp.

---

## 3. Database Migration Sequence

All database migrations are located in the `database/` directory. Run them sequentially in the **Supabase SQL Editor**:

1. [`database/phase1.sql`](database/phase1.sql) — Auth profiles, functions, triggers, and base RLS.
2. [`database/phase2.sql`](database/phase2.sql) — `buses` and `students` tables, foreign keys, and RLS policies.
3. [`database/phase3.sql`](database/phase3.sql) — `daily_bus_assignments`, `daily_attendance`, and `standing_students` tables with composite uniqueness constraints.
4. [`database/phase4.sql`](database/phase4.sql) — `audit_logs` table, composite reporting indexes, and PostgREST schema reloads.

---

## 4. Setup & Installation

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher
* A **Supabase** project (free or pro tier)

### Step 1: Clone & Install Dependencies
```bash
npm install
```
*(On Windows PowerShell, use `npm.cmd install` if execution policies restrict npm scripts)*

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```env
PORT=5000

# Public credentials (used by backend and client)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-public-anon-key

# Server-only secret key (NEVER expose to frontend or git!)
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Also update `client/js/config.js` with your public credentials:
```javascript
window.APP_CONFIG = {
  SUPABASE_URL: 'https://your-project-id.supabase.co',
  SUPABASE_ANON_KEY: 'your-supabase-public-anon-key',
  API_BASE_URL: '/api'
};
```

### Step 3: Run Database Migrations
In the Supabase SQL Editor, execute `phase1.sql`, `phase2.sql`, `phase3.sql`, and `phase4.sql` in order.

### Step 4: Create the Administrator Account
1. In Supabase Dashboard, go to **Authentication** -> **Users** -> **Add user**.
2. Create user with email (e.g. `admin@college.edu`) and a strong password.
3. Copy the User's UID.
4. Run in Supabase SQL Editor:
```sql
INSERT INTO public.admin_profiles (id, full_name, email, role, is_active)
VALUES ('PASTE_UID_HERE', 'College Transit Administrator', 'admin@college.edu', 'admin', true);
```

### Step 5: Start the Server
```bash
npm start
```
*(Or `npm run dev` for auto-restart on code changes)*

Access the platform at:
* **Landing Page**: `http://localhost:5000/index.html`
* **Sign In**: `http://localhost:5000/login.html`
* **Staff Register**: `http://localhost:5000/register.html`
* **Admin Dashboard**: `http://localhost:5000/admin-dashboard.html`
* **Staff Dashboard**: `http://localhost:5000/staff-dashboard.html`
* **Design System**: `http://localhost:5000/design-system.html`

---

## 5. API Reference Summary

### Authentication & Health
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | Service health status | No |
| `POST` | `/api/auth/register` | Staff registration | No |
| `GET` | `/api/auth/me` | Current user profile | Bearer Token |
| `GET` | `/api/auth/admin-check` | Verify Admin role | Admin |
| `GET` | `/api/auth/staff-check` | Verify Approved Staff role | Approved Staff |

### Admin Operations (Admin Only)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/dashboard/stats` | Fleet summary numbers |
| `GET` | `/api/admin/monitoring/today` | Live fleet cockpit & daily headcount |
| `GET` | `/api/admin/reports/daily` | Multi-day duty and attendance summaries |
| `GET` | `/api/admin/reports/buses` | Bus-wise utilization and operations |
| `GET` | `/api/admin/reports/staff` | Staff-wise duty logs |
| `GET` | `/api/admin/reports/attendance` | Detailed student attendance records |
| `GET` | `/api/admin/reports/standing` | Standing passenger registers |
| `GET` | `/api/admin/reports/export` | Download CSV for any report view |
| `GET` | `/api/admin/analytics/advanced` | Real-time analytics dataset |
| `GET` | `/api/admin/audit-logs` | Administrative audit trail |
| `GET/POST/PUT/DELETE` | `/api/admin/buses` | Bus fleet management |
| `GET/POST/PUT/DELETE` | `/api/admin/students` | Student directory and assignments |
| `GET/POST` | `/api/admin/staff` | Staff directory and approval decisions |

### Staff Operations (Approved Staff Only)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/staff/buses/available` | Buses available to claim for duty |
| `POST` | `/api/staff/buses/claim` | Claim daily duty on a bus |
| `GET` | `/api/staff/buses/active` | Current active duty details |
| `POST` | `/api/staff/buses/complete-duty` | Safely finalize duty run |
| `GET/POST` | `/api/staff/attendance` | Take or update student attendance |
| `GET/POST/DELETE` | `/api/staff/standing` | Log or remove standing passengers |
| `GET` | `/api/staff/report/today` | Current day duty summary report |
| `GET` | `/api/staff/history` | Historical duty runs performed |

---

## 6. Production Security Checklist

- [x] **No Secret Leakage**: Service role key is strictly backend-only and never bundled into client scripts.
- [x] **Strict RLS**: All Supabase tables have Row Level Security enabled.
- [x] **Error Shielding**: Database errors are sanitized; stack traces and raw SQL are suppressed in client responses.
- [x] **Tamper-Evident Audit Trail**: Critical admin operations (staff approval, bus deletion, student moves) are recorded in `audit_logs`.
- [x] **Role Isolation**: Frontend route guards and Express backend middleware verify JWT tokens on every protected request.
- [x] **No External Bloat**: Analytics are powered by lightweight native SVG markup.
