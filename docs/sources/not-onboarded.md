# Sources researched and not onboarded

These sources were evaluated and deliberately **not** used. Each one that was registered keeps its
`connectors/<name>/source.yaml` with `onboarding: not_onboarded`. The registry sync then keeps it
disabled, which takes it off the fetch allowlist and hides it from the admin scraping page
(`apps/pipeline/prepora_pipeline/core/registry.py`). The decision is recorded in the registry
itself, so a later contributor doesn't add the source again.

| Source | Why not | Registry |
|---|---|---|
| **ExamTopics** (examtopics.com) | Its content is mostly **real certification-exam questions**, shared in breach of the candidate agreements every vendor requires. Its answers are community-voted and often wrong. Publishing that is a legal and reputational risk for an open-source project. | `examtopics`: not onboarded |
| **IndiaBix** (indiabix.com) | The site's **own copyrighted practice questions**, not past exam papers. Copying them republishes someone else's work and adds little to the past-papers and prediction goals. Its connector code stays as the [connector guide](../connectors/README.md)'s worked example, with invented fixture content. | `indiabix`: not onboarded |
| **Sanfoundry** (sanfoundry.com) | Same as IndiaBix: the site's own practice MCQs. | `sanfoundry`: not onboarded |

## Never used, by rule

- **Certification dump sites** (ExamTopics, Exam-Labs, P2PExams, CertEmpire, CertsHero, Pass4sure,
  ITExams, PrepAway, ExamCollection, Test-King, istqbdumps.org and similar). Certifications use
  only material the vendor itself publishes ([certifications-other](certifications-other.md)).
- **"Memory-based" reconstructions** presented as past papers (seen for JEE Main 2025 on coaching
  sites), and **mock tests mislabelled as past papers** (e.g. HF `eQOURSE/jee-main-questions`).
- **Datasets that re-license content their uploader doesn't own** (licence laundering), e.g. HF
  `Abhay557/indian-exams-rawdata`, which tags MathonGo and NTA content as CC-BY-4.0. They may be
  used to *locate* official files, never as a grant of rights.
- **Content behind bot protection we'd have to bypass** (Cloudflare challenges, Turnstile), or
  **behind forms asking for personal data** (EC-Council, ISC2, Snowflake, Google Cloud answer
  keys).

## The legacy scraper handlers

`apps/scraper/handlers/{examtopics,indiabix,sanfoundry}.py` still exist from before the connector
SDK. With the sources disabled in the registry, the scraper's allowlist refuses their URLs, so the
handlers are unreachable. Removing them is follow-up clean-up work.
