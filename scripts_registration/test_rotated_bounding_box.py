#Tests for get_rotated_bounding_box / get_rotated_bounding_box_pixels (geometry.py)
#Run directly:   python test_rotated_bounding_box.py
#or via pytest:  pytest test_rotated_bounding_box.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from geometry import get_rotated_bounding_box, get_rotated_bounding_box_pixels

TOL = 1e-9


def approx(a, b):
    return abs(a - b) <= TOL


#independent implementation of the UI / SVG rotation convention:
#y axis points down, positive angle = clockwise on screen
def rotate_point_clockwise(px, py, rotation_degrees):
    th = math.radians(rotation_degrees)
    c, s = math.cos(th), math.sin(th)
    return (c * px - s * py, s * px + c * py)


def image_corners(width, height):
    return [(0.0, 0.0), (float(width), 0.0), (0.0, float(height)), (float(width), float(height))]


def perimeter_points(width, height, n_per_edge=40):
    #dense sampling along the four edges of the unrotated image
    pts = []
    for i in range(n_per_edge):
        t = i / float(n_per_edge - 1)
        pts.append((t * width, 0.0))
        pts.append((t * width, float(height)))
        pts.append((0.0, t * height))
        pts.append((float(width), t * height))
    return pts


def points_about_pivot(width, height, angle, centre_of_rotation, points):
    pivot_x, pivot_y = 0.0, 0.0
    if centre_of_rotation == 'centre':
        pivot_x, pivot_y = width / 2.0, height / 2.0
    return [rotate_point_clockwise(x - pivot_x, y - pivot_y, angle) for (x, y) in points]


#----------------------- float geometry (no rounding) -----------------------

def test_zero_rotation_exact_floats():
    bbox = get_rotated_bounding_box(100, 80, 0)
    assert bbox['x0'] == 0.0 and bbox['y0'] == 0.0
    assert bbox['x1'] == 100.0 and bbox['y1'] == 80.0
    assert bbox['width'] == 100.0 and bbox['height'] == 80.0
    assert bbox['displacement_x'] == 0.0 and bbox['displacement_y'] == 0.0
    assert bbox['corners'] == [(0.0, 0.0), (100.0, 0.0), (0.0, 80.0), (100.0, 80.0)]


def test_quarter_turns_float_up_to_fp_noise():
    #float geometry carries ~1e-15 trig noise at exact quarter turns - assert
    #with tolerance, and assert the noisy coordinate is within the box
    bbox = get_rotated_bounding_box(100, 80, 90)
    assert bbox['x0'] == -80.0                                   #exact (sin(pi/2) == 1.0)
    assert abs(bbox['x1']) <= TOL                                #cos(pi/2) = 6.1e-17 noise
    assert approx(bbox['width'], 80.0) and approx(bbox['height'], 100.0)
    assert (bbox['displacement_x'], bbox['displacement_y']) == (80.0, 0.0)

    bbox = get_rotated_bounding_box(100, 80, 180)
    assert approx(bbox['width'], 100.0) and approx(bbox['height'], 80.0)
    assert approx(bbox['displacement_x'], 100.0) and approx(bbox['displacement_y'], 80.0)

    bbox = get_rotated_bounding_box(100, 80, 270)
    assert approx(bbox['width'], 80.0) and approx(bbox['height'], 100.0)
    assert approx(bbox['displacement_x'], 0.0) and approx(bbox['displacement_y'], 100.0)


def test_quarter_turns_centre_pivot_float():
    bbox = get_rotated_bounding_box(100, 80, 0, centre_of_rotation='centre')
    assert (bbox['displacement_x'], bbox['displacement_y']) == (50.0, 40.0)

    bbox = get_rotated_bounding_box(100, 80, 90, centre_of_rotation='centre')
    assert approx(bbox['width'], 80.0) and approx(bbox['height'], 100.0)
    assert approx(bbox['displacement_x'], 40.0) and approx(bbox['displacement_y'], 50.0)


def test_float_geometry_at_thirty_degrees():
    #exact float values (no rounding): the extent is w|cos| + h|sin|
    bbox = get_rotated_bounding_box(100, 80, 30)
    assert approx(bbox['x0'], -80.0 * math.sin(math.radians(30)))
    assert approx(bbox['x1'], 100.0 * math.cos(math.radians(30)))
    assert approx(bbox['y0'], 0.0)
    assert approx(bbox['width'], 100.0 * math.cos(math.radians(30)) + 80.0 * math.sin(math.radians(30)))
    assert approx(bbox['height'], 100.0 * math.sin(math.radians(30)) + 80.0 * math.cos(math.radians(30)))
    assert approx(bbox['displacement_x'], 80.0 * math.sin(math.radians(30)))
    for (cx, cy) in bbox['corners']:
        assert -TOL <= cx <= bbox['width'] + TOL and -TOL <= cy <= bbox['height'] + TOL


