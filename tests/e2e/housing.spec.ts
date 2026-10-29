import { writeFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import applications from "../../data/camden-applications.json";

const target = applications.find((app) => app.reference === "2026/4237/P")!;
const health = new WeakMap<Page, { errors: string[]; network: string[] }>();

test.beforeEach(async ({ page }) => {
  const captured = { errors: [] as string[], network: [] as string[] };
  health.set(page, captured);
  page.on("pageerror", (error) => captured.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") captured.errors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    captured.network.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText}`,
    ),
  );
  page.on("response", (response) => {
    if (response.status() >= 500)
      captured.network.push(`${response.status()} ${response.url()}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const captured = health.get(page)!;
  const logPath = testInfo.outputPath("browser-health.json");
  await writeFile(logPath, JSON.stringify(captured, null, 2));
  await testInfo.attach("browser-health", {
    path: logPath,
    contentType: "application/json",
  });
  expect(captured.errors).toEqual([]);
  expect(
    captured.network.filter((entry) => !entry.includes("net::ERR_ABORTED")),
  ).toEqual([]);
});

test("housing counts distinguish extracted evidence from unknown measures", async ({
  page,
}, testInfo) => {
  await page.goto(`/applications/${target.id}`);
  await expect(
    page.getByRole("heading", { name: target.address }),
  ).toBeVisible();
  const proposed = page.getByTestId("housing-proposedUnits");
  await expect(proposed.locator(".housing-value")).toHaveText("1");
  await expect(proposed).toContainText("AI-extracted");
  await expect(proposed).not.toContainText("Source-reported");
  const disclosure = proposed.locator("summary");
  if (await disclosure.count()) await disclosure.click();
  await expect(proposed).toContainText(
    /1 x self-contained residential dwelling/i,
  );
  await expect(proposed.locator("a[href]").first()).toHaveAttribute(
    "href",
    target.sourceUrl,
  );
  for (const field of [
    "netAdditionalUnits",
    "approvedUnits",
    "affordableUnits",
  ]) {
    const metric = page.getByTestId(`housing-${field}`);
    await expect(metric).toContainText("Unknown");
    await expect(metric).not.toContainText("AI-extracted");
    await expect(metric).not.toContainText("Source-reported");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("housing-evidence.png"),
    fullPage: true,
    caret: "initial",
  });
});

test("dashboard totals and size filters use evidenced housing counts", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByTestId("planning-map")).toHaveAttribute(
    "data-map-ready",
    "true",
    { timeout: 30000 },
  );
  await page
    .getByRole("textbox", { name: "Search applications" })
    .fill(target.reference);
  await expect(
    page.getByRole("link", { name: target.address, exact: true }),
  ).toHaveCount(1);
  const total = page.getByTestId("proposed-homes-stat");
  await expect(total.locator("strong")).toHaveText("1");
  await expect(page.getByTestId("housing-coverage")).toContainText(
    "0 source-reported · 1 AI-extracted · 0 unknown",
  );
  await expect(total).not.toContainText("Unknown");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page
    .getByLabel("Development size", { exact: true })
    .selectOption("minor");
  await expect(
    page.getByRole("link", { name: target.address, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("housing-filtered-dashboard.png"),
    fullPage: true,
    caret: "initial",
  });
  await page
    .getByLabel("Development size", { exact: true })
    .selectOption("major");
  await expect(
    page.getByText("No matching applications", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Development size", { exact: true })
    .selectOption("unknown");
  await expect(
    page.getByText("No matching applications", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Development size", { exact: true })
    .selectOption("all");
  await expect(
    page.getByRole("link", { name: target.address, exact: true }),
  ).toBeVisible();
});
