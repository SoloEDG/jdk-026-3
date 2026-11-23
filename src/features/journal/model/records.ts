import type { GameDocument, Puzzle, Session } from "../../../shared/types";
export function registerSolve(
  document: GameDocument,
  puzzle: Puzzle,
  session: Session,
  commitId?: string,
): GameDocument {
  if (!session.solved || document.sessions[puzzle.id]?.solved) return document;
  return {
    ...document,
    records: [
      {
        id: crypto.randomUUID(),
        puzzleId: puzzle.id,
        seconds: session.seconds,
        hints: session.hints,
        checks: session.checks,
        finishedAt: Date.now(),
        ...(commitId ? { commitId } : {}),
      },
      ...document.records,
    ],
  };
}
