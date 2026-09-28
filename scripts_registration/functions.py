import numpy as np
import cv2
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
from PIL import Image
from scipy.io import loadmat
import math                         #for ceil (round float to upper int)  200711
import SimpleITK as sitk
#import mat73 => not loaded as part of the installation at NG 231215 of image_registration_legacy_venv.yml
import itertools
import pandas as pd
import glob
import functools
from multiprocessing import Pool
import datetime
import time
import json
import io
import cv2
import base64
from PIL import Image

from geometry import get_rotated_bounding_box_pixels #260923 - pixel bbox (and displacement) of the rotated moving image for the ROI crop


#260923 - composite-transform construction that works on both sitk 1.2.4 (the
#version pinned in environment.yml, where sitk.Transform(2, sitk.sitkComposite)
#returns a composite) and newer sitk versions (which require
#sitk.CompositeTransform)
def new_composite_transform(dimension=2):
    tx = sitk.Transform(dimension, sitk.sitkComposite)
    if not hasattr(tx, 'AddTransform'):
        tx = sitk.CompositeTransform(dimension)
    return tx



#230119 - NEW FROM STRACH

def load_json_from_path(path_json):
    f = open(path_json)     #'settings_NG1093_xray004_xray_019.json'
    data_from_json = json.load(f)     # returns JSON object as a dictionary
    f.close()               # Closing file
    return data_from_json


#230119 - 221114 for Miniatures (each XRF comes in a dedicated .jpeg file, still need to be put together as a datacube)
def get_datacube_from_single_images(config_path_moving_images): #config
    #datacube_eq = {slice: np.asarray(cv2.cvtColor(cv2.imread(path), cv2.COLOR_BGR2GRAY), dtype=float) for slice, path in config_path_moving_images['path_moving_images'].items()}
    #datacube_eq = {slice: np.asarray(cv2.cvtColor(cv2.imread(path, -1), cv2.COLOR_BGR2GRAY), dtype=float) for slice, path in config_path_moving_images['path_moving_images'].items()} #251014
    datacube_eq = {slice: np.asarray(cv2.cvtColor(cv2.imread(path, cv2.IMREAD_ANYDEPTH), cv2.COLOR_BGR2GRAY), dtype=float) for slice, path in config_path_moving_images['path_moving_images'].items()} #251016
    datacube_from_path = {**config_path_moving_images, 'datacube_eq': datacube_eq}
    return datacube_from_path


# #231218
def get_fixed_image_as_array_from_json_COLOR(data_from_json):
    image = loadImageFromEntry(data_from_json['imageFixed']['imageEntries'][0])    #[1] for the 2nd part of the string    # ['imageEntries'][0] is the first image of imageFixed (['imageFixed'] is the first dictionary of settings.json) #230904 NG
    image_COLOR = toCOLOR(image)
    image_GREY = toGRAY(image)

    #data_from_json['imageFixed'].pop('imageEntries', None) #muted231214
    dict = {
        'fixed_image_as_array': image_GREY,
        'fixed_image_as_array_COLOR': image_COLOR,
        **data_from_json['imageFixed']
    }
    return dict




# #230829 - NEW (230209)
def get_fixed_image_as_array_from_json(data_from_json):
    image = toGRAY(loadImageFromEntry(data_from_json['imageFixed']['imageEntries'][0]))
    dict = {
        'fixed_image_as_array': image,
        **data_from_json['imageFixed']
    }
    return dict


#230903 - 230830 - NEW for many images in datacube
def get_datacube_from_json__image_and_settings(data_from_json, no_of_datacube): # data = jsonfile
    moving_images_from_json = { key: val for (key, val) in get_moving_images_from_json_dict__imagestack(data_from_json, no_of_datacube) }
    datacube_from_json__image_and_settings = {'datacube_eq': moving_images_from_json, **data_from_json['workingImages'][no_of_datacube]} # ['workingImages'][0] is the first datacube of settings.json; ['workingImages'] is the second dictionary of settings.json #230904 NG
    #datacube_from_json__image_and_settings.pop('imageEntries', None) #muted231214
    return datacube_from_json__image_and_settings


#new 231214
def get_datacube_from_json__image_and_settings__by_id(data_from_json, no_of_datacube): # data = jsonfile
    moving_images_from_json = {key: val for (key, val) in get_moving_images_from_json_dict__imagestack__by_id(data_from_json, no_of_datacube) }
    datacube_from_json__image_and_settings = {'datacube_eq': moving_images_from_json, **data_from_json['workingImages'][no_of_datacube]} # ['workingImages'][0] is the first datacube of settings.json; ['workingImages'] is the second dictionary of settings.json #230904 NG
    #datacube_from_json__image_and_settings.pop('imageEntries', None) #muted231214
    return datacube_from_json__image_and_settings


def loadImageFromEntry (entry):
    if("base64" in entry):
        image_base64_str = image['base64'].split("base64,")[1]                        #[1] for the 2nd part of the string
        image_base64_pilimg = stringToImage(image_base64_str)
        return image_base64_pilimg
    else:
        return Image.open(entry["path"])


#new 231214 -- 251128
def get_moving_images_from_json_dict__imagestack__by_id(data_from_json, no_of_datacube):
    for counter, image in enumerate(data_from_json['workingImages'][no_of_datacube]['imageEntries']):               #(= workingImages == all moving images)
        # load moving images

        #image_array = toGRAY(loadImageFromEntry(image)) #muted 251128 (as 16-bit moving images do not end up into good registered images)
        image_array = toGRAY_as_8bit_even_if_original_image_is_16bit(loadImageFromEntry(image)) #251128, reviewed 251202

        yield  (image['id'], image_array) #yield  (image['id'], image_base64_array)  #DESIRABLE 230830



#230904 #230829 - NEW
def get_moving_images_from_json_dict__imagestack(data_from_json, no_of_datacube):
    for counter, image in enumerate(data_from_json['workingImages'][no_of_datacube]['imageEntries']):               #(= workingImages == all moving images)
        # load moving images
        image_array = toGRAY(loadImageFromEntry(image))

        yield (str(counter), image_array)


# 231214
# 211014 - for final registration
#260923 - the transform is rebuilt pivot-anchored and expressed on the FULL fixed
#image: T_full(p) = P + M.(B(p - roi_origin) - P) + t, with P = rotation_pivot
#(the moving image's top-left corner within the cropped fixed image), M = the s3
#affine matrix, B = the s4 bspline and t = the s3 translation parameter
#(loc_at_crop, recorded around the pivot centre by the s3 optimiser). The
#roi_origin shift converts between full-image and ROI coordinates. Before 260923
#the roi_origin shift was folded in front of the bspline and the affine was not
#pivot-anchored - exact for rotation = 0, misplaced by (M - I).(t + 2P) once
#rotated.
def get_transform_from_parameters_bspline_fullFixedimage_translation(best_tr_s4, best_tr_s3, fixed_parameters, loc_at_crop, fixed_crop_origin=(0.0, 0.0), rotation_pivot=None):
    # finalTx_ is an empty "addition friendly" transform, we need to pass params to it. We pass these params by adding scale_rotation_and_tr to this empty transform

    if rotation_pivot is None:
        rotation_pivot = (-loc_at_crop[0], -loc_at_crop[1]) #pre-260923 behaviour

    finalTx_ = new_composite_transform(2)

    # best_tr_s3__array_of_values  == values for affine + final translation
    best_tr_s3_av = list(best_tr_s3.values())

    affine_tr = sitk.AffineTransform(2)
    affine_tr.SetParameters((best_tr_s3_av[0], best_tr_s3_av[1], best_tr_s3_av[2], best_tr_s3_av[3], 0.0, 0.0))
    #260923 - pivot-anchored affine carrying the s3 translation parameter
    affine_tr.SetCenter((rotation_pivot[0], rotation_pivot[1]))
    affine_tr.SetTranslation((loc_at_crop[0], loc_at_crop[1]))

    bspline = sitk.BSplineTransform(2)
    bspline.SetFixedParameters(fixed_parameters)

    best_tr_s4__array_of_values = list(best_tr_s4.values())
    params_transform = np.asarray(best_tr_s4__array_of_values[0:-1], dtype=float)  # here we remove mi_average
    bspline.SetParameters(params_transform)

    shift_into_roi = sitk.TranslationTransform(2)
    shift_into_roi.SetParameters((-fixed_crop_origin[0], -fixed_crop_origin[1]))

    #add in REVERSE application order (a SimpleITK composite applies the
    #last-added transform first): application order =
    #shift_into_roi -> bspline -> affine   (== T_full above)
    finalTx_.AddTransform(affine_tr)
    finalTx_.AddTransform(bspline)
    finalTx_.AddTransform(shift_into_roi)
    print('3- finalTx_(translation + affine + bspline) = ' + str(finalTx_))

    return finalTx_


#231214
#210520 - alphachannel
def save_transform_and_image_alpha(transform, fixed_image, moving_images_dict): #, datacubes_no
    #moving_images_dict = datacube_from_json_by_id['datacube_eq'] #231214

    resample = sitk.ResampleImageFilter()
    resample.SetReferenceImage(sitk.GetImageFromArray(fixed_image))
    # SimpleITK supports several interpolation options, we go with the simplest that gives reasonable results.
    resample.SetInterpolator(sitk.sitkLinear)

    #unpack dictionary of moving images #231214
    images_to_merge = {}
    for key, image in moving_images_dict.items():
        #construct white image for each moving image => this will be opaque in alpha channel
        ph_ = np.ones(image.shape) * 255
        ph = sitk.GetImageFromArray(ph_)
        print("shape moving image = " + key + ":  " + str(ph_.shape))

        resample.SetTransform(transform)

        # RGB_channel (channels no.1-2-3)
        out_i = resample.Execute(sitk.GetImageFromArray(image))
        simg_i = sitk.Cast(sitk.RescaleIntensity(out_i, 0, 255), sitk.sitkUInt8)

        # 230908 - one strand:
        cimg_inv = simg_i

        # alpha_channel (channel no.4)
        out_alpha = resample.Execute(ph)
        simg_alpha = sitk.Cast(out_alpha, sitk.sitkUInt8)
        cimg_alpha = simg_alpha

        ac = sitk.GetArrayFromImage(cimg_alpha)
        print("shape cimg_alpha = " + key + ":  " + str(ac.shape))
        rgb = sitk.GetArrayFromImage(cimg_inv)
        print("shape cimg_rgb = " + key + ":  " + str(rgb.shape))

        images_to_merge = {
            **images_to_merge,
            key: [rgb, ac]
        }
    return images_to_merge



#231214 - 210520 - alphachannel
def merge_images_to_create_png(ims_to_merge):
    png_images = {}
    counter = 0

    # print(image_pairs)

    for key, image_pair in ims_to_merge.items():
        moving_img = image_pair[0]
        print(moving_img.shape)

        a_alpha = image_pair[1]
        print(a_alpha.shape)

        im_RGBA = cv2.merge((moving_img, moving_img, moving_img, a_alpha))
        print(im_RGBA.shape)
        #plt.imsave('alpha_' + str(key)+'.png', im_RGBA)
        png_images = {
            **png_images,
            key: im_RGBA
        }
        counter = counter + 1
    return png_images




#231218 - superseeded by stringToImage_COLOR - 230208 - Take in base64 string and return PIL image
def stringToImage(base64_string):
    imgdata = base64.b64decode(base64_string)
    return Image.open(io.BytesIO(imgdata)).convert("L")


#231218 - Take in base64 string and return PIL image
def stringToImage_COLOR(base64_string):
    imgdata = base64.b64decode(base64_string)
    return Image.open(io.BytesIO(imgdata)) #this is converted to greyscale later, so to have the fixed image in color AND greyscale


