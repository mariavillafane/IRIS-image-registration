import React from "react";
import Dropzone from "react-dropzone";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import VisibilitySharpIcon from "@mui/icons-material/VisibilitySharp";
import VisibilityOffSharpIcon from "@mui/icons-material/VisibilityOffSharp";
import { useState } from "react";
import type { Dispatch } from "react";
import ClearIcon from "@mui/icons-material/Clear";
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  LinearProgress,
  Paper,
  Snackbar,
  Tooltip,
} from "@mui/material";
import ReplayIcon from "@mui/icons-material/Replay"; //rotation
import LocationOnIcon from "@mui/icons-material/LocationOn"; //position
import PhotoSizeSelectLargeIcon from "@mui/icons-material/PhotoSizeSelectLarge"; //scaling
import { uploadImage } from "../utils/actions";
import type { EditorAction, ImageEntry, WorkingImage } from "../types";

function computeNextId(stacks: WorkingImage[]): number {
  return stacks.map((x) => x.id + 1).reduce((a, b) => (a > b ? a : b), 0);
}

let counter = 0;

function makefilename(file: File, stackId: number): string {
  const filename = file.name.split(".");
  console.log(filename);
  const filename_ok = filename.slice(0, -1);
  const filename_ok_joined = filename_ok.join("."); //all the parts of the filename now concatenated, still missing the extension (-1)
  const filename_ok_joined_ok = `${stackId}-${filename_ok_joined}_${counter++}.${filename.at(
    -1
  )}`; //here putting again the extension with . (ie .jpg)
  return filename_ok_joined_ok;
}

interface StackUploaderProps {
  stack: WorkingImage;
  index: number;
  selectedStackId: number;
  setSelectedStackId: (id: number) => void;
  dispatch: Dispatch<EditorAction>;
  stacks: WorkingImage[];
  small: boolean;
  onDropImageToStack: (
    stack: WorkingImage,
    index: number,
    acceptedFiles: File[],
    allowMultiple?: number | boolean
  ) => Promise<void>;
}

function StackUploader({
  stack,
  index,
  selectedStackId,
  setSelectedStackId,
  dispatch,
  stacks,
  small,
  onDropImageToStack,
}: StackUploaderProps) {
  return (
    <Paper
      // key={index}
      data-testid={`stack-card-${index}`}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: ".6em",
        gap: "0.5rem",
        backgroundColor: "lightgray",
        border:
          selectedStackId === stack.id && stack.id !== 0
            ? "solid 3px coral"
            : selectedStackId === stack.id && stack.id === 0
            ? "solid 3px #321ab0"
            : "solid 3px transparent",
      }}
    >
      <Box display="flex" flexDirection={"row"} gap="0.5rem">
        {stack.imageEntries
          .slice(0, small ? 1 : Infinity)
          .map((imageEntry, entryIndex) => (
            <Card key={imageEntry.id}>
              <Box
                display="flex"
                flexDirection="row"
                position="relative"
                overflow="hidden"
                sx={{
                  "& > .controls": {
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    right: "-1em",
                    width: 0,
                    background: "rgba(200,200,200,0.6)",
                    transition: "all 0.2s",
                  },
                  "&:hover > .controls": { right: 0, width: "2em" },
                }}
              >
                <Box display="flex" flexDirection={"column"}>
                  <img
                    width={!small ? "100px" : "50px"}
                    src={imageEntry.thumbnailUrl}
                    alt={imageEntry.id || "thumbnail"}
                    onClick={() => setSelectedStackId(stack.id)}
                  />
                  <Typography
                    fontSize={"0.5rem"}
                    display={small ? "none" : "block"}
                  >
                    {imageEntry.id}
                  </Typography>
                </Box>

                <Box
                  className="controls"
                  display="flex"
                  flexDirection="column"
                  alignItems={"center"}
                >
                  <ClearIcon
                    data-testid={`delete-entry-${entryIndex}`}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `are you sure you want to delete ${imageEntry.id}`
                        )
                      )
                        return;

                      const basePath = imageEntry.files?.url
                        .split("/")
                        .slice(0, -1)
                        .join("/");
                      if (basePath)
                        fetch(basePath, { method: "delete" }).catch(
                          console.error
                        );

                      dispatch({
                        type: "DELETE_IMAGE_ENTRY",
                        payload: { stackIndex: index, entryIndex },
                      });
                    }}
                  />

                  <Checkbox
                    data-testid={`visibility-${entryIndex}`}
                    checked={imageEntry.checked}
                    icon={<VisibilityOffSharpIcon />}
                    checkedIcon={<VisibilitySharpIcon color="primary" />}
                    onChange={(event) => {
                      dispatch({
                        type: "TOGGLE_IMAGE_VISIBILITY",
                        payload: {
                          stackIndex: index,
                          entryIndex,
                          checked: event.target.checked,
                        },
                      });
                    }}
                  />
                </Box>
              </Box>
            </Card>
          ))}

        <Dropzone
          onDrop={(acceptedFiles) =>
            onDropImageToStack(stack, index, acceptedFiles, index)
          }
        >
          {({ getRootProps, getInputProps }) => (
            <Button
              {...getRootProps()}
              data-testid={`dropzone-stack-${index}`}
              color="primary"
              sx={{
                maxWidth: 25,
                fontSize: "0.7rem",
                display: small ? "none" : "block",
              }}
              variant="outlined"
            >
              {index !== 0 ? "Add image to stack" : "Replace fixed image"}
              <input
                {...getInputProps()}
                accept=".jpg, .png, .jpeg, .gif, .bmp, .tif, .tiff|image/*"
              />
            </Button>
          )}
        </Dropzone>
      </Box>
      <Box
        display={small ? "none" : "flex"}
        overflow="hidden"
        height={!small ? "3em" : "0"}
        width={!small ? "500px" : "0"}
        gap="0.2rem"
        fontSize="0.5em"
      >
        <Tooltip title="location x,y">
          <Chip
            data-testid="stack-location"
            icon={<LocationOnIcon />}
            size="small"
            variant="outlined"
            label={`${Math.round(stack.x)},${Math.round(stack.y)}`}
          />
        </Tooltip>
        <Tooltip title="rotation">
          <Chip
            icon={<ReplayIcon />}
            size="small"
            variant="outlined"
            label={`${stack.rotation}`}
          />
        </Tooltip>
        <Tooltip title="image Size (wxh) @ (scale)">
          <Chip
            icon={<PhotoSizeSelectLargeIcon />}
            size="small"
            variant="outlined"
            label={`${Math.round(
              (stack.width ?? 0) * (stack.scaling ?? 1)
            )}x${Math.round((stack.height ?? 0) * (stack.scaling ?? 1))} @ ${
              stack.scaling
            }`}
          />
        </Tooltip>
      </Box>
    </Paper>
  );
}

