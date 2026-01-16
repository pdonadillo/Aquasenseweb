<?php
/**
 * Firebase Configuration
 * 
 * This file initializes Firebase Admin SDK for PHP backend operations.
 * Required for Firestore access and token verification.
 */

// Prevent direct access
if (!defined('FIREBASE_INIT')) {
    define('FIREBASE_INIT', true);
}

// Firebase project configuration (from firebase-init.js)
define('FIREBASE_PROJECT_ID', 'aquasense-8fef1');
define('FIREBASE_DATABASE_URL', 'https://aquasense-8fef1-default-rtdb.firebaseio.com');
define('FIREBASE_STORAGE_BUCKET', 'aquasense-8fef1.firebasestorage.app');

// Path to Firebase Admin SDK service account key
// IMPORTANT: Store this file securely outside web root
// Create via Firebase Console > Project Settings > Service Accounts
define('FIREBASE_SERVICE_ACCOUNT_PATH', __DIR__ . '/../../_private/firebase-service-account.json');

// Initialize Firebase Admin SDK
require_once __DIR__ . '/../../vendor/autoload.php';

use Kreait\Firebase\Factory;
use Kreait\Firebase\Contract\Auth;
use Kreait\Firebase\Contract\Firestore;

class FirebaseConfig {
    private static $factory = null;
    private static $auth = null;
    private static $firestore = null;

    /**
     * Get Firebase Factory instance
     */
    public static function getFactory() {
        if (self::$factory === null) {
            if (!file_exists(FIREBASE_SERVICE_ACCOUNT_PATH)) {
                throw new Exception('Firebase service account file not found. Please create it from Firebase Console.');
            }
            
            self::$factory = (new Factory())
                ->withServiceAccount(FIREBASE_SERVICE_ACCOUNT_PATH)
                ->withDatabaseUri(FIREBASE_DATABASE_URL);
        }
        
        return self::$factory;
    }

    /**
     * Get Firebase Auth instance
     */
    public static function getAuth(): Auth {
        if (self::$auth === null) {
            self::$auth = self::getFactory()->createAuth();
        }
        
        return self::$auth;
    }

    /**
     * Get Firestore instance
     */
    public static function getFirestore(): Firestore {
        if (self::$firestore === null) {
            self::$firestore = self::getFactory()->createFirestore();
        }
        
        return self::$firestore;
    }
    
    /**
     * Get Firestore database reference
     */
    public static function getFirestoreDatabase() {
        return self::getFirestore()->database();
    }
}
