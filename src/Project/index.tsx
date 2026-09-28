import {
  Card,
  Box,
  Button,
  Tooltip,
  AppBar,
  Toolbar,
  Chip,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Accordion,
  LinearProgress,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
} from "@mui/material";

import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import { useCallback, useEffect, useState } from "react";
import EditIcon from "@mui/icons-material/Edit";
import CameraIcon from "@mui/icons-material/Camera";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import ScheduleIcon from "@mui/icons-material/Schedule";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import CropOriginalIcon from "@mui/icons-material/CropOriginal";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import UploadIcon from "@mui/icons-material/Upload";
import { Link } from "react-router";
import { v4 as uuidV4 } from "uuid";
import { useNavigate } from "react-router";
import Dropzone, { useDropzone } from "react-dropzone";
import { useJobQueue } from "../utils/hooks";
import { uploadImage } from "../utils/actions";
import { apiUrl } from "../utils/api";
import type { ProjectSettingsDoc, Task, TransformationJson } from "../types";

interface ProjectCardProps extends ProjectSettingsDoc {
  refresh: () => void;
}

function ProjectCard({ refresh, ...p }: ProjectCardProps) {
  const navigate = useNavigate();
  return (
    <Card
      className="project-card"
      sx={{
        position: "relative",
        p: 1,
        paddingBottom: 4,
        display: "flex",
        flexDirection: "column",
        justifyContent: "stretch",
        flexWrap: "wrap",
        "& .actions": {
          opacity: 0,
          transition: "0.3s ease-in opacity",
        },
        "&:hover .actions": {
          opacity: 1,
        },
      }}
    >
      <Box sx={{ display: "flex", fontSize: "small", gap: 1 }}>
        <Tooltip title="last modified">
          <Chip
            avatar={<ScheduleIcon />}
            label={new Date(p.uploaded ?? 0).toUTCString()}
          />
        </Tooltip>
        <Tooltip title="images">
          <Chip avatar={<CropOriginalIcon />} label={p.workingImages.length} />
        </Tooltip>
        <Tooltip title="datacubes">
          <Chip
            avatar={<ViewInArIcon />}
            label={p.workingImages.flatMap((x) => x.imageEntries).length}
          />
        </Tooltip>
      </Box>

      <Button>
        <Link to={`/${p.id}`}>
          <img
            src={p.thumbnail}
            alt={p.title || p.id}
            style={{ maxWidth: "384px", maxHeight: "384px" }}
          />
        </Link>
      </Button>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          justifySelf: "flex-end",
          flex: 1,
        }}
      >
        {p.title || p.id}
      </Box>

      <SpeedDial
        className="actions"
        FabProps={{ size: "small" }}
        ariaLabel="SpeedDial basic example"
        direction="left"
        sx={{ position: "absolute", bottom: 16, right: 16 }}
        icon={<SpeedDialIcon />}
      >
        <SpeedDialAction
          onClick={() => navigate(`/${p.id}`)}
          icon={<EditIcon color="success" />}
          tooltipTitle={"Edit"}
        />

        <SpeedDialAction
          onClick={() => p.thumbnail && window.open(p.thumbnail, "_blank")}
          icon={<CameraIcon color="info" />}
          tooltipTitle={"Download Preview"}
        />

        <SpeedDialAction
          onClick={() => window.open(apiUrl(`/api/export/${p.id}`), "_blank")}
          icon={<FileDownloadIcon color="info" />}
          tooltipTitle={"Export"}
        />

        <SpeedDialAction
          onClick={() => {
            if (!window.confirm(`are you sure you want to delete ${p.id}`))
              return;
            fetch(apiUrl(`/api/delete/${p.id}`), { method: "POST" })
              .then(console.log)
              .then(refresh);
          }}
          icon={<DeleteForeverIcon color="warning" />}
          tooltipTitle={"Delete"}
        />
      </SpeedDial>
    </Card>
  );
}

