import type {
  BranchOrigin,
  HypothesisBranch,
  HypothesisSpace,
  Mark,
  Puzzle,
} from "../../../shared/types";
import { fingerprint, isMarkArray } from "../../../shared/document";
import {
  branchMarks,
  originIdFor,
  originIsValid,
} from "../model/space";

const MAX_BRANCHES = 200;
const MAX_MOVES = 500;

interface RawState {
  space: HypothesisSpace;
  issue: string | null;
}

/** Rebuild a delta branch's snapshot only when the origin is genuinely intact. */
function sanitizeBranch(
  raw: unknown,
  puzzle: Puzzle,
  origins: Record<string, BranchOrigin>,
): { branch: HypothesisBranch | null; issue: string | null } {
  if (!raw || typeof raw !== "object") return { branch: null, issue: null };
  const value = raw as Record<string, unknown>;
  const size = puzzle.size ** 2;
  if (
    typeof value.id !== "string" ||
    typeof value.originId !== "string" ||
    typeof value.baseFingerprint !== "string"
  )
    return { branch: null, issue: null };
  const origin = origins[value.originId];
  const candidate: HypothesisBranch = {
    id: value.id,
    puzzleId: puzzle.id,
    name: typeof value.name === "string" && value.name ? value.name : "支线",
    parentId: typeof value.parentId === "string" ? value.parentId : null,
    originId: value.originId,
    baseFingerprint: value.baseFingerprint,
    changes: {},
    moves: [],
    checks: 0,
    seconds: 0,
    createdAt: Number.isFinite(value.createdAt) ? Number(value.createdAt) : 0,
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : 0,
  };
  if (!originIsValid(origin, candidate))
    return {
      branch: null,
      issue: "有一条分支已经失去共同的起点，为避免误合并，它的变化不再被载入。",
    };
  if (value.changes && typeof value.changes === "object") {
    for (const [key, mark] of Object.entries(
      value.changes as Record<string, unknown>,
    )) {
      const index = Number(key);
      if (
        Number.isInteger(index) &&
        index >= 0 &&
        index < size &&
        (mark === "filled" || mark === "cross" || mark === "unknown") &&
        mark !== origin.marks[index]
      )
        candidate.changes[String(index)] = mark;
    }
  }
  if (Array.isArray(value.moves)) {
    candidate.moves = value.moves
      .filter(
        (move): move is Record<string, unknown> =>
          !!move && typeof move === "object",
      )
      .filter(
        (move) =>
          Number.isInteger(move.index) &&
          (move.index as number) >= 0 &&
          (move.index as number) < size &&
          ["filled", "cross", "unknown"].includes(String(move.before)) &&
          ["filled", "cross", "unknown"].includes(String(move.after)),
      )
      .map((move) => ({
        index: move.index as number,
        before: move.before as Mark,
        after: move.after as Mark,
        ...(typeof move.groupId === "string" ? { groupId: move.groupId } : {}),
        ...(typeof move.note === "string" ? { note: move.note } : {}),
      }))
      .slice(-MAX_MOVES);
  }
  candidate.checks = Math.max(0, Number(value.checks) || 0);
  candidate.seconds = Math.max(0, Number(value.seconds) || 0);
  if (Number.isFinite(value.mergedAt)) {
    candidate.mergedAt = Number(value.mergedAt);
    if (typeof value.mergedGroupId === "string")
      candidate.mergedGroupId = value.mergedGroupId;
  }
  return { branch: candidate, issue: null };
}

/**
 * Restores the hypothesis space alongside a saved document. Snapshots are only
 * kept when a live branch still refers to them and their content is unchanged,
 * so a lost or tampered common starting point can never be papered over later.
 */
export function restoreHypothesis(
  raw: unknown,
  puzzles: Puzzle[],
): RawState {
  const space: HypothesisSpace = {
    branches: {},
    origins: {},
    activeBranchId: null,
  };
  if (!raw || typeof raw !== "object") return { space, issue: null };
  const value = raw as Record<string, unknown>;
  const issues: string[] = [];

  if (value.origins && typeof value.origins === "object") {
    for (const [id, entry] of Object.entries(
      value.origins as Record<string, unknown>,
    )) {
      if (!entry || typeof entry !== "object") continue;
      const origin = entry as Record<string, unknown>;
      const puzzle = puzzles.find((p) => p.id === origin.puzzleId);
      if (
        !puzzle ||
        typeof origin.puzzleId !== "string" ||
        typeof origin.fingerprint !== "string" ||
        !isMarkArray(origin.marks, puzzle.size ** 2) ||
        fingerprint(origin.marks) !== origin.fingerprint ||
        originIdFor(puzzle.id, origin.marks) !== id
      ) {
        issues.push("有分支的共同起点快照被损坏，相关分支已停止合并。");
        continue;
      }
      space.origins[id] = {
        id,
        puzzleId: puzzle.id,
        marks: [...origin.marks],
        fingerprint: origin.fingerprint,
        createdAt: Number.isFinite(origin.createdAt)
          ? Number(origin.createdAt)
          : 0,
      };
    }
  }

  if (value.branches && typeof value.branches === "object") {
    const entries = Object.entries(
      value.branches as Record<string, unknown>,
    ).slice(0, MAX_BRANCHES);
    for (const [id, entry] of entries) {
      if (!entry || typeof entry !== "object") continue;
      const rawBranch = entry as Record<string, unknown>;
      if (typeof rawBranch.puzzleId !== "string" || rawBranch.id !== id)
        continue;
      const puzzle = puzzles.find((p) => p.id === rawBranch.puzzleId);
      if (!puzzle) continue;
      const { branch, issue } = sanitizeBranch(rawBranch, puzzle, space.origins);
      if (issue) issues.push(issue);
      if (branch) space.branches[branch.id] = branch;
    }
  }

  // Resolve parents; orphaned children keep their own valid origin and simply
  // become a second root of the same common starting point.
  for (const branch of Object.values(space.branches)) {
    if (branch.parentId && !space.branches[branch.parentId])
      branch.parentId = null;
    if (!branch.baseFingerprint || !space.origins[branch.originId])
      branch.parentId = null;
  }

  // The snapshot must reproduce a board the route could have been drawn on.
  for (const [id, branch] of Object.entries(space.branches)) {
    const origin = space.origins[branch.originId];
    if (!origin || !originIsValid(origin, branch)) {
      delete space.branches[id];
      issues.push("有一条分支已经失去共同的起点，已从假设空间移除。");
      continue;
    }
    const puzzle = puzzles.find((p) => p.id === branch.puzzleId)!;
    const marks = branchMarks(origin, branch);
    if (marks.length !== puzzle.size ** 2) delete space.branches[id];
  }

  const active =
    typeof value.activeBranchId === "string"
      ? space.branches[value.activeBranchId]
      : undefined;
  space.activeBranchId = active && !active.mergedAt ? active.id : null;

  const used = new Set(
    Object.values(space.branches).map((branch) => branch.originId),
  );
  space.origins = Object.fromEntries(
    Object.entries(space.origins).filter(([id]) => used.has(id)),
  );

  return { space, issue: issues[0] ?? null };
}
