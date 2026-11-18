import { chromium } from "patchright";

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
const MODELS = ["typesafe/jev-1.14", "google/gemini-decision-1"];
const T = new URL("../.tmp/", import.meta.url).pathname;
const EXT = new URL("../dist/", import.meta.url).pathname;
const ASSETS = new URL("../assets/", import.meta.url).pathname;
const VIDEO_DIR = `${T}video-v2s/`;

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function decide(model, state, questions) {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Title": "CaptchaLens-E2E" },
    body: JSON.stringify({ model, state, questions }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${model} ${res.status}: ${data.error?.message}`);
  log(`  [${model.split("/")[1]}] ${Date.now() - t0}ms $${data.usage?.cost}`);
  return data.answers;
}

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

async function humanClick(page, x, y) {
  await page.mouse.move(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8, { steps: 12 + Math.floor(Math.random() * 8) });
  await sleep(120 + Math.floor(Math.random() * 160));
  await page.mouse.click(x, y);
  await sleep(450 + Math.floor(Math.random() * 350));
}

const TARGET_CRITERIA = {
  "traffic-light": "Traffic lights.", "bus": "Buses.", "crosswalk": "Crosswalks.",
  "fire-hydrant": "Fire hydrants.", "bicycle": "Bicycles.", "boat": "Boats.",
  "train": "Trains.", "bridge": "Bridges.", "stairs": "Stairs or steps.",
  "car": "Cars or taxis.", "motorcycle": "Motorcycles.", "tractor": "Tractors or farm vehicles.",
  "palm-tree": "Palm trees.", "chimney": "Chimneys.", "parking-meter": "Parking meters.",
  "patio": "Patios, porches or terraces.", "pool": "Swimming pools.",
  "sidewalk": "Sidewalks or pavements.", "road": "Roads or street signs.",
  "mountain": "Mountains or hills.", "animal": "Animals (cats, dogs etc.).",
  "other": "Some other object class depicted in the examples.",
  "unclear": "No instruction text or example thumbnails visible.",
};

async function stage1(state) {
  const [a, b] = await Promise.all([
    decide(MODELS[0], state, {
      target: {
        type: "choice",
        instructions: "The instruction is conveyed by text or by small example thumbnail images at the top of the challenge (look at the leftmost thumbnail). Which object class do they depict?",
        criteria: TARGET_CRITERIA,
      },
      grid_dims: {
        type: "choice",
        instructions: "What is the visual geometry of the tile grid shown?",
        criteria: { "3x3": "Three rows, three columns.", "4x4": "Four rows, four columns.", "4x2": "Four rows, two columns.", "other": "Different shape or not a grid." },
      },
    }),
    decide(MODELS[1], state, {
      target: {
        type: "choice",
        instructions: "The instruction is conveyed by text or by small example thumbnail images at the top of the challenge (look at the leftmost thumbnail). Which object class do they depict?",
        criteria: TARGET_CRITERIA,
      },
    }),
  ]);
  const tA = a.target?.choice, tB = b.target?.choice;
  const cA = a.target?.confidence ?? 0, cB = b.target?.confidence ?? 0;
  let target, agree = false;
  if (tA === tB && tA !== "unclear") { target = tA; agree = true; }
  else target = cA >= cB ? tA : tB;
  const dims = (a.grid_dims?.choice ?? "other").split("x");
  return { target, agree, cA, cB, rows: Number(dims[0]) || 3, cols: Number(dims[1]) || 3 };
}

async function ensembleTiles(dataUrl, targetLabel, rows, cols, skip) {
  const q = {};
  for (let r = 1; r <= rows; r++)
    for (let c = 1; c <= cols; c++) {
      if (skip.has(`${r},${c}`)) continue;
      q[`r${r}c${c}`] = {
        type: "noul",
        instructions: `reCAPTCHA dynamic grids often SPAN one object across several tiles. Does ANY part of a ${targetLabel} appear in the tile at row ${r} of ${rows}, column ${c} of ${cols}? Even a small corner or sliver counts. Judge only this one tile.`,
      };
    }
  if (Object.keys(q).length === 0) return { picks: [], jev: {}, gem: {} };
  const prompts = [
    `Screenshot of an image-grid CAPTCHA (reCAPTCHA dynamic style). Instruction/class: ${targetLabel} (if a banner with example thumbnails is visible, it is the class reference). Grid: ${rows}x${cols}. Judge every tile separately.`,
    `Image-grid CAPTCHA. Target object: ${targetLabel}. Grid: ${rows} rows x ${cols} columns. For each tile decide: is any part of the target object visible in that tile?`,
  ];
  const [jev, gem] = await Promise.all([
    decide(MODELS[0], [prompts[0], { type: "image_url", image_url: { url: dataUrl } }], q),
    decide(MODELS[1], [prompts[1], { type: "image_url", image_url: { url: dataUrl } }], q),
  ]);
  const picks = [];
  const scores = new Map();
  let grid = "";
  for (let r = 1; r <= rows; r++) {
    const line = [];
    for (let c = 1; c <= cols; c++) {
      if (skip.has(`${r},${c}`)) { line.push("selected"); continue; }
      const pj = jev[`r${r}c${c}`]?.noul ?? 0;
      const pg = gem[`r${r}c${c}`]?.noul ?? 0;
      scores.set(`${r},${c}`, Math.max(pj, pg));
      const picked = pj >= 0.45 || pg >= 0.55;
      if (picked) picks.push([r, c, Math.max(pj, pg)]);
      line.push(`${pj.toFixed(2)}/${pg.toFixed(2)}${picked ? "*" : ""}`);
    }
    grid += `  row ${r}: ${line.join("  ")}\n`;
  }
  log(grid + `  → ensemble picks: ${picks.map(([r, c]) => `r${r}c${c}`).join(", ") || "NONE"}`);
  return { picks, scores };
}

async function sameGridCheck(prevDataUrl, curDataUrl) {
  const answers = await decide(MODELS[0], [
    "You are given two screenshots of a reCAPTCHA image challenge taken before and after the user clicked verify.",
    { type: "image_url", image_url: { url: prevDataUrl } },
    { type: "image_url", image_url: { url: curDataUrl } },
  ], {
    same_grid: {
      type: "noul",
      instructions: "Is the underlying tile grid scene the SAME in both screenshots, with some tiles now shown as selected/checkmarked and some tiles showing new images? Answer false if the entire scene/grid was replaced with completely different images.",
    },
  });
  return (answers.same_grid?.noul ?? 0) >= 0.5;
}

async function main() {
  mkdirSync(VIDEO_DIR, { recursive: true });
  rmSync(`${T}v2s-profile`, { recursive: true, force: true });

  const ctx = await chromium.launchPersistentContext(`${T}v2s-profile`, {
    headless: false,
    viewport: { width: 1180, height: 920 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    recordVideo: { dir: VIDEO_DIR, size: { width: 1180, height: 920 } },
    slowMo: 100,
  });

  let solved = false;
  let solvedAtVideoEnd = false;
  let demoVideoPath = null;
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 20000 });
    const extId = new URL(sw.url()).host;
    log("extension loaded:", extId);

    const seed = await ctx.newPage();
    await seed.goto(`chrome-extension://${extId}/options.html?provider=openrouter&key=${encodeURIComponent(KEY)}&model=${MODELS[0]}`);
    await sleep(800);
    await seed.close();

    const page = await ctx.newPage();
    const demoVideo = page.video();
    await page.goto("https://2captcha.com/demo/recaptcha-v2", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(5000);

    const det = await sw.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const demo = tabs.find((t) => (t.url ?? "").includes("2captcha.com"));
      if (!demo) return "demo tab not found";
      const store = await chrome.storage.session.get({ detectionsByTab: {} });
      const list = (store.detectionsByTab ?? {})[demo.id] ?? [];
      return list.map((d) => `${d.name} (${d.vendor}) [${d.evidence.join("; ")}]`).join(" | ") || "none";
    });
    log("EXTENSION DETECTED:", det);

    const anchor = page.frameLocator('iframe[src*="recaptcha/api2/anchor"]').first();
    const challenge = page.frameLocator('iframe[src*="bframe"]');

    for (let session = 1; session <= 2 && !solved; session++) {
      log(`===== SESSION ${session} =====`);
      await sleep(1500);
      try {
        await anchor.locator(".recaptcha-checkbox-border, .recaptcha-checkbox").first().click({ timeout: 15000 });
      } catch {
        log("checkbox not clickable — ending session");
        break;
      }
      try {
        await challenge.locator(".rc-imageselect-instructions").waitFor({ timeout: 25000 });
      } catch {
        const checked = await anchor.locator(".recaptcha-checkbox-checked").count();
        if (checked > 0) { log("checkbox passed without challenge!"); solved = true; }
        else { log("challenge did not appear — ending session"); }
        break;
      }
      await waitTilesLoaded(challenge);

      let target = null;
      let rows = 3;
      let cols = 3;
      let clickedPositions = [];
      let carry = null;
      let noPickStreak = 0;

      for (let round = 1; round <= 8 && !solved; round++) {
        log(`--- session ${session} round ${round} ---`);
        const boardHost = page.locator('iframe[src*="bframe"]').first();
        await boardHost.scrollIntoViewIfNeeded().catch(() => {});
        await waitTilesLoaded(challenge);
        await sleep(600);

        let banner = "";
        try {
          banner = (await challenge.locator(".rc-imageselect-instructions").innerText().catch(() => "")) ?? "";
        } catch {}
        const bannerFlat = banner.replace(/\s+/g, " ");
        log(`banner: "${bannerFlat.slice(0, 90)}"`);

        const ib = await boardHost.boundingBox();
        if (!ib || ib.width < 50) { log("no board — ending session"); break; }
        const clip = { x: Math.max(0, ib.x), y: Math.max(0, ib.y), width: Math.min(ib.width, 1180 - Math.max(0, ib.x)), height: Math.min(ib.height, 920 - Math.max(0, ib.y)) };
        let shot = null;
        for (let a = 0; a < 3 && !shot; a++) {
          try { shot = await page.screenshot({ clip }); }
          catch (e) { log("shot retry:", e.message.slice(0, 50)); await sleep(800); }
        }
        if (!shot) break;
        const dataUrl = "data:image/png;base64," + shot.toString("base64");
        writeFileSync(`${T}v2s-s${session}-r${round}.png`, shot);

        const state = [
          "Screenshot of a web page region showing a reCAPTCHA v2 image challenge. Judge it.",
          { type: "image_url", image_url: { url: dataUrl } },
        ];

        let picks;
        if (round === 1 || !target) {
          const st1 = await stage1(state);
          const tConf = Math.max(st1.cA, st1.cB);
          target =
            (st1.target === "unclear" || (st1.target === "other" && tConf < 0.6)) && carry && noPickStreak < 2
              ? carry
              : st1.target;
          if (st1.target !== "unclear" && tConf >= 0.6) carry = st1.target;
          rows = Math.min(4, Math.max(2, st1.rows));
          cols = Math.min(4, Math.max(2, st1.cols));
          log(`stage 1 — target: ${target}${st1.agree ? " (both models agree)" : ` [conf ${st1.cA.toFixed(2)}/${st1.cB.toFixed(2)}]`}, grid ${rows}x${cols}`);
          picks = (await ensembleTiles(dataUrl, target, rows, cols, new Set())).picks;
        } else {
          // in-place replacement re-check: judge ONLY the clicked positions
          const q = {};
          for (const [r, c] of clickedPositions) {
            q[`p${r}_${c}`] = {
              type: "noul",
              instructions: `This tile was just replaced with a NEW image after verify. Does the new image at row ${r} of ${rows}, column ${c} of ${cols} contain a ${target} or a substantial part of one? Answer true only if the new image must be clicked again.`,
            };
          }
          const answers = await decide(MODELS[0], [
            `Screenshot of a reCAPTCHA dynamic challenge (target class: ${target}). The grid positions we previously clicked were replaced with new images after verify. For each asked position, decide whether the new image must be clicked again.`,
            { type: "image_url", image_url: { url: dataUrl } },
          ], q);
          picks = [];
          for (const [r, c] of clickedPositions) {
            const p = answers[`p${r}_${c}`]?.noul ?? 0;
            if (p >= 0.45) picks.push([r, c, p]);
            log(`  re-check r${r}c${c}: ${p.toFixed(2)}${p >= 0.45 ? " → re-click" : ""}`);
          }
        }

        if (picks.length === 0) {
          log("no new matching images — waiting 2s, then verifying to submit (none left)");
          await sleep(2000);
          await challenge.locator("#recaptcha-verify-button").click({ force: true }).catch(() => {});
          log("verify clicked");
          await sleep(2200);
          const solvedNow = await anchor.locator(".recaptcha-checkbox-checked").count();
          const boardGone = await challenge.locator(".rc-imageselect-instructions").count();
          if (solvedNow > 0) { solved = true; log("*** CHECKBOX GREEN — reCAPTCHA ACCEPTED ***"); break; }
          if (boardGone === 0) {
            log("challenge closed — Google served a new one");
            target = null;
            clickedPositions = [];
            await sleep(1500);
            continue;
          }
          log("challenge still open after submit — one full-board re-check with fresh eyes");
          const rescue = (await ensembleTiles(dataUrl, target, rows, cols, new Set())).picks;
          if (rescue.length === 0) {
            log("fresh-eyes re-check found nothing either — ending session honestly");
            break;
          }
          picks = rescue;
          log(`fresh eyes found ${picks.length} tile(s) — clicking and verifying`);
        }

        noPickStreak = 0;
        clickedPositions = picks.map(([r, c]) => [r, c]);
        const domCount = await challenge.locator(".rc-imageselect-tile").count();
        if (domCount === rows * cols) {
          const tiles = challenge.locator(".rc-imageselect-tile");
          for (const [r, c] of picks) {
            const tb = await tiles.nth((r - 1) * cols + (c - 1)).boundingBox();
            if (tb) await humanClick(page, tb.x + tb.width / 2, tb.y + tb.height / 2);
          }
        } else {
          const gridTop = clip.y + clip.height * 0.18;
          const gridLeft = clip.x + clip.width * 0.08;
          const gridH = clip.height * 0.74;
          const gridW = clip.width * 0.84;
          for (const [r, c] of picks) {
            const x = gridLeft + ((c - 0.5) / cols) * gridW;
            const y = gridTop + ((r - 0.5) / rows) * gridH;
            await humanClick(page, x, y);
          }
        }
        log(`clicked ${picks.length} tile(s)`);

        await sleep(2000);
        await challenge.locator("#recaptcha-verify-button").click({ force: true }).catch(() => {});
        log("verify clicked");
        await sleep(2200);

        const solvedNow = await anchor.locator(".recaptcha-checkbox-checked").count();
        const boardGone = await challenge.locator(".rc-imageselect-instructions").count();
        if (solvedNow > 0) { solved = true; log("*** CHECKBOX GREEN — reCAPTCHA ACCEPTED ***"); break; }
        if (boardGone === 0) {
          log("challenge closed — Google served a new one");
          target = null;
          clickedPositions = [];
          await sleep(1500);
        } else {
          log("Google replaced the clicked tiles in place — next round re-checks those positions only");
        }
      }

      if (!solved) {
        const token = await page.evaluate(() => {
          const el = document.querySelector("#g-recaptcha-response");
          return el ? (el.value ?? "").length : -1;
        });
        log(`session ${session} end — token length: ${token}`);
        if (session < 2) {
          await page.reload({ waitUntil: "domcontentloaded" });
          await sleep(5000);
        }
      }
    }

    if (solved) {
      log("LINGERING on the green checkbox for the recording…");
      await sleep(3000);
      await page.locator('button:has-text("Check")').first().click().catch(() => {});
      await sleep(3500);
    }
    const status = await page.evaluate(() => {
      const texts = [...document.querySelectorAll("div,span,p,strong,b")]
        .map((el) => (el.textContent ?? "").trim())
        .filter((t) => t.length > 0 && t.length < 140 && /solv|correct|success|wrong|error|try again/i.test(t) && !t.includes("function") && !t.includes("getMessage"));
      return [...new Set(texts)].slice(0, 5).join(" || ");
    });
    log("FINAL PAGE STATUS:", status || "n/a");
    await sleep(3000);
    await page.screenshot({ path: `${T}v2s-final.png` });
    await page.close();
    demoVideoPath = await demoVideo.path();
    solvedAtVideoEnd = solved;
  } finally {
    await ctx.close();
  }

  if (!demoVideoPath) throw new Error("no demo page video produced");
  mkdirSync(ASSETS, { recursive: true });
  const name = solved ? "recaptcha-solved" : "recaptcha-v2s";
  execSync(`cp "${demoVideoPath}" "${ASSETS}/${name}.webm"`);

  const dims = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${ASSETS}/${name}.webm"`
  ).toString().trim();
  const [vw, vh] = dims.split("x").map(Number);
  execSync(
    `python3 "${new URL("../scripts/gen-frame.py", import.meta.url).pathname}" ${vw} ${vh} "${T}frame-bg.png" "${T}frame-cap.png" ${solved ? 1 : 0}`
  );
  const dur = parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${ASSETS}/${name}.webm"`)
      .toString()
      .trim()
  );
  const capStart = Math.max(0, dur - 7).toFixed(1);
  const capEnd = dur.toFixed(1);
  execSync(
    `ffmpeg -y -i "${ASSETS}/${name}.webm" -loop 1 -i "${T}frame-bg.png" -loop 1 -i "${T}frame-cap.png" -filter_complex "[1:v][0:v]overlay=0:0[b0];[b0][2:v]overlay=(main_w-overlay_w)/2:main_h-overlay_h-16:enable='between(t,${capStart},${capEnd})'[out];[out]fps=8,scale=720:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer" -loop 0 "${ASSETS}/${name}.gif"`,
    { stdio: "pipe" }
  );
  log("assets written:", readdirSync(ASSETS).filter((f) => f.startsWith("recaptcha")).join(", "));
  if (!solved) process.exit(2);
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