#251208. function to transform pillow-image (whether 8-bit or 16-bit) to 8-bit
def toGRAY_as_8bit_even_if_original_image_is_16bit(pil_image):
    #get array from pil_image and ensure it is written as 8-bit array 
    image_as_array = np.array(pil_image, dtype=float) #WORKS
    image_as_array_8bit = (((image_as_array - image_as_array.min()) / (image_as_array.max() - image_as_array.min())) * 255.9).astype(np.uint8) #WORKS
    #get pil_image from 8-bit array, and then transofrm into a greyscale image
    pil_image_8bit_from_array = Image.fromarray(np.uint8(image_as_array_8bit))
    image_as_array = np.array(pil_image_8bit_from_array.convert('L'), dtype=np.uint8) #np.float) #WORKS - saves image as grayscale (and we need this for moving images sitk)

    return image_as_array #image_as_array_8bit



# 230209 = array needs to be FLOAT np.dtype
# 230208 = convert PIL Image to an RGB/Grey image ( technically a numpy array ) that's compatible with opencv
def toGRAY(image):
    return np.array(image.convert('L'), dtype=float) #return cv2.cvtColor(np.array(image), cv2.COLOR_BGR2RGB) #for color image


# 230209
def toCOLOR(image):
    return np.array(image)
#    return cv2.cvtColor(np.array(image), cv2.COLOR_BGR2GRAY) #for color image



#(not checked on 230119) #220127 - 211028
def get_datacube_from_path_xray_generic(config):
    #x-rays = if str('.jpg') in str(config['path_moving_images']):
    if str('.jpg') or str('.tif') in str(config['path_moving_images']):
        mov_img = cv2.imread(config['path_moving_images'])
        datacube_eq = {str(slice): np.asarray(cv2.cvtColor(mov_img, cv2.COLOR_BGR2GRAY), dtype=float) for slice in config['slices']}

    #220127 - MA-XRF (Titian NG6420 only, as != DaVinci NG1093)
    #format moving images = 'C:/Users/eugen/Desktop/2020_ICL/Pycharm_data/NG6420/'+ datacube_no +'_elemental_map_' + str(slice_no) +'.mat'

    if str('.mat') in str(config['path_moving_images']): # name of XRF file => d13_elemental_map_81_3.mat @ C:\Users\eugen\Desktop\2020_ICL\Pycharm_data\NG6420
        datacube_eq = get_datacube_from_images(config['path_moving_images'], config['datacube_no'], config['slices'])

    #check type of pixel
    m = sitk.GetImageFromArray(datacube_eq[config['slices'][0]]).GetPixelIDValue()
    print('m pixel ID value = ' + str(m))
    print('get_datacube_from_path_xray_generic = ' + str(datacube_eq))

    datacube_from_path = {**config_path_moving_images, 'datacube_eq': datacube_eq}

    return datacube_from_path


#(not checked on 230119)
def get_datacube_from_images(path_moving_images, datacube_no, slices):
    dict = {str(slice): np.asarray(np.transpose(get_slice(path_moving_images, datacube_no, slice)), dtype=float) for slice in slices}
    return dict


#(not checked on 230119)
def get_slice(path_moving_images, datacube_no, slice_no):
    slice = loadmat(path_moving_images + datacube_no + '_elemental_map_' + str(slice_no) + '.mat')
    return slice['elemental_map']


#230123 - 210825 - new updated, clean version
def search_best_transform(config, p):
    config = {**config, 'filename': config['datacube_no'] + '_' + config['name'] + '_'}

    slice_and_config = [[slice, config] for slice in config['slices']]
    results = p.map(run_registration, slice_and_config)

    ##210428 - results from pool (p.map) : results is an array with [transform_highest_mi, array_all_transforms, config3] for each slice in slices - I need to unpack this into 3 arrays:
    #print('length results = ' + str(len(results)))

    transforms_highest_mi = [result[0] for result in results]
    #print('length transforms_highest_mi = ' + str(len(transforms_highest_mi)))

    array_of_array_all_transforms = [result[1] for result in results]
    #print('length array_of_array_all_transforms = ' + str(len(array_of_array_all_transforms)))

    ##config_fixed_image_as_array = results[-2][2] #for subimages 81_3_im00 >> results[0][2] will have subimages 18_0_im00
    ##config_fixed_image_as_array = results[0][2] #for xrays #211001 #221205     #muted on 230126

    config_setup_details_and_fixed_image_as_array = [result[2] for result in results]    #230126

    #print('config_setup_details_and_fixed_image_as_array = ' + str(config_setup_details_and_fixed_image_as_array))

    if len(config_setup_details_and_fixed_image_as_array) > 1:
        config_fixed_image_as_array = config_setup_details_and_fixed_image_as_array[0]      #new 230830
    else:
        config_fixed_image_as_array = config_setup_details_and_fixed_image_as_array[0]      #case of only 1 image in stack (i.e. Xray, UV, NIR)

    #print('config_fixed_image_as_array (test) = ')
    #print(config_fixed_image_as_array)

    final_moving_images_as_array = {str(slice) + config['tile']: result[2][str(slice) + config['tile']] for slice, result in zip(config['slices'], results)}
    #print('final_moving_images_as_array = ')
    #print(final_moving_images_as_array)

    config_fixed_image_as_array = {**config_fixed_image_as_array, **final_moving_images_as_array}
    #print('config_fixed_image_as_array = ')
    #print(config_fixed_image_as_array)

    no_of_best_tranforms_to_evaluate = 160


    if len(config['spacesize']) == 4:
        #df = pd.DataFrame(d10_main_array, columns= ['Level', 'Iteration', 'mi_max', 'tr_scale', 'tr_angle', 'tr_x', 'tr_y', 'slice', 'element_line'])
        df = pd.DataFrame(transforms_highest_mi, columns= ['Level', 'Iteration', 'mi_max', 'tr_scale', 'tr_angle', 'tr_x', 'tr_y', 'slice', 'element_line'])
        df.to_excel(config['folder_partial_results'] + '/' + config['filename'] + '_export_dataframe' + '_transforms_highest_mi.xlsx', index = False, header=True) #231219
        #df.to_excel(config['filename'] + '_export_dataframe' + '_transforms_highest_mi.xlsx', index = False, header=True)
        #df.to_excel(r'export_dataframe_' + config['filename'] + '_transforms_highest_mi.xlsx', index = False, header=True)
        sortedArray_all_transforms = sort_array_of_all_transforms(array_of_array_all_transforms)

        df_all_transforms = pd.DataFrame(sortedArray_all_transforms, columns= ['Level', 'Iteration', 'mi_max', 'tr_scale', 'tr_angle', 'tr_x', 'tr_y', 'slice', 'element_line'])
        print('length df_all_transforms = ' + str(len(df_all_transforms)))
        #print('df_all_transforms = ' + '\n' + str(df_all_transforms))      #muted231213

        df_all_transforms = df_all_transforms.drop_duplicates(subset=['tr_scale', 'tr_angle', 'tr_x', 'tr_y'], keep='first')
        print('length df_all_transforms NO DUPLICATES = ' + str(len(df_all_transforms)))
        #print('df_all_transforms NO DUPLICATES = ' + '\n' + str(df_all_transforms))    #muted231213

        # df_all_transforms = get_top_best_transforms(df_all_transforms, no_of_best_tranforms_to_evaluate, config) #muted 230127, to pass only filename (and not the full config)
        df_all_transforms = get_top_best_transforms(df_all_transforms, no_of_best_tranforms_to_evaluate, config['filename'], config)
        df_all_transforms = df_all_transforms[['tr_scale', 'tr_angle', 'tr_x', 'tr_y', 'mi_max', 'slice', 'element_line']]

        mi_average_list = evaluate_top_best_transforms__rigid_and_affine(df_all_transforms, config_fixed_image_as_array, config) #231219


    if len(config['spacesize']) == 6:
        #df = pd.DataFrame(d10_main_array, columns=['Level', 'Iteration', 'mi_max', 'tr_a11', 'tr_a12', 'tr_a21', 'tr_a22', 'tr_x', 'tr_y', 'slice', 'element_line'])
        df = pd.DataFrame(transforms_highest_mi, columns=['Level', 'Iteration', 'mi_max', 'tr_a11', 'tr_a12', 'tr_a21', 'tr_a22', 'tr_x', 'tr_y', 'slice', 'element_line'])
        df.to_excel(config['folder_partial_results'] + '/' + config['filename'] + '_export_dataframe' + '_transforms_highest_mi.xlsx', index=False, header=True) #231219
        #df.to_excel(config['filename'] + '_export_dataframe' + '_transforms_highest_mi.xlsx', index=False, header=True)
        #df.to_excel(r'export_dataframe_' + config['filename'] + '_transforms_highest_mi.xlsx', index=False, header=True)
        sortedArray_all_transforms = sort_array_of_all_transforms(array_of_array_all_transforms)

        df_all_transforms = pd.DataFrame(sortedArray_all_transforms, columns=['Level', 'Iteration', 'mi_max', 'tr_a11', 'tr_a12', 'tr_a21', 'tr_a22', 'tr_x', 'tr_y', 'slice', 'element_line'])
        print('length df_all_transforms = ' + str(len(df_all_transforms)))
        #print('df_all_transforms = ' + '\n' + str(df_all_transforms))      #muted231213

        df_all_transforms = df_all_transforms.drop_duplicates(subset=['tr_a11', 'tr_a12', 'tr_a21', 'tr_a22', 'tr_x', 'tr_y'], keep='first')
        print('length df_all_transforms NO DUPLICATES = ' + str(len(df_all_transforms)))
        #print('df_all_transforms NO DUPLICATES = ' + '\n' + str(df_all_transforms))        #muted231213

        # df_all_transforms = get_top_best_transforms(df_all_transforms, no_of_best_tranforms_to_evaluate, config) #muted 230127, to pass only filename (and not the full config)
        df_all_transforms = get_top_best_transforms(df_all_transforms, no_of_best_tranforms_to_evaluate, config['filename'], config)
        df_all_transforms = df_all_transforms[['tr_a11', 'tr_a12', 'tr_a21', 'tr_a22', 'tr_x', 'tr_y', 'mi_max', 'slice', 'element_line']]

        #mi_average_list = evaluate_top_best_transforms__rigid_and_affine(df_all_transforms, config_fixed_image_as_array) #, config
        mi_average_list = evaluate_top_best_transforms__rigid_and_affine(df_all_transforms, config_fixed_image_as_array, config) #231219

    if len(config['spacesize']) == 2:
        df = pd.DataFrame(transforms_highest_mi, columns=['Level', 'Iteration', 'mi_max', *create_names(amount=98), 'slice', 'element_line'])
        df.to_excel(config['folder_partial_results'] + '/' + config['filename'] + '_export_dataframe' + '_transforms_highest_mi.xlsx', index=False, header=True) #231219
        #df.to_excel(config['filename'] + '_export_dataframe' + '_transforms_highest_mi.xlsx', index=False, header=True) # config['folder_partial_results'] + '/' +
        #df.to_excel(r'export_dataframe_' + config['filename'] + '_transforms_highest_mi.xlsx', index=False, header=True)
        sortedArray_all_transforms = sort_array_of_all_transforms(array_of_array_all_transforms)

        df_all_transforms = pd.DataFrame(sortedArray_all_transforms, columns=['Level', 'Iteration', 'mi_max', *create_names(amount=98), 'slice', 'element_line'])
        print('length df_all_transforms = ' + str(len(df_all_transforms)))
        #print('df_all_transforms = ' + '\n' + str(df_all_transforms))          #muted231213

        df_all_transforms = df_all_transforms.drop_duplicates(subset=[*create_names(amount=98)], keep='first')
        print('length df_all_transforms NO DUPLICATES = ' + str(len(df_all_transforms)))
        #print('df_all_transforms NO DUPLICATES = ' + '\n' + str(df_all_transforms))            #muted231213

        # df_all_transforms = get_top_best_transforms(df_all_transforms, no_of_best_tranforms_to_evaluate, config) #muted 230127, to pass only filename (and not the full config)
        df_all_transforms = get_top_best_transforms(df_all_transforms, no_of_best_tranforms_to_evaluate, config['filename'], config)
        df_all_transforms = df_all_transforms[[*create_names(amount=98), 'mi_max', 'slice', 'element_line']]

        mi_average_list = evaluate_top_best_transforms__bspline(df_all_transforms, config_fixed_image_as_array)  #Here we reduce selection to 10 best transforms (no_of_best_tranforms_to_evaluate = 10) #230130

    # vv maybe this part should go into 'spacesize' = 4/6 and extract from sorted df for 'spacesize'=2
    # 210121 sort the array - purpose: get the data of highest mi average
    keyFunc_mi = lambda x: (x['mi_average'])
    mi_average_list_sorted = sorted(mi_average_list, key=keyFunc_mi)
    #print(mi_average_list_sorted)      #muted231213

    transform_of_highest_average_mi = mi_average_list_sorted[0]
    print('highest mi data (transform_of_highest_average_mi)= ' + str(transform_of_highest_average_mi))
    mi_average_list_df = pd.DataFrame(mi_average_list_sorted)
    #print('mi_average_list_df = ' + str(mi_average_list_df))       #muted231213

    mi_average_list_df.to_excel(config['folder_partial_results'] + '/' + config['filename'] + '_export_dataframe_AvMI' + '.xlsx', index=False, header=True)  #231219
    #mi_average_list_df.to_excel(config['filename'] + '_export_dataframe_AvMI' + '.xlsx', index = False, header=True) #config['folder_partial_results'] + '/' +
    #mi_average_list_df.to_excel(r'export_dataframe_AvMI' + config['filename'] +'.xlsx', index = False, header=True)

    return transform_of_highest_average_mi, config_fixed_image_as_array


