import { chromium } from "playwright";

import { readFileSync } from "node:fs";

function getKey() {
  try {
    const line = readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n").find((l) => l.startsWith("OPENROUTER_API_KEY"));
    if (line) return line.split("=")[1].trim();
  } catch {}
  throw new Error("OPENROUTER_API_KEY missing — add it to .env");
}
import { writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const KEY = getKey();
const MODEL = "typesafe/jev-1.14";
const T = new URL("../.tmp/", import.meta.url).pathname;
const EXT = new URL("../dist/", import.meta.url).pathname;
const VIDEO_DIR = `${T}/video`;
const ASSETS = new URL("../assets/", import.meta.url).pathname;

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitTilesLoaded(challenge) {
  for (let i = 0; i < 20; i++) {
    try {
      const imgs = challenge.locator(".rc-imageselect-tile img");
      const n = await imgs.count();
      if (n > 0) {
        const states = await Promise.all(
          Array.from({ length: n }, (_, i) =>
            imgs.nth(i).evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false)
          )
        );
        if (states.every(Boolean)) return;
      }
    } catch {}
    await sleep(300);
  }
}

async function main() {
  mkdirSync(VIDEO_DIR, { recursive: true });
  if (existsSync(`${VIDEO_DIR}/recaptcha-e2e.webm`)) {
    for (const f of readdirSync(VIDEO_DIR)) {
      if (f.endsWith(".webm")) {
        try { execSync(`rm "${VIDEO_DIR}/${f}"`); } catch {}
      }
    }
  }

  const ctx = await chromium.launchPersistentContext(`${T}/recaptcha-profile`, {
    headless: false,
    viewport: { width: 1180, height: 920 },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
    recordVideo: { dir: VIDEO_DIR, size: { width: 1180, height: 920 } },
    slowMo: 120,
  });

  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 20000 });
    sw.on("console", (msg) => {
      if (msg.text().includes("[SW]")) log("SWLOG:", msg.text().slice(0, 100));
    });
    const extId = new URL(sw.url()).host;
    log("extension loaded:", extId);

    const seed = await ctx.newPage();
    await seed.goto(`chrome-extension://${extId}/options.html?provider=openrouter&key=${encodeURIComponent(KEY)}&model=${MODEL}`);
    await sleep(800);
    log("settings seeded:", await seed.textContent("#status"));
    await seed.close();

    const page = await ctx.newPage();
    page.on("console", (msg) => {
      const t = msg.text();
      if (t.includes("[CaptchaLens]")) log("CONTENT:", t.slice(0, 120));
    });
    await page.goto("https://2captcha.com/demo/recaptcha-v2", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(5000);
    console.log("frames:", page.frames().map((f) => f.url().slice(0, 90)).join(" | "));

    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await sleep(1200);
    const det = await popup.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const demo = tabs.find((t) => (t.url ?? "").includes("2captcha.com"));
      if (!demo) return "demo tab not found";
      const store = await chrome.storage.session.get({ detectionsByTab: {} });
      const list = (store.detectionsByTab ?? {})[demo.id] ?? [];
      return list.map((d) => `${d.name} (${d.vendor}) [${d.evidence.join("; ")}]`).join(" | ") || "none";
    });
    log("EXTENSION DETECTED:", det);
    await popup.close();

    const swStore = await sw.evaluate(async () => {
      await chrome.storage.session.set({ writeProbe: "ok-" + Date.now() % 10000 });
      const probe = (await chrome.storage.session.get("writeProbe")).writeProbe;
      const tabs = await chrome.tabs.query({});
      const store = await chrome.storage.session.get(null);
      return {
        probe,
        tabs: tabs.map((t) => ({ id: t.id, url: (t.url ?? "").slice(0, 60) })),
        store: JSON.stringify(store).slice(0, 400), logs: JSON.stringify(store.swLogs ?? []),
      };
    });
    log("SW TABS:", JSON.stringify(swStore.tabs));
    log("SW WRITE PROBE:", swStore.probe);
    log("SW STORE:", swStore.store);
    log("SW TRACE:", JSON.stringify(swStore.logs));

    const sig = await page.evaluate(() => ({
      iframeRecaptcha: document.querySelectorAll('iframe[src*="google.com/recaptcha"]').length,
      gDiv: document.querySelectorAll(".g-recaptcha[data-sitekey]").length,
      textarea: document.querySelectorAll("#g-recaptcha-response").length,
      apiJs: [...document.querySelectorAll("script[src]")].filter((s) => (s.src ?? "").includes("google.com/recaptcha/api.js")).length,
      grecaptcha: typeof window.grecaptcha,
    }));
    log("SIGNATURES:", JSON.stringify(sig));

    const anchor = page.frameLocator('iframe[src*="recaptcha/api2/anchor"]').first();
    await anchor.locator(".recaptcha-checkbox-border, .recaptcha-checkbox").first().click();
    log("checkbox clicked — waiting for challenge");

    const challenge = page.frameLocator('iframe[src*="bframe"]');
    await challenge.locator(".rc-imageselect-instructions").waitFor({ timeout: 30000 });
    log("image challenge appeared");

    let carry = null;
    let noPickStreak = 0;
    for (let round = 1; round <= 5; round++) {
      log(`--- round ${round} ---`);
      await waitTilesLoaded(challenge);
      await sleep(600);

      const boardHost = page.locator('iframe[src*="bframe"]').first();
      await boardHost.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(400);
      let bb = null;
      for (let attempt = 0; attempt < 4 && (!bb || bb.width < 50); attempt++) {
        bb = await boardHost.boundingBox();
        if (!bb || bb.width < 50) await sleep(900);
      }
      if (!bb || bb.width < 50) throw new Error("challenge iframe never rendered");
      const clip = {
        x: Math.max(0, bb.x),
        y: Math.max(0, bb.y),
        width: Math.min(bb.width, 1180 - Math.max(0, bb.x)),
        height: Math.min(bb.height, 920 - Math.max(0, bb.y)),
      };
      let shot;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          shot = await page.screenshot({ clip });
          break;
        } catch (e) {
          log("screenshot retry", attempt + 1, e.message.slice(0, 60));
          await sleep(800);
          const nb = await boardHost.boundingBox();
          if (nb) { bb = nb; clip.x = Math.max(0, bb.x); clip.y = Math.max(0, bb.y); clip.width = Math.min(bb.width, 1180 - clip.x); clip.height = Math.min(bb.height, 920 - clip.y); }
        }
      }
      if (!shot) throw new Error("board screenshot failed after retries");
      const dataUrl = "data:image/png;base64," + shot.toString("base64");
      writeFileSync(`${T}/challenge-r${round}.png`, shot);

      const tiles = challenge.locator(".rc-imageselect-tile");
      const domCount = await tiles.count();

      const st1 = await decide(
        ["Screenshot of an image-grid CAPTCHA challenge including its instruction banner at the top.", { type: "image_url", image_url: { url: dataUrl } }],
        {
          target: {
            type: "choice",
            instructions: "The challenge instruction is conveyed either by a text banner or by small example thumbnail images shown at the top of the challenge (look at the leftmost thumbnail image). Which object class do the instruction text or example thumbnails depict? Match the thumbnails against the criteria definitions.",
            criteria: {
              "traffic-light": "Traffic lights.", "bus": "Buses.", "crosswalk": "Crosswalks.",
              "fire-hydrant": "Fire hydrants.", "bicycle": "Bicycles.", "boat": "Boats.",
              "train": "Trains.", "bridge": "Bridges.", "stairs": "Stairs or steps.",
              "car": "Cars or taxis.", "motorcycle": "Motorcycles.", "tractor": "Tractors or farm vehicles.",
              "palm-tree": "Palm trees.", "chimney": "Chimneys.", "parking-meter": "Parking meters.",
              "patio": "Patios, porches or terraces.", "pool": "Swimming pools.",
              "sidewalk": "Sidewalks or pavements.", "road": "Roads or street signs.",
              "mountain": "Mountains or hills.", "animal": "Animals (cats, dogs etc.).",
              "other": "Some other object class the instruction depicts.",
              "unclear": "Neither instruction text nor example thumbnails visible.",
            },
          },
          grid_dims: {
            type: "choice",
            instructions: "What is the visual geometry of the tile grid shown?",
            criteria: { "3x3": "Three rows, three columns.", "4x4": "Four rows, four columns.", "4x2": "Four rows, two columns.", "other": "Different shape or not a grid." },
          },
        }
      );
      const target = st1.target?.choice ?? "other";
      const tConf = st1.target?.confidence ?? 0;
      const useTarget =
        (target === "unclear" || (target === "other" && tConf < 0.6)) && carry && noPickStreak < 2
          ? carry
          : target === "unclear" && !carry
            ? "other"
            : target;
      if (target !== "unclear" && tConf >= 0.6) carry = target;
      const dims = (st1.grid_dims?.choice ?? "other").split("x");
      const rows = Number(dims[0]) || Math.round(domCount / 3);
      const cols = Number(dims[1]) || 3;
      log(`stage 1 — target: ${useTarget}${target !== useTarget ? ` (carried from earlier; banner said ${target} @ ${(tConf * 100).toFixed(0)}%)` : ` @ ${(tConf * 100).toFixed(0)}%`}, grid ${rows}x${cols} (dom tiles: ${domCount})`);

      const q = {};
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          q[`r${r}c${c}`] = {
            type: "noul",
            instructions: `Does the tile at row ${r} of ${rows} (top-to-bottom), column ${c} of ${cols} (left-to-right) contain ${useTarget === "other" || useTarget === "unclear" ? "the object class the instruction asks to select" : `a ${useTarget}, or a substantial part of one`}? Judge only this one tile.`,
          };
        }
      }
      const st2 = await decide(
        [`Screenshot of an image-grid CAPTCHA. If a banner with example thumbnails is visible at the top, use it as the class reference. Target class: ${useTarget}. The grid is ${rows} rows by ${cols} columns. Judge each tile separately, tile by tile: does the tile contain the target class or a substantial part of one?`, { type: "image_url", image_url: { url: dataUrl } }],
        q
      );

      const picked = [];
      const probs = [];
      for (let r = 1; r <= rows; r++) {
        const line = [];
        for (let c = 1; c <= cols; c++) {
          const p = st2[`r${r}c${c}`]?.noul ?? 0;
          probs.push(p.toFixed(2));
          if (p >= 0.5) picked.push([r, c, p]);
        }
        log(`  row ${r}: ${line.length ? "" : ""}${probs.slice((r - 1) * cols, r * cols).join(" ")}`);
      }

      if (picked.length === 0) {
        noPickStreak++;
        if (noPickStreak >= 2) carry = null;
        log(`no tiles selected (streak ${noPickStreak}) — requesting a fresh challenge`);
        const reload = challenge.locator('button[title*="new challenge"], .rc-button-reload, button[title*="Get a new"]').first();
        try {
          await reload.click({ force: true, timeout: 4000 });
          await sleep(2500);
          const hasBoard = await challenge.locator(".rc-imageselect-instructions").count();
          if (hasBoard === 0) {
            await challenge.locator("#recaptcha-verify-button").click({ force: true }).catch(() => {});
            await sleep(2000);
          }
          const stillBoard = await challenge.locator(".rc-imageselect-instructions").count();
          if (stillBoard > 0) continue;
        } catch {
          log("reload button unavailable — verifying to advance");
        }
        await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height - 20).catch(() => {});
        await sleep(2000);
        continue;
      } else if (domCount === rows * cols) {
        for (const [r, c] of picked) {
          await tiles.nth((r - 1) * cols + (c - 1)).click();
          await sleep(500 + Math.floor(Math.random() * 400));
        }
        log(`clicked ${picked.length} tile(s) via DOM`);
      } else {
        const gridTop = bb.y + bb.height * 0.18;
        const gridLeft = bb.x + bb.width * 0.08;
        const gridH = bb.height * 0.74;
        const gridW = bb.width * 0.84;
        for (const [r, c] of picked) {
          const x = gridLeft + ((c - 0.5) / cols) * gridW;
          const y = gridTop + ((r - 0.5) / rows) * gridH;
          await page.mouse.click(x, y);
          await sleep(500 + Math.floor(Math.random() * 400));
        }
        log(`clicked ${picked.length} tile(s) via coordinates`);
      }
      await sleep(400);
      const verify = challenge.locator("#recaptcha-verify-button");
      try {
        await verify.click({ force: true, timeout: 4000 });
        log("verify clicked");
      } catch {
        await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height - 20);
        log("verify clicked via coordinates");
      }
      await sleep(2000);

      const solved = await anchor.locator(".recaptcha-checkbox-checked").count();
      const newBoard = await challenge.locator(".rc-imageselect-instructions").count();
      if (solved > 0) { log("checkbox green — recaptcha accepted"); break; }
      if (newBoard === 0) {
        log("challenge closed — re-clicking checkbox for a fresh one");
        carry = null;
        noPickStreak = 0;
        await sleep(1500);
        const unchecked = await anchor.locator(".recaptcha-checkbox-checked").count();
        if (unchecked === 0) {
          await anchor.locator(".recaptcha-checkbox-border, .recaptcha-checkbox").first().click();
          try {
            await challenge.locator(".rc-imageselect-instructions").waitFor({ timeout: 20000 });
            await waitTilesLoaded(challenge);
          } catch {}
        }
        continue;
      }
      log("new challenge round served");
    }

    const token = await page.evaluate(() => {
      const el = document.querySelector("#g-recaptcha-response");
      return el ? (el.value ?? "").length : -1;
    });
    log("token length:", token);

    await page.locator('button:has-text("Check")').first().click();
    await sleep(2500);
    const resultText = (await page.textContent("body")) ?? "";
    const visible = await page.evaluate(() =>
      [...document.querySelectorAll("div,span,p,strong")]
        .map((el) => (el.textContent ?? "").trim())
        .filter(
          (t) =>
            t.length > 0 &&
            t.length < 160 &&
            /verification|verif|solved|success|incorrect|error/i.test(t) &&
            !t.includes("function") &&
            !t.includes("e.getMessage")
        )
    );
    log("visible status texts:", [...new Set(visible)].slice(0, 6).join(" || "));

    await sleep(1500);
    await page.screenshot({ path: `${T}/final-state.png` });
    log("final screenshot saved");

    const endStore = await sw.evaluate(async () => JSON.stringify(await chrome.storage.session.get(null)).slice(0, 1400));
    log("SW STORE AT END:", endStore);
  } finally {
    await ctx.close();
  }

  const videos = readdirSync(VIDEO_DIR).filter((f) => f.endsWith(".webm"));
  if (videos.length === 0) throw new Error("no video produced");
  const webm = `${VIDEO_DIR}/${videos[0]}`;
  mkdirSync(ASSETS, { recursive: true });
  execSync(`cp "${webm}" "${ASSETS}/recaptcha-e2e.webm"`);
  execSync(
    `ffmpeg -y -i "${ASSETS}/recaptcha-e2e.webm" -vf "fps=6,scale=560:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" -loop 0 "${ASSETS}/recaptcha-e2e.gif"`,
    { stdio: "pipe" }
  );
  log("assets written:", readdirSync(ASSETS).join(", "));
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
