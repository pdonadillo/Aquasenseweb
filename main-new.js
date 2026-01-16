// this is main-new.js
// main.js - Main application entry point (modular version)
// Clean, organized structure with separated concerns

// Import all modules
import { initializeNavigation, setupModalClickOutside, setupGlobalUI } from './ui.js';
import { setupGlobalNotifications } from './notifications.js';
import { handleLogin, handleSignup, logout, verifyRoleOrRedirect } from './auth.js';
import { initializeUserDashboard, initializeAdminDashboard, initializeSuperAdminDashboard } from './dashboard.js';
import { getPasswordStrength, updatePasswordStrengthIndicator, scrollToSection } from './utils.js';

// Main initialization function
async function initializeApp() {
    const currentPage = window.location.pathname.split('/').pop();
    
    // Common initialization for all pages
    initializeNavigation();
    setupModalClickOutside();
    setupGlobalUI();
    setupGlobalNotifications();
    
    // Make scrollToSection globally accessible
    window.scrollToSection = scrollToSection;
    
    // Page-specific initialization
    if (currentPage === 'index.html' || currentPage === '') {
        initializeIndexPage();
    } else if (currentPage === 'user-dashboard.html') {
        await initializeUserPage();
    } else if (currentPage === 'admin-dashboard.html') {
        await initializeAdminPage();
    } else if (currentPage === 'super-admin-dashboard.html') {
        await initializeSuperAdminPage();
    }
}

// Index page initialization
function initializeIndexPage() {
    console.log('DOM loaded, setting up forms...');
    
    // Clear any existing session data when on login page
    sessionStorage.clear();
    localStorage.clear();
    
    // Prevent back navigation to dashboard pages
    window.addEventListener('popstate', function(event) {
        if (window.location.pathname.includes('dashboard')) {
            window.location.replace('index.html');
        }
    });
    
    // Login form
    const loginForm = document.querySelector('#loginModal form');
    console.log('Login form found:', loginForm);
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('Login form submitted');
            handleLogin();
        });
    } else {
        console.error('Login form not found!');
    }

    // Signup form
    const signupForm = document.querySelector('#signupForm');
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
}

// User dashboard page initialization
async function initializeUserPage() {
    const currentUser = await verifyRoleOrRedirect(['user']);
    if (!currentUser) return;
    
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
