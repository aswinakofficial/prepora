# Prepora Markdown Schema

The canonical Prepora Markdown format for question sets.

---

## File Structure

```
---
<frontmatter>
---

# Question 1
<question block>

---

# Question 2
<question block>
```

Questions are separated by either:
- `# Question N` headings, OR
- `---` horizontal rules (when unnumbered)

---

## Frontmatter (YAML)

All fields are required unless marked optional.

```yaml
---
id: KPSC-AE-2025-CIVIL          # Stable set ID (REQUIRED)
exam: kerala-psc                  # Exam slug (REQUIRED)
exam_variant: assistant-engineer  # Variant slug (REQUIRED)
year: 2025                        # Publication year (REQUIRED where known)
subject: civil-engineering        # Subject slug (REQUIRED)
title: Kerala PSC AE 2025 Civil Engineering
source_type: official             # official|user_submitted|editorial|generated|unknown
source_url: https://...           # Optional
source_document: kpsc-ae-2025.pdf # Optional
---
```

### Slug Format

Slugs are lowercase, hyphen-separated:
- `kerala-psc`
- `assistant-engineer`
- `civil-engineering`
- `strength-of-materials`

---

## Question Block

### MCQ (most common)

```md
# Question 1

What is the unit of modulus of elasticity?

- A. N
- B. N/mm²
- C. mm/N
- D. N/mm

**Answer:** B

**Explanation:**

Modulus of elasticity = Stress / Strain.
Stress unit is N/mm², strain is dimensionless.
Therefore the unit is N/mm².

**Topic:** Strength of Materials
```

### Multiple Correct

```md
# Question 5

Which of the following are true?

- A. Statement 1
- B. Statement 2
- C. Statement 3
- D. Statement 4

**Answer:** A, C

**Explanation:**

...
```

### Numerical

```md
# Question 10

Calculate the value of x if ...

**Answer:** 42.5

**Explanation:**

...
```

### True/False

```md
# Question 15

Cement mortar is stronger than lime mortar.

- A. True
- B. False

**Answer:** A

**Explanation:**

...
```

### Missing Answer

When the answer is not in the source material:

```md
**Answer:** FLAG FOR HUMAN REVIEW

**Explanation:** FLAG FOR HUMAN REVIEW
```

### Ambiguous Answer

```md
**Answer:** FLAG FOR HUMAN REVIEW — Candidates: B or C. Both are defensible.
```

---

## Option Format

Options MUST use one of these formats:

```
- A. Option text
- B. Option text
```

or

```
- A) Option text
- B) Option text
```

Keys must be single letters: A, B, C, D, E, ...

Do NOT use:
```
(A) Option text   ← WRONG
1. Option text    ← WRONG
A - Option text   ← WRONG
```

---

## Stable IDs

Set ID format:

```
{EXAM-CODE}-{VARIANT-CODE}-{YEAR}-{SUBJECT-CODE}
```

Examples:
- `KPSC-AE-2025-CIVIL`
- `GATE-CS-2024-ALGO`
- `SSC-JE-2025-MECH`

---

## Difficulty (Optional)

```md
**Difficulty:** easy | medium | hard | expert
```

---

## Tags (Optional)

```md
**Tags:** reinforced-concrete, beam-design, IS-456
```
