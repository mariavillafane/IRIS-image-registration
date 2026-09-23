import sharp from "sharp";

import * as fs from "fs/promises";
import { mkdirp } from "mkdirp";
import express from "express";
import multer from "multer";
import prettyBytes from "pretty-bytes";
import unzipper from "unzipper";
import { rimraf } from "rimraf";

import type { UploadedImageMetadata } from "../types.js";

const upload = multer({ dest: "tmp/" });
export const importApi = express.Router();

interface SaveSettingsBody {
  thumbnail: string;
  [key: string]: unknown;
}

function stripMetadataBuffers(data: sharp.Metadata): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([_k, v]) => !Buffer.isBuffer(v))
  );
}

importApi.post("/api/upload/:id", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image file provided" });
    return;
  }
  const file = req.file;

  const dest = "uploads/" + req.params.id + "/images/" + file.filename;
  await mkdirp(dest);
  const filePath = (dest + "/" + file.originalname).replace(/\\/g, "/");
  const filePathNoExt = filePath.replace(/\.[^/.]+$/, "");
  await fs.rename(file.path, filePath);
  const image = sharp(filePath);

  const [metadata] = await Promise.all([
    image
      .metadata()
      .then(stripMetadataBuffers)
      .then(
        (x): UploadedImageMetadata => ({
          ...x,
          files: {
            url: "/api/" + filePath,
            path: filePath,
            webUrl: "/api/" + filePathNoExt + ".web.png",
            smallUrl: "/api/" + filePathNoExt + ".128.png",
            mediumUrl: "/api/" + filePathNoExt + ".512.png",
          },
          destination: dest,
          size: file.size,
          uploaded: Date.now(),
          sizeStr: prettyBytes(file.size),
        })
      ),
    image.toFile(filePathNoExt + ".web.png"),
    image
      .resize(128, 128, { fit: "contain" })
      .toFile(filePathNoExt + ".128.png"),
    image
      .resize(512, 512, { fit: "contain" })
      .toFile(filePathNoExt + ".512.png"),
  ]);

  await fs.writeFile(filePathNoExt + ".json", JSON.stringify(metadata));

  res.json({
    metadata,
    ...metadata.files,
  });
});

importApi.delete("/api/uploads/:pid/images/:id", async (req, res) => {
  console.log(`/uploads/${req.params.pid}/images/${req.params.id}`);
  await rimraf(`uploads/${req.params.pid}/images/${req.params.id}`);
  res.json({});
});

importApi.post("/api/save/:id", async (req, res) => {
  const body = req.body as SaveSettingsBody | undefined;
  if (!body?.thumbnail) {
    res.status(400).json({ error: "Missing thumbnail in request body" });
    return;
  }

  const dest = "uploads/" + req.params.id + "/";
  await mkdirp(dest);
  const isInlineThumbnail = body.thumbnail.startsWith("data:image");
  const thumbnail = body.thumbnail.replace(/^data:image\/png;base64,/, "");
  await Promise.all([
    isInlineThumbnail
      ? fs.writeFile(dest + "thumbnail.png", thumbnail, "base64")
      : Promise.resolve(),
    fs.writeFile(
      dest + "settings.json",
      JSON.stringify(
        {
          ...body,
          dest,
          uploaded: Date.now(),
          id: req.params.id,
          thumbnail: "/api/" + dest + "thumbnail.png",
          status: "wip",
        },
        null,
        2
      )
    ),
  ]);
  res.json({ status: "success" });
});

importApi.post("/api/import", upload.single("project"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No project file provided" });
    return;
  }
  const file = req.file;

  await unzipper.Open.file(file.path)
    .then((x) => x.extract({ path: "uploads" })) //path: __dirname + "/uploads"
    .then(() => rimraf(file.path))
    .catch((e) => {
      console.error(e);
    });
  res.end("");
});
