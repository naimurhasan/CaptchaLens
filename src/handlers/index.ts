import { registerHandler } from "../core/registry";
import { recaptchaV2 } from "./recaptcha-v2";
import { recaptchaV3 } from "./recaptcha-v3";
import { turnstile } from "./turnstile";
import { hcaptcha } from "./hcaptcha";

export function registerBuiltinHandlers(): void {
  [recaptchaV2, recaptchaV3, turnstile, hcaptcha].forEach(registerHandler);
}
