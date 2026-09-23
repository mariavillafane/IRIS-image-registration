# Unhandled error cases in IRIS

Catalogue of code paths where errors are either not handled at all, handled
silently, or handled inconsistently. Produced by reviewing every `fetch` /
async call in the client (`src/`) and the server (`server/`), plus e2e
error-path tests in `e2e/error-cases.spec.ts` (Chromium, real backend with
injected network failures).

Legend for "e2e" column:

- `covered` – asserted by a test in `e2e/error-cases.spec.ts` or `e2e/editor.spec.ts`
- `documented` – behaviour documented here only (no automated test)

## Client

### C1 — image upload failure escapes unhandled (ImageUploader)

- **Where**: `src/Editor/ImageUploader.tsx` – `onDrop2` / `onDropImageToStack`
  (`await uploadImage(...)` inside `Promise.all`); `src/utils/actions.ts` – `uploadImage`.
- **Trigger**: network failure or non-JSON response during `POST /api/upload/:id`.
- **Current behaviour**: the async drop handler rejects with no catcher →
  _unhandled promise rejection_ (surfaces as `Uncaught (in promise)` page
  error). No toast/snackbar, no state change; the user only sees that nothing
  happened. Retrying works.
- **Extra hazard**: `uploadImage` does **not** check `response.ok`. A `500`
  with a JSON body resolves "successfully", so a broken entry (no `imageUrl`,
  undefined metadata fields) is added to the stack and saved.
- **User impact**: silent data loss for that upload; confusing broken
  thumbnails.
- **Suggested fix**: wrap the drop handlers in try/catch + show an error
  `Alert` in the existing upload `Snackbar`; check `response.ok` in
  `uploadImage` and throw a typed error.
- **e2e**: covered – "a failed image upload does not add the image and keeps
  the editor usable" (asserts no image is added, the rejection escapes, and a
  retry works).

### C2 — autosave failure swallowed silently (Editor)

- **Where**: `src/Editor/index.tsx` – autosave effect
  (`saveSettings(settingsJson).catch((e) => e).then(console.log)`).
- **Trigger**: network failure during the debounced `POST /api/save/:id`.
- **Current behaviour**: the rejection is deliberately converted to a value
  and logged. No crash, no user feedback, no retry.
- **User impact**: the user believes their alignment work is saved; on reload
  the project silently reverts to the last successful save.
- **Suggested fix**: track the last failure and surface a "saving failed"
  banner with a retry button; keep a local backup (e.g. localStorage) as a
  fallback.
- **e2e**: covered – "autosave failures are swallowed silently" (asserts no
  crash _and_ zero unhandled rejections, pinning the current behaviour).

### C3 — registration start failure only resets a flag (EditorAppBar)

- **Where**: `src/Editor/EditorAppBar.tsx` – run button
  (`await runRegistration(settingsJson).catch(() => setInProgress(false))`).
- **Trigger**: network failure or server error on `POST /api/start/:id`.
- **Current behaviour**: the catch only flips `inProgress` back to `false`.
  Additionally `runRegistration` never checks `response.ok`, so a `500` with a
  JSON body is treated as _success_ and the button stays disabled for the full
  10 s.
- **User impact**: no message explaining why registration did not start.
- **Suggested fix**: check `response.ok` and show an error Alert.
- **e2e**: covered – "a failed registration start re-enables the run button"
  (hang-then-abort: disabled state observable, recovery asserted, no
  unhandled rejections).

### C4 — project delete failure escapes unhandled (ProjectCard)

- **Where**: `src/Project/index.tsx` – SpeedDial Delete
  (`fetch(...).then(console.log).then(refresh)`).
- **Trigger**: network failure during `POST /api/delete/:id`.
- **Current behaviour**: no `.catch` → unhandled promise rejection; `refresh`
  is never called, so the project card stays (misleading, but consistent with
  the server state).
- **User impact**: no feedback that the deletion failed.
- **Suggested fix**: try/catch + error toast; only call `refresh` on success
  (and ideally check `response.ok`).
- **e2e**: covered – "a failed project delete keeps the project listed and
  escapes unhandled" (asserts the card remains and the rejection surfaces).

### C5 — job stop / resume / delete-job failures escape unhandled (ProjectView)

