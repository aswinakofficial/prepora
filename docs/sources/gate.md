# GATE (Graduate Aptitude Test in Engineering)

> **Verdict:** Go, after the permission decision. This is the first exam-paper track. **Effort:** M.
> **Researched:** 2026-10-01. Unconfirmed details are marked UNVERIFIED.

The official GATE site publishes every paper as a text PDF together with a clean answer-key
table, and it archives past years back to 2019. A bulk folder covers 2007–2025. That makes GATE
the best-structured exam-paper source we've found, and its keys give us a way to measure AI
answer accuracy. The open issues:
- **Republishing rights:** the papers are free to download, but "All Rights Reserved".
- **Equations and vector figures:** these need page crops.
- **Data-model gaps:** sittings, numeric ranges, marks to all, and marks/sections.

## 1. Legitimacy

- **Publisher:** the organising IIT or IISc, on behalf of NCB-GATE and the Ministry of Education.
  The organiser changes every year: IIT Guwahati for 2026, and IIT Bombay appears to run 2027.
- **Copyright:** every PDF footer reads "© GATE 2026, Indian Institute of Technology Guwahati. All
  Rights Reserved." The 2024 site says "© Copyright: GATE 2024, Indian Institute of SCIENCE
  BENGALURU". There is no terms-of-use page or licence. The site disclaimer only covers postponement
  and admission or job guarantees.
- **Free download is intended:** the QPs page says candidates "must refer to the Master Question
  Paper and the associated Answer Key", and `download.html` offers a "BULK DOWNLOAD OF QUESTION
  PAPERS (2007 TO 2025)" Google Drive folder. Republishing is not explicitly granted, so it needs a
  decision or a request to NCB-GATE ([permissions](permissions.md)).
- **robots.txt:**
  - `gate2026.iitg.ac.in/robots.txt` returns 404, so there are no rules.
  - `gate2024.iisc.ac.in` disallows only `/wp-admin/`.
  - Older hosts (IIT Roorkee, IIT Kanpur, IIT Kharagpur) timed out.

## 2. Exam landscape → knowledge index

There are 38 papers in 2026:

| Code | Paper | Code | Paper |
|---|---|---|---|
| AE | Aerospace | ME | Mechanical |
| AG | Agricultural | MN | Mining |
| AR | Architecture | MT | Metallurgy |
| BM | Biomedical | NM | Naval Architecture |
| BT | Biotechnology | PE | Petroleum |
| CE-1/2 | Civil | PH | Physics |
| CH | Chemical | PI | Production |
| CS-1/2 | Computer Science & IT | ST | Statistics |
| CY | Chemistry | TF | Textile |
| DA | Data Science & AI | XE | Engineering Sciences |
| EC | Electronics | XH-C1…C6 | Humanities |
| EE | Electrical | XL | Life Sciences |
| ES | Environmental | GG-1/2 | Geology / Geophysics |
| EY | Ecology | | |
| GE | Geomatics | | |
| IN | Instrumentation | | |
| MA | Mathematics | | |

**Two sittings in 2026:** CS (CS-1 forenoon, CS-2 afternoon) and CE. 2025 is the same. The 2021–22
keys were "merged" files, suggesting multiple sessions. GG-1/2 and XH-C1–C6 are *different papers*
that share a compulsory part; they are not sittings.

**Sections:**
- Every paper has GA (General Aptitude, Q1–10) plus the discipline section.
- XE: section A (Engineering Mathematics) is compulsory, plus any two of B–I, with **one global
  question numbering** (1–197).
- XL: section P is compulsory, plus two of Q–U.
- XH: B1 is compulsory, plus one C section.
- AR, GE and GG: part A, plus B1 or B2.

| Knowledge index | GATE |
|---|---|
| Organization | `ncb-gate`; each year's organising institute is recorded as node attributes |
| Exam | `gate` |
| Hierarchy template | `paper → year → sitting (optional)` |
| Example paths | `/exams/gate/cs/2026/cs-1`, `/exams/gate/me/2026` |
| Paper group | one per paper per year (QP code `CS-1`) |
| Sections | `GA` (Q1–10), `CS` (Q11–65); XE `A`…`I` with number ranges and "pick 2" choice rules |
| Subjects and topics | from the official syllabus: CS has 10 sections (Engineering Mathematics … Computer Networks) as subjects, and its sub-headings as topics |

