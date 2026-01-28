# Quick Reference: Architecture Lock Implementation

## TL;DR
- **Edge Function = Owner**: All cross-retailer comparison logic now lives in `supabase/functions/compare-item/index.ts`
- **Frontend = UI Only**: Web app and extension removed all search/match logic; only trigger Edge Function
- **Guardrails Added**: `items.compare_status`, unique `offers.(item_id, retailer)`, debug UI with status/attempts
- **No More Duplicates**: Upsert on unique constraint prevents duplicate offers on refresh
- **Visibility**: Debug UI shows compare status, timestamps, confidence, error messages

---

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `PRICE_COMPARE_MIGRATION.sql` | Added `compare_status`, `compare_*` columns; offers table with unique constraint | +14 |
| `src/backendPriceService.js` | Removed 600+ lines of search/match logic; kept only `triggerBackendPriceSearch()` | -600 → +50 |
| `supabase/functions/compare-item/index.ts` | Changed `insertOffer()` → `upsertOffer()` with unique constraint | +3 lines |
| `src/App.jsx` | Compare status badge; prefer offers table; debug shows attempts | Updated UI |
| `MANUAL_TEST_CHECKLIST.md` | 9-test comprehensive checklist for validation | NEW |
| `ARCHITECTURE_LOCK.md` | Full documentation and flow diagrams | NEW |

---

## Database Schema (New)

```sql
-- items table (added columns)
compare_status TEXT (idle|running|done|failed) DEFAULT 'pending'
compare_started_at TIMESTAMPTZ
compare_finished_at TIMESTAMPTZ
compare_last_error TEXT

-- offers table (new, unique constraint)
CREATE TABLE offers (
  id BIGSERIAL PRIMARY KEY,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  retailer TEXT NOT NULL,
  price NUMERIC(10,2),
  product_title TEXT,
  url TEXT,
  image_url TEXT,
  match_confidence DECIMAL(3,2),
  matching_reason TEXT,
  is_match_attempt BOOLEAN DEFAULT FALSE,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT offers_item_retailer_unique UNIQUE(item_id, retailer)  ← KEY
);

-- Indexes
idx_items_compare_status ON items(compare_status)
idx_offers_item_id ON offers(item_id)
idx_offers_checked_at ON offers(checked_at DESC)
```

---

## Function Lifecycle

### `triggerBackendPriceSearch(itemId, productName, supabaseClient, userSession)`
**Location**: `src/backendPriceService.js` (ONLY FUNCTION)

```javascript
1. Set items.compare_status = 'running'
2. Invoke supabaseClient.functions.invoke('compare-item', {itemId, productName})
3. Catch errors → set compare_status = 'failed'
```

**That's it.** No search logic here.

---

### Edge Function: `compare-item`
**Location**: `supabase/functions/compare-item/index.ts` (THE OWNER)

```typescript
1. Receive {itemId, productName}
2. For each retailer in [amazon, walmart, target]:
   a. Search product by name
   b. Extract price, title, image, URL, brand, UPC, model, variants
   c. Match against source product (UPC > brand+model > pack size > title similarity > variants)
   d. If matched: upsertOffer(price, confidence, reason)
   e. If failed: upsertOffer with is_match_attempt=true and reason
3. Update items.compare_status = 'done' (if any match) OR 'failed' (if all fail)
4. Set compare_finished_at = NOW()
5. Set compare_last_error = null OR error message
```

---

## UI Flow

### Compare Status Badge
```
compare_status='idle'       → Badge: "Pending" (gray)
compare_status='running'    → Badge: "Running" (yellow), spinner
compare_status='done'       → Badge: "Done" (green), prices load
compare_status='failed'     → Badge: "Failed" (red), compare_last_error shown
```

