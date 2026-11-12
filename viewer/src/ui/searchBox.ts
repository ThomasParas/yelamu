/**
 * Accessible search combobox (ARIA 1.2 list autocomplete): an input with role=combobox
 * that controls a listbox of options. Names come from data, so everything is textContent.
 * The matching itself lives in search.ts.
 */
import { searchMetaLabel, type SearchItem } from "../search";

export interface SearchBoxOptions {
  /** Results for the current text (called on every input). */
  query(text: string): SearchItem[];
  onSelect(item: SearchItem): void;
}

export interface SearchBox {
  /** Focus the input and select its text (the "/" shortcut). */
  focus(): void;
  clear(): void;
}

const LISTBOX_ID = "search-listbox";
/** id of the search input (the skip link in shell.ts focuses it). */
export const SEARCH_INPUT_ID = "search-input";
const INPUT_ID = SEARCH_INPUT_ID;

export function createSearchBox(slot: HTMLElement, options: SearchBoxOptions): SearchBox {
  const wrap = document.createElement("div");
  wrap.className = "search";

  const label = document.createElement("label");
  label.className = "visually-hidden";
  label.htmlFor = INPUT_ID;
  label.textContent = "Search places and streets";

  const input = document.createElement("input");
  input.id = INPUT_ID;
  input.className = "search__input";
  input.type = "text";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", LISTBOX_ID);
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Search places (/)";
  input.maxLength = 80;

  const list = document.createElement("ul");
  list.id = LISTBOX_ID;
  list.className = "search__list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Search results");
  list.hidden = true;

  const live = document.createElement("p");
  live.className = "visually-hidden";
  live.setAttribute("role", "status");

  wrap.append(label, input, list, live);
  slot.appendChild(wrap);

  let results: SearchItem[] = [];
  let active = -1;

  const optionId = (i: number) => `search-opt-${i}`;

  const setActive = (i: number) => {
    active = i;
    const options_ = list.children;
    for (let k = 0; k < options_.length; k++) {
      const on = k === i;
      options_[k].setAttribute("aria-selected", String(on));
      options_[k].classList.toggle("is-active", on);
    }
    if (i >= 0) {
      input.setAttribute("aria-activedescendant", optionId(i));
      options_[i]?.scrollIntoView?.({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    setActive(-1);
  };

  const open = () => {
    if (results.length === 0) return;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  const choose = (i: number) => {
    const item = results[i];
    if (!item) return;
    input.value = item.name;
    close();
    live.textContent = "";
    input.blur(); // hand the keyboard back to the map shortcuts
    options.onSelect(item);
  };

  const render = () => {
    list.replaceChildren();
    results.forEach((item, i) => {
      const li = document.createElement("li");
      li.id = optionId(i);
      li.className = "search__option";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      const name = document.createElement("span");
      name.className = "search__name";
      name.textContent = item.name;
      const meta = document.createElement("span");
      meta.className = "search__meta";
      meta.textContent = searchMetaLabel(item);
      li.append(name, meta);
      list.appendChild(li);
    });
  };

  input.addEventListener("input", () => {
    results = options.query(input.value);
    render();
    setActive(-1);
    if (results.length > 0) {
      open();
      live.textContent = `${results.length} ${results.length === 1 ? "result" : "results"}`;
    } else {
      close();
      live.textContent = input.value.trim().length >= 2 ? "No results" : "";
    }
  });

  input.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (results.length === 0) return;
        e.preventDefault();
        if (list.hidden) open();
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = active < 0 ? (step > 0 ? 0 : results.length - 1) : (active + step + results.length) % results.length;
        setActive(next);
        break;
      }
      case "Enter":
        if (!list.hidden && results.length > 0) {
          e.preventDefault();
          choose(active >= 0 ? active : 0);
        }
        break;
      case "Escape":
        if (!list.hidden) {
          close();
          e.stopPropagation(); // closing the list must not also close a panel
        } else if (input.value !== "") {
          input.value = "";
          results = [];
          live.textContent = "";
          e.stopPropagation();
        } else {
          input.blur(); // nothing to undo: let Esc carry on to the panel handler
        }
        break;
      default:
        break;
    }
  });

  input.addEventListener("focus", () => {
    if (results.length > 0 && input.value !== "") open();
  });
  input.addEventListener("blur", () => close());

  // Keep focus in the input while clicking an option, so blur does not close the list first.
  list.addEventListener("mousedown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => {
    const li = (e.target as Element).closest("li");
    if (!li) return;
    choose(Array.prototype.indexOf.call(list.children, li));
  });
  list.addEventListener("mousemove", (e) => {
    const li = (e.target as Element).closest("li");
    if (!li) return;
    const i = Array.prototype.indexOf.call(list.children, li);
    if (i !== active) setActive(i);
  });

  return {
    focus() {
      input.focus();
      input.select();
    },
    clear() {
      input.value = "";
      results = [];
      close();
      live.textContent = "";
    },
  };
}