- **Where**: `src/Project/index.tsx` – Stop / Restart / Delete buttons in the
  job accordion (`await fetch(apiUrl(...), { method: "POST" }); refresh();`).
- **Trigger**: network failure on those POSTs.
- **Current behaviour**: no try/catch → unhandled rejection; the UI still
  calls `refresh()` only in the success path (Stop/Restart) — actually the
  rejection aborts the whole handler before `refresh()`.
- **User impact**: the row keeps showing the old status with no feedback.
- **Suggested fix**: wrap in try/catch + toast.
- **e2e**: documented (same mechanism as C4).

### C6 — results fetch failures silently empty (JobViewer + ProjectView)

- **Where**: `src/Editor/JobViewer.tsx` – `fetchResults`, `TransformationData`;
  `src/Project/index.tsx` – `JobResults`, `TransformationData`.
- **Trigger**: `GET /api/results/:id` or the transformation JSON fails.
- **Current behaviour**: no `.catch` → unhandled rejection; the drawer/section
  stays empty; the transformation chips render placeholder text.
- **User impact**: results silently missing.
- **Suggested fix**: catch + "could not load results" message with retry.
- **e2e**: documented.

### C7 — "apply transformation to more images" loop swallows errors

- **Where**: `src/Editor/JobViewer.tsx` and `src/Project/index.tsx` –
  `TransformationData` dropzone (`fetch(apiUrl("/api/transform"), ...).catch((e) => e)`).
- **Trigger**: failure of `POST /api/transform` (or the preceding upload).
- **Current behaviour**: the loop continues silently; the user cannot tell
  whether the transform ran. Note the server always answers `done`, even when
  `exec` failed (`server/services/transform.ts`), so success is
  indistinguishable from failure by design.
- **User impact**: transformed images may silently not exist.
- **Suggested fix**: return a server-side status (exit code / stderr) and
  surface per-file success/failure in the UI.
- **e2e**: documented.

### C8 — projects / server-info fetch failures leave blank UI

- **Where**: `src/Project/index.tsx` – overview `useEffect`
  (`fetch(apiUrl("/api/projects")).then(...)`); `src/index.tsx` –
  `fetch("/api/server-info")` (has a `.catch` that only logs).
- **Trigger**: backend down while loading the overview.
- **Current behaviour**: unhandled rejection for `/api/projects` (blank
  projects grid, no error state); server-info silently falls back to relative
  URLs (acceptable).
- **User impact**: empty overview that looks like "no projects".
- **Suggested fix**: error state + retry button on the overview.
- **e2e**: documented.

### C9 — canvas export helpers can reject unhandled

- **Where**: `src/utils/actions.ts` – `downloadCanvas` / `saveCanvas`
  (passed directly as the `onClick` of the Canvas button); `svgToPng` throws
  when the canvas is missing or Canvg fails.
- **Trigger**: clicking "Canvas" while no canvas is rendered, or Canvg image
  load failure.
- **Current behaviour**: unhandled rejection, no download.
- **User impact**: silent no-op.
- **Suggested fix**: toast on failure.
- **e2e**: documented.

### C10 — image-entry delete fetch can reject unhandled (ImageUploader)

- **Where**: `src/Editor/ImageUploader.tsx` – ClearIcon handler
  (`fetch(basePath, { method: "delete" }).catch(console.error)`).
- **Trigger**: network failure deleting the server-side image folder.
- **Current behaviour**: handled (logged only) — the entry is removed from the
  UI regardless, leaving orphaned files on the server.
- **User impact**: minor (orphaned server files).
- **e2e**: documented.

### C11 — dead code with unhandled paths: `loadSettings`

- **Where**: `src/utils/actions.ts` – `loadSettings` (currently unused by any
  component).
- **Trigger**: any reader/parse failure.
- **Current behaviour**: would reject unhandled if ever wired up.
- **Suggested fix**: remove the dead code or wire it with proper error
  handling.
- **e2e**: n/a.

### C12 — localStorage quota errors (usePersistentState / saveCanvas)

- **Where**: `src/Editor/index.tsx` – `usePersistentState`,
  `src/utils/actions.ts` – `saveCanvas` (`localStorage.setItem("preview", png)`).
- **Trigger**: quota exceeded (large base64 previews make this plausible).
- **Current behaviour**: unhandled exception inside a state updater / async
  fn.
