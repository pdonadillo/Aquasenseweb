// this is auth.js
// auth.js - Authentication and user management functions
import { db, doc, getDoc, setDoc, auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, setPersistence, browserLocalPersistence, browserSessionPersistence } from './firebase-init.js';
import { isValidEmail } from './utils.js';
import { showNotification } from './notifications.js';
import { confirmAction } from './ui.js';

// Role verification and redirect
export async function verifyRoleOrRedirect(requiredRoles = []) {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const userUid = sessionStorage.getItem('userUid');
    if (!isLoggedIn || !userUid) {
        window.location.replace('index.html');
        return null;
    }
    try {
        const ref = doc(db, 'users', userUid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            window.location.replace('index.html');
            return null;
        }
        const user = snap.data();
        if (requiredRoles.length && !requiredRoles.includes(user.role)) {
            window.location.replace('index.html');
            return null;
        }
        return user;
    } catch {
        window.location.replace('index.html');
        return null;
    }
}

// Login handler
export async function handleLogin() {
    console.log('handleLogin called');
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.querySelector('#loginModal input[type="checkbox"]').checked;
    
    console.log('Email:', email, 'Password length:', password.length, 'Remember me:', rememberMe);
    
    if (!email || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    if (!isValidEmail(email)) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }

    try {
        console.log('Starting login process...');
        showNotification('Logging in...', 'info');
        const emailKey = email.toLowerCase();
        console.log('Looking for user:', emailKey);
        
        // Set persistence based on "Remember me" checkbox
        if (rememberMe) {
            await setPersistence(auth, browserLocalPersistence);
            console.log('Auth persistence set to LOCAL (Remember me enabled)');
        } else {
            await setPersistence(auth, browserSessionPersistence);
            console.log('Auth persistence set to SESSION (Remember me disabled)');
        }
        
        // Sign in with Firebase Auth
        console.log('Signing in with Firebase Auth...');
        const userCredential = await signInWithEmailAndPassword(auth, emailKey, password);
        const firebaseUser = userCredential.user;
        console.log('Firebase Auth login successful:', firebaseUser.uid);
        
        // Get user data from Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userRef);
        
        if (!snap.exists()) {
            console.log('User data not found in Firestore');
            showNotification('User data not found', 'error');
            return;
        }
        
        const user = snap.data();
        console.log('User data found:', user);

        // Import closeModal dynamically to avoid circular dependency
        const { closeModal } = await import('./ui.js');
        closeModal('loginModal');
        const role = user.role === 'superadmin' ? 'superadmin' : (user.role === 'admin' ? 'admin' : 'user');
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('userType', role);
        sessionStorage.setItem('userUid', firebaseUser.uid);
        sessionStorage.setItem('userEmail', emailKey);
        
        // Store remember me preference
        if (rememberMe) {
            localStorage.setItem('rememberMe', 'true');
            localStorage.setItem('lastLoginEmail', emailKey);
        } else {
            localStorage.removeItem('rememberMe');
            localStorage.removeItem('lastLoginEmail');
        }
        
        showNotification('Login successful! Welcome back!', 'success');
        
        console.log('Redirecting to role:', role);
        if (role === 'superadmin') {
            window.location.replace('super-admin-dashboard.html');
        } else if (role === 'admin') {
            window.location.replace('admin-dashboard.html');
        } else {
            window.location.replace('user-dashboard.html');
        }
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Login failed. Please try again.';
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email address.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password. Please try again.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many failed attempts. Please try again later.';
        }
        showNotification(errorMessage, 'error');
    }
}

