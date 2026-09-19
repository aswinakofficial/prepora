# Deep Dive Analysis: Reactive Resume (v5.3) & Learnings for Prepora

## Executive Summary

`amruthpillai/reactive-resume` is a state-of-the-art, open-source resume builder and job application tracking platform written in TypeScript. It shares a remarkably similar core technology stack with **Prepora**:

- **Monorepo Architecture**: `pnpm` workspaces + Turbo
- **Frontend**: Vite + React 19 + TanStack Router + TanStack Query + Tailwind CSS v4
- **Backend / Database**: Hono HTTP Server + Drizzle ORM + PostgreSQL + `better-auth`

Despite serving different domain objectives (Resume Building vs. Exam & Assessment Preparation), Reactive Resume's architecture contains modern patterns, protocols, and UX paradigms that can elevate Prepora into an **AI-native, high-performance study platform**.

---

## Technical Stack Comparison

| Dimension | Reactive Resume (v5.3) | Prepora (Current State) | Potential Alignment / Synergy |
| :--- | :--- | :--- | :--- |
| **Monorepo Tools** | `pnpm` + `turbo` + `biome` + `knip` | `pnpm` workspace | Adopt `biome` for 20x faster lint/format; `knip` for dead-code pruning |
| **Web Framework** | Vite + React 19 + TanStack Router + Query | TanStack Start + React 19 + Vinxi | Both leverage TanStack Router & React 19 |
| **API Layer** | Hono + **oRPC** (`@orpc/server`, `@orpc/openapi`) | Server Functions / Hono API routes | Adopt **oRPC** for type-safe procedures & auto OpenAPI spec |
| **Database & ORM** | Drizzle ORM + PostgreSQL (`pg`) | Drizzle ORM + Neon PostgreSQL | Shared database ORM methodology |
| **Auth** | `better-auth` (Passkey, OAuth, API Keys) | `better-auth` | Identical auth engine |
| **AI Integration** | Vercel AI SDK 4.x/7.x (Multi-provider + BYOK + Ollama) | Python Playwright Scraper / standard AI | Create `@prepora/ai` with multi-provider & local Ollama support |
| **AI Protocol** | **Model Context Protocol (MCP)** server (`/mcp`) | None | Add `/mcp` endpoint to make Prepora AI-agent accessible |
| **Export / PDF** | `@react-pdf/renderer` + `pdfjs-dist` + `@reactive-resume/docx` | Custom content scripts | Create `@prepora/pdf` for downloadable exam cheat sheets |
| **SEO & LLM Readability**| Dynamic `/llms.txt`, `sitemap.xml`, `robots.txt` | Custom RSS & Sitemap scripts | Adopt dynamic `/llms.txt` endpoint for AI indexers |
| **UI Components & Layout** | Base UI / Radix primitives + Phosphor icons + `@dnd-kit` + `motion` + `react-resizable-panels` + `react-zoom-pan-pinch` | Radix UI + Tailwind v4 + Lucide icons | Adopt split panels, zoomable canvas, drag-and-drop reordering |
| **i18n** | Lingui.js (`@lingui/react`) + PO format | English | Future multi-language support for international certification exams |

---

## Core Capabilities to Absorb into Prepora

### 1. Model Context Protocol (MCP) Server Endpoint (`/mcp`)
> **Concept**: Exposing an MCP server endpoint allows external AI agents (like Claude Desktop, Antigravity, or Cursor) to interact directly with Prepora via structured tools.

- **In Reactive Resume**: The server exposes `/mcp` using `@modelcontextprotocol/sdk` and `/.well-known/mcp/server-card.json`. AI agents can query resumes, edit sections via patches, track applications, or generate cover letters.
- **Actionable for Prepora**:
  - Expose `/mcp` tools: `list_exams`, `get_exam_questions`, `create_practice_test`, `get_user_analytics`, `trigger_scrape_job`.
  - Enables users to ask their local AI assistant (e.g. "Create a 20-question practice test focusing on my weak topics in Azure Fundamentals and score my answers").

### 2. Type-Safe API Layer with oRPC & OpenAPI (`@orpc/server`)
> **Concept**: oRPC provides end-to-end typed procedures with Zod validation, OpenAPI spec generation, and seamless integration with TanStack Query.

- **In Reactive Resume**: Replaced tRPC with oRPC (`@orpc/server`, `@orpc/client`, `@orpc/tanstack-query`). All procedures automatically feed both the frontend TanStack Query hooks, OpenAPI endpoints (`/api/openapi`), and MCP server tools.
- **Actionable for Prepora**:
  - Replace raw endpoint handling with oRPC procedures in `@prepora/api`.
  - Write Zod schemas once; automatically gain typed API routes, OpenAPI documentation, and MCP tools with zero duplication.

