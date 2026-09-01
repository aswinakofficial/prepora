---
description: Design iteration loop (GitHub → Local Prepora → Code-to-Design → Stitch → Redesign → Coding Agent Implementation)
---

# Design Iteration Loop Workflow

This workflow defines the end-to-end design refinement loop between GitHub source code, local dev environment, Stitch visual design, and Antigravity coding agent implementation.

## Workflow Overview

```
GitHub Repository
   │
   ▼
Local Prepora Monorepo (`pnpm dev`)
   │
   ▼
Code-to-Design Capture (HTML / Screenshot / DOM Export)
   │
   ▼
Google Stitch / Design Tool (Visual Redesign & Component Polish)
   │
   ▼
Design Handoff Assets (Screenshots, Tokens, Exported Markup/CSS)
   │
   ▼
Antigravity Coding Agent (Code Integration in `@prepora/web`)
```

---

## Step-by-Step Instructions

### Step 1: GitHub → Local Prepora
1. Ensure your local branch is synchronized with the latest remote changes:
   ```bash
   git pull origin main
   ```
2. Verify dependencies are up to date and launch the dev server:
   ```bash
   pnpm install
   pnpm dev
   ```
3. Confirm the site is running at `http://localhost:3000` (or `http://localhost:3001`).

### Step 2: Local Prepora → Code-to-Design
1. Navigate to the targeted page or component in the browser.
2. Capture the UI for design import:
   - **Option A (HTML/DOM Export)**: Use a Code-to-Design / HTML-to-Figma extension or copy inspect element markup.
   - **Option B (Visual Capture)**: Take full-page or component screenshots at 2x resolution.

### Step 3: Import into Stitch & Redesign
1. Import captured HTML/DOM or screenshots into **Stitch**.
2. Apply visual redesigns:
   - Modernize color palettes, dark mode surfaces, typography, and micro-interactions.
   - Refine component structures (cards, headers, practice widgets, exam lists).

### Step 4: Export Redesign & Handoff to Coding Agent
1. Export the final redesign mockups, design tokens, or generated HTML/CSS from Stitch.
2. Provide the image files, design specifications, or exported snippets to Antigravity.

### Step 5: Coding Agent Implementation
1. Antigravity analyzes the design input / exported mockups.
2. Updates Tailwind CSS utility tokens, CSS variables in `apps/web/app/styles/globals.css`, and React components in `apps/web/app/`.
3. Runs `pnpm typecheck` and verifies local dev server rendering.
