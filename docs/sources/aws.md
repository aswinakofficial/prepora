# AWS Certification

> **Verdict:** Go: sample PDFs first, then Skill Builder after checking its terms. **Effort:** S
> (PDFs), M (Skill Builder).
> **Researched:** 2026-10-01. Unconfirmed details are marked UNVERIFIED.

AWS publishes small **sample-question PDFs** per exam: 10 questions, each with the answer and a
short explanation. **AWS Skill Builder** has free "Official Practice Question Sets" of 20 questions
with feedback, behind a free login, which makes it the closest match to MS Learn practice
assessments. The **exam guides** on docs.aws.amazon.com are CC-BY-SA-4.0 and give us the domain and
task structure.

## 1. Legitimacy

- **Site terms:** "This license does not include … any use of data mining, robots, or similar data
  gathering and extraction tools." Automated collection needs care or permission:
  [permissions](permissions.md).
- **Documentation licence:** "The materials hosted on docs.aws.amazon.com are licensed as follows:
  documentation … is licensed under CC-BY-SA-4.0." That covers the exam guides, so their domains can
  be reused with attribution. It does **not** cover the sample PDFs on `d1.awsstatic.com`, which are
  "© 2022 Amazon… All rights reserved".
- **robots.txt:** docs.aws.amazon.com allows all except old API paths; skillbuilder.aws is
  `Allow: /`.

## 2. Exam landscape → knowledge index

- **The hierarchy:** AWS → level (Foundational / Associate / Professional / Specialty) → exam code
  (SAA-C03) → version (C03).
- **Knowledge index:** organization `aws`, exam group = level, exam `aws-saa`, template `version`
  (in URLs: `/exams/aws-saa/c03`).
- **Subjects and topics:** the exam guide's content domains become subjects, and their task
  statements become topics. SAA-C03 has four domains: Secure, Resilient, High-Performing,
  Cost-Optimized.

## 3. How it publishes

- **Sample PDFs:**
  - Solutions Architect Associate:
    `https://d1.awsstatic.com/training-and-certification/docs-sa-assoc/AWS-Certified-Solutions-Architect-Associate_Sample-Questions.pdf`
    (SAA-C03, Feb 2022, 10 questions).
  - Developer (DVA-C02) and SysOps also exist.
  - The **Cloud Practitioner PDF is still for the retired CLF-C01**.
  - Some newer exams have none (the AI Practitioner URL returned 403).
- **Exam guides:** `docs.aws.amazon.com/aws-certification/latest/examguides/`, about 15 exams, with
  `toc-contents.json` listing the domains.
- **Skill Builder:** 20 questions per exam, with feedback. Free account required.

## 4–5. Question shape and answers

- **Questions:** MCQ and "Select TWO" multiple-select.
- **Answers:** the PDFs give letters plus a 1–3 sentence explanation (official sample key).
  Skill Builder's feedback format is UNVERIFIED.

## 8. Technical approach

- **Sample PDFs:** simple text parsing.
- **Skill Builder:** a signed-in Playwright crawler like MS Learn's, but only after its terms on
  automated access are checked.
- **Retired exam versions** (CLF-C01) are marked as such.

## 9. Risks and open questions

- The site terms' anti-robot clause.
- Skill Builder's terms.
- The sets are small.

## 10. Plan

**Depends on:** foundation steps S1–S3 and P.

1. Import the exam-guide domains (CC-BY-SA).
2. Import the sample PDFs.
3. Evaluate Skill Builder: terms first, then a signed-in pilot on SAA-C03.
