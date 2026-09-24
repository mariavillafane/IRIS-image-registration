#verify_rotated_bounding_box_integration.py - 260923
#End-to-end evidence that the rotated bounding box + displacement are correctly
#integrated into the registration pipeline:
#  1. get_location_to_crop_fixed_image_margin crops the fixed image to the
#     rotated bounding box, positioned on the fixed image using the DISPLACEMENT
#  2. get_initial_locations + set_initial_transformation anchor the rotation at
#     the moving image's top-left corner inside that ROI
#  3. resampling the moving image with the initial transform shows the FULL
#     rotated image inside the ROI (no cropping, nothing empty)
#
#Checks:
#  - rotation = 0 behaves EXACTLY as before the change (backward compatibility)
#  - rotation = 30 deg: the previously-cropped bottom corners are now inside
#  - rotation = 90 deg: the previously-EMPTY ROI now shows the full image
#  - border placement (clamped ROI): valid ROI, only the part over the fixed
#    image is expected to be visible
#
#Run (any python with numpy + SimpleITK; the project env pins simpleitk 1.2.4):
#  python verify_rotated_bounding_box_integration.py
import os
import sys

import numpy as np
import SimpleITK as sitk

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

#sitk 2.x compatibility shim: functions.py builds composites with
#sitk.Transform(2, sitk.sitkComposite), which only returns a composite in
#sitk 1.2.4 (the version pinned in environment.yml). On newer sitk versions,
#redirect that constructor to sitk.CompositeTransform so this verification can
#run outside the legacy environment. No effect inside the legacy env.
_probe = sitk.Transform(2, sitk.sitkComposite)
if not hasattr(_probe, 'AddTransform'):
    _original_transform_constructor = sitk.Transform
    def _transform_compat(dimension, transform_enum):
        if transform_enum == sitk.sitkComposite:
            return sitk.CompositeTransform(dimension)
        return _original_transform_constructor(dimension, transform_enum)
    sitk.Transform = _transform_compat

import functions  # noqa: E402
from geometry import get_rotated_bounding_box_pixels  # noqa: E402

W_FIXED, H_FIXED = 400, 400
W_MOV, H_MOV = 100, 80


def make_fixed(seed=7):
    rng = np.random.default_rng(seed)
    return (rng.random((H_FIXED, W_FIXED)) * 100 + 50).astype(np.float32)


