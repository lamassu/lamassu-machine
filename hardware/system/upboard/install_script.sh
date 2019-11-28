#!/bin/bash
set -e

MACHINE=$1
TAG=$2

if [ -z $1 ] || [ -z $2 ]; then
  echo 'usage: install_script <machine> <version>'
  exit 1
fi

if [ "$MACHINE" != "gaia" ] && [ "$MACHINE" != "sintra" ]; then
  echo 'Install script expects "gaia" or "sintra" as machine parameter'
  exit 1
fi

sudo apt update && sudo apt full-upgrade -y

# install dependencies
sudo apt install build-essential chromium curl git supervisor yasm -y

curl -sL https://deb.nodesource.com/setup_8.x | sed 's/DISTRO=\$(lsb_release -c -s)/DISTRO=stretch/g' > setup_8.x.sh

sudo -E bash setup_8.x.sh
sudo apt install nodejs -y

git clone https://github.com/lamassu/lamassu-led
git clone https://github.com/lamassu/lamassu-machine -b $TAG

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
cp hardware/codebase/upboard/$MACHINE/device_config.json ./

# Certs and licenses
curl -sS https://ssubucket.ams3.digitaloceanspaces.com/ssuboard/licenses-2018.12.28.json.xz.gpg | gpg --batch --passphrase $GPG_PASSWORD --decrypt | xz -dc > licenses.json
sudo mkdir -p /opt/certs
curl -sS https://ssubucket.ams3.digitaloceanspaces.com/ssuboard/certs-2018.12.28.tar.xz | sudo tar -xJ -C /opt/certs

curl -sS https://ssubucket.ams3.digitaloceanspaces.com/ssuboard/fonts-2019.11.26.tar.xz | sudo tar -xJ -C ui/

# final machine path
cd .. && sudo mv lamassu-machine /opt

# Autologin
cat > sddm.conf << EOL
[Autologin]
User=ubilinux
Session=lxqt.desktop

[X11]
ServerArguments=-nolisten tcp -nocursor
EOL

sudo mv sddm.conf /etc/

# Disable screensaver and power saver
cat > .xsessionrc << EOL
xset s off
xset s noblank
xset -dpms
EOL

# Supervisor config files
sudo cp -r /opt/lamassu-machine/hardware/system/upboard/$MACHINE/supervisor/conf.d/ /etc/supervisor/
sudo sed -i 's/user=machine/user=ubilinux/g' /etc/supervisor/conf.d/lamassu-browser.conf

# Udev config files
sudo cp -r /opt/lamassu-machine/hardware/system/upboard/$MACHINE/udev/* /etc/udev/rules.d/

# change password
echo ubilinux:$USER_PASSWORD | sudo chpasswd

# remove system tray
sudo apt-get purge lxqt-panel cmst xscreensaver -y

# change grub timeout
sudo sed -i 's/GRUB_TIMEOUT=5/GRUB_TIMEOUT=0/g' /etc/default/grub
sudo update-grub

sudo reboot