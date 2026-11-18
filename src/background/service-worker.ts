import type { RuntimeMessage, SolveOutcome } from "../core/messages";
import type { Detection } from "../core/types";
import { currentModelLabel, isConfigured, solvePuzzle } from "./engine";

interface DetectionsByTab {
  [tabId: number]: Detection[];
}

void chrome.storage.session.set({ swVersion: "v3-serialized-save" });

let saveQueue: Promise<void> = Promise.resolve();

async function swTrace(line: string): Promise<void> {
  try {
    const store = await chrome.storage.session.get({ swLogs: [] });
    const logs = store.swLogs as string[];
    logs.push(`${Date.now() % 100000} ${line}`);
    await chrome.storage.session.set({ swLogs: logs.slice(-30) });
  } catch {}
}

async function save(tabId: number, detections: Detection[]): Promise<void> {
  if (detections.length === 0) {
    void swTrace(`skip empty tab=${tabId}`);
    return;
  }
  void swTrace(`save tab=${tabId} n=${detections.length}`);
  const run = async (): Promise<void> => {
    const store = await chrome.storage.session.get({ detectionsByTab: {} });
    const byTab = store.detectionsByTab as DetectionsByTab;
    byTab[tabId] = detections;
    await chrome.storage.session.set({ detectionsByTab: byTab });
  };
  saveQueue = saveQueue.then(run, run);
  await saveQueue;
}

async function load(tabId: number): Promise<Detection[]> {
  const store = await chrome.storage.session.get({ detectionsByTab: {} });
  const byTab = store.detectionsByTab as DetectionsByTab;
  return byTab[tabId] ?? [];
}

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, sender, sendResponse) => {
  console.log(
    `[SW] msg=${msg.type} frame=${sender.frameId} tab=${sender.tab?.id} payload=${(msg as { payload?: unknown[] }).payload?.length ?? "-"}`
  );
  if (msg.type === "detections" && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    void save(tabId, msg.payload);
    void chrome.action.setBadgeText({
      tabId,
      text: msg.payload.length > 0 ? String(msg.payload.length) : "",
    });
    return false;
  }

  if (msg.type === "getDetections") {
    void load(msg.tabId).then(sendResponse);
    return true;
  }

  if (msg.type === "solve") {
    void (async (): Promise<SolveOutcome> => {
      try {
        const result = await solvePuzzle(msg.imageDataUrl, msg.context);
        return { ok: true, result };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!(await isConfigured())) return { ok: false, error: message };
        return { ok: false, error: `${await currentModelLabel()} → ${message}` };
      }
    })().then(sendResponse);
    return true;
  }

  if (msg.type === "getEngineInfo") {
    void currentModelLabel().then((label) => sendResponse({ label }));
    return true;
  }

  return false;
});
