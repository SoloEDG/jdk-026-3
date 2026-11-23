import { useEffect, useMemo, useState } from "react";
import { GitFork, GitMerge, Trash2, ArrowLeft, Columns3 } from "lucide-react";
import type {
  GameDocument,
  HypothesisBranch,
  MergeResolution,
  Puzzle,
  Session,
} from "../../../shared/types";
import {
  branchTree,
  comparisonGroups,
  diffStats,
  effectiveBranch,
  mergePlan,
} from "../model/space";
import { HINT_LIMIT } from "../../assist/model/hints";
import { CompareDialog } from "./CompareDialog";
import { MergeDialog } from "./MergeDialog";
export function BranchPanel({
  document,
  puzzle,
  mainSession,
  onFork,
  onSwitch,
  onDiscard,
  onMerge,
  onMessage,
}: {
  document: GameDocument;
  puzzle: Puzzle;
  mainSession: Session;
  onFork: (parentId: string | null) => void;
  onSwitch: (id: string | null) => void;
  onDiscard: (id: string) => void;
  onMerge: (
    branchId: string,
    resolutions: Record<string, MergeResolution>,
  ) => void;
  onMessage: (message: string) => void;
}) {
  const routes = useMemo(
    () => branchTree(document.hypothesis, puzzle.id),
    [document.hypothesis, puzzle.id],
  );
  const active = effectiveBranch(document.hypothesis, puzzle.id);
  const [merging, setMerging] = useState<HypothesisBranch | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<HypothesisBranch | null>(
    null,
  );
  const [comparing, setComparing] = useState(false);
  const comparable = useMemo(
    () => comparisonGroups(document.hypothesis, puzzle.id).length > 0,
    [document.hypothesis, puzzle.id],
  );
  // A branch can disappear underneath the dialog (discarded, merged, origin
  // lost). Close it rather than showing a stale plan.
  useEffect(() => {
    if (!merging) return;
    if (!routes.some((node) => node.branch.id === merging.id && node.valid))
      setMerging(null);
  }, [merging, routes]);

  const openMerge = (branch: HypothesisBranch) => {
    if (mainSession.solved) {
      onMessage("主盘已经完成，不能再合并支线；支线仍可作为推演记录保留。");
      return;
    }
    const origin = document.hypothesis.origins[branch.originId];
    if (!origin) {
      onMessage("这条支线已失去共同的起点，无法合并。请保留主盘，或回到起点重新推演。");
      return;
    }
    const plan = mergePlan(origin, branch, mainSession.marks);
    if (!plan.length) onMessage("这条支线还没有相对起点的新变化。");
    setMerging(branch);
  };

  return (
    <section className="branch-panel panel">
      <div className="branch-heading">
        <div>
          <span className="eyebrow">WHAT IF · 假设推演</span>
          <h2>先试着走另一条路</h2>
        </div>
        <span className="branch-mode">{active ? "支线中" : "主盘"}</span>
      </div>
      <p className="branch-intro">
        从当前盘面开一条支线，随意试错。支线里的填涂、检查和提示只属于这条路线，
        不会提前完成主盘。
      </p>
      <div className="branch-actions">
        <button
          className="fork-button"
          onClick={() => onFork(active ? active.branch.id : null)}
          disabled={mainSession.solved}
          title="从当前盘面开一条支线"
        >
          <GitFork size={15} />
          {active ? "从这条支线再开一条" : "从主盘开一条支线"}
        </button>
        {active && (
          <button className="back-button" onClick={() => onSwitch(null)}>
            <ArrowLeft size={14} /> 回到主盘
          </button>
        )}
        <button
          className="compare-button"
          onClick={() => setComparing(true)}
          disabled={!comparable}
          title="并排比较各条路线相对共同起点的变化"
        >
          <Columns3 size={13} /> 对比路线
        </button>
      </div>
      {!active && document.hypothesis.activeBranchId && (
        <div className="branch-lost" role="alert">
          <span>
            当前支线已失去共同的起点，为了不误改主盘，盘面已显示主盘本身。
            这条支线的变化不能切换或合并；你可以丢弃它，主盘内容不受影响。
          </span>
          <button onClick={() => onSwitch(null)}>
            <ArrowLeft size={12} /> 明确回到主盘
          </button>
        </div>
      )}
      <div className="branch-origin-note">
        共同起点 · 主盘与所有支线共享同一起点快照；离开支线不会丢失主盘进度。
      </div>
      {routes.length ? (
        <div className="branch-list">
          {routes.map(({ branch, valid, depth, diff }) => {
            const stats = diffStats(diff);
            const isActive = active?.branch.id === branch.id;
            return (
              <article
                key={branch.id}
                className={`branch-card depth-${Math.min(depth, 3)} ${isActive ? "active" : ""} ${branch.mergedAt ? "merged" : ""} ${valid || branch.mergedAt ? "" : "invalid"}`}
              >
                <button
                  className="branch-select"
                  onClick={() => {
                    if (!valid) {
                      onMessage(
                        branch.mergedAt
                          ? "这条支线已合并到主盘，记录只作留档。"
                          : "这条支线失去了共同起点，不能再切换或合并。",
                      );
                      return;
                    }
                    onSwitch(branch.id);
                  }}
                  disabled={!valid}
                >
                  <span className="branch-name">
                    <GitFork size={13} />
                    {branch.name}
                  </span>
                  <small>
                    {branch.mergedAt
                      ? "已并入主盘"
                      : valid
                        ? `${stats.total} 格变化 · 共用提示额度 ${mainSession.hints}/${HINT_LIMIT}`
                        : "起点已丢失"}
                  </small>
                  <span className="branch-chip-row">
                    {stats.filled > 0 && (
                      <span className="chip filled">+{stats.filled} 填涂</span>
                    )}
                    {stats.crossed > 0 && (
                      <span className="chip cross">+{stats.crossed} 标空</span>
                    )}
                    {stats.cleared > 0 && (
                      <span className="chip clear">−{stats.cleared} 擦除</span>
                    )}
                    {!stats.total && <span className="chip quiet">无变化</span>}
                  </span>
                </button>
                <div className="branch-card-actions">
                  {valid && !active && (
                    <button
                      aria-label={`切换到${branch.name}`}
                      title="切换到这条支线"
                      onClick={() => onSwitch(branch.id)}
                    >
                      进入
                    </button>
                  )}
                  {valid && (
                    <button
                      aria-label={`从${branch.name}再开一条支线`}
                      title="在这条支线里继续开分支"
                      onClick={() => onFork(branch.id)}
                    >
                      <GitFork size={13} />
                    </button>
                  )}
                  {valid && (
                    <button
                      aria-label={`合并${branch.name}`}
                      title="与主盘逐格合并"
                      onClick={() => openMerge(branch)}
                    >
                      <GitMerge size={13} />
                    </button>
                  )}
                  <button
                    aria-label={branch.mergedAt ? `清除${branch.name}的合并记录` : `丢弃${branch.name}`}
                    title={
                      branch.mergedAt
                        ? "清除这条已合并支线的历史记录"
                        : "丢弃这条支线（已用的提示额度不返还）"
                    }
                    onClick={() => setConfirmDiscard(branch)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="branch-empty">
          <span>还没有支线</span>
          <p>当两种走法都像正确时，先挑一种试着走下去。</p>
        </div>
      )}
      {confirmDiscard && (
        <div className="inline-confirm" role="alertdialog">
          <p>
            {confirmDiscard.mergedAt
              ? `清除「${confirmDiscard.name}」的合并记录？主盘已经提交的变化和提示额度都不会改变。`
              : `丢弃「${confirmDiscard.name}」？它相对起点的变化会消失，但已经用掉的提示额度不会返还。`}
          </p>
          <div>
            <button onClick={() => setConfirmDiscard(null)}>再想想</button>
            <button
              className="danger"
              onClick={() => {
                const target = confirmDiscard;
                setConfirmDiscard(null);
                onDiscard(target.id);
                onMessage(
                  target.mergedAt
                    ? "合并记录已清除，主盘保持不变。"
                    : "支线已丢弃。已经使用的提示额度不会返还。",
                );
              }}
            >
              {confirmDiscard.mergedAt ? "清除记录" : "丢弃支线"}
            </button>
          </div>
        </div>
      )}
      {comparing && (
        <CompareDialog
          puzzle={puzzle}
          space={document.hypothesis}
          puzzleId={puzzle.id}
          onClose={() => setComparing(false)}
          onSwitch={(id) => {
            setComparing(false);
            onSwitch(id);
          }}
        />
      )}
      {merging && (
        <MergeDialog
          puzzle={puzzle}
          branch={merging}
          origin={document.hypothesis.origins[merging.originId]}
          mainSession={mainSession}
          onCancel={() => setMerging(null)}
          onConfirm={(resolutions) => {
            const target = merging;
            setMerging(null);
            onMerge(target.id, resolutions);
          }}
        />
      )}
    </section>
  );
}
