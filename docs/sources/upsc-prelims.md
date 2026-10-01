# UPSC Civil Services Preliminary Examination

> **Verdict:** Go with permission, after OCR (foundation step O). **Effort:** M.
> **Researched:** 2026-10-01. Unconfirmed details are marked UNVERIFIED.

UPSC publishes Prelims papers (GS Paper I and CSAT) and answer keys for many years. Both are
**scanned PDFs** with no text layer, and the HTML listing pages are behind a JavaScript bot gate.
The PDFs themselves download fine from `www.upsc.gov.in`. Since 2026, UPSC also publishes a
**provisional key** within days of the exam.

## 1. Legitimacy

- **Website policy:** material may be reproduced free of charge **"after taking proper
  permission"**, accurately, and with acknowledgement. This is a search summary, because the policy
  page blocks scripts (UNVERIFIED wording). → [permissions](permissions.md).
- **robots.txt** returns the home page HTML, so there are no readable rules.
- **Listing pages** answer scripts with "enable JavaScript" or a 403. **Don't bypass that.** Use a
  hand-collected list of PDF URLs instead. GitHub `realyuvishere/upsc-pyq` (MIT code) documents the
  page structure and is useful as a reference.

## 2. Exam landscape → knowledge index

- **GS-I:** 100 MCQs. **CSAT:** 80 MCQs, qualifying only (33%).
- **One sitting a year,** in four booklet series A–D, with the order shuffled between series.
- **English and Hindi** in the same booklet.

Mapping: organization `upsc` → exam `upsc-cse-prelims` → template `paper (gs-1 | csat) → year`.
Each paper group has editions per language for **series A**.

## 3. How it publishes

- **Papers:** at least 2019–2026 confirmed (2026 GS-I is 34 MB). Deeper archive UNVERIFIED.
- **Scans:** a sampled official CSE paper was ScandAll PRO, 300 dpi, with **0 characters** of text.
  Every paper needs OCR.

## 4–5. Question shape and answers

- **Questions:** text-heavy four-option MCQs: statement lists, match-the-following,
  assertion-reason. CSAT adds comprehension passages and data interpretation.
- **Keys:** per series A–D, with dropped questions marked.
  - Before 2026, keys came out only after the whole recruitment cycle (about a year later).
  - 2026: a provisional key on 27 May, itself an HP scan:
    `www.upsc.gov.in/sites/default/files/ProvAnsKey%E2%80%93GS-I-CSP-Exam-2026-270526.pdf`.
  - The final key follows later and overrides it.

## 6. Third-party sources and datasets

| Source | Use | Terms | Verdict |
|---|---|---|---|
| InsightsIAS, ForumIAS, Vision, PMF IAS (2025 keys for all series, same day) | **Voting panel** for answers before the official key | Proprietary | Cross-check only |
| Vajiram & Ravi, SuperKalam (topic-wise PYQs) | Reference for a topic taxonomy | Proprietary | Re-derive our own tags; don't copy |
| Drishti, UPSCprep, ExamSIDE | Solved PDFs | All rights reserved | Avoid |
| GitHub mirrors (realyuvishere, tejavdotcom) | Mirrored official PDFs 2016–2025 | Code MIT; PDFs are UPSC's | Handy URL list |
| ParamBench (Hindi), AdityaPrasad275 (LLM-written explanations) | — | Non-commercial / generated | Avoid |
| AI4Bharat MILU | Mixed Indian exams | CC-BY-4.0 (gated) | Unclear provenance |

**Recommended mix:**
- **Question text:** official papers, series A, OCR'd and confirmed by an admin.
- **Answers:** the official final key. Otherwise the 2026 provisional key, labelled provisional.
  Before any official key, a majority vote of at least 3 coaching keys, labelled third-party
  consensus.
- **Explanations:** our own.
- **Topics:** our own taxonomy.

## 7. Fit with the vision

Many years of official papers with simple MCQs: a strong base for topic trends.

## 8. Technical approach

- Hand-curated PDF URL list on the `www` host.
- OCR in English and Hindi.
- Series A only.
- Key OCR, or manual entry: 100 + 80 answers per year is small.
- Hindi text as a translation edition.

## 9. Risks and open questions

- Permission.
- OCR quality on 300-dpi scans (likely fine).
- Hindi handling.
- Whether provisional keys continue after 2026.

## 10. Plan

**Depends on:** foundation steps S2, S4, S5 and O.

1. Permission.
2. URL list.
3. OCR pilot on GS-I 2025 (series A).
4. Answers from the final key.
5. Widen to all available years and CSAT.
