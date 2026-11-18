<div align="center">

# 🔍 CaptchaLens

**A Chrome extension that detects, identifies, and analyzes bot-detection challenges on any webpage — showing you exactly which system is present, where it lives in the DOM, and what triggered it.**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

<img src="assets/recaptcha-solved.gif" width="640" alt="CaptchaLens solving a live reCAPTCHA v2 demo end-to-end: detection, ensemble decisions, tile clicks, green checkbox, demo confirmation">

<em>Live solve — real reCAPTCHA v2 demo, zero human input: detect → ensemble decisions → tile clicks → green checkbox → demo confirms the token.</em>

[Why](#why-this-exists) · [Capabilities](#current-capabilities) · [Landscape](#the-landscape-of-bot-detection-challenges) · [Architecture](#architecture-planned) · [Install](#install-as-a-user) · [Benchmark](#benchmark-at-a-glance) · [Cost](#cost--time-vs-solving-services) · [Roadmap](#roadmap--todo) · [Contributing](#contributing)

</div>

---

## Why This Exists

**X-ray vision into bot-detection systems.**

| 👩‍💻 Developers | 🧪 QA engineers | 🔬 Researchers | 🙋 Humans |
|---|---|---|---|
| See which provider a site uses | Know why automation got flagged | Map anti-bot vendors across the web | Understand what's being asked and why |

> A **detector and analyzer** with an experimental AI decision layer. It reveals, then informs — no auto-bypass.

---

## Current Capabilities

### Layer 1 — Detection (stable)

- Full-DOM scan on load + debounced `MutationObserver` for lazy-loaded challenges, traversing shadow roots
- Built-in handlers with evidence reporting: **reCAPTCHA v2** (checkbox vs. invisible), **reCAPTCHA v3** (sitekey + execute hook), **hCaptcha**, **Cloudflare Turnstile** (variant from `data-appearance`)
- Popup cards per detection: vendor, variant, sitekey, frame origin, evidence list; toolbar badge with live count
- Per-tab session storage of detections

### Layer 2 — Decision engine (proof of concept, live-verified)

```mermaid
flowchart LR
  A["Solve with Gemini"] --> B["captureVisibleTab"] --> C["Service worker"] --> D["OpenRouter Decisions API<br/>POST /api/alpha/decisions"] --> E["Typed answers in popup"]
```

- Model from `.env` (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, injected at build time via esbuild `define`; currently `google/gemini-decision-1`)
- Question set: `challenge_type` (choice — image-grid / slider / rotation / press-hold / text / icon-click / checkbox / unknown), `solvable` (noul), `complexity` (score), `first_target` (box, with automatic fallback when the provider rejects it)
- Result card: per-question confidence bars, top-3 type probabilities, target-box coordinates, complexity readout, raw answers `<details>`
- Deterministic: same frame in → same distribution out; ~$0.00003–0.00015 per decision, ~1s latency

<details>
<summary><b>Full benchmark table (live, 2026-11-18)</b></summary>

| Test | gemini-decision-1 | jev-router | winner |
|---|---|---|---|
| Tile ID, traffic grid (truth 1,3,5,6) | 4/4, margins 0.91–0.93 / 0.08–0.10 | 4/4, margins **0.98–0.99 / 0.01** | jev (sharper) |
| Per-tile cost / classification confidence | $0.000146 / 75.7% | **$0.000042 / 98.0%** | jev |
| Box localization | unsupported (400) | supported, weak on synthetic frames (self-reported 6% conf) | open |
| Odd-one-out (truth: tile 4) | 1/1 @ 0.89 | 1/1 @ **0.99** | jev (sharper) |
| hCaptcha-style "select all squares" | 3/3 @ 0.92–0.94 | 3/3 @ **0.99** | jev (sharper) |
| Audio input (`input_audio`) | **accepted** (judged tone `has_speech=0.327`) | rejected | gemini (only) |

</details>

> **Routing:** typesafe migrated the legacy `jev-1.14` slug to `typesafe/jev-router` — use the router slug in configs. jev-router wins on vision (calibration, cost, box support); gemini-decision-1 is the only one that accepts audio. Planned: jev for vision, gemini for audio.

---

## The Landscape of Bot-Detection Challenges

<details>
<summary><b>Show all challenge types, vendors and detection signals</b></summary>

### 1. Interaction-Based (Gesture Verification)

| Challenge | How It Works | Vendors / Sites |
|---|---|---|
| **Press & Hold** | Hold a button 3–10s; pressure, timing jitter, and pointer entropy are scored | Walmart, Shopify checkout (HUMAN / PerimeterX) |
| **Slide Puzzle** | Drag a puzzle piece into a notch; trajectory is analyzed, not just the endpoint | Geetest v3 |
| **Image Rotation** | Rotate an object upright via slider | Arkose Labs (FunCaptcha) — Microsoft, Roblox |
| **Multi-Step Puzzles** | Matching, "odd one out", 3D object challenges in sequence | Arkose Enforce |
| **Slider-to-Fit** | Drag a slider until two image halves align | Geetest, common on CN/JP sites |

### 2. The Google Family

| Type | Mechanism |
|---|---|
| **reCAPTCHA v2 checkbox** | "I'm not a robot" — risk-scored; frequently passes with no challenge |
| **reCAPTCHA v2 image grid** | "Select all traffic lights" — 3×3 / 4×4 tile selection |
| **reCAPTCHA v2 audio** | Spoken-digit transcription fallback (largely deprecated) |
| **reCAPTCHA v3** | Fully invisible; emits a 0.0–1.0 score per action |
| **reCAPTCHA Enterprise** | v3 + per-action ML scoring, account-based |

### 3. Third-Party CAPTCHA Providers

| Provider | Style |
|---|---|
| **hCaptcha** | Checkbox + image-grid challenges (Cloudflare's former default) |
| **Cloudflare Turnstile** | Managed / non-interactive / invisible — usually zero user effort |
| **Geetest v4** | Icon selection, space-themed click challenges |
| **Friendly Captcha** | Proof-of-work solved in the background |
| **ALTCHA** | Open-source proof-of-work |
| **Anubis / mCaptcha** | PoW gates aimed at AI crawlers |

### 4. Enterprise Bot Managers (Invisible until they escalate)

| Platform | Escalation Behavior |
|---|---|
| **Cloudflare Bot Management** | JS challenge → managed challenge → interactive Turnstile |
| **Akamai Bot Manager** | Silent sensor-data collection; Telemetry pixel |
| **DataDome** | Device fingerprinting; slider captcha fallback |
| **HUMAN / PerimeterX** | Press-and-hold and slider challenges |
| **Kasada** | Heavily obfuscated JS + proof-of-work; minimal DOM footprint |
| **Imperva / Shape (F5) / Radware** | Signal encryption, invisible scoring |

### 5. Detection Signals (What Actually Decides)

- **Browser fingerprint** — canvas, WebGL, audio, fonts, `navigator.webdriver`, CDP artifacts
- **Behavioral** — mouse-movement entropy, keystroke cadence, event-timing jitter
- **Network** — IP reputation, JA3/JA4 TLS fingerprints, HTTP/2 frame fingerprints
- **Attestation** — Private Access Tokens / device attestation (Apple, Chrome pilot)


</details>

---

## Architecture (Planned)

```mermaid
flowchart LR
  subgraph EXT["Chrome Extension"]
    CS["Content Script<br/>(DOM scan)"] --> DE["Detector Engine<br/>(registry of handlers)"]
    CS --> MO["MutationObserver<br/>(dynamic loads)"]
    DE --> UI["Popup / Badge<br/>UI + DevTools"]
  end
```

Each supported system gets a **handler** — a self-contained module implementing a common interface:

```ts
interface CaptchaHandler {
  id: string;                    // "recaptcha-v2"
  vendor: string;                // "Google"
  name: string;                  // "reCAPTCHA v2"
  detect(root: Document): Detection | null;   // DOM / script / frame signatures
  classify?(el: Element): Variant;            // checkbox vs. image grid, etc.
  report?(det: Detection): HandlerReport;     // metadata for the popup UI
}
```

---

## Project Structure

| Path | What lives there |
|---|---|
| `build.mjs` · `.env` | esbuild bundler; injects `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` (gitignored `.env`) |
| `public/` | Manifest V3 (`host_permissions` for openrouter.ai), popup shell + solve button / result card |
| `src/core/` | types, handler registry, typed messages, solver question set, deep DOM traversal |
| `src/handlers/` | reCAPTCHA v2 / v3, Turnstile, hCaptcha + `registerBuiltinHandlers()` |
| `src/content/` | signature scanner, debounced MutationObserver, content entry |
| `src/background/` | OpenRouter Decisions client, service worker (per-tab storage, badge, solve) |
| `src/ui/popup/` | detection cards + solve flow (capture → solve → render) |
| `fixtures/` | `fake-widgets.html` — offline stand-ins for scanner testing |

## Development

```bash
npm install
npm run build        # or: npm run watch
```

Then `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`. Open `fixtures/fake-widgets.html` via a local server to see detections end-to-end without touching real vendor pages.

---

## Install as a User

1. Build the extension: `npm install && npm run build`
2. Open `chrome://extensions`, enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder
4. Pin CaptchaLens from the puzzle-piece menu — the badge shows how many bot-detection systems the current tab exposes
5. Click the icon → **settings** (bottom right) → pick a provider, paste your key, save

### Configure the solver (providers & credentials)

Credentials live in `chrome.storage.sync` — they are yours, entered at runtime, never baked into the build. The build-time `.env` is only a fallback default for OpenRouter.

| Provider | Model (default) | Credential | Good for |
|---|---|---|---|
| **OpenRouter** *(recommended)* | `typesafe/jev-router` | OpenRouter key — [openrouter.ai/keys](https://openrouter.ai/keys) | All vision captchas; Decisions API, typed answers, ~$0.0001/judgment |
| **Google Gemini** | `gemini-flash-latest` | AI Studio key — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Audio captchas; fallback vision via structured JSON |
| **Local** (OpenAI-compatible) | `qwen2.5vl` | none needed | Ollama / LM Studio / llama.cpp — zero cost, fully offline |

Default: **OpenRouter + `typesafe/jev-router`** (best calibration). Any OpenRouter Decisions-API model works — `google/gemini-decision-1`, `liquid/d1.2`, `cloudflare/clef-flash`, …

### Benchmark at a glance

```mermaid
---
config:
  xyChart:
    width: 760
    height: 360
  themeVariables:
    xyChart:
      plotColorPalette: "#6366f1, #f59e0b"
---
xychart-beta
  title "jev-router (indigo) vs gemini-decision-1 (amber) — probability"
  x-axis ["Tile selected", "Tile rejected ↓", "Odd-one-out", "hCaptcha-style", "Box (real photos)"]
  y-axis "Probability" 0 --> 1
  bar [0.99, 0.01, 0.99, 0.98, 0.74]
  bar [0.93, 0.10, 0.89, 0.76, 0]
```

| Metric | 🟣 jev-router | 🟠 gemini-decision-1 |
|---|---|---|
| tile-ID margin (selected prob) | **0.99** | 0.93 |
| tile-ID margin (rejected prob, lower = cleaner) | **0.01** | 0.10 |
| odd-one-out target prob | **0.99** | 0.89 |
| hCaptcha-style classification | **0.98** | 0.76 |
| box localization (real photos) | **0.74** | — unsupported |
| audio input | — rejected | ✅ **OK** |
| cost per 16-tile judgment | **~$0.00013** | ~$0.00026 |

---

### Layer 2.5 — Live end-to-end harness (real captchas, recorded)

`scripts/e2e-recaptcha.mjs` and `scripts/e2e-clickcaptcha.mjs` load the built extension into a headed Chromium (with video recording), seed credentials via URL params, then drive **real live captchas** through the same decision engine the extension uses:

| stage | what runs | proof |
|---|---|---|
| Detection | content script + handler registry on the live page | `reCAPTCHA v2 (Google) [recaptcha iframe; .g-recaptcha widget; response textarea; api.js script tag]`, sitekey + variant captured |
| Decision | OpenRouter Decisions API (jev-router + gemini-decision-1 ensemble) | `challenge_type` 99.9–100%, target class read from example-thumbnail banners, per-tile noul grids |
| Action | tile/coordinate clicks computed from typed answers | real clicks inside Google's cross-origin iframe + ordered clickcaptcha sequences |
| Verdict | parsed from the live page | **green checkbox — reCAPTCHA accepted, token issued** (`recaptcha-solved.gif`) |

<details>
<summary><b>How the live solve works — state machine, conditions and open gaps</b></summary>

**Real solve achieved on the live reCAPTCHA v2 demo** — recorded on the challenge page itself (per-page video capture, not a context dump). The harness plays the full dynamic-challenge mechanics Google serves:

- **Banner-driven two-mode state machine** — the banner text is read every round: `"Select all images with a bus — Click verify once there are none left."` → **UPDATED mode** (selections kept, only unchecked tiles judged) vs no-banner/new-grid → **FRESH mode** (full re-judge, selections cleared)
- **"None left" honoring** — when both models score every unchecked tile below threshold, the harness clicks verify exactly as the banner instructs instead of re-clicking checked tiles (which would deselect them)
- **Stuck ladder** — if the state is unchanged after a verify: round 1 borderline rescue at ≥0.38, round 2 at ≥0.30, round 3 select-all-remaining (continuation rounds are predominantly target tiles), round 4 clean session restart — no infinite hangs
- **Ensemble + carry** — jev-router and gemini-decision-1 judge every unchecked tile; union picks; class carried across rounds and re-read when the banner switches objects

Conditions that produced the solve, and what's still open:

1. **Stealth context** — patchright (playwright fork) meaningfully reduces Google's bot-flagging vs stock automated Chromium; stock contexts kept failing on risk scoring
2. **Ensemble decisions** — jev-router + gemini-decision-1 union on every tile catches spanning objects a single model misses
3. **Span-aware instructions** — dynamic grids split one object across tiles; "even a small sliver counts" instructions fixed our recall
4. **Multi-round carry** — dynamic challenges continue after correct verification; the carried class must re-read when Google switches objects mid-challenge (worked: bicycle → car)
5. **Open gaps** — cross-session reliability (solve achieved on session 1 here, but Google's risk scoring varies run to run), crop-and-verify pixel refinement for point-validation captchas, and the demo sitekey's intermittent `exceeding reCAPTCHA free quota` degradation

**ClickCaptcha: SOLVED.** The 2captcha ClickCaptcha demo passes on the first attempt — jev reads the thumbnail order, gemini-flash chat localizes each object with deterministic percentage coordinates, ordered clicks, demo confirms:

<p align="center">
  <img src="assets/clickcaptcha-solved.gif" width="640" alt="CaptchaLens solving the 2captcha ClickCaptcha demo: ordered clicks, demo passes — recorded on the challenge page">
</p>

The localization trick that cracked point-validation: the vision model reports object centers but silently invents its own canvas scale — the harness detects the per-mille/pixel drift, normalizes against the declared canvas, and lands clicks within tolerance. No crop-and-verify loop needed.

</details>

### Cost & Time vs Solving Services

reCAPTCHA v2 image challenge. Competitor figures are approximate list prices / reported medians; CaptchaLens figures are measured from live E2E sessions.

#### Where CaptchaLens wins

| Metric | 2captcha | Anti-Captcha | CapSolver | **CaptchaLens** |
|---|---|---|---|---|
| Account / signup required | ❌ yes | ❌ yes | ❌ yes | ✅ **no** |
| Minimum deposit | ❌ yes | ❌ yes | ❌ $6 | ✅ **$0** |
| Lowest price per solve | ~$0.0029 | ~$0.0020 | ~$0.0008 | ✅ **~$0.0003** (cloud) · **$0** (local model) |
| Runs fully offline | ❌ | ❌ | ❌ | ✅ **yes** (local model) |
| Screenshot sent to a solving company | ❌ yes | ❌ yes | ❌ yes | ✅ **never** — only your configured provider |
| Inspectable confidence per decision | ❌ | ❌ | ❌ | ✅ **typed answers + probabilities** |
| Open source | ❌ | ❌ | ❌ | ✅ **MIT** |

```mermaid
---
config:
  xyChart:
    width: 760
    height: 320
  themeVariables:
    xyChart:
      plotColorPalette: "#10b981, #6366f1, #94a3b8"
---
xychart-beta
  title "Price per solve (USD) — low (green) / typical (indigo) / high (gray)"
  x-axis ["2captcha", "Anti-Captcha", "CapSolver", "CaptchaLens"]
  y-axis "USD" 0 --> 0.003
  bar [0.0029, 0.0020, 0.0008, 0.0003]
  bar [0.0029, 0.0020, 0.0008, 0.0009]
  bar [0.0029, 0.0020, 0.0008, 0.0015]
```

> Typical **~$0.0009** per solve — about **3× cheaper** than 2captcha, **2× cheaper** than Anti-Captcha, roughly **on par** with CapSolver. Competitors show a single list price.

<details>
<summary><b>Full comparison — price range, time and trade-offs</b></summary>

| Service | Price per solve | Typical time | How it works |
|---|---|---|---|
| 2captcha (human workers) | ~$0.0029 | 20–45s | human farms, API round-trip |
| Anti-Captcha (human workers) | ~$0.0020 | 15–35s | human farms, API round-trip |
| CapSolver (AI service) | ~$0.0008 | ~2–9s | cloud AI, API round-trip + account |
| **CaptchaLens (local plugin)** | **~$0.0003–0.0015** | **10–60s** | in-browser decisions API, no account, no API round-trip |

Where services still win: **speed** (CapSolver ~2–9s) and **consistency** — human farms solve near-100% regardless of risk scoring; Google flags automated browsers no matter how good the answers are, so CaptchaLens solve rates depend on browser stealth.

</details>

---

## Automated Browsers (Playwright / Puppeteer / stealth)

CaptchaLens is Manifest V3 Chromium — it loads in any Chromium automation context. (Camoufox is Firefox-based: MV3 extensions do not run there without a WebExtensions port; use Chromium stealth forks like **patchright** or puppeteer-extra-stealth instead.)

### Quick start — load, set key, solve

```ts
import { chromium } from "patchright"; // or "playwright"

const extPath = "/absolute/path/to/captchalens/dist";
const ctx = await chromium.launchPersistentContext("", {
  headless: false,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
});

const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
const extId = new URL(sw.url()).host;

await sw.evaluate(() =>
  chrome.storage.sync.set({
    solverSettings: {
      provider: "openrouter",
      apiKey: "sk-or-v1-YOUR-KEY",
      model: "typesafe/jev-router",
    },
  })
);

const page = await ctx.newPage();
await page.goto("https://www.google.com/recaptcha/api2/demo");

const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.click("#solve");
await popup.waitForSelector(".solve-result .card", { timeout: 60000 });
console.log(await popup.textContent(".solve-result"));
```

| Setting | Values |
|---|---|
| `provider` | `openrouter` · `gemini` · `local` |
| `apiKey` | OpenRouter / AI Studio key (not needed for `local`) |
| `model` | e.g. `typesafe/jev-router`, `gemini-flash-latest`, `qwen2.5vl` |
| `baseUrl` | local only, e.g. `http://localhost:11434/v1` |

> Prefer no code for the key? Open `chrome-extension://<id>/options.html?provider=openrouter&key=sk-or-v1-…&model=typesafe/jev-router` — it saves on load.

<details>
<summary><b>More: Puppeteer, URL-param config and metrics</b></summary>

### Playwright / patchright

```ts
import { chromium } from "playwright"; // or "patchright" for stealth
import { chromium as pw } from "playwright-core";

const extPath = "/absolute/path/to/captchalens/dist";
const ctx = await chromium.launchPersistentContext("", {
  headless: false, // extensions require headed mode in Chromium
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
  ],
});

// find the extension ID from its service worker
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const extId = sw.url().match(/chrome-extension:\/\/([^/]+)/)![1];

// seed credentials with code — options.html saves URL params on load
const page = await ctx.newPage();
await page.goto(
  `chrome-extension://${extId}/options.html` +
    `?provider=openrouter&key=sk-or-v1-YOUR-KEY&model=typesafe/jev-router`
);

// solve the current tab: open the popup as a page and click the button
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.click("#solve");
await popup.waitForSelector(".solve-result .card", { timeout: 60000 });
const verdict = await popup.textContent(".solve-result");
console.log(verdict);
```

### Puppeteer

```js
import puppeteer from "puppeteer";

const extPath = "/absolute/path/to/captchalens/dist";
const browser = await puppeteer.launch({
  headless: false, // new headless (chrome --headless=new) supports extensions
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
  ],
});
const page = await browser.newPage();
// extension id is visible at chrome://extensions — or read it via the service worker target
const targets = browser.targets();
const sw = targets.find((t) => t.type() === "service_worker" && t.url().includes("chrome-extension://"));
const extId = new URL(sw.url()).host;
await page.goto(`chrome-extension://${extId}/options.html?provider=openrouter&key=sk-or-v1-…&model=typesafe/jev-router`);
```

### Selecting values with code (no UI)

The options page accepts URL params and saves them on load:

```
options.html?provider=openrouter|gemini|local
            &key=YOUR_KEY
            &model=typesafe/jev-router
            &baseUrl=http://localhost:11434/v1   (local only)
```

Equivalent direct storage write from an extension context (service worker / popup console):

```js
await chrome.storage.sync.set({
  solverSettings: {
    provider: "openrouter",
    apiKey: "sk-or-v1-…",
    model: "typesafe/jev-router",
    baseUrl: "http://localhost:11434/v1",
  },
});
```

### Metrics from automation

Every solve writes a structured card to `.solve-result` — scrape `.confidence`, `.vendor`/challenge type chip, and the `raw answers` `<details>` JSON for your own metric collection. The `solve` runtime message also returns the full `SolveOutcome` object if you drive the service worker directly.

</details>

---

## Roadmap / TODO

<details>
<summary><b>Phase 0 — Foundation</b> — 5/6 done</summary>

- [x] Scaffold Chrome extension (Manifest V3, TypeScript, esbuild)
- [x] Detector engine with handler registry
- [x] Content script: full-DOM scan + `MutationObserver` for lazy-loaded challenges
- [x] Popup UI: list detections on the current tab
- [x] Toolbar badge showing number of detected systems
- [ ] CI: lint, typecheck, build, and package (zip) workflow

</details>

<details>
<summary><b>Phase 1 — The Big Three</b> — 4/4 done</summary>

- [x] **Handler: reCAPTCHA v2** — `iframe[src*="google.com/recaptcha"]`, `.g-recaptcha`, `#g-recaptcha-response`; classify checkbox vs. invisible
- [x] **Handler: hCaptcha** — `iframe[src*="hcaptcha.com"]`, `.h-captcha`, `#h-captcha-response`
- [x] **Handler: Cloudflare Turnstile** — `.cf-turnstile`, `iframe[src*="challenges.cloudflare.com"]`; variant from `data-appearance`
- [x] **Handler: reCAPTCHA v3** — `grecaptcha.execute` hooking, `data-sitekey` + invisible widget detection

</details>

<details>
<summary><b>Phase 2 — Interactive & Puzzle Challenges</b> — 0/8 done</summary>

- [ ] **Handler: Arkose Labs (FunCaptcha)** — `iframe[src*="arkoselabs.com" / "funcaptcha.com"]`, `#funcaptcha`, `data-callback` presence
- [ ] **Handler: Geetest v3/v4** — `.geetest_holder`, `initGeetest` script signature; classify slide vs. icon vs. space variants
- [ ] **Handler: Press & Hold (HUMAN/PerimeterX)** — `iframe[src*="px-cdn.net" / "perimeterx.net"]`, `#px-captcha` hold-button detection
- [ ] **Handler: DataDome** — `iframe[src*="datadome.co"]`, `geo.captcha-delivery.com` script signature, slider challenge
- [ ] **Handler: Friendly Captcha** — `.frc-captcha`, proof-of-work worker detection
- [ ] **Handler: ALTCHA** — `altcha-widget` custom element
- [ ] **Handler: Anubis** — anubis-style PoW interstitial page detection
- [ ] **Handler: mCaptcha** — `__mcaptcha__` global / widget element

</details>

<details>
<summary><b>Phase 3 — Enterprise Bot Managers (Invisible Layer)</b> — 0/7 done</summary>

- [ ] **Handler: Cloudflare Bot Management** — challenge-platform interstitial page (`#challenge-running`, `Just a moment...`)
- [ ] **Handler: Akamai Bot Manager** — `_sec_` cookies, `px`/Akamai sensor script signatures, Telemetry pixel
- [ ] **Handler: Kasada** — obfuscated script entry-point detection (heuristic, minimal DOM footprint)
- [ ] **Handler: Imperva** — `incapsula` / `_incap_` cookie + script fingerprints
- [ ] **Handler: Shape / F5** — encrypted signal beacon detection
- [ ] **Handler: Radware** — bot-manager script fingerprints
- [ ] **Handler: Queue-it / virtual waiting rooms** — waiting-room interstitial detection (adjacent, useful signal)

</details>

<details>
<summary><b>Phase 3.5 — Decision Engine (new, proof of concept)</b> — 8/12 done</summary>

- [x] **Decisions API integration** — screenshot → OpenRouter `/api/alpha/decisions` → typed answers (`choice` / `noul` / `score`, `box` fallback)
- [x] **Popup solve flow** — captureVisibleTab → solve → structured result card (confidence bars, probabilities, raw answers)
- [x] **Env-configurable model** — `.env` injected at build time; runtime settings override (provider + key + model per user)
- [x] **Provider flexibility** — OpenRouter / Gemini direct / local OpenAI-compatible, credentials in `chrome.storage.sync`
- [x] **Model benchmark** — gemini vs. jev across tile ID, odd-one-out, hCaptcha-style shapes, box, audio (see Current Capabilities); **jev-router default** (migrated from legacy `jev-1.14` slug)
- [x] **Per-tile identification** — stage-2 per-cell `noul` requests (4/4 on synthetic, 4/4 on real 4×4 grid)
- [x] **Live E2E harness** — real reCAPTCHA v2 + 2captcha ClickCaptcha, recorded (`scripts/e2e-*.mjs`, GIFs above)
- [x] **Green solve on live reCAPTCHA v2** — 4-round dynamic challenge solved end-to-end (patchright stealth + jev/gemini ensemble + span-aware tiles + multi-round carry) — see `recaptcha-solved.gif`
- [x] **Green solve on live reCAPTCHA v2** — dynamic challenge solved end-to-end (patchright stealth + jev/gemini ensemble + span-aware tiles + multi-round carry) — see `recaptcha-solved.gif`
- [x] **ClickCaptcha solved** — ordered clickcaptcha demo passes first attempt via deterministic chat localization (percentage + per-mille drift normalization) — see `clickcaptcha-solved.gif`
- [ ] **Cross-session solve reliability** — measure success rate across runs; Google risk scoring varies run to run, needs success-rate measurement
- [ ] **Audio capture** — route audio captchas through the wired audio path (`solveAudio`) from content scripts

</details>

<details>
<summary><b>Phase 4 — Analysis & Insights</b> — 0/6 done</summary>

- [ ] Per-detection detail panel: vendor, variant, iframe origin, sitekey, triggered-at timestamp
- [ ] Legacy captchas: distorted-text, math questions, honeypot-field heuristics
- [ ] Signal visibility: show which fingerprints the page probes (canvas, WebGL, audio, `navigator.webdriver`)
- [ ] Export current-tab report as JSON
- [ ] Optional aggregate research mode (opt-in, local-only stats)
- [ ] Options page: toggle handlers, dark mode, badge preferences

</details>

<details>
<summary><b>Phase 5 — Polish & Release</b> — 0/4 done</summary>

- [ ] Comprehensive test suite (unit + fixture pages per handler)
- [ ] Screenshot assets and Chrome Web Store listing copy
- [ ] Documentation: writing your own handler (community contributions)
- [ ] Firefox (WebExtensions) port evaluation

</details>

---

## Contributing

Handlers are intentionally small and isolated — adding support for a new system is a great first PR. See the roadmap above for unclaimed handlers.

## License

MIT — see [LICENSE](LICENSE).
