# Manual Test Checklist: Architecture Lock & Guardrails

## Test Objectives
- ✅ Verify that only the Supabase Edge Function owns cross-retailer comparison
- ✅ Ensure web app and extension do NOT contain comparison logic
- ✅ Validate compare_status lifecycle (idle → running → done/failed)
- ✅ Confirm offers table uses upsert and unique constraint (item_id, retailer)
- ✅ Debug UI shows compare status, attempts, confidence, and errors
- ✅ No regression: prices display correctly, manual overrides still work

---

## Pre-Test Setup
1. Run SQL migration: `PRICE_COMPARE_MIGRATION.sql` in Supabase SQL editor
2. Deploy Edge Function: `supabase functions deploy compare-item`
3. Clear browser cache and restart dev server: `npm run dev`
4. Verify Supabase project connected and Edge Function logs available

---

## Test Suite

### Test 1: Single Item Creation & Compare Job Triggers
**Objective**: Item creation sets status='running' and invokes Edge Function immediately

**Steps**:
1. Sign in to app
2. Create a new list (if needed)
3. Add a new item: `"Apple iPhone 15 Pro"`
4. Observe item appears with "Compare: Running" badge

**Expected Results**:
- ✅ Item created in `items` table with `compare_status='running'`
- ✅ `compare_started_at` timestamp set
- ✅ Edge Function invoked (check Supabase function logs)
- ✅ Badge shows "Running" status in yellow/orange

**Verification Commands** (in Supabase SQL Editor):
```sql
SELECT id, name, compare_status, compare_started_at, compare_finished_at
FROM items
WHERE name = 'Apple iPhone 15 Pro'
LIMIT 1;

-- Should show: compare_status='running', compare_started_at set, compare_finished_at=null
```

---

### Test 2: Edge Function Completes & Status Updates to Done
**Objective**: Edge Function searches retailers, upserts offers, updates status to 'done'

**Steps**:
1. From Test 1: Wait 10-30 seconds for Edge Function to complete
2. Refresh the page (or watch real-time updates)
3. Item badge should change from "Running" to "Done" in green

**Expected Results**:
- ✅ Item `compare_status` updates to 'done'
- ✅ `compare_finished_at` timestamp set
- ✅ Offers inserted/upserted in `offers` table (max 3: amazon, walmart, target)
- ✅ Prices display in item card (best price highlighted)
- ✅ Badge shows "Done" status in green

**Verification Commands**:
```sql
SELECT id, compare_status, compare_finished_at, compare_last_error
FROM items
WHERE name = 'Apple iPhone 15 Pro'
LIMIT 1;

-- Should show: compare_status='done', compare_finished_at set, compare_last_error=null

SELECT retailer, price, match_confidence, is_match_attempt, checked_at
FROM offers
WHERE item_id = (SELECT id FROM items WHERE name = 'Apple iPhone 15 Pro' LIMIT 1)
ORDER BY checked_at DESC;

-- Should show 1-3 rows per retailer with prices and confidence scores
```

---

### Test 3: Debug Mode Shows Compare Metadata
**Objective**: Debug panel displays status, timestamps, errors, and retailer attempts

**Steps**:
1. Toggle "🐛 Debug: ON" button in header
2. Click debug button (🐛) next to item from Test 1
3. Observe Debug panel with:
   - Compare Status, Started, Finished timestamps
   - List of retailer attempts with confidence & match reason
   - Price, product title, URL for each retailer

**Expected Results**:
- ✅ Debug panel shows:
  - Compare Status: "DONE"
  - Started timestamp (ISO format or localized)
  - Finished timestamp (ISO format or localized)
  - No error message (compare_last_error=null)
  - Retailer rows showing:
    - Retailer name (AMAZON, WALMART, TARGET)
    - Confidence % with emoji (✅ if ≥75%, ⚠️ if <75%)
    - Matching reason (e.g., "title similarity: 85%", "Exact UPC match")
    - Price (or "—" if no match)
    - Product title
    - URL (if matched)

**Manual Inspection**:
- Toggle debug ON/OFF without error
- Scroll debug panel smoothly
- No console errors in DevTools

---

### Test 4: Offers Upsert (Unique Constraint)
**Objective**: Updating an item twice overwrites offers (upsert), not duplicates

**Steps**:
1. From Test 2: Item has offers for amazon, walmart, target
2. Click refresh (🔄) button next to item
3. Wait 10-30 seconds for comparison to complete
4. Observe same offers overwritten (not duplicated)

**Expected Results**:
- ✅ Second run updates offers with new timestamps
- ✅ No duplicate (item_id, retailer) rows in offers table
- ✅ `checked_at` timestamp refreshed on upsert
- ✅ Prices may differ slightly, but counts stay at 3 max

**Verification Commands**:
```sql
SELECT COUNT(*) as total_offers, COUNT(DISTINCT retailer) as unique_retailers
FROM offers
WHERE item_id = (SELECT id FROM items WHERE name = 'Apple iPhone 15 Pro' LIMIT 1);

-- Should show: total_offers=3 (or fewer if some retailers no match), unique_retailers≤3

SELECT retailer, price, checked_at
FROM offers
WHERE item_id = (SELECT id FROM items WHERE name = 'Apple iPhone 15 Pro' LIMIT 1)
ORDER BY retailer;

-- Verify checked_at is recent (last run time)
```

---

### Test 5: Compare Failure Handled Gracefully
**Objective**: If Edge Function fails, status updates to 'failed' and error logged

**Steps**:
1. Add an item with unusual/long product name: `"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"`
2. Wait 30 seconds
3. Check item status (may still show "Done" if search found fallback results, or "Failed")

