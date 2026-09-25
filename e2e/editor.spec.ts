import { expect, test, type Page } from "@playwright/test";
import { pngFile } from "./helpers/png";
import {
  cleanupProject,
  makeJob,
  mockEditorApi,
  mockResultsApi,
  openEditor,
  uploadTo,
} from "./helpers/mocks";

// Basic test images: 64x48 PNGs, two-tone left/right so registration
// offsets are visually verifiable and sharp has real pixels to chew on.
const fixedA = () =>
  pngFile("fixed-a.png", {
    width: 64,
    height: 48,
    left: [200, 40, 40],
    right: [60, 60, 200],
  });
const fixedB = () =>
  pngFile("fixed-b.png", {
    width: 64,
    height: 48,
    left: [220, 180, 40],
    right: [40, 120, 200],
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

function newProjectId(): string {
  // the editor route param includes the "project-" prefix (links point to
  // /project-<uuid>), so generate ids that already carry it
  currentProjectId = `project-e2e-${Date.now()}-${Math.floor(
    Math.random() * 1e6
  )}`;
  return currentProjectId;
}

async function movingImage(page: Page) {
  return page.locator('.myCanvas > svg image[data-stack-id="1"]').first();
}

/**
 * Prepares the canvas for image interactions:
 *  - the Selection tool makes the <image> elements hit-testable (with the Pan
 *    tool the viewer swallows pointer events, exactly like manual usage)
 *  - "Fit to viewer" scales the SVG up so the images fill the visible panel
 */
async function prepareCanvas(page: Page) {
  await page.getByRole("button", { name: "Selection" }).click();
  await page.getByRole("button", { name: "Fit to viewer" }).click();
}

/**
 * Point inside the VISIBLE canvas. The viewer svg is sized to the window and
 * overflows its panel, so points must stay left of the right panel.
 */
async function canvasPoint(page: Page, fx = 0.5, fy = 0.5) {
  const svgBox = (await page.locator(".myCanvas > svg").boundingBox())!;
  const rightPanelBox = await page
    .locator('[data-panel-id="right-panel"]')
    .boundingBox()
    .catch(() => null);
  const visibleRight = rightPanelBox
    ? Math.min(svgBox.x + svgBox.width, rightPanelBox.x - 10)
    : svgBox.x + svgBox.width;
  return {
    x: svgBox.x + (visibleRight - svgBox.x) * fx,
    y: svgBox.y + svgBox.height * fy,
  };
}

/** Opens a fresh editor and uploads one fixed image + two moving images. */
async function openEditorWithImages(page: Page) {
  const pid = newProjectId();
  const mocks = await mockEditorApi(page);
  await openEditor(page, pid);
  await uploadTo(page, "dropzone-fixed", [fixedA()]);
  await expect(
    page.locator('.myCanvas > svg image[data-stack-id="0"]')
  ).toHaveCount(1);
  await uploadTo(page, "dropzone-moving", [movingBlue(), movingGreen()]);
  await expect(
    page.locator('.myCanvas > svg image[data-stack-id="1"]')
  ).toHaveCount(2);
  return mocks;
}

test.describe("editor canvas", () => {
  test("uploads fixed and moving images and restores them from the server after reload", async ({
    page,
  }) => {
    const pid = newProjectId();
    await mockEditorApi(page, { mockSave: false }); // let the real autosave run
    await openEditor(page, pid);

    await uploadTo(page, "dropzone-fixed", [fixedA()]);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="0"]')
    ).toHaveCount(1);
    await uploadTo(page, "dropzone-moving", [movingBlue(), movingGreen()]);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="1"]')
    ).toHaveCount(2);

    // Wait for the debounced autosave that contains both stacks.
    await page.waitForResponse(
      (response) => {
        if (!/\/api\/save\//.test(response.url()) || response.status() !== 200)
          return false;
        try {
          const body = response.request().postDataJSON() as {
            workingImages?: { imageEntries: unknown[] }[];
          };
          return body?.workingImages?.length === 2;
        } catch {
          return false;
        }
      },
      { timeout: 20_000 }
    );

    await page.reload();
    await expect(page.getByTestId("dropzone-fixed")).toBeVisible();
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="0"]')
    ).toHaveCount(1);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="1"]')
    ).toHaveCount(2);
    await expect(page.locator('[data-testid="stack-card-1"] img')).toHaveCount(
      2
    );
  });

  test("drags a moving image to align it with the fixed image", async ({
    page,
  }) => {
    await openEditorWithImages(page);
    await prepareCanvas(page);
    const moving = await movingImage(page);
    await expect(moving).toHaveAttribute("x", "0");
    await expect(moving).toHaveAttribute("y", "0");

    const from = await canvasPoint(page);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 80, from.y + 60, { steps: 12 });
    await page.mouse.up();

    await expect(moving).not.toHaveAttribute("x", "0");
    await expect(moving).not.toHaveAttribute("y", "0");
    await expect(
      page.locator(
        '[data-testid="stack-card-1"] [data-testid="stack-location"]'
      )
    ).not.toHaveText("0,0");
  });

  test("edits rotation, scale and opacity of the selected stack", async ({
    page,
  }) => {
    await openEditorWithImages(page);
    await prepareCanvas(page);
    const moving = await movingImage(page);
    const selectPoint = await canvasPoint(page);
    await page.mouse.click(selectPoint.x, selectPoint.y); // selects the moving stack

    await page.getByRole("spinbutton", { name: "rotation" }).fill("90");
    await expect(moving).toHaveAttribute("transform", /rotate\(90,/);

    await page.getByRole("spinbutton", { name: "opacity" }).fill("0.5");
    await expect(moving).toHaveAttribute("opacity", "0.5");

    await page.getByRole("spinbutton", { name: "scale" }).fill("1.5");
    await expect(moving).toHaveAttribute("width", "96"); // 64 * 1.5
  });

  test("compare mode curtains the moving stack and cycles orientation", async ({
    page,
  }) => {
    await openEditorWithImages(page);
    await prepareCanvas(page); // viewer events only fire with the Selection tool
    await page.getByRole("button", { name: "compare" }).click();

    // the curtain clip lives on a transform-free <g> wrapping the moving image
    // (a clip-path on the <image> itself would be rotated along with it)
    await expect(
      page.locator(
        '.myCanvas > svg g[clip-path="url(#clipPath)"] > image[data-stack-id="1"]'
      )
    ).toHaveCount(2); // every entry of the moving stack
    await expect(
      page.locator(
        '.myCanvas > svg g[clip-path="url(#clipPath)"] > image[data-stack-id="0"]'
      )
    ).toHaveCount(0); // the fixed image is never curtained

    const rect = page.locator(".myCanvas > svg #clipPath rect");
    const before = {
      x: await rect.getAttribute("x"),
      y: await rect.getAttribute("y"),
    };

    const point = await canvasPoint(page);
    await page.mouse.move(point.x, point.y); // updates the curtain position
    await page.mouse.down();
    await page.mouse.up();

    const after = {
      x: await rect.getAttribute("x"),
      y: await rect.getAttribute("y"),
    };
    expect(after.x !== before.x || after.y !== before.y).toBe(true);
  });

  test("compare mode curtain follows the mouse regardless of moving image rotation", async ({
    page,
  }) => {
    await openEditorWithImages(page);
    await prepareCanvas(page);

    // drag the moving stack a little so the rotated footprint has room, then
    // rotate it 30 degrees (before compare mode, because canvas clicks in
    // compare mode cycle the curtain orientation instead of selecting)
    const from = await canvasPoint(page);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 80, from.y + 60, { steps: 12 });
    await page.mouse.up();
    await page.mouse.click(from.x, from.y); // select the moving stack

    const moving = await movingImage(page);
    await page.getByRole("spinbutton", { name: "rotation" }).fill("30");
    await expect(moving).toHaveAttribute("transform", /rotate\(30,/);

    // rotate(30) around the stack origin swings the image's footprint left of
    // its unrotated box; with the curtain at canvas x=20 both probes below sit
    // inside the rotated footprint AND over the fixed image, well inside the
    // visible panel at the "fit to viewer" scale
    const curtainX = 20;
    const probeY = 34;

    await page.getByRole("button", { name: "compare" }).click();

    // move the mouse (canvas coords -> screen) to set the curtain position;
    // orientation stays 0: to the right of the mouse the moving image shows
    const toScreen = (cx: number, cy: number) =>
      page.evaluate(
        ([x, y]) => {
          const g = document.querySelector<SVGGElement>(".myCanvas > svg > g")!;
          const p = new DOMPoint(x as number, y as number).matrixTransform(
            g.getScreenCTM()!
          );
          return { x: p.x, y: p.y };
        },
        [cx, cy]
      );
    const curtainScreen = await toScreen(curtainX, probeY);
    await page.mouse.move(curtainScreen.x, curtainScreen.y);

    // the curtain edge sits at the mouse: reveal rect x ~= curtainX
    const rectX = +(
      await page.locator(".myCanvas > svg #clipPath rect").getAttribute("x")
    )!;
    expect(Math.abs(rectX - curtainX)).toBeLessThanOrEqual(1.5);

    // probe which image is on top at two canvas points inside the ROTATED
    // footprint (document.elementFromPoint): right of the curtain the moving
    // image must be revealed; left of it it must be clipped away so the fixed
    // image shows through. Before the fix the clip rect was interpreted in
    // the image's rotated space, so the point left of the curtain wrongly
    // showed the moving image.
    const topStackIdAt = (cx: number, cy: number) =>
      page.evaluate(
        ([x, y]) => {
          const g = document.querySelector<SVGGElement>(".myCanvas > svg > g")!;
          const p = new DOMPoint(x as number, y as number).matrixTransform(
            g.getScreenCTM()!
          );
          const el = document.elementFromPoint(p.x, p.y);
          return el?.getAttribute("data-stack-id");
        },
        [cx, cy]
      );
    expect(await topStackIdAt(curtainX + 4, probeY)).toBe("1"); // revealed
    expect(await topStackIdAt(curtainX - 4, probeY)).toBe("0"); // clipped: the
    // fixed image underneath is visible where the curtain hides the mover
  });

  test("toggles the visibility of a moving image", async ({ page }) => {
    await openEditorWithImages(page);
    const card = page.locator('[data-testid="stack-card-1"]');
    await card.locator("img").first().hover();

    await card.locator('[data-testid="visibility-0"] input').uncheck();
    await expect(
      page.locator('.myCanvas > svg image[data-entry-id*="moving-blue"]')
    ).toHaveCount(0);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="1"]')
    ).toHaveCount(1);

    await card.locator('[data-testid="visibility-0"] input').check();
    await expect(
      page.locator('.myCanvas > svg image[data-entry-id*="moving-blue"]')
    ).toHaveCount(1);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="1"]')
    ).toHaveCount(2);
  });

  test("deletes an image entry after confirmation", async ({ page }) => {
    await openEditorWithImages(page);
    page.on("dialog", (dialog) => dialog.accept());

    const card = page.locator('[data-testid="stack-card-1"]');
    await card.locator("img").first().hover();
    await card.getByTestId("delete-entry-1").click();

    await expect(
      page.locator('.myCanvas > svg image[data-entry-id*="moving-green"]')
    ).toHaveCount(0);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="1"]')
    ).toHaveCount(1);
  });

  test("replaces the fixed image", async ({ page }) => {
    await openEditorWithImages(page);
    await uploadTo(page, "dropzone-stack-0", [fixedB()]);

    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="0"]')
    ).toHaveCount(1);
    await expect(
      page.locator('.myCanvas > svg image[data-entry-id*="fixed-a"]')
    ).toHaveCount(0);
    await expect(
      page.locator('.myCanvas > svg image[data-entry-id*="fixed-b"]')
    ).toHaveCount(1);
  });

  test("adds an image to an existing moving stack", async ({ page }) => {
    await openEditorWithImages(page);
    await uploadTo(page, "dropzone-stack-1", [movingRed()]);

    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="1"]')
    ).toHaveCount(3);
    await expect(
      page.locator('.myCanvas > svg image[data-entry-id*="moving-red"]')
    ).toHaveCount(1);
  });

  test("renames the project and autosaves both stacks", async ({ page }) => {
    const { saveBodies } = await openEditorWithImages(page);
    await page
      .getByLabel("project name", { exact: true })
      .fill("Renamed E2E project");

    await expect
      .poll(
        () =>
          saveBodies.some(
            (body) =>
              body?.title === "Renamed E2E project" &&
              Array.isArray(body?.workingImages) &&
              body.workingImages.length === 2
          ),
        { timeout: 20_000 }
      )
      .toBe(true);

    const saved = saveBodies.find(
      (body) => body?.title === "Renamed E2E project"
    ) as {
      id?: string;
      workingImages?: { imageEntries: unknown[] }[];
    };
    expect(saved?.id).toBe(currentProjectId);
    expect(saved?.workingImages?.[1]?.imageEntries).toHaveLength(2);
  });

  test("undo and redo revert alignment edits", async ({ page }) => {
    await openEditorWithImages(page);
    await prepareCanvas(page);
    const moving = await movingImage(page);
    const selectPoint = await canvasPoint(page);
    await page.mouse.click(selectPoint.x, selectPoint.y); // selects the moving stack

    await page.getByRole("spinbutton", { name: "rotation" }).fill("90");
    await expect(moving).toHaveAttribute("transform", /rotate\(90,/);

    await page.getByRole("button", { name: "undo" }).click();
    await expect(moving).toHaveAttribute("transform", /rotate\(0,/);
    await expect(
      page.getByRole("spinbutton", { name: "rotation" })
    ).toHaveValue("0");

    await page.getByRole("button", { name: "redo" }).click();
    await expect(moving).toHaveAttribute("transform", /rotate\(90,/);
  });

  test("shows a toast when undoing and redoing", async ({ page }) => {
    await openEditorWithImages(page);
    // two uploads + the rename = 3 history entries, so undo is enabled
    await page.getByLabel("project name", { exact: true }).fill("Toast test");

    await page.getByRole("button", { name: "undo" }).click();
    await expect(page.getByText(/Undid SET_TITLE @/)).toBeVisible();
    // the snackbar auto-hides after 3s
    await expect(page.getByText(/Undid SET_TITLE @/)).toBeHidden({
      timeout: 6000,
    });

    await page.getByRole("button", { name: "redo" }).click();
    await expect(page.getByText(/Redid SET_TITLE @/)).toBeVisible();
  });

  test("shows an upload progress toast while images are uploading", async ({
    page,
  }) => {
    const pid = newProjectId();
    await mockEditorApi(page);
    await openEditor(page, pid);

    // delay the uploads so the transient progress snackbar stays visible
    await page.route(/\/api\/upload\//, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const base = "/api/uploads/" + pid + "/images/mock";
      const files = {
        url: base + "/mock.png",
        path: "uploads/" + pid + "/images/mock/mock.png",
        webUrl: base + "/mock.web.png",
        smallUrl: base + "/mock.128.png",
        mediumUrl: base + "/mock.512.png",
      };
      return route.fulfill({
        json: {
          metadata: {
            format: "png",
            width: 64,
            height: 48,
            files,
            destination: "uploads/" + pid + "/images/mock",
            size: 1234,
            uploaded: Date.now(),
            sizeStr: "1.2 kB",
          },
          ...files,
        },
      });
    });

    // no fixed image uploaded yet, so the moving stack becomes stack 0
    await uploadTo(page, "dropzone-moving", [movingBlue(), movingGreen()]);
    await expect(page.getByText(/Uploading \d+ \/ \d+/)).toBeVisible();

    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="0"]')
    ).toHaveCount(2);
    await expect(page.getByText(/Uploading \d+ \/ \d+/)).toBeHidden();
  });

  test("runs a (mocked) registration and shows the results drawer", async ({
    page,
  }) => {
    const pid = newProjectId();
    const job = makeJob({
      id: "job-e2e-fixed",
      projectId: pid,
      title: "E2E registration job",
    });
    const mocks = await mockEditorApi(page, { job });
    await mockResultsApi(page);
    await openEditor(page, pid);

    await uploadTo(page, "dropzone-fixed", [fixedA()]);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="0"]')
    ).toHaveCount(1);
    await uploadTo(page, "dropzone-moving", [movingBlue(), movingGreen()]);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="1"]')
    ).toHaveCount(2);

    const runButton = page.getByRole("button", { name: "run registration" });
    await expect(runButton).toBeEnabled();
    await runButton.click();
    await expect(runButton).toBeDisabled(); // in-progress for 10s

    await expect
      .poll(() => mocks.startRequests.length, { timeout: 20_000 })
      .toBe(1);
    expect(mocks.startRequests[0]?.includes(`/api/start/${pid}`)).toBe(true);
    await expect
      .poll(() => mocks.saveBodies.length, { timeout: 20_000 })
      .toBeGreaterThan(0);

    const allJobs = page
      .getByRole("button", { name: "shows all jobs" })
      .first();
    await expect(allJobs.locator(".MuiBadge-badge")).toHaveText("1");

    await allJobs.click();
    const row = page.locator("tr", { hasText: "job-e2e-fixed" });
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
});
