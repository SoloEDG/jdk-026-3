import type {
  GameDocument,
  HypothesisSpace,
  Mark,
  Puzzle,
  Session,
} from "./types";
export function emptyHypothesisSpace(): HypothesisSpace {
  return { branches: {}, origins: {}, activeBranchId: null };
}
export function newSession(puzzle: Puzzle): Session {
  return {
    puzzleId: puzzle.id,
    marks: Array(puzzle.size ** 2).fill("unknown"),
    moves: [],
    hints: 0,
    checks: 0,
    seconds: 0,
    solved: false,
    updatedAt: Date.now(),
  };
}
export function newDocument(puzzle: Puzzle): GameDocument {
  return {
    version: 1,
    activeId: puzzle.id,
    sessions: { [puzzle.id]: newSession(puzzle) },
    records: [],
    hypothesis: emptyHypothesisSpace(),
  };
}
export function completion(session: Session): number {
  return Math.round(
    (session.marks.filter((m) => m !== "unknown").length /
      session.marks.length) *
      100,
  );
}
export function isSolved(puzzle: Puzzle, session: Session): boolean {
  return session.marks.every((mark, i) =>
    puzzle.solution[i] ? mark === "filled" : mark !== "filled",
  );
}
/**
 * A compact, stable representation of a board. Branch origins keep their own
 * fingerprint so a route can prove it still shares a common starting point.
 */
export function fingerprint(marks: readonly Mark[]): string {
  return marks
    .map((mark) => (mark === "filled" ? "1" : mark === "cross" ? "x" : "."))
    .join("");
}
export function isMark(value: unknown): value is Mark {
  return value === "filled" || value === "cross" || value === "unknown";
}
export function isMarkArray(
  value: unknown,
  expectedLength: number,
): value is Mark[] {
  return (
    Array.isArray(value) &&
    value.length === expectedLength &&
    value.every(isMark)
  );
}
