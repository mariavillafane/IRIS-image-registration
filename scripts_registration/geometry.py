#geometry.py - 260923
#Pure-geometry helpers for the registration pipeline.
#No SimpleITK/cv2/numpy dependencies, so the functions can be unit-tested
#standalone (see test_rotated_bounding_box.py)

import math


def _rotated_corner_coordinates(width, height, cos_th, sin_th, pivot_x, pivot_y):
    #the four image corners relative to the pivot, rotated clockwise
    #(y-down convention): R = [[cos, -sin], [sin, cos]] maps (1, 0) -> (cos, sin)
   #= right-and-down, i.e. clockwise on screen - the same convention as the UI (SVG) rotation
    corners_rel = []
    for (dx, dy) in [(0.0, 0.0), (float(width), 0.0), (0.0, float(height)), (float(width), float(height))]:
        rx = dx - pivot_x
        ry = dy - pivot_y
        corners_rel.append((cos_th * rx - sin_th * ry, sin_th * rx + cos_th * ry))
    xs = [c[0] for c in corners_rel]
    ys = [c[1] for c in corners_rel]
    return xs, ys, corners_rel


def _pivot(centre_of_rotation, width, height):
    if centre_of_rotation == 'centre':
        return float(width) / 2.0, float(height) / 2.0
    if centre_of_rotation == 'top_left_corner':
        return 0.0, 0.0
    raise ValueError("centre_of_rotation must be 'top_left_corner' or 'centre', got " + str(centre_of_rotation))


#260923 - NEW
def get_rotated_bounding_box(width, height, rotation_degrees, centre_of_rotation='top_left_corner'):
    """
    Exact floating-point axis-aligned bounding box that fully contains a
    rectangular image of size width x height after rotation, plus the x,y
    displacement of the box relative to the placement point.

    NO ROUNDING is applied: rotation_degrees may be any floating point value
    (e.g. 27.3, 33.7, -12.85) and is used at full precision; every returned
    coordinate is a float. Use get_rotated_bounding_box_pixels() when an
    integer pixel box is required (e.g. to crop a raster image) - it rounds
    outwards only, so the rotated image always fits inside.

    Conventions (matching the registration UI / SVG canvas, y axis pointing down):
      - rotation_degrees > 0 => clockwise rotation on screen
        (SVG rotate(angle, cx, cy) and the UI 'rotation' field)
      - centre_of_rotation = 'top_left_corner' => the image pivots about its own
        top-left corner (the pivot used by the UI preview and by the s1 initial
        transform in set_initial_transformation_affine__4_6_bspline)
      - centre_of_rotation = 'centre' => the image pivots about its centre

    Displacement: the bounding box is (usually) NOT aligned with the placement
    point. For a clockwise rotation the box sticks out to the LEFT of / above
    the placement point, so when placing the rotated image onto the fixed image
    the box origin is

        bbox_origin = placement_point - (displacement_x, displacement_y)

    e.g. a 100x80 image rotated 90deg clockwise about its top-left corner has
    an 80x100 box whose top-left corner is displaced (-80, 0) from the
    placement corner, i.e. 80px to the LEFT of it.

    All returned coordinates are relative to the rotation centre, in pixels.
    (For angles that are exact multiples of 90 the trigonometry carries ~1e-15
    floating point noise, e.g. cos(90 deg) = 6.1e-17 - the values are exact up
    to that noise.)

    Returns dict (all floats):
      'x0', 'y0'                : bbox top-left corner relative to the rotation
                                  centre (can be negative)
      'x1', 'y1'                : bbox bottom-right corner relative to the
                                  rotation centre
      'width', 'height'         : bbox size in pixels (float)
      'displacement_x'          : displacement of the bbox relative to the
      'displacement_y'          : rotation centre (= -x0, -y0)
      'corners'                 : the four rotated image corners inside the
                                  bbox as [(x, y), ...] in image order
                                  (top-left, top-right, bottom-left,
                                  bottom-right)
    """
    if width <= 0 or height <= 0:
        raise ValueError('width and height must be positive, got ' + str((width, height)))

    rot = float(rotation_degrees) % 360.0
    th = math.radians(rot)
    pivot_x, pivot_y = _pivot(centre_of_rotation, width, height)

    xs, ys, corners_rel = _rotated_corner_coordinates(width, height, math.cos(th), math.sin(th), pivot_x, pivot_y)

    x0 = float(min(xs))     #exact - no floor/ceil rounding
    x1 = float(max(xs))
    y0 = float(min(ys))
    y1 = float(max(ys))

    corners_in_bbox = [(cx - x0, cy - y0) for (cx, cy) in corners_rel]

    return {
        'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1,
        'width': x1 - x0, 'height': y1 - y0,
        'displacement_x': -x0, 'displacement_y': -y0,
        'corners': corners_in_bbox
    }


#260923 - NEW
def get_rotated_bounding_box_pixels(width, height, rotation_degrees, centre_of_rotation='top_left_corner'):
    """
    Integer-pixel version of get_rotated_bounding_box, for raster operations
    (e.g. cropping the fixed-image ROI), which need whole pixel indices.

    The box is rounded OUTWARDS (floor on the min sides, ceil on the max
    sides), so the rotated image is guaranteed to fit inside the pixel box.
    The rotation angle itself is NEVER rounded - genuine fractional angles
    (e.g. 33.7) pass through untouched. The only adjustment is a numerical
    noise guard: an angle within 1e-9 of an exact multiple of 90 is evaluated
    with the exact quarter-turn trigonometry (cos(90 deg) = 0 exactly), so
    that e.g. 90.0 yields the tight 80x100 pixel box for a 100x80 image
    instead of a 1px-wider box from cos(90 deg) = 6.1e-17 floating point
    noise.

    Returns dict (x0/y0/x1/y1/width/height/displacement_* are ints; corners
    are the exact float corners of the rotated image inside the pixel box):
      'x0', 'y0', 'x1', 'y1', 'width', 'height',
      'displacement_x', 'displacement_y', 'corners'
    """
    if width <= 0 or height <= 0:
        raise ValueError('width and height must be positive, got ' + str((width, height)))

    rot = float(rotation_degrees) % 360.0
    snapped = abs(rot - round(rot / 90.0) * 90.0) < 1e-9
    if snapped:
        rot = round(rot / 90.0) * 90.0 % 360.0  #quarter-turn fp-noise guard only

    pivot_x, pivot_y = _pivot(centre_of_rotation, width, height)

    if snapped:
        #exact quarter-turn trigonometry (avoids cos(90 deg) = 6.1e-17 noise)
        cos_th, sin_th = [(1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -1.0)][int(round(rot) // 90) % 4]
    else:
        th = math.radians(rot)
        cos_th, sin_th = math.cos(th), math.sin(th)

    xs, ys, corners_rel = _rotated_corner_coordinates(width, height, cos_th, sin_th, pivot_x, pivot_y)

    x0 = int(math.floor(min(xs)))   #rounded outwards only
    x1 = int(math.ceil(max(xs)))
    y0 = int(math.floor(min(ys)))
    y1 = int(math.ceil(max(ys)))

    corners_in_bbox = [(cx - x0, cy - y0) for (cx, cy) in corners_rel]

    return {
        'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1,
        'width': x1 - x0, 'height': y1 - y0,
        'displacement_x': -x0, 'displacement_y': -y0,
        'corners': corners_in_bbox
    }