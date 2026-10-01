# ISTQB (International Software Testing Qualifications Board)

> **Verdict:** Go with written approval. This is the first certification track after MS Learn.
> **Effort:** M.
> **Researched:** 2026-10-01. Unconfirmed details are marked UNVERIFIED.

ISTQB publishes free official **sample exams** as PDFs, with no login. Each question comes with:
- the correct answer;
- its **learning objective** (LO) code;
- its **K-level** (cognitive level);
- a **rationale for every option**.

That's the richest answer data of any certification source, and the LO codes map directly onto our
topic taxonomy.

## 1. Legitimacy

- **Copyright notice in each PDF:**
  - "Extracts, for non-commercial use, from this document may be copied if the source is
    acknowledged."
  - "Any individual or group of individuals may use this sample exam in articles and books, if the
    authors and the ISTQB® are acknowledged as the source and copyright owners of the sample exam."
  - "Any other use of this sample exam is prohibited without first obtaining the approval in
    writing of the ISTQB®."

  Republishing whole exams in a web app needs **written approval**:
  [permissions](permissions.md).
- **robots.txt** (istqb.org): `Allow: /`, disallowing only `/wp-admin/`. It also says
  `Content-Signal: search=yes, ai-input=yes, ai-train=no, use=reference`.

## 2. Exam landscape → knowledge index

- **The hierarchy:** ISTQB → stream (Core Foundation / Core Advanced / Agile / Specialist) → exam
  code (CTFL) → syllabus version (4.0.1).
- **Knowledge index:**
  - organization `istqb`;
  - exam group = stream;
  - exam `istqb-ctfl`;
  - template `version` (in URLs, since versions are public, e.g. `v4-0`);
  - paper groups = sample exams A–D, kind `sample_paper`, answers `official_sample_key`.
- **Syllabus items:** the syllabus PDF lists every LO (`FL-1.1.1`, K1–K4).
  - Chapters (FL-1 … FL-6) become subjects.
  - Sections (FL-1.1) become topics.
  - The K-level becomes `cognitiveLevel`.
- Example: ISTQB → Foundation → CTFL → v4.0.1, Sample Exam A Q1: answer c, LO FL-1.1.1, K1.

## 3. How it publishes

Each certification page has a "Sample Exams" downloads block using WordPress download IDs, e.g.
`https://istqb.org/?sdm_process_download=1&download_id=3352` (CTFL v4.0 Sample Exam A Questions
v1.7). The matching Answers file is id 3357.

| Exam | Sample sets |
|---|---|
| CTFL v4.0 | A v1.7, B v1.7, C v1.6, D v1.5 (40 each; Set A has 21 extra questions): about 181 questions |
| CTAL-TA | v4.1 |
| CTAL-TTA | v4.2 |
| CTAL-TM | A v1.3.3, B v1.0 |
| CTAL-TAE | v2.4 |
| CTFL-AT | v1.3 |
| CT-AI | v2.2 |
| CT-TAS | v1.2 |
| CT-PT | A v1.3 |
| CT-SEC | A v1.1 |

Other specialist exams (Mobile, Usability, Automotive, Game, Gambling, MBT, Acceptance, Gen-AI…)
weren't checked. Files carry a revision history (Set A went from v1.0 to v1.7, mostly answer
fixes), so track the version in the file name and re-import when it changes.

## 4–5. Question shape and answers

- **Questions:** single and multiple choice, clean text (`pdftotext -layout`).
- **The answers PDF:** a key table (question, answer, LO, K-level, points), then each option marked
  "Is correct / Is not correct" with a reason citing the syllabus.

## 6. Third-party sources

- **ASTQB** (the US national board) writes its own extra sample exams with explanations, e.g. CTFL
  4.0.1 #3 and #4 (May 2026). They're "Copyright ASTQB, All Rights Reserved", so separate
  permission is needed.
- Other national boards weren't checked (UNVERIFIED).
- **Excluded:** istqbdumps.org, istqb.guru and other dump or re-upload sites.

## 8. Technical approach

- Download the PDF pairs.
- Parse the answer-key table and the per-option rationale blocks with regexes.
- Join questions to answers by number.
- Seed `syllabus_items` from the syllabus PDF's LO list.
- Identity: by position within each sample exam version.

## 9. Risks and open questions

- Written approval.
- Re-imports when sample-exam versions change.
- Whether the rationales may be shown in full; they're part of the same permission.

## 10. Plan

**Depends on:** foundation steps S1–S3 and P.

1. Request approval.
2. Pilot CTFL v4 Sample Exams A–D.
3. Seed the syllabus items.
4. Add the Advanced and Specialist sample exams, using the same parser.
5. Calibrate AI-suggested answers against these keys.
