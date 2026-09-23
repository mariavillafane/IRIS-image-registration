import { expect, test } from "@playwright/test";
import { createPng } from "./helpers/png";
import { makeJob, mockResultsApi, type Job } from "./helpers/mocks";

const tinyThumbnail =
  "data:image/png;base64," +
  createPng({ width: 8, height: 8, left: [200, 40, 40] }).toString("base64");

const demoProject = {
  id: "project-e2e-demo",
  title: "Demo Project",
  uploaded: Date.now() - 5_000,
  thumbnail: tinyThumbnail,
  workingImages: [
    { id: 0, imageEntries: [{ id: "fixed-1" }] },
    { id: 1, imageEntries: [{ id: "moving-1" }, { id: "moving-2" }] },
  ],
};

async function mockProjectsApi(
  page: import("@playwright/test").Page,
  projects: unknown[]
) {
  await page.route(/\/api\/projects$/, (route) =>
    route.fulfill({ json: projects })
  );
  await page.route(/\/api\/status$/, (route) => route.fulfill({ json: {} }));
}

test.describe("projects overview", () => {
  test("lists projects and opens one in the editor", async ({ page }) => {
    await mockProjectsApi(page, [demoProject]);
    await page.goto("/registration-ui/");

    await expect(page.getByText("IRIS", { exact: true })).toBeVisible();
    await expect(page.getByText("Demo Project")).toBeVisible();
    await expect(page.locator('img[src^="data:image/png"]')).toBeVisible();

    await page.locator('a[href="#/project-e2e-demo"]').click();
    await expect(page.getByTestId("dropzone-fixed")).toBeVisible();
  });

  test("creates a new project from the actions card", async ({ page }) => {
    await mockProjectsApi(page, []);
    await page.goto("/registration-ui/");

    await page.getByText("New Project").click();
    await expect(page.getByTestId("dropzone-fixed")).toBeVisible();
    await expect(page.getByTestId("dropzone-moving")).toBeVisible();
  });

  test("shows job history with status controls and results", async ({
    page,
  }) => {
    await mockProjectsApi(page, []);
    const successJob = makeJob({
      id: "job-e2e-success",
      status: "success",
      progress: [4, 4],
    });
    const stoppedJob = makeJob({
      id: "job-e2e-stopped",
      status: "stopped",
      progress: [2, 4],
      projectId: "project-e2e-demo",
    });
    await page.route(/\/api\/status$/, (route) =>
      route.fulfill({
        json: {
          [successJob.id]: successJob,
          [stoppedJob.id]: stoppedJob,
        } as Record<string, Job>,
      })
    );
    await mockResultsApi(page);

    await page.goto("/registration-ui/");
    await expect(page.getByText("job-e2e-success")).toBeVisible();

    const successRow = page.locator(".MuiAccordion-root", {
      hasText: "job-e2e-success",
    });
    const stoppedRow = page.locator(".MuiAccordion-root", {
      hasText: "job-e2e-stopped",
    });

    // success job: progress bar complete, Stop rendered but disabled, no Restart
    await expect(successRow.locator('[role="progressbar"]')).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
    await expect(
      successRow.getByRole("button", { name: "Stop", exact: true })
    ).toBeDisabled();
    await expect(
      successRow.getByRole("button", { name: "Restart", exact: true })
    ).toHaveCount(0);

    // stopped job: Restart offered instead of Stop
    await expect(
      stoppedRow.getByRole("button", { name: "Restart", exact: true })
    ).toBeVisible();
    await expect(
      stoppedRow.getByRole("button", { name: "Stop", exact: true })
    ).toHaveCount(0);

    // expand the successful job to load its (mocked) results
    await successRow.locator(".MuiAccordionSummary-root").click();
    // scope to the expanded job: both accordions render their (mocked) results
    await expect(successRow.getByText("tx: 1.5")).toBeVisible();
    await expect(successRow.getByText("ty: -2")).toBeVisible();
    await expect(
      page.locator('img[src*="moving-registered.png"]').first()
    ).toBeVisible();
  });

  test("deletes a project after confirmation", async ({ page }) => {
    await mockProjectsApi(page, [demoProject]);
    let deleted = false;
    await page.route(/\/api\/delete\//, (route) => {
      deleted = true;
      return route.fulfill({ json: {} });
    });
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto("/registration-ui/");
    await page.getByRole("button", { name: "SpeedDial basic example" }).click();
    await page.locator(".MuiSpeedDialAction-fab").nth(3).click(); // Delete action

    await expect.poll(() => deleted).toBe(true);
  });
});
