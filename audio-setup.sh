#!/bin/bash
echo 91 > /sys/class/gpio/export
echo out > /sys/class/gpio/gpio91/direction
echo 1 > /sys/class/gpio/gpio91/value

echo 66 > /sys/class/gpio/export
echo out > /sys/class/gpio/gpio66/direction
echo 1 > /sys/class/gpio/gpio66/value

amixer set PCM 75%
