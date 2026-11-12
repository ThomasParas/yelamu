/** Keyboard shortcut mapping. Pure: the DOM listener lives in controls.ts. */

export type KeyAction =
  /** Unit direction the VIEW should move on screen (ArrowRight = +1, 0). */
  | { type: "pan"; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { type: "zoom"; dir: 1 | -1 }
  /** -1 = rotate left (Q), +1 = rotate right (E). */
  | { type: "rotate"; dir: 1 | -1 }
  | { type: "reset" }
  | { type: "search" }
  | { type: "help" }
  | { type: "escape" };

export interface KeyEventLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: {
    tagName?: string;
    isContentEditable?: boolean;
    /** An HTMLElement's closest(); used to spot side panels and dialogs. */
    closest?: (selector: string) => unknown;
  } | null;
}

/** Elements that use letters, arrows or +/- themselves (a link is also activated by Enter). */
const OWN_KEYS = new Set(["INPUT", "TEXTAREA", "SELECT", "A", "SUMMARY"]);
/** Where focus belongs to the panel's own content, not to the map. */
const PANEL_SELECTOR = ".panel, dialog";

function ownsKeys(target: KeyEventLike["target"]): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (typeof target.tagName === "string" && OWN_KEYS.has(target.tagName.toUpperCase())) return true;
  return Boolean(target.closest?.(PANEL_SELECTOR));
}

/**
 * The action for a keydown, or null when the key is not ours: a ctrl/meta/alt chord (so
 * browser shortcuts keep working), or a key pressed in a text field, select, link, summary,
 * side panel or dialog, which keep their own keys (Escape is always ours).
 */
export function keyAction(e: KeyEventLike): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const escape = e.key === "Escape" || e.key === "Esc";
  if (escape) return { type: "escape" };
  if (ownsKeys(e.target)) return null;

  switch (e.key) {
    case "ArrowLeft":
      return { type: "pan", dx: -1, dy: 0 };
    case "ArrowRight":
      return { type: "pan", dx: 1, dy: 0 };
    case "ArrowUp":
      return { type: "pan", dx: 0, dy: -1 };
    case "ArrowDown":
      return { type: "pan", dx: 0, dy: 1 };
    case "+":
    case "=":
      return { type: "zoom", dir: 1 };
    case "-":
    case "_":
      return { type: "zoom", dir: -1 };
    case "/":
      return { type: "search" };
    case "?":
      return { type: "help" };
  }
  switch (e.key.toLowerCase()) {
    case "q":
      return { type: "rotate", dir: -1 };
    case "e":
      return { type: "rotate", dir: 1 };
    case "h":
      return { type: "reset" };
    default:
      return null;
  }
}
