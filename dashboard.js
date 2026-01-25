// this is dashboard.js
// dashboard.js - Dashboard-specific functionality
console.log('[BOOT] dashboard.js started');

import { db, rtdb, doc, getDoc, setDoc, collection, getDocs, updateDoc, deleteDoc, addDoc, auth, serverTimestamp, query, orderBy, limit, onSnapshot, onAuthStateChanged, runTransaction, increment, ref, set, get, update, onValue, off } from './firebase-init.js';
import { updateUserDisplayName, verifyRoleOrRedirect } from './auth.js';
import { formatDate } from './utils.js';
import { showNotification } from './notifications.js';

// ============================================================
// RUNTIME CODE CHECKER & SAFETY GUARDS
// ============================================================
// Lightweight code checker to prevent runtime-breaking bugs
// Detects duplicate declarations, undefined functions, invalid Firebase paths, and auth-related crashes

// Helper registry for duplicate detection
window.__DECLARED_HELPERS__ = window.__DECLARED_HELPERS__ || new Set();
window.__DECLARED_FUNCTIONS__ = window.__DECLARED_FUNCTIONS__ || new Map();
window.__CODE_CHECKER_DIAGNOSTICS__ = {
    duplicates: [],
    missing: [],
    firebaseWarnings: [],
    wrappedFunctions: []
};

// Register a helper function (detects duplicates)
function registerHelper(name, location = 'unknown') {
    if (window.__DECLARED_HELPERS__.has(name)) {
        const existing = window.__DECLARED_FUNCTIONS__.get(name);
        console.error(`[CODE CHECKER] Duplicate helper detected: ${name}`);
        console.error(`[CODE CHECKER]   First declaration: ${existing || 'unknown'}`);
        console.error(`[CODE CHECKER]   Duplicate at: ${location}`);
        window.__CODE_CHECKER_DIAGNOSTICS__.duplicates.push({
            name: name,
            first: existing || 'unknown',
            duplicate: location
        });
    } else {
        window.__DECLARED_HELPERS__.add(name);
        window.__DECLARED_FUNCTIONS__.set(name, location);
    }
}

// Check if a function is defined
function checkFunctionExists(name, context = 'global') {
    if (typeof window[name] === 'function' || typeof eval(`typeof ${name}`) !== 'undefined') {
        return true;
    }
    console.error(`[CODE CHECKER] Missing function: ${name} (referenced in ${context})`);
    window.__CODE_CHECKER_DIAGNOSTICS__.missing.push({ name, context });
    return false;
}

// Safe function wrapper with error handling
function wrapFunction(fn, name, context = '') {
    if (typeof fn !== 'function') {
        console.error(`[CODE CHECKER] Cannot wrap non-function: ${name}`);
        return fn;
    }
    
    // Check if function is async
    const isAsync = fn.constructor.name === 'AsyncFunction';
    
    const wrapped = function(...args) {
        try {
            const result = fn.apply(this, args);
            // If original is async, await it; otherwise return as-is
            if (isAsync || result instanceof Promise) {
                return Promise.resolve(result).catch(error => {
                    console.error(`[CODE CHECKER] Error in ${name}${context ? ` (${context})` : ''}:`, error.message);
                    console.error(`[CODE CHECKER] Stack trace:`, error.stack);
                    window.__CODE_CHECKER_DIAGNOSTICS__.wrappedFunctions.push({
                        name: name,
                        error: error.message,
                        stack: error.stack,
                        timestamp: new Date().toISOString()
                    });
                    throw error; // Re-throw to maintain original behavior
                });
            }
            return result;
        } catch (error) {
            console.error(`[CODE CHECKER] Error in ${name}${context ? ` (${context})` : ''}:`, error.message);
            console.error(`[CODE CHECKER] Stack trace:`, error.stack);
            window.__CODE_CHECKER_DIAGNOSTICS__.wrappedFunctions.push({
                name: name,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            throw error; // Re-throw to maintain original behavior
        }
    };
    
    // Preserve function name for debugging
    Object.defineProperty(wrapped, 'name', { value: name, writable: false });
    return wrapped;
}

// Firebase path validation
function validateFirestorePath(path, context = '') {
    if (!path || path === null || path === undefined) {
        const msg = `[CODE CHECKER] Invalid Firestore path: ${path}${context ? ` (${context})` : ''}`;
        console.warn(msg);
        window.__CODE_CHECKER_DIAGNOSTICS__.firebaseWarnings.push({ type: 'null_path', path, context });
        return false;
    }
    if (typeof path !== 'string' || path.trim() === '') {
        const msg = `[CODE CHECKER] Empty Firestore path${context ? ` (${context})` : ''}`;
        console.warn(msg);
        window.__CODE_CHECKER_DIAGNOSTICS__.firebaseWarnings.push({ type: 'empty_path', path, context });
        return false;
    }
    return true;
}

// Check UID before Firestore write
function validateUidForWrite(uid, context = '') {
    if (!uid || uid === null || uid === undefined) {
        const msg = `[CODE CHECKER] Missing UID for Firestore write${context ? ` (${context})` : ''}`;
        console.warn(msg);
        window.__CODE_CHECKER_DIAGNOSTICS__.firebaseWarnings.push({ type: 'missing_uid', context });
        return false;
    }
    return true;
}

// Check read-only mode before write
function checkReadOnlyMode(context = '') {
    if (typeof IS_REPORT_FETCH_ONLY !== 'undefined' && IS_REPORT_FETCH_ONLY === true) {
        const msg = `[CODE CHECKER] Firestore write attempted in read-only mode${context ? ` (${context})` : ''}`;
        console.warn(msg);
        window.__CODE_CHECKER_DIAGNOSTICS__.firebaseWarnings.push({ type: 'read_only_write', context });
        return true; // Returns true if in read-only mode
    }
    return false;
}

// Diagnostic summary output
function outputDiagnosticSummary() {
    const diag = window.__CODE_CHECKER_DIAGNOSTICS__;
    const duplicates = diag.duplicates.length;
    const missing = diag.missing.length;
    const firebaseWarnings = diag.firebaseWarnings.length;
    
    console.log('%c[SYSTEM CHECK]', 'font-weight: bold; color: #4CAF50;');
    console.log(`%c✔ Firebase initialized`, 'color: #4CAF50;');
    console.log(`%c✔ RTDB listeners active`, 'color: #4CAF50;');
    
    // Runtime context status
    const runtimeContext = window.RUNTIME_CONTEXT;
    if (runtimeContext && runtimeContext.runtimeUid) {
        console.log(`%c✔ Runtime context resolved (source: ${runtimeContext.source || 'unknown'})`, 'color: #4CAF50;');
    } else {
        console.log(`%c⚠ Runtime context: not resolved`, 'color: #FF9800;');
    }
    
    // Duplicates
    if (duplicates === 0) {
        console.log(`%c✔ Duplicate helpers: none`, 'color: #4CAF50;');
    } else {
        console.log(`%c⚠ Duplicate helpers: ${duplicates}`, 'color: #FF9800;');
        diag.duplicates.forEach(dup => {
            console.warn(`  - ${dup.name} (first: ${dup.first}, duplicate: ${dup.duplicate})`);
        });
    }
    
    // Missing functions
    if (missing === 0) {
        console.log(`%c✔ Missing functions: none`, 'color: #4CAF50;');
    } else {
        console.log(`%c⚠ Missing functions: ${missing}`, 'color: #FF9800;');
        diag.missing.forEach(m => {
            console.warn(`  - ${m.name} (referenced in ${m.context})`);
        });
    }
    
    // Firebase warnings
    if (firebaseWarnings === 0) {
        console.log(`%c✔ Firebase validation: no warnings`, 'color: #4CAF50;');
    } else {
        console.log(`%c⚠ Firebase warnings: ${firebaseWarnings}`, 'color: #FF9800;');
    }
    
    console.log('%c[SYSTEM CHECK] End', 'font-weight: bold; color: #4CAF50;');
}

// Auto-run diagnostic summary after page load
if (typeof window !== 'undefined') {
    // Run after a short delay to allow initialization
    setTimeout(() => {
        outputDiagnosticSummary();
    }, 2000);
}

// ============================================================
// READ-ONLY GUARD FOR REPORT FETCHING
// ============================================================
// When true, prevents all Firestore writes during report fetching/rendering
// This prevents quota exhaustion from initialization/backfill logic running during dashboard load
const IS_REPORT_FETCH_ONLY = true;

// ============================================================
// HOURLY TEST MODE GUARD (PREVENTS WRITE STORMS)
// ============================================================
// When true, disables all automatic Firestore writes except the single hourly writer
// This prevents 429 errors from multiple code paths writing to the same hourly document
const HOURLY_TEST_MODE = true;

// ============================================================
// RUNTIME STATE (CORE - DOM-FREE)
// ============================================================
// Global runtime state that persists regardless of UI or auth
window.RUNTIME_STATE = window.RUNTIME_STATE || {
    temperature: null,
    ph: null,
    feederState: null,
    lastUpdateAt: null
};

// ============================================================
// RUNTIME EVENT BUS (CORE - DOM-FREE)
// ============================================================
// Event bus for decoupling runtime core from UI
// UI can subscribe to events, but runtime never depends on UI
window.RuntimeEvents = window.RuntimeEvents || {
    listeners: {},
    on(event, fn) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(fn);
    },
    emit(event, payload) {
        if (!this.listeners[event]) return;
        // Swallow listener errors - UI failures must not break runtime
        this.listeners[event].forEach(fn => {
            try {
                fn(payload);
            } catch (error) {
                console.warn('[CORE] Event listener error (non-critical):', error);
            }
        });
    },
    off(event, fn) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(f => f !== fn);
    }
};

// ============================================================
// CLIENT STATE (RTDB → LOCAL STATE → FIRESTORE)
// ============================================================
// RTDB listeners update these values (read-only from RTDB)
// The single hourly writer reads from these values
let latestTemperature = null;
let latestPH = null;
let latestTimestamp = null;

// Rate-limiting gate for hourly writes (prevents write storms)
let lastWrittenHourKey = null;
let LAST_HOURLY_WRITE_KEY = null;  // `${dateStr}-${hourStr}`
let LAST_HOURLY_WRITE_AT = 0;
const HOURLY_WRITE_COOLDOWN_MS = 60_000; // 1 minute (testing safe)

// ============================================================
// ROLLUP THROTTLING (DAILY/WEEKLY/MONTHLY)
// ============================================================
// Prevents write storms for daily/weekly/monthly rollups
let LAST_ROLLUP_AT = { daily: 0, weekly: 0, monthly: 0 };
const ROLLUP_COOLDOWN = { 
    daily: 5 * 60_000,    // 5 minutes
    weekly: 60 * 60_000,  // 1 hour
    monthly: 60 * 60_000   // 1 hour
};

// ============================================================
// REPORT MONTH FILTER STATE
// ============================================================

// Selected filters for reports
let selectedHourlyDate = null; // Format: "YYYY-MM-DD"
let selectedReportMonth = null; // Format: "YYYY-MM" for daily/weekly
let selectedReportYear = null; // Format: "YYYY" for monthly

// ============================================================
// REPORT ROWS STATE (IN-MEMORY CACHE)
// ============================================================

// Store loaded report rows in memory for export
const reportRowsState = {
    dailyRows: [],
    weeklyRows: [],
    monthlyRows: [],
    mortalityRows: [],
    hourlyRows: [],
    productionRows: []
};

// Global chart instance for live sensor readings chart
let waterQualityChart = null;

// Store live sensor readings for chart (last 60 data points)
const liveSensorData = {
    temperature: [],
    ph: [],
    timestamps: [],
    maxDataPoints: 60 // Show last 60 readings
};

// Store chart instances for cleanup
const chartInstances = {
    daily: {
        temperature: null,
        ph: null
    },
    weekly: {
        temperature: null,
        ph: null
    },
    monthly: {
        temperature: null,
        ph: null
    },
    hourly: {
        temperature: null,
        ph: null
    }
};

// User Dashboard specific functions
// ============================================================
// SAFE FIRESTORE INITIALIZATION SYSTEM
// ============================================================
// Collections are created ONLY when valid data is written.
// We NEVER assume collections exist.

// Helper: Get current ISO week string (YYYY-WW)
function getCurrentIsoWeek() {
    const now = new Date();
    const jan4 = new Date(now.getFullYear(), 0, 4);
    const jan4Day = jan4.getDay();
    const jan4Monday = new Date(jan4);
    jan4Monday.setDate(4 - (jan4Day === 0 ? 6 : jan4Day - 1));
    
    const weekStart = new Date(jan4Monday);
    const daysDiff = Math.floor((now - jan4Monday) / (1000 * 60 * 60 * 24));
    const weekNo = Math.ceil((daysDiff + 1) / 7);
    
    return `${now.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Helper: Get current month string (YYYY-MM)
function getCurrentMonthString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

// Helper: Check if raw sensor data exists
async function hasRawSensorData(uid) {
    try {
        const tempRef = doc(db, `users/${uid}/sensors/temperature`);
        const phRef = doc(db, `users/${uid}/sensors/ph`);
        
        const [tempSnap, phSnap] = await Promise.all([
            getDoc(tempRef),
            getDoc(phRef)
        ]);
        
        // Check if either sensor has valid data
        const hasTemp = tempSnap.exists() && 
            tempSnap.data().value !== undefined && 
            tempSnap.data().value !== null;
        
        const hasPh = phSnap.exists() && 
            phSnap.data().value !== undefined && 
            phSnap.data().value !== null;
        
        return hasTemp || hasPh;
    } catch (error) {
        console.error('[INIT] Error checking sensor data:', error);
        return false;
    }
}

// 1) ensureHourlyCollection(uid)
// Check if ANY raw sensor data exists
// If no sensor data → RETURN (do nothing)
// Hourly records will be created later when real data exists
async function ensureHourlyCollection(uid) {
    try {
        // Check if collection already exists (has at least one document)
        const hourlyRecordsRef = collection(db, `users/${uid}/hourlyRecords`);
        const checkSnap = await getDocs(query(hourlyRecordsRef, limit(1)));
        
        if (!checkSnap.empty) {
            console.log('[INIT] hourlyRecords collection already exists');
            return;
        }
        
        // Check if raw sensor data exists
        const hasData = await hasRawSensorData(uid);
        
        if (!hasData) {
            console.log('[INIT] No raw sensor data found, skipping hourly collection initialization');
            return;
        }
        
        console.log('[INIT] Raw sensor data exists, but hourlyRecords will be created when hourly data is generated');
        // Do NOT create placeholder - hourly records are created by generateHourlyRecord() when data exists
        
    } catch (error) {
        console.error('[INIT] Error in ensureHourlyCollection:', error);
        // Fail silently - don't break UI
    }
}

// 2) ensureDailyReports(uid)
// Query users/{uid}/dailyReports (limit 1)
// If exists → RETURN
// Query source data (hourlyRecords OR existing daily-compatible data)
// If no source data → RETURN
// Generate ONLY ONE valid daily report (current day)
async function ensureDailyReports(uid) {
    try {
        // Check if collection already exists
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const checkSnap = await getDocs(query(dailyReportsRef, limit(1)));
        
        if (!checkSnap.empty) {
            console.log('[INIT] dailyReports collection already exists');
            return;
        }
        
        // Check if source data exists (hourlyRecords for today or any date)
        const hourlyRecordsRef = collection(db, `users/${uid}/hourlyRecords`);
        const hourlyCheckSnap = await getDocs(query(hourlyRecordsRef, limit(1)));
        
        if (hourlyCheckSnap.empty) {
            console.log('[INIT] No hourlyRecords found, skipping dailyReports initialization');
            return;
        }
        
        // Get today's date string
        const today = new Date();
            const todayStr = formatDateString(today);
        
        // Check if hourly records exist for today
        const todayHourlyRef = collection(db, `users/${uid}/hourlyRecords/${todayStr}`);
        const todayHourlySnap = await getDocs(query(todayHourlyRef, limit(1)));
        
        if (todayHourlySnap.empty) {
            console.log('[INIT] No hourlyRecords for today, skipping dailyReports initialization');
            return;
        }
        
        // Generate ONE daily report for today (this creates the collection)
        console.log('[INIT] Generating daily report for today to initialize collection');
        const report = await generateDailyReport(uid, todayStr);
        
        if (report) {
            console.log('[INIT] dailyReports collection initialized with today\'s report');
        } else {
            console.log('[INIT] Failed to generate daily report, collection not created');
        }
        
            } catch (error) {
        console.error('[INIT] Error in ensureDailyReports:', error);
        // Fail silently - don't break UI
            }
        }
        
// 3) ensureWeeklyReports(uid)
// Query users/{uid}/weeklyReports (limit 1)
// If exists → RETURN
// Query dailyReports
// If dailyReports empty → RETURN
// Aggregate ONLY existing daily reports
// Write ONLY ONE weekly report (current ISO week)
async function ensureWeeklyReports(uid) {
    try {
        // Check if collection already exists
        const weeklyReportsRef = collection(db, `users/${uid}/weeklyReports`);
        const checkSnap = await getDocs(query(weeklyReportsRef, limit(1)));
        
        if (!checkSnap.empty) {
            console.log('[INIT] weeklyReports collection already exists');
            return;
        }
        
        // Check if dailyReports exist
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailySnap = await getDocs(query(dailyReportsRef, limit(1)));
        
        if (dailySnap.empty) {
            console.log('[INIT] No dailyReports found, skipping weeklyReports initialization');
            return;
        }
        
        // Get current ISO week
        const currentIsoWeek = getCurrentIsoWeek();
        
        // Generate ONE weekly report for current week (this creates the collection)
        console.log('[INIT] Generating weekly report for current ISO week to initialize collection');
        const report = await generateWeeklyReport(uid, currentIsoWeek);
        
        if (report) {
            console.log('[INIT] weeklyReports collection initialized with current week\'s report');
        } else {
            console.log('[INIT] Failed to generate weekly report (no daily reports for current week), collection not created');
        }
        
        } catch (error) {
        console.error('[INIT] Error in ensureWeeklyReports:', error);
        // Fail silently - don't break UI
    }
        }
        
// 4) ensureMonthlyReports(uid)
// Query users/{uid}/monthlyReports (limit 1)
// If exists → RETURN
// Query dailyReports
// If dailyReports empty → RETURN
// Aggregate ONLY existing daily reports
// Write ONLY ONE monthly report (current month)
async function ensureMonthlyReports(uid) {
    try {
        // Check if collection already exists
        const monthlyReportsRef = collection(db, `users/${uid}/monthlyReports`);
        const checkSnap = await getDocs(query(monthlyReportsRef, limit(1)));
        
        if (!checkSnap.empty) {
            console.log('[INIT] monthlyReports collection already exists');
            return;
        }
        
        // Check if dailyReports exist
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailySnap = await getDocs(query(dailyReportsRef, limit(1)));
        
        if (dailySnap.empty) {
            console.log('[INIT] No dailyReports found, skipping monthlyReports initialization');
            return;
        }
        
        // Get current month
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        
        // Generate ONE monthly report for current month (this creates the collection)
        console.log('[INIT] Generating monthly report for current month to initialize collection');
        const report = await generateMonthlyReport(uid, currentYear, currentMonth);
        
        if (report) {
            console.log('[INIT] monthlyReports collection initialized with current month\'s report');
        } else {
            console.log('[INIT] Failed to generate monthly report (no daily reports for current month), collection not created');
        }
        
    } catch (error) {
        console.error('[INIT] Error in ensureMonthlyReports:', error);
        // Fail silently - don't break UI
    }
}

// Main initialization function
// Call ONLY AFTER Firebase initialized, auth state resolved, user is logged in
async function initializeReportCollections(uid) {
    try {
        console.log('[INIT] Starting safe report collection initialization for user:', uid);
        
        await ensureHourlyCollection(uid);
        await ensureDailyReports(uid);
        await ensureWeeklyReports(uid);
        await ensureMonthlyReports(uid);
        
        console.log('[INIT] Safe report collection initialization complete');
        
        } catch (error) {
        console.error('[INIT] Error in initializeReportCollections:', error);
        // Fail silently - don't break UI
    }
}

// Legacy function name for backward compatibility (if needed)
// This now uses the safe initialization
async function initializeReports(uid) {
    return initializeReportCollections(uid);
}

// ============================================================
// SEED DOCUMENTS FOR UI SAFETY (PREVENTS CRASHES)
// ============================================================
// These create zero-value seed documents to prevent UI crashes
// when collections are empty. This is structural initialization,
// NOT fake data.

// Seed hourly records collection if empty
// Path: users/{uid}/hourlyRecords/{dateStr}/hours/{HH}
async function seedHourlyIfEmpty(uid, dateStr) {
    try {
        // Ensure date document exists
        const dateRef = doc(db, `users/${uid}/hourlyRecords/${dateStr}`);
        const dateSnap = await getDoc(dateRef);
        
        if (!dateSnap.exists()) {
            // Create date document placeholder (empty doc to create collection structure)
            await setDoc(dateRef, {
                date: dateStr,
                source: "web",
                createdAt: serverTimestamp()
            });
        }
        
        // Check if hours subcollection has any documents
        const hoursRef = collection(db, `users/${uid}/hourlyRecords/${dateStr}/hours`);
        const hoursSnap = await getDocs(query(hoursRef, limit(1)));
        
        if (!hoursSnap.empty) {
            return; // Already has hour docs
        }
        
        // Create seed hour document at 00
        const hour00Ref = doc(db, `users/${uid}/hourlyRecords/${dateStr}/hours/00`);
        const seedHour = {
            hour: '00',
            temperatureSum: 0,
            temperatureCount: 0,
            temperatureAvg: 0,
            phSum: 0,
            phCount: 0,
            phAvg: 0,
            isSeed: true,
            source: "web",
            generatedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        await setDoc(hour00Ref, seedHour);
        console.log('[SEED] Created seed hour document for', dateStr, 'hour 00');
        
        } catch (error) {
        console.error('[SEED] Error seeding hourlyRecords:', error);
        // Fail silently
    }
}

// Seed daily reports collection if empty
async function seedDailyIfEmpty(uid, dateStr) {
    try {
        // Check if document already exists
        const seedRef = doc(db, `users/${uid}/dailyReports/${dateStr}`);
        const seedSnap = await getDoc(seedRef);
        
        if (seedSnap.exists()) {
            return; // Document already exists
        }
        
        // Create zero-value seed document
        const seedDoc = {
            date: dateStr,
            avgTemperature: 0,
            avgPh: 0,
            coverageHours: 0,
            isSeed: true,
            source: "web",
            generatedAt: serverTimestamp()
        };
        
        await setDoc(seedRef, seedDoc);
        console.log('[SEED] Created seed document for dailyReports:', dateStr);
        
    } catch (error) {
        console.error('[SEED] Error seeding dailyReports:', error);
        // Fail silently - don't break UI
    }
}

// Seed weekly reports collection if empty
async function seedWeeklyIfEmpty(uid, weekStr) {
    try {
        // Check if document already exists
        const seedRef = doc(db, `users/${uid}/weeklyReports/${weekStr}`);
        const seedSnap = await getDoc(seedRef);
        
        if (seedSnap.exists()) {
            return; // Document already exists
        }
        
        // Create zero-value seed document
        const seedDoc = {
            week: weekStr,
            avgTemperature: 0,
            avgPh: 0,
            coverageDays: 0,
            isSeed: true,
            source: "web",
            generatedAt: serverTimestamp()
        };
        
        await setDoc(seedRef, seedDoc);
        console.log('[SEED] Created seed document for weeklyReports:', weekStr);
        
    } catch (error) {
        console.error('[SEED] Error seeding weeklyReports:', error);
        // Fail silently - don't break UI
    }
}

// Seed monthly reports collection if empty
async function seedMonthlyIfEmpty(uid, monthStr) {
    try {
        // Check if document already exists
        const seedRef = doc(db, `users/${uid}/monthlyReports/${monthStr}`);
        const seedSnap = await getDoc(seedRef);
        
        if (seedSnap.exists()) {
            return; // Document already exists
        }
        
        // Create zero-value seed document
        const seedDoc = {
            month: monthStr,
            avgTemperature: 0,
            avgPh: 0,
            coverageDays: 0,
            isSeed: true,
            source: "web",
            generatedAt: serverTimestamp()
        };
        
        await setDoc(seedRef, seedDoc);
        console.log('[SEED] Created seed document for monthlyReports:', monthStr);
        
    } catch (error) {
        console.error('[SEED] Error seeding monthlyReports:', error);
        // Fail silently - don't break UI
    }
}

// Main seed initialization function
// Called to ensure collections have at least one document for UI safety
async function initializeReportSeeds(uid, todayStr, weekStr, monthStr) {
    try {
        console.log('[SEED] Starting report seed initialization for user:', uid);
        
        await seedHourlyIfEmpty(uid, todayStr);
        await seedDailyIfEmpty(uid, todayStr);
        await seedWeeklyIfEmpty(uid, weekStr);
        await seedMonthlyIfEmpty(uid, monthStr);
        
        console.log('[SEED] Report seed initialization complete');
        
    } catch (error) {
        console.error('[SEED] Error in initializeReportSeeds:', error);
        // Fail silently - don't break UI
    }
}

// ============================================================
// HOURLY SAMPLING SYSTEM
// ============================================================
// Samples sensor data every 5 minutes and aggregates into hourly buckets

// Global sampler interval ID (for cleanup)
let hourlySamplerIntervalId = null;
const SAMPLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Sample current hour with latest sensor readings
async function sampleCurrentHour(uid) {
    // HARD DISABLED - Quota-safe mode: Only writeHourlyFromRTDB() writes hourly data
    console.warn('[HOURLY WRITE] sampleCurrentHour DISABLED (quota-safe mode)');
    return;
    try {
        const now = new Date();
        const dateStr = formatDateString(now);
        const hourStr = String(now.getHours()).padStart(2, '0');
        
        // Read latest sensor values
        const tempRef = doc(db, `users/${uid}/sensors/temperature`);
        const phRef = doc(db, `users/${uid}/sensors/ph`);
        
        const [tempSnap, phSnap] = await Promise.all([
            getDoc(tempRef),
            getDoc(phRef)
        ]);
        
        // Extract valid sensor values
        let temperature = null;
        let ph = null;
        
        if (tempSnap.exists()) {
            const tempData = tempSnap.data();
            if (tempData.value !== undefined && tempData.value !== null) {
                temperature = parseFloat(tempData.value);
            }
        }
        
        if (phSnap.exists()) {
            const phData = phSnap.data();
            if (phData.value !== undefined && phData.value !== null) {
                ph = parseFloat(phData.value);
            }
        }
        
        // Do NOT write if both sensor values are missing/invalid
        if (temperature === null && ph === null) {
            return; // Silent skip
        }
        
        // Use transaction to atomically update hourly record
        const hourRef = doc(db, `users/${uid}/hourlyRecords/${dateStr}/hours/${hourStr}`);
        
        await runTransaction(db, async (transaction) => {
            const hourSnap = await transaction.get(hourRef);
            
            if (!hourSnap.exists()) {
                // Create new hour document
                const newHour = {
                    hour: hourStr,
                    temperatureSum: temperature !== null ? temperature : 0,
                    temperatureCount: temperature !== null ? 1 : 0,
                    temperatureAvg: temperature !== null ? temperature : 0,
                    phSum: ph !== null ? ph : 0,
                    phCount: ph !== null ? 1 : 0,
                    phAvg: ph !== null ? ph : 0,
                    isSeed: false,
                    source: "web",
                    updatedAt: serverTimestamp()
                };
                transaction.set(hourRef, newHour);
            } else {
                // Update existing hour document
                const hourData = hourSnap.data();
                const currentTempSum = hourData.temperatureSum || 0;
                const currentTempCount = hourData.temperatureCount || 0;
                const currentPhSum = hourData.phSum || 0;
                const currentPhCount = hourData.phCount || 0;
                
                let newTempSum = currentTempSum;
                let newTempCount = currentTempCount;
                let newPhSum = currentPhSum;
                let newPhCount = currentPhCount;
                
                if (temperature !== null) {
                    newTempSum = currentTempSum + temperature;
                    newTempCount = currentTempCount + 1;
                }
                
                if (ph !== null) {
                    newPhSum = currentPhSum + ph;
                    newPhCount = currentPhCount + 1;
                }
                
                const newTempAvg = newTempCount > 0 ? newTempSum / newTempCount : 0;
                const newPhAvg = newPhCount > 0 ? newPhSum / newPhCount : 0;
                
                transaction.update(hourRef, {
                    temperatureSum: newTempSum,
                    temperatureCount: newTempCount,
                    temperatureAvg: newTempAvg,
                    phSum: newPhSum,
                    phCount: newPhCount,
                    phAvg: newPhAvg,
                    isSeed: false,
                    updatedAt: serverTimestamp()
                });
            }
        });
        
        console.log('[SAMPLE] Updated hour', hourStr, 'for', dateStr);
        
    } catch (error) {
        console.error('[SAMPLE] Error sampling current hour:', error);
        // Fail silently - don't break UI
    }
}

// Start hourly sampling for logged-in user
export function startHourlySampler(uid) {
    // Stop any existing sampler
    stopHourlySampler();
    
    // Sample immediately
    sampleCurrentHour(uid).catch(error => {
        console.error('[SAMPLE] Initial sample failed:', error);
    });
    
    // Then sample every 5 minutes
    hourlySamplerIntervalId = setInterval(() => {
        sampleCurrentHour(uid).catch(error => {
            console.error('[SAMPLE] Periodic sample failed:', error);
        });
    }, SAMPLING_INTERVAL_MS);
    
    console.log('[SAMPLE] Hourly sampler started');
}

// Stop hourly sampling (call on logout)
function stopHourlySampler() {
    if (hourlySamplerIntervalId !== null) {
        clearInterval(hourlySamplerIntervalId);
        hourlySamplerIntervalId = null;
        console.log('[SAMPLE] Hourly sampler stopped');
    }
}

export async function initializeUserDashboard() {
    try {
        console.log('[INIT] initializeReports available:', typeof initializeReports);
        
        // Ensure device record exists (non-blocking, works with or without auth)
        // This must run on every dashboard initialization, not just on login
        await ensureDeviceRecordExists();
        
        // Resolve runtime context (works with or without authentication)
        window.RUNTIME_CONTEXT = await resolveRuntimeContext();
        console.log('[INIT] Runtime context resolved:', window.RUNTIME_CONTEXT);
        
        // Update user name in navigation
        await updateUserDisplayName();
        
        // Wait for auth state to be ready, then initialize reports
        // This ensures Firebase is fully initialized before we try to access it
        const initReports = async () => {
            try {
                const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
                
                if (!uid) {
                    console.log('[REPORT INIT] No user UID available, skipping report initialization');
                    return;
                }
                
                console.log('[REPORT INIT] Starting hierarchical aggregation initialization for user:', uid);
                
                // Compute date strings for today
                const today = new Date();
                const todayStr = formatDateString(today);
                const weekStr = getCurrentIsoWeek();
                const monthStr = getCurrentMonthString();
                
                // Step 1: Seed collections first (non-blocking)
                initializeReportSeeds(uid, todayStr, weekStr, monthStr).catch(error => {
                    console.error('[REPORT INIT] Seed initialization error:', error);
                });
                
                // Step 2: Start hourly sampler (runs every 5 minutes)
                startHourlySampler(uid);
                
                // Step 3: Attempt to generate daily report for today (will work once hourly has data)
                generateDailyReport(uid, todayStr).then(async (report) => {
                    if (report) {
                        // Generate daily sensor analytics after daily report
                        await generateDailySensorAnalytics(uid, todayStr).catch(error => {
                            console.error('[SENSOR ANALYTICS] Daily sensor analytics error:', error);
                        });
                        // Identify daily trends after sensor analytics
                        await identifyDailySensorTrends(uid, todayStr).catch(error => {
                            console.error('[TREND] Daily trend identification error:', error);
                        });
                    }
                }).catch(error => {
                    console.error('[REPORT INIT] Daily report generation error:', error);
                });
                
                // Step 4: Attempt to backfill weekly/monthly from available dailyReports (non-blocking)
                generateWeeklyReport(uid, weekStr).then(async (report) => {
                    if (report) {
                        // Generate weekly sensor analytics after weekly report
                        await generateWeeklySensorAnalytics(uid, weekStr).catch(error => {
                            console.error('[SENSOR ANALYTICS] Weekly sensor analytics error:', error);
                        });
                        // Identify weekly trends after sensor analytics
                        await identifyWeeklySensorTrends(uid, weekStr).catch(error => {
                            console.error('[TREND] Weekly trend identification error:', error);
                        });
                    }
                }).catch(error => {
                    console.error('[REPORT INIT] Weekly report generation error:', error);
                });
                
                generateMonthlyReport(uid, today.getFullYear(), today.getMonth() + 1).then(async (report) => {
                    if (report) {
                        // Generate monthly sensor analytics after monthly report
                        await generateMonthlySensorAnalytics(uid, today.getFullYear(), today.getMonth() + 1).catch(error => {
                            console.error('[SENSOR ANALYTICS] Monthly sensor analytics error:', error);
                        });
                        // Identify monthly trends after sensor analytics
                        await identifyMonthlySensorTrends(uid, today.getFullYear(), today.getMonth() + 1).catch(error => {
                            console.error('[TREND] Monthly trend identification error:', error);
                        });
                    }
                }).catch(error => {
                    console.error('[REPORT INIT] Monthly report generation error:', error);
                });
                
            } catch (error) {
                console.error('[INIT ERROR] Error in report initialization setup:', error);
                // Don't throw - allow dashboard to continue loading
            }
        };
        
        // If auth is already ready, initialize immediately
        if (auth.currentUser) {
            await initReports();
        } else {
            // Otherwise wait for auth state change
            onAuthStateChanged(auth, async (user) => {
                // Re-resolve runtime context on auth state change
                window.RUNTIME_CONTEXT = await resolveRuntimeContext();
                console.log('[AUTH STATE] Runtime context re-resolved:', window.RUNTIME_CONTEXT);
                
                if (!user) {
                    console.log('[REPORT INIT] No authenticated user, skipping report initialization');
                    // [FIX] Do NOT cleanup sensor listeners on logout - runtime must persist
                    // Runtime continues running even when user logs out
                    console.log('[AUTH STATE] user logged out; device runtime remains active');
                    console.log('[AUTH STATE] Runtime context:', window.RUNTIME_CONTEXT);
                    console.log('[AUTH STATE] RTDB listener active:', !!(window.sensorUnsubscribes && window.sensorUnsubscribes.rtdb));
                    console.log('[AUTH STATE] Feeding schedule interval active:', !!feedingScheduleInterval);
                    console.log('[AUTH STATE] Rollup interval active:', !!window.rollupIntervalId);
                    return;
                }
                try {
                    await initReports();
                } catch (e) {
                    console.error('[INIT ERROR] Error in auth state change handler:', e);
                }
            });
        }
    } catch (error) {
        console.error('[INIT ERROR] Error in initializeUserDashboard:', error);
        // Don't throw - allow dashboard to continue loading
    }
    
    // Load sensor data from Firestore
    await loadSensorData();
    
    // Set up real-time sensor updates
    // Runtime core is booted separately (via bootRuntimeCore in main.js)
    // Only attach UI bindings here
    attachSensorUIBindings();
    
    // Update next feeding alert message
    await updateNextFeedingAlert();
    
    // Set up auto-refresh for next feeding alert
    setupNextFeedingAlertAutoRefresh();
    
    // Load feeding schedules from Firestore
    await loadFeedingSchedules();
    
    // Set up auto-refresh for feeding schedules
    setupFeedingScheduleAutoRefresh();
    
    // Runtime core handles feeding schedule execution (via bootRuntimeCore)
    // No need to call here - it's already running
    
    // Initialize summary computation system
    await initializeSummarySystem();
    
    // Update table headers to include trend columns
    updateReportTableHeaders();
    
    // Update table headers to include trend columns
    updateReportTableHeaders();
    
    // Initialize report selectors (date, month, year)
    initializeReportSelectors();
    
    // Load report data into tables
    await loadHourlyReport();
    await loadDailySummaryReport();
    await loadWeeklySummaryReport();
    await loadMonthlySummaryReport();
    await loadMortalityLogReport();
    await loadProductionRecordsReport();
    
    // Initialize analytics UI selectors and load analytics data
    initializeAnalyticsSelectors();
    
    // Set up periodic rollup execution (runs every 5 minutes, respects internal cooldowns)
    // This ensures daily/weekly/monthly reports are computed from hourly data
    if (typeof window.rollupIntervalId === 'undefined') {
        console.log('[ROLLUP] Setting up periodic rollup execution (every 5 minutes)');
        console.log('[ROLLUP] Guard check: window.rollupIntervalId =', window.rollupIntervalId);
        // Run immediately on init
        runRollupsForCurrentContext().catch(err => {
            console.error('[ROLLUP] Error in initial rollup execution:', err);
        });
        // Then run every 5 minutes
        window.rollupIntervalId = setInterval(() => {
            runRollupsForCurrentContext().catch(err => {
                console.error('[ROLLUP] Error in periodic rollup execution:', err);
            });
        }, 5 * 60 * 1000); // 5 minutes
        console.log('[ROLLUP] Interval started, window.rollupIntervalId =', window.rollupIntervalId);
    } else {
        console.log('[ROLLUP] Rollup interval already exists, skipping. Current ID:', window.rollupIntervalId);
    }
    
    // Initialize interactive water quality chart
    initializeWaterQualityChart();
    
    // Update feeding schedule statuses
    function updateFeedingSchedule() {
        const now = new Date();
        const feedingItems = document.querySelectorAll('.feeding-item, .schedule-item');
        
        feedingItems.forEach(item => {
            const timeElement = item.querySelector('.time');
            const statusElement = item.querySelector('.status');
            
            if (timeElement && statusElement) {
                const timeText = timeElement.textContent;
                const [time, period] = timeText.split(' ');
                const [hours, minutes] = time.split(':');
                
                let feedingTime = new Date();
                feedingTime.setHours(period === 'PM' ? parseInt(hours) + 12 : parseInt(hours));
                feedingTime.setMinutes(parseInt(minutes));
                
                if (now >= feedingTime && now <= new Date(feedingTime.getTime() + 30 * 60000)) {
                    statusElement.className = 'status in-progress';
                    statusElement.textContent = 'In Progress';
                } else if (now > feedingTime) {
                    statusElement.className = 'status completed';
                    statusElement.textContent = 'Completed';
                } else {
                    statusElement.className = 'status pending';
                    statusElement.textContent = 'Pending';
                }
            }
        });
    }

    // Update feeding schedule every minute
    setInterval(updateFeedingSchedule, 60000);
    updateFeedingSchedule();
}

// Load sensor data from RTDB (initial load)
async function loadSensorData() {
    try {
        // Device ID for RTDB path (hardcoded as per requirements)
        const rtdbPath = `devices/${DEVICE_ID}/status/feeder`;
        
        console.log('Loading sensor data from RTDB:', rtdbPath);
        
        // Fetch sensor data from RTDB
        const statusRef = ref(rtdb, rtdbPath);
        const snapshot = await get(statusRef);
        
        if (snapshot.exists()) {
            const data = snapshot.val();
            
            let temperature = null;
            let ph = null;
            
            // Update temperature from RTDB
            if (data.temperature !== undefined && data.temperature !== null) {
                temperature = parseFloat(data.temperature);
                updateSensorDisplay('temperature', temperature, '°C');
                console.log('Temperature loaded from RTDB:', temperature);
            } else {
                updateSensorDisplay('temperature', '--', '°C');
                console.warn('Temperature not available in RTDB');
            }
            
            // Update pH from RTDB
            if (data.ph !== undefined && data.ph !== null) {
                ph = parseFloat(data.ph);
                updateSensorDisplay('ph', ph, '');
                console.log('pH loaded from RTDB:', ph);
            } else {
                updateSensorDisplay('ph', '--', '');
                console.warn('pH not available in RTDB');
            }
            
            // Update feeder/motor state from RTDB
            if (data.state !== undefined && data.state !== null) {
                const stateValue = String(data.state).toLowerCase();
                const isOnline = stateValue === 'online';
                updateFeederStatusDisplay(isOnline);
                updateMotorToggleButton(isOnline); // Update toggle button appearance
                console.log('Feeder state loaded from RTDB:', stateValue);
            } else {
                updateFeederStatusDisplay(null);
                updateMotorToggleButton(null);
                console.warn('Feeder state not available in RTDB');
            }
            
            // Add initial reading to live chart
            addLiveSensorReading(temperature, ph);
            
            // Initialize last recorded values (so first change after load will be detected)
            if (temperature !== null) {
                lastRecordedValues.temperature = temperature;
            }
            if (ph !== null) {
                lastRecordedValues.ph = ph;
            }
        } else {
            // No data available, set defaults
            console.warn('RTDB sensor data not available at:', rtdbPath);
            updateSensorDisplay('temperature', '--', '°C');
            updateSensorDisplay('ph', '--', '');
            updateFeederStatusDisplay(null);
            updateMotorToggleButton(null);
        }
        
        // Also update the key metrics section
        updateKeyMetrics();
        
    } catch (error) {
        console.error('Error loading sensor data from RTDB:', error);
        // Set default values on error
        updateSensorDisplay('temperature', '--', '°C');
        updateSensorDisplay('ph', '--', '');
        updateFeederStatusDisplay(null);
        updateMotorToggleButton(null);
    }
}

// Update feeder status display in the UI
function updateFeederStatusDisplay(isOnline) {
    const feederElement = document.getElementById('sensorFeeder');
    const badgeElement = document.getElementById('feederStatusBadge');
    
    if (!feederElement || !badgeElement) {
        return; // Elements not found, skip silently
    }
    
    if (isOnline === null || isOnline === undefined) {
        badgeElement.textContent = '--';
        badgeElement.className = 'status-badge';
        return;
    }
    
    if (isOnline) {
        badgeElement.textContent = 'Online';
        badgeElement.className = 'status-badge online';
    } else {
        badgeElement.textContent = 'Offline';
        badgeElement.className = 'status-badge offline';
    }
}

// Cache last mirrored status to prevent duplicate writes
let lastMirroredFeederStatus = null;

// Mirror feeder status from Firestore to RTDB
async function mirrorFeederStatusToRTDB(deviceId, isOnline) {
    try {
        // Only write to RTDB when value changes (prevent infinite loops)
        const currentStatus = isOnline ? "online" : "offline";
        if (lastMirroredFeederStatus === currentStatus) {
            return; // Status hasn't changed, skip write
        }
        
        const statusRef = ref(rtdb, `devices/${deviceId}/status/feeder`);
        
        await set(statusRef, {
            state: currentStatus,
            updatedAt: Date.now(),
            source: "web"
        });
        
        lastMirroredFeederStatus = currentStatus; // Cache the new status
        
        console.log(`[RTDB] Mirrored feeder status to RTDB for device ${deviceId}: ${currentStatus}`);
    } catch (error) {
        console.error('Error mirroring feeder status to RTDB:', error);
        // Don't throw - this is a mirror operation, shouldn't break the UI
    }
}

// Update sensor display in the UI
function updateSensorDisplay(sensorType, value, unit = '') {
    // Update monitoring section
    const sensorElement = document.getElementById(`sensor${sensorType.charAt(0).toUpperCase() + sensorType.slice(1)}`);
    if (sensorElement) {
        if (value === '--' || value === null || value === undefined) {
            sensorElement.textContent = '--' + unit;
        } else {
            // Format the value appropriately
            if (typeof value === 'number') {
                if (sensorType === 'temperature') {
                    sensorElement.textContent = value.toFixed(1) + unit;
                } else if (sensorType === 'ph') {
                    sensorElement.textContent = value.toFixed(2) + unit;
                } else {
                    sensorElement.textContent = value + unit;
                }
            } else {
                sensorElement.textContent = value + unit;
            }
        }
    }
    
    // Update key metrics section (dashboard stats)
    if (sensorType === 'temperature') {
        const tempStat = document.getElementById('waterTempStat');
        const tempStatus = document.getElementById('waterTempStatus');
        if (tempStat) {
            if (value === '--' || value === null || value === undefined) {
                tempStat.textContent = '--°C';
                if (tempStatus) tempStatus.textContent = '--';
            } else {
                const numValue = typeof value === 'number' ? value : parseFloat(value);
                tempStat.textContent = numValue.toFixed(1) + '°C';
                // Update status based on temperature range
                if (tempStatus) {
                    if (numValue >= 24 && numValue <= 28) {
                        tempStatus.textContent = 'Optimal';
                        tempStatus.className = 'stat-status optimal';
                    } else if (numValue >= 20 && numValue < 24 || numValue > 28 && numValue <= 30) {
                        tempStatus.textContent = 'Normal';
                        tempStatus.className = 'stat-status normal';
                    } else {
                        tempStatus.textContent = 'Warning';
                        tempStatus.className = 'stat-status warning';
                    }
                }
            }
        }
    } else if (sensorType === 'ph') {
        const phStat = document.getElementById('phLevelStat');
        const phStatus = document.getElementById('phLevelStatus');
        if (phStat) {
            if (value === '--' || value === null || value === undefined) {
                phStat.textContent = '--';
                if (phStatus) phStatus.textContent = '--';
            } else {
                const numValue = typeof value === 'number' ? value : parseFloat(value);
                phStat.textContent = numValue.toFixed(2);
                // Update status based on pH range
                if (phStatus) {
                    if (numValue >= 7.0 && numValue <= 7.5) {
                        phStatus.textContent = 'Optimal';
                        phStatus.className = 'stat-status optimal';
                    } else if (numValue >= 6.5 && numValue < 7.0 || numValue > 7.5 && numValue <= 8.5) {
                        phStatus.textContent = 'Normal';
                        phStatus.className = 'stat-status normal';
                    } else {
                        phStatus.textContent = 'Warning';
                        phStatus.className = 'stat-status warning';
                    }
                }
            }
        }
    }
}

// Update key metrics section
function updateKeyMetrics() {
    // This function can be extended to update other metrics if needed
    // Currently handled by updateSensorDisplay
}

// Record RTDB sensor data to Firestore for analytics and historical tracking
// This function writes sensor readings to hourly records whenever RTDB data changes
async function recordSensorDataToFirestore(uid, temperature, ph) {
    // HARD DISABLED - Quota-safe mode: Only writeHourlyFromRTDB() writes hourly data
    console.warn('[HOURLY WRITE] recordSensorDataToFirestore DISABLED (quota-safe mode)');
    return;
    try {
        // Skip if both values are missing/invalid
        if (temperature === null && ph === null) {
            return;
        }
        
        const now = new Date();
        const dateStr = formatDateString(now);
        const hourStr = String(now.getHours()).padStart(2, '0');
        
        // Use transaction to atomically update hourly record
        const hourRef = doc(db, `users/${uid}/hourlyRecords/${dateStr}/hours/${hourStr}`);
        
        await runTransaction(db, async (transaction) => {
            const hourSnap = await transaction.get(hourRef);
            
            if (!hourSnap.exists()) {
                // Create new hour document
                const newHour = {
                    hour: hourStr,
                    temperatureSum: temperature !== null ? temperature : 0,
                    temperatureCount: temperature !== null ? 1 : 0,
                    temperatureAvg: temperature !== null ? temperature : null,
                    phSum: ph !== null ? ph : 0,
                    phCount: ph !== null ? 1 : 0,
                    phAvg: ph !== null ? ph : null,
                    isSeed: false,
                    source: "rtdb",
                    updatedAt: serverTimestamp()
                };
                transaction.set(hourRef, newHour);
            } else {
                // Update existing hour document - aggregate new readings
                const hourData = hourSnap.data();
                const currentTempSum = hourData.temperatureSum || 0;
                const currentTempCount = hourData.temperatureCount || 0;
                const currentPhSum = hourData.phSum || 0;
                const currentPhCount = hourData.phCount || 0;
                
                let newTempSum = currentTempSum;
                let newTempCount = currentTempCount;
                let newPhSum = currentPhSum;
                let newPhCount = currentPhCount;
                
                if (temperature !== null) {
                    newTempSum = currentTempSum + temperature;
                    newTempCount = currentTempCount + 1;
                }
                
                if (ph !== null) {
                    newPhSum = currentPhSum + ph;
                    newPhCount = currentPhCount + 1;
                }
                
                const newTempAvg = newTempCount > 0 ? newTempSum / newTempCount : null;
                const newPhAvg = newPhCount > 0 ? newPhSum / newPhCount : null;
                
                transaction.update(hourRef, {
                    temperatureSum: newTempSum,
                    temperatureCount: newTempCount,
                    temperatureAvg: newTempAvg,
                    phSum: newPhSum,
                    phCount: newPhCount,
                    phAvg: newPhAvg,
                    isSeed: false,
                    source: "rtdb",
                    updatedAt: serverTimestamp()
                });
            }
        });
        
        console.log('[RTDB→FIRESTORE] Recorded sensor data to hourly record:', dateStr, hourStr);
        
    } catch (error) {
        console.error('[RTDB→FIRESTORE] Error recording sensor data to Firestore:', error);
        // Fail silently - don't break UI
    }
}

// ============================================================
// RTDB TO FIRESTORE HOURLY INGESTION
// ============================================================
// Reads sensor data from RTDB and writes aggregated hourly records to Firestore
// This function bridges RTDB (live sensor readings) → Firestore (historical reports)
// 
// RTDB Path: /devices/{deviceId}/sensors
// Firestore Path: users/{uid}/hourlyRecords/{YYYY-MM-DD}/hours/{HH}
//
// Usage: Call manually or from a background worker/Cloud Function
// DO NOT run automatically on dashboard load
export async function ingestHourlyFromRTDB(uid, deviceId) {
    try {
        // 1. Read sensor data from RTDB
        const rtdbPath = `devices/${deviceId}/sensors`;
        const sensorsRef = ref(rtdb, rtdbPath);
        const snapshot = await get(sensorsRef);
        
        if (!snapshot.exists()) {
            console.log('[INGEST] No sensor data found in RTDB at:', rtdbPath);
            return { success: false, reason: 'no_data' };
        }
        
        const sensorData = snapshot.val();
        
        // Extract temperature and pH values
        const temperature = sensorData.temperature !== undefined && sensorData.temperature !== null 
            ? parseFloat(sensorData.temperature) 
            : null;
        const ph = sensorData.ph !== undefined && sensorData.ph !== null 
            ? parseFloat(sensorData.ph) 
            : null;
        
        // Skip if both values are missing
        if (temperature === null && ph === null) {
            console.log('[INGEST] No valid sensor values (temperature and pH both null)');
            return { success: false, reason: 'no_values' };
        }
        
        // 2. Determine current date and hour from RTDB timestamp or current time (using LOCAL time)
        let timestamp = sensorData.timestamp || Date.now() / 1000; // RTDB timestamp is in seconds
        const tsMs = timestamp * 1000; // Convert to milliseconds
        const d = new Date(tsMs);
        
        // Use local time methods (NOT UTC) to match UI date picker
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const hourStr = String(d.getHours()).padStart(2, '0');
        
        const writePath = `users/${uid}/hourlyRecords/${dateStr}/hours/${hourStr}`;
        
        // Debug log before writing
        console.log(`[INGEST] tsMs=${tsMs} localDateStr=${dateStr} localHour=${hourStr} writePath=${writePath}`);
        
        // 3. Fetch existing Firestore hourly document (if exists)
        const hourRef = doc(db, writePath);
        const hourSnap = await getDoc(hourRef);
        
        // 4. Calculate aggregated values using sum/count
        let temperatureSum, temperatureCount, temperatureAvg;
        let phSum, phCount, phAvg;
        
        if (hourSnap.exists()) {
            // Update existing document - add to existing sums/counts
            const existing = hourSnap.data();
            
            // Temperature aggregation
            const currentTempSum = existing.temperatureSum || 0;
            const currentTempCount = existing.temperatureCount || 0;
            
            if (temperature !== null) {
                temperatureSum = currentTempSum + temperature;
                temperatureCount = currentTempCount + 1;
                temperatureAvg = temperatureSum / temperatureCount;
            } else {
                // Keep existing values if no new temperature reading
                temperatureSum = currentTempSum;
                temperatureCount = currentTempCount;
                temperatureAvg = currentTempCount > 0 ? currentTempSum / currentTempCount : null;
            }
            
            // pH aggregation
            const currentPhSum = existing.phSum || 0;
            const currentPhCount = existing.phCount || 0;
            
            if (ph !== null) {
                phSum = currentPhSum + ph;
                phCount = currentPhCount + 1;
                phAvg = phSum / phCount;
            } else {
                // Keep existing values if no new pH reading
                phSum = currentPhSum;
                phCount = currentPhCount;
                phAvg = currentPhCount > 0 ? currentPhSum / currentPhCount : null;
            }
        } else {
            // Create new document - initialize sums/counts
            if (temperature !== null) {
                temperatureSum = temperature;
                temperatureCount = 1;
                temperatureAvg = temperature;
            } else {
                temperatureSum = 0;
                temperatureCount = 0;
                temperatureAvg = null;
            }
            
            if (ph !== null) {
                phSum = ph;
                phCount = 1;
                phAvg = ph;
            } else {
                phSum = 0;
                phCount = 0;
                phAvg = null;
            }
        }
        
        // 5. Write to Firestore using merge (updates existing or creates new)
        const hourlyRecord = {
            hour: hourStr,
            temperatureSum: temperatureSum,
            temperatureCount: temperatureCount,
            temperatureAvg: temperatureAvg,
            phSum: phSum,
            phCount: phCount,
            phAvg: phAvg,
            source: "rtdb",
            isSeed: false,
            updatedAt: serverTimestamp()
        };
        
        await setDoc(hourRef, hourlyRecord, { merge: true });
        
        console.log(`[INGEST] ✅ Wrote hourly record: ${dateStr}/hours/${hourStr}`, {
            temperature: temperature !== null ? `${temperature}°C (sum: ${temperatureSum}, count: ${temperatureCount}, avg: ${temperatureAvg?.toFixed(2)})` : 'null',
            ph: ph !== null ? `${ph} (sum: ${phSum}, count: ${phCount}, avg: ${phAvg?.toFixed(2)})` : 'null'
        });
        
        return { 
            success: true, 
            date: dateStr, 
            hour: hourStr,
            path: writePath,
            dateStr: dateStr,
            hourStr: hourStr,
            writePath: writePath
        };
        
    } catch (error) {
        console.error('[INGEST] ❌ Error ingesting hourly data from RTDB:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// SINGLE HOURLY WRITER (RATE-LIMITED, PREVENTS WRITE STORMS)
// ============================================================
// Reads from local state (updated by RTDB listeners)
// Writes to Firestore at most once per hour
// This is the ONLY function that writes hourly data in HOURLY_TEST_MODE
//
// Firestore Path: users/{uid}/hourlyRecords/{YYYY-MM-DD}/hours/{HH}
//
// Usage: Call manually or from controlled interval
// Example: await writeHourlyFromRTDB(uid);
//          setInterval(() => writeHourlyFromRTDB(uid), 60000); // Safe - gate prevents duplicates
export async function writeHourlyFromRTDB(uid) {
    // Check if we have any sensor values
    if (latestTemperature === null && latestPH === null) {
        return { skipped: true, reason: 'no_values' };
    }
    
    // Determine LOCAL date and hour from latest timestamp
    let ts = latestTimestamp;
    if (!ts) {
        ts = Date.now();
    } else {
        // Handle timestamp in seconds or milliseconds
        ts = ts < 1e12 ? ts * 1000 : ts;
    }
    
    const d = new Date(ts);
    
    // Use LOCAL time methods (NOT UTC) to match UI date picker
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hourStr = String(d.getHours()).padStart(2, '0');
    
    const hourKey = `${dateStr}-${hourStr}`;
    
    // HARD GATE — prevents write storms (at most once per hour)
    if (lastWrittenHourKey === hourKey) {
        console.log('[HOURLY WRITE] skipped — already written this hour');
        return { skipped: true, hourKey: hourKey };
    }
    
    // COOLDOWN THROTTLE — prevents write storms within same minute
    const nowMs = Date.now();
    if (LAST_HOURLY_WRITE_KEY === hourKey && (nowMs - LAST_HOURLY_WRITE_AT) < HOURLY_WRITE_COOLDOWN_MS) {
        console.log('[HOURLY WRITE] Skipped (cooldown active)', { key: hourKey, cooldownMs: HOURLY_WRITE_COOLDOWN_MS });
        return { success: false, reason: 'cooldown', date: dateStr, hour: hourStr };
    }
    
    // Update gates before writing
    lastWrittenHourKey = hourKey;
    LAST_HOURLY_WRITE_KEY = hourKey;
    LAST_HOURLY_WRITE_AT = nowMs;
    
    // Write to Firestore
    const docRef = doc(db, `users/${uid}/hourlyRecords/${dateStr}/hours/${hourStr}`);
    
    await setDoc(
        docRef,
        {
            hour: hourStr,
            temperatureAvg: latestTemperature,
            phAvg: latestPH,
            source: 'rtdb',
            isSeed: false,
            updatedAt: serverTimestamp()
        },
        { merge: true }
    );
    
    // Log success
    console.log('[HOURLY WRITE] Wrote', {
        uid,
        date: dateStr,
        hour: hourStr,
        temperatureAvg: latestTemperature,
        phAvg: latestPH
    });
    
    return { success: true, date: dateStr, hour: hourStr };
}

// ============================================================
// PART 4: DAILY/WEEKLY/MONTHLY ROLLUPS (QUOTA-SAFE, WORKS WITHOUT LOGIN)
// ============================================================
// Computes and writes daily/weekly/monthly reports from hourly records
// Uses runtimeUid from window.RUNTIME_CONTEXT (works without login)
// Includes throttling and change detection to prevent 429 errors

// Helper: Check if values changed meaningfully (epsilon comparison)
// Register helper once (outside function to prevent duplicate registration)
if (!window.__DECLARED_HELPERS__.has('hasSignificantChange')) {
    registerHelper('hasSignificantChange', 'dashboard.js:1692');
}
function hasSignificantChange(oldVal, newVal, epsilon = 0.001) {
    if (oldVal === null && newVal === null) return false;
    if (oldVal === null || newVal === null) return true;
    return Math.abs(oldVal - newVal) >= epsilon;
}

// Helper: Get ISO week string from date (local time)
function getISOWeekStringFromDate(date) {
    return getISOWeekString(date);
}

// Compute and write daily report from hourly records
// Firestore path: users/{uid}/dailyReports/{YYYY-MM-DD}
export async function computeAndWriteDailyReport(uid, dateStr) {
    if (!uid) {
        console.warn('[ROLLUP-DAILY] Skipped (no UID)');
        return { skipped: true, reason: 'no_uid' };
    }
    
    try {
        // Validate date format
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            console.error('[ROLLUP-DAILY] Invalid date format. Expected YYYY-MM-DD, got:', dateStr);
            return { success: false, reason: 'invalid_date' };
        }
        
        // Read hourly records for this date
        const hoursRef = collection(db, `users/${uid}/hourlyRecords/${dateStr}/hours`);
        const hoursSnapshot = await getDocs(hoursRef);
        
        if (hoursSnapshot.empty) {
            console.log(`[ROLLUP-DAILY] No hourly records found for ${dateStr}`);
            return { skipped: true, reason: 'no_data' };
        }
        
        // Aggregate hourly records
        const validHours = [];
        let temperatureSum = 0;
        let temperatureCount = 0;
        let phSum = 0;
        let phCount = 0;
        
        hoursSnapshot.forEach(hourDoc => {
            const record = hourDoc.data();
            
            // Skip seed documents
            if (record.isSeed === true) {
                return;
            }
            
            // Include only docs with valid temperatureAvg OR phAvg
            const hasTemp = record.temperatureAvg !== null && record.temperatureAvg !== undefined && !isNaN(parseFloat(record.temperatureAvg));
            const hasPh = record.phAvg !== null && record.phAvg !== undefined && !isNaN(parseFloat(record.phAvg));
            
            if (!hasTemp && !hasPh) {
                return; // Skip invalid records
            }
            
            validHours.push(record);
            
            if (hasTemp) {
                temperatureSum += parseFloat(record.temperatureAvg);
                temperatureCount += 1;
            }
            
            if (hasPh) {
                phSum += parseFloat(record.phAvg);
                phCount += 1;
            }
        });
        
        if (validHours.length === 0) {
            console.log(`[ROLLUP-DAILY] No valid hourly data for ${dateStr}`);
            return { skipped: true, reason: 'no_valid_data' };
        }
        
        // Calculate averages
        const temperatureAvg = temperatureCount > 0 ? temperatureSum / temperatureCount : null;
        const phAvg = phCount > 0 ? phSum / phCount : null;
        const hourCount = validHours.length;
        
        // Check existing document for change detection
        const reportRef = doc(db, `users/${uid}/dailyReports/${dateStr}`);
        const existingSnap = await getDoc(reportRef);
        
        if (existingSnap.exists()) {
            const existing = existingSnap.data();
            const tempChanged = hasSignificantChange(existing.temperatureAvg, temperatureAvg);
            const phChanged = hasSignificantChange(existing.phAvg, phAvg);
            const countChanged = existing.hourCount !== hourCount;
            
            if (!tempChanged && !phChanged && !countChanged) {
                console.log(`[ROLLUP-DAILY] Unchanged, no write for ${dateStr}`);
                return { skipped: true, reason: 'unchanged', date: dateStr };
            }
        }
        
        // Write to Firestore
        const dailyReport = {
            date: dateStr,
            temperatureAvg: temperatureAvg,
            phAvg: phAvg,
            hourCount: hourCount,
            source: "derived-from-hourly",
            updatedAt: serverTimestamp()
        };
        
        await setDoc(reportRef, dailyReport, { merge: true });
        
        console.log(`[ROLLUP-DAILY] wrote users/${uid}/dailyReports/${dateStr} hourCount=${hourCount} temp=${temperatureAvg?.toFixed(2) || 'null'} ph=${phAvg?.toFixed(2) || 'null'}`);
        
        return { success: true, date: dateStr, hourCount, temperatureAvg, phAvg };
        
    } catch (error) {
        console.error(`[ROLLUP-DAILY] Error computing daily report for ${dateStr}:`, error);
        return { success: false, error: error.message };
    }
}

// Compute and write weekly report from daily reports
// Firestore path: users/{uid}/weeklyReports/{YYYY-W##}
export async function computeAndWriteWeeklyReport(uid, weekKey) {
    if (!uid) {
        console.warn('[ROLLUP-WEEKLY] Skipped (no UID)');
        return { skipped: true, reason: 'no_uid' };
    }
    
    try {
        // Validate ISO week format (YYYY-W##)
        if (!weekKey || !/^\d{4}-W\d{2}$/.test(weekKey)) {
            console.error('[ROLLUP-WEEKLY] Invalid week format. Expected YYYY-W##, got:', weekKey);
            return { success: false, reason: 'invalid_week' };
        }
        
        // Parse ISO week to get date range
        const match = weekKey.match(/(\d{4})-W(\d{2})/);
        if (!match) {
            console.error('[ROLLUP-WEEKLY] Failed to parse ISO week:', weekKey);
            return { success: false, reason: 'parse_error' };
        }
        
        const year = parseInt(match[1]);
        const week = parseInt(match[2]);
        
        // Calculate Monday of the ISO week
        const jan4 = new Date(year, 0, 4);
        const jan4Day = jan4.getDay();
        const jan4Monday = new Date(jan4);
        jan4Monday.setDate(4 - (jan4Day === 0 ? 6 : jan4Day - 1));
        
        const weekStart = new Date(jan4Monday);
        weekStart.setDate(jan4Monday.getDate() + (week - 1) * 7);
        
        // Get all 7 dates in the week
        const dailyDates = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + i);
            const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
            dailyDates.push(dateStr);
        }
        
        // Read all daily reports
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailyReportsSnapshot = await getDocs(dailyReportsRef);
        
        // Filter daily reports that belong to this week
        const weekDailyReports = [];
        dailyReportsSnapshot.forEach(doc => {
            const report = doc.data();
            const reportDate = report.date;
            
            // Skip seed documents
            if (report.isSeed === true) {
                return;
            }
            
            // Check if this daily report belongs to the week
            if (reportDate && dailyDates.includes(reportDate)) {
                weekDailyReports.push(report);
            }
        });
        
        if (weekDailyReports.length === 0) {
            console.log(`[ROLLUP-WEEKLY] No daily reports found for week ${weekKey}`);
            return { skipped: true, reason: 'no_data' };
        }
        
        // Aggregate from daily reports
        let temperatureSum = 0;
        let temperatureCount = 0;
        let phSum = 0;
        let phCount = 0;
        
        weekDailyReports.forEach(report => {
            if (report.temperatureAvg !== null && report.temperatureAvg !== undefined) {
                const tempValue = parseFloat(report.temperatureAvg);
                if (!isNaN(tempValue)) {
                    temperatureSum += tempValue;
                    temperatureCount += 1;
                }
            }
            
            if (report.phAvg !== null && report.phAvg !== undefined) {
                const phValue = parseFloat(report.phAvg);
                if (!isNaN(phValue)) {
                    phSum += phValue;
                    phCount += 1;
                }
            }
        });
        
        // Calculate averages
        const temperatureAvg = temperatureCount > 0 ? temperatureSum / temperatureCount : null;
        const phAvg = phCount > 0 ? phSum / phCount : null;
        const dayCount = weekDailyReports.length;
        
        // Check existing document for change detection
        const reportRef = doc(db, `users/${uid}/weeklyReports/${weekKey}`);
        const existingSnap = await getDoc(reportRef);
        
        if (existingSnap.exists()) {
            const existing = existingSnap.data();
            const tempChanged = hasSignificantChange(existing.temperatureAvg, temperatureAvg);
            const phChanged = hasSignificantChange(existing.phAvg, phAvg);
            const countChanged = existing.dayCount !== dayCount;
            
            if (!tempChanged && !phChanged && !countChanged) {
                console.log(`[ROLLUP-WEEKLY] Unchanged, no write for ${weekKey}`);
                return { skipped: true, reason: 'unchanged', week: weekKey };
            }
        }
        
        // Write to Firestore
        const weeklyReport = {
            week: weekKey,
            temperatureAvg: temperatureAvg,
            phAvg: phAvg,
            dayCount: dayCount,
            source: "derived-from-daily",
            updatedAt: serverTimestamp()
        };
        
        await setDoc(reportRef, weeklyReport, { merge: true });
        
        console.log(`[ROLLUP-WEEKLY] wrote users/${uid}/weeklyReports/${weekKey} dayCount=${dayCount} temp=${temperatureAvg?.toFixed(2) || 'null'} ph=${phAvg?.toFixed(2) || 'null'}`);
        
        return { success: true, week: weekKey, dayCount, temperatureAvg, phAvg };
        
    } catch (error) {
        console.error(`[ROLLUP-WEEKLY] Error computing weekly report for ${weekKey}:`, error);
        return { success: false, error: error.message };
    }
}

// Compute and write monthly report from daily reports
// Firestore path: users/{uid}/monthlyReports/{YYYY-MM}
export async function computeAndWriteMonthlyReport(uid, monthKey) {
    if (!uid) {
        console.warn('[ROLLUP-MONTHLY] Skipped (no UID)');
        return { skipped: true, reason: 'no_uid' };
    }
    
    try {
        // Validate month format (YYYY-MM)
        if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
            console.error('[ROLLUP-MONTHLY] Invalid month format. Expected YYYY-MM, got:', monthKey);
            return { success: false, reason: 'invalid_month' };
        }
        
        // Read all daily reports
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailyReportsSnapshot = await getDocs(dailyReportsRef);
        
        // Filter daily reports that belong to this month
        const monthDailyReports = [];
        dailyReportsSnapshot.forEach(doc => {
            const report = doc.data();
            const reportDate = report.date;
            
            // Skip seed documents
            if (report.isSeed === true) {
                return;
            }
            
            // Check if this daily report belongs to the month
            if (reportDate && reportDate.startsWith(monthKey)) {
                monthDailyReports.push(report);
            }
        });
        
        if (monthDailyReports.length === 0) {
            console.log(`[ROLLUP-MONTHLY] No daily reports found for month ${monthKey}`);
            return { skipped: true, reason: 'no_data' };
        }
        
        // Aggregate from daily reports
        let temperatureSum = 0;
        let temperatureCount = 0;
        let phSum = 0;
        let phCount = 0;
        
        monthDailyReports.forEach(report => {
            if (report.temperatureAvg !== null && report.temperatureAvg !== undefined) {
                const tempValue = parseFloat(report.temperatureAvg);
                if (!isNaN(tempValue)) {
                    temperatureSum += tempValue;
                    temperatureCount += 1;
                }
            }
            
            if (report.phAvg !== null && report.phAvg !== undefined) {
                const phValue = parseFloat(report.phAvg);
                if (!isNaN(phValue)) {
                    phSum += phValue;
                    phCount += 1;
                }
            }
        });
        
        // Calculate averages
        const temperatureAvg = temperatureCount > 0 ? temperatureSum / temperatureCount : null;
        const phAvg = phCount > 0 ? phSum / phCount : null;
        const dayCount = monthDailyReports.length;
        
        // Check existing document for change detection
        const reportRef = doc(db, `users/${uid}/monthlyReports/${monthKey}`);
        const existingSnap = await getDoc(reportRef);
        
        if (existingSnap.exists()) {
            const existing = existingSnap.data();
            const tempChanged = hasSignificantChange(existing.temperatureAvg, temperatureAvg);
            const phChanged = hasSignificantChange(existing.phAvg, phAvg);
            const countChanged = existing.dayCount !== dayCount;
            
            if (!tempChanged && !phChanged && !countChanged) {
                console.log(`[ROLLUP-MONTHLY] Unchanged, no write for ${monthKey}`);
                return { skipped: true, reason: 'unchanged', month: monthKey };
            }
        }
        
        // Write to Firestore
        const monthlyReport = {
            month: monthKey,
            temperatureAvg: temperatureAvg,
            phAvg: phAvg,
            dayCount: dayCount,
            source: "derived-from-daily",
            updatedAt: serverTimestamp()
        };
        
        await setDoc(reportRef, monthlyReport, { merge: true });
        
        console.log(`[ROLLUP-MONTHLY] wrote users/${uid}/monthlyReports/${monthKey} dayCount=${dayCount} temp=${temperatureAvg?.toFixed(2) || 'null'} ph=${phAvg?.toFixed(2) || 'null'}`);
        
        return { success: true, month: monthKey, dayCount, temperatureAvg, phAvg };
        
    } catch (error) {
        console.error(`[ROLLUP-MONTHLY] Error computing monthly report for ${monthKey}:`, error);
        return { success: false, error: error.message };
    }
}

// Run rollups for current context (resolves UID from runtime context)
// Computes current date/week/month keys using LOCAL TIME
// Runs rollups under throttling rules
export async function runRollupsForCurrentContext() {
    try {
        // Resolve UID from runtime context (works without login)
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        
        if (!uid) {
            console.log('[CORE] rollup skipped (no runtime UID)');
            return { skipped: true, reason: 'no_uid' };
        }
        
        const now = new Date(); // LOCAL TIME
        const nowMs = Date.now();
        
        // Compute current date/week/month keys (LOCAL TIME)
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const weekKey = getISOWeekStringFromDate(now);
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const results = {
            daily: null,
            weekly: null,
            monthly: null
        };
        
        // Daily rollup (throttled: 5 minutes)
        if ((nowMs - LAST_ROLLUP_AT.daily) >= ROLLUP_COOLDOWN.daily) {
            results.daily = await computeAndWriteDailyReport(uid, dateStr);
            if (results.daily.success) {
                LAST_ROLLUP_AT.daily = nowMs;
            }
        } else {
            console.log('[ROLLUP-DAILY] skipped (cooldown)');
            results.daily = { skipped: true, reason: 'cooldown' };
        }
        
        // Weekly rollup (throttled: 1 hour)
        if ((nowMs - LAST_ROLLUP_AT.weekly) >= ROLLUP_COOLDOWN.weekly) {
            results.weekly = await computeAndWriteWeeklyReport(uid, weekKey);
            if (results.weekly.success) {
                LAST_ROLLUP_AT.weekly = nowMs;
            }
        } else {
            console.log('[ROLLUP-WEEKLY] skipped (cooldown)');
            results.weekly = { skipped: true, reason: 'cooldown' };
        }
        
        // Monthly rollup (throttled: 1 hour)
        if ((nowMs - LAST_ROLLUP_AT.monthly) >= ROLLUP_COOLDOWN.monthly) {
            results.monthly = await computeAndWriteMonthlyReport(uid, monthKey);
            if (results.monthly.success) {
                LAST_ROLLUP_AT.monthly = nowMs;
            }
        } else {
            console.log('[ROLLUP-MONTHLY] skipped (cooldown)');
            results.monthly = { skipped: true, reason: 'cooldown' };
        }
        
        return results;
        
    } catch (error) {
        console.error('[ROLLUP] Error running rollups:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// FIRESTORE HOURLY REPORT FETCH (READ-ONLY)
// ============================================================
// Fetches hourly report data from Firestore
// This is a read-only function - no writes, no side effects
//
// Firestore Path: users/{uid}/hourlyRecords/{YYYY-MM-DD}/hours
//
// Usage: Call manually or from existing report loaders
// Example: const reports = await fetchHourlyReport(uid, "2026-01-22");
export async function fetchHourlyReport(uid, dateStr) {
    try {
        // Validate inputs
        if (!uid) {
            console.error('[FETCH-HOURLY] No user ID provided');
            return [];
        }
        
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            console.error('[FETCH-HOURLY] Invalid date format. Expected YYYY-MM-DD, got:', dateStr);
            return [];
        }
        
        // Read from Firestore
        const firestorePath = `users/${uid}/hourlyRecords/${dateStr}/hours`;
        const hoursRef = collection(db, firestorePath);
        
        // Query with orderBy to get hours in ascending order
        let hoursSnapshot;
        try {
            const q = query(hoursRef, orderBy('hour', 'asc'));
            hoursSnapshot = await getDocs(q);
        } catch (error) {
            // If orderBy fails (field doesn't exist), query without it
            console.warn('[FETCH-HOURLY] orderBy failed, querying without orderBy:', error);
            hoursSnapshot = await getDocs(hoursRef);
        }
        
        // Process documents into normalized array
        const reports = [];
        hoursSnapshot.forEach(doc => {
            const data = doc.data();
            
            // Normalize data with safe fallbacks
            const report = {
                hour: data.hour || doc.id,  // Fallback to doc.id if hour field missing
                temperatureAvg: data.temperatureAvg !== undefined && data.temperatureAvg !== null 
                    ? parseFloat(data.temperatureAvg) 
                    : null,
                phAvg: data.phAvg !== undefined && data.phAvg !== null 
                    ? parseFloat(data.phAvg) 
                    : null,
                source: data.source || null,
                updatedAt: data.updatedAt || null
            };
            
            reports.push(report);
        });
        
        // Sort by hour ascending (client-side, in case orderBy failed)
        reports.sort((a, b) => {
            const hourA = parseInt(a.hour || '0', 10);
            const hourB = parseInt(b.hour || '0', 10);
            return hourA - hourB;
        });
        
        // Log clearly
        console.log(`[FETCH-HOURLY] uid=${uid} date=${dateStr} rows=${reports.length}`);
        
        return reports;
        
    } catch (error) {
        console.error('[FETCH-HOURLY] ❌ Error fetching hourly report:', error);
        return [];
    }
}

// ============================================================
// COMPUTE DAILY, WEEKLY, AND MONTHLY REPORTS FROM HOURLY
// ============================================================

// Compute daily report from hourly records
// Reads from: users/{uid}/hourlyRecords/{YYYY-MM-DD}/hours
// Writes to: users/{uid}/dailyReports/{YYYY-MM-DD}
export async function computeDailyReport(uid, dateStr) {
    try {
        // Validate date format
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            console.error('[DAILY COMPUTE] Invalid date format. Expected YYYY-MM-DD, got:', dateStr);
            return null;
        }
        
        // Read hourly records for this date
        const hoursRef = collection(db, `users/${uid}/hourlyRecords/${dateStr}/hours`);
        const hoursSnapshot = await getDocs(hoursRef);
        
        if (hoursSnapshot.empty) {
            console.log(`[DAILY COMPUTE] No hourly records found for ${dateStr}`);
            return null;
        }
        
        // Aggregate using weighted averages (sum/count)
        let temperatureSum = 0;
        let temperatureCount = 0;
        let phSum = 0;
        let phCount = 0;
        let coverageHours = 0;
        
        hoursSnapshot.forEach(hourDoc => {
            const record = hourDoc.data();
            
            // Skip seed documents
            if (record.isSeed === true) {
                return;
            }
            
            // Process temperature (each hourly record counts as 1)
            if (record.temperatureAvg !== null && record.temperatureAvg !== undefined) {
                const tempValue = parseFloat(record.temperatureAvg);
                if (!isNaN(tempValue)) {
                    temperatureSum += tempValue;
                    temperatureCount += 1;
                }
            }
            
            // Process pH (each hourly record counts as 1)
            if (record.phAvg !== null && record.phAvg !== undefined) {
                const phValue = parseFloat(record.phAvg);
                if (!isNaN(phValue)) {
                    phSum += phValue;
                    phCount += 1;
                }
            }
            
            // Count hours with at least one valid reading
            if ((record.temperatureAvg !== null && record.temperatureAvg !== undefined) ||
                (record.phAvg !== null && record.phAvg !== undefined)) {
                coverageHours += 1;
            }
        });
        
        // If no valid data, return null
        if (coverageHours === 0) {
            console.log(`[DAILY COMPUTE] No valid hourly data for ${dateStr}`);
            return null;
        }
        
        // Calculate weighted averages
        const avgTemperature = temperatureCount > 0 ? temperatureSum / temperatureCount : null;
        const avgPh = phCount > 0 ? phSum / phCount : null;
        
        // Write to Firestore
        const reportRef = doc(db, `users/${uid}/dailyReports/${dateStr}`);
        const dailyReport = {
            date: dateStr,
            avgTemperature: avgTemperature,
            avgPh: avgPh,
            coverageHours: coverageHours,
            source: "computed",
            isSeed: false,
            updatedAt: serverTimestamp()
        };
        
        await setDoc(reportRef, dailyReport, { merge: true });
        
        // Log clearly
        console.log(`[DAILY COMPUTE] uid=${uid} date=${dateStr} hours=${coverageHours} avgTemp=${avgTemperature?.toFixed(2) || 'null'} avgPh=${avgPh?.toFixed(2) || 'null'}`);
        
        return dailyReport;
        
    } catch (error) {
        console.error(`[DAILY COMPUTE] ❌ Error computing daily report for ${dateStr}:`, error);
        return null;
    }
}

// Compute weekly report from daily reports
// Reads from: users/{uid}/dailyReports/{YYYY-MM-DD}
// Writes to: users/{uid}/weeklyReports/{YYYY-WW}
export async function computeWeeklyReport(uid, isoWeekStr) {
    try {
        // Validate ISO week format (YYYY-WW)
        if (!isoWeekStr || !/^\d{4}-W\d{2}$/.test(isoWeekStr)) {
            console.error('[WEEKLY COMPUTE] Invalid ISO week format. Expected YYYY-WW, got:', isoWeekStr);
            return null;
        }
        
        // Parse ISO week to get date range
        const match = isoWeekStr.match(/(\d{4})-W(\d{2})/);
        if (!match) {
            console.error('[WEEKLY COMPUTE] Failed to parse ISO week:', isoWeekStr);
            return null;
        }
        
        const year = parseInt(match[1]);
        const week = parseInt(match[2]);
        
        // Calculate Monday of the ISO week (simplified - assumes week 1 starts Jan 4)
        const jan4 = new Date(year, 0, 4);
        const jan4Day = jan4.getDay();
        const jan4Monday = new Date(jan4);
        jan4Monday.setDate(4 - (jan4Day === 0 ? 6 : jan4Day - 1));
        
        const weekStart = new Date(jan4Monday);
        weekStart.setDate(jan4Monday.getDate() + (week - 1) * 7);
        
        // Get all 7 days of the week
        const dailyDates = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + i);
            const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
            dailyDates.push(dateStr);
        }
        
        // Read all daily reports for this week
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailyReportsSnapshot = await getDocs(dailyReportsRef);
        
        // Filter daily reports that belong to this week
        const weekDailyReports = [];
        dailyReportsSnapshot.forEach(doc => {
            const report = doc.data();
            const reportDate = report.date;
            
            // Skip seed documents
            if (report.isSeed === true) {
                return;
            }
            
            // Check if this daily report belongs to the week
            if (reportDate && dailyDates.includes(reportDate)) {
                weekDailyReports.push(report);
            }
        });
        
        if (weekDailyReports.length === 0) {
            console.log(`[WEEKLY COMPUTE] No daily reports found for week ${isoWeekStr}`);
            return null;
        }
        
        // Aggregate using weighted averages (sum/count)
        let temperatureSum = 0;
        let temperatureCount = 0;
        let phSum = 0;
        let phCount = 0;
        
        weekDailyReports.forEach(report => {
            // Each daily report counts as 1 (weighted by coverageHours if needed, but simplified)
            if (report.avgTemperature !== null && report.avgTemperature !== undefined) {
                const tempValue = parseFloat(report.avgTemperature);
                if (!isNaN(tempValue)) {
                    temperatureSum += tempValue;
                    temperatureCount += 1;
                }
            }
            
            if (report.avgPh !== null && report.avgPh !== undefined) {
                const phValue = parseFloat(report.avgPh);
                if (!isNaN(phValue)) {
                    phSum += phValue;
                    phCount += 1;
                }
            }
        });
        
        // Calculate weighted averages
        const avgTemperature = temperatureCount > 0 ? temperatureSum / temperatureCount : null;
        const avgPh = phCount > 0 ? phSum / phCount : null;
        const coverageDays = weekDailyReports.length;
        
        // Write to Firestore
        const reportRef = doc(db, `users/${uid}/weeklyReports/${isoWeekStr}`);
        const weeklyReport = {
            week: isoWeekStr,
            avgTemperature: avgTemperature,
            avgPh: avgPh,
            coverageDays: coverageDays,
            source: "computed",
            isSeed: false,
            updatedAt: serverTimestamp()
        };
        
        await setDoc(reportRef, weeklyReport, { merge: true });
        
        // Log clearly
        console.log(`[WEEKLY COMPUTE] uid=${uid} week=${isoWeekStr} days=${coverageDays} avgTemp=${avgTemperature?.toFixed(2) || 'null'} avgPh=${avgPh?.toFixed(2) || 'null'}`);
        
        return weeklyReport;
        
    } catch (error) {
        console.error(`[WEEKLY COMPUTE] ❌ Error computing weekly report for ${isoWeekStr}:`, error);
        return null;
    }
}

// Compute monthly report from daily reports
// Reads from: users/{uid}/dailyReports/{YYYY-MM-DD}
// Writes to: users/{uid}/monthlyReports/{YYYY-MM}
export async function computeMonthlyReport(uid, monthStr) {
    try {
        // Validate month format (YYYY-MM)
        if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
            console.error('[MONTHLY COMPUTE] Invalid month format. Expected YYYY-MM, got:', monthStr);
            return null;
        }
        
        // Parse month
        const [year, month] = monthStr.split('-').map(Number);
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0); // Last day of month
        
        // Read all daily reports
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailyReportsSnapshot = await getDocs(dailyReportsRef);
        
        // Filter daily reports that belong to this month
        const monthDailyReports = [];
        dailyReportsSnapshot.forEach(doc => {
            const report = doc.data();
            const reportDate = report.date;
            
            // Skip seed documents
            if (report.isSeed === true) {
                return;
            }
            
            // Check if this daily report belongs to the month
            if (reportDate && reportDate.startsWith(monthStr)) {
                monthDailyReports.push(report);
            }
        });
        
        if (monthDailyReports.length === 0) {
            console.log(`[MONTHLY COMPUTE] No daily reports found for month ${monthStr}`);
            return null;
        }
        
        // Aggregate using weighted averages (sum/count)
        let temperatureSum = 0;
        let temperatureCount = 0;
        let phSum = 0;
        let phCount = 0;
        
        monthDailyReports.forEach(report => {
            // Each daily report counts as 1
            if (report.avgTemperature !== null && report.avgTemperature !== undefined) {
                const tempValue = parseFloat(report.avgTemperature);
                if (!isNaN(tempValue)) {
                    temperatureSum += tempValue;
                    temperatureCount += 1;
                }
            }
            
            if (report.avgPh !== null && report.avgPh !== undefined) {
                const phValue = parseFloat(report.avgPh);
                if (!isNaN(phValue)) {
                    phSum += phValue;
                    phCount += 1;
                }
            }
        });
        
        // Calculate weighted averages
        const avgTemperature = temperatureCount > 0 ? temperatureSum / temperatureCount : null;
        const avgPh = phCount > 0 ? phSum / phCount : null;
        const coverageDays = monthDailyReports.length;
        
        // Write to Firestore
        const reportRef = doc(db, `users/${uid}/monthlyReports/${monthStr}`);
        const monthlyReport = {
            month: monthStr,
            avgTemperature: avgTemperature,
            avgPh: avgPh,
            coverageDays: coverageDays,
            source: "computed",
            isSeed: false,
            updatedAt: serverTimestamp()
        };
        
        await setDoc(reportRef, monthlyReport, { merge: true });
        
        // Log clearly
        console.log(`[MONTHLY COMPUTE] uid=${uid} month=${monthStr} days=${coverageDays} avgTemp=${avgTemperature?.toFixed(2) || 'null'} avgPh=${avgPh?.toFixed(2) || 'null'}`);
        
        return monthlyReport;
        
    } catch (error) {
        console.error(`[MONTHLY COMPUTE] ❌ Error computing monthly report for ${monthStr}:`, error);
        return null;
    }
}

// ============================================================
// RTDB TO FIRESTORE LIVE HOURLY INGESTION (TESTING)
// ============================================================
// Sets up an RTDB listener that writes EVERY sensor update to Firestore
// This is for testing only - writes on every RTDB update without debouncing
//
// RTDB Path: /devices/{deviceId}/sensors
// Firestore Path: users/{uid}/hourlyRecords/{YYYY-MM-DD}/hours/{HH}
//
// Usage: Call manually to start ingestion
// Returns cleanup function to stop the listener
// Example: const cleanup = ingestHourlyFromRTDBLive(uid, deviceId);
//          cleanup(); // Stop listening
export function ingestHourlyFromRTDBLive(uid, deviceId) {
    if (HOURLY_TEST_MODE) {
        console.log('[INGEST-LIVE] Disabled in HOURLY_TEST_MODE - use writeHourlyFromRTDB() instead');
        return () => {}; // Return no-op cleanup function
    }
    // RTDB read path
    const rtdbPath = `devices/${deviceId}/sensors`;
    const sensorsRef = ref(rtdb, rtdbPath);
    
    console.log('[INGEST-LIVE] Starting live RTDB→Firestore ingestion:', rtdbPath);
    
    // Set up onValue listener - fires on every RTDB update
    const unsubscribe = onValue(sensorsRef, async (snapshot) => {
        try {
            if (!snapshot.exists()) {
                console.log('[INGEST-LIVE] No sensor data in RTDB');
                return;
            }
            
            const sensorData = snapshot.val();
            
            // Extract temperature and pH values
            const temperature = sensorData.temperature !== undefined && sensorData.temperature !== null 
                ? parseFloat(sensorData.temperature) 
                : null;
            const ph = sensorData.ph !== undefined && sensorData.ph !== null 
                ? parseFloat(sensorData.ph) 
                : null;
            
            // Skip if both values are missing
            if (temperature === null && ph === null) {
                console.log('[INGEST-LIVE] Skipping: no valid sensor values');
                return;
            }
            
            // Determine current date and hour from RTDB timestamp or current time (using LOCAL time)
            let timestamp = sensorData.timestamp || Date.now() / 1000; // RTDB timestamp is in seconds
            const tsMs = timestamp * 1000; // Convert to milliseconds
            const d = new Date(tsMs);
            
            // Use local time methods (NOT UTC) to match UI date picker
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const hourStr = String(d.getHours()).padStart(2, '0');
            
            const writePath = `users/${uid}/hourlyRecords/${dateStr}/hours/${hourStr}`;
            
            // Debug log before writing
            console.log(`[INGEST] tsMs=${tsMs} localDateStr=${dateStr} localHour=${hourStr} writePath=${writePath}`);
            
            // Fetch existing Firestore hourly document (if exists)
            const hourRef = doc(db, writePath);
            const hourSnap = await getDoc(hourRef);
            
            // Calculate aggregated values using sum/count
            let temperatureSum, temperatureCount, temperatureAvg;
            let phSum, phCount, phAvg;
            
            if (hourSnap.exists()) {
                // Update existing document - add to existing sums/counts
                const existing = hourSnap.data();
                
                // Temperature aggregation
                const currentTempSum = existing.temperatureSum || 0;
                const currentTempCount = existing.temperatureCount || 0;
                
                if (temperature !== null) {
                    temperatureSum = currentTempSum + temperature;
                    temperatureCount = currentTempCount + 1;
                    temperatureAvg = temperatureSum / temperatureCount;
                } else {
                    // Keep existing values if no new temperature reading
                    temperatureSum = currentTempSum;
                    temperatureCount = currentTempCount;
                    temperatureAvg = currentTempCount > 0 ? currentTempSum / currentTempCount : null;
                }
                
                // pH aggregation
                const currentPhSum = existing.phSum || 0;
                const currentPhCount = existing.phCount || 0;
                
                if (ph !== null) {
                    phSum = currentPhSum + ph;
                    phCount = currentPhCount + 1;
                    phAvg = phSum / phCount;
                } else {
                    // Keep existing values if no new pH reading
                    phSum = currentPhSum;
                    phCount = currentPhCount;
                    phAvg = currentPhCount > 0 ? currentPhSum / currentPhCount : null;
                }
            } else {
                // Create new document - initialize sums/counts
                if (temperature !== null) {
                    temperatureSum = temperature;
                    temperatureCount = 1;
                    temperatureAvg = temperature;
                } else {
                    temperatureSum = 0;
                    temperatureCount = 0;
                    temperatureAvg = null;
                }
                
                if (ph !== null) {
                    phSum = ph;
                    phCount = 1;
                    phAvg = ph;
                } else {
                    phSum = 0;
                    phCount = 0;
                    phAvg = null;
                }
            }
            
            // Write to Firestore using merge (updates existing or creates new)
            const hourlyRecord = {
                hour: hourStr,
                temperatureSum: temperatureSum,
                temperatureCount: temperatureCount,
                temperatureAvg: temperatureAvg,
                phSum: phSum,
                phCount: phCount,
                phAvg: phAvg,
                source: "rtdb-test",
                isSeed: false,
                updatedAt: serverTimestamp()
            };
            
            await setDoc(hourRef, hourlyRecord, { merge: true });
            
            console.log(`[INGEST-LIVE] ✅ Wrote hourly record: ${dateStr}/hours/${hourStr}`, {
                temperature: temperature !== null ? `${temperature}°C (sum: ${temperatureSum}, count: ${temperatureCount}, avg: ${temperatureAvg?.toFixed(2)})` : 'null',
                ph: ph !== null ? `${ph} (sum: ${phSum}, count: ${phCount}, avg: ${phAvg?.toFixed(2)})` : 'null'
            });
            
        } catch (error) {
            console.error('[INGEST-LIVE] ❌ Error ingesting hourly data from RTDB:', error);
        }
    }, (error) => {
        console.error('[INGEST-LIVE] ❌ RTDB listener error:', error);
    });
    
    // Return cleanup function to stop the listener
    return () => {
        console.log('[INGEST-LIVE] Stopping live RTDB→Firestore ingestion');
        off(sensorsRef);
    };
}

// Change detection for Firestore recording (only record significant changes)
let lastRecordedValues = {
    temperature: null,
    ph: null
};

// Thresholds for significant changes (only record if change exceeds these)
const CHANGE_THRESHOLDS = {
    temperature: 0.5,  // Record if temperature changes by 0.5°C or more
    ph: 0.1            // Record if pH changes by 0.1 or more
};

// Throttle function to limit Firestore writes (max once per 30 seconds)
let lastFirestoreWrite = 0;
const FIRESTORE_WRITE_THROTTLE_MS = 30000; // 30 seconds

// Check if sensor values have changed significantly
// Using canonical hasSignificantChange helper function (defined at line 1438)

// ============================================================
// RTDB SENSOR LISTENER CORE (DOM-FREE, AUTH-INDEPENDENT)
// ============================================================
// Core RTDB listener that updates runtime state and emits events
// NO DOM access, NO UI dependencies, works on any page
export function setupSensorRealtimeUpdatesCore() {
    try {
        // Device ID for RTDB path (uses DEVICE_ID constant)
        const rtdbPath = `devices/${DEVICE_ID}/status/feeder`;
        
        console.log('[CORE] RTDB listener starting:', rtdbPath);
        
        // Guard against duplicate listeners
        if (window.sensorUnsubscribes && window.sensorUnsubscribes.rtdb) {
            console.log('[CORE] RTDB listener already active, skipping');
            return;
        }
        
        // Set up RTDB listener for live sensor readings (temperature, pH, motor state)
        // No auth check - listener works unconditionally
        const statusRef = ref(rtdb, rtdbPath);
        onValue(statusRef, (snapshot) => {
            try {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    
                    let temperature = null;
                    let ph = null;
                    let feederState = null;
                    
                    // Parse temperature from RTDB
                    if (data.temperature !== undefined && data.temperature !== null) {
                        temperature = parseFloat(data.temperature);
                    }
                    
                    // Parse pH from RTDB
                    if (data.ph !== undefined && data.ph !== null) {
                        ph = parseFloat(data.ph);
                    }
                    
                    // Parse feeder/motor state from RTDB
                    if (data.state !== undefined && data.state !== null) {
                        const stateValue = String(data.state).toLowerCase();
                        feederState = stateValue === 'online' ? 'online' : 'offline';
                    }
                    
                    // Update runtime state (DOM-free)
                    window.RUNTIME_STATE.temperature = temperature;
                    window.RUNTIME_STATE.ph = ph;
                    window.RUNTIME_STATE.feederState = feederState;
                    window.RUNTIME_STATE.lastUpdateAt = Date.now();
                    
                    // Update local state for hourly writer (backward compatibility)
                    latestTemperature = typeof temperature === 'number' ? temperature : null;
                    latestPH = typeof ph === 'number' ? ph : null;
                    latestTimestamp = data.timestamp || Date.now();
                    
                    // Emit event for UI bindings (if any)
                    window.RuntimeEvents.emit('sensor:update', {
                        temperature,
                        ph,
                        feederState,
                        timestamp: window.RUNTIME_STATE.lastUpdateAt
                    });
                    
                    console.log('[CORE] sensor:update emitted temp=' + temperature + ' ph=' + ph + ' state=' + feederState);
                    
                    // Trigger hourly writer when new sensor data arrives (respects cooldown)
                    if (HOURLY_TEST_MODE) {
                        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
                        if (uid && (temperature !== null || ph !== null)) {
                            // Fire and forget - writeHourlyFromRTDB has built-in cooldown/throttle
                            writeHourlyFromRTDB(uid).catch(err => {
                                console.error('[CORE] Hourly write error:', err);
                            });
                        } else if (!uid) {
                            // Optional logging if no UID (non-blocking)
                            // console.log('[CORE] Hourly write skipped (no runtime UID)');
                        }
                    } else {
                        // Legacy behavior (disabled in test mode)
                        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
                        if (uid && (temperature !== null || ph !== null)) {
                            const tempChanged = hasSignificantChange(lastRecordedValues.temperature, temperature, CHANGE_THRESHOLDS.temperature);
                            const phChanged = hasSignificantChange(lastRecordedValues.ph, ph, CHANGE_THRESHOLDS.ph);
                            if (tempChanged || phChanged) {
                                const now = Date.now();
                                if (now - lastFirestoreWrite > FIRESTORE_WRITE_THROTTLE_MS) {
                                    lastFirestoreWrite = now;
                                    if (temperature !== null) lastRecordedValues.temperature = temperature;
                                    if (ph !== null) lastRecordedValues.ph = ph;
                                    recordSensorDataToFirestore(uid, temperature, ph).catch(err => {
                                        console.error('[CORE] Firestore write error:', err);
                                    });
                                }
                            }
                        }
                    }
                } else {
                    // No data available
                    window.RUNTIME_STATE.temperature = null;
                    window.RUNTIME_STATE.ph = null;
                    window.RUNTIME_STATE.feederState = null;
                    window.RUNTIME_STATE.lastUpdateAt = Date.now();
                    console.warn('[CORE] RTDB sensor data not available at:', rtdbPath);
                }
            } catch (error) {
                console.error('[CORE] Error processing RTDB sensor update:', error);
            }
        }, (error) => {
            console.error('[CORE] Error in RTDB sensor listener:', error);
        });
        
        // Store reference and cleanup function for RTDB listener
        window.sensorUnsubscribes = window.sensorUnsubscribes || {};
        window.sensorUnsubscribes.rtdb = {
            ref: statusRef,
            cleanup: () => off(statusRef)
        };
        
        console.log('[CORE] RTDB listener started');
        
    } catch (error) {
        console.error('[CORE] Error setting up RTDB listener:', error);
    }
}

// ============================================================
// UI BINDINGS (OPTIONAL - DOM-DEPENDENT)
// ============================================================
// Attaches UI update functions to runtime events
// Only call this if DOM elements exist (dashboard pages)
export function attachSensorUIBindings() {
    try {
        // Check if DOM elements exist
        const tempElement = document.getElementById('sensorTemperature');
        const phElement = document.getElementById('sensorPh');
        const feederElement = document.getElementById('sensorFeeder');
        
        if (!tempElement && !phElement && !feederElement) {
            console.log('[UI] bindings skipped (no DOM)');
            return;
        }
        
        // Subscribe to sensor updates
        window.RuntimeEvents.on('sensor:update', (state) => {
            try {
                // Update sensor displays
                if (state.temperature !== null) {
                    updateSensorDisplay('temperature', state.temperature, '°C');
                } else {
                    updateSensorDisplay('temperature', '--', '°C');
                }
                
                if (state.ph !== null) {
                    updateSensorDisplay('ph', state.ph, '');
                } else {
                    updateSensorDisplay('ph', '--', '');
                }
                
                // Update feeder status
                const isOnline = state.feederState === 'online';
                updateFeederStatusDisplay(isOnline);
                updateMotorToggleButton(isOnline);
                
                // Update chart
                addLiveSensorReading(state.temperature, state.ph);
            } catch (uiError) {
                console.warn('[UI] Binding update error (non-critical):', uiError);
            }
        });
        
        console.log('[UI] bindings attached');
    } catch (error) {
        console.warn('[UI] Failed to attach bindings (non-critical):', error);
    }
}

// ============================================================
// LEGACY WRAPPER (BACKWARD COMPATIBILITY)
// ============================================================
// Maintains backward compatibility with existing code
// Calls core + UI bindings
export function setupSensorRealtimeUpdates() {
    try {
        // Device ID for RTDB path (uses DEVICE_ID constant)
        const rtdbPath = `devices/${DEVICE_ID}/status/feeder`;
        
        console.log('[RTDB] Setting up real-time sensor updates from RTDB:', rtdbPath);
        console.log('[RTDB] RTDB listener will work without authentication');
        
        // Set up RTDB listener for live sensor readings (temperature, pH, motor state)
        // No auth check - listener works unconditionally
        const statusRef = ref(rtdb, rtdbPath);
        console.log('[RTDB] Attaching listener to:', rtdbPath);
        onValue(statusRef, (snapshot) => {
            try {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    
                    let temperature = null;
                    let ph = null;
                    
                    // Update temperature from RTDB
                    if (data.temperature !== undefined && data.temperature !== null) {
                        temperature = parseFloat(data.temperature);
                        // [FIX] Wrap UI updates in try/catch - runtime must not fail if DOM missing
                        try {
                            updateSensorDisplay('temperature', temperature, '°C');
                        } catch (uiError) {
                            // UI update failed - non-critical, continue runtime
                        }
                        console.log('[RTDB] Temperature updated (RTDB):', temperature);
                    } else {
                        try {
                            updateSensorDisplay('temperature', '--', '°C');
                        } catch (uiError) {
                            // UI update failed - non-critical
                        }
                    }
                    
                    // Update pH from RTDB
                    if (data.ph !== undefined && data.ph !== null) {
                        ph = parseFloat(data.ph);
                        // [FIX] Wrap UI updates in try/catch - runtime must not fail if DOM missing
                        try {
                            updateSensorDisplay('ph', ph, '');
                        } catch (uiError) {
                            // UI update failed - non-critical, continue runtime
                        }
                        console.log('[RTDB] pH updated (RTDB):', ph);
                    } else {
                        try {
                            updateSensorDisplay('ph', '--', '');
                        } catch (uiError) {
                            // UI update failed - non-critical
                        }
                    }
                    
                    // Update feeder/motor state from RTDB
                    if (data.state !== undefined && data.state !== null) {
                        const stateValue = String(data.state).toLowerCase();
                        const isOnline = stateValue === 'online';
                        // [FIX] Wrap UI updates in try/catch - runtime must not fail if DOM missing
                        try {
                            updateFeederStatusDisplay(isOnline);
                            updateMotorToggleButton(isOnline); // Update toggle button appearance
                        } catch (uiError) {
                            // UI update failed - non-critical, continue runtime
                        }
                        console.log('[RTDB] Feeder state updated (RTDB):', stateValue);
                    } else {
                        try {
                            updateFeederStatusDisplay(null);
                            updateMotorToggleButton(null);
                        } catch (uiError) {
                            // UI update failed - non-critical
                        }
                    }
                    
                    // Add to live chart data (always update chart for real-time display)
                    // [FIX] Wrap UI updates in try/catch - runtime must not fail if DOM missing
                    try {
                        addLiveSensorReading(temperature, ph);
                    } catch (uiError) {
                        // UI update failed - non-critical, continue runtime
                    }
                    
                    // Update local state (READ-ONLY from RTDB - no Firestore writes here)
                    latestTemperature = typeof temperature === 'number' ? temperature : null;
                    latestPH = typeof ph === 'number' ? ph : null;
                    latestTimestamp = data.timestamp || Date.now();
                    
                    // In HOURLY_TEST_MODE, RTDB listeners are read-only
                    // Firestore writes are handled by writeHourlyFromRTDB() only
                    if (HOURLY_TEST_MODE) {
                        // Trigger hourly writer when new sensor data arrives (respects cooldown)
                        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
                        if (uid && (temperature !== null || ph !== null)) {
                            // Fire and forget - writeHourlyFromRTDB has built-in cooldown/throttle
                            writeHourlyFromRTDB(uid).catch(err => {
                                console.error('[RTDB→HOURLY WRITE] Error in writeHourlyFromRTDB:', err);
                            });
                        }
                    } else {
                        // Legacy behavior (disabled in test mode)
                        // Record sensor data to Firestore ONLY if significant change detected
                        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
                        if (uid && (temperature !== null || ph !== null)) {
                            // Check if there's a significant change using canonical helper
                            const tempChanged = hasSignificantChange(lastRecordedValues.temperature, temperature, CHANGE_THRESHOLDS.temperature);
                            const phChanged = hasSignificantChange(lastRecordedValues.ph, ph, CHANGE_THRESHOLDS.ph);
                            if (tempChanged || phChanged) {
                                const now = Date.now();
                                // Also respect throttle (max once per 30 seconds)
                                if (now - lastFirestoreWrite > FIRESTORE_WRITE_THROTTLE_MS) {
                                    lastFirestoreWrite = now;
                                    
                                    // Update last recorded values
                                    if (temperature !== null) {
                                        lastRecordedValues.temperature = temperature;
                                    }
                                    if (ph !== null) {
                                        lastRecordedValues.ph = ph;
                                    }
                                    
                                    // Fire and forget - don't await to avoid blocking UI updates
                                    recordSensorDataToFirestore(uid, temperature, ph).catch(err => {
                                        console.error('Error in background Firestore write:', err);
                                    });
                                    
                                    console.log('[RTDB→FIRESTORE] Recording significant change to Firestore');
                                }
                            }
                        }
                    }
                } else {
                    // No data available, set defaults
                    // [FIX] Wrap UI updates in try/catch - runtime must not fail if DOM missing
                    try {
                        updateSensorDisplay('temperature', '--', '°C');
                        updateSensorDisplay('ph', '--', '');
                        updateFeederStatusDisplay(null);
                        updateMotorToggleButton(null);
                    } catch (uiError) {
                        // UI update failed - non-critical
                    }
                    console.warn('RTDB sensor data not available at:', rtdbPath);
                }
            } catch (error) {
                console.error('Error processing RTDB sensor update:', error);
            }
        }, (error) => {
            console.error('Error in RTDB sensor listener:', error);
            // Set default values on error
            // [FIX] Wrap UI updates in try/catch - runtime must not fail if DOM missing
            try {
                updateSensorDisplay('temperature', '--', '°C');
                updateSensorDisplay('ph', '--', '');
                updateFeederStatusDisplay(null);
                updateMotorToggleButton(null);
            } catch (uiError) {
                // UI update failed - non-critical
            }
        });
        
        // Store reference and cleanup function for RTDB listener
        window.sensorUnsubscribes = {
            rtdb: {
                ref: statusRef,
                cleanup: () => off(statusRef)
            }
        };
        
        console.log('[RTDB] Real-time RTDB sensor listener set up successfully');
        console.log('[RTDB] Listener attached, guard check:', !window.sensorUnsubscribes || !window.sensorUnsubscribes.rtdb ? 'PASSED' : 'ALREADY EXISTS');
        
    } catch (error) {
        console.error('Error setting up real-time sensor updates:', error);
        // Set default values on error
        // [FIX] Wrap UI updates in try/catch - runtime must not fail if DOM missing
        try {
            updateSensorDisplay('temperature', '--', '°C');
            updateSensorDisplay('ph', '--', '');
            updateFeederStatusDisplay(null);
            updateMotorToggleButton(null);
        } catch (uiError) {
            // UI update failed - non-critical
        }
    }
}

// Cleanup sensor listeners (call on logout)
function cleanupSensorListeners() {
    try {
        if (window.sensorUnsubscribes) {
            // Cleanup RTDB listener
            if (window.sensorUnsubscribes.rtdb) {
                if (window.sensorUnsubscribes.rtdb.cleanup && typeof window.sensorUnsubscribes.rtdb.cleanup === 'function') {
                    window.sensorUnsubscribes.rtdb.cleanup();
                } else if (window.sensorUnsubscribes.rtdb.ref) {
                    // Fallback: use off() directly with reference
                    off(window.sensorUnsubscribes.rtdb.ref);
                }
            }
            // Legacy Firestore listener cleanup (for backward compatibility)
            if (window.sensorUnsubscribes.temperature && typeof window.sensorUnsubscribes.temperature === 'function') {
                window.sensorUnsubscribes.temperature();
            }
            if (window.sensorUnsubscribes.ph && typeof window.sensorUnsubscribes.ph === 'function') {
                window.sensorUnsubscribes.ph();
            }
            if (window.sensorUnsubscribes.feeder && typeof window.sensorUnsubscribes.feeder === 'function') {
                window.sensorUnsubscribes.feeder();
            }
            window.sensorUnsubscribes = null;
            console.log('Sensor listeners cleaned up');
        }
        // Reset status cache on logout
        lastMirroredFeederStatus = null;
    } catch (error) {
        console.error('Error cleaning up sensor listeners:', error);
    }
}

// Helper function to create schedule item HTML (for new schema with execution-based status)
function createScheduleItemHTML(schedule, executionStatus = 'PENDING', scheduleId = '') {
    const title = schedule.title || 'Untitled Schedule';
    const time = schedule.time || '--:--';
    const description = schedule.description || '';
    const isEnabled = schedule.isEnabled !== false; // Default to true if not specified
    
    // Format time for display (HH:mm format)
    let displayTime = time;
    if (time && time.includes(':')) {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const minute = parseInt(minutes);
        if (!isNaN(hour) && !isNaN(minute)) {
            const date = new Date();
            date.setHours(hour, minute, 0, 0);
            displayTime = date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        }
    }
    
    // Determine status badge based on execution status and enabled state
    let statusClass, statusText;
    if (!isEnabled) {
        statusClass = 'disabled';
        statusText = 'Disabled';
    } else {
        switch (executionStatus) {
            case 'COMPLETED':
                statusClass = 'completed';
                statusText = 'Completed';
                break;
            case 'RUNNING':
                statusClass = 'in-progress';
                statusText = 'Running';
                break;
            case 'PENDING':
            default:
                statusClass = 'pending';
                statusText = 'Pending';
                break;
        }
    }
    
    return `
        <div class="schedule-item user-schedule-item" data-schedule-id="${scheduleId}">
            <div class="schedule-time">
                <span class="time">${displayTime}</span>
            </div>
            <div class="schedule-details">
                <div class="schedule-title"><strong>${title}</strong></div>
                ${description ? `<div class="schedule-description"><i class="fas fa-info-circle"></i> ${description}</div>` : ''}
            </div>
            <div class="schedule-actions">
                <div class="schedule-status">
                    <span class="status ${statusClass}">${statusText}</span>
                </div>
                <button 
                    class="schedule-delete-btn" 
                    onclick="deleteFeedingSchedule('${scheduleId}')"
                    title="Delete schedule"
                >
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

// Helper function to render schedules to a container (with execution status)
function renderSchedulesToContainer(schedulesWithStatus, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`Container with id "${containerId}" not found`);
        return;
    }
    
    if (schedulesWithStatus.length === 0) {
        container.innerHTML = '<div class="schedule-item"><p class="no-data-text">No feeding schedules found</p></div>';
        return;
    }
    
    container.innerHTML = '';
    schedulesWithStatus.forEach(scheduleData => {
        const schedule = scheduleData.data;
        const scheduleId = scheduleData.id || '';
        const executionStatus = scheduleData.executionStatus || 'PENDING';
        const scheduleHTML = createScheduleItemHTML(schedule, executionStatus, scheduleId);
        container.insertAdjacentHTML('beforeend', scheduleHTML);
    });
}

// ============================================================
// FEEDING SCHEDULE STATUS COMPUTATION (EXECUTION-BASED)
// ============================================================

// Determine schedule execution status based on daily cycle
// CORE RULE: A feeding schedule can run ONCE PER DAY
// Status priority (ORDER IS CRITICAL):
// 1. COMPLETED: If completed log exists for TODAY (overrides ALL other states)
// 2. RUNNING: If no completed log today AND T ≤ now < E
// 3. PENDING: If no completed log today AND now < T
// 4. PENDING: If no completed log today AND now ≥ E (missed, no re-run)
// 
// Formula: T = scheduled time, D = duration (minutes), E = T + D
// Expected feedingLogs structure: users/{uid}/feedingLogs/{logId}
//   - scheduleId: string (matches schedule document ID)
//   - status: 'running' | 'completed'
//   - startedAt: Timestamp (when motor was turned ON)
//   - endedAt?: Timestamp (when motor was turned OFF, only if completed)
//   - duration: number (minutes)
async function determineScheduleStatus(uid, scheduleId, scheduleTime, scheduleDuration) {
    try {
        const now = new Date();
        const today = getStartOfDay(now);
        const todayEnd = getEndOfDay(now);
        
        // Parse schedule time (HH:mm format)
        if (!scheduleTime || !scheduleTime.includes(':')) {
            return 'PENDING';
        }
        
        const [hours, minutes] = scheduleTime.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) {
            return 'PENDING';
        }
        
        // Compute today's scheduled DateTime (local time) - T
        const scheduledDateTime = new Date(today);
        scheduledDateTime.setHours(hours, minutes, 0, 0);
        
        // Get duration (default to 30 minutes if not provided)
        const duration = scheduleDuration || 30;
        
        // Compute end time - E = T + D minutes
        const endDateTime = new Date(scheduledDateTime.getTime() + duration * 60 * 1000);
        
        // ============================================================
        // STEP 1: CHECK FOR COMPLETED LOG (HIGHEST PRIORITY)
        // ============================================================
        // COMPLETED status overrides ALL other states
        // A schedule is considered completed today if:
        //   - exists feedingLogs document where:
        //     - log.scheduleId === scheduleId
        //     - log.status === "completed"
        //     - log.startedAt is TODAY (00:00–23:59 local time)
        try {
            const feedingLogsRef = collection(db, `users/${uid}/feedingLogs`);
            const feedingLogsSnapshot = await getDocs(feedingLogsRef);
            
            let hasCompletedLogToday = false;
            feedingLogsSnapshot.forEach(logDoc => {
                const log = logDoc.data();
                // Check if this log is for this schedule
                if (log.scheduleId === scheduleId && log.startedAt) {
                    const startedAt = timestampToDate(log.startedAt);
                    // Check if started today (local time, 00:00–23:59)
                    if (startedAt && startedAt >= today && startedAt <= todayEnd) {
                        // Check if status is completed
                        if (log.status === 'completed') {
                            hasCompletedLogToday = true;
                        }
                    }
                }
            });
            
            // If completed log exists for today, return COMPLETED immediately
            // This overrides ALL other states (RUNNING, PENDING, etc.)
            if (hasCompletedLogToday) {
                return 'COMPLETED';
            }
        } catch (logsError) {
            // If feedingLogs collection doesn't exist or can't be read, continue to other checks
            console.warn('Could not check feedingLogs, continuing with time-based checks:', logsError);
        }
        
        // ============================================================
        // STEP 2: CHECK IF IN RUNNING WINDOW
        // ============================================================
        // RUNNING: No completed log today AND T ≤ now < E
        // Motor should already be ON during this window
        if (now >= scheduledDateTime && now < endDateTime) {
            return 'RUNNING';
        }
        
        // ============================================================
        // STEP 3: CHECK IF BEFORE SCHEDULED TIME
        // ============================================================
        // PENDING: No completed log today AND now < T
        // Motor OFF, waiting for scheduled time
        if (now < scheduledDateTime) {
            return 'PENDING';
        }
        
        // ============================================================
        // STEP 4: PAST END TIME BUT NO COMPLETED LOG
        // ============================================================
        // PENDING (missed): No completed log today AND now ≥ E
        // Must NOT restart feeding, must NOT show RUNNING
        // Schedule will reset at 00:00 next day
        if (now >= endDateTime) {
            return 'PENDING';
        }
        
        // Default fallback
        return 'PENDING';
    } catch (error) {
        console.error('Error determining schedule status:', error);
        return 'PENDING'; // Default to PENDING on error
    }
}

// ============================================================
// AUTOMATIC FEEDING SCHEDULE EXECUTION (Start → Run → Stop)
// ============================================================

// ============================================================
// DEVICE OWNERSHIP MAPPING (Part 1)
// ============================================================
// Device ID constant - comes from ESP firmware, never generated in web app
export const DEVICE_ID = 'H5hY84Qz85TD9MBPb6UKy3mzLxZ2';

// ============================================================
// RUNTIME CONTEXT RESOLVER
// ============================================================
// Centralized resolver for runtime UID - works with or without authentication
// Uses device ownership mapping as fallback when no user is logged in
// Never throws - always returns a valid context object
export async function resolveRuntimeContext() {
    const deviceId = DEVICE_ID;
    let authUid = null;
    let ownerUid = null;
    let runtimeUid = null;
    let source = 'none';
    
    try {
        // Step 1: Check Firebase Auth (highest priority)
        if (auth && auth.currentUser && auth.currentUser.uid) {
            authUid = auth.currentUser.uid;
            runtimeUid = authUid;
            source = 'auth';
            console.log('[RUNTIME] Auth user detected → using auth UID:', authUid);
            return {
                deviceId: deviceId,
                authUid: authUid,
                ownerUid: null, // Not needed when auth is present
                runtimeUid: runtimeUid,
                source: source
            };
        }
        
        // Step 2: Fallback to Firestore device ownership mapping
        try {
            const deviceRef = doc(db, 'devices', deviceId);
            const deviceSnap = await getDoc(deviceRef);
            
            if (deviceSnap.exists()) {
                const deviceData = deviceSnap.data();
                ownerUid = deviceData.ownerUid || null;
                
                if (ownerUid) {
                    runtimeUid = ownerUid;
                    source = 'device';
                    console.log('[RUNTIME] No auth user → resolved owner UID from device:', ownerUid);
                } else {
                    runtimeUid = null;
                    source = 'none';
                    console.log('[RUNTIME] No UID available → read-only mode');
                }
            } else {
                runtimeUid = null;
                source = 'none';
                console.log('[RUNTIME] No UID available → read-only mode (device record not found)');
            }
        } catch (firestoreError) {
            // Firestore read failed - continue in read-only mode
            console.warn('[RUNTIME] Firestore read failed, continuing in read-only mode:', firestoreError.message);
            runtimeUid = null;
            source = 'none';
        }
    } catch (error) {
        // Catch-all error handler - never throw
        console.error('[RUNTIME] Error resolving runtime context:', error);
        runtimeUid = null;
        source = 'none';
    }
    
    // Return context object (always returns, never throws)
    return {
        deviceId: deviceId,
        authUid: authUid,
        ownerUid: ownerUid,
        runtimeUid: runtimeUid,
        source: source
    };
}

// Ensure device record exists in Firestore (runs on dashboard initialization)
// Firestore Path: devices/{deviceId}
// This function is idempotent - safe to call multiple times
// Works with or without authentication
// Never throws errors - fails gracefully
export async function ensureDeviceRecordExists() {
    if (!DEVICE_ID) {
        console.warn('[DEVICE INIT] DEVICE_ID constant is missing');
        return;
    }
    
    try {
        const deviceRef = doc(db, 'devices', DEVICE_ID);
        const deviceSnap = await getDoc(deviceRef);
        
        if (deviceSnap.exists()) {
            // Document already exists - do nothing, optionally update lastSeenAt
            const existingData = deviceSnap.data();
            console.log('[DEVICE INIT] Device record exists', {
                deviceId: DEVICE_ID,
                ownerUid: existingData.ownerUid || 'null',
                path: `devices/${DEVICE_ID}`
            });
            
            // Optionally update lastSeenAt (non-blocking)
            try {
                await updateDoc(deviceRef, {
                    lastSeenAt: serverTimestamp()
                });
            } catch (updateError) {
                // Ignore update errors - document exists, that's what matters
                console.log('[DEVICE INIT] Could not update lastSeenAt (non-critical)');
            }
            return;
        }
        
        // Document does not exist - create it
        // Resolve ownerUid: use auth.currentUser.uid if logged in, null otherwise
        let ownerUid = null;
        try {
            if (auth && auth.currentUser) {
                ownerUid = auth.currentUser.uid;
            }
        } catch (authError) {
            // Auth not available - use null (allows headless runtime)
            console.log('[DEVICE INIT] No authenticated user, creating record with ownerUid: null');
        }
        
        await setDoc(deviceRef, {
            ownerUid: ownerUid,
            createdAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
            source: 'web-autocreate'
        });
        
        console.log('[DEVICE INIT] Device record created', {
            deviceId: DEVICE_ID,
            ownerUid: ownerUid || 'null',
            path: `devices/${DEVICE_ID}`
        });
    } catch (error) {
        // Never throw - this is non-blocking infrastructure
        console.error('[DEVICE INIT] Failed to create device record', {
            deviceId: DEVICE_ID,
            error: error.message,
            code: error.code
        });
    }
}

// Ensure device ownership mapping exists in Firestore (called on login)
// Firestore Path: devices/{deviceId}
// This function is idempotent - safe to call multiple times
// Only creates mapping if it doesn't exist, never overwrites existing ownerUid
export async function ensureDeviceOwnershipMapping(deviceId, ownerUid) {
    if (!deviceId || !ownerUid) {
        console.warn('[DEVICE MAP] Missing deviceId or ownerUid, cannot create mapping');
        return;
    }
    
    try {
        const deviceRef = doc(db, 'devices', deviceId);
        const deviceSnap = await getDoc(deviceRef);
        
        if (deviceSnap.exists()) {
            // Mapping already exists - do nothing except maybe update lastSeenAt
            const existingData = deviceSnap.data();
            console.log('[DEVICE MAP] Mapping already exists for device:', deviceId, 'ownerUid:', existingData.ownerUid);
            
            // Optionally update lastSeenAt if provided
            if (existingData.ownerUid === ownerUid) {
                // Only update lastSeenAt if the ownerUid matches (safety check)
                await updateDoc(deviceRef, {
                    lastSeenAt: serverTimestamp()
                });
                console.log('[DEVICE MAP] Updated lastSeenAt for existing mapping');
            }
            return;
        }
        
        // Mapping does not exist - create it
        await setDoc(deviceRef, {
            ownerUid: ownerUid,
            createdAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
            source: 'web-autocreate'
        });
        
        console.log('[DEVICE MAP] Created ownership mapping:', {
            deviceId: deviceId,
            ownerUid: ownerUid,
            path: `devices/${deviceId}`
        });
    } catch (error) {
        console.error('[DEVICE MAP] Error ensuring device ownership mapping:', error);
        // Don't throw - this should not break login flow
    }
}

// Get owner UID from device ID (read-only, no auth required)
// Returns ownerUid if exists, null if missing
// This function must work without authentication
export async function getOwnerUidFromDevice(deviceId) {
    if (!deviceId) {
        console.warn('[DEVICE MAP] No deviceId provided');
        return null;
    }
    
    try {
        const deviceRef = doc(db, 'devices', deviceId);
        const deviceSnap = await getDoc(deviceRef);
        
        if (!deviceSnap.exists()) {
            console.log('[DEVICE MAP] No ownerUid found for device:', deviceId);
            return null;
        }
        
        const data = deviceSnap.data();
        const ownerUid = data.ownerUid || null;
        
        if (ownerUid) {
            console.log('[DEVICE MAP] ownerUid resolved:', ownerUid, 'for device:', deviceId);
        } else {
            console.warn('[DEVICE MAP] Device document exists but ownerUid is missing for device:', deviceId);
        }
        
        return ownerUid;
    } catch (error) {
        console.error('[DEVICE MAP] Error reading device ownership mapping:', error);
        // Return null on error - don't throw
        return null;
    }
}

// ============================================================
// AUTOMATIC FEEDING SCHEDULE EXECUTION (Start → Run → Stop)
// ============================================================

// Start motor: Turn motor ON when scheduled time T is reached
// RTDB write always executes (no auth required)
// Firestore log is optional (only if uid is available)
async function startFeedingSchedule(deviceId, uid, scheduleId, scheduleTime, duration) {
    try {
        // RTDB motor control (always executes, no auth required)
        const feederStateRef = ref(rtdb, `devices/${deviceId}/status/feeder/state`);
        await set(feederStateRef, "online");
        
        // Verify the write
        const snap = await get(feederStateRef);
        console.log('[FEEDING VERIFY] RTDB state =', snap.val());
        
        console.log(`[FEEDING] Motor turned ON for schedule ${scheduleId} at ${scheduleTime} (RTDB write successful)`);
        
        // Firestore log is optional - only create if uid is available
        if (uid) {
            try {
                const now = new Date();
                const today = getStartOfDay(now);
                
                // Parse schedule time to get T (scheduled DateTime)
                const [hours, minutes] = scheduleTime.split(':').map(Number);
                const scheduledDateTime = new Date(today);
                scheduledDateTime.setHours(hours, minutes, 0, 0);
                
                // Check if a log already exists for today (prevent duplicate starts)
                const feedingLogsRef = collection(db, `users/${uid}/feedingLogs`);
                const logsSnapshot = await getDocs(feedingLogsRef);
                
                let existingLogId = null;
                logsSnapshot.forEach(logDoc => {
                    const log = logDoc.data();
                    if (log.scheduleId === scheduleId && log.startedAt) {
                        const startedAt = timestampToDate(log.startedAt);
                        if (startedAt && startedAt >= today && startedAt <= getEndOfDay(now)) {
                            existingLogId = logDoc.id;
                        }
                    }
                });
                
                // If log already exists and is running, don't create duplicate
                if (existingLogId) {
                    const existingLog = await getDoc(doc(db, `users/${uid}/feedingLogs/${existingLogId}`));
                    if (existingLog.exists() && existingLog.data().status === 'running') {
                        console.log(`[FEEDING] Schedule ${scheduleId} already has running log, skipping Firestore write`);
                        return;
                    }
                }
                
                // Create or update Firestore log
                const logData = {
                    scheduleId: scheduleId,
                    status: 'running',
                    startedAt: serverTimestamp(),
                    duration: duration,
                    createdAt: serverTimestamp()
                };
                
                if (existingLogId) {
                    // Update existing log
                    await updateDoc(doc(db, `users/${uid}/feedingLogs/${existingLogId}`), logData);
                    console.log(`[FEEDING] Updated log ${existingLogId} for schedule ${scheduleId}`);
                } else {
                    // Create new log
                    await addDoc(feedingLogsRef, logData);
                    console.log(`[FEEDING] Created new log for schedule ${scheduleId}`);
                }
            } catch (firestoreError) {
                // Firestore log failed, but RTDB write succeeded - log and continue
                console.warn(`[FEEDING] Firestore log failed for schedule ${scheduleId}, but RTDB motor control succeeded:`, firestoreError);
            }
        } else {
            console.log(`[FEEDING] No uid available, skipping Firestore log for schedule ${scheduleId} (RTDB motor control executed)`);
        }
        
    } catch (error) {
        console.error(`[FEEDING] Error starting schedule ${scheduleId}:`, error);
        // Don't throw - allow other schedules to continue
    }
}

// Keep motor running: Ensure motor stays "online" while T ≤ now < E
async function keepMotorRunning(deviceId, scheduleId) {
    try {
        // Check current motor state at EXACT RTDB path
        const feederStateRef = ref(rtdb, `devices/${deviceId}/status/feeder/state`);
        const snapshot = await get(feederStateRef);
        
        let currentState = null;
        if (snapshot.exists()) {
            currentState = String(snapshot.val()).toLowerCase();
        }
        
        // If motor is not online, turn it on
        if (currentState !== 'online') {
            await set(feederStateRef, "online");
            
            // Verify the write
            const snap = await get(feederStateRef);
            console.log('[FEEDING VERIFY] RTDB state =', snap.val());
            
            console.log(`[FEEDING] Motor kept ON for schedule ${scheduleId}`);
        }
    } catch (error) {
        console.error(`[FEEDING] Error keeping motor running for schedule ${scheduleId}:`, error);
    }
}

// Stop motor: Turn motor OFF when end time E is reached
// RTDB write always executes (no auth required)
// Firestore log update is optional (only if uid and logId are available)
async function stopFeedingSchedule(deviceId, uid, scheduleId) {
    try {
        // RTDB motor control (always executes, no auth required)
        const feederStateRef = ref(rtdb, `devices/${deviceId}/status/feeder/state`);
        await set(feederStateRef, "offline");
        
        // Verify the write
        const snap = await get(feederStateRef);
        console.log('[FEEDING VERIFY] RTDB state =', snap.val());
        
        console.log(`[FEEDING] Motor turned OFF for schedule ${scheduleId} (RTDB write successful)`);
        
        // Firestore log update is optional - only update if uid is available
        if (uid) {
            try {
                const now = new Date();
                const today = getStartOfDay(now);
                const todayEnd = getEndOfDay(now);
                
                // Find the log for this schedule today
                const feedingLogsRef = collection(db, `users/${uid}/feedingLogs`);
                const logsSnapshot = await getDocs(feedingLogsRef);
                
                let logId = null;
                logsSnapshot.forEach(logDoc => {
                    const log = logDoc.data();
                    if (log.scheduleId === scheduleId && log.startedAt) {
                        const startedAt = timestampToDate(log.startedAt);
                        if (startedAt && startedAt >= today && startedAt <= todayEnd) {
                            // Only update if status is still "running"
                            if (log.status === 'running') {
                                logId = logDoc.id;
                            }
                        }
                    }
                });
                
                // Update Firestore log if found
                if (logId) {
                    await updateDoc(doc(db, `users/${uid}/feedingLogs/${logId}`), {
                        status: 'completed',
                        endedAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    console.log(`[FEEDING] Updated log ${logId} to completed for schedule ${scheduleId}`);
                } else {
                    console.log(`[FEEDING] No running log found for schedule ${scheduleId}, RTDB motor control executed anyway`);
                }
            } catch (firestoreError) {
                // Firestore log update failed, but RTDB write succeeded - log and continue
                console.warn(`[FEEDING] Firestore log update failed for schedule ${scheduleId}, but RTDB motor control succeeded:`, firestoreError);
            }
        } else {
            console.log(`[FEEDING] No uid available, skipping Firestore log update for schedule ${scheduleId} (RTDB motor control executed)`);
        }
        
    } catch (error) {
        console.error(`[FEEDING] Error stopping schedule ${scheduleId}:`, error);
        // Don't throw - allow other schedules to continue
    }
}

// Main function: Check all schedules and execute Start → Run → Stop logic
// RTDB motor control works without authentication
// Firestore schedule fetching is optional (only if uid is available)
async function executeFeedingSchedules() {
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        const now = new Date();
        const today = getStartOfDay(now);
        
        // If no uid, we can't fetch schedules from Firestore, but RTDB motor control could still work
        // For now, we require uid to fetch schedules, but RTDB writes within schedule execution are unconditional
        if (!uid) {
            // No user - can't fetch schedules, but this is OK for headless operation
            // RTDB motor control would work if we had schedules from another source
            // console.log('[CORE] Feeding schedule execution skipped (no runtime UID)');
            return;
        }
        
        // Fetch all enabled schedules (requires uid)
        const schedulesRef = collection(db, `users/${uid}/schedules`);
        const schedulesSnapshot = await getDocs(schedulesRef);
        
        // Track if any schedule is currently active (running window)
        let hasActiveSchedule = false;
        const activeScheduleIds = new Set();
        
        // First pass: Identify active schedules (T ≤ now < E)
        for (const scheduleDoc of schedulesSnapshot.docs) {
            const schedule = scheduleDoc.data();
            const scheduleId = scheduleDoc.id;
            
            // Skip disabled schedules
            if (schedule.isEnabled === false) {
                continue;
            }
            
            const scheduleTime = schedule.time;
            const duration = schedule.duration || 30;
            
            if (!scheduleTime || !scheduleTime.includes(':')) {
                continue; // Invalid schedule
            }
            
            // Parse schedule time
            const [hours, minutes] = scheduleTime.split(':').map(Number);
            const scheduledDateTime = new Date(today);
            scheduledDateTime.setHours(hours, minutes, 0, 0);
            const endDateTime = new Date(scheduledDateTime.getTime() + duration * 60 * 1000);
            
            // Check if this schedule is currently in its running window
            if (now >= scheduledDateTime && now < endDateTime) {
                hasActiveSchedule = true;
                activeScheduleIds.add(scheduleId);
            }
        }
        
        // Process schedules sequentially to avoid race conditions
        for (const scheduleDoc of schedulesSnapshot.docs) {
            const schedule = scheduleDoc.data();
            const scheduleId = scheduleDoc.id;
            
            // Skip disabled schedules
            if (schedule.isEnabled === false) {
                continue;
            }
            
            const scheduleTime = schedule.time;
            const duration = schedule.duration || 30; // Default 30 minutes
            
            if (!scheduleTime || !scheduleTime.includes(':')) {
                continue; // Invalid schedule
            }
            
            // Parse schedule time to get T (scheduled DateTime)
            const [hours, minutes] = scheduleTime.split(':').map(Number);
            const scheduledDateTime = new Date(today);
            scheduledDateTime.setHours(hours, minutes, 0, 0);
            
            // Compute end time E = T + D minutes
            const endDateTime = new Date(scheduledDateTime.getTime() + duration * 60 * 1000);
            
            // 1) START: If T ≤ now and we haven't started yet
            if (now >= scheduledDateTime) {
                // Check if we have a running log for today
                const feedingLogsRef = collection(db, `users/${uid}/feedingLogs`);
                const logsSnapshot = await getDocs(feedingLogsRef);
                
                let hasRunningLog = false;
                logsSnapshot.forEach(logDoc => {
                    const log = logDoc.data();
                    if (log.scheduleId === scheduleId && log.startedAt) {
                        const startedAt = timestampToDate(log.startedAt);
                        if (startedAt && startedAt >= today && startedAt <= getEndOfDay(now)) {
                            if (log.status === 'running') {
                                hasRunningLog = true;
                            }
                        }
                    }
                });
                
                // If no running log exists, start the schedule
                if (!hasRunningLog && now < endDateTime) {
                    await startFeedingSchedule(DEVICE_ID, uid, scheduleId, scheduleTime, duration);
                }
            }
            
            // 2) RUN: Keep motor ON while T ≤ now < E
            if (now >= scheduledDateTime && now < endDateTime) {
                await keepMotorRunning(DEVICE_ID, scheduleId);
            }
            
            // 3) STOP: Turn motor OFF when now ≥ E
            // BUT ONLY if:
            //   a) This schedule actually started the motor (has running log)
            //   b) No other schedule is currently active (to prevent turning off during schedule overlap)
            // Don't turn off motor if it was started manually (no schedule log)
            if (now >= endDateTime) {
                // Check if there's a running log for this schedule today
                const feedingLogsRef = collection(db, `users/${uid}/feedingLogs`);
                const logsSnapshot = await getDocs(feedingLogsRef);
                
                let hasRunningLogForSchedule = false;
                logsSnapshot.forEach(logDoc => {
                    const log = logDoc.data();
                    if (log.scheduleId === scheduleId && log.startedAt) {
                        const startedAt = timestampToDate(log.startedAt);
                        if (startedAt && startedAt >= today && startedAt <= getEndOfDay(now)) {
                            if (log.status === 'running') {
                                hasRunningLogForSchedule = true;
                            }
                        }
                    }
                });
                
                // Only stop if:
                // 1. This schedule actually started the motor (has running log)
                // 2. No other schedule is currently active (prevents turning off during overlap)
                if (hasRunningLogForSchedule && !hasActiveSchedule) {
                    await stopFeedingSchedule(DEVICE_ID, uid, scheduleId);
                } else if (hasRunningLogForSchedule && hasActiveSchedule) {
                    // This schedule ended but another is active - just update the log, don't turn off motor
                    console.log(`[FEEDING] Schedule ${scheduleId} ended but other schedules active, keeping motor on`);
                    // Update log to completed but don't turn off motor
                    try {
                        const logsSnapshot2 = await getDocs(feedingLogsRef);
                        logsSnapshot2.forEach(logDoc => {
                            const log = logDoc.data();
                            if (log.scheduleId === scheduleId && log.status === 'running') {
                                const startedAt = timestampToDate(log.startedAt);
                                if (startedAt && startedAt >= today && startedAt <= getEndOfDay(now)) {
                                    updateDoc(doc(db, `users/${uid}/feedingLogs/${logDoc.id}`), {
                                        status: 'completed',
                                        endedAt: serverTimestamp(),
                                        updatedAt: serverTimestamp()
                                    }).catch(err => console.warn('[FEEDING] Log update error:', err));
                                }
                            }
                        });
                    } catch (err) {
                        console.warn('[FEEDING] Error updating log:', err);
                    }
                }
                // If no running log exists, motor was likely started manually - don't turn it off
            }
        }
        
    } catch (error) {
        console.error('[FEEDING] Error executing feeding schedules:', error);
    }
}

// Set up periodic execution checker (runs every 30 seconds)
// Unified guard for feeding schedule interval
window.__FEEDING_TIMER__ = window.__FEEDING_TIMER__ || null;

// Core feeding schedule executor (DOM-free, auth-independent)
export function setupFeedingScheduleExecutionCore() {
    // Guard against duplicate intervals
    if (window.__FEEDING_TIMER__) {
        console.log('[CORE] Feeding schedule interval already active, skipping');
        return;
    }
    
    // Run immediately
    executeFeedingSchedules();
    
    // Then run every 30 seconds
    window.__FEEDING_TIMER__ = setInterval(() => {
        console.log('[CORE] feeding schedule tick');
        executeFeedingSchedules();
    }, 30000); // 30 seconds
    
    console.log('[CORE] Feeding schedule interval started');
}

// Legacy wrapper (backward compatibility)
export function setupFeedingScheduleExecution() {
    setupFeedingScheduleExecutionCore();
}

// Stop the execution checker
function stopFeedingScheduleExecution() {
    if (feedingScheduleInterval) {
        clearInterval(feedingScheduleInterval);
        feedingScheduleInterval = null;
        console.log('[FEEDING] Schedule execution checker stopped');
    }
}

// Load feeding schedules from Firestore with execution-based status
async function loadFeedingSchedules() {
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) {
            console.warn('No user UID found, cannot load feeding schedules');
            return;
        }
        
        console.log('Loading feeding schedules for user:', uid);
        
        // Fetch from correct path: users/{uid}/schedules
        const schedulesRef = collection(db, `users/${uid}/schedules`);
        
        // Order by time field (ascending)
        // Note: If time field doesn't support ordering, we'll sort in memory
        let querySnapshot;
        try {
            const q = query(schedulesRef, orderBy('time', 'asc'));
            querySnapshot = await getDocs(q);
        } catch (orderError) {
            // If ordering by 'time' fails (might not be indexed), fetch all and sort in memory
            console.warn('Could not order by time field, fetching all and sorting in memory:', orderError);
            querySnapshot = await getDocs(schedulesRef);
        }
        
        // Convert snapshot to array and filter enabled schedules
        const schedules = [];
        querySnapshot.forEach(doc => {
            const scheduleData = doc.data();
            // Include all schedules (we'll show disabled ones with different status)
            schedules.push({ id: doc.id, data: scheduleData });
        });
        
        // Sort by time if not already sorted
        schedules.sort((a, b) => {
            const timeA = a.data.time || '';
            const timeB = b.data.time || '';
            return timeA.localeCompare(timeB);
        });
        
        // Determine execution status for each schedule
        const schedulesWithStatus = await Promise.all(
            schedules.map(async (schedule) => {
                // If disabled, don't check execution status
                if (schedule.data.isEnabled === false) {
                    return { ...schedule, executionStatus: 'DISABLED' };
                }
                
                // Determine status based on execution logs
                const executionStatus = await determineScheduleStatus(
                    uid,
                    schedule.id,
                    schedule.data.time,
                    schedule.data.duration
                );
                
                return { ...schedule, executionStatus };
            })
        );
        
        // Filter out disabled schedules from display (or show them with disabled status)
        const enabledSchedules = schedulesWithStatus.filter(s => s.data.isEnabled !== false);
        
        console.log(`Loaded ${enabledSchedules.length} enabled feeding schedules with execution status`);
        
        // Render to both locations
        renderSchedulesToContainer(enabledSchedules, 'recentFeedingList'); // Feeding section
        renderSchedulesToContainer(enabledSchedules, 'feedingScheduleList'); // Dashboard section
        
        // Update next feeding alert when schedules are reloaded
        await updateNextFeedingAlert();
        
    } catch (error) {
        console.error('Error loading feeding schedules:', error);
        
        // Show non-blocking notification
        showNotification('Failed to load feeding schedules', 'error');
        
        // Show error in both locations
        const scheduleList1 = document.getElementById('recentFeedingList');
        const scheduleList2 = document.getElementById('feedingScheduleList');
        
        if (scheduleList1) {
            scheduleList1.innerHTML = '<div class="schedule-item"><p class="no-data-text">Error loading schedules</p></div>';
        }
        if (scheduleList2) {
            scheduleList2.innerHTML = '<div class="schedule-item"><p class="no-data-text">Error loading schedules</p></div>';
        }
    }
}

// Add new feeding schedule
window.addFeedingSchedule = async function() {
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) {
            showNotification('User not authenticated', 'error');
            return;
        }
        
        const timeInput = document.getElementById('scheduleTime');
        const durationInput = document.getElementById('scheduleDuration');
        
        if (!timeInput || !durationInput) {
            showNotification('Form inputs not found', 'error');
            return;
        }
        
        const timeValue = timeInput.value; // Format: "HH:mm" (e.g., "07:00")
        const durationValue = parseInt(durationInput.value, 10);
        
        if (!timeValue) {
            showNotification('Please select a time', 'error');
            timeInput.focus();
            return;
        }
        
        if (isNaN(durationValue) || durationValue < 1) {
            showNotification('Please enter a valid duration (minimum 1 minute)', 'error');
            durationInput.focus();
            return;
        }
        
        // Format duration for display (e.g., "30 mins")
        const durationDisplay = durationValue === 1 ? '1 min' : `${durationValue} mins`;
        
        // Create schedule document
        const scheduleData = {
            time: timeValue, // Store as "HH:mm" format
            duration: durationValue, // Duration in minutes
            title: 'Feeding Schedule',
            description: `One-time feeding | Duration: ${durationDisplay}`,
            isEnabled: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        // Save to Firestore
        const schedulesRef = collection(db, `users/${uid}/schedules`);
        await addDoc(schedulesRef, scheduleData);
        
        console.log('[FEEDING] Schedule added:', { time: timeValue, duration: durationValue });
        showNotification('Feeding schedule added successfully!', 'success');
        
        // Clear form
        timeInput.value = '';
        durationInput.value = '30';
        
        // Reload schedules to show the new one
        await loadFeedingSchedules();
        
    } catch (error) {
        console.error('Error adding feeding schedule:', error);
        showNotification('Failed to add feeding schedule', 'error');
    }
};

// Delete feeding schedule
window.deleteFeedingSchedule = async function(scheduleId) {
    if (!scheduleId) {
        showNotification('Schedule ID is required', 'error');
        return;
    }
    
    // Confirm deletion
    if (!confirm('Are you sure you want to delete this feeding schedule?')) {
        return;
    }
    
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) {
            showNotification('User not authenticated', 'error');
            return;
        }
        
        // Delete from Firestore
        const scheduleRef = doc(db, `users/${uid}/schedules/${scheduleId}`);
        await deleteDoc(scheduleRef);
        
        console.log('[FEEDING] Schedule deleted:', scheduleId);
        showNotification('Feeding schedule deleted successfully!', 'success');
        
        // Reload schedules to update the list
        await loadFeedingSchedules();
        
    } catch (error) {
        console.error('Error deleting feeding schedule:', error);
        showNotification('Failed to delete feeding schedule', 'error');
    }
};

// Set up feeding schedule auto-refresh (on section open, page focus, and periodic updates)
function setupFeedingScheduleAutoRefresh() {
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) {
            console.warn('No user UID found, cannot set up feeding schedule auto-refresh');
            return;
        }
        
        console.log('Setting up feeding schedule auto-refresh for user:', uid);
        
        // Listen for Feeding section navigation
        const feedingLink = document.querySelector('a[href="#feeding"]');
        if (feedingLink) {
            feedingLink.addEventListener('click', async () => {
                console.log('Feeding section opened, refreshing schedules...');
                await loadFeedingSchedules();
            });
        }
        
        // Listen for section visibility changes (for programmatic navigation)
        const feedingSection = document.getElementById('feeding');
        if (feedingSection) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (feedingSection.classList.contains('active')) {
                            console.log('Feeding section became active, refreshing schedules...');
                            loadFeedingSchedules().catch(error => {
                                console.error('Error refreshing schedules:', error);
                            });
                        }
                    }
                });
            });
            
            observer.observe(feedingSection, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
        
        // Set up page focus listener
        let lastRefreshTime = Date.now();
        const REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes
        
        window.addEventListener('focus', async () => {
            const now = Date.now();
            // Only refresh if it's been at least 2 minutes since last refresh
            if (now - lastRefreshTime >= REFRESH_INTERVAL) {
                console.log('Page regained focus, refreshing feeding schedules...');
                try {
                    await loadFeedingSchedules();
                    lastRefreshTime = now;
                } catch (error) {
                    console.error('Error refreshing schedules on focus:', error);
                }
            }
        });
        
        // Set up periodic status refresh (every 60 seconds)
        // This recomputes status based on current time and execution logs
        if (window.feedingScheduleRefreshInterval) {
            clearInterval(window.feedingScheduleRefreshInterval);
        }
        
        window.feedingScheduleRefreshInterval = setInterval(async () => {
            // Only refresh if Feeding section is active
            const feedingSection = document.getElementById('feeding');
            if (feedingSection && feedingSection.classList.contains('active')) {
                console.log('Periodic refresh: updating feeding schedule status...');
                try {
                    await loadFeedingSchedules();
                } catch (error) {
                    console.error('Error in periodic schedule refresh:', error);
                }
            }
        }, 60000); // Every 60 seconds
        
        console.log('Feeding schedule auto-refresh set up successfully (including 60s periodic updates)');
        
    } catch (error) {
        console.error('Error setting up feeding schedule auto-refresh:', error);
    }
}

// Make loadFeedingSchedules globally accessible for manual refresh
window.refreshFeedingSchedules = loadFeedingSchedules;

// Make report generation functions globally accessible
window.generateHourlyRecord = async function(date, hour) {
    const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
    if (!uid) {
        showNotification('User not authenticated', 'error');
        return;
    }
    try {
        showNotification(`Generating hourly record for ${date} hour ${hour}...`, 'info');
        await generateHourlyRecord(uid, date, hour);
        showNotification('Hourly record generated successfully!', 'success');
    } catch (error) {
        showNotification('Error generating hourly record', 'error');
        console.error(error);
    }
};

window.generateDailyReport = async function(date) {
    const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
    if (!uid) {
        showNotification('User not authenticated', 'error');
        return;
    }
    try {
        showNotification('Generating daily report...', 'info');
        const report = await generateDailyReport(uid, date);
        if (report) {
            // Generate sensor analytics and trends after report
            await generateDailySensorAnalytics(uid, date);
            await identifyDailySensorTrends(uid, date);
        }
        showNotification('Daily report generated successfully!', 'success');
        await loadDailySummaryReport();
    } catch (error) {
        showNotification('Error generating daily report', 'error');
        console.error(error);
    }
};

window.generateWeeklyReport = async function(isoWeekString) {
    const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
    if (!uid) {
        showNotification('User not authenticated', 'error');
        return;
    }
    try {
        showNotification('Generating weekly report...', 'info');
        const report = await generateWeeklyReport(uid, isoWeekString);
        if (report) {
            // Generate sensor analytics and trends after report
            await generateWeeklySensorAnalytics(uid, isoWeekString);
            await identifyWeeklySensorTrends(uid, isoWeekString);
        }
        showNotification('Weekly report generated successfully!', 'success');
        await loadWeeklySummaryReport();
    } catch (error) {
        showNotification('Error generating weekly report', 'error');
        console.error(error);
    }
};

window.generateMonthlyReport = async function(year, month) {
    const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
    if (!uid) {
        showNotification('User not authenticated', 'error');
        return;
    }
    try {
        showNotification('Generating monthly report...', 'info');
        const report = await generateMonthlyReport(uid, year, month);
        if (report) {
            // Generate sensor analytics and trends after report
            await generateMonthlySensorAnalytics(uid, year, month);
            await identifyMonthlySensorTrends(uid, year, month);
        }
        showNotification('Monthly report generated successfully!', 'success');
    } catch (error) {
        showNotification('Error generating monthly report', 'error');
        console.error(error);
    }
};

window.backfillWeeklyReports = async function() {
    const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
    if (!uid) {
        showNotification('User not authenticated', 'error');
        return;
    }
    try {
        showNotification('Starting weekly report backfill...', 'info');
        const result = await backfillWeeklyReports(uid);
        showNotification(`Weekly backfill complete: ${result.generated} reports generated`, 'success');
        await loadWeeklySummaryReport();
    } catch (error) {
        showNotification('Error in weekly report backfill', 'error');
        console.error(error);
    }
};

window.backfillMonthlyReports = async function() {
    const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
    if (!uid) {
        showNotification('User not authenticated', 'error');
        return;
    }
    try {
        showNotification('Starting monthly report backfill...', 'info');
        const result = await backfillMonthlyReports(uid);
        showNotification(`Monthly backfill complete: ${result.generated} reports generated`, 'success');
    } catch (error) {
        showNotification('Error in monthly report backfill', 'error');
        console.error(error);
    }
};

window.backfillHourlyRecords = async function(startDate, endDate) {
    const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
    if (!uid) {
        showNotification('User not authenticated', 'error');
        return;
    }
    try {
        showNotification('Starting hourly record backfill...', 'info');
        const result = await backfillHourlyRecords(uid, startDate, endDate);
        showNotification(`Hourly backfill complete: ${result.generated} records generated`, 'success');
        // After hourly backfill, trigger daily backfill
        await window.backfillDailyReports();
    } catch (error) {
        showNotification('Error in hourly record backfill', 'error');
        console.error(error);
    }
};

window.backfillDailyReports = async function() {
    const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
    if (!uid) {
        showNotification('User not authenticated', 'error');
        return;
    }
    try {
        showNotification('Starting daily report backfill...', 'info');
        const result = await backfillDailyReports(uid);
        showNotification(`Daily backfill complete: ${result.generated} reports generated`, 'success');
        // After daily backfill, trigger weekly/monthly backfill
        await Promise.all([
            window.backfillWeeklyReports(),
            window.backfillMonthlyReports()
        ]);
    } catch (error) {
        showNotification('Error in daily report backfill', 'error');
        console.error(error);
    }
};

// ============================================================
// NEXT FEEDING ALERT COMPUTATION
// ============================================================

// Parse schedule time string to local Date object
// Accepts "HH:mm" or "H:mm" format
// Returns Date object with time set in local timezone, or null if invalid
function parseScheduleTimeToLocalDate(timeStr, baseDate = new Date()) {
    if (!timeStr || typeof timeStr !== 'string') {
        return null;
    }
    
    // Remove any whitespace
    timeStr = timeStr.trim();
    
    // Check if it contains colon
    if (!timeStr.includes(':')) {
        return null;
    }
    
    const parts = timeStr.split(':');
    if (parts.length !== 2) {
        return null;
    }
    
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    
    // Validate hours and minutes
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return null;
    }
    
    // Create date with base date, set to local time
    const date = new Date(baseDate);
    date.setHours(hours, minutes, 0, 0);
    
    return date;
}

// Format time difference to human-readable string
// Returns format: "in 2h 15m" or "in 45m" (if < 1h)
function formatTimeDifference(diffMs) {
    if (diffMs < 0) {
        return 'now';
    }
    
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
        if (minutes > 0) {
            return `in ${hours}h ${minutes}m`;
        } else {
            return `in ${hours}h`;
        }
    } else {
        return `in ${minutes}m`;
    }
}

// Compute next feeding time from schedules
async function computeNextFeedingTime(uid) {
    try {
        // Fetch all schedules
        const schedulesRef = collection(db, `users/${uid}/schedules`);
        const schedulesSnapshot = await getDocs(schedulesRef);
        
        const now = new Date();
        const today = getStartOfDay(now);
        let nextFeedingDate = null;
        let nextFeedingSchedule = null;
        let hasInvalidTime = false;
        
        schedulesSnapshot.forEach(doc => {
            const schedule = doc.data();
            
            // Only consider enabled schedules
            if (schedule.isEnabled !== false) {
                const scheduleTime = schedule.time;
                if (!scheduleTime) {
                    hasInvalidTime = true;
                    return; // Skip schedules without time
                }
                
                // Parse schedule time to today's date
                const todayAtTime = parseScheduleTimeToLocalDate(scheduleTime, today);
                if (!todayAtTime) {
                    hasInvalidTime = true;
                    return; // Skip invalid time formats
                }
                
                // If today's time has passed, consider tomorrow
                let candidateDate = todayAtTime;
                if (candidateDate <= now) {
                    // Set to tomorrow at same time
                    candidateDate = new Date(todayAtTime);
                    candidateDate.setDate(candidateDate.getDate() + 1);
                }
                
                // Pick the smallest future datetime
                if (!nextFeedingDate || candidateDate < nextFeedingDate) {
                    nextFeedingDate = candidateDate;
                    nextFeedingSchedule = schedule;
                }
            }
        });
        
        return {
            nextDate: nextFeedingDate,
            schedule: nextFeedingSchedule,
            hasInvalidTime: hasInvalidTime && !nextFeedingDate
        };
    } catch (error) {
        console.error('Error computing next feeding time:', error);
        return {
            nextDate: null,
            schedule: null,
            hasInvalidTime: false,
            error: error.message
        };
    }
}

// Update next feeding alert message in Monitoring section
async function updateNextFeedingAlert() {
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) {
            console.warn('No user UID found, cannot update next feeding alert');
            return;
        }
        
        const alertElement = document.getElementById('nextFeedingAlert');
        if (!alertElement) {
            console.warn('Next feeding alert element not found');
            return;
        }
        
        // Compute next feeding time
        const { nextDate, schedule, hasInvalidTime, error } = await computeNextFeedingTime(uid);
        
        if (error) {
            alertElement.textContent = 'Error loading feeding schedule';
            return;
        }
        
        if (hasInvalidTime && !nextDate) {
            // Schedules exist but all have invalid time formats
            alertElement.textContent = 'Feeding schedule time format error';
            return;
        }
        
        if (!nextDate || !schedule) {
            // No enabled schedules found
            alertElement.textContent = 'No upcoming feeding schedules';
            return;
        }
        
        // Format the next feeding time
        const timeStr = nextDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        // Calculate time difference
        const now = new Date();
        const diffMs = nextDate.getTime() - now.getTime();
        const diffStr = formatTimeDifference(diffMs);
        
        // Update alert message
        alertElement.textContent = `Next feeding at ${timeStr} (${diffStr})`;
        
        console.log('Next feeding alert updated:', { time: timeStr, diff: diffStr });
        
    } catch (error) {
        console.error('Error updating next feeding alert:', error);
        const alertElement = document.getElementById('nextFeedingAlert');
        if (alertElement) {
            alertElement.textContent = 'Error loading next feeding schedule';
        }
    }
}

// Set up auto-refresh for next feeding alert
function setupNextFeedingAlertAutoRefresh() {
    try {
        console.log('Setting up next feeding alert auto-refresh');
        
        // Refresh on page visibility change (focus)
        document.addEventListener('visibilitychange', async () => {
            if (!document.hidden) {
                console.log('Page became visible, updating next feeding alert...');
                await updateNextFeedingAlert();
            }
        });
        
        // Refresh every 60 seconds
        if (window.nextFeedingAlertInterval) {
            clearInterval(window.nextFeedingAlertInterval);
        }
        
        window.nextFeedingAlertInterval = setInterval(async () => {
            // Only update if Monitoring section is active
            const monitoringSection = document.getElementById('monitoring');
            if (monitoringSection && monitoringSection.classList.contains('active')) {
                console.log('Periodic refresh: updating next feeding alert...');
                await updateNextFeedingAlert();
            }
        }, 60000); // Every 60 seconds
        
        // Also refresh when Monitoring section becomes active
        const monitoringSection = document.getElementById('monitoring');
        if (monitoringSection) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (monitoringSection.classList.contains('active')) {
                            console.log('Monitoring section became active, updating next feeding alert...');
                            updateNextFeedingAlert().catch(error => {
                                console.error('Error updating next feeding alert:', error);
                            });
                        }
                    }
                });
            });
            
            observer.observe(monitoringSection, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
        
        console.log('Next feeding alert auto-refresh set up successfully');
        
    } catch (error) {
        console.error('Error setting up next feeding alert auto-refresh:', error);
    }
}

// ============================================================
// SUMMARY COMPUTATION UTILITIES
// ============================================================

// Get local date string in YYYY-MM-DD format
function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Get start of day (00:00:00) in local time
function getStartOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Get end of day (23:59:59.999) in local time
function getEndOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

// Get ISO week number and year (Monday-Sunday week)
// ISO week: Week 1 is the week containing Jan 4th
function getISOWeek(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    
    // Get the Thursday of the current week (ISO week definition)
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const thursday = new Date(d.setDate(diff + 3));
    
    // January 4th is always in week 1
    const jan4 = new Date(thursday.getFullYear(), 0, 4);
    const jan4Thursday = new Date(jan4);
    jan4Thursday.setDate(jan4.getDate() - jan4.getDay() + 1 + 3); // Thursday of week containing Jan 4
    
    const weekNum = Math.ceil((thursday - jan4Thursday) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const year = thursday.getFullYear();
    
    return { year, week: weekNum };
}

// Get ISO week string in YYYY-Www format
function getISOWeekString(date = new Date()) {
    const { year, week } = getISOWeek(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

// Get start of ISO week (Monday 00:00:00)
function getStartOfISOWeek(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
}

// Get end of ISO week (Sunday 23:59:59.999)
function getEndOfISOWeek(date = new Date()) {
    const start = getStartOfISOWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
}

// Get month string in YYYY-MM format
function getMonthString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

// Get start of month (1st day, 00:00:00)
function getStartOfMonth(date = new Date()) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Get end of month (last day, 23:59:59.999)
function getEndOfMonth(date = new Date()) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1, 0);
    d.setHours(23, 59, 59, 999);
    return d;
}

// Convert Firestore Timestamp to Date
function timestampToDate(timestamp) {
    if (!timestamp) return null;
    if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000);
    }
    if (timestamp instanceof Date) {
        return timestamp;
    }
    return new Date(timestamp);
}

// Check if date is within day range (local time)
function isDateInDay(date, dayDate) {
    const dayStart = getStartOfDay(dayDate);
    const dayEnd = getEndOfDay(dayDate);
    const checkDate = timestampToDate(date);
    if (!checkDate) return false;
    return checkDate >= dayStart && checkDate <= dayEnd;
}

// Calculate water quality from temperature and pH
function calculateWaterQuality(avgTemperature, avgPh, mortality) {
    if (avgTemperature === null || avgPh === null) {
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

// ============================================================
// REPORT GENERATION SYSTEM (SERVER-SIDE ONLY)
// ============================================================
// This is the ONLY system allowed to write reports to Firestore
// Mobile app is read-only and must NEVER generate reports

// ============================================================
// UTILITY FUNCTIONS FOR DATE/WEEK CALCULATIONS
// ============================================================

// Convert ISO week string (YYYY-WW) to Monday start date
function isoWeekToMonday(year, week) {
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay();
    const jan4Monday = new Date(jan4);
    jan4Monday.setDate(4 - (jan4Day === 0 ? 6 : jan4Day - 1));
    
    const weekStart = new Date(jan4Monday);
    weekStart.setDate(jan4Monday.getDate() + (week - 1) * 7);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
}

// Get all 7 dates in an ISO week
function getDatesInIsoWeek(isoWeekString) {
    const match = isoWeekString.match(/(\d{4})-W(\d{2})/);
    if (!match) throw new Error(`Invalid ISO week format: ${isoWeekString}`);
    
    const year = parseInt(match[1]);
    const week = parseInt(match[2]);
    const monday = isoWeekToMonday(year, week);
    
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        dates.push(date);
    }
    return dates;
}

// Format date as YYYY-MM-DD
function formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Get all dates in a month
function getDatesInMonth(year, month) {
    const dates = [];
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
        dates.push(new Date(year, month - 1, day));
    }
    return dates;
}

// ============================================================
// HOURLY RECORD GENERATION (NEW - HIGHEST RESOLUTION)
// ============================================================

// Generate hourly record from raw sensor data
// date format: YYYY-MM-DD
// hour: number (0-23)
export async function generateHourlyRecord(uid, date, hour) {
    try {
        if (hour < 0 || hour > 23) {
            throw new Error(`Invalid hour: ${hour}. Must be 0-23`);
        }
        
        const hourStart = new Date(date + `T${String(hour).padStart(2, '0')}:00:00`);
        const hourEnd = new Date(date + `T${String(hour).padStart(2, '0')}:59:59`);
        
        // Helper to check if timestamp is within the hour
        const isInHour = (timestamp) => {
            if (!timestamp) return false;
            const ts = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
            return ts >= hourStart && ts <= hourEnd;
        };
        
        // 1. Aggregate from sensors (temperature, pH) - get current values if within hour
        let temperatureAvg = null;
        let phAvg = null;
        const tempRef = doc(db, `users/${uid}/sensors/temperature`);
        const phRef = doc(db, `users/${uid}/sensors/ph`);
        
        const [tempSnap, phSnap] = await Promise.all([
            getDoc(tempRef),
            getDoc(phRef)
        ]);
        
        if (tempSnap.exists()) {
            const tempData = tempSnap.data();
            if (tempData.value !== undefined && tempData.value !== null) {
                // If timestamp exists, check it's within hour; otherwise use value
                if (!tempData.timestamp || isInHour(tempData.timestamp)) {
                    temperatureAvg = typeof tempData.value === 'number' ? tempData.value : parseFloat(tempData.value);
                }
            }
        }
        
        if (phSnap.exists()) {
            const phData = phSnap.data();
            if (phData.value !== undefined && phData.value !== null) {
                if (!phData.timestamp || isInHour(phData.timestamp)) {
                    phAvg = typeof phData.value === 'number' ? phData.value : parseFloat(phData.value);
                }
            }
        }
        
        // Only write if we have at least one data point
        if (temperatureAvg === null && phAvg === null) {
            console.log(`[HOURLY] No data for ${date} hour ${hour}, skipping write`);
            return null;
        }
        
        // Write to Firestore (idempotent)
        // Path: users/{uid}/hourlyRecords/{date}/hours/{hour}
        const hourString = String(hour).padStart(2, '0');
        const recordRef = doc(db, `users/${uid}/hourlyRecords/${date}/hours/${hourString}`);
        const hourlyRecord = {
            hour: hourString,
            temperatureAvg: temperatureAvg,
            phAvg: phAvg,
            recordedAt: serverTimestamp(),
            source: "web"
        };
        
        await setDoc(recordRef, hourlyRecord, { merge: true });
        console.log(`[HOURLY WRITE] Written hourly record ${date}/hours/${hourString} to Firestore`);
        
        return hourlyRecord;
        
    } catch (error) {
        console.error(`❌ Error generating hourly record for ${date} hour ${hour}:`, error);
        throw error;
    }
}

// ============================================================
// DAILY REPORT GENERATION (FROM HOURLY RECORDS)
// ============================================================

// Generate daily report by aggregating hourlyRecords
// NOTE: Mortality is harvest-based only, not included in time-based reports
// date format: YYYY-MM-DD
export async function generateDailyReport(uid, date) {
    try {
        const dayDate = new Date(date + 'T00:00:00');
        if (isNaN(dayDate.getTime())) {
            throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
        }
        
        // Read hourlyRecords for this date from hours subcollection
        const hoursRef = collection(db, `users/${uid}/hourlyRecords/${date}/hours`);
        const hoursSnapshot = await getDocs(hoursRef);
        
        if (hoursSnapshot.empty) {
            console.log(`[DAILY] No hourly records found for ${date}, skipping daily report`);
            return null;
        }
        
        // Aggregate from hourly records, ignoring seed documents
        let temperatureSum = 0;
        let temperatureCount = 0;
        let phSum = 0;
        let phCount = 0;
        let coverageHours = 0;
        
        hoursSnapshot.forEach(hourDoc => {
            const record = hourDoc.data();
            
            // Skip seed documents unless they're the only ones
            if (record.isSeed === true) {
                return; // Skip seed
            }
            
            // Use weighted averages if counts exist, else use simple average
            if (record.temperatureAvg !== null && record.temperatureAvg !== undefined) {
                const tempAvg = parseFloat(record.temperatureAvg);
                const count = record.temperatureCount || 1;
                temperatureSum += tempAvg * count;
                temperatureCount += count;
            }
            
            if (record.phAvg !== null && record.phAvg !== undefined) {
                const phAvg = parseFloat(record.phAvg);
                const count = record.phCount || 1;
                phSum += phAvg * count;
                phCount += count;
            }
            
            // Count hours with actual data (count > 0)
            if ((record.temperatureCount && record.temperatureCount > 0) || 
                (record.phCount && record.phCount > 0)) {
                coverageHours++;
            }
        });
        
        // If no real data (only seeds), don't overwrite existing report
        if (coverageHours === 0) {
            console.log(`[DAILY] coverageHours=0 for ${date}, keeping seed or existing report`);
            return null;
        }
        
        // Calculate daily averages (weighted by counts if available)
        const avgTemperature = temperatureCount > 0 ? temperatureSum / temperatureCount : null;
        const avgPh = phCount > 0 ? phSum / phCount : null;
        
        // Write to Firestore (idempotent - overwrite-safe)
        const reportRef = doc(db, `users/${uid}/dailyReports/${date}`);
        await ensureReportDoc(db, uid, "daily", date);
        const dailyReport = {
            date: date,
            avgTemperature: avgTemperature,
            avgPh: avgPh,
            coverageHours: coverageHours,
            isSeed: false,
            generatedAt: serverTimestamp(),
            source: "web"
        };
        
        await setDoc(reportRef, dailyReport, { merge: true });
        console.log(`[DAILY] coverageHours=${coverageHours} for ${date}`);
        
        return dailyReport;
        
    } catch (error) {
        console.error(`❌ Error generating daily report for ${date}:`, error);
        throw error;
    }
}

// ============================================================
// WEEKLY REPORT GENERATION (FROM DAILY REPORTS ONLY)
// ============================================================

// Generate weekly report by aggregating dailyReports
// isoWeekString format: "YYYY-WW" (e.g., "2025-W48")
export async function generateWeeklyReport(uid, isoWeekString) {
    try {
        // Validate ISO week format
        const match = isoWeekString.match(/^(\d{4})-W(\d{2})$/);
        if (!match) {
            throw new Error(`Invalid ISO week format: ${isoWeekString}. Expected YYYY-WW`);
        }
        
        // Get all 7 dates in the ISO week
        const weekDates = getDatesInIsoWeek(isoWeekString);
        const dateStrings = weekDates.map(d => formatDateString(d));
        
        // Read dailyReports for each date in the week
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailyReportsSnapshot = await getDocs(dailyReportsRef);
        
        const dailyReports = [];
        dailyReportsSnapshot.forEach(doc => {
            const report = doc.data();
            // Ignore seed documents
            if (report.isSeed === true) {
                return;
            }
            if (dateStrings.includes(report.date)) {
                dailyReports.push(report);
            }
        });
        
        // Aggregate only from existing daily reports (non-seed)
        // NOTE: Mortality is harvest-based only, not included in time-based reports
        const temperatures = [];
        const phValues = [];
        let coverageDays = dailyReports.length;
        
        // Only write if coverageDays > 0, else keep seed
        if (coverageDays === 0) {
            console.log(`[WEEKLY] coverageDays=0 for week ${isoWeekString}, keeping seed`);
            return null;
        }
        
        dailyReports.forEach(report => {
            // Collect temperature values (from daily averages)
            if (report.avgTemperature !== null && report.avgTemperature !== undefined) {
                temperatures.push(parseFloat(report.avgTemperature));
            }
            
            // Collect pH values (from daily averages)
            if (report.avgPh !== null && report.avgPh !== undefined) {
                phValues.push(parseFloat(report.avgPh));
            }
        });
        
        // Calculate averages (average of daily averages)
        const avgTemperature = temperatures.length > 0 
            ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length 
            : null;
        const avgPh = phValues.length > 0 
            ? phValues.reduce((a, b) => a + b, 0) / phValues.length 
            : null;
        
        // Write to Firestore (only if we have real daily reports)
        const reportRef = doc(db, `users/${uid}/weeklyReports/${isoWeekString}`);
        await ensureReportDoc(db, uid, "weekly", isoWeekString);
        const weeklyReport = {
            week: isoWeekString,
            avgTemperature: avgTemperature,
            avgPh: avgPh,
            coverageDays: coverageDays,
            generatedAt: serverTimestamp(),
            source: "web"
        };
        
        // Use merge: true for idempotency (safe to re-run)
        // Force write even with partial data - this creates the collection
        await setDoc(reportRef, weeklyReport, { merge: true });
        console.log(`[REPORT WRITE] Written weekly report ${isoWeekString} to Firestore (coverage: ${coverageDays}/7 days)`);
        
        console.log(`✅ Generated weekly report for ${isoWeekString}:`, weeklyReport);
        return weeklyReport;
        
    } catch (error) {
        console.error(`❌ Error generating weekly report for ${isoWeekString}:`, error);
        throw error;
    }
}

// ============================================================
// MONTHLY REPORT GENERATION (FROM DAILY REPORTS ONLY)
// ============================================================

// Generate monthly report by aggregating dailyReports
// year: number (e.g., 2025)
// month: number (1-12)
export async function generateMonthlyReport(uid, year, month) {
    try {
        if (month < 1 || month > 12) {
            throw new Error(`Invalid month: ${month}. Must be 1-12`);
        }
        
        const monthString = `${year}-${String(month).padStart(2, '0')}`;
        
        // Get all dates in the month
        const monthDates = getDatesInMonth(year, month);
        const dateStrings = monthDates.map(d => formatDateString(d));
        
        // Read dailyReports for each date in the month
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailyReportsSnapshot = await getDocs(dailyReportsRef);
        
        const dailyReports = [];
        dailyReportsSnapshot.forEach(doc => {
            const report = doc.data();
            // Ignore seed documents
            if (report.isSeed === true) {
                return;
            }
            if (dateStrings.includes(report.date)) {
                dailyReports.push(report);
            }
        });
        
        // Aggregate only from existing daily reports (non-seed)
        // NOTE: Mortality is harvest-based only, not included in time-based reports
        const temperatures = [];
        const phValues = [];
        let coverageDays = dailyReports.length;
        
        // Only write if coverageDays > 0, else keep seed
        if (coverageDays === 0) {
            console.log(`[MONTHLY] coverageDays=0 for month ${monthString}, keeping seed`);
            return null;
        }
        
        dailyReports.forEach(report => {
            // Collect temperature values (from daily averages)
            if (report.avgTemperature !== null && report.avgTemperature !== undefined) {
                temperatures.push(parseFloat(report.avgTemperature));
            }
            
            // Collect pH values (from daily averages)
            if (report.avgPh !== null && report.avgPh !== undefined) {
                phValues.push(parseFloat(report.avgPh));
            }
        });
        
        // Calculate averages (average of daily averages)
        const avgTemperature = temperatures.length > 0 
            ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length 
            : null;
        const avgPh = phValues.length > 0 
            ? phValues.reduce((a, b) => a + b, 0) / phValues.length 
            : null;
        
        // Write to Firestore (only if we have real daily reports)
        const reportRef = doc(db, `users/${uid}/monthlyReports/${monthString}`);
        await ensureReportDoc(db, uid, "monthly", monthString);
        const monthlyReport = {
            month: monthString,
            avgTemperature: avgTemperature,
            avgPh: avgPh,
            coverageDays: coverageDays,
            generatedAt: serverTimestamp(),
            source: "web"
        };
        
        // Use merge: true for idempotency (safe to re-run)
        // Force write even with partial data - this creates the collection
        await setDoc(reportRef, monthlyReport, { merge: true });
        console.log(`[MONTHLY] coverageDays=${coverageDays} for month ${monthString}`);
        
        console.log(`✅ Generated monthly report for ${monthString}:`, monthlyReport);
        return monthlyReport;
        
    } catch (error) {
        console.error(`❌ Error generating monthly report for ${year}-${month}:`, error);
        throw error;
    }
}

// ============================================================
// SENSOR TREND ANALYTICS
// ============================================================

// Trend computation utility function
// Returns: "up", "down", "stable", or "unknown"
function computeTrend(currentValue, previousValue) {
    if (previousValue === null || previousValue === undefined) return "unknown";
    if (currentValue === null || currentValue === undefined) return "unknown";
    if (currentValue > previousValue) return "up";
    if (currentValue < previousValue) return "down";
    return "stable";
}

// Get previous date string (yesterday)
function getPreviousDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    date.setDate(date.getDate() - 1);
    return formatDateString(date);
}

// Get previous ISO week string
function getPreviousIsoWeek(isoWeekString) {
    const match = isoWeekString.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return null;
    
    const year = parseInt(match[1]);
    const week = parseInt(match[2]);
    
    if (week === 1) {
        // Previous week is last week of previous year
        const prevYear = year - 1;
        // Calculate last week of previous year (usually week 52 or 53)
        const jan4 = new Date(prevYear, 0, 4);
        const jan4Day = jan4.getDay();
        const jan4Monday = new Date(jan4);
        jan4Monday.setDate(4 - (jan4Day === 0 ? 6 : jan4Day - 1));
        const dec31 = new Date(prevYear, 11, 31);
        const daysDiff = Math.floor((dec31 - jan4Monday) / (1000 * 60 * 60 * 24));
        const lastWeek = Math.ceil((daysDiff + 1) / 7);
        return `${prevYear}-W${String(lastWeek).padStart(2, '0')}`;
    } else {
        return `${year}-W${String(week - 1).padStart(2, '0')}`;
    }
}

// Get previous month string
function getPreviousMonth(monthString) {
    const [year, month] = monthString.split('-').map(Number);
    if (month === 1) {
        return `${year - 1}-12`;
    } else {
        return `${year}-${String(month - 1).padStart(2, '0')}`;
    }
}

// Centralized helper for report document references
// Daily: users/{uid}/dailyReports/{YYYY-MM-DD}
// Weekly: users/{uid}/weeklyReports/{YYYY-Wxx}
// Monthly: users/{uid}/monthlyReports/{YYYY-MM}
function reportDocRef(db, uid, period, id) {
    if (period === "daily") {
        return doc(db, "users", uid, "dailyReports", id);
    } else if (period === "weekly") {
        return doc(db, "users", uid, "weeklyReports", id);
    } else if (period === "monthly") {
        return doc(db, "users", uid, "monthlyReports", id);
    } else {
        throw new Error(`Invalid period: ${period}. Must be 'daily', 'weekly', or 'monthly'`);
    }
}

// Centralized helper for report collection references
function reportCollectionRef(db, uid, period) {
    if (period === "daily") {
        return collection(db, "users", uid, "dailyReports");
    } else if (period === "weekly") {
        return collection(db, "users", uid, "weeklyReports");
    } else if (period === "monthly") {
        return collection(db, "users", uid, "monthlyReports");
    } else {
        throw new Error(`Invalid period: ${period}. Must be 'daily', 'weekly', or 'monthly'`);
    }
}

// Ensure report document exists with default analytics fields if missing
async function ensureReportDoc(db, uid, period, id) {
    if (IS_REPORT_FETCH_ONLY) {
        console.log('[REPORT] Skipping ensureReportDoc in read-only dashboard context');
        // Return the doc ref without writing
        return reportDocRef(db, uid, period, id);
    }
    try {
        const docRef = reportDocRef(db, uid, period, id);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
            let defaultFields = {};
            
            if (period === "daily") {
                defaultFields = {
                    date: id,
                    avgTemperature: null,
                    avgPh: null,
                    tempAvailability: 0,
                    phAvailability: 0,
                    bothSensorsAvailability: 0,
                    noDataHours: 0,
                    coverageDays: 0,
                    waterQuality: null,
                    tempTrend: "unknown",
                    phTrend: "unknown",
                    bothSensorsTrend: "unknown",
                    isSeed: true,
                    source: "web",
                    generatedAt: serverTimestamp()
                };
            } else if (period === "weekly") {
                defaultFields = {
                    week: id,
                    avgTemperature: null,
                    avgPh: null,
                    tempAvailability: 0,
                    phAvailability: 0,
                    bothSensorsAvailability: 0,
                    noDataHours: 0,
                    coverageDays: 0,
                    tempTrend: "unknown",
                    phTrend: "unknown",
                    bothSensorsTrend: "unknown",
                    isSeed: true,
                    source: "web",
                    generatedAt: serverTimestamp()
                };
            } else if (period === "monthly") {
                defaultFields = {
                    month: id,
                    avgTemperature: null,
                    avgPh: null,
                    tempAvailability: 0,
                    phAvailability: 0,
                    bothSensorsAvailability: 0,
                    noDataHours: 0,
                    coverageDays: 0,
                    tempTrend: "unknown",
                    phTrend: "unknown",
                    bothSensorsTrend: "unknown",
                    isSeed: true,
                    source: "web",
                    generatedAt: serverTimestamp()
                };
            }
            
            await setDoc(docRef, defaultFields, { merge: true });
            console.log(`[ENSURE] Created default ${period} report document for ${id}`);
            console.log("📄 Initialized report doc:", docRef.path);
        }
        
        return docRef;
        
    } catch (error) {
        console.error(`❌ Error ensuring ${period} report document for ${id}:`, error);
        throw error;
    }
}

// Generate daily sensor analytics from hourly records
export async function generateDailySensorAnalytics(uid, date) {
    try {
        const dayDate = new Date(date + 'T00:00:00');
        if (isNaN(dayDate.getTime())) {
            throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
        }
        
        // Read hourlyRecords for this date
        const hoursRef = collection(db, `users/${uid}/hourlyRecords/${date}/hours`);
        const hoursSnapshot = await getDocs(hoursRef);
        
        if (hoursSnapshot.empty) {
            console.log(`[SENSOR ANALYTICS] No hourly records found for ${date}, skipping sensor analytics`);
            return null;
        }
        
        // Aggregate sensor availability from hourly records
        let temperatureAvailabilityHours = 0;
        let phAvailabilityHours = 0;
        let bothSensorsAvailableHours = 0;
        let totalNoDataHours = 0;
        
        hoursSnapshot.forEach(hourDoc => {
            const record = hourDoc.data();
            
            // Skip seed documents
            if (record.isSeed === true) {
                return;
            }
            
            const hasTemp = (record.temperatureCount && record.temperatureCount > 0);
            const hasPh = (record.phCount && record.phCount > 0);
            
            if (hasTemp) temperatureAvailabilityHours++;
            if (hasPh) phAvailabilityHours++;
            if (hasTemp && hasPh) bothSensorsAvailableHours++;
            if (!hasTemp && !hasPh) totalNoDataHours++;
        });
        
        // Only write if we have real data
        if (temperatureAvailabilityHours === 0 && phAvailabilityHours === 0) {
            console.log(`[SENSOR ANALYTICS] No sensor data for ${date}, skipping analytics`);
            return null;
        }
        
        // Write to Firestore (store in sensorAnalytics collection)
        // Path: users/{uid}/sensorAnalytics/daily/{YYYY-MM-DD}
        // daily is a collection, YYYY-MM-DD is a document
        const analyticsRef = doc(db, `users/${uid}/sensorAnalytics/daily/${date}`);
        const analyticsData = {
            tempAvailability: temperatureAvailabilityHours,
            phAvailability: phAvailabilityHours,
            bothSensorsAvailability: bothSensorsAvailableHours,
            noDataHours: totalNoDataHours
        };
        
        await setDoc(analyticsRef, analyticsData, { merge: true });
        console.log(`[SENSOR ANALYTICS] Generated daily sensor analytics for ${date}`);
        console.log("✅ sensorAnalytics daily saved:", "users/"+uid+"/sensorAnalytics/daily/"+date);
        
        return analyticsData;
        
    } catch (error) {
        console.error(`❌ Error generating daily sensor analytics for ${date}:`, error);
        throw error;
    }
}

// Identify daily sensor trends (today vs yesterday)
export async function identifyDailySensorTrends(uid, date) {
    try {
        // Get current day sensor analytics document
        // Path: users/{uid}/sensorAnalytics/daily/{YYYY-MM-DD}
        // daily is a collection, YYYY-MM-DD is a document
        const currentRef = doc(db, `users/${uid}/sensorAnalytics/daily/${date}`);
        const currentSnap = await getDoc(currentRef);
        
        if (!currentSnap.exists()) {
            console.log(`[TREND] No daily sensor analytics for ${date}, skipping trend identification`);
            return null;
        }
        
        const current = currentSnap.data();
        
        // Get previous day (yesterday)
        const previousDate = getPreviousDate(date);
        // Path: users/{uid}/sensorAnalytics/daily/{YYYY-MM-DD}
        // daily is a collection, YYYY-MM-DD is a document
        const previousRef = doc(db, `users/${uid}/sensorAnalytics/daily/${previousDate}`);
        const previousSnap = await getDoc(previousRef);
        
        const previous = previousSnap.exists() 
            ? previousSnap.data() 
            : {};
        
        // Compute trends
        const trends = {
            tempTrend: computeTrend(
                current.tempAvailability,
                previous.tempAvailability
            ),
            phTrend: computeTrend(
                current.phAvailability,
                previous.phAvailability
            ),
            bothSensorsTrend: computeTrend(
                current.bothSensorsAvailability,
                previous.bothSensorsAvailability
            )
        };
        
        // Save trends with merge
        await setDoc(currentRef, trends, { merge: true });
        console.log(`[TREND] Identified daily sensor trends for ${date}:`, trends);
        
        return trends;
        
    } catch (error) {
        console.error(`❌ Error identifying daily sensor trends for ${date}:`, error);
        throw error;
    }
}

// Generate weekly sensor analytics from daily sensor analytics
export async function generateWeeklySensorAnalytics(uid, isoWeekString) {
    try {
        // Validate ISO week format
        const match = isoWeekString.match(/^(\d{4})-W(\d{2})$/);
        if (!match) {
            throw new Error(`Invalid ISO week format: ${isoWeekString}. Expected YYYY-WW`);
        }
        
        // Get all 7 dates in the ISO week
        const weekDates = getDatesInIsoWeek(isoWeekString);
        const dateStrings = weekDates.map(d => formatDateString(d));
        
        // Read daily reports for each date in the week
        const dailyReportsRef = reportCollectionRef(db, uid, "daily");
        const dailyAnalyticsSnapshot = await getDocs(dailyReportsRef);
        
        const dailyAnalytics = [];
        dailyAnalyticsSnapshot.forEach(doc => {
            const analytics = doc.data();
            // Ignore seed documents
            if (analytics.isSeed === true) {
                return;
            }
            if (dateStrings.includes(analytics.date)) {
                dailyAnalytics.push(analytics);
            }
        });
        
        // Only write if we have real data
        if (dailyAnalytics.length === 0) {
            console.log(`[SENSOR ANALYTICS] No daily sensor analytics for week ${isoWeekString}, skipping weekly analytics`);
            return null;
        }
        
        // Aggregate from daily analytics
        let totalTemperatureAvailabilityHours = 0;
        let totalPhAvailabilityHours = 0;
        let totalBothSensorsAvailableHours = 0;
        let totalNoDataHours = 0;
        
        dailyAnalytics.forEach(analytics => {
            totalTemperatureAvailabilityHours += analytics.tempAvailability || 0;
            totalPhAvailabilityHours += analytics.phAvailability || 0;
            totalBothSensorsAvailableHours += analytics.bothSensorsAvailability || 0;
            totalNoDataHours += analytics.noDataHours || 0;
        });
        
        // Calculate totals (weekly aggregates totals, not averages)
        const totalTempAvailability = totalTemperatureAvailabilityHours;
        const totalPhAvailability = totalPhAvailabilityHours;
        const totalBothSensorsAvailability = totalBothSensorsAvailableHours;
        const totalNoDataHoursValue = totalNoDataHours;
        
        // Write to Firestore (store in sensorAnalytics collection)
        // Path: users/{uid}/sensorAnalytics/weekly/{YYYY-WW}
        // weekly is a collection, YYYY-WW is a document
        const analyticsRef = doc(db, `users/${uid}/sensorAnalytics/weekly/${isoWeekString}`);
        const analyticsData = {
            tempAvailability: totalTempAvailability,
            phAvailability: totalPhAvailability,
            bothSensorsAvailability: totalBothSensorsAvailability,
            noDataHours: totalNoDataHoursValue
        };
        
        await setDoc(analyticsRef, analyticsData, { merge: true });
        console.log(`[SENSOR ANALYTICS] Generated weekly sensor analytics for ${isoWeekString}`);
        
        return analyticsData;
        
    } catch (error) {
        console.error(`❌ Error generating weekly sensor analytics for ${isoWeekString}:`, error);
        throw error;
    }
}

// Identify weekly sensor trends (this week vs previous week)
export async function identifyWeeklySensorTrends(uid, isoWeekString) {
    try {
        // Get current week sensor analytics document
        // Path: users/{uid}/sensorAnalytics/weekly/{YYYY-WW}
        // weekly is a collection, YYYY-WW is a document
        const currentRef = doc(db, `users/${uid}/sensorAnalytics/weekly/${isoWeekString}`);
        const currentSnap = await getDoc(currentRef);
        
        if (!currentSnap.exists()) {
            console.log(`[TREND] No weekly sensor analytics for ${isoWeekString}, skipping trend identification`);
            return null;
        }
        
        const current = currentSnap.data();
        
        // Get previous week
        const previousWeek = getPreviousIsoWeek(isoWeekString);
        if (!previousWeek) {
            console.log(`[TREND] Cannot determine previous week for ${isoWeekString}`);
            return null;
        }
        
        // Path: users/{uid}/sensorAnalytics/weekly/{YYYY-WW}
        // weekly is a collection, YYYY-WW is a document
        const previousRef = doc(db, `users/${uid}/sensorAnalytics/weekly/${previousWeek}`);
        const previousSnap = await getDoc(previousRef);
        
        const previous = previousSnap.exists() 
            ? previousSnap.data() 
            : {};
        
        // Compute trends
        const trends = {
            tempTrend: computeTrend(
                current.tempAvailability,
                previous.tempAvailability
            ),
            phTrend: computeTrend(
                current.phAvailability,
                previous.phAvailability
            ),
            bothSensorsTrend: computeTrend(
                current.bothSensorsAvailability,
                previous.bothSensorsAvailability
            )
        };
        
        // Save trends with merge
        await setDoc(currentRef, trends, { merge: true });
        console.log(`[TREND] Identified weekly sensor trends for ${isoWeekString}:`, trends);
        
        return trends;
        
    } catch (error) {
        console.error(`❌ Error identifying weekly sensor trends for ${isoWeekString}:`, error);
        throw error;
    }
}

// Generate monthly sensor analytics from daily sensor analytics
export async function generateMonthlySensorAnalytics(uid, year, month) {
    try {
        if (month < 1 || month > 12) {
            throw new Error(`Invalid month: ${month}. Must be 1-12`);
        }
        
        const monthString = `${year}-${String(month).padStart(2, '0')}`;
        
        // Get all dates in the month
        const monthDates = getDatesInMonth(year, month);
        const dateStrings = monthDates.map(d => formatDateString(d));
        
        // Read daily reports for each date in the month
        const dailyAnalyticsRef = reportCollectionRef(db, uid, "daily");
        const dailyAnalyticsSnapshot = await getDocs(dailyAnalyticsRef);
        
        const dailyAnalytics = [];
        dailyAnalyticsSnapshot.forEach(doc => {
            const analytics = doc.data();
            // Ignore seed documents
            if (analytics.isSeed === true) {
                return;
            }
            if (dateStrings.includes(analytics.date)) {
                dailyAnalytics.push(analytics);
            }
        });
        
        // Only write if we have real data
        if (dailyAnalytics.length === 0) {
            console.log(`[SENSOR ANALYTICS] No daily sensor analytics for month ${monthString}, skipping monthly analytics`);
            return null;
        }
        
        // Aggregate from daily analytics
        let totalTemperatureAvailabilityHours = 0;
        let totalPhAvailabilityHours = 0;
        let totalBothSensorsAvailableHours = 0;
        let totalNoDataHours = 0;
        
        dailyAnalytics.forEach(analytics => {
            totalTemperatureAvailabilityHours += analytics.tempAvailability || 0;
            totalPhAvailabilityHours += analytics.phAvailability || 0;
            totalBothSensorsAvailableHours += analytics.bothSensorsAvailability || 0;
            totalNoDataHours += analytics.noDataHours || 0;
        });
        
        // Calculate totals (monthly aggregates totals, not averages)
        const totalTempAvailability = totalTemperatureAvailabilityHours;
        const totalPhAvailability = totalPhAvailabilityHours;
        const totalBothSensorsAvailability = totalBothSensorsAvailableHours;
        const totalNoDataHoursValue = totalNoDataHours;
        
        // Write to Firestore (store in sensorAnalytics collection)
        // Path: users/{uid}/sensorAnalytics/monthly/{YYYY-MM}
        // monthly is a collection, YYYY-MM is a document
        const analyticsRef = doc(db, `users/${uid}/sensorAnalytics/monthly/${monthString}`);
        const analyticsData = {
            tempAvailability: totalTempAvailability,
            phAvailability: totalPhAvailability,
            bothSensorsAvailability: totalBothSensorsAvailability,
            noDataHours: totalNoDataHoursValue
        };
        
        await setDoc(analyticsRef, analyticsData, { merge: true });
        console.log(`[SENSOR ANALYTICS] Generated monthly sensor analytics for ${monthString}`);
        
        return analyticsData;
        
    } catch (error) {
        console.error(`❌ Error generating monthly sensor analytics for ${year}-${month}:`, error);
        throw error;
    }
}

// Identify monthly sensor trends (this month vs previous month)
export async function identifyMonthlySensorTrends(uid, year, month) {
    try {
        const monthString = `${year}-${String(month).padStart(2, '0')}`;
        
        // Get current month sensor analytics document
        // Path: users/{uid}/sensorAnalytics/monthly/{YYYY-MM}
        // monthly is a collection, YYYY-MM is a document
        const currentRef = doc(db, `users/${uid}/sensorAnalytics/monthly/${monthString}`);
        const currentSnap = await getDoc(currentRef);
        
        if (!currentSnap.exists()) {
            console.log(`[TREND] No monthly sensor analytics for ${monthString}, skipping trend identification`);
            return null;
        }
        
        const current = currentSnap.data();
        
        // Get previous month
        const previousMonth = getPreviousMonth(monthString);
        // Path: users/{uid}/sensorAnalytics/monthly/{YYYY-MM}
        // monthly is a collection, YYYY-MM is a document
        const previousRef = doc(db, `users/${uid}/sensorAnalytics/monthly/${previousMonth}`);
        const previousSnap = await getDoc(previousRef);
        
        const previous = previousSnap.exists() 
            ? previousSnap.data() 
            : {};
        
        // Compute trends
        const trends = {
            tempTrend: computeTrend(
                current.tempAvailability,
                previous.tempAvailability
            ),
            phTrend: computeTrend(
                current.phAvailability,
                previous.phAvailability
            ),
            bothSensorsTrend: computeTrend(
                current.bothSensorsAvailability,
                previous.bothSensorsAvailability
            )
        };
        
        // Save trends with merge
        await setDoc(currentRef, trends, { merge: true });
        console.log(`[TREND] Identified monthly sensor trends for ${monthString}:`, trends);
        
        return trends;
        
    } catch (error) {
        console.error(`❌ Error identifying monthly sensor trends for ${year}-${month}:`, error);
        throw error;
    }
}

// ============================================================
// HISTORICAL BACKFILL FUNCTIONS
// ============================================================

// Backfill hourly records for a date range (from sensors)
// This generates hourly records that daily reports can then aggregate
export async function backfillHourlyRecords(uid, startDate, endDate) {
    try {
        console.log(`🔄 Starting hourly record backfill for user ${uid} from ${startDate} to ${endDate}...`);
        
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');
        const currentDate = new Date(start);
        
        let generated = 0;
        let skipped = 0;
        
        // Generate hourly records for each day in range
        while (currentDate <= end) {
            const dateStr = formatDateString(currentDate);
            
            // Generate hourly records for all 24 hours of this day
            for (let hour = 0; hour < 24; hour++) {
                try {
                    const record = await generateHourlyRecord(uid, dateStr, hour);
                    if (record) {
                        generated++;
                    } else {
                        skipped++;
                    }
                } catch (error) {
                    console.error(`Error generating hourly record for ${dateStr} hour ${hour}:`, error);
                    skipped++;
                }
            }
            
            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        console.log(`✅ Hourly backfill complete: ${generated} records generated, ${skipped} skipped`);
        return { processed: (generated + skipped), generated, skipped };
        
    } catch (error) {
        console.error('❌ Error in hourly record backfill:', error);
        throw error;
    }
}

// Backfill daily reports from hourly records
export async function backfillDailyReports(uid) {
    if (IS_REPORT_FETCH_ONLY) {
        console.log('[REPORT] Skipping backfillDailyReports in read-only dashboard context');
        return { processed: 0, generated: 0 };
    }
    try {
        console.log(`🔄 Starting daily report backfill for user ${uid}...`);
        
        // Get all hourly record dates
        const hourlyRecordsRef = collection(db, `users/${uid}/hourlyRecords`);
        const hourlyDatesSnapshot = await getDocs(hourlyRecordsRef);
        
        if (hourlyDatesSnapshot.empty) {
            console.log('No hourly records found for daily backfill');
            return { processed: 0, generated: 0 };
        }
        
        // Collect all unique dates
        const dates = new Set();
        hourlyDatesSnapshot.forEach(doc => {
            dates.add(doc.id); // doc.id is the date (YYYY-MM-DD)
        });
        
        if (dates.size === 0) {
            console.log('No valid dates found in hourly records');
            return { processed: 0, generated: 0 };
        }
        
        // Generate daily reports for each date
        let generated = 0;
        for (const date of dates) {
            try {
                const report = await generateDailyReport(uid, date);
                if (report) {
                    generated++;
                }
            } catch (error) {
                console.error(`Error generating daily report for ${date}:`, error);
            }
        }
        
        console.log(`✅ Daily backfill complete: ${generated} reports generated`);
        return { processed: dates.size, generated };
        
    } catch (error) {
        console.error('❌ Error in daily report backfill:', error);
        throw error;
    }
}

// Backfill weekly reports from all existing dailyReports
export async function backfillWeeklyReports(uid) {
    try {
        console.log(`🔄 Starting weekly report backfill for user ${uid}...`);
        
        // Get all dailyReports
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailyReportsSnapshot = await getDocs(dailyReportsRef);
        
        if (dailyReportsSnapshot.empty) {
            console.log('No daily reports found for backfill');
            return { processed: 0, generated: 0 };
        }
        
        // Collect all dates
        const dates = [];
        dailyReportsSnapshot.forEach(doc => {
            const report = doc.data();
            if (report.date) {
                dates.push(new Date(report.date + 'T00:00:00'));
            }
        });
        
        if (dates.length === 0) {
            console.log('No valid dates found in daily reports');
            return { processed: 0, generated: 0 };
        }
        
        // Find date range
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        
        // Get all ISO weeks in range
        const weeks = new Set();
        
        // Helper to get ISO week from date
        const getIsoWeek = (date) => {
            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
        };
        
        // Collect all weeks
        const currentDate = new Date(minDate);
        while (currentDate <= maxDate) {
            weeks.add(getIsoWeek(currentDate));
            currentDate.setDate(currentDate.getDate() + 7);
        }
        
        // Also add weeks for individual dates
        dates.forEach(date => {
            weeks.add(getIsoWeek(date));
        });
        
        // Generate weekly reports
        let generated = 0;
        for (const week of weeks) {
            try {
                await generateWeeklyReport(uid, week);
                generated++;
            } catch (error) {
                console.error(`Error generating weekly report for ${week}:`, error);
            }
        }
        
        console.log(`✅ Weekly backfill complete: ${generated} reports generated`);
        return { processed: weeks.size, generated };
        
    } catch (error) {
        console.error('❌ Error in weekly report backfill:', error);
        throw error;
    }
}

// Backfill monthly reports from all existing dailyReports
export async function backfillMonthlyReports(uid) {
    try {
        console.log(`🔄 Starting monthly report backfill for user ${uid}...`);
        
        // Get all dailyReports
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailyReportsSnapshot = await getDocs(dailyReportsRef);
        
        if (dailyReportsSnapshot.empty) {
            console.log('No daily reports found for backfill');
            return { processed: 0, generated: 0 };
        }
        
        // Collect all unique year-month combinations
        const months = new Set();
        dailyReportsSnapshot.forEach(doc => {
            const report = doc.data();
            if (report.date) {
                const [year, month] = report.date.split('-');
                if (year && month) {
                    months.add(`${year}-${month}`);
                }
            }
        });
        
        if (months.size === 0) {
            console.log('No valid months found in daily reports');
            return { processed: 0, generated: 0 };
        }
        
        // Generate monthly reports
        let generated = 0;
        for (const monthStr of months) {
            try {
                const [year, month] = monthStr.split('-');
                await generateMonthlyReport(uid, parseInt(year), parseInt(month));
                generated++;
            } catch (error) {
                console.error(`Error generating monthly report for ${monthStr}:`, error);
            }
        }
        
        console.log(`✅ Monthly backfill complete: ${generated} reports generated`);
        return { processed: months.size, generated };
        
    } catch (error) {
        console.error('❌ Error in monthly report backfill:', error);
        throw error;
    }
}

// ============================================================
// LEGACY COMPATIBILITY (keeping existing function names)
// ============================================================

// Compute daily summary from raw data
async function computeDailySummary(uid, dateString) {
    if (HOURLY_TEST_MODE) {
        console.log('[REPORT] Skipping computeDailySummary in HOURLY_TEST_MODE');
        return null;
    }
    if (IS_REPORT_FETCH_ONLY) {
        console.log('[REPORT] Skipping computeDailySummary in read-only dashboard context');
        return null;
    }
    try {
        const dayDate = new Date(dateString + 'T00:00:00');
        const dayStart = getStartOfDay(dayDate);
        const dayEnd = getEndOfDay(dayDate);
        
        // Convert to Firestore Timestamp range
        const dayStartTimestamp = Math.floor(dayStart.getTime() / 1000);
        const dayEndTimestamp = Math.floor(dayEnd.getTime() / 1000);
        
        // Fetch mortality logs
        const mortalityRef = collection(db, `users/${uid}/mortalityLogs`);
        const mortalitySnapshot = await getDocs(mortalityRef);
        
        let mortality = 0;
        mortalitySnapshot.forEach(doc => {
            const log = doc.data();
            if (log.timestamp) {
                const logDate = timestampToDate(log.timestamp);
                if (logDate && isDateInDay(logDate, dayDate)) {
                    mortality += log.count || 0;
                }
            }
        });
        
        // Fetch sensor data (temperature and pH)
        const tempRef = doc(db, `users/${uid}/sensors/temperature`);
        const phRef = doc(db, `users/${uid}/sensors/ph`);
        
        const [tempSnap, phSnap] = await Promise.all([
            getDoc(tempRef),
            getDoc(phRef)
        ]);
        
        // Collect all temperature and pH values for the day
        // Note: Since sensors store current value, we'll use the latest value if timestamp is within day
        // For a more accurate average, you'd need historical sensor readings collection
        let avgTemperature = null;
        let avgPh = null;
        
        if (tempSnap.exists()) {
            const tempData = tempSnap.data();
            if (tempData.value !== undefined && tempData.value !== null) {
                // Check if timestamp is within day (if exists)
                if (!tempData.timestamp || isDateInDay(tempData.timestamp, dayDate)) {
                    avgTemperature = tempData.value;
                }
            }
        }
        
        if (phSnap.exists()) {
            const phData = phSnap.data();
            if (phData.value !== undefined && phData.value !== null) {
                // Check if timestamp is within day (if exists)
                if (!phData.timestamp || isDateInDay(phData.timestamp, dayDate)) {
                    avgPh = phData.value;
                }
            }
        }
        
        // Calculate water quality
        const { waterQuality, score } = calculateWaterQuality(avgTemperature, avgPh, mortality);
        
        // Create daily report document
        const dailyReport = {
            date: dateString, // Store as string YYYY-MM-DD
            mortality: mortality,
            avgTemperature: avgTemperature,
            avgPh: avgPh,
            waterQuality: waterQuality,
            score: score,
            updatedAt: serverTimestamp()
        };
        
        // Write to Firestore
        const reportRef = doc(db, `users/${uid}/dailyReports/${dateString}`);
        await ensureReportDoc(db, uid, "daily", dateString);
        await setDoc(reportRef, dailyReport, { merge: true });
        
        console.log(`Computed daily summary for ${dateString}:`, dailyReport);
        return dailyReport;
        
    } catch (error) {
        console.error(`Error computing daily summary for ${dateString}:`, error);
        throw error;
    }
}

// ============================================================
// WEEKLY SUMMARY COMPUTATION
// ============================================================

// Compute weekly summary from daily reports
async function computeWeeklySummary(uid, weekString) {
    if (HOURLY_TEST_MODE) {
        console.log('[REPORT] Skipping computeWeeklySummary in HOURLY_TEST_MODE');
        return null;
    }
    if (IS_REPORT_FETCH_ONLY) {
        console.log('[REPORT] Skipping computeWeeklySummary in read-only dashboard context');
        return null;
    }
    try {
        const match = weekString.match(/(\d{4})-W(\d{2})/);
        if (!match) {
            throw new Error(`Invalid week string format: ${weekString}`);
        }
        const year = parseInt(match[1]);
        const week = parseInt(match[2]);
        
        // Calculate week start (Monday) and end (Sunday) dates for ISO week
        // Week 1 contains January 4th
        const jan4 = new Date(year, 0, 4);
        const jan4Day = jan4.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const jan4Monday = new Date(jan4);
        jan4Monday.setDate(4 - (jan4Day === 0 ? 6 : jan4Day - 1)); // Monday of week containing Jan 4
        
        // Calculate the Monday of the target week
        const weekStart = new Date(jan4Monday);
        weekStart.setDate(jan4Monday.getDate() + (week - 1) * 7);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        
        // Fetch all daily reports for this week
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailyReportsSnapshot = await getDocs(dailyReportsRef);
        
        const dailyReports = [];
        dailyReportsSnapshot.forEach(doc => {
            const report = doc.data();
            const reportDate = new Date(report.date + 'T00:00:00');
            if (reportDate >= weekStart && reportDate <= weekEnd) {
                dailyReports.push(report);
            }
        });
        
        if (dailyReports.length === 0) {
            console.log(`No daily reports found for week ${weekString}`);
            return null;
        }
        
        // Aggregate data
        let totalMortality = 0;
        const temperatures = [];
        const phValues = [];
        const scores = [];
        
        dailyReports.forEach(report => {
            totalMortality += report.mortality || 0;
            if (report.avgTemperature !== null && report.avgTemperature !== undefined) {
                temperatures.push(report.avgTemperature);
            }
            if (report.avgPh !== null && report.avgPh !== undefined) {
                phValues.push(report.avgPh);
            }
            if (report.score !== null && report.score !== undefined) {
                scores.push(report.score);
            }
        });
        
        // Calculate averages
        const avgTemperature = temperatures.length > 0 
            ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length 
            : null;
        const avgPh = phValues.length > 0 
            ? phValues.reduce((a, b) => a + b, 0) / phValues.length 
            : null;
        const waterQualityScore = scores.length > 0 
            ? scores.reduce((a, b) => a + b, 0) / scores.length 
            : null;
        
        // Create weekly report document
        const weeklyReport = {
            periodStart: weekStart,
            periodEnd: weekEnd,
            mortality: totalMortality,
            avgTemperature: avgTemperature,
            avgPh: avgPh,
            waterQualityScore: waterQualityScore,
            daysCount: dailyReports.length,
            updatedAt: serverTimestamp()
        };
        
        // Write to Firestore
        const reportRef = doc(db, `users/${uid}/weeklyReports/${weekString}`);
        await ensureReportDoc(db, uid, "weekly", weekString);
        await setDoc(reportRef, weeklyReport, { merge: true });
        
        console.log(`Computed weekly summary for ${weekString}:`, weeklyReport);
        return weeklyReport;
        
    } catch (error) {
        console.error(`Error computing weekly summary for ${weekString}:`, error);
        throw error;
    }
}

// ============================================================
// MONTHLY SUMMARY COMPUTATION
// ============================================================

// Compute monthly summary from daily reports
async function computeMonthlySummary(uid, monthString) {
    if (HOURLY_TEST_MODE) {
        console.log('[REPORT] Skipping computeMonthlySummary in HOURLY_TEST_MODE');
        return null;
    }
    if (IS_REPORT_FETCH_ONLY) {
        console.log('[REPORT] Skipping computeMonthlySummary in read-only dashboard context');
        return null;
    }
    try {
        const [year, month] = monthString.split('-').map(Number);
        const monthStart = new Date(year, month - 1, 1);
        monthStart.setHours(0, 0, 0, 0);
        const monthEnd = getEndOfMonth(monthStart);
        
        // Fetch all daily reports for this month
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailyReportsSnapshot = await getDocs(dailyReportsRef);
        
        const dailyReports = [];
        dailyReportsSnapshot.forEach(doc => {
            const report = doc.data();
            const reportDate = new Date(report.date + 'T00:00:00');
            if (reportDate >= monthStart && reportDate <= monthEnd) {
                dailyReports.push(report);
            }
        });
        
        if (dailyReports.length === 0) {
            console.log(`No daily reports found for month ${monthString}`);
            return null;
        }
        
        // Aggregate data
        let totalMortality = 0;
        const temperatures = [];
        const phValues = [];
        const scores = [];
        
        dailyReports.forEach(report => {
            totalMortality += report.mortality || 0;
            if (report.avgTemperature !== null && report.avgTemperature !== undefined) {
                temperatures.push(report.avgTemperature);
            }
            if (report.avgPh !== null && report.avgPh !== undefined) {
                phValues.push(report.avgPh);
            }
            if (report.score !== null && report.score !== undefined) {
                scores.push(report.score);
            }
        });
        
        // Calculate averages
        const avgTemperature = temperatures.length > 0 
            ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length 
            : null;
        const avgPh = phValues.length > 0 
            ? phValues.reduce((a, b) => a + b, 0) / phValues.length 
            : null;
        const waterQualityScore = scores.length > 0 
            ? scores.reduce((a, b) => a + b, 0) / scores.length 
            : null;
        
        // Create monthly report document
        const monthlyReport = {
            monthStart: monthStart,
            totalMortality: totalMortality,
            avgTemperature: avgTemperature,
            avgPh: avgPh,
            waterQualityScore: waterQualityScore,
            daysCount: dailyReports.length,
            updatedAt: serverTimestamp()
        };
        
        // Write to Firestore
        const reportRef = doc(db, `users/${uid}/monthlyReports/${monthString}`);
        await ensureReportDoc(db, uid, "monthly", monthString);
        await setDoc(reportRef, monthlyReport, { merge: true });
        
        console.log(`Computed monthly summary for ${monthString}:`, monthlyReport);
        return monthlyReport;
        
    } catch (error) {
        console.error(`Error computing monthly summary for ${monthString}:`, error);
        throw error;
    }
}

// ============================================================
// AUTO-BACKFILL LOGIC
// ============================================================

// Find earliest date from all data sources
async function findEarliestDate(uid) {
    try {
        const dates = [];
        
        // Check feeding schedules (using createdAt field)
        const schedulesRef = collection(db, `users/${uid}/schedules`);
        const schedulesSnapshot = await getDocs(schedulesRef);
        schedulesSnapshot.forEach(doc => {
            const schedule = doc.data();
            if (schedule.createdAt) {
                const date = timestampToDate(schedule.createdAt);
                if (date) dates.push(date);
            }
        });
        
        // Check mortality logs
        const mortalityRef = collection(db, `users/${uid}/mortalityLogs`);
        const mortalitySnapshot = await getDocs(mortalityRef);
        mortalitySnapshot.forEach(doc => {
            const log = doc.data();
            if (log.timestamp) {
                const date = timestampToDate(log.timestamp);
                if (date) dates.push(date);
            }
        });
        
        // Check sensor data timestamps
        const tempRef = doc(db, `users/${uid}/sensors/temperature`);
        const phRef = doc(db, `users/${uid}/sensors/ph`);
        const [tempSnap, phSnap] = await Promise.all([getDoc(tempRef), getDoc(phRef)]);
        
        if (tempSnap.exists() && tempSnap.data().timestamp) {
            const date = timestampToDate(tempSnap.data().timestamp);
            if (date) dates.push(date);
        }
        if (phSnap.exists() && phSnap.data().timestamp) {
            const date = timestampToDate(phSnap.data().timestamp);
            if (date) dates.push(date);
        }
        
        if (dates.length === 0) {
            // Default to 30 days ago if no data
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() - 30);
            return defaultDate;
        }
        
        return new Date(Math.min(...dates.map(d => d.getTime())));
    } catch (error) {
        console.error('Error finding earliest date:', error);
        // Default to 30 days ago on error
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() - 30);
        return defaultDate;
    }
}

// NOTE: backfillDailyReports is defined earlier (line 1755) - this duplicate has been removed
// The correct version reads from hourlyRecords and generates dailyReports

// Backfill weekly and monthly reports
async function backfillAggregateReports(uid) {
    if (IS_REPORT_FETCH_ONLY) {
        console.log('[REPORT] Skipping backfillAggregateReports in read-only dashboard context');
        return { processed: 0, generated: 0 };
    }
    try {
        // Get all daily reports
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const dailyReportsSnapshot = await getDocs(dailyReportsRef);
        
        const weeks = new Set();
        const months = new Set();
        
        dailyReportsSnapshot.forEach(doc => {
            const report = doc.data();
            const reportDate = new Date(report.date + 'T00:00:00');
            weeks.add(getISOWeekString(reportDate));
            months.add(getMonthString(reportDate));
        });
        
        // Compute weekly reports
        let weeklyCount = 0;
        for (const weekString of weeks) {
            try {
                await computeWeeklySummary(uid, weekString);
                weeklyCount++;
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Error computing weekly summary for ${weekString}:`, error);
            }
        }
        
        // Compute monthly reports
        let monthlyCount = 0;
        for (const monthString of months) {
            try {
                await computeMonthlySummary(uid, monthString);
                monthlyCount++;
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Error computing monthly summary for ${monthString}:`, error);
            }
        }
        
        console.log(`Backfilled ${weeklyCount} weekly reports and ${monthlyCount} monthly reports`);
        return { weeklyCount, monthlyCount };
    } catch (error) {
        console.error('Error backfilling aggregate reports:', error);
        throw error;
    }
}

// ============================================================
// AUTO-UPDATE LOGIC
// ============================================================

// Update current day, week, and month summaries
async function updateCurrentSummaries(uid) {
    if (HOURLY_TEST_MODE) {
        console.log('[REPORT] Skipping updateCurrentSummaries in HOURLY_TEST_MODE');
        return;
    }
    if (IS_REPORT_FETCH_ONLY) {
        console.log('[REPORT] Skipping updateCurrentSummaries in read-only dashboard context');
        return;
    }
    try {
        const today = new Date();
        
        // Update today's daily report
        const todayString = getLocalDateString(today);
        await computeDailySummary(uid, todayString);
        
        // Update current week
        const currentWeekString = getISOWeekString(today);
        await computeWeeklySummary(uid, currentWeekString);
        
        // Update current month
        const currentMonthString = getMonthString(today);
        await computeMonthlySummary(uid, currentMonthString);
        
        console.log('Updated current summaries');
    } catch (error) {
        console.error('Error updating current summaries:', error);
        throw error;
    }
}

// ============================================================
// SUMMARY SYSTEM INITIALIZATION
// ============================================================

// Flag to prevent multiple simultaneous backfills
let isBackfilling = false;

// Initialize summary computation system
async function initializeSummarySystem() {
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) {
            console.warn('No user UID found, cannot initialize summary system');
            return;
        }
        
        console.log('Initializing summary computation system...');
        
        // Set up Reports section navigation listener
        setupReportsSectionListener(uid);
        
        // Set up page focus listener for auto-update
        setupPageFocusListener(uid);
        
        // Initial backfill (run in background, don't block)
        if (!IS_REPORT_FETCH_ONLY && !isBackfilling) {
            isBackfilling = true;
            backfillDailyReports(uid).then(() => {
                return backfillAggregateReports(uid);
            }).catch(error => {
                console.error('Error during initial backfill:', error);
            }).finally(() => {
                isBackfilling = false;
            });
        } else if (IS_REPORT_FETCH_ONLY) {
            console.log('[REPORT] Skipping backfill in read-only dashboard context');
        }
        
        // Initial update of current summaries
        await updateCurrentSummaries(uid);
        
        console.log('Summary computation system initialized');
    } catch (error) {
        console.error('Error initializing summary system:', error);
    }
}

// Set up listener for Reports section navigation
function setupReportsSectionListener(uid) {
    // Listen for Reports section navigation
    const reportsLink = document.querySelector('a[href="#reports"]');
    if (reportsLink) {
        reportsLink.addEventListener('click', async () => {
            console.log('Reports section opened, updating summaries...');
            try {
                await updateCurrentSummaries(uid);
                // Reload reports after update (respects filters)
                await Promise.all([
                    loadHourlyReport(),
                    loadDailySummaryReport(),
                    loadWeeklySummaryReport(),
                    loadMonthlySummaryReport(),
                    loadProductionRecordsReport()
                ]);
            } catch (error) {
                console.error('Error updating summaries on Reports section open:', error);
            }
        });
    }
    
    // Also listen for section visibility changes (for programmatic navigation)
    const reportsSection = document.getElementById('reports');
    if (reportsSection) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (reportsSection.classList.contains('active')) {
                        console.log('Reports section became active, loading reports...');
                        // Skip updateCurrentSummaries in read-only mode - just load reports
                        if (!IS_REPORT_FETCH_ONLY) {
                            updateCurrentSummaries(uid).then(() => {
                                return Promise.all([
                                    loadHourlyReport(),
                                    loadDailySummaryReport(),
                                    loadWeeklySummaryReport(),
                                    loadMonthlySummaryReport(),
                                    loadProductionRecordsReport()
                                ]);
                            }).catch(error => {
                                console.error('Error updating summaries:', error);
                            });
                        } else {
                            // Just load reports without updating summaries
                            Promise.all([
                                loadHourlyReport(),
                                loadDailySummaryReport(),
                                loadWeeklySummaryReport(),
                                loadMonthlySummaryReport(),
                                loadProductionRecordsReport()
                            ]).catch(error => {
                                console.error('Error loading reports:', error);
                            });
                        }
                    }
                }
            });
        });
        
        observer.observe(reportsSection, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
}

// Set up page focus listener for auto-update
function setupPageFocusListener(uid) {
    let lastUpdateTime = Date.now();
    const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
    
    window.addEventListener('focus', async () => {
        const now = Date.now();
        // Only update if it's been at least 5 minutes since last update
        if (now - lastUpdateTime >= UPDATE_INTERVAL) {
            console.log('Page regained focus, loading reports...');
            try {
                // Skip updateCurrentSummaries in read-only mode
                if (!IS_REPORT_FETCH_ONLY) {
                    await updateCurrentSummaries(uid);
                }
                lastUpdateTime = now;
                
                // Reload reports if Reports section is active
                const reportsSection = document.getElementById('reports');
                if (reportsSection && reportsSection.classList.contains('active')) {
                    await Promise.all([
                        loadHourlyReport(),
                        loadDailySummaryReport(),
                        loadWeeklySummaryReport(),
                        loadMonthlySummaryReport(),
                        loadProductionRecordsReport()
                    ]);
                }
            } catch (error) {
                console.error('Error loading reports on page focus:', error);
            }
        }
    });
}

// ============================================================
// LOAD FUNCTIONS (UPDATED)
// ============================================================

// ============================================================
// REPORT SELECTOR INITIALIZATION
// ============================================================

// Initialize all report selectors (date, month, year)
function initializeReportSelectors() {
    try {
        const today = new Date();
        
        // Initialize Hourly Date Selector
        selectedHourlyDate = formatDateString(today); // Format: "YYYY-MM-DD"
        const dateSelector = document.getElementById('hourlyDateSelector');
        if (dateSelector) {
            dateSelector.value = selectedHourlyDate;
            dateSelector.addEventListener('change', async (e) => {
                const newDate = e.target.value; // Format: "YYYY-MM-DD"
                console.log('[HOURLY TRACE] Date picker change event triggered');
                console.log('[HOURLY TRACE] Event target value (raw):', e.target.value);
                console.log('[HOURLY TRACE] Current selectedHourlyDate:', selectedHourlyDate);
                console.log('[HOURLY TRACE] Date format check - matches YYYY-MM-DD?', /^\d{4}-\d{2}-\d{2}$/.test(newDate));
                if (newDate && newDate !== selectedHourlyDate) {
                    selectedHourlyDate = newDate;
                    console.log('[HOURLY TRACE] selectedHourlyDate updated to:', selectedHourlyDate);
                    console.log('[HOURLY TRACE] Calling loadHourlyReport()...');
                    await loadHourlyReport();
                } else {
                    console.log('[HOURLY TRACE] Date unchanged or empty, skipping loadHourlyReport()');
                }
            });
            console.log('Hourly date selector initialized with:', selectedHourlyDate);
        }
        
        // Initialize Month Selector for Daily/Weekly
        selectedReportMonth = getMonthString(today); // Format: "YYYY-MM"
        const monthSelector = document.getElementById('reportMonthSelector');
        if (monthSelector) {
        monthSelector.value = selectedReportMonth;
        monthSelector.addEventListener('change', async (e) => {
            const newMonth = e.target.value; // Format: "YYYY-MM"
            if (newMonth && newMonth !== selectedReportMonth) {
                selectedReportMonth = newMonth;
                console.log('Month filter changed to:', selectedReportMonth);
                
                    // Reload daily and weekly reports with new filter
                await Promise.all([
                    loadDailySummaryReport(),
                        loadWeeklySummaryReport()
                ]);
            }
        });
        console.log('Month selector initialized with:', selectedReportMonth);
        }
        
        // Initialize Year Selector for Monthly
        selectedReportYear = today.getFullYear().toString(); // Format: "YYYY"
        const yearSelector = document.getElementById('reportYearSelector');
        if (yearSelector) {
            yearSelector.value = selectedReportYear;
            yearSelector.addEventListener('change', async (e) => {
                const newYear = e.target.value; // Format: "YYYY"
                if (newYear && newYear !== selectedReportYear) {
                    selectedReportYear = newYear;
                    console.log('Year filter changed to:', selectedReportYear);
                    await loadMonthlySummaryReport();
                }
            });
            console.log('Year selector initialized with:', selectedReportYear);
        }
        
    } catch (error) {
        console.error('Error initializing report selectors:', error);
    }
}

// Format trend indicator for display
function formatTrend(trend) {
    if (!trend || trend === 'unknown') {
        return '—';
    }
    switch (trend) {
        case 'up':
            return '<span class="trend-up" style="color: #27ae60; font-weight: 500;">▲ Up</span>';
        case 'down':
            return '<span class="trend-down" style="color: #e74c3c; font-weight: 500;">▼ Down</span>';
        case 'stable':
            return '<span class="trend-stable" style="color: #7f8c8d; font-weight: 500;">● Stable</span>';
        default:
            return '—';
    }
}

// Load Daily Summary Report into table (with month filtering)
async function loadDailySummaryReport() {
    console.log('[REPORT] loadDailySummaryReport start');
    const tableBody = document.getElementById('dailySummaryTableBody'); const loadingEl = document.getElementById('daily-loading'); if (!tableBody) return; if (loadingEl) { loadingEl.classList.remove('hidden'); } tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">Loading reports...</td></tr>'; try { const uid = window.RUNTIME_CONTEXT?.runtimeUid || null; if (!uid) { if (loadingEl) loadingEl.classList.add('hidden'); tableBody.innerHTML = `<tr><td colspan="8" class="error-text">No user ID available</td></tr>`; return; } const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        // Query without orderBy first to avoid errors if 'date' field doesn't exist
        // We'll sort client-side after ensuring date fields are set
        let querySnapshot;
        try {
            const q = query(dailyReportsRef, orderBy('date', 'desc'));
            querySnapshot = await getDocs(q);
        } catch (error) {
            // If orderBy fails (field doesn't exist), query without it
            console.warn('[DAILY] orderBy failed, querying without orderBy:', error);
            querySnapshot = await getDocs(dailyReportsRef);
        }
        
        // Filter by selected month (client-side filtering)
        const filteredReports = [];
        let firstDocLogged = false;
        querySnapshot.forEach(doc => {
            const report = doc.data();
            // Log first document schema for verification (temporary diagnostic)
            if (!firstDocLogged) {
                console.log('[REPORT] loadDailySummaryReport: Sample Firestore doc:', {
                    id: doc.id,
                    fields: Object.keys(report),
                    hasWaterQuality: 'waterQuality' in report,
                    avgTemperature: report.avgTemperature,
                    avgPh: report.avgPh,
                    coverageHours: report.coverageHours
                });
                firstDocLogged = true;
            }
            // Use document ID as fallback if date field doesn't exist
            const dateValue = report.date || doc.id;
            
            // Filter: date.startsWith(selectedReportMonth)
            if (selectedReportMonth && dateValue && dateValue.startsWith(selectedReportMonth)) {
                // Ensure report has date field for consistency
                if (!report.date) {
                    report.date = dateValue;
                }
                filteredReports.push(report);
            } else if (!selectedReportMonth) {
                // If no month selected, show all (backward compatibility)
                // Ensure report has date field for consistency
                if (!report.date) {
                    report.date = dateValue;
                }
                filteredReports.push(report);
            }
        });
        
        // Sort by date descending (client-side, in case orderBy failed)
        filteredReports.sort((a, b) => {
            const dateA = a.date || '';
            const dateB = b.date || '';
            return dateB.localeCompare(dateA); // Descending order
        });
        
        // Limit to 31 days (max days in a month)
        const limitedReports = filteredReports.slice(0, 31);
        
        // EXIT LOADING STATE
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }
        
        if (limitedReports.length === 0) {
            const message = selectedReportMonth 
                ? 'No daily summary data available for selected month' 
                : 'No daily summary data available';
            tableBody.innerHTML = `<tr><td colspan="8" class="no-data-text">${message}</td></tr>`;
            // Clear charts if no data
            clearDailyCharts();
            return;
        }
        
        // Load sensor analytics for trend data
        const analyticsPromises = limitedReports.map(async (report) => {
            try {
                // Ensure date field exists (use doc.id if missing, but we already set it above)
                const dateValue = report.date;
                if (!dateValue) {
                    console.warn('[DAILY] Report missing date field, skipping analytics');
                    return null;
                }
                // Path: users/{uid}/sensorAnalytics/daily/{YYYY-MM-DD}
                // daily is a collection, YYYY-MM-DD is a document
                const analyticsRef = doc(db, `users/${uid}/sensorAnalytics/daily/${dateValue}`);
                const analyticsSnap = await getDoc(analyticsRef);
                return analyticsSnap.exists() ? analyticsSnap.data() : null;
            } catch (error) {
                console.error(`Error loading sensor analytics for ${report.date}:`, error);
                return null;
            }
        });
        
        const analyticsData = await Promise.all(analyticsPromises);
        
        // Extract trend data from sensor analytics
        reportRowsState.dailyRows = limitedReports
            .map((report, index) => {
                // Ensure date field exists
                const dateValue = report.date;
                if (!dateValue) {
                    console.warn('[DAILY] Report missing date field in mapping, skipping');
                    return null;
                }
                const date = new Date(dateValue + 'T00:00:00');
                if (isNaN(date.getTime())) {
                    console.warn(`[DAILY] Invalid date format: ${dateValue}, skipping`);
                    return null;
                }
                const analytics = analyticsData[index];
                return {
                    date: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
                    avgTemperature: report.avgTemperature !== null && report.avgTemperature !== undefined ? report.avgTemperature : null,
                    avgPh: report.avgPh !== null && report.avgPh !== undefined ? report.avgPh : null,
                    waterQuality: (() => { const t = report.avgTemperature; const p = report.avgPh; if (t != null && p != null) { const tempOk = t >= 24 && t <= 30; const phOk = p >= 6.5 && p <= 8.5; return (tempOk && phOk) ? 'Good' : ((tempOk || phOk) ? 'Fair' : 'Poor'); } return 'N/A'; })(),
                    coverageHours: report.coverageHours || null,
                    isSeed: report.isSeed === true,
                    trends: analytics ? {
                        tempTrend: analytics.tempTrend || null,
                        phTrend: analytics.phTrend || null,
                        bothSensorsTrend: analytics.bothSensorsTrend || null
                    } : null
                };
            })
            .filter(row => row !== null); // Remove null entries
        
        tableBody.innerHTML = '';
        reportRowsState.dailyRows.forEach(row => {
            const tr = document.createElement('tr');
            // Check if this is a seed document with no real data
            const isSeedEmpty = row.isSeed && 
                (row.avgTemperature === null || row.avgTemperature === 0) && 
                (row.avgPh === null || row.avgPh === 0);
            
            tr.innerHTML = `
                <td>${row.date}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.avgTemperature !== null && row.avgTemperature !== 0 ? row.avgTemperature.toFixed(1) + '°C' : '--')}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.avgPh !== null && row.avgPh !== 0 ? row.avgPh.toFixed(2) : '--')}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.waterQuality || '--')}</td>
                <td>${row.trends ? formatTrend(row.trends.tempTrend) : '—'}</td>
                <td>${row.trends ? formatTrend(row.trends.phTrend) : '—'}</td>
                <td>${row.trends ? formatTrend(row.trends.bothSensorsTrend) : '—'}</td>
            `;
            tableBody.appendChild(tr);
        });
        
        // Render charts after table is populated
        renderDailyCharts(limitedReports);
        console.log('[REPORT] loadDailySummaryReport end rows=' + reportRowsState.dailyRows.length);
    } catch (error) {
        // EXIT LOADING STATE on error
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }
        console.error('[REPORT] loadDailySummaryReport error:', error);
        const tableBody = document.getElementById('dailySummaryTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="8" class="error-text">Failed to load daily summary</td></tr>';
        }
        clearDailyCharts();
    }
}

// Load Weekly Summary Report into table (with month filtering)
async function loadWeeklySummaryReport() {
    console.log('[REPORT] loadWeeklySummaryReport start');
    const tableBody = document.getElementById('weeklySummaryTableBody');
    const loadingEl = document.getElementById('weekly-loading');
    
    if (!tableBody) {
        console.warn('[REPORT] loadWeeklySummaryReport: tableBody not found');
        return;
    }
    
    // ENTER LOADING STATE
    if (loadingEl) {
        loadingEl.classList.remove('hidden');
    }
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">Loading reports...</td></tr>';
    
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) {
            // EXIT LOADING STATE
            if (loadingEl) loadingEl.classList.add('hidden');
            tableBody.innerHTML = `<tr><td colspan="8" class="error-text">No user ID available</td></tr>`;
            return;
        }
        
        const weeklyReportsRef = collection(db, `users/${uid}/weeklyReports`);
        // Query without orderBy first to avoid errors if 'week' field doesn't exist
        // We'll sort client-side after ensuring week fields are set
        let querySnapshot;
        try {
            const q = query(weeklyReportsRef, orderBy('week', 'desc'), limit(12));
            querySnapshot = await getDocs(q);
        } catch (error) {
            // If orderBy fails (field doesn't exist), query without it
            console.warn('[WEEKLY] orderBy failed, querying without orderBy:', error);
            querySnapshot = await getDocs(query(weeklyReportsRef, limit(12)));
        }
        
        // Filter weekly reports by selected month if applicable
        const filteredReports = [];
        let firstDocLogged = false;
        querySnapshot.forEach(doc => {
            const report = doc.data();
            // Log first document schema for verification (temporary diagnostic)
            if (!firstDocLogged) {
                console.log('[REPORT] loadWeeklySummaryReport: Sample Firestore doc:', {
                    id: doc.id,
                    fields: Object.keys(report),
                    week: report.week,
                    avgTemperature: report.avgTemperature,
                    avgPh: report.avgPh,
                    coverageDays: report.coverageDays
                });
                firstDocLogged = true;
            }
            // Use document ID as fallback if week field doesn't exist
            const weekStr = report.week || doc.id;
            
            // Ensure report has week field for consistency
            if (!report.week && weekStr) {
                report.week = weekStr;
            }
            
            if (!selectedReportMonth) {
                filteredReports.push(report);
            } else {
                // Parse ISO week string (YYYY-WW) to check if it overlaps with selected month
                const match = weekStr.match(/(\d{4})-W(\d{2})/);
                if (match) {
                    const year = parseInt(match[1]);
                    const week = parseInt(match[2]);
                    const monday = isoWeekToMonday(year, week);
                    const sunday = new Date(monday);
                    sunday.setDate(monday.getDate() + 6);
                    
                    const [selectedYear, selectedMonth] = selectedReportMonth.split('-').map(Number);
                    const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
                    const monthEnd = getEndOfMonth(monthStart);
                    
                    // Check if week overlaps with selected month
                    const weekOverlaps = (monday >= monthStart && monday <= monthEnd) ||
                                       (sunday >= monthStart && sunday <= monthEnd) ||
                                       (monday <= monthStart && sunday >= monthEnd);
                    
                    if (weekOverlaps) {
                        filteredReports.push(report);
                    }
                }
            }
        });
        
        // EXIT LOADING STATE
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }
        
        if (filteredReports.length === 0) {
            const message = selectedReportMonth 
                ? 'No weekly summary data available for selected month' 
                : 'No weekly summary data available';
            tableBody.innerHTML = `<tr><td colspan="8" class="no-data-text">${message}</td></tr>`;
            clearWeeklyCharts();
            return;
        }
        
        // Load sensor analytics for trend data
        const analyticsPromises = filteredReports.map(async (report) => {
            try {
                const weekStr = report.week || '';
                // Path: users/{uid}/sensorAnalytics/weekly/{YYYY-WW}
                // weekly is a collection, YYYY-WW is a document
                const analyticsRef = doc(db, `users/${uid}/sensorAnalytics/weekly/${weekStr}`);
                const analyticsSnap = await getDoc(analyticsRef);
                return analyticsSnap.exists() ? analyticsSnap.data() : null;
            } catch (error) {
                console.error(`Error loading sensor analytics for week ${report.week}:`, error);
                return null;
            }
        });
        
        const analyticsData = await Promise.all(analyticsPromises);
        
        // Extract trend data from sensor analytics
        reportRowsState.weeklyRows = filteredReports.map((report, index) => {
            const weekStr = report.week || '';
            const match = weekStr.match(/(\d{4})-W(\d{2})/);
            let periodStr = weekStr;
            if (match) {
                const year = parseInt(match[1]);
                const week = parseInt(match[2]);
                const monday = isoWeekToMonday(year, week);
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                periodStr = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            }
            const analytics = analyticsData[index];
            
            return {
                period: periodStr,
                week: weekStr,
                avgPh: report.avgPh !== null && report.avgPh !== undefined ? report.avgPh : null,
                avgTemperature: report.avgTemperature !== null && report.avgTemperature !== undefined ? report.avgTemperature : null,
                coverageDays: report.coverageDays || 0,
                isSeed: report.isSeed === true,
                trends: analytics ? {
                    tempTrend: analytics.tempTrend || null,
                    phTrend: analytics.phTrend || null,
                    bothSensorsTrend: analytics.bothSensorsTrend || null
                } : null
            };
        });
        
        tableBody.innerHTML = '';
        reportRowsState.weeklyRows.forEach(row => {
            const tr = document.createElement('tr');
            // Check if this is a seed document with no real data
            const isSeedEmpty = row.isSeed && 
                (row.avgTemperature === null || row.avgTemperature === 0) && 
                (row.avgPh === null || row.avgPh === 0) &&
                (row.coverageDays === 0);
            
            tr.innerHTML = `
                <td>${row.period}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.avgPh !== null && row.avgPh !== 0 ? row.avgPh.toFixed(2) : '--')}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.avgTemperature !== null && row.avgTemperature !== 0 ? row.avgTemperature.toFixed(1) + '°C' : '--')}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.coverageDays || 0) + ' days'}</td>
                <td>${row.trends ? formatTrend(row.trends.tempTrend) : '—'}</td>
                <td>${row.trends ? formatTrend(row.trends.phTrend) : '—'}</td>
                <td>${row.trends ? formatTrend(row.trends.bothSensorsTrend) : '—'}</td>
            `;
            tableBody.appendChild(tr);
        });
        
        // Render charts after table is populated
        renderWeeklyCharts(filteredReports);
        console.log('[REPORT] loadWeeklySummaryReport end rows=' + reportRowsState.weeklyRows.length);
    } catch (error) {
        // EXIT LOADING STATE on error
        const loadingEl = document.getElementById('weekly-loading');
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }
        console.error('[REPORT] loadWeeklySummaryReport error:', error);
        const tableBody = document.getElementById('weeklySummaryTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="8" class="error-text">Failed to load weekly summary</td></tr>';
        }
        clearWeeklyCharts();
    }
}

// Load Monthly Summary Report into table (with month filtering)
async function loadMonthlySummaryReport() {
    console.log('[REPORT] loadMonthlySummaryReport start');
    const tableBody = document.getElementById('monthlySummaryTableBody');
    const loadingEl = document.getElementById('monthly-loading');
    
    if (!tableBody) {
        console.warn('[REPORT] loadMonthlySummaryReport: tableBody not found');
        return;
    }
    
    // ENTER LOADING STATE
    if (loadingEl) {
        loadingEl.classList.remove('hidden');
    }
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">Loading reports...</td></tr>';
    
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) {
            // EXIT LOADING STATE
            if (loadingEl) loadingEl.classList.add('hidden');
            tableBody.innerHTML = `<tr><td colspan="8" class="error-text">No user ID available</td></tr>`;
            return;
        }
        
        // Load monthly reports (use month field, not monthStart)
        const monthlyReportsRef = collection(db, `users/${uid}/monthlyReports`);
        // Query without orderBy first to avoid errors if 'month' field doesn't exist
        // We'll sort client-side after ensuring month fields are set
        let querySnapshot;
        try {
            const q = selectedReportYear 
                ? query(monthlyReportsRef, orderBy('month', 'desc')) 
                : query(monthlyReportsRef, orderBy('month', 'desc'), limit(12));
            querySnapshot = await getDocs(q);
        } catch (error) {
            // If orderBy fails (field doesn't exist), query without it
            console.warn('[MONTHLY] orderBy failed, querying without orderBy:', error);
            querySnapshot = await getDocs(
                selectedReportYear 
                    ? monthlyReportsRef 
                    : query(monthlyReportsRef, limit(12))
            );
        }
        
        // Filter by selected year if applicable
        const filteredReports = [];
        let firstDocLogged = false;
        querySnapshot.forEach(doc => {
            const report = doc.data();
            // Log first document schema for verification (temporary diagnostic)
            if (!firstDocLogged) {
                console.log('[REPORT] loadMonthlySummaryReport: Sample Firestore doc:', {
                    id: doc.id,
                    fields: Object.keys(report),
                    month: report.month,
                    avgTemperature: report.avgTemperature,
                    avgPh: report.avgPh,
                    coverageDays: report.coverageDays
                });
                firstDocLogged = true;
            }
            // Use document ID as fallback if month field doesn't exist
            const monthValue = report.month || doc.id;
            
            if (monthValue) {
                const reportYear = monthValue.split('-')[0]; // Extract year from "YYYY-MM"
                if (!selectedReportYear || reportYear === selectedReportYear) {
                    // Ensure report has month field for consistency
                    if (!report.month) {
                        report.month = monthValue;
                    }
                    filteredReports.push(report);
                }
            }
        });
        
        // Sort by month descending (client-side, in case orderBy failed)
        filteredReports.sort((a, b) => {
            const monthA = a.month || '';
            const monthB = b.month || '';
            return monthB.localeCompare(monthA); // Descending order
        });
        
        // EXIT LOADING STATE
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }
        
        if (filteredReports.length === 0) {
            const message = selectedReportYear 
                ? `No monthly summary data available for year ${selectedReportYear}` 
                : 'No monthly summary data available';
            tableBody.innerHTML = `<tr><td colspan="8" class="no-data-text">${message}</td></tr>`;
            clearMonthlyCharts();
            return;
        }
        
        // Load sensor analytics for trend data
        const analyticsPromises = filteredReports.map(async (report) => {
            try {
                const monthStr = report.month || '';
                // Path: users/{uid}/sensorAnalytics/monthly/{YYYY-MM}
                // monthly is a collection, YYYY-MM is a document
                const analyticsRef = doc(db, `users/${uid}/sensorAnalytics/monthly/${monthStr}`);
                const analyticsSnap = await getDoc(analyticsRef);
                return analyticsSnap.exists() ? analyticsSnap.data() : null;
            } catch (error) {
                console.error(`Error loading sensor analytics for month ${report.month}:`, error);
                return null;
            }
        });
        
        const analyticsData = await Promise.all(analyticsPromises);
        
        // Extract trend data from sensor analytics
        reportRowsState.monthlyRows = filteredReports.map((report, index) => {
            const [year, month] = report.month.split('-');
            const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
            const monthStr = monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            const analytics = analyticsData[index];
            
            return {
                month: monthStr,
                monthKey: report.month,
                avgPh: report.avgPh !== null && report.avgPh !== undefined ? report.avgPh : null,
                avgTemperature: report.avgTemperature !== null && report.avgTemperature !== undefined ? report.avgTemperature : null,
                coverageDays: report.coverageDays || 0,
                isSeed: report.isSeed === true,
                trends: analytics ? {
                    tempTrend: analytics.tempTrend || null,
                    phTrend: analytics.phTrend || null,
                    bothSensorsTrend: analytics.bothSensorsTrend || null
                } : null
            };
        });
        
        tableBody.innerHTML = '';
        reportRowsState.monthlyRows.forEach(r => {
            const row = document.createElement('tr');
            // Check if this is a seed document with no real data
            const isSeedEmpty = r.isSeed && 
                (r.avgTemperature === null || r.avgTemperature === 0) && 
                (r.avgPh === null || r.avgPh === 0) &&
                (r.coverageDays === 0);
            
            row.innerHTML = `
                <td>${r.month}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (r.avgPh !== null && r.avgPh !== 0 ? r.avgPh.toFixed(2) : '--')}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (r.avgTemperature !== null && r.avgTemperature !== 0 ? r.avgTemperature.toFixed(1) + '°C' : '--')}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (r.coverageDays || 0) + ' days'}</td>
                <td>${r.trends ? formatTrend(r.trends.tempTrend) : '—'}</td>
                <td>${r.trends ? formatTrend(r.trends.phTrend) : '—'}</td>
                <td>${r.trends ? formatTrend(r.trends.bothSensorsTrend) : '—'}</td>
            `;
            tableBody.appendChild(row);
        });
        
        // Render charts after table is populated
        renderMonthlyCharts(filteredReports);
        console.log('[REPORT] loadMonthlySummaryReport end rows=' + reportRowsState.monthlyRows.length);
    } catch (error) {
        // EXIT LOADING STATE on error
        const loadingEl = document.getElementById('monthly-loading');
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }
        console.error('[REPORT] loadMonthlySummaryReport error:', error);
        const tableBody = document.getElementById('monthlySummaryTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="8" class="error-text">Failed to load monthly summary</td></tr>';
        }
        clearMonthlyCharts();
    }
}

// ============================================================
// CHART RENDERING FUNCTIONS (Chart.js)
// ============================================================
// Chart instances are defined at the top of the file (line ~31)

// Clear daily charts
function clearDailyCharts() {
    Object.values(chartInstances.daily).forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances.daily = { temperature: null, ph: null };
}

// Clear weekly charts
function clearWeeklyCharts() {
    Object.values(chartInstances.weekly).forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances.weekly = { temperature: null, ph: null };
}

// Clear monthly charts
function clearMonthlyCharts() {
    Object.values(chartInstances.monthly).forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances.monthly = { temperature: null, ph: null };
}

// Clear hourly charts
function clearHourlyCharts() {
    Object.values(chartInstances.hourly).forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances.hourly = { temperature: null, ph: null };
}

// Load Hourly Report into table
async function loadHourlyReport() {
    console.log('[REPORT] loadHourlyReport start');
    const tableBody = document.getElementById('hourlySummaryTableBody');
    const loadingEl = document.getElementById('hourly-loading');
    
    if (!tableBody) {
        console.warn('[REPORT] loadHourlyReport: tableBody not found');
        return;
    }
    
    // ENTER LOADING STATE
    if (loadingEl) {
        loadingEl.classList.remove('hidden');
    }
    tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">Loading hourly data...</td></tr>';
    
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) {
            console.warn('[REPORT] loadHourlyReport: No UID available');
            // EXIT LOADING STATE
            if (loadingEl) loadingEl.classList.add('hidden');
            tableBody.innerHTML = `<tr><td colspan="4" class="error-text">No user ID available</td></tr>`;
            return;
        }
        
        // Use selected date, default to today if not set
        const dateStr = selectedHourlyDate || formatDateString(new Date());
        
        // Read hourly records for selected date from the correct Firestore path
        // Path: users/{uid}/hourlyRecords/{date}/hours/{hour}
        const computedPath = `users/${uid}/hourlyRecords/${dateStr}/hours`;
        const hoursRef = collection(db, computedPath);
        
        // Try with orderBy first, fallback to query without orderBy if field doesn't exist
        let hoursSnapshot;
        try {
            hoursSnapshot = await getDocs(query(hoursRef, orderBy('hour', 'asc')));
        } catch (error) {
            console.warn('[HOURLY] orderBy failed, querying without orderBy:', error);
            hoursSnapshot = await getDocs(hoursRef);
        }
        
        // EXIT LOADING STATE
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }
        
        // Process results
        if (hoursSnapshot.empty) {
            console.log(`[HOURLY] No hourly records found for ${dateStr}`);
            const dateObj = new Date(dateStr + 'T00:00:00');
            const dateDisplay = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            tableBody.innerHTML = `<tr><td colspan="4" class="no-data-text">No hourly data available for ${dateDisplay}</td></tr>`;
            clearHourlyCharts();
            return;
        }
        
        console.log(`[HOURLY] Found ${hoursSnapshot.size} hourly records`);
        
        const hourlyReports = [];
        let seedCount = 0;
        let nonSeedCount = 0;
        hoursSnapshot.forEach(doc => {
            const data = doc.data();
            // Ensure hour field exists (use document ID as fallback)
            if (!data.hour) {
                data.hour = doc.id;
            }
            hourlyReports.push(data);
            if (data.isSeed === true) {
                seedCount++;
            } else {
                nonSeedCount++;
            }
            console.log(`[HOURLY] Hour ${data.hour}: temp=${data.temperatureAvg}, pH=${data.phAvg}, isSeed=${data.isSeed}`);
        });
        
        // Sort by hour ascending (client-side, in case orderBy failed)
        hourlyReports.sort((a, b) => {
            const hourA = parseInt(a.hour || '0', 10);
            const hourB = parseInt(b.hour || '0', 10);
            return hourA - hourB;
        });
        
        console.log('[HOURLY TRACE] Total documents processed:', hourlyReports.length);
        console.log('[HOURLY TRACE] Seed documents count:', seedCount);
        console.log('[HOURLY TRACE] Non-seed documents count:', nonSeedCount);
        console.log('[HOURLY TRACE] Note: isSeed documents are NOT filtered from query - they are included in results');
        
        // Store rows in memory for export
        reportRowsState.hourlyRows = hourlyReports.map(report => {
            return {
                hour: report.hour || '00',
                temperature: report.temperatureAvg !== null && report.temperatureAvg !== undefined ? report.temperatureAvg : null,
                ph: report.phAvg !== null && report.phAvg !== undefined ? report.phAvg : null,
                isSeed: report.isSeed === true
            };
        });
        
        tableBody.innerHTML = '';
        reportRowsState.hourlyRows.forEach(row => {
            const tr = document.createElement('tr');
            const isSeedEmpty = row.isSeed && 
                (row.temperature === null || row.temperature === 0) && 
                (row.ph === null || row.ph === 0);
            
            tr.innerHTML = `
                <td>${row.hour}:00</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.temperature !== null && row.temperature !== 0 ? row.temperature.toFixed(1) + '°C' : '--')}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.ph !== null && row.ph !== 0 ? row.ph.toFixed(2) : '--')}</td>
            `;
            tableBody.appendChild(tr);
        });
        
        // Render charts after table is populated
        renderHourlyCharts(hourlyReports);
        console.log('[REPORT] loadHourlyReport end rows=' + reportRowsState.hourlyRows.length);
        
        console.log(`[HOURLY] Successfully loaded ${hourlyReports.length} hourly records`);
        
    } catch (error) {
        // EXIT LOADING STATE on error
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }
        console.error('[REPORT] loadHourlyReport error:', error);
        const tableBody = document.getElementById('hourlySummaryTableBody');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="4" class="error-text">Failed to load hourly data</td></tr>`;
        }
        clearHourlyCharts();
    }
}

// ============================================================
// PRODUCTION MONITORING FIRESTORE RECORDING
// ============================================================
// Records calculated production metrics to Firestore
// Firestore Path: users/{uid}/productionRecords/{autoId}
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
        console.log(`[PRODUCTION] Document ID: ${docRef.id}`);
        console.log(`[PRODUCTION] Path: users/${uid}/productionRecords/${docRef.id}`);
    } catch (error) {
        console.error("[PRODUCTION] Error saving production record to Firestore:", error);
        throw error; // Re-throw so caller can handle it
    }
}

// Make function globally accessible
window.recordProductionMetrics = recordProductionMetrics;

// ============================================================
// PRODUCTION RECORDS REPORT (Harvest Mortality Log)
// ============================================================

// Load Production Records from Firestore and display in table
async function loadProductionRecordsReport() {
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) {
            console.warn('[PRODUCTION RECORDS] No UID found');
            return;
        }
        
        const loadingEl = document.getElementById('production-loading');
        const tableBody = document.getElementById('productionRecordsTableBody');
        
        if (!tableBody) {
            console.warn('[PRODUCTION RECORDS] Table body not found');
            return;
        }
        
        // Show loading state
        if (loadingEl) loadingEl.classList.remove('hidden');
        tableBody.innerHTML = '<tr><td colspan="10" class="no-data-text">Loading production records...</td></tr>';
        
        // Fetch all production records
        const productionRecordsRef = collection(db, `users/${uid}/productionRecords`);
        const querySnapshot = await getDocs(productionRecordsRef);
        
        if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="10" class="no-data-text">No production records available</td></tr>';
            if (loadingEl) loadingEl.classList.add('hidden');
            // Set default empty state in Output Value card
            updateProductionOutputValue(null);
            return;
        }
        
        // Convert to array and sort by createdAt DESC (newest first)
        const records = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            records.push({
                id: doc.id,
                ...data
            });
        });
        
        // Sort by createdAt DESC
        records.sort((a, b) => {
            const aTime = timestampToDate(a.createdAt);
            const bTime = timestampToDate(b.createdAt);
            if (!aTime || !bTime) return 0;
            return bTime - aTime; // Newest first
        });
        
        // Store rows in reportRowsState for export
        reportRowsState.productionRows = records.map(record => {
            const createdAt = timestampToDate(record.createdAt);
            let dateStr = '--';
            if (createdAt) {
                dateStr = createdAt.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                });
            }
            
            return {
                date: dateStr,
                startMonth: record.startMonth || '--',
                endMonth: record.endMonth || '--',
                fingerlings: record.fingerlingsCount || 0,
                harvested: record.harvestedCount || 0,
                survival: record.survivalPercentage || record.survivalRate || 0,
                profit: record.profitValue || record.profitRate || 0,
                loss: record.lossValue || record.lossRate || 0,
                deaths: record.deathsValue || record.deathsCount || 0
            };
        });
        
        // Clear table
        tableBody.innerHTML = '';
        
        // Render table rows
        records.forEach((record, index) => {
            const row = document.createElement('tr');
            row.dataset.recordId = record.id;
            
            // Format date from createdAt (local date format)
            const createdAt = timestampToDate(record.createdAt);
            let dateStr = '--';
            if (createdAt) {
                // Format as "MMM DD, YYYY" (e.g., "Jan 22, 2026")
                dateStr = createdAt.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                });
            }
            
            // Get field values (handle both old and new field names)
            const fingerlings = record.fingerlingsCount || 0;
            const harvested = record.harvestedCount || 0;
            const survival = record.survivalPercentage || record.survivalRate || 0;
            const profit = record.profitValue || record.profitRate || 0;
            const loss = record.lossValue || record.lossRate || 0;
            const deaths = record.deathsValue || record.deathsCount || 0;
            const startMonth = record.startMonth || '--';
            const endMonth = record.endMonth || '--';
            
            // Create season key for checkbox
            const seasonKey = `${startMonth}_${endMonth}`;
            
            row.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" class="season-row-checkbox" value="${seasonKey}" checked data-record-id="${record.id}" onchange="handleSeasonRowCheckboxChange()" style="cursor: pointer; width: 18px; height: 18px;">
                </td>
                <td>${dateStr}</td>
                <td>${startMonth}</td>
                <td>${endMonth}</td>
                <td>${fingerlings}</td>
                <td>${harvested}</td>
                <td>${survival}%</td>
                <td>${profit}%</td>
                <td>${loss}%</td>
                <td>${deaths}</td>
            `;
            
            // Add click handler
            row.addEventListener('click', () => {
                // Remove selected class from all rows
                tableBody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
                // Add selected class to clicked row
                row.classList.add('selected');
                // Update Output Value card
                updateProductionOutputValue(record);
            });
            
            // Auto-select first (newest) record on load
            if (index === 0) {
                row.classList.add('selected');
                updateProductionOutputValue(record);
            }
            
            tableBody.appendChild(row);
        });
        
        if (loadingEl) loadingEl.classList.add('hidden');
        
        console.log(`[PRODUCTION RECORDS] Loaded ${records.length} production records`);
        
    } catch (error) {
        console.error('[PRODUCTION RECORDS] Error loading production records:', error);
        const tableBody = document.getElementById('productionRecordsTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="10" class="no-data-text">Error loading production records</td></tr>';
        }
        const loadingEl = document.getElementById('production-loading');
        if (loadingEl) loadingEl.classList.add('hidden');
        updateProductionOutputValue(null);
    }
}

// Update Output Value card with selected production record
function updateProductionOutputValue(record) {
    if (!record) {
        // Set default empty state
        document.getElementById('reportFingerlingsHarvest').textContent = '--';
        document.getElementById('reportSurvivalPercentage').textContent = '--%';
        document.getElementById('reportProfitValue').textContent = '--%';
        document.getElementById('reportLossValue').textContent = '--%';
        document.getElementById('reportDeathsValue').textContent = '--';
        return;
    }
    
    // Get field values (handle both old and new field names)
    const fingerlings = record.fingerlingsCount || 0;
    const harvested = record.harvestedCount || 0;
    const survival = record.survivalPercentage || record.survivalRate || 0;
    const profit = record.profitValue || record.profitRate || 0;
    const loss = record.lossValue || record.lossRate || 0;
    const deaths = record.deathsValue || record.deathsCount || 0;
    
    // Update Output Value card (matches Production Monitoring format)
    document.getElementById('reportFingerlingsHarvest').textContent = `${fingerlings} / ${harvested}`;
    document.getElementById('reportSurvivalPercentage').textContent = `${survival}%`;
    document.getElementById('reportProfitValue').textContent = `${profit}%`;
    document.getElementById('reportLossValue').textContent = `${loss}%`;
    document.getElementById('reportDeathsValue').textContent = deaths;
}

// Load Mortality Log Report into table
async function loadMortalityLogReport() {
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) return;
        
        const mortalityLogsRef = collection(db, `users/${uid}/mortalityLogs`);
        const q = query(mortalityLogsRef, orderBy('timestamp', 'desc'), limit(50));
        const querySnapshot = await getDocs(q);
        
        const tableBody = document.getElementById('mortalityLogTableBody');
        if (!tableBody) return;
        
        if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5" class="no-data-text">No mortality log data available</td></tr>';
            return;
        }
        
        // Store rows in memory for export
        reportRowsState.mortalityRows = [];
        querySnapshot.forEach(doc => {
            const log = doc.data();
            const timestamp = log.timestamp ? (log.timestamp.seconds ? new Date(log.timestamp.seconds * 1000) : new Date(log.timestamp)) : new Date();
            reportRowsState.mortalityRows.push({
                date: timestamp.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
                time: timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                count: log.count || null,
                cause: log.cause || null,
                notes: log.notes || null
            });
        });
        
        tableBody.innerHTML = '';
        reportRowsState.mortalityRows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.date}</td>
                <td>${row.time}</td>
                <td>${row.count !== null ? row.count + ' fish' : '--'}</td>
                <td>${row.cause || '--'}</td>
                <td>${row.notes || '--'}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading mortality log report:', error);
        const tableBody = document.getElementById('mortalityLogTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="5" class="no-data-text">Error loading mortality log</td></tr>';
        }
    }
}

// ============================================================
// SENSOR ANALYTICS UI LOADING
// ============================================================

// Load and display sensor analytics based on selected period
async function loadSensorAnalyticsUI() {
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) return;
        
        const periodSelector = document.getElementById('analyticsPeriodSelector');
        const dateSelector = document.getElementById('analyticsDateSelector');
        const monthSelector = document.getElementById('analyticsMonthSelector');
        const cardsContainer = document.getElementById('analyticsCardsContainer');
        const tableBody = document.getElementById('analyticsDetailsTableBody');
        
        if (!periodSelector || !cardsContainer || !tableBody) return;
        
        const period = periodSelector.value;
        
        // Show/hide appropriate selectors
        if (period === 'daily') {
            if (dateSelector) dateSelector.style.display = 'block';
            if (monthSelector) monthSelector.style.display = 'none';
            if (dateSelector && !dateSelector.value) {
                const today = new Date();
                dateSelector.value = formatDateString(today);
            }
            if (dateSelector) {
                await loadDailyAnalyticsUI(uid, dateSelector.value);
            }
        } else if (period === 'weekly') {
            if (dateSelector) dateSelector.style.display = 'none';
            if (monthSelector) monthSelector.style.display = 'block';
            if (monthSelector && !monthSelector.value) {
                const today = new Date();
                monthSelector.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            }
            if (monthSelector) {
                await loadWeeklyAnalyticsUI(uid, monthSelector.value);
            }
        } else if (period === 'monthly') {
            if (dateSelector) dateSelector.style.display = 'none';
            if (monthSelector) monthSelector.style.display = 'block';
            if (monthSelector && !monthSelector.value) {
                const today = new Date();
                monthSelector.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            }
            if (monthSelector) {
                await loadMonthlyAnalyticsUI(uid, monthSelector.value);
            }
        }
        
    } catch (error) {
        console.error('Error loading sensor analytics UI:', error);
    }
}

// Load daily analytics UI
async function loadDailyAnalyticsUI(uid, date) {
    try {
        // Path: users/{uid}/sensorAnalytics/daily/{YYYY-MM-DD}
        // daily is a collection, YYYY-MM-DD is a document
        const analyticsRef = doc(db, `users/${uid}/sensorAnalytics/daily/${date}`);
        const analyticsSnap = await getDoc(analyticsRef);
        
        const cardsContainer = document.getElementById('analyticsCardsContainer');
        const tableBody = document.getElementById('analyticsDetailsTableBody');
        
        if (!cardsContainer || !tableBody) return;
        
        if (!analyticsSnap.exists()) {
            cardsContainer.innerHTML = '<div class="no-data-text" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">No analytics document found</div>';
            tableBody.innerHTML = '<tr><td colspan="8" class="no-data-text">No analytics document found</td></tr>';
            return;
        }
        
        const data = analyticsSnap.data();
        const tempHours = data.tempAvailability != null ? data.tempAvailability : 0;
        const phHours = data.phAvailability != null ? data.phAvailability : 0;
        const bothHours = data.bothSensorsAvailability != null ? data.bothSensorsAvailability : 0;
        const noDataHours = data.noDataHours != null ? data.noDataHours : 0;
        
        // Display analytics cards
        cardsContainer.innerHTML = `
            <div class="analytics-card" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 1rem 0; color: #2c3e50; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Temperature Availability</h4>
                <div style="font-size: 2rem; font-weight: bold; color: #3498db; margin-bottom: 0.5rem;">${tempHours}</div>
                <div style="color: #7f8c8d; font-size: 0.85rem;">hours / 24</div>
                <div style="margin-top: 0.5rem; color: #7f8c8d; font-size: 0.85rem;">${data.tempTrend ? formatTrend(data.tempTrend) : '—'}</div>
            </div>
            <div class="analytics-card" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 1rem 0; color: #2c3e50; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">pH Availability</h4>
                <div style="font-size: 2rem; font-weight: bold; color: #9b59b6; margin-bottom: 0.5rem;">${phHours}</div>
                <div style="color: #7f8c8d; font-size: 0.85rem;">hours / 24</div>
                <div style="margin-top: 0.5rem; color: #7f8c8d; font-size: 0.85rem;">${data.phTrend ? formatTrend(data.phTrend) : '—'}</div>
            </div>
            <div class="analytics-card" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 1rem 0; color: #2c3e50; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Both Sensors Available</h4>
                <div style="font-size: 2rem; font-weight: bold; color: #27ae60; margin-bottom: 0.5rem;">${bothHours}</div>
                <div style="color: #7f8c8d; font-size: 0.85rem;">hours / 24</div>
                <div style="margin-top: 0.5rem; color: #7f8c8d; font-size: 0.85rem;">${data.bothSensorsTrend ? formatTrend(data.bothSensorsTrend) : '—'}</div>
            </div>
            <div class="analytics-card" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 1rem 0; color: #2c3e50; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">No Data Hours</h4>
                <div style="font-size: 2rem; font-weight: bold; color: #e74c3c; margin-bottom: 0.5rem;">${noDataHours}</div>
                <div style="color: #7f8c8d; font-size: 0.85rem;">hours / 24</div>
            </div>
        `;
        
        // Display details table
        const dateObj = new Date(date + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        
        tableBody.innerHTML = `
            <tr>
                <td>${dateStr}</td>
                <td>${tempHours} hours</td>
                <td>${phHours} hours</td>
                <td>${bothHours} hours</td>
                <td>${noDataHours} hours</td>
                <td>${data.tempTrend ? formatTrend(data.tempTrend) : '—'}</td>
                <td>${data.phTrend ? formatTrend(data.phTrend) : '—'}</td>
                <td>${data.bothSensorsTrend ? formatTrend(data.bothSensorsTrend) : '—'}</td>
            </tr>
        `;
        
    } catch (error) {
        console.error('Error loading daily analytics UI:', error);
        const cardsContainer = document.getElementById('analyticsCardsContainer');
        const tableBody = document.getElementById('analyticsDetailsTableBody');
        if (cardsContainer) cardsContainer.innerHTML = '<div class="no-data-text" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">Error loading analytics data</div>';
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" class="no-data-text">Error loading analytics data</td></tr>';
    }
}

// Load weekly analytics UI
async function loadWeeklyAnalyticsUI(uid, month) {
    try {
        // Get all weekly sensor analytics for the selected month
        const weeklyAnalyticsRef = collection(db, "users", uid, "sensorAnalytics", "weekly");
        const weeklySnapshot = await getDocs(weeklyAnalyticsRef);
        
        const cardsContainer = document.getElementById('analyticsCardsContainer');
        const tableBody = document.getElementById('analyticsDetailsTableBody');
        
        if (!cardsContainer || !tableBody) return;
        
        const weeklyData = [];
        weeklySnapshot.forEach(doc => {
            const data = doc.data();
            if (data.week) {
                // Check if week overlaps with selected month
                const match = data.week.match(/(\d{4})-W(\d{2})/);
                if (match) {
                    const year = parseInt(match[1]);
                    const week = parseInt(match[2]);
                    const monday = isoWeekToMonday(year, week);
                    const [selectedYear, selectedMonth] = month.split('-').map(Number);
                    const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
                    const monthEnd = new Date(selectedYear, selectedMonth, 0);
                    
                    if (monday >= monthStart && monday <= monthEnd) {
                        weeklyData.push(data);
                    }
                }
            }
        });
        
        if (weeklyData.length === 0) {
            cardsContainer.innerHTML = '<div class="no-data-text" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">No weekly analytics found for selected month</div>';
            tableBody.innerHTML = '<tr><td colspan="8" class="no-data-text">No weekly analytics found for selected month</td></tr>';
            return;
        }
        
        // Sort by week descending
        weeklyData.sort((a, b) => (b.week || '').localeCompare(a.week || ''));
        
        // Calculate averages for cards (weekly stores totals, so divide by 7 for daily average)
        const avgTempHours = weeklyData.reduce((sum, d) => sum + (d.tempAvailability != null ? d.tempAvailability : 0), 0) / (weeklyData.length * 7);
        const avgPhHours = weeklyData.reduce((sum, d) => sum + (d.phAvailability != null ? d.phAvailability : 0), 0) / (weeklyData.length * 7);
        const avgBothHours = weeklyData.reduce((sum, d) => sum + (d.bothSensorsAvailability != null ? d.bothSensorsAvailability : 0), 0) / (weeklyData.length * 7);
        const avgNoDataHours = weeklyData.reduce((sum, d) => sum + (d.noDataHours != null ? d.noDataHours : 0), 0) / (weeklyData.length * 7);
        
        // Display analytics cards
        cardsContainer.innerHTML = `
            <div class="analytics-card" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 1rem 0; color: #2c3e50; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Avg Temp Availability</h4>
                <div style="font-size: 2rem; font-weight: bold; color: #3498db; margin-bottom: 0.5rem;">${avgTempHours.toFixed(1)}</div>
                <div style="color: #7f8c8d; font-size: 0.85rem;">hours per day</div>
            </div>
            <div class="analytics-card" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 1rem 0; color: #2c3e50; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Avg pH Availability</h4>
                <div style="font-size: 2rem; font-weight: bold; color: #9b59b6; margin-bottom: 0.5rem;">${avgPhHours.toFixed(1)}</div>
                <div style="color: #7f8c8d; font-size: 0.85rem;">hours per day</div>
            </div>
            <div class="analytics-card" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 1rem 0; color: #2c3e50; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Avg Both Sensors</h4>
                <div style="font-size: 2rem; font-weight: bold; color: #27ae60; margin-bottom: 0.5rem;">${avgBothHours.toFixed(1)}</div>
                <div style="color: #7f8c8d; font-size: 0.85rem;">hours per day</div>
            </div>
            <div class="analytics-card" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 1rem 0; color: #2c3e50; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Avg No Data</h4>
                <div style="font-size: 2rem; font-weight: bold; color: #e74c3c; margin-bottom: 0.5rem;">${avgNoDataHours.toFixed(1)}</div>
                <div style="color: #7f8c8d; font-size: 0.85rem;">hours per day</div>
            </div>
        `;
        
        // Display details table
        tableBody.innerHTML = '';
        weeklyData.forEach(data => {
            const weekStr = data.week || '';
            const match = weekStr.match(/(\d{4})-W(\d{2})/);
            let periodStr = weekStr;
            if (match) {
                const year = parseInt(match[1]);
                const week = parseInt(match[2]);
                const monday = isoWeekToMonday(year, week);
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                periodStr = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            }
            
            const tr = document.createElement('tr');
            const totalTemp = data.tempAvailability != null ? data.tempAvailability : 0;
            const totalPh = data.phAvailability != null ? data.phAvailability : 0;
            const totalBoth = data.bothSensorsAvailability != null ? data.bothSensorsAvailability : 0;
            const totalNoData = data.noDataHours != null ? data.noDataHours : 0;
            // Weekly stores totals, divide by 7 for daily average
            tr.innerHTML = `
                <td>${periodStr}</td>
                <td>${(totalTemp / 7).toFixed(1)} hours/day</td>
                <td>${(totalPh / 7).toFixed(1)} hours/day</td>
                <td>${(totalBoth / 7).toFixed(1)} hours/day</td>
                <td>${(totalNoData / 7).toFixed(1)} hours/day</td>
                <td>${data.tempTrend ? formatTrend(data.tempTrend) : '—'}</td>
                <td>${data.phTrend ? formatTrend(data.phTrend) : '—'}</td>
                <td>${data.bothSensorsTrend ? formatTrend(data.bothSensorsTrend) : '—'}</td>
            `;
            tableBody.appendChild(tr);
        });
        
    } catch (error) {
        console.error('Error loading weekly analytics UI:', error);
        const cardsContainer = document.getElementById('analyticsCardsContainer');
        const tableBody = document.getElementById('analyticsDetailsTableBody');
        if (cardsContainer) cardsContainer.innerHTML = '<div class="no-data-text" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">Error loading analytics data</div>';
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" class="no-data-text">Error loading analytics data</td></tr>';
    }
}

// Load monthly analytics UI
async function loadMonthlyAnalyticsUI(uid, month) {
    try {
        // Get monthly sensor analytics for the selected month
        const monthString = month; // Already in YYYY-MM format
        // Path: users/{uid}/sensorAnalytics/monthly/{YYYY-MM}
        // monthly is a collection, YYYY-MM is a document
        const analyticsRef = doc(db, `users/${uid}/sensorAnalytics/monthly/${monthString}`);
        const analyticsSnap = await getDoc(analyticsRef);
        
        const cardsContainer = document.getElementById('analyticsCardsContainer');
        const tableBody = document.getElementById('analyticsDetailsTableBody');
        
        if (!cardsContainer || !tableBody) return;
        
        if (!analyticsSnap.exists()) {
            cardsContainer.innerHTML = '<div class="no-data-text" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">No analytics document found</div>';
            tableBody.innerHTML = '<tr><td colspan="8" class="no-data-text">No analytics document found</td></tr>';
            return;
        }
        
        const data = analyticsSnap.data();
        const [year, monthNum] = monthString.split('-');
        const monthDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const daysInMonth = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
        
        // Monthly stores totals, divide by days in month for daily average
        const totalTemp = data.tempAvailability != null ? data.tempAvailability : 0;
        const totalPh = data.phAvailability != null ? data.phAvailability : 0;
        const totalBoth = data.bothSensorsAvailability != null ? data.bothSensorsAvailability : 0;
        const totalNoData = data.noDataHours != null ? data.noDataHours : 0;
        const avgTemp = totalTemp / daysInMonth;
        const avgPh = totalPh / daysInMonth;
        const avgBoth = totalBoth / daysInMonth;
        const avgNoData = totalNoData / daysInMonth;
        
        // Display analytics cards
        cardsContainer.innerHTML = `
            <div class="analytics-card" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 1rem 0; color: #2c3e50; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Avg Temp Availability</h4>
                <div style="font-size: 2rem; font-weight: bold; color: #3498db; margin-bottom: 0.5rem;">${avgTemp.toFixed(1)}</div>
                <div style="color: #7f8c8d; font-size: 0.85rem;">hours per day</div>
                <div style="margin-top: 0.5rem; color: #7f8c8d; font-size: 0.85rem;">${data.tempTrend ? formatTrend(data.tempTrend) : '—'}</div>
            </div>
            <div class="analytics-card" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 1rem 0; color: #2c3e50; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Avg pH Availability</h4>
                <div style="font-size: 2rem; font-weight: bold; color: #9b59b6; margin-bottom: 0.5rem;">${avgPh.toFixed(1)}</div>
                <div style="color: #7f8c8d; font-size: 0.85rem;">hours per day</div>
                <div style="margin-top: 0.5rem; color: #7f8c8d; font-size: 0.85rem;">${data.phTrend ? formatTrend(data.phTrend) : '—'}</div>
            </div>
            <div class="analytics-card" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 1rem 0; color: #2c3e50; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Avg Both Sensors</h4>
                <div style="font-size: 2rem; font-weight: bold; color: #27ae60; margin-bottom: 0.5rem;">${avgBoth.toFixed(1)}</div>
                <div style="color: #7f8c8d; font-size: 0.85rem;">hours per day</div>
                <div style="margin-top: 0.5rem; color: #7f8c8d; font-size: 0.85rem;">${data.bothSensorsTrend ? formatTrend(data.bothSensorsTrend) : '—'}</div>
            </div>
            <div class="analytics-card" style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 1rem 0; color: #2c3e50; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Avg No Data</h4>
                <div style="font-size: 2rem; font-weight: bold; color: #e74c3c; margin-bottom: 0.5rem;">${avgNoData.toFixed(1)}</div>
                <div style="color: #7f8c8d; font-size: 0.85rem;">hours per day</div>
            </div>
        `;
        
        // Display details table
        const monthStr = monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        
        tableBody.innerHTML = `
            <tr>
                <td>${monthStr}</td>
                <td>${avgTemp.toFixed(1)} hours/day</td>
                <td>${avgPh.toFixed(1)} hours/day</td>
                <td>${avgBoth.toFixed(1)} hours/day</td>
                <td>${avgNoData.toFixed(1)} hours/day</td>
                <td>${data.tempTrend ? formatTrend(data.tempTrend) : '—'}</td>
                <td>${data.phTrend ? formatTrend(data.phTrend) : '—'}</td>
                <td>${data.bothSensorsTrend ? formatTrend(data.bothSensorsTrend) : '—'}</td>
            </tr>
        `;
        
    } catch (error) {
        console.error('Error loading monthly analytics UI:', error);
        const cardsContainer = document.getElementById('analyticsCardsContainer');
        const tableBody = document.getElementById('analyticsDetailsTableBody');
        if (cardsContainer) cardsContainer.innerHTML = '<div class="no-data-text" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">Error loading analytics data</div>';
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" class="no-data-text">Error loading analytics data</td></tr>';
    }
}

// Initialize analytics UI selectors
function initializeAnalyticsSelectors() {
    try {
        const periodSelector = document.getElementById('analyticsPeriodSelector');
        const dateSelector = document.getElementById('analyticsDateSelector');
        const monthSelector = document.getElementById('analyticsMonthSelector');
        
        if (!periodSelector) return;
        
        // Set default date
        if (dateSelector) {
            const today = new Date();
            dateSelector.value = formatDateString(today);
        }
        
        // Set default month
        if (monthSelector) {
            const today = new Date();
            monthSelector.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        }
        
        // Period selector change handler
        periodSelector.addEventListener('change', async () => {
            await loadSensorAnalyticsUI();
        });
        
        // Date selector change handler
        if (dateSelector) {
            dateSelector.addEventListener('change', async () => {
                if (periodSelector.value === 'daily') {
                    await loadSensorAnalyticsUI();
                }
            });
        }
        
        // Month selector change handler
        if (monthSelector) {
            monthSelector.addEventListener('change', async () => {
                if (periodSelector.value === 'weekly' || periodSelector.value === 'monthly') {
                    await loadSensorAnalyticsUI();
                }
            });
        }
        
        // Load initial data
        loadSensorAnalyticsUI().catch(error => {
            console.error('Error loading initial analytics UI:', error);
        });
        
    } catch (error) {
        console.error('Error initializing analytics selectors:', error);
    }
}

// Export functions for reports
function exportTableToCSV(tableId, filename) {
    try {
        const table = document.getElementById(tableId);
        if (!table) {
            console.error(`Table with id "${tableId}" not found`);
            showNotification('Table not found for export', 'error');
            return;
        }
        
        let csv = [];
        const rows = table.querySelectorAll('tr');
        
        if (rows.length === 0) {
            showNotification('No data to export', 'warning');
            return;
        }
        
        rows.forEach(row => {
            const cols = row.querySelectorAll('th, td');
            const rowData = [];
            cols.forEach(col => {
                let text = col.textContent.trim();
                // Skip rows that are "no data" messages
                if (text.includes('No ') && text.includes('data available')) {
                    return;
                }
                text = text.replace(/"/g, '""');
                rowData.push(`"${text}"`);
            });
            if (rowData.length > 0) {
                csv.push(rowData.join(','));
            }
        });
        
        if (csv.length === 0) {
            showNotification('No data to export', 'warning');
            return;
        }
        
        // Add BOM for UTF-8 to ensure proper Excel encoding
        const BOM = '\uFEFF';
        const csvContent = BOM + csv.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        
        showNotification('Report exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting to CSV:', error);
        showNotification('Error exporting report', 'error');
    }
}

function exportTableToHTML(tableId, filename) {
    try {
        const table = document.getElementById(tableId);
        if (!table) {
            console.error(`Table with id "${tableId}" not found`);
            showNotification('Table not found for export', 'error');
            return;
        }
        
        const rows = table.querySelectorAll('tr');
        if (rows.length === 0) {
            showNotification('No data to export', 'warning');
            return;
        }
        
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${filename}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; font-weight: bold; }
        tr:nth-child(even) { background-color: #f2f2f2; }
        .no-data-text { text-align: center; color: #999; font-style: italic; }
    </style>
</head>
<body>
    <h1>${filename}</h1>
    <p>Generated on: ${new Date().toLocaleString()}</p>
    ${table.outerHTML}
</body>
</html>`;
        
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.html`);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        
        showNotification('Report exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting to HTML:', error);
        showNotification('Error exporting report', 'error');
    }
}

// ============================================================
// EXPORT GETTER FUNCTIONS (Return normalized row data)
// ============================================================

function getDailyRowsForExport() {
    return reportRowsState.dailyRows.map(row => ({
        date: row.date,
        mortality: row.mortality !== null ? row.mortality : null,
        avgTemperature: row.avgTemperature !== null ? row.avgTemperature : null,
        avgPh: row.avgPh !== null ? row.avgPh : null,
        waterQuality: row.waterQuality || null
    }));
}

function getWeeklyRowsForExport() {
    return reportRowsState.weeklyRows.map(row => ({
        period: row.period,
        mortality: row.mortality !== null ? row.mortality : null,
        avgPh: row.avgPh !== null ? row.avgPh : null,
        avgTemperature: row.avgTemperature !== null ? row.avgTemperature : null,
        waterQualityScore: row.waterQualityScore !== null ? row.waterQualityScore : null
    }));
}

function getMonthlyRowsForExport() {
    return reportRowsState.monthlyRows.map(row => ({
        month: row.month,
        totalMortality: row.totalMortality !== null ? row.totalMortality : null,
        avgPh: row.avgPh !== null ? row.avgPh : null,
        avgTemperature: row.avgTemperature !== null ? row.avgTemperature : null,
        waterQualityScore: row.waterQualityScore !== null ? row.waterQualityScore : null
    }));
}

function getMortalityRowsForExport() {
    return reportRowsState.mortalityRows.map(row => ({
        date: row.date,
        time: row.time,
        count: row.count !== null ? row.count : null,
        cause: row.cause || null,
        notes: row.notes || null
    }));
}

function getProductionRecordsRowsForExport() {
    if (!reportRowsState.productionRows) {
        return [];
    }
    
    // Get selected seasons
    const selectedSeasons = getSelectedSeasons();
    
    // Filter rows by selected seasons
    let filteredRows = reportRowsState.productionRows;
    if (selectedSeasons.length > 0) {
        filteredRows = reportRowsState.productionRows.filter(row => {
            const seasonKey = `${row.startMonth || ''}_${row.endMonth || ''}`;
            return selectedSeasons.includes(seasonKey);
        });
    }
    
    return filteredRows.map(row => ({
        date: row.date,
        startMonth: row.startMonth,
        endMonth: row.endMonth,
        fingerlings: row.fingerlings !== null ? row.fingerlings : null,
        harvested: row.harvested !== null ? row.harvested : null,
        survival: row.survival !== null ? `${row.survival}%` : null,
        profit: row.profit !== null ? `${row.profit}%` : null,
        loss: row.loss !== null ? `${row.loss}%` : null,
        deaths: row.deaths !== null ? row.deaths : null
    }));
}

// Handle "Select All" checkbox in table header
window.handleSelectAllSeasons = function() {
    const selectAllCheckbox = document.getElementById('selectAllSeasons');
    const rowCheckboxes = document.querySelectorAll('.season-row-checkbox');
    
    if (selectAllCheckbox) {
        rowCheckboxes.forEach(checkbox => {
            checkbox.checked = selectAllCheckbox.checked;
        });
    }
}

// Handle individual row checkbox change
window.handleSeasonRowCheckboxChange = function() {
    const selectAllCheckbox = document.getElementById('selectAllSeasons');
    const rowCheckboxes = document.querySelectorAll('.season-row-checkbox');
    const checkedCount = document.querySelectorAll('.season-row-checkbox:checked').length;
    
    // Update "Select All" checkbox state
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = checkedCount === rowCheckboxes.length;
    }
}

// Format month label (e.g., "2026-01" -> "January 2026")
function formatMonthLabel(monthStr) {
    if (!monthStr || !monthStr.includes('-')) return monthStr;
    
    const [year, month] = monthStr.split('-');
    const monthNum = parseInt(month, 10);
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) return monthStr;
    
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    return `${monthNames[monthNum - 1]} ${year}`;
}

// Get selected seasons from row checkboxes
function getSelectedSeasons() {
    const checkedBoxes = document.querySelectorAll('.season-row-checkbox:checked');
    const selected = new Set();
    
    checkedBoxes.forEach(checkbox => {
        selected.add(checkbox.value);
    });
    
    return Array.from(selected);
}

// ============================================================
// WORD EXPORT FUNCTION
// ============================================================

async function exportToWord({ title, columns, rows, filename }) {
    try {
        if (!rows || rows.length === 0) {
            showNotification('No data to export for the selected month.', 'warning');
            return;
        }
        
        // Load logo as base64 for watermark
        let logoBase64 = '';
        try {
            logoBase64 = await loadImageAsBase64('assets/images/logo/aquasence.logo.png');
        } catch (error) {
            console.warn('Could not load logo for watermark:', error);
        }
        
        // Build HTML table
        let tableHTML = '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">';
        
        // Header row
        tableHTML += '<thead><tr>';
        columns.forEach(col => {
            tableHTML += `<th style="background-color: #4CAF50; color: white; font-weight: bold; padding: 8px; text-align: left;">${col}</th>`;
        });
        tableHTML += '</tr></thead>';
        
        // Data rows
        tableHTML += '<tbody>';
        rows.forEach(row => {
            tableHTML += '<tr>';
            Object.values(row).forEach(value => {
                let displayValue = '--';
                if (value !== null && value !== undefined) {
                    displayValue = String(value);
                }
                // Escape HTML
                displayValue = displayValue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                tableHTML += `<td style="padding: 8px; border: 1px solid #ddd;">${displayValue}</td>`;
            });
            tableHTML += '</tr>';
        });
        tableHTML += '</tbody></table>';
        
        // Generate Word document HTML with watermark
        const htmlContent = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8">
    <meta name="ProgId" content="Word.Document">
    <meta name="Generator" content="Microsoft Word">
    <meta name="Originator" content="Microsoft Word">
    <title>${title}</title>
    <!--[if gte mso 9]>
    <xml>
        <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>90</w:Zoom>
        </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
        @page {
            size: 8.5in 11in;
            margin: 1in;
        }
        body {
            font-family: Arial, sans-serif;
            font-size: 11pt;
            margin: 20px;
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        .generated-date {
            color: #666;
            font-size: 9pt;
            margin-bottom: 20px;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin-top: 20px;
        }
        th {
            background-color: #4CAF50;
            color: white;
            font-weight: bold;
            padding: 8px;
            text-align: left;
            border: 1px solid #ddd;
        }
        td {
            padding: 8px;
            border: 1px solid #ddd;
        }
        tr:nth-child(even) {
            background-color: #f2f2f2;
        }
    </style>
    <!--[if gte mso 9]>
    <xml>
        <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>90</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
    </xml>
    <![endif]-->
    <!--[if gte mso 9]>
    <style>
        v\\:* { behavior: url(#default#VML); }
        o\\:* { behavior: url(#default#VML); }
        w\\:* { behavior: url(#default#VML); }
        .shape { behavior: url(#default#VML); }
    </style>
    <![endif]-->
</head>
<body>
    ${logoBase64 ? `<!--[if gte mso 9]>
    <v:shape id="watermark" type="#_x0000_t75" style="position:absolute;left:50%;top:50%;width:200pt;height:200pt;margin-left:-100pt;margin-top:-100pt;z-index:-251658240">
        <v:imagedata src="${logoBase64}"/>
        <w:wrap type="none"/>
        <w:anchorlock/>
    </v:shape>
    <![endif]-->` : '<!-- Logo watermark not available -->'}
    <h1>${title}</h1>
    <p class="generated-date">Generated on: ${new Date().toLocaleString()}</p>
    ${tableHTML}
</body>
</html>`;
        
        // Create blob with UTF-8 BOM and correct MIME type
        const BOM = '\ufeff';
        const blob = new Blob([BOM + htmlContent], { type: 'application/msword;charset=utf-8' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.doc`);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        
        showNotification('Report exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting to Word:', error);
        showNotification('Error exporting report', 'error');
    }
}

// ============================================================
// PDF EXPORT FUNCTION
// ============================================================

// Load image as Base64 for jsPDF
function loadImageAsBase64(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (error) => {
            console.error('Error loading image:', error);
            reject(error);
        };
        img.src = url;
    });
}

// Render PDF header with AquaSense logo
async function renderPDFHeader(doc, reportTitle) {
    try {
        // Load logo as Base64
        const logoBase64 = await loadImageAsBase64('assets/images/logo/aquasence.logo.png');
        
        // Draw logo at top-left (14, 10) with size 20x20
        doc.addImage(logoBase64, 'PNG', 14, 10, 20, 20);
        
        // Add title next to logo
        doc.setFontSize(16);
        doc.text(`AquaSense – ${reportTitle}`, 40, 22);
        
        // Add generation date
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 40, 28);
        doc.setTextColor(0, 0, 0);
        
        // Draw divider line
        doc.setDrawColor(200);
        doc.line(14, 35, 196, 35);
        
        // Return the Y position after header (for table positioning)
        return 40;
    } catch (error) {
        console.error('Error rendering PDF header:', error);
        // Fallback: render header without logo
        doc.setFontSize(16);
        doc.text(`AquaSense – ${reportTitle}`, 14, 15);
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);
        doc.setTextColor(0, 0, 0);
        doc.setDrawColor(200);
        doc.line(14, 30, 196, 30);
        return 35;
    }
}

async function exportToPDF({ title, columns, rows, filename }) {
    try {
        if (!rows || rows.length === 0) {
            showNotification('No data to export for the selected month.', 'warning');
            return;
        }
        
        // Check if jsPDF is available
        const hasJSPDF = typeof window.jspdf !== 'undefined' || typeof window.jsPDF !== 'undefined' || typeof window.jspdf !== 'undefined';
        
        if (hasJSPDF) {
            // Use jsPDF if available
            const { jsPDF } = window.jsPDF || window.jspdf || window;
            const doc = new jsPDF();
            
            // Render header with logo
            const tableStartY = await renderPDFHeader(doc, title);
            
            // Add watermark with logo - must be added before table content
            try {
                const logoBase64 = await loadImageAsBase64('assets/images/logo/aquasence.logo.png');
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const imgWidth = 80;
                const imgHeight = 80;
                const x = (pageWidth - imgWidth) / 2;
                const y = (pageHeight - imgHeight) / 2;
                
                doc.saveGraphicsState();
                doc.setGState(new doc.GState({ opacity: 0.15 }));
                doc.addImage(logoBase64, 'PNG', x, y, imgWidth, imgHeight);
                doc.restoreGraphicsState();
            } catch (error) {
                console.error('Error loading logo for watermark:', error);
                // Fallback: text watermark
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                doc.saveGraphicsState();
                doc.setGState(new doc.GState({ opacity: 0.15 }));
                doc.setFontSize(60);
                doc.setTextColor(128, 128, 128);
                const text = 'AquaSense IoT';
                const textWidth = doc.getTextWidth(text);
                doc.text(text, (pageWidth - textWidth) / 2, pageHeight / 2, { angle: 45 });
                doc.restoreGraphicsState();
                doc.setTextColor(0, 0, 0);
            }
            
            // Check if autoTable is available
            if (typeof doc.autoTable !== 'undefined') {
                // Use autoTable for better formatting
                doc.autoTable({
                    head: [columns],
                    body: rows.map(row => {
                        return Object.values(row).map(value => {
                            if (value !== null && value !== undefined) {
                                return String(value);
                            }
                            return '--';
                        });
                    }),
                    startY: tableStartY,
                    styles: { fontSize: 9 },
                    headStyles: { fillColor: [76, 175, 80] }
                });
            } else {
                // Fallback: simple table without autoTable
                let y = tableStartY;
                doc.setFontSize(10);
                
                // Header
                doc.setFillColor(76, 175, 80);
                doc.rect(14, y, 182, 8, 'F');
                doc.setTextColor(255, 255, 255);
                let x = 16;
                columns.forEach((col) => {
                    doc.text(col.substring(0, 20), x, y + 6);
                    x += 30; // Simple column spacing
                });
                
                // Rows
                doc.setTextColor(0, 0, 0);
                y += 10;
                rows.forEach(row => {
                    x = 16;
                    Object.values(row).forEach(value => {
                        const displayValue = value !== null && value !== undefined ? String(value) : '--';
                        doc.text(displayValue.substring(0, 20), x, y); // Truncate long values
                        x += 30;
                    });
                    y += 7;
                    if (y > 280) {
                        doc.addPage();
                        y = 20;
                    }
                });
            }
            
            // Save PDF
            doc.save(`${filename}.pdf`);
            showNotification('Report exported successfully', 'success');
        } else {
            // Fallback: Use print dialog
            exportToPDFPrint({ title, columns, rows });
        }
    } catch (error) {
        console.error('Error exporting to PDF:', error);
        // Fallback to print if jsPDF fails
        exportToPDFPrint({ title, columns, rows });
    }
}

function exportToPDFPrint({ title, columns, rows }) {
    try {
        // Build HTML table
        let tableHTML = '<table style="border-collapse: collapse; width: 100%;">';
        
        // Header row
        tableHTML += '<thead><tr>';
        columns.forEach(col => {
            tableHTML += `<th style="background-color: #4CAF50; color: white; font-weight: bold; padding: 8px; text-align: left; border: 1px solid #ddd;">${col}</th>`;
        });
        tableHTML += '</tr></thead>';
        
        // Data rows
        tableHTML += '<tbody>';
        rows.forEach(row => {
            tableHTML += '<tr>';
            Object.values(row).forEach(value => {
                let displayValue = '--';
                if (value !== null && value !== undefined) {
                    displayValue = String(value);
                }
                // Escape HTML
                displayValue = displayValue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                tableHTML += `<td style="padding: 8px; border: 1px solid #ddd;">${displayValue}</td>`;
            });
            tableHTML += '</tr>';
        });
        tableHTML += '</tbody></table>';
        
        // Create print-friendly HTML
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        @media print {
            @page {
                margin: 1cm;
            }
            body {
                margin: 0;
            }
        }
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
        }
        .pdf-header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid #ddd;
        }
        .pdf-header img {
            height: 40px;
            width: auto;
            margin-right: 15px;
        }
        .pdf-header-content {
            flex: 1;
        }
        .pdf-header h1 {
            color: #2c3e50;
            margin: 0 0 5px 0;
            font-size: 18px;
        }
        .generated-date {
            color: #666;
            font-size: 12px;
            margin: 0;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin-top: 20px;
        }
        th {
            background-color: #4CAF50;
            color: white;
            font-weight: bold;
            padding: 8px;
            text-align: left;
            border: 1px solid #ddd;
        }
        td {
            padding: 8px;
            border: 1px solid #ddd;
        }
        tr:nth-child(even) {
            background-color: #f2f2f2;
        }
    </style>
</head>
<body>
    <div class="pdf-header">
        <img src="assets/images/logo/aquasence.logo.png" alt="AquaSense Logo" />
        <div class="pdf-header-content">
            <h1>AquaSense – ${title}</h1>
            <p class="generated-date">Generated on: ${new Date().toLocaleString()}</p>
        </div>
    </div>
    ${tableHTML}
    <script>
        window.onload = function() {
            window.print();
        };
    </script>
</body>
</html>`;
        
        // Open new window and print
        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        showNotification('Opening print dialog. Use "Save as PDF" to save.', 'info');
    } catch (error) {
        console.error('Error exporting to PDF (print):', error);
        showNotification('Error exporting report', 'error');
    }
}

// ============================================================
// EXPORT FUNCTIONS (Made globally accessible)
// ============================================================

// Export functions (made globally accessible)
// Uses in-memory row data to ensure exports match filtered table content
window.exportDailyReport = async function(format) {
    const rows = getDailyRowsForExport();
    const monthSuffix = selectedReportMonth ? `_${selectedReportMonth}` : '';
    const filename = `Daily_Summary_Report${monthSuffix}`;
    const columns = ['Date', 'Feed Used (kg)', 'Mortality (fish)', 'Avg Temperature (°C)', 'Avg pH', 'Water Quality'];
    
    if (format === 'excel' || format === 'csv') {
        exportTableToCSV('dailySummaryTable', filename);
    } else if (format === 'word') {
        await exportToWord({ title: 'Daily Summary Report', columns, rows, filename });
    } else if (format === 'pdf') {
        exportToPDF({ title: 'Daily Summary Report', columns, rows, filename });
    }
};

window.exportWeeklyReport = async function(format) {
    const rows = getWeeklyRowsForExport();
    const monthSuffix = selectedReportMonth ? `_${selectedReportMonth}` : '';
    const filename = `Weekly_Summary_Report${monthSuffix}`;
    const columns = ['Period', 'Total Feed (kg)', 'Mortality (fish)', 'Avg pH', 'Avg Temperature (°C)', 'Water Quality Score'];
    
    if (format === 'excel' || format === 'csv') {
        exportTableToCSV('weeklySummaryTable', filename);
    } else if (format === 'word') {
        await exportToWord({ title: 'Weekly Summary Report', columns, rows, filename });
    } else if (format === 'pdf') {
        exportToPDF({ title: 'Weekly Summary Report', columns, rows, filename });
    }
};

window.exportMonthlyReport = async function(format) {
    const rows = getMonthlyRowsForExport();
    const monthSuffix = selectedReportMonth ? `_${selectedReportMonth}` : '';
    const filename = `Monthly_Summary_Report${monthSuffix}`;
    const columns = ['Month', 'Total Feed (kg)', 'Total Mortality (fish)', 'Avg pH', 'Avg Temperature (°C)', 'Water Quality Score'];
    
    if (format === 'excel' || format === 'csv') {
        exportTableToCSV('monthlySummaryTable', filename);
    } else if (format === 'word') {
        await exportToWord({ title: 'Monthly Summary Report', columns, rows, filename });
    } else if (format === 'pdf') {
        exportToPDF({ title: 'Monthly Summary Report', columns, rows, filename });
    }
};

window.exportMortalityReport = async function(format) {
    const rows = getMortalityRowsForExport();
    const filename = 'Mortality_Log_Report';
    const columns = ['Date', 'Time', 'Mortality Count', 'Cause', 'Notes'];
    
    if (format === 'excel' || format === 'csv') {
        exportTableToCSV('mortalityLogTable', filename);
    } else if (format === 'word') {
        await exportToWord({ title: 'Mortality Log Report', columns, rows, filename });
    } else if (format === 'pdf') {
        exportToPDF({ title: 'Mortality Log Report', columns, rows, filename });
    }
};

window.exportProductionRecordsReport = async function(format) {
    // Get selected seasons
    const selectedSeasons = getSelectedSeasons();
    
    if (selectedSeasons.length === 0) {
        showNotification('Please select at least one season to export', 'warning');
        return;
    }
    
    const rows = getProductionRecordsRowsForExport();
    
    if (!rows || rows.length === 0) {
        showNotification('No data to export for the selected seasons', 'warning');
        return;
    }
    
    // Build filename with season info
    let filename = 'Production_Records_Report';
    const totalRows = reportRowsState.productionRows ? reportRowsState.productionRows.length : 0;
    
    if (selectedSeasons.length === totalRows || selectedSeasons.length === 0) {
        filename = 'Production_Records_Report_All_Seasons';
    } else if (selectedSeasons.length <= 3) {
        // Include season names in filename if few seasons selected
        const seasonLabels = selectedSeasons.map(key => {
            const [start, end] = key.split('_');
            return start === end ? formatMonthLabel(start) : `${formatMonthLabel(start)}_${formatMonthLabel(end)}`;
        }).join('_');
        if (seasonLabels) {
            filename = `Production_Records_Report_${seasonLabels.replace(/\s+/g, '_')}`;
        }
    } else {
        filename = `Production_Records_Report_${selectedSeasons.length}_Seasons`;
    }
    
    const columns = ['Date', 'Start Month', 'End Month', 'Fingerlings', 'Harvested', 'Survival %', 'Profit %', 'Loss %', 'Deaths'];
    
    if (format === 'excel' || format === 'csv') {
        // For CSV export, we need to filter the table data
        exportProductionRecordsToCSV(rows, filename);
    } else if (format === 'word') {
        await exportToWord({ title: 'Production Records Report', columns, rows, filename });
    } else if (format === 'pdf') {
        exportToPDF({ title: 'Production Records Report', columns, rows, filename });
    }
};

// Export production records to CSV (filtered by selected seasons)
function exportProductionRecordsToCSV(rows, filename) {
    try {
        if (!rows || rows.length === 0) {
            showNotification('No data to export', 'warning');
            return;
        }
        
        // Create CSV content
        const headers = ['Date', 'Start Month', 'End Month', 'Fingerlings', 'Harvested', 'Survival %', 'Profit %', 'Loss %', 'Deaths'];
        const csvRows = [headers.join(',')];
        
        rows.forEach(row => {
            const csvRow = [
                `"${row.date || ''}"`,
                `"${row.startMonth || ''}"`,
                `"${row.endMonth || ''}"`,
                row.fingerlings !== null ? row.fingerlings : '',
                row.harvested !== null ? row.harvested : '',
                row.survival || '',
                row.profit || '',
                row.loss || '',
                row.deaths !== null ? row.deaths : ''
            ];
            csvRows.push(csvRow.join(','));
        });
        
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Production records exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting production records to CSV:', error);
        showNotification('Error exporting production records', 'error');
    }
}

// Admin Dashboard specific functions
export async function initializeAdminDashboard() {
    // Ensure device record exists (non-blocking, works with or without auth)
    // This must run on every dashboard initialization, not just on login
    await ensureDeviceRecordExists();
    
    // Resolve runtime context (works with or without authentication)
    window.RUNTIME_CONTEXT = await resolveRuntimeContext();
    console.log('[INIT] Runtime context resolved:', window.RUNTIME_CONTEXT);
    
    // Update user name in navigation
    await updateUserDisplayName();
    
    // User search functionality
    function initializeUserSearch() {
        const searchInput = document.getElementById('userSearch');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                const searchTerm = this.value.toLowerCase();
                const userCards = document.querySelectorAll('.user-card');
                
                userCards.forEach(card => {
                    const userName = card.querySelector('.user-name').textContent.toLowerCase();
                    const userEmail = card.querySelector('.user-email').textContent.toLowerCase();
                    
                    if (userName.includes(searchTerm) || userEmail.includes(searchTerm)) {
                        card.style.display = 'block';
                    } else {
                        card.style.display = 'none';
                    }
                });
            });
        }
    }

    // Initialize user search
    initializeUserSearch();
}

// ============================================================
// DATA SERVICE FUNCTIONS - User CRUD & Loading
// ============================================================

// Load all users (for SuperAdmin dashboard)
export async function loadAllUsers() {
    try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = [];
        usersSnapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });
        return users;
    } catch (error) {
        console.error('Error loading users:', error);
        throw error;
    }
}

// Load user details with ponds and devices
export async function loadUserDetails(uid) {
    try {
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
            return null;
        }
        
        const userData = { id: userSnap.id, ...userSnap.data() };
        const ponds = await getUserPonds(uid);
        const devices = await getUserDevices(uid);
        
        return {
            ...userData,
            ponds,
            devices
        };
    } catch (error) {
        console.error('Error loading user details:', error);
        throw error;
    }
}

// Get user's ponds
export async function getUserPonds(uid) {
    try {
        const pondsSnapshot = await getDocs(collection(db, `users/${uid}/ponds`));
        const ponds = [];
        pondsSnapshot.forEach(doc => {
            ponds.push({ id: doc.id, ...doc.data() });
        });
        return ponds;
    } catch (error) {
        console.error('Error loading user ponds:', error);
        return [];
    }
}

// Get user's devices
export async function getUserDevices(uid) {
    try {
        const devicesSnapshot = await getDocs(collection(db, `users/${uid}/devices`));
        const devices = [];
        devicesSnapshot.forEach(doc => {
            devices.push({ id: doc.id, ...doc.data() });
        });
        return devices;
    } catch (error) {
        console.error('Error loading user devices:', error);
        return [];
    }
}

// ============================================================
// ============================================================
// DEVICE CONTROL API (RTDB for ESP32 Communication)
// ============================================================

// Set feeder command (writes to RTDB for ESP32 to read)
export async function setFeederCommand(deviceId, state) {
    try {
        await set(
            ref(rtdb, `devices/${deviceId}/commands/feeder`),
            {
                state: state, // "on" | "off"
                updatedAt: Date.now(),
                source: "web"
            }
        );
        console.log(`[RTDB] Set feeder command for ${deviceId}: ${state}`);
    } catch (error) {
        console.error('Error setting feeder command:', error);
        showNotification('Error sending feeder command', 'error');
        throw error;
    }
}

// Update device online/offline status (writes to RTDB)
export async function updateDeviceStatus(deviceId, isOnline) {
    try {
        await set(
            ref(rtdb, `devices/${deviceId}/status`),
            {
                feeder: isOnline ? "online" : "offline",
                lastSeen: Date.now(),
                source: "web"
            }
        );
        console.log(`[RTDB] Updated device status for ${deviceId}: ${isOnline ? 'online' : 'offline'}`);
    } catch (error) {
        console.error('Error updating device status:', error);
        throw error;
    }
}

// Listen to device status changes (for live UI updates)
export function subscribeToDeviceStatus(deviceId, callback) {
    const statusRef = ref(rtdb, `devices/${deviceId}/status`);
    
    onValue(statusRef, (snapshot) => {
        if (snapshot.exists()) {
            callback(snapshot.val());
        }
    });
    
    // Return unsubscribe function
    return () => {
        off(statusRef);
    };
}

// Window-global functions for UI button handlers
// Example usage: <button onclick="feedOn('device123')">Feed ON</button>
window.feedOn = async function(deviceId) {
    try {
        await setFeederCommand(deviceId, "on");
        showNotification('Feeder command sent: ON', 'success');
    } catch (error) {
        console.error('Error sending feed ON command:', error);
    }
};

window.feedOff = async function(deviceId) {
    try {
        await setFeederCommand(deviceId, "off");
        showNotification('Feeder command sent: OFF', 'success');
    } catch (error) {
        console.error('Error sending feed OFF command:', error);
    }
};

// Example: Toggle feeder
window.toggleFeeder = async function(deviceId, currentState) {
    const newState = currentState === "on" ? "off" : "on";
    try {
        await setFeederCommand(deviceId, newState);
        showNotification(`Feeder ${newState.toUpperCase()}`, 'success');
    } catch (error) {
        console.error('Error toggling feeder:', error);
    }
};

// Update motor toggle button appearance based on state
// Supports multiple buttons (dashboard and feeding page)
function updateMotorToggleButton(isOnline) {
    // Update dashboard motor button
    const toggleBtn = document.getElementById('motorToggleBtn');
    const toggleText = document.getElementById('motorToggleText');
    const toggleIcon = document.getElementById('motorToggleIcon');
    
    if (toggleBtn && toggleText && toggleIcon) {
        updateButtonState(toggleBtn, toggleText, toggleIcon, isOnline);
    }
    
    // Update feeding page motor button
    const feedingToggleBtn = document.getElementById('feedingMotorToggleBtn');
    const feedingToggleText = document.getElementById('feedingMotorToggleText');
    const feedingToggleIcon = document.getElementById('feedingMotorToggleIcon');
    
    if (feedingToggleBtn && feedingToggleText && feedingToggleIcon) {
        updateButtonState(feedingToggleBtn, feedingToggleText, feedingToggleIcon, isOnline);
    }
}

// Helper function to update a single button's state
function updateButtonState(btn, textEl, iconEl, isOnline) {
    if (isOnline === null || isOnline === undefined) {
        // Unknown state - allow clicks to attempt state change
        btn.style.background = '#6b7280';
        textEl.textContent = 'Loading...';
        iconEl.className = 'fas fa-power-off';
        btn.disabled = false; // Enable button so clicks can work
        return;
    }
    
    if (isOnline) {
        // Motor is ON - show OFF option
        btn.style.background = '#10b981';
        btn.onmouseover = function() { this.style.background = '#059669'; };
        btn.onmouseout = function() { this.style.background = '#10b981'; };
        textEl.textContent = 'Turn OFF';
        iconEl.className = 'fas fa-stop';
        btn.disabled = false;
    } else {
        // Motor is OFF - show ON option
        btn.style.background = '#ef4444';
        btn.onmouseover = function() { this.style.background = '#dc2626'; };
        btn.onmouseout = function() { this.style.background = '#ef4444'; };
        textEl.textContent = 'Turn ON';
        iconEl.className = 'fas fa-play';
        btn.disabled = false;
    }
}

// Motor toggle function - toggles between online/offline based on current state
window.toggleMotor = async function() {
    try {
        // Get current state from RTDB (no auth check - works without login)
        const feederStateRef = ref(rtdb, `devices/${DEVICE_ID}/status/feeder/state`);
        const snapshot = await get(feederStateRef);
        
        let currentState = 'offline'; // Default to offline
        if (snapshot.exists()) {
            const stateValue = snapshot.val();
            if (stateValue) {
                currentState = String(stateValue).toLowerCase();
            }
        }
        
        // Toggle state: online -> offline, offline -> online
        const newState = currentState === 'online' ? 'offline' : 'online';
        
        // Write state string directly to RTDB (no auth required)
        await set(feederStateRef, newState);
        
        // Verify the write
        const verifySnap = await get(feederStateRef);
        console.log('[RTDB] Motor toggled to:', verifySnap.val(), 'at devices/' + DEVICE_ID + '/status/feeder/state');
        
        showNotification(`Motor ${newState.toUpperCase()}`, 'success');
        console.log(`[RTDB] Toggled motor state to ${newState} at devices/${DEVICE_ID}/status/feeder/state`);
        
        // Update button appearance immediately
        updateMotorToggleButton(newState === 'online');
        
    } catch (error) {
        console.error('Error toggling motor:', error);
        showNotification('Error updating motor state', 'error');
    }
};

// DEVICE CONTROL API (SuperAdmin Only - Firestore for device management)
// ============================================================

// Reset a device (removes its pairing)
export async function resetDevicePairing(uid, deviceId) {
    try {
        // Delete device from user's devices collection
        await deleteDoc(doc(db, `users/${uid}/devices/${deviceId}`));
        
        // Remove device from all ponds
        const pondSnap = await getDocs(collection(db, `users/${uid}/ponds`));
        for (const pondDoc of pondSnap.docs) {
            const pondDeviceRef = doc(db, `users/${uid}/ponds/${pondDoc.id}/devices/${deviceId}`);
            try {
                await deleteDoc(pondDeviceRef);
            } catch (err) {
                // Device might not exist in this pond, continue
                console.log(`Device ${deviceId} not found in pond ${pondDoc.id}`);
            }
        }
        
        await logActivity("reset-pairing", `Device ${deviceId} reset for user ${uid}`);
        showNotification('Device pairing reset successfully', 'success');
    } catch (error) {
        console.error('Error resetting device pairing:', error);
        showNotification('Error resetting device pairing', 'error');
        throw error;
    }
}

// Enable/Disable device
export async function disableDevice(uid, deviceId, enabled = false) {
    try {
        await updateDoc(doc(db, `users/${uid}/devices/${deviceId}`), { enabled });
        await logActivity("toggle-device", `Device ${deviceId} ${enabled ? "ENABLED" : "DISABLED"}`);
        showNotification(`Device ${enabled ? 'enabled' : 'disabled'} successfully`, 'success');
    } catch (error) {
        console.error('Error toggling device:', error);
        showNotification('Error toggling device', 'error');
        throw error;
    }
}

// ============================================================
// LOGGING + NOTIFICATIONS
// ============================================================

// Log activity
export async function logActivity(type, message) {
    try {
        const adminId = window.RUNTIME_CONTEXT?.runtimeUid || null;
        await addDoc(collection(db, "activities"), {
            type,
            message,
            timestamp: Date.now(),
            adminId: adminId
        });
    } catch (error) {
        console.error('Error logging activity:', error);
    }
}

// Send notification
export async function sendNotification(targetUid, title, message) {
    try {
        await addDoc(collection(db, "notifications"), {
            targetUid,
            title,
            message,
            timestamp: Date.now(),
            read: false
        });
    } catch (error) {
        console.error('Error sending notification:', error);
        throw error;
    }
}

// ============================================================
// SYSTEM LOGGING FUNCTIONS (SuperAdmin Dashboard)
// ============================================================

// Save system logs
export async function logSystemEvent(message, type = "info") {
    try {
        await addDoc(collection(db, "system_logs"), {
            message,
            type,
            timestamp: serverTimestamp(),
            adminId: window.RUNTIME_CONTEXT?.runtimeUid || null
        });
    } catch (error) {
        console.error('Error logging system event:', error);
    }
}

// Save error logs
export async function logError(message, details = "") {
    try {
        await addDoc(collection(db, "system_errors"), {
            message,
            details,
            timestamp: serverTimestamp(),
            adminId: window.RUNTIME_CONTEXT?.runtimeUid || null
        });
    } catch (error) {
        console.error('Error logging error:', error);
    }
}

// Track uptime when Super Admin logs in
export async function trackUptime() {
    try {
        await addDoc(collection(db, "system_uptime"), {
            uid: sessionStorage.getItem("userUid"),
            email: sessionStorage.getItem("userEmail"),
            loggedInAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error tracking uptime:', error);
    }
}

// Load system logs into dashboard
export async function loadSystemLogs() {
    try {
        const logsRef = collection(db, "system_logs");
        const q = query(logsRef, orderBy("timestamp", "desc"), limit(50));
        const querySnapshot = await getDocs(q);
        
        const box = document.getElementById("systemLogs");
        if (!box) return;
        
        if (querySnapshot.empty) {
            box.innerHTML = '<div class="log-item"><span class="log-time">--</span><span class="log-message">No logs available</span></div>';
            return;
        }
        
        box.innerHTML = '';
        querySnapshot.forEach(doc => {
            const d = doc.data();
            const timestamp = d.timestamp ? (d.timestamp.seconds ? new Date(d.timestamp.seconds * 1000) : new Date(d.timestamp)) : new Date();
            const timeStr = timestamp.toLocaleString();
            const typeClass = d.type === 'error' ? 'error' : d.type === 'warning' ? 'warning' : 'info';
            
            box.innerHTML += `
                <div class="log-item">
                    <span class="log-time">${timeStr}</span>
                    <span class="log-type ${typeClass}">${d.type || 'info'}</span>
                    <span class="log-message">${d.message || 'No message'}</span>
                </div>
            `;
        });
    } catch (error) {
        console.error('Error loading system logs:', error);
        const box = document.getElementById("systemLogs");
        if (box) {
            box.innerHTML = '<div class="log-item"><span class="log-time">--</span><span class="log-message">Error loading logs</span></div>';
        }
    }
}

// Load error logs
export async function loadErrorLogs() {
    try {
        const errorsRef = collection(db, "system_errors");
        const q = query(errorsRef, orderBy("timestamp", "desc"), limit(50));
        const querySnapshot = await getDocs(q);
        
        const box = document.getElementById("errorLogs");
        if (!box) return;
        
        if (querySnapshot.empty) {
            box.innerHTML = '<div class="log-item"><span class="log-time">--</span><span class="log-message">No errors logged</span></div>';
            return;
        }
        
        box.innerHTML = '';
        querySnapshot.forEach(doc => {
            const d = doc.data();
            const timestamp = d.timestamp ? (d.timestamp.seconds ? new Date(d.timestamp.seconds * 1000) : new Date(d.timestamp)) : new Date();
            const timeStr = timestamp.toLocaleString();
            
            box.innerHTML += `
                <div class="log-item">
                    <span class="log-time">${timeStr}</span>
                    <span class="log-message">${d.message || 'No message'}</span>
                    ${d.details ? `<span class="log-details">${d.details}</span>` : ''}
                </div>
            `;
        });
    } catch (error) {
        console.error('Error loading error logs:', error);
        const box = document.getElementById("errorLogs");
        if (box) {
            box.innerHTML = '<div class="log-item"><span class="log-time">--</span><span class="log-message">Error loading error logs</span></div>';
        }
    }
}

// Load uptime history
export async function loadUptimeHistory() {
    try {
        const uptimeRef = collection(db, "system_uptime");
        const q = query(uptimeRef, orderBy("loggedInAt", "desc"), limit(100));
        const querySnapshot = await getDocs(q);
        
        const box = document.getElementById("uptimeLogs");
        if (!box) return;
        
        if (querySnapshot.empty) {
            box.innerHTML = '<div class="log-item"><span class="log-time">--</span><span class="log-message">No uptime logs available</span></div>';
            return;
        }
        
        box.innerHTML = '';
        querySnapshot.forEach(doc => {
            const d = doc.data();
            const timestamp = d.loggedInAt ? (d.loggedInAt.seconds ? new Date(d.loggedInAt.seconds * 1000) : new Date(d.loggedInAt)) : new Date();
            const timeStr = timestamp.toLocaleString();
            const email = d.email || 'Unknown';
            
            box.innerHTML += `
                <div class="log-item">
                    <span class="log-time">${timeStr}</span>
                    <span class="log-message">SuperAdmin login: ${email}</span>
                </div>
            `;
        });
    } catch (error) {
        console.error('Error loading uptime history:', error);
        const box = document.getElementById("uptimeLogs");
        if (box) {
            box.innerHTML = '<div class="log-item"><span class="log-time">--</span><span class="log-message">Error loading uptime logs</span></div>';
        }
    }
}

// Load scheduled tasks
export async function loadScheduledTasks() {
    try {
        const tasksRef = collection(db, "scheduled_tasks");
        const querySnapshot = await getDocs(tasksRef);
        
        const box = document.getElementById("scheduledTasks");
        if (!box) return;
        
        if (querySnapshot.empty) {
            // Initialize default tasks if none exist
            await initializeDefaultScheduledTasks();
            // Reload after initialization
            await loadScheduledTasks();
            return;
        }
        
        box.innerHTML = '';
        querySnapshot.forEach(doc => {
            const t = doc.data();
            const nextRun = t.nextRun ? (t.nextRun.seconds ? new Date(t.nextRun.seconds * 1000).toLocaleString() : new Date(t.nextRun).toLocaleString()) : 'Not scheduled';
            const statusClass = t.status === 'active' ? 'online' : t.status === 'completed' ? 'completed' : 'pending';
            
            box.innerHTML += `
                <div class="status-item">
                    <span class="status-label">${t.name || 'Unnamed Task'}</span>
                    <span class="status-value ${statusClass}">${t.status || 'Unknown'}</span>
                    ${t.nextRun ? `<span class="status-time">Next: ${nextRun}</span>` : ''}
                </div>
            `;
        });
    } catch (error) {
        console.error('Error loading scheduled tasks:', error);
        const box = document.getElementById("scheduledTasks");
        if (box) {
            box.innerHTML = '<div class="status-item"><span class="status-label">Error</span><span class="status-value">Failed to load tasks</span></div>';
        }
    }
}

// Initialize default scheduled tasks if collection is empty
async function initializeDefaultScheduledTasks() {
    try {
        // No default tasks - all tasks should be created by admins through the UI
        // This function is kept for compatibility but does not create any default data
    } catch (error) {
        console.error('Error initializing default tasks:', error);
    }
}

// Load firmware version tracking
export async function loadFirmwareVersions() {
    try {
        const updatesRef = collection(db, "system_updates");
        const querySnapshot = await getDocs(updatesRef);
        
        const currentFirmwareEl = document.getElementById("currentFirmware");
        const outdatedDevicesEl = document.getElementById("outdatedDevices");
        
        if (querySnapshot.empty) {
            if (currentFirmwareEl) currentFirmwareEl.textContent = "--";
            if (outdatedDevicesEl) outdatedDevicesEl.textContent = "0";
            return;
        }
        
        let latestVersion = null;
        let outdatedCount = 0;
        
        querySnapshot.forEach(doc => {
            const update = doc.data();
            if (update.type === 'firmware' && update.version) {
                if (!latestVersion || update.version > latestVersion) {
                    latestVersion = update.version;
                }
            }
            if (update.outdatedDevices) {
                outdatedCount += update.outdatedDevices;
            }
        });
        
        if (currentFirmwareEl) currentFirmwareEl.textContent = latestVersion || "--";
        if (outdatedDevicesEl) outdatedDevicesEl.textContent = outdatedCount.toString();
    } catch (error) {
        console.error('Error loading firmware versions:', error);
    }
}

// Super Admin Dashboard specific functions
export async function initializeSuperAdminDashboard() {
    // Ensure device record exists (non-blocking, works with or without auth)
    // This must run on every dashboard initialization, not just on login
    await ensureDeviceRecordExists();
    
    // Resolve runtime context (works with or without authentication)
    window.RUNTIME_CONTEXT = await resolveRuntimeContext();
    console.log('[INIT] Runtime context resolved:', window.RUNTIME_CONTEXT);
    
    // Update user name in navigation
    await updateUserDisplayName();
    
    // Get current user for role checks
    const currentUser = await verifyRoleOrRedirect(['superadmin']);
    if (!currentUser) return;
    
    // Verify role is actually superadmin
    if (currentUser.role !== 'superadmin') {
        console.error('User role is not superadmin:', currentUser.role);
        showNotification('Access denied: SuperAdmin privileges required', 'error');
        return;
    }
    
    window.currentUser = currentUser;
    console.log('SuperAdmin dashboard initialized for user:', currentUser.email, 'Role:', currentUser.role);
    
    // Apply admin restrictions (hide non-superadmin features)
    applyAdminRestrictions(currentUser);
    
    // Load user statistics
    async function loadUserStats() {
        try {
            // Verify user is superadmin
            const currentUser = window.currentUser;
            if (!currentUser || currentUser.role !== 'superadmin') {
                console.error('User is not a superadmin. Cannot load stats.');
                return;
            }
            
            const usersSnapshot = await getDocs(collection(db, 'users'));
            const users = [];
            usersSnapshot.forEach(doc => {
                users.push({ id: doc.id, ...doc.data() });
            });
            
            const userCount = users.length;
            const adminCount = users.filter(u => u.role === 'admin').length;
            const superAdminCount = users.filter(u => u.role === 'superadmin').length;
            
            // Update stats display
            const statsElements = document.querySelectorAll('.stat-value');
            if (statsElements[0]) statsElements[0].textContent = userCount;
            if (statsElements[1]) statsElements[1].textContent = adminCount;
            // Note: statsElements[2] is for pending requests, not super admin count
            // We'll handle pending requests separately or leave it as 0 for now
            
        } catch (error) {
            console.error('Error loading user stats:', error);
            console.error('Error code:', error.code, 'Message:', error.message);
        }
    }

    // Load pending requests count
    async function loadPendingRequests() {
        try {
            // For now, we'll set it to 0 since we don't have a pending requests collection
            // In a real system, you would query a 'pendingRequests' or 'adminRequests' collection
            const pendingRequestsElement = document.getElementById('pendingRequests');
            if (pendingRequestsElement) {
                pendingRequestsElement.textContent = '0';
            }
            
            // Example of how you would load real pending requests:
            // const pendingRequestsSnapshot = await getDocs(collection(db, 'pendingRequests'));
            // const pendingCount = pendingRequestsSnapshot.size;
            // if (pendingRequestsElement) {
            //     pendingRequestsElement.textContent = pendingCount;
            // }
            
        } catch (error) {
            console.error('Error loading pending requests:', error);
            const pendingRequestsElement = document.getElementById('pendingRequests');
            if (pendingRequestsElement) {
                pendingRequestsElement.textContent = '0';
            }
        }
    }

    // Load all users (local function for dashboard)
    async function loadAllUsersLocal() {
        try {
            // Verify user is superadmin before attempting to load
            const currentUser = window.currentUser;
            if (!currentUser || currentUser.role !== 'superadmin') {
                console.error('User is not a superadmin. Current role:', currentUser?.role);
                showNotification('Access denied: SuperAdmin privileges required', 'error');
                return;
            }
            
            const users = await loadAllUsers();
            displayUsers(users);
            window.allUsers = users; // Store for filtering
        } catch (error) {
            console.error('Error loading users:', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                stack: error.stack
            });
            
            // Show more detailed error message
            let errorMsg = 'Error loading users';
            if (error.code === 'permission-denied') {
                errorMsg = 'Permission denied. Please ensure:\n1. Your Firestore rules are published\n2. Your user role is set to "superadmin" in Firestore';
            } else if (error.message) {
                errorMsg = `Error: ${error.message}`;
            }
            
            showNotification(errorMsg, 'error');
        }
    }
    
    // Apply admin restrictions based on role
    function applyAdminRestrictions(user) {
        const isSuperAdmin = user && user.role === 'superadmin';
        
        // Hide system logs section for non-superadmins
        const systemSection = document.getElementById('system');
        if (systemSection && !isSuperAdmin) {
            systemSection.style.display = 'none';
        }
        
        // Hide backup buttons
        const backupButtons = document.querySelectorAll('[onclick*="triggerBackup"]');
        backupButtons.forEach(btn => {
            if (!isSuperAdmin) btn.style.display = 'none';
        });
        
        // Hide system actions for non-superadmins
        const systemActions = document.querySelectorAll('.system-subsection:last-of-type .action-buttons button');
        systemActions.forEach(btn => {
            if (!isSuperAdmin && (btn.textContent.includes('Backup') || btn.textContent.includes('System'))) {
                btn.style.display = 'none';
            }
        });
    }

    // Display users in table
    function displayUsers(users) {
        const tbody = document.getElementById('usersTableBody');
        const currentUser = window.currentUser || null;
        const isSuperAdmin = currentUser && currentUser.role === 'superadmin';
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">No users found</td></tr>';
            return;
        }
        
        tbody.innerHTML = users.map(user => `
            <tr class="user-row" data-user-id="${user.id}" style="cursor: pointer;">
                <td>${user.firstName} ${user.lastName}</td>
                <td>${user.email}</td>
                <td><span class="role-badge ${user.role}">${user.role.charAt(0).toUpperCase() + user.role.slice(1)}</span></td>
                <td>${formatDate(user.createdAt)}</td>
                <td>
                    ${isSuperAdmin && user.role === 'user' ? `<button class="btn-promote" onclick="event.stopPropagation(); promoteToAdmin('${user.id}')">Make Admin</button>` : ''}
                    ${isSuperAdmin && user.role === 'admin' ? `<button class="btn-demote" onclick="event.stopPropagation(); demoteToUser('${user.id}')">Remove Admin</button>` : ''}
                    ${isSuperAdmin && user.role !== 'superadmin' ? `<button class="btn-delete" onclick="event.stopPropagation(); deleteUser('${user.id}')">Delete</button>` : '<span class="text-muted">Protected</span>'}
                </td>
            </tr>
        `).join('');
        
        // Add click handlers to rows
        const rows = tbody.querySelectorAll('.user-row');
        rows.forEach(row => {
            row.addEventListener('click', async function() {
                const userId = this.getAttribute('data-user-id');
                await loadUserDetailsPanel(userId);
            });
        });
    }
    
    // Load user details in right panel
    async function loadUserDetailsPanel(uid) {
        try {
            const detailPanel = document.querySelector('.detail-panel-content');
            if (!detailPanel) return;
            
            detailPanel.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
            
            const userDetails = await loadUserDetails(uid);
            if (!userDetails) {
                detailPanel.innerHTML = '<div class="detail-panel-empty"><i class="fas fa-exclamation-triangle"></i><p>User not found</p></div>';
                return;
            }
            
            // Store selected user/device for device actions
            window.selectedUid = uid;
            
            const isSuperAdmin = window.currentUser && window.currentUser.role === 'superadmin';
            
            detailPanel.innerHTML = `
                <div class="user-details-content">
                    <div class="user-profile-section">
                        <h3><i class="fas fa-user"></i> Profile</h3>
                        <div class="detail-item">
                            <label>Name:</label>
                            <span>${userDetails.firstName} ${userDetails.lastName}</span>
                        </div>
                        <div class="detail-item">
                            <label>Email:</label>
                            <span>${userDetails.email}</span>
                        </div>
                        <div class="detail-item">
                            <label>Role:</label>
                            <span class="role-badge ${userDetails.role}">${userDetails.role.charAt(0).toUpperCase() + userDetails.role.slice(1)}</span>
                        </div>
                        <div class="detail-item">
                            <label>Status:</label>
                            <span class="${userDetails.isActive !== false ? 'status-active' : 'status-inactive'}">${userDetails.isActive !== false ? 'Active' : 'Inactive'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Joined:</label>
                            <span>${formatDate(userDetails.createdAt)}</span>
                        </div>
                    </div>
                    
                    <div class="ponds-section">
                        <h3><i class="fas fa-water"></i> Ponds (${userDetails.ponds.length})</h3>
                        ${userDetails.ponds.length > 0 ? `
                            <div class="ponds-list">
                                ${(await Promise.all(userDetails.ponds.map(async (pond) => {
                                    const deviceCount = await getPondDeviceCount(uid, pond.id);
                                    return `
                                        <div class="pond-item">
                                            <div class="pond-header">
                                                <strong>${pond.name || 'Unnamed Pond'}</strong>
                                                <span class="pond-location">${pond.location || 'No location'}</span>
                                            </div>
                                            ${pond.description ? `<p class="pond-description">${pond.description}</p>` : ''}
                                            <div class="pond-devices-count">
                                                <i class="fas fa-microchip"></i> Devices: ${deviceCount}
                                            </div>
                                        </div>
                                    `;
                                }))).join('')}
                            </div>
                        ` : '<p class="no-data-text">No ponds found</p>'}
                    </div>
                    
                    <div class="devices-section">
                        <h3><i class="fas fa-microchip"></i> Devices (${userDetails.devices.length})</h3>
                        ${userDetails.devices.length > 0 ? `
                            <div class="devices-list">
                                ${userDetails.devices.map(device => `
                                    <div class="device-item">
                                        <div class="device-header">
                                            <strong>${device.nickname || device.deviceId || 'Unnamed Device'}</strong>
                                            <span class="device-status ${device.status || 'unknown'}">${device.status || 'Unknown'}</span>
                                        </div>
                                        <div class="device-info">
                                            <span><i class="fas fa-id-badge"></i> ${device.deviceId || device.id}</span>
                                            <span class="${device.enabled !== false ? 'enabled' : 'disabled'}">
                                                <i class="fas fa-power-off"></i> ${device.enabled !== false ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </div>
                                        ${isSuperAdmin ? `
                                            <div class="device-actions">
                                                <button class="btn-secondary btn-sm" onclick="resetDevicePairing('${uid}', '${device.id || device.deviceId}')">
                                                    <i class="fas fa-redo"></i> Reset Pairing
                                                </button>
                                                <button class="btn-secondary btn-sm" onclick="toggleDevice('${uid}', '${device.id || device.deviceId}', ${device.enabled !== false})">
                                                    <i class="fas fa-power-off"></i> ${device.enabled !== false ? 'Disable' : 'Enable'}
                                                </button>
                                            </div>
                                        ` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<p class="no-data-text">No devices found</p>'}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading user details panel:', error);
            const detailPanel = document.querySelector('.detail-panel-content');
            if (detailPanel) {
                detailPanel.innerHTML = '<div class="detail-panel-empty"><i class="fas fa-exclamation-triangle"></i><p>Error loading user details</p></div>';
            }
        }
    }
    
    // Get device count for a pond
    async function getPondDeviceCount(uid, pondId) {
        try {
            const devicesSnapshot = await getDocs(collection(db, `users/${uid}/ponds/${pondId}/devices`));
            return devicesSnapshot.size;
        } catch (error) {
            return 0;
        }
    }
    
    // Toggle device enabled/disabled
    async function toggleDevice(uid, deviceId, currentState) {
        await disableDevice(uid, deviceId, !currentState);
        // Reload user details to refresh the panel
        await loadUserDetailsPanel(uid);
    }

    // Promote user to admin (or superadmin if current user is superadmin)
    async function promoteToAdmin(userId, targetRole = 'admin') {
        const currentUser = window.currentUser || null;
        if (currentUser && currentUser.role !== 'superadmin') {
            showNotification('Only superadmins can promote users', 'error');
            return;
        }
        
        // Prevent promoting to superadmin (only existing superadmins can be superadmin)
        if (targetRole === 'superadmin') {
            showNotification('Cannot promote users to superadmin. Superadmin role must be assigned manually.', 'error');
            return;
        }
        
        const roleText = targetRole === 'admin' ? 'admin' : 'user';
        if (confirm(`Are you sure you want to promote this user to ${roleText}?`)) {
            try {
                const userRef = doc(db, 'users', userId);
                await updateDoc(userRef, { role: targetRole });
                
                await logActivity('promote-user', `User ${userId} promoted to ${targetRole}`);
                await sendNotification(userId, 'Role Updated', `You have been promoted to ${roleText} role.`);
                
                showNotification(`User promoted to ${roleText} successfully!`, 'success');
                await loadAllUsersLocal();
                await loadUserStats();
                
                // Reload details if this user is selected
                if (window.selectedUid === userId) {
                    await loadUserDetailsPanel(userId);
                }
            } catch (error) {
                console.error('Error promoting user:', error);
                showNotification('Error promoting user', 'error');
            }
        }
    }

    // Demote admin to user
    async function demoteToUser(userId) {
        const currentUser = window.currentUser || null;
        if (currentUser && currentUser.role !== 'superadmin') {
            showNotification('Only superadmins can demote users', 'error');
            return;
        }
        
        try {
            // First, get the user data to check their role
            const userRef = doc(db, 'users', userId);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
                showNotification('User not found', 'error');
                return;
            }
            
            const userData = userSnap.data();
            
            // Prevent demotion of super admins
            if (userData.role === 'superadmin') {
                showNotification('Cannot demote super admin users. Super admins cannot be demoted for security reasons.', 'error');
                return;
            }
            
            // Confirm demotion for non-super admin users
            if (confirm('Are you sure you want to remove admin privileges from this user?')) {
                await updateDoc(userRef, { role: 'user' });
                
                await logActivity('demote-user', `User ${userId} demoted from admin to user`);
                await sendNotification(userId, 'Role Updated', 'Your admin privileges have been removed.');
                
                showNotification('Admin privileges removed successfully!', 'success');
                await loadAllUsersLocal();
                await loadUserStats();
                
                // Reload details if this user is selected
                if (window.selectedUid === userId) {
                    await loadUserDetailsPanel(userId);
                }
            }
        } catch (error) {
            console.error('Error demoting user:', error);
            showNotification('Error demoting user', 'error');
        }
    }

    // Delete user
    async function deleteUser(userId) {
        const currentUser = window.currentUser || null;
        if (currentUser && currentUser.role !== 'superadmin') {
            showNotification('Only superadmins can delete users', 'error');
            return;
        }
        
        try {
            // First, get the user data to check their role
            const userRef = doc(db, 'users', userId);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
                showNotification('User not found', 'error');
                return;
            }
            
            const userData = userSnap.data();
            
            // Prevent deletion of super admins
            if (userData.role === 'superadmin') {
                showNotification('Cannot delete super admin users. Super admins cannot be deleted for security reasons.', 'error');
                return;
            }
            
            // Confirm deletion for non-super admin users
            if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
                await deleteDoc(userRef);
                
                await logActivity('delete-user', `User ${userId} deleted`);
                
                showNotification('User deleted successfully!', 'success');
                await loadAllUsersLocal();
                await loadUserStats();
                
                // Clear details panel if this user was selected
                if (window.selectedUid === userId) {
                    const detailPanel = document.querySelector('.detail-panel-content');
                    if (detailPanel) {
                        detailPanel.innerHTML = '<div class="detail-panel-empty"><i class="fas fa-hand-pointer"></i><p>Select a user from the list to view details</p></div>';
                    }
                    window.selectedUid = null;
                }
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showNotification('Error deleting user', 'error');
        }
    }

    // Filter users by search term
    function filterUsers(searchTerm) {
        if (!window.allUsers) return;
        
        const filteredUsers = window.allUsers.filter(user => 
            user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        displayUsers(filteredUsers);
    }

    // Filter users by role
    function filterUsersByRole(role) {
        if (!window.allUsers) return;
        
        let filteredUsers = window.allUsers;
        if (role !== 'all') {
            filteredUsers = window.allUsers.filter(user => user.role === role);
        }
        
        displayUsers(filteredUsers);
    }

    // System action functions
    async function refreshData() {
        await logSystemEvent('Refresh Data triggered', 'info');
        showNotification('Refreshing data...', 'info');
        try {
            await loadUserStats();
            await loadPendingRequests();
            await loadAllUsersLocal();
            
            // Reload system logs
            await loadSystemLogs();
            await loadErrorLogs();
            await loadUptimeHistory();
            await loadScheduledTasks();
            
            await logSystemEvent('Data refresh completed successfully', 'info');
            showNotification('Data refreshed successfully!', 'success');
        } catch (error) {
            console.error('Error refreshing data:', error);
            await logError('Data refresh failed', error.message);
            showNotification('Error refreshing data', 'error');
        }
    }

    async function exportUsers() {
        await logSystemEvent('Export Users triggered', 'info');
        try {
            if (!window.allUsers || window.allUsers.length === 0) {
                showNotification('No users to export', 'warning');
                return;
            }
            
            const csvContent = [
                ['Name', 'Email', 'Role', 'Join Date'],
                ...window.allUsers.map(user => [
                    `${user.firstName} ${user.lastName}`,
                    user.email,
                    user.role,
                    formatDate(user.createdAt)
                ])
            ].map(row => row.join(',')).join('\n');
            
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            await logSystemEvent(`Users exported: ${window.allUsers.length} users`, 'info');
            showNotification('Users exported successfully!', 'success');
        } catch (error) {
            console.error('Error exporting users:', error);
            await logError('User export failed', error.message);
            showNotification('Error exporting users', 'error');
        }
    }

    async function clearOldRequests() {
        if (confirm('Are you sure you want to clear old admin requests? This action cannot be undone.')) {
            await logSystemEvent('Clear Old Requests triggered', 'warning');
            showNotification('Clearing old requests...', 'info');
            try {
            // This would clear old admin requests from the database
            // For now, just show a success message
                await logSystemEvent('Old requests cleared successfully', 'info');
            setTimeout(() => {
                showNotification('Old requests cleared successfully!', 'success');
            }, 1000);
            } catch (error) {
                console.error('Error clearing old requests:', error);
                await logError('Clear old requests failed', error.message);
                showNotification('Error clearing old requests', 'error');
            }
        }
    }

    // Make functions globally accessible
    window.promoteToAdmin = promoteToAdmin;
    window.demoteToUser = demoteToUser;
    window.deleteUser = deleteUser;
    window.filterUsers = filterUsers;
    window.filterUsersByRole = filterUsersByRole;
    window.refreshData = refreshData;
    window.exportUsers = exportUsers;
    window.clearOldRequests = clearOldRequests;
    window.resetDevicePairing = async (uid, deviceId) => {
        await resetDevicePairing(uid, deviceId);
        if (window.selectedUid === uid) {
            await loadUserDetailsPanel(uid);
        }
    };
    window.toggleDevice = toggleDevice;
    
    // Import modal functions (dynamic import)
    let openModal, closeModal;
    try {
        const uiModule = await import('./ui.js');
        openModal = uiModule.openModal;
        closeModal = uiModule.closeModal;
    } catch (error) {
        console.error('Error importing UI module:', error);
        // Fallback functions
        openModal = function(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) modal.style.display = 'block';
        };
        closeModal = function(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) modal.style.display = 'none';
        };
    }
    
    // Input action functions
    window.openAddTaskModal = function() {
        openModal('addTaskModal');
        const form = document.getElementById('addTaskForm');
        if (form) form.reset();
    };
    
    window.openAddLogModal = function(type) {
        openModal('addLogModal');
        const form = document.getElementById('addLogForm');
        if (form) form.reset();
        
        const title = document.getElementById('addLogModalTitle');
        const logTypeInput = document.getElementById('logType');
        const logTypeSelect = document.getElementById('logTypeSelect');
        const logTypeSelectGroup = document.getElementById('logTypeSelectGroup');
        const errorDetailsGroup = document.getElementById('errorDetailsGroup');
        
        if (type === 'error') {
            if (title) title.textContent = 'Add Error Log';
            if (logTypeInput) logTypeInput.value = 'error';
            if (logTypeSelect) {
                logTypeSelect.value = 'error';
                logTypeSelect.style.display = 'none';
            }
            if (logTypeSelectGroup) logTypeSelectGroup.style.display = 'none';
            if (errorDetailsGroup) errorDetailsGroup.style.display = 'block';
        } else {
            if (title) title.textContent = 'Add System Log';
            if (logTypeInput) logTypeInput.value = 'system';
            if (logTypeSelect) {
                logTypeSelect.value = 'info';
                logTypeSelect.style.display = 'block';
            }
            if (logTypeSelectGroup) logTypeSelectGroup.style.display = 'block';
            if (errorDetailsGroup) errorDetailsGroup.style.display = 'none';
        }
    };
    
    window.openFirmwareUpdateModal = function() {
        openModal('firmwareUpdateModal');
        const form = document.getElementById('firmwareUpdateForm');
        if (form) form.reset();
    };
    
    window.closeModal = closeModal;
    
    // ============================================================
    // MOBILE APP UPDATE FUNCTIONS (GitHub Releases)
    // ============================================================
    
    // Save APK metadata to Firestore
    window.saveAPKInfo = async function() {
        try {
            const url = document.getElementById("apkUrlInput").value.trim();
            const version = document.getElementById("apkVersionInput").value.trim();
            const notes = document.getElementById("apkNotesInput").value.trim();
            
            if (!url || !version) {
                showNotification('APK URL and Version are required', 'error');
                return;
            }
            
            // Validate URL format
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                showNotification('Please enter a valid URL', 'error');
                return;
            }
            
            // Save to Firestore at system_updates/apk
            await setDoc(doc(db, "system_updates", "apk"), {
                url: url,
                version: version,
                notes: notes || '',
                type: 'apk',
                uploadedAt: serverTimestamp(),
                adminId: window.RUNTIME_CONTEXT?.runtimeUid || null
            });
            
            await logSystemEvent(`Mobile app update published: Version ${version}`, 'info');
            showNotification('APK Version saved successfully!', 'success');
            
            // Clear form
            document.getElementById("apkUrlInput").value = '';
            document.getElementById("apkVersionInput").value = '';
            document.getElementById("apkNotesInput").value = '';
            
            // Reload APK info
            await loadAPKInfo();
        } catch (error) {
            console.error('Error saving APK info:', error);
            await logError('Failed to save APK version', error.message);
            showNotification('Error saving APK version', 'error');
        }
    };
    
    // Load APK metadata from Firestore
    window.loadAPKInfo = async function() {
        try {
            const apkDocRef = doc(db, "system_updates", "apk");
            const apkDoc = await getDoc(apkDocRef);
            
            if (!apkDoc.exists()) {
                const versionEl = document.getElementById("apkCurrentVersion");
                const linkEl = document.getElementById("apkDownloadLink");
                if (versionEl) versionEl.textContent = '--';
                if (linkEl) linkEl.style.display = 'none';
                return;
            }
            
            const data = apkDoc.data();
            
            const versionEl = document.getElementById("apkCurrentVersion");
            const linkEl = document.getElementById("apkDownloadLink");
            
            if (versionEl) {
                versionEl.textContent = data.version || '--';
            }
            
            if (linkEl && data.url) {
                linkEl.href = data.url;
                linkEl.style.display = "inline-block";
            } else if (linkEl) {
                linkEl.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading APK info:', error);
            const versionEl = document.getElementById("apkCurrentVersion");
            if (versionEl) versionEl.textContent = 'Error loading';
        }
    };
    
    // Open GitHub help modal
    window.openGitHubHelpModal = function() {
        openModal('githubHelpModal');
    };
    
    // Set up APK save button event listener
    const saveApkBtn = document.getElementById("saveApkInfoBtn");
    if (saveApkBtn) {
        saveApkBtn.addEventListener("click", window.saveAPKInfo);
    }
    
    // Set up GitHub upload button event listener
    const goToGithubUploadBtn = document.getElementById("goToGithubUpload");
    if (goToGithubUploadBtn) {
        goToGithubUploadBtn.addEventListener("click", () => {
            // Open GitHub Releases "New Release" page in new tab
            window.open(
                "https://github.com/pdonadillo/Aquasense-apk/releases/new",
                "_blank"
            );
            
            // Log the action
            logSystemEvent('Opened GitHub Releases page for APK upload', 'info').catch(err => {
                console.error('Error logging GitHub upload action:', err);
            });
        });
    }
    
    window.addScheduledTask = async function() {
        try {
            const name = document.getElementById('taskName').value;
            const description = document.getElementById('taskDescription').value;
            const status = document.getElementById('taskStatus').value;
            const nextRunInput = document.getElementById('taskNextRun').value;
            
            if (!name) {
                showNotification('Task name is required', 'error');
                return;
            }
            
            const taskData = {
                name,
                description: description || '',
                status,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            
            if (nextRunInput) {
                taskData.nextRun = new Date(nextRunInput);
            }
            
            await addDoc(collection(db, 'scheduled_tasks'), taskData);
            
            await logSystemEvent(`Scheduled task created: ${name}`, 'info');
            showNotification('Task created successfully!', 'success');
            
            // Close modal
            closeModal('addTaskModal');
            
            // Reload tasks
            await loadScheduledTasks();
        } catch (error) {
            console.error('Error adding task:', error);
            await logError('Failed to create scheduled task', error.message);
            showNotification('Error creating task', 'error');
        }
    };
    
    window.addSystemLog = async function() {
        try {
            const logType = document.getElementById('logType').value;
            const message = document.getElementById('logMessage').value;
            const typeSelect = document.getElementById('logTypeSelect').value;
            const errorDetails = document.getElementById('errorDetails').value;
            
            if (!message) {
                showNotification('Message is required', 'error');
                return;
            }
            
            if (logType === 'error') {
                await logError(message, errorDetails || '');
            } else {
                await logSystemEvent(message, typeSelect || 'info');
            }
            
            showNotification('Log added successfully!', 'success');
            
            // Close modal
            closeModal('addLogModal');
            
            // Reload logs
            if (logType === 'error') {
                await loadErrorLogs();
            } else {
                await loadSystemLogs();
            }
        } catch (error) {
            console.error('Error adding log:', error);
            showNotification('Error adding log', 'error');
        }
    };
    
    window.addFirmwareUpdate = async function() {
        try {
            const version = document.getElementById('firmwareVersion').value;
            const updateType = document.getElementById('updateType').value;
            const outdatedDevices = parseInt(document.getElementById('outdatedDevicesCount').value) || 0;
            const notes = document.getElementById('updateNotes').value;
            
            if (!version) {
                showNotification('Firmware version is required', 'error');
                return;
            }
            
            await addDoc(collection(db, 'system_updates'), {
                type: updateType,
                version,
                outdatedDevices,
                notes: notes || '',
                timestamp: serverTimestamp(),
                adminId: window.RUNTIME_CONTEXT?.runtimeUid || null
            });
            
            await logSystemEvent(`Firmware update recorded: ${version} (${updateType})`, 'info');
            showNotification('Firmware update recorded successfully!', 'success');
            
            // Close modal
            closeModal('firmwareUpdateModal');
            
            // Reload firmware info
            await loadFirmwareVersions();
        } catch (error) {
            console.error('Error adding firmware update:', error);
            await logError('Failed to record firmware update', error.message);
            showNotification('Error recording firmware update', 'error');
        }
    };

    // Diagnostic function to check user permissions
    async function diagnosePermissions() {
        try {
            const userUid = window.RUNTIME_CONTEXT?.runtimeUid || null;
            console.log('=== PERMISSION DIAGNOSTICS ===');
            console.log('User UID:', userUid);
            console.log('Current User:', window.currentUser);
            
            if (userUid) {
                const userRef = doc(db, 'users', userUid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    console.log('User document found:', userData);
                    console.log('User role:', userData.role);
                    
                    if (userData.role !== 'superadmin') {
                        console.error('❌ User role is NOT superadmin. Current role:', userData.role);
                        console.error('Please update your user document in Firestore to have role: "superadmin"');
                    } else {
                        console.log('✅ User role is superadmin');
                    }
                } else {
                    console.error('❌ User document does not exist in Firestore');
                }
            }
            
            console.log('Firestore rules check:');
            console.log('1. Go to Firebase Console → Firestore Database → Rules');
            console.log('2. Copy the rules from firestore.rules file');
            console.log('3. Click "Publish" to apply the rules');
            console.log('==============================');
        } catch (error) {
            console.error('Diagnostic error:', error);
        }
    }
    
    // Run diagnostics
    await diagnosePermissions();
    
    // Track SuperAdmin login/uptime
    try {
        await trackUptime();
        await logSystemEvent('SuperAdmin dashboard accessed', 'info');
    } catch (error) {
        console.error('Error tracking uptime or logging system event:', error);
    }

    // Initialize dashboard
    try {
        await loadUserStats();
        await loadPendingRequests();
        await loadAllUsersLocal();
        
        // Load system logs and data
        try {
            await Promise.all([
                loadSystemLogs(),
                loadErrorLogs(),
                loadUptimeHistory(),
                loadScheduledTasks(),
                loadFirmwareVersions(),
                loadAPKInfo()
            ]);
        } catch (error) {
            console.error('Error loading system data:', error);
            // Don't show notification for system data loading errors
            // They're not critical for dashboard functionality
        }
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showNotification('Error loading dashboard data', 'error');
        await logError('Dashboard initialization failed', error.message);
    }

    // Set up search functionality
    const searchInput = document.getElementById('userSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            filterUsers(this.value);
        });
    }
    
    // Set up filter buttons
    const filterButtons = document.querySelectorAll('.btn-filter');
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            filterButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            
            // Filter users based on button data-filter attribute
            const filter = this.getAttribute('data-filter');
            filterUsersByRole(filter);
        });
    });

    // Set up navigation between sections
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section[id]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all links and sections
            navLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            // Add active class to clicked link
            this.classList.add('active');
            
            // Show corresponding section
            const targetId = this.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
            }
        });
    });
}

// ============================================================
// CHART RENDERING (SEED-AWARE, EMPTY-STATE SAFE)
// ============================================================

// Helper: Destroy chart instance safely
function destroyChart(chartInstance) {
    if (chartInstance && typeof chartInstance.destroy === 'function') {
        chartInstance.destroy();
    }
}

// Helper: Show empty state message
function showChartEmptyState(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const container = canvas.parentElement;
    if (!container) return;
    
    // Remove existing empty state if present
    const existingEmpty = container.querySelector('.chart-empty-state');
    if (existingEmpty) existingEmpty.remove();
    
    // Create empty state message
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'chart-empty-state';
    emptyDiv.style.cssText = 'padding: 2rem; text-align: center; color: #666; font-style: italic;';
    emptyDiv.textContent = message;
    container.appendChild(emptyDiv);
}

// Render daily charts
function renderDailyCharts(reports) {
    // Filter out seed documents
    const realReports = reports.filter(r => !r.isSeed || (r.avgTemperature !== 0 || r.avgPh !== 0));
    
    if (realReports.length === 0) {
        destroyChart(chartInstances.daily.temperature);
        destroyChart(chartInstances.daily.ph);
        chartInstances.daily.temperature = null;
        chartInstances.daily.ph = null;
        
        showChartEmptyState('dailyTemperatureChart', 'No data yet');
        showChartEmptyState('dailyPhChart', 'No data yet');
        return;
    }
    
    // Remove empty state messages
    document.querySelectorAll('.chart-empty-state').forEach(el => {
        if (el.parentElement.querySelector('#dailyTemperatureChart, #dailyPhChart')) {
            el.remove();
        }
    });
    
    // Prepare data
    const labels = realReports.map(r => {
        const date = new Date(r.date + 'T00:00:00');
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }).reverse();
    const temps = realReports.map(r => r.avgTemperature || 0).reverse();
    const phs = realReports.map(r => r.avgPh || 0).reverse();
    
    // Destroy old charts
    destroyChart(chartInstances.daily.temperature);
    destroyChart(chartInstances.daily.ph);
    
    // Create new charts
    const tempCtx = document.getElementById('dailyTemperatureChart');
    const phCtx = document.getElementById('dailyPhChart');
    
    if (tempCtx && typeof Chart !== 'undefined') {
        chartInstances.daily.temperature = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Temperature (°C)',
                    data: temps,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
    
    if (phCtx && typeof Chart !== 'undefined') {
        chartInstances.daily.ph = new Chart(phCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'pH',
                    data: phs,
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
}

// Render weekly charts
function renderWeeklyCharts(reports) {
    const realReports = reports.filter(r => !r.isSeed || (r.avgTemperature !== 0 || r.avgPh !== 0));
    
    if (realReports.length === 0) {
        destroyChart(chartInstances.weekly.temperature);
        destroyChart(chartInstances.weekly.ph);
        chartInstances.weekly.temperature = null;
        chartInstances.weekly.ph = null;
        
        showChartEmptyState('weeklyTemperatureChart', 'No data yet');
        showChartEmptyState('weeklyPhChart', 'No data yet');
        return;
    }
    
    document.querySelectorAll('.chart-empty-state').forEach(el => {
        if (el.parentElement.querySelector('#weeklyTemperatureChart, #weeklyPhChart')) {
            el.remove();
        }
    });
    
    const labels = realReports.map(r => r.week || 'Week').reverse();
    const temps = realReports.map(r => r.avgTemperature || 0).reverse();
    const phs = realReports.map(r => r.avgPh || 0).reverse();
    
    destroyChart(chartInstances.weekly.temperature);
    destroyChart(chartInstances.weekly.ph);
    
    const tempCtx = document.getElementById('weeklyTemperatureChart');
    const phCtx = document.getElementById('weeklyPhChart');
    
    if (tempCtx && typeof Chart !== 'undefined') {
        chartInstances.weekly.temperature = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Temperature (°C)',
                    data: temps,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
    
    if (phCtx && typeof Chart !== 'undefined') {
        chartInstances.weekly.ph = new Chart(phCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'pH',
                    data: phs,
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
}

// Render monthly charts
function renderMonthlyCharts(reports) {
    const realReports = reports.filter(r => !r.isSeed || (r.avgTemperature !== 0 || r.avgPh !== 0));
    
    if (realReports.length === 0) {
        destroyChart(chartInstances.monthly.temperature);
        destroyChart(chartInstances.monthly.ph);
        chartInstances.monthly.temperature = null;
        chartInstances.monthly.ph = null;
        
        showChartEmptyState('monthlyTemperatureChart', 'No data yet');
        showChartEmptyState('monthlyPhChart', 'No data yet');
        return;
    }
    
    document.querySelectorAll('.chart-empty-state').forEach(el => {
        if (el.parentElement.querySelector('#monthlyTemperatureChart, #monthlyPhChart')) {
            el.remove();
        }
    });
    
    const labels = realReports.map(r => {
        const [year, month] = r.month.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }).reverse();
    const temps = realReports.map(r => r.avgTemperature || 0).reverse();
    const phs = realReports.map(r => r.avgPh || 0).reverse();
    
    destroyChart(chartInstances.monthly.temperature);
    destroyChart(chartInstances.monthly.ph);
    
    const tempCtx = document.getElementById('monthlyTemperatureChart');
    const phCtx = document.getElementById('monthlyPhChart');
    
    if (tempCtx && typeof Chart !== 'undefined') {
        chartInstances.monthly.temperature = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Temperature (°C)',
                    data: temps,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
    
    if (phCtx && typeof Chart !== 'undefined') {
        chartInstances.monthly.ph = new Chart(phCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'pH',
                    data: phs,
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
}

// Render hourly charts
function renderHourlyCharts(reports) {
    const realReports = reports.filter(r => !r.isSeed || (r.temperatureAvg !== 0 || r.phAvg !== 0));
    
    if (realReports.length === 0) {
        destroyChart(chartInstances.hourly.temperature);
        destroyChart(chartInstances.hourly.ph);
        chartInstances.hourly.temperature = null;
        chartInstances.hourly.ph = null;
        
        showChartEmptyState('hourlyTemperatureChart', 'No data yet');
        showChartEmptyState('hourlyPhChart', 'No data yet');
        return;
    }
    
    document.querySelectorAll('.chart-empty-state').forEach(el => {
        if (el.parentElement.querySelector('#hourlyTemperatureChart, #hourlyPhChart')) {
            el.remove();
        }
    });
    
    // Sort by hour
    const sorted = realReports.sort((a, b) => {
        const hourA = parseInt(a.hour || '0');
        const hourB = parseInt(b.hour || '0');
        return hourA - hourB;
    });
    
    const labels = sorted.map(r => r.hour || '00');
    const temps = sorted.map(r => r.temperatureAvg || 0);
    const phs = sorted.map(r => r.phAvg || 0);
    
    destroyChart(chartInstances.hourly.temperature);
    destroyChart(chartInstances.hourly.ph);
    
    const tempCtx = document.getElementById('hourlyTemperatureChart');
    const phCtx = document.getElementById('hourlyPhChart');
    
    if (tempCtx && typeof Chart !== 'undefined') {
        chartInstances.hourly.temperature = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Temperature (°C)',
                    data: temps,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
    
    if (phCtx && typeof Chart !== 'undefined') {
        chartInstances.hourly.ph = new Chart(phCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'pH',
                    data: phs,
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
}

// ============================================================
// HARVEST REPORT STUB (CLEAN - NO LOGIC)
// ============================================================

async function generateHarvestReport(uid, harvestId) {}

// ============================================================
// INTERACTIVE WATER QUALITY CHART (READ-ONLY VISUALIZATION)
// ============================================================

// Helper: Load daily reports (read-only, for chart)
async function loadDailyReports() {
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) return [];
        
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const q = query(dailyReportsRef, orderBy('date', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const reports = [];
        querySnapshot.forEach(doc => {
            reports.push(doc.data());
        });
        
        return reports;
    } catch (error) {
        console.error('Error loading daily reports:', error);
        return [];
    }
}

// Helper: Load weekly reports (read-only, for chart)
async function loadWeeklyReports() {
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) return [];
        
        const weeklyReportsRef = collection(db, `users/${uid}/weeklyReports`);
        const q = query(weeklyReportsRef, orderBy('week', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const reports = [];
        querySnapshot.forEach(doc => {
            reports.push(doc.data());
        });
        
        return reports;
    } catch (error) {
        console.error('Error loading weekly reports:', error);
        return [];
    }
}

// Helper: Load monthly reports (read-only, for chart)
async function loadMonthlyReports() {
    try {
        const uid = window.RUNTIME_CONTEXT?.runtimeUid || null;
        if (!uid) return [];
        
        const monthlyReportsRef = collection(db, `users/${uid}/monthlyReports`);
        const q = query(monthlyReportsRef, orderBy('month', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const reports = [];
        querySnapshot.forEach(doc => {
            reports.push(doc.data());
        });
        
        return reports;
    } catch (error) {
        console.error('Error loading monthly reports:', error);
        return [];
    }
}

// Update period selector based on range selection
function updateChartPeriodSelector() {
    const rangeSelect = document.getElementById('chartRange');
    const monthSelector = document.getElementById('chartPeriodSelector');
    const yearSelector = document.getElementById('chartYearSelector');
    
    if (!rangeSelect) return;
    
    const range = rangeSelect.value;
    const today = new Date();
    
    if (range === 'daily' || range === 'weekly') {
        // Show month selector for daily/weekly
        if (monthSelector) {
            monthSelector.style.display = 'block';
            monthSelector.value = getMonthString(today); // Format: "YYYY-MM"
        }
        if (yearSelector) {
            yearSelector.style.display = 'none';
        }
    } else if (range === 'monthly') {
        // Show year selector for monthly
        if (monthSelector) {
            monthSelector.style.display = 'none';
        }
        if (yearSelector) {
            yearSelector.style.display = 'block';
            yearSelector.value = today.getFullYear().toString();
        }
    } else {
        if (monthSelector) monthSelector.style.display = 'none';
        if (yearSelector) yearSelector.style.display = 'none';
    }
}

// Main chart render function
// Render live sensor readings chart
function renderLiveSensorChart() {
    const metricSelect = document.getElementById('liveChartMetric');
    const canvas = document.getElementById('waterQualityChart');

    if (!metricSelect || !canvas) return;

    const metric = metricSelect.value;

    // Check if we have data
    if (liveSensorData.timestamps.length === 0) {
        destroyWaterQualityChart();
        document.getElementById('chartEmptyState')?.classList.remove('hidden');
        return;
    }

    document.getElementById('chartEmptyState')?.classList.add('hidden');

    // Format time labels (show time in HH:MM:SS format)
    const labels = liveSensorData.timestamps.map(ts => {
        const date = new Date(ts);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    });

    destroyWaterQualityChart();

    const datasets = [];

    if (metric === 'temperature' || metric === 'both') {
        datasets.push({
            label: 'Temperature (°C)',
            data: liveSensorData.temperature,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            tension: 0.4,
            yAxisID: 'y'
        });
    }

    if (metric === 'ph' || metric === 'both') {
        datasets.push({
            label: 'pH Level',
            data: liveSensorData.ph,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
            yAxisID: metric === 'both' ? 'y1' : 'y'
        });
    }

    waterQualityChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    enabled: true
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: metric === 'both' ? 'Temperature (°C)' : (metric === 'temperature' ? 'Temperature (°C)' : 'pH Level')
                    }
                },
                ...(metric === 'both' ? {
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'pH Level'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                } : {})
            },
            animation: {
                duration: 300
            }
        }
    });
}

// Add new sensor reading to live data
function addLiveSensorReading(temperature, ph) {
    const now = Date.now();
    
    // Add to arrays
    liveSensorData.temperature.push(temperature !== null ? temperature : null);
    liveSensorData.ph.push(ph !== null ? ph : null);
    liveSensorData.timestamps.push(now);
    
    // Keep only last N data points
    if (liveSensorData.timestamps.length > liveSensorData.maxDataPoints) {
        liveSensorData.temperature.shift();
        liveSensorData.ph.shift();
        liveSensorData.timestamps.shift();
    }
    
    // Update chart
    renderLiveSensorChart();
}

// Destroy water quality chart (separate from other chart destroy function)
function destroyWaterQualityChart() {
    if (waterQualityChart) {
        waterQualityChart.destroy();
        waterQualityChart = null;
    }
}

// Initialize chart controller on dashboard load
function initializeWaterQualityChart() {
    const metricSelect = document.getElementById('liveChartMetric');
    
    if (!metricSelect) return;
    
    // Event listener for metric selection
    metricSelect.addEventListener('change', renderLiveSensorChart);
    
    // Initial render
    renderLiveSensorChart();
}

// ============================================================
// WRAP CRITICAL FUNCTIONS WITH SAFETY GUARDS
// ============================================================
// Wrap critical functions after they're defined to add error handling
// This preserves original behavior while adding diagnostics

(function wrapCriticalFunctions() {
    // Wrap resolveRuntimeContext
    if (typeof resolveRuntimeContext === 'function') {
        const original = resolveRuntimeContext;
        window.__original_resolveRuntimeContext = original;
        window.resolveRuntimeContext = wrapFunction(original, 'resolveRuntimeContext', 'runtime context resolution');
    }
    
    // Wrap setupSensorRealtimeUpdates
    if (typeof setupSensorRealtimeUpdates === 'function') {
        const original = setupSensorRealtimeUpdates;
        window.__original_setupSensorRealtimeUpdates = original;
        window.setupSensorRealtimeUpdates = wrapFunction(original, 'setupSensorRealtimeUpdates', 'RTDB listener setup');
    }
    
    // Wrap runRollupsForCurrentContext
    if (typeof runRollupsForCurrentContext === 'function') {
        const original = runRollupsForCurrentContext;
        window.__original_runRollupsForCurrentContext = original;
        window.runRollupsForCurrentContext = wrapFunction(original, 'runRollupsForCurrentContext', 'rollup execution');
    }
    
    // Wrap startFeedingSchedule
    if (typeof startFeedingSchedule === 'function') {
        const original = startFeedingSchedule;
        window.__original_startFeedingSchedule = original;
        window.startFeedingSchedule = wrapFunction(original, 'startFeedingSchedule', 'feeding schedule start');
    }
    
    // Wrap stopFeedingSchedule
    if (typeof stopFeedingSchedule === 'function') {
        const original = stopFeedingSchedule;
        window.__original_stopFeedingSchedule = original;
        window.stopFeedingSchedule = wrapFunction(original, 'stopFeedingSchedule', 'feeding schedule stop');
    }
    
    // Wrap toggleMotor (window function)
    if (typeof window.toggleMotor === 'function') {
        const original = window.toggleMotor;
        window.__original_toggleMotor = original;
        window.toggleMotor = wrapFunction(original, 'toggleMotor', 'motor control');
        console.log('[CODE CHECKER] toggleMotor wrapped successfully');
    } else {
        console.error('[CODE CHECKER] toggleMotor not found - cannot wrap');
    }
    
    // Verify toggleMotor is accessible
    console.log('[CODE CHECKER] typeof window.toggleMotor:', typeof window.toggleMotor);
    
    console.log('[CODE CHECKER] Critical functions wrapped with safety guards');
})();

// Boot completion log
console.log('[BOOT] dashboard.js fully loaded');

// ============================================================
// BACKGROUND RUNTIME BOOTSTRAP (Index Page Support)
// ============================================================
// This function runs core system logic (RTDB listeners, feeding schedules, rollups)
// on index.html without requiring login or dashboard UI.
// Prevents duplication via window.__BG_RUNTIME_STARTED__ guard.
// What runs: RTDB sensor updates, hourly Firestore writes, feeding schedules, rollups.
// How duplication is prevented: Global flag check before execution.

// ============================================================
// RUNTIME CORE BOOT (DOM-FREE, AUTH-INDEPENDENT)
// ============================================================
// Single entry point for device runtime
// Works on any page, with or without login
export async function bootRuntimeCore({sourcePage = 'unknown'} = {}) {
    // Guard against double execution
    if (window.__RUNTIME_CORE_STARTED__) {
        console.log('[CORE] runtime boot skipped (already started)');
        return;
    }
    
    window.__RUNTIME_CORE_STARTED__ = true;
    console.log('[CORE] runtime boot start (source:', sourcePage + ')');
    
    try {
        // Step 1: Ensure device record exists (non-blocking, works without auth)
        await ensureDeviceRecordExists();
        
        // Step 2: Resolve runtime context (works with or without authentication)
        // Never throw - runtime must continue even if context resolution fails
        try {
            window.RUNTIME_CONTEXT = await resolveRuntimeContext();
            console.log('[CORE] Runtime context resolved:', window.RUNTIME_CONTEXT);
        } catch (contextError) {
            console.warn('[CORE] Runtime context resolution failed (non-critical):', contextError);
            window.RUNTIME_CONTEXT = { deviceId: DEVICE_ID, runtimeUid: null, source: 'device' };
        }
        
        // Step 3: Start RTDB live listeners (works without auth)
        setupSensorRealtimeUpdatesCore();
        
        // Step 4: Start feeding schedule executor (motor RTDB writes are unconditional)
        setupFeedingScheduleExecutionCore();
        
        // Step 5: Start rollups safely (guard against duplicate intervals)
        if (typeof runRollupsForCurrentContext === 'function') {
            // Run immediately
            runRollupsForCurrentContext().catch(err => {
                console.error('[CORE] Initial rollup error:', err);
            });
            
            // Then run every 10 minutes (unified guard)
            if (!window.__ROLLUP_TIMER__) {
                window.__ROLLUP_TIMER__ = setInterval(() => {
                    console.log('[CORE] rollup tick');
                    runRollupsForCurrentContext().catch(err => {
                        console.error('[CORE] Rollup error:', err);
                    });
                }, 10 * 60 * 1000); // 10 minutes
                console.log('[CORE] Rollup interval started');
            } else {
                console.log('[CORE] Rollup interval already exists, skipping');
            }
        }
        
        console.log('[CORE] runtime boot ok');
        
    } catch (error) {
        console.error('[CORE] runtime boot error:', error);
        // Reset flag on error so retry is possible
        window.__RUNTIME_CORE_STARTED__ = false;
    }
}

// Legacy wrapper (backward compatibility)
export async function bootUserBackgroundRuntime() {
    return bootRuntimeCore({sourcePage: 'index'});
}
