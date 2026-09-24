import sharp from "sharp";

import * as fs from "fs/promises";
import { mkdirp } from "mkdirp";
import express from "express";
import multer from "multer";
import prettyBytes from "pretty-bytes";
import unzipper from "unzipper";
import { rimraf } from "rimraf";

//260923 - put the upload temp dir inside uploads/, so that in the docker
//deployment (compose mounts uploads/ as a volume) the temp file and its final
//destination share a filesystem and rename() stays atomic
const upload = multer({ dest: "uploads/tmp/" });
export const importApi = express.Router();

//260923 - volume-aware move: rename() cannot move a file across devices
//(docker volumes and bind mounts are separate filesystems from the container's
//tmp/ directory - that is what caused "Error: EXDEV: cross-device link not
//permitted" on upload), so fall back to copy + unlink for that case
async function moveUploadedFile(from, to) {
  try {
    await fs.rename(from, to);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    await fs.copyFile(from, to);
    await fs.unlink(from);
  }
}

function stripMetadataBuffers(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([_k, v]) => !Buffer.isBuffer(v))
  );
}

importApi.post("/api/upload/:id", upload.single("image"), async (req, res) => {
  const dest = "uploads/" + req.params.id + "/images/" + req.file.filename;
  await mkdirp(dest);
  const filePath = (dest + "/" + req.file.originalname).replace(/\\/g, "/");
  const filePathNoExt = filePath.replace(/\.[^/.]+$/, "");
  await moveUploadedFile(req.file.path, filePath);
  const image = sharp(filePath);

  const [metadata] = await Promise.all([
    image
      .metadata()
      .then(stripMetadataBuffers)
      .then((x) => ({
        ...x,
        files: {
          url: "/api/" + filePath,
          path: filePath,
          webUrl: "/api/" + filePathNoExt + ".web.png",
          smallUrl: "/api/" + filePathNoExt + ".128.png",
          mediumUrl: "/api/" + filePathNoExt + ".512.png",
        },
        destination: dest,
        size: req.file.size,
        uploaded: Date.now(),
        sizeStr: prettyBytes(req.file.size),
      })),
    image.toFile(filePathNoExt + ".web.png"),
    image
      .resize(128, 128, { resize: "contain" })
      .toFile(filePathNoExt + ".128.png"),
    image
      .resize(512, 512, { resize: "contain" })
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
  const dest = "uploads/" + req.params.id + "/";
  await mkdirp(dest);
  const isInlineThumbnail = req.body.thumbnail.startsWith("data:image");
  const thumbnail = req.body.thumbnail.replace(/^data:image\/png;base64,/, "");
  await Promise.all([
    isInlineThumbnail
      ? fs.writeFile(dest + "thumbnail.png", thumbnail, "base64")
      : Promise.resolve(),
    fs.writeFile(
      dest + "settings.json",
      JSON.stringify(
        {
          ...req.body,
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
  await unzipper.Open.file(req.file.path)
    .then((x) => x.extract({ path: "uploads" })) //path: __dirname + "/uploads"
    .then(() => rimraf(req.file.path))
    .catch((e) => {
      console.error(e);
    });
  res.end("");
});
