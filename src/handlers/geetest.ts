import type { CaptchaHandler } from "../core/types";

export const geetest: CaptchaHandler = {
  id: "geetest",
  vendor: "Geetest",
  name: "Geetest v3/v4",
  signatures: [
    { kind: "selector", value: ".geetest_holder", label: "geetest v3 holder" },
    { kind: "selector", value: ".geetest_box", label: "geetest v4 box" },
    { kind: "selector", value: "[class*='geetest']", label: "geetest widget class" },
    { kind: "scriptSrc", value: "api.geetest.com", label: "geetest v3 api script" },
    { kind: "scriptSrc", value: "gt4.js", label: "geetest v4 gt4.js script" },
    { kind: "globalVar", value: "initGeetest", label: "window.initGeetest (v3)" },
    { kind: "globalVar", value: "initGeetest4", label: "window.initGeetest4 (v4)" },
  ],
  classify(el, doc) {
    const v4 = el.matches(".geetest_box");
    return {
      variant: v4 ? "v4" : "v3",
      sitekey:
        el.closest("[data-captcha-id]")?.getAttribute("data-captcha-id") ??
        doc.querySelector("[data-captcha-id]")?.getAttribute("data-captcha-id") ??
        undefined,
    };
  },
};
