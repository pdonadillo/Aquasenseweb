<?php
/**
 * Monthly Report Generation Cron Job
 * 
 * Generates monthly reports from daily reports.
 * Runs once per month (recommended: 1st day of month at 2 AM).
 * 
 * Usage (cron):
 * 0 2 1 * * /usr/bin/php /path/to/api/cron/generate-monthly.php secret=your-secret-key
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

// Get month parameter (default: last month)
$targetMonth = $_GET['month'] ?? date('Y-m', strtotime('first day of last month'));

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
            $result = generateMonthlyReportForUser($db, $uid, $targetMonth);
            
            if ($result === null) {
                $skipped++;
            } else {
                $processed++;
            }
            
        } catch (Exception $e) {
            error_log("[CRON] Error generating monthly report for user $uid: " . $e->getMessage());
            $errors++;
        }
    }
    
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'month' => $targetMonth,
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

function generateMonthlyReportForUser($db, $uid, $month) {
    // Validate month format
    if (!preg_match('/^(\d{4})-(\d{2})$/', $month, $matches)) {
        throw new Exception("Invalid month format: $month. Expected YYYY-MM");
    }
    
    $year = (int)$matches[1];
    $monthNum = (int)$matches[2];
    
    // Get all dates in the month
    $monthStart = new DateTime("$year-$monthNum-01");
    $monthEnd = new DateTime($monthStart->format('Y-m-t'));
    
    // Read all daily reports
    $dailyReportsRef = $db->collection('users')->document($uid)
        ->collection('dailyReports');
    
    $dailyReportsSnapshot = $dailyReportsRef->documents();
    
    $dailyReports = [];
    foreach ($dailyReportsSnapshot as $doc) {
        if (!$doc->exists()) {
            continue;
        }
        
        $report = $doc->data();
        
        // Ignore seed documents
        if (isset($report['isSeed']) && $report['isSeed'] === true) {
            continue;
        }
        
        // Check if date is in the target month
        if (isset($report['date'])) {
            $reportDate = DateTime::createFromFormat('Y-m-d', $report['date']);
            if ($reportDate && $reportDate >= $monthStart && $reportDate <= $monthEnd) {
                $dailyReports[] = $report;
            }
        }
    }
    
    // Only write if coverageDays > 0
    $coverageDays = count($dailyReports);
    if ($coverageDays === 0) {
        return null;
    }
    
    // Aggregate from daily reports
    $totalFeedKg = null;
    $temperatures = [];
    $phValues = [];
    
    foreach ($dailyReports as $report) {
        // Aggregate feed
        if (isset($report['totalFeedKg']) && $report['totalFeedKg'] !== null) {
            if ($totalFeedKg === null) {
                $totalFeedKg = 0;
            }
            $totalFeedKg += (float)$report['totalFeedKg'];
        } else if (isset($report['feedUsedKg']) && $report['feedUsedKg'] !== null) {
            // Backward compatibility
            if ($totalFeedKg === null) {
                $totalFeedKg = 0;
            }
            $totalFeedKg += (float)$report['feedUsedKg'];
        }
        
        // Collect temperature values
        if (isset($report['avgTemperature']) && $report['avgTemperature'] !== null) {
            $temperatures[] = (float)$report['avgTemperature'];
        }
        
        // Collect pH values
        if (isset($report['avgPh']) && $report['avgPh'] !== null) {
            $phValues[] = (float)$report['avgPh'];
        }
    }
    
    // Calculate averages (average of daily averages)
    $avgTemperature = count($temperatures) > 0 ? array_sum($temperatures) / count($temperatures) : null;
    $avgPh = count($phValues) > 0 ? array_sum($phValues) / count($phValues) : null;
    
    // Write to Firestore
    $reportRef = $db->collection('users')->document($uid)
        ->collection('monthlyReports')->document($month);
    
    $monthlyReport = [
        'month' => $month,
        'avgTemperature' => $avgTemperature,
        'avgPh' => $avgPh,
        'totalFeedKg' => $totalFeedKg,
        'coverageDays' => $coverageDays,
        'isSeed' => false,
        'generatedAt' => new \Google\Cloud\Core\Timestamp(new DateTime()),
        'source' => 'php-cron'
    ];
    
    $reportRef->set($monthlyReport, ['merge' => true]);
    
    return $monthlyReport;
}
