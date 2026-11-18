import type { CaptchaHandler } from "../core/types";

export const arkoseFuncaptcha: CaptchaHandler = {
  id: "arkose-funcaptcha",
  vendor: "Arkose Labs",
  name: "FunCaptcha (Arkose)",
  signatures: [
    { kind: "selector", value: 'iframe[src*="arkoselabs.com"]', label: "arkoselabs iframe" },
    { kind: "selector", value: 'iframe[src*="funcaptcha.com"]', label: "funcaptcha iframe" },
    { kind: "selector", value: "#funcaptcha", label: "#funcaptcha root" },
    { kind: "selector", value: "[data-callback]", label: "data-callback attribute" },
    { kind: "scriptSrc", value: "arkoselabs.com", label: "arkoselabs script" },
    { kind: "globalVar", value: "arkose", label: "window.arkose" },
  ],
  classify(_el, doc) {
    const variantEl =
      doc.querySelector('iframe[src*="funcaptcha.com"]') ??
      doc.querySelector('iframe[src*="arkoselabs.com"]');
    return {
      variant: variantEl ? "interactive" : "standard",
      sitekey: variantEl?.getAttribute("data-key") ?? undefined,
    };
  },
};
