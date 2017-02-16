#!/bin/sh
mv $HOME/Downloads/lamassu-bitcoin-machine-ui.zip .
unzip -qq lamassu-bitcoin-machine-ui.zip -d locales
ruby to_json.rb
rm -rf locales/*