**Expected Results**:
- ✅ If all retailers fail: `compare_status='failed'`, `compare_last_error` contains error message
- ✅ If some succeed: `compare_status='done'`, `compare_last_error=null`
- ✅ Debug panel shows attempts even if no matches (is_match_attempt=true rows)

**Verification Commands**:
```sql
SELECT id, compare_status, compare_last_error, compare_finished_at
FROM items
WHERE name LIKE 'ZZZZ%'
LIMIT 1;

-- Check compare_status and error message

SELECT retailer, is_match_attempt, matching_reason
FROM offers
WHERE item_id = (SELECT id FROM items WHERE name LIKE 'ZZZZ%' LIMIT 1);

-- Should see is_match_attempt=true rows with reasons like "No results", "Search failed: ..."
```

---

### Test 6: No Local Comparison Logic in Frontend
**Objective**: Verify backendPriceService.js only triggers Edge Function, no search logic

**Steps**:
1. Open DevTools (F12) → Sources tab
2. Search in `backendPriceService.js` for keywords: `searchAmazon`, `searchWalmart`, `searchTarget`, `matchProducts`
3. Verify none exist (should only find `triggerBackendPriceSearch` export)

**Expected Results**:
- ✅ No search functions found in backendPriceService.js
- ✅ Only `triggerBackendPriceSearch(itemId, productName, supabaseClient, userSession)` exists
- ✅ Function sets status to 'running' and calls `supabaseClient.functions.invoke('compare-item')`

**Code Inspection**:
- Open `src/backendPriceService.js`
- Verify first ~50 lines have only module documentation and `triggerBackendPriceSearch`
- No `searchAmazonPrice`, `searchWalmartPrice`, `searchTargetPrice` functions
- No `performBackgroundPriceSearch` fallback

---

### Test 7: Manual Override Still Works
**Objective**: "Fix Incorrect Match" button (✗) still functional after architecture lock

**Steps**:
1. From Test 2: View item with matched offers
2. Click ✗ button on a retailer offer (e.g., Walmart)
3. Select "Remove This Offer"
4. Confirm removal

**Expected Results**:
- ✅ Offer removed from `price_snapshots` (manual override still uses price_snapshots)
- ✅ Item display updates (retailer no longer shown)
- ✅ Successful toast notification

**Verification Commands**:
```sql
SELECT COUNT(*) as snapshots_after_removal
FROM price_snapshots
WHERE item_id = (SELECT id FROM items WHERE name = 'Apple iPhone 15 Pro' LIMIT 1)
  AND retailer = 'walmart';

-- Should show 0 or <previous count>
```

---

### Test 8: Extension Does NOT Have Comparison Logic
**Objective**: Confirm extension code does NOT import or use comparison functions

**Steps**:
1. Open `extension/background.js`, `extension/popup.js`, `extension/content.js`
2. Search for keywords: `searchAmazon`, `matchProduct`, `performBackground`, `triggerBackendPriceSearch`
3. Extension should only:
   - Detect prices on pages
   - Create items in Supabase
   - Display notifications (no searching)

**Expected Results**:
- ✅ No comparison logic in extension files
- ✅ Extension creates items and relies on Edge Function
- ✅ No local fetch of Amazon/Walmart/Target in extension

---

### Test 9: Concurrent Refreshes Don't Cause Conflicts
**Objective**: Clicking refresh twice in quick succession doesn't cause race conditions

**Steps**:
1. Create an item (from Test 1)
2. Wait for status='done'
3. Click refresh (🔄) button twice rapidly
4. Wait for both to complete

**Expected Results**:
- ✅ Both Edge Function invocations complete
- ✅ Offers upserted without conflicts
- ✅ Final status='done', single set of offers
- ✅ No error in console or Supabase logs

**Verification Commands**:
```sql
SELECT COUNT(*) as total_calls
FROM offers
WHERE item_id = (SELECT id FROM items WHERE name = 'Apple iPhone 15 Pro' LIMIT 1);

-- Should be 3 (or fewer if no match), not 6 or more
```

---

## Regression Checklist
- [ ] Item creation works (new items appear instantly)
- [ ] Prices display correctly (best price highlighted)
- [ ] Best price calculation accurate across retailers
- [ ] Debug mode toggles without errors
- [ ] No TypeScript/JSX errors in console
- [ ] Edge Function logs visible in Supabase dashboard
- [ ] Offers table has data (can query in SQL editor)
- [ ] Manual override (✗ button) removes offers
- [ ] UI refreshes automatically when status changes
- [ ] No unwanted page reloads during comparison

---

## Clean-Up After Tests
1. Delete test items from app UI
2. (Optional) Verify items deleted from database:
   ```sql
   DELETE FROM items WHERE name LIKE 'Apple%' OR name LIKE 'ZZZZ%';
   ```
3. Clear browser cache: DevTools → Application → Clear site data

---

## Success Criteria
All tests pass if:
- ✅ Items created with `compare_status='running'`
- ✅ Edge Function owns all comparison logic
- ✅ Offers upserted (no duplicates)
- ✅ Debug UI shows status, timestamps, attempts, confidence
- ✅ Status transitions: running → done/failed with correct errors
- ✅ No regression in prices, overrides, or UI responsiveness
- ✅ backendPriceService.js has NO search functions
- ✅ Extension has NO comparison logic

---

## Known Limitations & Future Work
- Edge Function timeouts if search takes >540 seconds (Supabase limit)
- Retailer websites may block or return stale HTML (handled with is_match_attempt flag)
- UPC matching requires correct extraction (varies by retailer HTML structure)
- Extension notifications require manual configuration (not auto-triggered on Edge completion)