#230123 - 221114 - also good for Xrays NG1155
def run_registration(slice_and_config):
    slice, config0 = slice_and_config
    config1 = {**config0, 'filename': config0['name'] + '_' + str(slice) + '_' + config0['datacube_no']}
    #config2 = {**config1, **get_datacube_from_path(config1)}
    ####config2 = {**config1, **get_datacube_from_path_xray(config1)}

    ####config3 = {**config2, **get_crop_moving_image_as_array_from_datacube(config2, slice)}   #moving image (ARRAY)
    config3 = {**config1, **get_crop_moving_image_as_array_from_datacube(config1, slice)}  # moving image (ARRAY)

    #config3a = {**config3, **divide_image_as_array_into_n_arrays(config3)}
    config3a = {**config3, **divide_image_as_array_into_n_arrays(config3, slice)}

    config4 = {**config3a, **get_location_to_crop_fixed_image_margin(config3a, slice)}      #uses ROI (before == config['datacube_eq']['19_0'].shape ==> to determine crop of fixed image
    config5 = {**config4, **get_initial_locations(config4)}
    #config6 = {**config5, **get_crop_fixed_image_with_margin_as_array_from_path(config5)}   ######fixed img (ARRAY) => CONFIG FOR LATER !!
    config6 = {**config5, **get_crop_fixed_image_with_margin___as_array_from_json(config5)}   ######fixed img (ARRAY) => CONFIG FOR LATER !!

    config7 = {**config6, **get_crop_fixed_image_from_array(config6)}                       #fixed img (SITK image)
    config8 = {**config7, **get_crop_moving_image_from_array(config7, slice)}               #moving image (SITK image)

    config  = {**config8, 'area_intial_search': get_area_intial_search(config8)}

    if np.max(config['moving_array']) <= 0.00001:
        return None
    config = {**config, 'result': register_spacesize(config, slice)} #210818 - # this 'result' now includes fixedParam

    #print('config 211209 = ' + str(config)) #muted231214

    array_all_transforms = get_array_all_transforms(config)
    write_array_all_transforms(config)

    transform_highest_mi = get_transform_highest_mi(config)

    config6 = {**config6, 'fixed_parameters': config['result']['fixed_parameters']} #210818

    return transform_highest_mi, array_all_transforms, config6        #CONFIG FOR LATER = config_w/ fixed_image_as_array


#new 230123 - no scaling of moving_crop_pos_x / moving_crop_pos_y
def get_crop_moving_image_as_array_from_datacube(config, slice):
    print('moving_image: slice no. = [' + str(slice) + ']')
    #print(config) #muted231214

    #get moving image as array from the slice of the datacube
    slice_rawdata_transposed_eq = config['datacube_eq'][slice]
    print('moving_image: slice max value (now)= ' + str(np.max(slice_rawdata_transposed_eq)))
    print('moving_image: slice shape (orig size = h,w) = ' + str(slice_rawdata_transposed_eq.shape))

    slice_rawdata_transposed_eq_scaled = image_scale(slice_rawdata_transposed_eq, config['scaling_coef'])
    print('moving_image: slice shape now scaled (size = h,w) = ' + str(slice_rawdata_transposed_eq_scaled.shape))

    #moving_crop_pos_x = [int(config['moving_crop']['crop_right'] * config['scaling_coef']), int(config['moving_crop']['crop_left'] * config['scaling_coef'])]  # start of crop, end of crop
    moving_crop_pos_x = [int(config['moving_crop']['crop_right']), int(config['moving_crop']['crop_left'])]  # => tuple = [start of crop, end of crop]
    #moving_crop_pos_y = [int(config['moving_crop']['crop_top'] * config['scaling_coef']), int(config['moving_crop']['crop_bottom'] * config['scaling_coef'])]
    moving_crop_pos_y = [int(config['moving_crop']['crop_top']), int(config['moving_crop']['crop_bottom'])]  # => tuple = [start of crop, end of crop]

    moving_array = crop_roi_image_xy_pos__start_end(slice_rawdata_transposed_eq_scaled, moving_crop_pos_x, moving_crop_pos_y)

    # PLOT MOVING IMAGE (ARRAY) with opencv
    cv2.imwrite(config['folder_partial_results'] + '/' + config['filename'] + 'rawdata_opencv2.tiff', moving_array) #231219

    print('moving_image: slice shape now scaled & cropped (size = h,w) ' + config['datacube_no'] + ' = ' + str(moving_array.shape))
    print('if moving_image is subdivided into 1 tile only: moving_image == subdivided_image')

    crop_moving_image_array = {
        'moving_array': moving_array,
        'moving_crop_pos_x': moving_crop_pos_x, #230123= check if still needs this ? => tuple = [start of crop, end of crop]
        'moving_crop_pos_y': moving_crop_pos_y  #230123= check if still needs this ? => tuple = [start of crop, end of crop]
    }
    return crop_moving_image_array


def image_scale(image, scaling_coef):
    if (scaling_coef == 1):
        return image
    coef = scaling_coef
    image_ = cv2.resize(image, (int(image.shape[1] * coef), int(image.shape[0] * coef)), interpolation=cv2.INTER_AREA)
    #print('max value image = ' + str(np.amax(image)))
    #print('min value image = ' + str(np.amin(image)))
    return image_


def crop_roi_image_xy_pos__start_end(working_image, crop_pos_x__start_end, crop_pos_y__start_end):
    #working_image = e.i. movingImage / fixedImage
    x_start, x_end_ = crop_pos_x__start_end
    y_start, y_end_ = crop_pos_y__start_end
    # if image has crop of 10px all around :: [10,10] = crop_pos_x__start_end

    x_end = working_image.shape[1] - x_end_
    y_end = working_image.shape[0] - y_end_

    working_image_cropped = working_image[y_start:y_end, x_start:x_end]  # [cols,rows]
    #if image is (500x, 600y) and has crop of 10px all around, :: working_image[10:490, 10:590]

    return working_image_cropped


def divide_image_as_array_into_n_arrays(config, slice): #(image, nw, nh):
    # 210506
    image = config['moving_array']
    nw, nh = config['moving_subdivision']['nw'], config['moving_subdivision']['nh']
    w = int(image.shape[0] / nw) #subdivision tiles along width
    h = int(image.shape[1] / nh) #subdivision tiles along height

    subdivided_images = {}
    for iw in range(nw):
        for ih in range(nh):
            x0 = iw * w
            y0 = ih * h
            x1 = (iw+1) * w
            y1 = (ih+1) * h
            sub_image = image[x0:x1, y0:y1]

            ###yield {'im'+str(iw)+str(ih) : sub_image}
            subdivided_images = {**subdivided_images, slice + '_im'+str(iw)+str(ih) : sub_image}   #e.g.: '81_3_im00' #slice + '_im00'

    return subdivided_images


# 230123 - no scaling of config['ini_pos_d']
# 230209 - fixed-image from json
def get_location_to_crop_fixed_image_margin(config, slice):
    fixed_full_shape = config['data_fixed_image_array_from_json']['fixed_image_as_array'].shape
    print('fixed image: shape (orig size = h,w) = ' + str(fixed_full_shape))

    fixed_scaled_shape = (int(fixed_full_shape[0] * config['scaling_coef_fixed']), int(fixed_full_shape[1] * config['scaling_coef_fixed']))

    print('fixed image: shape scaled (size = h,w) = ' + str(fixed_scaled_shape))    #new 230123

    subdivided_image_shape = config[slice + config['tile']].shape
    print('subdivided image: shape (orig size = h,w) = ' + str(subdivided_image_shape))

    # 260923 - the fixed-image ROI (the analysis canvas) must fully contain the
    # ROTATED moving image. The moving image (tile) is placed with its top-left
    # corner at (-ini_pos_d) in full fixed-image coordinates and rotated by
    # config['rotation'] degrees about that corner (same pivot as the UI preview
    # and as the s1 initial transform). The rotated bounding box is DISPLACED
    # from the placement corner (e.g. a clockwise rotation swings the image to
    # the LEFT of it), so the box is positioned on the fixed image using the
    # displacement returned by get_rotated_bounding_box:
    #     bbox_origin = placement_corner - (displacement_x, displacement_y)
    # Previously the unrotated tile size was used, which cropped the rotated
    # image (partially at e.g. 30 deg, completely at 90 deg).
    rotation_degrees = config['rotation']   #full float precision - never rounded
    rot_bbox = get_rotated_bounding_box_pixels(int(subdivided_image_shape[1]), int(subdivided_image_shape[0]), rotation_degrees, centre_of_rotation='top_left_corner')
    corner_x = -int(config['ini_pos_d'][0])     # placement corner of the moving image (full fixed-image coords)
    corner_y = -int(config['ini_pos_d'][1])

    bbox_x0 = corner_x - rot_bbox['displacement_x']
    bbox_y0 = corner_y - rot_bbox['displacement_y']
    bbox_x1 = bbox_x0 + rot_bbox['width']
    bbox_y1 = bbox_y0 + rot_bbox['height']

    # clamp the box to the fixed image (regions of the rotated image outside the
    # fixed image cannot be registered - the ROI is the intersection)
    fix_crop_left = max(bbox_x0, 0)
    fix_crop_top = max(bbox_y0, 0)
    fix_crop_right = int(fixed_scaled_shape[1]) - min(bbox_x1, int(fixed_scaled_shape[1]))
    fix_crop_bottom = int(fixed_scaled_shape[0]) - min(bbox_y1, int(fixed_scaled_shape[0]))

    if (fix_crop_left >= int(fixed_scaled_shape[1]) - fix_crop_right) or (fix_crop_top >= int(fixed_scaled_shape[0]) - fix_crop_bottom):
        raise ValueError('the placed/rotated moving image does not overlap the fixed image (placement corner ' + str((corner_x, corner_y)) + ', rotation ' + str(rotation_degrees) + ' deg) - check x, y and rotation in the UI')

    print('rotation (degrees, UI/canvas convention) = ' + str(rotation_degrees))
    print('rotated bbox = w' + str(rot_bbox['width']) + ' x h' + str(rot_bbox['height']) + ', displacement from placement corner = ' + str((rot_bbox['displacement_x'], rot_bbox['displacement_y'])))
    print('fix_crop_left = ' + str(fix_crop_left))
    print('fix_crop_top = ' + str(fix_crop_top))

    print('fix_crop_right = ' + str(fix_crop_right))
    print('fix_crop_bottom = ' + str(fix_crop_bottom))

    # if image is (500x, 600y) and has crop of 10px all around, :: working_image[10:490, 10:590]
    # but, note that these are widths of pixel-BANDS (e.g. not areas of definition of fixed image)

    fix_crop_left_plus_margin = fix_crop_left - config['fixed_margin']['right']
    fix_crop_right_plus_margin = fix_crop_right - config['fixed_margin']['left']
    fix_crop_top_plus_margin = fix_crop_top - config['fixed_margin']['top']
    fix_crop_bottom_plus_margin = fix_crop_bottom - config['fixed_margin']['bottom']

    fixed_crop_pos_x = [fix_crop_left, fix_crop_right]
    fixed_crop_pos_y = [fix_crop_top, fix_crop_bottom]
    fixed_crop_pos_x_margin = [fix_crop_left_plus_margin, fix_crop_right_plus_margin]
    fixed_crop_pos_y_margin = [fix_crop_top_plus_margin, fix_crop_bottom_plus_margin]

    print('fixed_crop_pos_x = ' + str(fixed_crop_pos_x))                # fixed_crop_pos_x = [861, 1088] # 211111
    print('fixed_crop_pos_y = ' + str(fixed_crop_pos_y))                # fixed_crop_pos_y = [58, 3527]
    print('fixed_crop_pos_x_margin = ' + str(fixed_crop_pos_x_margin))  # fixed_crop_pos_x_margin = [841, 1068]
    print('fixed_crop_pos_y_margin = ' + str(fixed_crop_pos_y_margin))  # fixed_crop_pos_y_margin = [38, 3507]

    fixed_crop_positions = {
        'fixed_crop_pos_x_margin': fixed_crop_pos_x_margin,
        'fixed_crop_pos_y_margin': fixed_crop_pos_y_margin,
        'fixed_crop_pos_x': fixed_crop_pos_x,
        'fixed_crop_pos_y': fixed_crop_pos_y
    }

    return fixed_crop_positions



