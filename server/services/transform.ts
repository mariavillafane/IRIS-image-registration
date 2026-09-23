import { exec } from "child_process";
import { Router } from "express";

interface TransformRequestBody {
  transformation: string;
  image: string;
}

export const transformApi = Router();

transformApi.post("/api/transform", (req, res) => {
  const { transformation, image } = (req.body ??
    {}) as Partial<TransformRequestBody>;

  if (!transformation || !image) {
    res
      .status(400)
      .json({
        error: "Request body must include 'transformation' and 'image' paths",
      });
    return;
  }

  const imagePath = image.replace("/api/", "");
  const imgHash = imagePath.split(/[/.]/g)[3] ?? "";
  const transformationJsonPath = transformation.replace("/api/", "");
  const destination =
    transformationJsonPath.replace("_transformations.json", "") + `/${imgHash}`;

  exec(
    `python ../scripts_registration/apply_transform_to_image_from_json_alpha.py ${destination} "${transformationJsonPath}" "${imagePath}"`,
    (error, stdout, stderr) => {
      console.log({ error, stdout, stderr });
      res.end("done");
    }
  );
});
