#!/bin/sh

echo "Setting up..."
mkdir -p data/log
mkdir -p ui/css/fonts

cp mock_data/device_config.sample.json device_config.json

echo
echo "Successful installation."
