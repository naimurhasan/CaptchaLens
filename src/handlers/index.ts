import { registerHandler } from "../core/registry";
import { recaptchaV2 } from "./recaptcha-v2";
import { recaptchaV3 } from "./recaptcha-v3";
import { turnstile } from "./turnstile";
import { hcaptcha } from "./hcaptcha";
import { arkoseFuncaptcha } from "./arkose-funcaptcha";
import { geetest } from "./geetest";
import { pressHold } from "./press-hold";
import { dataDome } from "./datadome";
import { friendlyCaptcha } from "./friendly-captcha";
import { altcha } from "./altcha";
import { anubis } from "./anubis";
import { mcaptcha } from "./mcaptcha";

export function registerBuiltinHandlers(): void {
  [
    recaptchaV2,
    recaptchaV3,
    turnstile,
    hcaptcha,
    arkoseFuncaptcha,
    geetest,
    pressHold,
    dataDome,
    friendlyCaptcha,
    altcha,
    anubis,
    mcaptcha,
  ].forEach(registerHandler);
}
