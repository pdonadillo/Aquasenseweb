// this is dashboard.js
// dashboard.js - Dashboard-specific functionality
console.log('[BOOT] dashboard.js loaded');

import { db, rtdb, doc, getDoc, setDoc, collection, getDocs, updateDoc, deleteDoc, addDoc, auth, serverTimestamp, query, orderBy, limit, onSnapshot, onAuthStateChanged, runTransaction, increment, ref, set, onValue, off } from './firebase-init.js';
import { updateUserDisplayName, verifyRoleOrRedirect } from './auth.js';
import { formatDate } from './utils.js';
import { showNotification } from './notifications.js';

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
    hourlyRows: []
};

// Global chart instance for water quality chart
let waterQualityChart = null;

// Store chart instances for cleanup
const chartInstances = {
    daily: {
        temperature: null,
        ph: null,
        feed: null
    },
    weekly: {
        temperature: null,
        ph: null,
        feed: null
    },
    monthly: {
        temperature: null,
        ph: null,
        feed: null
    },
    hourly: {
        temperature: null,
        ph: null,
        feed: null
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
            feedUsedKg: 0,
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
            totalFeedKg: 0,
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
            totalFeedKg: 0,
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
            totalFeedKg: 0,
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
                    feedUsedKg: 0,
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
function startHourlySampler(uid) {
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
        
        // Update user name in navigation
        await updateUserDisplayName();
        
        // Wait for auth state to be ready, then initialize reports
        // This ensures Firebase is fully initialized before we try to access it
        const initReports = async () => {
            try {
                const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
                
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
                if (!user) {
                    console.log('[REPORT INIT] No authenticated user, skipping report initialization');
                    // Cleanup sensor listeners on logout
                    cleanupSensorListeners();
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
    setupSensorRealtimeUpdates();
    
    // Update next feeding alert message
    await updateNextFeedingAlert();
    
    // Set up auto-refresh for next feeding alert
    setupNextFeedingAlertAutoRefresh();
    
    // Load feeding schedules from Firestore
    await loadFeedingSchedules();
    
    // Set up auto-refresh for feeding schedules
    setupFeedingScheduleAutoRefresh();
    
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
    
    // Initialize analytics UI selectors and load analytics data
    initializeAnalyticsSelectors();
    
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

// Load sensor data from Firestore
async function loadSensorData() {
    try {
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
        if (!uid) {
            console.warn('No user UID found, cannot load sensor data');
            return;
        }
        
        console.log('Loading sensor data for user:', uid);
        
        // Load temperature sensor
        const tempRef = doc(db, `users/${uid}/sensors/temperature`);
        const tempSnap = await getDoc(tempRef);
        
        if (tempSnap.exists()) {
            const tempData = tempSnap.data();
            const tempValue = tempData.value !== undefined ? tempData.value : '--';
            updateSensorDisplay('temperature', tempValue, '°C');
            console.log('Temperature loaded:', tempValue);
        } else {
            console.warn('Temperature sensor document not found');
            updateSensorDisplay('temperature', '--', '°C');
        }
        
        // Load pH sensor
        const phRef = doc(db, `users/${uid}/sensors/ph`);
        const phSnap = await getDoc(phRef);
        
        if (phSnap.exists()) {
            const phData = phSnap.data();
            const phValue = phData.value !== undefined ? phData.value : '--';
            updateSensorDisplay('ph', phValue, '');
            console.log('pH loaded:', phValue);
        } else {
            console.warn('pH sensor document not found');
            updateSensorDisplay('ph', '--', '');
        }
        
        // Load feeder status
        const feederRef = doc(db, `users/${uid}/sensors/feeder`);
        const feederSnap = await getDoc(feederRef);
        
        if (feederSnap.exists()) {
            const feederData = feederSnap.data();
            const feederValue = feederData.value !== undefined ? feederData.value : null;
            const normalizedStatus = feederValue ? String(feederValue).toLowerCase() : null;
            const isOnline = normalizedStatus === 'online';
            updateFeederStatusDisplay(isOnline);
            
            // Mirror initial status to RTDB
            const deviceId = uid; // Using UID as deviceId - adjust if needed
            await mirrorFeederStatusToRTDB(deviceId, isOnline);
            
            console.log('Feeder status loaded:', normalizedStatus);
        } else {
            console.warn('Feeder sensor document not found');
            updateFeederStatusDisplay(null);
        }
        
        // Also update the key metrics section
        updateKeyMetrics();
        
    } catch (error) {
        console.error('Error loading sensor data:', error);
        // Set default values on error
        updateSensorDisplay('temperature', '--', '°C');
        updateSensorDisplay('ph', '--', '');
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

// Set up real-time sensor updates using Firestore listeners
function setupSensorRealtimeUpdates() {
    try {
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
        if (!uid) {
            console.warn('No user UID found, cannot set up real-time updates');
            return;
        }
        
        console.log('Setting up real-time sensor updates for user:', uid);
        
        // Set up real-time listener for temperature
        const tempRef = doc(db, `users/${uid}/sensors/temperature`);
        const unsubscribeTemp = onSnapshot(tempRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const value = data.value !== undefined ? data.value : '--';
                updateSensorDisplay('temperature', value, '°C');
                console.log('Temperature updated (real-time):', value);
            } else {
                updateSensorDisplay('temperature', '--', '°C');
            }
        }, (error) => {
            console.error('Error in temperature real-time listener:', error);
        });
        
        // Set up real-time listener for pH
        const phRef = doc(db, `users/${uid}/sensors/ph`);
        const unsubscribePh = onSnapshot(phRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const value = data.value !== undefined ? data.value : '--';
                updateSensorDisplay('ph', value, '');
                console.log('pH updated (real-time):', value);
            } else {
                updateSensorDisplay('ph', '--', '');
            }
        }, (error) => {
            console.error('Error in pH real-time listener:', error);
        });
        
        // Set up real-time listener for feeder status
        const feederRef = doc(db, `users/${uid}/sensors/feeder`);
        const unsubscribeFeeder = onSnapshot(feederRef, async (snapshot) => {
            try {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const value = data.value !== undefined ? data.value : null;
                    
                    // Normalize value to lowercase for consistency
                    const normalizedStatus = value ? String(value).toLowerCase() : null;
                    const isOnline = normalizedStatus === 'online';
                    
                    // Update UI immediately
                    updateFeederStatusDisplay(isOnline);
                    
                    // Mirror to RTDB (use UID as deviceId - adjust if you have a different deviceId mapping)
                    const deviceId = uid; // Using UID as deviceId - change if you have a device collection mapping
                    await mirrorFeederStatusToRTDB(deviceId, isOnline);
                    
                    console.log('Feeder status updated (real-time):', normalizedStatus);
                } else {
                    updateFeederStatusDisplay(null);
                    console.warn('Feeder sensor document not found');
                }
            } catch (error) {
                console.error('Error processing feeder status update:', error);
            }
        }, (error) => {
            console.error('Error in feeder real-time listener:', error);
        });
        
        // Store unsubscribe functions for cleanup if needed
        window.sensorUnsubscribes = {
            temperature: unsubscribeTemp,
            ph: unsubscribePh,
            feeder: unsubscribeFeeder
        };
        
        console.log('Real-time sensor listeners set up successfully');
        
    } catch (error) {
        console.error('Error setting up real-time sensor updates:', error);
        // Fallback to polling if real-time fails
        console.log('Falling back to polling for sensor updates');
        setInterval(loadSensorData, 30000); // Poll every 30 seconds
    }
}

// Cleanup sensor listeners (call on logout)
function cleanupSensorListeners() {
    try {
        if (window.sensorUnsubscribes) {
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
function createScheduleItemHTML(schedule, executionStatus = 'PENDING') {
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
        <div class="schedule-item">
            <div class="schedule-time">
                <span class="time">${displayTime}</span>
            </div>
            <div class="schedule-details">
                <div class="schedule-title"><strong>${title}</strong></div>
                ${description ? `<div class="schedule-description"><i class="fas fa-info-circle"></i> ${description}</div>` : ''}
            </div>
            <div class="schedule-status">
                <span class="status ${statusClass}">${statusText}</span>
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
        const executionStatus = scheduleData.executionStatus || 'PENDING';
        const scheduleHTML = createScheduleItemHTML(schedule, executionStatus);
        container.insertAdjacentHTML('beforeend', scheduleHTML);
    });
}

// ============================================================
// FEEDING SCHEDULE STATUS COMPUTATION (EXECUTION-BASED)
// ============================================================

// Determine schedule execution status based on feedingLogs
// Execution-based status logic: COMPLETED only if feedingLog exists for today
// Expected feedingLogs structure: users/{uid}/feedingLogs/{logId}
//   - scheduleId: string (matches schedule document ID)
//   - executedAt: Timestamp (execution time)
//   - feedAmount?: number (optional)
//   - status?: 'completed' (optional, defaults to completed if exists)
async function determineScheduleStatus(uid, scheduleId, scheduleTime) {
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
        
        // Compute today's scheduled DateTime (local time)
        const scheduledDateTime = new Date(today);
        scheduledDateTime.setHours(hours, minutes, 0, 0);
        
        // Check if feedingLogs collection exists and has execution record for today
        // TODO: If feedingLogs collection doesn't exist yet, all schedules will show as PENDING
        // This is intentional - schedules should only show COMPLETED when execution is recorded
        try {
            const feedingLogsRef = collection(db, `users/${uid}/feedingLogs`);
            const feedingLogsSnapshot = await getDocs(feedingLogsRef);
            
            let hasExecutionToday = false;
            feedingLogsSnapshot.forEach(logDoc => {
                const log = logDoc.data();
                // Check if this log is for this schedule and executed today (local time)
                if (log.scheduleId === scheduleId && log.executedAt) {
                    const executedAt = timestampToDate(log.executedAt);
                    if (executedAt && executedAt >= today && executedAt <= todayEnd) {
                        // Check if status is completed (if status field exists)
                        // If no status field, assume completed if executedAt exists
                        if (!log.status || log.status === 'completed') {
                            hasExecutionToday = true;
                        }
                    }
                }
            });
            
            // Status determination logic (authoritative)
            if (hasExecutionToday) {
                // COMPLETED: Execution log exists for today
                return 'COMPLETED';
            } else if (now >= scheduledDateTime) {
                // Check if within execution window (30 minutes after scheduled time)
                const executionWindowEnd = new Date(scheduledDateTime.getTime() + 30 * 60 * 1000);
                if (now <= executionWindowEnd) {
                    // RUNNING: Scheduled time has passed but no execution log yet, within window
                    return 'RUNNING';
                } else {
                    // Past execution window but no log - treat as PENDING (NOT completed)
                    // This prevents false COMPLETED status
                    return 'PENDING';
                }
            } else {
                // PENDING: Scheduled time has not been reached yet
                return 'PENDING';
            }
        } catch (logsError) {
            // If feedingLogs collection doesn't exist or can't be read, default to PENDING
            // This ensures we never show false COMPLETED status
            console.warn('Could not check feedingLogs, defaulting to PENDING (no false completion):', logsError);
            
            // Still check time-based status for RUNNING (but never COMPLETED without log)
            if (now >= scheduledDateTime) {
                const executionWindowEnd = new Date(scheduledDateTime.getTime() + 30 * 60 * 1000);
                if (now <= executionWindowEnd) {
                    return 'RUNNING';
                }
            }
            // Always return PENDING if no execution log exists
            return 'PENDING';
        }
    } catch (error) {
        console.error('Error determining schedule status:', error);
        return 'PENDING'; // Default to PENDING on error (never false COMPLETED)
    }
}

// Load feeding schedules from Firestore with execution-based status
async function loadFeedingSchedules() {
    try {
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
                    schedule.data.time
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

// Set up feeding schedule auto-refresh (on section open, page focus, and periodic updates)
function setupFeedingScheduleAutoRefresh() {
    try {
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
    const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
    const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
    const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
    const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
    const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
    const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
    const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
    const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
        
        // 2. Aggregate feed used in this hour from schedules
        let feedUsedKg = 0;
        const schedulesRef = collection(db, `users/${uid}/feedingSchedules`);
        const schedulesSnapshot = await getDocs(schedulesRef);
        
        schedulesSnapshot.forEach(doc => {
            const schedule = doc.data();
            if (schedule.scheduledTime && schedule.feedAmount) {
                const scheduledTime = schedule.scheduledTime.seconds 
                    ? new Date(schedule.scheduledTime.seconds * 1000)
                    : new Date(schedule.scheduledTime);
                
                if (scheduledTime >= hourStart && scheduledTime <= hourEnd) {
                    // Include if completed or if status doesn't exist
                    if (!schedule.status || schedule.status === 'completed') {
                        feedUsedKg += parseFloat(schedule.feedAmount) || 0;
                    }
                }
            }
        });
        
        // Only write if we have at least one data point
        if (temperatureAvg === null && phAvg === null && feedUsedKg === 0) {
            console.log(`[HOURLY] No data for ${date} hour ${hour}, skipping write`);
            return null;
        }
        
        // Write to Firestore (idempotent)
        const hourString = String(hour).padStart(2, '0');
        const recordRef = doc(db, `users/${uid}/hourlyRecords/${date}/${hourString}`);
        const hourlyRecord = {
            hour: hourString,
            temperatureAvg: temperatureAvg,
            phAvg: phAvg,
            feedUsedKg: feedUsedKg > 0 ? feedUsedKg : null,
            recordedAt: serverTimestamp(),
            source: "web"
        };
        
        await setDoc(recordRef, hourlyRecord, { merge: true });
        console.log(`[HOURLY WRITE] Written hourly record ${date}/${hourString} to Firestore`);
        
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
        let totalFeedKg = 0;
        let hasFeedData = false;
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
            
            // Aggregate feed (if present in hourly records)
            if (record.feedUsedKg !== null && record.feedUsedKg !== undefined && record.feedUsedKg > 0) {
                totalFeedKg += parseFloat(record.feedUsedKg) || 0;
                hasFeedData = true;
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
            totalFeedKg: hasFeedData ? totalFeedKg : null,
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
        let totalFeedKg = null;
        const temperatures = [];
        const phValues = [];
        let coverageDays = dailyReports.length;
        
        // Only write if coverageDays > 0, else keep seed
        if (coverageDays === 0) {
            console.log(`[WEEKLY] coverageDays=0 for week ${isoWeekString}, keeping seed`);
            return null;
        }
        
        dailyReports.forEach(report => {
            // Aggregate feed (daily reports now use totalFeedKg)
            if (report.totalFeedKg !== null && report.totalFeedKg !== undefined) {
                if (totalFeedKg === null) totalFeedKg = 0;
                totalFeedKg += parseFloat(report.totalFeedKg) || 0;
            } else if (report.feedUsedKg !== null && report.feedUsedKg !== undefined) {
                // Backward compatibility with old field name
                if (totalFeedKg === null) totalFeedKg = 0;
                totalFeedKg += parseFloat(report.feedUsedKg) || 0;
            }
            
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
            totalFeedKg: totalFeedKg,
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
        let totalFeedKg = null;
        const temperatures = [];
        const phValues = [];
        let coverageDays = dailyReports.length;
        
        // Only write if coverageDays > 0, else keep seed
        if (coverageDays === 0) {
            console.log(`[MONTHLY] coverageDays=0 for month ${monthString}, keeping seed`);
            return null;
        }
        
        dailyReports.forEach(report => {
            // Aggregate feed (daily reports now use totalFeedKg)
            if (report.totalFeedKg !== null && report.totalFeedKg !== undefined) {
                if (totalFeedKg === null) totalFeedKg = 0;
                totalFeedKg += parseFloat(report.totalFeedKg) || 0;
            } else if (report.feedUsedKg !== null && report.feedUsedKg !== undefined) {
                // Backward compatibility with old field name
                if (totalFeedKg === null) totalFeedKg = 0;
                totalFeedKg += parseFloat(report.feedUsedKg) || 0;
            }
            
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
            totalFeedKg: totalFeedKg,
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
                    totalFeedKg: null,
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
                    totalFeedKg: null,
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
                    totalFeedKg: null,
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
        const analyticsRef = doc(db, "users", uid, "sensorAnalytics", "daily", date);
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
        const currentRef = doc(db, "users", uid, "sensorAnalytics", "daily", date);
        const currentSnap = await getDoc(currentRef);
        
        if (!currentSnap.exists()) {
            console.log(`[TREND] No daily sensor analytics for ${date}, skipping trend identification`);
            return null;
        }
        
        const current = currentSnap.data();
        
        // Get previous day (yesterday)
        const previousDate = getPreviousDate(date);
        const previousRef = doc(db, "users", uid, "sensorAnalytics", "daily", previousDate);
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
        const analyticsRef = doc(db, "users", uid, "sensorAnalytics", "weekly", isoWeekString);
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
        const currentRef = doc(db, "users", uid, "sensorAnalytics", "weekly", isoWeekString);
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
        
        const previousRef = doc(db, "users", uid, "sensorAnalytics", "weekly", previousWeek);
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
        const analyticsRef = doc(db, "users", uid, "sensorAnalytics", "monthly", monthString);
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
        const currentRef = doc(db, "users", uid, "sensorAnalytics", "monthly", monthString);
        const currentSnap = await getDoc(currentRef);
        
        if (!currentSnap.exists()) {
            console.log(`[TREND] No monthly sensor analytics for ${monthString}, skipping trend identification`);
            return null;
        }
        
        const current = currentSnap.data();
        
        // Get previous month
        const previousMonth = getPreviousMonth(monthString);
        const previousRef = doc(db, "users", uid, "sensorAnalytics", "monthly", previousMonth);
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
    try {
        const dayDate = new Date(dateString + 'T00:00:00');
        const dayStart = getStartOfDay(dayDate);
        const dayEnd = getEndOfDay(dayDate);
        
        // Convert to Firestore Timestamp range
        const dayStartTimestamp = Math.floor(dayStart.getTime() / 1000);
        const dayEndTimestamp = Math.floor(dayEnd.getTime() / 1000);
        
        // Fetch feeding schedules (completed ones only, or any with feedAmount if no status)
        const schedulesRef = collection(db, `users/${uid}/feedingSchedules`);
        const schedulesSnapshot = await getDocs(schedulesRef);
        
        let feedUsed = 0;
        schedulesSnapshot.forEach(doc => {
            const schedule = doc.data();
            // Include if: status is 'completed' OR (no status field and has feedAmount)
            const isCompleted = schedule.status === 'completed' || 
                               (!schedule.status && schedule.feedAmount);
            
            if (isCompleted && schedule.scheduledTime) {
                const scheduledTime = timestampToDate(schedule.scheduledTime);
                if (scheduledTime && isDateInDay(scheduledTime, dayDate)) {
                    feedUsed += schedule.feedAmount || 0;
                }
            }
        });
        
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
            feedUsed: feedUsed,
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
        let totalFeed = 0;
        let totalMortality = 0;
        const temperatures = [];
        const phValues = [];
        const scores = [];
        
        dailyReports.forEach(report => {
            totalFeed += report.feedUsed || 0;
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
            totalFeed: totalFeed,
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
        let totalFeed = 0;
        let totalMortality = 0;
        const temperatures = [];
        const phValues = [];
        const scores = [];
        
        dailyReports.forEach(report => {
            totalFeed += report.feedUsed || 0;
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
            totalFeed: totalFeed,
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
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
        if (!isBackfilling) {
            isBackfilling = true;
            backfillDailyReports(uid).then(() => {
                return backfillAggregateReports(uid);
            }).catch(error => {
                console.error('Error during initial backfill:', error);
            }).finally(() => {
                isBackfilling = false;
            });
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
                    loadMonthlySummaryReport()
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
                        console.log('Reports section became active, updating summaries...');
                        updateCurrentSummaries(uid).then(() => {
                            return Promise.all([
                                loadHourlyReport(),
                                loadDailySummaryReport(),
                                loadWeeklySummaryReport(),
                                loadMonthlySummaryReport()
                            ]);
                        }).catch(error => {
                            console.error('Error updating summaries:', error);
                        });
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
            console.log('Page regained focus, updating current summaries...');
            try {
                await updateCurrentSummaries(uid);
                lastUpdateTime = now;
                
                // Reload reports if Reports section is active
                const reportsSection = document.getElementById('reports');
                if (reportsSection && reportsSection.classList.contains('active')) {
                    await Promise.all([
                        loadHourlyReport(),
                        loadDailySummaryReport(),
                        loadWeeklySummaryReport(),
                        loadMonthlySummaryReport()
                    ]);
                }
            } catch (error) {
                console.error('Error updating summaries on page focus:', error);
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
                if (newDate && newDate !== selectedHourlyDate) {
                    selectedHourlyDate = newDate;
                    console.log('Hourly date filter changed to:', selectedHourlyDate);
                    await loadHourlyReport();
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
    try {
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
        if (!uid) return;
        
        const dailyReportsRef = collection(db, `users/${uid}/dailyReports`);
        const q = query(dailyReportsRef, orderBy('date', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const tableBody = document.getElementById('dailySummaryTableBody');
        if (!tableBody) return;
        
        // Filter by selected month (client-side filtering)
        const filteredReports = [];
        querySnapshot.forEach(doc => {
            const report = doc.data();
            // Filter: date.startsWith(selectedReportMonth)
            if (selectedReportMonth && report.date && report.date.startsWith(selectedReportMonth)) {
                filteredReports.push(report);
            } else if (!selectedReportMonth) {
                // If no month selected, show all (backward compatibility)
                filteredReports.push(report);
            }
        });
        
        // Limit to 31 days (max days in a month)
        const limitedReports = filteredReports.slice(0, 31);
        
        if (limitedReports.length === 0) {
            const message = selectedReportMonth 
                ? 'No daily summary data available for selected month' 
                : 'No daily summary data available';
            tableBody.innerHTML = `<tr><td colspan="5" class="no-data-text">${message}</td></tr>`;
            // Clear charts if no data
            clearDailyCharts();
            return;
        }
        
        // Load sensor analytics for trend data
        const analyticsPromises = limitedReports.map(async (report) => {
            try {
                const analyticsRef = doc(db, "users", uid, "sensorAnalytics", "daily", report.date);
                const analyticsSnap = await getDoc(analyticsRef);
                return analyticsSnap.exists() ? analyticsSnap.data() : null;
            } catch (error) {
                console.error(`Error loading sensor analytics for ${report.date}:`, error);
                return null;
            }
        });
        
        const analyticsData = await Promise.all(analyticsPromises);
        
        // Extract trend data from sensor analytics
        reportRowsState.dailyRows = limitedReports.map((report, index) => {
            const date = new Date(report.date + 'T00:00:00');
            const analytics = analyticsData[index];
            return {
                date: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
                feedUsed: report.totalFeedKg !== null && report.totalFeedKg !== undefined ? report.totalFeedKg : (report.feedUsedKg || null),
                avgTemperature: report.avgTemperature !== null && report.avgTemperature !== undefined ? report.avgTemperature : null,
                avgPh: report.avgPh !== null && report.avgPh !== undefined ? report.avgPh : null,
                waterQuality: report.waterQuality || null,
                coverageHours: report.coverageHours || null,
                isSeed: report.isSeed === true,
                trends: analytics ? {
                    tempTrend: analytics.tempTrend || null,
                    phTrend: analytics.phTrend || null,
                    bothSensorsTrend: analytics.bothSensorsTrend || null
                } : null
            };
        });
        
        tableBody.innerHTML = '';
        reportRowsState.dailyRows.forEach(row => {
            const tr = document.createElement('tr');
            // Check if this is a seed document with no real data
            const isSeedEmpty = row.isSeed && 
                (row.feedUsed === null || row.feedUsed === 0) && 
                (row.avgTemperature === null || row.avgTemperature === 0) && 
                (row.avgPh === null || row.avgPh === 0);
            
            tr.innerHTML = `
                <td>${row.date}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.feedUsed !== null && row.feedUsed !== 0 ? row.feedUsed.toFixed(1) + ' kg' : '--')}</td>
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
        } catch (error) {
        console.error('Error loading daily summary report:', error);
        const tableBody = document.getElementById('dailySummaryTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="8" class="no-data-text">Error loading daily summary</td></tr>';
        }
        clearDailyCharts();
    }
}

// Load Weekly Summary Report into table (with month filtering)
async function loadWeeklySummaryReport() {
    try {
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
        if (!uid) return;
        
        const weeklyReportsRef = collection(db, `users/${uid}/weeklyReports`);
        const q = query(weeklyReportsRef, orderBy('week', 'desc'), limit(12));
        const querySnapshot = await getDocs(q);
        
        const tableBody = document.getElementById('weeklySummaryTableBody');
        if (!tableBody) return;
        
        // Filter weekly reports by selected month if applicable
        const filteredReports = [];
        querySnapshot.forEach(doc => {
            const report = doc.data();
            if (!selectedReportMonth) {
                filteredReports.push(report);
            } else {
                // Parse ISO week string (YYYY-WW) to check if it overlaps with selected month
                const weekStr = report.week || doc.id;
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
                const analyticsRef = doc(db, "users", uid, "sensorAnalytics", "weekly", weekStr);
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
                totalFeed: report.totalFeedKg !== null && report.totalFeedKg !== undefined ? report.totalFeedKg : (report.totalFeed || null),
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
                (row.totalFeed === null || row.totalFeed === 0) && 
                (row.avgTemperature === null || row.avgTemperature === 0) && 
                (row.avgPh === null || row.avgPh === 0) &&
                (row.coverageDays === 0);
            
            tr.innerHTML = `
                <td>${row.period}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.totalFeed !== null && row.totalFeed !== 0 ? row.totalFeed.toFixed(1) + ' kg' : '--')}</td>
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
    } catch (error) {
        console.error('Error loading weekly summary report:', error);
        const tableBody = document.getElementById('weeklySummaryTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="8" class="no-data-text">Error loading weekly summary</td></tr>';
        }
        clearWeeklyCharts();
    }
}

// Load Monthly Summary Report into table (with month filtering)
async function loadMonthlySummaryReport() {
    try {
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
        if (!uid) return;
        
        const tableBody = document.getElementById('monthlySummaryTableBody');
        if (!tableBody) return;
        
        // Load monthly reports (use month field, not monthStart)
        const monthlyReportsRef = collection(db, `users/${uid}/monthlyReports`);
        // Don't limit when filtering by year - load all months for that year
        const q = selectedReportYear 
            ? query(monthlyReportsRef, orderBy('month', 'desc')) 
            : query(monthlyReportsRef, orderBy('month', 'desc'), limit(12));
        const querySnapshot = await getDocs(q);
        
        // Filter by selected year if applicable
        const filteredReports = [];
        querySnapshot.forEach(doc => {
            const report = doc.data();
            if (report.month) {
                const reportYear = report.month.split('-')[0]; // Extract year from "YYYY-MM"
                if (!selectedReportYear || reportYear === selectedReportYear) {
                filteredReports.push(report);
                }
            }
        });
        
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
                const analyticsRef = doc(db, "users", uid, "sensorAnalytics", "monthly", monthStr);
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
                totalFeed: report.totalFeedKg !== null && report.totalFeedKg !== undefined ? report.totalFeedKg : (report.totalFeed || null),
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
                (r.totalFeed === null || r.totalFeed === 0) && 
                (r.avgTemperature === null || r.avgTemperature === 0) && 
                (r.avgPh === null || r.avgPh === 0) &&
                (r.coverageDays === 0);
            
            row.innerHTML = `
                <td>${r.month}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (r.totalFeed !== null && r.totalFeed !== 0 ? r.totalFeed.toFixed(1) + ' kg' : '--')}</td>
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
    } catch (error) {
        console.error('Error loading monthly summary report:', error);
        const tableBody = document.getElementById('monthlySummaryTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="8" class="no-data-text">Error loading monthly summary</td></tr>';
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
    chartInstances.daily = { temperature: null, ph: null, feed: null };
}

// Clear weekly charts
function clearWeeklyCharts() {
    Object.values(chartInstances.weekly).forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances.weekly = { temperature: null, ph: null, feed: null };
}

// Clear monthly charts
function clearMonthlyCharts() {
    Object.values(chartInstances.monthly).forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances.monthly = { temperature: null, ph: null, feed: null };
}

// Clear hourly charts
function clearHourlyCharts() {
    Object.values(chartInstances.hourly).forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances.hourly = { temperature: null, ph: null, feed: null };
}

// Load Hourly Report into table
async function loadHourlyReport() {
    try {
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
        if (!uid) return;
        
        // Use selected date, default to today if not set
        const dateStr = selectedHourlyDate || formatDateString(new Date());
        
        // Read hourly records for selected date
        const hoursRef = collection(db, `users/${uid}/hourlyRecords/${dateStr}/hours`);
        const hoursSnapshot = await getDocs(query(hoursRef, orderBy('hour', 'asc')));
        
        const tableBody = document.getElementById('hourlySummaryTableBody');
        if (!tableBody) return;
        
        if (hoursSnapshot.empty) {
            const dateObj = new Date(dateStr + 'T00:00:00');
            const dateDisplay = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            tableBody.innerHTML = `<tr><td colspan="4" class="no-data-text">No hourly data available for ${dateDisplay}</td></tr>`;
            clearHourlyCharts();
            return;
        }
        
        const hourlyReports = [];
        hoursSnapshot.forEach(doc => {
            hourlyReports.push(doc.data());
        });
        
        // Store rows in memory for export
        reportRowsState.hourlyRows = hourlyReports.map(report => {
            return {
                hour: report.hour || '00',
                temperature: report.temperatureAvg !== null && report.temperatureAvg !== undefined ? report.temperatureAvg : null,
                ph: report.phAvg !== null && report.phAvg !== undefined ? report.phAvg : null,
                feed: report.feedUsedKg !== null && report.feedUsedKg !== undefined ? report.feedUsedKg : null,
                isSeed: report.isSeed === true
            };
        });
        
        tableBody.innerHTML = '';
        reportRowsState.hourlyRows.forEach(row => {
            const tr = document.createElement('tr');
            const isSeedEmpty = row.isSeed && 
                (row.temperature === null || row.temperature === 0) && 
                (row.ph === null || row.ph === 0) && 
                (row.feed === null || row.feed === 0);
            
            tr.innerHTML = `
                <td>${row.hour}:00</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.temperature !== null && row.temperature !== 0 ? row.temperature.toFixed(1) + '°C' : '--')}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.ph !== null && row.ph !== 0 ? row.ph.toFixed(2) : '--')}</td>
                <td>${isSeedEmpty ? '<span class="no-data-text">No data yet</span>' : (row.feed !== null && row.feed !== 0 ? row.feed.toFixed(1) + ' kg' : '--')}</td>
            `;
            tableBody.appendChild(tr);
        });
        
        // Render charts after table is populated
        renderHourlyCharts(hourlyReports);
        
    } catch (error) {
        console.error('Error loading hourly report:', error);
        const tableBody = document.getElementById('hourlySummaryTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="5" class="no-data-text">Error loading hourly data</td></tr>';
        }
        clearHourlyCharts();
    }
}

// Load Mortality Log Report into table
async function loadMortalityLogReport() {
    try {
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
        const analyticsRef = doc(db, "users", uid, "sensorAnalytics", "daily", date);
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
        const analyticsRef = doc(db, "users", uid, "sensorAnalytics", "monthly", monthString);
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
        feedUsed: row.feedUsed !== null ? row.feedUsed : null,
        mortality: row.mortality !== null ? row.mortality : null,
        avgTemperature: row.avgTemperature !== null ? row.avgTemperature : null,
        avgPh: row.avgPh !== null ? row.avgPh : null,
        waterQuality: row.waterQuality || null
    }));
}

function getWeeklyRowsForExport() {
    return reportRowsState.weeklyRows.map(row => ({
        period: row.period,
        totalFeed: row.totalFeed !== null ? row.totalFeed : null,
        mortality: row.mortality !== null ? row.mortality : null,
        avgPh: row.avgPh !== null ? row.avgPh : null,
        avgTemperature: row.avgTemperature !== null ? row.avgTemperature : null,
        waterQualityScore: row.waterQualityScore !== null ? row.waterQualityScore : null
    }));
}

function getMonthlyRowsForExport() {
    return reportRowsState.monthlyRows.map(row => ({
        month: row.month,
        totalFeed: row.totalFeed !== null ? row.totalFeed : null,
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

// Admin Dashboard specific functions
export async function initializeAdminDashboard() {
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
        const adminId = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
            adminId: auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid')
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
            adminId: auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid')
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
                adminId: auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid')
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
                adminId: auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid')
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
            const userUid = sessionStorage.getItem('userUid');
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
    const realReports = reports.filter(r => !r.isSeed || (r.avgTemperature !== 0 || r.avgPh !== 0 || (r.totalFeedKg && r.totalFeedKg !== 0)));
    
    if (realReports.length === 0) {
        destroyChart(chartInstances.daily.temperature);
        destroyChart(chartInstances.daily.ph);
        destroyChart(chartInstances.daily.feed);
        chartInstances.daily.temperature = null;
        chartInstances.daily.ph = null;
        chartInstances.daily.feed = null;
        
        showChartEmptyState('dailyTemperatureChart', 'No data yet');
        showChartEmptyState('dailyPhChart', 'No data yet');
        showChartEmptyState('dailyFeedChart', 'No data yet');
        return;
    }
    
    // Remove empty state messages
    document.querySelectorAll('.chart-empty-state').forEach(el => {
        if (el.parentElement.querySelector('#dailyTemperatureChart, #dailyPhChart, #dailyFeedChart')) {
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
    const feeds = realReports.map(r => r.totalFeedKg || r.feedUsedKg || 0).reverse();
    
    // Destroy old charts
    destroyChart(chartInstances.daily.temperature);
    destroyChart(chartInstances.daily.ph);
    destroyChart(chartInstances.daily.feed);
    
    // Create new charts
    const tempCtx = document.getElementById('dailyTemperatureChart');
    const phCtx = document.getElementById('dailyPhChart');
    const feedCtx = document.getElementById('dailyFeedChart');
    
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
    
    if (feedCtx && typeof Chart !== 'undefined') {
        chartInstances.daily.feed = new Chart(feedCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Feed Used (kg)',
                    data: feeds,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)'
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
}

// Render weekly charts
function renderWeeklyCharts(reports) {
    const realReports = reports.filter(r => !r.isSeed || (r.avgTemperature !== 0 || r.avgPh !== 0 || (r.totalFeedKg && r.totalFeedKg !== 0)));
    
    if (realReports.length === 0) {
        destroyChart(chartInstances.weekly.temperature);
        destroyChart(chartInstances.weekly.ph);
        destroyChart(chartInstances.weekly.feed);
        chartInstances.weekly.temperature = null;
        chartInstances.weekly.ph = null;
        chartInstances.weekly.feed = null;
        
        showChartEmptyState('weeklyTemperatureChart', 'No data yet');
        showChartEmptyState('weeklyPhChart', 'No data yet');
        showChartEmptyState('weeklyFeedChart', 'No data yet');
        return;
    }
    
    document.querySelectorAll('.chart-empty-state').forEach(el => {
        if (el.parentElement.querySelector('#weeklyTemperatureChart, #weeklyPhChart, #weeklyFeedChart')) {
            el.remove();
        }
    });
    
    const labels = realReports.map(r => r.week || 'Week').reverse();
    const temps = realReports.map(r => r.avgTemperature || 0).reverse();
    const phs = realReports.map(r => r.avgPh || 0).reverse();
    const feeds = realReports.map(r => r.totalFeedKg || 0).reverse();
    
    destroyChart(chartInstances.weekly.temperature);
    destroyChart(chartInstances.weekly.ph);
    destroyChart(chartInstances.weekly.feed);
    
    const tempCtx = document.getElementById('weeklyTemperatureChart');
    const phCtx = document.getElementById('weeklyPhChart');
    const feedCtx = document.getElementById('weeklyFeedChart');
    
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
    
    if (feedCtx && typeof Chart !== 'undefined') {
        chartInstances.weekly.feed = new Chart(feedCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Feed (kg)',
                    data: feeds,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)'
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
}

// Render monthly charts
function renderMonthlyCharts(reports) {
    const realReports = reports.filter(r => !r.isSeed || (r.avgTemperature !== 0 || r.avgPh !== 0 || (r.totalFeedKg && r.totalFeedKg !== 0)));
    
    if (realReports.length === 0) {
        destroyChart(chartInstances.monthly.temperature);
        destroyChart(chartInstances.monthly.ph);
        destroyChart(chartInstances.monthly.feed);
        chartInstances.monthly.temperature = null;
        chartInstances.monthly.ph = null;
        chartInstances.monthly.feed = null;
        
        showChartEmptyState('monthlyTemperatureChart', 'No data yet');
        showChartEmptyState('monthlyPhChart', 'No data yet');
        showChartEmptyState('monthlyFeedChart', 'No data yet');
        return;
    }
    
    document.querySelectorAll('.chart-empty-state').forEach(el => {
        if (el.parentElement.querySelector('#monthlyTemperatureChart, #monthlyPhChart, #monthlyFeedChart')) {
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
    const feeds = realReports.map(r => r.totalFeedKg || 0).reverse();
    
    destroyChart(chartInstances.monthly.temperature);
    destroyChart(chartInstances.monthly.ph);
    destroyChart(chartInstances.monthly.feed);
    
    const tempCtx = document.getElementById('monthlyTemperatureChart');
    const phCtx = document.getElementById('monthlyPhChart');
    const feedCtx = document.getElementById('monthlyFeedChart');
    
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
    
    if (feedCtx && typeof Chart !== 'undefined') {
        chartInstances.monthly.feed = new Chart(feedCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Feed (kg)',
                    data: feeds,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)'
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
}

// Render hourly charts
function renderHourlyCharts(reports) {
    const realReports = reports.filter(r => !r.isSeed || (r.temperatureAvg !== 0 || r.phAvg !== 0 || (r.feedUsedKg && r.feedUsedKg !== 0)));
    
    if (realReports.length === 0) {
        destroyChart(chartInstances.hourly.temperature);
        destroyChart(chartInstances.hourly.ph);
        destroyChart(chartInstances.hourly.feed);
        chartInstances.hourly.temperature = null;
        chartInstances.hourly.ph = null;
        chartInstances.hourly.feed = null;
        
        showChartEmptyState('hourlyTemperatureChart', 'No data yet');
        showChartEmptyState('hourlyPhChart', 'No data yet');
        showChartEmptyState('hourlyFeedChart', 'No data yet');
        return;
    }
    
    document.querySelectorAll('.chart-empty-state').forEach(el => {
        if (el.parentElement.querySelector('#hourlyTemperatureChart, #hourlyPhChart, #hourlyFeedChart')) {
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
    const feeds = sorted.map(r => r.feedUsedKg || 0);
    
    destroyChart(chartInstances.hourly.temperature);
    destroyChart(chartInstances.hourly.ph);
    destroyChart(chartInstances.hourly.feed);
    
    const tempCtx = document.getElementById('hourlyTemperatureChart');
    const phCtx = document.getElementById('hourlyPhChart');
    const feedCtx = document.getElementById('hourlyFeedChart');
    
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
    
    if (feedCtx && typeof Chart !== 'undefined') {
        chartInstances.hourly.feed = new Chart(feedCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Feed Used (kg)',
                    data: feeds,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)'
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
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
        const uid = auth.currentUser ? auth.currentUser.uid : sessionStorage.getItem('userUid');
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
async function renderWaterQualityChart() {
    const metricSelect = document.getElementById('chartMetric');
    const rangeSelect = document.getElementById('chartRange');
    const monthSelector = document.getElementById('chartPeriodSelector');
    const yearSelector = document.getElementById('chartYearSelector');
    const canvas = document.getElementById('waterQualityChart');

    if (!metricSelect || !rangeSelect || !canvas) return;

    const metric = metricSelect.value;
    const range = rangeSelect.value;
    const period = (range === 'daily' || range === 'weekly') 
        ? (monthSelector ? monthSelector.value : null)
        : (yearSelector ? yearSelector.value : null);

    let reports = [];

    if (range === 'daily') reports = await loadDailyReports();
    if (range === 'weekly') reports = await loadWeeklyReports();
    if (range === 'monthly') reports = await loadMonthlyReports();

    reports = reports.filter(r => !r.isSeed);

    // Apply period filtering
    if (period) {
        if (range === 'daily' || range === 'weekly') {
            // Filter by month (YYYY-MM format)
            reports = reports.filter(r => {
                if (range === 'daily') {
                    return r.date && r.date.startsWith(period);
                } else {
                    // For weekly, check if week overlaps with selected month
                    const weekStr = r.week || '';
                    const match = weekStr.match(/(\d{4})-W(\d{2})/);
                    if (match) {
                        const year = parseInt(match[1]);
                        const week = parseInt(match[2]);
                        const monday = isoWeekToMonday(year, week);
                        const sunday = new Date(monday);
                        sunday.setDate(monday.getDate() + 6);
                        
                        const [selectedYear, selectedMonth] = period.split('-').map(Number);
                        const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
                        const monthEnd = getEndOfMonth(monthStart);
                        
                        const weekOverlaps = (monday >= monthStart && monday <= monthEnd) ||
                                           (sunday >= monthStart && sunday <= monthEnd) ||
                                           (monday <= monthStart && sunday >= monthEnd);
                        return weekOverlaps;
                    }
                    return false;
                }
            });
        } else if (range === 'monthly') {
            // Filter by year
            reports = reports.filter(r => {
                if (r.month) {
                    const reportYear = r.month.split('-')[0];
                    return reportYear === period;
                }
                return false;
            });
        }
    }

    if (!reports.length) {
        destroyWaterQualityChart();
        document.getElementById('chartEmptyState')?.classList.remove('hidden');
        return;
    }

    document.getElementById('chartEmptyState')?.classList.add('hidden');

    // Format labels based on range
    const labels = reports.map(r => {
        if (range === 'daily') {
            if (!r.date) return '';
            const date = new Date(r.date + 'T00:00:00');
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else if (range === 'weekly') {
            return r.week || '';
        } else {
            if (!r.month) return '';
            const [year, month] = r.month.split('-');
            const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
            return monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
    }).reverse(); // Show oldest first

    const values = reports.map(r =>
        metric === 'temperature' ? r.avgTemperature : r.avgPh
    ).reverse(); // Match labels order

    destroyWaterQualityChart();

    waterQualityChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: metric === 'temperature'
                    ? 'Average Temperature (°C)'
                    : 'Average pH',
                data: values,
                borderColor: '#4a90e2',
                backgroundColor: 'rgba(74,144,226,0.15)',
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
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
    const metricSelect = document.getElementById('chartMetric');
    const rangeSelect = document.getElementById('chartRange');
    const periodSelect = document.getElementById('chartPeriodSelector');
    
    if (!metricSelect || !rangeSelect) return;
    
    // Initialize period selector based on default range
    updateChartPeriodSelector();
    
    // Event listeners
    metricSelect.addEventListener('change', renderWaterQualityChart);
    
    rangeSelect.addEventListener('change', () => {
        updateChartPeriodSelector();
        renderWaterQualityChart();
    });
    
    const monthSelector = document.getElementById('chartPeriodSelector');
    const yearSelector = document.getElementById('chartYearSelector');
    
    if (monthSelector) {
        monthSelector.addEventListener('change', renderWaterQualityChart);
    }
    if (yearSelector) {
        yearSelector.addEventListener('change', renderWaterQualityChart);
    }
    
    renderWaterQualityChart();
}

