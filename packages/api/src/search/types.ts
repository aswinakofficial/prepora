// docs/roadmap/engineering-roadmap.md item 23 (ADR-006): search sits behind this interface so a
// dedicated engine (Meilisearch, Typesense, a vector index) can become a second implementation
// later without touching search.router.ts or the frontend — Postgres full-text search is what's
// actually needed for the current corpus, not what search is architecturally allowed to be.

export interface SearchResultQuestion {
  id: string;
  slug: string;
  questionText: string;
  examSlug: string | null;
  examVariantSlug: string | null;
  year: number | null;
  subjectSlug: string | null;
  rank: number;
}

export interface SearchResultExam {
  id: string;
  slug: string;
  name: string;
  rank: number;
}

export interface SearchResultTopic {
  id: string;
  slug: string;
  name: string;
  subjectSlug: string;
  rank: number;
}

export interface SearchOptions {
  limit?: number;
}

export interface SearchProvider {
  searchQuestions(query: string, options?: SearchOptions): Promise<SearchResultQuestion[]>;
  searchExams(query: string, options?: SearchOptions): Promise<SearchResultExam[]>;
  searchTopics(query: string, options?: SearchOptions): Promise<SearchResultTopic[]>;
}
