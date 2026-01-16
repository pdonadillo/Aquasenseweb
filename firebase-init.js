// this is firebase-init.js
// Firebase initialization module (ESM) for AquaSense
// Loads Firebase SDKs via CDN and exports initialized app, analytics, and Firestore helpers

// IMPORTANT: This file must be loaded with type="module" in HTML before other app scripts

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-analytics.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, updateDoc, deleteDoc, query, where, orderBy, addDoc, serverTimestamp, limit, onSnapshot, runTransaction, increment } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-database.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyBXh2XVeKkecjy0tGisPzgNyzXIOdFxK6U',
  authDomain: 'aquasense-8fef1.firebaseapp.com',
  databaseURL: 'https://aquasense-8fef1-default-rtdb.firebaseio.com',
  projectId: 'aquasense-8fef1',
  storageBucket: 'aquasense-8fef1.firebasestorage.app',
  messagingSenderId: '1052942345206',
  appId: '1:1052942345206:web:98d03f840be6b8525f9dd7',
  measurementId: 'G-X0KN9WE0BM'
};

// Initialize Firebase with error handling
let app, db, rtdb, auth, analytics = null;

try {
    app = initializeApp(firebaseConfig);
    console.log('✅ Firebase app initialized');
    
    // Analytics - optional, don't break if it fails
    // Analytics can fail in localhost, non-HTTPS, or if not configured
    try {
        analytics = getAnalytics(app);
        console.log('✅ Analytics initialized');
    } catch (error) {
        console.warn('⚠️ Analytics initialization failed (non-critical):', error.message);
        // Analytics is optional, continue without it
    }
    
    db = getFirestore(app);
    console.log('✅ Firestore initialized');
    
    rtdb = getDatabase(app);
    console.log('✅ Realtime Database initialized');
    
    auth = getAuth(app);
    console.log('✅ Auth initialized');
} catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    throw error; // Re-throw to prevent silent failures
}

export { app, db, rtdb, auth, analytics };

// Re-export Firestore and Auth helpers for convenience
export { doc, getDoc, setDoc, collection, getDocs, updateDoc, deleteDoc, query, where, orderBy, addDoc, serverTimestamp, limit, onSnapshot, runTransaction, increment };
export { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, setPersistence, browserLocalPersistence, browserSessionPersistence };

// Re-export Realtime Database helpers
export { ref, set, get, update, remove, onValue, off, push } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-database.js';


