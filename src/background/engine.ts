import {
  buildQuestions,
  composeResult,
  STATE_INTRO,
} from "../core/solver";
import type { DecisionsResponse, SolveResult } from "../core/solver";
import {
  CHAT_SYSTEM_PROMPT,
  DEFAULT_AUDIO_MODEL,
  DEFAULT_MODELS,
  loadSolverSettings,
  providerConfigured,
} from "../core/settings";
import type { SolverSettings } from "../core/settings";

declare const process: { env: Record<string, string | undefined> };

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function num(v: unknown, fallback: number, clamp = true): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return clamp ? Math.min(1, Math.max(0, n)) : n;
}

function resultFromChatJson(
  settings: SolverSettings,
  parsed: Record<string, unknown>,
  raw: string
): SolveResult {
  const challengeType =
    typeof parsed.challengeType === "string" ? parsed.challengeType : "unknown";
  let targetBox: SolveResult["targetBox"] = null;
  const b = parsed.targetBox;
  if (typeof b === "object" && b !== null) {
    const box = b as Record<string, unknown>;
    const vals = [box.top, box.bottom, box.left, box.right].map((v) => num(v, 0));
    if (vals.every((v) => v > 0 || v === 0)) {
      targetBox = { top: vals[0], bottom: vals[1], left: vals[2], right: vals[3] };
    }
  }
  return {
    model: `${settings.provider}:${settings.model || DEFAULT_MODELS[settings.provider]}`,
    challengeType,
    typeConfidence: num(parsed.typeConfidence, 0),
    typeProbabilities: {},
    solvableProbability: num(parsed.solvableProbability, 0),
    complexityScore: num(parsed.complexityScore, 0, false),
    complexityBuckets: ["single interaction", "few interactions", "multi-stage"],
    confidence: num(parsed.confidence, 0),
    instructions:
      typeof parsed.instructions === "string" && parsed.instructions ? parsed.instructions : "—",
    answer: typeof parsed.answer === "string" && parsed.answer ? parsed.answer : "—",
    targetBox,
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "—",
    raw,
  };
}

