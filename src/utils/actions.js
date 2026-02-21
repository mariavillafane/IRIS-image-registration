import ImageJs from "image-js";
import { v4 as uuidv4 } from "uuid";

import { svgToPng } from "../Editor/ImageTools";
import { apiUrl } from "./api";

export function download(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export const blobToBase64 = function (blobUrl) {
  return new Promise((resolve, reject) => {
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
      ctx.drawImage(img, 0, 0);

      return canvas.toDataURL();
    })
    .catch(console.log);
};

export async function downloadCanvas() {
  const svgAsString = document.querySelector(".myCanvas svg").outerHTML; //this is a string representative of myCanvas
  const png = await svgToPng(svgAsString, 0, "white");
  const name = "canvas-" + new Date().toISOString().split("T")[0] + ".png";
  download(png, name);
}

export async function saveCanvas() {
  const svgAsString = document.querySelector(".myCanvas svg").outerHTML; //this is a string representative of myCanvas
  const png = await svgToPng(svgAsString, 0, "white");
  localStorage.setItem("preview", png);
}

export async function createSettingsDotJson(data) {
  return JSON.stringify(data, null, 2);
}

export async function fetchJobs() {
  const jobs = await fetch(apiUrl("/api/status"), {
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

export async function downloadSettings(data) {
  const settingsJson = await createSettingsDotJson(data);

  const settings = window.URL.createObjectURL(
    new Blob([settingsJson], { type: "application/json" })
  );
  download(settings, "settings.json");
  window.URL.revokeObjectURL(settings); //delete object after creating it
}

export async function runRegistration(data) {
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

  const statusOfResult = await response.json();
  console.log(statusOfResult);
  return statusOfResult;
}

export async function saveSettings(settings) {
  const id = settings.id || uuidv4();

  const svgAsString = document.querySelector(".myCanvas svg").outerHTML; //this is a string representative of myCanvas
  const thumbnail = await svgToPng(svgAsString, 0, "white");
  console.log({ thumbnail });

  const settingsJson = await createSettingsDotJson({
    id,
    ...settings,
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

export async function loadSettings(oldWorkingImages, settingsUploadedByUser) {
  if (settingsUploadedByUser == null) return;

  const reader = new FileReader();
  const fileContent = await new Promise((done) => {
    reader.addEventListener("load", () => {
      done(reader.result);
    });
    reader.readAsText(settingsUploadedByUser);
  });

  const parsedSettings = JSON.parse(fileContent);

  const urlsToDelete = oldWorkingImages.flatMap((workingImage) =>
    workingImage.imageEntries
      .filter((imageEntry) => imageEntry.base64)
      .map((imageEntry) => imageEntry.imageUrl)
  );
  urlsToDelete.forEach((url) => {
    window.URL.revokeObjectURL(url); //take away the memory that is linked to urls (they are now empty pointers, just to have memory available for something else / 2 GB limit)
  });

  const workingImages = await Promise.all(
    [parsedSettings.imageFixed, ...parsedSettings.workingImages].map(
      async (workingImage) => ({
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
      })
    )
  );

  return {
    worldScale: parsedSettings.worldScale,
    workingImages,
  };
}

export async function uploadImage(projectId, file) {
  const formData = new FormData();
  formData.append("image", file);
  return fetch(apiUrl(`/api/upload/${projectId}`), {
    method: "POST",
    body: formData,
  }).then((x) => x.json());
}
