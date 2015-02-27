#!/bin/bash
set -e

SCRIPT_DIR=$(dirname $0)

SCRIPT=$1
MACHINE_DIR=$SCRIPT_DIR/../..
EXPORT_ROOT=$MACHINE_DIR/build

if [ -z "$SCRIPT" -o -z "$EXPORT_ROOT" ]
  then
    echo "Builds a lamassu-machine command package file for deploying to a device."
    echo -e "\nUsage:"
    echo -e "build <command> <target directory>\n"
    echo "You may also set LAMASSU_EXPORT in lieu of <target directory>."
    exit 1
fi

SUB_DIR=$SCRIPT
EXPORT_BASE=$EXPORT_ROOT/$SUB_DIR
EXPORT_DIR=$EXPORT_BASE/package
MACHINE_DIR=$SCRIPT_DIR/../..
UPDATESCRIPT=$SCRIPT_DIR/$SCRIPT.js
rm -rf $EXPORT_DIR
mkdir -p $EXPORT_DIR

# Needed for updateinit script on target device
cp $MACHINE_DIR/node_modules/async/lib/async.js $EXPORT_DIR
cp $SCRIPT_DIR/../report.js $EXPORT_DIR

cp $UPDATESCRIPT $EXPORT_DIR/updatescript.js

node $SCRIPT_DIR/../build.js $EXPORT_BASE
