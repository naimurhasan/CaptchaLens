import type { CaptchaHandler } from "../core/types";

export const pressHold: CaptchaHandler = {
  id: "press-hold-perimeterx",
  vendor: "HUMAN (PerimeterX)",
  name: "Press & Hold",
  signatures: [
    { kind: "selector", value: "#px-captcha", label: "#px-captcha hold button" },
    { kind: "selector", value: 'iframe[src*="px-cdn.net"]', label: "px-cdn iframe" },
    { kind: "scriptSrc", value: "px-cdn.net", label: "perimeterx script" },
    { kind: "scriptSrc", value: "perimeterx", label: "perimeterx script (alt)" },
    { kind: "globalVar", value: "_pxAppId", label: "window._pxAppId" },
  ],
  classify(_el, doc) {
    const px = doc.querySelector("#px-captcha");
    return {
      variant: px ? "press-and-hold" : "embedded",
      sitekey:
        doc.querySelector("[data-app-id]")?.getAttribute("data-app-id") ?? undefined,
    };
  },
};
