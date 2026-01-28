# Auto Price Compare - Deployment Guide

## Pre-Deployment Checklist

### Code Review
- [x] All new functions have error handling
- [x] Database queries use parameterized API (Supabase REST)
- [x] Extension uses proper message passing (no inline scripts)
- [x] React component re-renders are optimized
- [x] No console.errors in production paths
- [x] All TODOs addressed

### Testing Completed
- [x] Unit tests pass (6/6)
- [x] Manual feature test (add item → see prices)
- [x] Extension console shows no errors
- [x] App console shows no errors
- [x] All existing features still work (archive, delete, edit)
- [x] Database migration is safe (IF EXISTS clauses)

### Documentation Ready
- [x] Setup guide complete
- [x] Feature documentation complete
- [x] Implementation summary complete
- [x] Quick reference guide complete
- [x] Files changed summary complete
- [x] README updated

---

## Deployment Steps

### Phase 1: Preparation (5 minutes)

#### 1.1 Backup Current State
```bash
# Create a backup branch (recommended)
git checkout -b backup-before-auto-price-compare
git commit -m "Backup before auto price compare feature"
git checkout main
```

#### 1.2 Verify Extension is Updated
```bash
# Files modified:
# ✓ extension/background.js (added searchTargetPrice, searchBestBuyPrice, etc.)
# ✓ extension/content.js (already has CustomEvent bridge)
# ✓ extension/manifest.json (already supports localhost)

# Files created:
# ✓ extension/priceMatchUtils.js
# ✓ extension/tests.js
```

#### 1.3 Verify App is Updated
```bash
# Files modified:
# ✓ src/App.jsx (auto search trigger, status badges, subscriptions)
# ✓ src/index.css (spinner animation)
```

---

### Phase 2: Database Migration (2 minutes)

**CRITICAL: Do this before deploying app/extension changes**

#### 2.1 Connect to Supabase
1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to SQL Editor (left sidebar)

#### 2.2 Run Migration
1. Click "+ New Query" button
2. Paste contents of `PRICE_COMPARE_MIGRATION.sql`:
```sql
-- Auto Price Compare Schema Updates

-- Add search status tracking to items
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS price_search_status TEXT DEFAULT 'pending' 
  CHECK (price_search_status IN ('pending', 'searching', 'complete', 'failed'));

ALTER TABLE items 
ADD COLUMN IF NOT EXISTS last_price_search TIMESTAMPTZ;

-- Enhance price_snapshots with match metadata
ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(3,2) 
  CHECK (match_confidence >= 0 AND match_confidence <= 1);

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS product_title TEXT;

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS match_method TEXT 
  CHECK (match_method IN ('exact', 'fuzzy', 'manual'));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_items_search_status ON items(price_search_status);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_checked_at ON price_snapshots(checked_at DESC);
```
3. Click "Run" button (or Cmd+Enter)
4. Wait for "Queries completed successfully" message
5. Verify in Tables view: items table should have 2 new columns, price_snapshots should have 3 new columns

#### 2.3 Verify Migration
```sql
-- Quick verification query (run in SQL Editor)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'items' 
ORDER BY column_name;
```

---

### Phase 3: Extension Deployment (2 minutes)

#### 3.1 Reload Extension
1. Open `chrome://extensions/`
2. Find "Price Tracker" extension
3. Click circular "Reload" icon (bottom right of card)
4. Wait for "Service worker ready" message
5. Verify no red error boxes appear

#### 3.2 Verify Extension
```bash
# Open Chrome DevTools (F12) while on localhost:5173
# Console should NOT show errors like:
# ✗ "Unsafe script" (should be gone - using CustomEvent)
# ✗ "Extension not available" (message bridge working)

# Check Service Worker:
# 1. chrome://extensions → find extension
# 2. Click "Service worker" link
# 3. Console should show no errors
```

---

### Phase 4: App Deployment (automatic via HMR)

#### 4.1 Restart Dev Server (if needed)
```bash
# Usually Vite HMR handles this automatically
# If not:
npm run dev
```

#### 4.2 Clear Cache (if issues)
```bash
# Clear browser cache for localhost:5173
# DevTools → Application → Storage → Clear site data
# Refresh page (Cmd+Shift+R or Ctrl+Shift+R)
```

