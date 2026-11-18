import type { CaptchaHandler } from "../core/types";

export const altcha: CaptchaHandler = {
  id: "altcha",
  vendor: "ALTCHA",
  name: "ALTCHA (PoW)",
  signatures: [
    { kind: "selector", value: "altcha-widget", label: "altcha-widget element" },
    { kind: "selector", value: "altcha", label: "altcha element" },
    { kind: "scriptSrc", value: "altcha", label: "altcha script" },
    { kind: "globalVar", value: "altcha", label: "window.altcha" },
  ],
  classify(el) {
    return {
      variant: el.matches("altcha-widget") ? "web-component" : "element",
      sitekey:
        el.getAttribute("challengeurl") ??
        el.getAttribute("challenge-url") ??
        undefined,
    };
  },
};
