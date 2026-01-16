<?php
/**
 * Weekly Report Export Endpoint
 * 
 * Generates CSV, PDF, or Word exports of weekly reports from Firestore.
 * Requires Firebase ID token authentication.
 */

require_once __DIR__ . '/../_config/firebase.php';
require_once __DIR__ . '/../_middleware/verifyToken.php';


// Verify authentication
$uid = verifyFirebaseToken();

// Get parameters
$week = $_GET['week'] ?? null; // YYYY-WW format
$month = $_GET['month'] ?? null; // YYYY-MM format (shows weeks overlapping month)
$format = strtolower($_GET['format'] ?? 'csv');

// Validate format
if (!in_array($format, ['csv', 'pdf', 'word'])) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Invalid format. Must be: csv, pdf, or word'
    ]);
    exit;
}

try {
    $firestore = FirebaseConfig::getFirestore();
    $db = $firestore->database();
    
    $reports = [];
    
    if ($week) {
        // Single week
        $docRef = $db->collection('users')->document($uid)
            ->collection('weeklyReports')->document($week);
        $doc = $docRef->snapshot();
        
        if ($doc->exists()) {
            $data = $doc->data();
            if (!isset($data['isSeed']) || !$data['isSeed']) {
                $reports[] = $data;
            }
        }
    } else if ($month) {
        // Weeks overlapping month
        $monthStart = new DateTime($month . '-01');
        $monthEnd = new DateTime($month . '-' . $monthStart->format('t'));
        
        $query = $db->collection('users')->document($uid)
            ->collection('weeklyReports');
        
        $snapshot = $query->documents();
        foreach ($snapshot as $doc) {
            if ($doc->exists()) {
                $data = $doc->data();
                if (!isset($data['isSeed']) || !$data['isSeed']) {
                    $weekStr = $data['week'] ?? '';
                    if ($weekStr) {
                        // Check if week overlaps with month
                        if (weekOverlapsMonth($weekStr, $month)) {
                            $reports[] = $data;
                        }
                    }
                }
            }
        }
        
        usort($reports, function($a, $b) {
            return strcmp($a['week'] ?? '', $b['week'] ?? '');
        });
    } else {
        // Default: current month
        $month = date('Y-m');
        $query = $db->collection('users')->document($uid)
            ->collection('weeklyReports');
        
        $snapshot = $query->documents();
        foreach ($snapshot as $doc) {
            if ($doc->exists()) {
                $data = $doc->data();
                if (!isset($data['isSeed']) || !$data['isSeed']) {
                    $weekStr = $data['week'] ?? '';
                    if ($weekStr && weekOverlapsMonth($weekStr, $month)) {
                        $reports[] = $data;
                    }
                }
            }
        }
        
        usort($reports, function($a, $b) {
            return strcmp($a['week'] ?? '', $b['week'] ?? '');
        });
    }
    
    switch ($format) {
        case 'csv':
            exportWeeklyCSV($reports, $week ?? $month);
            break;
        case 'pdf':
            exportWeeklyPDF($reports, $week ?? $month);
            break;
        case 'word':
            exportWeeklyWord($reports, $week ?? $month);
            break;
    }
    
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Export failed',
        'details' => $e->getMessage()
    ]);
}

function weekOverlapsMonth($weekStr, $month) {
    // Parse ISO week YYYY-WW
    if (preg_match('/(\d{4})-W(\d{2})/', $weekStr, $matches)) {
        $year = (int)$matches[1];
        $week = (int)$matches[2];
        
        // Calculate Monday of the week
        $jan4 = new DateTime("$year-01-04");
        $dayOfWeek = (int)$jan4->format('w'); // 0=Sunday, 1=Monday, etc.
        $daysToMonday = $dayOfWeek == 0 ? 6 : $dayOfWeek - 1;
        $jan4Monday = clone $jan4;
        $jan4Monday->modify("-{$daysToMonday} days");
        
        $weekMonday = clone $jan4Monday;
        $weekMonday->modify("+" . (($week - 1) * 7) . " days");
        
        $weekSunday = clone $weekMonday;
        $weekSunday->modify("+6 days");
        
        $monthStart = new DateTime($month . '-01');
        $monthEnd = new DateTime($month . '-' . $monthStart->format('t'));
        
        return ($weekMonday <= $monthEnd && $weekSunday >= $monthStart);
    }
    
    return false;
}

