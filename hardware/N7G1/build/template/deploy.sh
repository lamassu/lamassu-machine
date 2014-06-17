#!/bin/sh
mount -o remount,rw "/dev/root"
rm -rf /usr/local/share/sencha/node
mkdir /usr/local/share/sencha/node
cp -a ./package/sencha-brain /usr/local/share/sencha/node
cp -a ./package/sencha-ui /usr/local/share/sencha/node
cp ./xinitrc.txt /usr/local/share/sencha/xinitrc
chmod 755 /etc/shadow
cp ./etc-shadow.txt /etc/shadow
chmod 640 /etc/shadow
cp -a ./creds/keys /usr/local/share/sencha
cp -a ./creds/certs /usr/local/share/sencha
cp -a ./creds/pubkeys /usr/local/share/sencha
