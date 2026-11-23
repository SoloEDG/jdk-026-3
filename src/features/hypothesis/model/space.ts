import type {
  BranchOrigin,
  HypothesisBranch,
  HypothesisSpace,
  Mark,
  MergeResolution,
  Puzzle,
  Session,
} from "../../../shared/types";
import { fingerprint, isMark } from "../../../shared/document";

/**
 * The route the board is currently showing, if it is safe to use. A branch
 * whose shared origin vanished (or no longer matches) is never silently
 * substituted with the main board; it simply stops being editable.
 */
export function effectiveBranch(
  space: HypothesisSpace,
  puzzleId: string,
): { branch: HypothesisBranch; origin: BranchOrigin } | null {
  const id = space.activeBranchId;
  const branch = id ? space.branches[id] : undefined;
  if (!branch || branch.puzzleId !== puzzleId || branch.mergedAt) return null;
  const origin = space.origins[branch.originId];
  return originIsValid(origin, branch) ? { branch, origin } : null;
}

export interface DiffEntry {
  index: number;
  before: Mark;
  after: Mark;
}

export type MergeEntryKind = "apply" | "aligned" | "conflict";

export interface MergeEntry {
  index: number;
  origin: Mark;
  branch: Mark;
  main: Mark;
  kind: MergeEntryKind;
}

export interface MergePlanSummary {
  apply: number;
  aligned: number;
  conflicts: number;
}

let fallbackSequence = 0;

export function newId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid
    ? `${prefix}_${uuid}`
    : `${prefix}_${Date.now().toString(36)}_${fallbackSequence++}`;
}

/**
 * Origin snapshots are shared by every branch with the same starting board.
 * The id is derived from the snapshot itself, so reloading the document can
 * never produce two different snapshots that claim to be the same origin.
 */
export function originIdFor(puzzleId: string, marks: readonly Mark[]): string {
  return `origin:${puzzleId}:${fingerprint(marks)}`;
}

export function createOrigin(
  puzzleId: string,
  marks: readonly Mark[],
): BranchOrigin {
  const snapshot = [...marks];
  const digest = fingerprint(snapshot);
  return {
    id: originIdFor(puzzleId, snapshot),
    puzzleId,
    marks: snapshot,
    fingerprint: digest,
    createdAt: Date.now(),
  };
}

/**
 * A branch is only trustworthy while its shared snapshot still exists and its
 * recorded base fingerprint still matches that snapshot. This is the guard that
 * stops a merge from silently overwriting the main board after the common
 * starting point has been lost.
 */
export function originIsValid(
  origin: BranchOrigin | undefined,
  branch: HypothesisBranch,
): origin is BranchOrigin {
  return (
    !!origin &&
    origin.puzzleId === branch.puzzleId &&
    origin.fingerprint === branch.baseFingerprint &&
    origin.marks.length > 0 &&
    fingerprint(origin.marks) === origin.fingerprint
  );
}

export function branchMarks(
  origin: BranchOrigin,
  branch: HypothesisBranch,
): Mark[] {
  const marks = [...origin.marks];
  for (const [key, value] of Object.entries(branch.changes)) {
    const index = Number(key);
    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < marks.length &&
      isMark(value)
    )
      marks[index] = value;
  }
  return marks;
}

/**
 * Compares a route with its shared origin. `changes` is kept normalized, so a
 * cell toggled back to its original value drops out of the diff and a later
 * merge only ever sees genuine deltas.
 */
export function branchDiff(
  origin: BranchOrigin,
  branch: HypothesisBranch,
): DiffEntry[] {
  return Object.keys(branch.changes)
    .map(Number)
    .filter(
      (index) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < origin.marks.length &&
        isMark(branch.changes[String(index)]) &&
        branch.changes[String(index)] !== origin.marks[index],
    )
    .sort((a, b) => a - b)
    .map((index) => ({
      index,
      before: origin.marks[index],
      after: branch.changes[String(index)],
    }));
}