def test_float_width_is_exactly_pivot_invariant():
    #the float extent is pivot-invariant by construction (shifting the pivot
    #shifts min and max by the same amount) - must hold EXACTLY, not approx
    for angle in range(0, 360, 5):
        corner = get_rotated_bounding_box(100, 80, angle)
        centre = get_rotated_bounding_box(100, 80, angle, centre_of_rotation='centre')
        assert corner['width'] == centre['width']
        assert corner['height'] == centre['height']


def test_negative_and_overflow_angles_float():
    assert get_rotated_bounding_box(100, 80, -90) == get_rotated_bounding_box(100, 80, 270)
    assert get_rotated_bounding_box(100, 80, 450) == get_rotated_bounding_box(100, 80, 90)
    assert get_rotated_bounding_box(100, 80, 360) == get_rotated_bounding_box(100, 80, 0)
    assert get_rotated_bounding_box(100, 80, 720.5) == get_rotated_bounding_box(100, 80, 0.5)


#----------------------- integer pixel box (outward) -----------------------

def test_pixels_quarter_turns_corner_pivot():
    bbox = get_rotated_bounding_box_pixels(100, 80, 90)
    assert (bbox['width'], bbox['height']) == (80, 100)          #tight, thanks to the fp-noise guard
    assert (bbox['displacement_x'], bbox['displacement_y']) == (80, 0)
    assert (bbox['x0'], bbox['y0'], bbox['x1'], bbox['y1']) == (-80, 0, 0, 100)

    bbox = get_rotated_bounding_box_pixels(100, 80, 180)
    assert (bbox['width'], bbox['height']) == (100, 80)
    assert (bbox['displacement_x'], bbox['displacement_y']) == (100, 80)

    bbox = get_rotated_bounding_box_pixels(100, 80, 270)
    assert (bbox['width'], bbox['height']) == (80, 100)
    assert (bbox['displacement_x'], bbox['displacement_y']) == (0, 100)


def test_pixels_quarter_turns_centre_pivot():
    bbox = get_rotated_bounding_box_pixels(100, 80, 0, centre_of_rotation='centre')
    assert (bbox['width'], bbox['height']) == (100, 80)
    assert (bbox['displacement_x'], bbox['displacement_y']) == (50, 40)

    bbox = get_rotated_bounding_box_pixels(100, 80, 90, centre_of_rotation='centre')
    assert (bbox['width'], bbox['height']) == (80, 100)
    assert (bbox['displacement_x'], bbox['displacement_y']) == (40, 50)


def test_pixels_thirty_degrees():
    bbox = get_rotated_bounding_box_pixels(100, 80, 30)
    assert (bbox['width'], bbox['height']) == (127, 120)
    assert (bbox['displacement_x'], bbox['displacement_y']) == (40, 0)
    for (cx, cy) in bbox['corners']:
        assert 0 <= cx <= 127 and 0 <= cy <= 120


def test_pixels_forty_five_degrees():
    bbox = get_rotated_bounding_box_pixels(100, 80, 45)
    assert (bbox['width'], bbox['height']) == (128, 128)
    assert (bbox['displacement_x'], bbox['displacement_y']) == (57, 0)


def test_pixels_match_outward_rounding_of_float_box():
    #the pixel box must be exactly the outward-rounded float box, for any angle.
    #Angles within 1e-9 of an exact quarter turn are excluded: the pixel box
    #evaluates those with the exact quarter-turn trigonometry (fp-noise guard),
    #while the float box carries the raw trig noise - covered by the dedicated
    #quarter-turn tests instead.
    for tenth in range(0, 3600, 25):  #0 .. 357.5 deg, step 2.5 (incl. fractions)
        angle = tenth / 10.0
        rot = angle % 360.0
        if abs(rot - round(rot / 90.0) * 90.0) < 1e-9:
            continue
        fb = get_rotated_bounding_box(100, 80, angle)
        pb = get_rotated_bounding_box_pixels(100, 80, angle)
        assert pb['x0'] == math.floor(fb['x0']) and pb['x1'] == math.ceil(fb['x1'])
        assert pb['y0'] == math.floor(fb['y0']) and pb['y1'] == math.ceil(fb['y1'])
        assert pb['width'] == pb['x1'] - pb['x0'] and pb['height'] == pb['y1'] - pb['y0']
        assert pb['displacement_x'] == -pb['x0'] and pb['displacement_y'] == -pb['y0']


