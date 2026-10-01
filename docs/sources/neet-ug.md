# NEET-UG: National Testing Agency

> **Verdict:** Parked. NTA publishes no question papers, so the questions would come from a third
> party, which needs NTA's and Aakash's permission. **Effort:** M.
> **Researched:** 2026-10-01. Unconfirmed details are marked UNVERIFIED.

NEET is a pen-and-paper exam, and candidates keep their booklets. NTA publishes only **answer
keys**, per booklet code: text PDFs from 2021 onwards, with `Drop` marking dropped questions. So
the only routes to question text are third parties. Aakash publishes clean "Answers & Solutions"
PDFs of the real papers.

## 1. Legitimacy

- **NTA:** the same "reproduced free of charge after taking proper permission" policy as
  [JEE Main](jee-main.md).
- **Aakash:** no reuse clause in its terms, so all rights are reserved by default. The question
  text is NTA's; the solutions are Aakash's.
- [permissions](permissions.md): NTA and Aakash.

## 2. Exam landscape → knowledge index

- **One sitting a year,** 180 questions in 2026: Physics 45, Chemistry 45, Biology 90.
- **Booklet codes:** e.g. 45–48 in 2025; 50/60/70/80 for the 2026 re-exam.
- **Languages:** 13.
- **2026 had two papers:** the 3 May exam and a 21 June re-exam.

Mapping: organization `nta` → exam `neet-ug` → template `year → sitting` (main and re-exam).
Booklet codes go in `paper_group_codes`, and editions are split by booklet and language.

## 3. How it publishes

- **No official papers.** I checked the homepage, `/archive/` and the notices. The scanned OMR
  answer sheets are shown only behind candidate login.
- **Official keys:**
  - the 2026 re-exam final key, `uploads/2026/07/20260716131467523.pdf`: ReportLab text, one page
    per code, `Drop` markers;
  - the 3 May 2026 provisional key: an HP scan.

## 4–5. Question shape and answers

- **Questions:** single-answer MCQs (options 1–4), heavy on diagrams and chemical structures,
  bilingual.
- **Answers:** official keys per booklet code, which make answer matching easy once question text
  exists.

## 6. Third-party sources and datasets

| Source | Coverage | Format | Terms / licence | Verdict |
|---|---|---|---|---|
| **[Aakash](https://www.aakash.ac.in/neet-previous-year-question-papers)** | 148 PDFs: 2020 (15), 2022 (48), 2023 (24), 2024 (3), 2025 (4); by booklet code | **Text PDFs**, every question with "Answer (n)" and "Sol."; superscripts flatten | All rights reserved | **Recommended** source of question text, **with permission** |
| [ExamSIDE NEET](https://questions.examside.com/past-years/year-wise/medical/neet) | AIPMT 2000–2015, NEET 2013–2026 including re-exams | HTML/JSON, MathJax SVG | ExamGOAL: no copying | Index and cross-check |
| [Reja1/jee-neet-benchmark](https://huggingface.co/datasets/Reja1/jee-neet-benchmark) | NEET 2024 T3, 2025 code 45, 2026 code 13 | A PNG per question, with booklet code | MIT (images are NTA content) | Answer cross-check and crops |
| [dipikakhullar/neet](https://huggingface.co/datasets/dipikakhullar/neet) (Kaleidoscope) | 2016–2024, **13 languages** | JSON with LaTeX | Repo says MIT; rows say "fair use", source shiksha.com | Lead for multilingual content; the licence is contradictory |
| Selfstudys, Careers360, Byju's | Re-hosts of Aakash/Allen | — | Restrictive | Avoid |

## 7–8. Fit and technical approach

High demand, but question text depends entirely on a third party. Aakash's PDFs parse well: the
question, options (1)–(4), "Answer (n)" and "Sol." Formulas need a vision fix-up. Use the code that
matches the official key's booklet code.

## 9. Risks and open questions

- Permission from both NTA and Aakash.
- Aakash's 2021 and 2026 coverage (UNVERIFIED).
- Which booklet code ExamSIDE follows.

## 10. Plan

Parked until the permissions are decided. When unparked:
1. Aakash PDFs per code as the text.
2. NTA final keys as the answers.
3. Aakash's "Answer (n)", Reja1 and ExamSIDE as cross-checks.
4. Our own explanations, unless Aakash allows theirs.
