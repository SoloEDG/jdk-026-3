import type {
  BranchOrigin,
  GameAction,
  GameDocument,
  HypothesisBranch,
  HypothesisSpace,
  Mark,
  Puzzle,
  Session,
} from "../shared/types";
import { isSolved, newSession } from "../shared/document";
import { applyMark, undoMark } from "../features/board";
import { HINT_LIMIT } from "../features/assist";
import { registerSolve } from "../features/journal";
import {
  applyBranchMark,
  branchMarks,
  branchRouteSolved,
  createBranch,
  createOrigin,
  effectiveBranch,
  mergePlan,
  mergeSelections,
  newId,
  nextBranchName,
  normalizedChanges,
  originIsValid,
  undoBranchMark,
} from "../features/hypothesis/model/space";

function withBranch(
  document: GameDocument,
  branch: HypothesisBranch,
): GameDocument {
  return {
    ...document,
    hypothesis: {
      ...document.hypothesis,
      branches: {
        ...document.hypothesis.branches,
        [branch.id]: branch,
      },
    },
  };
}

function ensureOrigin(
  space: HypothesisSpace,
  puzzleId: string,
  marks: readonly Mark[],
): BranchOrigin {
  const created = createOrigin(puzzleId, marks);
  return space.origins[created.id] ?? created;
}

function pruneOrigins(space: HypothesisSpace): Record<string, BranchOrigin> {
  const used = new Set(
    Object.values(space.branches).map((branch) => branch.originId),
  );
  return Object.fromEntries(
    Object.entries(space.origins).filter(([id]) => used.has(id)),
  );
}

/**
 * The route the board is currently showing, if it is safe to use. A branch
 * whose shared origin vanished (or no longer matches) is never silently
 * substituted with the main board; it simply stops being editable.
 */
function activeBranch(document: GameDocument, puzzleId: string) {
  return effectiveBranch(document.hypothesis, puzzleId);
}

