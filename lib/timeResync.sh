#!/usr/bin/env bash
set -e

service ntp stop
ntpdate -s time.nist.gov
service ntp start
