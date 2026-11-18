import type { CaptchaHandler } from "../core/types";

export const turnstile: CaptchaHandler = {
  id: "cloudflare-turnstile",
  vendor: "Cloudflare",
  name: "Turnstile",
  signatures: [
    { kind: "selector", value: ".cf-turnstile", label: ".cf-turnstile widget" },
    {
      kind: "selector",
      value: 'iframe[src*="challenges.cloudflare.com"]',
      label: "challenges.cloudflare.com iframe",
    },
    {
      kind: "scriptSrc",
      value: "challenges.cloudflare.com/turnstile",
      label: "turnstile script tag",
    },
  ],
  classify(el) {
    const appearance = el.getAttribute("data-appearance") ?? "always";
    return { variant: appearance, sitekey: el.getAttribute("data-sitekey") ?? undefined };
  },
};