export function transition(
  document: GameDocument,
  action: GameAction,
  puzzles: Puzzle[],
): GameDocument {
  const puzzle = puzzles.find((p) => p.id === document.activeId)!;
  const current = document.sessions[puzzle.id];
  const space = document.hypothesis;
  const route = activeBranch(document, puzzle.id);

  if (action.type === "open") {
    const target = puzzles.find((p) => p.id === action.id);
    return target
      ? {
          ...document,
          activeId: target.id,
          sessions: {
            ...document.sessions,
            [target.id]: document.sessions[target.id] ?? newSession(target),
          },
          hypothesis: { ...space, activeBranchId: null },
        }
      : document;
  }

  if (action.type === "fork") {
    const requested =
      action.parentId === undefined ? space.activeBranchId : action.parentId;
    let marks: Mark[];
    let parentId: string | null = null;
    if (requested) {
      const parent = space.branches[requested];
      if (!parent || parent.puzzleId !== puzzle.id || parent.mergedAt)
        return document;
      const parentOrigin = space.origins[parent.originId];
      if (!originIsValid(parentOrigin, parent)) return document;
      marks = branchMarks(parentOrigin, parent);
      parentId = parent.id;
    } else {
      if (current.solved) return document;
      marks = current.marks;
    }
    const origin = ensureOrigin(space, puzzle.id, marks);
    const branch = createBranch(
      puzzle.id,
      origin,
      parentId,
      action.name ?? nextBranchName(space.branches, puzzle.id),
    );
    return {
      ...document,
      hypothesis: {
        branches: { ...space.branches, [branch.id]: branch },
        origins: { ...space.origins, [origin.id]: origin },
        activeBranchId: branch.id,
      },
    };
  }

  if (action.type === "switchBranch") {
    if (action.id === null)
      return { ...document, hypothesis: { ...space, activeBranchId: null } };
    const target = space.branches[action.id];
    if (!target || target.puzzleId !== puzzle.id || target.mergedAt)
      return document;
    const origin = space.origins[target.originId];
    if (!originIsValid(origin, target)) return document;
    return {
      ...document,
      hypothesis: { ...space, activeBranchId: target.id },
    };
  }

  if (action.type === "discardBranch") {
    const target = space.branches[action.id];
    if (!target) return document;
    const branches: Record<string, HypothesisBranch> = {};
    for (const [id, branch] of Object.entries(space.branches)) {
      if (id === action.id) continue;
      // Work done in a child route is its own reasoning; keep it by re-anchoring
      // it to the discarded route's parent instead of deleting it too.
      branches[id] =
        branch.parentId === action.id
          ? { ...branch, parentId: target.parentId }
          : branch;
    }
    const hypothesis: HypothesisSpace = {
      branches,
      origins: pruneOrigins({ ...space, branches }),
      activeBranchId:
        space.activeBranchId === action.id ? null : space.activeBranchId,
    };
    return { ...document, hypothesis };
  }

  if (action.type === "mergeBranch") {
    const branch = space.branches[action.branchId];
    if (
      !branch ||
      branch.puzzleId !== puzzle.id ||
      branch.mergedAt ||
      current.solved
    )
      return document;
    const origin = space.origins[branch.originId];
    if (!originIsValid(origin, branch)) return document;
    const plan = mergePlan(origin, branch, current.marks);
    const selections = mergeSelections(plan, action.resolutions);
    const groupId = action.groupId ?? newId("commit");
    let next: Session = current;
    if (selections.length) {
      const marks = [...current.marks];
      const moves = selections.map(({ index, mark }) => {
        const before = marks[index];
        marks[index] = mark;
        return { index, before, after: mark, groupId };
      });
      next = {
        ...current,
        marks,
        moves: [...current.moves, ...moves],
        updatedAt: Date.now(),
      };
    }
    const solved = isSolved(puzzle, next);
    next = { ...next, solved };
    const mergedBranch: HypothesisBranch = {
      ...branch,
      changes: normalizedChanges(origin, branch.changes),
      mergedAt: Date.now(),
      mergedGroupId: groupId,
      updatedAt: Date.now(),
    };
    const hypothesis: HypothesisSpace = {
      ...space,
      branches: { ...space.branches, [branch.id]: mergedBranch },
      // Returning to the main board after a commit keeps the mechanics honest:
      // a completed board is always the main board.
      activeBranchId:
        space.activeBranchId === branch.id || solved
          ? null
          : space.activeBranchId,
    };
    const withRecord = registerSolve(
      { ...document, hypothesis },
      puzzle,
      next,
      groupId,
    );
    return {
      ...withRecord,
      sessions: { ...withRecord.sessions, [puzzle.id]: next },
    };
  }

  if (action.type === "reset" && route) {
    const reset: HypothesisBranch = {
      ...route.branch,
      changes: {},
      moves: [],
      checks: 0,
      seconds: 0,
      updatedAt: Date.now(),
    };
    return withBranch(document, reset);
  }

  // A route is selected but no longer usable (its shared origin is gone). Do
  // not quietly reinterpret edits as main-board edits; the user must return to
  // the main board explicitly.
  if (!route && space.activeBranchId) {
    const lost = space.branches[space.activeBranchId];
    if (
      lost &&
      lost.puzzleId === puzzle.id &&
      [
        "mark",
        "undo",
        "hint",
        "check",
        "reset",
        "tick",
      ].includes(action.type)
    )
      return document;
  }

  if (route) {
    const { branch, origin } = route;
    if (action.type === "mark") {
      const updated = applyBranchMark(branch, origin, action.index, action.mark);
      return updated === branch ? document : withBranch(document, updated);
    }
    if (action.type === "undo") {
      const updated = undoBranchMark(branch, origin);
      return updated === branch ? document : withBranch(document, updated);
    }
    if (
      action.type === "hint" &&
      current.hints < HINT_LIMIT &&
      !branchRouteSolved(puzzle, origin, branch)
    ) {
      const updated = applyBranchMark(branch, origin, action.index, action.mark);
      if (updated === branch) return document;
      const hinted: HypothesisBranch = {
        ...updated,
        updatedAt: Date.now(),
      };
      const mainHinted: Session = {
        ...current,
        hints: current.hints + 1,
        updatedAt: Date.now(),
      };
      return {
        ...withBranch(document, hinted),
        sessions: { ...document.sessions, [puzzle.id]: mainHinted },
      };
    }
    if (action.type === "check") {
      return withBranch(document, {
        ...branch,
        checks: branch.checks + 1,
        updatedAt: Date.now(),
      });
    }
    if (
      action.type === "tick" &&
      !branchRouteSolved(puzzle, origin, branch)
    ) {
      return withBranch(document, {
        ...branch,
        seconds: branch.seconds + 1,
        updatedAt: Date.now(),
      });
    }
    return document;
  }

  let next = current;
  let reopened: HypothesisSpace | null = null;
  let removedCommit: string | null = null;
  if (action.type === "mark")
    next = applyMark(current, action.index, action.mark);
  if (action.type === "undo") {
    const undoneGroup = current.moves.at(-1)?.groupId;
    next = undoMark(current, { force: true });
    // Rolling back the whole merge commit re-opens the route it came from and
    // removes the completion record that commit created.
    if (next !== current && undoneGroup) {
      removedCommit = undoneGroup;
      const branch = Object.values(space.branches).find(
        (item) =>
          item.mergedGroupId === undoneGroup && item.puzzleId === puzzle.id,
      );
      if (branch) {
        const reverted = { ...branch };
        delete reverted.mergedAt;
        delete reverted.mergedGroupId;
        reopened = {
          ...space,
          branches: { ...space.branches, [branch.id]: reverted },
        };
      }
    }
  }
  if (
    action.type === "hint" &&
    current.hints < HINT_LIMIT &&
    !current.solved
  ) {
    const marked = applyMark(current, action.index, action.mark);
    if (marked !== current) next = { ...marked, hints: current.hints + 1 };
  }
  if (action.type === "check" && !current.solved)
    next = { ...current, checks: current.checks + 1 };
  if (action.type === "tick" && !current.solved)
    next = { ...current, seconds: current.seconds + 1 };
  if (action.type === "reset") next = newSession(puzzle);
  if (next === current) return document;
  next = { ...next, solved: isSolved(puzzle, next) };
  const withRecord = registerSolve(document, puzzle, next);
  const records = removedCommit
    ? withRecord.records.filter((record) => record.commitId !== removedCommit)
    : withRecord.records;
  return {
    ...withRecord,
    records,
    ...(reopened ? { hypothesis: reopened } : {}),
    sessions: { ...withRecord.sessions, [puzzle.id]: next },
  };
}
