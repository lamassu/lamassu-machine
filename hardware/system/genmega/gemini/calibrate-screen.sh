#!/usr/bin/env sh
xrandr -o right # normal, inverted, left, right
identityMat='1 0 0 0 1 0 0 0 1'
leftRotateMat='0 -1 1 1 0 0 0 0 1'
rightRotateMat='0 1 0 -1 0 1 0 0 1'
xinput set-prop 'ILITEK ILITEK-TP' --type=float 'Coordinate Transformation Matrix' $leftRotateMat
xset s off
xset s noblank
xset -dpms
