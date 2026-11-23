import { useState } from "react";
import {
  Grid2X2,
  Images,
  Leaf,
  ArrowUpRight,
  ArrowLeft,
  CheckCircle2,
  GitFork,
  X,
} from "lucide-react";
import { CatalogPanel, puzzles } from "../features/catalog";
import { BoardPanel } from "../features/board";
import { AssistPanel } from "../features/assist";
import { JournalPanel } from "../features/journal";
import { GalleryPanel } from "../features/gallery";
import { BranchPanel } from "../features/hypothesis/ui/BranchPanel";
import { useGame } from "./useGame";
export function App() {
  const game = useGame();
  const [page, setPage] = useState<"play" | "gallery">("play");
  const [resetting, setResetting] = useState(false);
  const open = (id: string) => {
    game.dispatch({ type: "open", id });
    game.clearMessage();
    setPage("play");
  };
  return (
    <div className="app-shell">
      <nav className="rail">
        <a className="brand-mark" href="#" aria-label="格间首页">
          <Grid2X2 size={25} />
        </a>
        <button
          className={page === "play" ? "active" : ""}
          onClick={() => setPage("play")}
          aria-label="解谜工作台"
        >
          <Grid2X2 size={21} />
          <span>解谜</span>
        </button>
        <button
          className={page === "gallery" ? "active" : ""}
          onClick={() => setPage("gallery")}
          aria-label="作品展柜"
        >
          <Images size={21} />
          <span>展柜</span>
        </button>
        <span className="rail-bottom">
          <Leaf size={20} />
          <span>慢一点</span>
        </span>
      </nav>
      <div className="main-shell">
        <header className="topbar">
          <a href="#" className="wordmark" onClick={() => setPage("play")}>
            格间<span>gejian</span>
          </a>
          <div className="header-center">给思绪留一点空白</div>
          <div className="header-right">
            <span className="online-dot" />
            只属于你的专注时光
          </div>
        </header>
        <main>
          <div className="page-intro">
            <div>
              <span className="eyebrow">NONOGRAM CLUB / 数织俱乐部</span>
              <h2>
                {page === "play"
                  ? "在数字之间，发现图案。"
                  : "让每一次发现，都有归处。"}
              </h2>
            </div>
            <div className="intro-note">
              不赶时间，只享受解开的瞬间。
              <ArrowUpRight size={16} />
            </div>
          </div>
          {page === "play" ? (
            <>
              <div className="workspace">
                <CatalogPanel document={game.document} onOpen={open} />
                <div className="board-column">
                  {game.route && (
                    <div className="route-banner" role="status">
                      <GitFork size={15} />
                      <span>
                        正在支线「{game.route.branch.name}」里推演。这里的填涂、检查和提示都只影响这条路线，主盘不会被提前完成。
                      </span>
                      <button onClick={() => game.switchBranch(null)}>
                        <ArrowLeft size={13} /> 回到主盘
                      </button>
                    </div>
                  )}
                  <BoardPanel
                    puzzle={game.puzzle}
                    session={game.session}
                    routeName={
                      game.route ? game.route.branch.name : null
                    }
                    onMark={(index, mark) =>
                      game.dispatch({ type: "mark", index, mark })
                    }
                    onUndo={() => game.dispatch({ type: "undo" })}
                    onReset={() => setResetting(true)}
                  />
                </div>
                <div className="side-column">
                  <AssistPanel
                    puzzle={game.puzzle}
                    session={game.session}
                    message={game.message}
                    onHint={game.hint}
                    onCheck={game.check}
                  />
                  <BranchPanel
                    document={game.document}
                    puzzle={game.puzzle}
                    mainSession={game.mainSession}
                    onFork={game.fork}
                    onSwitch={game.switchBranch}
                    onDiscard={game.discard}
                    onMerge={game.merge}
                    onMessage={game.setMessage}
                  />
                </div>
              </div>
              <div className="bottom-row">
                <JournalPanel
                  document={game.document}
                  puzzles={puzzles}
                  saveState={game.saveState}
                  onSave={game.save}
                  onOpen={open}
                />
                <button
                  className="collection-teaser"
                  onClick={() => setPage("gallery")}
                >
                  <div>
                    <span className="eyebrow">THE REVEAL</span>
                    <h2>
                      {game.session.solved && !game.route
                        ? "你的新作品，正在等你"
                        : "每一幅图，都藏着一个惊喜。"}
                    </h2>
                    <p>
                      {game.session.solved && !game.route ? (
                        <>
                          <CheckCircle2 size={15} />
                          已完成「{game.puzzle.title}」· 去展柜看看
                        </>
                      ) : (
                        "完成解谜，让隐藏的图案成为你的收藏。"
                      )}
                    </p>
                    <span className="text-link">
                      打开我的展柜 <ArrowUpRight size={16} />
                    </span>
                  </div>
                  <div className="teaser-art">✳</div>
                </button>
              </div>
            </>
          ) : (
            <GalleryPanel
              document={game.document}
              puzzles={puzzles}
              onOpen={open}
            />
          )}
          <footer>
            格间 GEJIAN <span>把复杂交给数字，把片刻留给自己。</span>
            <span>本地保存 · 无需登录</span>
          </footer>
        </main>
      </div>
      {resetting && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <button
              className="modal-close"
              aria-label="取消重新开始"
              onClick={() => setResetting(false)}
            >
              <X size={19} />
            </button>
            <h2 id="reset-title">
              {game.route ? "重新探索这条支线？" : "重新探索这幅图？"}
            </h2>
            <p>
              {game.route
                ? "这条支线的填涂和计时会回到它的共同起点。主盘、其他支线和已用的提示额度都不受影响。"
                : "本题标记、计时和提示额度会重置。已完成的解题记录和收藏仍保留。"}
            </p>
            <div>
              <button onClick={() => setResetting(false)}>继续解题</button>
              <button
                className="primary"
                onClick={() => {
                  const onRoute = !!game.route;
                  game.dispatch({ type: "reset" });
                  game.setMessage(
                    onRoute
                      ? "这条支线已回到共同起点，主盘未受影响。"
                      : "已重新开始本题，提示额度也重置了。",
                  );
                  setResetting(false);
                }}
              >
                重新开始
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
