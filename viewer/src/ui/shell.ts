/**
 * The plain-DOM UI shell: top bar, layer toggles, side panels, status line and toasts.
 * No frameworks and no three.js. Every string from data goes through textContent.
 */
import { nextAnnouncement } from "../a11y";
import { layerAnnouncement } from "../placesList";
import { SEARCH_INPUT_ID } from "./searchBox";

export interface Panel {
  /** The panel's content area; fill it with your own elements. */
  el: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Replace the heading (and the close button's label). Plain text only. */
  setTitle(title: string): void;
  /** Called whenever the panel goes from open to closed, however that happened. */
  onClose(handler: () => void): void;
}

export interface ToggleHandle {
  /** Set the checkbox without calling the onChange handler. */
  set(on: boolean): void;
  /** Grey the toggle out; `reason` becomes its tooltip and is read by screen readers. */
  disable(reason: string): void;
  /** Undo disable(). */
  enable(): void;
}

export interface Shell {
  readonly root: HTMLElement;
  readonly header: HTMLElement;
  /** Empty container in the top bar where the search box goes. */
  readonly searchSlot: HTMLElement;
  /**
   * Add a text button (Legend, Sources, About, ...) to the top bar, before the layer
   * toggles. Below 640px it lives inside the Menu disclosure with the other actions.
   * `first` puts it before the existing ones.
   */
  addAction(id: string, label: string, onClick: () => void, options?: { first?: boolean }): HTMLButtonElement;
  addToggle(
    id: string,
    label: string,
    checked: boolean,
    onChange: (on: boolean) => void,
  ): ToggleHandle;
  onReset(handler: () => void): void;
  /** -1 = rotate left (Q), +1 = rotate right (E). */
  onRotate(handler: (dir: 1 | -1) => void): void;
  /** +1 = zoom in (+), -1 = zoom out (-), from the menu or the on-map buttons. */
  onZoom(handler: (dir: 1 | -1) => void): void;
  /** Enable or grey out the zoom buttons (false at that zoom limit). */
  setZoomLimits(canZoomIn: boolean, canZoomOut: boolean): void;
  onSurprise(handler: () => void): void;
  onCopyLink(handler: () => void): void;
  /** Replace the text of the polite live status line (empty hides it). */
  setStatus(text: string): void;
  /**
   * Say something to screen readers only (a visually hidden polite live region), e.g.
   * "Selected: Lobos Creek". Saying the same text twice in a row is announced again.
   */
  announce(text: string): void;
  addPanel(id: string, title: string): Panel;
  /** Close the most recently opened open panel; false when none was open. */
  closeTopPanel(): boolean;
  /** Show a short message for TOAST_MS in a polite live region. */
  toast(text: string): void;
}

export const TOAST_MS = 2500;
const TOAST_FADE_MS = 300;

type Attrs = Record<string, string>;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attrs?: Attrs,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Wide-screen menu open (true) or collapsed (false), remembered per visitor; never throws. */
export const MENU_OPEN_KEY = "yelamu-menu-open";
function storedMenuOpen(): boolean | null {
  try {
    const v = localStorage.getItem(MENU_OPEN_KEY);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}
function storeMenuOpen(open: boolean): void {
  try {
    localStorage.setItem(MENU_OPEN_KEY, open ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the choice just is not remembered.
  }
}
/** The phone layout (ui.css uses the same breakpoint). */
export const NARROW_QUERY = "(max-width: 640px)";
const isNarrow = () => typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches;

function actionButton(
  className: string,
  visible: string,
  ariaLabel: string,
  title: string,
  glyphOnly = false,
): HTMLButtonElement {
  const b = el("button", className, { type: "button", "aria-label": ariaLabel, title });
  const span = el("span", glyphOnly ? "btn-glyph" : "btn-text", undefined, visible);
  if (glyphOnly) span.setAttribute("aria-hidden", "true");
  b.appendChild(span);
  return b;
}

export function createShell(root: HTMLElement): Shell {
  root.classList.add("ui-root");
  root.replaceChildren();

  // First stop in the tab order: jump past the top bar to the search box (or, when the
  // dataset has none, to the first control). The link must not touch the URL hash, which
  // holds the view state, so it is handled in script.
  document.querySelector(".skip-nav")?.remove();
  const skip = el("a", "skip-link", { href: "#", "data-skip": "search" }, "Skip to search");
  skip.addEventListener("click", (e) => {
    e.preventDefault();
    const target =
      document.getElementById(SEARCH_INPUT_ID) ?? root.querySelector<HTMLElement>(".topbar button, .topbar input");
    target?.focus();
  });
  // A navigation landmark of its own, so the link is inside a landmark (accessibility rule "region").
  const skipNav = el("nav", "skip-nav", { "aria-label": "Skip link" });
  skipNav.appendChild(skip);
  document.body.prepend(skipNav);

  const header = el("header", "topbar", { role: "banner" });
  const title = el("h1", "topbar__title", undefined, "Yelamu");
  const searchSlot = el("div", "topbar__search");

  // Everything except the title and the search sits in the menu, behind a disclosure
  // button: closed by default on phones, open by default on wide screens, where it sits
  // inline in the bar and a visitor's choice to collapse it is remembered (see ui.css).
  const MENU_ID = "topbar-menu";
  const menuBtn = el("button", "btn topbar__menu-btn", {
    type: "button",
    "aria-expanded": "false",
    "aria-controls": MENU_ID,
    title: "Show or hide the menu",
  });
  menuBtn.append(el("span", "btn-text", undefined, "Menu"));
  const menu = el("div", "topbar__menu", { id: MENU_ID });
  const links = el("div", "topbar__links", { role: "group", "aria-label": "About this map" });

  // The layer toggles: a popover behind the Layers button on wide screens, inline in the
  // Menu on phones.
  const LAYERS_ID = "topbar-layers";
  const layersBtn = el("button", "btn topbar__layers-btn", {
    type: "button",
    "aria-expanded": "false",
    "aria-controls": LAYERS_ID,
  }, "Layers");
  const toggles = el("fieldset", "toggles", { id: LAYERS_ID });
  toggles.hidden = true; // nothing to show until a layer registers a toggle
  layersBtn.hidden = true;
  toggles.appendChild(el("legend", "visually-hidden", undefined, "Layers"));

  const actions = el("div", "topbar__actions", { role: "group", "aria-label": "View controls" });
  const resetBtn = actionButton("btn", "Reset", "Reset view", "Reset view (H)");
  const rotLeftBtn = actionButton("btn btn--icon", "↺", "Rotate left", "Rotate left (Q)", true);
  const rotRightBtn = actionButton("btn btn--icon", "↻", "Rotate right", "Rotate right (E)", true);
  const zoomInBtn = actionButton("btn btn--icon", "+", "Zoom in", "Zoom in (+)", true);
  const zoomOutBtn = actionButton("btn btn--icon", "\u2212", "Zoom out", "Zoom out (\u2212)", true);
  const surpriseBtn = actionButton("btn", "Surprise me", "Surprise me", "Fly to a random place");
  const copyBtn = actionButton("btn", "Copy link", "Copy link", "Copy a link to this view");
  actions.append(resetBtn, rotLeftBtn, rotRightBtn, zoomInBtn, zoomOutBtn, surpriseBtn, copyBtn);

  menu.append(links, layersBtn, toggles, actions);
  header.append(title, searchSlot, menuBtn, menu);

  let layersOpen = false;
  // Line the popover up under its button (both are positioned within the top bar), slid left
  // as far as needed to stay inside the bar: when the bar wraps, the button can sit at the
  // right end of a row.
  const placeLayers = () => {
    if (!layersOpen) return;
    const inset = 8;
    const maxLeft = header.clientWidth - toggles.offsetWidth - inset;
    toggles.style.setProperty("--layers-left", `${Math.max(inset, Math.min(layersBtn.offsetLeft, maxLeft))}px`);
  };
  const setLayersOpen = (open: boolean) => {
    layersOpen = open;
    layersBtn.setAttribute("aria-expanded", String(open));
    toggles.dataset.open = String(open);
    placeLayers(); // after data-open, so the popover is shown and has a width
  };
  setLayersOpen(false);
  layersBtn.addEventListener("click", () => setLayersOpen(!layersOpen));
  // A press anywhere outside the button and the popover closes it (ticking boxes does not).
  document.addEventListener("pointerdown", (e) => {
    const t = e.target as Node;
    if (layersOpen && !layersBtn.contains(t) && !toggles.contains(t)) setLayersOpen(false);
  });

  let menuOpen = false;
  const setMenuOpen = (open: boolean) => {
    menuOpen = open;
    menuBtn.setAttribute("aria-expanded", String(open));
    menu.dataset.open = String(open);
    if (!open) setLayersOpen(false);
  };
  const defaultMenuOpen = () => (isNarrow() ? false : (storedMenuOpen() ?? true));
  setMenuOpen(defaultMenuOpen());
  menuBtn.addEventListener("click", () => {
    setMenuOpen(!menuOpen);
    if (!isNarrow()) storeMenuOpen(menuOpen);
  });
  // Crossing the phone breakpoint (rotating a tablet, resizing a window) starts that layout's default.
  if (typeof window.matchMedia === "function") {
    window.matchMedia(NARROW_QUERY).addEventListener?.("change", () => setMenuOpen(defaultMenuOpen()));
  }
  // On phones, choosing an action closes the menu so the result is not hidden behind it.
  // The Layers button only opens its popover, so it is left out.
  menu.addEventListener("click", (e) => {
    const button = (e.target as Element).closest("button");
    if (button && button !== layersBtn && isNarrow()) setMenuOpen(false);
  });
  header.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (layersOpen) {
      setLayersOpen(false);
      layersBtn.focus();
      e.stopPropagation();
    } else if (menuOpen && isNarrow()) {
      // Phones only; on wide screens Esc keeps its usual job (closing a panel).
      setMenuOpen(false);
      menuBtn.focus();
      e.stopPropagation();
    }
  });

  const status = el("p", "status", { role: "status", "aria-live": "polite" });
  const announcer = el("p", "visually-hidden", { role: "status", "aria-live": "polite" });
  let lastAnnouncement = "";
  const toastEl = el("div", "toast", { role: "status", "aria-live": "polite" });
  const panelHost = el("div", "panels");
  // Big thumb-sized turn buttons in the bottom corners, at every screen size (on phones the
  // toolbar's own rotate buttons sit inside the Menu disclosure). ui.css hides them while a
  // panel (bottom sheet) is open.
  const turn = el("div", "turn", { role: "group", "aria-label": "Turn the map" });
  const turnLeftBtn = actionButton("turn__btn turn__btn--left", "↺", "Rotate left", "Rotate left (Q)", true);
  const turnRightBtn = actionButton("turn__btn turn__btn--right", "↻", "Rotate right", "Rotate right (E)", true);
  turn.append(turnLeftBtn, turnRightBtn);
  // Zoom buttons stacked above the turn-right button, drawn the same way; wide screens with a
  // mouse only (phones pinch). ui.css places and hides them.
  const zoomGroup = el("div", "zoom", { role: "group", "aria-label": "Zoom the map" });
  const mapZoomInBtn = actionButton("turn__btn zoom__btn zoom__btn--in", "+", "Zoom in", "Zoom in (+)", true);
  const mapZoomOutBtn = actionButton("turn__btn zoom__btn zoom__btn--out", "\u2212", "Zoom out", "Zoom out (\u2212)", true);
  zoomGroup.append(mapZoomInBtn, mapZoomOutBtn);
  root.append(header, status, announcer, toastEl, turn, zoomGroup, panelHost);

  // Panels sit below the top bar, which wraps to a variable height on narrow screens.
  const syncBarHeight = () => {
    root.style.setProperty("--topbar-h", `${Math.ceil(header.getBoundingClientRect().height)}px`);
    placeLayers(); // the bar re-wraps as the window changes width
  };
  syncBarHeight();
  // The turn buttons sit just above the status line, which may wrap to two lines.
  const syncStatusHeight = () =>
    root.style.setProperty("--status-h", `${Math.ceil(status.getBoundingClientRect().height)}px`);
  syncStatusHeight();
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(syncBarHeight).observe(header);
    new ResizeObserver(syncStatusHeight).observe(status);
  }

