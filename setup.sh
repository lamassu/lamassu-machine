#!/bin/sh
mkdir -p data/log
mkdir -p ui/css/fonts
mkdir -p /tmp/lamassu-fonts
rm /tmp/lamassu-fonts/* -rf
touch data/db.json

echo

yarn install

echo "Setting up config files..."
cp device_config.sample.json device_config.json

if [ ! -e "licenses.json" ]; then
    echo
    echo "licenses.json not found. Edit the licenses.sample.json file, and add your API keys manually."
    echo
fi

echo "Successful installation."
