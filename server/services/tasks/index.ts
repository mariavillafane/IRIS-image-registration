import * as fs from "fs/promises";
import { glob } from "glob";

import { rimraf } from "rimraf";

import { Router } from "express";
import { createTask, enqueueJob, processes, tasks } from "./jobs.js";

export * from "./jobs.js";

export const tasksApi = Router();

tasksApi.post("/api/start/:id", async (request, response) => {
  const { id } = request.params;

  const job = await createTask(id);
  const status = enqueueJob(job);

  response.json({ ...job, status });
});

tasksApi.get("/api/status", async (_req, res) => {
  res.json(tasks);
});

tasksApi.get("/api/projects", async (_req, res) => {
  const paths = await glob("./uploads/project-*/settings.json");
  const files = await Promise.all(
    paths.map(async (path) => {
      const content = await fs.readFile(path.replace(/\\/g, "/"), "utf8");
      return JSON.parse(content);
    })
  );
  res.json(files);
});

tasksApi.post("/api/delete/:id", async (req, res) => {
  const { id } = req.params;
  processes[id]?.kill();
  await rimraf(`uploads/${id}`).catch(console.log);
  delete tasks[id];
  res.json({});
});

tasksApi.post("/api/stop/:id", async (req, res) => {
  const { id } = req.params;
  const task = tasks[id];
  processes[id]?.kill();
  delete processes[id];
  if (task) {
    task.status = "stopped";
    task.done = Date.now();
    task.message = "stopped by user";

    await fs.writeFile(
      `uploads/${id}/task.json`,
      JSON.stringify(task, null, 2)
    );
  }

  res.json(tasks);
});

tasksApi.post("/api/resume/:id", async (req, res) => {
  const { id } = req.params;

  if (!tasks[id] || tasks[id].status != "stopped") {
    return res.json(tasks);
  }

  console.log("enqueueing", tasks[id]);
  enqueueJob(tasks[id]);

  res.json(tasks);
});