  const resetHandlers: Array<() => void> = [];
  const rotateHandlers: Array<(dir: 1 | -1) => void> = [];
  const surpriseHandlers: Array<() => void> = [];
  const copyHandlers: Array<() => void> = [];
  const zoomHandlers: Array<(dir: 1 | -1) => void> = [];
  for (const b of [zoomInBtn, mapZoomInBtn]) b.addEventListener("click", () => zoomHandlers.forEach((h) => h(1)));
  for (const b of [zoomOutBtn, mapZoomOutBtn]) b.addEventListener("click", () => zoomHandlers.forEach((h) => h(-1)));
  resetBtn.addEventListener("click", () => resetHandlers.forEach((h) => h()));
  rotLeftBtn.addEventListener("click", () => rotateHandlers.forEach((h) => h(-1)));
  rotRightBtn.addEventListener("click", () => rotateHandlers.forEach((h) => h(1)));
  turnLeftBtn.addEventListener("click", () => rotateHandlers.forEach((h) => h(-1)));
  turnRightBtn.addEventListener("click", () => rotateHandlers.forEach((h) => h(1)));
  surpriseBtn.addEventListener("click", () => surpriseHandlers.forEach((h) => h()));
  copyBtn.addEventListener("click", () => copyHandlers.forEach((h) => h()));

