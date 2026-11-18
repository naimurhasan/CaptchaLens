import { getHandlers } from "../core/registry";
import type { Detection } from "../core/types";
import { queryAllDeep, scriptUrls, currentFrameOrigin } from "../core/dom";

export function scanDocument(doc: Document): Detection[] {
  const scripts = scriptUrls(doc);
  const origin = currentFrameOrigin();
  const detections: Detection[] = [];

  for (const handler of getHandlers()) {
    const evidence: string[] = [];
    let matchedEl: Element | null = null;

    for (const sig of handler.signatures) {
      if (sig.kind === "selector") {
        const found = queryAllDeep(doc, sig.value);
        if (found.length > 0) {
          evidence.push(sig.label);
          matchedEl ??= found[0];
        }
      } else if (sig.kind === "scriptSrc") {
        if (scripts.some((src) => src.includes(sig.value))) {
          evidence.push(sig.label);
        }
      } else if (sig.kind === "globalVar") {
        if (sig.value in globalThis) evidence.push(sig.label);
      }
    }

    if (evidence.length === 0) continue;

    const classified =
      matchedEl && handler.classify
        ? handler.classify(matchedEl, doc)
        : {};

    detections.push({
      handlerId: handler.id,
      vendor: handler.vendor,
      name: handler.name,
      variant: classified.variant,
      sitekey: classified.sitekey,
      frameOrigin: origin,
      evidence,
      detectedAt: Date.now(),
    });
  }

  return detections;
}
