import "./App.css";
import { useEffect, useRef, useState, useReducer } from "react";
import { RegistrationCanvas } from "./RegistrationCanvas";
import { ImageUploader } from "./ImageUploader";
import { EditorAppBar } from "./EditorAppBar";
import settingsReducer from "./reducers/settingsReducer";
import createHistoryReducer from "./reducers/createHistoryReducer";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";

import { Divider, Snackbar, Alert } from "@mui/material";

import { saveSettings } from "../utils/actions";
import { useParams } from "react-router";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

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

function App() {
  const panelRef = useRef();
  const { id } = useParams();

  const initialPresent = {
    loading: true,
    id,
    worldScale: 1.0,
    workingImages: [],
    dragStart: null,
    mousepos: { x: 0, y: 0 },
    orientation: 0,
  };

  const [state, dispatch] = useReducer(createHistoryReducer(settingsReducer), {
    past: [],
    present: initialPresent,
    future: [],
    pastMeta: [],
    presentMeta: { type: "INIT", time: Date.now(), label: "Init" },
    futureMeta: [],
  });
  const settingsJson = state.present;

  const [snack, setSnack] = useState({ open: false, message: "" });

  const handleUndoRedo = (snackData) => {
    setSnack({ open: true, ...snackData });
  };

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
      <EditorAppBar
        state={state}
        dispatch={dispatch}
        settingsJson={settingsJson}
        editorMode={editorMode}
        setEditorMode={setEditorMode}
        stacks={stacks}
        zoomPower={zoomPower}
        setZoomPower={setZoomPower}
        inProgress={inProgress}
        setInProgress={setInProgress}
        selectedStackId={selectedStackId}
        onUndoRedo={handleUndoRedo}
      />

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          severity="info"
          sx={{ width: "100%" }}
        >
          {snack.message}
        </Alert>
      </Snackbar>

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
