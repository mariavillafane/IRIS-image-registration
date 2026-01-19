# About IRIS

IRIS (Integrated Registration & Imaging System) is a graphical user interface (GUI) developed for the area-based image registration method presented in Maria Eugenia Villafane's PhD Thesis, which can be accessed here: 

https://spiral.imperial.ac.uk/entities/publication/9fee2878-d68f-461b-9b44-5cc7ee04d7f0

The purpose of developing this GUI is to simplify the use of the area-based registration method (described in Chapter 3 of this Thesis) by making the functionality accessible to the user through the browser (thus removing the need for the user to interface with the code directly), as well as to facilitate the process of setting up the initial locations of multiple image stacks relative to a target fixed image in a streamlined workflow. Thus, developing the GUI as a browser-based application allows any user to perform a registration, without prior training in coding or image processing techniques.

This research was funded by the Arts and Humanities Research Council, and forms part of the agenda of ARTICT group:

https://art-ict.github.io/artict/home.html

# Installation Guide

1. Install Docker

On windows we recommend [docker desktop](https://www.docker.com/products/docker-desktop/)

2. run the image via docker on the commandline

```
docker run -p4000:4000 -it mariavillafane/regui:latest
```

alternatively you can download this [compose.yml](https://github.com/mariavillafane/registration-ui/blob/main/compose.yml) file and execute it via

`docker compose up`
