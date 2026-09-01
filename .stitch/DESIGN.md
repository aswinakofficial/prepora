---
name: Prepora Editorial Design System
colors:
  primary: "#ffffff"
  background: "#06080a"
  card: "#06080a"
  text: "#cbd5e1"
  muted: "#64748b"
  border: "#0f172a"
  accent: "#f8fafc"
---

# Design System: Prepora

## 1. Visual Theme & Atmosphere
Prepora features a radical, high-precision dark editorial layout. It operates as a complex "knowledge database" interface. Built with an extreme dark base (`#06080a`), the visual language emphasizes absolute typographic hierarchy, severe minimalism, and structural asymmetry. 

All standard SaaS conventions are removed. There are no rounded cards, no glassmorphism, no massive colorful buttons, no decorative blobs, and no standard floating navigation bars.

## 2. Color Palette & Roles

### Primary Foundation
- **Void Obsidian (`#06080a`)**: The absolute background for all elements. No secondary card backgrounds.
- **Structural Line (`#0f172a` to `#1e293b`)**: Used exclusively for grid lines, column dividers, and underlining. 
- **Active Focus (`#ffffff`)**: Used for borders of focused inputs or active states.

### Typography Hierarchy
- **Pure White (`#ffffff`)**: Primary 7xl-8xl headings and active selection text.
- **Slate Ash (`#cbd5e1`)**: Normal body and question text.
- **Console Dim (`#64748b`)**: Monospace tracking texts, metadata, structural IDs.

## 3. Typography Rules

### Hierarchy & Weights
- **Font Family**: Inter, system-ui for primary text. Strict monospace (`JetBrains Mono`, `Courier`) for metadata and structural labels.
- **Display Heading (H1)**: 48px–72px+, Font Weight 300 (Light) to 400 (Regular), tracking-tighter, leading-tight. ALL CAPS preferred.
- **Command Labels**: 10px-12px, Font Weight monospace, uppercase, tracking-[0.2em] to tracking-widest (e.g. `[ EXECUTE ]`).

## 4. Component Stylings

### No Borders & Inputs
- **Inputs**: Only border-bottom. No rounded rectangles. Placeholder text is large and light.
- **Buttons**: Strict bracket-based text (`[ EXAM ]`) or simple border-based minimal boxes. No background colors except stark white on hover.
- **Cards**: Cards do not exist. Lists are built via strict row borders (`border-b`, `border-t`), presenting tabular data or grid streams.

### Icons
- **ABSOLUTELY NO LUCIDE/SVG ICONS**. All iconography is replaced by textual indicators (e.g., `VOL: 2400`, `STATUS: ONLINE`), ASCII art, or structural slashes (`/`).

## 5. Layout Principles
- **Grid Layout**: 12-column architectural grid with visible column borders mapping exactly to content. Asymmetric layouts heavily preferred (e.g. leaving left columns blank).
- **Navigation**: Flush, inline structure spanning columns, using raw text to navigate. No sticky floating rounded bars.

## 6. Design System Notes for Stitch Generation
- DO NOT generate SaaS cards, rounded icons, soft shadows, or blue gradients.
- Treat every screen as a terminal-like architectural blueprint or a stark digital magazine.