### 3. Multi-Provider AI Architecture & BYOK / Local Ollama (`@prepora/ai`)
> **Concept**: Supporting multiple LLM providers (OpenAI, Anthropic, Gemini, Groq, DeepSeek) alongside local models via Ollama (`ollama-ai-provider-v2`).

- **In Reactive Resume**: Dedicated `@reactive-resume/ai` package wraps Vercel AI SDK. Users can configure their preferred provider or run fully local/private AI models via Ollama.
- **Actionable for Prepora**:
  - Build `@prepora/ai` package for:
    - **Question Explanation Generation**: Detailed step-by-step breakdown of why options are correct/incorrect.
    - **AI Exam Tutor / Chat**: Real-time assistance during practice tests.
    - **Smart Distractor Generator**: Generating plausible wrong options for exam question creators.
  - Provide BYOK (Bring Your Own Key) & Ollama support so privacy-minded users can study offline without API costs.

### 4. Machine-Readable LLM Discovery (`/llms.txt`)
> **Concept**: The `/llms.txt` standard provides LLMs with a clean, Markdown-formatted map of the platform's core domains, documentation, and API/MCP tools.

- **In Reactive Resume**: Serves `/llms.txt` dynamically from Hono server (`handleLlms`).
- **Actionable for Prepora**:
  - Add `/llms.txt` route outlining Prepora's exam subjects, question categories, catalog structure, and MCP integration points.

### 5. Document & PDF Generation Pipeline (`@prepora/pdf`)
> **Concept**: In-browser preview and background rendering of crisp, printable study materials.

- **In Reactive Resume**: Uses `@react-pdf/renderer` with `pdfjs-dist` for real-time canvas rendering, and server-side PDF stream downloads.
- **Actionable for Prepora**:
  - Create `@prepora/pdf` to generate:
    - **Printable Mock Exam Booklets** (with question sheets & separate answer keys).
    - **Exam Cheat Sheets & Summary Cards** (condensed key concepts per subject).
    - **Study Progress Certificates & Reports**.

### 6. Interactive Split-Panel & Drag-and-Drop UX
> **Concept**: Enhanced productivity UI components for complex workflows.

- **In Reactive Resume**: Uses `react-resizable-panels` for side-by-side editing, `@dnd-kit/sortable` for drag-and-drop section reordering, and `react-zoom-pan-pinch` for canvas zooming.
- **Actionable for Prepora**:
  - **Exam Simulator / Quiz View**: Split screen with `react-resizable-panels` (Question Text & Diagrams on left, Interactive Code Editor / Notes / Scratchpad on right).
  - **Custom Exam Builder**: Use `@dnd-kit` to drag and reorder questions, create custom assessment modules, or organize study flashcards.

### 7. Modern Speed Tooling: Biome & Knip
> **Concept**: Modernizing repo maintenance and linting.

- **In Reactive Resume**: Replaced ESLint/Prettier with `@biomejs/biome` (10-100x faster formatting & linting) and `knip` (dead code & unreferenced export cleaner).
- **Actionable for Prepora**:
  - Add `biome` and `knip` to Prepora root package scripts (`pnpm check`, `pnpm knip`) to maintain a lean, high-velocity codebase.

---

## Suggested Architecture Roadmap for Prepora

```mermaid
graph TD
    subgraph Monorepo [Prepora Workspace]
        Web[apps/web - TanStack Start + React 19]
        Scraper[apps/scraper - Python Playwright]
        
        subgraph Packages [Shared Monorepo Packages]
            DB[@prepora/db - Drizzle ORM + Neon]
            API[@prepora/api - oRPC Router & Handlers]
            AI[@prepora/ai - Vercel AI SDK Multi-Provider]
            MCP[@prepora/mcp - Model Context Protocol Server]
            PDF[@prepora/pdf - React PDF & Cheat Sheets]
            Schema[@prepora/schema - Shared Zod Schemas]
        end
    end
    
    Web --> API
    Web --> PDF
    API --> DB
    API --> AI
    MCP --> API
    Scraper --> DB
```

---

## Action Plan Summary

1. **Short-Term (Quick Wins)**:
   - Implement dynamic `/llms.txt` route for AI discoverability.
   - Add `biome` and `knip` tooling scripts to root [package.json](file:///tmp/reactive-resume/package.json).
   - Implement `react-resizable-panels` in the Exam Simulator for resizable split views.

2. **Medium-Term (Architectural Upgrade)**:
   - Extract API procedures into `@prepora/api` using `oRPC` (`@orpc/server`).
   - Create `@prepora/ai` package supporting Vercel AI SDK multi-provider + local Ollama.
   - Build `@prepora/pdf` for printable cheat sheets and offline exam PDFs.

3. **Long-Term (AI-Native Evolution)**:
   - Launch `/mcp` endpoint so user desktop AI agents can interact natively with Prepora data and exams.