# 230123 - no scaling of config['ini_pos_d'] (this is really to take a look at, as I think that no scaling will help.. but lets see!)
def get_initial_locations(config):
    ini_loc = [int(config['best_transform_so_far']['tx']), int(config['best_transform_so_far']['ty'])] # 230123
    print(str(config['name']) + ' - initial loc (ABSOLUTE within full fixed image) = ' + str(ini_loc))
    #ini_loc = starting loc ("SL") found in IMREG-UI (absolute pixels)

    ini_loc_within_fixed_ROI = [ini_loc[0] + config['fixed_crop_pos_x_margin'][0], ini_loc[1] + config['fixed_crop_pos_y_margin'][0]]
    print(str(config['name']) + ' - initial loc (within ROI - offset) =' + str(ini_loc_within_fixed_ROI))

    initial_locations = {
        'ini_loc': ini_loc,
        'ini_loc_within_fixed_ROI': ini_loc_within_fixed_ROI
    }
    return initial_locations


#260923 - the rotation pivot: the position of the moving image's top-left corner
#(its placement point) within the cropped fixed image (ROI). This is the same
#for every search stage (s1..s4 share the same ROI). Note that
#ini_loc_within_fixed_ROI equals -(this pivot) only for search s1 (where the
#placement is the initial translation); for the later stages it holds the
#previous stage's optimised translation parameter, so the pivot is derived from
#the original placement (ini_pos_d) and the ROI origin instead.
def get_rotation_pivot_within_roi(config):
    pivot_x = -int(config['ini_pos_d'][0]) - config['fixed_crop_pos_x_margin'][0]
    pivot_y = -int(config['ini_pos_d'][1]) - config['fixed_crop_pos_y_margin'][0]
    return (pivot_x, pivot_y)



# 230209 - json - (follows new 230123 - fixedImage w/ crop_roi_image_xy_pos__start_end)
def get_crop_fixed_image_with_margin___as_array_from_json(config):
    # old fixed image
    #fixed_image = sitk.ReadImage(config['path_fixed_image'], sitk.sitkFloat64)
    #fixed_array = sitk.GetArrayFromImage(fixed_image)

    # new fixed image 230209
    fixed_array = config['data_fixed_image_array_from_json']['fixed_image_as_array']

    fixed_array_scaled = image_scale(fixed_array, config['scaling_coef_fixed'])
    print('fixedImage original shape = ' + str(fixed_array_scaled.shape))

    #fixed_array_scaled_crop = crop_roi_image_xy_pos__start_end__crop_moving(fixed_array_scaled, config)
    fixed_array_scaled_crop = crop_roi_image_xy_pos__start_end(fixed_array_scaled, config['fixed_crop_pos_x_margin'], config['fixed_crop_pos_y_margin']) #crop_pos_x__start_end, crop_pos_y__start_end

    print('fixedImage cropped shape (ROI)= ' + str(fixed_array_scaled_crop.shape))

    #print fixed image
    cv2.imwrite(config['folder_partial_results'] + '/' + config['filename'] + config['datacube_no'] + '_fixed_crop_cv2.tiff', fixed_array_scaled_crop) #231219
    #cv2.imwrite(config['filename'] + config['datacube_no'] + '_fixed_crop_cv2.tiff', fixed_array_scaled_crop) #config['folder_partial_results'] + '/'
    #cv2.imwrite(config['name'] + config['datacube_no'] + '_fixed_crop_cv2.tiff', fixed_array_scaled_crop)

    fixed_moving_image ={
        'fixed_array': fixed_array_scaled_crop
    }

    return fixed_moving_image


# # new 230123 - fixedImage w/ crop_roi_image_xy_pos__start_end
# # 230209 - superseeded by "get_crop_fixed_image_with_margin___as_array_from_json", as now fixed-image comes from json
# def get_crop_fixed_image_with_margin_as_array_from_path(config):
#     # Fixed image
#     fixed_image = sitk.ReadImage(config['path_fixed_image'], sitk.sitkFloat64)
#     fixed_array = sitk.GetArrayFromImage(fixed_image)
#
#     fixed_array_scaled = image_scale(fixed_array, config['scaling_coef_fixed'])
#     print('fixedImage original shape = ' + str(fixed_array_scaled.shape))
#
#     #fixed_array_scaled_crop = crop_roi_image_xy_pos__start_end__crop_moving(fixed_array_scaled, config)
#     fixed_array_scaled_crop = crop_roi_image_xy_pos__start_end(fixed_array_scaled, config['fixed_crop_pos_x_margin'], config['fixed_crop_pos_y_margin']) #crop_pos_x__start_end, crop_pos_y__start_end
#
#     print('fixedImage cropped shape (ROI)= ' + str(fixed_array_scaled_crop.shape))
#
#     #print fixed image
#     cv2.imwrite(config['filename'] + '_fixed_crop_cv2.tiff', fixed_array_scaled_crop)
#     #cv2.imwrite(config['name'] + config['datacube_no'] + '_fixed_crop_cv2.tiff', fixed_array_scaled_crop)
#     #print(fixed_array_scaled_crop)
#
#     fixed_moving_image ={
#         'fixed_array': fixed_array_scaled_crop
#     }
#
#     return fixed_moving_image


#230209 - for array-images that are dtype float64 (for pixel datatype 9)
def get_crop_fixed_image_from_array(config):
    fixed_sitk = sitk.GetImageFromArray(config['fixed_array'])
    fixed_moving_image_sitk ={
        'fixed_sitk': fixed_sitk
    }
    return fixed_moving_image_sitk


#230209 - for array-images that are dtype float64 (for pixel datatype 9)
def get_crop_moving_image_from_array(config, slice):
    moving_sitk = sitk.GetImageFromArray(config[slice + config['tile']])  # 210507
    crop_moving_image_sitk ={
        'moving_sitk': moving_sitk
    }
    return crop_moving_image_sitk


#230124 - not sure if we need this now? As rotation and scale are just symbolic (they come set, not being read from the config..)
def get_area_intial_search(config):
    # Check datatypes (pixel values need to be the same for both fixed and moving images)
    print('fixed & moving pixel ID values = ' + str(config['fixed_sitk'].GetPixelIDValue()) + ', ' + str(config['moving_sitk'].GetPixelIDValue()))

    # full searchspace (relation between sizes of fixed and moving images)    # image_shape=(height, width)
    height = config['fixed_array'].shape[0] - config['moving_array'].shape[0] #fixed_shape[0] - moving_shape[0]
    width = config['fixed_array'].shape[1] - config['moving_array'].shape[1] #fixed_shape[1] - moving_shape[1]

    x_axis = [0, width, config['spread']]             # [start, end, step]
    y_axis = [0, height, config['spread']]

    rotation = [0, 1, 0.5]                  # [min, max, step]
    scale = [0.995, 1.005, 0.005]

    #this is now a dictionary
    area_intial_search = {
        'x_axis': x_axis,
        'y_axis': y_axis,
        'rotation': rotation,
        'scale': scale
    }

    print('area_intial_search =' + str(area_intial_search))
    #print('current spacesize (height, width) = ' + str(config['spacesize'][3] * 2 + 1) + ', ' + str(config['spacesize'][2] * 2 + 1))
    print('current spacesize (height, width) = ' + str(config['spacesize'][-1] * 2 + 1) + ', ' + str(config['spacesize'][-2] * 2 + 1))
    return area_intial_search


#230124
def register_spacesize(config, slice):
    # 1. Set up registration (choose optimisers, metric mutual information , etc etc)
    R, fixed_params = setup_registration_algorithm_R__4_6_bspline(config) #210803
    sx, sy = int(config['ini_loc_within_fixed_ROI'][0]), int(config['ini_loc_within_fixed_ROI'][1])

    print('translation to initial location for search ' + str(config['name']) + ' (sx, sy) = ' + str(sx) + ', ' + str(sy))

    save_transform_and_image_0(R.GetInitialTransform(), config['fixed_sitk'], config['moving_sitk'], config['filename'] + "_initialAlignment", config)

    element_line = 0

    outTx, my_array, max_mi = run_registration_algorithm_R(R, config, slice, element_line)  # caiman

    R.SetInitialTransform(outTx)        #230124 - do we need this?

    print('MetricEvaluate ("Base" mutual information between fixed_image and slice' + str(slice) + ')= ' + str(R.MetricEvaluate(config['fixed_sitk'], config['moving_sitk'])))     #211228

    print(str(config['filename']) + ': max_mi = ' + str(max_mi))
    print('my_array length (amount of transforms that have been evaluated at slice ' + str(slice) + ')= ' + str(len(my_array)))

    sitk.WriteTransform(outTx, config['folder_partial_results'] + '/' + config['datacube_no'] + "_" + config['filename'] + str(config['spacesize']) + '_FINAL_outputTransformFile.txt') #231219
    #sitk.WriteTransform(outTx, config['datacube_no'] + "_" + config['filename'] + str(config['spacesize']) + '_FINAL_outputTransformFile.txt') #231214 #config['folder_partial_results'] + '/' +

    print('ini_loc moving image within fixed image (x,y) = ' + str(sx) + ',' + str(sy))
    print('ini_loc moving image within fixed image (x,y) ABS = ' + str(sx - config['fixed_crop_pos_x_margin'][0] + config['moving_crop_pos_x'][0]) + ',' + str(sy - config['fixed_crop_pos_y_margin'][0] + config['moving_crop_pos_y'][0]))

    # return outTx, my_array, max_mi, sx, sy
    result = {
        'slice': slice,
        'outTx': 'outTx',  # outTx
        'my_array': my_array,
        'max_mi': max_mi,
        'sx': sx,
        'sy': sy,
        'fixed_parameters': fixed_params
    }
    return result


