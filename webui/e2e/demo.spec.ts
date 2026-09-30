import { expect, test, type Page } from "@playwright/test";

// The PR demo as a deterministic test (spec §6): fixed fixture data (e2e/fixtures, the four pinned
// scans), fixed viewport/locale/timezone, and state-based waits only. Each key moment asserts the
// expected state first, then takes a named screenshot; CI compares them with e2e/__screenshots__.
// Screenshots are soft assertions, so one difference does not hide the others.
// The video of this test is the PR's demo GIF.

// Pauses only help viewers of the video follow along. Never pause *before* a screenshot:
// toHaveScreenshot already waits for a stable page, and a sleep would hide a missing wait.
const pause = (page: Page, ms = 700) => page.waitForTimeout(ms);

test("repository gallery, search, skills and similar skills", async ({ page }) => {
  const cards = page.locator("a.card");
  const search = page.getByRole("searchbox", { name: "Search repositories and skills" });

  await test.step("01 gallery shows every repository", async () => {
    await page.goto("/");
    await expect(cards).toHaveCount(4);
    await expect(cards.locator("h2")).toHaveText(["JetBrains/android", "JetBrains/koog", "JetBrains/kotlin", "JetBrains/MPS"]);
    await expect.soft(page).toHaveScreenshot("01-gallery.png");
    await pause(page);
  });

  await test.step("02 instant search for gradle", async () => {
    await search.pressSequentially("gradle", { delay: 80 });
    await expect(cards).toHaveCount(1);
    await expect(page.locator(".filter-status")).toHaveText("1 of 4 repositories");
    await expect(cards.first()).toContainText("3 matching skills");
    await expect(page).toHaveURL("/?q=gradle");
    await expect.soft(page).toHaveScreenshot("02-search-gradle.png");
    await pause(page);
  });

  await test.step("03 the card opens the repository with the filter prefilled", async () => {
    await cards.first().click();
    await expect(page).toHaveURL("/repos/JetBrains-kotlin?q=gradle");
    await expect(page.locator("header .crumb")).toHaveText("› JetBrains/kotlin");
    await expect(page.locator(".filter-status")).toContainText("3 of 6 skills");
    await expect(page.locator("nav.sidebar > a")).toHaveCount(3);
    await expect.soft(page).toHaveScreenshot("03-repo-filtered.png");
    await pause(page);
  });

  await test.step("04 a skill page with similar skills and its content", async () => {
    await page.locator("nav.sidebar > a", { hasText: "build-bump-gradle-version" }).click();
    await expect(page.locator("main h1").first()).toHaveText("build-bump-gradle-version");
    await expect(page.locator("section.similar .pct")).toHaveText(["76%", "75%", "46%", "31%", "24%"]);
    await expect(page.locator("article.markdown h1").first()).toBeVisible(); // content fetched from GitHub
    await expect.soft(page).toHaveScreenshot("04-skill-page.png");
    await pause(page);
  });

  await test.step("05 similar skills of the repository", async () => {
    await page.getByRole("link", { name: "Similar", exact: true }).click();
    await expect(page).toHaveURL("/repos/JetBrains-kotlin/similar");
    const pct = page.locator("table.pairs td.pct");
    await expect(pct).toHaveCount(8);
    await expect(pct.first()).toHaveText("76%");
    await expect(pct.nth(1)).toHaveText("75%");
    await expect(pct.nth(2)).toHaveText("68%");
    await expect.soft(page).toHaveScreenshot("05-similar.png");
    await pause(page);
  });

  await test.step("06 Back returns to the gallery with the search kept", async () => {
    await page.goBack(); // skill page
    await page.goBack(); // repository
    await page.goBack(); // gallery
    await expect(page).toHaveURL("/?q=gradle");
    await expect(search).toHaveValue("gradle");
    await expect(cards).toHaveCount(1);
    await expect.soft(page).toHaveScreenshot("06-back-restores-search.png");
    await pause(page);
  });
});
