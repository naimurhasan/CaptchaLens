import type { CaptchaHandler } from "../core/types";

export const recaptchaV3: CaptchaHandler = {
  id: "recaptcha-v3",
  vendor: "Google",
  name: "reCAPTCHA v3",
  signatures: [
    { kind: "selector", value: ".grecaptcha-badge", label: "score badge" },
    {
      kind: "scriptSrc",
      value: "recaptcha/api.js?render=",
      label: "render-parameter api.js",
    },
  ],
  classify() {
    return { variant: "invisible-score" };
  },
};
