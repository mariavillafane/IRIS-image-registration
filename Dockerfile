# Multi-stage build: the client (CRA) build runs in a dedicated builder stage,
# so its ~700MB of node_modules never enter the published image - only the
# build/ output is copied over. This (plus conda/apt/nvm cache cleanup inside
# the same RUN that creates them) keeps the image small enough for CI runners,
# whose docker storage is limited and used to run out of space ("no space left
# on device").
FROM continuumio/miniconda3 AS client-builder
SHELL ["/bin/bash", "--login", "-c"]

WORKDIR /app

RUN wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
COPY .nvmrc .
#clean the nvm node tarball cache and the npm cache in the same layer
RUN nvm install && npm i -g yarn \
    && rm -rf /root/.nvm/.cache /root/.npm

#260923 - install node dependencies before copying the source, so that changing
#any other file (e.g. scripts_registration/) reuses the cached node_modules
#layer and only the client build re-runs
COPY package.json yarn.lock ./
#260928 - also clean the yarn download cache (/usr/local/share/.cache) in the
#same layer, so it never reaches the image
RUN yarn --frozen-lockfile \
    && yarn cache clean \
    && rm -rf /root/.cache

COPY . .
RUN yarn build

FROM continuumio/miniconda3
SHELL ["/bin/bash", "--login", "-c"]

WORKDIR /app

# Create the environment:
#260928 - conda keeps every downloaded package in /opt/conda/pkgs (and pip in
#/root/.cache); clean them up in the SAME RUN, otherwise they stay in this
#layer forever (deleting them in a later layer does not free the space).
#/opt/conda/pkgs is dropped entirely: conda hardlinks the env's files into it,
#so removing these copies keeps the env intact while freeing the
#non-hardlinked part (~0.5GB) that would otherwise ship in the layer
COPY environment.yml .
RUN conda env create -f environment.yml \
    && conda clean -a -y \
    && rm -rf /opt/conda/pkgs /root/.cache

RUN conda init bash

#added with Gaetano 260715; 260928 - single apt layer with lists cleanup,
#libgomp1 merged in (it is needed at runtime)
RUN apt-get update \
    && apt-get install -y --no-install-recommends pax-utils patchelf libgomp1 \
    && rm -rf /var/lib/apt/lists/*

#might need to remove the line below if makes a mess
#RUN pip install opencv-python-headless==4.5.5.64
#or continue to patch libraries
#libopencv_hfs.so.3.4
#(patchelf calls combined into one layer, so the modified libs are not copied
#into several layers)
RUN patchelf --clear-execstack /opt/conda/envs/image_registration_legacy/lib/libopencv_reg.so.3.4.2 \
    && patchelf --clear-execstack /opt/conda/envs/image_registration_legacy/lib/libopencv_xphoto.so.3.4 \
    && patchelf --clear-execstack /opt/conda/envs/image_registration_legacy/lib/libopencv_freetype.so.3.4 \
    && patchelf --clear-execstack /opt/conda/envs/image_registration_legacy/lib/libopencv_**.so.3.4
#this one up worked and solved all cv2 libraries needing to update

RUN conda activate image_registration_legacy
RUN echo "conda init && conda activate image_registration_legacy" >> ~/.bashrc

RUN mkdir -p results

#node runtime: reuse the toolchain installed in the builder stage instead of
#downloading nvm + node again
COPY --from=client-builder /root/.nvm /root/.nvm
RUN echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc \
    && echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' >> ~/.bashrc \
    && echo '[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"' >> ~/.bashrc

#260928 - install the server dependencies before copying the source, so that
#changing any other file reuses the cached server node_modules layer
WORKDIR /app/server
COPY server/package.json server/yarn.lock ./
RUN yarn --frozen-lockfile \
    && yarn cache clean \
    && rm -rf /root/.cache

WORKDIR /app
COPY . .

#only the client build output - its node_modules stay in the builder stage
COPY --from=client-builder /app/build ./build

WORKDIR /app/server
RUN yarn build

ENV PORT=4000 NODE_ENV=production
EXPOSE 4000
CMD ["/bin/bash", "--login", "-c", "node dist/index.js"]