// Signup handler
export async function handleSignup() {
    console.log('handleSignup called');
    const firstName = document.getElementById('signupFirstName').value;
    const lastName = document.getElementById('signupLastName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const termsAccepted = document.querySelector('#signupModal input[type="checkbox"]').checked;
    
    console.log('Signup data:', { firstName, lastName, email, password: password.length, confirmPassword: confirmPassword.length, termsAccepted });

    if (!firstName || !lastName || !email || !password || !confirmPassword) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    if (!isValidEmail(email)) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }

    if (password.length < 8) {
        showNotification('Password must be at least 8 characters long', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showNotification('Passwords do not match', 'error');
        return;
    }

    if (!termsAccepted) {
        showNotification('Please accept the Terms of Service and Privacy Policy', 'error');
        return;
    }

    try {
        console.log('Starting signup process...');
        showNotification('Creating your account...', 'info');
        const emailKey = email.toLowerCase();
        console.log('Email key:', emailKey);
        
        // Create user in Firebase Auth
        console.log('Creating Firebase Auth user...');
        const userCredential = await createUserWithEmailAndPassword(auth, emailKey, password);
        const firebaseUser = userCredential.user;
        console.log('Firebase Auth user created:', firebaseUser.uid);
        
        // Store additional user data in Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        console.log('User ref created:', userRef);
        
        const userData = {
            firstName,
            lastName,
            email: emailKey,
            role: 'user',
            isActive: true,
            createdAt: Date.now(),
            firebaseUid: firebaseUser.uid
        };
        console.log('User data to save:', userData);
        
        await setDoc(userRef, userData);
        console.log('User data saved to Firestore successfully');

        showNotification('Account created successfully! Welcome to AquaSense!', 'success');
        // Import closeModal dynamically to avoid circular dependency
        const { closeModal } = await import('./ui.js');
        closeModal('signupModal');

        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('userType', 'user');
        sessionStorage.setItem('userUid', firebaseUser.uid);
        sessionStorage.setItem('userEmail', emailKey);
        window.location.replace('user-dashboard.html');
    } catch (error) {
        console.error('Signup error:', error);
        showNotification('Account creation failed. Please try again.', 'error');
    }
}

// Logout function
export async function logout() {
    const confirmed = await confirmAction({
        title: 'Confirm Logout',
        message: 'Are you sure you want to log out? You will need to sign in again to access your account.',
        confirmText: 'Log out',
        cancelText: 'Cancel',
        type: 'danger'
    });
    
    if (!confirmed) {
        console.log('Logout cancelled by user');
        return;
    }
    
    showNotification('Logging out...', 'info');
    try {
        // Sign out from Firebase Auth
        await signOut(auth);
        console.log('[AUTH] User logged out');
    } catch (error) {
        console.error('Firebase Auth signout error:', error);
    }
    
    setTimeout(() => {
        // Clear any stored data
        localStorage.clear();
        sessionStorage.clear();
        
        // Replace current history entry to prevent back navigation
        window.location.replace('index.html');
        
        // Additional security: clear any remaining references
        window.history.pushState(null, null, 'index.html');
        window.addEventListener('popstate', function(event) {
            window.location.replace('index.html');
        });
    }, 1500);
}

// Forgot password handler
export async function handleForgotPassword() {
    const email = document.getElementById('loginEmail').value;
    
    if (!email) {
        showNotification('Please enter your email address', 'error');
        return;
    }
    
    if (!isValidEmail(email)) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }
    
    try {
        showNotification('Sending password reset email...', 'info');
        const emailKey = email.toLowerCase();
        await sendPasswordResetEmail(auth, emailKey);
        console.log('[AUTH] Password reset email sent to', emailKey);
        showNotification('Password reset email sent! Please check your inbox.', 'success');
    } catch (error) {
        console.error('Password reset error:', error);
        let errorMessage = 'Failed to send password reset email. Please try again.';
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email address.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many requests. Please try again later.';
        }
        showNotification(errorMessage, 'error');
    }
}

