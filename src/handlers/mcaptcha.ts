import type { CaptchaHandler } from "../core/types";

export const mcaptcha: CaptchaHandler = {
  id: "mcaptcha",
  vendor: "mCaptcha",
  name: "mCaptcha (PoW)",
  signatures: [
    { kind: "selector", value: 'iframe[src*="mcaptcha"]', label: "mcaptcha widget iframe" },
    { kind: "selector", value: ".mcaptcha__widget", label: "mcaptcha widget class" },
    { kind: "scriptSrc", value: "mcaptcha", label: "mcaptcha script" },
    { kind: "scriptSrc", value: "widget.glados.rocks", label: "glados widget host" },
    { kind: "globalVar", value: "mcaptcha", label: "window.mcaptcha" },
  ],
  classify(el, doc) {
    const widget =
      el.closest("[data-sitekey]") ?? doc.querySelector("[data-sitekey]");
    return {
      variant: "widget",
      sitekey: widget?.getAttribute("data-sitekey") ?? undefined,
    };
  },
};
