// this is ui.js
// ui.js - User interface and modal management functions
import { showNotification } from './notifications.js';

// Modal functionality
export function openModal(modalId) {
    console.log('Opening modal:', modalId);
    const modal = document.getElementById(modalId);
    console.log('Modal element found:', modal);
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        console.log('Modal opened successfully');
    } else {
        console.error('Modal not found:', modalId);
    }
}

export function closeModal(modalId) {
    console.log('Closing modal:', modalId);
    const modal = document.getElementById(modalId);
    console.log('Modal element found:', modal);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        console.log('Modal closed successfully');
    } else {
        console.error('Modal not found:', modalId);
    }
}

export function switchModal(fromModalId, toModalId) {
    closeModal(fromModalId);
    openModal(toModalId);
}

// Navigation initialization
export function initializeNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section[id]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all links and sections
            navLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            // Add active class to clicked link
            this.classList.add('active');
            
            // Show corresponding section
            const targetId = this.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
                // Smooth scroll to section
                scrollToSection(targetId);
            }
        });
    });
    
    // Add scroll effect to navbar with hide/show functionality
    let lastScrollTop = 0;
    window.isNavbarVisible = true;
    
    window.addEventListener('scroll', function() {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;
        
        const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Update navbar background based on scroll position
        if (currentScrollTop > 100) {
            navbar.style.background = 'rgba(255, 255, 255, 0.98)';
            navbar.style.boxShadow = '0 2px 30px rgba(0, 0, 0, 0.15)';
        } else {
            navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
        }
        
        // Hide/show navbar based on scroll direction
        if (currentScrollTop > lastScrollTop && currentScrollTop > 100) {
            // Scrolling down - hide navbar
            if (window.isNavbarVisible) {
                navbar.style.transform = 'translateY(-100%)';
                window.isNavbarVisible = false;
            }
        } else if (currentScrollTop < lastScrollTop) {
            // Scrolling up - show navbar
            if (!window.isNavbarVisible) {
                navbar.style.transform = 'translateY(0)';
                window.isNavbarVisible = true;
            }
        }
        
        lastScrollTop = currentScrollTop;
    });
}

// Smooth scrolling for navigation links
export function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        // Ensure navbar is visible when navigating
        const navbar = document.querySelector('.navbar');
        if (navbar) {
            navbar.style.transform = 'translateY(0)';
            // Reset the navbar visibility state
            window.isNavbarVisible = true;
        }
        
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Close modal when clicking outside of it
export function setupModalClickOutside() {
    window.onclick = function(event) {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (event.target === modal) {
                closeModal(modal.id);
            }
        });
    };
    
    // Close modal with Escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                if (modal.style.display === 'block') {
                    closeModal(modal.id);
                }
            });
        }
    });
}

