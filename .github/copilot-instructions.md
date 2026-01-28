<!-- Workspace-specific guidance for AI agents working in this repo. Keep concise, actionable, and project-specific. -->

# Price Tracker AI Guide

- **Architecture lock**: Cross-retailer comparison logic lives only in the Edge Function [supabase/functions/compare-item/index.ts](supabase/functions/compare-item/index.ts). Frontend and extension must not reintroduce search/match logic.
- **Trigger only**: [src/backendPriceService.js](src/backendPriceService.js) sets compare/price statuses then invokes `compare-item`; leave it as a thin trigger.
- **Data source order**: UI prefers `offers` (new upserted results) and falls back to `price_snapshots` when offers absent. Keep `offers` as the primary table when displaying prices.
- **Schema guardrails**: Migration [PRICE_COMPARE_MIGRATION.sql](PRICE_COMPARE_MIGRATION.sql) adds `items.compare_status/*` and the `offers` table with unique `(item_id, retailer)` constraint. Use upsert on that constraint; never insert duplicates.
- **Edge Function behavior**: Searches Amazon/Walmart/Target, matches products (UPC > brand+model > pack size > title similarity > variants), upserts offers, writes price_snapshots for history, updates `compare_status` to done/failed with timestamps/error.
- **UI patterns** (see [src/App.jsx](src/App.jsx)): real-time Supabase auth/session sync to extension, list/item loading via Supabase queries, debug toggle shows compare status, timestamps, offers attempts (`is_match_attempt=true`), manual override modal for fixing retailer offers. Preserve these flows when editing.
- **Manual overrides**: Keep support for delete/replace of offers and manual URLs; do not bypass the existing modals or status tracking.
- **Session sharing**: [src/extensionAuthService.js](src/extensionAuthService.js) syncs Supabase session to the extension; call it whenever auth state changes (already wired in App useEffect).
- **Dev commands**: `npm run dev` (or VS Code task `dev`), `npm run build`, `npm run preview`. Supabase: `supabase functions deploy compare-item` after Edge changes. Apply migration SQL in Supabase before relying on offers.
- **Testing/debug**: Manual checklist in [MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md); debugging via the 🐛 panel in the UI; Edge logs via Supabase dashboard.
- **Avoid regressions**: Do not add retailer scraping/matching to the web app or extension; keep comparison single-sourced in the Edge Function. Maintain status fields (`compare_status`, `compare_started_at`, `compare_finished_at`, `compare_last_error`, `price_search_status`, `last_price_search`).
- **Styling**: Tailwind-like utility classes live in component JSX; global styles in [src/App.css](src/App.css) and [src/index.css](src/index.css). Match existing class patterns when extending UI.
- **Data fetching**: Use Supabase client from [src/supabaseClient.js](src/supabaseClient.js); respect existing ordering/filtering (lists by created_at asc, items by created_at desc). Keep async flows awaited to avoid race conditions when loading lists/items.
- **Extension context**: Extension files remain for legacy/bridge functionality, but price comparison ownership is the Edge Function; if touching extension code, ensure it only triggers backend and syncs auth, not matching.

