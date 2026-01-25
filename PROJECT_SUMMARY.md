# AquaSense - Unified Project Summary

## 1. Project Overview

**AquaSense** is an IoT-Based Aquaculture Management System with Data Analytics designed to support fish farmers in making aquaculture smarter, easier, and more sustainable. The platform integrates IoT sensors, scheduled feeding, mortality logging, data analytics, and mobile access into one comprehensive solution.

### Key Features
- **Real-time Water Quality Monitoring**: pH, temperature, oxygen, and ammonia sensors
- **Automated Scheduled Feeding**: Set feeding times and quantities
- **Mortality Logging**: Track fish deaths and calculate survival rates
- **Data Analytics & Reporting**: Daily, weekly, and monthly summaries with charts
- **Production Monitoring**: Track fingerlings, harvests, and calculate profit rates
- **Export Capabilities**: CSV, PDF, and Word document exports
- **Multi-role Access**: User, Admin, and SuperAdmin roles with different permissions
- **Mobile-responsive Design**: Accessible on all devices

---

## 2. Technology Stack

### Frontend
- **HTML5/CSS3**: Modern responsive web interface
- **Vanilla JavaScript (ES6+)**: Modular architecture with ES modules
- **Chart.js**: Data visualization and analytics charts
- **Firebase Client SDK**: Real-time database and authentication

### Backend
- **Node.js**: Server-side runtime
- **Firebase Admin SDK**: Server-side Firestore access and token verification
- **Express.js Compatible**: API endpoints can be used with Express
- **PDFKit**: PDF generation for reports
- **docx**: Word document generation

### Database & Services
- **Firebase Firestore**: Primary NoSQL database
- **Firebase Realtime Database**: Real-time sensor data
- **Firebase Authentication**: User authentication and authorization
- **Firebase Storage**: File storage (for logos, APKs, etc.)

---

## 3. Database Structure (Firestore)

### Root Collections

#### `users/{uid}`
User profile documents containing:
- `email`: User email address
- `displayName`: User's full name
- `role`: User role (`user`, `admin`, `superadmin`)
- `isActive`: Boolean flag for active users
- `createdAt`: Timestamp
- `lastLogin`: Timestamp

**Code Example - User Document Structure:**
```javascript
// Example user document in Firestore
{
  email: "farmer@example.com",
  displayName: "John Doe",
  role: "user",
  isActive: true,
  createdAt: Timestamp(2024, 1, 15, 10, 30, 0),
  lastLogin: Timestamp(2024, 6, 20, 14, 45, 0)
}
```

**Subcollections under `users/{uid}`:**

1. **`sensors/{sensorType}`**
   - `temperature`: Current temperature value
   - `ph`: Current pH value
   - `value`: Numeric sensor reading
   - `timestamp`: Last update time

2. **`hourlyRecords/{YYYY-MM-DD}/hours/{HH}`**
   - `hour`: Hour string (00-23)
   - `temperatureSum`: Sum of temperature readings
   - `temperatureCount`: Number of readings
   - `temperatureAvg`: Calculated average
   - `phSum`: Sum of pH readings
   - `phCount`: Number of readings
   - `phAvg`: Calculated average
   - `feedUsedKg`: Feed consumed in this hour
   - `isSeed`: Boolean flag for seed documents
   - `source`: Origin of data (`js-cron`, `client`, etc.)
   - `updatedAt`: Timestamp

**Code Example - Hourly Record Document:**
```javascript
// Example: users/{uid}/hourlyRecords/2024-06-20/hours/14
{
  hour: "14",
  temperatureSum: 150.5,
  temperatureCount: 5,
  temperatureAvg: 30.1,
  phSum: 42.0,
  phCount: 5,
  phAvg: 8.4,
  feedUsedKg: 2.5,
  isSeed: false,
  source: "js-cron",
  updatedAt: Timestamp(2024, 6, 20, 14, 55, 0)
}
```

3. **`dailyReports/{YYYY-MM-DD}`**
   - `date`: Date string (YYYY-MM-DD)
   - `avgTemperature`: Daily average temperature
   - `avgPh`: Daily average pH
   - `totalFeedKg`: Total feed used in day
   - `coverageHours`: Number of hours with data
   - `isSeed`: Boolean flag
   - `generatedAt`: Timestamp
   - `source`: Generation source

**Code Example - Daily Report Document:**
```javascript
// Example: users/{uid}/dailyReports/2024-06-20
{
  date: "2024-06-20",
  avgTemperature: 29.8,
  avgPh: 8.2,
  totalFeedKg: 15.5,
  coverageHours: 18,
  isSeed: false,
  generatedAt: Timestamp(2024, 6, 21, 1, 0, 0),
  source: "js-cron"
}
```