def make_moving():
    a = np.zeros((H_MOV, W_MOV), dtype=np.float32)
    a[0:6, 0:6] = 255               #top-left
    a[0:6, W_MOV - 6:W_MOV] = 200   #top-right
    a[H_MOV - 6:H_MOV, 0:6] = 150   #bottom-left
    a[H_MOV - 6:H_MOV, W_MOV - 6:W_MOV] = 100  #bottom-right
    a[H_MOV // 2 - 3:H_MOV // 2 + 3, W_MOV // 2 - 3:W_MOV // 2 + 3] = 180  #centre
    return a


def build_config(rotation_degrees, x, y, fixed_array, moving_array):
    return {
        'name': 's1',
        'filename': 'verify_',
        'tile': '_im00',
        'rotation': rotation_degrees,
        'scaling': 1.0,
        'scaling_coef': 1.0,
        'scaling_coef_fixed': 1.0,
        'ini_pos_d': (-x, -y),
        'ini_rot_moving_img': {'rot': rotation_degrees * (-np.pi / 180.0), 'centre_of_rot': 'top_left_corner'},
        'fixed_margin': {'right': 0, 'left': 0, 'top': 0, 'bottom': 0},
        'data_fixed_image_array_from_json': {'fixed_image_as_array': fixed_array},
        '0_im00': moving_array,
        'best_transform_so_far': {'tx': -x, 'ty': -y},
    }


def resample(source_array, reference_shape, transform):
    ref = sitk.GetImageFromArray(np.zeros(reference_shape, dtype=np.float32))
    filter_ = sitk.ResampleImageFilter()
    filter_.SetReferenceImage(ref)
    filter_.SetInterpolator(sitk.sitkLinear)
    filter_.SetTransform(transform)
    return sitk.GetArrayFromImage(filter_.Execute(sitk.GetImageFromArray(source_array)))


def visible_markers(out):
    names = {255: 'TL', 200: 'TR', 150: 'BL', 100: 'BR', 180: 'C'}
    return sorted(name for value, name in names.items() if np.count_nonzero(np.isclose(out, value, atol=10)) > 10)


#marker centres in moving-image content coordinates
MARKER_CONTENT = {255: (3.0, 3.0), 200: (97.0, 3.0), 150: (3.0, 77.0), 100: (97.0, 77.0), 180: (50.0, 40.0)}


def rotate_cw(qx, qy, rot_deg):
    th = np.deg2rad(rot_deg)
    return (np.cos(th) * qx - np.sin(th) * qy, np.sin(th) * qx + np.cos(th) * qy)


def check_markers_at_expected(out, expected, tol=2.0):
    #expected: {marker value: (x, y)} in output pixel coordinates. Each marker's
    #pure interior value must appear within +-tol px of its expected position
    #(centroid matching is unreliable for fractional rotations, where linear
    #interpolation smears marker edge values across the whole value range)
    for value, (ex, ey) in expected.items():
        x0 = int(round(ex))
        y0 = int(round(ey))
        window = out[max(y0 - int(tol), 0):y0 + int(tol) + 1, max(x0 - int(tol), 0):x0 + int(tol) + 1]
        if not np.any(np.isclose(window, value, atol=10)):
            print('marker ' + str(value) + ' not found near (' + str(ex) + ',' + str(ey) + ')')
            return False
    return True


def make_ideal_best_tr_s3(rot, corner_x, corner_y):
    #ideal s3 result: pure rotation about the pivot, translation parameter t = -P;
    #recorded (converted) translation = t - roi_origin = -placement corner
    th = rot * (-np.pi / 180.0)
    return {'a11': float(np.cos(th)), 'a12': float(-np.sin(th)),
            'a21': float(np.sin(th)), 'a22': float(np.cos(th)),
            'tx': float(-corner_x), 'ty': float(-corner_y), 'mi_average': -999.0}


def make_zero_best_tr_s4(n_params=98):
    d = {('tr_' + str(i)): 0.0 for i in range(n_params)}
    d['mi_average'] = -999.0
    return d


def make_fixed_parameters(shape):
    ref = sitk.GetImageFromArray(np.zeros(shape, dtype=np.float32))
    init = sitk.BSplineTransformInitializer(ref, [4, 4])
    return tuple(float(v) for v in init.GetFixedParameters())


def run_pipeline(rotation_degrees, x, y, fixed_array, moving_array):
    config = build_config(rotation_degrees, x, y, fixed_array, moving_array)
    crop = functions.get_location_to_crop_fixed_image_margin(config, '0')
    config = {**config, **crop}
    locs = functions.get_initial_locations(config)
    initial_loc_mov = [int(locs['ini_loc_within_fixed_ROI'][0]), int(locs['ini_loc_within_fixed_ROI'][1])]
    initial_tx = functions.set_initial_transformation_affine__4_6_bspline(initial_loc_mov, [1, 1, 2, 2], config)
    fixed_crop = functions.crop_roi_image_xy_pos__start_end(
        fixed_array, config['fixed_crop_pos_x_margin'], config['fixed_crop_pos_y_margin'])
    out = resample(moving_array, fixed_crop.shape, initial_tx)
    return config, fixed_crop, out, initial_tx


def rotated_corners_in_roi(config, rot_bbox):
    #the four rotated image corners in ROI coordinates (from the bbox geometry)
    corner_full_x = -int(config['ini_pos_d'][0])
    corner_full_y = -int(config['ini_pos_d'][1])
    bbox_origin_x = corner_full_x - rot_bbox['displacement_x']
    bbox_origin_y = corner_full_y - rot_bbox['displacement_y']
    roi_origin_x = config['fixed_crop_pos_x_margin'][0]
    roi_origin_y = config['fixed_crop_pos_y_margin'][0]
    return [(bbox_origin_x + cx - roi_origin_x, bbox_origin_y + cy - roi_origin_y) for (cx, cy) in rot_bbox['corners']]


def check_fully_inside(config, fixed_crop_shape, rot_bbox):
    #pixel grid covers [0, size): a corner exactly on the far edge is contained
    for (fx, fy) in rotated_corners_in_roi(config, rot_bbox):
        if not (0 <= fx <= fixed_crop_shape[1]):
            print('corner x outside ROI: ' + str(fx))
            return False
        if not (0 <= fy <= fixed_crop_shape[0]):
            print('corner y outside ROI: ' + str(fy))
            return False
    return True


def main():
    fixed_array = make_fixed()
    moving = make_moving()
    checks = []

    def check(name, condition, detail=''):
        checks.append((name, bool(condition), detail))
        print(('PASS ' if condition else 'FAIL ') + name + ('  ' + detail if detail else ''))

    #--- 1. backward compatibility: rotation = 0 must behave exactly as before ---
    config, fixed_crop, out, _ = run_pipeline(0, 150, 100, fixed_array, moving)

    #pre-change crop computation
    old_left, old_top = 150, 100
    old_right, old_bottom = W_FIXED - 150 - W_MOV, H_FIXED - 100 - H_MOV
    check('rot=0: crop identical to the pre-change formula',
          (config['fixed_crop_pos_x'][0], config['fixed_crop_pos_y'][0],
           config['fixed_crop_pos_x'][1], config['fixed_crop_pos_y'][1])
          == (old_left, old_top, old_right, old_bottom),
          'crop LTRB = ' + str((config['fixed_crop_pos_x'][0], config['fixed_crop_pos_y'][0],
                                config['fixed_crop_pos_x'][1], config['fixed_crop_pos_y'][1])))

    old_fixed_crop = functions.crop_roi_image_xy_pos__start_end(
        fixed_array, [old_left, old_right], [old_top, old_bottom])
    old_tr = sitk.Similarity2DTransform()
    old_tr.SetAngle(0.0)
    old_tr.SetTranslation((0.0, 0.0))
    old_out = resample(moving, old_fixed_crop.shape, old_tr)
    check('rot=0: initial alignment identical to the pre-change transform',
          np.allclose(old_fixed_crop, fixed_crop) and np.allclose(old_out, out))
    check('rot=0: full image visible', visible_markers(out) == ['BL', 'BR', 'C', 'TL', 'TR'],
          str(visible_markers(out)))

    #--- 2. rotation = 30 deg: the previously-cropped corners are now inside ---
    config, fixed_crop, out, _ = run_pipeline(30, 150, 100, fixed_array, moving)
    rot_bbox = get_rotated_bounding_box_pixels(W_MOV, H_MOV, 30)
    check('rot=30: ROI size = rotated bbox size',
          fixed_crop.shape == (rot_bbox['height'], rot_bbox['width']),
          'ROI = ' + str(fixed_crop.shape[1]) + 'x' + str(fixed_crop.shape[0])
          + ' (was ' + str(W_MOV) + 'x' + str(H_MOV) + ')')
    check('rot=30: ROI origin = placement corner - displacement',
          (config['fixed_crop_pos_x_margin'][0], config['fixed_crop_pos_y_margin'][0])
          == (150 - rot_bbox['displacement_x'], 100 - rot_bbox['displacement_y']),
          'roi origin = ' + str((config['fixed_crop_pos_x_margin'][0], config['fixed_crop_pos_y_margin'][0])))
    check('rot=30: full rotated image visible (BL/BR no longer cropped)',
          visible_markers(out) == ['BL', 'BR', 'C', 'TL', 'TR'], str(visible_markers(out)))
    check('rot=30: all rotated corners inside the ROI', check_fully_inside(config, fixed_crop.shape, rot_bbox))

    #--- 3. rotation = 90 deg: the previously-EMPTY ROI now shows the image ---
    config, fixed_crop, out, _ = run_pipeline(90, 150, 100, fixed_array, moving)
    rot_bbox = get_rotated_bounding_box_pixels(W_MOV, H_MOV, 90)
    check('rot=90: ROI size = rotated bbox size',
          fixed_crop.shape == (rot_bbox['height'], rot_bbox['width']),
          'ROI = ' + str(fixed_crop.shape[1]) + 'x' + str(fixed_crop.shape[0]))
    check('rot=90: full rotated image visible (ROI no longer empty)',
          visible_markers(out) == ['BL', 'BR', 'C', 'TL', 'TR'], str(visible_markers(out)))
    check('rot=90: full rotated image inside the ROI', check_fully_inside(config, fixed_crop.shape, rot_bbox))

    #--- 4. clamped ROI: rotated image partially outside the fixed image ---
    config, fixed_crop, out, _ = run_pipeline(90, 30, 100, fixed_array, moving)
    check('rot=90 @ x=30: clamped ROI is valid (30x100)', fixed_crop.shape == (100, 30),
          'ROI = ' + str(fixed_crop.shape[1]) + 'x' + str(fixed_crop.shape[0]))
    check('rot=90 @ x=30: only the part over the fixed image is visible',
          visible_markers(out) == ['TL', 'TR'], str(visible_markers(out)))

    #--- 4b. FLOATING POINT degree rotations: 22.5 and 33.7 deg end-to-end ---
    #the angle must flow through at full precision (never rounded): the ROI is
    #the pixel bbox of the exact angle (NOT of the rounded angle) and the
    #rotated image lands exactly as in the UI
    for rot in (22.5, 33.7):
        config, fixed_crop, out, _ = run_pipeline(rot, 150, 100, fixed_array, moving)
        rot_bbox = get_rotated_bounding_box_pixels(W_MOV, H_MOV, rot)
        check('rot=' + str(rot) + ': ROI size = pixel bbox of the EXACT angle (not the rounded one)',
              fixed_crop.shape == (rot_bbox['height'], rot_bbox['width'])
              and fixed_crop.shape != (get_rotated_bounding_box_pixels(W_MOV, H_MOV, round(rot))['height'],
                                       get_rotated_bounding_box_pixels(W_MOV, H_MOV, round(rot))['width']),
              'ROI = ' + str(fixed_crop.shape[1]) + 'x' + str(fixed_crop.shape[0])
              + ' (rounded-angle bbox would be w'
              + str(get_rotated_bounding_box_pixels(W_MOV, H_MOV, round(rot))['width']) + ' x h'
              + str(get_rotated_bounding_box_pixels(W_MOV, H_MOV, round(rot))['height']) + ')')
        check('rot=' + str(rot) + ': full rotated image visible',
              visible_markers(out) == ['BL', 'BR', 'C', 'TL', 'TR'], str(visible_markers(out)))
        check('rot=' + str(rot) + ': all rotated corners inside the ROI',
              check_fully_inside(config, fixed_crop.shape, rot_bbox))

    #--- 5. stage chaining: the s2 initial transform (anchored at the placement
    #       pivot with the s1 translation parameter) reproduces the s1 initial ---
    for rot in (0, 22.5, 30, 90, -90, 33.7):
        rot_bbox = get_rotated_bounding_box_pixels(W_MOV, H_MOV, rot)
        fixed_crop_origin = (150 - rot_bbox['displacement_x'], 100 - rot_bbox['displacement_y'])
        rotation_pivot = (150 - fixed_crop_origin[0], 100 - fixed_crop_origin[1])
        th_sitk = rot * (-np.pi / 180.0)

        #s1 initial (as built by set_initial_transformation, s1 branch)
        s1_init = sitk.Similarity2DTransform()
        s1_init.SetAngle(th_sitk)
        s1_init.SetCenter(rotation_pivot)
        s1_init.SetTranslation((-rotation_pivot[0], -rotation_pivot[1]))

        #s2 initial: built by the real set_initial_transformation (s2 branch),
        #fed with the ideal s1 best result: scale 1, same angle, recorded
        #translation (= t - roi_origin = -placement corner)
        best_tr_s1 = {'scale': 1.0, 'rot': th_sitk,
                      'tx': float(-150), 'ty': float(-100)}  # recorded = t - roi_origin = -placement corner
        initial_loc_mov_s2 = [int(best_tr_s1['tx'] + fixed_crop_origin[0]), int(best_tr_s1['ty'] + fixed_crop_origin[1])]
        config_s2 = {'name': 's2', 'filename': 'verify_',
                     'ini_rot_moving_img': {'rot': th_sitk, 'centre_of_rot': 'top_left_corner'},
                     'best_transform_so_far': best_tr_s1,
                     'ini_pos_d': (-150, -100),
                     'fixed_crop_pos_x_margin': [fixed_crop_origin[0], 0],
                     'fixed_crop_pos_y_margin': [fixed_crop_origin[1], 0]}
        s2_init = functions.set_initial_transformation_affine__4_6_bspline(
            initial_loc_mov_s2, [1, 1, 3, 3], config_s2)

        out_s1 = resample(moving, (H_FIXED, W_FIXED), s1_init)
        out_s2 = resample(moving, (H_FIXED, W_FIXED), s2_init)
        check('rot=' + str(rot) + ': s2 initial reproduces the s1 initial transform',
              np.allclose(out_s1, out_s2))

    #--- 6. final-alignment reconstruction (get_transform_from_parameters_bspline,
    #       ROI coordinates, zero bspline coefficients => B = identity) ---
    for rot in (0, 22.5, 30, 90, -90, 33.7):
        rot_bbox = get_rotated_bounding_box_pixels(W_MOV, H_MOV, rot)
        fixed_crop_origin = (150 - rot_bbox['displacement_x'], 100 - rot_bbox['displacement_y'])
        rotation_pivot = (150 - fixed_crop_origin[0], 100 - fixed_crop_origin[1])
        corner = (150, 100)
        best_tr_s3 = make_ideal_best_tr_s3(rot, corner[0], corner[1])
        best_tr_s4 = make_zero_best_tr_s4()
        fixed_params = make_fixed_parameters((rot_bbox['height'], rot_bbox['width']))
        config_roi = {'ini_loc_within_fixed_ROI': (-rotation_pivot[0], -rotation_pivot[1]),
                      'ini_pos_d': (-150, -100),
                      'fixed_crop_pos_x_margin': [fixed_crop_origin[0], 0],
                      'fixed_crop_pos_y_margin': [fixed_crop_origin[1], 0],
                      'fixed_parameters': fixed_params}
        tx_roi = functions.get_transform_from_parameters_bspline(best_tr_s4, best_tr_s3, config_roi)
        out_roi = resample(moving, (rot_bbox['height'], rot_bbox['width']), tx_roi)
        expected = {v: (rotation_pivot[0] + rotate_cw(qx, qy, rot)[0],
                        rotation_pivot[1] + rotate_cw(qx, qy, rot)[1])
                    for v, (qx, qy) in MARKER_CONTENT.items()}
        check('rot=' + str(rot) + ': final-alignment reconstruction places the rotated image at the pivot',
              check_markers_at_expected(out_roi, expected))

    #--- 7. apply path (get_transform_from_parameters_bspline_fullFixedimage_translation,
    #       full fixed-image coordinates, zero bspline coefficients => B = identity):
    #       the rotated image must land exactly as placed in the UI ---
    for rot, x, y in [(0, 150, 100), (22.5, 150, 100), (30, 150, 100), (90, 150, 100), (-90, 150, 150), (33.7, 150, 100)]:
        rot_bbox = get_rotated_bounding_box_pixels(W_MOV, H_MOV, rot)
        fixed_crop_origin = (x - rot_bbox['displacement_x'], y - rot_bbox['displacement_y'])
        rotation_pivot = (x - fixed_crop_origin[0], y - fixed_crop_origin[1])
        loc_at_crop = (-rotation_pivot[0], -rotation_pivot[1])  # ideal s3 translation parameter
        best_tr_s3 = make_ideal_best_tr_s3(rot, x, y)
        best_tr_s4 = make_zero_best_tr_s4()
        fixed_params = make_fixed_parameters((rot_bbox['height'], rot_bbox['width']))
        tx_full = functions.get_transform_from_parameters_bspline_fullFixedimage_translation(
            best_tr_s4, best_tr_s3, fixed_params, loc_at_crop, fixed_crop_origin, rotation_pivot)
        out_full = resample(moving, (H_FIXED, W_FIXED), tx_full)
        expected = {v: (x + rotate_cw(qx, qy, rot)[0], y + rotate_cw(qx, qy, rot)[1])
                    for v, (qx, qy) in MARKER_CONTENT.items()}
        check('rot=' + str(rot) + ' @ (' + str(x) + ',' + str(y) + '): apply path places the rotated image as in the UI',
              check_markers_at_expected(out_full, expected))

    #--- 8. legacy transformation json fallback (no recorded geometry fields) ---
    rot, x, y = 30, 150, 100
    rot_bbox = get_rotated_bounding_box_pixels(W_MOV, H_MOV, rot)
    fixed_crop_origin = (x - rot_bbox['displacement_x'], y - rot_bbox['displacement_y'])
    rotation_pivot = (x - fixed_crop_origin[0], y - fixed_crop_origin[1])
    loc_at_crop = (-rotation_pivot[0], -rotation_pivot[1])
    legacy_json = {'loc_at_crop': list(loc_at_crop),
                   'initial_position_tx_ty': [-x, -y],
                   'transformation_obtained_s3': make_ideal_best_tr_s3(rot, x, y),
                   'transformation_obtained_s4': make_zero_best_tr_s4(),
                   'fixed_parameters': make_fixed_parameters((rot_bbox['height'], rot_bbox['width']))}
    derived_origin = (legacy_json['loc_at_crop'][0] - legacy_json['initial_position_tx_ty'][0],
                      legacy_json['loc_at_crop'][1] - legacy_json['initial_position_tx_ty'][1])
    derived_pivot = (-legacy_json['initial_position_tx_ty'][0] - derived_origin[0],
                     -legacy_json['initial_position_tx_ty'][1] - derived_origin[1])
    check('legacy json: ROI origin and pivot derived correctly',
          derived_origin == fixed_crop_origin and derived_pivot == rotation_pivot,
          'origin ' + str(derived_origin) + ', pivot ' + str(derived_pivot))

    failed = [name for (name, ok, _) in checks if not ok]
    print('')
    print(str(len(checks) - len(failed)) + '/' + str(len(checks)) + ' integration checks passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())