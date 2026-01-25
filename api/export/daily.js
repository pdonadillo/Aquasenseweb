/**
 * Daily Report Export Endpoint
 * 
 * Generates CSV, PDF, or Word exports of daily reports from Firestore.
 * Requires Firebase ID token authentication.
 * 
 * Usage:
 * GET /api/export/daily?date=2024-01-01&format=csv
 * GET /api/export/daily?month=2024-01&format=pdf
 */

const FirebaseConfig = require('../_config/firebase');
const { verifyFirebaseToken } = require('../_middleware/verifyToken');

/**
 * Calculate water quality
 */
function calculateWaterQuality(avgTemperature, avgPh, mortality) {
    if (avgTemperature === null || avgTemperature === undefined || 
        avgPh === null || avgPh === undefined) {
        return { waterQuality: 'Unknown', score: null };
    }
    
    const phInRange = avgPh >= 6.5 && avgPh <= 8.5;
    const tempInRange = avgTemperature >= 24 && avgTemperature <= 30;
    const noMortality = mortality === 0;
    
    if (phInRange && tempInRange && noMortality) {
        return { waterQuality: 'Good', score: 90 };
    } else if (mortality <= 3 || (phInRange && tempInRange && mortality > 0)) {
        return { waterQuality: 'Fair', score: 70 };
    } else {
        return { waterQuality: 'Poor', score: 40 };
    }
}

/**
 * Export daily reports as CSV
 */
async function exportDailyCSV(reports, filter, res) {
    const filename = `daily_report_${filter}_${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // BOM for UTF-8
    res.write('\xEF\xBB\xBF');
    
    // Header
    res.write('Date,Avg Temperature (°C),Avg pH,Total Feed (kg),Coverage Hours,Water Quality\n');
    
    // Data rows
    for (const report of reports) {
        const date = report.date || '';
        const temp = report.avgTemperature ?? null;
        const ph = report.avgPh ?? null;
        const feed = report.totalFeedKg ?? null;
        const coverage = report.coverageHours || 0;
        const quality = calculateWaterQuality(temp, ph, 0);
        const qualityText = quality.waterQuality || 'Unknown';
        
        const row = [
            date,
            temp !== null ? temp.toFixed(1) : '--',
            ph !== null ? ph.toFixed(2) : '--',
            feed !== null ? feed.toFixed(1) : '--',
            coverage,
            qualityText
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',') + '\n';
        
        res.write(row);
    }
    
    res.end();
}

/**
 * Export daily reports as PDF
 */
async function exportDailyPDF(reports, filter, res) {
    try {
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 50 });
        
        const filename = `daily_report_${filter}_${new Date().toISOString().split('T')[0]}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        doc.pipe(res);
        
        // Title
        doc.fontSize(16).font('Helvetica-Bold')
            .text(`Daily Report - ${filter}`, { align: 'center' });
        doc.moveDown(2);
        
        if (reports.length === 0) {
            doc.fontSize(12).font('Helvetica')
                .text('No data available for the selected period.');
        } else {
            // Table header
            doc.fontSize(10).font('Helvetica-Bold');
            const tableTop = doc.y;
            const rowHeight = 20;
            const colWidths = [100, 100, 80, 80, 80, 80];
            const headers = ['Date', 'Avg Temp (°C)', 'Avg pH', 'Total Feed (kg)', 'Coverage Hours', 'Water Quality'];
            
            let x = 50;
            headers.forEach((header, i) => {
                doc.rect(x, tableTop, colWidths[i], rowHeight).stroke();
                doc.text(header, x + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
                x += colWidths[i];
            });
            
            // Data rows
            doc.font('Helvetica');
            let y = tableTop + rowHeight;
            reports.forEach(report => {
                if (y > doc.page.height - 100) {
                    doc.addPage();
                    y = 50;
                }
                
                const date = report.date || '';
                const temp = report.avgTemperature ?? null;
                const ph = report.avgPh ?? null;
                const feed = report.totalFeedKg ?? null;
                const coverage = report.coverageHours || 0;
                const quality = calculateWaterQuality(temp, ph, 0);
                const qualityText = quality.waterQuality || 'Unknown';
                
                const rowData = [
                    date,
                    temp !== null ? temp.toFixed(1) : '--',
                    ph !== null ? ph.toFixed(2) : '--',
                    feed !== null ? feed.toFixed(1) : '--',
                    String(coverage),
                    qualityText
                ];
                
                x = 50;
                rowData.forEach((data, i) => {
                    doc.rect(x, y, colWidths[i], rowHeight).stroke();
                    doc.text(String(data), x + 5, y + 5, { width: colWidths[i] - 10, align: 'left' });
                    x += colWidths[i];
                });
                
                y += rowHeight;
            });
        }
        
        doc.end();
    } catch (error) {
        throw new Error(`PDF export failed: ${error.message}`);
    }
}

