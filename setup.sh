#!/bin/sh

mkdir -p /usr/local/share/sencha/config
mkdir -p /var/lib/sencha/config
mkdir -p /var/lib/sencha/log
cp device_config.json /usr/local/share/sencha/config
cp unit_config.json /usr/local/share/sencha/config
cp user_config.json /var/lib/sencha/config
