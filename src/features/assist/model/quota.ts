import type { Session } from "../../../shared/types";
import { HINT_LIMIT } from "./hints";
/**
 * Hint quota belongs to the puzzle, not to a route. The main session keeps the
 * authoritative counter; branch sessions read it so a discarded or refreshed
 * branch can never hand spent quota back.
 */
export function hintRemaining(main: Session): number {
  return Math.max(0, HINT_LIMIT - main.hints);
}
