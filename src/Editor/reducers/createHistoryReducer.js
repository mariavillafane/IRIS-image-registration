const createHistoryReducer = (
  baseReducer,
  ignoreEvents = [
    "CANVAS_DRAG_MOVE",
    "CANVAS_DRAG_START",
    "CANVAS_UPDATE_MOUSEPOS",
  ]
) => {
  return (state, action) => {
    console.log("History Reducer - Action:", action.type);
    console.log("History Reducer - Past length:", state.past.length);
    console.log("History Reducer - Future length:", state.future.length);

    const buildMeta = (act) =>
      act.meta || {
        type: act.type,
        time: Date.now(),
        label: (act.meta && act.meta.label) || act.type,
      };

    // UNDO
    if (action.type === "UNDO") {
      console.log("UNDO action triggered");
      // never allow removing the first (initial) history entry
      if (state.past.length <= 1) {
        console.log("Cannot undo initial history entry");
        return state;
      }
      const newPast = state.past.slice(0, -1);
      const newPastMeta = state.pastMeta.slice(0, -1);
      const newPresent = state.past[state.past.length - 1];
      const newPresentMeta = state.pastMeta[state.pastMeta.length - 1];
      const newFuture = [state.present, ...state.future];
      const newFutureMeta = [state.presentMeta, ...state.futureMeta];
      return {
        past: newPast,
        present: newPresent,
        future: newFuture,
        pastMeta: newPastMeta,
        presentMeta: newPresentMeta,
        futureMeta: newFutureMeta,
      };
    }

    // REDO
    if (action.type === "REDO") {
      console.log("REDO action triggered");
      if (state.future.length === 0) return state;
      const newPast = [...state.past, state.present];
      const newPastMeta = [...state.pastMeta, state.presentMeta];
      const newPresent = state.future[0];
      const newPresentMeta = state.futureMeta[0];
      const newFuture = state.future.slice(1);
      const newFutureMeta = state.futureMeta.slice(1);
      return {
        past: newPast,
        present: newPresent,
        future: newFuture,
        pastMeta: newPastMeta,
        presentMeta: newPresentMeta,
        futureMeta: newFutureMeta,
      };
    }

    // Compute new present
    const newPresent = baseReducer(state.present, action);
    console.log("Base reducer returned new state");

    // Simple deep-equality test (JSON stringify - sufficient for this state shape)
    const isEqual = (a, b) => {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch (e) {
        return a === b;
      }
    };

    // High-frequency UI events: update present but don't touch history
    if (ignoreEvents.includes(action.type)) {
      if (isEqual(newPresent, state.present)) return state;
      console.log(action.type + " - updating present without history");
      return {
        ...state,
        present: newPresent,
      };
    }

    // If reducer returned identical state, do nothing (avoid duplicate history entry)
    if (isEqual(newPresent, state.present)) {
      console.log("No state change detected; not adding to history");
      return state;
    }

    // Normal action -> push current present into past with meta
    const meta = buildMeta(action);
    return {
      past: [...state.past, state.present],
      present: newPresent,
      future: [],
      pastMeta: [...state.pastMeta, state.presentMeta],
      presentMeta: meta,
      futureMeta: [],
    };
  };
};

export default createHistoryReducer;
