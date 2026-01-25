/**
 * Export Integration
 * 
 * Handles file exports via JavaScript backend endpoints.
 * Attaches to existing export buttons without modifying existing logic.
 */

// Get Firebase ID token for authentication
async function getFirebaseIdToken() {
    try {
        const { auth } = await import('../../firebase-init.js');
        if (!auth || !auth.currentUser) {
            throw new Error('User not authenticated');
        }
        return await auth.currentUser.getIdToken();
    } catch (error) {
        console.error('Error getting Firebase ID token:', error);
        throw error;
    }
}

// Export daily report
async function exportDailyReport(format, date = null, month = null) {
    try {
        const token = await getFirebaseIdToken();
        
        let url = `/api/export/daily?format=${format}`;
        if (date) {
            url += `&date=${date}`;
        } else if (month) {
            url += `&month=${month}`;
        }
        
        // Trigger download
        const link = document.createElement('a');
        link.href = url;
        link.style.display = 'none';
        
        // Add token to headers via fetch
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Export failed');
        }
        
        // Get blob and create download
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        link.href = blobUrl;
        
        // Determine filename from Content-Disposition header or use default
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `daily_report_${date || month || 'export'}_${new Date().toISOString().split('T')[0]}.${format}`;
        
        if (contentDisposition) {
            const matches = /filename="?([^"]+)"?/i.exec(contentDisposition);
            if (matches && matches[1]) {
                filename = matches[1];
            }
        }
        
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Cleanup blob URL
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        
        if (window.showNotification) {
            window.showNotification('Report exported successfully', 'success');
        }
        
    } catch (error) {
        console.error('Error exporting daily report:', error);
        if (window.showNotification) {
            window.showNotification('Export failed: ' + error.message, 'error');
        }
    }
}

// Export weekly report
async function exportWeeklyReport(format, week = null, month = null) {
    try {
        const token = await getFirebaseIdToken();
        
        let url = `/api/export/weekly?format=${format}`;
        if (week) {
            url += `&week=${week}`;
        } else if (month) {
            url += `&month=${month}`;
        }
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Export failed');
        }
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.style.display = 'none';
        
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `weekly_report_${week || month || 'export'}_${new Date().toISOString().split('T')[0]}.${format}`;
        
        if (contentDisposition) {
            const matches = /filename="?([^"]+)"?/i.exec(contentDisposition);
            if (matches && matches[1]) {
                filename = matches[1];
            }
        }
        
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        
        if (window.showNotification) {
            window.showNotification('Report exported successfully', 'success');
        }
        
    } catch (error) {
        console.error('Error exporting weekly report:', error);
        if (window.showNotification) {
            window.showNotification('Export failed: ' + error.message, 'error');
        }
    }
}

// Export monthly report
async function exportMonthlyReport(format, month = null, year = null) {
    try {
        const token = await getFirebaseIdToken();
        
        let url = `/api/export/monthly?format=${format}`;
        if (month) {
            url += `&month=${month}`;
        } else if (year) {
            url += `&year=${year}`;
        }
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Export failed');
        }
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.style.display = 'none';
        
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `monthly_report_${month || year || 'export'}_${new Date().toISOString().split('T')[0]}.${format}`;
        
        if (contentDisposition) {
            const matches = /filename="?([^"]+)"?/i.exec(contentDisposition);
            if (matches && matches[1]) {
                filename = matches[1];
            }
        }
        
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        
        if (window.showNotification) {
            window.showNotification('Report exported successfully', 'success');
        }
        
    } catch (error) {
        console.error('Error exporting monthly report:', error);
        if (window.showNotification) {
            window.showNotification('Export failed: ' + error.message, 'error');
        }
    }
}

// Make functions globally accessible (keep old names for backward compatibility)
window.exportDailyReport = exportDailyReport;
window.exportWeeklyReport = exportWeeklyReport;
window.exportMonthlyReport = exportMonthlyReport;
// Backward compatibility aliases
window.exportDailyReportPHP = exportDailyReport;
window.exportWeeklyReportPHP = exportWeeklyReport;
window.exportMonthlyReportPHP = exportMonthlyReport;

console.log('[Export] Export functions loaded');
