#!/bin/bash
set -e

SCRIPT_DIR=$(dirname $0)

MANATEE_ROOT=${1%/}

EXPORT_ROOT=${2-$LAMASSU_EXPORT}

if [ -z "$EXPORT_ROOT" -o -z "$MANATEE_ROOT" ]
  then
    echo "Builds a lamassu-machine Manatee barcode scanning package file for deploying to a device."
    echo -e "\nUsage:"
    echo -e "build  <manatee directory> <target directory>\n"
    echo "You may also set LAMASSU_EXPORT in lieu of <target directory>."
    exit 1
fi

SUB_DIR=manatee
EXPORT_BASE=$EXPORT_ROOT/$SUB_DIR
EXPORT_DIR=$EXPORT_BASE/package
UPDATESCRIPT=$SCRIPT_DIR/updateinit.js
MACHINE_DIR=$SCRIPT_DIR/../..
rm -rf $EXPORT_DIR
mkdir -p $EXPORT_DIR

# Needed for updateinit script on target device
cp $MACHINE_DIR/node_modules/async/lib/async.js $EXPORT_DIR
cp $SCRIPT_DIR/../report.js $EXPORT_DIR

# Manatee
cp -a $MANATEE_ROOT $EXPORT_DIR

# Installation scripts
cp -a $SCRIPT_DIR/install $EXPORT_DIR

cp $UPDATESCRIPT $EXPORT_DIR/updatescript.js

node $SCRIPT_DIR/../build.js $EXPORT_BASE
