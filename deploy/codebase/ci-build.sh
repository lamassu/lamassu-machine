#!/bin/bash
set -e

# Function to set up a specific board and model
setup_board_model() {
  local board="$1"
  local model="$2"
  local config_flag="$3"

  # Define export directories for the board and model
  board_export_dir="$EXPORT_DIR/hardware/$board"
  model_export_dir="$board_export_dir/$model"
  supervisor_export_dir="$EXPORT_DIR/supervisor/$board/$model"

  # Create necessary directories
  mkdir -p "$board_export_dir/node_modules"
  mkdir -p "$supervisor_export_dir"

  # Copy supervisor configuration files for the board and model
  cp "$SYSTEM_DIR/$board/$model/supervisor/conf.d/"* "$supervisor_export_dir/"

  # Copy node_modules for the board
  cp -R "$MACHINE_DIR/node_modules" "$board_export_dir/"

  # Remove interpreted modules for the board
  node "$MACHINE_DIR/deploy/remove-modules.js" "$board_export_dir/node_modules" --rem-interpreted

  # Optionally copy the device config
  mkdir $model_export_dir
  cp "$CODEBASE_DIR/$board/$model/device_config.json" "$model_export_dir/"

}

# Basic initialization and directories setup
SUB_DIR=codebase
SCRIPT_DIR=$(dirname $0)
MACHINE_DIR=$SCRIPT_DIR/../..
EXPORT_ROOT=$MACHINE_DIR/build
EXPORT_BASE=$EXPORT_ROOT/$SUB_DIR
EXPORT_DIR=$EXPORT_BASE/subpackage
EXPORT_SCRIPT_DIR=$EXPORT_BASE/package
TARGET_MACHINE_DIR=$EXPORT_DIR/lamassu-machine
CODEBASE_DIR=$MACHINE_DIR/hardware/codebase
SYSTEM_DIR=$MACHINE_DIR/hardware/system
BUILD_FILES_DIR=$MACHINE_DIR/deploy-files
TARGET_MODULES_DIR=$TARGET_MACHINE_DIR/node_modules

# Setup export directories
mkdir -p $EXPORT_DIR
mkdir -p $EXPORT_SCRIPT_DIR
mkdir -p $TARGET_MODULES_DIR
mkdir -p $TARGET_MACHINE_DIR/bin

# Copy common files for the setup
cp $MACHINE_DIR/node_modules/async/lib/async.js $EXPORT_SCRIPT_DIR
cp $SCRIPT_DIR/../report.js $EXPORT_SCRIPT_DIR
cp $SCRIPT_DIR/updateinit.js $EXPORT_SCRIPT_DIR/updatescript.js

rm -rf $TARGET_MACHINE_DIR/verify
mkdir $TARGET_MACHINE_DIR/verify
cp $MACHINE_DIR/verify/* $TARGET_MACHINE_DIR/verify/

# Codebase setup
cp $MACHINE_DIR/*.js $TARGET_MACHINE_DIR
cp $MACHINE_DIR/package.json $TARGET_MACHINE_DIR
cp -r $MACHINE_DIR/lib $TARGET_MACHINE_DIR
cp -r $MACHINE_DIR/camera-streamer $TARGET_MACHINE_DIR
cp -a $MACHINE_DIR/exec $TARGET_MACHINE_DIR
cp $MACHINE_DIR/bin/lamassu-machine $TARGET_MACHINE_DIR/bin
cp $MACHINE_DIR/bin/cam.js $TARGET_MACHINE_DIR/bin
cp -r $MACHINE_DIR/ui $TARGET_MACHINE_DIR
$MACHINE_DIR/node_modules/.bin/copy-node-modules $MACHINE_DIR $TARGET_MACHINE_DIR
node $MACHINE_DIR/deploy/remove-modules.js $TARGET_MACHINE_DIR/node_modules --rem-native

# Fonts setup
mkdir -p $TARGET_MACHINE_DIR/ui/css/fonts
cp -a $BUILD_FILES_DIR/fonts/* $TARGET_MACHINE_DIR/ui/css/fonts

## Copy the revision information
#git --git-dir=$MACHINE_DIR/.git rev-parse --short HEAD > $EXPORT_DIR/revision.txt
#cat $EXPORT_DIR/revision.txt

# Create lists of boards and models
declare -A boards_and_models=(
 # ["aaeon"]=""
  ["upboard"]="sintra gaia tejo aveiro"
  ["up4000"]="sintra gaia tejo aveiro"
  ["coincloud"]="jcm-ipro-rc mei-bnr mei-scr"
  ["generalbytes"]="batm3 batm7in"
  ["genmega"]="gemini gmuk1 gmuk2"
)

# Loop through each board and its models
for board in "${!boards_and_models[@]}"; do
  models="${boards_and_models[$board]}"
  if [[ -z "$models" ]]; then
    # For boards with no models (e.g., aaeon), run setup without model
    setup_board_model "$board" ""
  else
    for model in $models; do
      setup_board_model "$board" "$model"
    done
  fi
done
