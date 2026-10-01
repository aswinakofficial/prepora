# APJ Abdul Kalam Technological University (KTU)

> **Verdict:** Highest value, but blocked until KTU grants access. **Effort:** L.
> **Researched:** 2026-10-01. Unconfirmed details are marked UNVERIFIED.

KTU is the most valuable Kerala university source: one consistent B.Tech structure across about 150
colleges. It also has official **"Scheme for Valuation / Answer Key"** documents, written for
examiners, with model answers and mark breakdowns. Those are the best possible answer source for a
university paper.

The official question-paper portal on ktu.edu.in sits behind **Cloudflare Turnstile**. Prepora
doesn't bypass bot protection. A public GitHub scraper does, by driving a real browser, and we
won't follow it. So the route is to **ask KTU for access** ([permissions](permissions.md)), or have
an admin upload papers manually.

## 1. Legitimacy

- **robots.txt:** `User-agent: * / Disallow:` (everything allowed), but the Turnstile token is the
  real barrier.
- **Footer copyright:** not captured (the footer is rendered by JavaScript).
- **Schemes of valuation:** they circulate on Scribd and Studocu, uploaded by unknown users
  (CE409, ME467, CST304 May 2023). Their provenance is doubtful, so they aren't used as a source.

## 2. Exam landscape → knowledge index

- **Programmes:** B.Tech, B.Arch, M.Tech, MCA, MBA, and BBA/BCA under the 2024 scheme.
- **Schemes:** 2015, 2019, 2024. **Semesters:** S1–S8.
- **Course codes:** CST301 (2019 scheme), PCCST302 (2024 scheme).
- **Sessions:** e.g. "December 2024 (R, S)", meaning regular and supplementary.

| Knowledge index | KTU |
|---|---|
| Organization | `ktu` |
| Exam | `ktu-btech` |
| Hierarchy template | `regulation → branch → semester → course → session` |
| Example path | `/exams/ktu-btech/2019/cse/s6/cst302/2024-dec` |
| Sections (2019, from memory, UNVERIFIED) | Part A: 10 × 3 marks. Part B: 5 modules, answer one of two per module, 14 marks with sub-parts a/b. Total 100 marks. |
| Sections (2024, UNVERIFIED) | Part A: 8 × 3. Part B: 4 modules × 9. Total 60. |
| Answers | `official_scheme_of_valuation` claims, where obtained legitimately |

## 3. How it publishes

- The ktu.edu.in "Previous Question Papers" page calls a `getPreviousQuestionPaper` service
  (filtered by year, programme, scheme, semester, exam and course) and
  `getPreviousQuestionPaperAttachment`. Every request needs a Turnstile token.
- Per that scraper's README, the PDFs are **bundles** covering a whole semester or branch, so they
  need splitting.
- Syllabi come through the same gated portal (`getSyllabus`).

## 6. Third-party sources

| Source | Notes | Verdict |
|---|---|---|
| [pyq.ktunotes.live](https://pyq.ktunotes.live/) | robots `Allow: /`; search by branch, semester and subject for the 2019 and 2024 schemes; its terms weren't checked | Possible |
| [ktunotes.in](https://ktunotes.in/) | Terms: users may not "scrape, crawl, or use automated tools to collect content in bulk" | Avoid automated use |
| [ktustudents.in](https://www.ktustudents.in/p/ktu-previous-question-papers.html) | Blogger table of papers S1–S8, robots allow | Possible, as a list of what exists |
| ktuassist.in | "Solved" papers, i.e. third-party answers | Avoid for answers |
| GitHub (KTU-Archive, KTU-Study-Bot, ktu-qp-scraper) | Tooling, not datasets; the scraper bypasses Turnstile | Avoid |

## 10. Plan

1. Ask KTU for access to papers **and schemes of valuation**.
2. Pilot **B.Tech CSE, 2019 scheme, S5–S6** (CST301–CST306), once access is granted.