**Gaps** (closed by foundation steps S2 and S4):
- the sitting isn't part of question IDs or URLs;
- numeric-range answers;
- marks to all (MTA);
- marks and negative marks per occurrence;
- sections with a global numbering;
- multiple-select questions with a single correct option;
- General Aptitude questions shared between papers held in the same session (UNVERIFIED).

## 3. How it publishes

- **2026:** `https://gate2026.iitg.ac.in/QPs-answer-keys.html` is a static page listing 76 PDFs.
  - Papers: `doc/download/2026/QPs/{CODE}.pdf`. Naming varies: `CS1.pdf`, `CE_1.pdf`, `XH-C1.pdf`.
  - Keys: `doc/download/2026/Keys/{CODE}_Keys.pdf`.
  - Responses carry ETag and Last-Modified headers.
- **Archive on the 2026 host:** `https://gate2026.iitg.ac.in/download.html`.

| Year | Paper URL pattern | Key URL pattern | Count |
|---|---|---|---|
| 2025 | `2025/CS12025.pdf` | `2025_Key/CS1_Keys.pdf` | 38 + 38 |
| 2024 | `2024/CS124S5.pdf` | `2024/CS1FinalAnswerKey.pdf` | 76 |
| 2023 | `2023/cs_2023.pdf` | `Answer_keys2023/CS_ANS_GATE2023.pdf` | 31 + 31 |
| 2022 | `2022/cs_2022.pdf` | `Answer_keys2022/cs_2022.pdf` | 29 + 29 |
| 2021 | `2021/cs_2021.pdf` | `Answer_keys2021/cs_merged_2021.pdf` | 27 + 27 |
| 2019–20 | `2019/cs_2019.pdf` | **no keys** | 48 / 50 |

- **Bulk folder:** `drive.google.com/drive/folders/1sV6FgtOUDl_PGjc36Zdc0eJwK1zZ_2OF`, linked from
  the official download page. It holds **one zip per paper** (35: AE … XL, with XH split into
  XH-C1 to XH-C6). `CS.zip` (51 MB, 24 PDFs) was inspected on 2026-10-03; see "The Drive folder's
  CS papers" below.
- **Volume:** about 38 papers a year, most with 65 questions (XE has 197). That's roughly 2,700
  questions a year, of which about 130 per sitting are CS.
- **Hosts move every year,** and old hosts go dark. Archive raw PDFs as soon as the track starts.

### The Drive folder's CS papers (checked 2026-10-03)

One PDF per year, plus two per year for the years with two sittings (2017, 2021, 2024, 2025).
Names are irregular: `CS2007.pdf`, `CS1-2017.pdf`, `CS12024.pdf`. "Text" means extractable text;
"scan" means page images that need OCR. Keys marked "in file" are printed at the end of the same
PDF.

| Year | Text or scan | Sittings in the file | Answer key | Usable now? |
|---|---|---|---|---|
| 2007–2010 | Scan | 1 | Not in the file | No (OCR and a key needed) |
| 2011 | **Corrupt** (not a valid PDF) | — | — | No |
| 2012 | Text | 1 | In file, one column per booklet code A–D, includes "Marks to All" | Needs the booklet code mapped |
| 2013 | Text | 4 sessions in one file | Not in the file | Needs a key |
| 2014 | Text | 3 sessions | In file, after each session (modern Key/Range table) | **Yes**, per session |
| 2015 | Mostly images | 3 sessions | Not found | No |
| 2016 | Text | 2 sets | In file, after each set | **Yes**, per set |
| 2017 | CS-1 **corrupt**; CS-2 mixed text and images | 2 | CS-2: in file | CS-2 partly |
| 2018 | Text | 1 | In file (Type / Section / Key/Range / Marks table) | **Yes** |
| 2019 | Scan | 1 | No official key exists | No |
| 2020 | Mixed | 1 | In file, a web-page printout with doubled glyphs ("HHoommee") | After cleaning |
| 2021 | Scan (CS-1 and CS-2) | 2 | Not in the file (key on the IITG archive) | No (OCR needed) |
| 2022–2023 | Text | 1 | Not in the file; keys on the IITG archive (§3 table) | **Yes** |
| 2024 | Text | CS-1, CS-2 | Not in the file; final keys on the IITG archive | **Yes** |
| 2025 | Text | CS-1, CS-2 | Same files as the IITG archive (byte-identical sizes) | Pilot |

