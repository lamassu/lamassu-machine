#!/bin/sh

echo "Setting up..."
mkdir -p data/log
mkdir -p ui/css/fonts

cp mock_data/device_config.sample.json device_config.json

if [ ! -e "licenses.json" ]; then
    cp mock_data/licenses.sample.json licenses.json
fi

echo
echo "Successful installation."
