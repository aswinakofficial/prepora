# Mahatma Gandhi University (mgu.ac.in)

> **Verdict:** Go. This is the **university pilot**. **Effort:** S to M.
> **Researched:** 2026-10-01. Unconfirmed details are marked UNVERIFIED.

MGU publishes recent semester papers as **text PDFs**, one per course. The paper code, course code,
session, scheme and admission years are all in the header, and every question is tagged with a
**Bloom level and course-outcome number**. 166 MGU-UGP papers from November 2024 alone are listed.

## 1. Legitimacy

- **robots.txt:** `Disallow:` (everything allowed), with a sitemap.
- **Copyright:** no copyright line found on the homepage. Courtesy attribution is planned
  ([permissions](permissions.md)).

## 2. Exam landscape → knowledge index

**The university hierarchy:** University → Programme → Regulation/Scheme → Specialisation →
Semester → Course → Exam session → Paper.

| Knowledge index | MGU |
|---|---|
| Organization | `mgu` |
| Exam | `mgu-ugp` (4-year UG honours); also `mgu-cbcs`, `mgu-cbcss`, `mgu-pg`, `mgu-bed`… |
| Hierarchy template | `regulation (2024) → semester → course → session` |
| Course | shared catalogue entry `MG1MDCMAT100` ("Mathematics for competitive examinations"), category MDC |
| Session node | "November 2024 (Regular)", attempt type regular |
| Paper group | QP code `24900176`, kind `past_paper`, 50 marks, 1 hour |
| Sections | Part A: "Multiple Choice Questions – Answer any ten – Each question carries 2 marks" (choice rule any_n = 10) |
| Occurrence attributes | `[U] [1]`: Bloom level U, course outcome 1 |

Gaps (closed by foundation steps S4 and S6): course category, attempt type, admission-year
applicability, choice rules, Bloom/course-outcome tags.

## 3. How it publishes

- `mgu.ac.in/examinations/previous-question-papers-2/` links to per-programme pages: MGU-UGP 4-year,
  CBCS, CBCSS, CBCSS-Private, PG, B.Ed, B.PEd, BLISc, BSc Nursing, B.Arch, B.Voc, BHM, BPT.
- Each entry is a WordPress attachment titled `QP code – Course name (Course code)`.
- The PDF address comes from the site's REST API at `/api/wp/v2/media/<id>` (served under `/api/`,
  not `/wp-json/`).

## 4. Question shape

- **Sample:** a Nitro Pro text PDF, 12 pages, with the header "FIRST SEMESTER MGU-UGP (HONOURS)
  REGULAR EXAMINATION NOVEMBER 2024", "Multi-Disciplinary Course – MG1MDCMAT100" and "(2024
  ADMISSION ONWARDS)".
- **Question types:** MCQ sections plus descriptive parts.
- **Formulas embedded as images are lost** ("Find the H.C.F of" followed by nothing). Those
  questions need a page crop or a review.

## 5. Answers

None official. They come from AI suggestions an admin confirms
([ADR-015](../adr/015-ai-assistance.md)), or from contributors.

## 7. Fit with the vision

Syllabus PDFs exist. Bloom and course-outcome tags allow rich difficulty and skill analysis.

## 10. Plan

**Depends on:** foundation steps S1–S6 and P.

1. Pilot **MGU-UGP 2024, Semester 1, November 2024.**
2. Parse the header metadata and Part A's MCQs.
3. Crop questions whose formulas are images.
4. AI answer suggestions with admin confirmation.
5. Then the other programmes.
