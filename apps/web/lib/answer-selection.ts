// Answer selection for both single-answer and "Choose N" questions. A selection is always a list
// of option keys: a single-answer question is simply one whose answer is a list of one. Practice
// mode (Learn and Simulation) and the question page share these rules, so a multi-answer question
// behaves the same everywhere.

/** How many options make up the answer: the number of correct options, at least 1. */
export function requiredSelections(question: {
  correctKeys?: string[];
  correctKey?: string | null;
}): number {
  return Math.max(1, question.correctKeys?.length ?? (question.correctKey ? 1 : 0));
}

/**
 * Selecting an option. Single-answer: it replaces the previous choice. Multi-answer: it toggles,
 * up to `required` options — a further pick is ignored until one is deselected.
 */
export function toggleSelection(current: string[], key: string, required: number): string[] {
  if (required <= 1) return [key];
  if (current.includes(key)) return current.filter((k) => k !== key);
  if (current.length >= required) return current;
  return [...current, key];
}

export function isSelectionComplete(selection: string[] | undefined, required: number): boolean {
  return (selection?.length ?? 0) === required;
}

/** Right only when exactly the correct options are chosen — no more, no fewer. */
export function isSelectionCorrect(
  selection: string[] | undefined,
  correctKeys: string[],
): boolean {
  if (!selection || selection.length !== correctKeys.length) return false;
  return selection.every((key) => correctKeys.includes(key));
}

/** "A, B and D" — for "Correct answer: …" labels. */
export function formatKeys(keys: string[]): string {
  if (keys.length <= 1) return keys[0] ?? "";
  return `${keys.slice(0, -1).join(", ")} and ${keys[keys.length - 1]}`;
}