- **User impact**: rare; zoom-speed preference or preview silently lost.
- **Suggested fix**: try/catch around `setItem`.
- **e2e**: documented.

### C13 — settings fetch conflates "new project" with any error (Editor)

- **Where**: `src/Editor/index.tsx` – load effect
  (`.catch(() => dispatch({ type: "SET_LOADING", payload: false }))`).
- **Trigger**: server down, 500, proxy error — anything.
- **Current behaviour**: every failure is treated as "project does not exist
  yet" and the editor opens empty; the user could edit a phantom project and
  autosave would then create it.
- **User impact**: confusing empty editor on transient backend errors.
- **Suggested fix**: distinguish 404 from other statuses; show an error state
  with retry.
- **e2e**: documented (the happy-path 404 → empty editor is exercised by every
  editor test).

## Server

### S1 — spawn("python") has no error handler (jobs)

- **Where**: `server/services/tasks/jobs.ts` – `startTask`
  (`const p = spawn("python", [...])`).
- **Trigger**: `python` not on PATH / spawn failure.
- **Current behaviour**: the child process emits `'error'` with **no
  listener** → uncaught exception → **the whole backend crashes** (the queue
  dies with it).
- **Suggested fix**: `p.on("error", ...)` → mark the task `status: "error"`
  with the message and continue the queue.
- **e2e**: documented (needs a backend without python on PATH to reproduce).

### S2 — task.json write failures inside the close handler (jobs)

- **Where**: `server/services/tasks/jobs.ts` – `p.on("close", async (code) => {...})`.
- **Trigger**: disk full / permissions error while writing `uploads/<jobId>/task.json`.
- **Current behaviour**: async callback rejection is unhandled → backend crash.
- **Suggested fix**: wrap in try/catch, log, keep the in-memory status.
- **e2e**: documented.

### S3 — queue loop dies silently on unexpected errors (jobs)

- **Where**: `server/services/tasks/jobs.ts` – `processQueue`
  (`await startTask(job)` inside `while (queue.length)`, called without await
  from `enqueueJob`).
- **Trigger**: any throw from `startTask` (e.g. S1/S2 paths before they are
  fixed).
- **Current behaviour**: rejection propagates out of the un-awaited async fn →
  unhandled rejection; `processing` stays `true` → **the queue never processes
  another job** until restart.
- **Suggested fix**: try/catch inside the loop, set `processing = false` in a
  `finally`, mark the task failed.
- **e2e**: documented.

### S4 — /api/images 500s on corrupt JSON (results)

- **Where**: `server/services/results.ts` – `/api/images`.
- **Trigger**: a non-JSON or corrupt `uploads/*/*.json` file (e.g. crashed
  write).
- **Current behaviour**: `JSON.parse` throws → Express 5 returns 500. The old
  `require()` bug (ESM) was fixed during the TS conversion; the corrupt-file
  case remains an error page.
- **Suggested fix**: skip unparseable files (or return per-file errors).
- **e2e**: documented.

### S5 — /api/transform always answers "done" (transform)

- **Where**: `server/services/transform.ts`.
- **Trigger**: python script fails (bad paths, missing image).
- **Current behaviour**: `exec` errors are logged but the response is always
  `res.end("done")`; the client cannot distinguish success from failure (see C7).
- **Suggested fix**: respond with the exit code / a status JSON.
- **e2e**: documented.

### S6 — /api/import reports success even when unzip fails (import)

- **Where**: `server/services/import.ts` – `/api/import`.
- **Trigger**: corrupt/non-zip upload.
- **Current behaviour**: `.catch(console.error)` then `res.end("")` → the
  client refreshes and the imported project simply never appears.
- **Suggested fix**: 4xx/5xx response + client-side error toast (see C8-class
  handling).
- **e2e**: documented.

## Priority recommendations

1. **Crash risks (server)**: S1, S2, S3 — a missing python or a failed
   `task.json` write can take down the whole backend mid-registration. Highest
   impact, smallest fix.
2. **Silent data loss (client)**: C2 (autosave) and C1 (uploads) — users lose
   alignment work without any signal. Add response.ok checks + error toasts.
3. **Misleading success**: C3/C7/S5 — HTTP/status plumbing so the UI can tell
   failures from successes.
4. **Empty-UI robustness**: C6, C8, C13 — error states with retry.
