# Setup Instructions for Auto Price Compare

## Prerequisites
- Existing Supabase project with shopping_lists, items, and price_snapshots tables
- Chrome extension loaded in development mode
- React app running on localhost:5173

## Step-by-Step Setup

### 1. Database Migration
1. Go to [Supabase Dashboard](https://supabase.com)
2. Select your project
3. Navigate to **SQL Editor** (left sidebar)
4. Click **+ New Query**
5. Copy the contents of `PRICE_COMPARE_MIGRATION.sql` from the project root
6. Paste into the query editor
7. Click **Run** (or Cmd+Enter)
8. Verify: "Queries completed successfully"

**What this does:**
- Adds `price_search_status` column to items table (tracks: pending/searching/complete/failed)
- Adds `last_price_search` timestamp to items table
- Adds `match_confidence`, `product_title`, `match_method` to price_snapshots table
- Creates indexes for faster queries

### 2. Extension Setup
1. Navigate to `chrome://extensions/`
2. Find "Price Tracker" extension
3. Click **Reload** (circular icon in bottom right)
4. Verify no errors appear in the extension card

### 3. Verify Installation
1. Open the app at `http://localhost:5173`
2. Add a new shopping item (any product name)
3. Watch for "Searching..." badge under the item name
4. Wait 10-15 seconds for search to complete
5. Verify:
   - Status badge disappears
   - Prices appear from multiple retailers
   - Match confidence badges show (Excellent, Good, Fair)
   - External links appear next to prices

### 4. Troubleshooting

**Issue: "Searching..." badge never disappears**
- Check `chrome://extensions` → "Service Worker" console
- Look for red errors or failed fetch requests
- Reload the extension
- Check browser network tab (DevTools → Network)

**Issue: Only 1-2 prices showing instead of 4**
- Some retailers may timeout or return no results
- Check Service Worker console for specific retailer errors
- This is normal - fallback retail sellers aren't always available
- Higher confidence scores are better

**Issue: Prices appear but confidence badges don't show**
- The database migration might not have run successfully
- Verify in Supabase: Tables → price_snapshots → Columns
- Should see `match_confidence`, `product_title`, `match_method`
- If missing, run the migration again

**Issue: Extension console shows "CSP violation"**
- This should not occur with the CustomEvent bridge
- If it does, check extension manifest.json has correct content_scripts
- Reload extension and try again

## Verification Checklist

- [ ] Database migration completed without errors
- [ ] Extension reloaded and shows no errors
- [ ] New item can be added and displays "Searching..." badge
- [ ] Prices appear from at least 2 retailers within 15 seconds
- [ ] Confidence badges show Excellent/Good/Fair quality
- [ ] Clicking external link opens retailer product page
- [ ] Deleting item still works
- [ ] Archive functionality still works

## Performance Notes

**Expected timing:**
- Item created: immediate
- "Searching..." badge appears: immediate
- First retailer results: 5-8 seconds
- All retailers complete: 15-20 seconds
- UI updates automatically via Supabase subscription

**Resource usage:**
- HTTP requests: ~12-16 per search (3-4 retailers × 3-4 requests each)
- Database writes: 4 price_snapshots (one per retailer found)
- Memory: minimal, searches run in background worker

## Next Steps

### For Production Deployment
1. Change database URL and API key from localhost
2. Update manifest.json content_scripts to match your domain
3. Change `RATE_LIMIT_DELAY` to 2000-3000ms if rate limited
4. Set up error monitoring (Sentry, LogRocket, etc.)
5. Add user notifications (toast when search completes)

### For Further Development
1. **Add more retailers** - Newegg, eBay, regional stores
2. **Price alerts** - Notify user when price drops below threshold
3. **Price history** - Store historical prices, show trend graphs
4. **Smart matching** - Use ML for product matching
5. **Bulk updates** - Scheduled searches for all items

## Support

If you encounter issues:
1. Check browser console (DevTools → Console)
2. Check extension console (`chrome://extensions` → "Service Worker")
3. Verify database migration in Supabase SQL Editor
4. Verify extension is reloaded after code changes
5. Try adding a simple product name (e.g., "iPhone") to test

For detailed documentation, see `AUTO_PRICE_COMPARE.md`
