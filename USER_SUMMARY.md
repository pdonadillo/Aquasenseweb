# User Role Summary - AquaSense Web

## Overview
The **User** role is designed for regular aquaculture farm operators who need to monitor their ponds, manage feeding schedules, and track their farm's performance through reports and analytics.

## Access & Permissions
- **Dashboard Access**: `user-dashboard.html` only
- **Role Level**: Basic user (lowest privilege level)
- **Default Role**: All new registrations start as "user"
- **Restrictions**: Cannot access admin or superadmin dashboards

## Dashboard Sections

### 1. Dashboard (Home)
**Purpose**: Overview of key metrics and quick access to important information

**Features**:
- **Key Metrics Display**
  - Water Temperature (real-time with status: Optimal/Normal/Warning)
  - pH Level (real-time with status: Optimal/Normal/Warning)
  - Visual status indicators with color coding

- **Analytics & Schedule**
  - Water Quality Trends (chart placeholder)
  - Feeding Schedule Overview
    - Upcoming feeding times
    - Schedule status (Pending/In Progress/Completed)
    - Feed amounts and notes

- **Recent Activity**
  - Latest system events and updates
  - Activity timeline

### 2. Monitoring
**Purpose**: Real-time water quality monitoring and alerts

**Features**:
- **Real-time Sensor Readings**
  - Temperature sensor (updates via Firestore listeners)
  - pH Level sensor (updates via Firestore listeners)
  - Automatic status calculation based on optimal ranges

- **Alerts & Notifications**
  - Next feeding schedule alert
  - System notifications
  - Water quality warnings

**Technical Details**:
- Real-time updates using Firestore `onSnapshot` listeners
- Automatic refresh every 30 seconds (fallback)
- Status indicators update based on sensor thresholds

### 3. Feeding
**Purpose**: Manage automated feeding operations

**Features**:
- **Feeding Schedule List**
  - View all scheduled feedings
  - See feed amounts and notes
  - Check schedule status
  - Auto-refresh on section open and page focus
  - Periodic status updates (every 60 seconds)

- **Schedule Information Displayed**:
  - Scheduled time and date
  - Feed amount (kg)
  - Notes/instructions
  - Current status (Pending/In Progress/Completed)

**Auto-Refresh Features**:
- Refreshes when Feeding section is opened
- Updates on page focus (if 2+ minutes since last refresh)
- Periodic status recalculation every 60 seconds

### 4. Reports & Analytics
**Purpose**: View detailed summaries and historical data

**Features**:
- **Month Filter**
  - Select specific month to filter all reports
  - Default: Current month
  - Applies to Daily, Weekly, and Monthly summaries

- **Daily Summary Report**
  - Date, Feed Used (kg), Mortality (fish)
  - Average Temperature (°C), Average pH
  - Water Quality rating
  - Last 31 days (or filtered month)
  - Export options: Excel/CSV, Word (.doc), PDF

- **Weekly Summary Report**
  - Period range, Total Feed (kg), Mortality (fish)
  - Average pH, Average Temperature (°C)
  - Water Quality Score
  - Weeks overlapping selected month
  - Export options: Excel/CSV, Word (.doc), PDF

- **Monthly Summary Report**
  - Month name, Total Feed (kg), Total Mortality (fish)
  - Average pH, Average Temperature (°C)
  - Water Quality Score
  - Single month when filter is active
  - Export options: Excel/CSV, Word (.doc), PDF

- **Mortality Log Report**
  - Date, Time, Mortality Count
  - Cause, Notes
  - Last 50 entries
  - Export options: Excel/CSV, Word (.doc), PDF

**Export Capabilities**:
- **CSV/Excel**: UTF-8 encoded with BOM for Excel compatibility
- **Word**: Proper .doc format with Microsoft Word compatibility
- **PDF**: Real PDF files with AquaSense logo header (jsPDF or print fallback)
- All exports respect month filter selection
- Exports use in-memory data (matches table display exactly)

## Data Sources
All data is loaded from Firestore collections:
- `users/{uid}/sensors/` - Sensor readings (temperature, pH)
- `users/{uid}/feedingSchedules/` - Feeding schedules
- `users/{uid}/dailyReports/` - Daily summary reports
- `users/{uid}/weeklyReports/` - Weekly summary reports
- `users/{uid}/monthlyReports/` - Monthly summary reports
- `users/{uid}/mortalityLogs/` - Mortality log entries

## Real-time Features
- **Sensor Updates**: Automatic real-time updates via Firestore listeners
- **Schedule Status**: Auto-updates based on current time
- **Next Feeding Alert**: Computed from upcoming schedules
- **Page Focus Refresh**: Automatic refresh when page regains focus

## User Interface
- **Sidebar Navigation**: Fixed left sidebar with sections
- **Responsive Design**: Works on desktop and mobile devices
- **Branding**: AquaSense logo displayed in sidebar header
- **User Profile**: Shows user name and account type
- **Logout**: Custom confirmation dialog before logout

## Limitations
- Cannot access admin or superadmin features
- Cannot manage other users
- Cannot view system logs or maintenance features
- Cannot modify system settings
- Cannot promote/demote users
- Cannot delete users

## Navigation Structure
```
Dashboard (Home)
  ├── Key Metrics
  ├── Analytics & Schedule
  └── Recent Activity

Monitoring
  ├── Real-time Sensors
  └── Alerts & Notifications

Feeding
  └── Feeding Schedule List

Reports
  ├── Month Selector
  ├── Daily Summary
  ├── Weekly Summary
  ├── Monthly Summary
  └── Mortality Log
```

## Key Functions
- Monitor water quality in real-time
- View and track feeding schedules
- Generate and export reports
- Filter reports by month
- Track mortality events
- View historical data and trends

## Summary
The User role provides comprehensive aquaculture management tools for individual farm operators, focusing on monitoring, feeding management, and reporting. All features are designed to help users maintain optimal conditions for their fish farms while providing detailed insights through various reports and analytics.

