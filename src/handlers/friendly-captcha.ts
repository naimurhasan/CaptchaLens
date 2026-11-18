import type { CaptchaHandler } from "../core/types";

export const friendlyCaptcha: CaptchaHandler = {
  id: "friendly-captcha",
  vendor: "Friendly Captcha",
  name: "Friendly Captcha (PoW)",
  signatures: [
    { kind: "selector", value: ".frc-captcha", label: ".frc-captcha widget" },
    { kind: "selector", value: "friendly-captcha", label: "friendly-captcha element" },
    { kind: "scriptSrc", value: "friendlycaptcha", label: "friendlycaptcha script" },
    { kind: "scriptSrc", value: "friendly-pow", label: "friendly-pow worker script" },
    { kind: "globalVar", value: "friendlyChallenge", label: "window.friendlyChallenge" },
  ],
  classify(el, doc) {
    const widget = el.matches(".frc-captcha") ? el : doc.querySelector(".frc-captcha");
    return {
      variant: widget?.getAttribute("data-solution-field-name") ? "standard" : "eu",
      sitekey: widget?.getAttribute("data-sitekey") ?? undefined,
    };
  },
};
