#!/usr/bin/env bash
set -e

echo "Stopping lamassu processes and clearing their logs..."
supervisorctl stop all
supervisorctl clear all

echo "Removing lamassu-machine persistent data..."
rm -rf /opt/lamassu-machine/data/*

for dir in '/home/machine' '/home/lamassu' '/root'; do
  [ -d "${dir}" ] && echo "history -c" > "${dir}/.bash_logout"
done

echo > /etc/udev/rules.d/70-persistent-net.rules

echo "All done!"

