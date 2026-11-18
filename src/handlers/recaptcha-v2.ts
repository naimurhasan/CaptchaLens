import type { CaptchaHandler } from "../core/types";

export const recaptchaV2: CaptchaHandler = {
  id: "recaptcha-v2",
  vendor: "Google",
  name: "reCAPTCHA v2",
  signatures: [
    {
      kind: "selector",
      value: 'iframe[src*="google.com/recaptcha"]',
      label: "recaptcha iframe",
    },
    {
      kind: "selector",
      value: ".g-recaptcha[data-sitekey]",
      label: ".g-recaptcha widget",
    },
    { kind: "selector", value: "#g-recaptcha-response", label: "response textarea" },
    {
      kind: "scriptSrc",
      value: "google.com/recaptcha/api.js",
      label: "api.js script tag",
    },
    { kind: "globalVar", value: "grecaptcha", label: "window.grecaptcha" },
  ],
  classify(el, doc) {
    const widget = el.matches(".g-recaptcha")
      ? el
      : doc.querySelector(".g-recaptcha");
    return {
      variant:
        widget?.getAttribute("data-size") === "invisible"
          ? "invisible"
          : "checkbox",
      sitekey: widget?.getAttribute("data-sitekey") ?? undefined,
    };
  },
};
