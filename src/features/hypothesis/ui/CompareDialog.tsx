import { useMemo } from "react";
import { Columns3, X } from "lucide-react";
import type { HypothesisSpace, Mark, Puzzle } from "../../../shared/types";
import { comparisonGroups } from "../model/space";

const LABEL: Record<Mark, string> = {
  filled: "填涂",
  cross: "标空",
  unknown: "空",
};
const SYMBOL: Record<Mark, string> = {
  filled: "■",
  cross: "×",
  unknown: "·",
};

/**
 * Compares every live route of one puzzle against its shared starting point.
 * Routes with different starts are deliberately not mixed into one table: only
 * cells under the same origin are meaningfully comparable.
 */
export function CompareDialog({
  puzzle,
  space,
  puzzleId,
  onClose,
  onSwitch,
}: {
  puzzle: Puzzle;
  space: HypothesisSpace;
  puzzleId: string;
  onClose: () => void;
  onSwitch: (id: string) => void;
}) {
  const groups = useMemo(
    () => comparisonGroups(space, puzzleId),
    [space, puzzleId],
  );
  return (
    <div className="modal-backdrop merge-backdrop">
      <section
        className="modal compare-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
      >
        <button className="modal-close" aria-label="关闭对比" onClick={onClose}>
          <X size={19} />
        </button>
        <span className="eyebrow">SIDE BY SIDE · 路线对比</span>
        <h2 id="compare-title">
          <Columns3 size={17} /> 各条路线，差在哪里
        </h2>
        <p className="merge-summary">
          下表只列出相对共同起点有变化的格子。同一起点的支线可以并排比较；
          起点不同的路线分开显示，避免误把不同前提当成冲突。
        </p>
        {groups.map((group, groupIndex) => (
          <div className="compare-group" key={group.origin.id}>
            <div className="compare-group-head">
              共同起点 {groupIndex + 1} ·{" "}
              {group.origin.marks.filter((m) => m === "filled").length} 格已填涂
              <span>{group.branches.length} 条路线</span>
            </div>
            <div
              className="compare-table"
              role="table"
              style={{
                gridTemplateColumns: `minmax(88px, 1.2fr) 0.6fr repeat(${group.branches.length}, minmax(58px, 1fr))`,
              }}
            >
              <span role="columnheader">位置</span>
              <span role="columnheader">起点</span>
              {group.branches.map((branch) => (
                <button
                  key={branch.id}
                  role="columnheader"
                  className="compare-branch-head"
                  onClick={() => onSwitch(branch.id)}
                  title="切换到这条路线"
                >
                  {branch.name}
                </button>
              ))}
              {group.rows.map((row) => (
                <div className="compare-row" role="row" key={row.index}>
                  <span role="cell">
                    第 {Math.floor(row.index / puzzle.size) + 1} 行{" "}
                    {(row.index % puzzle.size) + 1} 列
                  </span>
                  <span role="cell" className={`mark ${row.origin}`}>
                    {SYMBOL[row.origin]}
                    <small>{LABEL[row.origin]}</small>
                  </span>
                  {group.branches.map((branch) => {
                    const mark = row.marks[branch.id] ?? row.origin;
                    return (
                      <span
                        role="cell"
                        key={branch.id}
                        className={`mark ${mark} ${mark !== row.origin ? "changed" : ""}`}
                      >
                        {SYMBOL[mark]}
                        <small>{LABEL[mark]}</small>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="merge-footnote">
          对比只是观察，不会改动主盘。选定一条路线后，再逐格确认是否合并。
        </div>
        <div>
          <button className="primary" onClick={onClose}>
            知道了
          </button>
        </div>
      </section>
    </div>
  );
}
