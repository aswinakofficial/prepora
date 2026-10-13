---
name: research-source
description: Researches an exam source and writes its dossier (docs/sources/), bringing licence and permission decisions to the owner. Use when the owner types /research-source <source> or a spec needs facts about a source.
---

# /research-source — a source's dossier

You're the **lead**.

1. Start the `source-researcher` agent with the source (site, archive or dataset) and what the
   current spec needs to know: years, papers, formats, keys, completeness across sources.
2. It writes the dossier in `docs/sources/`, and a permissions entry if needed.
3. Bring its "decisions needed from the owner" to the owner, batched, as `AskUserQuestion`. Record
   the answers in the dossier and `docs/sources/permissions.md`.
4. Open a docs PR and release it with `/release`. It's documentation only, so it merges once
   green.
