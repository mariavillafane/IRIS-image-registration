import "./App.css";
import { useEffect, useRef, useState } from "react";
import { RegistrationCanvas } from "./RegistrationCanvas";
import { ImageUploader } from "./ImageUploader";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import AppsIcon from "@mui/icons-material/Apps";

import {
  AppBar,
  Box,
  ButtonGroup,
  Divider,
  IconButton,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";

import SaveAltIcon from "@mui/icons-material/SaveAlt";
import MemoryIcon from "@mui/icons-material/Memory";
import CameraIcon from "@mui/icons-material/Camera";
import {
  downloadCanvas,
  runRegistration,
  saveSettings,
} from "../utils/actions";

import { Link, useParams } from "react-router";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { JobQueueViewer } from "./JobViewer";

function usePersistentState(name, defaultValue) {
  const [state, setState] = useState(
    () => localStorage.getItem(name) || defaultValue
  );
  return [
    state,
    (value) => {
      localStorage.setItem(name, value);
      setState(value);
    },
  ];
}

const isFunction = (x) => typeof x == "function";

const invokeOrGet = (data, valueOrFunc) =>
  isFunction(valueOrFunc) ? valueOrFunc(data) : valueOrFunc;

function App() {
  const panelRef = useRef();
  const { id } = useParams();
  const [settingsJson, setSettingsJson] = useState({
    loading: true,
    id,
    worldScale: 1.0,
    workingImages: [],
  });

  useEffect(() => {
    fetch(`/api/uploads/${id}/settings.json`)
      .then((res) => res.json())
      .then(setSettingsJson)
      .catch(() => setSettingsJson((x) => ({ ...x, loading: false })));
  }, [id]);

  const setStacks = (x) =>
    setSettingsJson((json) => ({
      ...json,
      workingImages: invokeOrGet(json.workingImages, x),
    }));
  const stacks = settingsJson.workingImages;
  const worldScale = settingsJson.worldScale;

  const [selectedImageId, setSelectedImageId] = useState(0);
  const [inProgress, setInProgress] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(0);

  const [zoomPower, setZoomPower] = usePersistentState("zoomPower", 0.01);
  const [collapse, setCollapse] = useState(false);

  useEffect(() => {
    if (settingsJson.loading) return;
    const h = setTimeout(() => {
      saveSettings(settingsJson)
        .catch((e) => e)
        .then(console.log);
    }, 3 * 1000);
    return () => clearTimeout(h);
  }, [settingsJson]);

  const imageMoving = stacks.find((stack) => selectedImageId == stack.id);
  const setImageMoving = (newImageMoving) => {
    setStacks((allImages) => {
      const x = allImages.findIndex((stack) => selectedImageId == stack.id);
      return allImages.with(x, newImageMoving);
    });
  };

  const getInputProps = (label, field, defaultValue = 0) => ({
    style: { width: "11ex" },
    size: "small",
    margin: "normal",
    type: "number",
    color: "secondary",
    label,
    defaultValue,
    value: imageMoving?.[field] || defaultValue,
    onChange: (event) => {
      if (imageMoving)
        setImageMoving({ ...imageMoving, [field]: +event.target.value });
    },
  });

  if (settingsJson.loading) return null;

  return (
    <div
      className="App"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "stretch",
        alignContent: "stretch",
        alignItems: "stretch",
        grow: 1,
      }}
    >
      <AppBar position="static">
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Box
            component="span"
            sx={{ fontSize: "1.8rem", fontWeight: 700, marginRight: 1 }}
          >
            IRIS
          </Box>

          <Box display="flex" alignItems={"center"}>
            <Link to="/">
              <Tooltip title="All Projects">
                <AppsIcon />
              </Tooltip>
            </Link>
            <Box marginLeft={"1em"} display="flex">
              <TextField
                {...getInputProps("x-coord", "x")}
                inputProps={{ maxLength: 8, step: 1 }}
              />
              <TextField
                {...getInputProps("y-coord", "y")}
                inputProps={{ maxLength: 8, step: 1 }}
              />
              <TextField
                {...getInputProps("rotation", "rotation")}
                inputProps={{ maxLength: 6, step: 0.1 }}
              />
              <TextField
                {...getInputProps("scale", "scaling", 1)}
                inputProps={{ maxLength: 6, step: 0.001 }}
              />
              <TextField
                {...getInputProps("opacity", "opacity", 1)}
                inputProps={{ maxLength: 6, step: 0.1, max: 1, min: 0 }}
              />
              <Divider orientation="vertical" flexItem />
              <TextField
                value={+zoomPower}
                onChange={(e) => setZoomPower(e.target.value)}
                inputProps={{ maxLength: 6, step: 0.1, max: 1, min: 0 }}
                size="small"
                fontSize="5"
                margin="normal"
                type="number"
                color="secondary"
                label="zoom speed"
              />
            </Box>
          </Box>

          <TextField
            size="small"
            margin="normal"
            variant="outlined"
            fullWidth
            label="project name"
            color="secondary"
            value={settingsJson.title || settingsJson.id}
            onChange={(e) =>
              setSettingsJson((x) => ({ ...x, title: e.target.value }))
            }
          />
          <ButtonGroup aria-label="Input-Output">
            <Divider orientation="vertical" flexItem />

            <IconButton
              size="large"
              aria-label="register"
              color="inherit"
              onClick={() => window.open(`/api/export/${settingsJson.id}`)}
            >
              <Box display="flex" flexDirection="column" alignItems={"center"}>
                <SaveAltIcon />
                <Typography fontSize={"small"}>Export</Typography>
              </Box>
            </IconButton>

            <Divider orientation="vertical" flexItem />

            <IconButton
              size="large"
              aria-label="register"
              color="inherit"
              onClick={downloadCanvas}
            >
              <Box display="flex" flexDirection="column" alignItems={"center"}>
                <CameraIcon />
                <Typography fontSize={"small"}>Canvas</Typography>
              </Box>
            </IconButton>

            <Divider orientation="vertical" flexItem />

            <JobQueueViewer id={settingsJson.id} />

            <IconButton
              disabled={inProgress || stacks.length < 2}
              size="large"
              aria-label="register"
              color="inherit"
              onClick={async () => {
                setInProgress(true);
                const result = await runRegistration(settingsJson).catch(() =>
                  setInProgress(false)
                );
                setTimeout(() => setInProgress(false), 10000);
              }}
            >
              <Box display="flex" flexDirection="column" alignItems={"center"}>
                <MemoryIcon />
                <Typography fontSize={"small"}>RunRegistration</Typography>
              </Box>
            </IconButton>
          </ButtonGroup>
        </Toolbar>
      </AppBar>

      <PanelGroup
        direction="horizontal"
        autoSave={true}
        autoSaveId={"registration canvas"}
        style={{
          display: "flex",
          flexDirection: "row",
          width: "100%",
          height: "100%",
          grow: 1,
          justifyContent: "stretch",
          alignItems: "stretch",
          alignContent: "stretch",
        }}
      >
        <Panel style={{ overflow: "hidden", display: "flex" }}>
          <RegistrationCanvas
            selectedImageId={selectedImageId}
            setSelectedImageId={setSelectedImageId}
            setStacks={setStacks}
            stacks={stacks}
            worldScale={worldScale}
            zoomPower={zoomPower}
          />
        </Panel>
        <PanelResizeHandle
          style={{
            padding: 0,
            margin: 0,
          }}
        >
          <Divider orientation="vertical" width="2px" margin="0" padding={0}>
            <UnfoldMoreIcon
              sx={{ transform: "rotate(90deg)" }}
              onDoubleClick={() => {
                const smallSize =
                  (150 / document.querySelector(".App").clientWidth) * 100;
                console.log(panelRef.current.size, smallSize);
                if (panelRef.current.getSize() > smallSize + 1) {
                  panelRef.current.resize(smallSize);
                  setCollapse(true);
                } else {
                  const mediumSize =
                    (600 / document.querySelector(".App").clientWidth) * 100;
                  panelRef.current.resize(mediumSize);
                  setCollapse(false);
                }
              }}
            />
          </Divider>
        </PanelResizeHandle>

        <Panel
          id="right-panel"
          ref={panelRef}
          style={{ display: "flex", height: "100%" }}
          collapsedSize={0}
          collapsible={true}
          onResize={() => {
            const smallSize =
              (150 / document.querySelector(".App").clientWidth) * 100;
            console.log(panelRef.current.size, smallSize);
            if (panelRef.current.getSize() > smallSize + 1 && collapse) {
              setCollapse(false);
            }
          }}
        >
          <ImageUploader
            projectId={settingsJson.id}
            stacks={stacks}
            setStacks={setStacks}
            selectedImageId={selectedImageId}
            setSelectedImageId={setSelectedImageId}
            small={collapse}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}

export default App;
