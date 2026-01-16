<?php
/**
 * Weekly Report Generation Cron Job
 * 
 * Generates weekly reports from daily reports.
 * Runs once per week (recommended: Monday morning).
 * 
 * Usage (cron):
 * 0 2 * * 1 /usr/bin/php /path/to/api/cron/generate-weekly.php secret=your-secret-key
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

// Get week parameter (default: last week)
$targetWeek = $_GET['week'] ?? getLastWeekISO();

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
            $result = generateWeeklyReportForUser($db, $uid, $targetWeek);
            
            if ($result === null) {
                $skipped++;
            } else {
                $processed++;
            }
            
        } catch (Exception $e) {
            error_log("[CRON] Error generating weekly report for user $uid: " . $e->getMessage());
            $errors++;
        }
    }
    
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'week' => $targetWeek,
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

function generateWeeklyReportForUser($db, $uid, $isoWeekString) {
    // Validate ISO week format
    if (!preg_match('/^(\d{4})-W(\d{2})$/', $isoWeekString)) {
        throw new Exception("Invalid ISO week format: $isoWeekString. Expected YYYY-WW");
    }
    
    // Get all 7 dates in the ISO week
    $weekDates = getDatesInIsoWeek($isoWeekString);
    $dateStrings = array_map(function($date) {
        return $date->format('Y-m-d');
    }, $weekDates);
    
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
        
        if (isset($report['date']) && in_array($report['date'], $dateStrings)) {
            $dailyReports[] = $report;
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
        ->collection('weeklyReports')->document($isoWeekString);
    
    $weeklyReport = [
        'week' => $isoWeekString,
        'avgTemperature' => $avgTemperature,
        'avgPh' => $avgPh,
        'totalFeedKg' => $totalFeedKg,
        'coverageDays' => $coverageDays,
        'isSeed' => false,
        'generatedAt' => new \Google\Cloud\Core\Timestamp(new DateTime()),
        'source' => 'php-cron'
    ];
    
    $reportRef->set($weeklyReport, ['merge' => true]);
    
    return $weeklyReport;
}

function getDatesInIsoWeek($isoWeekString) {
    if (!preg_match('/(\d{4})-W(\d{2})/', $isoWeekString, $matches)) {
        throw new Exception("Invalid ISO week format: $isoWeekString");
    }
    
    $year = (int)$matches[1];
    $week = (int)$matches[2];
    
    // Calculate Monday of the week
    $jan4 = new DateTime("$year-01-04");
    $dayOfWeek = (int)$jan4->format('w');
    $daysToMonday = $dayOfWeek == 0 ? 6 : $dayOfWeek - 1;
    $jan4Monday = clone $jan4;
    $jan4Monday->modify("-{$daysToMonday} days");
    
    $weekMonday = clone $jan4Monday;
    $weekMonday->modify("+" . (($week - 1) * 7) . " days");
    
    $dates = [];
    for ($i = 0; $i < 7; $i++) {
        $date = clone $weekMonday;
        $date->modify("+{$i} days");
        $dates[] = $date;
    }
    
    return $dates;
}

function getLastWeekISO() {
    $lastWeek = new DateTime('last monday');
    if ($lastWeek->format('w') == 1 && $lastWeek->format('H') < 12) {
        $lastWeek->modify('-7 days');
    }
    
    $year = (int)$lastWeek->format('Y');
    $jan4 = new DateTime("$year-01-04");
    $dayOfWeek = (int)$jan4->format('w');
    $daysToMonday = $dayOfWeek == 0 ? 6 : $dayOfWeek - 1;
    $jan4Monday = clone $jan4;
    $jan4Monday->modify("-{$daysToMonday} days");
    
    $daysDiff = $lastWeek->diff($jan4Monday)->days;
    $week = floor($daysDiff / 7) + 1;
    
    return sprintf('%04d-W%02d', $year, $week);
}
