#verify_apply_transform_to_more_images.py - 260928
#End-to-end evidence for "Apply Transformation to More Images":
#runs scripts_registration/apply_transform_to_image_from_json_alpha.py as a
#subprocess - exactly like the server's /api/transform endpoint does - and
#applies a recorded transformation to additional images that were NOT part of
#the registration, in the formats users actually drop on the results page:
#  - 8-bit grayscale PNG   (used to crash: cv2.cvtColor BGR2GRAY on 1 channel)
#  - 16-bit grayscale TIFF (used to crash: 1-channel uint16, typical
#                           microscopy TIFF)
#  - grayscale JPEG        (used to crash: 1 channel)
#  - colour RGB PNG        (the only format the pre-fix loader handled)
#plus one rotated case, to cover the pivot geometry through the real script.
#
#For every case the transformed image must be written, at the full fixed-image
#size, with the moving image placed exactly at the position recorded in the
#transformation json.
#
#Run (inside the pinned environment, e.g. the CI docker image):
#  python scripts_registration/verify_apply_transform_to_more_images.py
import json
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from geometry import get_rotated_bounding_box_pixels  # noqa: E402
from verify_rotated_bounding_box_integration import (  # noqa: E402
    make_ideal_best_tr_s3,
    make_fixed_parameters,
    make_zero_best_tr_s4,
    rotate_cw,
)

SCRIPT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    'apply_transform_to_image_from_json_alpha.py',
)

W_FIXED, H_FIXED = 400, 400
W_MOV, H_MOV = 100, 80
DARK, BRIGHT = 40, 200

#marker positions in moving-image content coordinates
MARKER_BRIGHT = (50.0, 40.0)  #centre of the bright square
MARKER_DARK = (10.0, 10.0)    #dark background near the top-left corner


def make_moving_8bit():
    a = np.full((H_MOV, W_MOV), DARK, dtype=np.uint8)
    a[30:50, 40:60] = BRIGHT
    return a


def write_transformations_json(path, rot, x, y):
    #records an ideal registration of the moving image rotated by `rot`
    #degrees, placed with its top-left corner at (x, y) on the fixed image -
    #same json shape the registration writes (legacy geometry fields)
    rot_bbox = get_rotated_bounding_box_pixels(W_MOV, H_MOV, rot)
    fixed_crop_origin = (x - rot_bbox['displacement_x'], y - rot_bbox['displacement_y'])
    rotation_pivot = (x - fixed_crop_origin[0], y - fixed_crop_origin[1])
    data = {
        'datacube_number': 'mov_img_0',
        'loc_at_crop': [-rotation_pivot[0], -rotation_pivot[1]],
        'initial_position_tx_ty': [-x, -y],
        'transformation_obtained_s3': make_ideal_best_tr_s3(rot, x, y),
        'transformation_obtained_s4': make_zero_best_tr_s4(),
        'fixed_parameters': list(make_fixed_parameters((rot_bbox['height'], rot_bbox['width']))),
        'target_fixed_image_size_scaled___y_x': [H_FIXED, W_FIXED],
    }
    with open(path, 'w') as f:
        json.dump(data, f)


