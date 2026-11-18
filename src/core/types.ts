export type SignatureKind = "selector" | "scriptSrc" | "globalVar";

export interface HandlerSignature {
  kind: SignatureKind;
  value: string;
  label: string;
}

export interface Classification {
  variant?: string;
  sitekey?: string;
}

export interface CaptchaHandler {
  id: string;
  vendor: string;
  name: string;
  signatures: HandlerSignature[];
  classify?(el: Element, doc: Document): Classification;
}

export interface Detection {
  handlerId: string;
  vendor: string;
  name: string;
  variant?: string;
  sitekey?: string;
  frameOrigin?: string;
  evidence: string[];
  detectedAt: number;
}
