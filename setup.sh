#!/bin/sh
mkdir -p data/log
mkdir -p ui/css/fonts
mkdir -p /tmp/lamassu-fonts
rm /tmp/lamassu-fonts/* -rf
echo "Downloading fonts..."
curl -# -L https://github.com/adobe-fonts/source-sans-pro/archive/2.010R-ro/1.065R-it.zip > /tmp/lamassu-fonts/source-sans-pro.zip
curl -# -L https://github.com/adobe-fonts/source-code-pro/archive/1.017R.zip > /tmp/lamassu-fonts/source-code-pro.zip
echo "Installing fonts in lamassu-machine..."
unzip -q /tmp/lamassu-fonts/source-sans-pro.zip -d /tmp/lamassu-fonts
unzip -q /tmp/lamassu-fonts/source-code-pro.zip -d /tmp/lamassu-fonts
cp -rf /tmp/lamassu-fonts/source-sans-pro-*/TTF ui/css/fonts
cp -rf /tmp/lamassu-fonts/source-code-pro-*/TTF ui/css/fonts
echo "Setting up config files..."
cp device_config.sample.json device_config.json
echo "Setting up keys..."
cp data/client.sample.key data/client.key
cp data/client.sample.pem data/client.pem
echo "Successful installation."
