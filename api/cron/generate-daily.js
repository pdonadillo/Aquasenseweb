/**
 * Daily Report Generation Cron Job
 * 
 * Generates daily reports from hourly records.
 * Runs once per day (recommended: after midnight).
 * 
 * Usage (cron):
 * 0 1 * * * node /path/to/api/cron/generate-daily.js secret=your-secret-key
 * 
 * Or as Express endpoint:
 * GET /api/cron/generate-daily?secret=your-secret-key&date=2024-01-01
 */

const FirebaseConfig = require('../_config/firebase');
const { verifyCronSecret } = require('../_middleware/verifyToken');

/**
 * Generate daily report for a user
 */
async function generateDailyReportForUser(db, uid, date) {
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
    }
    
    // Read hourly records for this date
    const hoursRef = db.collection('users').doc(uid)
        .collection('hourlyRecords').doc(date)
        .collection('hours');
    
    const hoursSnapshot = await hoursRef.get();
    
    if (hoursSnapshot.empty) {
        return null; // No hourly records
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
        if (!hourDoc.exists) {
            return;
        }
        
        const record = hourDoc.data();
        
        // Skip seed documents
        if (record.isSeed === true) {
            return;
        }
        
        // Use weighted averages if counts exist
        if (record.temperatureAvg !== null && record.temperatureAvg !== undefined) {
            const tempAvg = parseFloat(record.temperatureAvg);
            const count = record.temperatureCount ? parseInt(record.temperatureCount) : 1;
            temperatureSum += tempAvg * count;
            temperatureCount += count;
        }
        
        if (record.phAvg !== null && record.phAvg !== undefined) {
            const phAvg = parseFloat(record.phAvg);
            const count = record.phCount ? parseInt(record.phCount) : 1;
            phSum += phAvg * count;
            phCount += count;
        }
        
        // Aggregate feed
        if (record.feedUsedKg !== null && record.feedUsedKg !== undefined && record.feedUsedKg > 0) {
            totalFeedKg += parseFloat(record.feedUsedKg);
            hasFeedData = true;
        }
        
        // Count hours with actual data
        if ((record.temperatureCount && record.temperatureCount > 0) ||
            (record.phCount && record.phCount > 0)) {
            coverageHours++;
        }
    });
    
    // If no real data, don't overwrite existing report
    if (coverageHours === 0) {
        return null;
    }
    
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
        totalFeedKg: hasFeedData ? totalFeedKg : null,
        coverageHours: coverageHours,
        isSeed: false,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'js-cron'
    };
    
    await reportRef.set(dailyReport, { merge: true });
    
    return dailyReport;
}

/**
 * Main function to generate daily reports
 */
async function generateDailyReports(req, res) {
    // Verify cron secret
    const secret = req.query?.secret || req.headers?.['x-cron-secret'] || null;
    if (!verifyCronSecret(secret)) {
        return res.status(401).json({
            success: false,
            error: 'Invalid cron secret'
        });
    }
    
    // Get date parameter (default: yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const targetDate = req.query?.date || yesterday.toISOString().split('T')[0];
    
    try {
        const db = FirebaseConfig.getFirestore();
        const admin = require('firebase-admin');
        
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
                const result = await generateDailyReportForUser(db, uid, targetDate);
                
                if (result === null) {
                    skipped++;
                } else {
                    processed++;
                }
                
            } catch (error) {
                console.error(`[CRON] Error generating daily report for user ${uid}:`, error.message);
                errors++;
            }
        }
        
        res.status(200).json({
            success: true,
            date: targetDate,
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
    const date = args.find(arg => arg.startsWith('date='))?.split('=')[1];
    
    const mockReq = {
        query: { secret, date },
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
    
    generateDailyReports(mockReq, mockRes).catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
}

module.exports = { generateDailyReports, generateDailyReportForUser };
