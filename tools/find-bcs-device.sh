#!/usr/bin/env sh
for dev in /dev/ttyS*; do
	echo "Trying ${dev}"
	timeout 5s node tools/bcs.js "${dev}"
done
