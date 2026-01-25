/**
 * Monthly Report Generation Cron Job
 * 
 * Generates monthly reports from daily reports.
 * Runs once per month (recommended: 1st day of month at 2 AM).
 * 
 * Usage (cron):
 * 0 2 1 * * node /path/to/api/cron/generate-monthly.js secret=your-secret-key
 * 
 * Or as Express endpoint:
 * GET /api/cron/generate-monthly?secret=your-secret-key&month=2024-01
 */

const FirebaseConfig = require('../_config/firebase');
const { verifyCronSecret } = require('../_middleware/verifyToken');

/**
 * Generate monthly report for a user
 */
async function generateMonthlyReportForUser(db, uid, month) {
    // Validate month format
    const monthRegex = /^(\d{4})-(\d{2})$/;
    const match = month.match(monthRegex);
    if (!match) {
        throw new Error(`Invalid month format: ${month}. Expected YYYY-MM`);
    }
    
    const year = parseInt(match[1]);
    const monthNum = parseInt(match[2]);
    
    // Get all dates in the month
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0); // Last day of month
    
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
        
        // Check if date is in the target month
        if (report.date) {
            const reportDate = new Date(report.date + 'T00:00:00');
            if (reportDate >= monthStart && reportDate <= monthEnd) {
                dailyReports.push(report);
            }
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
        .collection('monthlyReports').doc(month);
    
    const monthlyReport = {
        month: month,
        avgTemperature: avgTemperature,
        avgPh: avgPh,
        totalFeedKg: totalFeedKg,
        coverageDays: coverageDays,
        isSeed: false,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'js-cron'
    };
    
    await reportRef.set(monthlyReport, { merge: true });
    
    return monthlyReport;
}

/**
 * Main function to generate monthly reports
 */
async function generateMonthlyReports(req, res) {
    // Verify cron secret
    const secret = req.query?.secret || req.headers?.['x-cron-secret'] || null;
    if (!verifyCronSecret(secret)) {
        return res.status(401).json({
            success: false,
            error: 'Invalid cron secret'
        });
    }
    
    // Get month parameter (default: last month)
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const targetMonth = req.query?.month || 
        `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    
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
                const result = await generateMonthlyReportForUser(db, uid, targetMonth);
                
                if (result === null) {
                    skipped++;
                } else {
                    processed++;
                }
                
            } catch (error) {
                console.error(`[CRON] Error generating monthly report for user ${uid}:`, error.message);
                errors++;
            }
        }
        
        res.status(200).json({
            success: true,
            month: targetMonth,
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
    const month = args.find(arg => arg.startsWith('month='))?.split('=')[1];
    
    const mockReq = {
        query: { secret, month },
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
    
    generateMonthlyReports(mockReq, mockRes).catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
}

module.exports = { generateMonthlyReports, generateMonthlyReportForUser };
