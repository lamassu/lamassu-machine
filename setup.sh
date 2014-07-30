#!/bin/sh
mkdir -p data/log
mkdir -p ui/css/fonts
mkdir /tmp/lamassu-fonts
echo "Downloading fonts..."
curl -# -L http://sourceforge.net/projects/sourcesans.adobe/files/latest/download > /tmp/lamassu-fonts/source-sans-pro.zip
curl -# -L http://sourceforge.net/projects/sourcecodepro.adobe/files/SourceCodePro_FontsOnly-1.017.zip/download > /tmp/lamassu-fonts/source-code-pro.zip
unzip -q /tmp/lamassu-fonts/source-sans-pro.zip -d /tmp/lamassu-fonts
unzip -q /tmp/lamassu-fonts/source-code-pro.zip -d /tmp/lamassu-fonts
deploy/fonts/install source-sans /tmp/lamassu-fonts/source-sans-pro-*/TTF .
deploy/fonts/install source-code-pro /tmp/lamassu-fonts/source-code-pro-*/TTF .
cp device_config.sample.json device_config.json
cp data/client.sample.key data/client.key
cp data/client.sample.pem data/client.pem
echo "Successful installation."

