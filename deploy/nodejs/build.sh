#!/bin/bash
set -e

SCRIPT_DIR=$(dirname $0)

SCRIPT=updatenode.js
MACHINE_DIR=$SCRIPT_DIR/../..
EXPORT_ROOT=$MACHINE_DIR/build
HARDWARE_TARGET=$1

if [ -z "$HARDWARE_TARGET" ]
  then
    echo "Builds a lamassu-machine nodejs binary package for deploying to a device."
    echo -e "\nUsage:"
    echo -e "build <hardware target (N7G1/aaeon)>\n"
    exit 1
fi

SUB_DIR=nodejs
EXPORT_BASE=$EXPORT_ROOT/$SUB_DIR
EXPORT_DIR=$EXPORT_BASE/package
UPDATESCRIPT=$SCRIPT_DIR/$SCRIPT
NODE_PACKAGE=$MACHINE_DIR/hardware/binaries/$HARDWARE_TARGET/node.gz
rm -rf $EXPORT_DIR
mkdir -p $EXPORT_DIR

# Needed for updateinit script on target device
cp $MACHINE_DIR/node_modules/async/lib/async.js $EXPORT_DIR
cp -a $SCRIPT_DIR/node_modules $EXPORT_DIR
cp $SCRIPT_DIR/../report.js $EXPORT_DIR

cp $UPDATESCRIPT $EXPORT_DIR/updatescript.js
cp $NODE_PACKAGE $EXPORT_DIR/node.gz

echo "Building..."
node $SCRIPT_DIR/../build.js $EXPORT_BASE
echo "Success."