function TransformationData({
  id,
  transformation,
  refresh,
}: {
  id: string;
  transformation: string;
  refresh?: () => void;
}) {
  const [data, setData] = useState<TransformationJson>({});
  const [open, setOpen] = useState(false);
  useEffect(() => {
    fetch(transformation, {
      method: "GET", // *GET, POST, PUT, DELETE, etc.
      mode: "cors", // no-cors, *cors, same-origin
    })
      .then((x) => x.json() as Promise<TransformationJson>)
      .then((data) => setData(data));
  }, [transformation]);

  return (
    <Box display="flex" justifyContent={"space-between"} alignItems={"center"}>
      <h2>{transformation.split("/").at(-1)?.replace(".json", "")} </h2>
      <Box>
        <Chip label={`tx: ${data?.transformation_obtained_s3?.tx}`} />
        <Chip label={`ty: ${data?.transformation_obtained_s3?.ty}`} />
        <Chip
          label={`mi: ${data?.transformation_obtained_s4?.mi_average?.toFixed(
            3
          )}`}
        />
        <Button variant="text" onClick={() => setOpen(true)}>
          See details
        </Button>
      </Box>
      <Dialog open={open} onClose={() => setOpen(false)} scroll="paper">
        <DialogTitle>{transformation}</DialogTitle>
        <DialogContent>
          <pre>
            <code>{JSON.stringify(data, null, 2)}</code>
          </pre>
        </DialogContent>
      </Dialog>
      <Dropzone
        onDrop={async (files) => {
          for (const file of files) {
            const uploaded = await uploadImage(id, file);
            try {
              const response = await fetch(apiUrl("/api/transform"), {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  transformation,
                  image: uploaded.url,
                }),
              });
              if (!response.ok) {
                const body = (await response
                  .json()
                  .catch(() => null)) as { error?: string } | null;
                window.alert(
                  `Failed to apply the transformation to ${file.name}:\n${
                    body?.error ?? response.statusText
                  }`
                );
                return;
              }
            } catch (e) {
              window.alert(
                `Failed to apply the transformation to ${file.name}:\n${e}`
              );
              return;
            }
          }
          // 260928 - reload the results so the newly transformed images show
          // up without having to reload the page
          refresh?.();
        }}
      >
        {({ getRootProps, getInputProps }) => (
          <div {...getRootProps()}>
            <input {...getInputProps()} />
            <Button> Apply Transformation to More Images</Button>
          </div>
        )}
      </Dropzone>
    </Box>
  );
}

function Results({
  id,
  files,
  refresh,
}: {
  id: string;
  files: string[];
  refresh?: () => void;
}) {
  const transformed = (files ?? [])
    .filter((image) => image.endsWith("transformations.json"))
    .map((t) => {
      const prefix = t.replace("_transformations.json", "");
      return {
        transformation: t,
        images: files
          .filter((x) => x.startsWith(prefix))
          .filter((x) => x.endsWith(".png")),
      };
    });

  return (
    <>
      {transformed.map((t) => (
        <Box key={t.transformation}>
          <TransformationData
            id={id}
            transformation={t.transformation}
            refresh={refresh}
          />
          <Box display="flex" flexWrap="wrap" gap={2}>
            {t.images
              .filter((image) => !image.includes("fixed_image"))
              .map((image) => (
                <Card key={image}>
                  <Box
                    display="flex"
                    flexDirection="column"
                    maxWidth="400px"
                    padding="1em"
                  >
                    <img
                      src={`${image}`}
                      alt={image.split("/").at(-1)}
                      style={{ maxWidth: "300px", maxHeight: "300px" }}
                    />

                    <a
                      target="_blank"
                      rel="noreferrer noopener"
                      download={image.split("/").at(-1)}
                      href={image}
                      title="image"
                    >
                      <span>{image.split("/").at(-1)}</span>
                    </a>
                  </Box>
                </Card>
              ))}
          </Box>
          <Divider />
        </Box>
      ))}{" "}
    </>
  );
}

