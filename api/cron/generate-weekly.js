/**
 * Weekly Report Generation Cron Job
 * 
 * Generates weekly reports from daily reports.
 * Runs once per week (recommended: Monday morning).
 * 
 * Usage (cron):
 * 0 2 * * 1 node /path/to/api/cron/generate-weekly.js secret=your-secret-key
 * 
 * Or as Express endpoint:
 * GET /api/cron/generate-weekly?secret=your-secret-key&week=2024-W01
 */

const FirebaseConfig = require('../_config/firebase');
const { verifyCronSecret } = require('../_middleware/verifyToken');

/**
 * Get dates in ISO week
 */
function getDatesInIsoWeek(isoWeekString) {
    const match = isoWeekString.match(/(\d{4})-W(\d{2})/);
    if (!match) {
        throw new Error(`Invalid ISO week format: ${isoWeekString}`);
    }
    
    const year = parseInt(match[1]);
    const week = parseInt(match[2]);
    
    // Calculate Monday of the week
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay(); // 0=Sunday, 1=Monday, etc.
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const jan4Monday = new Date(jan4);
    jan4Monday.setDate(jan4.getDate() - daysToMonday);
    
    const weekMonday = new Date(jan4Monday);
    weekMonday.setDate(weekMonday.getDate() + ((week - 1) * 7));
    
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(weekMonday);
        date.setDate(date.getDate() + i);
        dates.push(date);
    }
    
    return dates;
}

/**
 * Get last week in ISO format
 */
function getLastWeekISO() {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    // Find Monday of last week
    const dayOfWeek = lastWeek.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(lastWeek);
    monday.setDate(monday.getDate() - daysToMonday);
    
    const year = monday.getFullYear();
    const jan4 = new Date(year, 0, 4);
    const jan4DayOfWeek = jan4.getDay();
    const jan4DaysToMonday = jan4DayOfWeek === 0 ? 6 : jan4DayOfWeek - 1;
    const jan4Monday = new Date(jan4);
    jan4Monday.setDate(jan4.getDate() - jan4DaysToMonday);
    
    const daysDiff = Math.floor((monday - jan4Monday) / (1000 * 60 * 60 * 24));
    const week = Math.floor(daysDiff / 7) + 1;
    
    return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}`;
}

/**
 * Generate weekly report for a user
 */
async function generateWeeklyReportForUser(db, uid, isoWeekString) {
    // Validate ISO week format
    if (!/^(\d{4})-W(\d{2})$/.test(isoWeekString)) {
        throw new Error(`Invalid ISO week format: ${isoWeekString}. Expected YYYY-WW`);
    }
    
    // Get all 7 dates in the ISO week
    const weekDates = getDatesInIsoWeek(isoWeekString);
    const dateStrings = weekDates.map(date => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
    
    // Read all daily reports
    const dailyReportsRef = db.collection('users').doc(uid)
        .collection('dailyReports');
    
    const dailyReportsSnapshot = await dailyReportsRef.get();
    
    const dailyReports = [];
    dailyReportsSnapshot.forEach(doc => {
        if (!doc.exists) {
            return;
        }
        
        const report = doc.data();
        
        // Ignore seed documents
        if (report.isSeed === true) {
            return;
        }
        
        if (report.date && dateStrings.includes(report.date)) {
            dailyReports.push(report);
        }
    });
    
    // Only write if coverageDays > 0
    const coverageDays = dailyReports.length;
    if (coverageDays === 0) {
        return null;
    }
    
    // Aggregate from daily reports
    let totalFeedKg = null;
    const temperatures = [];
    const phValues = [];
    
    dailyReports.forEach(report => {
        // Aggregate feed
        if (report.totalFeedKg !== null && report.totalFeedKg !== undefined) {
            if (totalFeedKg === null) {
                totalFeedKg = 0;
            }
            totalFeedKg += parseFloat(report.totalFeedKg);
        } else if (report.feedUsedKg !== null && report.feedUsedKg !== undefined) {
            // Backward compatibility
            if (totalFeedKg === null) {
                totalFeedKg = 0;
            }
            totalFeedKg += parseFloat(report.feedUsedKg);
        }
        
        // Collect temperature values
        if (report.avgTemperature !== null && report.avgTemperature !== undefined) {
            temperatures.push(parseFloat(report.avgTemperature));
        }
        
        // Collect pH values
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
    
    // Write to Firestore
    const admin = require('firebase-admin');
    const reportRef = db.collection('users').doc(uid)
        .collection('weeklyReports').doc(isoWeekString);
    
    const weeklyReport = {
        week: isoWeekString,
        avgTemperature: avgTemperature,
        avgPh: avgPh,
        totalFeedKg: totalFeedKg,
        coverageDays: coverageDays,
        isSeed: false,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'js-cron'
    };
    
    await reportRef.set(weeklyReport, { merge: true });
    
    return weeklyReport;
}

/**
 * Main function to generate weekly reports
 */
async function generateWeeklyReports(req, res) {
    // Verify cron secret
    const secret = req.query?.secret || req.headers?.['x-cron-secret'] || null;
    if (!verifyCronSecret(secret)) {
        return res.status(401).json({
            success: false,
            error: 'Invalid cron secret'
        });
    }
    
    // Get week parameter (default: last week)
    const targetWeek = req.query?.week || getLastWeekISO();
    
    try {
        const db = FirebaseConfig.getFirestore();
        
        // Get all active users
        const usersQuery = db.collection('users').where('isActive', '==', true);
        const usersSnapshot = await usersQuery.get();
        
        let processed = 0;
        let skipped = 0;
        let errors = 0;
        
        for (const userDoc of usersSnapshot.docs) {
            if (!userDoc.exists) {
                continue;
            }
            
            const uid = userDoc.id;
            
            try {
                const result = await generateWeeklyReportForUser(db, uid, targetWeek);
                
                if (result === null) {
                    skipped++;
                } else {
                    processed++;
                }
                
            } catch (error) {
                console.error(`[CRON] Error generating weekly report for user ${uid}:`, error.message);
                errors++;
            }
        }
        
        res.status(200).json({
            success: true,
            week: targetWeek,
            processed: processed,
            skipped: skipped,
            errors: errors,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// If running as standalone script
if (require.main === module) {
    const args = process.argv.slice(2);
    const secret = args.find(arg => arg.startsWith('secret='))?.split('=')[1] || process.env.CRON_SECRET;
    const week = args.find(arg => arg.startsWith('week='))?.split('=')[1];
    
    const mockReq = {
        query: { secret, week },
        headers: {}
    };
    
    const mockRes = {
        status: (code) => ({
            json: (data) => {
                console.log(JSON.stringify(data, null, 2));
                process.exit(code === 200 ? 0 : 1);
            }
        })
    };
    
    generateWeeklyReports(mockReq, mockRes).catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
}

module.exports = { generateWeeklyReports, generateWeeklyReportForUser };
