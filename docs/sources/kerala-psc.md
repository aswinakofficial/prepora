# Kerala Public Service Commission (keralapsc.gov.in)

> **Verdict:** Go. KPSC permits reproduction with acknowledgement; EasyPSC's text needs its
> permission. **Effort:** M to L.
> **Researched:** 2026-10-01. Unconfirmed details are marked UNVERIFIED.

Kerala PSC is a large, recurring, locally important source: about 3,500 papers from 2013 to 2026,
with official provisional and final keys. Its "Previous Question Papers" page only covers
2014–2016. The rest is reached through the **answer-key listings**, where online-exam entries hold
the questions and correct answers in one digital PDF.

The hard part is Malayalam. Papers use the legacy ASCII "Shree-Mal" font, so their PDF text is
unusable, and the 2014–16 papers are 100-dpi scans.

## 1. Legitimacy

- **Copyright** (https://keralapsc.gov.in/copyright): the material "may be reproduced free of
  charge in any format or media without requiring specific permission", as long as it is:
  - reproduced accurately;
  - not used in a derogatory or misleading way;
  - prominently acknowledged.

  Third-party material is excluded.
- **Hyperlinking policy:** "Prior permission is required for linking directly to the information
  hosted on our site." Framing isn't allowed. So either store source URLs without publishing deep
  links, or send KPSC a courtesy request ([permissions](permissions.md)).
- **Terms:** the documents are "for reference purposes only". The disclaimer suggests cross-checking
  against the Kerala Gazette.
- **robots.txt:** the standard Drupal file, disallowing `/core/`, `/profiles/`, `/admin/`, `/search/`
  and `/user/*`. Files and listings are allowed. No crawl-delay.
- **What we must do:** credit "Source: Kerala Public Service Commission" on every question set, and
  reproduce text faithfully. OCR errors count as inaccuracy, so OCR'd text goes to review.

## 2. Exam landscape → knowledge index

**How KPSC organises exams:**
- Each **post** has a Category Number, e.g. `885/2025` (Tradesman Masonry, Technical Education).
- Each **paper** has a Question Paper Code:
  - OMR exams: `087/2026`, also written `87/2026` or `87-26`;
  - online exams: `151/2026/OL`;
  - language versions: `088/2026-M`, `-T`, `-K` (Malayalam, Tamil, Kannada), which are translations
    of the **same** paper.
- **One paper often serves many category numbers.** `88/2026 M/T/K` covers more than 8 posts.
- **Common prelims** (10th, 12th and degree level) feed many posts.
- **OMR booklets** come in series A, B, C and D with a different question order, and **only series
  A** is published.

| Knowledge index | Kerala PSC |
|---|---|
| Organization | `kerala-psc` (jurisdiction IN-KL) |
| Exam | a post family or common exam: `tradesman`, `assistant-engineer`, `ldc`, `degree-level-prelims`, `tenth-level-prelims` |
| Hierarchy template | `department/trade (optional) → year` |
| Paper group | one per QP code (`087/2026`), with category numbers in `paper_group_codes` |
| Edition | one per language (`-M`/`-T`/`-K`) and series A; editions are linked by translation group |
| Answer status | `X` in the key means **cancelled** |

Real examples:

| Paper | Post / department | Mapping |
|---|---|---|
| `151/2026/OL` | Welder (Health Services / Oil Palm India) | `welder` / `general` / 2026 |
| `87/2026` | Tradesman Masonry (Technical Education) | `tradesman` / `masonry` / 2026 |
| `88/2026 M/T/K` | Clerk / Sales Assistant etc., more than 8 categories | `tenth-level-common` / 2026, three language editions |
| `175/2016` | Tradesman Automobile Mechanic | `tradesman` / `automobile-mechanic` / 2016 |
| `18/2013` | Assistant Engineer (Civil), KTDC | `assistant-engineer` / `civil` / 2013 |

**Gaps** (closed by foundation steps S4 and S5):
- language and translation groups;
- category numbers on a paper;
- booklet series;
- a cancelled answer status;
- marks and negative marks: 1 mark, minus ⅓;
- question IDs that include the paper code and language.

## 3. How it publishes

Four Drupal listings, each with `?tid=<filter>&page=N`:

| Listing | Coverage | Size | Filters |
|---|---|---|---|
| `/previous-question-papers` | 2014–2016 only | 67 pages (~660) | 140 = 2016, 141 = 2015, 142 = 2014 |
| `/answerkey_omrexams` | 2013 → 2026-09-30 | 242 pages (~2,400) | 125 = provisional, 126 = final, 127 = list |
| `/answerkey_onlineexams` | 2014/15 → 2026 | 112 pages (~1,100) | 128 = provisional, 129 = final |
| `/question-paper-descriptive-exam` | 2014–2026 descriptive | 21 pages | year |

- **Rows** carry free-text metadata (code, medium, category, post, department, date), and the
  formatting is **inconsistent**. They link to:
  - the paper PDF, e.g. `/sites/default/files/2026-09/088-2026-M-A.pdf`;
  - the key, e.g. `finalkey-82-26-m.pdf`;
  - for online exams, one combined PDF (`151-CE-OL.pdf`).
- **File names aren't predictable,** so parse the listings rather than guessing URLs.
- **Cadence:** several papers a week. The final key comes about 2–3 weeks after the exam (5-day
  complaint window).
- **Volume:** about 2,500 distinct papers × ~100 questions, which is about 250k occurrences. Many are
  language duplicates.

## 4. Question shape

| Sample | PDF creator | Text | Notes |
|---|---|---|---|
| `175/2016` Automobile Mechanic | Canon scan, 100 dpi | Garbage | Needs OCR, and 100 dpi is marginal |
| `087/2026` Tradesman Masonry (OMR, English) | Word → Distiller | **Clean** | 100 questions, `1.` + `(A)…(D)`, 1–4 option columns, √ lost, "Statement I/II" questions |
| `088/2026-M` Clerk (Malayalam) | Word → Distiller, Shree-Mal font | **Unusable** | Needs a Shree-Mal → Unicode mapper, or OCR/vision |
| `151/2026/OL` Welder (online, English) | Firefox print | **Clean** | `QuestionN:-`, `A:-…D:-`, `Correct Answer:- Option-C` |
| `149/2026/OL` Fitter (online, Malayalam) | Firefox | Unicode, but conjuncts are lost | Needs repair through OCR/vision |

## 5. Answers

- **OMR keys** are digital, one-page tables:
  - a header with provisional/final, QP code, medium, category codes, post and date;
  - Q1–100 × booklet series A–D;
  - `X` means deleted (cancelled).
- **Final keys** carry a file reference. **Revised final** keys also exist.
- **Online keys** give the answer inline in the paper PDF.
- **Always prefer the final key.**
- **Older papers:** provisional keys go back to 2013. Whether 2014–16 legacy papers have keys is
  UNVERIFIED.

## 6. Third-party sources and datasets

| Source | Coverage | Malayalam as text | Answers | Terms / licence | Verdict |
|---|---|---|---|---|---|
| **EasyPSC "Thulasi"** ([thulasi.easypsc.com/exams](https://thulasi.easypsc.com/exams)) | 407 papers, 2003–2026 (strongest 2021–24); slugs cite official codes | **Yes, clean Unicode** in inline JSON | Option text; "Cancelled Question" follows the **final** key | robots allow all, but the **terms forbid scraping and reproduction without written permission** | **Recommended for Malayalam text, only with permission** |
| HF `roshansk23/Malayalam_KPSC_MCQ_Datasets` | 4 papers, 371 rows | Corrupted text (wrong questions, wrong words) | Indices correct | Apache-2.0 | **Avoid** (useful only as an extraction test case) |
| AI4Bharat MILU | Malayalam portion ~4.3k | Yes | Letter | CC-BY-4.0 (gated) | Low value: no paper or year |
| keralapscgk.com | Recent papers, 20 questions per paper | Yes (HTML entities) | Index | Not checked | Spot-check only |
| way4job.com | ~20 papers 2005–2017, with explanations | Probably (UNVERIFIED) | Yes | Not checked | Niche: pre-2016 papers |
| pscpdfbanks, pscarivukal, keralapsctips | Re-hosted official PDFs or images | No | Official | All rights reserved / unclear | Avoid |
| Testbook, Entri, Adda247 | Paywalled | In-app | Yes | Restrictive | Avoid |

**Accuracy check:** Thulasi's 013/2024 (LD Clerk Stage V, Malayalam) matched the **official final
key on all 97 valid questions**, and its 3 cancellations match the final key. Q61's text doesn't
match its options (a transcription glitch, UNVERIFIED), so every paper still needs a cross-check.

**Recommended mix:**
- **Answers and paper identity:** always the official listings and final keys, plus the English and
  online-exam text.
- **Malayalam text, in order of preference:**
  1. EasyPSC, with permission;
  2. our own Shree-Mal mapper;
  3. OCR or vision.
- **Cross-checks:** EasyPSC's answers against the official booklet-A key; question count and order
  against the official PDF; and text similarity between EasyPSC and our own conversion.
- **Explanations:** our own.

## 7. Fit with the vision

- **Coverage:** 2013–2026, continuously.
- **Syllabi:** `/syllabus1` (19 pages) has PDFs per post with module weights, which suits topic
  tagging.
- **Prediction value:** high. Posts recur, prelim cohorts are huge, and GK questions get reused.

## 8. Technical approach

- **Fetching:** plain HTTP, at least 2 seconds between requests; parse `views-row` blocks;
  incremental by upload date; Final filter first. A full backfill is about 420 listing pages plus
  ~5k PDFs.
- **Parsing, by tier:**
  1. **Online English:** regex on the combined PDF. Size S.
  2. **OMR English:** layout segmentation plus a join to the booklet-A key column. Size M.
  3. **Malayalam, Tamil and Kannada:** the Shree-Mal mapper, OCR (`eng+mal+tam+kan`; Tesseract is
     not installed yet), or Claude vision.
  4. **2014–16 scans:** vision OCR.
- **Identity:** by position per paper, language and series A.
- **Dedupe:** language editions are linked by translation group (not treated as duplicates), and
  questions across years are deduplicated with the normal pipeline.
- **Quality checks:**
  - 100 questions with 4 options each;
  - the key has 100 rows, skipping `X`;
  - the key header agrees with the listing row;
  - math characters survive.

## 9. Risks and open questions

- The deep-linking clause.
- Fragile free-text listing metadata.
- Booklet A only, so there's no cross-validation from other series.
- Diagrams in technical papers.
- Whether legacy papers have keys.
- One exam or many when a paper serves many posts? We chose the post family plus category codes.

## 10. Plan

**Depends on:** foundation steps S1–S5 and P; O for Malayalam.

1. **A listings connector** (`connectors/kerala-psc-gov/`, replacing `generic`): manifest rows from
   the OMR and online key listings, with fixtures from saved HTML.
2. **Pilot 1:** about 100 recent **online English** final-key papers. Acceptance: 100 questions and
   an answer for each, with 20 spot-checks.
3. **Pilot 2:** English OMR papers (Tradesman, AE Civil) with the booklet-A join and `X`
   cancellations.
4. **Malayalam:** EasyPSC with permission, or a Shree-Mal mapper compared against OCR on 5 papers.
   Translation groups.
5. **The 2014–16 scans,** then syllabus topic tagging.
6. **An ongoing weekly run,** swapping each provisional key for the final one.
