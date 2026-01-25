/**
 * Firebase ID Token Verification Middleware
 * 
 * Verifies Firebase ID tokens from Authorization header.
 * Returns uid on success, throws error on failure.
 */

const FirebaseConfig = require('../_config/firebase');

/**
 * Verify Firebase ID token from request
 * 
 * @param {Object} req - Express request object or object with headers
 * @returns {Promise<string>} User UID
 * @throws {Error} If token is invalid or missing
 */
async function verifyFirebaseToken(req) {
    const authHeader = req.headers?.authorization || req.headers?.Authorization || null;
    
    if (!authHeader) {
        const error = new Error('Missing Authorization header');
        error.statusCode = 401;
        throw error;
    }
    
    // Extract token from "Bearer <token>"
    const match = authHeader.match(/Bearer\s+(.*)$/i);
    if (!match) {
        const error = new Error('Invalid Authorization header format. Expected: Bearer <token>');
        error.statusCode = 401;
        throw error;
    }
    
    const idToken = match[1];
    
    try {
        const auth = FirebaseConfig.getAuth();
        const decodedToken = await auth.verifyIdToken(idToken);
        const uid = decodedToken.uid;
        
        return uid;
    } catch (error) {
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
            const err = new Error('Invalid or expired token');
            err.statusCode = 401;
            err.details = error.message;
            throw err;
        }
        
        const err = new Error('Token verification failed');
        err.statusCode = 500;
        err.details = error.message;
        throw err;
    }
}

/**
 * Express middleware for token verification
 */
function verifyTokenMiddleware(req, res, next) {
    verifyFirebaseToken(req)
        .then(uid => {
            req.uid = uid;
            next();
        })
        .catch(error => {
            res.status(error.statusCode || 401).json({
                success: false,
                error: error.message,
                details: error.details
            });
        });
}

/**
 * Verify cron job secret (for background jobs)
 * 
 * @param {string} providedSecret - Secret provided in request
 * @returns {boolean} True if valid
 */
function verifyCronSecret(providedSecret) {
    const expectedSecret = process.env.CRON_SECRET || 'your-secret-key-change-this';
    
    if (!providedSecret) {
        return false;
    }
    
    // Use crypto.timingSafeEqual for constant-time comparison
    const crypto = require('crypto');
    const providedBuffer = Buffer.from(providedSecret);
    const expectedBuffer = Buffer.from(expectedSecret);
    
    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }
    
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

module.exports = {
    verifyFirebaseToken,
    verifyTokenMiddleware,
    verifyCronSecret
};