def run_transform_script(tmp, name, image_path, rot, x, y):
    #the same command line the server builds in /api/transform
    destination = os.path.join(tmp, 'results', 'mov_img_0', name)
    json_path = os.path.join(tmp, 'mov_img_0_transformations.json')
    write_transformations_json(json_path, rot, x, y)
    completed = subprocess.run(
        [sys.executable, SCRIPT, destination, json_path, image_path],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if completed.returncode != 0:
        return None, completed.stdout.decode('utf-8', 'replace')[-2000:]
    out_path = os.path.join(destination, 'Final_transformed_image_0.png')
    if not os.path.exists(out_path):
        return None, 'output image not created in ' + destination
    return out_path, None


def grey_luminance(rgba):
    #RGB -> luma, ignoring the alpha channel
    return np.asarray(Image.fromarray(rgba[..., :3], mode='RGB').convert('L'), dtype=float)


def check_output(out_path, rot, x, y):
    rgba = np.asarray(Image.open(out_path))
    if rgba.shape != (H_FIXED, W_FIXED, 4):
        return 'output shape ' + str(rgba.shape) + ', expected ' + str((H_FIXED, W_FIXED, 4))

    #content point (qx, qy) of the moving image lands at
    #(x + rotate_cw(qx, qy, rot)[0], y + rotate_cw(qx, qy, rot)[1])
    bx, by = rotate_cw(MARKER_BRIGHT[0], MARKER_BRIGHT[1], rot)
    dx, dy = rotate_cw(MARKER_DARK[0], MARKER_DARK[1], rot)
    bright = (int(round(x + bx)), int(round(y + by)))
    dark = (int(round(x + dx)), int(round(y + dy)))

    #opaque exactly where the transformed image was placed, transparent outside
    if rgba[bright[1], bright[0], 3] != 255:
        return 'alpha at bright centre ' + str(bright) + ' = ' + str(rgba[bright[1], bright[0], 3]) + ' (expected 255)'
    if rgba[5, 5, 3] != 0:
        return 'alpha outside the placed image is not transparent: ' + str(rgba[5, 5, 3])

    #contrast: the bright square must be far brighter than the dark background
    lum = grey_luminance(rgba)
    if lum[dark[1], dark[0]] >= lum[bright[1], bright[0]] \
            or lum[bright[1], bright[0]] - lum[dark[1], dark[0]] <= 50:
        return 'bright centre ' + str(lum[bright[1], bright[0]]) \
            + ' vs dark bg ' + str(lum[dark[1], dark[0]])
    return None


def main():
    checks = []

    def check(name, condition, detail=''):
        checks.append((name, bool(condition), detail))
        print(('PASS ' if condition else 'FAIL ') + name + ('  ' + detail if detail else ''))

    tmp = tempfile.mkdtemp(prefix='apply_transform_verify_')
    try:
        #the additional images, in every format the results page accepts
        images = {}
        Image.fromarray(make_moving_8bit(), mode='L').save(os.path.join(tmp, 'gray8.png'))
        images['8-bit grayscale PNG'] = os.path.join(tmp, 'gray8.png')
        Image.fromarray(make_moving_8bit().astype(np.uint16) * 257).save(os.path.join(tmp, 'gray16.tiff'))
        images['16-bit grayscale TIFF'] = os.path.join(tmp, 'gray16.tiff')
        Image.fromarray(make_moving_8bit(), mode='L').save(os.path.join(tmp, 'gray.jpg'), quality=95)
        images['grayscale JPEG'] = os.path.join(tmp, 'gray.jpg')
        Image.fromarray(np.stack([make_moving_8bit()] * 3, axis=-1), mode='RGB').save(os.path.join(tmp, 'color.png'))
        images['colour RGB PNG'] = os.path.join(tmp, 'color.png')

        #1. every format applies the transformation (rot=0 placed at (150,100))
        outputs = {}
        for label, path in images.items():
            out_path, error = run_transform_script(tmp, label.replace(' ', '_').replace('-', '_'), path, 0, 150, 100)
            check('rot=0: ' + label + ' applies the transformation', out_path is not None, error or '')
            if out_path:
                outputs[label] = out_path
                error = check_output(out_path, 0, 150, 100)
                check('rot=0: ' + label + ' placed correctly at full fixed-image size', error is None, error or '')

        #2. the 16-bit TIFF and the grayscale PNG produce the SAME transformed
        #   image (the loader must normalise 16-bit exactly like 8-bit)
        if '8-bit grayscale PNG' in outputs and '16-bit grayscale TIFF' in outputs:
            a = np.asarray(Image.open(outputs['8-bit grayscale PNG']), dtype=float)
            b = np.asarray(Image.open(outputs['16-bit grayscale TIFF']), dtype=float)
            check('16-bit TIFF and 8-bit PNG produce the same transformed image', np.abs(a - b).max() <= 2.0,
                  'max abs diff = ' + str(np.abs(a - b).max()))
            #and so does the colour PNG (same luminance pattern)
            if 'colour RGB PNG' in outputs:
                c = np.asarray(Image.open(outputs['colour RGB PNG']), dtype=float)
                check('colour PNG produces the same transformed image', np.abs(a - c).max() <= 2.0,
                      'max abs diff = ' + str(np.abs(a - c).max()))

        #3. rotated case through the real script (pivot geometry end-to-end)
        out_path, error = run_transform_script(tmp, 'rot90', os.path.join(tmp, 'gray16.tiff'), 90, 150, 100)
        check('rot=90: 16-bit grayscale TIFF applies the transformation', out_path is not None, error or '')
        if out_path:
            error = check_output(out_path, 90, 150, 100)
            check('rot=90: rotated additional image placed correctly', error is None, error or '')

    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    failed = [name for (name, ok, _) in checks if not ok]
    print('')
    print(str(len(checks) - len(failed)) + '/' + str(len(checks)) + ' integration checks passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())