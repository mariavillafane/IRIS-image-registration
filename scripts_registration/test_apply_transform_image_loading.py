#test_apply_transform_image_loading.py - 260928
#Tests for get_image_as_array_from_path (functions.py) - the loader used by
#"Apply Transformation to More Images" (apply_transform_to_image_from_json_alpha.py,
#invoked by the server's /api/transform endpoint).
#
#The pre-fix loader was
#    np.asarray(cv2.cvtColor(cv2.imread(path, -1), cv2.COLOR_BGR2GRAY), dtype=float)
#which crashed with OpenCV 3.4.2's CvtHelper assertion on SINGLE-CHANNEL inputs
#(grayscale PNGs, grayscale JPEGs and 16-bit grayscale TIFFs - the most common
#images dropped on the results page), so the feature silently failed for them.
#The fixed loader reads with PIL and stretches to 8-bit greyscale exactly like
#the moving images of the registration itself.
#
#Run directly:   python test_apply_transform_image_loading.py
#or via pytest:  pytest test_apply_transform_image_loading.py
import os
import sys
import tempfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from functions import get_image_as_array_from_path

W, H = 64, 48


def gradient_8bit():
    #diagonal ramp 0..255, so min-max normalisation is the identity map
    xs = np.tile(np.linspace(0, 255, W).astype(np.uint8), (H, 1))
    return xs


def two_tone_8bit(dark=40, bright=200):
    a = np.full((H, W), dark, dtype=np.uint8)
    a[H // 2 - 8:H // 2 + 8, W // 2 - 8:W // 2 + 8] = bright
    return a


def with_temp_dir(test):
    def wrapped():
        with tempfile.TemporaryDirectory() as tmp:
            test(tmp)
    wrapped.__name__ = test.__name__
    return wrapped


@with_temp_dir
def test_grayscale_8bit_png_loads_as_2d_float(tmp):
    #used to crash: cv2.cvtColor(COLOR_BGR2GRAY) on a 1-channel image
    path = os.path.join(tmp, 'gray.png')
    Image.fromarray(gradient_8bit(), mode='L').save(path)

    out = get_image_as_array_from_path(path)

    assert out.shape == (H, W)
    assert out.dtype == np.float64
    assert out.min() == 0.0
    assert abs(out.max() - 255.0) <= 1.0
    #the ramp survives (small tolerance for the uint8 roundtrip)
    assert abs(out[H // 2, W // 2] - gradient_8bit()[H // 2, W // 2]) <= 2.0


@with_temp_dir
def test_grayscale_16bit_tiff_stretched_to_8bit_range(tmp):
    #used to crash: 1-channel uint16 input (typical microscopy TIFF)
    path = os.path.join(tmp, 'gray16.tiff')
    raw = (gradient_8bit().astype(np.uint16)) * 257  #0..65535 full range
    Image.fromarray(raw).save(path)

    out = get_image_as_array_from_path(path)

    assert out.shape == (H, W)
    assert out.dtype == np.float64
    assert out.min() == 0.0
    assert abs(out.max() - 255.0) <= 1.0
    #the ramp is preserved after the min-max stretch
    assert abs(out[H // 2, W // 2] - raw[H // 2, W // 2] / 257.0) <= 2.0


@with_temp_dir
def test_grayscale_jpeg_loads_as_2d_float(tmp):
    #used to crash: cv2.imread returns 1 channel for grayscale JPEGs too
    path = os.path.join(tmp, 'gray.jpg')
    Image.fromarray(two_tone_8bit(), mode='L').save(path, quality=95)

    out = get_image_as_array_from_path(path)

    assert out.shape == (H, W)
    assert out.dtype == np.float64
    #contrast survives the (lossy) roundtrip
    bright = out[H // 2, W // 2]
    dark = out[2, 2]
    assert bright - dark > 50.0


@with_temp_dir
def test_color_png_converted_to_2d_grayscale(tmp):
    #the only format the pre-fix loader handled - must keep working
    path = os.path.join(tmp, 'color.png')
    a = two_tone_8bit()
    Image.fromarray(np.stack([a, a, a], axis=-1), mode='RGB').save(path)

    out = get_image_as_array_from_path(path)

    assert out.shape == (H, W)
    assert out.ndim == 2
    bright = out[H // 2, W // 2]
    dark = out[2, 2]
    assert bright - dark > 50.0


@with_temp_dir
def test_rgba_png_loads_as_2d_grayscale(tmp):
    #the pipeline's own outputs are RGBA ("Final_transformed_image_*.png")
    #and are common inputs for chained transformations
    path = os.path.join(tmp, 'rgba.png')
    a = two_tone_8bit()
    alpha = np.full((H, W), 255, dtype=np.uint8)
    Image.fromarray(np.stack([a, a, a, alpha], axis=-1), mode='RGBA').save(path)

    out = get_image_as_array_from_path(path)

    assert out.shape == (H, W)
    assert out.ndim == 2
    assert out[H // 2, W // 2] - out[2, 2] > 50.0


@with_temp_dir
def test_16bit_and_8bit_representations_load_identically(tmp):
    #the same image saved as 8-bit PNG and 16-bit TIFF must load to the same
    #array, so additional images render consistently with the registered ones
    gray8_path = os.path.join(tmp, 'gray8.png')
    gray16_path = os.path.join(tmp, 'gray16.tiff')
    raw8 = two_tone_8bit()
    Image.fromarray(raw8, mode='L').save(gray8_path)
    Image.fromarray(raw8.astype(np.uint16) * 257).save(gray16_path)

    out8 = get_image_as_array_from_path(gray8_path)
    out16 = get_image_as_array_from_path(gray16_path)

    assert out8.shape == out16.shape == (H, W)
    assert np.allclose(out8, out16, atol=2.0)


@with_temp_dir
def test_loader_matches_moving_image_loader_of_the_registration(tmp):
    #consistency contract: the loader must be exactly what the registration
    #applies to the moving images
    #(get_moving_images_from_json_dict__imagestack__by_id =>
    # toGRAY_as_8bit_even_if_original_image_is_16bit(Image.open(path)))
    from functions import loadImageFromEntry, toGRAY_as_8bit_even_if_original_image_is_16bit

    path = os.path.join(tmp, 'gray16.tiff')
    Image.fromarray(two_tone_8bit().astype(np.uint16) * 257).save(path)

    out = get_image_as_array_from_path(path)
    expected = np.asarray(
        toGRAY_as_8bit_even_if_original_image_is_16bit(loadImageFromEntry({'path': path})),
        dtype=float,
    )
    assert np.array_equal(out, expected)


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