def test_pixel_box_contains_float_box():
    for tenth in range(0, 3600, 25):
        angle = tenth / 10.0
        fb = get_rotated_bounding_box(100, 80, angle)
        pb = get_rotated_bounding_box_pixels(100, 80, angle)
        assert pb['x0'] <= fb['x0'] + 1e-6 and pb['x1'] >= fb['x1'] - 1e-6
        assert pb['y0'] <= fb['y0'] + 1e-6 and pb['y1'] >= fb['y1'] - 1e-6


#--------------------- floating point degree rotations ---------------------

def test_fractional_angles_are_used_at_full_precision():
    #the box must be computed from the EXACT angle, not a rounded one
    for angle in (0.1, 12.85, 27.3, 33.7, 45.5, 89.9, 179.95, 270.7):
        expected_width = 100.0 * abs(math.cos(math.radians(angle))) + 80.0 * abs(math.sin(math.radians(angle)))
        expected_height = 100.0 * abs(math.sin(math.radians(angle))) + 80.0 * abs(math.cos(math.radians(angle)))
        fb = get_rotated_bounding_box(100, 80, angle)
        assert approx(fb['width'], expected_width), (angle, fb['width'], expected_width)
        assert approx(fb['height'], expected_height), (angle, fb['height'], expected_height)


def test_no_degree_rounding_33_7_vs_33_and_34():
    #a 33.7 degree rotation must NOT produce the box of 33 or 34 degrees
    bbox_337_f = get_rotated_bounding_box(100, 80, 33.7)
    bbox_33_f = get_rotated_bounding_box(100, 80, 33)
    bbox_34_f = get_rotated_bounding_box(100, 80, 34)
    assert not approx(bbox_337_f['width'], bbox_33_f['width'])
    assert not approx(bbox_337_f['width'], bbox_34_f['width'])

    bbox_337_p = get_rotated_bounding_box_pixels(100, 80, 33.7)
    bbox_33_p = get_rotated_bounding_box_pixels(100, 80, 33)
    bbox_34_p = get_rotated_bounding_box_pixels(100, 80, 34)
    assert bbox_337_p['width'] != bbox_33_p['width']
    assert bbox_337_p['width'] != bbox_34_p['width']
    #and it must equal the outward rounding of the exact 33.7 geometry
    assert bbox_337_p['width'] == math.ceil(bbox_337_f['x1']) - math.floor(bbox_337_f['x0'])


def test_half_degree_angles():
    #e.g. the UI rotation field allows step 0.1 - half degrees must work
    angle = 22.5
    fb = get_rotated_bounding_box(100, 80, angle)
    expected_width = 100.0 * math.cos(math.radians(angle)) + 80.0 * math.sin(math.radians(angle))
    assert approx(fb['width'], expected_width)
    pb = get_rotated_bounding_box_pixels(100, 80, angle)
    assert pb['width'] == math.ceil(fb['x1']) - math.floor(fb['x0'])   #outward rounding only
    assert pb['width'] * pb['height'] >= 100 * 80                     #contains the image


def test_placement_on_fixed_image_uses_displacement():
    #the box on the fixed image is anchored at placement_point - displacement
    #and must contain every rotated corner of the image (float displacement)
    X, Y = 150, 100
    for tenth in range(0, 3600, 25):
        angle = tenth / 10.0
        bbox = get_rotated_bounding_box(100, 80, angle)
        origin_x = X - bbox['displacement_x']
        origin_y = Y - bbox['displacement_y']
        for (px, py) in image_corners(100, 80):
            rx, ry = rotate_point_clockwise(px, py, angle)
            fx, fy = X + rx, Y + ry
            assert origin_x - 1e-9 <= fx <= origin_x + bbox['width'] + 1e-9, (angle, px, py, fx)
            assert origin_y - 1e-9 <= fy <= origin_y + bbox['height'] + 1e-9, (angle, px, py, fy)


def test_pixel_placement_contains_all_rotated_corners():
    #integer pixel box (outward) must contain every rotated corner, fractional
    #angles included; 1e-6 absorbs the quarter-turn fp noise (sin(180 deg) =
    #1.2e-16) of this test's own unsnapped rotation
    X, Y = 150, 100
    for tenth in range(0, 3600, 25):
        angle = tenth / 10.0
        bbox = get_rotated_bounding_box_pixels(100, 80, angle)
        origin_x = X - bbox['displacement_x']
        origin_y = Y - bbox['displacement_y']
        for (px, py) in image_corners(100, 80):
            rx, ry = rotate_point_clockwise(px, py, angle)
            fx, fy = X + rx, Y + ry
            assert origin_x - 1e-6 <= fx <= origin_x + bbox['width'] + 1e-6, (angle, fx)
            assert origin_y - 1e-6 <= fy <= origin_y + bbox['height'] + 1e-6, (angle, fy)


