# Price Tracker App

A React + Vite application for tracking product prices across multiple retailers with automatic price comparison.

## Features

- **Smart Shopping Lists** - Create multiple lists for organizing products
- **Auto Price Comparison** - Automatically search 4 retailers when you add an item
  - Amazon
  - Walmart
  - Target
  - Best Buy
- **Match Confidence Scoring** - Know how accurate each price match is
  - Excellent (≥85% match)
  - Good (70-84%)
  - Fair (50-69%)
- **Product Matching** - Intelligent normalization to find the exact product across retailers
- **Retailer Links** - Click directly to product pages on each retailer
- **Archive Items** - Mark items as purchased without deleting them
- **Edit Items** - Update product details inline
- **Item Images** - Display product images automatically

## Quick Start

Install dependencies (if not already done):
```bash
npm install
```

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173/` with hot module replacement (HMR) enabled.

## Important: Database Setup

Before using price comparison, run the database migration:
1. See `SETUP.md` for detailed instructions
2. Quick: Execute `PRICE_COMPARE_MIGRATION.sql` in Supabase SQL Editor

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

## Project Structure

```
├── src/
│   ├── main.jsx          # React entry point
│   ├── App.jsx           # Main App component
│   ├── App.css           # App styles
│   └── index.css         # Global styles
├── public/               # Static assets
├── vite.config.js        # Vite configuration
├── package.json          # Dependencies and scripts
└── index.html            # HTML template
```

## Tech Stack

- **React 18+** - UI library
- **Vite** - Fast build tool and dev server
- **Rolldown-Vite** - Modern bundler
- **ESLint** - Code linting
- **JavaScript/JSX** - Development language

## Development Notes

- Hot Module Replacement (HMR) is enabled for instant updates during development
- ESLint is configured for code quality checks
- Builds are optimized for production with code splitting and minification
