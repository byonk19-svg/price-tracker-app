# Auto Price Comparison Feature - Implementation Guide

## Overview
This document describes the automatic price comparison system that searches multiple retailers when a user adds a new shopping item.

## Architecture

### Components

1. **Frontend (React App)** - `src/App.jsx`
   - User adds item via form
   - UI dispatches `searchAndFetchPrices` CustomEvent
   - Shows "Searching..." status badge while background worker operates
   - Displays match confidence for each retailer
   - Real-time UI updates via Supabase subscriptions

2. **Background Worker (Extension)** - `extension/background.js`
   - Receives search request via Chrome message API
   - Searches multiple retailers in parallel with rate limiting
   - Calculates product match confidence
   - Stores results in Supabase with metadata
   - Updates item status from `pending` → `searching` → `complete`/`failed`

3. **Database (Supabase PostgreSQL)**
   - `items.price_search_status` - tracks search state
   - `items.last_price_search` - timestamp of last search
   - `price_snapshots.match_confidence` - product matching quality (0-1)
   - `price_snapshots.product_title` - actual product name found
   - `price_snapshots.match_method` - 'exact' or 'fuzzy' matching

4. **Product Matching** - `extension/priceMatchUtils.js`
   - Title normalization (remove brands, special chars)
   - Jaccard similarity scoring (tokens)
   - Confidence threshold: 50% minimum acceptable

## Feature Flow

### When User Adds Item
```
1. User submits form: { name, url, notes }
2. App saves item to items table
3. Item created with status = 'pending'
4. App dispatches CustomEvent 'priceTrackerMessage'
   - action: 'searchAndFetchPrices'
   - payload: { productName, itemId }
5. Extension content script relays to background worker
6. Background worker starts searching (async, non-blocking)
```

### Background Search Process
```
1. Update item status: pending → searching
2. For each retailer (Amazon, Walmart, Target, Best Buy):
   a. Search retailer (1500ms delay between requests)
   b. Extract product link from search results
   c. Fetch actual product page
   d. Extract price, title, image, URL
   e. Calculate match_confidence (0-1)
   f. Save to price_snapshots with metadata
3. Save retailer URLs to items.retailer_urls
4. Update item status: searching → complete (or failed)
5. Supabase real-time notifies app of updates
```

### UI Updates
```
1. Item appears immediately after creation
2. Shows "Searching..." spinner badge
3. As prices are found, confidence badges appear:
   - Excellent: ≥85% confidence
   - Good: 70-84% confidence
   - Fair: 50-69% confidence
   - Poor: <50% confidence (not shown unless forced)
4. Status updates to "complete" when done
5. Real-time subscription updates UI
```

## Configuration

### Rate Limiting
Located in `extension/background.js`:
```javascript
const RATE_LIMIT_DELAY = 1500;  // 1.5s between retailer requests
const MAX_RETRIES = 2;           // Retry failed requests
const RETRY_DELAY = 2000;        // Initial 2s retry delay (exponential backoff)
```

### Retailers Searched
1. **Amazon** - Uses data-asin attributes for reliable product matching
2. **Walmart** - Extracts from /ip/ paths
3. **Target** - Extracts from /p/ paths
4. **Best Buy** - Extracts from /site/ paths with SKU IDs

### Match Confidence Algorithm
- Tokenizes both search title and found title
- Removes noise (retailer names, special characters, parentheticals)
- Calculates Jaccard similarity: |intersection| / |union|
- Boosts confidence for important keywords (Pro, Max, Mini, etc.)
- Returns 0-1 score (1.0 = perfect match)

## Database Schema

### Migration: `PRICE_COMPARE_MIGRATION.sql`
```sql
-- Add to items table
ALTER TABLE items 
ADD COLUMN price_search_status TEXT CHECK (price_search_status IN ('pending', 'searching', 'complete', 'failed'));
ADD COLUMN last_price_search TIMESTAMPTZ;

-- Add to price_snapshots
ALTER TABLE price_snapshots 
ADD COLUMN match_confidence DECIMAL(3,2);
ADD COLUMN product_title TEXT;
ADD COLUMN match_method TEXT CHECK (match_method IN ('exact', 'fuzzy', 'manual'));

-- Add indexes for performance
CREATE INDEX idx_items_search_status ON items(price_search_status);
CREATE INDEX idx_price_snapshots_checked_at ON price_snapshots(checked_at DESC);
```

