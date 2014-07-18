#!/bin/sh
mkdir -p data/log
mkdir -p ui/css/fonts
mkdir /tmp/lamassu-fonts
curl -L http://sourceforge.net/projects/sourcesans.adobe/files/latest/download > /tmp/lamassu-fonts/source-pro.zip
unzip /tmp/source-pro.zip -d /tmp/lamassu-fonts
cp /tmp/lamassu-fonts/source-sans-pro-*/TTF/*.ttf ui/css/fonts
rm -rf /tmp/lamassu-fonts

