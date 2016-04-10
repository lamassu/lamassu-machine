#!/usr/bin/env bash
set -e

BUS_ID=$(dmesg | grep 'UVC Camera' | tail -1 | grep -Po '(?!usb1/)\d-\d' | tail -1)
echo 0 > /sys/bus/usb/devices/$BUS_ID/authorized
echo 1 > /sys/bus/usb/devices/$BUS_ID/authorized
