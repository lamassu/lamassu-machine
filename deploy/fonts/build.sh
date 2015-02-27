#!/bin/bash
set -e

FONT_DIR=$1

if [ -z "$FONT_DIR" ]
  then
    echo "Builds a lamassu-machine package file for installing a supplemental font."
    echo -e "\nUsage:"
    echo -e "build <supplemental font directory in fonts>\n"
    exit 1
fi

SUB_DIR=fonts
SCRIPT_DIR=$(dirname $0)
MACHINE_DIR=$SCRIPT_DIR/../..
EXPORT_ROOT=$MACHINE_DIR/build

EXPORT_BASE=$EXPORT_ROOT/$SUB_DIR/$FONT_DIR
EXPORT_DIR=$EXPORT_BASE/subpackage
EXPORT_SCRIPT_DIR=$EXPORT_BASE/package
HARDWARE_DIR=$MACHINE_DIR/hardware/codebase
UPDATESCRIPT=$SCRIPT_DIR/updateinit.js
rm -rf $EXPORT_SCRIPT_DIR
rm -rf $EXPORT_DIR
mkdir -p $EXPORT_DIR
mkdir -p $EXPORT_SCRIPT_DIR

# Needed for updateinit script on target device
cp $MACHINE_DIR/node_modules/async/lib/async.js $EXPORT_SCRIPT_DIR
mkdir -p $EXPORT_SCRIPT_DIR/node_modules
cp -a $MACHINE_DIR/node_modules/fs-extra $EXPORT_SCRIPT_DIR/node_modules
cp $SCRIPT_DIR/../report.js $EXPORT_SCRIPT_DIR
cp $UPDATESCRIPT $EXPORT_SCRIPT_DIR/updatescript.js

cp -a $MACHINE_DIR/fonts/$FONT_DIR $EXPORT_DIR

node $SCRIPT_DIR/../build.js $EXPORT_BASE

rm -rf $EXPORT_DIR
