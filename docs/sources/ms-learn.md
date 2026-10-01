# Microsoft Learn practice assessments

> **Verdict:** Live: the first source Prepora published. **Effort:** done.
> **Researched:** 2026-10-01 (catalog check). Unconfirmed details are marked UNVERIFIED.

Microsoft publishes free official **practice assessments** for most of its certification exams, on
Microsoft Learn. They're vendor-published practice material, the kind of certification source
Prepora uses. Real exam questions are under candidate NDAs and never used. Each assessment serves
50 questions drawn **at random from a pool**, with the correct answer, an explanation and further
reading links revealed after "Check your answer".

## 1. Legitimacy

- **Publisher:** Microsoft. Practice assessments need a signed-in Microsoft account.
- **Collection:** the scraper uses a signed-in, local-only Playwright session
  (`apps/scraper/ms_learn_catalog_crawler.py`). Scraping and publishing are locked on the deployed
  site.
- **Terms:** Microsoft's terms of use apply to Learn content. A specific reuse permission for
  practice assessments was not researched (UNVERIFIED), so it goes in
  [permissions](permissions.md) for completeness.

## 2. Exam landscape → knowledge index

- **The natural hierarchy:** Microsoft → certification (e.g. "Azure Administrator Associate") →
  exam code (AZ-104) → practice assessment.
- **Today's model:** an exam per exam code (`az-104`), variant `standard`, session "Version 1", and
  one question set "Official Microsoft Practice Assessment".
- **Knowledge index:** the `cert-simple` template, with a single `version` level that isn't part
  of URLs. The paper kind is `official_practice`, and answers are `official_sample_key`.

## 3. How it publishes

- The catalog page
  `learn.microsoft.com/en-us/credentials/certifications/practice-assessments-for-microsoft-certifications`
  lists about 43 assessments.
- Each assessment is a JavaScript application that renders one question at a time.
- **Retired exams** (e.g. AI-900 since 30 June 2026, MB-240) stay in the catalog, but their
  assessment redirects away or never loads.

## 4–5. Question shape and answers

- **Types:** MCQ and multiple-select, sometimes with images.
- **Answers and explanations:** official, after "Check your answer".
- **Dedupe:** questions are identified by content (dedupe profile `identity: content`), because the
  same pool is drawn in random order. A re-scrape only adds questions that aren't published yet.

## 6. Third-party sources

Not used. Dump sites (ExamTopics and others) are excluded: see [not-onboarded](not-onboarded.md).

## 8. Technical approach (as built)

- A Playwright crawl with a saved session.
- Parsing of the question fieldset (`apps/scraper/ms_learn_parser.py`).
- Images stored through the media store.
- A server-side bulk queue (one job per exam).
- Review batches → the pipeline publishes them with dedupe.

## 9. Risks and open questions

- Microsoft changes the assessment UI, which breaks parsing.
- Retired exams, and exams ending early (GH-100/200/500 stop after 27–30 questions).
- Sign-in sessions expire.

## 10. Plan

Moves into the knowledge index at foundation step S1 (`cert-simple` template). Answers become
`official_sample_key` claims at S3.
