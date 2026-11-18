import { chromium } from "playwright";

function getKey() {
  try {
    const line = readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n").find((l) => l.startsWith("OPENROUTER_API_KEY"));
    if (line) return line.split("=")[1].trim();
  } catch {}
  throw new Error("OPENROUTER_API_KEY missing — add it to .env");
}
import { writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";

const KEY = getKey();
const MODEL = "typesafe/jev-1.14";
const T = new URL("../.tmp/", import.meta.url).pathname;
const EXT = new URL("../dist/", import.meta.url).pathname;
const ASSETS = new URL("../assets/", import.meta.url).pathname;
const VIDEO_DIR = `${T}video-click/`;

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

async function main() {
  mkdirSync(VIDEO_DIR, { recursive: true });
  rmSync(`${T}recaptcha-profile`, { recursive: true, force: true });

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
    await page.goto("https://2captcha.com/demo/clickcaptcha", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(5000);

    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await sleep(1200);
    const det = await popup.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const demo = tabs.find((t) => (t.url ?? "").includes("2captcha.com"));
      if (!demo) return "demo tab not found";
      const store = await chrome.storage.session.get({ detectionsByTab: {} });
      const list = (store.detectionsByTab ?? {})[demo.id] ?? [];
      return list.map((d) => `${d.name} (${d.vendor})`).join(" | ") || "no captcha system detected";
    });
    log("EXTENSION DETECTED:", det);
    await popup.close();

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
      ["This image is a ClickCaptcha challenge. At the top there are small example thumbnails and text like 'Select in this order:'. The main scene contains objects to click in that order. Identify each object's location.", { type: "image_url", image_url: { url: dataUrl } }],
      {
        bicycle_box: { type: "box", instructions: "Locate the bicycle in the main scene (not the small thumbnail icons)." },
        axe_box: { type: "box", instructions: "Locate the axe in the main scene (not the small thumbnail icons)." },
        key_box: { type: "box", instructions: "Locate the key in the main scene (not the small thumbnail icons)." },
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

    const bb = await img.boundingBox();
    const centers = {};
    for (const k of ["bicycle", "axe", "key"]) {
      const a = answers[`${k}_box`];
      if (a?.type === "box" && a.box) {
        centers[k] = {
          cx: bb.x + ((a.box.left + a.box.right) / 2) * bb.width,
          cy: bb.y + ((a.box.top + a.box.bottom) / 2) * bb.height,
          conf: a.confidence ?? 0,
        };
        log(`  ${k}: conf ${(centers[k].conf * 100).toFixed(0)}% → (${centers[k].cx.toFixed(0)}, ${centers[k].cy.toFixed(0)})`);
      } else log(`  ${k}: not located (${a?.type ?? "missing"})`);
    }

    const attempts = [order];
    for (const alt of ["bicycle-key-axe", "bicycle-axe-key", "key-bicycle-axe", "key-axe-bicycle", "axe-bicycle-key", "axe-key-bicycle"]) {
      if (alt !== order.join("-") && attempts.length < 4) attempts.push(alt.split("-"));
    }

    let resultText = "";
    for (let att = 0; att < attempts.length; att++) {
      const seq = attempts[att];
      if (att > 0) {
        log(`retrying with order: ${seq.join(" → ")}`);
        await page.locator('button:has-text("Reset")').first().click().catch(() => {});
        await sleep(900);
      }
      if (!seq.every((k) => centers[k])) {
        log("  skipping — an object in this order was not located");
        continue;
      }
      for (const k of seq) {
        await page.mouse.click(centers[k].cx, centers[k].cy);
        await sleep(700 + Math.floor(Math.random() * 300));
        log(`  clicked ${k}`);
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
      if (/solved correctly|success|correct/i.test(resultText) && !/incorrect/i.test(resultText)) break;
    }

    await sleep(1200);
    await page.screenshot({ path: `${T}click-final.png` });
    log("final screenshot saved");
  } finally {
    await ctx.close();
  }

  const videos = readdirSync(VIDEO_DIR).filter((f) => f.endsWith(".webm"));
  if (videos.length === 0) throw new Error("no video produced");
  mkdirSync(ASSETS, { recursive: true });
  execSync(`cp "${VIDEO_DIR}${videos[0]}" "${ASSETS}/clickcaptcha-e2e.webm"`);
  execSync(
    `ffmpeg -y -i "${ASSETS}/clickcaptcha-e2e.webm" -vf "fps=6,scale=560:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" -loop 0 "${ASSETS}/clickcaptcha-e2e.gif"`,
    { stdio: "pipe" }
  );
  log("assets written:", readdirSync(ASSETS).join(", "));
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