#230124 - 210803
def setup_registration_algorithm_R__4_6_bspline(config):
    # 1. Set up registration I (set Transformation_params >> size & spread of searchspace, initial loc)
    stepLength_ = 1                     # 1, otherwise we need to divide (SetOptimizerScales) PARAMETERS by stepLength_
    ## how we "spread" heatmap across image (spread_of_search_space across pixel space). 1 is for 1 consecutive unit of heatmap = 1 consecutive pixel in image
    numberOfBins = 50                                       # 25
    samplingPercentage = 0.1                                # 0.05
    interpolator = 'Linear'                                 # interpolator = 'NearestNeighbor'
    initial_loc_mov = [int(config['ini_loc_within_fixed_ROI'][0]), int(config['ini_loc_within_fixed_ROI'][1])]
    print('initial_loc_mov (R)= ' + str(initial_loc_mov))
    print('start of registration')
    R = sitk.ImageRegistrationMethod()
    R.SetMetricAsMattesMutualInformation(numberOfBins)
    R.SetMetricSamplingPercentage(samplingPercentage, seed=1)
    R.SetMetricSamplingStrategy(R.RANDOM)

    #other variants
    #R.SetMetricAsJointHistogramMutualInformation(numberOfBins)
    #R.SetMetricAsCorrelation()
    #R.SetMetricSamplingPercentage(samplingPercentage, sitk.sitkWallClock)
    #R.SetMetricSamplingStrategy(R.REGULAR)
    #R.SetMetricSamplingStrategy(R.NONE) # this is super slow
    #R.SetOptimizerScalesFromPhysicalShift()
    print('\n')

    if len(config['spacesize']) == 4:
        R.SetOptimizerAsExhaustive(config['spacesize'], stepLength_)
        print('similarity2D - rigid transformation - 4 params (scaling, rotation, tr x, tr y)')
        print('current search (units heatmap space) (height, width) = ' + str(config['spacesize'][3] * 2 + 1) + ',' + str(config['spacesize'][2] * 2 + 1))
        print('current spread (image pixel space) (height, width) = ' + str(config['spacesize'][3] * 2 * config['spread'] + 1) + ',' + str(config['spacesize'][2] * 2 * config['spread'] + 1))
        sample_per_axis = 360 * 2  # this gives 0.5 degrees
        R.SetOptimizerScales([0.005, 2.0 * np.pi / sample_per_axis, 1.0 * config['spread'], 1.0 * config['spread']])  # PARAMETERS = (scale, rotation, tx, ty)

    if len(config['spacesize']) == 6:
        R.SetOptimizerAsExhaustive(config['spacesize'], stepLength_)
        print('affine (2D) transformation - 6 params (a11, a12, a21, a22, tr x, tr y)')
        print('current search (units heatmap space) (height, width) = ' + str(config['spacesize'][3+2] * 2 + 1) + ',' + str(config['spacesize'][2+2] * 2 + 1))
        print('current spread (image pixel space) (height, width) = ' + str(config['spacesize'][3+2] * 2 * config['spread'] + 1) + ',' + str(config['spacesize'][2+2] * 2 * config['spread'] + 1))
        R.SetOptimizerScales([0.0005, 0.0005, 0.0005, 0.0005, 1.0 * config['spread'], 1.0 * config['spread']])

    if len(config['spacesize']) == 2:
        #R.SetOptimizerAsAmoeba(config['spacesize'][0], numberOfIterations=config['spacesize'][1]) #R.SetOptimizerAsAmoeba(2.0, numberOfIterations=100)
        #R.SetOptimizerAsLBFGSB(gradientConvergenceTolerance=1e-5,numberOfIterations=100,maximumNumberOfCorrections=5,maximumNumberOfFunctionEvaluations=1000,costFunctionConvergenceFactor=1e+7)
        R.SetOptimizerAsLBFGSB(gradientConvergenceTolerance=1e-4, numberOfIterations=70, maximumNumberOfCorrections=5,
                               maximumNumberOfFunctionEvaluations=10, costFunctionConvergenceFactor=1e+5)
        print('bspline (2D) transformation - 98 params ((no. of grid + 3)*(no. of grid + 3)*2 = (4+3)*(4+3)*2 = 98)')

    initialTx = set_initial_transformation_affine__4_6_bspline(initial_loc_mov, config['spacesize'], config)
    fixed_params = initialTx.GetFixedParameters()
    print('FIXED parameters = ' + str(fixed_params))
    # FIXED parameters = (7.0, 7.0, -128.1875, -130.4375, 127.5625, 129.8125, 1.0, 0.0, 0.0, 1.0) #d02

    # Don't optimize in-place, we would possibly like to run this cell multiple times >> #R.SetInitialTransform(initialTx, inPlace=False)
    R.SetInitialTransform(initialTx, inPlace=True) #True
    #R.SetInitialTransform(initialTx, inPlace=False)  # False = this gives a problem >> tx.FlattenTransform()

    # Setup for the multi-resolution framework.
    #R.SetShrinkFactorsPerLevel(shrinkFactors = [4,2,1])
    #R.SetSmoothingSigmasPerLevel(smoothingSigmas=[0,0,0]) #[2,1,0]
    #R.SmoothingSigmasAreSpecifiedInPhysicalUnitsOn()
    #print("a = " + str(R.SetInitialTransform(sitk.AffineTransform(fixed.GetDimension())) ))
    #print("b = " + str(R.SetInitialTransform(sitk.TranslationTransform(fixed.GetDimension(), offset)) ))
    #print("c = " + str(fixed.GetDimension()))
    #print('Parameters: ' + str(sitk.AffineTransform(fixed.GetDimension()).GetParameters()))
    #print('Parameters: ' + str(sitk.AffineTransform(3).GetParameters())) # this is 3d

    if (interpolator == 'Linear'):
        R.SetInterpolator(sitk.sitkLinear)
        print('interpolator = Linear')
    else:
        R.SetInterpolator(sitk.sitkNearestNeighbor)
        print('interpolator = NearestNeighbor')

    return R, fixed_params


# 230124 - 221116 - add rot at initial transform // also follows propagation of s1 into s2 / s2 into s3 (as with s3 into s4, in v1)
def set_initial_transformation_affine__4_6_bspline(initial_loc_mov, spacesize, config):
    print(str(config['filename']) + ': set_initial_transformation ')
    initialTx = new_composite_transform(2)

    # initialTx = sitk.CenteredTransformInitializer(fixed, moving, sitk.AffineTransform(fixed.GetDimension()), sitk.CenteredTransformInitializerFilter.GEOMETRY)
    # initialTx.SetParameters((-202.5, -409.5))
    # initialTx.Translate((1,1))
    # initialTx.Scale((1,1))
    # rotation_and_tr = sitk.Euler2DTransform()

    if (len(spacesize) == 4) and (config['name'] == 's1'):  # if len(spacesize) == 4:
        rotation_and_tr = sitk.Similarity2DTransform()
        #https://simpleitk.org/SPIE2019_COURSE/01_spatial_transformations.html

        # 260923 - the rotation pivot is the moving image's top-left corner (the
        # same pivot as the UI preview). Its position within the fixed-image ROI
        # is (-initial_loc_mov), because ini_loc_within_fixed_ROI == -(pivot in
        # ROI). Anchoring the transform at the pivot keeps the corner pinned for
        # ANY angle/scale the optimiser explores, so the rotated image stays
        # placed as in the UI inside the bounding-box ROI. (Previously the center
        # stayed at the default (0,0), which rotated the image about the ROI
        # origin once the ROI was larger than the unrotated footprint.)
        if ((config['ini_rot_moving_img']['centre_of_rot']) != 'top_left_corner'):
            raise NotImplementedError("centre_of_rot = '" + str(config['ini_rot_moving_img']['centre_of_rot']) + "' is not supported - only 'top_left_corner' is implemented")

        rotation_and_tr.SetAngle(config['ini_rot_moving_img']['rot']) #rotation_and_tr.SetAngle(1/57*1.5)
        print('set_initial_transformation: initial_rotation = ' + str(config['ini_rot_moving_img']['rot']))

        rotation_and_tr.SetCenter(get_rotation_pivot_within_roi(config))
        rotation_and_tr.SetTranslation((initial_loc_mov[0], initial_loc_mov[1]))
        print('set_initial_transformation: initial_loc_mov = ' + str(initial_loc_mov[0]) +', '+ str(initial_loc_mov[1]))
        print('set_initial_transformation: rotation pivot (within ROI) = ' + str(get_rotation_pivot_within_roi(config)))
        # initialTx.AddTransform(sitk.TranslationTransform(2, (-200, -100)))
        # initialTx.AddTransform(sitk.ScaleTransform(2, (0.5, 1)))
        initialTx.AddTransform(rotation_and_tr)

    if (len(spacesize) == 4) and (config['name'] == 's2'):
        similarity2D_tr = sitk.Similarity2DTransform()
        # best_tr_s1__array_of_values
        best_tr_s1_av = list(config['best_transform_so_far'].values())
        # 260923 - pivot-anchored: the pivot (the moving image's top-left corner
        # within the ROI) is the same for every stage, and the translation is the
        # s1 optimiser's translation parameter, so this initial transform
        # reproduces the s1 best transform exactly
        similarity2D_tr.SetCenter(get_rotation_pivot_within_roi(config))
        similarity2D_tr.SetScale(best_tr_s1_av[0])
        similarity2D_tr.SetAngle(best_tr_s1_av[1])
        similarity2D_tr.SetTranslation((initial_loc_mov[0], initial_loc_mov[1]))
        print('similarity2D_tr (best_tr_s1)= ' + str(similarity2D_tr))

        # ADD TRANSFORMATIONS - best_search1 for search2
        initialTx.AddTransform(similarity2D_tr)

    if len(spacesize) == 6:
        similarity2D_tr = sitk.Similarity2DTransform()
        # best_tr_s2__array_of_values
        best_tr_s2_av = list(config['best_transform_so_far'].values())
        # 260923 - pivot-anchored (the pivot is stage-independent, see
        # get_rotation_pivot_within_roi); with the s2 translation parameter this
        # reproduces the s2 best transform exactly
        similarity2D_tr.SetCenter(get_rotation_pivot_within_roi(config))
        similarity2D_tr.SetScale(best_tr_s2_av[0])
        similarity2D_tr.SetAngle(best_tr_s2_av[1])
        similarity2D_tr.SetTranslation((initial_loc_mov[0], initial_loc_mov[1]))

        transform_for_shear = sitk.AffineTransform(2)
        # 211209 - here is taking the values from s2 as a matrix to initialize s3 (matrix is only a11,a12,a21,a22 =>needs translation on top)
        transform_for_shear.SetMatrix(similarity2D_tr.GetMatrix())
        # 260923 - anchor the pivot: T(p) = P + M.(p - P) + t, i.e. the s2 best
        # transform (matrix M from s2, translation parameter t = initial_loc_mov)
        transform_for_shear.SetCenter(get_rotation_pivot_within_roi(config))
        # 211209 - add translation, as this not appears in matrix = a11,a12,a21,a22
        transform_for_shear.SetTranslation((initial_loc_mov[0], initial_loc_mov[1]))
        initialTx.AddTransform(transform_for_shear)

    if len(spacesize) == 2:
        # FIXED IMAGE AS REF
        fixed = config['fixed_sitk']
        transformDomainMeshSize = [4] * config['moving_sitk'].GetDimension()
        transform_for_bspline = sitk.BSplineTransformInitializer(fixed, transformDomainMeshSize)
        # transform_for_bspline = sitk.BSplineTransform(fixed, transformDomainMeshSize)
        affine_tr = sitk.AffineTransform(2)

        # best_tr_s3__array_of_values
        best_tr_s3_av = list(config['best_transform_so_far'].values())
        affine_tr.SetParameters((best_tr_s3_av[0], best_tr_s3_av[1], best_tr_s3_av[2], best_tr_s3_av[3],
                                 0.0, 0.0))
        # 260923 - anchor the pivot: T(p) = P + M.(p - P) + t, i.e. the s3 best
        # transform (matrix M from s3, translation parameter t = initial_loc_mov)
        affine_tr.SetCenter(get_rotation_pivot_within_roi(config))
        affine_tr.SetTranslation((initial_loc_mov[0], initial_loc_mov[1]))

        # ADD TRANSFORMATIONS - best_search3 + Initialiser (bspline) for search4
        initialTx.AddTransform(affine_tr)
        initialTx.AddTransform(transform_for_bspline)

        print(str(config['filename']) + '- initialTx: bspline with affine = ' + str(initialTx))

    # print(initialTx)
    print(str(config['filename']) + ' - initialTx: number of parameters = ' + str(initialTx.GetNumberOfParameters()))
    print(str(config['filename']) + ' - initialTx: parameters = ' + str(str(initialTx.GetParameters())))   #initial parameters = (1.0, 0.0, -27.0, -33.0)

    return initialTx


