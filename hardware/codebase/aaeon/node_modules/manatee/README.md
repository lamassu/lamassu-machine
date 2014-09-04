# node-manatee

A node.js wrapper for the Manatee barcode library

# Build instructions

1. Copy your libBarcodeScanner.a or libBarcodeScanner.so library from Manatee
to your system library directory (e.g., /usr/local/lib).
(You can get a demo version for free by signing up on their site.)
2. ```node-gyp configure```
3. ```node-gyp build```
