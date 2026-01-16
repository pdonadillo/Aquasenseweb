# Admin Role Summary - AquaSense Web

## Overview
The **Admin** role is designed for system administrators who need to manage users, monitor system performance, and oversee analytics across the AquaSense platform. Admins have elevated privileges compared to regular users but cannot perform superadmin-level operations.

## Access & Permissions
- **Dashboard Access**: `admin-dashboard.html`
- **Role Level**: Administrator (mid-level privilege)
- **Access**: Can also access admin dashboard (shared with superadmin)
- **Restrictions**: Cannot access superadmin-only features, cannot modify user roles, cannot delete users

## Dashboard Sections

### 1. Overview
**Purpose**: System-wide statistics and activity overview

**Features**:
- **System Statistics**
  - Total Users count
  - Active Farms count
  - System Health status
  - Performance metrics

- **Activity Overview**
  - Recent system activity
  - User engagement metrics
  - System status indicators

- **Quick Stats Cards**
  - Visual representation of key metrics
  - Change indicators (positive/negative trends)
  - Real-time updates

### 2. Users
**Purpose**: User management and administration

**Features**:
- **User List/Table**
  - View all registered users
  - User information display
  - Search functionality
  - Filter capabilities

- **User Management**
  - View user details (read-only)
  - View user profiles
  - View user activity
  - Cannot modify user roles
  - Cannot delete users
  - Cannot promote/demote users

- **User Search**
  - Search by name
  - Search by email
  - Real-time filtering

**Limitations**:
- View-only access to user data
- Cannot modify user roles
- Cannot delete users
- Cannot promote users to admin
- Cannot demote admins

### 3. Analytics
**Purpose**: System analytics and performance monitoring

**Features**:
- **Farm Performance**
  - Performance metrics (chart placeholder)
  - Farm statistics
  - Performance trends

- **Water Quality Trends**
  - System-wide water quality data
  - Trend analysis (chart placeholder)
  - Quality metrics

- **User Engagement Stats**
  - Daily Active Users
  - Average Session duration
  - Feature Usage statistics
  - Engagement metrics

- **System Health Metrics**
  - Overall system health
  - Performance indicators
  - Health status monitoring

**Analytics Cards**:
- Farm Performance metrics
- Water Quality Trends
- User Engagement statistics
- System Health indicators

### 4. System
**Purpose**: System monitoring and configuration

**Features**:
- **System Status Monitoring**
  - Server status
  - System health
  - Resource utilization
  - Network connectivity
  - Database status

- **Configuration Settings**
  - System configuration view
  - Settings management (limited)
  - Configuration monitoring

- **Maintenance Operations**
  - View maintenance status
  - Monitor system operations
  - Maintenance history

- **Backup Status**
  - Backup monitoring
  - Backup history
  - Backup status indicators

- **System Logs**
  - View system logs
  - Log history
  - Error tracking

- **Alert History**
  - System alerts
  - Alert logs
  - Notification history

## Data Sources
Admin dashboard accesses:
- `users/` collection - All user data (read-only)
- System statistics and metrics
- Activity logs
- System health data

## User Interface
- **Sidebar Navigation**: Fixed left sidebar with admin sections
- **Branding**: AquaSense Admin logo in sidebar
- **Admin Profile**: Shows admin account information
- **Responsive Design**: Works on desktop and mobile
- **Logout**: Custom confirmation dialog

## Key Capabilities
- View all users in the system
- Search and filter users
- Monitor system performance
- View analytics and reports
- Monitor system health
- View system logs
- Track user engagement

## Limitations
- **Cannot modify user roles** (promote/demote)
- **Cannot delete users**
- **Cannot access superadmin features**
- **Cannot modify system-critical settings**
- **Read-only access to most user data**
- **Cannot manage superadmin accounts**

## Navigation Structure
```
Overview
  ├── System Statistics
  ├── Activity Overview
  └── Quick Stats

Users
  ├── User List/Table
  ├── User Search
  └── User Details (View Only)

Analytics
  ├── Farm Performance
  ├── Water Quality Trends
  ├── User Engagement
  └── System Health

System
  ├── System Status
  ├── Configuration
  ├── Maintenance
  ├── Backup Status
  ├── System Logs
  └── Alert History
```

## Role Hierarchy
```
Super Admin (Highest)
    ↓
Admin ← You are here
    ↓
User (Lowest)
```

## Summary
The Admin role provides system administrators with tools to monitor and manage the AquaSense platform. Admins can view users, monitor system performance, access analytics, and oversee system health, but have limited modification capabilities compared to superadmins. This role is ideal for day-to-day system administration and user support.

