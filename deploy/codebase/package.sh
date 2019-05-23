#!/bin/bash
set -e

SUB_DIR=codebase
SCRIPT_DIR=$(dirname $0)
MACHINE_DIR=$SCRIPT_DIR/../..
EXPORT_ROOT=$MACHINE_DIR/build
EXPORT_BASE=$EXPORT_ROOT/$SUB_DIR

node $SCRIPT_DIR/../build.js $EXPORT_BASE
