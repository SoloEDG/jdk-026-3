import { useMemo, useState } from "react";
import { AlertTriangle, Check, GitMerge, X } from "lucide-react";
import type {
  BranchOrigin,
  HypothesisBranch,
  Mark,
  MergeResolution,
  Puzzle,
  Session,
} from "../../../shared/types";
import { mergePlan, summarizeMerge } from "../model/space";

const LABEL: Record<Mark, string> = {
  filled: "填涂",
  cross: "标空",
  unknown: "空",
};

function cellName(puzzle: Puzzle, index: number): string {
  return `第 ${Math.floor(index / puzzle.size) + 1} 行 ${(index % puzzle.size) + 1} 列`;
}

export function MergeDialog({
  puzzle,
  branch,
  origin,
  mainSession,
  onCancel,
  onConfirm,
}: {
  puzzle: Puzzle;
  branch: HypothesisBranch;
  origin: BranchOrigin | undefined;
  mainSession: Session;
  onCancel: () => void;
  onConfirm: (resolutions: Record<string, MergeResolution>) => void;
}) {
  const plan = useMemo(
    () => (origin ? mergePlan(origin, branch, mainSession.marks) : []),
    [origin, branch, mainSession.marks],
  );
  const summary = summarizeMerge(plan);
  const [resolutions, setResolutions] = useState<
    Record<string, MergeResolution>
  >(() =>
    Object.fromEntries(
      plan
        .filter((entry) => entry.kind === "conflict")
        .map((entry) => [String(entry.index), "main"]),
    ),
  );
  const unresolved = plan.filter(
    (entry) =>
      entry.kind === "conflict" && !resolutions[String(entry.index)],
  );
  const branchChoices = plan.filter(
    (entry) =>
      entry.kind === "apply" ||
      (entry.kind === "conflict" &&
        resolutions[String(entry.index)] === "branch"),
  ).length;
  const untouched = plan.filter(
    (entry) =>
      entry.kind === "conflict" &&
      resolutions[String(entry.index)] !== "branch",
  ).length;

  return (
    <div className="modal-backdrop merge-backdrop">
      <section
        className="modal merge-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-title"
      >
        <button className="modal-close" aria-label="取消合并" onClick={onCancel}>
          <X size={19} />
        </button>
        <span className="eyebrow">MERGE · 逐格合并</span>
        <h2 id="merge-title">把「{branch.name}」并入主盘？</h2>
        <p className="merge-summary">
          主盘自起点后可能已有新标记。这里只比较这条支线相对共同起点的变化，
          逐格区分可直接合并、已一致和需要你决定的冲突。
        </p>
        <div className="merge-stats">
          <span className="ok">
            <Check size={13} /> 可直接合并 <strong>{summary.apply}</strong>
          </span>
          <span>
            已经一致 <strong>{summary.aligned}</strong>
          </span>
          <span className={summary.conflicts ? "conflict" : ""}>
            <AlertTriangle size={13} /> 冲突 <strong>{summary.conflicts}</strong>
          </span>
        </div>
        {plan.length ? (
          <div className="merge-diff" role="table" aria-label="相对共同起点的变化">
            <div className="merge-diff-head" role="row">
              <span role="columnheader">位置</span>
              <span role="columnheader">起点</span>
              <span role="columnheader">主盘现在</span>
              <span role="columnheader">支线</span>
              <span role="columnheader">处理</span>
            </div>
            {plan.map((entry) => {
              const key = String(entry.index);
              const choice = resolutions[key];
              return (
                <div
                  className={`merge-diff-row ${entry.kind}`}
                  role="row"
                  key={entry.index}
                >
                  <span role="cell">{cellName(puzzle, entry.index)}</span>
                  <span role="cell">{LABEL[entry.origin]}</span>
                  <span role="cell">{LABEL[entry.main]}</span>
                  <span role="cell">{LABEL[entry.branch]}</span>
                  <span role="cell" className="merge-choice">
                    {entry.kind === "apply" ? (
                      <em>采用支线</em>
                    ) : entry.kind === "aligned" ? (
                      <em>已一致</em>
                    ) : (
                      <span className="choice-buttons">
                        <button
                          className={choice === "main" ? "active" : ""}
                          onClick={() =>
                            setResolutions((r) => ({ ...r, [key]: "main" }))
                          }
                          aria-pressed={choice === "main"}
                        >
                          保留主盘
                        </button>
                        <button
                          className={choice === "branch" ? "active" : ""}
                          onClick={() =>
                            setResolutions((r) => ({ ...r, [key]: "branch" }))
                          }
                          aria-pressed={choice === "branch"}
                        >
                          采用支线
                        </button>
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="merge-empty">这条支线还没有相对起点的新变化，暂时没有可提交的内容。</p>
        )}
        <div className="merge-footnote">
          {summary.conflicts
            ? `有 ${summary.conflicts} 处冲突：${untouched} 格保留主盘，${summary.conflicts - untouched} 格将采用支线。`
            : "没有冲突。确认后这些变化会作为一次提交写入主盘，可用一次撤销整体回退。"}
          <br />
          提交后主盘共有 {branchChoices} 格会更新；提示额度不会因合并而改变。
        </div>
        <div>
          <button onClick={onCancel}>先不合并</button>
          <button
            className="primary"
            onClick={() => onConfirm(resolutions)}
            disabled={!plan.length || unresolved.length > 0}
            title={
              !plan.length
                ? "这条支线还没有相对起点的新变化"
                : unresolved.length
                  ? "请先决定每一处冲突"
                  : undefined
            }
          >
            <GitMerge size={14} /> 确认合并
          </button>
        </div>
      </section>
    </div>
  );
}
