#!/usr/bin/env bash
set -e

echo "Removing connection data and client keys"
rm /opt/lamassu-machine/data/connection_info.json
rm /opt/lamassu-machine/data/client.pem
rm /opt/lamassu-machine/data/client.key

echo "Restarting l-m"
supervisorctl restart lamassu-machine

echo "Clearing command line history"
history -cw

echo
echo "All done"
