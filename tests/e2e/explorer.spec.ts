import { writeFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import applications from "../../data/camden-applications.json";

const first = applications[0];

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  const network: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    network.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText}`,
    ),
  );
  page.on("response", (response) => {
    if (response.status() >= 500)
      network.push(`${response.status()} ${response.url()}`);
  });
  (
    page as Page & { nimbyErrors?: string[]; nimbyNetwork?: string[] }
  ).nimbyErrors = errors;
  (page as Page & { nimbyNetwork?: string[] }).nimbyNetwork = network;
});

test.afterEach(async ({ page }, testInfo) => {
  const tracked = page as Page & {
    nimbyErrors: string[];
    nimbyNetwork: string[];
  };
  const logPath = testInfo.outputPath("browser-health.json");
  await writeFile(
    logPath,
    JSON.stringify(
      { errors: tracked.nimbyErrors, network: tracked.nimbyNetwork },
      null,
      2,
    ),
  );
  await testInfo.attach("browser-health", {
    path: logPath,
    contentType: "application/json",
  });
});

async function checkHealth(page: Page) {
  const tracked = page as Page & {
    nimbyErrors: string[];
    nimbyNetwork: string[];
  };
  expect(tracked.nimbyErrors).toEqual([]);
  // Navigation and changing map bounds can deliberately cancel in-flight tiles.
  expect(
    tracked.nimbyNetwork.filter(
      (message) => !message.includes("net::ERR_ABORTED"),
    ),
  ).toEqual([]);
}

test("real applications, interactive map, search, filters and detail", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/NIMBYWatch/);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await expect(page.getByTestId("planning-map")).toHaveAttribute(
    "data-map-ready",
    "true",
    { timeout: 30000 },
  );
  await expect(
    page.getByRole("link", { name: first.address, exact: true }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("dashboard.png"),
    fullPage: true,
    caret: "initial",
  });
  await page
    .getByRole("button", {
      name: `Show ${first.reference} on map`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("link", { name: "Explore application", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close selected application" })
    .click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Reset view", exact: true }).click();

  const search = page.getByRole("textbox", { name: "Search applications" });
  await search.fill(first.reference);
  await expect(
    page.getByRole("link", { name: first.address, exact: true }),
  ).toHaveCount(1);
  await search.fill("no-such-location-zzzz");
  await expect(
    page.getByText(/No matching applications/i).first(),
  ).toBeVisible();
  await search.fill("");

  await page.getByLabel("Status", { exact: true }).selectOption("refused");
  await expect(
    page.getByRole("link", { name: first.address, exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Status", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Registered from", { exact: true }).fill("2099-01-01");
  await expect(
    page.getByText("No matching applications", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Registered from", { exact: true }).fill("");
  await page
    .getByLabel("Development size", { exact: true })
    .selectOption("major");
  // Housing extraction can now establish major schemes; do not assume every
  // source description has an unknown count. Exact size behavior is covered
  // using a known, cited one-home application in housing.spec.ts.
  await page
    .getByLabel("Development size", { exact: true })
    .selectOption("all");
  await expect(
    page.getByRole("link", { name: first.address, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Objection category", { exact: true })
    .selectOption("parking");
  await expect(
    page.getByText("No matching applications", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await search.fill(first.reference);
  await page.getByRole("link", { name: first.address, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${first.id}`));
  await expect(
    page.getByRole("heading", { name: first.address, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View council record" }),
  ).toHaveAttribute("href", first.sourceUrl);
  await expect(page.getByText(/Not reported|Unknown/).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("application.png"),
    fullPage: true,
    caret: "initial",
  });
  await checkHealth(page);
});

test("analytics discloses coverage and methodology is accessible", async ({
  page,
}, testInfo) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/coverage/i).first()).toBeVisible();
  await expect(page.getByText(/sample|cohort/i).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("analytics.png"),
    fullPage: true,
    caret: "initial",
  });
  await page
    .getByRole("link", { name: "Our methodology", exact: true })
    .click();
  await expect(page).toHaveURL("/methodology");
  await expect(page.getByText(/postcode/i).first()).toBeVisible();
  await checkHealth(page);
});

