# Preliminaries for Ubuntu 16.04
Installation for other distros may be slightly different.

## Packages

```
sudo add-apt-repository ppa:ubuntu-toolchain-r/test
sudo apt-get update
sudo apt-get install \
    build-essential cmake \
    libgtk2.0-dev pkg-config \
    libavcodec-dev libavformat-dev \
    libswscale-dev libpcsclite-dev \
    libv4l-dev libasound2-dev \
    gcc-4.9 g++-4.9
export CXX="g++-4.9"
sudo npm install -g node-gyp node-pre-gyp
```

## OpenCV@2.4.8

Install from APT

```
apt-get install -y libopencv-core-dev libopencv-highgui-dev libopencv-imgproc-dev libopencv-video-dev libopencv-features2d-dev libopencv-objdetect-dev
```

Or download the OpenCV source archive from https://opencv.org/releases.html and unpack it. In source folder run following:

```
mkdir build && cd build
cmake -D CMAKE_BUILD_TYPE=Release -D CMAKE_INSTALL_PREFIX=/usr/local ..
make -j7
sudo make install
```

# Preliminaries for MacOS

## OpenCV

Using Brew install OpenCV@2.4.8

```
brew install opencv@2
brew install pkg-config
```

# Installation

## Mac OS X NodeJS setup

```
curl -L https://git.io/n-install | bash -s -- -y lts
. ~/.bash_profile
```

## Installing packages

When running ``npm install``, don't worry about warnings or skipped optional dependencies. Make sure you're running the LTS version of node.

```
npm install
bash ./setup.sh
npm run build
node-gyp build
```

## Set up crypto wallets

The camera scanner mock reads the wallet addresses from your device_config.json file.You need to add a property under brain.mockCryptoQR where the key is the cryptoCode and the value is the address to be returned by the mocked camera.

Example:

```
{
  "brain": {
    ...
    "mockCryptoQR": {
      "BTC": "XXXXXXX"
    }
  },
  ...
```

## Run and pair

First, make sure lamassu-server is properly installed, configured, and running. See the ``INSTALL.md`` file in lamassu-server. Then, run lamassu-machine:

In first terminal window, run the bill validator simulator:

```
node bin/fake-bills.js
```

In second terminal window:

```
node bin/lamassu-machine --mockBillValidator --mockBillDispenser --mockCam \
--mockPair '<totem-from-admin>'
```

**IMPORTANT**: Make sure to use single quotes and not double quotes, or the shell will mess up the totem.

Click on ``Init``, then ``Scan``. You should see the start screen.

For subsequent runs, you don't need the ``--mockPair`` flag.

## Open in browser

In firefox or chrome, open the ``ui/start.html`` file. The URL should be something like this:

```
file://<lamassu-machine-dir>/ui/start.html?debug=dev
```

Don't worry if the fonts don't look right. The production software uses a proprietary font. Click on ``INIT`` (it should be fast on your computer), then ``SCAN``. After a few moments of pairing, you should see the start screen.

When the screen asks you to insert a bill, navigate to the terminal
where you opened the mock bill validator, and input **1**<kbd>Enter</kbd>
to insert a one dollar bill.

## If you're having trouble with v4l2camera module

```
export CXX="g++-4.9"
cd node_modules/
git clone https://github.com/bellbind/node-v4l2camera.git v4l2camera
cd v4l2camera
npm install
node-gyp rebuild
```

## If you're having trouble with speaker module

```
apt-get install -y libasound2-dev
```

## If you're having trouble with nfc-pcsc module

```
apt-get install -y libpcsclite-dev
```

## If you're having trouble with jpeg-turbo module

```
apt-get install -y yasm
```

