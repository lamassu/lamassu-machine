FROM ubuntu:14.04

RUN apt-get update && apt-get -y upgrade && \
  apt-get install -y git node npm build-essential cmake libgtk2.0-dev \
  pkg-config libavcodec-dev libavformat-dev libswscale-dev libpcsclite-dev \
  libopencv-core-dev libopencv-highgui-dev libopencv-imgproc-dev \
  libopencv-video-dev libopencv-features2d-dev libopencv-objdetect-dev

ENV WORK=/usr/app

RUN npm config set strict-ssl false
RUN npm cache clean -f
RUN npm install -g n
# only to use npm@2
RUN n 4
RUN npm -v

WORKDIR $WORK

COPY ./package.json ./package.json

RUN npm install

COPY ./ $WORK/

VOLUME ["/usr/app/deploy-files.tar.gz"]

CMD ["deploy/codebase/build.sh"]
