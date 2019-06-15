#!/bin/bash
set -e

SUB_DIR=cc-watchdog
SCRIPT_DIR=$(dirname $0)

EXPORT_ROOT=${1-$LAMASSU_EXPORT}

if [ -z "$EXPORT_ROOT" ]
  then
    echo "Builds a lamassu-machine package file for updating watchdog for Crafty Chnemu (v7.3)."
    echo -e "\nUsage:"
    echo -e "build <target directory>\n"
    exit 1
 fi

MACHINE_DIR=$SCRIPT_DIR/../..
EXPORT_BASE=$EXPORT_ROOT/$SUB_DIR
EXPORT_DIR=$EXPORT_BASE/package
UPDATESCRIPT=$SCRIPT_DIR/updatescript.js
rm -rf $EXPORT_DIR
mkdir -p $EXPORT_DIR

cp $MACHINE_DIR/watchdog.js $EXPORT_DIR

# Needed for update script on target device
cp $MACHINE_DIR/node_modules/async/lib/async.js $EXPORT_DIR
cp $SCRIPT_DIR/../report.js $EXPORT_DIR
cp $UPDATESCRIPT $EXPORT_DIR

echo "Building..."
node $SCRIPT_DIR/../build.js $EXPORT_BASE
rm -rf $EXPORT_DIR
echo "Complete."