// Google sign-in handler
export async function handleGoogleSignIn(isSignup = false) {
    try {
        showNotification('Signing in with Google...', 'info');
        
        const provider = new GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        provider.setCustomParameters({
            prompt: 'select_account'
        });
        
        const result = await signInWithPopup(auth, provider);
        const firebaseUser = result.user;
        const credential = GoogleAuthProvider.credentialFromResult(result);
        
        console.log('[AUTH] Google sign-in successful:', firebaseUser.uid, firebaseUser.email);
        
        // Check if user exists in Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userRef);
        
        if (snap.exists()) {
            // Existing user - login
            const user = snap.data();
            const { closeModal } = await import('./ui.js');
            closeModal(isSignup ? 'signupModal' : 'loginModal');
            
            const role = user.role === 'superadmin' ? 'superadmin' : (user.role === 'admin' ? 'admin' : 'user');
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('userType', role);
            sessionStorage.setItem('userUid', firebaseUser.uid);
            sessionStorage.setItem('userEmail', firebaseUser.email);
            
            // Store remember me for Google sign-in
            localStorage.setItem('rememberMe', 'true');
            localStorage.setItem('lastLoginEmail', firebaseUser.email);
            
            showNotification('Login successful! Welcome back!', 'success');
            
            if (role === 'superadmin') {
                window.location.replace('super-admin-dashboard.html');
            } else if (role === 'admin') {
                window.location.replace('admin-dashboard.html');
            } else {
                window.location.replace('user-dashboard.html');
            }
        } else {
            // New user - create Firestore document
            if (isSignup) {
                const displayName = firebaseUser.displayName || '';
                const nameParts = displayName.split(' ');
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';
                
                const userData = {
                    firstName,
                    lastName,
                    email: firebaseUser.email.toLowerCase(),
                    role: 'user',
                    isActive: true,
                    createdAt: Date.now(),
                    firebaseUid: firebaseUser.uid,
                    provider: 'google'
                };
                
                await setDoc(userRef, userData);
                console.log('User data saved to Firestore successfully');
                
                const { closeModal } = await import('./ui.js');
                closeModal('signupModal');
                
                sessionStorage.setItem('isLoggedIn', 'true');
                sessionStorage.setItem('userType', 'user');
                sessionStorage.setItem('userUid', firebaseUser.uid);
                sessionStorage.setItem('userEmail', firebaseUser.email);
                
                localStorage.setItem('rememberMe', 'true');
                localStorage.setItem('lastLoginEmail', firebaseUser.email);
                
                showNotification('Account created successfully! Welcome to AquaSense!', 'success');
                window.location.replace('user-dashboard.html');
            } else {
                showNotification('No account found. Please sign up first.', 'error');
            }
        }
    } catch (error) {
        console.error('Google sign-in error:', error);
        let errorMessage = 'Google sign-in failed. Please try again.';
        if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'Sign-in popup was closed. Please try again.';
        } else if (error.code === 'auth/cancelled-popup-request') {
            errorMessage = 'Sign-in was cancelled.';
        } else if (error.code === 'auth/popup-blocked') {
            errorMessage = 'Popup was blocked. Please allow popups and try again.';
        }
        showNotification(errorMessage, 'error');
    }
}

// Restore remember me email on page load
export function restoreRememberMeEmail() {
    const rememberMe = localStorage.getItem('rememberMe');
    const lastEmail = localStorage.getItem('lastLoginEmail');
    
    if (rememberMe === 'true' && lastEmail) {
        const loginEmailInput = document.getElementById('loginEmail');
        if (loginEmailInput) {
            loginEmailInput.value = lastEmail;
        }
        
        const rememberMeCheckbox = document.querySelector('#loginModal input[type="checkbox"]');
        if (rememberMeCheckbox) {
            rememberMeCheckbox.checked = true;
        }
    }
}

// Update user display name in navigation
export async function updateUserDisplayName() {
    try {
        const userUid = sessionStorage.getItem('userUid');
        if (!userUid) {
            console.warn('No userUid found in sessionStorage');
            return;
        }
        
        const userRef = doc(db, 'users', userUid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            // Use firstName and lastName if available, otherwise fall back to email
            const displayName = (userData.firstName && userData.lastName) 
                ? `${userData.firstName} ${userData.lastName}`
                : (userData.email || 'User');
            
            // Update user name in navigation - handle different dashboard structures
            // For user dashboard: .user-profile > div > div:first-child
            const userProfileDiv = document.querySelector('.user-profile > div > div:first-child');
            if (userProfileDiv) {
                userProfileDiv.textContent = displayName;
            }
            
            // For admin dashboard: .admin-user-profile > div > div:first-child
            const adminProfileDiv = document.querySelector('.admin-user-profile > div > div:first-child');
            if (adminProfileDiv) {
                adminProfileDiv.textContent = displayName;
            }
            
            // For super-admin dashboard: .user-profile span (inside .super-user-profile)
            const superProfileSpan = document.querySelector('.super-user-profile .user-profile span');
            if (superProfileSpan) {
                superProfileSpan.textContent = displayName;
            }
            
            console.log('User display name updated:', displayName);
            
            // Update page title if it exists
            const pageTitle = document.querySelector('.dashboard-title');
            if (pageTitle) {
                const role = userData.role === 'superadmin' ? 'Super Admin' : 
                           userData.role === 'admin' ? 'Admin' : 'User';
                pageTitle.textContent = `Welcome, ${userData.firstName}!`;
            }
        } else {
            console.warn('User document does not exist in Firestore for UID:', userUid);
        }
    } catch (error) {
        console.error('Error updating user display name:', error);
    }
}
