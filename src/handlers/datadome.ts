import type { CaptchaHandler } from "../core/types";

export const dataDome: CaptchaHandler = {
  id: "datadome",
  vendor: "DataDome",
  name: "DataDome Slider",
  signatures: [
    { kind: "selector", value: 'iframe[src*="geo.captcha-delivery.com"]', label: "captcha-delivery iframe" },
    { kind: "selector", value: 'iframe[src*="interstitial.captcha-delivery.com"]', label: "datadome interstitial iframe" },
    { kind: "selector", value: ".dd-captcha", label: ".dd-captcha container" },
    { kind: "scriptSrc", value: "captcha-delivery.com", label: "captcha-delivery script" },
    { kind: "globalVar", value: "ddOptions", label: "window.ddOptions" },
  ],
  classify(_el, doc) {
    const interstitial = doc.querySelector('iframe[src*="interstitial."]');
    return {
      variant: interstitial ? "interstitial" : "slider",
      sitekey:
        doc.querySelector("[data-dd-sitekey]")?.getAttribute("data-dd-sitekey") ??
        undefined,
    };
  },
};
