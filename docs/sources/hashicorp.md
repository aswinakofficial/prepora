# HashiCorp certifications

> **Verdict:** Go, a small set. **Effort:** S.
> **Researched:** 2026-10-01. Unconfirmed details are marked UNVERIFIED.

HashiCorp publishes **sample questions** on developer.hashicorp.com: 5 for Terraform Associate 004
and about 14 for Vault Associate 003. Each option is marked correct or incorrect, with **no
explanations**. The content sits as structured MDX inside the page's embedded JSON, which makes it
stable and easy to parse. An "Exam Content List" page gives the official objectives.

## 1. Legitimacy

- **robots.txt:** `Allow: /`.
- **Licence:** no open licence found (UNVERIFIED). See [permissions](permissions.md).

## 2. Exam landscape → knowledge index

- **The hierarchy:** HashiCorp → level (Associate / Professional) → product exam (Terraform
  Associate) → version (004).
- **Knowledge index:** organization `hashicorp`, exam `hashicorp-terraform-associate`, template
  `version` (in URLs). Objectives from `associate-review-004` become syllabus items.

## 3. How it publishes

- `developer.hashicorp.com/terraform/tutorials/certification-004/associate-questions-004`
  (updated 2026-01-08).
- `…/vault/tutorials/associate-cert-003/associate-questions-003`.
- Advanced certifications include labs; whether they have samples wasn't checked.

## 4–5. Question shape and answers

True/false, single choice and multiple-select. Answers are an official sample key with no
explanations.

## 10. Plan

**Depends on:** foundation step S1. Parse the embedded JSON, import the objectives, and publish
with the `official_sample_key` provenance.