4. **`weeklyReports/{YYYY-WW}`**
   - `week`: ISO week string (YYYY-WW)
   - `avgTemperature`: Weekly average temperature
   - `avgPh`: Weekly average pH
   - `totalFeedKg`: Total feed used in week
   - `coverageDays`: Number of days with data
   - `isSeed`: Boolean flag
   - `generatedAt`: Timestamp
   - `source`: Generation source

5. **`monthlyReports/{YYYY-MM}`**
   - `month`: Month string (YYYY-MM)
   - `avgTemperature`: Monthly average temperature
   - `avgPh`: Monthly average pH
   - `totalFeedKg`: Total feed used in month
   - `coverageDays`: Number of days with data
   - `isSeed`: Boolean flag
   - `generatedAt`: Timestamp
   - `source`: Generation source

6. **`productionRecords/{autoId}`**
   - `fingerlingsCount`: Initial fingerling count
   - `harvestedCount`: Total harvested fish
   - `deathsCount`: Total deaths
   - `survivalRate`: Calculated survival percentage
   - `lossRate`: Calculated loss percentage
   - `profitRate`: Calculated profit percentage
   - `startMonth`: Start month (YYYY-MM)
   - `endMonth`: End month (YYYY-MM)
   - `createdAt`: Timestamp

7. **`ponds/{pondId}`** (if implemented)
   - Pond configuration and settings

8. **`devices/{deviceId}`** (if implemented)
   - Device configuration and ownership

#### `devices/{deviceId}`
Device ownership mapping:
- `ownerUid`: User ID who owns the device
- `deviceName`: Device identifier
- `isActive`: Device status

#### `activities/{activityId}`
System activities log:
- `type`: Activity type
- `description`: Activity description
- `timestamp`: When it occurred
- `userId`: User who performed action

#### `notifications/{notificationId}`
User notifications:
- `userId`: Target user
- `title`: Notification title
- `message`: Notification content
- `type`: Notification type
- `read`: Boolean read status
- `timestamp`: Creation time

#### `system_logs/{logId}`
System logs (Admin/SuperAdmin only):
- `level`: Log level (info, warning, error)
- `message`: Log message
- `timestamp`: Log time

#### `system_errors/{errorId}`
System error tracking:
- `error`: Error message
- `stack`: Error stack trace
- `timestamp`: Error time

#### `system_updates/{updateId}`
System updates (APK/Firmware):
- `version`: Update version
- `type`: Update type (apk, firmware)
- `downloadUrl`: Download link
- `publishedAt`: Publication time

#### `scheduled_tasks/{taskId}`
Scheduled task configuration:
- `taskType`: Type of task
- `schedule`: Cron expression or schedule
- `enabled`: Boolean status

---

## 4. File Structure

```
AquasenceWeb/
├── Frontend Files
│   ├── index.html                 # Landing page
│   ├── user-dashboard.html        # User dashboard
│   ├── admin-dashboard.html       # Admin dashboard
│   ├── super-admin-dashboard.html # SuperAdmin dashboard
│   ├── setup-super-admin.html     # SuperAdmin setup page
│   ├── verify-superadmin.html     # SuperAdmin verification
│   │
│   ├── main.js                    # Main application entry point
│   ├── main-new.js                # Alternative main entry
│   ├── firebase-init.js           # Firebase initialization
│   ├── auth.js                    # Authentication functions
│   ├── dashboard.js               # Dashboard logic (11K+ lines)
│   ├── ui.js                      # UI utilities and modals
│   ├── utils.js                   # Utility functions
│   ├── notifications.js           # Notification system
│   │
│   ├── main.css                   # Main stylesheet
│   ├── user-dashboard.css         # User dashboard styles
│   ├── admin-dashboard.css        # Admin dashboard styles
│   ├── super.css                  # SuperAdmin styles
│   │
│   └── assets/
│       ├── images/logo/           # Logo images
│       └── js/
│           ├── export.js          # Export functionality (renamed from php-export.js)
│           └── php-export.js      # Legacy file (deprecated)
│
├── Backend API (Node.js)
│   └── api/
│       ├── _config/
│       │   └── firebase.js        # Firebase Admin SDK config
│       ├── _middleware/
│       │   └── verifyToken.js     # Token verification middleware
│       ├── cron/
│       │   ├── generate-daily.js    # Daily report generation
│       │   ├── generate-weekly.js   # Weekly report generation
│       │   ├── generate-monthly.js  # Monthly report generation
│       │   └── sample-hourly.js     # Hourly sensor sampling
│       ├── export/
│       │   ├── daily.js           # Daily report export endpoint
│       │   ├── weekly.js           # Weekly report export endpoint
│       │   └── monthly.js          # Monthly report export endpoint
│       ├── _private/               # Private files (service account keys)
│       └── package.json            # Node.js dependencies
│
├── Configuration Files
│   ├── firestore.rules            # Firestore security rules
│   ├── composer.json               # PHP dependencies (deprecated, migration note)
│   └── PROJECT_SUMMARY.md         # This file
```