async function solveOpenRouter(
  settings: SolverSettings,
  imageDataUrl: string,
  context: string
): Promise<SolveResult> {
  const model = settings.model || DEFAULT_MODELS.openrouter;
  const body = (includeBox: boolean) =>
    JSON.stringify({
      model,
      state: [
        context ? `${STATE_INTRO} Context: ${context}` : STATE_INTRO,
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
      questions: buildQuestions(includeBox),
    });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${settings.apiKey}`,
    "Content-Type": "application/json",
    "X-Title": "CaptchaLens",
  };

  const call = async (includeBox: boolean) => {
    const res = await fetch(DECISIONS_URL, {
      method: "POST",
      headers,
      body: body(includeBox),
    });
    return { status: res.status, data: (await res.json().catch(() => ({}))) as DecisionsResponse };
  };

  let { status, data } = await call(true);
  if (status !== 200 && /box/i.test(data.error?.message ?? `HTTP ${status}`)) {
    ({ status, data } = await call(false));
  }
  if (status !== 200) {
    throw new Error(data.error?.message ?? `OpenRouter HTTP ${status}`);
  }
  if (!data.answers || Object.keys(data.answers).length === 0) {
    throw new Error("Decision model returned no answers.");
  }
  return composeResult(model, data.answers, JSON.stringify(data.answers, null, 2));
}

async function solveGeminiDirect(
  settings: SolverSettings,
  imageDataUrl: string,
  context: string
): Promise<SolveResult> {
  const model = settings.model || DEFAULT_MODELS.gemini;
  const match = imageDataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Screenshot is not a base64 data URL.");
  const [, mime, data] = match;

  const res = await fetch(`${GEMINI_URL}/${model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${CHAT_SYSTEM_PROMPT}\n\n${context ? `Context: ${context}. ` : ""}Judge the challenge in this screenshot.` },
            { inline_data: { mime_type: mime, data } },
          ],
        },
      ],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? `Gemini HTTP ${res.status}`);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const parsed = extractJson(text);
  if (!parsed) throw new Error(`Gemini returned non-JSON output: ${text.slice(0, 200)}`);
  return resultFromChatJson(settings, parsed, text);
}

async function solveLocalChat(
  settings: SolverSettings,
  imageDataUrl: string,
  context: string
): Promise<SolveResult> {
  const model = settings.model || DEFAULT_MODELS.local;
  const base = settings.baseUrl.replace(/\/+$/, "");

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: context ? `Context: ${context}. Judge the challenge in this screenshot.` : "Judge the challenge in this screenshot." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? `Local provider HTTP ${res.status}`);
  const text = json.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(text);
  if (!parsed) throw new Error(`Local model returned non-JSON output: ${text.slice(0, 200)}`);
  return resultFromChatJson(settings, parsed, text);
}

export async function isConfigured(): Promise<boolean> {
  return providerConfigured(await loadSolverSettings());
}

export async function currentModelLabel(): Promise<string> {
  const s = await loadSolverSettings();
  return `${s.provider}:${s.model || DEFAULT_MODELS[s.provider]}`;
}

export async function solvePuzzle(
  imageDataUrl: string,
  context?: string
): Promise<SolveResult> {
  const settings = await loadSolverSettings();
  if (!providerConfigured(settings)) {
    throw new Error(
      `No API key configured for ${settings.provider}. Open settings and add credentials.`
    );
  }
  const ctx = context ?? "";
  switch (settings.provider) {
    case "openrouter":
      return solveOpenRouter(settings, imageDataUrl, ctx);
    case "gemini":
      return solveGeminiDirect(settings, imageDataUrl, ctx);
    case "local":
      return solveLocalChat(settings, imageDataUrl, ctx);
  }
}

const AUDIO_SYSTEM_PROMPT = `You are an audio captcha solver. The audio contains spoken characters, words, or digits, possibly with distortion or background noise. Transcribe exactly what is spoken. Respond with ONLY a JSON object: {"transcription": "exact transcription", "confidence": number between 0 and 1}. No markdown, no extra text.`;

export async function solveAudio(
  audioDataUrl: string,
  context?: string
): Promise<SolveResult> {
  const settings = await loadSolverSettings();
  if (!providerConfigured(settings)) {
    throw new Error(
      `No API key configured for ${settings.provider}. Open settings and add credentials.`
    );
  }

  const match = audioDataUrl.match(/^data:audio\/([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Audio is not a base64 data URL.");
  const [, format, data] = match;

  const model = settings.audioModel || DEFAULT_AUDIO_MODEL;
  if (settings.audioProvider !== "openrouter") {
    throw new Error(
      `Audio solving routes through OpenRouter chat (input_audio). Configure provider "openrouter" for audio, or capture audio yourself and use the OCR/typing flow.`
    );
  }

  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "CaptchaLens",
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${AUDIO_SYSTEM_PROMPT}${context ? ` Context: ${context}.` : ""}`,
            },
            { type: "input_audio", input_audio: { data, format } },
          ],
        },
      ],
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? `OpenRouter HTTP ${res.status}`);
  const text = json.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(text);
  const transcription =
    parsed && typeof parsed.transcription === "string"
      ? parsed.transcription
      : text.trim();
  if (!transcription) throw new Error("Audio model returned no transcription.");

  return {
    model: `openrouter:${model}`,
    challengeType: "audio",
    typeConfidence: 1,
    typeProbabilities: {},
    solvableProbability: 1,
    complexityScore: 0,
    complexityBuckets: ["single transcription"],
    confidence:
      parsed && typeof parsed.confidence === "number"
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.6,
    instructions: "Transcribe the audio captcha and submit the text.",
    answer: transcription,
    targetBox: null,
    reasoning: `audio transcription via ${model}`,
    raw: text,
  };
}
