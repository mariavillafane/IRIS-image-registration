import { useState, useRef } from "react";
import type { Dispatch } from "react";
import { Box } from "@mui/system";
import { ReactSVGPanZoom, INITIAL_VALUE, TOOL_PAN } from "react-svg-pan-zoom";
import type { ReactSVGPanZoom as ReactSVGPanZoomInstance } from "react-svg-pan-zoom";
import type { Tool, Value } from "react-svg-pan-zoom";
import type { DragStart, EditorAction, Point, WorkingImage } from "../types";

interface CanvasImageProps {
  i: number;
  stackId: number;
  entryId: string;
  x?: number;
  y?: number;
  opacity?: number;
  imageUrl?: string;
  width?: number;
  height?: number;
  scaling?: number;
  rotation?: number;
  clipPath?: string;
}

const CanvasImage = (props: CanvasImageProps) => {
  const [retry, setRetry] = useState(0);
  // The curtain clipPath must live on a transform-free <g>, NOT on the <image>:
  // an element's own transform (the rotate() here) also applies to its
  // clip-path, so the reveal rect would be interpreted in the image's rotated
  // space and the curtain would swing with the moving image's rotation instead
  // of following the mouse. The <g> keeps the clip in canvas coordinates.
  return (
    <g clipPath={props.clipPath}>
      <image
        onError={(e) => {
          console.log(e);
          if (retry < 3) {
            setTimeout(() => {
              setRetry(retry + 1);
            }, 100);
          }
        }}
        //data-id={props.i}
        data-stack-index={props.i}
        data-stack-id={props.stackId}
        data-entry-id={props.entryId}
        x={props.x}
        y={props.y}
        opacity={props.opacity}
        href={`${props.imageUrl ?? ""}${retry ? "?" + retry : ""}`}
        width={
          props.width !== undefined ? props.width * props.scaling! : undefined
        }
        height={
          props.height !== undefined ? props.height * props.scaling! : undefined
        }
        transform={`rotate(${props.rotation},${props.x},${props.y})`}
      />
    </g>
  );
};

export const ComparisonClipPathRectangle = ({
  orientation,
  mousepos,
}: {
  orientation: number;
  mousepos: Point;
}) => {
  // The curtain reveals a HALF-PLANE relative to the mouse, with its edge(s)
  // exactly at the mouse position. The rect must be unbounded away from the
  // mouse: bounding it to the fixed-image box [0..w]x[0..h] cropped rotated
  // moving images that stick out beyond that box, and re-hid the image once
  // the mouse moved far enough that the rect's far edge overtook it.
  // Half-planes per orientation (same reveal sides as before):
  //   0 right | 1 below | 2 left | 3 above
  //   4 right+above | 5 right+below | 6 left+below | 7 left+above
  const BIG = 10000;
  const o = ((orientation % 8) + 8) % 8;
  const left = [2, 6, 7].includes(o);
  const right = [0, 4, 5].includes(o);
  const above = [3, 4, 7].includes(o);
  const below = [1, 5, 6].includes(o);

  const x0 = left ? mousepos.x - BIG : right ? mousepos.x : -BIG;
  const x1 = left ? mousepos.x : right ? mousepos.x + BIG : BIG;
  const y0 = above ? mousepos.y - BIG : below ? mousepos.y : -BIG;
  const y1 = above ? mousepos.y : below ? mousepos.y + BIG : BIG;
  return <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} />;
};

interface RegistrationCanvasProps {
  selectedStackId: number | null;
  setSelectedStackId: (id: number) => void;
  dispatch: Dispatch<EditorAction>;
  dragStart: DragStart | null;
  mousepos: Point;
  orientation: number;
  stacks: WorkingImage[];
  worldScale: number;
  zoomPower: string | number;
  editorMode: string;
}