test("analysis API is private and the mobile layout does not overflow", async ({
  page,
  request,
}, testInfo) => {
  const unauthorised = await request.post("/api/analysis", {
    data: { text: "Do not process this test input" },
  });
  expect(unauthorised.status()).toBe(401);
  const drafts = await request.get(`/api/analysis?applicationId=${first.id}`);
  expect(drafts.status()).toBe(401);
  const publish = await request.post("/api/analysis/test-id/review", {
    data: {
      privacyReviewed: true,
      accuracyReviewed: true,
      rightsConfirmed: true,
    },
  });
  expect(publish.status()).toBe(401);
  await page.goto("/analysis");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page
    .getByLabel("Operator token", { exact: true })
    .fill("synthetic-no-access-token-for-ui-test");
  await expect(
    page.getByRole("button", { name: "Load private drafts" }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("analysis.png"),
    fullPage: true,
    caret: "initial",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await checkHealth(page);
});

test("authorised-text UI supports private drafts and explicit review (mocked responses)", async ({
  page,
}, testInfo) => {
  const text =
    "Synthetic browser fixture only. Four new homes are proposed. This is not a real planning document.";
  const draft = {
    id: "synthetic-browser-draft",
    applicationId: first.id,
    status: "needs_review",
    documentType: "application_description",
    title: "Synthetic browser test document",
    sourceUrl: "https://example.org/synthetic-browser-fixture",
    documentHash: "synthetic-only",
    model: "synthetic-browser-provider",
    promptVersion: "synthetic-test",
    estimatedCostUsd: 0,
    createdAt: "2026-10-29T00:00:00Z",
    reviewedAt: null,
    error: null,
    result: {
      summary: {
        text: "Four homes are proposed in this synthetic test.",
        confidence: "high",
        citations: [{ quote: "Four new homes are proposed.", page: null }],
      },
      objections: [],
      representationCount: null,
      officerAssessment: [],
      officerRecommendation: null,
      refusalReasons: [],
      approvalConditions: [],
      limitations: ["Synthetic browser response; no live model call."],
    },
  };
  let publishBody: unknown;
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/analysis**", async (route) => {
    const request = route.request();
    expect(request.headers().authorization).toBe(
      "Bearer synthetic-review-token-for-browser-only",
    );
    if (request.url().endsWith("/review")) {
      publishBody = request.postDataJSON();
      return route.fulfill({
        json: {
          analysis: {
            ...draft,
            status: "published",
            reviewedAt: "2026-10-29T01:00:00Z",
          },
        },
      });
    }
    if (request.method() === "GET")
      return route.fulfill({ json: { analyses: [draft] } });
    submitted = request.postDataJSON();
    return route.fulfill({ json: { analysis: draft, reused: false } });
  });
  await page.goto("/analysis");
  await page
    .getByLabel("Operator token", { exact: true })
    .fill("synthetic-review-token-for-browser-only");
  await expect(
    page.getByRole("button", { name: "Load private drafts" }),
  ).toBeEnabled();
  await page
    .getByLabel("Document type", { exact: true })
    .selectOption("application_description");
  await page
    .getByLabel("Upload a text document", { exact: true })
    .setInputFiles({
      name: "synthetic-fixture.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(text),
    });
  await expect(page.getByLabel("Source text", { exact: true })).toHaveValue(
    text,
  );
  await page.getByLabel("Document title", { exact: true }).fill(draft.title);
  await page
    .getByLabel("Original source URL", { exact: true })
    .fill(draft.sourceUrl);
  await expect(
    page.getByRole("button", { name: "Analyse document", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "I have permission to process this document and have removed objectors’ personal information.",
    })
    .check();
  await page
    .getByRole("button", { name: "Analyse document", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Private analysis draft", exact: true }),
  ).toBeVisible();
  expect(submitted).toMatchObject({
    applicationId: first.id,
    documentType: "application_description",
    text,
    authorized: true,
  });
  await page
    .getByRole("button", { name: "Load private drafts", exact: true })
    .click();
  await expect(
    page.getByText("Private drafts loaded.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Four homes are proposed in this synthetic test.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Publish reviewed evidence",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Accuracy and context checked against the original",
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "No objector personal information in the output",
    })
    .check();
  await expect(
    page.getByRole("button", {
      name: "Publish reviewed evidence",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Rights to publish these excerpts confirmed",
    })
    .check();
  await page.screenshot({
    path: testInfo.outputPath("private-review-synthetic.png"),
    fullPage: true,
    caret: "initial",
  });
  await page
    .getByRole("button", { name: "Publish reviewed evidence", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Published evidence", exact: true }),
  ).toBeVisible();
  expect(publishBody).toEqual({
    privacyReviewed: true,
    accuracyReviewed: true,
    rightsConfirmed: true,
  });
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await checkHealth(page);
});
