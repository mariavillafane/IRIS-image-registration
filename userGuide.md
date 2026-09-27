# Introduction to IRIS

IRIS (Integrated Registration & Imaging System) is a graphical user interface (GUI) for facilitating the alignment of images (also referred to as "image registration"). It follows the area-based image registration method presented in [Maria Eugenia Villafane's PhD Thesis (Imperial College London, 2024, in collaboration with The National Gallery London)](https://spiral.imperial.ac.uk/entities/publication/9fee2878-d68f-461b-9b44-5cc7ee04d7f0), which in turn expands from the initial method presented in the SPIE paper [Multimodal image registration and mosaicking of artworks: an approach based on mutual information](https://www.academia.edu/121745639/Multimodal_image_registration_and_mosaicking_of_artworks_an_approach_based_on_mutual_information). If you make use of IRIS (and I hope you do!), please ensure you cite these sources adequately.

Our method was initially developed for registering element distribution maps resulting from macro X-ray fluorescence (MA-XRF) scanning of painted artworks, which take the form of a layered image stack. This stack is treated as the moving image for registration to the target fixed image - which is usually, but not limited to, the visible image of the same artwork. Our method can register multiple moving images simultaneously (each one arranged as a layered image stack, and each covering part of the fixed image), as well as it can be applied for registering various other image modalities.

The purpose of developing IRIS is to simplify the use of this area-based registration method (described in Chapter 3 of Maria Eugenia Villafane's PhD Thesis) by making the functionality accessible to the user through the browser (thus removing the need for the user to interface with the code directly), as well as to facilitate the process of setting up the initial locations of multiple image stacks relative to a target fixed image in a streamlined workflow. Thus, developing IRIS as a browser-based application allows any user to perform a registration, without prior training in coding or image processing techniques.

This research was funded by the [AHRC UKRI - Arts and Humanities Research Council](https://www.ukri.org/councils/ahrc/) - Grant no. AH/T002417/1, and it forms part of the agenda of the [ARTICT group](https://art-ict.github.io/artict/home.html).

# IRIS UserGuide 

By uploading a Fixed image onto the canvas, and consequently uploading the Moving images and arranging them relative to the Fixed image, the user may look out for the best overlapping layout prior to running the registration. The accuracy of the registration results may depend heavily on the precision of the initial overlapping layout - which is to be set by the user.

1. Uploading the images to register: 
- IRIS is designed to have a single Fixed image set at the (0,0) location, at 0 degree rotation. The Fixed image can be scaled to match the scale of the Moving images.
- IRIS is designed to have multiple Moving images, with each Moving image ("datacube") to be composed of many individual images. Whereas different Moving images can be of different pixel size and different amount of individual images, It is assumed that all individual images within a single Moving image are of the same pixel size, since they are all subject to the same transformations applied to the Moving image they belong to (i.e. translations, scaling and rotations).

2. Setting the initial overlapping layout: 
- Moving images can be translated along the x and y axis, 
- Moving images can be rotated by up to +/- 5 degrees (note that the current version of IRIS does not support "large" rotations: aim for Moving images to be rotated up to +/- 5 degrees. If images need to be rotated by 90 degrees to best match when overlapped onto the Fixed image, it is best to do this before importing the Moving image into IRIS).
- Moving images can be scaled to a larger or smaller ratio. Nonetheless, IRIS best use is to register Moving images at their native scale (i.e. maintaining scale =1.00) whilst scaling the Fixed image to match the image scale - usually by a smaller ratio as fixed images tend to be high-resolution images of the artwork. 

3. Inspecting the initial overlapping layout:
IRIS offers a range of tools to inspect the initial layout and ensure the overlapping of the images, prior to running the registration, is as good as possible. The user can vary the opacity of the images (enabling to display them at varied levels of transparency), as well as toggling on/off the visibility of any individual image. IRIS also features a "Curtain viewer" tool, which is enabled by clicking the "compare" button while using the "select" tool (i.e. arrow icon on left hand toolbar).

4. RunRegistration: Once the initial overlapping layout is achieved, the user may export the project and have it ready for resuming at a later time. Alternatively, the user may start the registration. The registration may take more time if having a large number of images to process. IRIS shows a work-bar that notifies the user if the registration is running, as well as when it finishes.
In the case of an error, please refer to the menu and inspect the error message. Most errors are due to insufficient area of overlapping images (i.e. not enough area of the moving image overlapping on the corresponding area of the fixed image).

5. Inspecting results:  importing registered image for comparison. 
- viewing results: each Moving image ("datacube") is "described" with a folder for each for the results. 
- exporting the project folder

These steps are all shown in this short tutorial video: [IRIS 101: Installation - Run Docker Image](https://www.youtube.com/watch?v=ha4nMlK6wcY).
