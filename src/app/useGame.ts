import { useEffect, useReducer, useState, useRef } from "react";
import { findPuzzle, puzzles } from "../features/catalog";
import { inspect, nextHint, hintRemaining } from "../features/assist";
import { loadDocument, saveDocument } from "../features/journal";
import {
  branchRouteSolved,
  branchSession,
  effectiveBranch,
  mergePlan,
  mergeSelections,
  summarizeMerge,
} from "../features/hypothesis/model/space";
import { transition } from "./reducer";
export function useGame() {
  const [initial] = useState(() => loadDocument(puzzles));
  const [document, dispatch] = useReducer(
    (d: typeof initial.document, a: Parameters<typeof transition>[1]) =>
      transition(d, a, puzzles),
    initial.document,
  );
  const [message, setMessage] = useState(initial.warning);
  const [saveState, setSaveState] = useState(
    initial.warning ? "手动保存" : "进度已保存",
  );
  const allowSave = useRef(!initial.warning);
  const puzzle = findPuzzle(document.activeId);
  const mainSession = document.sessions[puzzle.id];
  const route = effectiveBranch(document.hypothesis, puzzle.id);
  const session = route
    ? branchSession(
        mainSession,
        route.origin,
        route.branch,
        branchRouteSolved(puzzle, route.origin, route.branch),
      )
    : mainSession;
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (globalThis.document.visibilityState === "visible")
        dispatch({ type: "tick" });
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!allowSave.current) return;
    const timer = setTimeout(
      () =>
        setSaveState(
          saveDocument(document) ? "进度已保存" : "保存失败 · 点击重试",
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [document]);
  const save = () => {
    allowSave.current = true;
    const ok = saveDocument(document);
    setSaveState(ok ? "进度已保存" : "保存失败 · 点击重试");
    setMessage(
      ok
        ? "已保存，支线关系与提示额度都会一并还原。"
        : "保存失败，请检查浏览器的本地存储权限。",
    );
  };
  /** Retry the automatic save after a repaired document failed to persist. */
  const enableSaving = () => {
    allowSave.current = true;
  };
  const hint = () => {
    const hint = nextHint(puzzle, session);
    if (hint) {
      dispatch({ type: "hint", ...hint });
      setMessage(
        `已揭示第 ${Math.floor(hint.index / puzzle.size) + 1} 行、第 ${(hint.index % puzzle.size) + 1} 列的一格。${
          route ? "这条提示只落在当前支线，额度仍从主盘扣除。" : ""
        }`,
      );
    } else setMessage("本题提示额度已用完，试试检查当前标记。");
  };
  const check = () => {
    const { errors } = inspect(puzzle, session);
    dispatch({ type: "check" });
    setMessage(
      errors
        ? `目前有 ${errors} 处标记与答案不符。检查不会直接揭示位置。`
        : "已填写的标记都正确，继续你的发现吧。",
    );
  };
  const fork = (parentId: string | null) => {
    dispatch({ type: "fork", parentId });
    setMessage(
      parentId
        ? "已从这条支线的当前盘面再开一条支线。"
        : "已从主盘当前盘面开一条支线，主盘会被完整保留。",
    );
  };
  const switchBranch = (id: string | null) => {
    dispatch({ type: "switchBranch", id });
    if (id === null) setMessage("已回到主盘。支线里的推演没有影响主盘。");
  };
  const discard = (id: string) => {
    dispatch({ type: "discardBranch", id });
  };
  const merge = (
    branchId: string,
    resolutions: Record<string, "main" | "branch">,
  ) => {
    const branch = document.hypothesis.branches[branchId];
    const origin = branch && document.hypothesis.origins[branch.originId];
    if (!branch || !origin) {
      setMessage("这条支线已失去共同起点，合并被取消，主盘没有任何改动。");
      return;
    }
    const plan = mergePlan(origin, branch, mainSession.marks);
    const applying = mergeSelections(plan, resolutions);
    const summary = summarizeMerge(plan);
    dispatch({ type: "mergeBranch", branchId, resolutions });
    setMessage(
      applying.length
        ? `已把「${branch.name}」的 ${applying.length} 格变化合并到主盘${summary.conflicts ? `（${summary.conflicts} 处冲突已按你的选择处理）` : ""}，可用一次撤销整体回退。`
        : `「${branch.name}」没有需要写入主盘的变化。`,
    );
  };
  return {
    document,
    puzzle,
    session,
    mainSession,
    route,
    message,
    saveState,
    hintRemaining: hintRemaining(mainSession),
    dispatch,
    save,
    enableSaving,
    hint,
    check,
    fork,
    switchBranch,
    discard,
    merge,
    setMessage,
    clearMessage: () => setMessage(""),
  };
}
