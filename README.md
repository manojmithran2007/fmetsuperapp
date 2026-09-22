# College Bus Management System — Production Platform

The **College Bus Management System** is a full-featured institutional transit platform designed for collegiate campuses to manage fleet buses, students, seat assignments, staff approvals, daily transit operations, attendance registers, standing passengers, operational audits, and administrative analytics.

---

## 1. System Features

* **Role-Based Authentication & Guarding**: Secure access control for Institutional Administrators and Approved Staff Incharge with JWT token validation and route guards.
* **Fleet Management**: Bus vehicle inventory, fixed seating capacities, starting points, destinations, and operational statuses.
* **Student Directory & Seat Allocation**: Unique roll number indexing, bus route mapping, and individual seat allocations with over-capacity prevention.
* **Staff Approval Workflow**: Administrative approval and rejection workflow for staff onboarding.
* **Daily Bus Claiming**: Date-based bus claiming ensuring only one staff member operates a given bus per day, with automatic daily availability refresh.
* **Daily Attendance Registers**: Live student attendance marking (Present / Absent) with real-time capacity and headcount tracking.
* **Standing Passengers Log**: Live tracking of overflow or route-change riders without distorting fixed seating capacity metrics.
* **Live Fleet Operations Cockpit**: Real-time administrator monitoring of active transit duties, driver allocations, and campus-wide headcounts.
* **Reporting Center & CSV Export**: Multi-subtab reporting (Daily Summary, Bus Utilization, Staff Performance, Student Attendance, Standing Log) with RFC 4180 compliant CSV export.
* **Responsive Visual Analytics**: Native real-time SVG visual charts (Attendance trends, capacity ratios, and standing passenger breakdown).
* **Administrative Audit Trail**: Tamper-evident logging of administrative actions including staff approvals, bus modifications, and student reallocations.

---

## 2. Technology Stack

* **Frontend**: HTML5, Vanilla CSS3 (Custom Design System tokens, responsive layouts), Vanilla JavaScript (Modular ES6 architecture, zero external framework overhead).
* **Backend**: Node.js & Express.js (Modular controllers, routes, error shielding, and authentication middleware).
* **Database**: PostgreSQL on Supabase with Row Level Security (RLS) policies, composite performance indexes, and database triggers.
* **Authentication**: Supabase Auth (Email + Password).
* **Analytics**: Lightweight responsive SVG/HTML visual charts.
* **Export**: Streaming CSV format generation with standard field escaping.

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        COLLEGE BUS MANAGEMENT SYSTEM                         │
└───────┬──────────────────────┬───────────────────────┬───────────────────────┘
        │                      │                       │
 ┌──────▼──────┐        ┌──────▼──────┐         ┌──────▼──────┐
 │     AUTH    │        │  ADMIN HUB  │         │  STAFF HUB  │
 │ RLS, JWT,   │───────►│ Fleet CRUD, │────────►│ Daily Bus   │
 │ Profiles,   │        │ Students,   │         │ Claiming &  │
 │ Approvals   │        │ Analytics   │         │ Attendance  │
 └─────────────┘        └─────────────┘         └─────────────┘
```

---

## 4. Database Setup

All database migration scripts are located in the `database/` directory:

1. [`database/phase1.sql`](database/phase1.sql) — Auth profiles (`admin_profiles`, `staff_profiles`), triggers, and base RLS.
2. [`database/phase2.sql`](database/phase2.sql) — `buses` and `students` tables, foreign keys, and RLS policies.
3. [`database/phase3.sql`](database/phase3.sql) — `daily_bus_assignments`, `daily_attendance`, and `daily_standing_log` tables with composite uniqueness constraints.
4. [`database/phase4.sql`](database/phase4.sql) — `audit_logs` table, composite reporting indexes, and PostgREST schema reloads.

Execute these scripts in sequential order within the **Supabase SQL Editor**.

---

## 5. Setup & Installation

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher
* A **Supabase** project

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
Create or verify `.env`:
```env
PORT=5000

# Public credentials (used by backend and client)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-public-anon-key

# Server-only secret key (NEVER expose to frontend or git)
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Update `client/js/config.js` with your public credentials:
```javascript
window.APP_CONFIG = {
  SUPABASE_URL: 'https://your-project-id.supabase.co',
  SUPABASE_ANON_KEY: 'your-supabase-public-anon-key',
  API_BASE_URL: '/api'
};
```

### Step 3: Run Database Scripts
In the Supabase SQL Editor, run the SQL scripts in the `database/` folder in sequential order.

### Step 4: Create the Administrator Account
1. In Supabase Dashboard, go to **Authentication** -> **Users** -> **Add user**.
2. Create user with email (e.g. `admin@college.edu`) and password.
3. Copy the user UID.
4. Execute in the Supabase SQL Editor:
```sql
INSERT INTO public.admin_profiles (id, full_name, email, role, is_active)
VALUES ('YOUR_USER_UID_HERE', 'College Transit Administrator', 'admin@college.edu', 'admin', true);
```

### Step 5: Start the Application
```bash
npm start
```

Access the application in your browser:
* **Landing Page**: `http://localhost:5000/index.html`
* **Sign In**: `http://localhost:5000/login.html`
* **Staff Registration**: `http://localhost:5000/register.html`
* **Admin Dashboard**: `http://localhost:5000/admin-dashboard.html`
* **Staff Dashboard**: `http://localhost:5000/staff-dashboard.html`

---

## 6. API Reference Summary

### Authentication & Health
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | Service health status | No |
| `POST` | `/api/auth/register` | Staff registration | No |
| `GET` | `/api/auth/me` | Current authenticated user profile | Bearer Token |

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

## 7. Production Security & Architecture Standards

* **Credential Isolation**: The backend service role key is never exposed to client-side scripts.
* **Row Level Security (RLS)**: PostgreSQL tables are protected with strict RLS policies.
* **Error Sanitization**: Database exceptions and internal stack traces are shielded from client responses.
* **Tamper-Evident Audit Logging**: Administrative interventions are recorded with caller metadata in `audit_logs`.
* **Token Verification**: Both client route guards and backend middleware enforce JWT signature and role status on protected actions.
