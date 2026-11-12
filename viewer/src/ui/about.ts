/**
 * The About dialog: a native <dialog> opened with showModal(), so the browser traps focus,
 * Esc closes it and focus returns to whatever opened it. Static wording only (no data).
 */
import { CONFIDENCE_INFO } from "../confidence";
import { takeFirstVisit } from "../aboutSeen";
import { confidenceBadge, safeLink } from "./hotspotPanel";

export interface AboutDialog {
  open(): void;
  close(): void;
  /** Open once for a first-time visitor (remembered in localStorage, never throws). */
  openIfFirstVisit(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function section(title: string, ...body: Node[]): HTMLElement {
  const s = el("section", "about__section");
  s.appendChild(el("h3", "about__heading", title));
  s.append(...body);
  return s;
}

function paragraph(...parts: Array<string | Node>): HTMLElement {
  const p = el("p");
  p.append(...parts);
  return p;
}

export function createAbout(): AboutDialog {
  const dialog = el("dialog", "about");
  dialog.setAttribute("aria-labelledby", "about-title");

  const inner = el("div", "about__inner");
  const title = el("h2", "about__title", "About Yelamu");
  title.id = "about-title";
  inner.appendChild(title);

  inner.appendChild(
    section(
      "What this map is",
      paragraph(
        "This map shows the landscape of the San Francisco peninsula around 1769. It is reconstructed from " +
          "modern elevation data and from historical ecology maps. It is an informed picture of how land and " +
          "water may have lain, not a photograph or a survey.",
      ),
    ),
  );

  // Wording needs the owner's review before public launch
  inner.appendChild(
    section(
      "The Ramaytush Ohlone",
      paragraph(
        "The San Francisco peninsula is the homeland of the Ramaytush Ohlone. The Ramaytush Ohlone are a " +
          "living community today, not only a people of the past. To learn from them directly, visit the ",
        safeLink("https://www.ramaytush.org/", "Association of Ramaytush Ohlone"),
        ".",
      ),
      paragraph(
        "This map shows land and water only. It does not depict villages, people or sacred sites.",
      ),
    ),
  );

  const sure = el("ul", "about__confidence");
  for (const key of ["documented", "inferred", "illustrative"] as const) {
    const li = el("li");
    li.append(confidenceBadge(key), el("span", undefined, ` ${CONFIDENCE_INFO[key].meaning}`));
    sure.appendChild(li);
  }
  inner.appendChild(
    section(
      "How sure are we",
      paragraph("Each layer and each hotspot says how well supported it is:"),
      sure,
    ),
  );

  const credits = el("ul", "about__credits");
  const credit = (...parts: Array<string | Node>) => {
    const li = el("li");
    li.append(...parts);
    credits.appendChild(li);
  };
  credit(
    "San Francisco Estuary Institute. 2021. Hidden Nature SF, version 1.0. ",
    safeLink("https://hidden-nature.org/", "hidden-nature.org"),
    ".",
  );
  credit("U.S. Geological Survey 3D Elevation Program.");
  credit("U.S. Census Bureau TIGER/Line.");
  credit("NOAA National Geodetic Survey, Shoreline Data Rescue Project (historical shoreline vectors, 1850s).");
  credit("three.js.");
  inner.appendChild(section("Credits", credits));

  inner.appendChild(el("p", "about__warning", "This map is not for navigation, engineering or legal use."));

  const explore = el("button", "btn btn--primary about__close", "Explore the map");
  explore.type = "button";
  explore.autofocus = true;
  explore.addEventListener("click", () => dialog.close());
  inner.appendChild(explore);

  dialog.appendChild(inner);
  document.body.appendChild(dialog);

  // A click on the backdrop lands on the <dialog> itself (the content fills .about__inner).
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  // Typing inside the dialog must not drive the map behind it (Q/E rotate, arrows pan, ...).
  dialog.addEventListener("keydown", (e) => e.stopPropagation());

  const open = () => {
    if (dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", ""); // very old browsers: non-modal fallback
    explore.focus();
  };

  return {
    open,
    close: () => dialog.close(),
    openIfFirstVisit() {
      if (takeFirstVisit()) open();
    },
  };
}
