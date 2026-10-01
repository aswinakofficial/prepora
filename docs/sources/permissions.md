# Permission requests

Where a source's terms allow reuse only with permission, Prepora asks first. Until permission is
granted, the source is used only as its terms allow (often reference and cross-checks only, never
displayed). See [ADR-014](../adr/014-multi-source-provenance.md) for how licence status is recorded
on each source a question came from.

Update this register as requests are sent and answered. Never record personal contact details of
individuals here; use only organisational addresses.

## Register

| Source | Ask for | Why it's needed | Contact | Status |
|---|---|---|---|---|
| ISTQB | Republish sample exams in full, with rationales | "Any other use … prohibited without … approval in writing" ([istqb](istqb.md)) | Exam Working Group via istqb.org contact (check the site) | Not sent |
| ASTQB | Republish its CTFL sample exams #3/#4 | "Copyright ASTQB, All Rights Reserved" | astqb.org contact (check the site) | Not sent (optional) |
| NCB-GATE / organising IIT | Republish GATE papers and keys with attribution | "All Rights Reserved", no reuse grant ([gate](gate.md)) | GATE organising institute contact on the current GATE site (check the site) | Not sent |
| GATE Overflow Educational Foundation | Use its tag-to-question mapping and "Answer:" values, with attribution | "duplication … without express written permission … strictly prohibited" | support at gateoverflow dot com | Not sent |
| NTA | Reproduce JEE Main and NEET papers and keys | "reproduced free of charge after taking proper permission" ([jee-main](jee-main.md)) | NTA contact on nta.ac.in (check the site) | Not sent |
| Aakash | Use NEET question text (and optionally solutions) from its answer-and-solution PDFs | All rights reserved ([neet-ug](neet-ug.md)) | aakash.ac.in contact (check the site) | Parked with NEET |
| UPSC | Reproduce Prelims papers and keys | "after taking proper permission" ([upsc-prelims](upsc-prelims.md)) | UPSC contact on upsc.gov.in (check the site) | Not sent |
| Kerala PSC | Courtesy notice, plus permission to deep-link source PDFs | Reproduction is allowed with acknowledgement; **deep links need prior permission** ([kerala-psc](kerala-psc.md)) | KPSC contact on keralapsc.gov.in (check the site) | Not sent |
| EasyPSC | Use its Unicode transcriptions of Kerala PSC papers | Terms forbid scraping and reproduction without written permission | contact@easypsc.com | Not sent |
| KTU | Access to past papers **and schemes of valuation** | The portal is behind Turnstile, which we don't bypass ([university-ktu](university-ktu.md)) | KTU examinations / controller contact (check the site) | Not sent |
| CUSAT library | Access to the past-papers repository | The repository is empty to the public ([university-cusat-kannur](university-cusat-kannur.md)) | CUSAT central library contact (check the site) | Not sent |
| Kannur University | Whether a past-papers archive exists | None found | Controller of Examinations (check the site) | Not sent |
| AWS | Automated collection of sample PDFs and Skill Builder sets | Site terms exclude "robots … data gathering" ([aws](aws.md)) | AWS Training & Certification (check the site) | Not sent |
| MS Learn, HashiCorp, Databricks, MGU, Calicut, Kerala University | Courtesy notice with attribution | No explicit reuse terms found | Respective contact pages | Not sent |

## Email template

Fill in the bracketed parts. Keep each request specific about what will be shown and how it's
credited.

> **Subject:** Permission request: [what] on Prepora, a free open-source exam-preparation site
>
> Dear [organisation] team,
>
> I maintain Prepora ([prepora.xpar.in](https://prepora.xpar.in); source code at
> github.com/aswinakofficial/prepora), a free, open-source platform that helps students practise
> with past exam questions. Every question on Prepora is reviewed by a person and credited to its
> source.
>
> We would like to [specific use, e.g. "publish the ISTQB CTFL v4.0 sample exams A–D, including
> the answer rationales"]. Each question would show "Source: [organisation], [document and
> version]", link to your official page, and be reproduced exactly as published. We don't charge
> for access, and we'd update or remove anything promptly if you ask.
>
> [Source-specific paragraph, below.]
>
> Could you let us know whether this is acceptable, and whether there are any conditions on how
> you'd like the material credited?
>
> Thank you,
> [Your name], Prepora

**Source-specific paragraphs:**

- **ISTQB:** "Your sample exam documents allow extracts for non-commercial use with
  acknowledgement, and ask for written approval for other uses. We'd like to show complete sample
  exams so learners can practise them end to end, and keep them in sync when you publish new
  versions."
- **GATE Overflow:** "We don't want to copy your explanations or discussions. We're asking only
  about the topic tags you assign to each question and the 'Answer:' line, which we'd use to
  organise and cross-check official GATE papers, crediting GATE Overflow on each question."
- **EasyPSC:** "Kerala PSC permits reproducing its papers with acknowledgement, but its
  Malayalam-medium PDFs use a legacy font that can't be extracted reliably. Your transcriptions are
  very accurate: one paper we checked matched the official final key on every question. We'd like
  to use your question text, credited to EasyPSC, with answers always taken from KPSC's official
  final keys."
- **KTU:** "Your question papers and examiners' schemes of valuation would help students across all
  affiliated colleges. Your portal is protected against automated access, which we respect. Could
  you share the papers and schemes of valuation in bulk, or tell us how we may obtain them?"
- **Kerala PSC:** "Your copyright policy allows reproduction with acknowledgement, which we follow.
  Your hyperlinking policy asks for prior permission to link directly to files on your site, so we
  are asking for permission to link each question set to its official PDF."
- **NTA / UPSC:** "Your copyright policy allows reproduction free of charge after taking proper
  permission. We are requesting that permission for [exam, years], reproduced accurately and with
  the source clearly acknowledged."
