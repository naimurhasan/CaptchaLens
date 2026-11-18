import type { CaptchaHandler } from "../core/types";

export const hcaptcha: CaptchaHandler = {
  id: "hcaptcha",
  vendor: "hCaptcha",
  name: "hCaptcha",
  signatures: [
    { kind: "selector", value: ".h-captcha[data-sitekey]", label: ".h-captcha widget" },
    { kind: "selector", value: 'iframe[src*="hcaptcha.com"]', label: "hcaptcha iframe" },
    { kind: "selector", value: "#h-captcha-response", label: "response textarea" },
    { kind: "scriptSrc", value: "hcaptcha.com/1/api.js", label: "api.js script tag" },
    { kind: "globalVar", value: "hcaptcha", label: "window.hcaptcha" },
  ],
  classify(el, doc) {
    const widget = el.matches(".h-captcha") ? el : doc.querySelector(".h-captcha");
    return {
      variant:
        widget?.getAttribute("data-size") === "invisible"
          ? "invisible"
          : "checkbox",
      sitekey: widget?.getAttribute("data-sitekey") ?? undefined,
    };
  },
};
