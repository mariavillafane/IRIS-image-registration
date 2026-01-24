import { useState, useRef, memo, useMemo } from "react";
import { Box } from "@mui/system";
import {
  ReactSVGPanZoom,
  TOOL_NONE,
  INITIAL_VALUE,
  TOOL_PAN,
} from "react-svg-pan-zoom";

const CanvasImage = (props) => {
  const [retry, setRetry] = useState(0);
  return (
    <image
      onError={(e) => {
        console.log(e);
        if (retry < 3) {
          setTimeout(() => {
            setRetry(retry + 1);
          }, 100);
        }
      }}
      data-id={props.i}
      data-stack-id={props.stackId}
      data-entry-id={props.entryId}
      x={props.x}
      y={props.y}
      opacity={props.opacity}
      href={props.imageUrl + `${retry ? "?" + retry : ""}`}
      width={props.width * props.scaling}
      height={props.height * props.scaling}
      transform={`rotate(${props.rotation},${props.x},${props.y})`}
      clipPath={props.clipPath}
    />
  );
};

export function RegistrationCanvas(props) {
  const ref = useRef();
  const Viewer = useRef(null);
  const [tool, onChangeTool] = useState(TOOL_PAN);
  const [value, onChangeValue] = useState(INITIAL_VALUE);
  const [dragStart, setDragStart] = useState(null);

  const w = (props.stacks?.[0]?.x || 0) + (props.stacks?.[0]?.width || 0);
  const h = (props.stacks?.[0]?.y || 0) + (props.stacks?.[0]?.height || 0);
  const { editorMode } = props; //here just calling the "editorMode" prop passed from parent
  const [mousepos, setMousepos] = useState({ x: 0, y: 0 });
  console.log(mousepos);

  return (
    <Box
      onMouseLeave={() => setDragStart(null)}
      ref={ref}
      width="100%"
      grow={1}
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
          if (e.originalEvent?.target?.dataset?.id === undefined) return;

          const id = +e.originalEvent.target.dataset.id;
          const { clientX, clientY } = e.originalEvent;
          const { x, y } = props.stacks[id];
          setDragStart([clientX / e.value.a, clientY / e.value.d, x, y, id]);
          props.setSelectedImageId(id);
        }}
        onMouseMove={(e) => {
          console.log("ytytyu", e);
          const { clientX, clientY } = e.originalEvent;

          setMousepos({
            x: Math.round(e.x),
            y: Math.round(e.y),
          });
          if (!dragStart) return;
          console.log(e);
          const id = dragStart[4];

          const [x, y] = [
            Math.round(clientX / e.value.a - dragStart[0] + dragStart[2]),
            Math.round(clientY / e.value.d - dragStart[1] + dragStart[3]),
          ];
          const stacks = props.stacks.with(id, { ...props.stacks[id], x, y });
          props.setStacks(stacks);
        }}
        onMouseUp={(e) => {
          if (!dragStart) return;
          const id = dragStart[4];

          const { clientX, clientY } = e.originalEvent;
          const [x, y] = [
            Math.round(clientX / e.value.a - dragStart[0] + dragStart[2]),
            Math.round(clientY / e.value.d - dragStart[1] + dragStart[3]),
          ];

          const stacks = props.stacks.with(id, { ...props.stacks[id], x, y });

          props.setStacks(stacks);
          setDragStart(null);
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
              <rect x={mousepos.x} y={mousepos.y} width={w} height={h} />
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
                    {...(editorMode === "compare" && i > 0
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
