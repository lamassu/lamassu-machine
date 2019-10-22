#!/bin/bash
set -e

[ -z "$1" ] && echo "Specify target platform in the first argument" && exit 1

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

cp -r $MACHINE_DIR/ui $TARGET_MACHINE_DIR
$MACHINE_DIR/node_modules/.bin/copy-node-modules $MACHINE_DIR $TARGET_MACHINE_DIR

# Remove native modules
node $MACHINE_DIR/deploy/remove-modules.js $TARGET_MACHINE_DIR/node_modules --rem-native

if [ $1 == "aaeon" ] ; then
  mkdir -p $EXPORT_DIR/hardware/aaeon/node_modules
  cp -R $MACHINE_DIR/node_modules $EXPORT_DIR/hardware/aaeon/
  node $MACHINE_DIR/deploy/remove-modules.js $EXPORT_DIR/hardware/aaeon/node_modules --rem-interpreted
  if [ $2 == "--copy-device-config" ] ; then
    cp $MACHINE_DIR/device_config.json $EXPORT_DIR/hardware/aaeon/
  fi
elif [ $1 == "ssuboard" ] ; then
  mkdir -p $EXPORT_DIR/hardware/ssuboard/node_modules
  cp -R $MACHINE_DIR/node_modules $EXPORT_DIR/hardware/ssuboard/
  node $MACHINE_DIR/deploy/remove-modules.js $EXPORT_DIR/hardware/ssuboard/node_modules --rem-interpreted
  if [ $2 == "--copy-device-config" ] ; then
    cp $MACHINE_DIR/device_config.json $EXPORT_DIR/hardware/ssuboard/
  fi
elif [ $1 == "upboard" ] ; then
  mkdir -p $EXPORT_DIR/hardware/upboard/node_modules
  cp -R $MACHINE_DIR/node_modules $EXPORT_DIR/hardware/upboard/
  node $MACHINE_DIR/deploy/remove-modules.js $EXPORT_DIR/hardware/upboard/node_modules --rem-interpreted
  if [ $2 == "--copy-device-config" ] ; then
    cp $MACHINE_DIR/device_config.json $EXPORT_DIR/hardware/upboard/
  fi
else
  echo "The first argument should the target's platform name: aaeon, ssuboard, upboard"
  exit 1
fi

# Copy fonts
mkdir -p $TARGET_MACHINE_DIR/ui/css/fonts
cp $BUILD_FILES_DIR/fonts/*.ttf $TARGET_MACHINE_DIR/ui/css/fonts
cp $BUILD_FILES_DIR/fonts/*.woff $TARGET_MACHINE_DIR/ui/css/fonts
cp -a $BUILD_FILES_DIR/fonts/SourceSansPro $TARGET_MACHINE_DIR/ui/css/fonts
cp -a $BUILD_FILES_DIR/fonts/BPmono $TARGET_MACHINE_DIR/ui/css/fonts
cp -a $BUILD_FILES_DIR/fonts/MontHeavy $TARGET_MACHINE_DIR/ui/css/fonts
cp -a $BUILD_FILES_DIR/fonts/MuseoSans $TARGET_MACHINE_DIR/ui/css/fonts
cp -a $BUILD_FILES_DIR/fonts/NotoKufiArabic $TARGET_MACHINE_DIR/ui/css/fonts
cp -a $BUILD_FILES_DIR/fonts/Rubik $TARGET_MACHINE_DIR/ui/css/fonts

git --git-dir=$MACHINE_DIR/.git rev-parse --short HEAD > $EXPORT_DIR/revision.txt
cat $EXPORT_DIR/revision.txt
