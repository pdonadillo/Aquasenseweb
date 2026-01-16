// this is utils.js
// utils.js - Utility functions and helpers
// Common functions used across the application

// Password hashing utilities
export async function pbkdf2Hash(password, salt, iterations = 100000, keyLen = 32, hash = 'SHA-256') {
    const enc = new TextEncoder();
    const pwKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const params = { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash };
    const derivedBits = await crypto.subtle.deriveBits(params, pwKey, keyLen * 8);
    const bytes = new Uint8Array(derivedBits);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateSalt(length = 16) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Legacy password hashing for backward compatibility
export async function hashPasswordLegacy(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Email validation
export function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Password strength validation
export function getPasswordStrength(password) {
    let strength = 0;
    
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/)) strength++;
    if (password.match(/[A-Z]/)) strength++;
    if (password.match(/[0-9]/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;
    
    return strength;
}

// Date formatting
export function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Button loading state management
export function withButtonLoading(button, fn) {
    return async (...args) => {
        if (!button) return await fn(...args);
        const original = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Please wait...';
        try {
            return await fn(...args);
        } finally {
            button.disabled = false;
            button.innerHTML = original;
        }
    };
}

// Scroll to section utility
export function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        const navbar = document.querySelector('.navbar');
        if (navbar) {
            navbar.style.transform = 'translateY(0)';
            window.isNavbarVisible = true;
        }
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Password strength indicator update
export function updatePasswordStrengthIndicator(strength) {
    let strengthText = '';
    let strengthColor = '';
    
    switch (strength) {
        case 0:
        case 1:
            strengthText = 'Very Weak';
            strengthColor = '#f44336';
            break;
        case 2:
            strengthText = 'Weak';
            strengthColor = '#ff9800';
            break;
        case 3:
            strengthText = 'Fair';
            strengthColor = '#ffc107';
            break;
        case 4:
            strengthText = 'Good';
            strengthColor = '#8bc34a';
            break;
        case 5:
            strengthText = 'Strong';
            strengthColor = '#4CAF50';
            break;
    }
    
    // Create or update strength indicator
    let indicator = document.querySelector('.password-strength');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'password-strength';
        indicator.style.cssText = `
            font-size: 0.8rem;
            margin-top: 0.25rem;
            font-weight: 500;
        `;
        document.getElementById('signupPassword').parentElement.appendChild(indicator);
    }
    
    indicator.textContent = strengthText;
    indicator.style.color = strengthColor;
}

// Enhanced form validation with real-time feedback
export function setupFormValidation() {
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

// Setup scroll animations
export function setupScrollAnimations() {
    // Add animation on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe feature cards for animation
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });

    // Observe stats for animation
    const stats = document.querySelectorAll('.stat');
    stats.forEach(stat => {
        stat.style.opacity = '0';
        stat.style.transform = 'translateY(20px)';
        stat.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(stat);
    });
}

// Setup interactive animations
export function setupInteractiveAnimations() {
    // Add hover effects to feature cards
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-10px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
    
    // Add click animation to buttons
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Create ripple effect
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s linear;
                pointer-events: none;
            `;
            
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
    
    // Add ripple animation keyframes
    const rippleStyles = document.createElement('style');
    rippleStyles.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(rippleStyles);
}
