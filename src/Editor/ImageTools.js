import { useEffect, useState } from "react";
import { Canvg } from "canvg";
export function useJsonReader(initialPath, method = "readAsDataURL") {
  const [selectedFile, setSelectedFile] = useState(null);
  const [imageAsDataURL, setImageAsDataURL] = useState(initialPath);
  useEffect(() => {
    if (!selectedFile) {
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setImageAsDataURL(reader.result);
    });
    reader[method](selectedFile); //reader.readAsDataURL(selectedFile);
  }, [selectedFile, method]);
  return [imageAsDataURL, setSelectedFile];
}

export function readImageAsBase64(file) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onerror = () => reject("error reading file");
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file); //this line is reading the file as Base64 - 230828
  });
}

export async function svgToPng(svgText, margin) {
  // convert an svg text to png using the browser
  // can use the domUrl function from the browser
  const domUrl = window.URL || window.webkitURL || window;
  if (!domUrl) {
    throw new Error("(browser doesnt support this)");
  }

  // figure out the height and width from svg text
  let matchH = svgText.match(/height="(\d+)/m);
  let height = matchH && matchH[1] ? parseInt(matchH[1], 10) : 200;
  let matchW = svgText.match(/width="(\d+)/m);
  let width = matchW && matchW[1] ? parseInt(matchW[1], 10) : 200;
  margin = margin || 0;

  // create a canvas element to pass through
  const canvas = document.createElement("canvas");
  canvas.width = width + margin * 1.2;
  canvas.height = height + margin * 1.2;
  const ctx = canvas.getContext("2d");

  const v = Canvg.fromString(ctx, svgText);
  await v.render();
  return canvas.toDataURL();
}
