import type { CaptchaHandler } from "../core/types";

export const anubis: CaptchaHandler = {
  id: "anubis",
  vendor: "Anubis",
  name: "Anubis (PoW gate)",
  signatures: [
    { kind: "selector", value: "#anubis_challenge", label: "anubis challenge form" },
    { kind: "selector", value: "#anubis_success", label: "anubis success badge" },
    { kind: "scriptSrc", value: "within.website/x/cmd/anubis", label: "anubis PoW script" },
    { kind: "scriptSrc", value: "/.within.website/x/anubis", label: "anubis api path" },
    { kind: "selector", value: 'meta[name="anubis-status"]', label: "anubis-status meta tag" },
  ],
  classify() {
    return { variant: "proof-of-work" };
  },
};
