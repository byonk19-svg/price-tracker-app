# Cross-Retailer Product Matching System

## Overview

This document describes the intelligent cross-retailer matching system implemented to prevent linking to wrong products when comparing prices across Amazon, Walmart, and Target.

## Problem Solved

Previously, the system would accept the first search result from each retailer without verifying it was the correct product. This led to:
- 3-pack of wipes matching 1-pack alternatives
- Different product variants (scent, formula) being mixed
- Completely wrong products appearing in comparisons

## Solution: Multi-Signal Matching Algorithm

### Architecture

The matching system uses a **source-first** approach:
1. **First retailer search result** → Set as source product (canonical product)
2. **Subsequent retailers** → Matched against source using intelligent scoring
3. **Unmatched results** → Rejected (not saved to database)

### Matching Signals (Priority Order)

#### 1. **UPC/EAN/GTIN Exact Match** (Highest Confidence: 1.0)
- Extracts barcode from product pages
- Sources: Meta tags (`product:ean`, `ean`), JSON-LD schema
- If UPC matches exactly → **Accept with 100% confidence**
- If UPC differs → **Reject immediately**

#### 2. **Brand + Model Number Exact Match** (Confidence: 0.95)
- Extracts brand and model metadata from product pages
- If both brand AND model match exactly → **Accept**
- Example: Clorox brand + model #123 must match across retailers

#### 3. **Pack Size/Count Hard Requirement** (Gating Condition)
- Extracts pack counts: "3-pack", "216 count", "24 tablets", etc.
- Patterns matched:
  - `3-pack`, `3 pack`, `pack of 3`
  - `216 count`, `ct`, `pieces`
  - Product-specific: `wipes`, `sheets`, `tablets`, `capsules`
- **If pack sizes differ → Reject automatically** (hard requirement)
- Example: 3-pack vs 1-pack → Rejected

#### 4. **Brand Match** (Conditional: +0.4 confidence)
- Brand comparison (case-insensitive)
- Only applied if pack sizes match
- Adds credibility to match

#### 5. **Title Similarity** (Weighted: +0.4 confidence)
- Token-based similarity analysis
- Removes retailer names, cleaning products, variant details
- Compares core product name tokens
- Jaccard similarity: intersection / union
- Example: "Clorox Bleach Clean Scent 3-pack" vs "Clorox Bleach Fresh Scent 3-pack"
  - Shared tokens: clorox, bleach, scent, pack → High similarity
  - Different tokens: clean vs fresh → Noted in matching reason

#### 6. **Variant Attributes Match** (Weighted: +0.2 confidence)
- Extracts variant descriptors: scent, formula, formula type
- Pattern matching:
  - Scents: lavender, citrus, fresh, original, unscented
  - Formulas: advanced, sensitive, hypoallergenic, complete
- Penalizes if variants differ significantly
- Example: "Sensitive" formula MUST match across retailers

### Confidence Threshold

- **Minimum confidence: 0.75 (75%)**
- If score < 0.75 → **Reject and show "No reliable match found"**
- Prevents false positive cross-retailer matches

### Matching Reasons

Each accepted match includes a `matching_reason` field explaining why:
- `"Exact UPC/EAN match"` → UPC matched
- `"Exact brand and model match"` → Brand + model matched
- `"brand match, title similarity: 87%, variant match: 2/3"` → Composite scoring
- `"Pack size mismatch: 3 vs 1"` → Rejected reason (logged, not saved)

## Database Schema Updates

### New Columns in `price_snapshots`

```sql
ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS matching_reason TEXT;
```

### Full price_snapshots Row Example

```json
{
  "item_id": "uuid",
  "retailer": "amazon",
  "price": "12.99",
  "match_confidence": 1.0,
  "product_title": "Clorox Bleach Clean Scent 3-pack",
  "match_method": "source_product",
  "image_url": "https://...",
  "product_id": "B0F436L3PH",
  "matching_reason": "Source product"
}
```

For subsequent retailer:

```json
{
  "item_id": "uuid",
  "retailer": "walmart",
  "price": "10.99",
  "match_confidence": 0.95,
  "product_title": "Clorox Bleach Clean Scent 3-pack",
  "match_method": "cross_retailer_match",
  "image_url": "https://...",
  "product_id": "12345678",
  "matching_reason": "brand match, title similarity: 100%, variant match: 1/1"
}
```

## Implementation Details

### Metadata Extraction Functions

#### `extractUPC(html)`
- Searches for barcode in meta tags and JSON-LD
- Returns 8-14 digit barcode or null

#### `extractBrand(html)`
- Extracts brand from `product:brand` meta or brand HTML class
- Returns string or null

#### `extractPackSize(title, html)`
- Regex patterns for pack size indicators
- Returns numeric string ("3", "216") or null
- Essential for hard requirement checking

#### `extractModelNumber(html)`
- Finds model identifier in `product:model` meta
- Returns string or null

#### `extractVariants(title)`
- Scans title for variant keywords
- Returns array of variant descriptors or null
- Examples: ["sensitive", "lavender"], ["advanced formula"]

#### `matchProductsAcrossRetailers(sourceProduct, candidateProduct)`
- Core matching algorithm
- Returns: `{ confidence: 0.0-1.0, reason: string, matched: boolean }`
- Implements priority-ordered signal evaluation

### Search Function Changes

All three retailer search functions now return enriched product data:

