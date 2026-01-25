// this is main.js
// main.js - Main application entry point (modular version)
// Clean, organized structure with separated concerns
console.log('[BOOT] main.js loaded');

// Import all modules
import { initializeNavigation, setupModalClickOutside, setupGlobalUI, openModal, closeModal, switchModal } from './ui.js';
import { setupGlobalNotifications, showNotification } from './notifications.js';
import { handleLogin, handleSignup, logout, verifyRoleOrRedirect } from './auth.js';
import { initializeUserDashboard, initializeAdminDashboard, initializeSuperAdminDashboard } from './dashboard.js';
import { getPasswordStrength, updatePasswordStrengthIndicator, scrollToSection, setupFormValidation, setupScrollAnimations, setupInteractiveAnimations } from './utils.js';

// CRITICAL: Set up modal functions on window IMMEDIATELY (before any HTML can call them)
// This ensures inline onclick handlers work even if setupGlobalUI hasn't run yet
window.openModal = openModal;
window.closeModal = closeModal;
window.switchModal = switchModal;
console.log('[UI] openModal attached to window');

// Defensive fallback: If openModal is still not available for any reason, provide a safe default
if (!window.openModal) {
    window.openModal = (name) => {
        console.error('[UI] openModal missing, modal:', name);
        console.error('[UI] This should not happen - check ui.js imports');
    };
}

// Main initialization function
async function initializeApp() {
    const currentPage = window.location.pathname.split('/').pop();
    
    // Common initialization for all pages
    initializeNavigation();
    setupModalClickOutside();
    setupGlobalUI(); // This will also set window.openModal, but we already did it above for safety
    setupGlobalNotifications();
    
    // Make scrollToSection globally accessible
    window.scrollToSection = scrollToSection;
    
    // Page-specific initialization
    if (currentPage === 'index.html' || currentPage === '') {
        await initializeIndexPage();
    } else if (currentPage === 'user-dashboard.html') {
        await initializeUserPage();
    } else if (currentPage === 'admin-dashboard.html') {
        await initializeAdminPage();
    } else if (currentPage === 'super-admin-dashboard.html') {
        await initializeSuperAdminPage();
    }
}

// Index page initialization
async function initializeIndexPage() {
    console.log('DOM loaded, setting up forms...');
    
    // Clear session data but preserve remember me settings
    sessionStorage.clear();
    // Don't clear localStorage - preserve remember me and last email
    
    // Check for existing auth state (Remember me functionality) - MUST RUN FIRST
    const { auth, db, doc, getDoc, onAuthStateChanged, signOut } = await import('./firebase-init.js');
    
    let redirectHandled = false;
    
    const checkAndRedirectUser = async (user) => {
        if (!user || redirectHandled) {
            console.log('[REMEMBER ME] Skipping check - user:', !!user, 'redirectHandled:', redirectHandled);
            return;
        }
        
        const currentPage = window.location.pathname.split('/').pop();
        if (currentPage !== 'index.html' && currentPage !== '') {
            console.log('[REMEMBER ME] Not on index page, skipping redirect');
            return;
        }
        
        console.log('[REMEMBER ME] User already signed in:', user.email, user.uid);
        redirectHandled = true;
        
        // Close any open modals before redirecting
        try {
            const { closeModal } = await import('./ui.js');
            closeModal('loginModal');
            closeModal('signupModal');
        } catch (e) {
            console.warn('[REMEMBER ME] Could not close modals:', e);
        }
        
        try {
            const userRef = doc(db, 'users', user.uid);
            const snap = await getDoc(userRef);
            
            if (snap.exists()) {
                const userData = snap.data();
                const role = userData.role === 'superadmin' ? 'superadmin' : (userData.role === 'admin' ? 'admin' : 'user');
                
                sessionStorage.setItem('isLoggedIn', 'true');
                sessionStorage.setItem('userType', role);
                sessionStorage.setItem('userUid', user.uid);
                sessionStorage.setItem('userEmail', user.email);
                
                console.log('[REMEMBER ME] Redirecting to dashboard for role:', role);
                
                if (role === 'superadmin') {
                    window.location.replace('super-admin-dashboard.html');
                } else if (role === 'admin') {
                    window.location.replace('admin-dashboard.html');
                } else {
                    window.location.replace('user-dashboard.html');
                }
                return;
            } else {
                console.log('[REMEMBER ME] User document not found in Firestore, signing out');
                redirectHandled = false;
                await signOut(auth);
            }
        } catch (error) {
            console.error('[REMEMBER ME] Error checking user data:', error);
            redirectHandled = false;
        }
    };
    
    // Check current user immediately (if auth state is already restored)
    if (auth.currentUser) {
        await checkAndRedirectUser(auth.currentUser);
        if (redirectHandled) {
            return;
        }
    }
    
    // Wait for auth state to be determined (Promise-based approach)
    // This handles the case where Firebase is still restoring auth state from localStorage
    await new Promise((resolve) => {
        let resolved = false;
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (resolved) return;
            resolved = true;
            unsubscribe();
            await checkAndRedirectUser(user);
            resolve();
        });
        
        // Timeout fallback (if auth state takes too long, continue anyway)
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                unsubscribe();
                resolve();
            }
        }, 3000);
    });
    
    // If redirect was handled, don't continue with page setup
    if (redirectHandled) {
        return;
    }
    
    // Restore remember me email if available
    import('./auth.js').then(({ restoreRememberMeEmail }) => {
        restoreRememberMeEmail();
    });
    
    // Prevent back navigation to dashboard pages
    window.addEventListener('popstate', function(event) {
        if (window.location.pathname.includes('dashboard')) {
            window.location.replace('index.html');
        }
    });
    
    // Login form - setup with multiple fallbacks
    const setupLoginForm = () => {
        const loginForm = document.querySelector('#loginModal form') || document.querySelector('#loginForm');
        const submitButton = document.querySelector('#loginModal button[type="submit"]');
        
        console.log('[FORM SETUP] Login form found:', loginForm);
        console.log('[FORM SETUP] Submit button found:', submitButton);
        
        const handleSubmit = async (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            console.log('[FORM] Login form submitted');
            
            // Verify form elements exist
            const emailInput = document.getElementById('loginEmail');
            const passwordInput = document.getElementById('loginPassword');
            console.log('[FORM] Email input found:', !!emailInput);
            console.log('[FORM] Password input found:', !!passwordInput);
            
            if (!emailInput || !passwordInput) {
                console.error('[FORM] Form inputs not found!');
                showNotification('Form error: Please refresh the page', 'error');
                return false;
            }
            
            try {
                await handleLogin();
            } catch (error) {
                console.error('[FORM] Error in handleLogin:', error);
            }
            return false;
        };
        
        if (loginForm) {
            loginForm.addEventListener('submit', handleSubmit);
            console.log('[FORM SETUP] Form submit listener attached');
        }
        
        if (submitButton) {
            submitButton.addEventListener('click', handleSubmit);
            console.log('[FORM SETUP] Button click listener attached');
        }
        
        if (!loginForm && !submitButton) {
            console.error('[FORM SETUP] Neither form nor button found!');
            return false;
        }
        
        return true;
    };
    
    // Try to setup immediately
    if (!setupLoginForm()) {
        // Retry after a short delay
        console.log('[FORM SETUP] Retrying form setup in 100ms...');
        setTimeout(() => {
            if (!setupLoginForm()) {
                console.error('[FORM SETUP] Form setup failed after retry!');
            }
        }, 100);
    }

    // Signup form
    const signupForm = document.querySelector('#signupModal form');
    console.log('Signup form found:', signupForm);
    if (signupForm) {
        signupForm.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('Signup form submitted');
            handleSignup();
        });
    } else {
        console.error('Signup form not found!');
    }
    
    // Forgot password link
    const forgotPasswordLink = document.querySelector('.forgot-password');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', function(e) {
            e.preventDefault();
            import('./auth.js').then(({ handleForgotPassword }) => {
                handleForgotPassword();
            });
        });
    }
    
    // Google sign-in buttons
    const googleButtons = document.querySelectorAll('.btn-google');
    googleButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const isSignup = button.closest('#signupModal') !== null;
            import('./auth.js').then(({ handleGoogleSignIn }) => {
                handleGoogleSignIn(isSignup);
            });
        });
    });

    // Real-time password validation
    const passwordInput = document.getElementById('signupPassword');
    const confirmPasswordInput = document.getElementById('signupConfirmPassword');
    
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            const password = this.value;
            const strength = getPasswordStrength(password);
            updatePasswordStrengthIndicator(strength);
        });
    }
    
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', function() {
            const password = document.getElementById('signupPassword').value;
            const confirmPassword = this.value;
            
            if (confirmPassword && password !== confirmPassword) {
                this.style.borderColor = '#f44336';
            } else {
                this.style.borderColor = '#4CAF50';
            }
        });
    }
    
    // Setup enhanced functionality
    setupFormValidation();
    setupScrollAnimations();
    setupInteractiveAnimations();
    
    console.log('Index page initialization complete');
}

