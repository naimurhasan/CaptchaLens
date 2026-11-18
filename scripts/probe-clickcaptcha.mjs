import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const T = new URL("../.tmp/", import.meta.url).pathname;
mkdirSync(T, { recursive: true });

const ctx = await chromium.launch({
  headless: false,
  viewport: { width: 1180, height: 920 },
});

const page = await ctx.newPage();
await page.goto("https://2captcha.com/demo/clickcaptcha", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(6000);

const widget = await page.evaluate(() => {
  const el = document.querySelector("[class*='captchaWidgetContainer']");
  if (!el) return "NO WIDGET";
  const html = el.innerHTML.replace(/\s+/g, " ");
  return html.slice(0, 2000);
});
console.log("WIDGET HTML:\n", widget);

const controls = await page.evaluate(() =>
  [...document.querySelectorAll("button, input")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })
    .filter((el) => /check|submit|verify|answer/i.test(el.textContent ?? "" + el.type + el.placeholder))
    .map((el) => ({ tag: el.tagName, text: (el.textContent ?? "").trim().slice(0, 40), id: el.id, cls: el.className.slice(0, 60), type: el.type }))
);
console.log("CONTROLS:", JSON.stringify(controls, null, 1));

const img = await page.evaluate(() =>
  [...document.querySelectorAll("img, canvas")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 150 && r.height > 150;
    })
    .map((el) => ({ tag: el.tagName, src: (el.src ?? "").slice(0, 90), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height), cls: (el.className ?? "").slice(0, 50) }))
);
console.log("BIG IMAGES:", JSON.stringify(img, null, 1));

await page.screenshot({ path: `${T}click-demo.png` });
await ctx.close();
console.log("probe saved");
