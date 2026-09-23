import { expect, test } from "@playwright/test";
import { pngFile } from "./helpers/png";
import {
  cleanupProject,
  makeJob,
  mockResultsApi,
  uploadTo,
} from "./helpers/mocks";
import type { Job } from "./helpers/mocks";

// Journey fixtures: one fixed image and three moving images (64x48, two-tone).
const fixedA = () =>
  pngFile("fixed-a.png", {
    width: 64,
    height: 48,
    left: [200, 40, 40],
    right: [60, 60, 200],
  });
const movingBlue = () =>
  pngFile("moving-blue.png", {
    width: 64,
    height: 48,
    left: [30, 60, 200],
    right: [70, 110, 240],
  });
const movingGreen = () =>
  pngFile("moving-green.png", {
    width: 64,
    height: 48,
    left: [40, 170, 60],
    right: [90, 220, 100],
  });
const movingRed = () =>
  pngFile("moving-red.png", {
    width: 64,
    height: 48,
    left: [220, 50, 50],
    right: [250, 130, 130],
  });

let currentProjectId: string | undefined;

test.afterEach(async ({ request }) => {
  if (currentProjectId) await cleanupProject(request, currentProjectId);
  currentProjectId = undefined;
});

test("full journey: create project, upload and align multiple images, register and review results", async ({
  page,
}) => {
  // The registration job layer is mocked (no Python needed); uploads,
  // thumbnails and saving hit the real backend. /api/status serves a mutable
  // job list that /api/start populates, so the UI reflects the run.
  const saveBodies: Record<string, unknown>[] = [];
  const jobs: Record<string, Job> = {};
  let startUrl = "";

  await page.route(/\/api\/status$/, (route) => route.fulfill({ json: jobs }));
  await page.route(/\/api\/save\//, (route) => {
    try {
      saveBodies.push(JSON.parse(route.request().postData() ?? "{}"));
    } catch {
      saveBodies.push({});
    }
    return route.fulfill({ json: { status: "success" } });
  });
  await page.route(/\/api\/start\//, (route) => {
    startUrl = route.request().url();
    jobs["job-journey-1"] = makeJob({
      id: "job-journey-1",
      projectId: currentProjectId ?? "project-journey",
      title: "Journey E2E project",
      status: "success",
      progress: [3, 3],
    });
    return route.fulfill({ json: jobs["job-journey-1"] });
  });
  await mockResultsApi(page);

  await test.step("create a new project from the overview", async () => {
    await page.goto("/registration-ui/");
    await page.getByText("New Project").click();
    await expect(page.getByTestId("dropzone-fixed")).toBeVisible();
    // the editor route param is the full project id ("project-<uuid>")
    currentProjectId = "project-" + page.url().split("#/project-")[1];
    expect(currentProjectId).toMatch(
      /^project-e2e-journey|project-[0-9a-f-]{36}$/
    );
  });

  await test.step("upload the fixed image and three moving images", async () => {
    await uploadTo(page, "dropzone-fixed", [fixedA()]);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="0"]')
    ).toHaveCount(1);
    await uploadTo(page, "dropzone-moving", [
      movingBlue(),
      movingGreen(),
      movingRed(),
    ]);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="1"]')
    ).toHaveCount(3);
    await expect(page.locator('[data-testid="stack-card-1"] img')).toHaveCount(
      3
    );
  });

  await test.step("align the moving stack on the canvas", async () => {
    // the Selection tool makes canvas images interactive; fit-to-viewer zooms in
    await page.getByRole("button", { name: "Selection" }).click();
    await page.getByRole("button", { name: "Fit to viewer" }).click();

    const moving = page
      .locator('.myCanvas > svg image[data-stack-id="1"]')
      .first();
    await expect(moving).toHaveAttribute("x", "0");
    await expect(moving).toHaveAttribute("y", "0");

    const svgBox = await page.locator(".myCanvas > svg").boundingBox();
    const rightPanel = await page
      .locator('[data-panel-id="right-panel"]')
      .boundingBox();
    const px =
      svgBox!.x +
      (Math.min(svgBox!.x + svgBox!.width, rightPanel!.x - 10) - svgBox!.x) *
        0.5;
    const py = svgBox!.y + svgBox!.height * 0.5;
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px + 80, py + 60, { steps: 12 });
    await page.mouse.up();

    await expect(moving).not.toHaveAttribute("x", "0");
    await expect(moving).not.toHaveAttribute("y", "0");
    // the drag selects the moving stack, so the toolbar inputs edit it now
    await page.getByRole("spinbutton", { name: "rotation" }).fill("90");
    await expect(moving).toHaveAttribute("transform", /rotate\(90,/);
    await page.getByRole("spinbutton", { name: "opacity" }).fill("0.6");
    await expect(moving).toHaveAttribute("opacity", "0.6");
  });

  await test.step("name the project", async () => {
    await page
      .getByLabel("project name", { exact: true })
      .fill("Journey E2E project");
  });

  await test.step("the aligned settings are autosaved", async () => {
    await expect
      .poll(
        () => {
          const body = saveBodies.at(-1) as
            | {
                title?: string;
                id?: string;
                workingImages?: {
                  imageEntries: unknown[];
                  x?: number;
                  rotation?: number;
                }[];
              }
            | undefined;
          return (
            !!body &&
            body.title === "Journey E2E project" &&
            body.id === currentProjectId &&
            body.workingImages?.length === 2 &&
            body.workingImages[1]?.imageEntries?.length === 3 &&
            body.workingImages[1]?.x !== 0 &&
            body.workingImages[1]?.rotation === 90
          );
        },
        { timeout: 20_000 }
      )
      .toBe(true);
  });

  await test.step("start the registration", async () => {
    const runButton = page.getByRole("button", { name: "run registration" });
    await expect(runButton).toBeEnabled();
    await runButton.click();
    await expect(runButton).toBeDisabled(); // in progress for 10s
    await expect.poll(() => startUrl !== "", { timeout: 20_000 }).toBe(true);
    expect(startUrl).toContain(`/api/start/${currentProjectId}`);
  });

  await test.step("review the results in the job drawer", async () => {
    const allJobs = page
      .getByRole("button", { name: "shows all jobs" })
      .first();
    await expect(allJobs.locator(".MuiBadge-badge")).toHaveText("1");
    await allJobs.click();
    await expect(page.getByRole("heading", { name: "All Jobs" })).toBeVisible();

    const row = page.locator("tr", { hasText: "job-journey-1" });
    await expect(row).toBeVisible();
    await row.click();

    await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
    await expect(page.getByText("tx: 1.5")).toBeVisible();
    await expect(page.getByText("ty: -2")).toBeVisible();
    await expect(page.getByText("mi: 0.420")).toBeVisible();
    await expect(page.getByText("Transformed Images")).toBeVisible();
    await expect(
      page.locator('img[src*="moving-registered.png"]')
    ).toBeVisible();
  });

  await test.step("review the job from the projects overview", async () => {
    await page.goto("/registration-ui/");
    const journeyRow = page.locator(".MuiAccordion-root", {
      hasText: "job-journey-1",
    });
    await expect(journeyRow).toBeVisible();
    await expect(
      journeyRow.getByText("success", { exact: true })
    ).toBeVisible();
    await expect(journeyRow.locator('[role="progressbar"]')).toHaveAttribute(
      "aria-valuenow",
      "100"
    );

    await journeyRow.locator(".MuiAccordionSummary-root").click();
    await expect(journeyRow.getByText("tx: 1.5")).toBeVisible();
    await expect(
      journeyRow.locator('img[src*="moving-registered.png"]').first()
    ).toBeVisible();
  });
});
