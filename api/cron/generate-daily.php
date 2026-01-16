<?php
/**
 * Daily Report Generation Cron Job
 * 
 * Generates daily reports from hourly records.
 * Runs once per day (recommended: after midnight).
 * 
 * Usage (cron):
 * 0 1 * * * /usr/bin/php /path/to/api/cron/generate-daily.php secret=your-secret-key
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

// Get date parameter (default: yesterday)
$targetDate = $_GET['date'] ?? date('Y-m-d', strtotime('-1 day'));

try {
    $firestore = FirebaseConfig::getFirestore();
    $db = $firestore->database();
    
    // Get all active users
    $usersQuery = $db->collection('users')->where('isActive', '=', true);
    $usersSnapshot = $usersQuery->documents();
    
    $processed = 0;
    $skipped = 0;
    $errors = 0;
    
    foreach ($usersSnapshot as $userDoc) {
        if (!$userDoc->exists()) {
            continue;
        }
        
        $uid = $userDoc->id();
        
        try {
            $result = generateDailyReportForUser($db, $uid, $targetDate);
            
            if ($result === null) {
                $skipped++;
            } else {
                $processed++;
            }
            
        } catch (Exception $e) {
            error_log("[CRON] Error generating daily report for user $uid: " . $e->getMessage());
            $errors++;
        }
    }
    
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'date' => $targetDate,
        'processed' => $processed,
        'skipped' => $skipped,
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

function generateDailyReportForUser($db, $uid, $date) {
    // Validate date format
    $dateObj = DateTime::createFromFormat('Y-m-d', $date);
    if (!$dateObj || $dateObj->format('Y-m-d') !== $date) {
        throw new Exception("Invalid date format: $date. Expected YYYY-MM-DD");
    }
    
    // Read hourly records for this date
    $hoursRef = $db->collection('users')->document($uid)
        ->collection('hourlyRecords')->document($date)
        ->collection('hours');
    
    $hoursSnapshot = $hoursRef->documents();
    
    if ($hoursSnapshot->isEmpty()) {
        return null; // No hourly records
    }
    
    // Aggregate from hourly records, ignoring seed documents
    $temperatureSum = 0;
    $temperatureCount = 0;
    $phSum = 0;
    $phCount = 0;
    $totalFeedKg = 0;
    $hasFeedData = false;
    $coverageHours = 0;
    
    foreach ($hoursSnapshot as $hourDoc) {
        if (!$hourDoc->exists()) {
            continue;
        }
        
        $record = $hourDoc->data();
        
        // Skip seed documents
        if (isset($record['isSeed']) && $record['isSeed'] === true) {
            continue;
        }
        
        // Use weighted averages if counts exist
        if (isset($record['temperatureAvg']) && $record['temperatureAvg'] !== null) {
            $tempAvg = (float)$record['temperatureAvg'];
            $count = isset($record['temperatureCount']) ? (int)$record['temperatureCount'] : 1;
            $temperatureSum += $tempAvg * $count;
            $temperatureCount += $count;
        }
        
        if (isset($record['phAvg']) && $record['phAvg'] !== null) {
            $phAvg = (float)$record['phAvg'];
            $count = isset($record['phCount']) ? (int)$record['phCount'] : 1;
            $phSum += $phAvg * $count;
            $phCount += $count;
        }
        
        // Aggregate feed
        if (isset($record['feedUsedKg']) && $record['feedUsedKg'] !== null && $record['feedUsedKg'] > 0) {
            $totalFeedKg += (float)$record['feedUsedKg'];
            $hasFeedData = true;
        }
        
        // Count hours with actual data
        if ((isset($record['temperatureCount']) && $record['temperatureCount'] > 0) ||
            (isset($record['phCount']) && $record['phCount'] > 0)) {
            $coverageHours++;
        }
    }
    
    // If no real data, don't overwrite existing report
    if ($coverageHours === 0) {
        return null;
    }
    
    // Calculate daily averages
    $avgTemperature = $temperatureCount > 0 ? $temperatureSum / $temperatureCount : null;
    $avgPh = $phCount > 0 ? $phSum / $phCount : null;
    
    // Write to Firestore
    $reportRef = $db->collection('users')->document($uid)
        ->collection('dailyReports')->document($date);
    
    $dailyReport = [
        'date' => $date,
        'avgTemperature' => $avgTemperature,
        'avgPh' => $avgPh,
        'totalFeedKg' => $hasFeedData ? $totalFeedKg : null,
        'coverageHours' => $coverageHours,
        'isSeed' => false,
        'generatedAt' => new \Google\Cloud\Core\Timestamp(new DateTime()),
        'source' => 'php-cron'
    ];
    
    $reportRef->set($dailyReport, ['merge' => true]);
    
    return $dailyReport;
}