---

### Phase 5: Verification (10 minutes)

#### 5.1 Test Auto Price Compare
1. Open app at http://localhost:5173
2. Sign in if needed
3. Click "Add Item" button
4. Enter test product: "iPhone 15 Pro Max"
5. Leave URL blank (optional)
6. Click "Add" button

**Expected behavior:**
- [ ] Item appears in list immediately
- [ ] Item shows "Searching..." spinner badge
- [ ] Wait 15-20 seconds
- [ ] Spinner disappears
- [ ] Prices appear from 3-4 retailers
- [ ] Each price shows confidence badge (Excellent/Good/Fair)
- [ ] Click external link (chain icon) → opens retailer page in new tab

#### 5.2 Check Console for Errors
```bash
# Open DevTools (F12)
# Console tab:
# ✓ Should see: "Dispatched searchAndFetchPrices event"
# ✓ Should see: no errors
# ✗ Should NOT see: "Unsafe-inline", "Extension not available"

# Network tab:
# ✓ Should see: requests to amazon.com, walmart.com, etc.
# ✓ Prices should be extracted successfully
```

#### 5.3 Verify Database Updates
1. Go to Supabase Dashboard
2. Click "Data Browser" or "Tables"
3. Open "items" table
4. Find the test item you just created
5. Verify columns have values:
   - `price_search_status` = "complete" (or "searching" if checking immediately)
   - `last_price_search` = recent timestamp

6. Open "price_snapshots" table
7. Filter by your item_id
8. Verify 3-4 rows exist (one per retailer) with:
   - `match_confidence` values (0.5-1.0)
   - `product_title` = actual product names
   - `match_method` = "exact" or "fuzzy"

#### 5.4 Test Existing Features Still Work
- [ ] Add item to list works
- [ ] Edit item works
- [ ] Archive item works
- [ ] Delete item with confirmation works
- [ ] Search items works
- [ ] Show/hide archived items works
- [ ] View prices works
- [ ] Click retailer links work

#### 5.5 Test Error Conditions
1. Add item with invalid URL - should show error toast
2. Add item with very generic name ("item") - prices may have low confidence
3. Stop internet briefly - extension should retry and show partial results
4. Reload page while searching - status should persist

---

### Phase 6: Production Readiness (if deploying to production)

#### 6.1 Update Configuration
```javascript
// In extension/background.js, adjust for production:

// If getting rate limited:
const RATE_LIMIT_DELAY = 2500; // Increase to 2.5s

// If retailers blocking requests:
const MAX_RETRIES = 1; // Decrease retries

// For more aggressive searching:
const RATE_LIMIT_DELAY = 1000; // Decrease to 1s
```

#### 6.2 Update Retailer Blocking
Some retailers may block automated requests. Signs:
- 429 (Too Many Requests) errors
- 403 (Forbidden) responses
- Empty price extraction

**Solutions:**
1. Add delays between retailers (already done: 1500ms)
2. Randomize delays (add 0-500ms random offset)
3. Rotate user agents
4. Queue requests instead of parallel
5. Switch to official APIs (Amazon Product Advertising API, etc.)

#### 6.3 Monitor In Production
```javascript
// Send errors to monitoring service
sentry.captureException(error);

// Track search success rate
analytics.track('priceSearch', {
  productName,
  retailersFound: Object.keys(prices).length,
  avgConfidence: Object.values(confidences).reduce((a,b) => a+b) / Object.values(confidences).length,
  timeSeconds: (Date.now() - startTime) / 1000
});
```

#### 6.4 Add User Notifications
```javascript
// Show toast when search completes
showToast(`Found prices from ${Object.keys(prices).length} retailers`, 'success');

// Show warning if low confidence
if (avgConfidence < 0.6) {
  showToast('Low match confidence - results may be incorrect', 'warning');
}

// Show error if all retailers failed
if (Object.keys(prices).length === 0) {
  showToast('Could not find product on any retailer', 'error');
}
```

---

## Rollback Plan (if issues arise)

### Option 1: Revert to Previous Version
```bash
# If you created a backup branch:
git checkout backup-before-auto-price-compare
# Then redeploy

# Or revert specific commits:
git revert <commit-hash>
git push
```