  const announce = (text: string) => {
    lastAnnouncement = nextAnnouncement(text, lastAnnouncement);
    announcer.textContent = lastAnnouncement;
  };

  const openStack: Panel[] = [];
  const panelIds = new Set<string>();
  const toggleIds = new Set<string>();
  const actionIds = new Set<string>();
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let toastClearTimer: ReturnType<typeof setTimeout> | null = null;
  const syncPanelOpen = () => {
    if (openStack.length > 0) root.dataset.panelOpen = "true";
    else delete root.dataset.panelOpen;
  };

  return {
    root,
    header,
    searchSlot,

    addAction(id, label, onClick, options) {
      if (actionIds.has(id)) throw new Error(`action "${id}" already exists`);
      actionIds.add(id);
      const button = el("button", "btn btn--text", { type: "button", "data-action": id }, label);
      button.addEventListener("click", () => onClick());
      if (options?.first) links.prepend(button);
      else links.appendChild(button);
      return button;
    },

    addToggle(id, label, checked, onChange) {
      if (toggleIds.has(id)) throw new Error(`toggle "${id}" already exists`);
      toggleIds.add(id);
      const inputId = `toggle-${id}`;
      const input = el("input", undefined, { type: "checkbox", id: inputId });
      input.checked = checked;
      input.dataset.layer = id;
      const text = el("span", undefined, undefined, label);
      const wrap = el("label", "toggle", { for: inputId });
      wrap.append(input, text);
      // The reason a toggle is disabled lives outside the label so it is not part of its name.
      const whyId = `toggle-${id}-why`;
      const why = el("span", "visually-hidden", { id: whyId });
      toggles.append(wrap, why);
      toggles.hidden = false;
      layersBtn.hidden = false;
      input.addEventListener("change", () => {
        // A checkbox already announces its own state; this also covers the layer's effect.
        announce(layerAnnouncement(label, input.checked));
        onChange(input.checked);
      });
      return {
        set(on: boolean) {
          input.checked = on;
        },
        disable(reason: string) {
          input.disabled = true;
          wrap.title = reason;
          wrap.classList.add("is-disabled");
          why.textContent = reason;
          input.setAttribute("aria-describedby", whyId);
        },
        enable() {
          input.disabled = false;
          wrap.removeAttribute("title");
          wrap.classList.remove("is-disabled");
          why.textContent = "";
          input.removeAttribute("aria-describedby");
        },
      };
    },

    onReset: (h) => void resetHandlers.push(h),
    onRotate: (h) => void rotateHandlers.push(h),
    onSurprise: (h) => void surpriseHandlers.push(h),
    onCopyLink: (h) => void copyHandlers.push(h),
    onZoom: (h) => void zoomHandlers.push(h),
    setZoomLimits(canZoomIn, canZoomOut) {
      zoomInBtn.disabled = mapZoomInBtn.disabled = !canZoomIn;
      zoomOutBtn.disabled = mapZoomOutBtn.disabled = !canZoomOut;
    },

    setStatus(text) {
      status.textContent = text;
    },

    announce,

    addPanel(id, panelTitle) {
      if (panelIds.has(id)) throw new Error(`panel "${id}" already exists`);
      panelIds.add(id);
      const titleId = `panel-${id}-title`;
      const section = el("section", "panel", {
        id: `panel-${id}`,
        role: "region",
        "aria-labelledby": titleId,
        tabindex: "-1",
      });
      section.hidden = true;
      const head = el("div", "panel__header");
      const h2 = el("h2", "panel__title", { id: titleId }, panelTitle);
      const closeBtn = el("button", "btn btn--icon panel__close", {
        type: "button",
        "aria-label": `Close ${panelTitle}`,
        title: "Close (Esc)",
      });
      closeBtn.appendChild(el("span", "btn-glyph", { "aria-hidden": "true" }, "×"));
      head.append(h2, closeBtn);
      // Scrolls, so keyboard users must be able to focus it to scroll (accessibility rule
      // "scrollable-region-focusable"); named by the panel title.
      const body = el("div", "panel__body", { tabindex: "0", role: "group", "aria-labelledby": titleId });
      section.append(head, body);
      panelHost.appendChild(section);

      let returnFocus: HTMLElement | null = null;
      const closeHandlers: Array<() => void> = [];
      const panel: Panel = {
        el: body,
        isOpen: () => !section.hidden,
        open() {
          // One side panel at a time: panels share the same spot, so an older one would
          // otherwise sit hidden behind the newest and its button would seem to do nothing.
          for (const other of [...openStack]) if (other !== panel) other.close();
          const at = openStack.indexOf(panel);
          if (at >= 0) openStack.splice(at, 1);
          else returnFocus = document.activeElement as HTMLElement | null;
          openStack.push(panel);
          syncPanelOpen();
          section.hidden = false;
          section.focus({ preventScroll: true });
        },
        close() {
          const at = openStack.indexOf(panel);
          if (at >= 0) openStack.splice(at, 1);
          syncPanelOpen();
          if (section.hidden) return;
          const hadFocus = section.contains(document.activeElement);
          section.hidden = true;
          if (hadFocus && returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
          returnFocus = null;
          for (const h of [...closeHandlers]) h();
        },
        setTitle(text) {
          h2.textContent = text;
          closeBtn.setAttribute("aria-label", `Close ${text}`);
        },
        onClose: (h) => void closeHandlers.push(h),
      };
      closeBtn.addEventListener("click", () => panel.close());
      return panel;
    },

    closeTopPanel() {
      const top = openStack[openStack.length - 1];
      if (!top) return false;
      top.close();
      return true;
    },

    toast(text) {
      if (toastTimer !== null) clearTimeout(toastTimer);
      if (toastClearTimer !== null) clearTimeout(toastClearTimer);
      toastEl.textContent = text;
      toastEl.dataset.visible = "true";
      toastTimer = setTimeout(() => {
        delete toastEl.dataset.visible;
        // Empty the live region once it has faded, so stale text is not left for screen readers.
        toastClearTimer = setTimeout(() => {
          toastEl.textContent = "";
        }, TOAST_FADE_MS);
      }, TOAST_MS);
    },
  };
}
