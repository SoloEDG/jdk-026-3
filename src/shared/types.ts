export type Mark = "unknown" | "filled" | "cross";
export type Tool = "filled" | "cross" | "unknown";
export interface Puzzle {
  id: string;
  title: string;
  collection: string;
  level: "入门" | "进阶" | "挑战";
  size: number;
  solution: number[];
  color: string;
}
export interface Move {
  index: number;
  before: Mark;
  after: Mark;
  /** Moves that share a group are undone together, as one commit. */
  groupId?: string;
  note?: string;
}
export interface Session {
  puzzleId: string;
  marks: Mark[];
  moves: Move[];
  /** Hint quota used across the main board and every hypothesis branch. */
  hints: number;
  checks: number;
  seconds: number;
  solved: boolean;
  updatedAt: number;
}
export interface SolveRecord {
  id: string;
  puzzleId: string;
  seconds: number;
  hints: number;
  checks: number;
  finishedAt: number;
  /** Set when a hypothesis merge is what completed the board. */
  commitId?: string;
}
/** A full snapshot of the board at a fork point. Shared by every branch from it. */
export interface BranchOrigin {
  id: string;
  puzzleId: string;
  marks: Mark[];
  fingerprint: string;
  createdAt: number;
}
/**
 * A route stores only its delta from the origin snapshot. Together with the
 * shared snapshot this restores the full route after a refresh.
 */
export interface HypothesisBranch {
  id: string;
  puzzleId: string;
  name: string;
  parentId: string | null;
  originId: string;
  baseFingerprint: string;
  changes: Record<string, Mark>;
  moves: Move[];
  checks: number;
  seconds: number;
  createdAt: number;
  updatedAt: number;
  /** Set once the route has been committed to the main board. */
  mergedAt?: number;
  mergedGroupId?: string;
}
export interface HypothesisSpace {
  branches: Record<string, HypothesisBranch>;
  origins: Record<string, BranchOrigin>;
  activeBranchId: string | null;
}
export interface GameDocument {
  version: 1;
  activeId: string;
  sessions: Record<string, Session>;
  records: SolveRecord[];
  hypothesis: HypothesisSpace;
}
export type MergeResolution = "main" | "branch";
export type GameAction =
  | { type: "open"; id: string }
  | { type: "mark"; index: number; mark: Mark }
  | { type: "undo" }
  | { type: "hint"; index: number; mark: Mark }
  | { type: "check" }
  | { type: "tick" }
  | { type: "reset" }
  | { type: "fork"; parentId?: string | null; name?: string }
  | { type: "switchBranch"; id: string | null }
  | { type: "discardBranch"; id: string }
  | {
      type: "mergeBranch";
      branchId: string;
      resolutions?: Record<string, MergeResolution>;
      groupId?: string;
    };
