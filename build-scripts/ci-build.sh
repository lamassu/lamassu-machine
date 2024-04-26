#!/bin/bash
set -e

docker build -t build:latest -f build-scripts/Dockerfile.ci .

id=$(docker create build)
docker cp $id:/lamassu/lamassu-machine/build/codebase/update.tar ./update.tar
docker rm -v $id