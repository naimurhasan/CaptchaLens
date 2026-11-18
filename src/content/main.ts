import { registerBuiltinHandlers } from "../handlers";
import { scanDocument } from "./scanner";
import { observeMutations } from "./observer";

registerBuiltinHandlers();

function report(): void {
  const detections = scanDocument(document);
  console.log(
    "[CaptchaLens] scan:",
    detections.length,
    "detections in",
    location.href.slice(0, 60)
  );
  chrome.runtime
    .sendMessage({ type: "detections", payload: detections })
    .catch((err) =>
      console.warn("[CaptchaLens] send failed:", String(err).slice(0, 80))
    );
}

report();
observeMutations(report);
