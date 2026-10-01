# JEE Main (Paper 1, B.E./B.Tech): National Testing Agency

> **Verdict:** Go with permission, but official coverage is thin (2026 Session 2 only).
> **Effort:** M (transcribing question images).
> **Researched:** 2026-10-01. Unconfirmed details are marked UNVERIFIED.

NTA publishes official JEE Main papers for **2026 Session 2 only**: 9 shifts, about 675 questions.
Their structure is better than any other source's. Stable Question IDs and Option IDs join exactly
to the final answer key. But every **question stem and option is an image**, so they need
transcription. NTA's own papers for 2019–2025 exist only as mirrors on a site that disallows
crawling.

## 1. Legitimacy

- **NTA copyright policy** (https://neet.nta.nic.in/copyright-policy/; jeemain links to the same):
  "Material featured on this site may be reproduced free of charge **after taking proper permission
  from National Testing Agency (NTA)**." The material must be accurate, not misleading, and
  acknowledged. → [permissions](permissions.md).
- **Terms** (https://jeemain.nta.nic.in/terms-and-conditions/): the content "should not be construed
  as a statement of law".
- **robots.txt:** the WordPress default (`Disallow: /wp-admin/`).
- **Hosting:** documents are on the S3WaaS CDN, `cdnbbsr.s3waas.gov.in`.

## 2. Exam landscape → knowledge index

- **Format:** computer-based. Two sessions (January and April), each with about 9–10 shifts. Paper
  1 has 75 questions per shift: Maths, Physics and Chemistry, each with a section A of 20 MCQs and
  a section B of 5 numerical questions. 300 marks.
- **Languages:** 13, though the sampled paper is English only (UNVERIFIED).
- **No booklet codes:** options are shuffled per candidate, so the IDs are what identify a question.

| Knowledge index | JEE Main |
|---|---|
| Organization | `nta` |
| Exam | `jee-main` |
| Hierarchy template | `paper → year → session → shift` |
| Example path | `/exams/jee-main/paper-1/2026/apr/2026-04-02-s1` |
| Sections | Mathematics A/B, Physics A/B, Chemistry A/B |
| Occurrence | `externalRef` = NTA Question ID; option IDs are kept in the occurrence attributes |

**Gaps** (closed by foundation steps S2 and S4): the external question ID, shift, sections, and
marks and negative marking.

## 3. How it publishes

- The "Question Papers" menu on https://jeemain.nta.nic.in/ lists 9 PDFs for 2026 Session 2:
  2, 4, 5 and 6 April (both shifts) and 8 April shift 2. For example:
  `cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2026/04/202604092096865379.pdf`.
- **Before 2026,** papers were shown only to candidates during the challenge window, behind login.
- **The sample paper:**
  - Chrome-printed, 30 pages.
  - The text layer is **only the structure**: question number, Question ID, type (`MCQ`/`SA`),
    sections, Option IDs.
  - **Stems and options are JPEGs**: 315 images, at about 122 ppi, which is borderline for small
    subscripts.
  - The `Possible Answers : 1` line is a placeholder, not the answer.

## 4. Question shape

- MCQs and integer numerical answers.
- Heavy maths, physics diagrams and chemical structures, all inside images. Transcribing them to
  Markdown and LaTeX needs vision.

## 5. Answers

- **Final key:** `uploads/2026/04/20260420409057044.pdf`. A text PDF, laid out as a table per date
  and shift: `QUESTION ID → CORRECT OPTION ID` for MCQs, and plain values for numerical questions.
  `Dropped` marks dropped questions.
- **Joining:** the IDs match the paper exactly. For example, paper `6911211` joins key
  `6911211 → 6911213` (option 3).
- **Variants:** there's a separate key for centres outside India. Session 1 final keys come "along
  with Option IDs".
- **Timing:** provisional key about 3 days after the exam, then the challenge window, then the
  final key about 2 weeks later.

## 6. Third-party sources and datasets

| Source | Kind | Coverage | Terms / licence | Verdict |
|---|---|---|---|---|
| **Careers360 NTA master PDFs** ([index](https://engineering.careers360.com/articles/jee-main-question-papers)) | NTA's **own** papers, mirrored | ~130 PDFs, 2014–18 (some) and 2019–2025 shifts, with Question/Option IDs | Cache host robots `Disallow: /`; the terms ban scraping | Get the same files **from NTA or the Wayback Machine, or with permission**. Never crawl. |
| [ExamSIDE](https://questions.examside.com/past-years/year-wise/jee/jee-main) | Portal | 187 shifts, 2002/2013–2026; answers and explanations; math as MathJax SVG with no TeX | ExamGOAL terms: no copying | Index and cross-check only |
| [PhysicsWallahAI/JEE-Main-2025-Math](https://huggingface.co/datasets/PhysicsWallahAI/JEE-Main-2025-Math) | Dataset | 475 maths questions, 2025, clean LaTeX, answers checked against NTA | **Apache-2.0** for PW's own work (the question text is NTA's) | **Recommended** as a ready transcription to compare against |
| MathonGo | Coaching | 2002–2025 PDFs (Drive) | All rights reserved | Answer-key cross-check |
| eSaral, Vedantu | Coaching | **"Memory based"** 2025 papers | — | **Never** for question text |
| HF Abhay557 | Mirror of MathonGo PDFs | — | Tagged CC-BY, but the content isn't the uploader's | Avoid (licence laundering) |
| HF eQOURSE/jee-main-questions | Dataset | ~2,300 questions | CC-BY-4.0 | **Not past papers** (coaching mocks with impossible dates) |
| Aldtor/Jee, ruh-ai/grafite, MARKS app | Mixed | — | No licence, or scraped | Avoid |
| [JEEBench](https://github.com/dair-iitd/jeebench) | Benchmark | JEE **Advanced** only | MIT | Out of scope; useful as a format reference |

**Recommended mix:**
- **Question text:** NTA master papers with IDs (2026 Session 2 now; 2019–25 if obtained
  legitimately), transcribed and confirmed by an admin. PhysicsWallah's 2025 maths as a comparison.
- **Answers:** NTA final keys only.
- **Explanations:** our own.
- **Cross-checks:** question counts per shift against ExamSIDE, and our key against ExamSIDE's
  answers.

## 7. Fit with the vision

Thin today: one session. It grows by about 675 questions per session going forward, so capture
each session promptly. NTA may remove files.

## 8. Technical approach

- **Structure parser:** pdftotext gives sections, Question IDs, types and ordered Option IDs, and
  `pdfimages` gives the images in page order.
- **Key parser:** a table per shift.
- **Transcription:** vision, producing Markdown and LaTeX, keeping the image as a fallback,
  confirmed by an admin (ADR-015).
- **Identity:** the external ID. Dedupe is by text after transcription.

## 9. Risks and open questions

- NTA permission.
- Whether NTA's 2019–2025 masters exist on NTA domains or in the Wayback Machine (UNVERIFIED).
- The language versions.
- Image resolution.

## 10. Plan

**Depends on:** foundation steps S2, S4 and O.

1. Email NTA for permission.
2. Archive the 9 papers and the key.
3. Parse the structure and the key.
4. Transcribe 675 questions, confirmed by an admin.
5. Tag topics.
6. Re-check after each session.