**What this means for the track:**
- After the pilot, the next papers that need **no OCR** are:
  - 2022, 2023 and 2024, with keys from the IITG archive;
  - 2014, 2016 and 2018, with keys in the same file. Each needs its key's page range split from
    the paper's.
- 2007–2011, 2015, 2019 and 2021 need OCR (track O). 2011 and CS-1 2017 also need a clean copy
  from another source.
- Fetching from Drive needs `drive.google.com` (and `drive.usercontent.google.com`) added to the
  `gate` source's allowed hosts. Large files go through a "can't scan for viruses" confirmation
  step.

## 4. Question shape

Sample checked: CS1 2026, a Word 2016 PDF of 46 pages.

- **Questions:** 65 in total (GA Q1–10, CS Q11–65): 28 MCQ, 24 multiple-select and 13 numeric.
  There's usually one question per page.
- **Marks:** headings like `Q.1 – Q.5 Carry ONE mark Each`.
- **Negative marking:** one-third for wrong one-mark MCQs and two-thirds for two-mark MCQs; none
  for multiple-select or numeric questions.
- **Text that comes through cleanly:**
  - option lists, e.g. Q.3 `(A) 127 (B) 64 (C) 63 (D) 32`;
  - C code, which keeps its indentation (Courier).
- **Text that comes through garbled:**
  - Q.31: wrapped option text pushes the label below its text, so segment by label column using
    word positions.
  - Q.18: fractions and superscripts break apart (`Θ(𝑛log4 5)` is n^{log₄5}).
  - Q.32: a piecewise function scatters.
  - Math italic code points need NFKC normalization.
- **Figures:** the Q.42 control-flow graph is **vector** and leaves empty text, so it needs a
  page-region crop rather than image extraction.

## 5. Answers

- **Key table columns:** `Q. No. | Session | Question Type | Section | Key/Range | Marks`.
- **Answer formats:**
  - MCQ: `A`–`D`.
  - Multiple-select: `A;C;D` (commas in 2023), and sometimes a single letter.
  - Numeric: `4.24 to 4.26`, `6 to 6`, negatives, and **alternatives**
    `-0.61 to -0.57 OR 0.57 to 0.61` (ME 2026 Q52).
  - `MTA` means marks to all (2023 CS Q2).
- **Joining:** by question number within a paper. The site says "The Answer Key matches the order
  of questions in the Master Question Paper."
- **Provisional vs final:** challenges ran 25–28 February 2026, and the key PDFs are dated 7 March,
  so they're presumably final (UNVERIFIED). 2024 files say `FinalAnswerKey`.
- **Producers change by year,** so the parser needs one header profile per year:

| Year | Producer | Notes |
|---|---|---|
| 2026 | Word | |
| 2025 | ReportLab | |
| 2024 | Print-to-PDF | wrapped headers |
| 2023 | Excel | |
| 2021 | image-only | needs OCR |

## 6. Third-party sources and datasets

