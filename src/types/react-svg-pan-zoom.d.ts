// Local type declarations for react-svg-pan-zoom (the package ships no types
// of its own). Declared here instead of using @types/react-svg-pan-zoom,
// which pins a nested @types/react that conflicts with the project's types.
declare module "react-svg-pan-zoom" {
  import type {
    Component,
    CSSProperties,
    ReactElement,
    ReactNode,
  } from "react";
  import type {
    MouseEvent as ReactMouseEvent,
    TouchEvent as ReactTouchEvent,
  } from "react";

  export const MODE_IDLE: "idle";
  export const MODE_PANNING: "panning";
  export const MODE_ZOOMING: "zooming";

  export const TOOL_AUTO: "auto";
  export const TOOL_NONE: "none";
  export const TOOL_PAN: "pan";
  export const TOOL_ZOOM_IN: "zoom-in";
  export const TOOL_ZOOM_OUT: "zoom-out";

  export const POSITION_NONE: "none";
  export const POSITION_TOP: "top";
  export const POSITION_RIGHT: "right";
  export const POSITION_BOTTOM: "bottom";
  export const POSITION_LEFT: "left";

  export const ALIGN_CENTER: "center";
  export const ALIGN_LEFT: "left";
  export const ALIGN_RIGHT: "right";
  export const ALIGN_TOP: "top";
  export const ALIGN_BOTTOM: "bottom";

  /** Initial (reset) viewer value. */
  export const INITIAL_VALUE: Value | null;

  export type Tool =
    | typeof TOOL_AUTO
    | typeof TOOL_NONE
    | typeof TOOL_PAN
    | typeof TOOL_ZOOM_IN
    | typeof TOOL_ZOOM_OUT;

  export interface Value {
    version: 2;
    mode: typeof MODE_IDLE | typeof MODE_PANNING | typeof MODE_ZOOMING;
    focus: boolean;
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
    viewerWidth: number;
    viewerHeight: number;
    SVGWidth: number;
    SVGHeight: number;
    startX?: number | null;
    startY?: number | null;
    endX?: number | null;
    endY?: number | null;
    miniatureOpen: boolean;
  }

  export interface Point {
    x: number;
    y: number;
  }

  /** Event object handed to the viewer mouse/touch handlers. */
  export interface ViewerMouseEvent<T = unknown> {
    originalEvent: ReactMouseEvent<T>;
    value: Value;
    SVGViewer: SVGSVGElement;
    point: Point;
    x: number;
    y: number;
    scaleFactor: number;
    translationX: number;
    translationY: number;
    preventDefault(): void;
    stopPropagation(): void;
  }

  export interface ViewerTouchEvent<T = unknown> {
    originalEvent: ReactTouchEvent<T>;
    value: Value;
    SVGViewer: SVGSVGElement;
    points: Point[];
    changedPoints: Point[];
    scaleFactor: number;
    translationX: number;
    translationY: number;
    preventDefault(): void;
    stopPropagation(): void;
  }

  export interface ReactSVGPanZoomProps {
    children: ReactElement;
    width: number;
    height: number;
    tool: Tool;
    value: Value | null;
    onChangeTool(tool: Tool): void;
    onChangeValue(value: Value): void;

    background?: string;
    SVGBackground?: string;
    style?: CSSProperties;
    className?: string;

    detectWheel?: boolean;
    detectAutoPan?: boolean;
    detectPinchGesture?: boolean;
    preventPanOutside?: boolean;
    scaleFactor?: number;
    scaleFactorOnWheel?: number;
    scaleFactorMax?: number;
    scaleFactorMin?: number;
    modifierKeys?: string[];
    disableDoubleClickZoomWithToolAuto?: boolean;

    toolbarProps?: {
      position?:
        | typeof POSITION_NONE
        | typeof POSITION_TOP
        | typeof POSITION_RIGHT
        | typeof POSITION_BOTTOM
        | typeof POSITION_LEFT;
      SVGAlignX?: typeof ALIGN_CENTER | typeof ALIGN_LEFT | typeof ALIGN_RIGHT;
      SVGAlignY?: typeof ALIGN_CENTER | typeof ALIGN_TOP | typeof ALIGN_BOTTOM;
    };

    miniatureProps?: {
      position?:
        | typeof POSITION_NONE
        | typeof POSITION_RIGHT
        | typeof POSITION_LEFT;
      background?: string;
      width?: number;
      height?: number;
    };
    customMiniature?: ReactElement | React.ComponentType;

    customToolbar?: React.ComponentType<any>;

    onClick?<T>(event: ViewerMouseEvent<T>): void;
    onDoubleClick?<T>(event: ViewerMouseEvent<T>): void;
    onMouseUp?<T>(event: ViewerMouseEvent<T>): void;
    onMouseMove?<T>(event: ViewerMouseEvent<T>): void;
    onMouseDown?<T>(event: ViewerMouseEvent<T>): void;
    onZoom?<T>(event: ViewerMouseEvent<T>): void;
    onPan?<T>(event: ViewerMouseEvent<T>): void;
    onTouchStart?<T>(event: ViewerTouchEvent<T>): void;
    onTouchMove?<T>(event: ViewerTouchEvent<T>): void;
    onTouchEnd?<T>(event: ViewerTouchEvent<T>): void;
  }

  export class ReactSVGPanZoom extends Component<ReactSVGPanZoomProps> {
    pan(SVGDeltaX: number, SVGDeltaY: number): void;
    zoom(SVGPointX: number, SVGPointY: number, scaleFactor: number): void;
    fitSelection(
      selectionSVGPointX: number,
      selectionSVGPointY: number,
      selectionWidth: number,
      selectionHeight: number
    ): void;
    fitToViewer(): void;
    setPointOnViewerCenter(
      SVGPointX: number,
      SVGPointY: number,
      zoomLevel: number
    ): void;
    reset(): void;
    zoomOnViewerCenter(scaleFactor: number): void;
    getValue(): Value;
    setValue(value: Value): void;
    getTool(): Tool;
    setTool(tool: Tool): void;
  }

  export class UncontrolledReactSVGPanZoom extends Component<ReactSVGPanZoomProps> {
    pan(SVGDeltaX: number, SVGDeltaY: number): void;
    zoom(SVGPointX: number, SVGPointY: number, scaleFactor: number): void;
    fitToViewer(): void;
    reset(): void;
    zoomOnViewerCenter(scaleFactor: number): void;
    getValue(): Value;
    setValue(value: Value): void;
    getTool(): Tool;
    setTool(tool: Tool): void;
  }

  // Utility functions exposed by the library:
  export function pan(
    value: Value,
    SVGDeltaX: number,
    SVGDeltaY: number,
    panLimit?: number
  ): Value;
  export function zoom(
    value: Value,
    SVGPointX: number,
    SVGPointY: number,
    scaleFactor: number
  ): Value;
  export function fitSelection(
    value: Value,
    selectionSVGPointX: number,
    selectionSVGPointY: number,
    selectionWidth: number,
    selectionHeight: number
  ): Value;
  export function fitToViewer(value: Value): Value;
  export function zoomOnViewerCenter(value: Value, scaleFactor: number): Value;
  export function setPointOnViewerCenter(
    value: Value,
    SVGPointX: number,
    SVGPointY: number,
    zoomLevel: number
  ): Value;
  export function reset(value: Value): Value;
}