/**
 * Export daily reports as Word
 */
async function exportDailyWord(reports, filter, res) {
    try {
        const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType } = require('docx');
        const path = require('path');
        const fs = require('fs');
        
        const children = [];
        
        // Title
        children.push(
            new Paragraph({
                text: `Daily Report - ${filter}`,
                heading: 'Heading1',
                alignment: AlignmentType.CENTER
            })
        );
        
        if (reports.length === 0) {
            children.push(
                new Paragraph({
                    text: 'No data available for the selected period.'
                })
            );
        } else {
            // Table
            const tableRows = [
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph('Date')] }),
                        new TableCell({ children: [new Paragraph('Avg Temperature (°C)')] }),
                        new TableCell({ children: [new Paragraph('Avg pH')] }),
                        new TableCell({ children: [new Paragraph('Total Feed (kg)')] }),
                        new TableCell({ children: [new Paragraph('Coverage Hours')] }),
                        new TableCell({ children: [new Paragraph('Water Quality')] })
                    ]
                })
            ];
            
            reports.forEach(report => {
                const date = report.date || '';
                const temp = report.avgTemperature ?? null;
                const ph = report.avgPh ?? null;
                const feed = report.totalFeedKg ?? null;
                const coverage = report.coverageHours || 0;
                const quality = calculateWaterQuality(temp, ph, 0);
                const qualityText = quality.waterQuality || 'Unknown';
                
                tableRows.push(
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph(date)] }),
                            new TableCell({ children: [new Paragraph(temp !== null ? temp.toFixed(1) : '--')] }),
                            new TableCell({ children: [new Paragraph(ph !== null ? ph.toFixed(2) : '--')] }),
                            new TableCell({ children: [new Paragraph(feed !== null ? feed.toFixed(1) : '--')] }),
                            new TableCell({ children: [new Paragraph(String(coverage))] }),
                            new TableCell({ children: [new Paragraph(qualityText)] })
                        ]
                    })
                );
            });
            
            children.push(
                new Table({
                    rows: tableRows,
                    width: {
                        size: 100,
                        type: WidthType.PERCENTAGE
                    }
                })
            );
        }
        
        const doc = new Document({
            sections: [{
                children: children
            }]
        });
        
        const filename = `daily_report_${filter}_${new Date().toISOString().split('T')[0]}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        const buffer = await Packer.toBuffer(doc);
        res.send(buffer);
    } catch (error) {
        throw new Error(`Word export failed: ${error.message}`);
    }
}

/**
 * Main export function
 */
async function exportDaily(req, res) {
    try {
        // Verify authentication
        const uid = await verifyFirebaseToken(req);
        
        // Get parameters
        const date = req.query?.date || null; // YYYY-MM-DD format
        const month = req.query?.month || null; // YYYY-MM format
        const format = (req.query?.format || 'csv').toLowerCase(); // csv, pdf, word
        
        // Validate format
        if (!['csv', 'pdf', 'word'].includes(format)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid format. Must be: csv, pdf, or word'
            });
        }
        
        const db = FirebaseConfig.getFirestore();
        const reports = [];
        
        // Load reports based on filter
        if (date) {
            // Single date
            const docRef = db.collection('users').doc(uid)
                .collection('dailyReports').doc(date);
            const doc = await docRef.get();
            
            if (doc.exists) {
                const data = doc.data();
                if (!data.isSeed) {
                    reports.push(data);
                }
            }
        } else if (month) {
            // All reports in month
            const query = db.collection('users').doc(uid)
                .collection('dailyReports')
                .where('date', '>=', `${month}-01`)
                .where('date', '<=', `${month}-31`);
            
            const snapshot = await query.get();
            snapshot.forEach(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    if (!data.isSeed && data.date && data.date.startsWith(month)) {
                        reports.push(data);
                    }
                }
            });
            
            // Sort by date
            reports.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        } else {
            // Default: current month
            const currentMonth = new Date().toISOString().slice(0, 7);
            const query = db.collection('users').doc(uid)
                .collection('dailyReports')
                .where('date', '>=', `${currentMonth}-01`)
                .where('date', '<=', `${currentMonth}-31`);
            
            const snapshot = await query.get();
            snapshot.forEach(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    if (!data.isSeed && data.date && data.date.startsWith(currentMonth)) {
                        reports.push(data);
                    }
                }
            });
            
            reports.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        }
        
        // Generate file based on format
        const filter = date || month || new Date().toISOString().slice(0, 7);
        
        switch (format) {
            case 'csv':
                await exportDailyCSV(reports, filter, res);
                break;
            case 'pdf':
                await exportDailyPDF(reports, filter, res);
                break;
            case 'word':
                await exportDailyWord(reports, filter, res);
                break;
        }
        
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Export failed',
            details: error.details
        });
    }
}

module.exports = { exportDaily };
