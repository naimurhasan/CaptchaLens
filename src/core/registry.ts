import type { CaptchaHandler } from "./types";

const handlers = new Map<string, CaptchaHandler>();

export function registerHandler(handler: CaptchaHandler): void {
  handlers.set(handler.id, handler);
}

export function getHandlers(): CaptchaHandler[] {
  return [...handlers.values()];
}
