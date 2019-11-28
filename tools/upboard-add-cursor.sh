#!/bin/bash

sudo rm /etc/sddm.conf

cat > sddm.conf << EOL
[Autologin]
User=ubilinux
Session=lxqt.desktop

[X11]
ServerArguments=-nolisten tcp
EOL

sudo mv sddm.conf /etc/

sudo reboot