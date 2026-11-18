# Contributing to CaptchaLens

Thanks for wanting to help. The codebase is deliberately small — the highest-value contributions are **challenge handlers**, and they're isolated by design: one file, one interface, no cross-dependencies.

## Adding a challenge handler (great first PR)

1. Copy any file in `src/handlers/` as a template — `altcha.ts` or `mcaptcha.ts` are the smallest examples.
2. Implement the `CaptchaHandler` interface:
   - `id` — unique slug (lowercase, hyphenated)
   - `vendor` / `name` — shown in the popup card
   - `signatures` — DOM selectors, script URLs, or `window` globals that identify the system
   - `classify` — optional: extract `variant` and `sitekey` for the popup card
3. Register it in `src/handlers/index.ts`.
4. `npm run typecheck && npm run build`, load `dist/` unpacked, and test against the live page.

Detection accuracy beats cleverness: a handler that fires only on strong signatures is worth more than one that guesses.

## Other areas

- **Decision engine** — the OpenRouter Decisions integration lives in `src/core/solver.ts` + `src/background/engine.ts`. Question sets, answer normalization, and provider dispatch are all typed.
- **E2E harnesses** — `scripts/e2e-*.mjs` drive real captchas headfully with recording. They read the OpenRouter key from `.env` (never hardcode keys).
- **Popup / options UI** — plain DOM, no framework.

## Ground rules

- No hardcoded API keys — everything routes through `.env` or `chrome.storage.sync` user settings.
- Keep handlers passive: detection and analysis only. No auto-bypass logic in detection handlers.
- One handler per PR keeps review fast.

## Dev quickstart

```bash
npm install
npm run build        # or: npm run watch
```

Then `chrome://extensions` → Developer mode → Load unpacked → `dist/`.
