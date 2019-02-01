#!/bin/bash
set -e

SUB_DIR=codebase
SCRIPT_DIR=$(dirname $0)
MACHINE_DIR=$SCRIPT_DIR/../..
EXPORT_ROOT=$MACHINE_DIR/build

if [ -z "$EXPORT_ROOT" ]
  then
    echo "Builds a lamassu-machine package file for deploying to a device."
    echo -e "\nUsage:"
    echo -e "build <target directory>\n"
    echo "You may also set LAMASSU_EXPORT in lieu of <target directory>."
    exit 1
fi

EXPORT_BASE=$EXPORT_ROOT/$SUB_DIR
EXPORT_DIR=$EXPORT_BASE/subpackage
EXPORT_SCRIPT_DIR=$EXPORT_BASE/package
TARGET_MACHINE_DIR=$EXPORT_DIR/lamassu-machine
HARDWARE_DIR=$MACHINE_DIR/hardware/codebase
BUILD_FILES_DIR=$MACHINE_DIR/deploy-files
UPDATESCRIPT=$SCRIPT_DIR/updateinit.js
TARGET_MODULES_DIR=$TARGET_MACHINE_DIR/node_modules

rm -rf $EXPORT_SCRIPT_DIR
rm -rf $EXPORT_DIR
mkdir -p $EXPORT_DIR
mkdir -p $EXPORT_SCRIPT_DIR
mkdir -p $TARGET_MODULES_DIR
mkdir -p $TARGET_MACHINE_DIR/bin

# Compile app.js
npm run build > /dev/null

# Needed for updateinit script on target device
cp $MACHINE_DIR/node_modules/async/lib/async.js $EXPORT_SCRIPT_DIR
cp $SCRIPT_DIR/../report.js $EXPORT_SCRIPT_DIR
cp $UPDATESCRIPT $EXPORT_SCRIPT_DIR/updatescript.js

# Codebase
cp $MACHINE_DIR/*.js $TARGET_MACHINE_DIR
cp $MACHINE_DIR/software_config.json $TARGET_MACHINE_DIR
cp $MACHINE_DIR/licenses.json $TARGET_MACHINE_DIR
cp $MACHINE_DIR/package.json $TARGET_MACHINE_DIR
cp -r $MACHINE_DIR/lib $TARGET_MACHINE_DIR
cp -a $MACHINE_DIR/exec $TARGET_MACHINE_DIR
cp $MACHINE_DIR/bin/lamassu-machine $TARGET_MACHINE_DIR/bin
cp $MACHINE_DIR/bin/cam.js $TARGET_MACHINE_DIR/bin
cp $MACHINE_DIR/bin/mock-cam.js $TARGET_MACHINE_DIR/bin

cp -r $MACHINE_DIR/ui $TARGET_MACHINE_DIR
$MACHINE_DIR/node_modules/.bin/copy-node-modules $MACHINE_DIR $TARGET_MACHINE_DIR

# remove native modules
node $MACHINE_DIR/deploy/remove-modules.js $TARGET_MACHINE_DIR/node_modules
cp -a $HARDWARE_DIR $EXPORT_DIR/hardware

# Untar deploy-files
tar -xvf $MACHINE_DIR/deploy-files.tar.gz

# Copy back basic fonts
mkdir -p $TARGET_MACHINE_DIR/ui/css/fonts
cp $BUILD_FILES_DIR/fonts/*.ttf $TARGET_MACHINE_DIR/ui/css/fonts
cp $BUILD_FILES_DIR/fonts/*.woff $TARGET_MACHINE_DIR/ui/css/fonts
cp -a $BUILD_FILES_DIR/fonts/SourceSansPro $TARGET_MACHINE_DIR/ui/css/fonts

# Copy licences.json
cp $BUILD_FILES_DIR/licenses.json $TARGET_MACHINE_DIR/licenses.json

# Copy aaeon node_modules
cp -R $BUILD_FILES_DIR/aaeon_node_modules $EXPORT_DIR/hardware/aaeon/node_modules

# Copy libBarcodeScanner.json
mkdir $EXPORT_DIR/hardware/aaeon/lib/
cp $BUILD_FILES_DIR/libBarcodeScanner.so $EXPORT_DIR/hardware/aaeon/lib/


# Reduce package size, these are unneeded
rm -rf $TARGET_MODULES_DIR/clim/example

# Note, this is only needed for early release aaeons
mkdir -p $EXPORT_DIR/native/aaeon/scripts
cp $SCRIPT_DIR/updateinit-aaeon.js $EXPORT_DIR/native/aaeon/scripts/updateinit.js
cp $MACHINE_DIR/node_modules/async/lib/async.js $EXPORT_DIR/native/aaeon/scripts
cp $SCRIPT_DIR/../report.js $EXPORT_DIR/native/aaeon/scripts

git --git-dir=$MACHINE_DIR/.git rev-parse --short HEAD > $EXPORT_DIR/revision.txt
cat $EXPORT_DIR/revision.txt

node $SCRIPT_DIR/../build.js $EXPORT_BASE

rm -rf $EXPORT_DIR
