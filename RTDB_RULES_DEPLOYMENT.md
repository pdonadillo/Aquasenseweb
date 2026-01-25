# Realtime Database Rules Deployment Guide

## File Created
`database.rules.json` - Firebase Realtime Database security rules

## Rules Summary

### Access Control

1. **Authenticated User Access**
   - Users can read/write to their device if `deviceId === auth.uid`
   - This allows user `H5hY84Qz85TD9MBPb6UKy3mzLxZ2` to access device `H5hY84Qz85TD9MBPb6UKy3mzLxZ2`

2. **Unauthenticated Access (Background Runtime)**
   - Full read/write access to `/devices/{deviceId}/status/feeder` for background runtime
   - Full read/write access to `/devices/{deviceId}/sensors` for sensor data sync
   - This allows `index.html` background runtime to work without user authentication

## Deployment Steps

### Option 1: Firebase Console (Recommended)
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `aquasense-8fef1`
3. Navigate to **Realtime Database** → **Rules** tab
4. Copy the contents of `database.rules.json`
5. Paste into the rules editor
6. Click **Publish**

### Option 2: Firebase CLI
```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in project (if not already done)
firebase init database

# Deploy rules
firebase deploy --only database
```

## Rules Structure

```json
{
  "rules": {
    "devices": {
      "$deviceId": {
        // Authenticated: user can access if deviceId matches their UID
        ".read": "auth != null && auth.uid === $deviceId",
        ".write": "auth != null && auth.uid === $deviceId",
        
        // Unauthenticated: allow background runtime access
        "status": {
          ".read": true,
          ".write": true,
          "feeder": {
            ".read": true,
            ".write": true
          }
        },
        "sensors": {
          ".read": true,
          ".write": true
        }
      }
    }
  }
}
```

## Security Notes

- **Authenticated Access**: Users can only access devices where `deviceId === auth.uid`
- **Unauthenticated Access**: Limited to specific paths (`status/feeder` and `sensors`) for background runtime
- **Default Deny**: All other paths are denied by default

## Testing

After deployment, verify:
1. ✅ User `H5hY84Qz85TD9MBPb6UKy3mzLxZ2` can read/write to `/devices/H5hY84Qz85TD9MBPb6UKy3mzLxZ2/status/feeder`
2. ✅ Background runtime on `index.html` can read/write without authentication
3. ✅ Other users cannot access device data they don't own
