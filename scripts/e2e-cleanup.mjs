// Kills leftover e2e backend processes from a previous (crashed) run so the
// next `yarn e2e` cannot be wedged. Only OUR processes are matched:
//  - wrappers: node .../scripts/e2e-server.mjs
//  - backends: node dist/index.js whose working directory is .../server
// Anything else listening on the e2e port (docker, dev servers, ...) is left
// alone; playwright reports a clear port-in-use error in that case.
import { readdirSync, readFileSync, readlinkSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isWindows = process.platform === "win32";
if (isWindows) process.exit(0);

const SERVER_DIR_SUFFIX = "/server";

function cmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8")
      .replace(/\0/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function cwd(pid) {
  try {
    return readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return "";
  }
}

const killed = [];
for (const entry of readdirSync("/proc")) {
  if (!/^\d+$/.test(entry)) continue;
  const pid = Number(entry);
  if (pid === process.pid) continue;

  const cmd = cmdline(pid);
  if (!cmd) continue;

  const isWrapper = cmd.includes("scripts/e2e-server.mjs");
  const isBackend =
    /(^|\s)node\s+dist\/index\.js(\s|$)/.test(cmd) &&
    cwd(pid).endsWith(SERVER_DIR_SUFFIX);

  if (isWrapper || isBackend) {
    try {
      process.kill(pid, "SIGTERM");
      killed.push(`${pid} (${cmd.slice(0, 60)})`);
    } catch {
      // already gone
    }
  }
}

if (killed.length) {
  console.log(
    `[e2e-cleanup] terminated ${killed.length} stale e2e process(es):`
  );
  for (const k of killed) console.log(`  - ${k}`);
} else {
  console.log("[e2e-cleanup] no stale e2e processes");
}
