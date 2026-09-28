import { expect, test, type Page, type Route } from "@playwright/test";
import { pngFile } from "./helpers/png";
import {
  makeJob,
  mockEditorApi,
  openEditor,
  type Job,
} from "./helpers/mocks";

// Tests for "Apply Transformation to More Images":
//  - the /api/transform endpoint contract on the real backend (400 on a bad
//    body, 500 with the python error when the script fails),
//  - the UI flow: dropping an image must POST /api/transform and refresh the
//    results so the transformed image appears without a page reload,
//  - the failure flow: a failing transform must surface an alert instead of
//    failing silently (the pre-fix behaviour: 200 "done" + no feedback, while
//    the python script crashed on grayscale/16-bit images).
//
// The transformation itself is mocked at the network level (like the
// registration job layer elsewhere) so no Python is needed.

const jobId = "job-e2e-transform";
const uploadedUrl = `/api/uploads/${jobId}/images/abc123/extra-image.png`;
const transformationJsonPath = `/api/uploads/${jobId}/results/mov_img_0_transformations.json`;
const transformedPng = `/api/uploads/${jobId}/results/mov_img_0/abc123/Final_transformed_image_0.png`;
const transformation = {
  transformation_obtained_s3: { tx: 1.5, ty: -2 },
  transformation_obtained_s4: { mi_average: 0.42 },
};

type TransformRequest = { transformation: string; image: string };

// 1x1 png, same fixture the results mocks use
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const extraImage = () =>
  pngFile("extra-image.png", {
    width: 64,
    height: 48,
    left: [20, 20, 20],
    right: [220, 220, 220],
  });

const baseResults = [
  transformationJsonPath,
  `/api/uploads/${jobId}/results/mov_img_0_moving-registered.png`,
];

interface TransformMocks {
  /** number of GET /api/results/:jobId requests served so far */
  resultsRequests: () => number;
}

/**
 * Mocks the result-side APIs used by the results views:
 *  - GET  /api/results/:jobId -> stateful list: the transformed image is only
 *    returned from the SECOND call on (i.e. after the UI refresh)
 *  - GET  <transformation>.json -> transformation chips data
 *  - POST /api/upload/:id -> returns a stable uploaded url (no server files)
 *  - result images -> tiny png
 * POST /api/transform is NOT mocked here; each test installs its own.
 */
async function mockTransformResults(page: Page): Promise<TransformMocks> {
  let resultsRequests = 0;

  await page.route(/\/api\/projects$/, (route) => route.fulfill({ json: [] }));
  await page.route(new RegExp(`/api/results/${jobId}$`), (route) => {
    resultsRequests += 1;
    const list =
      resultsRequests > 1 ? [...baseResults, transformedPng] : baseResults;
    return route.fulfill({ json: list });
  });
  await page.route(/_transformations\.json$/, (route) =>
    route.fulfill({ json: transformation })
  );
  await page.route(/\/api\/upload\//, (route) =>
    route.fulfill({
      json: {
        metadata: { files: { url: uploadedUrl } },
        url: uploadedUrl,
        path: uploadedUrl.replace("/api/", ""),
        webUrl: "",
        smallUrl: "",
        mediumUrl: "",
      },
    })
  );
  await page.route(/moving-registered\.png$/, (route) =>
    route.fulfill({ contentType: "image/png", body: tinyPng })
  );
  await page.route(/Final_transformed_image_0\.png$/, (route) =>
    route.fulfill({ contentType: "image/png", body: tinyPng })
  );

  return { resultsRequests: () => resultsRequests };
}

/** Serves POST /api/transform with 200 "done", capturing the request bodies. */
async function mockTransformSuccess(
  page: Page,
  captured: TransformRequest[]
): Promise<void> {
  await page.route(/\/api\/transform$/, (route) => {
    try {
      captured.push(JSON.parse(route.request().postData() ?? "{}"));
    } catch {
      captured.push({ transformation: "", image: "" });
    }
    return route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "done",
    });
  });
}

