import { expect, test, type Page } from "@playwright/test";

// The PR demo as a deterministic test (spec §6): fixed fixture data (e2e/fixtures, the four pinned
// scans), fixed viewport/locale/timezone, and state-based waits only. Each key moment asserts the
// expected state first, then takes a named screenshot; CI compares them with e2e/__screenshots__.
// Screenshots are soft assertions, so one difference does not hide the others.
// The video of this test is the PR's demo GIF.

// Pauses only help viewers of the video follow along. Never pause *before* a screenshot:
// toHaveScreenshot already waits for a stable page, and a sleep would hide a missing wait.
const pause = (page: Page, ms = 700) => page.waitForTimeout(ms);

test("repository gallery, search, skills, similar skills and stars", async ({ page }) => {
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

  // Stars (spec §4.7) live in localStorage, which persists across the steps of this test.
  const star = page.getByRole("button", { name: "Star this skill" });
  const sidebar = page.locator("nav.sidebar > a");
  const starred = page.locator("section.starred");
  const inTests = "/repos/JetBrains-kotlin?skill=.claude%2Fskills%2Fbuild-tools-bump-gradle-in-tests%2FSKILL.md";
  const byName = [
    /analysis-api-create-cherry-pick-issue/,
    /analysis-api-mark-internal-apis/,
    /build-bump-gradle-version/,
    /build-tools-bump-gradle-api/,
    /build-tools-bump-gradle-in-tests/,
    /minimize-repro-for-diagnostic-test/,
  ];

  await test.step("07 starring a skill lists it first in the sidebar", async () => {
    await page.goto(inTests);
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await expect(star).toHaveText("☆ Star");
    await expect(sidebar).toHaveText(byName);
    await pause(page);
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    await expect(star).toHaveText("★ Starred");
    await expect(sidebar).toHaveText([byName[4], byName[0], byName[1], byName[2], byName[3], byName[5]]);
    await expect(sidebar.first().getByRole("img", { name: "Starred" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Starred" })).toHaveCount(1);
    await expect.soft(page).toHaveScreenshot("07-starred-first.png");
    await pause(page);
  });

  await test.step("08 the star survives a reload", async () => {
    await page.reload();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    await expect(sidebar.first()).toHaveText(byName[4]);
  });

  await test.step("09 the home page shows the starred skills widget", async () => {
    await page.getByRole("link", { name: "Skill Atlas" }).click();
    await expect(page).toHaveURL("/");
    await expect(starred.getByRole("heading")).toHaveText("Starred skills");
    await expect(starred.getByRole("listitem")).toHaveText(["build-tools-bump-gradle-in-tests JetBrains/kotlin"]);
    await expect(cards).toHaveCount(4);
    await expect.soft(page).toHaveScreenshot("08-gallery-starred.png");
    await pause(page);
    await starred.getByRole("link", { name: "build-tools-bump-gradle-in-tests" }).click();
    await expect(page).toHaveURL(inTests);
  });

  await test.step("10 unstarring removes the widget and restores name order", async () => {
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await expect(sidebar).toHaveText(byName);
    await page.goto("/");
    await expect(cards).toHaveCount(4);
    await expect(starred).toHaveCount(0);
  });
});
