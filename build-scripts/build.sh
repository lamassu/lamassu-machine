#!/bin/bash
set -e

if [ -z "$1" ] || [ -z "$2" ]
  then
    echo "Builds a lamassu-machine update package"
    echo -e "\nUsage:"
    echo -e "build <github tag> <password> [latest package url]\n"
    exit 1
fi

if [ -z "$3" ]
  then
    docker build --build-arg VERSION=$1 --build-arg PASSWORD=$2 -t build:latest -f Dockerfile .
  else
    docker build --build-arg VERSION=$1 --build-arg PASSWORD=$2 --build-arg PACKAGE_URL=$3 -t build:latest -f fast.Dockerfile .
fi


id=$(docker create build)
docker cp $id:/lamassu/lamassu-machine/build/codebase/update.tar ./update.tar
docker rm -v $id
