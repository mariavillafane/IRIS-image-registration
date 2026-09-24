# ==========================================================================
#               200710  EXAMPLE FROM >> https://simpleitk.readthedocs.io/en/master/link_ImageRegistrationMethod3_docs.html
#   (affine)    200805  EXAMPLE FROM >> https://simpleitk.readthedocs.io/en/v1.2.4/Examples/ImageRegistrationMethodDisplacement1/Documentation.html
# ==========================================================================*/

from __future__ import print_function

import SimpleITK as sitk
import sys
import os
import cv2
import matplotlib.pyplot as plt
import numpy as np
from scipy.io import loadmat
#import mat73 => not loaded as part of the installation at NG 231215 of image_registration_legacy_venv.yml
import itertools
import pandas as pd
import glob
from multiprocessing import Pool
import json
import io
import cv2
import base64
from PIL import Image
from datetime import date

#version 231213

#get_crop_location_of_fixed_image, get_crop_fixed_image_from_path, get_registered_images, \

from functions import   get_datacube_from_images, \
                        search_best_transform, \
                        get_transform_from_parameters, \
                        image_scale, save_transform_and_image_0, \
                        get_transform_from_parameters_affine, get_transform_from_parameters,  \
                        get_datacube_from_path_xray_generic, get_datacube_from_single_images, get_registered_images_from_array__2_transforms_bspline_by_slice, \
                        get_datacube_from_json__image_and_settings, load_json_from_path, get_fixed_image_as_array_from_json, get_datacube_from_json__image_and_settings__by_id, \
                        get_rotation_pivot_within_roi, \
                        get_transform_from_parameters_bspline_fullFixedimage_translation, save_transform_and_image_alpha, merge_images_to_create_png, get_fixed_image_as_array_from_json_COLOR

