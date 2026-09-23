import createHistoryReducer from "../reducers/createHistoryReducer";
import type { HistoryMeta, HistoryState } from "../../types";

interface TestState {
  v?: number;
  x?: number;
  mousePos?: { x: number; y: number };
}

interface TestAction {
  type: string;
  meta?: HistoryMeta;
  payload?: { x?: number; y?: number };
}

const baseReducer = (state: TestState, action: TestAction): TestState => {
  if (action.type === "INCR") return { ...state, v: (state.v || 0) + 1 };
  if (action.type === "DECR") return { ...state, v: (state.v || 0) - 1 };
  if (action.type === "NOOP") return state;
  if (action.type === "CANVAS_DRAG_MOVE")
    return { ...state, x: action.payload?.x };
  if (action.type === "CANVAS_UPDATE_MOUSEPOS")
    return {
      ...state,
      mousePos: { x: action.payload?.x ?? 0, y: action.payload?.y ?? 0 },
    };
  return state;
};

const initialPresent: TestState = { v: 0, x: 0, mousePos: { x: 0, y: 0 } };

const makeState = (): HistoryState<TestState> => ({
  past: [initialPresent],
  present: initialPresent,
  future: [],
  pastMeta: [],
  presentMeta: { type: "INIT", time: 0, label: "Init" },
  futureMeta: [],
});

describe("createHistoryReducer", () => {
  describe("UNDO behavior", () => {
    test("does not undo when only initial entry exists (past.length <= 1)", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const out = reducer(state, { type: "UNDO" });
      expect(out).toBe(state);
    });

    test("undoes to previous state when history exists", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const after = reducer(state, { type: "INCR" });
      const after2 = reducer(after, { type: "INCR" });
      expect(after2.present.v).toBe(2);
      expect(after2.past.length).toBe(3);

      const undone = reducer(after2, { type: "UNDO" });
      expect(undone.present.v).toBe(1);
      expect(undone.past.length).toBe(2);
      expect(undone.future).toHaveLength(1);
    });

    test("moves present to future on undo", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const after = reducer(state, { type: "INCR" });
      const undone = reducer(after, { type: "UNDO" });
      expect(undone.future[0].v).toBe(1);
    });

    test("preserves meta on undo", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const after = reducer(state, {
        type: "INCR",
        meta: { label: "Increment" },
      });
      const undone = reducer(after, { type: "UNDO" });
      expect(undone.futureMeta[0].label).toBe("Increment");
    });
  });

  describe("REDO behavior", () => {
    test("does nothing when no future states", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const out = reducer(state, { type: "REDO" });
      expect(out).toBe(state);
    });

    test("redoes to next state when future exists", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const after = reducer(state, { type: "INCR" });
      const undone = reducer(after, { type: "UNDO" });
      expect(undone.present.v).toBe(0);

      const redone = reducer(undone, { type: "REDO" });
      expect(redone.present.v).toBe(1);
      expect(redone.future).toHaveLength(0);
    });

    test("moves present to past on redo", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const after = reducer(state, { type: "INCR" });
      const undone = reducer(after, { type: "UNDO" });
      const redone = reducer(undone, { type: "REDO" });
      expect(redone.past[redone.past.length - 1].v).toBe(0);
    });

    test("clears future when new action taken after undo", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const after1 = reducer(state, { type: "INCR" });
      const undone = reducer(after1, { type: "UNDO" });
      expect(undone.future).toHaveLength(1);

      const after2 = reducer(undone, { type: "DECR" });
      expect(after2.future).toHaveLength(0);
    });
  });

  describe("Deduplication", () => {
    test("identical state still gets a history entry (the deduplication check is currently disabled in the reducer)", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const after = reducer(state, { type: "NOOP" });
      // If the commented-out deduplication check were active, `after` would be
      // `state` itself and past would stay at length 1.
      expect(after.past.length).toBe(2);
    });

    test("skips history for high-frequency CANVAS_DRAG_MOVE events", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const after = reducer(state, {
        type: "CANVAS_DRAG_MOVE",
        payload: { x: 10 },
      });
      expect(after.past.length).toBe(1);
      expect(after.present.x).toBe(10);
    });

    test("skips history for CANVAS_UPDATE_MOUSEPOS events", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const after = reducer(state, {
        type: "CANVAS_UPDATE_MOUSEPOS",
        payload: { x: 5, y: 5 },
      });
      expect(after.past.length).toBe(1);
      expect(after.present.mousePos).toEqual({ x: 5, y: 5 });
    });
  });

  describe("Metadata tracking", () => {
    test("builds meta with default type label when not provided", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const after = reducer(state, { type: "INCR" });
      expect(after.presentMeta.type).toBe("INCR");
      expect(after.presentMeta.label).toBe("INCR");
      expect(typeof after.presentMeta.time).toBe("number");
    });

    test("uses provided meta.label if given", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const after = reducer(state, {
        type: "INCR",
        meta: { label: "Custom Label" },
      });
      expect(after.presentMeta.label).toBe("Custom Label");
    });

    test("maintains parallel meta arrays", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      const after1 = reducer(state, { type: "INCR", meta: { label: "Inc1" } });
      const after2 = reducer(after1, { type: "INCR", meta: { label: "Inc2" } });

      expect(after2.pastMeta).toHaveLength(2);
      expect(after2.pastMeta[0].label).toBe("Inc1");
      expect(after2.pastMeta[1].label).toBe("Inc2");
      expect(after2.presentMeta.label).toBe("Inc2");
    });
  });

  describe("Complex scenarios", () => {
    test("handles undo-redo-undo sequence", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      let state = makeState();
      state = reducer(state, { type: "INCR" });
      state = reducer(state, { type: "INCR" });
      expect(state.present.v).toBe(2);

      state = reducer(state, { type: "UNDO" });
      expect(state.present.v).toBe(1);

      state = reducer(state, { type: "REDO" });
      expect(state.present.v).toBe(2);

      state = reducer(state, { type: "UNDO" });
      expect(state.present.v).toBe(1);
    });

    test("initializes with exactly one item in past", () => {
      const reducer = createHistoryReducer<TestState, TestAction>(baseReducer);
      const state = makeState();
      expect(state.past.length).toBe(1);
      expect(state.past[0]).toEqual(initialPresent);
    });
  });
});
