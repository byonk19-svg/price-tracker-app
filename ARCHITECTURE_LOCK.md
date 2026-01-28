# Architecture Lock: Cross-Retailer Comparison

## Overview
This refactor **locks the architecture** so the Supabase Edge Function is the **single owner** of cross-retailer price comparison. The web app and extension can only create items and request a compare run—no comparison logic exists in the frontend.

---

## Changes Made

### 1. Schema & Database Guardrails
**File**: `PRICE_COMPARE_MIGRATION.sql`

#### Guardrail 1: Compare Status Tracking
Added to `items` table:
- `compare_status` (idle/running/done/failed) — lifecycle state
- `compare_started_at` — UTC timestamp when comparison begins
- `compare_finished_at` — UTC timestamp when comparison completes
- `compare_last_error` — error message if failed (null if done)

#### Guardrail 2: Offers Table with Unique Constraint
```sql
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
  CONSTRAINT offers_item_retailer_unique UNIQUE(item_id, retailer)
);
```

**Key**: Unique constraint `(item_id, retailer)` enables safe **upsert** — no duplicates, always latest data.

#### Guardrail 3: Indexes for Performance
- `idx_offers_item_id` — fast lookup by item
- `idx_offers_checked_at` — sort recent offers first
- `idx_items_compare_status` — fast status queries

---

### 2. Backend Service Locked Down
**File**: `src/backendPriceService.js`

**BEFORE**: 687 lines with search functions (Amazon, Walmart, Target), matching logic, extraction functions.

**AFTER**: ~50 lines with single export:

```javascript
export async function triggerBackendPriceSearch(itemId, productName, supabaseClient, userSession) {
  // 1. Set status to 'running'
  await supabaseClient.from('items').update({
    compare_status: 'running',
    compare_started_at: new Date().toISOString(),
    compare_finished_at: null,
    compare_last_error: null
  }).eq('id', itemId);

  // 2. Invoke Edge Function (single owner of comparison logic)
  try {
    await supabaseClient.functions.invoke('compare-item', { body: { itemId, productName } });
  } catch (err) {
    // Mark as failed if function can't be invoked
    await supabaseClient.from('items').update({
      compare_status: 'failed',
      compare_finished_at: new Date().toISOString(),
      compare_last_error: `Function invocation failed: ${err?.message}`
    }).eq('id', itemId);
  }
}
```

**Removed**:
- ❌ `searchAmazonPrice()`
- ❌ `searchWalmartPrice()`
- ❌ `searchTargetPrice()`
- ❌ `matchProductsAcrossRetailers()`
- ❌ `performBackgroundPriceSearch()`
- ❌ All HTML parsing / extraction functions

**Remaining**: Only `triggerBackendPriceSearch()` which is a thin wrapper that invokes the Edge Function.

---

### 3. Edge Function Owns All Logic
**File**: `supabase/functions/compare-item/index.ts`

The function:
1. **Sets status='running'** on invocation
2. **Searches** Amazon, Walmart, Target
3. **Matches** products across retailers (UPC, brand, model, title similarity)
4. **Upserts offers** using constraint `(item_id, retailer)` — safe, no duplicates
5. **Logs attempts** (mismatches, no results, failures) with `is_match_attempt=true`
6. **Updates status** to 'done' or 'failed' with timestamps and error message

**Key Change**: Uses **upsert** instead of insert:
```typescript
async function upsertOffer(itemId: string, retailer: string, payload: any) {
  await supabase.from("offers").upsert(
    { item_id: itemId, retailer, price, ... },
    { onConflict: "item_id,retailer" }
  );
}
```

Prevents duplicates; refreshes `checked_at` on each run.

---

### 4. Web App Only Requests Comparisons
**File**: `src/App.jsx`

Frontend flow:
1. **addItem()**: Create item, set `compare_status='running'`, call `triggerBackendPriceSearch()`
2. **refreshPrices()**: Same flow (no local search)
3. **loadItems()**: Prefers `offers` table (if exists), fallback to `price_snapshots`
4. **loadDebugInfo()**: Shows `offers` for latest data
5. **Debug UI**: Displays compare status, timestamps, attempts, confidence