def main():
    plt.rcParams['image.interpolation'] = 'nearest'
    plt.rcParams['image.cmap'] = 'gray'
    print('configuration data:')
    print(sys.argv)

    path_json = 'settings.json' if (len(sys.argv) < 2) else sys.argv[1]

    #230903 - send all printed data to destination_folder (destination_folder+name of file to write)
    destination_folder = os.path.join(os.getcwd(), 'results') if (len(sys.argv) < 3) else sys.argv[2]

    try:
       os.makedirs(os.path.join(destination_folder, 'results'))
    except:
        pass

    data_from_json = load_json_from_path(path_json) # 230209
    data_from_json['imageFixed'] = data_from_json['workingImages'][0]

    #260923 - the analysis assumes an UNROTATED fixed image (only the moving
    #images' rotation is applied). Warn loudly if a rotation was set on the
    #fixed image in the UI, since the UI preview will then not match the
    #registration and the moving/fixed overlap can appear empty.
    if float(data_from_json['imageFixed'].get('rotation', 0) or 0) != 0:
        print('WARNING: the fixed image has rotation = ' + str(data_from_json['imageFixed']['rotation']) + ' degrees set in the UI, but the analysis assumes an UNROTATED fixed image - the registration result will not match the rotated UI preview. Set the fixed image rotation to 0 and rotate the moving image instead.')
    data_from_json['workingImages'] = data_from_json['workingImages'][1:]

    amount_of_datacubes = len(data_from_json['workingImages'])


    for no_of_datacube in range(amount_of_datacubes):
        #os.makedirs(os.path.join(os.getcwd(), 'results_datacube_' + str(no_of_datacube)))
        try:
          os.makedirs(os.path.join(destination_folder, 'results_datacube_' + str(no_of_datacube)))
        except:
          pass

        #no_of_datacube = 3  #d06   #['workingImages'][no_of_datacube] for pointing at n-th datacube of settings.json; ['workingImages'] is the second dictionary of settings.json #230904 NG
        datacube_from_json = get_datacube_from_json__image_and_settings(data_from_json, no_of_datacube)  # 230903

        slices = list(datacube_from_json['datacube_eq'].keys()) #230830
        #print('slices to check')
        #print(slices)
        print('rot to check')
        print(data_from_json['imageFixed']['scaling'])

        search_setup = {
            'scaling_coef_s1': datacube_from_json['scaling'],
            'scaling_coef_s2': datacube_from_json['scaling'],
            'scaling_coef_s3': datacube_from_json['scaling'],
            'scaling_coef_s4': datacube_from_json['scaling'],
            'spread_s1': 10,
            'spread_s2': 3,
            'spread_s3': 1,
            'spread_s4': 1,
            'spacesize_s1': [1, 1, 2, 2],
            'spacesize_s2': [1, 1, 3, 3],
            'spacesize_s3': [1, 1, 1, 1, 1, 1],
            'spacesize_s4': [2.0, 100],
            'scaling_coef_s1_fixed': data_from_json['imageFixed']['scaling'],
            'scaling_coef_s2_fixed': data_from_json['imageFixed']['scaling'],
            'scaling_coef_s3_fixed': data_from_json['imageFixed']['scaling'],
            'scaling_coef_s4_fixed': data_from_json['imageFixed']['scaling'],
            'slices': slices, #from datacube! 230830
            'datacube_no': 'mov_img_' + str(no_of_datacube),#'mov_img', #'xr10',
            'slice_subdivision': {'nw': 1, 'nh': 1},            # no. of subdivisions along width & height (tiles) (4,4)
            'tile': '_im00',
            'x': 0,                         # shift of tile (width / height of tile, so to subdivide the slice of datacube)
            'y': 0
        }

        ini_pos_dict = {
            #'mov_img': (int(-(datacube_from_json['x'])) + search_setup['x'], int(-(datacube_from_json['y'])) + search_setup['y']),  # -x == right-translation of moving image  // -y == down-translation of moving image
            'mov_img_' + str(no_of_datacube): (int(-(datacube_from_json['x'])) + search_setup['x'], int(-(datacube_from_json['y'])) + search_setup['y']),
        }

        ini_pos_d = ini_pos_dict[search_setup['datacube_no']]
        ideal_final_tr = {'a11': 1.0, 'a12': 0.0, 'a21': 0.0, 'a22': 1.0, 'tx': ini_pos_d[0], 'ty': ini_pos_d[1], 'mi_average': -999.0}
        print('ini_pos_d = ' + str(ini_pos_d))
        print('ideal_final_tr = ' + str(ideal_final_tr))

        # 221130 # rotation (about the top-left corner of the image)
        # here can be added a key = "center_of_image" or "top_left_corner" so to have as centre of image_rotation
        # 260923 - note: only 'top_left_corner' is implemented (set_initial_transformation raises for other values);
        # the angle conversion now uses the exact -pi/180 (previously -1/57, which was ~0.5% off and inconsistent
        # with get_rotated_bounding_box, which converts degrees with the exact pi/180)
        ini_rot_moving_img = {
            'rot': datacube_from_json['rotation']*(-np.pi/180), #260923 (was *(-1/57) #230830)
            'centre_of_rot': 'top_left_corner'             #'center_of_image'
            }

        #config_path_moving_images
        config_for_datacube = {
            #'path_moving_images': path_moving_images,
            'slices': search_setup['slices'],
            'datacube_no': search_setup['datacube_no'],
            'moving_crop': {'crop_right': 0, 'crop_left': 0, 'crop_top': 0, 'crop_bottom': 0},      #note this crop is at true scale of image
            'moving_subdivision': {'nw': 1, 'nh': 1},                                               #no. of subdivisions along width & height (4,4)
            'ini_pos_d': ini_pos_d,
            'tile': search_setup['tile'],
            'ini_rot_moving_img': ini_rot_moving_img,                #221130
            'folder_partial_results': destination_folder +'/results_datacube_' + str(no_of_datacube)
        }

        datacube = {**config_for_datacube, **datacube_from_json}    #230210

        fixed_image_as_array_from_json_dict = get_fixed_image_as_array_from_json_COLOR(data_from_json)

        #230209 - new config with fixed data from json
        base_config = {
            'data_fixed_image_array_from_json': fixed_image_as_array_from_json_dict,
            'fixed_margin': {'right': 0, 'left': 0, 'top': 0, 'bottom': 0},         # all 20 for (20*2 + 1 = 41 pixels max searching area == search1)
            **datacube                                                              #'fixed_margin': {'right': 0, 'left': 0, 'top': 0, 'bottom': 0} == MINIATURES 230117
        }

        #230209
        print('fixed img from json = ' + str(base_config['data_fixed_image_array_from_json']['fixed_image_as_array'].shape))

        #SEARCH 1 (41x41)#
        search_1 = {
            'name': 's1',
            'spread': search_setup['spread_s1'],
            'spacesize': search_setup['spacesize_s1'],
            'scaling_coef': search_setup['scaling_coef_s1'],
            'scaling_coef_fixed': search_setup['scaling_coef_s1_fixed'],
            'previous_scaling_coef': 1.0,
            'best_transform_so_far': {'tx': ini_pos_d[0], 'ty': ini_pos_d[1]}
        }

        print('\n###[progress:0/5]###\n')
        with Pool(5) as p:
            best_tr_s1, config = search_best_transform({
                **base_config,
                **search_1
            }, p)

        print('\n###[progress:1/5]###\n')

        print('search1 - best_tr' + str(best_tr_s1))


        #SEARCH 2 (19x19)
        search_2 = {
            'name': 's2',
            'spread':  search_setup['spread_s2'],
            'spacesize': search_setup['spacesize_s2'],
            'scaling_coef': search_setup['scaling_coef_s2'],
            'scaling_coef_fixed': search_setup['scaling_coef_s2_fixed'],
            'previous_scaling_coef': search_setup['scaling_coef_s1'],
            'best_transform_so_far': best_tr_s1
        }

        with Pool(5) as p:
           best_tr_s2, config = search_best_transform({
                **base_config,
                **search_2
            }, p)

        print('\n###[progress:2/5]###\n')
        print('search2 - best_tr' + str(best_tr_s2))


        #SEARCH 3 (5x5)
        search_3 = {
            'name': 's3',
            'spread': search_setup['spread_s3'],
            'spacesize': search_setup['spacesize_s3'],
            'scaling_coef': search_setup['scaling_coef_s3'],
            'scaling_coef_fixed': search_setup['scaling_coef_s3_fixed'],
            'previous_scaling_coef': search_setup['scaling_coef_s2'],
            'best_transform_so_far': best_tr_s2
        }

        with Pool(5) as p:
            best_tr_s3, config = search_best_transform({
                **base_config,
                **search_3
            }, p)

        print('\n###[progress:3/5]###\n')

        print('search3 - best_tr' + str(best_tr_s3))


        #SEARCH 4 (Bspline)
        search_4 = {
            'name': 's4',
            'spread': search_setup['spread_s4'],
            'spacesize': search_setup['spacesize_s4'],
            'scaling_coef': search_setup['scaling_coef_s4'],
            'scaling_coef_fixed': search_setup['scaling_coef_s4_fixed'],
            'previous_scaling_coef': search_setup['scaling_coef_s3'],
            'best_transform_so_far': best_tr_s3
        }

        with Pool(5) as p:
            best_tr_s4, config = search_best_transform({
                **base_config,
                **search_4
            }, p)

        print('\n###[progress:4/5]###\n')
        print('search4 - best_tr' + str(best_tr_s4))

        print(str(search_setup['datacube_no']) + ' - ini_pos_d = ' + str(ini_pos_d) + ', at scaling coefs = ' + str(search_setup['scaling_coef_s1']) + ',' + str(search_setup['scaling_coef_s2']) + ',' + str(search_setup['scaling_coef_s3']))
        print('crop (right, left, top, bottom)= ' + str(base_config['moving_crop']['crop_right']) + ', ' + str(base_config['moving_crop']['crop_left']) + ', ' + str(base_config['moving_crop']['crop_top']) + ', ' + str(base_config['moving_crop']['crop_bottom']))

        #print all details of each search
        print('\n')
        print('initial position of moving image = ' + str(ini_pos_d))
        print('initial rotation of moving image = ' + str(ini_rot_moving_img['rot']))
        print('\n')
        print(search_1)
        print(search_2)
        print(search_3)
        print(search_4)
        print('\n')
        print('ideal_final_tr = ' + str(ideal_final_tr))

        for slice in search_setup['slices']:
            get_registered_images_from_array__2_transforms_bspline_by_slice(slice, config, best_tr_s3, best_tr_s4, ideal_final_tr)

        print('done now - for loop of slices - subdivision = (' + str(config['moving_subdivision']['nw']) + ',' + str(config['moving_subdivision']['nh']) + '), at scaling factors  = ' + str(search_setup['scaling_coef_s1']) + ',' + str(search_setup['scaling_coef_s2']) + ',' + str(search_setup['scaling_coef_s3']) + ',' + config['tile'])

        print('this is registration of ' + str(search_setup['datacube_no']) + ' to visible image of the painting')
        print('\n')

        # 231214 - Implementation NG

        # 01.save full size fixed image GREYSCALE (scaled following json settings)
        fixed_image_scaled = image_scale(fixed_image_as_array_from_json_dict['fixed_image_as_array'], fixed_image_as_array_from_json_dict['scaling'])
        #plt.imsave(destination_folder + '/results/' + config['datacube_no'] + '_fixed_image_from_json__scale_' + str(fixed_image_as_array_from_json_dict['scaling']) + '.png', fixed_image_scaled) #250925: this worked ok for grayscale fixed images, but we changed it for consistency to Pillow
        img = Image.fromarray(fixed_image_scaled) #250925
        img.convert('L').save(destination_folder + '/results/' + config['datacube_no'] + '_fixed_image_from_json__scale_' + str(fixed_image_as_array_from_json_dict['scaling']) + '.png', compress_level=0)#250925


        # 01 b.save full size fixed image COLOR (scaled following json settings)
        fixed_image_scaled_COLOR = image_scale(fixed_image_as_array_from_json_dict['fixed_image_as_array_COLOR'], fixed_image_as_array_from_json_dict['scaling'])
        #plt.imsave(destination_folder + '/results/' + config['datacube_no'] + '_fixed_image_from_json__scale_' + str(fixed_image_as_array_from_json_dict['scaling']) + '_COLOR.png', fixed_image_scaled_COLOR) #231218 => does not work if Fixed image is GRAYSCALE #250925
        img = Image.fromarray(fixed_image_scaled_COLOR) #250925
        img.save(destination_folder + '/results/' + config['datacube_no'] + '_fixed_image_from_json__scale_' + str(fixed_image_as_array_from_json_dict['scaling']) + '_COLOR.png', compress_level=0)#250925

        #02.get moving images (before registration - the scaling will be set by the transformation to apply, not by the iniloc at json settings)
        datacube_from_json_by_id = get_datacube_from_json__image_and_settings__by_id(data_from_json, no_of_datacube)

        #03.params for transform to apply to pngs (produce of imreg python code)
        best_tr_s3_d01 = best_tr_s3
        print('d01_best_tr_s3 = ' + str(best_tr_s3))
        best_tr_s4_d01 = best_tr_s4
        print('d01_best_tr_s4 = ' + str(best_tr_s4))
        fixed_parameters_d01 = config['fixed_parameters']
        print('d01_fixed_parameters = ' + str(config['fixed_parameters']))
        loc_at_crop_01 = config['ini_loc_within_fixed_ROI']
        print('d01_loc_at_crop = ' + str(config['ini_loc_within_fixed_ROI']))

        #260923 - ROI origin and rotation pivot, needed to express the transforms
        #in full fixed-image coordinates (see
        #get_transform_from_parameters_bspline_fullFixedimage_translation)
        fixed_crop_origin = (config['fixed_crop_pos_x_margin'][0], config['fixed_crop_pos_y_margin'][0])
        rotation_pivot = get_rotation_pivot_within_roi(config)
        print('d01_fixed_crop_origin = ' + str(fixed_crop_origin))
        print('d01_rotation_pivot = ' + str(rotation_pivot))

        best_tr_all = [[best_tr_s4_d01, best_tr_s3_d01, fixed_parameters_d01, loc_at_crop_01]]
        transforms = list(get_transform_from_parameters_bspline_fullFixedimage_translation(tr[0], tr[1], tr[2], tr[3], fixed_crop_origin, rotation_pivot) for tr in best_tr_all)

        print(transforms)

        ims_to_merge = save_transform_and_image_alpha(*transforms, fixed_image_scaled, datacube_from_json_by_id['datacube_eq']) #, datacubes_no
        print('ims_to_merge = ' + str(ims_to_merge))

        png_images = merge_images_to_create_png(ims_to_merge)
        print('png_images = ' + str(png_images))

        for key, image in png_images.items():
            plt.imsave(destination_folder + '/results/' + config['datacube_no'] + '_Final_transformed_image_' + key + '.png', image)

        with open(destination_folder + '/results/' + config['datacube_no'] + '_Final_transformations_applied.txt', 'w') as f:
            # 'imageFixed'
            f.write("\n" + 'target fixed image = ' + str(data_from_json['imageFixed']['imageEntries'][0]['id']))
            f.write("\n" + 'initial position of fixed target image = ' + str(data_from_json['imageFixed']['x']) + ', ' + str(data_from_json['imageFixed']['y']) + ' (tx,ty), assumed to be (0,0)')
            f.write("\n" + 'initial rotation of fixed target image = ' + str(data_from_json['imageFixed']['rotation']) + ' degrees, assumed to be 0 degrees')  # (ini_rot_moving_img['rot'])
            f.write("\n" + 'initial scaling of fixed target image = ' + str(data_from_json['imageFixed']['scaling']))
            # 'imageMoving'
            f.write("\n" + 'moving image: amount of images in image stack = ' + str(len(data_from_json['workingImages'])))
            f.write("\n")
            f.write("\n" + 'initial position of ' + str(config['datacube_no']) + ' = ' + str(ini_pos_d) + ' (tx,ty)')
            f.write("\n" + 'initial rotation of ' + str(config['datacube_no']) + ' = ' + str(datacube_from_json['rotation']) + ' degrees') #(ini_rot_moving_img['rot']) before being passed to radians (*(-1) as this is Sitk rotation equivalent)
            f.write("\n" + 'initial rotation of ' + str(config['datacube_no']) + ' = ' + str(ini_rot_moving_img['rot']) + ' radians. Note that this is in the direction of rotation of sitk library (which we use for applying the transformations to the images)')
            f.write("\n" + 'initial scaling of ' + str(config['datacube_no']) + ' = ' + str(datacube_from_json['scaling']))
            f.write("\n")
            f.write("\n" + str(config['datacube_no']) + ' best transformation obtained at search 1 = ' + str(best_tr_s1))
            f.write("\n" + str(config['datacube_no']) + ' best transformation obtained at search 2 = ' + str(best_tr_s2))
            f.write("\n")
            f.write("\n" + str(config['datacube_no']) + ' best transformation obtained at search 3 = ' + str(best_tr_s3) + ' ( = translation of moving image relative to the entire area of the fixed image, from top-left corner).')
            f.write("\n" + str(config['datacube_no']) + ' loc_at_crop = ' + str(config['ini_loc_within_fixed_ROI']) + ' ( = s3 translation parameter, recorded around the rotation pivot; equals the s1 initial translation for rotation = 0).')
            f.write("\n" + str(config['datacube_no']) + ' fixed crop origin (ROI origin within the full fixed image) = ' + str(fixed_crop_origin) + ' ( = placement corner - rotation bounding box displacement).')
            f.write("\n" + str(config['datacube_no']) + ' rotation pivot (moving image top-left corner within the ROI) = ' + str(rotation_pivot) + '.')
            f.write("\n" + str(config['datacube_no']) + ' best transformation obtained at search 4 = ' + str(best_tr_s4))

        # 241121                                                                    #image shape = (y,x)
        final_transformations_applied = {
            'datacube_number': config['datacube_no'],
            'loc_at_crop': config['ini_loc_within_fixed_ROI'],
            'transformation_obtained_s3': best_tr_s3,
            #'transformation_obtained_s4': best_tr_s4, for result in best_tr_s4,
            'transformation_obtained_s4':  {key: value.item() for (key, value) in best_tr_s4.items()}, #241125 =>  Object of type 'float32' is not JSON serializable =>  value.item() for converting nmpy float32 to python number

            'fixed_parameters': config['fixed_parameters'],

            #260923 - geometry needed to rebuild the transforms in full fixed-image coordinates
            'fixed_crop_pos_x_margin': config['fixed_crop_pos_x_margin'],
            'fixed_crop_pos_y_margin': config['fixed_crop_pos_y_margin'],
            'rotation_pivot_within_roi': rotation_pivot,

            'target_fixed_image_size_scaled___y_x': fixed_image_scaled_COLOR.shape,
            'target_fixed_image_name': data_from_json['imageFixed']['imageEntries'][0]['id'],
            'target_fixed_image_initial_scaling': data_from_json['imageFixed']['scaling'],

            'transformation_obtained_s1': best_tr_s1,
            'transformation_obtained_s2': best_tr_s2,
            'initial_position_tx_ty': ini_pos_d,
            'initial_rotation_degrees': datacube_from_json['rotation'],
            'initial_rotation_radians': ini_rot_moving_img['rot'],
            'initial_scaling': datacube_from_json['scaling']
        }

        with open(destination_folder + '/results/' + config['datacube_no'] + '_transformations.json', 'w') as fp:
            json.dump(final_transformations_applied, fp)
        print('\n###[progress:5/5]###\n')

if __name__ == '__main__':

    main()

