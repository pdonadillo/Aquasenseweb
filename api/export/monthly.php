<?php
/**
 * Monthly Report Export Endpoint
 * 
 * Generates CSV, PDF, or Word exports of monthly reports from Firestore.
 * Requires Firebase ID token authentication.
 */

require_once __DIR__ . '/../_config/firebase.php';
require_once __DIR__ . '/../_middleware/verifyToken.php';


// Verify authentication
$uid = verifyFirebaseToken();

// Get parameters
$month = $_GET['month'] ?? null; // YYYY-MM format
$year = $_GET['year'] ?? null; // YYYY format
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
    
    if ($month) {
        // Single month
        $docRef = $db->collection('users')->document($uid)
            ->collection('monthlyReports')->document($month);
        $doc = $docRef->snapshot();
        
        if ($doc->exists()) {
            $data = $doc->data();
            if (!isset($data['isSeed']) || !$data['isSeed']) {
                $reports[] = $data;
            }
        }
    } else if ($year) {
        // All months in year
        $query = $db->collection('users')->document($uid)
            ->collection('monthlyReports');
        
        $snapshot = $query->documents();
        foreach ($snapshot as $doc) {
            if ($doc->exists()) {
                $data = $doc->data();
                if (!isset($data['isSeed']) || !$data['isSeed']) {
                    $monthStr = $data['month'] ?? '';
                    if ($monthStr && strpos($monthStr, $year) === 0) {
                        $reports[] = $data;
                    }
                }
            }
        }
        
        usort($reports, function($a, $b) {
            return strcmp($a['month'] ?? '', $b['month'] ?? '');
        });
    } else {
        // Default: current year
        $year = date('Y');
        $query = $db->collection('users')->document($uid)
            ->collection('monthlyReports');
        
        $snapshot = $query->documents();
        foreach ($snapshot as $doc) {
            if ($doc->exists()) {
                $data = $doc->data();
                if (!isset($data['isSeed']) || !$data['isSeed']) {
                    $monthStr = $data['month'] ?? '';
                    if ($monthStr && strpos($monthStr, $year) === 0) {
                        $reports[] = $data;
                    }
                }
            }
        }
        
        usort($reports, function($a, $b) {
            return strcmp($a['month'] ?? '', $b['month'] ?? '');
        });
    }
    
    switch ($format) {
        case 'csv':
            exportMonthlyCSV($reports, $month ?? $year);
            break;
        case 'pdf':
            exportMonthlyPDF($reports, $month ?? $year);
            break;
        case 'word':
            exportMonthlyWord($reports, $month ?? $year);
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

function exportMonthlyCSV($reports, $filter) {
    $filename = 'monthly_report_' . $filter . '_' . date('Y-m-d') . '.csv';
    
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Pragma: no-cache');
    header('Expires: 0');
    
    echo "\xEF\xBB\xBF";
    
    $output = fopen('php://output', 'w');
    fputcsv($output, ['Month', 'Avg Temperature (°C)', 'Avg pH', 'Total Feed (kg)', 'Coverage Days', 'Water Quality']);
    
    foreach ($reports as $report) {
        $month = $report['month'] ?? '';
        $temp = $report['avgTemperature'] ?? null;
        $ph = $report['avgPh'] ?? null;
        $feed = $report['totalFeedKg'] ?? null;
        $coverage = $report['coverageDays'] ?? 0;
        $quality = calculateWaterQuality($temp, $ph, 0);
        $qualityText = $quality['waterQuality'] ?? 'Unknown';
        
        fputcsv($output, [
            $month,
            $temp !== null ? number_format($temp, 1) : '--',
            $ph !== null ? number_format($ph, 2) : '--',
            $feed !== null ? number_format($feed, 1) : '--',
            $coverage,
            $qualityText
        ]);
    }
    
    fclose($output);
}

function exportMonthlyPDF($reports, $filter) {
    require_once __DIR__ . '/../../vendor/autoload.php';
    
    $pdf = new \TCPDF(PDF_PAGE_ORIENTATION, PDF_UNIT, PDF_PAGE_FORMAT, true, 'UTF-8', false);
    $pdf->SetCreator('AquaSense');
    $pdf->SetAuthor('AquaSense System');
    $pdf->SetTitle('Monthly Report - ' . $filter);
    
    $pdf->SetHeaderData('', 0, 'Monthly Report', $filter);
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
    $pdf->Cell(0, 10, 'Monthly Report - ' . $filter, 0, 1, 'C');
    $pdf->Ln(5);
    
    $pdf->SetFont('helvetica', 'B', 10);
    $html = '<table border="1" cellpadding="5" cellspacing="0">';
    $html .= '<tr style="background-color:#f0f0f0;">
        <th width="20%">Month</th>
        <th width="20%">Avg Temperature (°C)</th>
        <th width="15%">Avg pH</th>
        <th width="15%">Total Feed (kg)</th>
        <th width="15%">Coverage Days</th>
        <th width="15%">Water Quality</th>
    </tr>';
    
    $pdf->SetFont('helvetica', '', 9);
    foreach ($reports as $report) {
        $month = $report['month'] ?? '';
        $temp = $report['avgTemperature'] ?? null;
        $ph = $report['avgPh'] ?? null;
        $feed = $report['totalFeedKg'] ?? null;
        $coverage = $report['coverageDays'] ?? 0;
        $quality = calculateWaterQuality($temp, $ph, 0);
        $qualityText = $quality['waterQuality'] ?? 'Unknown';
        
        $html .= '<tr>';
        $html .= '<td>' . htmlspecialchars($month) . '</td>';
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
    
    $filename = 'monthly_report_' . $filter . '_' . date('Y-m-d') . '.pdf';
    $pdf->Output($filename, 'D');
}

function exportMonthlyWord($reports, $filter) {
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
        
        $section->addText('Monthly Report - ' . $filter, ['bold' => true, 'size' => 16], ['alignment' => 'center']);
        $section->addTextBreak(2);
        
        if (empty($reports)) {
            $section->addText('No data available for the selected period.');
        } else {
            $table = $section->addTable(['borderSize' => 6, 'borderColor' => '000000', 'cellMargin' => 50]);
            
            $table->addRow();
            $table->addCell(2000)->addText('Month', ['bold' => true]);
            $table->addCell(2000)->addText('Avg Temperature (°C)', ['bold' => true]);
            $table->addCell(1500)->addText('Avg pH', ['bold' => true]);
            $table->addCell(1500)->addText('Total Feed (kg)', ['bold' => true]);
            $table->addCell(1500)->addText('Coverage Days', ['bold' => true]);
            $table->addCell(1500)->addText('Water Quality', ['bold' => true]);
            
            foreach ($reports as $report) {
                $month = $report['month'] ?? '';
                $temp = $report['avgTemperature'] ?? null;
                $ph = $report['avgPh'] ?? null;
                $feed = $report['totalFeedKg'] ?? null;
                $coverage = $report['coverageDays'] ?? 0;
                $quality = calculateWaterQuality($temp, $ph, 0);
                $qualityText = $quality['waterQuality'] ?? 'Unknown';
                
                $table->addRow();
                $table->addCell(2000)->addText($month);
                $table->addCell(2000)->addText($temp !== null ? number_format($temp, 1) : '--');
                $table->addCell(1500)->addText($ph !== null ? number_format($ph, 2) : '--');
                $table->addCell(1500)->addText($feed !== null ? number_format($feed, 1) : '--');
                $table->addCell(1500)->addText((string)$coverage);
                $table->addCell(1500)->addText($qualityText);
            }
        }
        
        $filename = 'monthly_report_' . $filter . '_' . date('Y-m-d') . '.docx';
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