---

## 5. Core Logic & Features

### 5.1 Authentication & Authorization

**Authentication Flow:**
1. User signs up with email/password or Google OAuth
2. Firebase Auth creates user account
3. User document created in Firestore with role `user`
4. Session stored in `sessionStorage`
5. Role-based redirect to appropriate dashboard

**Roles:**
- **User**: Access to own data, reports, and dashboard
- **Admin**: Access to all users' data, system logs, activities
- **SuperAdmin**: Full system access, user management, system updates

**Security:**
- Firebase ID tokens verified on backend
- Firestore security rules enforce access control
- Role-based UI rendering and API access

**Code Example - Login Function (`auth.js`):**
```javascript
export async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.querySelector('#loginModal input[type="checkbox"]').checked;
    
    if (!email || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    try {
        // Set persistence based on "Remember me"
        if (rememberMe) {
            await setPersistence(auth, browserLocalPersistence);
        } else {
            await setPersistence(auth, browserSessionPersistence);
        }
        
        // Sign in with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email.toLowerCase(), password);
        const firebaseUser = userCredential.user;
        
        // Get user data from Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userRef);
        const user = snap.data();
        
        // Store session
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('userUid', firebaseUser.uid);
        sessionStorage.setItem('userRole', user.role);
        
        // Redirect based on role
        if (user.role === 'superadmin') {
            window.location.href = 'super-admin-dashboard.html';
        } else if (user.role === 'admin') {
            window.location.href = 'admin-dashboard.html';
        } else {
            window.location.href = 'user-dashboard.html';
        }
    } catch (error) {
        showNotification('Login failed: ' + error.message, 'error');
    }
}
```

**Code Example - Role Verification (`auth.js`):**
```javascript
export async function verifyRoleOrRedirect(requiredRoles = []) {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const userUid = sessionStorage.getItem('userUid');
    
    if (!isLoggedIn || !userUid) {
        window.location.replace('index.html');
        return null;
    }
    
    try {
        const ref = doc(db, 'users', userUid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            window.location.replace('index.html');
            return null;
        }
        const user = snap.data();
        if (requiredRoles.length && !requiredRoles.includes(user.role)) {
            window.location.replace('index.html');
            return null;
        }
        return user;
    } catch {
        window.location.replace('index.html');
        return null;
    }
}
```

### 5.2 Data Collection & Aggregation

**Hourly Sampling:**
- Cron job runs every 5 minutes (`sample-hourly.js`)
- Reads current sensor values from `users/{uid}/sensors/`
- Aggregates into `users/{uid}/hourlyRecords/{date}/hours/{hour}`
- Calculates running averages for temperature and pH

**Daily Report Generation:**
- Cron job runs daily at 1 AM (`generate-daily.js`)
- Aggregates hourly records for previous day
- Calculates daily averages (weighted by count)
- Creates document in `users/{uid}/dailyReports/{date}`

**Weekly Report Generation:**
- Cron job runs weekly on Mondays at 2 AM (`generate-weekly.js`)
- Aggregates daily reports for ISO week
- Calculates weekly averages
- Creates document in `users/{uid}/weeklyReports/{YYYY-WW}`

**Monthly Report Generation:**
- Cron job runs monthly on 1st at 2 AM (`generate-monthly.js`)
- Aggregates daily reports for previous month
- Calculates monthly averages
- Creates document in `users/{uid}/monthlyReports/{YYYY-MM}`

