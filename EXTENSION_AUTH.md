# Extension Authentication Implementation - COMPLETE

## ✅ Implementation Complete

The extension now uses **Supabase session handshake** from web app to extension. No cookie reading, no localStorage access - just clean postMessage communication.

---

## 🔄 Authentication Flow

```
┌─────────────────────┐
│ User Signs Into     │
│ Web App (Supabase)  │
└──────────┬──────────┘
           │
           ▼
┌────────────────────────────────┐
│ App.jsx detects session change │
│ via supabase.auth.onAuthState  │
└──────────┬─────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ extensionAuthService.js                 │
│ • Gets session with access_token        │
│ • Sends via window.postMessage()        │
│ • Logs session details & expiration     │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ content.js (Content Script)             │
│ • Listens for postMessage               │
│ • Validates origin & source             │
│ • Forwards session to background        │
│ • Logs receipt                          │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ background.js (Service Worker)          │
│ • Stores in chrome.storage.local        │
│ • Key: 'supabaseSession'                │
│ • Checks expiration on retrieval        │
│ • Uses for Authorization: Bearer        │
│ • Logs expiration warnings              │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ popup.js (Extension UI)                 │
│ • Requests session from background      │
│ • Checks if expired                     │
│ • Shows data if valid                   │
│ • Shows login prompt if missing/expired │
│ • No "Please sign in" errors on 401     │
└─────────────────────────────────────────┘
```

---

## 📁 Exact Code Implementation

### 1. Web App - Session Sender (`src/extensionAuthService.js`)

```javascript
// Service for managing extension authentication with Supabase
import { supabase } from './supabaseClient';

export function prepareSessionForExtension(session) {
  if (!session || !session.access_token) {
    console.warn('[Extension Auth] No valid session to prepare');
    return null;
  }

  const expiresAt = session.expires_at;
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = expiresAt - now;
  
  console.log('[Extension Auth] Preparing session:', {
    user: session.user?.email,
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

export function sendSessionToExtension(sessionData) {
  if (!sessionData) return;

  window.postMessage({
    type: 'PRICE_TRACKER_AUTH',
    source: 'price-tracker-webapp',
    session: sessionData,
    timestamp: Date.now()
  }, window.location.origin); // Same origin only

  console.log('[Extension Auth] ✓ Sent session to extension');
}

export function sendLogoutToExtension() {
  window.postMessage({
    type: 'PRICE_TRACKER_LOGOUT',
    source: 'price-tracker-webapp',
    timestamp: Date.now()
  }, window.location.origin);

  console.log('[Extension Auth] ✓ Sent logout to extension');
}

export function syncSessionWithExtension(session) {
  console.log('[Extension Auth] Syncing:', session ? 'authenticated' : 'logged out');
  
  if (session && session.access_token) {
    const sessionData = prepareSessionForExtension(session);
    if (sessionData) {
      sendSessionToExtension(sessionData);
    }
  } else {
    sendLogoutToExtension();
  }
}
```

### 2. Web App - Integration (`src/App.jsx`)

```javascript
import { syncSessionWithExtension } from './extensionAuthService';

// In your useEffect:
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
    setLoading(false);
    // Send session to extension on initial load
    syncSessionWithExtension(session);
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
    // Sync session changes with extension
    syncSessionWithExtension(session);
  });

  return () => subscription.unsubscribe();
}, []);
```

### 3. Content Script - Message Bridge (`extension/content.js`)

```javascript
// Only on localhost
const isLocalApp = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if (isLocalApp) {
  window.addEventListener('message', (event) => {
    // Validate origin
    if (event.origin !== window.location.origin) return;
    
    const message = event.data;
    if (!message || message.source !== 'price-tracker-webapp') return;
    
    // Handle auth
    if (message.type === 'PRICE_TRACKER_AUTH') {
      console.log('[Content Script] Received Supabase session');
      
      chrome.runtime.sendMessage({ 
        action: 'storeSupabaseSession', 
        session: message.session 
      }, (response) => {
        console.log('[Content Script] ✓ Session forwarded:', response);
      });
    }
    
    // Handle logout
    if (message.type === 'PRICE_TRACKER_LOGOUT') {
      console.log('[Content Script] Received logout');
      
      chrome.runtime.sendMessage({ 
        action: 'clearSupabaseSession' 
      }, (response) => {
        console.log('[Content Script] ✓ Logout forwarded:', response);
      });
    }
  });
}
```

### 4. Background Script - Session Storage (`extension/background.js`)

