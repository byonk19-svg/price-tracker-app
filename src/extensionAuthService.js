// Service for managing extension authentication with Supabase
const DEBUG = false;
const logDebug = (...args) => {
  if (DEBUG) console.log(...args);
};

/**
 * Prepares Supabase session for extension use
 * @param {Object} session - Supabase session object
 * @returns {Object} Session object for extension
 */
export function prepareSessionForExtension(session) {
  if (!session || !session.access_token) {
    console.warn('[Extension Auth] No valid session to prepare');
    return null;
  }

  const expiresAt = session.expires_at;
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = expiresAt - now;
  
  logDebug('[Extension Auth] Preparing session:', {
    user: session.user?.email,
    has_access_token: !!session.access_token,
    has_refresh_token: !!session.refresh_token,
    expires_at: new Date(expiresAt * 1000).toLocaleString(),
    time_until_expiry_minutes: Math.floor(timeUntilExpiry / 60)
  });

  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type || 'bearer',
    user: {
      id: session.user.id,
      email: session.user.email,
      user_metadata: session.user.user_metadata
    }
  };
}

/**
 * Sends Supabase session to extension via postMessage
 * @param {Object} sessionData - Prepared session data
 */
export function sendSessionToExtension(sessionData) {
  if (!sessionData) {
    console.warn('[Extension Auth] Cannot send null session');
    return;
  }

  try {
    window.postMessage({
      type: 'PRICE_TRACKER_AUTH',
      source: 'price-tracker-webapp',
      session: sessionData,
      timestamp: Date.now()
    }, window.location.origin);

    logDebug('[Extension Auth] ✓ Sent session to extension:', {
      user: sessionData.user.email,
      expires_at: new Date(sessionData.expires_at * 1000).toLocaleString()
    });
  } catch (error) {
    console.error('[Extension Auth] Error sending session:', error);
  }
}

/**
 * Sends logout message to extension
 */
export function sendLogoutToExtension() {
  try {
    window.postMessage({
      type: 'PRICE_TRACKER_LOGOUT',
      source: 'price-tracker-webapp',
      timestamp: Date.now()
    }, window.location.origin);

    logDebug('[Extension Auth] ✓ Sent logout to extension');
  } catch (error) {
    console.error('[Extension Auth] Error sending logout:', error);
  }
}

/**
 * Main function to sync Supabase session with extension
 * @param {Object} session - Current Supabase session
 */
export function syncSessionWithExtension(session) {
  logDebug('[Extension Auth] syncSessionWithExtension called:', session ? 'HAS SESSION' : 'NO SESSION');
  
  if (session && session.access_token) {
    logDebug('[Extension Auth] Session has access_token, preparing for extension...');
    const sessionData = prepareSessionForExtension(session);
    if (sessionData) {
      logDebug('[Extension Auth] Prepared session, now sending...');
      sendSessionToExtension(sessionData);
    } else {
      console.error('[Extension Auth] Failed to prepare session data');
    }
  } else {
    logDebug('[Extension Auth] No session - sending logout');
    sendLogoutToExtension();
  }
}
