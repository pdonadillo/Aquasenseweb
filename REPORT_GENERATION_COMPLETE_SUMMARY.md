# AQUASENSE WEB - COMPLETE REPORT GENERATION SYSTEM DOCUMENTATION

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture & Data Flow](#architecture--data-flow)
3. [Frontend Report Generation (JavaScript)](#frontend-report-generation-javascript)
4. [Backend Report Generation (PHP Cron Jobs)](#backend-report-generation-php-cron-jobs)
5. [Export System](#export-system)
6. [Initialization & Seed Documents](#initialization--seed-documents)
7. [Data Structures](#data-structures)
8. [Utility Functions](#utility-functions)
9. [Backfill Functions](#backfill-functions)
10. [Legacy Functions](#legacy-functions)
11. [File Locations](#file-locations)

---

## System Overview

The AquaSense Web report generation system implements a **hierarchical data aggregation pipeline** that transforms raw sensor data into time-based reports at multiple granularities:

**Data Flow:**
```
Raw Sensors → Hourly Records → Daily Reports → Weekly Reports → Monthly Reports
```

**Key Characteristics:**
- **Idempotent**: Safe to re-run without data corruption
- **Hierarchical**: Each level aggregates from the previous level
- **Weighted Averages**: Uses count-based weighting for accurate aggregation
- **Coverage Metrics**: Tracks data completeness at each level
- **Seed Documents**: Prevents UI crashes when collections are empty
- **Dual Implementation**: Frontend (JavaScript) and Backend (PHP) for redundancy

---

## Architecture & Data Flow

### 1. Data Sources

**Raw Sensor Data:**
- Path: `users/{uid}/sensors/temperature`
- Path: `users/{uid}/sensors/ph`
- Fields: `value`, `timestamp`, `unit`

**Feeding Schedules:**
- Path: `users/{uid}/feedingSchedules`
- Fields: `scheduledTime`, `feedAmount`, `status`

**Mortality Logs:**
- Path: `users/{uid}/mortalityLogs`
- Fields: `timestamp`, `count`, `cause`, `notes`

### 2. Aggregation Hierarchy

**Level 1: Hourly Records**
- Source: Raw sensors + feeding schedules
- Path: `users/{uid}/hourlyRecords/{YYYY-MM-DD}/hours/{HH}`
- Aggregation: Sums, counts, averages of sensor readings within hour
- Frequency: Every 5 minutes (real-time sampling)

**Level 2: Daily Reports**
- Source: Hourly records for a specific date
- Path: `users/{uid}/dailyReports/{YYYY-MM-DD}`
- Aggregation: Weighted averages from hourly records
- Frequency: Once per day (after midnight)

**Level 3: Weekly Reports**
- Source: Daily reports within ISO week
- Path: `users/{uid}/weeklyReports/{YYYY-WW}`
- Aggregation: Average of daily averages
- Frequency: Once per week (Monday morning)

**Level 4: Monthly Reports**
- Source: Daily reports within calendar month
- Path: `users/{uid}/monthlyReports/{YYYY-MM}`
- Aggregation: Average of daily averages
- Frequency: Once per month (1st day of month)

---

## Frontend Report Generation (JavaScript)

### File: `dashboard.js`

### 1. Hourly Sampling System

**Function: `sampleCurrentHour(uid)`**
- **Location**: Lines 505-610
- **Purpose**: Samples current hour sensor data every 5 minutes
- **Frequency**: `SAMPLING_INTERVAL_MS = 5 * 60 * 1000` (5 minutes)
- **Logic**:
  1. Reads latest sensor values from `users/{uid}/sensors/temperature` and `users/{uid}/sensors/ph`
  2. Validates values (skips if both null)
  3. Uses Firestore transaction to atomically update hourly record
  4. If hour document doesn't exist: creates new with initial values
  5. If exists: updates sums, counts, and recalculates averages
- **Storage Path**: `users/{uid}/hourlyRecords/{dateStr}/hours/{hourStr}`
- **Fields Written**:
  - `temperatureSum`, `temperatureCount`, `temperatureAvg`
  - `phSum`, `phCount`, `phAvg`
  - `feedUsedKg` (initially 0, updated from schedules)
  - `isSeed: false`, `source: "web"`, `updatedAt`

**Function: `startHourlySampler(uid)`**
- **Location**: Lines 613-625
- **Purpose**: Starts interval timer for hourly sampling
- **Logic**: Sets `setInterval` to call `sampleCurrentHour(uid)` every 5 minutes
- **Cleanup**: Stores interval ID in `hourlySamplerIntervalId` for cleanup

**Function: `stopHourlySampler()`**
- **Location**: Lines 627-633
- **Purpose**: Stops the hourly sampling interval
- **Logic**: Clears interval if `hourlySamplerIntervalId` exists

### 2. Hourly Record Generation

**Function: `generateHourlyRecord(uid, date, hour)`**
- **Location**: Lines 2053-2147
- **Purpose**: Generates hourly record from raw sensor data and feeding schedules
- **Parameters**:
  - `uid`: User ID
  - `date`: Date string (YYYY-MM-DD)
  - `hour`: Hour number (0-23)
- **Logic**:
  1. Validates hour (0-23)
  2. Calculates hour start/end timestamps
  3. Reads sensor values (temperature, pH) if timestamp within hour
  4. Aggregates feed from `feedingSchedules` where `scheduledTime` is within hour
  5. Only writes if at least one data point exists
  6. Writes to: `users/{uid}/hourlyRecords/{date}/{hourString}`
- **Fields Written**:
  - `hour`, `temperatureAvg`, `phAvg`, `feedUsedKg`
  - `recordedAt`, `source: "web"`
- **Returns**: Hourly record object or `null` if no data

### 3. Daily Report Generation

**Function: `generateDailyReport(uid, date)`**
- **Location**: Lines 2156-2249
- **Purpose**: Aggregates hourly records into daily report
- **Parameters**:
  - `uid`: User ID
  - `date`: Date string (YYYY-MM-DD)
- **Logic**:
  1. Validates date format
  2. Reads all hourly records from `users/{uid}/hourlyRecords/{date}/hours`
  3. Skips seed documents (`isSeed === true`)
  4. Calculates weighted averages:
     - `temperatureSum += tempAvg * count`
     - `temperatureCount += count`
     - Same for pH
  5. Aggregates `feedUsedKg` from hourly records
  6. Counts `coverageHours` (hours with valid data)
  7. Returns `null` if `coverageHours === 0`
  8. Calculates final averages: `avgTemperature = temperatureSum / temperatureCount`
  9. Writes to: `users/{uid}/dailyReports/{date}`
- **Fields Written**:
  - `date`, `avgTemperature`, `avgPh`, `totalFeedKg`
  - `coverageHours`, `isSeed: false`, `generatedAt`, `source: "web"`
- **Returns**: Daily report object or `null` if no data

### 4. Weekly Report Generation

**Function: `generateWeeklyReport(uid, isoWeekString)`**
- **Location**: Lines 2257-2352
- **Purpose**: Aggregates daily reports into weekly report
- **Parameters**:
  - `uid`: User ID
  - `isoWeekString`: ISO week string (YYYY-WW format, e.g., "2025-W48")
- **Logic**:
  1. Validates ISO week format
  2. Gets all 7 dates in ISO week using `getDatesInIsoWeek()`
  3. Reads all daily reports from `users/{uid}/dailyReports`
  4. Filters to daily reports matching week dates
  5. Skips seed documents
  6. Aggregates:
     - `totalFeedKg`: Sum of daily `totalFeedKg` (or `feedUsedKg` for backward compatibility)
     - `temperatures[]`: Array of daily `avgTemperature` values
     - `phValues[]`: Array of daily `avgPh` values
  7. Calculates averages: Average of daily averages
  8. Sets `coverageDays = dailyReports.length`
  9. Returns `null` if `coverageDays === 0`
  10. Writes to: `users/{uid}/weeklyReports/{isoWeekString}`
- **Fields Written**:
  - `week`, `avgTemperature`, `avgPh`, `totalFeedKg`
  - `coverageDays`, `generatedAt`, `source: "web"`
- **Returns**: Weekly report object or `null` if no data

### 5. Monthly Report Generation

**Function: `generateMonthlyReport(uid, year, month)`**
- **Location**: Lines 2361-2456
- **Purpose**: Aggregates daily reports into monthly report
- **Parameters**:
  - `uid`: User ID
  - `year`: Year number (e.g., 2025)
  - `month`: Month number (1-12)
- **Logic**:
  1. Validates month (1-12)
  2. Creates month string: `YYYY-MM`
  3. Gets all dates in month using `getDatesInMonth()`
  4. Reads all daily reports from `users/{uid}/dailyReports`
  5. Filters to daily reports matching month dates
  6. Skips seed documents
  7. Aggregates:
     - `totalFeedKg`: Sum of daily `totalFeedKg` (or `feedUsedKg` for backward compatibility)
     - `temperatures[]`: Array of daily `avgTemperature` values
     - `phValues[]`: Array of daily `avgPh` values
  8. Calculates averages: Average of daily averages
  9. Sets `coverageDays = dailyReports.length`
  10. Returns `null` if `coverageDays === 0`
  11. Writes to: `users/{uid}/monthlyReports/{YYYY-MM}`
- **Fields Written**:
  - `month`, `avgTemperature`, `avgPh`, `totalFeedKg`
  - `coverageDays`, `generatedAt`, `source: "web"`
- **Returns**: Monthly report object or `null` if no data

---

## Backend Report Generation (PHP Cron Jobs)

### File: `api/cron/sample-hourly.php`

**Purpose**: Server-side hourly sampling (mirrors frontend `sampleCurrentHour()`)

**Cron Schedule**: `*/5 * * * *` (every 5 minutes)

**Logic**:
1. Verifies cron secret
2. Gets all active users (`users` collection where `isActive === true`)
3. For each user:
   - Gets current date and hour
   - Reads latest sensor values
   - Updates hourly record using Firestore transaction
   - Same logic as frontend `sampleCurrentHour()`
4. Returns JSON with `processed`, `errors`, `timestamp`

**Key Function**: Uses PHP Firestore SDK to perform same aggregation as JavaScript

---

### File: `api/cron/generate-daily.php`

**Purpose**: Server-side daily report generation (mirrors frontend `generateDailyReport()`)

**Cron Schedule**: `0 1 * * *` (1 AM daily, after midnight)

**Parameters**:
- `date`: Optional, defaults to yesterday (`date('Y-m-d', strtotime('-1 day'))`)

**Logic**:
1. Verifies cron secret
2. Gets all active users
3. For each user, calls `generateDailyReportForUser($db, $uid, $targetDate)`
4. Returns JSON with `processed`, `skipped`, `errors`

**Function: `generateDailyReportForUser($db, $uid, $date)`**
- **Location**: Lines 84-178
- **Logic**:
  1. Validates date format
  2. Reads hourly records from `users/{uid}/hourlyRecords/{date}/hours`
  3. Aggregates using weighted averages (same as frontend)
  4. Calculates `coverageHours`
  5. Returns `null` if `coverageHours === 0`
  6. Writes to `users/{uid}/dailyReports/{date}`
  7. Sets `source: "php-cron"`

---

### File: `api/cron/generate-weekly.php`

**Purpose**: Server-side weekly report generation

**Cron Schedule**: `0 2 * * 1` (2 AM every Monday)

**Parameters**:
- `week`: Optional, defaults to last week (`getLastWeekISO()`)

**Logic**:
1. Verifies cron secret
2. Gets all active users
3. For each user, calls `generateWeeklyReportForUser($db, $uid, $targetWeek)`
4. Returns JSON with `processed`, `skipped`, `errors`

**Function: `generateWeeklyReportForUser($db, $uid, $isoWeekString)`**
- **Location**: Lines 84-179
- **Logic**:
  1. Validates ISO week format
  2. Gets all 7 dates in ISO week using `getDatesInIsoWeek()`
  3. Reads all daily reports
  4. Filters to matching dates, skips seeds
  5. Aggregates feed totals and temperature/pH arrays
  6. Calculates averages (average of daily averages)
  7. Sets `coverageDays = count($dailyReports)`
  8. Returns `null` if `coverageDays === 0`
  9. Writes to `users/{uid}/weeklyReports/{isoWeekString}`
  10. Sets `source: "php-cron"`

**Helper Functions**:
- `getDatesInIsoWeek($isoWeekString)`: Returns array of 7 DateTime objects (Monday-Sunday)
- `getLastWeekISO()`: Returns ISO week string for last week

---

### File: `api/cron/generate-monthly.php`

**Purpose**: Server-side monthly report generation

**Cron Schedule**: `0 2 1 * *` (2 AM on 1st day of month)

**Parameters**:
- `month`: Optional, defaults to last month (`date('Y-m', strtotime('first day of last month'))`)

**Logic**:
1. Verifies cron secret
2. Gets all active users
3. For each user, calls `generateMonthlyReportForUser($db, $uid, $targetMonth)`
4. Returns JSON with `processed`, `skipped`, `errors`

**Function: `generateMonthlyReportForUser($db, $uid, $month)`**
- **Location**: Lines 84-185
- **Logic**:
  1. Validates month format (YYYY-MM)
  2. Gets month start/end dates
  3. Reads all daily reports
  4. Filters to reports within month date range, skips seeds
  5. Aggregates feed totals and temperature/pH arrays
  6. Calculates averages (average of daily averages)
  7. Sets `coverageDays = count($dailyReports)`
  8. Returns `null` if `coverageDays === 0`
  9. Writes to `users/{uid}/monthlyReports/{month}`
  10. Sets `source: "php-cron"`

---

## Export System

### File: `api/export/daily.php`

**Purpose**: Export daily reports in CSV, PDF, or Word format

**Authentication**: Requires Firebase ID token (`verifyFirebaseToken()`)

**Parameters**:
- `date`: Single date (YYYY-MM-DD) - optional
- `month`: Month (YYYY-MM) - optional
- `format`: `csv`, `pdf`, or `word` - defaults to `csv`

**Logic**:
1. Verifies authentication
2. Loads reports from `users/{uid}/dailyReports`:
   - If `date`: Single document
   - If `month`: All documents where `date` starts with month
   - Default: Current month
3. Filters out seed documents
4. Sorts by date
5. Calls export function based on format

**Function: `exportDailyCSV($reports, $filter)`**
- **Location**: Lines 122-161
- **Output**: CSV file with headers
- **Columns**: Date, Avg Temperature (°C), Avg pH, Total Feed (kg), Coverage Hours, Water Quality
- **Water Quality**: Calculated during export using `calculateWaterQuality()`

**Function: `exportDailyPDF($reports, $filter)`**
- **Location**: Lines 163-241
- **Library**: TCPDF
- **Features**: Watermark (logo), table format, headers/footers
- **Water Quality**: Calculated during export

**Function: `exportDailyWord($reports, $filter)`**
- **Location**: Lines 243-316
- **Library**: PhpOffice\PhpWord
- **Features**: Logo in header, table format
- **Water Quality**: Calculated during export

**Function: `calculateWaterQuality($avgTemperature, $avgPh, $mortality)`**
- **Location**: Lines 318-334
- **Logic**:
  - Returns `Unknown` if temperature or pH is null
  - Checks: pH 6.5-8.5, temperature 24-30°C, mortality === 0
  - Returns: `Good` (score 90), `Fair` (score 70), or `Poor` (score 40)

---

### File: `api/export/weekly.php`

**Purpose**: Export weekly reports in CSV, PDF, or Word format

**Parameters**:
- `week`: Single week (YYYY-WW) - optional
- `month`: Month (YYYY-MM) - shows weeks overlapping month - optional
- `format`: `csv`, `pdf`, or `word`

**Logic**:
1. Loads reports from `users/{uid}/weeklyReports`
2. If `week`: Single document
3. If `month`: Uses `weekOverlapsMonth()` to filter
4. Filters out seed documents
5. Sorts by week

**Function: `weekOverlapsMonth($weekStr, $month)`**
- **Location**: Lines 123-149
- **Purpose**: Determines if ISO week overlaps with calendar month
- **Logic**: Calculates Monday-Sunday of week, checks if overlaps with month start-end

**Export Functions**: Same structure as daily exports (CSV, PDF, Word)

---

### File: `api/export/monthly.php`

**Purpose**: Export monthly reports in CSV, PDF, or Word format

**Parameters**:
- `month`: Single month (YYYY-MM) - optional
- `year`: Year (YYYY) - shows all months in year - optional
- `format`: `csv`, `pdf`, or `word`

**Logic**:
1. Loads reports from `users/{uid}/monthlyReports`
2. If `month`: Single document
3. If `year`: All documents where `month` starts with year
4. Filters out seed documents
5. Sorts by month

**Export Functions**: Same structure as daily/weekly exports (CSV, PDF, Word)

---

## Initialization & Seed Documents

### File: `dashboard.js`

### 1. Collection Initialization

**Function: `initializeReportCollections(uid)`**
- **Location**: Lines 299-314
- **Purpose**: Safely initializes report collections on first login
- **Logic**:
  1. Calls `ensureHourlyCollection(uid)`
  2. Calls `ensureDailyReports(uid)`
  3. Calls `ensureWeeklyReports(uid)`
  4. Calls `ensureMonthlyReports(uid)`

**Function: `ensureHourlyCollection(uid)`**
- **Location**: Lines 120-146
- **Purpose**: Ensures hourly records collection structure exists
- **Logic**:
  1. Checks if `hourlyRecords` collection exists (has documents)
  2. If exists: returns
  3. Checks if raw sensor data exists
  4. If no sensor data: returns (hourly records created when data exists)

**Function: `ensureDailyReports(uid)`**
- **Location**: Lines 154-201
- **Purpose**: Ensures daily reports collection exists
- **Logic**:
  1. Checks if `dailyReports` collection exists
  2. If exists: returns
  3. Checks if `hourlyRecords` exist
  4. If no hourly records: returns
  5. Generates ONE daily report for today (creates collection)

**Function: `ensureWeeklyReports(uid)`**
- **Location**: Lines 210-247
- **Purpose**: Ensures weekly reports collection exists
- **Logic**:
  1. Checks if `weeklyReports` collection exists
  2. If exists: returns
  3. Checks if `dailyReports` exist
  4. If no daily reports: returns
  5. Generates ONE weekly report for current ISO week

**Function: `ensureMonthlyReports(uid)`**
- **Location**: Lines 256-295
- **Purpose**: Ensures monthly reports collection exists
- **Logic**:
  1. Checks if `monthlyReports` collection exists
  2. If exists: returns
  3. Checks if `dailyReports` exist
  4. If no daily reports: returns
  5. Generates ONE monthly report for current month

### 2. Seed Documents

**Purpose**: Prevents UI crashes when collections are empty by creating zero-value placeholder documents

**Function: `initializeReportSeeds(uid, todayStr, weekStr, monthStr)`**
- **Location**: Lines 478-493
- **Purpose**: Creates seed documents for current date/week/month
- **Logic**:
  1. Calls `seedHourlyIfEmpty(uid, todayStr)`
  2. Calls `seedDailyIfEmpty(uid, todayStr)`
  3. Calls `seedWeeklyIfEmpty(uid, weekStr)`
  4. Calls `seedMonthlyIfEmpty(uid, monthStr)`

**Function: `seedHourlyIfEmpty(uid, dateStr)`**
- **Location**: Lines 331-378
- **Purpose**: Creates seed hour document if hours subcollection is empty
- **Logic**:
  1. Ensures date document exists in `hourlyRecords/{dateStr}`
  2. Checks if hours subcollection has documents
  3. If empty: creates seed document at hour `00`
- **Seed Document Fields**:
  - `hour: '00'`, `temperatureSum: 0`, `temperatureCount: 0`, `temperatureAvg: 0`
  - `phSum: 0`, `phCount: 0`, `phAvg: 0`, `feedUsedKg: 0`
  - `isSeed: true`, `source: "web"`, `generatedAt`, `updatedAt`

**Function: `seedDailyIfEmpty(uid, dateStr)`**
- **Location**: Lines 381-410
- **Purpose**: Creates seed daily report if document doesn't exist
- **Logic**:
  1. Checks if document exists
  2. If not: creates seed document
- **Seed Document Fields**:
  - `date`, `avgTemperature: 0`, `avgPh: 0`, `totalFeedKg: 0`
  - `coverageHours: 0`, `isSeed: true`, `source: "web"`, `generatedAt`

**Function: `seedWeeklyIfEmpty(uid, weekStr)`**
- **Location**: Lines 413-442
- **Purpose**: Creates seed weekly report if document doesn't exist
- **Seed Document Fields**:
  - `week`, `avgTemperature: 0`, `avgPh: 0`, `totalFeedKg: 0`
  - `coverageDays: 0`, `isSeed: true`, `source: "web"`, `generatedAt`

**Function: `seedMonthlyIfEmpty(uid, monthStr)`**
- **Location**: Lines 445-474
- **Purpose**: Creates seed monthly report if document doesn't exist
- **Seed Document Fields**:
  - `month`, `avgTemperature: 0`, `avgPh: 0`, `totalFeedKg: 0`
  - `coverageDays: 0`, `isSeed: true`, `source: "web"`, `generatedAt`

**Important**: Seed documents are **excluded** from aggregation calculations (checked via `isSeed === true`)

---

## Data Structures

### Hourly Record Document
**Path**: `users/{uid}/hourlyRecords/{YYYY-MM-DD}/hours/{HH}`

```javascript
{
  hour: "00",                    // Hour string (00-23)
  temperatureSum: 25.5,          // Sum of temperature readings
  temperatureCount: 12,           // Number of temperature readings
  temperatureAvg: 25.5,          // Calculated average
  phSum: 7.2,                    // Sum of pH readings
  phCount: 12,                    // Number of pH readings
  phAvg: 7.2,                    // Calculated average
  feedUsedKg: 2.5,               // Total feed used in hour (from schedules)
  isSeed: false,                 // true if placeholder, false if real data
  source: "web",                  // "web" or "php-cron"
  updatedAt: Timestamp,           // Last update timestamp
  generatedAt: Timestamp          // Creation timestamp (for seeds)
}
```

### Daily Report Document
**Path**: `users/{uid}/dailyReports/{YYYY-MM-DD}`

```javascript
{
  date: "2025-01-15",            // Date string (YYYY-MM-DD)
  avgTemperature: 26.3,          // Weighted average from hourly records
  avgPh: 7.1,                     // Weighted average from hourly records
  totalFeedKg: 15.5,              // Sum of feed from hourly records
  coverageHours: 18,              // Number of hours with valid data (0-24)
  isSeed: false,                 // true if placeholder
  generatedAt: Timestamp,         // Generation timestamp
  source: "web"                   // "web" or "php-cron"
}
```

### Weekly Report Document
**Path**: `users/{uid}/weeklyReports/{YYYY-WW}`

```javascript
{
  week: "2025-W48",               // ISO week string
  avgTemperature: 26.0,          // Average of daily averages
  avgPh: 7.0,                     // Average of daily averages
  totalFeedKg: 105.5,             // Sum of daily totalFeedKg
  coverageDays: 5,                // Number of days with reports (0-7)
  isSeed: false,                  // true if placeholder
  generatedAt: Timestamp,         // Generation timestamp
  source: "web"                   // "web" or "php-cron"
}
```

### Monthly Report Document
**Path**: `users/{uid}/monthlyReports/{YYYY-MM}`

```javascript
{
  month: "2025-01",               // Month string (YYYY-MM)
  avgTemperature: 25.8,          // Average of daily averages
  avgPh: 7.05,                    // Average of daily averages
  totalFeedKg: 450.5,             // Sum of daily totalFeedKg
  coverageDays: 28,               // Number of days with reports (0-31)
  isSeed: false,                  // true if placeholder
  generatedAt: Timestamp,         // Generation timestamp
  source: "web"                   // "web" or "php-cron"
}
```

---

## Utility Functions

### File: `dashboard.js`

**Function: `formatDateString(date)`**
- **Location**: Lines 2027-2032
- **Purpose**: Formats Date object as YYYY-MM-DD string
- **Returns**: String like "2025-01-15"

**Function: `getCurrentIsoWeek()`**
- **Location**: Lines 67-80
- **Purpose**: Gets current ISO week string
- **Returns**: String like "2025-W48"

**Function: `getCurrentMonthString()`**
- **Location**: Lines 82-85
- **Purpose**: Gets current month string
- **Returns**: String like "2025-01"

**Function: `isoWeekToMonday(year, week)`**
- **Location**: Lines 1996-2006
- **Purpose**: Converts ISO week to Monday start date
- **Returns**: Date object

**Function: `getDatesInIsoWeek(isoWeekString)`**
- **Location**: Lines 2009-2024
- **Purpose**: Gets all 7 dates (Monday-Sunday) in ISO week
- **Returns**: Array of Date objects

**Function: `getDatesInMonth(year, month)`**
- **Location**: Lines 2035-2044
- **Purpose**: Gets all dates in a calendar month
- **Returns**: Array of Date objects

**Function: `calculateWaterQuality(avgTemperature, avgPh, mortality)`**
- **Location**: Lines 1967-1983
- **Purpose**: Calculates water quality rating
- **Logic**:
  - Returns `{ waterQuality: 'Unknown', score: null }` if temperature or pH is null
  - Checks: pH 6.5-8.5, temperature 24-30°C, mortality === 0
  - Returns: `Good` (score 90), `Fair` (score 70), or `Poor` (score 40)
- **Returns**: Object with `waterQuality` and `score`

---

## Backfill Functions

### File: `dashboard.js`

**Function: `backfillHourlyRecords(uid, startDate, endDate)`**
- **Location**: Lines 2464-2505
- **Purpose**: Generates hourly records for a date range
- **Parameters**:
  - `uid`: User ID
  - `startDate`: Start date string (YYYY-MM-DD)
  - `endDate`: End date string (YYYY-MM-DD)
- **Logic**:
  1. Iterates through each day in range
  2. For each day, generates hourly records for all 24 hours
  3. Calls `generateHourlyRecord(uid, dateStr, hour)` for each hour
  4. Counts generated and skipped records
- **Returns**: `{ processed, generated, skipped }`

**Function: `backfillDailyReports(uid)`**
- **Location**: Lines 2508-2552
- **Purpose**: Generates daily reports from all existing hourly records
- **Logic**:
  1. Gets all hourly record dates from `hourlyRecords` collection
  2. For each unique date, calls `generateDailyReport(uid, date)`
  3. Counts generated reports
- **Returns**: `{ processed, generated }`

**Function: `backfillWeeklyReports(uid)`**
- **Location**: Lines 2555-2629
- **Purpose**: Generates weekly reports from all existing daily reports
- **Logic**:
  1. Gets all daily reports
  2. Finds date range (min to max)
  3. Calculates all ISO weeks in range
  4. For each week, calls `generateWeeklyReport(uid, week)`
  5. Counts generated reports
- **Returns**: `{ processed, generated }`

**Function: `backfillMonthlyReports(uid)`**
- **Location**: Lines 2632-2681
- **Purpose**: Generates monthly reports from all existing daily reports
- **Logic**:
  1. Gets all daily reports
  2. Extracts unique year-month combinations
  3. For each month, calls `generateMonthlyReport(uid, year, month)`
  4. Counts generated reports
- **Returns**: `{ processed, generated }`

---

## Legacy Functions

### File: `dashboard.js`

**Function: `computeDailySummary(uid, dateString)`**
- **Location**: Lines 2688-2793
- **Purpose**: Legacy function that computes daily summary from raw data (not hourly records)
- **Logic**:
  1. Fetches feeding schedules for the day
  2. Fetches mortality logs for the day
  3. Fetches sensor data (temperature, pH)
  4. Calculates water quality using `calculateWaterQuality()`
  5. Writes to `dailyReports` with fields: `feedUsed`, `mortality`, `avgTemperature`, `avgPh`, `waterQuality`, `score`
- **Note**: This is the OLD method. New method uses `generateDailyReport()` which aggregates from hourly records.

**Function: `computeWeeklySummary(uid, weekString)`**
- **Location**: Lines 2800-2899
- **Purpose**: Legacy function that computes weekly summary from daily reports
- **Logic**: Similar to `generateWeeklyReport()` but includes mortality and water quality score
- **Note**: Legacy version includes mortality and water quality score fields

**Function: `computeMonthlySummary(uid, monthString)`**
- **Location**: Lines 2906-2986
- **Purpose**: Legacy function that computes monthly summary from daily reports
- **Logic**: Similar to `generateMonthlyReport()` but includes mortality and water quality score
- **Note**: Legacy version includes mortality and water quality score fields

---

## File Locations

### Frontend (JavaScript)
- **Main File**: `dashboard.js`
  - Hourly sampling: Lines 495-633
  - Hourly record generation: Lines 2053-2147
  - Daily report generation: Lines 2156-2249
  - Weekly report generation: Lines 2257-2352
  - Monthly report generation: Lines 2361-2456
  - Backfill functions: Lines 2464-2681
  - Legacy functions: Lines 2688-2986
  - Initialization: Lines 116-320
  - Seed documents: Lines 331-493
  - Utility functions: Lines 67-85, 1995-2044, 1967-1983

### Backend (PHP Cron Jobs)
- **Hourly Sampling**: `api/cron/sample-hourly.php`
- **Daily Generation**: `api/cron/generate-daily.php`
- **Weekly Generation**: `api/cron/generate-weekly.php`
- **Monthly Generation**: `api/cron/generate-monthly.php`

### Export Endpoints
- **Daily Export**: `api/export/daily.php`
- **Weekly Export**: `api/export/weekly.php`
- **Monthly Export**: `api/export/monthly.php`

### Configuration
- **Firebase Config**: `api/_config/firebase.php`
- **Token Verification**: `api/_middleware/verifyToken.php`

---

## Key Design Principles

1. **Idempotency**: All generation functions use `merge: true` when writing, making them safe to re-run
2. **Seed Exclusion**: Seed documents (`isSeed: true`) are always excluded from calculations
3. **Weighted Averages**: Uses count-based weighting for accurate aggregation across time periods
4. **Coverage Metrics**: Tracks data completeness (`coverageHours`, `coverageDays`)
5. **Conditional Generation**: Only generates reports if source data exists (`coverageHours > 0`, `coverageDays > 0`)
6. **Dual Implementation**: Frontend (JavaScript) and backend (PHP) for redundancy and reliability
7. **Backward Compatibility**: Supports old field names (`feedUsedKg` vs `totalFeedKg`)

---

## Execution Flow

### Real-Time Flow
1. **Every 5 minutes**: `sampleCurrentHour()` runs (frontend) or `sample-hourly.php` (backend)
2. **Updates**: Hourly record for current hour with latest sensor values
3. **Transaction**: Uses Firestore transaction for atomic updates

### Daily Flow
1. **After midnight**: `generate-daily.php` cron runs (or frontend `generateDailyReport()`)
2. **Reads**: All hourly records for yesterday
3. **Aggregates**: Weighted averages, totals, coverage
4. **Writes**: Daily report document

### Weekly Flow
1. **Monday morning**: `generate-weekly.php` cron runs (or frontend `generateWeeklyReport()`)
2. **Reads**: All daily reports for last week (ISO week)
3. **Aggregates**: Average of daily averages, totals, coverage
4. **Writes**: Weekly report document

### Monthly Flow
1. **1st of month**: `generate-monthly.php` cron runs (or frontend `generateMonthlyReport()`)
2. **Reads**: All daily reports for last month
3. **Aggregates**: Average of daily averages, totals, coverage
4. **Writes**: Monthly report document

---

## End of Documentation

This document provides a complete reference for the AquaSense Web report generation system. All functions, data structures, file locations, and execution flows are documented above.
