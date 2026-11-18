import { chromium } from "patchright";
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";

const T = new URL("../.tmp/", import.meta.url).pathname;
const EXT = new URL("../dist/", import.meta.url).pathname;
const ASSETS = new URL("../assets/", import.meta.url).pathname;
const VIDEO_DIR = `${T}video-click/`;

function getKey() {
  try {
    const line = readFileSync(new URL("../.env", import.meta.url), "utf8")
      .split("\n")
      .find((l) => l.startsWith("OPENROUTER_API_KEY"));
    if (line) return line.split("=")[1].trim();
  } catch {}
  throw new Error("OPENROUTER_API_KEY missing — add it to .env");
}

const KEY = getKey();
const MODEL = "typesafe/jev-1.14";

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function decide(state, questions) {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Title": "CaptchaLens-E2E" },
    body: JSON.stringify({ model: MODEL, state, questions }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`decisions ${res.status}: ${data.error?.message}`);
  log(`  decision call ${Date.now() - t0}ms $${data.usage?.cost}`);
  return data.answers;
}

async function chatLocate(dataUrl) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Title": "CaptchaLens-E2E" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      max_tokens: 150,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: 'This challenge image contains three objects: a bicycle, an axe, and a key in the main scene (ignore the small example thumbnails at the very top). For each object, give its center position as PERCENTAGES of the image width and height, where [0,0] is top-left and [100,100] is bottom-right. Output ONLY JSON: {"bicycle":{"x":number,"y":number},"axe":{"x":number,"y":number},"key":{"x":number,"y":number}} where x and y are 0-100.' },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message?.slice(0, 100));
  const content = d.choices?.[0]?.message?.content?.trim() ?? "";
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in chat localization: " + content.slice(0, 80));
  log(`  chat localization: ${m[0].replace(/\s+/g, " ").slice(0, 120)}`);
  return JSON.parse(m[0]);
}

async function main() {
  mkdirSync(VIDEO_DIR, { recursive: true });
  rmSync(`${T}click-profile`, { recursive: true, force: true });
  let demoVideoPath = null;
  let solved = false;

  const ctx = await chromium.launchPersistentContext(`${T}click-profile`, {
    headless: false,
    viewport: { width: 1180, height: 920 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    recordVideo: { dir: VIDEO_DIR, size: { width: 1180, height: 920 } },
    slowMo: 120,
  });

  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 20000 });
    const extId = new URL(sw.url()).host;
    log("extension loaded:", extId);

    const seed = await ctx.newPage();
    await seed.goto(`chrome-extension://${extId}/options.html?provider=openrouter&key=${encodeURIComponent(KEY)}&model=${MODEL}`);
    await sleep(800);
    await seed.close();

    const page = await ctx.newPage();
    const demoVideo = page.video();
    await page.goto("https://2captcha.com/demo/clickcaptcha", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(5000);

    const img = page.locator("[class*='captchaWidgetContainer'] img").first();
    const ib = await img.boundingBox();
    const pad = 60;
    const clip = {
      x: Math.max(0, ib.x - pad),
      y: Math.max(0, ib.y - pad),
      width: ib.width + pad * 2,
      height: ib.height + pad * 2,
    };
    let shot = await page.screenshot({ clip });
    writeFileSync(`${T}click-challenge.png`, shot);
    execSync(`sips -Z 512 "${T}click-challenge.png" --out "${T}click-challenge.png"`, { stdio: "pipe" });
    shot = readFileSync(`${T}click-challenge.png`);
    const dataUrl = "data:image/png;base64," + shot.toString("base64");

    const answers = await decide(
      ["This image is a ClickCaptcha challenge. At the top there are small example thumbnails and text like 'Select in this order:'. The main scene contains objects to click in that order. Identify which objects and their order.", { type: "image_url", image_url: { url: dataUrl } }],
      {
        click_order: {
          type: "choice",
          instructions: "The small example thumbnails at the top show which objects to click, left to right = click order. Which order do the thumbnails depict?",
          criteria: {
            "bicycle-key-axe": "First bicycle, then key, then axe.",
            "bicycle-axe-key": "First bicycle, then axe, then key.",
            "key-bicycle-axe": "First key, then bicycle, then axe.",
            "key-axe-bicycle": "First key, then axe, then bicycle.",
            "axe-bicycle-key": "First axe, then bicycle, then key.",
            "axe-key-bicycle": "First axe, then key, then bicycle.",
          },
        },
      }
    );

    const order = (answers.click_order?.choice ?? "bicycle-key-axe").split("-");
    const oConf = answers.click_order?.confidence ?? 0;
    log(`click order: ${order.join(" → ")} @ ${(oConf * 100).toFixed(0)}%`);

    const centers = {};
    for (const k of order) {
      const loc = await chatLocate(dataUrl);
      if (typeof loc?.[k]?.x === "number" && typeof loc?.[k]?.y === "number") {
        let fx = loc[k].x;
        let fy = loc[k].y;
        if (fx > 100 || fy > 100) { fx /= 10; fy /= 10; }
        fx = Math.min(100, Math.max(0, fx));
        fy = Math.min(100, Math.max(0, fy));
        centers[k] = {
          cx: clip.x + (fx / 100) * clip.width,
          cy: clip.y + (fy / 100) * clip.height,
        };
        log(`  ${k} → page point (${centers[k].cx.toFixed(0)}, ${centers[k].cy.toFixed(0)})`);
      } else log(`  ${k}: localization missing`);
    }

    let resultText = "";
    for (const k of order) {
      if (!centers[k]) { log(`  skipping ${k} — not located`); continue; }
      await page.mouse.click(centers[k].cx, centers[k].cy);
      log(`  clicked ${k}`);
      await sleep(700 + Math.floor(Math.random() * 300));
    }

    await page.locator('button:has-text("Check")').first().click();
    await sleep(2500);

    resultText = await page.evaluate(() => {
      const texts = [...document.querySelectorAll("div,span,p,strong")]
        .map((el) => (el.textContent ?? "").trim())
        .filter((t) => t.length > 0 && t.length < 120 && /solved|correct|success|wrong|incorrect|error|try again/i.test(t) && !t.includes("function"));
      return [...new Set(texts)].slice(0, 4).join(" || ");
    });
    log("RESULT:", resultText || "no status text found");
    solved = /passed successfully|solved correctly|success/i.test(resultText) && !/incorrect/i.test(resultText);

    await sleep(1200);
    await page.screenshot({ path: `${T}click-final.png` });
    log("final screenshot saved");
    await page.close();
    demoVideoPath = await demoVideo.path();
  } finally {
    await ctx.close();
  }

  if (!demoVideoPath) throw new Error("no demo page video produced");
  mkdirSync(ASSETS, { recursive: true });
  execSync(`cp "${demoVideoPath}" "${ASSETS}/clickcaptcha-e2e.webm"`);
  log("RESULT VERDICT:", solved ? "SOLVED" : "NOT SOLVED");
  if (!solved) process.exit(2);
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
