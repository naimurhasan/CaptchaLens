import type { Detection } from "./types";
import type { SolveResult } from "./solver";

export type SolveOutcome =
  | { ok: true; result: SolveResult }
  | { ok: false; error: string };

export type RuntimeMessage =
  | { type: "detections"; payload: Detection[] }
  | { type: "getDetections"; tabId: number }
  | { type: "solve"; imageDataUrl: string; context?: string }
  | { type: "solveOutcome"; payload: SolveOutcome }
  | { type: "getEngineInfo" };
