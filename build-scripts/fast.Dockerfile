#download node_modules
FROM alpine:3.14 as download-modules

WORKDIR /lamassu

ARG PACKAGE_URL

RUN apk add --no-cache curl tar && \
  curl -sS $PACKAGE_URL --output update.tar && \
  tar -xf update.tar && \
  cd package && \
  tar -zxf subpackage.tgz

# setup acp
FROM i386/ubuntu:14.04 as acp

WORKDIR /lamassu

RUN apt-get update && apt-get upgrade -y && \
  apt-get install -y build-essential cmake curl git pkg-config yasm \
  libasound2-dev libpcsclite-dev libavcodec-dev libavformat-dev libswscale-dev

RUN curl -s https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add - 
RUN curl -sS https://deb.nodesource.com/setup_6.x | bash - && apt-get install -y nodejs

RUN curl -sS https://ssubucket.ams3.digitaloceanspaces.com/barcodescannerlibs.txz | xz -dc | \
  tar -x -C /usr/local/lib --strip-components=2 barcodescannerlibs/ia32/libBarcodeScanner.so

# setup ssuboard
FROM arm32v7/debian:jessie as ssuboard

WORKDIR /lamassu

RUN apt-get update && apt-get upgrade -y && \
  apt-get install -y build-essential cmake curl git pkg-config yasm \
  libasound2-dev libpcsclite-dev libavcodec-dev libavformat-dev libswscale-dev ntp

RUN curl -s https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add - 
RUN curl -sS https://deb.nodesource.com/setup_8.x | bash - && apt-get install -y nodejs

RUN curl -sS https://ssubucket.ams3.digitaloceanspaces.com/barcodescannerlibs.txz | xz -dc | \
  tar -x -C /usr/local/lib --strip-components=2 barcodescannerlibs/arm32/libBarcodeScanner.a

# setup upboard
FROM amd64/debian:stretch as upboard

WORKDIR /lamassu

RUN apt-get update && apt-get upgrade -y && \
  apt-get install -y build-essential curl git pkg-config yasm \
  libasound2-dev libpcsclite-dev libavcodec-dev libavformat-dev libswscale-dev ntp

RUN curl -s https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add - 
RUN curl -sS https://deb.nodesource.com/setup_8.x | bash - && apt-get install -y nodejs

RUN curl -sS https://ssubucket.ams3.digitaloceanspaces.com/barcodescannerlibs.txz | xz -dc | \
  tar -x -C /usr/local/lib --strip-components=2 barcodescannerlibs/amd64/libBarcodeScanner.a


# ACP build 
FROM acp as acp-build
  ARG VERSION
  ARG PASSWORD

  RUN git clone https://github.com/lamassu/lamassu-machine -b ${VERSION} && cd lamassu-machine && \
    curl -sS https://ssubucket.ams3.digitaloceanspaces.com/ssuboard/licenses-2018.12.28.json.xz.gpg | gpg --batch --passphrase $PASSWORD --decrypt | xz -dc > licenses.json && \
    curl -sL https://ssubucket.ams3.digitaloceanspaces.com/deploy-files_2019.06.07.txz | xz -dc | tar -x 

  COPY --from=download-modules /lamassu/package/subpackage/lamassu-machine/node_modules /lamassu/lamassu-machine/node_modules
  COPY --from=download-modules /lamassu/package/subpackage/hardware/aaeon/node_modules /lamassu/lamassu-machine/node_modules/
  RUN cd lamassu-machine \
    cp ./hardware/codebase/aaeon/device_config.json ./ && \
    bash ./deploy/codebase/build.sh aaeon --copy-device-config

FROM upboard as upboard-gaia-build
  COPY --from=acp-build /lamassu/lamassu-machine /lamassu/lamassu-machine
  RUN rm -rf lamassu-machine/node_modules
  COPY --from=download-modules /lamassu/package/subpackage/lamassu-machine/node_modules /lamassu/lamassu-machine/node_modules
  COPY --from=download-modules /lamassu/package/subpackage/hardware/upboard/node_modules /lamassu/lamassu-machine/node_modules/
  RUN cd lamassu-machine && \
    cp ./hardware/codebase/upboard/gaia/device_config.json ./ && \
    bash ./deploy/codebase/build.sh upboard-gaia --copy-device-config

FROM upboard as upboard-sintra-build
  COPY --from=upboard-gaia-build /lamassu/lamassu-machine /lamassu/lamassu-machine/
  RUN cd lamassu-machine && \
    cp ./hardware/codebase/upboard/sintra/device_config.json ./ && \
    bash ./deploy/codebase/build.sh upboard-sintra --copy-device-config

FROM upboard as upboard-tejo-build
  COPY --from=upboard-sintra-build /lamassu/lamassu-machine /lamassu/lamassu-machine/
  RUN cd lamassu-machine && \
    cp ./hardware/codebase/upboard/tejo/device_config.json ./ && \
    bash ./deploy/codebase/build.sh upboard-tejo --copy-device-config

FROM upboard as upboard-4000-gaia-build
  COPY --from=acp-build /lamassu/lamassu-machine /lamassu/lamassu-machine
  RUN rm -rf lamassu-machine/node_modules
  COPY --from=download-modules /lamassu/package/subpackage/lamassu-machine/node_modules /lamassu/lamassu-machine/node_modules
  COPY --from=download-modules /lamassu/package/subpackage/hardware/upboard-4000/node_modules /lamassu/lamassu-machine/node_modules/
  RUN cd lamassu-machine && \
    cp ./hardware/codebase/upboard-4000/gaia/device_config.json ./ && \
    bash ./deploy/codebase/build.sh upboard-gaia --copy-device-config

FROM upboard as upboard-4000-sintra-build
  COPY --from=upboard-4000-gaia-build /lamassu/lamassu-machine /lamassu/lamassu-machine/
  RUN cd lamassu-machine && \
    cp ./hardware/codebase/upboard-4000/sintra/device_config.json ./ && \
    bash ./deploy/codebase/build.sh upboard-sintra --copy-device-config

FROM upboard as upboard-4000-tejo-build
  COPY --from=upboard-4000-sintra-build /lamassu/lamassu-machine /lamassu/lamassu-machine/
  RUN cd lamassu-machine && \
    cp ./hardware/codebase/upboard-4000/tejo/device_config.json ./ && \
    bash ./deploy/codebase/build.sh upboard-tejo --copy-device-config

FROM ssuboard as ssuboard-build
  COPY --from=upboard-tejo-build /lamassu/lamassu-machine /lamassu/lamassu-machine
  RUN rm -rf lamassu-machine/node_modules
  COPY --from=download-modules /lamassu/package/subpackage/lamassu-machine/node_modules /lamassu/lamassu-machine/node_modules
  COPY --from=download-modules /lamassu/package/subpackage/hardware/ssuboard/node_modules /lamassu/lamassu-machine/node_modules/
  RUN cd lamassu-machine && rm -rf node_modules && npm install && \
    cp ./hardware/codebase/ssuboard/device_config.json ./ && \
    bash ./deploy/codebase/build.sh ssuboard --copy-device-config
  RUN cd lamassu-machine && bash ./deploy/codebase/package.sh
