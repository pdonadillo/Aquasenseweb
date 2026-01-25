/**
 * Weekly Report Export Endpoint
 * 
 * Generates CSV, PDF, or Word exports of weekly reports from Firestore.
 * Requires Firebase ID token authentication.
 * 
 * Usage:
 * GET /api/export/weekly?week=2024-W01&format=csv
 * GET /api/export/weekly?month=2024-01&format=pdf
 */

const FirebaseConfig = require('../_config/firebase');
const { verifyFirebaseToken } = require('../_middleware/verifyToken');

/**
 * Check if week overlaps with month
 */
function weekOverlapsMonth(weekStr, month) {
    // Parse ISO week YYYY-WW
    const match = weekStr.match(/(\d{4})-W(\d{2})/);
    if (!match) {
        return false;
    }
    
    const year = parseInt(match[1]);
    const week = parseInt(match[2]);
    
    // Calculate Monday of the week
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay(); // 0=Sunday, 1=Monday, etc.
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const jan4Monday = new Date(jan4);
    jan4Monday.setDate(jan4.getDate() - daysToMonday);
    
    const weekMonday = new Date(jan4Monday);
    weekMonday.setDate(weekMonday.getDate() + ((week - 1) * 7));
    
    const weekSunday = new Date(weekMonday);
    weekSunday.setDate(weekSunday.getDate() + 6);
    
    const monthStart = new Date(month + '-01');
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    
    return weekMonday <= monthEnd && weekSunday >= monthStart;
}

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
 * Export weekly reports as CSV
 */
async function exportWeeklyCSV(reports, filter, res) {
    const filename = `weekly_report_${filter}_${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.write('\xEF\xBB\xBF');
    res.write('Week,Avg Temperature (°C),Avg pH,Total Feed (kg),Coverage Days,Water Quality\n');
    
    for (const report of reports) {
        const week = report.week || '';
        const temp = report.avgTemperature ?? null;
        const ph = report.avgPh ?? null;
        const feed = report.totalFeedKg ?? null;
        const coverage = report.coverageDays || 0;
        const quality = calculateWaterQuality(temp, ph, 0);
        const qualityText = quality.waterQuality || 'Unknown';
        
        const row = [
            week,
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
 * Export weekly reports as PDF
 */
async function exportWeeklyPDF(reports, filter, res) {
    try {
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 50 });
        
        const filename = `weekly_report_${filter}_${new Date().toISOString().split('T')[0]}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        doc.pipe(res);
        
        doc.fontSize(16).font('Helvetica-Bold')
            .text(`Weekly Report - ${filter}`, { align: 'center' });
        doc.moveDown(2);
        
        if (reports.length === 0) {
            doc.fontSize(12).font('Helvetica')
                .text('No data available for the selected period.');
        } else {
            const tableTop = doc.y;
            const rowHeight = 20;
            const colWidths = [100, 100, 80, 80, 80, 80];
            const headers = ['Week', 'Avg Temp (°C)', 'Avg pH', 'Total Feed (kg)', 'Coverage Days', 'Water Quality'];
            
            let x = 50;
            doc.fontSize(10).font('Helvetica-Bold');
            headers.forEach((header, i) => {
                doc.rect(x, tableTop, colWidths[i], rowHeight).stroke();
                doc.text(header, x + 5, tableTop + 5, { width: colWidths[i] - 10, align: 'left' });
                x += colWidths[i];
            });
            
            doc.font('Helvetica');
            let y = tableTop + rowHeight;
            reports.forEach(report => {
                if (y > doc.page.height - 100) {
                    doc.addPage();
                    y = 50;
                }
                
                const week = report.week || '';
                const temp = report.avgTemperature ?? null;
                const ph = report.avgPh ?? null;
                const feed = report.totalFeedKg ?? null;
                const coverage = report.coverageDays || 0;
                const quality = calculateWaterQuality(temp, ph, 0);
                const qualityText = quality.waterQuality || 'Unknown';
                
                const rowData = [
                    week,
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
 * Export weekly reports as Word
 */
async function exportWeeklyWord(reports, filter, res) {
    try {
        const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType } = require('docx');
        
        const children = [];
        
        children.push(
            new Paragraph({
                text: `Weekly Report - ${filter}`,
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
            const tableRows = [
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph('Week')] }),
                        new TableCell({ children: [new Paragraph('Avg Temperature (°C)')] }),
                        new TableCell({ children: [new Paragraph('Avg pH')] }),
                        new TableCell({ children: [new Paragraph('Total Feed (kg)')] }),
                        new TableCell({ children: [new Paragraph('Coverage Days')] }),
                        new TableCell({ children: [new Paragraph('Water Quality')] })
                    ]
                })
            ];
            
            reports.forEach(report => {
                const week = report.week || '';
                const temp = report.avgTemperature ?? null;
                const ph = report.avgPh ?? null;
                const feed = report.totalFeedKg ?? null;
                const coverage = report.coverageDays || 0;
                const quality = calculateWaterQuality(temp, ph, 0);
                const qualityText = quality.waterQuality || 'Unknown';
                
                tableRows.push(
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph(week)] }),
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
        
        const filename = `weekly_report_${filter}_${new Date().toISOString().split('T')[0]}.docx`;
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
async function exportWeekly(req, res) {
    try {
        // Verify authentication
        const uid = await verifyFirebaseToken(req);
        
        // Get parameters
        const week = req.query?.week || null; // YYYY-WW format
        const month = req.query?.month || null; // YYYY-MM format (shows weeks overlapping month)
        const format = (req.query?.format || 'csv').toLowerCase();
        
        // Validate format
        if (!['csv', 'pdf', 'word'].includes(format)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid format. Must be: csv, pdf, or word'
            });
        }
        
        const db = FirebaseConfig.getFirestore();
        const reports = [];
        
        if (week) {
            // Single week
            const docRef = db.collection('users').doc(uid)
                .collection('weeklyReports').doc(week);
            const doc = await docRef.get();
            
            if (doc.exists) {
                const data = doc.data();
                if (!data.isSeed) {
                    reports.push(data);
                }
            }
        } else if (month) {
            // Weeks overlapping month
            const query = db.collection('users').doc(uid)
                .collection('weeklyReports');
            
            const snapshot = await query.get();
            snapshot.forEach(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    if (!data.isSeed) {
                        const weekStr = data.week || '';
                        if (weekStr && weekOverlapsMonth(weekStr, month)) {
                            reports.push(data);
                        }
                    }
                }
            });
            
            reports.sort((a, b) => (a.week || '').localeCompare(b.week || ''));
        } else {
            // Default: current month
            const currentMonth = new Date().toISOString().slice(0, 7);
            const query = db.collection('users').doc(uid)
                .collection('weeklyReports');
            
            const snapshot = await query.get();
            snapshot.forEach(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    if (!data.isSeed) {
                        const weekStr = data.week || '';
                        if (weekStr && weekOverlapsMonth(weekStr, currentMonth)) {
                            reports.push(data);
                        }
                    }
                }
            });
            
            reports.sort((a, b) => (a.week || '').localeCompare(b.week || ''));
        }
        
        const filter = week || month || new Date().toISOString().slice(0, 7);
        
        switch (format) {
            case 'csv':
                await exportWeeklyCSV(reports, filter, res);
                break;
            case 'pdf':
                await exportWeeklyPDF(reports, filter, res);
                break;
            case 'word':
                await exportWeeklyWord(reports, filter, res);
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

module.exports = { exportWeekly };
