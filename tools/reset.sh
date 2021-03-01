#!/usr/bin/env bash
set -e

echo "Stopping lamassu processes and clearing their logs..."
supervisorctl stop lamassu-audio lamassu-browser lamassu-machine lamassu-updater lamassu-watchdog
supervisorctl clear lamassu-audio lamassu-browser lamassu-machine lamassu-updater lamassu-watchdog

echo "Removing lamassu-machine persistent data..."
rm -rf /opt/lamassu-machine/data/connection_info.json \
       /opt/lamassu-machine/data/client.pem \
       /opt/lamassu-machine/data/client.key \
       /opt/lamassu-machine/data/machine.log \
       /opt/lamassu-machine/data/u2f.json \
       /opt/lamassu-machine/data/tx-db \
       /opt/lamassu-machine/data/operator-info.json \
       /opt/lamassu-machine/data/machine-info.json \


if [ -d "/home/machine" ]; then
  touch /home/machine/.bash_logout
  echo "history -c" > /home/machine/.bash_logout
fi

if [ -d "/home/debian" ]; then
  touch /home/debian/.bash_logout
  echo "history -c" > /home/debian/.bash_logout
fi

touch /root/.bash_logout
echo "history -c" > /root/.bash_logout

echo > /etc/udev/rules.d/70-persistent-net.rules

echo "All done!"

