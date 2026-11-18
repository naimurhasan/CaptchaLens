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
const OCR_MODEL = "google/gemini-2.5-flash-lite";
const T = new URL("../.tmp/", import.meta.url).pathname;
const EXT = new URL("../dist/", import.meta.url).pathname;
const ASSETS = new URL("../assets/", import.meta.url).pathname;
const VIDEO_DIR = `${T}video-normal/`;

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ocrImage(dataUrl) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Title": "CaptchaLens-E2E" },
    body: JSON.stringify({
      model: OCR_MODEL,
      max_tokens: 40,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "This is a CAPTCHA image with distorted text. Read the text exactly. Output ONLY the characters, nothing else. Preserve case if visible." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`OCR ${res.status}: ${data.error.message}`);
  const text = (data.choices?.[0]?.message?.content ?? "").trim().replace(/[^A-Za-z0-9]/g, "");
  return { text, cost: data.usage?.cost, model: data.model };
}

async function main() {
  mkdirSync(VIDEO_DIR, { recursive: true });
  rmSync(`${T}normal-profile`, { recursive: true, force: true });

  const ctx = await chromium.launchPersistentContext(`${T}normal-profile`, {
    headless: false,
    viewport: { width: 1180, height: 920 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    recordVideo: { dir: VIDEO_DIR, size: { width: 1180, height: 920 } },
    slowMo: 120,
  });

  let solved = false;
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
    await page.goto("https://2captcha.com/demo/normal", { waitUntil: "domcontentloaded", timeout: 60000 });
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

    const img = page.locator("._captchaImage_rrn3u_9").first();
    const field = page.locator("._captchaField_rrn3u_5 input").first();
    const checkBtn = page.locator('button:has-text("Check")').first();

    for (let attempt = 1; attempt <= 3 && !solved; attempt++) {
      log(`--- attempt ${attempt} ---`);
      await sleep(1500);

      const shot = await img.screenshot();
      const dataUrl = "data:image/png;base64," + shot.toString("base64");
      writeFileSync(`${T}normal-challenge-a${attempt}.png`, shot);

      const { text, cost, model } = await ocrImage(dataUrl);
      log(`OCR (${model}, $${cost}): "${text}"`);
      if (!text) {
        log("empty OCR — reloading for a new image");
        await page.reload({ waitUntil: "domcontentloaded" });
        await sleep(4000);
        continue;
      }

      await field.fill("");
      await field.click();
      await field.type(text, { delay: 90 });
      await sleep(400);
      await checkBtn.click();
      await sleep(2500);

      const status = await page.evaluate(() => {
        const texts = [...document.querySelectorAll("div,span,p,strong,b")]
          .map((el) => (el.textContent ?? "").trim())
          .filter((t) => t.length > 0 && t.length < 140 && /solv|correct|success|wrong|fail|error|invalid|try again/i.test(t) && !t.includes("function") && !t.includes("getMessage"));
        return [...new Set(texts)].slice(0, 5).join(" || ");
      });
      log("RESULT:", status || "no status text found");

      if (/solved|success|correct/i.test(status ?? "") && !/incorrect|wrong|invalid/i.test(status ?? "")) {
        solved = true;
        log("*** CAPTCHA SOLVED ***");
        break;
      }
      if (attempt < 3) {
        log("wrong answer — reloading for a fresh image");
        await page.reload({ waitUntil: "domcontentloaded" });
        await sleep(4000);
      }
    }

    await sleep(1500);
    await page.screenshot({ path: `${T}normal-final.png` });
    log(solved ? "final state: SOLVED" : "final state: not solved");
  } finally {
    await ctx.close();
  }

  const videos = readdirSync(VIDEO_DIR).filter((f) => f.endsWith(".webm"));
  if (videos.length === 0) throw new Error("no video produced");
  mkdirSync(ASSETS, { recursive: true });
  const name = solved ? "normal-solved" : "normal-attempt";
  execSync(`cp "${VIDEO_DIR}${videos[0]}" "${ASSETS}/${name}.webm"`);
  execSync(
    `ffmpeg -y -i "${ASSETS}/${name}.webm" -vf "fps=6,scale=560:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" -loop 0 "${ASSETS}/${name}.gif"`,
    { stdio: "pipe" }
  );
  log("assets written:", readdirSync(ASSETS).filter((f) => f.startsWith("normal")).join(", "));
  if (!solved) process.exit(2);
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
