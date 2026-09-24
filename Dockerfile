FROM continuumio/miniconda3
SHELL ["/bin/bash", "--login", "-c"]

WORKDIR /app

# Create the environment:
COPY environment.yml .
RUN conda env create -f environment.yml

RUN conda init bash

#added with Gaetano 260715
RUN apt-get update && apt-get install -y pax-utils patchelf
RUN patchelf --clear-execstack /opt/conda/envs/image_registration_legacy/lib/libopencv_reg.so.3.4.2
RUN patchelf --clear-execstack /opt/conda/envs/image_registration_legacy/lib/libopencv_xphoto.so.3.4
#might need to remove the line below if makes a mess
#RUN pip install opencv-python-headless==4.5.5.64 
#or continue to patch libraries
RUN patchelf --clear-execstack /opt/conda/envs/image_registration_legacy/lib/libopencv_freetype.so.3.4
#libopencv_hfs.so.3.4
RUN patchelf --clear-execstack /opt/conda/envs/image_registration_legacy/lib/libopencv_**.so.3.4
#this one up worked and solved all cv2 libraries needing to update

RUN apt-get install libgomp1


RUN conda activate image_registration_legacy
RUN echo "conda init && conda activate image_registration_legacy" >> ~/.bashrc


RUN mkdir -p results \
    && wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
COPY .nvmrc .
RUN nvm install && npm i -g yarn

#260923 - install node dependencies before copying the source, so that changing
#any other file (e.g. scripts_registration/) reuses the cached node_modules
#layer and only the client build re-runs
COPY package.json yarn.lock ./
RUN yarn

COPY . .

RUN yarn build

WORKDIR /app/server
RUN yarn

CMD ["/bin/bash", "--login", "-c", "node index.js"]
