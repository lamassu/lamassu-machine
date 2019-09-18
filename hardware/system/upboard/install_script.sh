#!/bin/bash
set -e

sudo apt update && sudo apt full-upgrade -y

# install dependencies
sudo apt install build-essential chromium curl git supervisor yasm -y
sudo apt install libavcodec-dev libavformat-dev libswscale-dev -y

curl -sL https://deb.nodesource.com/setup_8.x | sed 's/DISTRO=\$(lsb_release -c -s)/DISTRO=stretch/g' > setup_8.x.sh

sudo -E bash setup_8.x.sh
sudo apt install nodejs -y

git clone https://github.com/lamassu/lamassu-led
git clone https://github.com/lamassu/lamassu-machine -b crafty-chnemu

# install lamsasu-led
cd lamassu-led
sed -i 's/spidev1\.0/spidev2\.0/g' main.c
gcc *.c -Wall -O2 -lm -o leds
sudo mv leds /opt

cd .. && rm -rf lamassu-led && cd lamassu-machine

# scanner libs
curl -sS https://ssubucket.ams3.digitaloceanspaces.com/barcodescannerlibs.txz | xzcat | sudo tar -x -C /usr/local/lib --strip-components=2 barcodescannerlibs/amd64/libBarcodeScanner.a

# install dependencies
npm install --production
npm i @joepie91/v4l2camera@1.0.5
mv node_modules/@joepie91/v4l2camera node_modules/

# device config
cp hardware/codebase/upboard/device_config.json ./

# Certs and licenses
curl -sS https://ssubucket.ams3.digitaloceanspaces.com/ssuboard/licenses-2018.12.28.json.xz.gpg | gpg --passphrase $GPG_PASSWORD --decrypt | xz -dc > licenses.json
sudo mkdir -p /opt/certs
curl -sS https://ssubucket.ams3.digitaloceanspaces.com/ssuboard/certs-2018.12.28.tar.xz | sudo tar -xJ -C /opt/certs

# final machine path
cd .. && sudo mv lamassu-machine /opt

# Autologin
cat > sddm.conf << EOL
[Autologin]
User=ubilinux
Session=lxqt.desktop
EOL

sudo mv sddm.conf /etc/

# Supervisor config files
sudo cp -r /opt/lamassu-machine/hardware/system/upboard/supervisor/conf.d/ /etc/supervisor/
sudo sed -i 's/user=machine/user=ubilinux/g' /etc/supervisor/conf.d/lamassu-browser.conf

# Udev config files
sudo cp -r /opt/lamassu-machine/hardware/system/upboard/udev/* /etc/udev/rules.d/

# change password
sudo echo `ubilinux:${USER_PASSWORD}` | chpasswd

# remove system tray
sudo apt-get purge lxqt-panel cmst -y

# change grub timeout
sudo sed -i 's/GRUB_TIMEOUT=5/GRUB_TIMEOUT=0/g' /etc/default/grub

sudo reboot