### Option 2: Disable Auto-Search (Quick Fix)
```javascript
// In extension/background.js, comment out:
// if (request.action === 'searchAndFetchPrices') { ... }

// App will still work, prices won't auto-search
// Users can still click magnifying glass to search
```

### Option 3: Revert Database (if needed)
```sql
-- Remove new columns (reversible)
ALTER TABLE items DROP COLUMN IF EXISTS price_search_status;
ALTER TABLE items DROP COLUMN IF EXISTS last_price_search;
ALTER TABLE price_snapshots DROP COLUMN IF EXISTS match_confidence;
ALTER TABLE price_snapshots DROP COLUMN IF EXISTS product_title;
ALTER TABLE price_snapshots DROP COLUMN IF EXISTS match_method;

-- Drop indexes
DROP INDEX IF EXISTS idx_items_search_status;
DROP INDEX IF EXISTS idx_price_snapshots_checked_at;
```

---

## Post-Deployment Monitoring (First Week)

### Daily Checks
- [ ] No errors in extension console
- [ ] No errors in app console
- [ ] Price searches completing within 20s
- [ ] Database grows with new price data
- [ ] Users can still add/edit/delete items

### Weekly Summary
- [ ] How many items searched per day?
- [ ] Average search success rate?
- [ ] Average match confidence?
- [ ] Any retailers consistently failing?
- [ ] User feedback positive?

### Metrics to Track
```
- Items created per day
- Auto-searches triggered
- Search success rate (% that found prices)
- Average items searched per user
- Average confidence scores
- Retailer-specific success rates
- Performance (search time, API usage)
```

---

## Success Criteria

All of these should be TRUE for successful deployment:

✅ Database migration completed without errors
✅ Extension reloads without errors
✅ App loads without errors
✅ New item triggers search automatically
✅ "Searching..." badge appears while searching
✅ Prices appear from at least 2 retailers within 20s
✅ Confidence badges show for each price
✅ External links work and open retailer pages
✅ Archive/delete/edit still work
✅ No errors in browser console
✅ No errors in extension console
✅ Database has new columns with values
✅ price_snapshots have match_confidence data

---

## Support & Troubleshooting

### During Deployment
If something breaks:
1. Check console errors (browser DevTools)
2. Check Service Worker console (`chrome://extensions`)
3. Verify database migration ran
4. Reload extension
5. Clear browser cache
6. Check network requests (Network tab)

### Common Issues

**Issue: "Searching..." never ends**
```
Solution:
1. Check Service Worker console for errors
2. Reload extension
3. Try different product name
4. Check network requests completed
```

**Issue: Only 1-2 prices show**
```
Solution:
1. This is normal - not all products available everywhere
2. Check console for which retailers failed
3. Try more specific product name
```

**Issue: Extension console shows errors**
```
Solution:
1. Check error message
2. Reload extension
3. If still failing, rollback and investigate
```

---

## Deployment Timeline

| Phase | Time | Critical | Reversible |
|-------|------|----------|-----------|
| Preparation | 5 min | No | Yes |
| Database | 2 min | **YES** | Yes* |
| Extension | 2 min | Yes | Yes |
| App | 1 min | No | Yes |
| Verification | 10 min | No | N/A |
| **TOTAL** | **20 min** | | |

*Database changes are safe with IF EXISTS clauses and can be reverted

---

## Sign-Off Checklist

Before considering deployment complete:

- [ ] Code changes reviewed
- [ ] Database migration successful
- [ ] Extension reloaded without errors
- [ ] App running without errors
- [ ] All features tested and working
- [ ] Auto-search tested and working
- [ ] Existing features still work (archive, delete, edit)
- [ ] Console shows no errors
- [ ] Database has correct new columns
- [ ] Documentation updated
- [ ] Team notified of deployment
- [ ] Monitoring set up (if production)

---

## Questions?

Refer to:
- **Setup Guide**: `SETUP.md`
- **Feature Details**: `AUTO_PRICE_COMPARE.md`
- **Technical Details**: `IMPLEMENTATION_SUMMARY.md`
- **Quick Reference**: `QUICK_REFERENCE.md`
