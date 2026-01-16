<?php
/**
 * Firebase ID Token Verification Middleware
 * 
 * Verifies Firebase ID tokens from Authorization header.
 * Returns uid on success, exits with 401 on failure.
 */

// Prevent direct access
if (!defined('FIREBASE_INIT')) {
    require_once __DIR__ . '/../_config/firebase.php';
}

use Kreait\Firebase\Exception\Auth\FailedToVerifyToken;

/**
 * Verify Firebase ID token from request
 * 
 * @return string User UID
 * @throws Exception If token is invalid or missing
 */
function verifyFirebaseToken(): string {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? null;
    
    if (!$authHeader) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => 'Missing Authorization header'
        ]);
        exit;
    }
    
    // Extract token from "Bearer <token>"
    if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        $idToken = $matches[1];
    } else {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => 'Invalid Authorization header format. Expected: Bearer <token>'
        ]);
        exit;
    }
    
    try {
        $auth = FirebaseConfig::getAuth();
        $verifiedToken = $auth->verifyIdToken($idToken);
        $uid = $verifiedToken->claims()->get('sub');
        
        return $uid;
    } catch (FailedToVerifyToken $e) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => 'Invalid or expired token',
            'details' => $e->getMessage()
        ]);
        exit;
    } catch (Exception $e) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => 'Token verification failed',
            'details' => $e->getMessage()
        ]);
        exit;
    }
}

/**
 * Verify cron job secret (for background jobs)
 * 
 * @param string $providedSecret Secret provided in request
 * @return bool True if valid
 */
function verifyCronSecret($providedSecret): bool {
    $expectedSecret = getenv('CRON_SECRET') ?: 'your-secret-key-change-this';
    
    if (empty($providedSecret)) {
        return false;
    }
    
    return hash_equals($expectedSecret, $providedSecret);
}
