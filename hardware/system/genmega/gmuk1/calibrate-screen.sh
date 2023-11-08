#!/usr/bin/env sh
xrandr -o left # normal, inverted, left, right
identityMat='1 0 0 0 1 0 0 0 1'
leftRotateMat='0 -1 1 1 0 0 0 0 1'
rightRotateMat='0 1 0 -1 0 1 0 0 1'
xinput set-prop 'Silicon Works Multi-touch Device' --type=float 'Coordinate Transformation Matrix' $leftRotateMat
xinput set-prop 'Silicon Works Multi-touch SW4101C' --type=float 'Coordinate Transformation Matrix' $leftRotateMat
xset s off
xset s noblank
xset -dpms