**Removed**: No local comparison logic; web app purely renders UI.

---

### 5. Debug UI Enhancements
**File**: `src/App.jsx`

#### Compare Status Badge
```jsx
<span className={`text-xs font-semibold px-2 py-1 rounded ${compareBadge.className}`}>
  Compare: {compareBadge.text}
</span>
```

Shows: **Running** (yellow), **Done** (green), **Failed** (red), **Pending** (gray)

#### Debug Panel (when toggled ON)
```
🐛 Debug Information
┌─────────────────────────────────────────┐
│ Compare Status: DONE                    │
│ Started: 2025-01-23 10:15:30 PM        │
│ Finished: 2025-01-23 10:15:45 PM       │
└─────────────────────────────────────────┘

[AMAZON] ✓ Attempt
  Confidence: 85% ✅
  Reason: title similarity: 85%, brand match
  Price: $1299.99
  URL: https://amazon.com/dp/...
  Product Title: Apple iPhone 15 Pro

[WALMART]
  Confidence: 0% ⚠️
  Reason: Pack size mismatch: 1 vs 2
  Price: —

[TARGET] ✓ Attempt
  Confidence: N/A
  Reason: No results
```

Displays:
- ✅ Retailer name & attempt badge
- ✅ Match confidence with emoji
- ✅ Matching reason (why matched/failed)
- ✅ Price (or "—" if no match)
- ✅ Product title & URL
- ✅ Extracted attributes (brand, pack size, model)

---

## Architecture Diagram

```
┌─────────────────┐
│   Web App       │
│   (React)       │
└────────┬────────┘
         │
         │ 1. addItem() / refreshPrices()
         │ 2. Set compare_status='running'
         │ 3. Call triggerBackendPriceSearch()
         │
         ▼
┌──────────────────────────────────────┐
│   backendPriceService.js             │
│   (Single responsibility: trigger)   │
│                                      │
│   export triggerBackendPriceSearch() │
│   └─> supabaseClient.functions      │
│       .invoke('compare-item')        │
└────────┬─────────────────────────────┘
         │
         │ 4. Invoke Edge Function
         │    (itemId, productName)
         │
         ▼
┌──────────────────────────────────────┐
│   Edge Function: compare-item        │
│   (SINGLE OWNER of all logic)        │
│                                      │
│   ├─ searchAmazonPrice()             │
│   ├─ searchWalmartPrice()            │
│   ├─ searchTargetPrice()             │
│   ├─ matchProductsAcrossRetailers()  │
│   └─ upsertOffer()                   │
│                                      │
│   5. Search retailers                │
│   6. Match products                  │
│   7. Upsert offers (safe, no dups)   │
│   8. Update items.compare_status     │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│   Supabase Database                  │
│                                      │
│   items                              │
│   ├─ compare_status: 'done'         │
│   ├─ compare_started_at              │
│   ├─ compare_finished_at             │
│   └─ compare_last_error: null        │
│                                      │
│   offers (unique constraint)         │
│   ├─ (item_id, retailer) UNIQUE     │
│   ├─ amazon: $1299.99, 85% conf.   │
│   ├─ walmart: $999.99, 92% conf.    │
│   └─ target: null, 0% (no match)    │
└──────────────────────────────────────┘
         │
         │ 9. UI updates via real-time
         │    subscriptions
         │
         ▼
┌─────────────────┐
│   Web App UI    │
│   Displays      │
│   ├─ Status     │
│   ├─ Prices     │
│   ├─ Badge      │
│   └─ Debug info │
└─────────────────┘
```

---

## Flow: Item Creation to Done Status

