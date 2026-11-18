import type { Detection } from "../../core/types";
import type { RuntimeMessage, SolveOutcome } from "../../core/messages";

function card(d: Detection): HTMLElement {
  const el = document.createElement("article");
  el.className = "card";

  const title = document.createElement("div");
  title.className = "card-title";

  const name = document.createElement("span");
  name.textContent = d.name;

  const vendor = document.createElement("span");
  vendor.className = "vendor";
  vendor.textContent = d.vendor;

  title.append(name, vendor);

  el.append(title);

  if (d.variant) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = d.variant;
    el.append(chip);
  }

  if (d.sitekey) {
    const key = document.createElement("div");
    key.className = "sitekey";
    key.textContent = `sitekey: ${d.sitekey}`;
    el.append(key);
  }

  const list = document.createElement("ul");
  list.className = "evidence";
  for (const item of d.evidence) {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  }
  el.append(list);

  return el;
}

function confidenceRow(label: string, value: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "confidence";

  const text = document.createElement("span");
  text.textContent = `${label} ${Math.round(value * 100)}%`;

  const bar = document.createElement("div");
  bar.className = "confidence-bar";
  const fill = document.createElement("div");
  fill.className = "confidence-fill";
  fill.style.width = `${Math.round(value * 100)}%`;
  bar.append(fill);

  row.append(text, bar);
  return row;
}

function labeled(label: string, text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "answer";
  const strong = document.createElement("strong");
  strong.textContent = label;
  const body = document.createElement("div");
  body.textContent = text;
  el.append(strong, body);
  return el;
}

function solveCard(o: SolveOutcome): HTMLElement {
  const container = document.createElement("section");
  container.className = "solve-result";

  if (!o.ok) {
    const err = document.createElement("article");
    err.className = "card";
    err.textContent = `Solve failed: ${o.error}`;
    container.append(err);
    return container;
  }

  const r = o.result;
  const el = document.createElement("article");
  el.className = "card";

  const title = document.createElement("div");
  title.className = "card-title";

  const name = document.createElement("span");
  name.textContent = "Gemini decision";

  const type = document.createElement("span");
  type.className = "vendor";
  type.textContent = r.challengeType;

  title.append(name, type);
  el.append(title);

  const chip = document.createElement("span");
  chip.className = r.solvableProbability >= 0.5 ? "chip solved-yes" : "chip solved-no";
  chip.textContent =
    r.solvableProbability >= 0.5
      ? "solvable from this frame"
      : "needs more frames";
  el.append(chip);

  el.append(confidenceRow("overall", r.confidence));
  el.append(confidenceRow("type match", r.typeConfidence));
  el.append(confidenceRow("solvable", r.solvableProbability));

  el.append(labeled("challenge", r.instructions));
  el.append(labeled("answer", r.answer));

  if (r.targetBox) {
    const b = r.targetBox;
    el.append(
      labeled(
        "first target",
        `left ${(b.left * 100).toFixed(1)}% → right ${(b.right * 100).toFixed(1)}%, top ${(b.top * 100).toFixed(1)}% → bottom ${(b.bottom * 100).toFixed(1)}% of the screenshot`
      )
    );
  }

  const topTypes = Object.entries(r.typeProbabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (topTypes.length > 0) {
    const list = document.createElement("ul");
    list.className = "actions";
    for (const [key, p] of topTypes) {
      const li = document.createElement("li");
      li.textContent = `${key}: ${(p * 100).toFixed(1)}%`;
      list.append(li);
    }
    el.append(list);
  }

  const complexity = document.createElement("div");
  complexity.className = "reasoning";
  complexity.textContent = `complexity: ${r.complexityScore.toFixed(2)} / ${r.complexityBuckets.length - 1} — ${r.complexityBuckets[Math.round(r.complexityScore)] ?? ""}`;
  el.append(complexity);

  const reasoning = document.createElement("div");
  reasoning.className = "reasoning";
  reasoning.textContent = r.reasoning;
  el.append(reasoning);

  const details = document.createElement("details");
  details.className = "raw";
  const summary = document.createElement("summary");
  summary.textContent = `raw answers (${r.model})`;
  const pre = document.createElement("pre");
  pre.textContent = r.raw;
  details.append(summary, pre);
  el.append(details);

  container.append(el);
  return container;
}

function render(detections: Detection[]): void {
  const container = document.getElementById("detections")!;
  const count = document.getElementById("count")!;
  container.replaceChildren();

  if (detections.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No bot-detection challenges detected on this tab.";
    container.append(empty);
  } else {
    for (const d of detections) container.append(card(d));
  }

  count.textContent =
    detections.length > 0 ? `${detections.length} detected` : "";
}

function setStatus(text: string, isError = false): void {
  const status = document.getElementById("solve-status")!;
  status.textContent = text;
  status.className = isError ? "solve-status error" : "solve-status";
}

async function solveCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null || tab.windowId == null) {
    setStatus("No active tab.", true);
    return;
  }

  const button = document.getElementById("solve") as HTMLButtonElement;
  button.disabled = true;
  setStatus("Capturing screenshot…");

  let dataUrl: string;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
  } catch (err) {
    setStatus(
      `Capture failed: ${err instanceof Error ? err.message : String(err)}`,
      true
    );
    button.disabled = false;
    return;
  }

  setStatus("Asking decision engine…");

  chrome.runtime.sendMessage(
    { type: "solve", imageDataUrl: dataUrl } satisfies RuntimeMessage,
    (outcome: SolveOutcome | undefined) => {
      button.disabled = false;
      if (!outcome) {
        setStatus("No response from background worker.", true);
        return;
      }
      setStatus(outcome.ok ? "" : outcome.error, !outcome.ok);
      const resultHost = document.getElementById("solve-result")!;
      resultHost.replaceChildren(solveCard(outcome));
    }
  );
}

async function main(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return;

  document
    .getElementById("solve")
    ?.addEventListener("click", () => void solveCurrentTab());

  document
    .getElementById("open-settings")
    ?.addEventListener("click", () => void chrome.runtime.openOptionsPage());

  chrome.runtime.sendMessage(
    { type: "getEngineInfo" },
    (info: { label?: string } | undefined) => {
      if (info?.label) {
        const el = document.getElementById("engine-info");
        if (el) el.textContent = info.label;
      }
    }
  );

  chrome.runtime.sendMessage(
    { type: "getDetections", tabId: tab.id },
    (res: Detection[] | undefined) => render(res ?? [])
  );
}

void main();