def test_containment_bruteforce_perimeter_sampling():
    #every point of the image perimeter, rotated, must fall inside the box
    sizes = [(100, 80), (37, 53), (200, 200), (1, 1), (5, 200)]
    for (w, h) in sizes:
        for tenth in range(0, 3600, 25):
            angle = tenth / 10.0
            for pivot in ('top_left_corner', 'centre'):
                bbox = get_rotated_bounding_box(w, h, angle, centre_of_rotation=pivot)
                for (rx, ry) in points_about_pivot(w, h, angle, pivot, perimeter_points(w, h)):
                    assert bbox['x0'] - 1e-9 <= rx <= bbox['x1'] + 1e-9, (w, h, angle, pivot, rx)
                    assert bbox['y0'] - 1e-9 <= ry <= bbox['y1'] + 1e-9, (w, h, angle, pivot, ry)


def test_float_box_is_tight():
    #the float box is the exact hull of the rotated image: every sampled
    #perimeter point lies inside it, and no edge is padded outwards by more
    #than the sampling resolution of this test
    for (w, h) in [(100, 80), (37, 53)]:
        for tenth in range(0, 3600, 25):
            angle = tenth / 10.0
            bbox = get_rotated_bounding_box(w, h, angle)
            pts = points_about_pivot(w, h, angle, 'top_left_corner', perimeter_points(w, h))
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            assert min(xs) >= bbox['x0'] - 1e-9 and max(xs) <= bbox['x1'] + 1e-9
            assert min(ys) >= bbox['y0'] - 1e-9 and max(ys) <= bbox['y1'] + 1e-9
            #each edge must be reached within the sampling resolution
            assert abs(min(xs) - bbox['x0']) <= 1.0 and abs(max(xs) - bbox['x1']) <= 1.0
            assert abs(min(ys) - bbox['y0']) <= 1.0 and abs(max(ys) - bbox['y1']) <= 1.0


def test_pixel_box_edges_reached_within_one_pixel():
    for (w, h) in [(100, 80), (37, 53)]:
        for tenth in range(0, 3600, 25):
            angle = tenth / 10.0
            bbox = get_rotated_bounding_box_pixels(w, h, angle)
            pts = points_about_pivot(w, h, angle, 'top_left_corner', perimeter_points(w, h))
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            assert bbox['x0'] <= min(xs) + 1e-9 and min(xs) <= bbox['x0'] + 1.0
            assert bbox['x1'] - 1.0 <= max(xs) <= bbox['x1'] + 1e-9
            assert bbox['y0'] <= min(ys) + 1e-9 and min(ys) <= bbox['y0'] + 1.0
            assert bbox['y1'] - 1.0 <= max(ys) <= bbox['y1'] + 1e-9


def test_bbox_area_covers_image_area():
    for (w, h) in [(100, 80), (37, 53), (200, 200)]:
        for tenth in range(0, 3600, 70):
            angle = tenth / 10.0
            bbox = get_rotated_bounding_box(w, h, angle)
            assert bbox['width'] * bbox['height'] >= w * h


def test_corners_order_is_tl_tr_bl_br():
    bbox = get_rotated_bounding_box(100, 80, 0)
    assert bbox['corners'] == [(0.0, 0.0), (100.0, 0.0), (0.0, 80.0), (100.0, 80.0)]


def test_invalid_inputs_raise():
    for (w, h) in [(0, 80), (100, 0), (-5, 80)]:
        for func in (get_rotated_bounding_box, get_rotated_bounding_box_pixels):
            try:
                func(w, h, 30)
                raise AssertionError('expected ValueError for size ' + str((w, h)))
            except ValueError:
                pass
    for func in (get_rotated_bounding_box, get_rotated_bounding_box_pixels):
        try:
            func(100, 80, 30, centre_of_rotation='somewhere')
            raise AssertionError('expected ValueError for bad centre_of_rotation')
        except ValueError:
            pass


ALL_TESTS = sorted(
    (obj for name, obj in globals().items() if name.startswith('test_') and callable(obj)),
    key=lambda f: f.__name__
)


def main():
    failures = 0
    for test in ALL_TESTS:
        try:
            test()
            print('PASS ' + test.__name__)
        except AssertionError as error:
            failures += 1
            print('FAIL ' + test.__name__ + ' - ' + str(error))
        except Exception as error:  # noqa
            failures += 1
            print('ERROR ' + test.__name__ + ' - ' + repr(error))
    print(str(len(ALL_TESTS) - failures) + '/' + str(len(ALL_TESTS)) + ' tests passed')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())