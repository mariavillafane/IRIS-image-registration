import type { EditorAction, EditorSettings } from "../../types";

const settingsReducer = (
  state: EditorSettings,
  action: EditorAction
): EditorSettings => {
  console.log("Settings Reducer - Action:", action.type);
  switch (action.type) {
    case "SET_SETTINGS":
      console.log("SET_SETTINGS - loading initial data");
      return action.payload;
    case "SET_LOADING":
      console.log("SET_LOADING");
      return { ...state, loading: action.payload };
    case "SET_STACKS":
      console.log("SET_STACKS");
      return { ...state, workingImages: action.payload };
    case "SET_TITLE":
      console.log("SET_TITLE:", action.payload);
      return { ...state, title: action.payload };
    case "UPDATE_STACK": {
      console.log("UPDATE_STACK");
      const { stackId, updates } = action.payload;
      const newStacks = state.workingImages.map((stack) =>
        stack.id === stackId ? { ...stack, ...updates } : stack
      );
      return { ...state, workingImages: newStacks };
    }
    case "UPDATE_STACK_BY_INDEX": {
      console.log("UPDATE_STACK_BY_INDEX");
      const { index, updates } = action.payload;
      return {
        ...state,
        workingImages: state.workingImages.with(index, {
          ...state.workingImages[index],
          ...updates,
        }),
      };
    }

    case "CANVAS_DRAG_MOVE": {
      const { clientX, clientY, svgScaleX, svgScaleY, dragStart } =
        action.payload;
      if (!dragStart) return state;
      const [x, y] = [
        Math.round(clientX / svgScaleX - dragStart[0] + dragStart[2]),
        Math.round(clientY / svgScaleY - dragStart[1] + dragStart[3]),
      ];
      return {
        ...state,
        workingImages: state.workingImages.with(dragStart[4], {
          ...state.workingImages[dragStart[4]],
          x,
          y,
        }),
      };
    }

    case "CANVAS_UPDATE_MOUSEPOS": {
      return {
        ...state,
        mousepos: { x: action.payload.x, y: action.payload.y },
      };
    }
    case "CANVAS_CYCLE_ORIENTATION":
      console.log("CANVAS_CYCLE_ORIENTATION");
      return { ...state, orientation: (state.orientation || 0) + 1 };
    case "ADD_STACK": {
      console.log("ADD_STACK");
      const newStack = action.payload;
      return { ...state, workingImages: [...state.workingImages, newStack] };
    }
    case "ADD_IMAGES_TO_STACK": {
      console.log("ADD_IMAGES_TO_STACK");
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
      console.log("REPLACE_STACK_IMAGES");
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
      console.log("DELETE_IMAGE_ENTRY");
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
      console.log("TOGGLE_IMAGE_VISIBILITY");
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
      console.log("Unknown action type:", action.type);
      return state;
  }
};

export default settingsReducer;
