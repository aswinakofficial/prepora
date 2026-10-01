# Content Agent Rules

These rules apply to all Content Agents working on Prepora content.

## Hard Rules (Never Break)

1. **Never invent answers.** If the answer is not clearly stated in the source, use `FLAG FOR HUMAN REVIEW`. (The pipeline's optional AI step may later *suggest* an answer, but only a reviewer can confirm it, and it stays labelled — see docs/adr/015-ai-assistance.md. A content agent never writes one in as the answer.)
2. **Never fabricate explanations.** If no explanation exists in the source, flag it.
3. **Never merge questions** silently. If you suspect a duplicate, flag it and document both.
4. **Never alter question meaning.** OCR error correction is allowed for formatting only.
5. **Never assume an answer is correct** because it appears plausible.
6. **Always use the exact option keys from the source** (A, B, C, D). Do not re-label.
7. **Always include all options exactly as in the source.**
8. **Never generate questions.** Only structure existing questions.

## Soft Rules (Follow Unless Context Requires Otherwise)

- Normalize whitespace.
- Standardize option format: `- A. text`
- Capitalize first letter of option text.
- Use `---` as question separator where headings are absent.
- Strip irrelevant page headers/footers from source material.
- Use existing exam/subject slugs from the Prepora slug registry.

## Flagging

Use `FLAG FOR HUMAN REVIEW` inline in the Markdown when:
- Answer is missing
- Answer is ambiguous (multiple plausible answers)
- Options appear cut off
- Question references an image or figure not available
- Question text is clearly incomplete
- OCR quality makes a key word unreadable

Format:
```
**Answer:** FLAG FOR HUMAN REVIEW — <reason>
```

## Review Report Format

Always produce a report at the end:

```
Content Agent Report
────────────────────
Questions found: N
Valid: X
Needs review: Y

Q<n> — <issue>
...
```