test.describe("apply transformation to more images", () => {
  test("transform API: validates the body and reports python failures", async ({
    request,
  }) => {
    // missing fields -> 400 (no python involved)
    const missing = await request.post("/api/transform", { data: {} });
    expect(missing.status()).toBe(400);
    const missingBody = await missing.json();
    expect(missingBody.error).toContain("transformation");

    // a transform request whose files do not exist must fail loudly (HTTP 500
    // with the python error), not reply 200 "done" like before the fix
    const failed = await request.post("/api/transform", {
      data: {
        transformation: transformationJsonPath,
        image: uploadedUrl,
      },
    });
    expect(failed.status()).toBe(500);
    const failedBody = await failed.json();
    expect(String(failedBody.error).length).toBeGreaterThan(0);

    // clean up the (empty) destination folders the failed run created
    await request.post(`/api/delete/${jobId}`);
  });

  test("dropping an image applies the transformation and refreshes the results", async ({
    page,
  }) => {
    const job = makeJob({ id: jobId, status: "success", progress: [4, 4] });
    await page.route(/\/api\/status$/, (route) =>
      route.fulfill({ json: { [jobId]: job } as Record<string, Job> })
    );
    const mocks = await mockTransformResults(page);
    const transformRequests: TransformRequest[] = [];
    await mockTransformSuccess(page, transformRequests);

    await page.goto("/registration-ui/");
    const row = page.locator(".MuiAccordion-root", { hasText: jobId });
    await row.locator(".MuiAccordionSummary-root").click();
    await expect(row.getByText("tx: 1.5")).toBeVisible();
    await expect(
      row.locator('img[src*="moving-registered.png"]')
    ).toBeVisible();

    // drop an additional image onto "Apply Transformation to More Images"
    await row.locator('input[type="file"]').setInputFiles([extraImage()]);

    // one POST /api/transform with the recorded transformation and the
    // uploaded image url
    await expect.poll(() => transformRequests.length).toBe(1);
    expect(transformRequests[0]).toEqual({
      transformation: transformationJsonPath,
      image: uploadedUrl,
    });

    // the results are refreshed without a page reload and the transformed
    // image shows up next to the registered ones
    await expect
      .poll(() => mocks.resultsRequests(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);
    await expect(
      row.locator('img[src*="Final_transformed_image_0"]')
    ).toBeVisible();
  });

  test("a failing transformation shows an alert with the python error", async ({
    page,
  }) => {
    const job = makeJob({ id: jobId, status: "success", progress: [4, 4] });
    await page.route(/\/api\/status$/, (route) =>
      route.fulfill({ json: { [jobId]: job } as Record<string, Job> })
    );
    const mocks = await mockTransformResults(page);
    await page.route(/\/api\/transform$/, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "Traceback (most recent call last):\n  cv2.error: OpenCV(3.4.2) ... assertion failed in function 'CvtHelper'",
        }),
      })
    );

    const alerts: string[] = [];
    page.on("dialog", (dialog) => {
      alerts.push(dialog.message());
      return dialog.dismiss();
    });

    await page.goto("/registration-ui/");
    const row = page.locator(".MuiAccordion-root", { hasText: jobId });
    await row.locator(".MuiAccordionSummary-root").click();
    await expect(row.getByText("tx: 1.5")).toBeVisible();

    await row.locator('input[type="file"]').setInputFiles([extraImage()]);

    // the failure surfaces to the user, naming the file and the error
    await expect
      .poll(() => alerts.length, { timeout: 15_000 })
      .toBe(1);
    expect(alerts[0]).toContain("extra-image.png");
    expect(alerts[0]).toContain("cv2.error");

    // the results are not refreshed (still only the initial fetch)
    await page.waitForTimeout(500);
    expect(mocks.resultsRequests()).toBe(1);
    await expect(
      row.locator('img[src*="Final_transformed_image_0"]')
    ).toHaveCount(0);
  });

  test("the job drawer offers the same flow and refreshes its results", async ({
    page,
  }) => {
    const pid = `project-e2e-transform-${Date.now()}`;
    const job = makeJob({ id: jobId, projectId: pid, status: "success" });
    await mockEditorApi(page, { job });
    const mocks = await mockTransformResults(page);
    const transformRequests: TransformRequest[] = [];
    await mockTransformSuccess(page, transformRequests);

    await openEditor(page, pid);

    // open the job queue drawer and the job's results
    const allJobs = page
      .getByRole("button", { name: "shows all jobs" })
      .first();
    await expect(allJobs.locator(".MuiBadge-badge")).toHaveText("1");
    await allJobs.click();
    const tableRow = page.locator("tr", { hasText: jobId });
    await expect(tableRow).toBeVisible();
    await tableRow.click();

    await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
    await expect(
      page.locator('img[src*="moving-registered.png"]')
    ).toBeVisible();

    // drop an image on the drawer's transform dropzone
    await page
      .locator(".MuiDrawer-root input[type='file']")
      .setInputFiles([extraImage()]);

    await expect.poll(() => transformRequests.length).toBe(1);
    expect(transformRequests[0]).toEqual({
      transformation: transformationJsonPath,
      image: uploadedUrl,
    });
    await expect
      .poll(() => mocks.resultsRequests(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);
    await expect(
      page.locator('img[src*="Final_transformed_image_0"]')
    ).toBeVisible();
  });
});