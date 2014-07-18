#!/bin/sh
mkdir -p data/log
mkdir -p ui/css/fonts
mkdir /tmp/lamassu-fonts
echo "Downloading fonts..."
curl -# -L http://sourceforge.net/projects/sourcesans.adobe/files/latest/download > /tmp/lamassu-fonts/source-pro.zip
unzip -q /tmp/source-pro.zip -d /tmp/lamassu-fonts
cp /tmp/lamassu-fonts/source-sans-pro-*/TTF/*.ttf ui/css/fonts
rm -rf /tmp/lamassu-fonts
cp device_config.sample.json device_config.json
cp data/client.sample.key data/client.key
cp data/client.sample.pem data/client.pem
echo "Successful installation."

