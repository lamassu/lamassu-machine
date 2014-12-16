// https://wiki.merproject.org/wiki/Community_Workspace/Tegra3/Nexus7

/*
All files are in /sys/devices/platform/tegra-i2c.2/i2c-2/2-0068/iio:device0
mpu6050 (sensor in Nexus 7) configuration:

configure buffer: "# echo 10 > buffer/length". 10 is choosen by me at random.
#  -- Glueckself 23:49, 28 January 2013 (UTC)

configure desired axes / values: "# echo 1 > scan_elements/in_*_en".
# This command has to be run on all desired values,
# "> in_*_en" is not a valid redirection.

enable buffer: "# echo 1 > buffer/enable"
The data can then be read from in_{accel,anglvel}_{x,y,z}_raw.
*/
