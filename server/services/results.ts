import { glob } from "glob";
import { Router } from "express";
import archiver from "archiver";
import * as fs from "fs/promises";

export const resultsApi = Router();

resultsApi.get("/api/results/:id", async (req, res) => {
  const id = req.params.id;
  const destination_folder = `uploads/${id}/results`;

  const listOfFilesResultingFromRegistration = await glob(
    `${destination_folder}/**`
  );

  const finallist = listOfFilesResultingFromRegistration
    .map((x) => x.replace(/\\/g, "/").replace(destination_folder, ""))
    .map((fileName) => `/api/uploads/${id}/results${fileName}`);
  res.json(finallist);
});

resultsApi.get("/api/images", async (_req, res) => {
  // NOTE: this endpoint used to `require()` each JSON file, which is not
  // available in an ESM package - it crashed whenever any project existed.
  // The files are read and parsed explicitly instead.
  const paths = await glob("./uploads/*/*.json");
  const files = await Promise.all(
    paths.map(async (path) => {
      const content = await fs.readFile(path.replace(/\\/g, "/"), "utf8");
      return JSON.parse(content);
    })
  );
  res.json(files);
});

resultsApi.get("/api/export/:id", async (req, res) => {
  const folderToZip = "uploads/" + req.params.id; // Replace 'your-folder' with your folder name
  const zipFileName = req.params.id + ".zip";

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename=${zipFileName}`);

  const archive = archiver("zip", {
    zlib: { level: 9 }, // Sets the compression level
  });

  // Listen for all archive data to be written
  archive.on("end", () => {
    console.log("Archive wrote %d bytes", archive.pointer());
  });

  // Good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on("warning", (err) => {
    if (err.code === "ENOENT") {
      console.warn(err.message); // log warning
    } else {
      // throw error for other errors
      throw err;
    }
  });

  archive.on("error", (err) => {
    res.status(500).send({ error: err.message });
  });

  archive.pipe(res);
  archive.directory(folderToZip, req.params.id);
  archive.finalize();
});
