-- Auto Price Compare Schema Updates

-- Add search status tracking to items
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS price_search_status TEXT DEFAULT 'pending' CHECK (price_search_status IN ('pending', 'searching', 'complete', 'failed'));

ALTER TABLE items 
ADD COLUMN IF NOT EXISTS last_price_search TIMESTAMPTZ;

-- Compare job tracking
ALTER TABLE items
ADD COLUMN IF NOT EXISTS compare_status TEXT DEFAULT 'pending' CHECK (compare_status IN ('pending', 'running', 'done', 'failed'));

ALTER TABLE items
ADD COLUMN IF NOT EXISTS compare_last_error TEXT;

ALTER TABLE items
ADD COLUMN IF NOT EXISTS compare_started_at TIMESTAMPTZ;

ALTER TABLE items
ADD COLUMN IF NOT EXISTS compare_finished_at TIMESTAMPTZ;

-- Enhance price_snapshots with match metadata
ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(3,2) CHECK (match_confidence >= 0 AND match_confidence <= 1);

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS product_title TEXT;

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS match_method TEXT CHECK (match_method IN ('exact', 'fuzzy', 'manual', 'cross_retailer_match', 'source_product'));

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS product_id TEXT;

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS matching_reason TEXT;

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS extracted_brand TEXT;

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS extracted_pack_size TEXT;

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS extracted_model TEXT;

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS extracted_variants JSONB;

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS extracted_upc TEXT;

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT FALSE;

ALTER TABLE price_snapshots 
ADD COLUMN IF NOT EXISTS manual_override_reason TEXT;

-- Track attempted matches (including failures) for debug visibility
ALTER TABLE price_snapshots
ADD COLUMN IF NOT EXISTS is_match_attempt BOOLEAN DEFAULT FALSE;

-- Offers table for cross-retailer results (including attempts)
CREATE TABLE IF NOT EXISTS offers (
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


-- Track stock state per offer
ALTER TABLE offers
ADD COLUMN IF NOT EXISTS in_stock BOOLEAN;
