/**
 * Firebase Configuration
 * 
 * This file initializes Firebase Admin SDK for Node.js backend operations.
 * Required for Firestore access and token verification.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Firebase project configuration
const FIREBASE_PROJECT_ID = 'aquasense-8fef1';
const FIREBASE_DATABASE_URL = 'https://aquasense-8fef1-default-rtdb.firebaseio.com';
const FIREBASE_STORAGE_BUCKET = 'aquasense-8fef1.firebasestorage.app';

// Path to Firebase Admin SDK service account key
// IMPORTANT: Store this file securely outside web root
// Create via Firebase Console > Project Settings > Service Accounts
const FIREBASE_SERVICE_ACCOUNT_PATH = path.join(__dirname, '../../_private/firebase-service-account.json');

class FirebaseConfig {
    static factory = null;
    static auth = null;
    static firestore = null;

    /**
     * Get Firebase Admin instance
     */
    static getFactory() {
        if (this.factory === null) {
            if (!fs.existsSync(FIREBASE_SERVICE_ACCOUNT_PATH)) {
                throw new Error('Firebase service account file not found. Please create it from Firebase Console.');
            }
            
            // Initialize Firebase Admin if not already initialized
            if (!admin.apps.length) {
                const serviceAccount = require(FIREBASE_SERVICE_ACCOUNT_PATH);
                
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: FIREBASE_DATABASE_URL,
                    storageBucket: FIREBASE_STORAGE_BUCKET
                });
            }
            
            this.factory = admin;
        }
        
        return this.factory;
    }

    /**
     * Get Firebase Auth instance
     */
    static getAuth() {
        if (this.auth === null) {
            this.auth = this.getFactory().auth();
        }
        
        return this.auth;
    }

    /**
     * Get Firestore instance
     */
    static getFirestore() {
        if (this.firestore === null) {
            this.firestore = this.getFactory().firestore();
        }
        
        return this.firestore;
    }
    
    /**
     * Get Firestore database reference
     */
    static getFirestoreDatabase() {
        return this.getFirestore();
    }
}

module.exports = FirebaseConfig;
