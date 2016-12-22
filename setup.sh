#!/bin/sh

echo "Setting up, takes a few minutes..."
mkdir -p data/log
mkdir -p ui/css/fonts

yarn install

cp device_config.sample.json device_config.json

if [ ! -e "licenses.json" ]; then
    cp licenses.sample.json licenses.json
fi

echo
echo "Successful installation."
