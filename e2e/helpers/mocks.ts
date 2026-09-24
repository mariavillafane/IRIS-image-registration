import { expect, type Page, type Route } from "@playwright/test";
import type { Task } from "../../src/types";

export type Job = Task;

/** Builds a job object shaped like the server's /api/status entries. */
export function makeJob(overrides: Partial<Job> = {}): Job {
  const now = Date.now();
  return {
    id: "job-e2e-0001",
    projectId: "project-e2e",
    title: "E2E registration job",
    progress: [4, 4],
    startTime: now - 60_000,
    endTime: now,
    updated: now,
    message: "",
    status: "success",
    thumbnail: "",
    ...overrides,
  };
}

export interface EditorMocks {
  /** Bodies captured from (mocked) POST /api/save/:id calls. */
  saveBodies: Record<string, unknown>[];
  startRequests: string[];
}

/**
 * Installs the standard editor mocks:
 *  - GET /api/status  -> job queue (empty by default)
 *  - POST /api/save/:id -> success, body captured (the editor autosaves)
 * Everything else (uploads, thumbnails, static image serving) hits the real
 * backend so the actual image pipeline is exercised.
 */
export async function mockEditorApi(
  page: Page,
  { job = null, mockSave = true }: { job?: Job | null; mockSave?: boolean } = {}
): Promise<EditorMocks> {
  const saveBodies: Record<string, unknown>[] = [];
  const startRequests: string[] = [];

  await page.route(/\/api\/status$/, (route: Route) =>
    route.fulfill({ json: job ? { [job.id]: job } : {} })
  );
  if (mockSave) {
    await page.route(/\/api\/save\//, (route: Route) => {
      try {
        saveBodies.push(JSON.parse(route.request().postData() ?? "{}"));
      } catch {
        saveBodies.push({});
      }
      return route.fulfill({ json: { status: "success" } });
    });
  }
  await page.route(/\/api\/start\//, (route: Route) => {
    startRequests.push(route.request().url());
    return route.fulfill({ json: job ?? makeJob() });
  });

  return { saveBodies, startRequests };
}

/** Mocks GET /api/results/:id (per job) and the transformation JSON + result images. */
export async function mockResultsApi(
  page: Page,
  transformation = {
    transformation_obtained_s3: { tx: 1.5, ty: -2 },
    transformation_obtained_s4: { mi_average: 0.42 },
  }
) {
  await page.route(/\/api\/results\//, (route: Route) => {
    // derive the job id from the requested URL so every job gets its own results
    const jobId =
      route.request().url().split("/api/results/")[1]?.replace(/\/$/, "") ??
      "job-e2e";
    const results = [
      `/api/uploads/${jobId}/${jobId}_transformations.json`,
      `/api/uploads/${jobId}/${jobId}_moving-registered.png`,
    ];
    return route.fulfill({ json: results });
  });
  await page.route(/_transformations\.json$/, (route: Route) =>
    route.fulfill({ json: transformation })
  );
  await page.route(/moving-registered\.png$/, (route: Route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      ),
    })
  );
}

/** Opens the editor for a fresh project id and waits for it to load. */
export async function openEditor(page: Page, projectId: string) {
  await page.goto(`/#/${projectId}`); // route :id === the full project id
  await expect(page.getByTestId("dropzone-fixed")).toBeVisible();
}

/** Uploads PNG fixtures into one of the editor dropzones. */
export async function uploadTo(
  page: Page,
  dropzoneTestId: string,
  files: { name: string; mimeType: string; buffer: Buffer }[]
) {
  await page
    .locator(`[data-testid="${dropzoneTestId}"] input[type="file"]`)
    .setInputFiles(files);
}

/** Removes all server-side uploads/projects created for a test project. */
export async function cleanupProject(
  request: import("@playwright/test").APIRequestContext,
  projectId: string
) {
  await request.post(`/api/delete/${projectId}`).catch(() => {});
}