**Code Example - Daily Report Generation (`api/cron/generate-daily.js`):**
```javascript
async function generateDailyReportForUser(db, uid, date) {
    // Read hourly records for this date
    const hoursRef = db.collection('users').doc(uid)
        .collection('hourlyRecords').doc(date)
        .collection('hours');
    const hoursSnapshot = await hoursRef.get();
    
    if (hoursSnapshot.empty) {
        return null; // No hourly records
    }
    
    // Aggregate from hourly records
    let temperatureSum = 0;
    let temperatureCount = 0;
    let phSum = 0;
    let phCount = 0;
    let totalFeedKg = 0;
    let coverageHours = 0;
    
    hoursSnapshot.forEach(hourDoc => {
        const record = hourDoc.data();
        if (record.isSeed === true) return; // Skip seed documents
        
        // Use weighted averages if counts exist
        if (record.temperatureAvg !== null) {
            const tempAvg = parseFloat(record.temperatureAvg);
            const count = record.temperatureCount || 1;
            temperatureSum += tempAvg * count;
            temperatureCount += count;
        }
        
        if (record.phAvg !== null) {
            const phAvg = parseFloat(record.phAvg);
            const count = record.phCount || 1;
            phSum += phAvg * count;
            phCount += count;
        }
        
        if (record.feedUsedKg > 0) {
            totalFeedKg += parseFloat(record.feedUsedKg);
        }
        
        if (record.temperatureCount > 0 || record.phCount > 0) {
            coverageHours++;
        }
    });
    
    if (coverageHours === 0) return null;
    
    // Calculate daily averages
    const avgTemperature = temperatureCount > 0 ? temperatureSum / temperatureCount : null;
    const avgPh = phCount > 0 ? phSum / phCount : null;
    
    // Write to Firestore
    const admin = require('firebase-admin');
    const reportRef = db.collection('users').doc(uid)
        .collection('dailyReports').doc(date);
    
    const dailyReport = {
        date: date,
        avgTemperature: avgTemperature,
        avgPh: avgPh,
        totalFeedKg: totalFeedKg > 0 ? totalFeedKg : null,
        coverageHours: coverageHours,
        isSeed: false,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'js-cron'
    };
    
    await reportRef.set(dailyReport, { merge: true });
    return dailyReport;
}
```

### 5.3 Water Quality Calculation

**Quality Assessment:**
- **Good**: pH 6.5-8.5, Temperature 24-30°C, No mortality (Score: 90)
- **Fair**: pH in range, Temp in range, Mortality ≤3 (Score: 70)
- **Poor**: Outside ranges or high mortality (Score: 40)
- **Unknown**: Missing temperature or pH data

**Code Example - Water Quality Calculation:**
```javascript
function calculateWaterQuality(avgTemperature, avgPh, mortality) {
    if (avgTemperature === null || avgTemperature === undefined || 
        avgPh === null || avgPh === undefined) {
        return { waterQuality: 'Unknown', score: null };
    }
    
    const phInRange = avgPh >= 6.5 && avgPh <= 8.5;
    const tempInRange = avgTemperature >= 24 && avgTemperature <= 30;
    const noMortality = mortality === 0;
    
    if (phInRange && tempInRange && noMortality) {
        return { waterQuality: 'Good', score: 90 };
    } else if (mortality <= 3 || (phInRange && tempInRange && mortality > 0)) {
        return { waterQuality: 'Fair', score: 70 };
    } else {
        return { waterQuality: 'Poor', score: 40 };
    }
}
```

### 5.4 Production Monitoring

**Metrics Calculated:**
- `survivalRate = (harvestedCount / fingerlingsCount) * 100`
- `lossRate = (deathsCount / fingerlingsCount) * 100`
- `profitRate = survivalRate - lossRate`

**Data Flow:**
1. User inputs fingerlings count, harvested count, deaths
2. Metrics calculated client-side
3. Saved to `users/{uid}/productionRecords/`
4. Displayed in production monitoring section

**Code Example - Production Metrics Recording (`dashboard.js`):**
```javascript
async function recordProductionMetrics(uid, metrics) {
    if (!uid) {
        console.warn("[PRODUCTION] No UID provided, cannot save to Firestore");
        return;
    }
    
    try {
        const ref = collection(db, `users/${uid}/productionRecords`);
        
        const docRef = await addDoc(ref, {
            fingerlingsCount: metrics.fingerlingsCount,
            harvestedCount: metrics.harvestedCount,
            deathsCount: metrics.deathsCount,
            survivalRate: metrics.survivalRate,
            lossRate: metrics.lossRate,
            profitRate: metrics.profitRate,
            startMonth: metrics.startMonth,
            endMonth: metrics.endMonth,
            createdAt: serverTimestamp()
        });
        
        console.log("[PRODUCTION] Production record saved to Firestore");
        console.log(`[PRODUCTION] Path: users/${uid}/productionRecords/${docRef.id}`);
    } catch (error) {
        console.error("[PRODUCTION] Error saving production record:", error);
        throw error;
    }
}

// Usage example:
const metrics = {
    fingerlingsCount: 1000,
    harvestedCount: 850,
    deathsCount: 150,
    survivalRate: 85.0,
    lossRate: 15.0,
    profitRate: 70.0,
    startMonth: '2024-01',
    endMonth: '2024-06'
};
await recordProductionMetrics(userUid, metrics);
```

### 5.5 Real-time Updates

