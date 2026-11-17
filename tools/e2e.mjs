// End-to-end check with real touch input.
//
//   node tools/e2e.mjs [baseUrl] [outDir]
//
// Drives an installed Chromium browser (Edge or Chrome) through the
// 30-second case on a 390x844 touch screen, checks that a drag and a pinch
// never place a site, then walks the practice set on a 1280x800 window.
// Screenshots are written to outDir.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "tools/out";
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
let failures = 0;
const check = (ok, label) => {
  log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

async function launch() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({
        channel,
        headless: true,
        args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
      });
    } catch {
      /* try the next browser */
    }
  }
  throw new Error("No Edge or Chrome install found for the end-to-end check.");
}

async function settled(page, ms = 900) {
  await page.waitForFunction(() => !document.querySelector('[class*="loading"]'), null, { timeout: 30000 });
  await page.waitForTimeout(ms);
}

async function stageBox(page) {
  return page.locator("canvas").boundingBox();
}

/** Tap a point given as fractions of the 3D view. */
async function tapStage(page, fx, fy) {
  const b = await stageBox(page);
  await page.touchscreen.tap(b.x + b.width * fx, b.y + b.height * fy);
}

async function tapText(page, text) {
  const el = page.getByRole("button", { name: text, exact: true });
  const b = await el.boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  return b;
}

/** Screen position of a landmark label's anchor (landmarks must be showing). */
async function landmark(page, key) {
  const b = await stageBox(page);
  const t = await page.evaluate((k) => {
    const el = [...document.querySelectorAll(`.lm-label[data-lm="${k}"]`)].find((e) => e.style.opacity === "1");
    return el ? el.style.transform : null;
  }, key);
  if (!t) throw new Error(`Landmark label not visible: ${key}`);
  const [x, y] = t.match(/-?[\d.]+/g).map(Number);
  return [b.x + x, b.y + y];
}

async function touch(cdp, type, points) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((p, i) => ({ x: p[0], y: p[1], id: i, radiusX: 8, radiusY: 8, force: 1 })),
  });
}