/** Keep a delta minimal: a cell that returned to its origin is not a change. */
export function normalizedChanges(
  origin: BranchOrigin,
  changes: Record<string, Mark>,
): Record<string, Mark> {
  const normalized: Record<string, Mark> = {};
  for (const [key, value] of Object.entries(changes)) {
    const index = Number(key);
    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < origin.marks.length &&
      isMark(value) &&
      origin.marks[index] !== value
    )
      normalized[String(index)] = value;
  }
  return normalized;
}

export function nextBranchName(
  branches: Record<string, HypothesisBranch>,
  puzzleId: string,
): string {
  const used = new Set(
    Object.values(branches)
      .filter((branch) => branch.puzzleId === puzzleId)
      .map((branch) => branch.name),
  );
  let number = 1;
  while (used.has(`支线 ${number}`)) number++;
  return `支线 ${number}`;
}

export function createBranch(
  puzzleId: string,
  origin: BranchOrigin,
  parentId: string | null,
  name: string,
): HypothesisBranch {
  const now = Date.now();
  return {
    id: newId("branch"),
    puzzleId,
    name,
    parentId,
    originId: origin.id,
    baseFingerprint: origin.fingerprint,
    changes: {},
    moves: [],
    checks: 0,
    seconds: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyBranchMark(
  branch: HypothesisBranch,
  origin: BranchOrigin,
  index: number,
  mark: Mark,
): HypothesisBranch {
  const marks = branchMarks(origin, branch);
  if (index < 0 || index >= marks.length || marks[index] === mark)
    return branch;
  const changes = { ...branch.changes };
  if (mark === origin.marks[index]) delete changes[String(index)];
  else changes[String(index)] = mark;
  return {
    ...branch,
    changes,
    moves: [...branch.moves, { index, before: marks[index], after: mark }].slice(
      -500,
    ),
    updatedAt: Date.now(),
  };
}

export function undoBranchMark(
  branch: HypothesisBranch,
  origin: BranchOrigin,
): HypothesisBranch {
  const move = branch.moves.at(-1);
  if (!move) return branch;
  const changes = { ...branch.changes };
  if (move.before === origin.marks[move.index])
    delete changes[String(move.index)];
  else changes[String(move.index)] = move.before;
  return {
    ...branch,
    changes,
    moves: branch.moves.slice(0, -1),
    updatedAt: Date.now(),
  };
}

/**
 * A derived session lets the board and assist panel operate on a route without
 * ever becoming the main session: marks/moves/checks/seconds are route-local,
 * while `hints` reads the shared quota counter so hints cannot be refunded by
 * leaving or discarding a branch.
 */
export function branchSession(
  main: Session,
  origin: BranchOrigin,
  branch: HypothesisBranch,
  solved = false,
): Session {
  return {
    ...main,
    marks: branchMarks(origin, branch),
    moves: branch.moves,
    hints: main.hints,
    checks: branch.checks,
    seconds: branch.seconds,
    solved,
    updatedAt: branch.updatedAt,
  };
}

export function branchRouteSolved(
  puzzle: Puzzle,
  origin: BranchOrigin,
  branch: HypothesisBranch,
): boolean {
  const marks = branchMarks(origin, branch);
  return marks.every((mark, index) =>
    puzzle.solution[index] ? mark === "filled" : mark !== "filled",
  );
}

export function mergePlan(
  origin: BranchOrigin,
  branch: HypothesisBranch,
  mainMarks: readonly Mark[],
): MergeEntry[] {
  return branchDiff(origin, branch).map((entry) => {
    const main = mainMarks[entry.index];
    const kind: MergeEntryKind =
      main === entry.before
        ? "apply"
        : main === entry.after
          ? "aligned"
          : "conflict";
    return {
      index: entry.index,
      origin: entry.before,
      branch: entry.after,
      main,
      kind,
    };
  });
}

export function summarizeMerge(plan: MergeEntry[]): MergePlanSummary {
  return plan.reduce<MergePlanSummary>(
    (summary, entry) => {
      if (entry.kind === "conflict") summary.conflicts++;
      else summary[entry.kind]++;
      return summary;
    },
    { apply: 0, aligned: 0, conflicts: 0 },
  );
}

export function mergeSelections(
  plan: MergeEntry[],
  resolutions: Record<string, MergeResolution> = {},
): { index: number; mark: Mark }[] {
  return plan
    .filter(
      (entry) =>
        entry.kind === "apply" ||
        (entry.kind === "conflict" && resolutions[String(entry.index)] === "branch"),
    )
    .map((entry) => ({ index: entry.index, mark: entry.branch }));
}

export interface BranchNode {
  branch: HypothesisBranch;
  origin: BranchOrigin | undefined;
  valid: boolean;
  depth: number;
  diff: DiffEntry[];
}

/** Routes of one puzzle, parents before their children, newest siblings last. */
export function branchTree(
  space: HypothesisSpace,
  puzzleId: string,
): BranchNode[] {
  const branches = Object.values(space.branches)
    .filter((branch) => branch.puzzleId === puzzleId)
    .sort((a, b) => a.createdAt - b.createdAt);
  const nodes: BranchNode[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const branch of branches) {
      if ((branch.parentId ?? null) !== parentId) continue;
      const origin = space.origins[branch.originId];
      const valid = !branch.mergedAt && originIsValid(origin, branch);
      nodes.push({
        branch,
        origin,
        valid,
        depth,
        diff: originIsValid(origin, branch) ? branchDiff(origin, branch) : [],
      });
      walk(branch.id, depth + 1);
    }
  };
  walk(null, 0);
  return nodes;
}

export interface DiffStats {
  filled: number;
  crossed: number;
  cleared: number;
  total: number;
}

export function diffStats(diff: DiffEntry[]): DiffStats {
  return diff.reduce<DiffStats>(
    (stats, entry) => {
      stats.total++;
      if (entry.after === "filled") stats.filled++;
      else if (entry.after === "cross") stats.crossed++;
      else stats.cleared++;
      return stats;
    },
    { filled: 0, crossed: 0, cleared: 0, total: 0 },
  );
}

export interface RouteComparison {
  origin: BranchOrigin;
  branches: HypothesisBranch[];
  rows: {
    index: number;
    origin: Mark;
    marks: Record<string, Mark>;
  }[];
}

/**
 * Side-by-side view of every route drawn from the same snapshot. Because the
 * columns share one origin, each cell is directly comparable even when the
 * routes were branched from one another.
 */
export function compareRoutes(
  space: HypothesisSpace,
  originId: string,
): RouteComparison | null {
  const origin = space.origins[originId];
  if (!origin) return null;
  const branches = Object.values(space.branches)
    .filter(
      (branch) =>
        branch.originId === originId &&
        !branch.mergedAt &&
        originIsValid(origin, branch),
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  if (branches.length < 1) return null;
  const indexes = new Set<number>();
  for (const branch of branches)
    for (const entry of branchDiff(origin, branch)) indexes.add(entry.index);
  const rows = [...indexes]
    .sort((a, b) => a - b)
    .map((index) => ({
      index,
      origin: origin.marks[index],
      marks: Object.fromEntries(
        branches.map((branch) => [branch.id, branch.changes[String(index)] ?? origin.marks[index]]),
      ),
    }));
  return { origin, branches, rows };
}

export function comparisonGroups(
  space: HypothesisSpace,
  puzzleId: string,
): RouteComparison[] {
  const originIds = new Set(
    Object.values(space.branches)
      .filter((branch) => branch.puzzleId === puzzleId && !branch.mergedAt)
      .map((branch) => branch.originId),
  );
  return [...originIds]
    .map((originId) => compareRoutes(space, originId))
    .filter((group): group is RouteComparison => !!group && group.rows.length > 0);
}
