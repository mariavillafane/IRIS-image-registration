# About IRIS

IRIS (Integrated Registration & Imaging System) is a graphical user interface (GUI) for facilitating the alignment of images (also referred to as "image registration"). It follows the area-based image registration method presented in [Maria Eugenia Villafane's PhD Thesis (Imperial College London, 2024, in collaboration with The National Gallery London)](https://spiral.imperial.ac.uk/entities/publication/9fee2878-d68f-461b-9b44-5cc7ee04d7f0), which in turn expands from the initial method presented in the SPIE paper [Multimodal image registration and mosaicking of artworks: an approach based on mutual information](https://www.academia.edu/121745639/Multimodal_image_registration_and_mosaicking_of_artworks_an_approach_based_on_mutual_information). If you make use of IRIS (and I hope you do!), please ensure you cite these sources adequately.

Our method was initially developed for registering element distribution maps resulting from macro X-ray fluorescence (MA-XRF) scanning of painted artworks, which take the form of a layered image stack. This stack is treated as the moving image for registration to the target fixed image - which is usually, but not limited to, the visible image of the same artwork. Our method can register multiple moving images simultaneously (each one arranged as a layered image stack, and each covering part of the fixed image), as well as it can be applied for registering various other image modalities.

The purpose of developing IRIS is to simplify the use of this area-based registration method (described in Chapter 3 of Maria Eugenia Villafane's PhD Thesis) by making the functionality accessible to the user through the browser (thus removing the need for the user to interface with the code directly), as well as to facilitate the process of setting up the initial locations of multiple image stacks relative to a target fixed image in a streamlined workflow. Thus, developing IRIS as a browser-based application allows any user to perform a registration, without prior training in coding or image processing techniques.

This research was funded by the [AHRC UKRI - Arts and Humanities Research Council](https://www.ukri.org/councils/ahrc/) - Grant no. AH/T002417/1, and it forms part of the agenda of the [ARTICT group](https://art-ict.github.io/artict/home.html).

IRIS is licensed as an Open Source Software, under the GNU Affero General Public License v3.0 - please refer to the [license](https://github.com/mariavillafane/IRIS-image-registration/blob/main/LICENSE) for full details.

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

These steps are all shown in this short tutorial video: [IRIS 101: Installation - Run Docker Image](https://www.youtube.com/watch?v=ha4nMlK6wcY).

# Development

The frontend (React) and the backend (Express) are both written in TypeScript.

- Frontend dev server: `yarn start` (CRA dev server on port 3000, proxies `/api` to the backend)
- Backend dev server: `cd server && yarn dev` (tsx watch, port 4000)
- Production builds: `yarn build` (client -> `build/`), and `cd server && yarn build` (server -> `server/dist/`, run with `yarn start`)
- Tests: `CI=true yarn test --watchAll=false`
- E2E tests: `yarn e2e:install` once, then `yarn e2e` (Playwright; builds client+server as needed, serves the production stack on :4000 and mocks only the registration/job endpoints; upload, thumbnails and saving hit the real backend)
- E2E videos: every test is recorded to `test-results/<test>/video.webm`; traces and screenshots accompany failures. Open videos, traces and steps in the HTML report with `yarn e2e:report`
