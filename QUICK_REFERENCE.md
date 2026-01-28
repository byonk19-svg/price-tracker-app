# Auto Price Compare - Quick Reference

## One-Time Setup

1. **Run Database Migration**
   - Go to Supabase SQL Editor
   - Execute: `PRICE_COMPARE_MIGRATION.sql`
   - Takes <5 seconds

2. **Reload Extension**
   - Visit `chrome://extensions`
   - Click Reload on Price Tracker
   - Done!

## How to Use

### Adding an Item with Auto-Search
```
1. Click "Add Item" or "+" button
2. Enter product name: "iPhone 15 Pro Max"
3. (Optional) Enter URL or notes
4. Click "Add Item"
5. See "Searching..." spinner
6. Wait 15-20 seconds
7. View prices from 4 retailers
```

### Understanding Match Quality
```
Excellent  ≥85% match - Definitely the same product
Good       70-84% match - Very likely the same product
Fair       50-69% match - Probably the same product
Poor       <50% match - Different product (not shown by default)
```

### Checking a Single Item
```
1. Find item in your list
2. Click magnifying glass icon
3. See prices update automatically
4. Takes 15-20 seconds
```

## What Happens Behind the Scenes

```
┌─────────────────────────────────────────┐
│ User adds item "iPhone 15 Pro Max"      │
└────────┬────────────────────────────────┘
         │ (immediate)
         ▼
┌─────────────────────────────────────────┐
│ Item appears in list with spinner       │
└────────┬────────────────────────────────┘
         │ (async in background)
         ▼
┌─────────────────────────────────────────┐
│ Extension searches 4 retailers:         │
│ • Amazon → Price: $999 (95% match)      │
│ • Walmart → Price: $949 (92% match)     │
│ • Target → Price: $969 (88% match)      │
│ • Best Buy → Price: $999 (89% match)    │
└────────┬────────────────────────────────┘
         │ (results appear as found)
         ▼
┌─────────────────────────────────────────┐
│ UI auto-updates with prices & badges    │
│ Spinner disappears when complete        │
└─────────────────────────────────────────┘
```

## Troubleshooting

### "Searching..." never ends
- ✓ Check browser console for errors
- ✓ Check `chrome://extensions` Service Worker console
- ✓ Reload extension
- ✓ Try simpler product name

### Only 1-2 prices showing
- ✓ Normal - not all retailers have all products
- ✓ Check console for which retailers failed
- ✓ Some retailers may block automated requests
- ✓ Try specific product name with model number

### Confidence badges not showing
- ✓ Run database migration again
- ✓ Verify `match_confidence` column exists in Supabase
- ✓ Check Tables → price_snapshots → Columns

### Links don't work
- ✓ Click link opens product page? = Working correctly
- ✓ Nothing happens? = Check extension console
- ✓ Wrong product? = Product matching needs tuning

## Performance Notes

| Operation | Time |
|-----------|------|
| Item creation | <0.1s |
| Search start | 0-0.5s |
| First price | 5-8s |
| All 4 retailers | 15-20s |
| UI update | <1s (after each) |

## Configuration

To adjust rate limiting (in `extension/background.js`):
```javascript
const RATE_LIMIT_DELAY = 1500;  // 1.5s between retailers
const MAX_RETRIES = 2;           // Retry failed searches
const RETRY_DELAY = 2000;        // 2s initial delay
```

Higher delay = safer but slower
Lower delay = faster but may get rate limited

## File Locations

```
Project Root
├── PRICE_COMPARE_MIGRATION.sql      ← Run this first
├── AUTO_PRICE_COMPARE.md            ← Full documentation
├── SETUP.md                         ← Detailed setup guide
├── IMPLEMENTATION_SUMMARY.md        ← Technical details
├── README.md                        ← Updated with features
├── src/
│   └── App.jsx                      ← UI with search trigger
├── extension/
│   ├── background.js                ← Search logic
│   ├── priceMatchUtils.js           ← Matching algorithm
│   ├── content.js                   ← Message bridge
│   ├── manifest.json                ← Extension config
│   └── tests.js                     ← Unit tests
```

## Key Functions

### Trigger Search
```javascript
// In App.jsx when item is added
const event = new CustomEvent('priceTrackerMessage', {
  detail: { 
    action: 'searchAndFetchPrices', 
    payload: { productName, itemId } 
  }
});
window.dispatchEvent(event);
```

### Calculate Confidence
```javascript
// Returns 0-1 score
const confidence = calculateMatchConfidence(
  "iPhone 15 Pro Max",
  "Apple iPhone 15 Pro Max Smartphone"
); // Returns 0.95
```

### Get Quality Label
```javascript
// Returns Excellent/Good/Fair/Poor
const quality = getMatchQuality(0.95); // "Excellent"
const quality = getMatchQuality(0.75); // "Good"
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| No prices found | Try more specific name |
| Wrong product | Move slider to see all matches |
| Slow search | Normal (20s for 4 retailers) |
| Extension crashes | Reload at chrome://extensions |
| DB error | Run migration again |
| CSP violation | Reload extension |

## Testing

Run unit tests in browser console:
```javascript
// Copy-paste extension/tests.js into console
// All 6 tests should pass
```

## Stats

- **Retailers searched**: 4
- **Search delay**: 1.5s between retailers (prevents rate limiting)
- **Retries**: 2 (if request fails)
- **Confidence threshold**: 50% minimum
- **Match quality levels**: 4 (Excellent/Good/Fair/Poor)
- **Database records per search**: 4+ (one per retailer found)

## Next Steps

1. ✅ Run database migration
2. ✅ Reload extension
3. ✅ Add a test item
4. ✅ Verify prices appear
5. ✅ Check confidence badges
6. ✅ Read full documentation if needed

## Support

See detailed documentation:
- Setup: `SETUP.md`
- Features: `AUTO_PRICE_COMPARE.md`
- Technical: `IMPLEMENTATION_SUMMARY.md`
- Tests: `extension/tests.js`
