# 🔧 AquaSense Web — Sensor Analytics Firestore Path Fix Summary

## Problem Statement

Sensor analytics and trend data are not being saved or displayed due to Firestore runtime errors:
- **Invalid collection reference** errors
- **Invalid document reference** errors  
- Errors mention incorrect segment counts

These errors occur **before** Firestore checks document existence, meaning this is **not** a missing-document issue.

## Root Cause (Confirmed)

Some sensor analytics and trend code uses **invalid Firestore paths**, including:
- String-interpolated paths (e.g., `doc(db, \`users/${uid}/sensorAnalytics/daily/${date}\`)`)
- Incorrect use of `doc()` vs `collection()`
- Even/odd segment count violations

## What is NOT Broken

✅ Report aggregation (hourly → daily → weekly → monthly)  
✅ UI rendering logic  
✅ Trend formatting logic  
✅ `ensureReportDoc()` logic  
✅ Existing report document paths (`dailyReports`, `weeklyReports`, `monthlyReports`)

## Required Firestore Paths (CORRECT)

Sensor analytics documents must be stored at:

```
users/{uid}/sensorAnalytics/daily/{YYYY-MM-DD}
users/{uid}/sensorAnalytics/weekly/{YYYY-Wxx}
users/{uid}/sensorAnalytics/monthly/{YYYY-MM}
```

## Allowed Changes

✅ Fix Firestore paths related to sensor analytics:
- Replace string-interpolated paths with segment-based paths
- Use `doc(db, "users", uid, "sensorAnalytics", period, id)` format
- Ensure `doc()` has even number of segments
- Ensure `collection()` has odd number of segments

✅ Keep all existing:
- Function names
- Data fields
- Execution order
- Business logic

## Forbidden Changes

❌ No UI changes  
❌ No schema changes  
❌ No new analytics fields  
❌ No refactoring of report logic  
❌ No removal of `ensureReportDoc()`  
❌ No string-based Firestore paths  
❌ No changes to `dailyReports`, `weeklyReports`, `monthlyReports` paths

## Success Criteria

✅ No Firestore segment errors in console  
✅ Sensor analytics documents created correctly at `sensorAnalytics/{period}/{id}` paths  
✅ Trend values appear in reports instead of "—"  
✅ No regressions in reports, charts, or dashboard behavior

## Files to Review

- `dashboard.js` - Check all `sensorAnalytics` related Firestore calls
  - `generateDailySensorAnalytics()`
  - `generateWeeklySensorAnalytics()`
  - `generateMonthlySensorAnalytics()`
  - `identifyDailySensorTrends()`
  - `identifyWeeklySensorTrends()`
  - `identifyMonthlySensorTrends()`
  - `loadDailyAnalyticsUI()`
  - `loadWeeklyAnalyticsUI()`
  - `loadMonthlyAnalyticsUI()`

## Expected Path Format

**CORRECT:**
```javascript
// Document reference (even segments: 6)
const docRef = doc(db, "users", uid, "sensorAnalytics", "daily", date);

// Collection reference (odd segments: 5)
const collRef = collection(db, "users", uid, "sensorAnalytics", "daily");
```

**INCORRECT:**
```javascript
// String interpolation - WRONG
const docRef = doc(db, `users/${uid}/sensorAnalytics/daily/${date}`);

// Wrong segment count - WRONG
const docRef = doc(db, "users", uid, "sensorAnalytics", "daily"); // 5 segments (odd) - needs 6
```

## Next Steps

1. ✅ Summary created (this document)
2. ⏳ Wait for user to proceed with fix implementation
3. ⏳ Review diff line by line - only Firestore path changes should appear
4. ⏳ If anything else changes → revert
