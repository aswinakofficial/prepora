# ADR-017: A question's images are part of what it is

- **Status:** Proposed, with [Spec 14](../specs/14-figures.md) (for the owner's approval with it)
- **Date:** 2026-10-18
- **Design:** [docs/architecture/dedupe.md](../architecture/dedupe.md) ("every question is published
  once", "nothing is ever merged silently"); [Spec 4](../specs/04-media-storage.md) (content-addressed
  media keys)

## Context

Dedupe decides whether two questions are the same from their wording plus their **answer shape**
(`dedupe/fingerprint.py` `AnswerShape`): the normalized option texts and the correct answer. Images
play no part.

That held while images were only MS Learn's exhibits. Spec 14 publishes GATE figures and image-only
options. An image-only option is stored with the placeholder text "(see image)". So four options of one
question collapse to one shape entry, and two different questions with the same stem and different
pictures look identical. The second would be silently folded into the first, which breaks dedupe's
first rule.

The answer shape is used in five places. Each is affected:
- `dedupe/check.py`: exact and near decisions, `find_same_question` and remembered decisions;
- `stages/publish.py` `_position_decision`: a re-parse that takes a published question's position;
- `stages/stable_id.py`: the `-D` signature of a reviewer's "different question" (`distinct=True`),
  which is an identity;
- `dedupe/audit.py`: `pnpm check:duplicates`;
- MS Learn, which already publishes question and option images, and already has published questions.

## Decision

1. **Question and option images are part of the answer shape. Explanation images aren't.**
   - An image is identified by its `storage_key`, which is a content hash, so equal keys mean equal
     bytes.
   - Explanation images don't change what's asked or what the answer is. Sources also drop them when a
     fetch fails (`apps/scraper/ms_learn_media.py`), so comparing them would make re-scrapes look like
     conflicts.
2. **An option's shape entry is its normalized text plus its image keys,** sorted. So image-only
   options stay distinct, and the correct answer is identified by its picture as well as its text.
   Question-placement images are compared as one sorted list. A question with no question or option
   images has exactly the shape it has today.
3. **The same position isn't decided by images.** When a position-identity question takes a published
   question's place in the same paper (`_position_decision`, Spec 13), it's the same question
   re-parsed. The suggestion compares option keys and the official key, never option text or images,
   so a re-crop leans "same question, use the new version" (`same_new`). A renderer upgrade, which
   changes every crop's bytes, must not push reviewers towards "publish as a different question".
   - **Exact wording takes the same route.** With unchanged wording, a re-crop never reaches
     `_PositionTaken`. `check_duplicate` sees the exact text first, and `_decide_exact` would hold it
     as a `conflicting_duplicate` suggesting "same", which keeps the old crop.
   - **So `_decide_exact` checks the position first.** For a position-identity candidate, when the
     exact match's `stable_content_id` equals the candidate's own derived id, with no `-D` suffix, it
     returns `_position_decision`'s decision instead.
4. **Identities don't move.** `derive_stable_content_id(distinct=True)` adds image keys to its
   signature only for options whose text is the image placeholder (`IMAGE_OPTION_TEXT`). Every
   existing `-D` id stays the same, because no published question has that text yet. Without the
   keys, two different image-only questions would get the same id.
5. **A conflict caused only by images says so.** `matches` compares the full shape, images included
   (decisions 1–2). But the reported `options_match` and `answer_match` keep their meaning: text and
   correct answer, as stored in `duplicate_reviews`. A hold whose texts and answers
   match, but whose images differ, gives the reason "same wording, options and answer, but different
   images". The possible-duplicate screen shows both versions' images, so a person can decide.
   - **The held version's images** come from `duplicate_reviews.candidate.media`, the stored
     normalized question. An unpublished candidate has no `media` rows.
   - **The published version's images** come from the `media` table.

## Consequences

- **MS Learn:** a re-scraped question whose question or option image bytes changed is held as a
  `conflicting_duplicate` for a person, instead of being reused silently. That's the intended
  direction (never merge silently). It should be rare, because MS Learn's assets are static, and the
  hold suggests "same" when the answer matches. The MS Learn regression suite covers re-scraping a
  question with an image.
- **No migration.** The shape is computed from `media` rows and candidates. `duplicate_reviews`
  doesn't change.
- **`pnpm check:duplicates` may report new pairs.** Published questions with identical text and
  different images were previously counted as one shape. That's a correct finding, not a regression.
- **Replacing images is a publish concern, not a dedupe one.** "Same question, use the new version"
  replaces the question's question and option images. "Keep the published version" adds none (Spec 14,
  Decision 9). This applies to every source.

### Proposed change to docs/architecture/dedupe.md

Replace the `fingerprint.py` row's text with:

> A question's **answer shape**: its options and correct answer, normalized, with option order
> ignored. Each option's entry includes the storage keys of that option's images, and the question's
> own (non-explanation) images are compared too ([ADR-017](../adr/017-images-in-question-identity.md)).
> Identical wording is only the same question when the shapes match too.

In the Outcomes table, change `conflicting_duplicate`'s meaning to "**Identical wording**, but
different options, correct answer or images".