interface ImageUploaderProps {
  projectId: string;
  stacks: WorkingImage[];
  dispatch: Dispatch<EditorAction>;
  selectedStackId: number;
  setSelectedStackId: (id: number) => void;
  small?: boolean;
}

export function ImageUploader({
  projectId,
  stacks,
  dispatch,
  selectedStackId,
  setSelectedStackId,
  small = false,
}: ImageUploaderProps) {
  const [uploads, setUploads] = useState<[number, number]>([0, 0]);
  async function onDrop2(acceptedFiles: File[]): Promise<void> {
    const stackId = computeNextId(stacks);
    const imageEntries: ImageEntry[] = await Promise.all(
      acceptedFiles.map(async (file, i, all) => {
        setUploads([i, all.length]);
        console.log("uploading", file.name);
        const data = await uploadImage(projectId, file);
        console.log("done uploading", file.name);
        setUploads([i + 1, all.length]);
        console.log(data);

        return {
          stackId,
          id: makefilename(file, stackId),
          ...(data.metadata as Omit<ImageEntry, "id">),
          file: {
            name: file.name,
            lastModified: file.lastModified,
            relativePath: file.webkitRelativePath,
          },
          path: data.path,
          imageUrl: data.webUrl, //image drawn in browser, by default this converts to png - 230828
          thumbnailUrl: data.smallUrl,
          galleryUrl: data.mediumUrl,
          checked: true,
        };
      })
    );

    const { width, height } = imageEntries[0];
    if (!imageEntries.every((x) => x.width === width && x.height === height)) {
      console.log(
        "some images differ in size => not all widths and heights of images of stack are the same"
      );
    }

    const stack: WorkingImage = {
      x: 0,
      y: 0,
      opacity: 1,
      scaling: 1,
      rotation: 0,
      id: stackId,
      imageEntries,
      width,
      height,
    };
    console.log("adding", stack);
    dispatch({
      type: "ADD_STACK",
      payload: stack,
    });
  }

  async function onDropImageToStack(
    stack: WorkingImage,
    index: number,
    acceptedFiles: File[],
    allowMultiple: number | boolean = true
  ): Promise<void> {
    const imageEntries: ImageEntry[] = await Promise.all(
      (allowMultiple ? acceptedFiles : acceptedFiles.slice(0, 1)).map(
        async (file, i, all) => {
          setUploads([i, all.length]);
          const data = await uploadImage(projectId, file);
          setUploads([i + 1, all.length]);
          return {
            stackId: stack.id,
            id: makefilename(file, stack.id), //`${stack.id}-${filename_ok_joined}_${counter++}.${filename.at(-1)}`,
            ...(data.metadata as Omit<ImageEntry, "id">),
            path: data.path,
            //base64: await readImageAsBase64(file),
            imageUrl: data.webUrl, //await URL.createObjectURL(await image.toBlob()), //image drawn in browser, by defult this converts to png - 230828
            thumbnailUrl: data.smallUrl, //await URL.createObjectURL(await image.toBlob()), //image drawn in browser, by
            galleryUrl: data.mediumUrl,
            checked: true,
          };
        }
      )
    );

    const { width, height } = imageEntries[0];
    if (!imageEntries.every((x) => x.width === width && x.height === height)) {
      console.log(
        "some images differ in size => not all widths and heights of images of stack are the same"
      );
    }

    if (allowMultiple) {
      dispatch({
        type: "ADD_IMAGES_TO_STACK",
        payload: { stackIndex: index, imageEntries },
      });
    } else {
      dispatch({
        type: "REPLACE_STACK_IMAGES",
        payload: {
          stackIndex: index,
          width: width ?? 0,
          height: height ?? 0,
          imageEntries,
        },
      });
    }
  }

  return (
    <Box
      sx={{
        minWidth: small ? 50 : 300, //200
        flexGrow: 1,
        display: "flex",
        justifyContent: "stretch",
        flexDirection: "column",
        "& *": {
          transition: "all ease-in 0.3s",
        },
      }}
    >
      <Snackbar
        autoHideDuration={5000}
        open={uploads[1] > 0 && uploads[0] < uploads[1]}
      >
        <Alert severity="info">
          Uploading {uploads[0]} / {uploads[1]} <LinearProgress />{" "}
        </Alert>
      </Snackbar>

      <CardContent
        sx={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexGrow: 1,
        }}
      >
        <Dropzone onDrop={onDrop2}>
          {({ getRootProps, getInputProps }) => (
            <div {...getRootProps()} data-testid="dropzone-fixed">
              <input {...getInputProps()} />
              <Typography
                sx={{
                  fontSize: 14,
                  color: "text.secondary",
                  backgroundColor: "#eeeeee",
                }}
                gutterBottom
              >
                Upload Fixed Image (only one image, used for comparison or as
                background)
              </Typography>
            </div>
          )}
        </Dropzone>

        <Box
          display="flex"
          flexDirection="column"
          sx={{
            overflow: "scroll",
            marginTop: "0.5em",
            paddingInline: "0.5rem",
            gap: "0.5rem",
          }}
        >
          {stacks.slice(0, 1).map((stack, index) => (
            <StackUploader
              key={index}
              stack={stack}
              index={index}
              setSelectedStackId={setSelectedStackId}
              selectedStackId={selectedStackId}
              dispatch={dispatch}
              stacks={stacks}
              small={small}
              onDropImageToStack={onDropImageToStack}
            />
          ))}
        </Box>

        <Dropzone onDrop={onDrop2}>
          {({ getRootProps, getInputProps }) => (
            <div {...getRootProps()} data-testid="dropzone-moving">
              <input {...getInputProps()} />

              <Typography
                sx={{
                  fontSize: 14,
                  color: "text.secondary",
                  backgroundColor: "#eeeeee",
                }}
                gutterBottom
              >
                Upload Moving Images (you can upload multiple images, they will
                be added to the same stack and you can toggle their visibility
                in the stack)
              </Typography>
            </div>
          )}
        </Dropzone>

        <Box
          display="flex"
          flexDirection="column"
          sx={{
            overflow: "scroll",
            marginTop: "0.5em",
            paddingInline: "0.5rem",
            gap: "0.5rem",
          }}
        >
          {stacks.slice(1).map((stack, index) => (
            <StackUploader
              key={index}
              stack={stack}
              index={index + 1}
              setSelectedStackId={setSelectedStackId}
              selectedStackId={selectedStackId}
              dispatch={dispatch}
              stacks={stacks}
              small={small}
              onDropImageToStack={onDropImageToStack}
            />
          ))}
        </Box>
      </CardContent>
    </Box>
  );
}