#230124 - 210803
def run_registration_algorithm_R(R, config, slice, element_line):
    my_array = []
    R.AddCommand(sitk.sitkIterationEvent, lambda: command_iteration__4_6_bspline(R, my_array, slice, element_line, config['spacesize'])) #210803
    R.AddCommand(sitk.sitkMultiResolutionIterationEvent, lambda: command_multiresolution_iteration(R))

    print('againAgain- moving pixel ID value = ' + str(config['moving_sitk'].GetPixelIDValue()))     #again- moving pixel ID value = 1
    print('againAgain- fixed pixel ID value = ' + str(config['fixed_sitk'].GetPixelIDValue()))       #again- fixed pixel ID value = 9

    outTx = R.Execute(config['fixed_sitk'], config['moving_sitk']) #muted 230208 #on again 230209

    max_mi = R.GetMetricValue()
    print('max mi [' + str(config['filename']) + '] = ' + str(max_mi))
    return outTx, my_array, max_mi


#230124 - 210803
def command_iteration__4_6_bspline(method, my_array, slice, element_line, spacesize):
    global offset
    global mi_values    # this goes if declaring an array // mi_values = np.empty((spacesize[0]*2 + 1, spacesize[1]*2 + 1))
    global transforms
    global transforms_and_mi
    """
    if (method.GetOptimizerIteration() == 0):
        print("Estimated Scales: ", method.GetOptimizerScales())
    print("{0:3} = {1:7.5f} : {2}".format(method.GetOptimizerIteration(),
                                          method.GetMetricValue(),
                                          method.GetOptimizerPosition()))
    """
    if len(spacesize) == 4:
        my_array.append([
            method.GetCurrentLevel(),                           #[0] at my_array
            method.GetOptimizerIteration(),                     #[1] at my_array
            method.GetMetricValue(),                            #[2] at my_array (metric = mutual information)
            method.GetOptimizerPosition()[0], #scale factor     #[3] at my_array
            method.GetOptimizerPosition()[1], #angle rotation   #[4] at my_array
            method.GetOptimizerPosition()[2], #x                #[5] at my_array
            method.GetOptimizerPosition()[3], #y                #[6] at my_array
            slice,
            element_line
        ])

    if len(spacesize) == 6:
        my_array.append([
            method.GetCurrentLevel(),                           #[0] at my_array
            method.GetOptimizerIteration(),                     #[1] at my_array
            method.GetMetricValue(),                            #[2] at my_array (metric = mutual information)
            method.GetOptimizerPosition()[0], #a11              #[3] at my_array
            method.GetOptimizerPosition()[1], #a12                #[4] at my_array
            method.GetOptimizerPosition()[2], #a21                #[5] at my_array
            method.GetOptimizerPosition()[3], #a22                #[6] at my_array
            method.GetOptimizerPosition()[4],  # x                #[7] at my_array
            method.GetOptimizerPosition()[5],  # y                #[8] at my_array
            slice,
            element_line
        ])

    if len(spacesize) == 2:
        my_array.append([
            method.GetCurrentLevel(),  # [0] at my_array
            method.GetOptimizerIteration(),  # [1] at my_array
            method.GetMetricValue(),  # [2] at my_array (metric = mutual information)
            *method.GetOptimizerPosition(), #method.GetOptimizerPosition(),
            slice,
            element_line
        ])
        #print(my_array)


#230124
def command_multiresolution_iteration(method):
    print("\tStop Condition: {0}".format(method.GetOptimizerStopConditionDescription()))
    print("============= Resolution Change =============")


#230124 - 210429
def get_array_all_transforms(config):
    # tx & ty (ABSOLUTE VALUES for main_array)
    for transform in config['result']['my_array']:
        if len(config['spacesize']) == 4:
            transform[5] = transform[5] - config['fixed_crop_pos_x_margin'][0] + config['moving_crop_pos_x'][0]
            transform[6] = transform[6] - config['fixed_crop_pos_y_margin'][0] + config['moving_crop_pos_y'][0]
            #transform[5] = transform[5] - config['fixed_crop_pos_x'][0] + config['moving_crop_pos_x'][0]
            #transform[6] = transform[6] - config['fixed_crop_pos_y'][0] + config['moving_crop_pos_y'][0]
        if len(config['spacesize']) == 6:
            transform[5 + 2] = transform[5 + 2] - config['fixed_crop_pos_x_margin'][0] + config['moving_crop_pos_x'][0]
            transform[6 + 2] = transform[6 + 2] - config['fixed_crop_pos_y_margin'][0] + config['moving_crop_pos_y'][0]
            #transform[5 + 2] = transform[5 + 2] - config['fixed_crop_pos_x'][0] + config['moving_crop_pos_x'][0]
            #transform[6 + 2] = transform[6 + 2] - config['fixed_crop_pos_y'][0] + config['moving_crop_pos_y'][0]

    return config['result']['my_array']


#230124 - 210421
def write_array_all_transforms(config):
    #with open(config['filename'] + str(config['spacesize']) + '_FINAL_my_array.txt', 'w') as f:
    with open(config['folder_partial_results'] + '/' + config['filename'] + str(config['spacesize']) + '_FINAL_my_array.txt', 'w') as f: #231219
        for item in config['result']['my_array']:
            f.write("%s\n" % item)



#230124 - 210421
def get_transform_highest_mi(config):
    # 200923 sort the array - purpose: get the data of highest mi
    keyFunc_mi = lambda x: (x[2])
    sortedArray_mi = sorted(config['result']['my_array'], key=keyFunc_mi)
    print(str(config['filename']) + ': highest mi data (my_array) = ' + str(sortedArray_mi[0]))  # caiman 210311
    return sortedArray_mi[0]


#230124 - 210825
def sort_array_of_all_transforms(array_of_array_all_transforms):
    array_all_transforms_flat_ = [tr for list_of_tr in array_of_array_all_transforms for tr in list_of_tr]
    print('length array_all_transforms_flat_ = ' + str(len(array_all_transforms_flat_)))
    keyFunc_mi = lambda x: (x[2])
    sortedArray_all_transforms = sorted(array_all_transforms_flat_, key=keyFunc_mi)  # list of 19x225 transforms (225 x 19 slices)
    return sortedArray_all_transforms


#230127 - 210825
def get_top_best_transforms(df_all_transforms, no_of_best_tranforms_to_evaluate, filename, config): #updated 230127
    df_all_transforms = df_all_transforms[:no_of_best_tranforms_to_evaluate]
    df_all_transforms.to_excel(config['folder_partial_results'] + '/' + filename +'_export_dataframe_' + '_all_transforms__' + str(no_of_best_tranforms_to_evaluate) + '_Best' + '.xlsx', index=False, header=True) #231214 #
    #df_all_transforms.to_excel(filename +'_export_dataframe_' + '_all_transforms__' + str(no_of_best_tranforms_to_evaluate) + '_Best' + '.xlsx', index=False, header=True) #231214 #config['folder_partial_results'] + '/'
    #    df_all_transforms.to_excel(r'export_dataframe_' + filename + '_all_transforms__' + str(no_of_best_tranforms_to_evaluate) + '_Best' + '.xlsx', index=False, header=True)
    df_all_transforms.drop(['Level', 'Iteration'], axis=1)
    return df_all_transforms



#231219
def evaluate_top_best_transforms__rigid_and_affine(df_all_transforms, config_fixed_image_as_array, config): #, config
    transforms = df_all_transforms.to_numpy()
    print('spacesize length= ' + str(len(config_fixed_image_as_array['spacesize'])))

    paths = glob.glob(config['folder_partial_results'] + '/' + config_fixed_image_as_array['name'] + '*FINAL_my_array.txt') #231219
    print('datacube_no (glob) = ' + str(config['datacube_no']))
    print('length paths (glob) = ' + str(len(paths)))
    print('paths (glob) = ' + str((paths)))
    print('name (glob)  = ' + str(config_fixed_image_as_array['name']))

    mi_average_list = list(get_list_of_mi_values_average_from_input_transform(paths, transforms, config_fixed_image_as_array))
    #print('length mi_average_list = ' + '\n' + str(len(mi_average_list)))      #muted231213
    return mi_average_list



#230127 - 210426 = needs checking the choice of config['fixed_crop_pos_x'] and the other values
def get_list_of_mi_values_average_from_input_transform(paths, transforms, config):
    for transform in transforms:
        if len(config['spacesize']) == 4:
            #mi_average = calculate_mi_values_average_from_input_transform(paths, transform, config['fixed_crop_pos_x'], config['fixed_crop_pos_y'], config['moving_crop_pos_x'], config['moving_crop_pos_y']) #muted 230127
            mi_average = calculate_mi_values_average_from_input_transform(paths, transform) #updated 230127
            transf_with_mi_average = {
                'scale': transform[0], #'rot'
                'rot': transform[1], #'scale'
                'tx': transform[2],
                'ty': transform[3],
                'mi_average': mi_average
                }
            #yield transf_with_mi_average
        if len(config['spacesize']) == 6:
            #mi_average = calculate_mi_values_average_from_input_transform_affine(paths, transform, config['fixed_crop_pos_x'], config['fixed_crop_pos_y'], config['moving_crop_pos_x'], config['moving_crop_pos_y']) #muted 230127
            mi_average = calculate_mi_values_average_from_input_transform_affine(paths, transform) #updated 230127
            transf_with_mi_average = {
                'a11': transform[0],
                'a12': transform[1],
                'a21': transform[2],
                'a22': transform[3],
                'tx': transform[4],
                'ty': transform[5],
                'mi_average': mi_average
                }
            #yield transf_with_mi_average
        yield transf_with_mi_average


#230127
def calculate_mi_values_average_from_input_transform(paths, transform):
    mi_values = list(get_mi_values_from_input_transform(get_all_slices(paths), transform))
    return float(sum(mi_values)/len(mi_values))


#230127
def get_all_slices(paths):
    for file in paths:
        yield from parse_file(file)


#230127
def parse_file(path):
    with open(path) as file:
        file_content = file.read().strip()
        return [parse_line(line) for line in file_content.split('\n')] #this is an array of arrays


#230127
def parse_line(str):
    arr = str.replace('[', '')\
              .replace(']', '')\
              .replace('(', '')\
              .replace(')', '')\
              .replace("'", '') \
              .replace('_', ' ') \
              .replace(' ', '') \
              .split(',')
    #print(arr) #muted231213 Gaetano
    return [float(x) for x in arr]


