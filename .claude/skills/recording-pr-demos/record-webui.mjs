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
// `/` is the repository gallery; a repository lives at `/repos/{index file name without .json}`
// (JetBrains-kotlin.json -> /repos/JetBrains-kotlin).
// Before each pause, wait for the new state: a URL (waitForURL), a selector (locator.waitFor), or,
// when only content or order changes, a condition, e.g.
//   await page.waitForFunction(() => document.querySelectorAll("a.card").length === 1);
await page.goto(`${base}/`);
await page.locator("a.card").first().waitFor();
await pause();
await page.getByRole("searchbox", { name: "Search repositories and skills" }).pressSequentially("gradle", { delay: 150 });
await page.waitForFunction(() => document.querySelectorAll("a.card").length === 1);
await pause(1800);
await page.locator("a.card").first().click();
await page.waitForURL(/\/repos\/[^/?]+\?q=gradle/);
await page.locator("nav.sidebar a").first().waitFor();
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