export function RegistrationCanvas(props: RegistrationCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const Viewer = useRef<ReactSVGPanZoomInstance>(null);
  const [tool, onChangeTool] = useState<Tool>(TOOL_PAN);
  const [value, onChangeValue] = useState<Value | null>(INITIAL_VALUE);
  const [dragStart, setDragStart] = useState<DragStart | null>(null);

  const w = (props.stacks?.[0]?.x || 0) + (props.stacks?.[0]?.width || 0);
  const h = (props.stacks?.[0]?.y || 0) + (props.stacks?.[0]?.height || 0);
  const { editorMode } = props;

  return (
    <Box
      onMouseLeave={() => {
        //if (dragStart)
        // props.dispatch({ type: "CANVAS_DRAG_END" });
        setDragStart(null);
      }} //in case mouse is released outside of canvas}
      ref={ref}
      width="100%"
      flexGrow={1}
      display="flex"
      flexDirection="column"
      justifyContent={"stretch"}
      alignItems={"stretch"}
    >
      <ReactSVGPanZoom
        className="myCanvas"
        background="transparent"
        SVGBackground="transparent"
        width={window.innerWidth || 1000}
        height={ref.current?.clientHeight || 500}
        ref={Viewer}
        value={value}
        onChangeValue={onChangeValue}
        tool={tool}
        onChangeTool={onChangeTool}
        toolbarProps={{ position: "left" }}
        onMouseDown={(e) => {
          if (editorMode === "compare") {
            props.dispatch({ type: "CANVAS_CYCLE_ORIENTATION" });
            return;
          }
          const target = e.originalEvent.target as
            | (Element & { dataset: DOMStringMap })
            | null;
          if (target?.dataset.stackId === undefined) return;
          const stackIndex = +(target.dataset.stackIndex ?? NaN);
          const stackId = +(target.dataset.stackId ?? NaN);
          const stack = props.stacks[stackIndex];
          const svgScaleX = e.value.a;
          const svgScaleY = e.value.d;
          setDragStart([
            e.originalEvent.clientX / svgScaleX,
            e.originalEvent.clientY / svgScaleY,
            stack.x,
            stack.y,
            stackIndex,
          ]);
          props.dispatch({ type: "CANVAS_DRAG_START" });
          props.setSelectedStackId(stackId);
        }}
        onMouseMove={(e) => {
          const { clientX, clientY } = e.originalEvent;
          props.dispatch({
            type: "CANVAS_UPDATE_MOUSEPOS",
            payload: {
              x: Math.round(e.x),
              y: Math.round(e.y),
            },
          });
          if (!dragStart) return;
          props.dispatch({
            type: "CANVAS_DRAG_MOVE",
            payload: {
              clientX,
              clientY,
              svgScaleX: e.value.a,
              svgScaleY: e.value.d,
              dragStart,
            },
          });
        }}
        onMouseUp={(e) => {
          if (!dragStart) return;
          setDragStart(null);

          //props.dispatch({ type: "CANVAS_DRAG_END" });
        }}
      >
        <svg width={w} height={h}>
          <defs>
            <pattern
              id="smallGrid"
              width="10"
              height="10"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 10 0 L 0 0 0 10"
                fill="none"
                stroke="gray"
                stroke-width="0.5"
              />
            </pattern>
            <pattern
              id="grid"
              width="100"
              height="100"
              patternUnits="userSpaceOnUse"
            >
              <rect width="100" height="100" fill="url(#smallGrid)" />
              <path
                d="M 100 0 L 0 0 0 100"
                fill="none"
                stroke="gray"
                stroke-width="1"
              />
            </pattern>
            <clipPath id="clipPath">
              <ComparisonClipPathRectangle
                orientation={props.orientation}
                mousepos={props.mousepos}
              />
            </clipPath>
          </defs>

          <rect
            x={-1000}
            y={-1000}
            width="1000%"
            height="1000%"
            fill="url(#grid)"
          />

          {props.stacks
            .map((x, i) => ({ ...x, i }))
            .flatMap((stack, i) =>
              stack.imageEntries
                .filter((x) => x.checked)
                .map((entry) => (
                  <CanvasImage
                    key={stack.id + "-" + entry.id}
                    stackId={stack.id}
                    entryId={entry.id}
                    {...stack}
                    {...entry}
                    //{...(editorMode === "compare" && i > 0   //applies curtainviewer to all but first image 260125
                    {...(editorMode === "compare" &&
                    ((props.selectedStackId &&
                      stack.id === props.selectedStackId) ||
                      (!props.selectedStackId && i > 0))
                      ? { clipPath: "url(#clipPath)" }
                      : {})}
                  />
                ))
            )}
        </svg>
      </ReactSVGPanZoom>
    </Box>
  );
}
