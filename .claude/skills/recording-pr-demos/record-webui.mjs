// node record-webui.mjs [base-url] [out-dir]
// Records a browser session of the steps below as a .webm and prints the file path.
// Run it from a directory where playwright-core is installed (see SKILL.md). It uses the installed
// Google Chrome (channel "chrome"), so no browser download is needed.
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3000";
const outDir = process.argv[3] ?? "video";
const size = { width: 1280, height: 720 };

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: size, recordVideo: { dir: outDir, size } });
const page = await context.newPage();
const pause = (ms = 1200) => page.waitForTimeout(ms); // let the viewer see each state

// ---- steps: replace with the feature being demonstrated ----
// `repo=` is the index file name without `.json` (JetBrains-kotlin.json -> JetBrains-kotlin).
// Before each pause, wait for the new state: a URL (waitForURL), a selector (locator.waitFor), or,
// when only content or order changes, a condition, e.g.
//   await page.waitForFunction(() => document.querySelector("nav.sidebar a")?.textContent?.startsWith("build-"));
await page.goto(`${base}/?repo=JetBrains-kotlin`);
await page.locator("nav.sidebar a").first().waitFor();
await pause();
await page.locator('input[name="q"]').pressSequentially("gradle", { delay: 120 });
await page.keyboard.press("Enter");
await page.waitForURL(/q=gradle/);
await pause(1800);
await page.getByRole("link", { name: "Similar", exact: true }).click();
await page.waitForURL(/\/similar/);
await page.locator("table.pairs").waitFor();
await pause(2500);
// ---- end of steps ----

const video = page.video();
await context.close(); // closing the context finishes writing the video
console.log(await video.path());
await browser.close();