// User dashboard page initialization
async function initializeUserPage() {
    // Boot runtime core first (works without auth)
    const { bootRuntimeCore } = await import('./dashboard.js');
    await bootRuntimeCore({sourcePage: 'dashboard'});
    
    const currentUser = await verifyRoleOrRedirect(['user']);
    if (!currentUser) return;
    
    // Attach UI bindings after dashboard init
    const { attachSensorUIBindings } = await import('./dashboard.js');
    attachSensorUIBindings();
    
    initializeUserDashboard();
}

// Admin dashboard page initialization
async function initializeAdminPage() {
    const currentUser = await verifyRoleOrRedirect(['admin', 'superadmin']);
    if (!currentUser) return;
    
    initializeAdminDashboard();
}

// Super admin dashboard page initialization
async function initializeSuperAdminPage() {
    const currentUser = await verifyRoleOrRedirect(['superadmin']);
    if (!currentUser) return;
    
    await initializeSuperAdminDashboard();
}

// Make auth functions globally accessible for HTML onclick handlers
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.logout = logout;
window.determineUserType = determineUserType;
window.setButtonLoading = setButtonLoading;

// Make Google sign-in and forgot password globally accessible
import('./auth.js').then(({ handleGoogleSignIn, handleForgotPassword }) => {
    window.handleGoogleSignIn = handleGoogleSignIn;
    window.handleForgotPassword = handleForgotPassword;
});

// Enhanced Landing Page JavaScript Features

// Determine user type based on email (simulation)
function determineUserType(email) {
    // User type is determined by Firestore user document role field
    // This function is kept for compatibility but role should come from Firestore
    // Default to 'user' - actual role will be checked via verifyRoleOrRedirect()
    return 'user';
}

// Add loading states for buttons
function setButtonLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    } else {
        button.disabled = false;
        // Restore original text based on button type
        if (button.closest('#loginModal')) {
            button.innerHTML = 'Sign In';
        } else if (button.closest('#signupModal')) {
            button.innerHTML = 'Create Account';
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Add notification styles
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }
    
    .notification-close {
        background: none;
        border: none;
        color: white;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background-color 0.2s ease;
    }
    
    .notification-close:hover {
        background-color: rgba(255, 255, 255, 0.2);
    }
`;
document.head.appendChild(notificationStyles);