export function JobResults(job: Task) {
  const [results, setResults] = useState<string[]>([]);

  const refresh = useCallback(() => {
    fetch(apiUrl(`/api/results/${job.id}`), {
      method: "GET", // *GET, POST, PUT, DELETE, etc.
      mode: "cors", // no-cors, *cors, same-origin
    })
      .then((x) => x.json() as Promise<string[]>)
      .then(setResults);
  }, [job.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Box>
      <Results id={job.id} files={results} refresh={refresh} />
    </Box>
  );
}

export function JobDetails(job: Task) {
  if (job.status === "error") {
    return (
      <pre>
        <code>{job.message} </code>
      </pre>
    );
  }
  return <JobResults {...job} />;
}

export default function ProjectView() {
  const [time, setTime] = useState(0);
  const refresh = () => setTime(Date.now());
  const [projects, setProjects] = useState<ProjectSettingsDoc[]>([]);

  const { jobs } = useJobQueue();
  useEffect(() => {
    fetch(apiUrl("/api/projects"))
      .then((x) => x.json() as Promise<ProjectSettingsDoc[]>)
      .then((x) => x.sort((a, b) => (b.uploaded ?? 0) - (a.uploaded ?? 0)))
      .then(setProjects);
  }, [time]);

  const onDrop = useCallback((files: File[]) => {
    if (!files.length) return;
    const data = new FormData();
    data.append("project", files[0]);

    fetch(apiUrl("/api/import"), {
      method: "POST",
      body: data,
    }).then(refresh);
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
  });

  return (
    <>
      <AppBar position="static" sx={{ marginBottom: 2 }}>
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Box
              component="span"
              sx={{ fontSize: "1.8rem", fontWeight: 700, gap: 10 }}
            >
              IRIS
            </Box>
            <Box component="span" sx={{ fontSize: "0.95rem", opacity: 0.9 }}>
              Integrated Registration & Imaging System
            </Box>
          </Box>

          <Box>
            <a
              href="https://github.com/mariavillafane/registration-ui"
              target="_blank"
              rel="noreferrer noopener"
            >
              About IRIS v.202601{" "}
            </a>
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        display={"flex"}
        flexDirection={"column"}
        gap={2}
        maxWidth={"xl"}
        sx={{ m: "auto" }}
      >
        <h1>Actions</h1>

        <Box display={"flex"} gap={2} maxWidth={"xl"} sx={{ m: "auto" }}>
          <input {...getInputProps()} />
          <Button>
            <Link to={`/project-${uuidV4()}`}>
              <Card sx={{ p: 4 }}>
                <AddCircleOutlineIcon />
                <Box> New Project</Box>
              </Card>
            </Link>
          </Button>

          <Button {...getRootProps()}>
            <Card sx={{ p: 4 }}>
              <UploadIcon />
              <Box> Import Project </Box>
            </Card>
          </Button>
        </Box>

        <h1>Projects</h1>

        <Box
          display={"flex"}
          flexDirection={"row"}
          gap={2}
          sx={{
            alignItems: "stretch",
            justifyContent: "stretch",
            flexWrap: "wrap",
          }}
        >
          {projects.map((p) => (
            <ProjectCard key={p.id} {...p} refresh={refresh} />
          ))}
        </Box>

        <h1> Results </h1>

        <Box display="flex" flexDirection={"column"} gap={2}>
          {Object.values(jobs)
            .sort((a, b) => b.updated - a.updated)
            .map((x) => (
              <Accordion key={x.id}>
                <AccordionSummary>
                  <Box
                    width="100%"
                    display="flex"
                    justifyContent={"space-between"}
                    gap={2}
                    alignItems={"center"}
                  >
                    <Box
                      flexGrow={1}
                      display="flex"
                      justifyContent={"stretch"}
                      gap={2}
                      alignItems={"center"}
                    >
                      <Box
                        display="block"
                        width="96px"
                        height="96px"
                        overflow="hidden"
                      >
                        <img src={x.thumbnail} height="96px" alt={x.id} />
                      </Box>
                      <Box>
                        <Box>{new Date(x.updated).toUTCString()} </Box>
                        <Box>{x.title}</Box>
                      </Box>
                      <Box
                        sx={{
                          display: "flex",
                          width: "20ex",
                          flexDirection: "column",
                          justifyContent: "center",
                        }}
                      >
                        <Box>{x.status}</Box>
                        {x.status !== "queued" &&
                          (!x.done ||
                            ["error", "success"].includes(x.status)) && (
                            <LinearProgress
                              color={
                                ["success", "error"].includes(x.status)
                                  ? (x.status as "success" | "error")
                                  : "primary"
                              }
                              variant={
                                +x.progress[1] ? "determinate" : "indeterminate"
                              }
                              value={(+x.progress[0] / +x.progress[1]) * 100}
                            />
                          )}
                      </Box>
                    </Box>

                    <Box>
                      <Box fontSize="small" textAlign={"right"}>
                        {x.id}
                      </Box>

                      <Button> View </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(apiUrl(`/api/export/${x.id}`), "_blank");
                        }}
                      >
                        {" "}
                        Download{" "}
                      </Button>

                      {x.status !== "stopped" && (
                        <Button
                          disabled={x.status !== "started"}
                          onClick={async (e) => {
                            e.stopPropagation();
                            await fetch(apiUrl(`/api/stop/${x.id}`), {
                              method: "POST",
                            });
                            refresh();
                          }}
                        >
                          {" "}
                          Stop{" "}
                        </Button>
                      )}

                      {x.status === "stopped" && (
                        <Button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await fetch(apiUrl(`/api/resume/${x.id}`), {
                              method: "POST",
                            });
                            refresh();
                          }}
                        >
                          {" "}
                          Restart{" "}
                        </Button>
                      )}

                      <Button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (
                            !window.confirm(
                              `are you sure you want to delete ${x.id}`
                            )
                          )
                            return;
                          await fetch(apiUrl(`/api/delete/${x.id}`), {
                            method: "POST",
                          });
                          refresh();
                        }}
                      >
                        {" "}
                        Delete{" "}
                      </Button>
                    </Box>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Divider />
                  <JobDetails {...x} />
                </AccordionDetails>
              </Accordion>
            ))}
        </Box>
      </Box>
    </>
  );
}