// Confirmation dialog system
/**
 * Shows a custom confirmation dialog and returns a Promise<boolean>
 * @param {Object} options - Configuration options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Dialog message
 * @param {string} [options.confirmText='Confirm'] - Confirm button text
 * @param {string} [options.cancelText='Cancel'] - Cancel button text
 * @param {string} [options.type='warning'] - Dialog type: 'warning' | 'danger' | 'info'
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 */
export function confirmAction({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'warning' }) {
    return new Promise((resolve) => {
        // Store the element that had focus before modal opened
        const previousActiveElement = document.activeElement;
        
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'modal confirmation-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'confirmation-title');
        modal.setAttribute('aria-describedby', 'confirmation-message');
        
        // Determine icon and colors based on type
        let icon, confirmButtonClass, iconColor;
        switch (type) {
            case 'danger':
                icon = '❌';
                confirmButtonClass = 'btn-confirm-danger';
                iconColor = '#f44336';
                break;
            case 'info':
                icon = 'ℹ️';
                confirmButtonClass = 'btn-confirm-info';
                iconColor = '#2196F3';
                break;
            default: // warning
                icon = '⚠️';
                confirmButtonClass = 'btn-confirm-warning';
                iconColor = '#ff9800';
        }
        
        // Create modal content
        modal.innerHTML = `
            <div class="modal-content confirmation-modal-content">
                <div class="confirmation-modal-header">
                    <div class="confirmation-icon" style="color: ${iconColor}; font-size: 3rem; margin-bottom: 1rem;">
                        ${icon}
                    </div>
                    <h2 id="confirmation-title" class="confirmation-title">${title}</h2>
                    <p id="confirmation-message" class="confirmation-message">${message}</p>
                </div>
                <div class="confirmation-modal-actions">
                    <button class="btn-confirm-cancel" type="button">
                        ${cancelText}
                    </button>
                    <button class="${confirmButtonClass}" type="button" autofocus>
                        ${confirmText}
                    </button>
                </div>
            </div>
        `;
        
        // Get button references
        const confirmButton = modal.querySelector(`.${confirmButtonClass}`);
        const cancelButton = modal.querySelector('.btn-confirm-cancel');
        
        // Cleanup function
        const cleanup = () => {
            // Remove escape key listener
            document.removeEventListener('keydown', handleEscape);
            
            // Remove modal from DOM
            if (modal.parentElement) {
                modal.parentElement.removeChild(modal);
            }
            
            // Restore body scroll
            document.body.style.overflow = '';
            
            // Restore focus to previous element
            if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
                try {
                    previousActiveElement.focus();
                } catch (e) {
                    // Focus might fail if element is no longer in DOM
                    console.log('Could not restore focus:', e);
                }
            }
        };
        
        // Resolve function that cleans up and resolves the promise
        const resolveAndCleanup = (result) => {
            cleanup();
            resolve(result);
        };
        
        // Event handlers
        const handleConfirm = () => {
            console.log('Confirmation dialog: User confirmed');
            resolveAndCleanup(true);
        };
        
        const handleCancel = () => {
            console.log('Confirmation dialog: User cancelled');
            resolveAndCleanup(false);
        };
        
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                handleCancel();
            }
        };
        
        const handleBackdropClick = (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        };
        
        // Focus trap - keep focus within modal
        const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];
        
        const trapFocus = (e) => {
            if (e.key !== 'Tab') return;
            
            if (e.shiftKey) {
                if (document.activeElement === firstFocusable) {
                    e.preventDefault();
                    lastFocusable.focus();
                }
            } else {
                if (document.activeElement === lastFocusable) {
                    e.preventDefault();
                    firstFocusable.focus();
                }
            }
        };
        
        // Attach event listeners
        confirmButton.addEventListener('click', handleConfirm);
        cancelButton.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleBackdropClick);
        document.addEventListener('keydown', handleEscape);
        modal.addEventListener('keydown', trapFocus);
        
        // Add to DOM
        document.body.appendChild(modal);
        
        // Lock body scroll
        document.body.style.overflow = 'hidden';
        
        // Show modal with animation
        requestAnimationFrame(() => {
            modal.style.display = 'block';
            // Focus confirm button
            confirmButton.focus();
        });
    });
}

/**
 * Convenience wrapper for delete confirmations
 * @param {Object} options - Configuration options
 * @param {string} options.itemName - Name of the item being deleted (e.g., "user", "schedule")
 * @param {string} [options.message] - Custom message (optional, will use default if not provided)
 * @param {string} [options.confirmText='Delete'] - Confirm button text
 * @param {string} [options.cancelText='Cancel'] - Cancel button text
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 */
export function confirmDelete({ itemName, message, confirmText = 'Delete', cancelText = 'Cancel' }) {
    const defaultMessage = message || `Are you sure you want to delete this ${itemName}? This action cannot be undone.`;
    
    return confirmAction({
        title: `Delete ${itemName.charAt(0).toUpperCase() + itemName.slice(1)}`,
        message: defaultMessage,
        confirmText,
        cancelText,
        type: 'danger'
    });
}

// Make functions globally accessible for HTML onclick handlers
export function setupGlobalUI() {
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.switchModal = switchModal;
    window.scrollToSection = scrollToSection;
    window.confirmAction = confirmAction;
    window.confirmDelete = confirmDelete;
}