#230127
def get_mi_values_from_input_transform(array_data_of_slice, transform): #(array_data_of_slice, transform, fixed_crop_pos_x, fixed_crop_pos_y, moving_crop_pos_x, moving_crop_pos_y): #updated 230127
    #transform [rot, scale, tx, ty]
    rot = transform[0]
    scale = transform[1]
    tx = transform[2] # tx = transform[2] + fixed_crop_pos_x[0] - moving_crop_pos_x[0] #210426 so that avMI can be calculated from FINAL_my_array
    ty = transform[3] # ty = transform[3] + fixed_crop_pos_y[0] - moving_crop_pos_y[0]
    #print(rot,scale, tx, ty )
    filtered = filter(lambda x: x[-6] == rot and x[-5] == scale and x[-4] == tx and x[-3] == ty, array_data_of_slice)  # -0.114750 XXXXXXXXXXX
    return map(lambda x: x[2], filtered)


#230127
def calculate_mi_values_average_from_input_transform_affine(paths, transform): #(paths, transform, fixed_crop_pos_x, fixed_crop_pos_y, moving_crop_pos_x, moving_crop_pos_y):
    #mi_values = list(get_mi_values_from_input_transform_affine(get_all_slices(paths), transform, fixed_crop_pos_x, fixed_crop_pos_y, moving_crop_pos_x, moving_crop_pos_y))
    mi_values = list(get_mi_values_from_input_transform_affine(get_all_slices(paths), transform)) #updated 230127
    #print('mi_values = ' + str(mi_values))
    return float(sum(mi_values)/len(mi_values))


#230127
def get_mi_values_from_input_transform_affine(array_data_of_slice, transform): #(array_data_of_slice, transform, fixed_crop_pos_x, fixed_crop_pos_y, moving_crop_pos_x, moving_crop_pos_y): #updated 230127
    #transform [a11, a12, a21, a22, tx, ty]
    a11 = transform[0]
    a12 = transform[1]
    a21 = transform[2]
    a22 = transform[3]
    tx = transform[4]   #tx = transform[4] + fixed_crop_pos_x[0] - moving_crop_pos_x[0] # so that avMI can be calculated from FINAL_my_array
    ty = transform[5]   #ty = transform[5] + fixed_crop_pos_y[0] - moving_crop_pos_y[0]
    #print(a11, a12, a21, a22, tx, ty)
    filtered = filter(lambda x: x[-8] == a11 and x[-7] == a12 and x[-6] == a21 and x[-5] == a22 and x[-4] == tx and x[-3] == ty, array_data_of_slice)
    return map(lambda x: x[2], filtered)



# 230127
def evaluate_top_best_transforms__bspline(df_all_transforms, config_fixed_image_as_array): #Here we reduce selection to 10 best transforms (no_of_best_tranforms_to_evaluate = 10)
    print('spacesize length= ' + str(len(config_fixed_image_as_array['spacesize'])))

    # make list of best transforms (each tr has 98 params)
    array_all_transforms_df = df_all_transforms[[*create_names(amount=98)]].to_numpy()
    no_of_best_tranforms_to_evaluate = 10
    params = array_all_transforms_df[:no_of_best_tranforms_to_evaluate]

    average_metric_for_each_param = list(
        map(lambda param: get_average_metric_for_bspline_transform(config_fixed_image_as_array, param), params))

    # add column with mi_average values
    params_with_metric_average = np.c_[params, average_metric_for_each_param]

    keys = [*create_names(amount=98), 'mi_average']

    # add row (keys)
    params_with_metric_average_and_keys = np.r_[[keys], params_with_metric_average]

    mi_average_list = []
    for i in range(0, len(params_with_metric_average_and_keys) - 1):
        params_with_metric_average_and_keys__dict = dict(
            zip(params_with_metric_average_and_keys[0], params_with_metric_average_and_keys[i + 1].astype('f')))

        mi_average_list.append(params_with_metric_average_and_keys__dict)

    print('mi_average_list = ')
    #print(mi_average_list)  # this is an array of dictionaries         #muted231214

    return mi_average_list


#230127 - 210803 - amount = 98
def create_names(amount):
    for i in range(amount):
            yield 'tr_' + str(i)



#230127 - 230117 - this has a tiny change that might be quite beneficial - - changes '0_0' for config[slice]
def get_average_metric_for_bspline_transform(config, param): #config = config_fixed_image_as_array
    print('set of params:' + str(param))

    #print('config_fixed_image_as_array (now) = ' + str(config))                #muted231214

    moving_images_as_array = [[config['datacube_eq'][slice]] for slice in config['slices']][0]  #note this [0] is to have one array of arrays, instead of one array of one array of arrays ^~^
    #print('moving_images_as_array now = ' + str(moving_images_as_array))       #muted231214

    moving_images_scaled = list(map(lambda moving_image_as_array: image_scale(moving_image_as_array, config['scaling_coef']), moving_images_as_array))
    moving_images_sitk = list(map(lambda moving_image_scaled: sitk.GetImageFromArray(moving_image_scaled), moving_images_scaled))

    # 210902 - FIXED IMAGE for registration using "shortlisted transforms" (bspline obtained from params)
    print('shape of fixed_image = ' + str(config['fixed_array'].shape))
    fixed = sitk.GetImageFromArray(config['fixed_array'])

    # set composite Tr
    initialTx = new_composite_transform(2)

    # initialise Tr with affine = best_tr_s3 (config['best_transform_so_far'])
    affine_tr = sitk.AffineTransform(2)
    iniloc = config['ini_loc_within_fixed_ROI']
    best_tr_s3_av = list(config['best_transform_so_far'].values())     # best_tr_s3__array_of_values
    affine_tr.SetParameters((best_tr_s3_av[0], best_tr_s3_av[1], best_tr_s3_av[2], best_tr_s3_av[3], 0.0, 0.0))
    # 260923 - anchor the pivot: T(p) = P + M.(p - P) + t reproducing the s4
    # initial composite (affine anchored at the pivot; the translation is the s3
    # translation parameter recorded in iniloc)
    affine_tr.SetCenter(get_rotation_pivot_within_roi(config))
    affine_tr.SetTranslation((iniloc[0], iniloc[1]))
    initialTx.AddTransform(affine_tr)

    # re-initialise Tr with bspline with fixed params (from transform-mesh-domain) and params from best_tr_s4
    tx = sitk.BSplineTransform(2)
    tx.SetFixedParameters(config['fixed_parameters'])  # config['fixed_parameters'] = (7.0, 7.0, -29.1875, -130.9375, 28.5625, 130.3125, 1.0, 0.0, 0.0, 1.0) # d13 210817
    print('SetFixedParameters (from config), (from transform-mesh-domain)= ' + str(config['fixed_parameters']))
    tx.SetParameters(param)
    print('length of param (from best_tr_s4)= ' + str(len(param)))
    initialTx.AddTransform(tx)

    # initialise R to obtain metric for this transform (initialTx)
    R = sitk.ImageRegistrationMethod()
    R.SetMetricAsMattesMutualInformation()
    #R.SetOptimizerAsLBFGSB(gradientConvergenceTolerance=1e-5,
    #                       numberOfIterations=1,  # set to 1 for evaluating only 1 transform / normal search = 70-100
    #                       maximumNumberOfCorrections=1,  # 5,
    #                       maximumNumberOfFunctionEvaluations=0,  # 1000,
    #                       costFunctionConvergenceFactor=1e+7)

    R.SetOptimizerAsExhaustive(numberOfSteps=[0 for x in range(0, 98)])         #(numberOfSteps=[0,0,..,0]) #211216
    R.SetInitialTransform(initialTx, True)
    R.SetInterpolator(sitk.sitkLinear)
    R.AddCommand(sitk.sitkIterationEvent, lambda: command_iteration(R))

    mi_values = []

    for counter, moving_image in enumerate(moving_images_sitk):
        outTx = R.Execute(fixed, moving_image)

        print("-------")
        #print(outTx) #muted 210816
        print("Optimizer stop condition: {0}".format(R.GetOptimizerStopConditionDescription()))
        print(" Iteration: {0}".format(R.GetOptimizerIteration()))
        mi_value = R.GetMetricValue()
        print(" Metric value: {0}".format(mi_value))
        sitk.WriteTransform(outTx, config['folder_partial_results'] + '/' + config['datacube_no'] + "_" + '_FINAL_outputTransformFile_' + str(counter) + '.txt') #231219
        #sitk.WriteTransform(outTx, config['datacube_no'] + "_" + '_FINAL_outputTransformFile_' + str(counter) + '.txt') #231214 #config['folder_partial_results'] + '/' +
        mi_values.append(mi_value)

    print('mi_values__list = ' + str(mi_values))
    mi_values__average = np.sum(mi_values) / len(mi_values)
    print('mi_values__average = ' + str(mi_values__average))

    return mi_values__average     #this is the average for each param


#230203 - 210811
def command_iteration(method) :
    print("{0:3} = {1:10.5f}".format(method.GetOptimizerIteration(),
                                     method.GetMetricValue()))


#210813 / #221206 - now this version takes the moving images from the "end" part of config (scaling + cropped, for being registered for creating final "transformed" moving images)
def get_registered_images_from_array__2_transforms_bspline_by_slice(slice, config, best_tr_s3, best_tr_s4, ideal_final_tr):
    print('check this = ' + str(slice) + config['tile']) #221205
    #moving_image = sitk.GetImageFromArray(config['datacube_eq'][str(slice)])  # 221205 - original moving image as per path
    moving_image = sitk.GetImageFromArray(config[str(slice) + config['tile']])  # 230130 - this image will be scaled and cropped as per settings

    rotation_pivot = get_rotation_pivot_within_roi(config) #260923 - pivot for the recorded translation parameters

    if len(config['spacesize']) == 4:
        params_transform = [best_tr_s3['scale'], best_tr_s3['rot'], int(best_tr_s3['tx'] + config['fixed_crop_pos_x_margin'][0]), int(best_tr_s3['ty'] + config['fixed_crop_pos_y_margin'][0])]
        print('params_transform = ' + str(params_transform))
        finalTx = get_transform_from_parameters(params_transform, rotation_pivot)

    if len(config['spacesize']) == 6:
        params_transform = [best_tr_s3['a11'], best_tr_s3['a12'], best_tr_s3['a21'], best_tr_s3['a22'], int(best_tr_s3['tx'] + config['fixed_crop_pos_x_margin'][0]), int(best_tr_s3['ty'] + config['fixed_crop_pos_y_margin'][0])]
        print('params_transform = ' + str(params_transform))
        finalTx = get_transform_from_parameters_affine(params_transform, rotation_pivot)

        params_transform_ift = [ideal_final_tr['a11'], ideal_final_tr['a12'], ideal_final_tr['a21'], ideal_final_tr['a22'], int(ideal_final_tr['tx'] + config['fixed_crop_pos_x_margin'][0]), int(ideal_final_tr['ty'] + config['fixed_crop_pos_y_margin'][0])]
        print('params_transform (ideal best tr) = ' + str(params_transform_ift))
        finalTx_ift = get_transform_from_parameters_affine(params_transform_ift, rotation_pivot)

    if len(config['spacesize']) == 2:
        params_transform = best_tr_s4
        print('params_transform = ' + str(params_transform))
        finalTx = get_transform_from_parameters_bspline(params_transform, best_tr_s3, config) # config['ini_loc_within_fixed_ROI'] = [-26, -25]

        params_transform_ift = [ideal_final_tr['a11'], ideal_final_tr['a12'], ideal_final_tr['a21'], ideal_final_tr['a22'], int(ideal_final_tr['tx'] + config['fixed_crop_pos_x_margin'][0]), int(ideal_final_tr['ty'] + config['fixed_crop_pos_y_margin'][0])]
        print('params_transform (ideal best tr) = ' + str(params_transform_ift))
        finalTx_ift = get_transform_from_parameters_affine(params_transform_ift)

    fixed_image = get_crop_fixed_image_from_array(config)
    save_transform_and_image_0(finalTx, fixed_image['fixed_sitk'], moving_image, str(config['datacube_no']) + "_finalAlignment_" + str(slice), config)