### Debug Panel (Toggled with 🐛 button)
```
🐛 Debug Information
─────────────────────────────────────
Compare Status: DONE
Started: 2025-01-23 6:15:30 PM
Finished: 2025-01-23 6:15:45 PM
─────────────────────────────────────

[AMAZON] ✓ Attempt (if attempted)
  URL: https://amazon.com/...
  Title: Apple iPhone 15 Pro...
  Confidence: 85% ✅
  Reason: title similarity: 85%, brand match
  Price: $1299.99
  
[WALMART]
  Confidence: 0% ⚠️
  Reason: Pack size mismatch: 1 vs 2
  Price: —
  
[TARGET] ✓ Attempt
  Confidence: N/A
  Reason: No results
  Price: —
```

---

## Guardrails Explained

### 1. Status Tracking
**Why?** Know when comparison is running, done, or failed
```sql
items.compare_status ← enum: idle|running|done|failed
items.compare_started_at ← when comparison began
items.compare_finished_at ← when comparison ended
items.compare_last_error ← error message if failed
```

### 2. Unique Constraint on Offers
**Why?** Prevent duplicate retailers on refresh/retry
```sql
UNIQUE(item_id, retailer)  ← one offer per retailer per item
```
When you refresh, upsert **replaces** old offer with new one (same checked_at time).

### 3. Attempt Logging
**Why?** Debug visibility into all retailer attempts, not just successes
```sql
offers.is_match_attempt = true  ← for mismatches, no results, failures
offers.matching_reason          ← why it was/wasn't matched
```
Debug UI shows these so you can see "Walmart tried but pack size mismatched" even though no price displays.

### 4. Error Message
**Why?** Troubleshoot failures without Edge Function logs
```sql
items.compare_last_error = "Search failed: timeout" ← UI shows in Debug
```

---

## Testing Checklist (Quick Version)

Run through `MANUAL_TEST_CHECKLIST.md` for full details. Key tests:

- [ ] Create item → compare_status becomes 'running'
- [ ] Wait 30s → compare_status becomes 'done'
- [ ] Debug UI shows status, timestamps, all 3 retailers
- [ ] Refresh → offers upsert (no duplicates)
- [ ] No `searchAmazon`, `searchWalmart`, `searchTarget` in backendPriceService.js
- [ ] Prices display correctly
- [ ] Manual override (✗ button) still works
- [ ] No console errors

---

## Deployment Checklist

- [ ] 1. Run SQL migration in Supabase (PRICE_COMPARE_MIGRATION.sql)
- [ ] 2. Deploy Edge Function: `supabase functions deploy compare-item`
- [ ] 3. Verify Edge Function logs show invocations
- [ ] 4. Restart dev server: `npm run dev`
- [ ] 5. Create test item and watch compare_status transition
- [ ] 6. Run manual test checklist (9 tests, all must pass)

---

## Support / Debugging

### "Item stuck on 'Running'"
- Check Supabase Edge Function logs
- Verify `SUPABASE_SERVICE_ROLE_KEY` in environment
- Confirm `offers` table exists (SQL migration applied)

### "Duplicate offers appearing"
- Verify unique constraint applied: `PRAGMA table_info(offers);`
- Check offers table has constraint `(item_id, retailer) UNIQUE`

### "Debug UI not showing"
- Toggle 🐛 button (top right)
- Click 🐛 next to item
- Verify compare_status not 'pending'

### "Prices not updating on refresh"
- Wait 30 seconds after refresh click
- Check compare_status in Debug UI
- Verify offers table has new data (SQL Editor)

---

## Architecture Summary

```
Web/Extension
  ↓
  addItem() / refreshPrices()
  ↓
  triggerBackendPriceSearch() ← ONE FUNCTION, only triggers Edge
  ↓
  supabaseClient.functions.invoke('compare-item')
  ↓
  Edge Function (THE OWNER)
    • searches retailers
    • matches products
    • upserts offers
    • updates status
  ↓
  Database (items, offers, price_snapshots)
  ↓
  UI (shows status, prices, debug info)
```

**Key Principle**: Edge Function is the single source of truth. All comparison logic lives there. Frontend is UI only.

