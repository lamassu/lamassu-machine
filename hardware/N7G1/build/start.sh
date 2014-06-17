NETWORKS="network={
	ssid=\"SpotApartments2\"
	psk=a2b1edd21be9cc49327ff442d5558f39a3031d78380af62f625b54191fd691bd
}
"
mount -o remount,rw "/dev/root"
echo "$NETWORKS" > /etc/wpa_supplicant.conf
