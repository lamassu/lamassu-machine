#!/bin/bash
set -e

SCRIPT_DIR=$(dirname $0)

EXPORT_ROOT=${1-$LAMASSU_EXPORT}

if [ -z "$EXPORT_ROOT" ]
  then
    echo "Builds a lamassu-machine system package file for deploying to a device."
    echo -e "\nUsage:"
    echo -e "build <target directory>\n"
    echo "You may also set LAMASSU_EXPORT in lieu of <target directory>."
    exit 1
fi

SUB_DIR=system
EXPORT_BASE=$EXPORT_ROOT/$SUB_DIR
EXPORT_DIR=$EXPORT_BASE/package
MACHINE_DIR=$SCRIPT_DIR/../..
SYSTEM_DIR=$MACHINE_DIR/hardware/system
UPDATESCRIPT=$SCRIPT_DIR/updateinit.js
rm -rf $EXPORT_DIR
mkdir -p $EXPORT_DIR

# Needed for updateinit script on target device
cp $MACHINE_DIR/node_modules/async/lib/async.js $EXPORT_DIR 
cp $SCRIPT_DIR/../report.js $EXPORT_DIR

# System files
cp -a $SYSTEM_DIR $EXPORT_DIR

cp $UPDATESCRIPT $EXPORT_DIR/updatescript.js

# Note, this is only needed for early release aaeons
mkdir -p $EXPORT_DIR/native/aaeon/scripts
cp $SCRIPT_DIR/updateinit-aaeon.js $EXPORT_DIR/native/aaeon/scripts/updateinit.js
cp $MACHINE_DIR/node_modules/async/lib/async.js $EXPORT_DIR/native/aaeon/scripts
cp $SCRIPT_DIR/../report.js $EXPORT_DIR/native/aaeon/scripts

node $SCRIPT_DIR/../build.js $EXPORT_BASE 'fonts' '0.2.0'
