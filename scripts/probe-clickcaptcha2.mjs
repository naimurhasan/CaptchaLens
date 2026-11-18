import { chromium } from "playwright";

const ctx = await chromium.launch({ headless: false, viewport: { width: 1180, height: 920 } });
const page = await ctx.newPage();
await page.goto("https://2captcha.com/demo/clickcaptcha", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(5000);

const context = await page.evaluate(() => {
  const widget = document.querySelector("[class*='captchaWidgetContainer']");
  const parent = widget?.parentElement;
  const text = parent?.innerText?.replace(/\s+/g, " ").slice(0, 500);
  const inputs = [...document.querySelectorAll("input")].map((i) => ({
    type: i.type, name: i.name, id: i.id, value: (i.value ?? "").slice(0, 60),
  }));
  const img = document.querySelector("[class*='captchaWidgetContainer'] img");
  const imgInfo = img
    ? { nw: img.naturalWidth, nh: img.naturalHeight, rw: Math.round(img.getBoundingClientRect().width), rh: Math.round(img.getBoundingClientRect().height) }
    : null;
  return { text, inputs, imgInfo, parentCls: parent?.className?.slice(0, 80) };
});
console.log(JSON.stringify(context, null, 1));

// click the image center and see if a marker appears
const img = page.locator("[class*='captchaWidgetContainer'] img").first();
await img.click();
await page.waitForTimeout(800);
const after = await page.evaluate(() => {
  const widget = document.querySelector("[class*='captchaWidgetContainer']");
  return widget?.innerHTML.replace(/\s+/g, " ").slice(0, 800);
});
console.log("AFTER CLICK:", after);

await ctx.close();
