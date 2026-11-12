export const ABOUT_SEEN_KEY = "yelamu-about-seen";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** localStorage, or null when it is missing or access throws (private mode, blocked data). */
export function safeLocalStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * True when the About dialog should open by itself: the visitor has not seen it yet (or
 * storage is unavailable, so we cannot tell). Marks it as seen as a side effect; every
 * storage access is guarded, so a throwing or missing storage never breaks the page.
 */
export function takeFirstVisit(storage: StorageLike | null = safeLocalStorage()): boolean {
  if (!storage) return true;
  try {
    if (storage.getItem(ABOUT_SEEN_KEY)) return false;
  } catch {
    return true;
  }
  try {
    storage.setItem(ABOUT_SEEN_KEY, "1");
  } catch {
    // Not remembered; the dialog will show again next time.
  }
  return true;
}