**Firestore Listeners:**
- Real-time sensor data via `onSnapshot()`
- Live dashboard updates
- Automatic chart refresh
- Notification system

**Realtime Database:**
- Used for high-frequency sensor updates
- Lower latency than Firestore
- Synced to Firestore for persistence

**Code Example - Reading Daily Reports:**
```javascript
// Load daily reports for a specific month
async function loadDailyReports(uid, month) {
    const db = FirebaseConfig.getFirestore();
    const reports = [];
    
    const query = db.collection('users').doc(uid)
        .collection('dailyReports')
        .where('date', '>=', `${month}-01`)
        .where('date', '<=', `${month}-31`)
        .orderBy('date');
    
    const snapshot = await query.get();
    snapshot.forEach(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (!data.isSeed) {
                reports.push(data);
            }
        }
    });
    
    return reports;
}

// Real-time listener for daily reports
function setupDailyReportsListener(uid, month, callback) {
    const query = collection(db, `users/${uid}/dailyReports`);
    const q = query(
        query,
        where('date', '>=', `${month}-01`),
        where('date', '<=', `${month}-31`),
        orderBy('date')
    );
    
    return onSnapshot(q, (snapshot) => {
        const reports = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!data.isSeed) reports.push(data);
        });
        callback(reports);
    });
}
```

### 5.6 Export System

**Export Formats:**
- **CSV**: Tabular data with UTF-8 BOM
- **PDF**: Formatted reports with tables (PDFKit)
- **Word**: Document format (.docx) with tables

**Export Endpoints:**
- `/api/export/daily?format={csv|pdf|word}&date={date}&month={month}`
- `/api/export/weekly?format={csv|pdf|word}&week={week}&month={month}`
- `/api/export/monthly?format={csv|pdf|word}&month={month}&year={year}`

**Authentication:**
- Requires Firebase ID token in `Authorization: Bearer {token}` header
- Token verified server-side before export generation

**Code Example - Client-Side Export (`assets/js/export.js`):**
```javascript
async function exportDailyReport(format, date = null, month = null) {
    try {
        const token = await getFirebaseIdToken();
        
        let url = `/api/export/daily?format=${format}`;
        if (date) url += `&date=${date}`;
        else if (month) url += `&month=${month}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Export failed');
        }
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.style.display = 'none';
        
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `daily_report_${date || month || 'export'}_${new Date().toISOString().split('T')[0]}.${format}`;
        
        if (contentDisposition) {
            const matches = /filename="?([^"]+)"?/i.exec(contentDisposition);
            if (matches && matches[1]) filename = matches[1];
        }
        
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        showNotification('Report exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting daily report:', error);
        showNotification('Export failed: ' + error.message, 'error');
    }
}
```

**Code Example - Server-Side Export Endpoint (`api/export/daily.js`):**
```javascript
async function exportDaily(req, res) {
    try {
        // Verify authentication
        const uid = await verifyFirebaseToken(req);
        
        // Get parameters
        const date = req.query?.date || null;
        const month = req.query?.month || null;
        const format = (req.query?.format || 'csv').toLowerCase();
        
        // Validate format
        if (!['csv', 'pdf', 'word'].includes(format)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid format. Must be: csv, pdf, or word'
            });
        }
        
        const db = FirebaseConfig.getFirestore();
        const reports = [];
        
        // Load reports based on filter
        if (date) {
            // Single date
            const docRef = db.collection('users').doc(uid)
                .collection('dailyReports').doc(date);
            const doc = await docRef.get();
            
            if (doc.exists) {
                const data = doc.data();
                if (!data.isSeed) reports.push(data);
            }
        } else if (month) {
            // All reports in month
            const query = db.collection('users').doc(uid)
                .collection('dailyReports')
                .where('date', '>=', `${month}-01`)
                .where('date', '<=', `${month}-31`);
            
            const snapshot = await query.get();
            snapshot.forEach(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    if (!data.isSeed && data.date && data.date.startsWith(month)) {
                        reports.push(data);
                    }
                }
            });
            
            reports.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        }
        
        // Generate file based on format
        const filter = date || month || new Date().toISOString().slice(0, 7);
        
        switch (format) {
            case 'csv': await exportDailyCSV(reports, filter, res); break;
            case 'pdf': await exportDailyPDF(reports, filter, res); break;
            case 'word': await exportDailyWord(reports, filter, res); break;
        }
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Export failed',
            details: error.details
        });
    }
}
```

---

## 6. API Endpoints

### 6.1 Export Endpoints

**Daily Reports:**
```
GET /api/export/daily
Query Parameters:
  - format: csv | pdf | word
  - date: YYYY-MM-DD (optional, single date)
  - month: YYYY-MM (optional, all dates in month)