function exportWeeklyCSV($reports, $filter) {
    $filename = 'weekly_report_' . $filter . '_' . date('Y-m-d') . '.csv';
    
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Pragma: no-cache');
    header('Expires: 0');
    
    echo "\xEF\xBB\xBF";
    
    $output = fopen('php://output', 'w');
    fputcsv($output, ['Week', 'Avg Temperature (°C)', 'Avg pH', 'Total Feed (kg)', 'Coverage Days', 'Water Quality']);
    
    foreach ($reports as $report) {
        $week = $report['week'] ?? '';
        $temp = $report['avgTemperature'] ?? null;
        $ph = $report['avgPh'] ?? null;
        $feed = $report['totalFeedKg'] ?? null;
        $coverage = $report['coverageDays'] ?? 0;
        $quality = calculateWaterQuality($temp, $ph, 0);
        $qualityText = $quality['waterQuality'] ?? 'Unknown';
        
        fputcsv($output, [
            $week,
            $temp !== null ? number_format($temp, 1) : '--',
            $ph !== null ? number_format($ph, 2) : '--',
            $feed !== null ? number_format($feed, 1) : '--',
            $coverage,
            $qualityText
        ]);
    }
    
    fclose($output);
}

function exportWeeklyPDF($reports, $filter) {
    require_once __DIR__ . '/../../vendor/autoload.php';
    
    $pdf = new \TCPDF(PDF_PAGE_ORIENTATION, PDF_UNIT, PDF_PAGE_FORMAT, true, 'UTF-8', false);
    $pdf->SetCreator('AquaSense');
    $pdf->SetAuthor('AquaSense System');
    $pdf->SetTitle('Weekly Report - ' . $filter);
    
    $pdf->SetHeaderData('', 0, 'Weekly Report', $filter);
    $pdf->setHeaderFont([PDF_FONT_NAME_MAIN, '', PDF_FONT_SIZE_MAIN]);
    $pdf->setFooterFont([PDF_FONT_NAME_DATA, '', PDF_FONT_SIZE_DATA]);
    
    $pdf->SetDefaultMonospacedFont(PDF_FONT_MONOSPACED);
    $pdf->SetMargins(15, 27, 15);
    $pdf->SetHeaderMargin(5);
    $pdf->SetFooterMargin(10);
    $pdf->SetAutoPageBreak(TRUE, 25);
    $pdf->SetFont('helvetica', '', 10);
    
    // Add watermark (logo image or text)
    $logoPath = __DIR__ . '/../../assets/images/logo/aquasence.logo.png';
    if (file_exists($logoPath)) {
        $pdf->SetWatermarkImage($logoPath, 0.2, '', '');
    } else {
        $pdf->SetWatermarkText('AquaSense IoT', 0.2);
    }
    $pdf->watermarkImgAlpha = 0.2;
    
    $pdf->AddPage();
    $pdf->SetFont('helvetica', 'B', 16);
    $pdf->Cell(0, 10, 'Weekly Report - ' . $filter, 0, 1, 'C');
    $pdf->Ln(5);
    
    $pdf->SetFont('helvetica', 'B', 10);
    $html = '<table border="1" cellpadding="5" cellspacing="0">';
    $html .= '<tr style="background-color:#f0f0f0;">
        <th width="20%">Week</th>
        <th width="20%">Avg Temperature (°C)</th>
        <th width="15%">Avg pH</th>
        <th width="15%">Total Feed (kg)</th>
        <th width="15%">Coverage Days</th>
        <th width="15%">Water Quality</th>
    </tr>';
    
    $pdf->SetFont('helvetica', '', 9);
    foreach ($reports as $report) {
        $week = $report['week'] ?? '';
        $temp = $report['avgTemperature'] ?? null;
        $ph = $report['avgPh'] ?? null;
        $feed = $report['totalFeedKg'] ?? null;
        $coverage = $report['coverageDays'] ?? 0;
        $quality = calculateWaterQuality($temp, $ph, 0);
        $qualityText = $quality['waterQuality'] ?? 'Unknown';
        
        $html .= '<tr>';
        $html .= '<td>' . htmlspecialchars($week) . '</td>';
        $html .= '<td>' . ($temp !== null ? number_format($temp, 1) : '--') . '</td>';
        $html .= '<td>' . ($ph !== null ? number_format($ph, 2) : '--') . '</td>';
        $html .= '<td>' . ($feed !== null ? number_format($feed, 1) : '--') . '</td>';
        $html .= '<td>' . $coverage . '</td>';
        $html .= '<td>' . htmlspecialchars($qualityText) . '</td>';
        $html .= '</tr>';
    }
    
    $html .= '</table>';
    
    if (empty($reports)) {
        $html = '<p>No data available for the selected period.</p>';
    }
    
    $pdf->writeHTML($html, true, false, true, false, '');
    
    $filename = 'weekly_report_' . $filter . '_' . date('Y-m-d') . '.pdf';
    $pdf->Output($filename, 'D');
}

