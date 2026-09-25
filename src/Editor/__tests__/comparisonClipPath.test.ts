// Geometry contract of the compare-mode (curtain) clip rectangle.
//
// The clip must be an UNBOUNDED half-plane relative to the mouse: bounded
// rects (anchored at 0 or at the fixed-image box w/h) cropped rotated moving
// images that stick out beyond that box, and re-hid the image once the mouse
// moved far enough that the rect's far edge overtook it.
//
// Reveal sides per orientation (same behaviour as the original switch):
//   0 right | 1 below | 2 left | 3 above
//   4 right+above | 5 right+below | 6 left+below | 7 left+above
import { ComparisonClipPathRectangle } from "../RegistrationCanvas";
import type { Point } from "../../types";

type RectProps = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function clipRect(orientation: number, mousepos: Point): RectProps {
  const element = ComparisonClipPathRectangle({ orientation, mousepos });
  return element.props as unknown as RectProps;
}

const BIG = 10000;

/** The rect must cover the reveal half-plane(s) at the mouse and extend far
 * beyond the canvas in the revealed directions - never bounded by the
 * canvas/fixed-image box, never re-cropping content on the far side. */
function expectUnboundedHalfPlane(orientation: number, mouse: Point) {
  const r = clipRect(orientation, mouse);
  const o = orientation % 8;
  const E = 9000; // must extend at least this far beyond the canvas

  const left = [2, 6, 7].includes(o);
  const right = [0, 4, 5].includes(o);
  const above = [3, 4, 7].includes(o);
  const below = [1, 5, 6].includes(o);

  expect(r.x).toBe(left ? mouse.x - BIG : right ? mouse.x : -BIG);
  expect(r.x + r.width).toBe(
    left ? mouse.x : right ? mouse.x + BIG : BIG
  );
  expect(r.y).toBe(above ? mouse.y - BIG : below ? mouse.y : -BIG);
  expect(r.y + r.height).toBe(
    above ? mouse.y : below ? mouse.y + BIG : BIG
  );

  // sanity: the rect extends unbounded in every revealed direction and fully
  // covers the region on the revealed side(s) of the mouse
  if (right) expect(r.x + r.width).toBeGreaterThanOrEqual(mouse.x + E);
  if (left) expect(r.x).toBeLessThanOrEqual(mouse.x - E);
  if (below) expect(r.y + r.height).toBeGreaterThanOrEqual(mouse.y + E);
  if (above) expect(r.y).toBeLessThanOrEqual(mouse.y - E);
}

describe("ComparisonClipPathRectangle", () => {
  const mouse = { x: 400, y: 300 };

  it.each([0, 1, 2, 3, 4, 5, 6, 7])(
    "orientation %i reveals an unbounded half-plane at the mouse",
    (o) => {
      expectUnboundedHalfPlane(o, mouse);
      // same contract for a mouse far outside the canvas (either side)
      expectUnboundedHalfPlane(o, { x: -5000, y: -6000 });
      expectUnboundedHalfPlane(o, { x: 5000, y: 6000 });
    }
  );

  it("keeps reveal directions identical to the original switch", () => {
    // orientation 0: only x >= mouse is revealed
    expect(clipRect(0, mouse).x).toBe(mouse.x);
    // orientation 2: only x <= mouse
    expect(clipRect(2, mouse).x + clipRect(2, mouse).width).toBe(mouse.x);
    // orientation 1: only y >= mouse
    expect(clipRect(1, mouse).y).toBe(mouse.y);
    // orientation 3: only y <= mouse
    expect(clipRect(3, mouse).y + clipRect(3, mouse).height).toBe(mouse.y);
    // corner orientations keep both edges at the mouse
    expect(clipRect(5, mouse)).toMatchObject({
      x: mouse.x,
      y: mouse.y,
    });
    expect(clipRect(7, mouse).x + clipRect(7, mouse).width).toBe(mouse.x);
    expect(clipRect(7, mouse).y + clipRect(7, mouse).height).toBe(mouse.y);
  });

  it("handles negative and non-normalised orientations", () => {
    expect(clipRect(8, mouse)).toEqual(clipRect(0, mouse));
    expect(clipRect(10, mouse)).toEqual(clipRect(2, mouse));
    expect(clipRect(-1, mouse)).toEqual(clipRect(7, mouse));
  });
});