Headers:
  - Authorization: Bearer {firebase-id-token}
Response: File download (CSV/PDF/Word)
```

**Weekly Reports:**
```
GET /api/export/weekly
Query Parameters:
  - format: csv | pdf | word
  - week: YYYY-WW (optional, single week)
  - month: YYYY-MM (optional, weeks overlapping month)
Headers:
  - Authorization: Bearer {firebase-id-token}
Response: File download (CSV/PDF/Word)
```

**Monthly Reports:**
```
GET /api/export/monthly
Query Parameters:
  - format: csv | pdf | word
  - month: YYYY-MM (optional, single month)
  - year: YYYY (optional, all months in year)
Headers:
  - Authorization: Bearer {firebase-id-token}
Response: File download (CSV/PDF/Word)
```

### 6.2 Cron Job Endpoints

**Daily Report Generation:**
```
GET /api/cron/generate-daily
Query Parameters:
  - secret: CRON_SECRET (required)
  - date: YYYY-MM-DD (optional, defaults to yesterday)
Response: JSON with processed/skipped/errors counts
```

**Weekly Report Generation:**
```
GET /api/cron/generate-weekly
Query Parameters:
  - secret: CRON_SECRET (required)
  - week: YYYY-WW (optional, defaults to last week)
Response: JSON with processed/skipped/errors counts
```

**Monthly Report Generation:**
```
GET /api/cron/generate-monthly
Query Parameters:
  - secret: CRON_SECRET (required)
  - month: YYYY-MM (optional, defaults to last month)
Response: JSON with processed/skipped/errors counts
```

**Hourly Sampling:**
```
GET /api/cron/sample-hourly
Query Parameters:
  - secret: CRON_SECRET (required)
Response: JSON with processed/errors counts
```

---

## 7. Data Flow Diagrams

### 7.1 Sensor Data Flow
```
IoT Sensors → Realtime Database → Firestore (sensors collection)
                                    ↓
                            Hourly Sampling Cron
                                    ↓
                        hourlyRecords/{date}/hours/{hour}
                                    ↓
                            Daily Report Generation
                                    ↓
                        dailyReports/{YYYY-MM-DD}
                                    ↓
                            Weekly/Monthly Aggregation
```

### 7.2 User Interaction Flow
```
User Login → Firebase Auth → Session Storage
                              ↓
                    Role Verification
                              ↓
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
         User Dashboard  Admin Dashboard  SuperAdmin Dashboard
              ↓               ↓               ↓
         View Own Data   View All Users   Full System Access
         Generate Reports  System Logs    User Management
         Export Reports    Activities      System Updates
```

### 7.3 Report Generation Flow
```
User Request Export
        ↓
Get Firebase ID Token
        ↓
Call API Endpoint (/api/export/{type})
        ↓
Server Verifies Token
        ↓
Query Firestore for Reports
        ↓
Generate File (CSV/PDF/Word)
        ↓
Return File Download
```

---

## 8. Key Functions & Modules

### 8.1 Authentication (`auth.js`)
- `handleLogin()`: Email/password login
- `handleSignup()`: User registration
- `logout()`: Session cleanup
- `verifyRoleOrRedirect()`: Role-based access control

**Code Example - Firebase Initialization (`firebase-init.js`):**
```javascript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBXh2XVeKkecjy0tGisPzgNyzXIOdFxK6U',
  authDomain: 'aquasense-8fef1.firebaseapp.com',
  databaseURL: 'https://aquasense-8fef1-default-rtdb.firebaseio.com',
  projectId: 'aquasense-8fef1',
  storageBucket: 'aquasense-8fef1.firebasestorage.app',
  messagingSenderId: '1052942345206',
  appId: '1:1052942345206:web:98d03f840be6b8525f9dd7'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
