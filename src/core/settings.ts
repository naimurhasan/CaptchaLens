import type { SolveResult } from "./solver";

export type ProviderId = "openrouter" | "gemini" | "local";

export interface SolverSettings {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
  audioProvider: ProviderId;
  audioModel: string;
}

declare const process: { env: Record<string, string | undefined> };

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openrouter: "OpenRouter (Decisions API)",
  gemini: "Google Gemini (AI Studio key)",
  local: "Local (OpenAI-compatible)",
};

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  openrouter: process.env.OPENROUTER_MODEL ?? "typesafe/jev-router",
  gemini: "gemini-flash-latest",
  local: "qwen2.5vl",
};

export const DEFAULT_AUDIO_MODEL = "google/gemini-2.5-flash-lite";

export const DEFAULT_BASE_URL = "http://localhost:11434/v1";

const STORAGE_KEY = "solverSettings";

function defaults(): SolverSettings {
  return {
    provider: "openrouter",
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    model: DEFAULT_MODELS.openrouter,
    baseUrl: DEFAULT_BASE_URL,
    audioProvider: "openrouter",
    audioModel: DEFAULT_AUDIO_MODEL,
  };
}

function sanitize(raw: unknown): Partial<SolverSettings> {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<SolverSettings> = {};
  if (r.provider === "openrouter" || r.provider === "gemini" || r.provider === "local") {
    out.provider = r.provider;
  }
  if (r.audioProvider === "openrouter" || r.audioProvider === "gemini" || r.audioProvider === "local") {
    out.audioProvider = r.audioProvider;
  }
  if (typeof r.apiKey === "string") out.apiKey = r.apiKey;
  if (typeof r.model === "string" && r.model.trim().length > 0) out.model = r.model.trim();
  if (typeof r.baseUrl === "string" && r.baseUrl.trim().length > 0) out.baseUrl = r.baseUrl.trim().replace(/\/+$/, "");
  if (typeof r.audioModel === "string" && r.audioModel.trim().length > 0) out.audioModel = r.audioModel.trim();
  return out;
}

export async function loadSolverSettings(): Promise<SolverSettings> {
  const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: {} });
  return { ...defaults(), ...sanitize(stored[STORAGE_KEY]) };
}

export async function saveSolverSettings(patch: Partial<SolverSettings>): Promise<SolverSettings> {
  const current = await loadSolverSettings();
  const next = { ...current, ...sanitize(patch) };
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

export function settingsSummary(s: SolverSettings): string {
  const keyState = s.apiKey ? "key set" : "no key";
  const extra = s.provider === "local" ? ` · ${s.baseUrl}` : "";
  const audio =
    s.audioProvider !== s.provider
      ? ` · audio: ${s.audioProvider}:${s.audioModel || DEFAULT_MODELS[s.audioProvider]}`
      : "";
  return `${PROVIDER_LABELS[s.provider]} · ${s.model || DEFAULT_MODELS[s.provider]} · ${keyState}${extra}${audio}`;
}

export function providerConfigured(s: SolverSettings): boolean {
  if (s.provider === "local") return s.baseUrl.length > 0;
  return s.apiKey.length > 0;
}

export interface ChatPathAnswer {
  challengeType: string;
  solvableProbability: number;
  typeConfidence: number;
  confidence: number;
  instructions: string;
  answer: string;
  targetBox: SolveResult["targetBox"];
  complexityScore: number;
  reasoning: string;
}

export const CHAT_SYSTEM_PROMPT = `You are a visual captcha-decision engine. You receive a screenshot that may contain a bot-detection challenge. Judge it and respond with ONLY a JSON object using exactly this schema:

{
  "challengeType": "image-grid" | "slider" | "rotation" | "press-hold" | "text" | "icon-click" | "checkbox" | "audio" | "no-challenge",
  "solvableProbability": number 0-1,
  "typeConfidence": number 0-1,
  "confidence": number 0-1,
  "instructions": "what the challenge asks, in plain words",
  "answer": "direct answer: which tiles, how far to drag, what to type",
  "targetBox": null or {"top":0-1,"bottom":0-1,"left":0-1,"right":0-1} fractions of the image,
  "complexityScore": number 0-2,
  "reasoning": "short explanation"
}

No markdown, no code fences, nothing outside the JSON object.`;
