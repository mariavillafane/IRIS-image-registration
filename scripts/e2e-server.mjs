// Web server for Playwright E2E tests.
//
// Ensures the client (build/) and server (server/dist) outputs exist and are
// fresh, then starts the compiled Express backend on port 4000 in production
// mode - the same way the Docker image runs it. Playwright waits for
// http://localhost:4000/api/server-info before running tests.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "server");

function newestMtimeMs(dir, { extensions = null, exclude = [] } = {}) {
  let newest = 0;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (exclude.includes(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        !extensions ||
        extensions.some((ext) => entry.name.endsWith(ext))
      ) {
        newest = Math.max(newest, statSync(full).mtimeMs);
      }
    }
  };
  walk(dir);
  return newest;
}

function isStale(sourceDirs, sourceFiles, outputFile) {
  if (!existsSync(outputFile)) return true;
  const outTime = statSync(outputFile).mtimeMs;
  const sourceTime = Math.max(
    ...sourceFiles.map((file) => statSync(path.join(root, file)).mtimeMs),
    ...sourceDirs.map((dir) =>
      newestMtimeMs(path.join(root, dir), {
        exclude: ["node_modules", "build", "dist"],
      })
    )
  );
  return sourceTime > outTime;
}

function run(cmd, args, cwd) {
  console.log(`[e2e-server] running: ${cmd} ${args.join(" ")} (cwd=${cwd})`);
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(
      `[e2e-server] command failed with exit code ${result.status}`
    );
    process.exit(result.status ?? 1);
  }
}

// 1. Client build (skipped when build/ is newer than src/ and public/).
if (
  isStale(
    ["src", "public"],
    ["package.json", "tsconfig.json"],
    path.join(root, "build", "index.html")
  )
) {
  run("yarn", ["build"], root);
} else {
  console.log("[e2e-server] client build is up to date");
}

// 2. Server build (skipped when server/dist is newer than the TS sources).
if (
  isStale(
    [path.join("server", "services")],
    [
      path.join("server", "index.ts"),
      path.join("server", "types.ts"),
      path.join("server", "package.json"),
      path.join("server", "tsconfig.json"),
    ],
    path.join(serverDir, "dist", "index.js")
  )
) {
  run("yarn", ["build"], serverDir);
} else {
  console.log("[e2e-server] server build is up to date");
}

// 3. Start the backend exactly like the Docker image does.
const child = spawn("node", ["dist/index.js"], {
  cwd: serverDir,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: "inherit",
});

const shutdown = (signal) => {
  child.kill(signal);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("exit", (code) => process.exit(code ?? 0));
