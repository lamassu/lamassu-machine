#!/bin/bash

while true ; do
    # Allow system some time to establish connection
    sleep 180

    if ifconfig wlan0 | grep -q "inet addr:" ; then
        echo "Network is up"
    else
        echo "Network connection is down, resetting interface."
        ifdown --force wlan0
        sleep 5
        ifup wlan0
    fi
done