```javascript
{
  price: 12.99,
  image: "https://...",
  url: "https://amazon.com/dp/B0F...",
  title: "Clorox Bleach Clean Scent 3-pack",
  id: "B0F436L3PH",          // ASIN/item ID/TCIN
  upc: "044600001234",        // NEW: Barcode
  brand: "Clorox",            // NEW: Brand name
  packSize: "3",              // NEW: Pack count
  model: "CLX-123",           // NEW: Model number
  variants: ["clean", "scent"]// NEW: Variant attributes
}
```

### Search Loop Logic

```javascript
for (const retailer of retailers) {
  const result = await search(retailer);
  
  if (!result) continue;
  
  // First result sets the standard
  if (!sourceProduct) {
    sourceProduct = result;
    save(result, { match_confidence: 1.0, match_method: 'source_product' });
  } else {
    // Match subsequent results against source
    const match = matchProductsAcrossRetailers(sourceProduct, result);
    
    if (!match.matched) {
      console.log(`Rejected: ${match.reason}`);
      continue; // Skip this retailer
    }
    
    // Accepted - save with matching details
    save(result, {
      match_confidence: match.confidence,
      match_method: 'cross_retailer_match',
      matching_reason: match.reason
    });
  }
}
```

## Example Scenarios

### ✅ Scenario 1: Same Product, Different Prices

**Source (Amazon):** Clorox Bleach 3-pack, $12.99
- UPC: 044600001234
- Brand: Clorox
- Pack: 3
- Title tokens: clorox, bleach, scent, pack

**Candidate (Walmart):** Clorox Bleach 3-pack, $10.99
- UPC: 044600001234 ← **Matches exactly!**
- Result: ✅ Accept (confidence: 1.0, reason: "Exact UPC/EAN match")

### ✅ Scenario 2: Pack Size Match, Brand Match

**Source (Amazon):** Dawn Dish Soap 3-pack, $6.99
- Brand: Dawn
- Pack: 3
- Model: DS-456

**Candidate (Target):** Dawn Dish Soap 3-pack, $6.49
- Brand: Dawn ← Brand matches
- Pack: 3 ← Pack matches (hard req satisfied)
- Model: DS-456 ← Model matches
- Result: ✅ Accept (confidence: 0.95, reason: "Exact brand and model match")

### ❌ Scenario 3: Pack Size Mismatch (HARD REJECT)

**Source (Amazon):** Clorox Wipes 3-pack, $8.99
- Pack: 3

**Candidate (Walmart):** Clorox Wipes 1-pack, $4.99
- Pack: 1 ← **Differs from source**
- Result: ❌ Reject (reason: "Pack size mismatch: 3 vs 1")
- UI shows: "No reliable match found"

### ❌ Scenario 4: Different Variant (Low Confidence)

**Source (Amazon):** Clorox Bleach "Fresh" Scent 3-pack, $8.99
- Variants: ["fresh"]

**Candidate (Target):** Clorox Bleach "Lemon" Scent 3-pack, $8.49
- Variants: ["lemon"]
- Title similarity: 95%
- Brand match: +0.4
- Title similarity contribution: +0.38
- Variant match: 0% (fresh ≠ lemon)
- Total confidence: 0.78
- Result: ✅ Accept (confidence: 0.78, reason: "brand match, title similarity: 95%")
  - Note: Variants differ but threshold still met due to high title similarity

### ❌ Scenario 5: Completely Wrong Product (Hard Reject)

**Source (Amazon):** Clorox Bleach 3-pack, $8.99
- Pack: 3
- Variants: ["bleach"]

**Candidate (Walmart):** Lysol Disinfectant 3-pack, $9.99
- Pack: 3 ← Pack matches
- Variants: ["disinfectant"]
- Title similarity: 10% (only "3-pack" matches)
- Brand match: 0% (Clorox ≠ Lysol)
- Confidence: 0.1 * 0.4 = 0.04
- Result: ❌ Reject (confidence: 0.04, reason below threshold)
- UI shows: "No reliable match found"

## Benefits

1. **Eliminates False Positives:** Pack size mismatch is automatic rejection
2. **UPC is King:** Barcode matching provides 100% confidence
3. **Composite Scoring:** Multiple signals reduce false negatives
4. **Transparent Reasoning:** Users see why products were matched/rejected
5. **Safe Fallback:** If confidence < 0.75, show "No reliable match" instead of wrong product
6. **Audit Trail:** `matching_reason` saved for debugging and analysis

## Future Enhancements

- [ ] Support for more retailers (Costco, Amazon Fresh, local stores)
- [ ] ML-based confidence scoring (learn from user corrections)
- [ ] Manual override UI ("This is wrong" → update matching_reason)
- [ ] Barcode scanning via camera for verification
- [ ] Ingredient list comparison for exact product variants
- [ ] Size/weight matching (12oz vs 16oz detection)

## Testing Checklist

- [ ] Test UPC exact match → 1.0 confidence
- [ ] Test pack size mismatch → Rejection
- [ ] Test title similarity scoring
- [ ] Test variant attribute extraction
- [ ] Test threshold enforcement (< 0.75 → reject)
- [ ] Test with real product pages (amazon.com, walmart.com, target.com)
- [ ] Verify matching_reason saved in database
- [ ] Check console logs show matching decisions
- [ ] Test UI shows "No reliable match found" when rejected