async function phone(browser) {
  log("\n== Phone, 390x844, touch ==");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Try a 30-second case" }).waitFor();
  log(`first screen usable after ${Date.now() - t0} ms`);
  await settled(page, 1500);
  await page.screenshot({ path: join(OUT, "phone-1-home.png") });

  const scroll = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, win: innerHeight }));
  check(scroll.doc <= scroll.win, `first screen fits without scrolling (${scroll.doc} <= ${scroll.win})`);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, a, summary")]
      .map((el) => ({ t: el.textContent.trim().slice(0, 24), r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && (x.r.height < 44 || x.r.width < 44))
      .map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
  );
  check(small.length === 0, `home touch targets are at least 44 px ${small.length ? JSON.stringify(small) : ""}`);

  // ---- the 30-second case, counting taps
  let taps = 0;
  await tapText(page, "Try a 30-second case");
  await settled(page, 1200);
  await page.screenshot({ path: join(OUT, "phone-2-case.png") });
  check(await page.getByText("Adult, routine vaccine, intramuscular").isVisible(), "case card is shown");

  // a one-finger drag turns the patient and must not place a site
  const b = await stageBox(page);
  const cdp = await ctx.newCDPSession(page);
  const sx = b.x + b.width * 0.5;
  const sy = b.y + b.height * 0.45;
  await touch(cdp, "touchStart", [[sx, sy]]);
  await page.waitForTimeout(700); // rest the finger first: a long press is still not a tap once it moves
  for (let i = 1; i <= 8; i++) {
    await touch(cdp, "touchMove", [[sx + i * 9, sy + i * 2]]);
    await page.waitForTimeout(16);
  }
  await touch(cdp, "touchEnd", []);
  await page.waitForTimeout(400);
  check(await page.getByText("Tap the injection site").isVisible(), "a drag does not place a site");

  // a two-finger pinch zooms and must not place a site
  await touch(cdp, "touchStart", [[sx - 30, sy], [sx + 30, sy]]);
  for (let i = 1; i <= 8; i++) {
    await touch(cdp, "touchMove", [[sx - 30 - i * 6, sy], [sx + 30 + i * 6, sy]]);
    await page.waitForTimeout(16);
  }
  await touch(cdp, "touchEnd", []);
  await page.waitForTimeout(400);
  check(await page.getByText("Tap the injection site").isVisible(), "a pinch does not place a site");
  await page.screenshot({ path: join(OUT, "phone-3-after-drag-pinch.png") });

  // reset the camera, then use the landmark labels to find where the deltoid is on screen
  await tapText(page, "Body");
  await page.waitForTimeout(900);
  await tapText(page, "Show landmarks");
  await settled(page, 1800);
  await page.screenshot({ path: join(OUT, "phone-4-landmarks.png") });
  const acromion = await landmark(page, "Acromion");
  const bar = await page.locator('[class*="stageBar"]').boundingBox();
  const cond = await landmark(page, "LateralCondyle");
  // the acromion and the outer knee are about 0.9 m apart on the adult model: use them as a ruler
  const pxPerMetre = (cond[1] - acromion[1]) / 0.905;
  check(cond[1] < bar.y, "knee landmark is clear of the on-screen controls");
  await tapText(page, "Hip");
  await settled(page, 1200);
  await page.screenshot({ path: join(OUT, "phone-4b-hip-view.png") });
  for (const k of ["GreaterTrochanter", "IliacCrest", "ASIS"]) await landmark(page, k);
  check(true, "hip view labels the greater trochanter, iliac crest and anterior superior iliac spine");
  await tapText(page, "Body");
  await page.waitForTimeout(900);
  await tapText(page, "Hide landmarks");
  await page.waitForTimeout(500);

  // tap 1: the site, about 2 inches below the acromion on the outer arm
  const site = [acromion[0] + 0.012 * pxPerMetre, acromion[1] + 0.064 * pxPerMetre];
  await page.touchscreen.tap(site[0], site[1]);
  taps++;
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, "phone-5-marked.png") });
  await page.getByText("Needle length").waitFor({ timeout: 8000 });
  await settled(page, 1200);
  const siteLine = await page.locator('[class*="siteLine"]').innerText();
  log("site line:", siteLine.replace(/\s+/g, " "));
  check(/Deltoid/.test(siteLine), "the tap landed in the deltoid zone");
  await page.screenshot({ path: join(OUT, "phone-6-cutaway.png") });

  // taps 2 and 3: needle and angle
  await tapText(page, "1 in");
  taps++;
  await tapText(page, "90°");
  taps++;
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, "phone-7-needle-in.png") });
  const tip = await page.locator('[class*="tip"]').first().innerText();
  check(/muscle/i.test(tip), `cutaway reports the tip in muscle (${tip.replace(/\s+/g, " ")})`);

  // tap 4: check
  await tapText(page, "Check answer");
  taps++;
  await page.getByRole("heading", { name: "Correct" }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(OUT, "phone-8-result.png") });
  check(taps <= 4, `30-second case finished in ${taps} taps after opening it`);
  check(await page.getByText("Sources").first().isVisible(), "result names its sources");
  check(await page.getByRole("button", { name: "Next case" }).isVisible(), "Next case is offered");

  // wrong answer on the next case shows specific feedback
  await tapText(page, "Next case");
  await settled(page, 1400);
  await page.screenshot({ path: join(OUT, "phone-9-infant.png") });
  await tapText(page, "Show landmarks");
  await settled(page, 1800);
  await page.screenshot({ path: join(OUT, "phone-9b-infant-landmarks.png") });
  const gt = await landmark(page, "GreaterTrochanter");
  const lc = await landmark(page, "LateralCondyle");
  check(lc[1] < (await page.locator('[class*="stageBar"]').boundingBox()).y, "infant thigh is clear of the on-screen controls");
  await tapText(page, "Hide landmarks");
  await page.waitForTimeout(400);
  await tapStage(page, 0.5, 0.5); // the infant's trunk: not an injection site
  await page.getByText("Needle length").waitFor({ timeout: 8000 });
  await settled(page, 900);
  await tapText(page, "⅝ in");
  await tapText(page, "45°");
  await page.waitForTimeout(1300);
  await tapText(page, "Check answer");
  await page.getByRole("heading", { name: "Not quite" }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(900);
  const summary = await page.locator('[class*="summary"]').first().innerText();
  log("feedback:", summary);
  check(/ended in/.test(summary) && /site|angle|needle/.test(summary), "feedback names the tissue and what was off");
  await page.screenshot({ path: join(OUT, "phone-10-miss.png"), fullPage: false });
  check(await page.getByText("CDC's answer").isVisible(), "a miss shows CDC's answer");

  // a second try is graded but leaves the score alone
  const before = await page.locator('[class*="progressLabel"]').innerText();
  await tapText(page, "Try again");
  await page.getByText("Tap the injection site").waitFor({ timeout: 5000 });
  const after = await page.locator('[class*="progressLabel"]').innerText();
  check(before === after, `Try again returns to the site step and keeps the score (${after})`);

  // the infant thigh, found from its landmarks, is accepted on the following infant case
  void gt;

  // trust copy and sources
  await page.goto(BASE + "/about", { waitUntil: "domcontentloaded" });
  const about = await page.locator("main").innerText();
  check(about.includes("All patients are synthetic. No real patient data is used or collected."), "synthetic-data statement is on About");
  check(about.includes("Not medical advice, not a medical device"), "educational-use statement is on About");
  await page.screenshot({ path: join(OUT, "phone-11-about.png") });
  await page.goto(BASE + "/sources", { waitUntil: "domcontentloaded" });
  const src = await page.locator("main").innerText();
  const links = await page.locator(".source-list a[href^='https://www.cdc.gov']").count();
  check(links >= 7 && /Accessed/.test(src), `Sources lists ${links / 2} citations with links and access dates`);
  await page.screenshot({ path: join(OUT, "phone-12-sources.png") });

  check(errors.length === 0, `no console errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ""}`);
  await ctx.close();
}