```
User clicks "Add Item"
  ↓
1. addItem() creates record in items table
   - name, url, notes
   - compare_status: 'running'
   - compare_started_at: NOW()
   - compare_finished_at: null
   - compare_last_error: null
  ↓
2. triggerBackendPriceSearch() called
   - Sets status='running' (again)
   - Invokes Edge Function
  ↓
3. Edge Function begins (async, non-blocking)
   - For each retailer (amazon, walmart, target):
     a. Search product by name
     b. Extract price, title, image, URL
     c. Match against source product (UPC, brand, model, title, variants)
     d. Log outcome:
        - Success: upsert offer with price, confidence, match_reason
        - Mismatch: upsert offer with is_match_attempt=true, reason
        - No results: upsert attempt with price=null, reason="No results"
        - Failed: upsert attempt with is_match_attempt=true, reason="Search failed: ..."
  ↓
4. Edge Function updates item
   - compare_status: 'done' (if any success) OR 'failed' (if all fail)
   - compare_finished_at: NOW()
   - compare_last_error: null (if done) OR error message (if failed)
  ↓
5. UI updates (real-time subscription)
   - Badge changes: "Running" → "Done" / "Failed"
   - Prices load from offers table
   - Best price highlighted
  ↓
6. User toggles Debug mode (optional)
   - Sees compare status, timestamps, all retailer attempts
   - Can observe confidence scores and match reasons
```

---

## Guardrails Summary

| Guardrail | Implementation | Benefit |
|-----------|----------------|---------|
| **Single Owner** | All logic in Edge Function | No duplicate logic; single source of truth |
| **Status Lifecycle** | `items.compare_status` (running/done/failed) | UI shows progress; know when safe to read offers |
| **Upsert Safe** | `offers.(item_id, retailer) UNIQUE` | No duplicates on retry/refresh; always latest data |
| **Error Tracking** | `items.compare_last_error` | Debug UI shows failure reason; troubleshooting |
| **Timestamp Audits** | `compare_started_at`, `compare_finished_at` | Know when comparison ran; detect stale data |
| **Attempt Logging** | `offers.is_match_attempt=true` | Debug: see all retailer attempts, not just successes |
| **Debug UI** | Status, timestamps, confidence, attempts | Visibility into comparison process |

---

## Testing & Validation

Comprehensive manual test checklist provided in `MANUAL_TEST_CHECKLIST.md`.

**Key Tests**:
1. ✅ Item creation sets status='running' and triggers Edge Function
2. ✅ Edge Function completes and updates status to 'done'
3. ✅ Debug UI shows compare metadata, timestamps, attempts
4. ✅ Offers upsert (no duplicates on refresh)
5. ✅ Failures handled gracefully (status='failed', error logged)
6. ✅ No local comparison logic in frontend
7. ✅ No local comparison logic in extension
8. ✅ Manual override (✗ button) still works
9. ✅ Concurrent refreshes don't cause conflicts
10. ✅ No regression in prices, UI responsiveness

---

## Migration Path

1. **Database**: Run `PRICE_COMPARE_MIGRATION.sql` in Supabase
   - Adds columns to items
   - Creates offers table with unique constraint
   - Adds indexes

2. **Edge Function**: Deploy `supabase functions deploy compare-item`
   - Must have `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in environment

3. **Frontend**: No manual changes needed (already implemented)
   - Hot reload picks up new backendPriceService.js and App.jsx
   - UI shows compare status and debug info

4. **Extension** (if applicable): No changes needed
   - Extension already only creates items (no comparison logic)
   - Will rely on Edge Function like web app

---

## Known Limitations & Future Work

- **Timeout**: Edge Function times out if search takes >540 seconds (Supabase limit)
- **Retailer Blocks**: Websites may rate-limit or block requests; handled via attempt logging
- **HTML Changes**: Retailer HTML structure changes break extraction; UPC matching fallback helps
- **Extension Notifications**: Not auto-triggered on Edge completion; requires webhook/polling

---

## Success Criteria

✅ All of the following must be true:

1. Supabase Edge Function is the **only place** comparison logic lives
2. `backendPriceService.js` has **no search/match functions** (only trigger)
3. `App.jsx` has **no search/match functions** (only UI rendering)
4. Extension has **no search/match functions** (only item creation)
5. Items track `compare_status` with timestamps and errors
6. Offers table uses upsert (no duplicates on refresh)
7. Debug UI shows status, timestamps, attempts, confidence
8. Manual test checklist passes entirely
9. No regression in prices, overrides, or UI behavior

If all true, the architecture is **locked** and future changes can only happen in the Edge Function.

