import type { Mark, Session } from "../../../shared/types";
export function applyMark(
  session: Session,
  index: number,
  mark: Mark,
): Session {
  if (
    session.solved ||
    index < 0 ||
    index >= session.marks.length ||
    session.marks[index] === mark
  )
    return session;
  const marks = [...session.marks];
  const before = marks[index];
  marks[index] = mark;
  return {
    ...session,
    marks,
    moves: [...session.moves, { index, before, after: mark }].slice(-500),
    updatedAt: Date.now(),
  };
}
/** Undo the newest step; steps of one merge commit are reverted together. */
export function undoMark(
  session: Session,
  options: { force?: boolean } = {},
): Session {
  const move = session.moves.at(-1);
  if (!move) return session;
  // A solved board is frozen, with one exception: the commit that solved it
  // can be rolled back as a whole.
  if (session.solved && !(options.force && move.groupId)) return session;
  let undone = 1;
  if (move.groupId) {
    while (
      undone < session.moves.length &&
      session.moves.at(-1 - undone)?.groupId === move.groupId
    )
      undone++;
  }
  const group = session.moves.slice(-undone);
  const marks = [...session.marks];
  for (let i = group.length - 1; i >= 0; i--)
    marks[group[i].index] = group[i].before;
  return {
    ...session,
    marks,
    solved: false,
    moves: session.moves.slice(0, -undone),
    updatedAt: Date.now(),
  };
}
