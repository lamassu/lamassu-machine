#!/usr/bin/env bash
set -e

echo "Stopping supervisor"
supervisorctl stop all

echo "Removing connection data and client keys"
rm /opt/lamassu-machine/data/connection_info.json
rm /opt/lamassu-machine/data/client.pem
rm /opt/lamassu-machine/data/client.key

echo "Clearing logs"
rm /var/log/supervisor/lamassu-*

echo "Restarting supervisor"
supervisorctl restart all

echo "Clearing command line history"
history -cw

echo
echo "All done"
