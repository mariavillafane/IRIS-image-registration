import settingsReducer from "../reducers/settingsReducer";

const mockState = {
  id: "proj-1",
  loading: false,
  title: "Test Project",
  worldScale: 1.0,
  workingImages: [
    {
      id: 1,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      scaling: 1,
      rotation: 0,
      opacity: 1,
      imageEntries: [
        { id: "img-1", checked: true, files: { url: "/img1.jpg" } },
      ],
    },
    {
      id: 2,
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      scaling: 1,
      rotation: 0,
      opacity: 1,
      imageEntries: [
        { id: "img-2", checked: true, files: { url: "/img2.jpg" } },
      ],
    },
  ],
  dragStart: null,
  mousepos: { x: 0, y: 0 },
  orientation: 0,
};

describe("settingsReducer", () => {
  test("SET_SETTINGS replaces entire state", () => {
    const initial = { loading: true };
    const payload = { loading: false, title: "New" };
    const out = settingsReducer(initial, { type: "SET_SETTINGS", payload });
    expect(out).toEqual(payload);
  });

  test("SET_LOADING updates loading flag", () => {
    const out = settingsReducer(mockState, {
      type: "SET_LOADING",
      payload: true,
    });
    expect(out.loading).toBe(true);
    expect(out.title).toBe(mockState.title);
  });

  test("SET_STACKS replaces workingImages", () => {
    const newStacks = [{ id: 99, imageEntries: [] }];
    const out = settingsReducer(mockState, {
      type: "SET_STACKS",
      payload: newStacks,
    });
    expect(out.workingImages).toEqual(newStacks);
  });

  test("SET_TITLE updates title", () => {
    const out = settingsReducer(mockState, {
      type: "SET_TITLE",
      payload: "New Title",
    });
    expect(out.title).toBe("New Title");
  });

  test("UPDATE_STACK updates matching stack by id", () => {
    const out = settingsReducer(mockState, {
      type: "UPDATE_STACK",
      payload: { stackId: 2, updates: { x: 100 } },
    });
    expect(out.workingImages.find((s) => s.id === 2).x).toBe(100);
    expect(out.workingImages.find((s) => s.id === 1).x).toBe(0);
  });

  test("UPDATE_STACK_BY_INDEX updates stack at index", () => {
    const out = settingsReducer(mockState, {
      type: "UPDATE_STACK_BY_INDEX",
      payload: { index: 0, updates: { y: 99 } },
    });
    expect(out.workingImages[0].y).toBe(99);
    expect(out.workingImages[1].y).toBe(50);
  });

  test("CANVAS_DRAG_START sets dragStart", () => {
    const out = settingsReducer(mockState, {
      type: "CANVAS_DRAG_START",
      payload: {
        stackIndex: 0,
        stackId: 1,
        clientX: 100,
        clientY: 200,
        svgScaleX: 2,
        svgScaleY: 2,
      },
    });
    expect(out.dragStart).toEqual([50, 100, 0, 0, 0]);
  });

  test("CANVAS_DRAG_MOVE updates position when dragging", () => {
    const stateWithDrag = {
      ...mockState,
      dragStart: [10, 20, 0, 0, 0],
    };
    const out = settingsReducer(stateWithDrag, {
      type: "CANVAS_DRAG_MOVE",
      payload: { clientX: 50, clientY: 100, svgScaleX: 1, svgScaleY: 1 },
    });
    expect(out.workingImages[0].x).toBe(40);
    expect(out.workingImages[0].y).toBe(80);
  });

  test("CANVAS_DRAG_MOVE without dragStart returns unchanged state", () => {
    const out = settingsReducer(mockState, {
      type: "CANVAS_DRAG_MOVE",
      payload: { clientX: 50, clientY: 100, svgScaleX: 1, svgScaleY: 1 },
    });
    expect(out).toEqual(mockState);
  });

  test("CANVAS_DRAG_END clears dragStart", () => {
    const stateWithDrag = {
      ...mockState,
      dragStart: [10, 20, 0, 0, 0],
    };
    const out = settingsReducer(stateWithDrag, { type: "CANVAS_DRAG_END" });
    expect(out.dragStart).toBeNull();
  });

  test("CANVAS_UPDATE_MOUSEPOS updates mousepos", () => {
    const out = settingsReducer(mockState, {
      type: "CANVAS_UPDATE_MOUSEPOS",
      payload: { x: 123, y: 456 },
    });
    expect(out.mousepos).toEqual({ x: 123, y: 456 });
  });

  test("CANVAS_CYCLE_ORIENTATION increments orientation", () => {
    const out = settingsReducer(mockState, {
      type: "CANVAS_CYCLE_ORIENTATION",
    });
    expect(out.orientation).toBe(1);
  });

  test("ADD_STACK appends new stack", () => {
    const newStack = { id: 3, imageEntries: [] };
    const out = settingsReducer(mockState, {
      type: "ADD_STACK",
      payload: newStack,
    });
    expect(out.workingImages).toHaveLength(3);
    expect(out.workingImages[2]).toEqual(newStack);
  });

  test("ADD_IMAGES_TO_STACK appends images to existing stack", () => {
    const newImages = [{ id: "img-new", checked: true }];
    const out = settingsReducer(mockState, {
      type: "ADD_IMAGES_TO_STACK",
      payload: { stackIndex: 0, imageEntries: newImages },
    });
    expect(out.workingImages[0].imageEntries).toHaveLength(2);
    expect(out.workingImages[0].imageEntries[1].id).toBe("img-new");
  });

  test("REPLACE_STACK_IMAGES replaces all images in stack", () => {
    const newImages = [{ id: "replacement", checked: false }];
    const out = settingsReducer(mockState, {
      type: "REPLACE_STACK_IMAGES",
      payload: {
        stackIndex: 1,
        width: 200,
        height: 200,
        imageEntries: newImages,
      },
    });
    expect(out.workingImages[1].imageEntries).toEqual(newImages);
    expect(out.workingImages[1].width).toBe(200);
    expect(out.workingImages[1].height).toBe(200);
  });

  test("DELETE_IMAGE_ENTRY removes image from stack", () => {
    const stateWithMultipleEntries = {
      ...mockState,
      workingImages: [
        {
          ...mockState.workingImages[0],
          imageEntries: [
            { id: "img-1", checked: true, files: { url: "/img1.jpg" } },
            { id: "img-1b", checked: true, files: { url: "/img1b.jpg" } },
          ],
        },
      ],
    };
    const out = settingsReducer(stateWithMultipleEntries, {
      type: "DELETE_IMAGE_ENTRY",
      payload: { stackIndex: 0, entryIndex: 0 },
    });
    expect(out.workingImages[0].imageEntries).toHaveLength(1);
    expect(out.workingImages[0].imageEntries[0].id).toBe("img-1b");
  });

  test("DELETE_IMAGE_ENTRY removes stack when last image deleted", () => {
    const out = settingsReducer(mockState, {
      type: "DELETE_IMAGE_ENTRY",
      payload: { stackIndex: 1, entryIndex: 0 },
    });
    expect(out.workingImages).toHaveLength(1);
    expect(out.workingImages[0].id).toBe(1);
  });

  test("TOGGLE_IMAGE_VISIBILITY updates checked flag", () => {
    const out = settingsReducer(mockState, {
      type: "TOGGLE_IMAGE_VISIBILITY",
      payload: { stackIndex: 0, entryIndex: 0, checked: false },
    });
    expect(out.workingImages[0].imageEntries[0].checked).toBe(false);
  });

  test("unknown action returns state unchanged", () => {
    const out = settingsReducer(mockState, { type: "UNKNOWN_ACTION" });
    expect(out).toEqual(mockState);
  });
});
