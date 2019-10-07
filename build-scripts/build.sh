#!/bin/bash
set -e

if [ -z "$1" ]
  then
    echo "Builds a lamassu-machine update package"
    echo -e "\nUsage:"
    echo -e "build <github tag> <password>\n"
    exit 1
fi

if [ -z "$2" ]
  then
    echo "Builds a lamassu-machine update package"
    echo -e "\nUsage:"
    echo -e "build <github tag> <password>\n"
    exit 1
fi

docker build --build-arg VERSION=$1 --build-arg PASSWORD=$2 -t build:latest .

id=$(docker create build)
docker cp $id:/lamassu/lamassu-machine/build/codebase/update.tar ./update.tar
docker rm -v $id
