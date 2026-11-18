export interface DecisionAnswer {
  type: "noul" | "choice" | "score" | "box" | "refusal";
  noul?: number;
  choice?: string;
  probabilities?: Record<string, number>;
  score?: number;
  legend?: Record<string, string>;
  box?: { top: number; bottom: number; left: number; right: number };
  confidence?: number;
}

export interface DecisionsResponse {
  id?: string;
  model?: string;
  provider?: string;
  answers?: Record<string, DecisionAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
  error?: { message?: string };
}

export interface SolveResult {
  model: string;
  challengeType: string;
  typeConfidence: number;
  typeProbabilities: Record<string, number>;
  solvableProbability: number;
  complexityScore: number;
  complexityBuckets: string[];
  confidence: number;
  instructions: string;
  answer: string;
  targetBox: { top: number; bottom: number; left: number; right: number } | null;
  reasoning: string;
  raw: string;
}

export const CHALLENGE_TYPES = {
  "image-grid": "Select-all-tiles grid (traffic lights, buses, crosswalks).",
  slider: "Drag a piece or slider to align or complete an image.",
  rotation: "Rotate an object upright.",
  "press-hold": "Press and hold a button for several seconds.",
  text: "Type distorted text or digits.",
  "icon-click": "Click specific icons or shapes in order.",
  checkbox: "Simple 'I am not a robot' checkbox.",
  unknown: "No challenge visible or unrecognizable.",
} as const;

export const COMPLEXITY_BUCKETS = [
  "Single interaction: one click, tap, or hold.",
  "Few interactions: 2-5 steps.",
  "Multi-stage: many steps or sequential challenges.",
];

export const STATE_INTRO =
  "Screenshot of a web page showing a bot-detection challenge (CAPTCHA puzzle). Judge the challenge from what is visible.";

export const FIRST_TARGET_BOX = {
  type: "box" as const,
  instructions:
    "Locate the primary interactive element the user must interact with first (a tile, the checkbox, the slider handle).",
};

export function buildQuestions(includeBox: boolean): Record<string, unknown> {
  const questions: Record<string, unknown> = {
    challenge_type: {
      type: "choice",
      instructions: "Which type of challenge is shown in the screenshot?",
      criteria: CHALLENGE_TYPES,
    },
    solvable: {
      type: "noul",
      instructions:
        "Can the challenge be answered from this single screenshot alone?",
    },
    complexity: {
      type: "score",
      instructions: "How many interactions does solving require?",
      criteria: COMPLEXITY_BUCKETS,
    },
  };
  if (includeBox) questions.first_target = FIRST_TARGET_BOX;
  return questions;
}

const INSTRUCTIONS_BY_TYPE: Record<string, string> = {
  "image-grid":
    "Select all tiles matching the prompt, then hit verify. Grids change between rounds — capture each state.",
  slider:
    "Drag the slider handle until the puzzle piece aligns with the notch in the background image.",
  rotation: "Rotate the object upright using the slider or arrow controls.",
  "press-hold": "Press and hold the button until the progress ring completes.",
  text: "Type the distorted characters shown in the challenge image.",
  "icon-click": "Click the specified icons or shapes in the required order.",
  checkbox: "Click the 'I'm not a robot' checkbox and wait for the risk check.",
  unknown: "No challenge confidently identified in this frame.",
};

export function composeResult(
  model: string,
  answers: Record<string, DecisionAnswer>,
  raw: string
): SolveResult {
  const type = answers.challenge_type?.type === "choice" ? answers.challenge_type : null;
  const solvable = answers.solvable?.type === "noul" ? answers.solvable : null;
  const complexity = answers.complexity?.type === "score" ? answers.complexity : null;
  const box = answers.first_target?.type === "box" ? answers.first_target.box ?? null : null;
  const refusal = Object.values(answers).some((a) => a.type === "refusal");

  const challengeType = type?.choice ?? "unknown";
  const typeConfidence = type?.confidence ?? 0;
  const solvableProbability = solvable?.noul ?? 0;

  const confidences = [
    type?.confidence,
    solvable?.confidence,
    complexity?.confidence,
  ].filter((c): c is number => typeof c === "number");
  const aggregate = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;

  const complexityScore = complexity?.score ?? 0;
  const buckets = COMPLEXITY_BUCKETS.map((b, i) => `${i}: ${b}`);

  const instructions =
    INSTRUCTIONS_BY_TYPE[challengeType] ?? INSTRUCTIONS_BY_TYPE.unknown;

  const answerParts = [
    `${challengeType} (${(typeConfidence * 100).toFixed(1)}% confidence)`,
    `solvable from this frame: ${(solvableProbability * 100).toFixed(0)}%`,
  ];
  if (box) {
    answerParts.push(
      `first target at left ${(box.left * 100).toFixed(0)}%, top ${(box.top * 100).toFixed(0)}% of image`
    );
  }
  if (refusal) answerParts.push("some questions were refused by the provider");

  const reasoning = [
    `challenge_type=${challengeType} (p=${typeConfidence.toFixed(3)})`,
    `solvable=${solvableProbability.toFixed(3)}`,
    `complexity=${complexityScore.toFixed(2)}/${COMPLEXITY_BUCKETS.length - 1}`,
    box ? `box=[${Object.values(box).map((v) => v.toFixed(2)).join(", ")}]` : "box=unavailable",
  ].join(" | ");

  return {
    model,
    challengeType,
    typeConfidence,
    typeProbabilities: type?.probabilities ?? {},
    solvableProbability,
    complexityScore,
    complexityBuckets: buckets,
    confidence: aggregate,
    instructions,
    answer: answerParts.join(" — "),
    targetBox: box,
    reasoning,
    raw,
  };
}
