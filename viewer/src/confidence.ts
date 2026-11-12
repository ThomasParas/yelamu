import type { Confidence } from "./heightmap";

export interface ConfidenceInfo {
  label: string;
  /** One plain-language sentence for visitors. */
  meaning: string;
}

export const CONFIDENCE_INFO: Record<Confidence, ConfidenceInfo> = {
  documented: { label: "Documented", meaning: "Stated by a cited source." },
  inferred: {
    label: "Inferred",
    meaning: "Reconstructed by this project from other data.",
  },
  illustrative: {
    label: "Illustrative",
    meaning: "Drawn to give an impression, not a record.",
  },
};

/** Info for a confidence value from data; an unknown value is shown as-is with no claim. */
export function confidenceInfo(c: string): ConfidenceInfo & { key: Confidence | "unknown" } {
  if (Object.hasOwn(CONFIDENCE_INFO, c)) return { key: c as Confidence, ...CONFIDENCE_INFO[c as Confidence] };
  return { key: "unknown", label: String(c || "Unknown"), meaning: "No confidence level is recorded." };
}