```javascript
// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Store Supabase session
  if (request.action === 'storeSupabaseSession') {
    const session = request.session;
    
    if (!session || !session.access_token) {
      sendResponse({ success: false, message: 'Invalid session' });
      return true;
    }
    
    const expiresAt = session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    
    console.log('[Background] Storing Supabase session:', {
      user: session.user?.email,
      expires_at: new Date(expiresAt * 1000).toLocaleString(),
      time_until_expiry_minutes: Math.floor((expiresAt - now) / 60)
    });
    
    chrome.storage.local.set({ 
      supabaseSession: session,
      sessionStoredAt: Date.now()
    }, () => {
      console.log('[Background] ✓ Session stored');
      sendResponse({ success: true, message: 'Session stored' });
    });
    return true;
  }
  
  // Clear session
  if (request.action === 'clearSupabaseSession') {
    chrome.storage.local.remove(['supabaseSession', 'sessionStoredAt'], () => {
      console.log('[Background] ✓ Session cleared');
      sendResponse({ success: true });
    });
    return true;
  }
  
  // Get session
  if (request.action === 'getSupabaseSession') {
    getStoredSupabaseSession().then(session => {
      if (session) {
        const now = Math.floor(Date.now() / 1000);
        const isExpired = session.expires_at && session.expires_at < now;
        
        if (isExpired) {
          console.warn('[Background] ⚠ Session expired');
        }
        
        sendResponse({ success: true, session, isExpired });
      } else {
        sendResponse({ success: false, session: null });
      }
    });
    return true;
  }
});

// Session retrieval with expiration check
function getStoredSupabaseSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['supabaseSession'], (result) => {
      const session = result.supabaseSession;
      
      if (!session) {
        console.log('[Background] No stored session');
        resolve(null);
        return;
      }
      
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = session.expires_at;
      
      if (expiresAt && expiresAt < now) {
        console.warn('[Background] ⚠ Session expired at:', new Date(expiresAt * 1000));
      } else {
        const timeLeft = Math.floor((expiresAt - now) / 60);
        console.log('[Background] Session valid, expires in:', timeLeft, 'min');
      }
      
      resolve(session);
    });
  });
}
```

### 5. Using Session for API Calls (`extension/background.js`)

```javascript
async function checkAllPrices() {
  const session = await getStoredSupabaseSession();
  
  if (!session) {
    console.log('[Background] No session - cannot check prices');
    return;
  }
  
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at < now) {
    console.error('[Background] Session expired - please sign in via web app');
    return;
  }
  
  // Use access_token for API calls
  const response = await fetch(`${SUPABASE_URL}/rest/v1/items?select=*`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`, // ← Use session token
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    console.error('[Background] API call failed:', response.status);
    return;
  }
  
  const items = await response.json();
  // ... process items
}
```

### 6. Popup - Session Check (`extension/popup.js`)

```javascript
async function getSupabaseSession() {
  console.log('[Popup] Requesting session...');
  
  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getSupabaseSession' }, resolve);
  });
  
  if (!response || !response.success || !response.session) {
    console.log('[Popup] No session available');
    return null;
  }
  
  // Check if expired
  if (response.isExpired) {
    console.warn('[Popup] ⚠ Session expired');
    return null; // Treat as no session
  }
  
  console.log('[Popup] ✓ Valid session:', response.session.user?.email);
  return response.session;
}

// On popup load
document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSupabaseSession();
  
  if (!session) {
    showLoginPrompt(); // Shows "Sign in via web app" button
    return;
  }
  
  // Session valid - load data
  userSession = session;
  await loadLists();
});
```

---

## 🔐 Security

✅ **Secure:**
- postMessage only accepts same-origin messages
- Content script validates `message.source`
- Extension isolates storage in `chrome.storage.local`
- Tokens stored only in extension context
- No cookie or localStorage reading

⚠️ **Future Enhancements:**
- Implement refresh token rotation
- Add nonce to prevent replay attacks
- Periodic background token refresh

---

## 🧪 Testing Steps

1. **Start web app:** `npm run dev`
2. **Load extension:** Chrome → `chrome://extensions` → Load unpacked → `extension` folder
3. **Sign in:** Visit http://localhost:5173 and sign in
4. **Check logs:**
   - Web app console: `[Extension Auth] ✓ Sent session to extension`
   - Extension background console: `[Background] ✓ Session stored`
5. **Open popup:** Should show your lists, NOT login prompt
6. **Test logout:** Sign out from web app
7. **Reopen popup:** Should now show login prompt

---

## 📊 Logging Reference

| Component | Log Prefix | Key Messages |
|-----------|------------|--------------|
| Web App | `[Extension Auth]` | Session prep, send, logout |
| Content Script | `[Content Script]` | Message received, forwarded |
| Background | `[Background]` | Session stored, expiration, API calls |
| Popup | `[Popup]` | Session request, validity, errors |

---

## 🐛 Troubleshooting

**"No session available"**
- Check web app console for `[Extension Auth] ✓ Sent session`
- Verify content script is running on localhost
- Check background console for `[Background] ✓ Session stored`

**"Session expired"**
- Session expires based on Supabase settings (default: 1 hour)
- Refresh web app page while signed in to get new session
- Future: Implement auto-refresh

**401 Unauthorized on API calls**
- Session expired - sign in again via web app
- Check `[Background] Session expired` logs
- Verify `Authorization: Bearer ${session.access_token}` is used

**Extension not syncing**
- Ensure web app is running on localhost:5173
- Content script only runs on localhost/127.0.0.1
- Check both web app and extension consoles for errors
