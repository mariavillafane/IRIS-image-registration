import * as fs from "fs/promises";

import { spawn } from "child_process";
import type { ChildProcessWithoutNullStreams } from "child_process";
import { randomUUID } from "crypto";
import { mkdirp } from "mkdirp";
import { glob } from "glob";

import type { ProjectSettings, Task } from "../../types.js";

export const queue: string[] = [];
export const processes: Record<string, ChildProcessWithoutNullStreams> = {};
export const tasks: Record<string, Task> = {};

export async function createTask(projectId: string): Promise<Task> {
  const jobId = "job-" + randomUUID();
  await mkdirp(`uploads/${jobId}`);
  await fs.copyFile(
    `uploads/${projectId}/settings.json`,
    `uploads/${jobId}/settings.json`
  );
  await fs.copyFile(
    `uploads/${projectId}/thumbnail.png`,
    `uploads/${jobId}/thumbnail.png`
  );

  const settingsJson = await fs
    .readFile(`uploads/${projectId}/settings.json`, "utf-8")
    .then((x) => JSON.parse(x) as ProjectSettings);

  tasks[jobId] = {
    id: jobId,
    projectId,
    title: settingsJson.title,
    fixedImage: settingsJson.workingImages?.[0]?.imageEntries?.[0],
    images: (settingsJson.workingImages ?? []).flatMap(
      (x) => x.imageEntries ?? []
    ).length,
    datacubes: settingsJson.workingImages?.length ?? 0,
    thumbnail: `/api/uploads/${jobId}/thumbnail.png`,
    progress: [0, 0],
    startTime: Date.now(),
    endTime: 0,
    updated: Date.now(),
    message: "",
    status: "queued",
  };

  await fs.writeFile(
    `uploads/${jobId}/task.json`,
    JSON.stringify(tasks[jobId], null, 2)
  );

  return tasks[jobId];
}

export async function startTask(
  jobId: string
): Promise<number | null | undefined> {
  const task = tasks[jobId];
  if (!task) {
    console.error(`startTask: unknown task ${jobId}`);
    return;
  }
  task.done = 0;
  task.status = "started";

  const p = spawn("python", [
    "../scripts_registration/imreg_python__read-json-settings.py",
    `uploads/${jobId}/settings.json`,
    `uploads/${jobId}`,
  ]);

  processes[jobId] = p;

  p.stdout.on("data", (data) => {
    if (task.done) return;

    const str = data.toString();
    task.updated = Date.now();
    const matches = str.match(/#\[progress:(\d+)\/(\d+)\]/);
    if (matches) {
      const [_, i, count] = matches;
      task.progress = [i ?? "0", count ?? "0"];
      console.log("progress", [jobId, i, count]);
    }

    //tasks[jobId].message += str;
  });

  p.stderr.on("data", (data) => {
    if (task.done) return;
    const str = data.toString();

    task.updated = Date.now();
    task.message += str;
  });

  return new Promise((done) => {
    p.on("close", async (code) => {
      if (task.done) return;
      task.updated = Date.now();
      task.endTime = Date.now();
      task.done = Date.now();
      task.status = code ? "error" : "success";
      await fs.writeFile(
        `uploads/${jobId}/task.json`,
        JSON.stringify(task, null, 2)
      );
      done(code);
    });
  });
}

let processing = false;
async function processQueue(): Promise<void> {
  if (processing) return;
  while (queue.length) {
    processing = true;
    const job = queue.pop();
    if (job) await startTask(job);
  }
  processing = false;
}

export function enqueueJob(job: Task): string {
  queue.push(job.id);
  const status = queue.length == 1 ? "started" : "queued";
  processQueue();

  return status;
}

export async function loadTasks(): Promise<void> {
  const paths = await glob("uploads/job-*/task.json");
  const savedTasks: Task[] = await Promise.all(
    paths.map(async (path) => {
      const content = await fs.readFile(path.replace(/\\/g, "/"), "utf8");
      return JSON.parse(content) as Task;
    })
  );

  savedTasks.forEach((job) => {
    tasks[job.id] = job;
  });

  if (!queue.length) {
    savedTasks
      .filter(
        (x) =>
          (x.status == "started" && !processes[x.id]) || x.status == "queued"
      )
      .forEach((job) => {
        enqueueJob(job);
      });
  }
}
