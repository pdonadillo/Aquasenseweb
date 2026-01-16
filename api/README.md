# AquaSense PHP Backend API

This PHP backend provides utility services for the AquaSense web application, including file exports and scheduled background jobs.

## Requirements

- PHP 7.4 or higher
- Composer
- Firebase Admin SDK service account key
- Access to Firestore and Firebase Realtime Database

## Installation

1. Install PHP dependencies:
```bash
composer install
```

2. Create Firebase service account key:
   - Go to Firebase Console > Project Settings > Service Accounts
   - Click "Generate new private key"
   - Save the JSON file as `_private/firebase-service-account.json`

3. Set environment variable for cron secret:
```bash
export CRON_SECRET="your-secret-key-here"
```

Or add to your `.env` file or Hostinger environment variables.

## Folder Structure

```
api/
├── _config/
│   └── firebase.php          # Firebase configuration
├── _middleware/
│   └── verifyToken.php       # Token verification middleware
├── _private/
│   └── firebase-service-account.json  # Service account key (not in git)
├── export/
│   ├── daily.php             # Daily report export
│   ├── weekly.php            # Weekly report export
│   └── monthly.php           # Monthly report export
└── cron/
    ├── sample-hourly.php     # Hourly sampling job
    ├── generate-daily.php    # Daily report generation
    ├── generate-weekly.php   # Weekly report generation
    └── generate-monthly.php  # Monthly report generation
```

## Export Endpoints

All export endpoints require Firebase ID token authentication via `Authorization: Bearer <token>` header.

### Daily Report Export
```
GET /api/export/daily.php?format=csv&date=2025-01-15
GET /api/export/daily.php?format=pdf&month=2025-01
```

Parameters:
- `format`: csv, pdf, or word
- `date`: YYYY-MM-DD (optional, single date)
- `month`: YYYY-MM (optional, all reports in month)

### Weekly Report Export
```
GET /api/export/weekly.php?format=csv&week=2025-W03
GET /api/export/weekly.php?format=pdf&month=2025-01
```

Parameters:
- `format`: csv, pdf, or word
- `week`: YYYY-WW (optional, single week)
- `month`: YYYY-MM (optional, weeks overlapping month)

### Monthly Report Export
```
GET /api/export/monthly.php?format=csv&month=2025-01
GET /api/export/monthly.php?format=pdf&year=2025
```

Parameters:
- `format`: csv, pdf, or word
- `month`: YYYY-MM (optional, single month)
- `year`: YYYY (optional, all months in year)

## Cron Jobs

Cron jobs require a shared secret for authentication. Set via query parameter or header:

```
GET /api/cron/sample-hourly.php?secret=your-secret-key
# OR
X-Cron-Secret: your-secret-key (header)
```

### Setup Cron Jobs (Hostinger)

Add these to your cron jobs in Hostinger control panel:

```bash
# Hourly sampling (every 5 minutes)
*/5 * * * * /usr/bin/php /home/username/public_html/api/cron/sample-hourly.php secret=your-secret-key >> /dev/null 2>&1

# Daily report generation (1 AM daily)
0 1 * * * /usr/bin/php /home/username/public_html/api/cron/generate-daily.php secret=your-secret-key >> /dev/null 2>&1

# Weekly report generation (Monday 2 AM)
0 2 * * 1 /usr/bin/php /home/username/public_html/api/cron/generate-weekly.php secret=your-secret-key >> /dev/null 2>&1

# Monthly report generation (1st of month, 2 AM)
0 2 1 * * /usr/bin/php /home/username/public_html/api/cron/generate-monthly.php secret=your-secret-key >> /dev/null 2>&1
```

## Frontend Integration

Include the PHP export integration script in your HTML:

```html
<script type="module" src="/assets/js/php-export.js"></script>
```

Then call the export functions:

```javascript
// Export daily report as CSV
await exportDailyReportPHP('csv', null, '2025-01');

// Export weekly report as PDF
await exportWeeklyReportPHP('pdf', null, '2025-01');

// Export monthly report as Word
await exportMonthlyReportPHP('word', null, '2025');
```

## Security Notes

1. **Service Account Key**: Store `firebase-service-account.json` securely outside web root
2. **Cron Secret**: Use a strong, random secret key and store it securely
3. **Firebase Rules**: Ensure Firestore security rules allow service account access
4. **HTTPS**: Always use HTTPS in production
5. **Token Validation**: All export endpoints validate Firebase ID tokens

## Error Handling

All endpoints return JSON error responses with appropriate HTTP status codes:
- `401`: Authentication failed
- `400`: Invalid parameters
- `500`: Server error

Example error response:
```json
{
    "success": false,
    "error": "Error message",
    "details": "Additional error details"
}
```

## Troubleshooting

### Service Account Key Not Found
Ensure the JSON file is at: `_private/firebase-service-account.json`

### Cron Jobs Not Running
- Check cron secret is correct
- Verify PHP path is correct (`which php` or `/usr/bin/php`)
- Check file permissions (must be executable)
- Check cron logs in Hostinger control panel

### Export Fails with 401
- Verify Firebase ID token is valid
- Check token is sent in `Authorization: Bearer <token>` header
- Ensure user is authenticated in frontend

### Firestore Access Denied
- Verify service account has proper permissions in Firebase Console
- Check Firestore security rules allow service account access
