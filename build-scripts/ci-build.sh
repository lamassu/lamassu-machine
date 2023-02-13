#!/bin/bash
set -e

if [ -z "$1" ]
  then
    echo "Builds a lamassu-machine update package!"
    echo -e "\nUsage:"
    echo -e "build <password>\n"
    exit 1
fi

docker build --build-arg PASSWORD=$1 -t build:latest -f build-scripts/Dockerfile.ci .


id=$(docker create build)
docker cp $id:/lamassu/lamassu-machine/build/codebase/update.tar ./update.tar
docker rm -v $id