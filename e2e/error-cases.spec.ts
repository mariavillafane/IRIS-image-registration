import { expect, test, type Page } from "@playwright/test";
import { pngFile } from "./helpers/png";
import {
  cleanupProject,
  mockEditorApi,
  openEditor,
  uploadTo,
} from "./helpers/mocks";

// Error-path e2e coverage. These tests document how the app behaves when the
// backend fails; the findings are catalogued in docs/unhandled-error-cases.md.
const png = (name: string) =>
  pngFile(name, {
    width: 64,
    height: 48,
    left: [120, 40, 200],
    right: [40, 200, 120],
  });

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const demoProject = {
  id: "project-e2e-demo",
  title: "Demo Project",
  uploaded: Date.now(),
  thumbnail: "",
  workingImages: [{ id: 0, imageEntries: [{ id: "fixed-1" }] }],
};

let currentProjectId: string | undefined;

test.afterEach(async ({ request }) => {
  if (currentProjectId) await cleanupProject(request, currentProjectId);
  currentProjectId = undefined;
});

test.describe("backend failure handling", () => {
  test("a failed image upload does not add the image and keeps the editor usable", async ({
    page,
  }) => {
    currentProjectId = `project-e2e-err-${Date.now()}`;
    await mockEditorApi(page);
    await openEditor(page, currentProjectId);

    const pageErrors = collectPageErrors(page);
    await page.route(/\/api\/upload\//, (route) =>
      route.abort("connectionrefused")
    );

    await uploadTo(page, "dropzone-fixed", [png("fixed-a.png")]);

    // nothing was added to the canvas
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="0"]')
    ).toHaveCount(0);
    // the rejection currently escapes unhandled (documented gap: C1)
    await expect
      .poll(
        () =>
          pageErrors.some((error) =>
            /Failed to fetch|NetworkError/i.test(error)
          ),
        {
          timeout: 10_000,
        }
      )
      .toBe(true);

    // the editor stays functional - a retry succeeds
    await page.unroute(/\/api\/upload\//);
    await uploadTo(page, "dropzone-fixed", [png("fixed-b.png")]);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="0"]')
    ).toHaveCount(1);
  });

  test("a failed registration start re-enables the run button", async ({
    page,
  }) => {
    currentProjectId = `project-e2e-err-${Date.now()}`;
    const { startRequests } = await mockEditorApi(page);
    await openEditor(page, currentProjectId);
    const pageErrors = collectPageErrors(page);

    await uploadTo(page, "dropzone-fixed", [png("fixed-a.png")]);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="0"]')
    ).toHaveCount(1);
    await uploadTo(page, "dropzone-moving", [png("moving-a.png")]);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="1"]')
    ).toHaveCount(1);

    // abort after a delay so the in-progress state is observable
    await page.route(
      /\/api\/start\//,
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return route.abort("connectionrefused");
      },
      { times: 1 }
    );

    const runButton = page.getByRole("button", { name: "run registration" });
    await expect(runButton).toBeEnabled();
    await runButton.click();
    await expect(runButton).toBeDisabled(); // in progress while the request hangs
    await expect(runButton).toBeEnabled({ timeout: 10_000 }); // recovers after the failure
    expect(startRequests).toHaveLength(0); // the request never reached a server
    expect(pageErrors).toHaveLength(0); // the error is caught and swallowed (C3)
  });

  test("a failed project delete keeps the project listed and escapes unhandled", async ({
    page,
  }) => {
    await page.route(/\/api\/projects$/, (route) =>
      route.fulfill({ json: [demoProject] })
    );
    await page.route(/\/api\/status$/, (route) => route.fulfill({ json: {} }));
    await page.route(
      /\/api\/delete\//,
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return route.abort("connectionrefused");
      },
      { times: 1 }
    );
    const pageErrors = collectPageErrors(page);

    await page.goto("/registration-ui/");
    await expect(page.getByText("Demo Project")).toBeVisible();

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "SpeedDial basic example" }).click();
    await page.locator(".MuiSpeedDialAction-fab").nth(3).click(); // Delete action

    // no refresh happens and the project stays listed (documented gap: C4)
    await expect(page.getByText("Demo Project")).toBeVisible();
    await expect
      .poll(() => pageErrors.some((error) => /Failed to fetch/i.test(error)), {
        timeout: 10_000,
      })
      .toBe(true);
  });

  test("autosave failures are swallowed silently", async ({ page }) => {
    currentProjectId = `project-e2e-err-${Date.now()}`;
    await mockEditorApi(page, { mockSave: false });
    await openEditor(page, currentProjectId);

    const pageErrors = collectPageErrors(page);
    await page.route(/\/api\/save\//, (route) =>
      route.abort("connectionrefused")
    );

    await uploadTo(page, "dropzone-fixed", [png("fixed-a.png")]);
    await expect(
      page.locator('.myCanvas > svg image[data-stack-id="0"]')
    ).toHaveCount(1);

    // the debounced autosave fires ~3s after the upload
    await page.waitForTimeout(4500);

    // the .catch(e => e) in the autosave effect swallows the rejection - no
    // crash, but also no user feedback (documented gaps: C2 / C13)
    expect(pageErrors).toHaveLength(0);
    await expect(page.getByTestId("dropzone-fixed")).toBeVisible();
  });
});