```

### 8.2 Dashboard (`dashboard.js`)
- `initializeUserDashboard()`: User dashboard setup
- `initializeAdminDashboard()`: Admin dashboard setup
- `initializeSuperAdminDashboard()`: SuperAdmin dashboard setup
- `loadDailyReport()`: Load and display daily reports
- `loadWeeklyReport()`: Load and display weekly reports
- `loadMonthlyReport()`: Load and display monthly reports
- `loadHourlyReport()`: Load hourly sensor data
- `recordProductionMetrics()`: Save production data
- `exportDailyReport()`: Client-side daily export
- `exportWeeklyReport()`: Client-side weekly export
- `exportMonthlyReport()`: Client-side monthly export

**Code Example - Real-time Sensor Data Listener:**
```javascript
// Listen to real-time sensor updates
function setupSensorListener(uid) {
    const tempRef = doc(db, `users/${uid}/sensors/temperature`);
    const phRef = doc(db, `users/${uid}/sensors/ph`);
    
    // Temperature listener
    onSnapshot(tempRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const tempValue = data.value;
            updateTemperatureDisplay(tempValue);
        }
    });
    
    // pH listener
    onSnapshot(phRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const phValue = data.value;
            updatePhDisplay(phValue);
        }
    });
}
```

### 8.3 UI Utilities (`ui.js`)
- `openModal()`: Open modal dialogs
- `closeModal()`: Close modals
- `switchModal()`: Switch between modals
- `confirmAction()`: Confirmation dialogs

**Code Example - Modal Management:**
```javascript
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}
```

### 8.4 Notifications (`notifications.js`)
- `showNotification()`: Display toast notifications
- `setupGlobalNotifications()`: Initialize notification system

**Code Example - Notification System:**
```javascript
export function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}
```

### 8.5 Export Client (`assets/js/export.js`)
- `exportDailyReport()`: Call daily export API
- `exportWeeklyReport()`: Call weekly export API
- `exportMonthlyReport()`: Call monthly export API
- `getFirebaseIdToken()`: Get auth token for API calls

**Code Example - Get Firebase ID Token:**
```javascript
async function getFirebaseIdToken() {
    try {
        const { auth } = await import('../../firebase-init.js');
        if (!auth || !auth.currentUser) {
            throw new Error('User not authenticated');
        }
        return await auth.currentUser.getIdToken();
    } catch (error) {
        console.error('Error getting Firebase ID token:', error);
        throw error;
    }
}
```

### 8.6 Backend API - Firebase Admin Config (`api/_config/firebase.js`)
**Code Example:**
```javascript
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const FIREBASE_SERVICE_ACCOUNT_PATH = path.join(__dirname, '../../_private/firebase-service-account.json');

class FirebaseConfig {
    static factory = null;
    static auth = null;
    static firestore = null;

    static getFactory() {
        if (this.factory === null) {
            if (!fs.existsSync(FIREBASE_SERVICE_ACCOUNT_PATH)) {
                throw new Error('Firebase service account file not found.');
            }
            
            if (!admin.apps.length) {
                const serviceAccount = require(FIREBASE_SERVICE_ACCOUNT_PATH);
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: 'https://aquasense-8fef1-default-rtdb.firebaseio.com'
                });
            }
            this.factory = admin;
        }
        return this.factory;
    }

    static getAuth() {
        if (this.auth === null) {
            this.auth = this.getFactory().auth();
        }
        return this.auth;
    }

    static getFirestore() {
        if (this.firestore === null) {
            this.firestore = this.getFactory().firestore();
        }
        return this.firestore;
    }
}

module.exports = FirebaseConfig;
```

### 8.7 Backend API - Token Verification (`api/_middleware/verifyToken.js`)
**Code Example:**
```javascript
const FirebaseConfig = require('../_config/firebase');

async function verifyFirebaseToken(req) {
    const authHeader = req.headers?.authorization || req.headers?.Authorization || null;
    
    if (!authHeader) {
        const error = new Error('Missing Authorization header');
        error.statusCode = 401;
        throw error;
    }
    
    const match = authHeader.match(/Bearer\s+(.*)$/i);
    if (!match) {
        const error = new Error('Invalid Authorization header format');
        error.statusCode = 401;
        throw error;
    }
    
    const idToken = match[1];
    
    try {
        const auth = FirebaseConfig.getAuth();
        const decodedToken = await auth.verifyIdToken(idToken);
        return decodedToken.uid;
    } catch (error) {
        const err = new Error('Invalid or expired token');
        err.statusCode = 401;
        throw err;
    }
}

