/**
 * Hourly Sampling Cron Job
 * 
 * Samples current hour sensor data and updates hourly records.
 * Runs every 5 minutes via cron.
 * 
 * Usage (cron):
 * */5 * * * * node /path/to/api/cron/sample-hourly.js secret=your-secret-key
 * 
 * Or as Express endpoint:
 * GET /api/cron/sample-hourly?secret=your-secret-key
 */

const FirebaseConfig = require('../_config/firebase');
const { verifyCronSecret } = require('../_middleware/verifyToken');
const admin = require('firebase-admin');

/**
 * Main function to sample hourly data
 */
async function sampleHourlyData(req, res) {
    // Verify cron secret
    const secret = req.query?.secret || req.headers?.['x-cron-secret'] || null;
    if (!verifyCronSecret(secret)) {
        return res.status(401).json({
            success: false,
            error: 'Invalid cron secret'
        });
    }
    
    try {
        const db = FirebaseConfig.getFirestore();
        
        // Get all active users
        const usersQuery = db.collection('users').where('isActive', '==', true);
        const usersSnapshot = await usersQuery.get();
        
        let processed = 0;
        let errors = 0;
        
        for (const userDoc of usersSnapshot.docs) {
            if (!userDoc.exists) {
                continue;
            }
            
            const uid = userDoc.id;
            
            try {
                // Get current date and hour
                const now = new Date();
                const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
                const hourStr = String(now.getUTCHours()).padStart(2, '0'); // HH
                
                // Read latest sensor values
                const tempRef = db.collection('users').doc(uid)
                    .collection('sensors').doc('temperature');
                const phRef = db.collection('users').doc(uid)
                    .collection('sensors').doc('ph');
                
                const tempDoc = await tempRef.get();
                const phDoc = await phRef.get();
                
                let temperature = null;
                let ph = null;
                
                if (tempDoc.exists) {
                    const tempData = tempDoc.data();
                    if (tempData.value !== null && tempData.value !== undefined) {
                        temperature = parseFloat(tempData.value);
                    }
                }
                
                if (phDoc.exists) {
                    const phData = phDoc.data();
                    if (phData.value !== null && phData.value !== undefined) {
                        ph = parseFloat(phData.value);
                    }
                }
                
                // Skip if both values are missing
                if (temperature === null && ph === null) {
                    continue;
                }
                
                // Update hourly record using transaction
                const hourRef = db.collection('users').doc(uid)
                    .collection('hourlyRecords').doc(dateStr)
                    .collection('hours').doc(hourStr);
                
                await db.runTransaction(async (transaction) => {
                    const hourSnap = await transaction.get(hourRef);
                    
                    if (!hourSnap.exists) {
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
                            source: 'js-cron',
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                });
                
                processed++;
                
            } catch (error) {
                console.error(`[CRON] Error sampling for user ${uid}:`, error.message);
                errors++;
            }
        }
        
        res.status(200).json({
            success: true,
            processed: processed,
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
    
    const mockReq = {
        query: { secret },
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
    
    sampleHourlyData(mockReq, mockRes).catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
}

module.exports = { sampleHourlyData };
