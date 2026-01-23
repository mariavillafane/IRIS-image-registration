# About IRIS

IRIS (Integrated Registration & Imaging System) is a graphical user interface (GUI) for facilitating the alignment of images (also referred to as "image regitration"). It follows the area-based image registration method presented in [Maria Eugenia Villafane's PhD Thesis (Imperial College London, 2024, in collaboration with The National Gallery London)](https://spiral.imperial.ac.uk/entities/publication/9fee2878-d68f-461b-9b44-5cc7ee04d7f0), which in turn expands from the initial method presented in the SPIE paper [Multimodal image registration and mosaicking of artworks: an approach based on mutual information](https://www.spiedigitallibrary.org/conference-proceedings-of-spie/12620/1262004/Multimodal-image-registration-and-mosaicking-of-artworks--an-approach/10.1117/12.2673427.short).

Our method was initially developed for registering element distribution maps resulting from macro X-ray fluorescence (MA-XRF) scanning of painted artworks, which take the form of a layered image stack. This stack is treated as the moving image for registration to the target fixed image - which is usually, but not limited to, the visible image of the same artwork. Our method can register multiple moving images simultaneously (each one arranged as a layered image stack, and each covering part of the fixed image), as well as it can be applied for registering various other image modalities.

The purpose of developing IRIS is to simplify the use of this area-based registration method (described in Chapter 3 of Maria Eugenia Villafane's PhD Thesis) by making the functionality accessible to the user through the browser (thus removing the need for the user to interface with the code directly), as well as to facilitate the process of setting up the initial locations of multiple image stacks relative to a target fixed image in a streamlined workflow. Thus, developing IRIS as a browser-based application allows any user to perform a registration, without prior training in coding or image processing techniques.

This research was funded by the [AHRC UKRI - Arts and Humanities Research Council](https://www.ukri.org/councils/ahrc/), and forms part of the agenda of the [ARTICT group](https://art-ict.github.io/artict/home.html).

IRIS can be accessed from Docker as an "image" (self-contained software package), with no need of downloading any additional supporting libraries or applications.

# Installation Guide

1. Install Docker

On Microsoft Windows (desktop operating system) we recommend [docker desktop](https://www.docker.com/products/docker-desktop/)

2. If using MS Windows, user can open [docker desktop] and download ("pull") and run the corresponding "docker-image" (which is a self-contained software package with a set of instructions, specifiying all the libraries and dependencies that IRIS requires to run smoothly).

3. If running the docker-image on [docker desktop], it is recommended to download this [compose.yml](https://github.com/mariavillafane/registration-ui/blob/main/compose.yml) file and execute it via the commandline, by opening the commandline in the folder where this files is downloaded, and instructing (in the commandline):

`docker compose up`

This makes sure that IRIS will be readily accessible at the browser (e.g. Chrome) at http://localhost:4000/

4. Alternatively, the user can access IRIS by running the docker-image via docker on the commandline (also referred to as "cprompt" or "cmd")

```
docker run -p4000:4000 -it mariavillafane/iris:latest
```

5. Please refer to the latest version of IRIS: Update to the latest version by instructing "pull"

```
docker pull mariavillafane/iris:latest
```
