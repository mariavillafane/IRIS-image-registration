import express from "express";
import cors from "cors";

import { mkdirp } from "mkdirp";
import { loadTasks, tasksApi } from "./services/tasks/index.js";
import { resultsApi } from "./services/results.js";
import { transformApi } from "./services/transform.js";
import { importApi } from "./services/import.js";

const app = express(); //express() creates a http server

// PORT is honored so the e2e suite can run alongside a locally running
// IRIS instance (production/Docker keeps the default 4000).
const port = Number(process.env.PORT) || 4000;

mkdirp("tmp");
loadTasks();

// Increase request body size limits for large file uploads
app.set("limit", "5000mb");
app.use(express.json({ limit: "5000mb" }));
app.use(express.urlencoded({ limit: "5000mb", extended: true }));

// Enable CORS only in development so the React dev server (localhost:3000)
// can make requests directly to the backend on localhost:4000.
if (process.env.NODE_ENV !== "production") {
  const allowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like curl, postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
          return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );
}

// Return server info (full URL) for the frontend to consume
// Constructs the full URL from the request headers
app.get("/api/server-info", (req, res) => {
  const protocol = req.protocol || "http";
  const host = req.get("host") || "localhost:4000";
  const serverUrl = `${protocol}://${host}`;
  res.json({ serverUrl, port });
});

app.use(importApi);
app.use(tasksApi);
app.use(resultsApi);
app.use(transformApi);

app.use("/api/uploads", express.static("./uploads"));
app.use("/registration-ui", express.static("../build"));
app.get("/", (req, res) => {
  res.redirect("/registration-ui");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
