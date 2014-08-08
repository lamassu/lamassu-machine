#!/bin/bash
set -e

SUB_DIR=codebase
SCRIPT_DIR=$(dirname $0)

EXPORT_ROOT=${1-$LAMASSU_EXPORT}

if [ -z "$EXPORT_ROOT" ]
  then
    echo "Builds a lamassu-machine package file for deploying to a device."
    echo -e "\nUsage:"
    echo -e "build <target directory>\n"
    echo "You may also set LAMASSU_EXPORT in lieu of <target directory>."
    exit 1
fi

EXPORT_BASE=$EXPORT_ROOT/$SUB_DIR
EXPORT_DIR=$EXPORT_BASE/package
MACHINE_DIR=$SCRIPT_DIR/../..
TARGET_MACHINE_DIR=$EXPORT_DIR/lamassu-machine
HARDWARE_DIR=$MACHINE_DIR/hardware/codebase
UPDATESCRIPT=$SCRIPT_DIR/updateinit.js
TARGET_MODULES_DIR=$TARGET_MACHINE_DIR/node_modules
rm -rf $EXPORT_DIR
mkdir -p $EXPORT_DIR
mkdir -p $TARGET_MACHINE_DIR

# Needed for updateinit script on target device
cp $MACHINE_DIR/node_modules/async/lib/async.js $EXPORT_DIR
cp $SCRIPT_DIR/../report.js $EXPORT_DIR

# Codebase
cp $MACHINE_DIR/*.js $TARGET_MACHINE_DIR
cp $MACHINE_DIR/software_config.json $TARGET_MACHINE_DIR
cp $MACHINE_DIR/package.json $TARGET_MACHINE_DIR
cp -r $MACHINE_DIR/lib $TARGET_MACHINE_DIR
cp -r $MACHINE_DIR/bin $TARGET_MACHINE_DIR
cp -r $MACHINE_DIR/ui $TARGET_MACHINE_DIR
cp -r $MACHINE_DIR/node_modules $TARGET_MACHINE_DIR
cp -r $HARDWARE_DIR $EXPORT_DIR/hardware

# Remove locally installed files
rm -rf $TARGET_MACHINE_DIR/ui/css/fonts
rm -f $TARGET_MACHINE_DIR/ui/css/fonts.css

# Natively compiled modules, will be copied from hardware-specific directories
rm -rf $TARGET_MODULES_DIR/ws
rm -rf $TARGET_MODULES_DIR/serialport

# Reduce package size, these are unneeded
rm -rf $TARGET_MODULES_DIR/jsonquest/node_modules/xml2js
rm -rf $TARGET_MODULES_DIR/jsonquest/node_modules/mocha
rm -rf $TARGET_MODULES_DIR/clim/example
rm -rf $TARGET_MODULES_DIR/sha512crypt-node

cp $UPDATESCRIPT $EXPORT_DIR/updatescript.js

# Note, this is only needed for early release aaeons
mkdir -p $EXPORT_DIR/native/aaeon/scripts
cp $SCRIPT_DIR/updateinit-aaeon.js $EXPORT_DIR/native/aaeon/scripts/updateinit.js
cp $MACHINE_DIR/node_modules/async/lib/async.js $EXPORT_DIR/native/aaeon/scripts
cp $SCRIPT_DIR/../report.js $EXPORT_DIR/native/aaeon/scripts

git --git-dir=$MACHINE_DIR/.git rev-parse --short HEAD > $EXPORT_DIR/revision.txt
cat $EXPORT_DIR/revision.txt

node $SCRIPT_DIR/../build.js $EXPORT_BASE
