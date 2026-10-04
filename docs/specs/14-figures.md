# Spec 14 · Figures and image options from the PDF

**Status:** Draft. It's written in full when Spec 13 is merged.
**Milestone:** Finish GATE
**Depends on:** Spec 4 (R2 storage) with the **owner's Cloudflare setup done**, and Spec 12

## Context
34 of the 117 held pilot questions have a figure (a map, a circuit, a graph) or options that are
pictures. The parser already knows each question's region, and the PDF stages can render any
region as a PNG (`core.pdf_text.render_region`). So the figure is published as an image next to the
question's text, through R2 and `MEDIA_PUBLIC_BASE_URL`.

## Deliverable and UI acceptance
| # | Step | Expected |
|---|---|---|
| 1 | Re-run the pilot import | Figure holds drop; each recovered question has its figure image stored on R2 |
| 2 | Open a figure question (for example the map question, 2026 CS-1 Q.5) on the question page | The text, plus the figure image, crisp at phone and desktop widths, with alt text |
| 3 | Open a question whose options are pictures (2026 CS-1 Q.2) | Each option shows its own image, A–D, and choosing and revealing works |
| 4 | Open the same questions in Practice | The images show there too |
| 5 | Load an image URL directly | It's served from `media.prepora.xpar.in` with an immutable cache header |

## Scope (to be detailed)
- **Figure crops:** the part of the region that's drawn (graphics bounding boxes plus padding), not
  the whole question. Stored as `question` placement images.
- **Image options:** each option's own region becomes an `option` placement image, and its option
  text becomes "(see image)".
- **Release gate:** `media-sync` must report nothing missing.
