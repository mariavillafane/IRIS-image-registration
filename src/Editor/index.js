import "./App.css";
import { useEffect, useRef, useState, useReducer } from "react";
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
  ToggleButton,
  ToggleButtonGroup,
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

const settingsReducer = (state, action) => {
  switch (action.type) {
    case "SET_SETTINGS":
      return action.payload;
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_STACKS":
      return { ...state, workingImages: action.payload };
    case "SET_TITLE":
      return { ...state, title: action.payload };
    case "UPDATE_STACK": {
      const { stackId, updates } = action.payload;
      const newStacks = state.workingImages.map((stack) =>
        stack.id === stackId ? { ...stack, ...updates } : stack
      );
      return { ...state, workingImages: newStacks };
    }
    case "UPDATE_STACK_BY_INDEX": {
      const { index, updates } = action.payload;
      return {
        ...state,
        workingImages: state.workingImages.with(index, {
          ...state.workingImages[index],
          ...updates,
        }),
      };
    }
    case "CANVAS_DRAG_START": {
      const { stackIndex, stackId, clientX, clientY, svgScaleX, svgScaleY } =
        action.payload;
      const stack = state.workingImages[stackIndex];
      return {
        ...state,
        dragStart: [
          clientX / svgScaleX,
          clientY / svgScaleY,
          stack.x,
          stack.y,
          stackIndex,
        ],
      };
    }
    case "CANVAS_DRAG_MOVE": {
      const { clientX, clientY, svgScaleX, svgScaleY } = action.payload;
      if (!state.dragStart) return state;
      const [x, y] = [
        Math.round(
          clientX / svgScaleX - state.dragStart[0] + state.dragStart[2]
        ),
        Math.round(
          clientY / svgScaleY - state.dragStart[1] + state.dragStart[3]
        ),
      ];
      return {
        ...state,
        workingImages: state.workingImages.with(state.dragStart[4], {
          ...state.workingImages[state.dragStart[4]],
          x,
          y,
        }),
      };
    }
    case "CANVAS_DRAG_END":
      return { ...state, dragStart: null };
    case "CANVAS_UPDATE_MOUSEPOS": {
      const { x, y } = action.payload;
      return { ...state, mousepos: { x, y } };
    }
    case "CANVAS_CYCLE_ORIENTATION":
      return { ...state, orientation: (state.orientation || 0) + 1 };
    case "ADD_STACK": {
      const newStack = action.payload;
      return { ...state, workingImages: [...state.workingImages, newStack] };
    }
    case "ADD_IMAGES_TO_STACK": {
      const { stackIndex, imageEntries } = action.payload;
      const stack = state.workingImages[stackIndex];
      return {
        ...state,
        workingImages: state.workingImages.with(stackIndex, {
          ...stack,
          imageEntries: [...stack.imageEntries, ...imageEntries],
        }),
      };
    }
    case "REPLACE_STACK_IMAGES": {
      const { stackIndex, width, height, imageEntries } = action.payload;
      const stack = state.workingImages[stackIndex];
      return {
        ...state,
        workingImages: state.workingImages.with(stackIndex, {
          ...stack,
          width,
          height,
          imageEntries,
        }),
      };
    }
    case "DELETE_IMAGE_ENTRY": {
      const { stackIndex, entryIndex } = action.payload;
      const stack = state.workingImages[stackIndex];
      const newEntries = stack.imageEntries.filter((_, i) => i !== entryIndex);
      if (newEntries.length === 0) {
        return {
          ...state,
          workingImages: state.workingImages.filter((_, i) => i !== stackIndex),
        };
      }
      return {
        ...state,
        workingImages: state.workingImages.with(stackIndex, {
          ...stack,
          imageEntries: newEntries,
        }),
      };
    }
    case "TOGGLE_IMAGE_VISIBILITY": {
      const { stackIndex, entryIndex, checked } = action.payload;
      const stack = state.workingImages[stackIndex];
      const imageEntry = stack.imageEntries[entryIndex];
      const newEntries = stack.imageEntries.with(entryIndex, {
        ...imageEntry,
        checked,
      });
      return {
        ...state,
        workingImages: state.workingImages.with(stackIndex, {
          ...stack,
          imageEntries: newEntries,
        }),
      };
    }
    default:
      return state;
  }
};

function App() {
  const panelRef = useRef();
  const { id } = useParams();
  const [settingsJson, dispatch] = useReducer(settingsReducer, {
    loading: true,
    id,
    worldScale: 1.0,
    workingImages: [],
    dragStart: null,
    mousepos: { x: 0, y: 0 },
    orientation: 0,
  });

  useEffect(() => {
    fetch(`/api/uploads/${id}/settings.json`)
      .then((res) => res.json())
      .then((data) => dispatch({ type: "SET_SETTINGS", payload: data }))
      .catch(() => dispatch({ type: "SET_LOADING", payload: false }));
  }, [id]);

  const stacks = settingsJson.workingImages;
  const worldScale = settingsJson.worldScale;

  const [selectedStackId, setSelectedStackId] = useState(0);
  const [inProgress, setInProgress] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(0);

  const [zoomPower, setZoomPower] = usePersistentState("zoomPower", 0.01);
  const [collapse, setCollapse] = useState(false);

  const [editorMode, setEditorMode] = useState("edit");

  useEffect(() => {
    if (settingsJson.loading) return;
    const h = setTimeout(() => {
      saveSettings(settingsJson)
        .catch((e) => e)
        .then(console.log);
    }, 3 * 1000);
    return () => clearTimeout(h);
  }, [settingsJson]);

  const imageMoving = stacks.find((stack) => selectedStackId == stack.id);
  const setImageMoving = (newImageMoving) => {
    dispatch({
      type: "UPDATE_STACK",
      payload: { stackId: selectedStackId, updates: newImageMoving },
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

            <ToggleButtonGroup
              //color="primary"
              value={editorMode} //toggle
              exclusive
              onChange={(event, newEditorMode) => setEditorMode(newEditorMode)}
              aria-label="Mode Selection"
            >
              <ToggleButton value="compare">compare</ToggleButton>
              <ToggleButton value="edit">edit</ToggleButton>
            </ToggleButtonGroup>

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
              dispatch({ type: "SET_TITLE", payload: e.target.value })
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
            selectedStackId={selectedStackId}
            setSelectedStackId={setSelectedStackId}
            dispatch={dispatch}
            dragStart={settingsJson.dragStart}
            mousepos={settingsJson.mousepos}
            orientation={settingsJson.orientation}
            stacks={stacks}
            worldScale={worldScale}
            zoomPower={zoomPower}
            editorMode={editorMode}
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
            dispatch={dispatch}
            selectedStackId={selectedStackId}
            setSelectedStackId={setSelectedStackId}
            small={collapse}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}

export default App;
