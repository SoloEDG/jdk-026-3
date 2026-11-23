export { BranchPanel } from "./ui/BranchPanel";
export { MergeDialog } from "./ui/MergeDialog";
export { branchSession } from "./model/space";
export {
  applyBranchMark,
  branchDiff,
  branchTree,
  branchMarks,
  branchRouteSolved,
  createBranch,
  createOrigin,
  comparisonGroups,
  compareRoutes,
  diffStats,
  effectiveBranch,
  mergePlan,
  mergeSelections,
  originIsValid,
  summarizeMerge,
  undoBranchMark,
} from "./model/space";
export type {
  BranchNode,
  RouteComparison,
  DiffEntry,
  DiffStats,
  MergeEntry,
  MergeEntryKind,
  MergePlanSummary,
} from "./model/space";
export { restoreHypothesis } from "./lib/restore";
