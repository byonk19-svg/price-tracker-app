# Repo Reset Report

- Repo name: price-tracker-app
- Status: Improved, needs human review
- Purpose: Vite/React price tracking app with Supabase-backed auth/data and browser-extension helper code.
- Main language/framework: JavaScript/JSX, React, Vite, Supabase
- Package manager: npm
- Setup command: `npm install`, then create `.env` from `.env.example`
- Current branch: `codex/repo-reset`

## Commands Run

- `git fetch origin` - passed
- `npm install` - skipped to avoid mutating pre-existing package edits
- `npm run lint` - failed with 30 errors and 3 warnings
- `npm run build` - passed

## Files Changed

- `.env.example`
- `REPO_RESET_REPORT.md`

## What Was Fixed

- Added missing `.env.example` key names only: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Remaining Issues

- The repo had substantial pre-existing uncommitted app, extension, script, Supabase, and package changes before this pass.
- Lint currently fails on pre-existing extension globals (`chrome`) and unused variables in app and modal code.
- No test script is configured, and adding test tooling would exceed this safe reset pass.
- `supabase/.env` is untracked and should be reviewed for secrets before any broad staging.

## Recommended Next 3 Actions

1. Split or commit the existing app/extension work intentionally before further reset changes.
2. Add ESLint globals or scoped config for extension files, then clean unused variables.
3. Add a minimal test script once the current working tree is stable.
