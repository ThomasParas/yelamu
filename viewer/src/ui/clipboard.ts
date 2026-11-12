/**
 * Copy text to the clipboard. Uses the async Clipboard API when it is available (secure
 * contexts only), otherwise a hidden textarea and execCommand("copy"). Resolves true on
 * success, false when both routes fail (e.g. permission denied); it never rejects.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy route (permission denied, insecure context, no focus).
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const active = document.activeElement as HTMLElement | null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;pointer-events:none";
  document.body.appendChild(area);
  let ok = false;
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    area.remove();
    active?.focus?.();
  }
  return ok;
}
