<?php
/**
 * Hourly Sampling Cron Job
 * 
 * Samples current hour sensor data and updates hourly records.
 * Runs every 5 minutes via cron.
 * 
 * Usage (cron):
 * */5 * * * * /usr/bin/php /path/to/api/cron/sample-hourly.php secret=your-secret-key
 */

require_once __DIR__ . '/../_config/firebase.php';
require_once __DIR__ . '/../_middleware/verifyToken.php';

// Verify cron secret
$secret = $_GET['secret'] ?? $_SERVER['HTTP_X_CRON_SECRET'] ?? null;
if (!verifyCronSecret($secret)) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Invalid cron secret'
    ]);
    exit;
}

try {
    $firestore = FirebaseConfig::getFirestore();
    $db = $firestore->database();
    
    // Get all active users
    $usersQuery = $db->collection('users')->where('isActive', '=', true);
    $usersSnapshot = $usersQuery->documents();
    
    $processed = 0;
    $errors = 0;
    
    foreach ($usersSnapshot as $userDoc) {
        if (!$userDoc->exists()) {
            continue;
        }
        
        $uid = $userDoc->id();
        
        try {
            // Get current date and hour
            $now = new DateTime('now', new DateTimeZone('UTC'));
            $dateStr = $now->format('Y-m-d');
            $hourStr = $now->format('H');
            
            // Read latest sensor values
            $tempRef = $db->collection('users')->document($uid)
                ->collection('sensors')->document('temperature');
            $phRef = $db->collection('users')->document($uid)
                ->collection('sensors')->document('ph');
            
            $tempDoc = $tempRef->snapshot();
            $phDoc = $phRef->snapshot();
            
            $temperature = null;
            $ph = null;
            
            if ($tempDoc->exists()) {
                $tempData = $tempDoc->data();
                if (isset($tempData['value']) && $tempData['value'] !== null) {
                    $temperature = (float)$tempData['value'];
                }
            }
            
            if ($phDoc->exists()) {
                $phData = $phDoc->data();
                if (isset($phData['value']) && $phData['value'] !== null) {
                    $ph = (float)$phData['value'];
                }
            }
            
            // Skip if both values are missing
            if ($temperature === null && $ph === null) {
                continue;
            }
            
            // Update hourly record using transaction
            $hourRef = $db->collection('users')->document($uid)
                ->collection('hourlyRecords')->document($dateStr)
                ->collection('hours')->document($hourStr);
            
            $db->runTransaction(function ($transaction) use ($hourRef, $hourStr, $temperature, $ph) {
                $hourSnap = $transaction->snapshot($hourRef);
                
                if (!$hourSnap->exists()) {
                    // Create new hour document
                    $newHour = [
                        'hour' => $hourStr,
                        'temperatureSum' => $temperature !== null ? $temperature : 0,
                        'temperatureCount' => $temperature !== null ? 1 : 0,
                        'temperatureAvg' => $temperature !== null ? $temperature : 0,
                        'phSum' => $ph !== null ? $ph : 0,
                        'phCount' => $ph !== null ? 1 : 0,
                        'phAvg' => $ph !== null ? $ph : 0,
                        'feedUsedKg' => 0,
                        'isSeed' => false,
                        'source' => 'php-cron',
                        'updatedAt' => new \Google\Cloud\Core\Timestamp(new DateTime())
                    ];
                    $transaction->set($hourRef, $newHour);
                } else {
                    // Update existing hour document
                    $hourData = $hourSnap->data();
                    $currentTempSum = $hourData['temperatureSum'] ?? 0;
                    $currentTempCount = $hourData['temperatureCount'] ?? 0;
                    $currentPhSum = $hourData['phSum'] ?? 0;
                    $currentPhCount = $hourData['phCount'] ?? 0;
                    
                    $newTempSum = $currentTempSum;
                    $newTempCount = $currentTempCount;
                    $newPhSum = $currentPhSum;
                    $newPhCount = $currentPhCount;
                    
                    if ($temperature !== null) {
                        $newTempSum = $currentTempSum + $temperature;
                        $newTempCount = $currentTempCount + 1;
                    }
                    
                    if ($ph !== null) {
                        $newPhSum = $currentPhSum + $ph;
                        $newPhCount = $currentPhCount + 1;
                    }
                    
                    $newTempAvg = $newTempCount > 0 ? $newTempSum / $newTempCount : 0;
                    $newPhAvg = $newPhCount > 0 ? $newPhSum / $newPhCount : 0;
                    
                    $transaction->update($hourRef, [
                        'temperatureSum' => $newTempSum,
                        'temperatureCount' => $newTempCount,
                        'temperatureAvg' => $newTempAvg,
                        'phSum' => $newPhSum,
                        'phCount' => $newPhCount,
                        'phAvg' => $newPhAvg,
                        'isSeed' => false,
                        'updatedAt' => new \Google\Cloud\Core\Timestamp(new DateTime())
                    ]);
                }
            });
            
            $processed++;
            
        } catch (Exception $e) {
            error_log("[CRON] Error sampling for user $uid: " . $e->getMessage());
            $errors++;
        }
    }
    
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'processed' => $processed,
        'errors' => $errors,
        'timestamp' => date('Y-m-d H:i:s')
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