| Source | Kind | Coverage | Terms / licence | Verdict |
|---|---|---|---|---|
| [GATE Overflow](https://gateoverflow.in) | Community Q&A (non-profit foundation) | Every CS paper 1987–2026, plus ISRO, TIFR, UGC-NET; topic, marks and difficulty tags; "Answer:" lines; explanations | **"Unauthorized use and/or duplication … without express written permission … is strictly prohibited. Excerpts and links may be used…"** robots `Content-Signal: ai-train=no`; Cloudflare challenge on every URL | Ask permission for its **tag mapping and answers**. Explanations are reference only. No scraping. |
| GO-PDFs (GitHub) | Book PDFs | CS volumes 1–3 | No licence; the site's copyright applies | Reference only |
| [ExamSIDE](https://questions.examside.com/past-years/gate/gate-cse) | Commercial | CS 50 papers 1987–2026, 8 disciplines | ExamGOAL terms: no copying | Avoid (count cross-checks only) |
| GeeksforGeeks quizzes | Editorial | CS/DA 2010–2025 | "GeeksforGeeks is the Copyright Holder" | Avoid |
| HF Abhay557/indian-exams-rawdata | Mirror | Papers and keys 2007–2025 | Tagged CC-BY-4.0, but the card admits the content is the exam bodies' | Mirror only, no extra rights |
| GateR / kt-sudo (GitHub) | Hobby | GO-derived / PDF mirror | No real licence | Avoid |
| MaScQA | Benchmark | ~650 metallurgy questions | CC-BY-NC-SA-4.0 | Niche |

**Recommended mix:**
- **Question text:** the official PDFs, 2007–2026.
- **Answers:** official keys. For 2019–20 (no official key), a consensus of GATE Overflow's answer
  and a coaching key, labelled community and used only with GO's permission. Otherwise AI-suggested
  answers confirmed by an admin.
- **Explanations:** written by Prepora or contributors.
- **Topics:** our own, from the official syllabus. GATE Overflow's mapping only if permitted.
- **Cross-checks:** per-paper question counts against ExamSIDE's index, and answers against GATE
  Overflow.

## 7. Fit with the vision

- **Clean text and keys:** 2023–2026, with 2022 likely (UNVERIFIED).
- **With OCR:** up to about 8 years.
- **Syllabus:** stable and well structured (GA plus the per-paper syllabus PDFs at
  `doc/GATE2026_Syllabus/CS_2026_Syllabus.pdf`), which is ideal for topic trends and predicted
  papers.

## 8. Technical approach

- **Fetching:** plain HTTPS, about 10 requests a minute, ETag change detection, and a per-year URL
  map scraped from the QPs and download pages.
- **Parsing papers:** text with word positions; strip headers and footers; read marks from the
  "Carry ONE/TWO" blocks; segment `Q.N` by the label column; options `(A)`–`(D)`; NFKC.
- **Parsing keys:** a regex per year's header profile, parsing ranges into `[lo, hi]` lists, with
  MTA treated as an answer status.
- **Join and validate:**
  - key rows and question numbers must match one to one;
  - MCQ and multiple-select questions have exactly 4 options, numeric questions none;
  - section counts must be right (10 GA + 55);
  - marks must agree.
- **Figures and equations:** a garble detector, with a page-region crop at 200 dpi; optionally an
  AI LaTeX transcription that an admin confirms.
- **Identity and dedupe:**
  - Identity is by position, including the sitting.
  - Exact dedupe collapses shared General Aptitude questions within a session.
  - Cross-year near-duplicate merging stays held for review (GA templates recur).
- **GATE-specific quality checks:**
  - multiple-select keys are a subset of A–D;
  - numeric ranges have lo ≤ hi;
  - one-mark and two-mark question counts are right;
  - private-use code points trigger an image crop.

## 9. Risks and open questions

- Republishing rights ("All Rights Reserved"), and whether GATE Overflow will give permission.
- Link rot as hosts move each year.
- Math fidelity.
- Whether shared GA questions across a session really are identical.
- ~~What the Drive folder contains.~~ Answered for CS (§3, 2026-10-03). Other papers are likely
  similar, but unchecked.
- Whether XL and XH keys follow XE's global numbering.

## 10. Plan

**Depends on:** foundation steps S1–S4 (hierarchy, contract v2, provenance, paper structure) and P
(the shared PDF stages).

1. Archive the 2025–2026 raw PDFs.
2. Pilot **CS-1 and CS-2 for 2025 and 2026** (about 260 questions). Acceptance:
   - every key row joins to a question;
   - at least 85% of questions need no image fallback;
   - every flagged question has a crop;
   - 30 questions are spot-checked by hand.
3. Then CS 2023–24.
4. Then ME, EE, EC, CE and DA.
5. Then XE, XL and XH (sections).
6. Then OCR for 2019–22.
7. Calibrate AI-suggested answers against the official keys, per subject.
