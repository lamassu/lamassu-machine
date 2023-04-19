#!/bin/bash
sed "s/WebSocket(.*)/WebSocket('ws:\/\/' + location.hostname + '\/ws')/g" ui/js/app.js > ui/js/docker-app.js
sed "s/app.js/docker-app.js/g" ui/start.html > ui/start-docker.html
sed -i "s/..\/node_modules\///g"  ui/start-docker.html
sed "s/app.js/test-app.js/g" ui/start.html > ui/start-test.html
sed -i "s/..\/node_modules\///g"  ui/start-test.html