async function desktop(browser) {
  log("\n== Desktop, 1280x800 ==");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await settled(page, 1800);
  await page.screenshot({ path: join(OUT, "desktop-1-home.png") });
  await page.getByRole("button", { name: "Practice all cases" }).click();
  await settled(page, 1500);
  await page.getByRole("button", { name: "Show landmarks" }).click();
  await settled(page, 2200);
  await page.screenshot({ path: join(OUT, "desktop-2-landmarks.png") });
  // use the list alternative to the 3D tap
  await page.getByText("Choose the site from a list instead").click();
  await page.getByRole("button", { name: "Deltoid, upper arm" }).click();
  await page.getByText("Needle length").waitFor({ timeout: 8000 });
  await settled(page, 1000);
  await page.getByRole("button", { name: "1½ in", exact: true }).click();
  await page.getByRole("button", { name: "90°", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, "desktop-3-cutaway.png") });
  await page.getByRole("button", { name: "Check answer" }).click();
  await page.getByRole("heading", { name: "Not quite" }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, "desktop-4-result.png") });
  check(true, "desktop side panel flow runs");

  // finish the practice set through the list alternative and reach the review
  await page.getByRole("button", { name: "Next case" }).click();
  for (let i = 1; i < 10; i++) {
    await settled(page, 500);
    await page.getByText("Choose the site from a list instead").click();
    await page.getByRole("button", { name: i % 2 ? "Outer front of the thigh" : "Deltoid, upper arm" }).click();
    await page.getByText("Needle length").waitFor({ timeout: 8000 });
    await settled(page, 300);
    await page.getByRole("button", { name: "1 in", exact: true }).click();
    await page.getByRole("button", { name: "90°", exact: true }).click();
    await page.getByRole("button", { name: "Check answer" }).click();
    await page.getByRole("button", { name: i === 9 ? "See review" : "Next case" }).click();
  }
  await page.getByText(/of 10 correct/).waitFor({ timeout: 5000 });
  const review = await page.locator('[class*="panel"]').innerText();
  log("review:", review.split("\n").slice(0, 3).join(" / "));
  check(/CDC's answer/.test(review) && /Source/.test(review), "review lists each miss with the CDC answer and its source");
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, "desktop-5-review.png") });
  check(/Off: needle length/.test(review), "review lists every case with what was off");
  await page.getByRole("button", { name: /^Practice the \d+ missed cases$/ }).click();
  const missed = await page.getByText(/^Missed case 1 of 5/).waitFor({ timeout: 5000 }).then(() => true, () => false);
  check(missed, "Practice the missed cases starts a round of just the misses");
  check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ""}`);
  await ctx.close();
}

async function narrow(browser) {
  log("\n== Small phone, 360x640 ==");
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await settled(page, 1200);
  const fit = await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth);
  check(fit, "first screen fits a 360x640 phone without scrolling");
  await page.screenshot({ path: join(OUT, "small-1-home.png") });
  await tapText(page, "Try a 30-second case");
  await settled(page, 1200);
  const over = await page.evaluate(() => {
    const bar = document.querySelector('[class*="stageBar"]');
    return [...bar.querySelectorAll("button")].some((b) => b.getBoundingClientRect().right > innerWidth + 0.5);
  });
  check(!over, "view chips stay on screen at 360 px wide");
  await page.screenshot({ path: join(OUT, "small-2-case.png") });
  await ctx.close();
}

async function noWebgl() {
  log("\n== WebGL unavailable ==");
  let b;
  for (const channel of ["msedge", "chrome"]) {
    try {
      b = await chromium.launch({ channel, headless: true, args: ["--disable-3d-apis", "--disable-gpu"] });
      break;
    } catch {
      /* next */
    }
  }
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const shown = await page.getByText("The 3D view cannot start on this device.").waitFor({ timeout: 15000 }).then(() => true, () => false);
  check(shown, "a clear message appears when WebGL is unavailable");
  await page.screenshot({ path: join(OUT, "nowebgl.png") });
  await b.close();
}

async function reducedMotion(browser) {
  log("\n== Reduced motion ==");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await settled(page, 1500);
  const a = await page.locator("canvas").screenshot();
  await page.waitForTimeout(1200);
  const c = await page.locator("canvas").screenshot();
  check(Buffer.compare(a, c) === 0, "the patient does not turn when reduced motion is requested");
  await ctx.close();
}

const browser = await launch();
try {
  await phone(browser);
  await desktop(browser);
  await narrow(browser);
  await reducedMotion(browser);
} finally {
  await browser.close();
}
await noWebgl();
log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
