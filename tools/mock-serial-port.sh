#!/bin/bash
sudo socat -d -d pty,raw,echo=0,link=/dev/tty9 pty,raw,echo=0,link=/dev/tty11
