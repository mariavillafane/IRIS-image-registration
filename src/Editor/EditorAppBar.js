import {
  AppBar,
  Box,
  ButtonGroup,
  Divider,
  Badge,
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
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import AppsIcon from "@mui/icons-material/Apps";
import { Link } from "react-router";
import { downloadCanvas, runRegistration } from "../utils/actions";
import { JobQueueViewer } from "./JobViewer";

export function EditorAppBar({
  state,
  dispatch,
  settingsJson,
  editorMode,
  setEditorMode,
  stacks,
  zoomPower,
  setZoomPower,
  inProgress,
  setInProgress,
  selectedStackId,
  onUndoRedo,
}) {
  const imageMoving = stacks.find((stack) => selectedStackId === stack.id);

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
      if (imageMoving) {
        dispatch({
          type: "UPDATE_STACK",
          payload: {
            stackId: selectedStackId,
            updates: { ...imageMoving, [field]: +event.target.value },
          },
        });
      }
    },
  });

  const handleUndo = () => {
    if (state.past.length <= 1) return;
    const meta = state.presentMeta;
    dispatch({ type: "UNDO" });
    onUndoRedo({
      message: `Undid ${meta?.label || meta?.type} @ ${new Date(
        meta?.time
      ).toLocaleTimeString()}`,
    });
  };

  const handleRedo = () => {
    if (state.future.length === 0) return;
    const meta = state.futureMeta[0];
    dispatch({ type: "REDO" });
    onUndoRedo({
      message: `Redid ${meta?.label || meta?.type} @ ${new Date(
        meta?.time
      ).toLocaleTimeString()}`,
    });
  };

  return (
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
            value={editorMode}
            exclusive
            onChange={(event, newEditorMode) => setEditorMode(newEditorMode)}
            aria-label="Mode Selection"
          >
            <ToggleButton value="compare">compare</ToggleButton>
            <ToggleButton value="edit">edit</ToggleButton>
          </ToggleButtonGroup>

          <Divider orientation="vertical" flexItem sx={{ marginX: 1 }} />

          <Tooltip title="Undo">
            <span>
              <Badge
                badgeContent={Math.max(0, state.past.length - 1)}
                color="secondary"
                max={99}
              >
                <IconButton
                  disabled={state.past.length <= 1}
                  size="small"
                  onClick={handleUndo}
                >
                  <UndoIcon />
                </IconButton>
              </Badge>
            </span>
          </Tooltip>

          <Tooltip title="Redo">
            <span>
              <Badge
                badgeContent={state.future.length}
                color="secondary"
                max={99}
              >
                <IconButton
                  disabled={state.future.length === 0}
                  size="small"
                  onClick={handleRedo}
                >
                  <RedoIcon />
                </IconButton>
              </Badge>
            </span>
          </Tooltip>

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
            aria-label="export"
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
            aria-label="download canvas"
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
            aria-label="run registration"
            color="inherit"
            onClick={async () => {
              setInProgress(true);
              await runRegistration(settingsJson).catch(() =>
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
  );
}
