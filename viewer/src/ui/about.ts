/**
 * The About dialog: a native <dialog> opened with showModal(), so the browser traps focus,
 * Esc closes it and focus returns to whatever opened it. Static wording only (no data).
 */
import { CONFIDENCE_INFO } from "../confidence";
import { takeFirstVisit } from "../aboutSeen";
import { aboutPeopleSentence } from "./aboutText";
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

/**
 * `context`: the dataset has the grey surrounding terrain, so the About text describes it.
 * `villages`: the dataset marks the primary Yelamu villages, so the About text says so.
 */
export function createAbout(options: { context?: boolean; villages?: boolean } = {}): AboutDialog {
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
          "modern elevation data, from historical ecology maps and, along parts of the bay shore, from 1850s " +
          "U.S. Coast Survey maps. It is an informed picture of how land and water may have lain, not a " +
          "photograph or a survey.",
      ),
      // Wording approved by the owner on 2026-11-17
      ...(options.context
        ? [
            paragraph(
              "The grey-brown ground beyond the mapped area is today's terrain and coastline, shown only so the peninsula " +
                "is not floating on its own. It is not a reconstruction: along the Bay shore it includes land that was " +
                "filled in after 1769.",
            ),
          ]
        : []),
    ),
  );

  // Wording approved by the owner on 2026-11-17 (launch review)
  inner.appendChild(
    section(
      "The Ramaytush Ohlone",
      paragraph(
        "The San Francisco peninsula is the homeland of the Ramaytush Ohlone. The Ramaytush Ohlone are a " +
          "living community today, not only a people of the past. To learn from them directly, visit the ",
        safeLink("https://www.ramaytush.org/", "Association of Ramaytush Ohlone"),
        ".",
      ),
      paragraph(aboutPeopleSentence(options.villages)),
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

  // Terms supplied by SFEI for Hidden Nature SF (their reply to the licence question, 2026);
  // they asked that the data terms and disclaimer be followed, so they are shown here.
  inner.appendChild(
    section(
      "Data terms",
      paragraph(
        "San Francisco Historical Habitats is part of Hidden Nature SF, which is free data: it can be " +
          "redistributed and modified under the terms of the GNU General Public License, version 3 or (at " +
          "your option) any later version, as published by the Free Software Foundation. More information: ",
        safeLink("https://www.gnu.org/licenses/", "gnu.org/licenses"),
        ".",
      ),
      paragraph(
        "Hidden Nature SF is distributed in the hope that it will be useful, but without any warranty, " +
          "without even the implied warranty of merchantability or fitness for a particular purpose.",
      ),
      paragraph(
        "SFEI data are available without restriction upon use with these caveats: prudent usage, knowledge " +
          "of the data quality and professional courtesy should be considered. The data are not a survey " +
          "document, so they must not be used as one or beyond the limits of the source scale. Questions " +
          "about SFEI data can go to the SFEI GIS team at eigis@sfei.org.",
      ),
    ),
  );

  inner.appendChild(
    section(
      "Source code and data",
      paragraph(
        "The code and the data behind this map are free software under the GNU General Public License, " +
          "version 3 or any later version: ",
        safeLink("https://github.com/ThomasParas/yelamu", "github.com/ThomasParas/yelamu"),
        ".",
      ),
    ),
  );

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
