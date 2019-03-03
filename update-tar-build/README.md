# Update.tar builder

## Guide

- Download deploy-files.tar.gz from lamassu DO space

- Build the Dockerfile by running the following command on project root:
`docker build -t lamassu-update -f update-tar-build/Dockerfile .`

- Run the image to perform the build:
`docker run -v <build>:/usr/app/build -v <lamassu-machine/deploy-files location>:/usr/app/deploy-files.tar.gz lamassu-update`