**Execute this migration in Supabase SQL Editor before using the feature.**

## API Communication

### CustomEvent Bridge (CSP-Compliant)
```javascript
// App sends search request
const event = new CustomEvent('priceTrackerMessage', {
  detail: { 
    action: 'searchAndFetchPrices', 
    payload: { productName, itemId } 
  }
});
window.dispatchEvent(event);

// Content script relays to background worker
chrome.runtime.sendMessage({
  action: 'searchAndFetchPrices',
  productName: payload.productName,
  itemId: payload.itemId
});
```

### Message Handlers
- `extension/content.js` - Listens for CustomEvent, forwards to background
- `extension/background.js` - Receives message, executes searchAndFetchPrices()

## Error Handling

### Failure Scenarios
1. **Network Error** - Retries with exponential backoff (up to 2 times)
2. **Product Not Found** - Moves to next retailer, logs error
3. **Price Extraction Fails** - Falls back to search result price
4. **Database Error** - Updates status to 'failed'

### Status Tracking
```javascript
// Status progression
pending       // Item created, search not started
↓
searching     // Background worker is searching retailers
↓
complete      // All retailers checked, results saved
OR
failed        // Search encountered errors
```

## Performance Optimizations

1. **Rate Limiting** - 1500ms between retailer requests prevents overwhelming servers
2. **Retry Logic** - Exponential backoff (2s → 4s → 8s) for resilience
3. **Product Page Scraping** - Direct fetch from product pages (accurate prices)
4. **Real-time Updates** - Supabase subscriptions instead of polling
5. **Non-blocking** - Search runs async in background, doesn't block UI

## Testing

### Unit Tests - `extension/tests.js`
Tests for product matching logic:
```javascript
// Test title normalization
normalizeProductTitle("iPhone 15 Pro Max (Amazon)") 
// → "iphone 15 pro max"

// Test confidence calculation
calculateMatchConfidence("iPhone 15 Pro Max", "Apple iPhone 15 Pro Max")
// → 0.95 (Excellent)

// Test match quality labels
getMatchQuality(0.88) // → "Excellent"
getMatchQuality(0.75) // → "Good"
getMatchQuality(0.55) // → "Fair"
```

Run tests in browser console or Node.js to validate matching logic.

### Integration Testing
1. Add new item via UI
2. Watch "Searching..." badge appear
3. Wait for status to change to "complete"
4. Verify prices appear from all 4 retailers
5. Check confidence badges show correct quality
6. Click external links to verify retailer URLs are correct

## Troubleshooting

### Prices Not Appearing
1. Check `chrome://extensions` → "Service Worker" console for errors
2. Verify item status: should progress from pending → searching → complete
3. Check network tab: should see fetch requests to each retailer
4. Verify database migration was run (check Supabase SQL)

### Incorrect Product Matched
1. Check `match_confidence` in price_snapshots table
2. Product title normalization may need adjustment
3. Try more specific product names (e.g., "iPhone 15 Pro Max" vs "iPhone")

### Extension Not Triggering
1. Ensure extension is loaded: `chrome://extensions/`
2. Check content script injection: localhost:5173 in manifest.json
3. Reload extension after any background.js changes
4. Check console: should see "Content script received message:"

## Future Enhancements

1. **Webhook Notifications** - Notify user when prices drop below threshold
2. **Price History Graphs** - Visualize price trends over time
3. **Bulk Price Updates** - Search all items at once with scheduling
4. **Smart Matching** - ML-based product matching instead of rule-based
5. **More Retailers** - eBay, Newegg, Best Buy variants, regional stores
6. **Price Alerts** - Automatic notifications when best price changes

## File Manifest

- `src/App.jsx` - Main app component with price search trigger
- `extension/background.js` - Background worker with retailer searches
- `extension/priceMatchUtils.js` - Product matching utilities
- `extension/content.js` - Content script with message bridge
- `extension/manifest.json` - Extension configuration
- `extension/tests.js` - Unit tests for matching logic
- `PRICE_COMPARE_MIGRATION.sql` - Database schema updates
