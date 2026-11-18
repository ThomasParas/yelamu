import type { Confidence } from "../heightmap";

/** A hand-mapped creek line (SFEI "San Francisco Historical Creeks"). */
export interface MappedCreek {
  id: string;
  /** Null for the many lines SFEI left unnamed. */
  name: string | null;
  confidence: Confidence;
  /** SFEI's cited sources for the line, as one text (may be empty). */
  sources: string;
  /** Flat [x, z, ...] in world metres (x east, z south). */
  points: number[];
}

/** One modelled stream channel (SFEI "MYHL_HistoricStreams"), Strahler order 1 to 8. */
export interface ModelledStream {
  order: number;
  points: number[];
}

export interface Creeks {
  version: 1;
  mapped: MappedCreek[];
  modelled: ModelledStream[];
}
