# University of Calicut (uoc.ac.in)

> **Verdict:** Go after OCR (foundation step O). **Effort:** M to L.
> **Researched:** 2026-10-01. Unconfirmed details are marked UNVERIFIED.

Calicut's library repository, scholar.uoc.ac.in (DSpace), has a "Question Papers" collection with
**475 items**, available through its public REST API with good metadata. Each item is **one scanned
PDF per programme-semester**, with a library watermark and no usable text. So it needs OCR, and the
file needs splitting into individual papers.

## 1. Legitimacy

- **Repository robots.txt:** disallows `/search` and `/admin/*`; item and file pages are allowed.
- **Licence:** the item licence file is the unedited DSpace placeholder ("PLACE YOUR OWN LICENSE
  HERE"), so there is no real licence.
- **Main site:** "Copyright © 2018 Calicut University. All Rights Reserved."
- See [permissions](permissions.md) (courtesy notice).

## 2. Exam landscape → knowledge index

- **Collection groups:** UG, UG Common Course, UG Professional, PG, PG Professional, BA/BSc and
  BCom/BBA Common Languages, Career Oriented Programmes, Entrance Examinations, Ph.D. Coursework.
- **Schemes:**
  - CBCSS-UG 2019, CBCSS-PG 2019;
  - CCSS-PG 2022/2023/2025 (department level);
  - CUFYUGP (2024 onwards; model papers sit in the syllabus PDFs).
- **Metadata example:** `dc.title` = "CBCSS2019 - MSc Physics Fourth Semester", `dc.date.issued` =
  2023, and `dc.description` lists the course titles.
- **Mapping:** exam `calicut-msc`, template `regulation → specialisation → semester → session`.
  Each split paper becomes a paper group with its course.

## 3. How it publishes

Public REST API at `/server/api`. Sample: 24 pages, scanned, watermarked "CHMK LIBRARY, UNIVERSITY
OF CALICUT"; the repository's own text extract holds only the watermark. Syllabus PDFs are at
docs.uoc.ac.in/website/syllabus/.

## 5. Answers

None.

## 10. Plan

**Depends on:** foundation steps S6 and O.

1. Pilot **MSc Mathematics, CCSS-2023, Semesters 1–4**, through the API.
2. OCR.
3. Split each file into papers by course header.
4. AI answer suggestions with admin confirmation.