#230130 - updated 260923: pivot-anchored (the recorded translation parameter is
#relative to the pivot centre, so the pivot must be anchored here too)
def get_transform_from_parameters(params_transform, pivot=(0.0, 0.0)):
    # finalTx_ is an empty "addition friendly" transform, we need to pass params to it. We pass these params by adding scale_rotation_and_tr to this empty transform
    finalTx_ = new_composite_transform(2)

    scale_rotation_and_tr = sitk.Similarity2DTransform()
    # 260923 - pivot-anchored: T(p) = P + scale.rotation.(p - P) + translation
    scale_rotation_and_tr.SetCenter(pivot)
    scale_rotation_and_tr.SetTranslation((params_transform[-2], params_transform[-1]))        #close to expected tranform d11 >> (-401, -609)
    scale_rotation_and_tr.SetScale((params_transform[-4]))                                ## initialTx.AddTransform(sitk.ScaleTransform(2, (0.5, 1)))
    scale_rotation_and_tr.SetAngle(params_transform[-3])

    finalTx_.AddTransform(scale_rotation_and_tr)

    return finalTx_


#230130 - updated 260923: pivot-anchored (the recorded translation parameter is
#relative to the pivot centre, so the pivot must be anchored here too)
def get_transform_from_parameters_affine(params_transform, pivot=(0.0, 0.0)):
    # finalTx_ is an empty "addition friendly" transform, we need to pass params to it.
    finalTx_ = new_composite_transform(2)

    scale_rotation_and_tr_and_shear = sitk.AffineTransform(2)
    # 260923 - pivot-anchored: T(p) = P + M.(p - P) + translation
    scale_rotation_and_tr_and_shear.SetParameters((params_transform[0], params_transform[1], params_transform[2], params_transform[3], 0.0, 0.0))
    scale_rotation_and_tr_and_shear.SetCenter(pivot)
    scale_rotation_and_tr_and_shear.SetTranslation((params_transform[4], params_transform[5]))

    finalTx_.AddTransform(scale_rotation_and_tr_and_shear)

    return finalTx_


# 210803
def get_transform_from_parameters_bspline(best_tr_s4, best_tr_s3, config):
    # finalTx_ is an empty "addition friendly" transform, we need to pass params to it. We pass these params by adding scale_rotation_and_tr to this empty transform

    iniloc = config['ini_loc_within_fixed_ROI']
    finalTx_ = new_composite_transform(2)

    affine_tr = sitk.AffineTransform(2)

    best_tr_s3_av = list(best_tr_s3.values())
    affine_tr.SetParameters((best_tr_s3_av[0], best_tr_s3_av[1], best_tr_s3_av[2], best_tr_s3_av[3], 0.0, 0.0))
    # 260923 - anchor the pivot: T(p) = P + M.(p - P) + t reproducing the s4
    # optimised composite (affine anchored at the pivot; the translation is the
    # s3 translation parameter recorded in iniloc)
    affine_tr.SetCenter(get_rotation_pivot_within_roi(config))
    affine_tr.SetTranslation((iniloc[0], iniloc[1])) #see iniloc is used instead of (best_tr_s3_av[4], best_tr_s3_av[5])

    finalTx_.AddTransform(affine_tr)

    bspline = sitk.BSplineTransform(2)

    bspline.SetFixedParameters(config['fixed_parameters'])  # 210818

    best_tr_s4__array_of_values = list(best_tr_s4.values())
    params_transform = np.asarray(best_tr_s4__array_of_values[0:-1], dtype=float)  # here we remove mi_average

    bspline.SetParameters(params_transform)
    finalTx_.AddTransform(bspline)

    return finalTx_


#241223 - renaming of output images
#230830 - already up there
#2211 (Nov2022)
# registration of 1 fixed image and 1 moving image (with its corresponding transform)
def save_transform_and_image_0(transform, fixed_image, moving_image, outputfile_prefix, config):
    print(transform, fixed_image, moving_image, outputfile_prefix)
    """
    Write the given transformation to file, resample the moving_image onto the fixed_images grid and save the
    result to file.

    Args:
        transform (SimpleITK Transform): transform that maps points from the fixed image coordinate system to the moving.
        fixed_image (SimpleITK Image): resample onto the spatial grid defined by this image.
        moving_image (SimpleITK Image): resample this image.
        outputfile_prefix (string): transform is written to outputfile_prefix.tfm and resampled image is written to
                                    outputfile_prefix.mha.
    """
    resample = sitk.ResampleImageFilter()
    resample.SetReferenceImage(fixed_image)

    # SimpleITK supports several interpolation options, we go with the simplest that gives reasonable results.
    resample.SetInterpolator(sitk.sitkLinear)

    resample.SetTransform(transform)
    out = resample.Execute(moving_image)

    simg1 = sitk.Cast(sitk.RescaleIntensity(fixed_image), sitk.sitkUInt8)       #simg1 = sitk.Cast(fixed_image, sitk.sitkUInt8)
    simg2 = sitk.Cast(sitk.RescaleIntensity(out), sitk.sitkUInt8)               #simg2 = sitk.Cast(out, sitk.sitkUInt8)

    #print('amanda = image_finalAlignment from ' + str(transform)) #muted 231214

    simg2_as_array = list(map(lambda row: list(map(lambda cell: min(cell, 255), row)), sitk.GetArrayFromImage(simg2)))
    simg2 = sitk.GetImageFromArray(simg2_as_array)

    #check type of pixel
    print('moving image - pixel ID value = ' + str(simg2.GetPixelIDValue()))    # moving image - pixel ID value = 1
    print('fixed image - pixel ID value = ' + str(simg1.GetPixelIDValue()))     # fixed image - pixel ID value = 1

    cv2.imwrite(config['folder_partial_results'] + '/' + str(outputfile_prefix) + 'rawdata_opencv2_fromArray' + '.tiff', sitk.GetArrayFromImage(simg2))

    transf_img_inverted = sitk.Compose(255 - (simg2 // 1.))           # INVERTED (greyscale) >> sitk.Compose(255 - (simg2 // 2.))              #typically = cimg1_inv
    transf_img = sitk.Compose(simg2 // 1.)                              # NORMAL                                                               #typically = cimg1_nor
    transf_img_overlayed_fixedImage = sitk.Compose(simg1 // 2. + simg2 // 2.)         # NORMAL monochrome (Background = Fixed image)           #typically = cimg2

    writer = sitk.ImageFileWriter()
    # writer.SetFileName(config['folder_partial_results'] + '/' + str(outputfile_prefix) + '_cimg1_invert' + '_output.tiff') #231219
    # writer.Execute(cimg1_inv)
    writer.SetFileName(config['folder_partial_results'] + '/' + str(outputfile_prefix) + '_transformed_image_INVERTED.tiff')                    #typically = cimg1_inv #241223
    writer.Execute(transf_img_inverted)

    # writer.SetFileName(config['folder_partial_results'] + '/' + str(outputfile_prefix) + '_cimg1_normal' + '_output.tiff') #231219
    # writer.Execute(cimg1_nor)
    writer.SetFileName(config['folder_partial_results'] + '/' + str(outputfile_prefix) + '_transformed_image.tiff')                              #typically = _cimg1_normal #241223
    writer.Execute(transf_img)


    # writer.SetFileName(config['folder_partial_results'] + '/' + str(outputfile_prefix) + '_cimg2_normal_back' + '_output.tiff') #231219
    # writer.Execute(cimg2)
    writer.SetFileName(config['folder_partial_results'] + '/' + str(outputfile_prefix) + '_transformed_image' + '_overlayed_on_fixedImage.tiff')   #typically = cimg2      #241219
    writer.Execute(transf_img_overlayed_fixedImage)                                                                                                #typically = cimg2


#241223 - importing these from C:\Users\eugen\PycharmProjects\ImageRegistration_results\applyTransforms_bspline_6dc_v6_from_json_alphachannel_many_slices_cmd
# these are used by C:\Users\eugen\PycharmProjects\ImageRegistration_results\applyTransforms_bspline_6dc_v6_from_json_alphachannel_many_slices_cmd\apply_transform_to_image_from_json_alpha.py
# for REGUI - applying transforms to other images (than those of datacube registered)

#241205
def get_image_as_array_from_path_v0(path):
    # Fixed image
    image_sitk = sitk.ReadImage(path, sitk.sitkFloat64)
    image_as_array = sitk.GetArrayFromImage(image_sitk)
    #image_as_array_scaled = image_scale(image_as_array, scaling_coef)
    print('shape image_as_array = ' + str(image_as_array.shape))
    #image_sitk_scaled = sitk.GetImageFromArray(image_as_array_scaled)
    return image_as_array


#250114 - to solve the problem of applying identified best transformation to images other than those in moving image (and of format other than JPG, i.e. to apply to TIFF images)
def get_image_as_array_from_path(path):
    #260928 - cv2.cvtColor(cv2.imread(path, -1), cv2.COLOR_BGR2GRAY) raised
    #'VScn::contains(scn) ... in function CvtHelper' on single-channel inputs
    #(grayscale PNGs and 16-bit grayscale TIFFs - the most common images here),
    #so 'Apply transformation to more images' silently failed for them. Load
    #with PIL and stretch to 8-bit greyscale exactly like the moving images are
    #loaded for the registration itself
    # (get_moving_images_from_json_dict__imagestack__by_id => toGRAY_as_8bit_even_if_original_image_is_16bit),
    #so additional images are rendered consistently with the registered ones.
    image_as_array = toGRAY_as_8bit_even_if_original_image_is_16bit(Image.open(path))
    return np.asarray(image_as_array, dtype=float)

#241202
def create_array_for_white_image(shape):
    #array[:] = 255                                                                 #this overwrites an array
    array_for_white_image = np.ones((shape[0], shape[1]), dtype=np.uint8)*255
    return array_for_white_image



#241202 - to register images from json as alpha channel (GUI / registration ui)
def save_transformed_image_from_json_with_fixedImageSize_alpha(target_fixed_image_shape, transform, slices_of_moving_image_dict):

    ## 1 - CREATING a dummy fixed image based on "target_fixed_image_size_scaled" to apply transforms to moving images
    ## 241202 - POTATO
    array_for_fixed = create_array_for_white_image(target_fixed_image_shape)

    resample = sitk.ResampleImageFilter()
    resample.SetReferenceImage(sitk.GetImageFromArray(array_for_fixed))
    # SimpleITK supports several interpolation options, we go with the simplest that gives reasonable results.
    resample.SetInterpolator(sitk.sitkLinear)

    transform = transform[0]
    images_to_merge = {}

    # #slices_of_moving_image = list of images-as-arrays (these constitute the movingimage)
    # slices_of_moving_image_dict = {'0': slices_of_moving_image}

    for key, image in slices_of_moving_image_dict.items():
    #for image in slices_of_moving_image:
        print("moving image = " + str(image))
        #construct white image for each moving image => this will be opaque in alpha channel
        ph_ = np.ones(image.shape) * 255
        ph = sitk.GetImageFromArray(ph_)
        print("shape moving image = " + str(key) + ":  " + str(ph_.shape))

        resample.SetTransform(transform)

        # RGB_channel (channels no.1-2-3)
        out_i = resample.Execute(sitk.GetImageFromArray(image))
        simg_i = sitk.Cast(sitk.RescaleIntensity(out_i, 0, 255), sitk.sitkUInt8)

        # 230908 - one strand:
        cimg_inv = simg_i

        # alpha_channel (channel no.4)
        out_alpha = resample.Execute(ph)
        simg_alpha = sitk.Cast(out_alpha, sitk.sitkUInt8)
        cimg_alpha = simg_alpha

        ac = sitk.GetArrayFromImage(cimg_alpha)
        print("shape cimg_alpha = " + str(key) + ":  " + str(ac.shape))
        rgb = sitk.GetArrayFromImage(cimg_inv)
        print("shape cimg_rgb = " + str(key) + ":  " + str(rgb.shape))

        images_to_merge = {
            **images_to_merge, str(key): [rgb, ac]
        }
    return images_to_merge











