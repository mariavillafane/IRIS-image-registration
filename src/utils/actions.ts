import ImageJs from "image-js";
import { v4 as uuidv4 } from "uuid";

import { svgToPng } from "../Editor/ImageTools";
import { apiUrl } from "./api";
import type {
  EditorSettings,
  JobQueueSummary,
  ProjectSettingsDoc,
  Task,
  UploadImageResponse,
  WorkingImage,
} from "../types";

export function download(url: string, name: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export const blobToBase64 = function (
  blobUrl: string
): Promise<string | undefined> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    let img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = blobUrl;
  })
    .then((img) => {
      // URL.revokeObjectURL(blobUrl);
      // Limit to 256x256px while preserving aspect ratio
      let [w, h] = [img.width, img.height];

      let canvas = document.createElement("canvas");
      console.log(canvas);
      canvas.width = w;
      canvas.height = h;
      let ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("could not create a 2d context");

      ctx.drawImage(img, 0, 0);

      return canvas.toDataURL();
    })
    .catch((e) => {
      console.log(e);
      return undefined;
    });
};

function getCanvasSvgString(): string | null {
  return document.querySelector<SVGElement>(".myCanvas svg")?.outerHTML ?? null;
}

export async function downloadCanvas(): Promise<void> {
  const svgAsString = getCanvasSvgString();
  if (!svgAsString) return; // no canvas rendered
  const png = await svgToPng(svgAsString, 0);
  const name = "canvas-" + new Date().toISOString().split("T")[0] + ".png";
  download(png, name);
}

export async function saveCanvas(): Promise<void> {
  const svgAsString = getCanvasSvgString();
  if (!svgAsString) return; // no canvas rendered
  const png = await svgToPng(svgAsString, 0);
  localStorage.setItem("preview", png);
}

export async function createSettingsDotJson(data: unknown): Promise<string> {
  return JSON.stringify(data, null, 2);
}

export async function fetchJobs(): Promise<JobQueueSummary> {
  const jobs: Record<string, Task> = await fetch(apiUrl("/api/status"), {
    method: "GET", // *GET, POST, PUT, DELETE, etc.
    mode: "cors", // no-cors, *cors, same-origin
    cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
  }).then((x) => x.json());

  const entries = Object.values(jobs);
  const done = entries.filter((x) => x.status === "success").length;
  const queued = entries.filter((x) => x.status === "queued").length;
  const inProgress = entries.filter((x) => x.status === "started").length;
  const total = entries.length;
  const failed = entries.filter((x) => x.status === "failed").length;
  const jobsByProject = Object.groupBy(Object.values(jobs), (x) => x.projectId);

  return { done, queued, inProgress, failed, total, jobs, jobsByProject };
}

export async function downloadSettings(data: EditorSettings): Promise<void> {
  const settingsJson = await createSettingsDotJson(data);

  const settings = window.URL.createObjectURL(
    new Blob([settingsJson], { type: "application/json" })
  );
  download(settings, "settings.json");
  window.URL.revokeObjectURL(settings); //delete object after creating it
}

export async function runRegistration(data: EditorSettings): Promise<Task> {
  await saveSettings(data);
  const response = await fetch(apiUrl(`/api/start/${data.id}`), {
    //"http://localhost:4000/start" => "/start"
    method: "POST", // *GET, POST, PUT, DELETE, etc.
    mode: "cors", // no-cors, *cors, same-origin
    cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
    credentials: "same-origin", // include, *same-origin, omit
    headers: {
      "Content-Type": "application/json",
      // 'Content-Type': 'application/x-www-form-urlencoded',
    },
    redirect: "follow", // manual, *follow, error
    referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin
  });

  const statusOfResult: Task = await response.json();
  console.log(statusOfResult);
  return statusOfResult;
}

export async function saveSettings(settings: EditorSettings): Promise<unknown> {
  const id = settings.id || uuidv4();

  const svgAsString = getCanvasSvgString(); //this is a string representative of myCanvas
  if (!svgAsString) throw new Error("canvas is not rendered");

  const thumbnail = await svgToPng(svgAsString, 0);
  console.log({ thumbnail });

  const settingsJson = await createSettingsDotJson({
    id,
    ...(settings as Omit<EditorSettings, "id">),
    thumbnail,
  });

  const response = await fetch(apiUrl(`/api/save/${id}`), {
    //"http://localhost:4000/start" => "/start"
    method: "POST", // *GET, POST, PUT, DELETE, etc.
    mode: "cors", // no-cors, *cors, same-origin
    cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
    credentials: "same-origin", // include, *same-origin, omit
    headers: {
      "Content-Type": "application/json",
      // 'Content-Type': 'application/x-www-form-urlencoded',
    },
    redirect: "follow", // manual, *follow, error
    referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    body: new Blob([settingsJson], { type: "application/json" }), // body data type must match "Content-Type" header
  });

  const statusOfResult = await response.json();
  return statusOfResult;
}

export async function loadSettings(
  oldWorkingImages: WorkingImage[],
  settingsUploadedByUser: File | null
): Promise<{ worldScale?: number; workingImages: WorkingImage[] } | undefined> {
  if (settingsUploadedByUser == null) return;

  const reader = new FileReader();
  const fileContent = await new Promise<string | ArrayBuffer | null>((done) => {
    reader.addEventListener("load", () => {
      done(reader.result);
    });
    reader.readAsText(settingsUploadedByUser);
  });

  const parsedSettings = JSON.parse(String(fileContent)) as ProjectSettingsDoc;

  const urlsToDelete = oldWorkingImages.flatMap((workingImage) =>
    workingImage.imageEntries
      .filter((imageEntry) => imageEntry.base64)
      .map((imageEntry) => imageEntry.imageUrl)
  );
  urlsToDelete.forEach((url) => {
    if (url) window.URL.revokeObjectURL(url); //take away the memory that is linked to urls (they are now empty pointers, just to have memory available for something else / 2 GB limit)
  });

  const workingImages = await Promise.all(
    [
      ...(parsedSettings.imageFixed ? [parsedSettings.imageFixed] : []),
      ...parsedSettings.workingImages,
    ].map(async (workingImage) => ({
      ...workingImage,
      imageEntries: await Promise.all(
        workingImage.imageEntries.map(async (imageEntry) => {
          if (!imageEntry.base64) {
            return {
              ...imageEntry,
            };
          }
          const image = await ImageJs.load(imageEntry.base64);
          const url = await URL.createObjectURL(await image.toBlob());
          return {
            ...imageEntry,
            imageUrl: url, //image drawn in browser, by default this converts to png - 230828
            thumbnailUrl: url, //image drawn in browser, by default this converts to png - 230828
            galleryUrl: url, //image drawn in browser, by default this converts to png - 230828
          };
        })
      ),
    }))
  );

  return {
    worldScale: parsedSettings.worldScale,
    workingImages,
  };
}

export async function uploadImage(
  projectId: string,
  file: File
): Promise<UploadImageResponse> {
  const formData = new FormData();
  formData.append("image", file);
  return fetch(apiUrl(`/api/upload/${projectId}`), {
    method: "POST",
    body: formData,
  }).then((x) => x.json() as Promise<UploadImageResponse>);
}