function exportWeeklyWord($reports, $filter) {
    require_once __DIR__ . '/../../vendor/autoload.php';
    
    try {
        $phpWord = new \PhpOffice\PhpWord\PhpWord();
        $section = $phpWord->addSection();
        $section->getSettings()->setDifferentFirstPage(false);
        
        // Add logo to header
        $logoPath = realpath(__DIR__ . '/../../assets/images/logo/aquasense.logo.png');
        if ($logoPath && file_exists($logoPath)) {
            $header = $section->addHeader();
            $header->addImage($logoPath, [
                'width' => 100,
                'alignment' => \PhpOffice\PhpWord\SimpleType\Jc::START
            ]);
        }
        
        $section->addText('Weekly Report - ' . $filter, ['bold' => true, 'size' => 16], ['alignment' => 'center']);
        $section->addTextBreak(2);
        
        if (empty($reports)) {
            $section->addText('No data available for the selected period.');
        } else {
            $table = $section->addTable(['borderSize' => 6, 'borderColor' => '000000', 'cellMargin' => 50]);
            
            $table->addRow();
            $table->addCell(2000)->addText('Week', ['bold' => true]);
            $table->addCell(2000)->addText('Avg Temperature (°C)', ['bold' => true]);
            $table->addCell(1500)->addText('Avg pH', ['bold' => true]);
            $table->addCell(1500)->addText('Total Feed (kg)', ['bold' => true]);
            $table->addCell(1500)->addText('Coverage Days', ['bold' => true]);
            $table->addCell(1500)->addText('Water Quality', ['bold' => true]);
            
            foreach ($reports as $report) {
                $week = $report['week'] ?? '';
                $temp = $report['avgTemperature'] ?? null;
                $ph = $report['avgPh'] ?? null;
                $feed = $report['totalFeedKg'] ?? null;
                $coverage = $report['coverageDays'] ?? 0;
                $quality = calculateWaterQuality($temp, $ph, 0);
                $qualityText = $quality['waterQuality'] ?? 'Unknown';
                
                $table->addRow();
                $table->addCell(2000)->addText($week);
                $table->addCell(2000)->addText($temp !== null ? number_format($temp, 1) : '--');
                $table->addCell(1500)->addText($ph !== null ? number_format($ph, 2) : '--');
                $table->addCell(1500)->addText($feed !== null ? number_format($feed, 1) : '--');
                $table->addCell(1500)->addText((string)$coverage);
                $table->addCell(1500)->addText($qualityText);
            }
        }
        
        $filename = 'weekly_report_' . $filter . '_' . date('Y-m-d') . '.docx';
        header('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        
        $objWriter = \PhpOffice\PhpWord\IOFactory::createWriter($phpWord, 'Word2007');
        $objWriter->save('php://output');
        exit;
    } catch (\Exception $e) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => 'Word export failed: ' . $e->getMessage()
        ]);
        exit;
    }
}

function calculateWaterQuality($avgTemperature, $avgPh, $mortality) {
    if ($avgTemperature === null || $avgPh === null) {
        return ['waterQuality' => 'Unknown', 'score' => null];
    }
    
    $phInRange = $avgPh >= 6.5 && $avgPh <= 8.5;
    $tempInRange = $avgTemperature >= 24 && $avgTemperature <= 30;
    $noMortality = $mortality === 0;
    
    if ($phInRange && $tempInRange && $noMortality) {
        return ['waterQuality' => 'Good', 'score' => 90];
    } else if ($mortality <= 3 || ($phInRange && $tempInRange && $mortality > 0)) {
        return ['waterQuality' => 'Fair', 'score' => 70];
    } else {
        return ['waterQuality' => 'Poor', 'score' => 40];
    }
}