function verifyCronSecret(providedSecret) {
    const expectedSecret = process.env.CRON_SECRET || 'your-secret-key-change-this';
    
    if (!providedSecret) return false;
    
    const crypto = require('crypto');
    const providedBuffer = Buffer.from(providedSecret);
    const expectedBuffer = Buffer.from(expectedSecret);
    
    if (providedBuffer.length !== expectedBuffer.length) return false;
    
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

module.exports = { verifyFirebaseToken, verifyCronSecret };
```

---

## 9. Security Considerations

### 9.1 Firestore Security Rules
- Users can only read/write their own data
- Admins can read all user data
- SuperAdmins have full access
- Device ownership mapping is publicly readable (for headless operation)
- System collections restricted to admins/superadmins

**Code Example - Firestore Security Rules (`firestore.rules`):**
```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // User documents
    match /users/{uid} {
      allow read: if isOwner(uid) || isSuperAdmin();
      allow create: if request.auth != null && 
                       request.auth.uid == uid &&
                       request.resource.data.role == 'user';
      allow update: if (isOwner(uid) && 
                       !('role' in request.resource.data.diff(resource.data))) ||
                      isSuperAdmin();
      allow delete: if isSuperAdmin();
      
      // User subcollections
      match /{subcollection}/{docId} {
        allow read, write: if isOwner(uid) || isAdminOrSuperAdmin();
      }
    }
    
    // Helper functions
    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }
    
    function isSuperAdmin() {
      return request.auth != null &&
             exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'superadmin';
    }
    
    function isAdminOrSuperAdmin() {
      return request.auth != null &&
             exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
             (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
              get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'superadmin');
    }
  }
}
```

### 9.2 API Security
- All API endpoints require Firebase ID token
- Token verified server-side using Firebase Admin SDK
- Cron jobs protected by secret key (`CRON_SECRET`)
- Constant-time comparison for secrets (prevents timing attacks)

### 9.3 Client-Side Security
- Session stored in `sessionStorage` (cleared on browser close)
- Role verification on page load
- Automatic redirect if unauthorized
- Input validation and sanitization

---

## 10. Deployment Considerations

### 10.1 Environment Variables
- `CRON_SECRET`: Secret key for cron job authentication
- Firebase Service Account: Stored in `_private/firebase-service-account.json`

### 10.2 Cron Job Setup
Recommended cron schedule:
- Hourly sampling: `*/5 * * * *` (every 5 minutes)
- Daily reports: `0 1 * * *` (1 AM daily)
- Weekly reports: `0 2 * * 1` (2 AM Mondays)
- Monthly reports: `0 2 1 * *` (2 AM on 1st of month)

### 10.3 Server Requirements
- Node.js >= 14.0.0
- Firebase Admin SDK access
- File system access for service account key
- Express.js (optional, for API server)

**Code Example - Express Server Setup:**
```javascript
// server.js - Example Express server setup
const express = require('express');
const { exportDaily } = require('./api/export/daily');
const { exportWeekly } = require('./api/export/weekly');
const { exportMonthly } = require('./api/export/monthly');
const { generateDailyReports } = require('./api/cron/generate-daily');
const { generateWeeklyReports } = require('./api/cron/generate-weekly');
const { generateMonthlyReports } = require('./api/cron/generate-monthly');
const { sampleHourlyData } = require('./api/cron/sample-hourly');
const { verifyTokenMiddleware } = require('./api/_middleware/verifyToken');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Export endpoints (require authentication)
app.get('/api/export/daily', verifyTokenMiddleware, exportDaily);
app.get('/api/export/weekly', verifyTokenMiddleware, exportWeekly);
app.get('/api/export/monthly', verifyTokenMiddleware, exportMonthly);

// Cron job endpoints (require secret)
app.get('/api/cron/generate-daily', generateDailyReports);
app.get('/api/cron/generate-weekly', generateWeeklyReports);
app.get('/api/cron/generate-monthly', generateMonthlyReports);
app.get('/api/cron/sample-hourly', sampleHourlyData);

app.listen(PORT, () => {
    console.log(`AquaSense API server running on port ${PORT}`);
});
```

### 10.4 Dependencies
**Frontend:** None (uses CDN for Firebase and Chart.js)

**Backend:**
- `firebase-admin`: ^12.0.0
- `pdfkit`: ^0.14.0
- `docx`: ^8.5.0

---

## 11. Migration Notes

### PHP to JavaScript Migration
- All PHP backend files converted to Node.js
- API endpoints changed from `.php` to no extension
- Export client updated to use new endpoints
- Backward compatibility aliases maintained for function names
- `composer.json` deprecated (see `api/package.json` for Node.js dependencies)

---

## 12. Future Enhancements

Potential improvements:
- Real-time WebSocket connections for live sensor updates
- Mobile app integration (APK download system in place)
- Advanced analytics and machine learning predictions
- Multi-pond support per user
- Device management interface
- Automated alert system for water quality thresholds
- Feed optimization recommendations
- Historical trend analysis

---

## 13. Project Statistics

- **Total Lines of Code**: ~15,000+ (estimated)
- **Main Dashboard File**: 11,000+ lines (`dashboard.js`)
- **Database Collections**: 10+ root collections
- **User Subcollections**: 8+ per user
- **API Endpoints**: 7 (4 cron, 3 export)
- **Export Formats**: 3 (CSV, PDF, Word)
- **User Roles**: 3 (User, Admin, SuperAdmin)
- **Report Types**: 3 (Daily, Weekly, Monthly)

---

**Last Updated**: 2024
**Version**: 2.0 (JavaScript/Node.js Migration)
**Status**: Production Ready
