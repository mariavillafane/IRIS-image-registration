import {
  Badge,
  Box,
  Button,
  Card,
  Chip,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Divider,
  LinearProgress,
} from "@mui/material";
import QueueIcon from "@mui/icons-material/Queue";
import CollectionsIcon from "@mui/icons-material/Collections";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import { Fragment, useCallback, useEffect, useState } from "react";
import Dropzone from "react-dropzone";
import { uploadImage } from "../utils/actions";
import { apiUrl } from "../utils/api";
import { useJobQueue } from "../utils/hooks";
import type { Task, TransformationJson } from "../types";

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
  useEffect(() => {
    fetch(transformation, {
      method: "GET", // *GET, POST, PUT, DELETE, etc.
      mode: "cors", // no-cors, *cors, same-origin
    })
      .then((x) => x.json() as Promise<TransformationJson>)
      .then((data) => setData(data));
  }, [transformation]);

  return (
    <Box>
      <h2>{transformation.split("/").at(-1)?.replace(".json", "")} </h2>
      <Box>
        <Chip label={`tx: ${data?.transformation_obtained_s3?.tx}`} />
        <Chip label={`ty: ${data?.transformation_obtained_s3?.ty}`} />
        <Chip
          label={`mi: ${data?.transformation_obtained_s4?.mi_average?.toFixed(
            3
          )}`}
        />
      </Box>
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
          // up without having to close/reopen the results drawer
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
  files: string[] | null;
  refresh?: () => void;
}) {
  const transformed = (files ?? [])
    .filter((image) => image.endsWith("transformations.json"))
    .map((t) => {
      const prefix = t.replace("_transformations.json", "");
      return {
        transformation: t,
        images: (files ?? [])
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
          <h2>Transformed Images</h2>
          {t.images.map((image) => (
            <Fragment key={image}>
              <Card>
                <Box
                  display="flex"
                  flexDirection="column"
                  maxWidth={"400px"}
                  padding="1em"
                >
                  <img src={`${image}`} alt={image.split("/").at(-1)} />

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
            </Fragment>
          ))}
        </Box>
      ))}{" "}
    </>
  );
}

export function JobQueueViewer({ id }: { id: string }) {
  const [results, setResults] = useState<string[] | null>(null);
  //260928 - the results shown in the drawer belong to the JOB that was last
  //clicked (their files live under uploads/<jobId>/results), so refreshing
  //them after "Apply Transformation to More Images" must re-fetch that job's
  //results - not the project's (the drawer's `id` prop)
  const [resultsJobId, setResultsJobId] = useState<string | null>(null);
  const jobQueue = useJobQueue();
  const [showDrawer, setShowDrawer] = useState(0);

  const fetchResults = useCallback(
    async ({ id, status }: Task) => {
      if (status !== "success") return;
      console.log("feching", id, status);
      const resultingTransformedImageFiles: string[] = await fetch(
        apiUrl(`/api/results/${id}`),
        {
          method: "GET", // *GET, POST, PUT, DELETE, etc.
          mode: "cors", // no-cors, *cors, same-origin
        }
      ).then((x) => x.json());
      setResults(resultingTransformedImageFiles);
      setResultsJobId(id);
      setShowDrawer(3);
    },
    []
  );

  //260928 - reload the results of the job whose results are shown, without
  //changing the drawer state (used after "Apply Transformation to More Images")
  const refreshResults = useCallback(async () => {
    if (!resultsJobId) return;
    const resultingTransformedImageFiles: string[] = await fetch(
      apiUrl(`/api/results/${resultsJobId}`),
      {
        method: "GET", // *GET, POST, PUT, DELETE, etc.
        mode: "cors", // no-cors, *cors, same-origin
      }
    ).then((x) => x.json());
    setResults(resultingTransformedImageFiles);
  }, [resultsJobId]);

  return (
    <>
      <IconButton
        size="large"
        aria-label="shows all jobs"
        color="inherit"
        onClick={() => {
          setShowDrawer(2);
        }}
      >
        <Box display="flex" flexDirection="column" alignItems={"center"}>
          <Badge badgeContent={jobQueue.total} color="error">
            <QueueIcon />
          </Badge>
          <Typography fontSize={"small"}>All</Typography>
        </Box>
      </IconButton>
      <Drawer
        open={showDrawer > 0}
        anchor={"right"}
        onClose={() => setShowDrawer(0)}
      >
        {showDrawer === 3 && (
          <Stack spacing={2}>
            <Box display={"flex"}>
              <IconButton onClick={() => setShowDrawer(2)}>
                <ArrowBackIcon />
              </IconButton>
              <Typography marginLeft="0.25em" variant="h3">
                Results
              </Typography>
            </Box>
            <Divider />
            {<Results id={id} files={results} refresh={refreshResults} />}
          </Stack>
        )}
        {showDrawer < 3 && (
          <>
            <Box display="flex">
              <IconButton
                size="large"
                aria-label="shows completed jobs"
                color="inherit"
                onClick={() => {
                  setShowDrawer(1);
                }}
              >
                <Badge badgeContent={jobQueue.done} color="success">
                  <CollectionsIcon />
                </Badge>
              </IconButton>
              <IconButton
                size="large"
                aria-label="shows all jobs"
                color="inherit"
                onClick={() => {
                  setShowDrawer(2);
                }}
              >
                <Badge badgeContent={jobQueue.total} color="error">
                  <QueueIcon />
                </Badge>
              </IconButton>
              <Typography marginLeft="0.25em" variant="h3">
                {showDrawer === 2 ? "All Jobs" : "Completed Jobs"}
              </Typography>
            </Box>
            <Divider />

            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Job ID</TableCell>
                    <TableCell>Start Time</TableCell>
                    <TableCell>End Time</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {Object.values(jobQueue.jobs).map((x) => (
                    <TableRow key={x.id} onClick={() => fetchResults(x)}>
                      <TableCell>{x.id}</TableCell>
                      <TableCell>
                        {x.startTime && new Date(x.startTime).toLocaleString()}
                      </TableCell>

                      <TableCell>
                        {x.endTime && new Date(x.endTime).toLocaleString()}
                      </TableCell>

                      <TableCell>
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                          }}
                        >
                          <Box>{x.status}</Box>
                          {x.status !== "queued" && (
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Drawer>
    </>
  );
}
