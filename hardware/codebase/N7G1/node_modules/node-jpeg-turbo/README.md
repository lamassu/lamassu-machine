# node-jpeg-turbo

[![Build Status](https://travis-ci.org/sorccu/node-jpeg-turbo.svg?branch=master)](https://travis-ci.org/sorccu/node-jpeg-turbo) [![npm](https://img.shields.io/npm/v/jpeg-turbo.svg)](https://www.npmjs.com/package/jpeg-turbo) [![npm](https://img.shields.io/npm/dm/jpeg-turbo.svg)](https://www.npmjs.com/package/jpeg-turbo) [![npm](https://img.shields.io/npm/l/jpeg-turbo.svg)](LICENSE)

**node-jpeg-turbo** provides minimal [libjpeg-turbo](http://libjpeg-turbo.virtualgl.org/) bindings for [Node.js](https://nodejs.org/). It is very, very fast compared to other alternatives, such as [node-imagemagick-native](https://github.com/mash/node-imagemagick-native) or [jpeg-js](https://github.com/eugeneware/jpeg-js).

Please ask if you need more methods exposed.

## Requirements

Only the most recent version of Node still in [*active* Long-term Support](https://github.com/nodejs/LTS#lts-schedule) (currently v4) and greater are supported. Older versions may or may not work; they are not and will not be supported.

We provide prebuilt bindings for some platforms using [prebuilt-bindings](https://github.com/sorccu/node-prebuilt-bindings), meaning that you should not have to compile native bindings from source very often. The bindings are hosted at and automatically installed from our [GitHub Releases](https://github.com/sorccu/node-jpeg-turbo).

### If you must build from source

First, if you're building from the repo, make sure to init and update submodules or you'll get confusing errors about missing targets when building. We include `libjpeg-turbo` as a submodule.

```bash
git submodule init
git submodule update
```

(or just use `git clone --recursive` when cloning the repo)

Due to massive linking pain on Ubuntu, we embed and build `libjpeg-turbo` directly with `node-gyp`. Unfortunately this adds an extra requirement, as the build process needs `yasm` to enable all optimizations. Note that this step is only required for `x86` and `x86_64` architectures. You don't need `yasm` if you're building on `arm`, for example.

Here's how to install `yasm`:

**On OS X**

```bash
brew install yasm
```

**On Ubuntu 14.04**

```bash
apt-get install yasm
```

**On Ubuntu 12.04**

```bash
apt-get install yasm
```

**Important!** Ubuntu 12.04 comes with GCC 4.6, which is too old to compile the add-on (and most other modules since Node.js 4.0 was released). More information is available [here](https://github.com/travis-ci/travis-ci/issues/1379).

If you really must use this module on Ubuntu 12.04, the following may work:

```bash
apt-get install python-software-properties
add-apt-repository -y ppa:ubuntu-toolchain-r/test
apt-get -y install g++-4.8
export CXX=g++-4.8
```

Remember to export `CXX` when you `npm install`.

**On Debian**

```bash
apt-get install yasm
```

**On Alpine Linux**

```bash
apk add yasm
```

**On Windows**

Download Win32 or Win64 yasm from [here](http://yasm.tortall.net/Download.html) and make sure it's found in path as yasm.exe. Use the "for general use" version. If the .exe doesn't run, or complains about a missing `MSVCR100.dll`, go to [KB2977003](https://support.microsoft.com/en-us/kb/2977003) and find "Microsoft Visual C++ 2010 Service Pack 1 Redistributable Package MFC Security Update" under "Visual Studio 2010 (VC++ 10.0) SP1". The .exe should work fine after installing the redistributable.

To verify your yasm setup, run:

```sh
yasm
```

This should give the output:

> yasm: No input files specified

Next, you need to make sure that you have a build environment set up. An easy way to do that is to use [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools).

Now, just to make sure things are set up properly, run:

```
npm config get msvs_version
```

If the output is `2015` or newer, you're good. If it's anything else, or not set, you must run:

```
npm config set -g msvs_version 2015
```

Alternatively, you can specify the option at install time with `--msvs_version=2015`.

**Others**

Search your package manager for `yasm`.

## Installation

Make sure you've got the [requirements](#requirements) installed first.

Using [yarn](https://yarnpkg.com/):

```sh
yarn add jpeg-turbo
```

Using [npm](https://www.npmjs.com/):

```sh
npm install --save jpeg-turbo
```

## API

### `jpg.bufferSize(options)` → `Number`

If you'd like to preallocate a `Buffer` for `jpg.compressSync()`, use this method to get the worst-case upper bound. The `options` argument is fully compatible with the `jpg.compressSync()` method, so that you can pass the same options to both functions.

* **options** is an Object with the following properties:
  - **width** Required. The width of the image.
  - **height** Required. The height of the image.
  - **subsampling** Optional. The subsampling method to use. Defaults to `jpg.SAMP_420`.
* **Returns** The `Number` of bytes required in a worst-case scenario.

```js
var fs = require('fs')
var jpg = require('jpeg-turbo')

var raw = fs.readFileSync('raw.rgba')

var options = {
  format: jpg.FORMAT_RGBA,
  width: 1080,
  height: 1920,
  subsampling: jpg.SAMP_444,
}

var preallocated = new Buffer(jpg.bufferSize(options))

var encoded = jpg.compressSync(raw, preallocated, options)
```

### `jpg.compressSync(raw[, out], options)` → `Buffer`

Compresses (i.e. encodes) the raw pixel data into a JPG. This method is not capable of resizing the image.

For efficiency reasons you may choose to encode into a preallocated `Buffer`. While fast, it has a number of drawbacks. Namely, you'll have to be careful not to reuse the buffer in async processing before processing (e.g. saving, displaying or transmitting) the entire encoded image. Otherwise you risk corrupting the image. Also, it wastes a huge amount of space compared to on-demand allocation.

* **raw** is a `Buffer` with the raw pixel data in `options.format`.
* **out** is an optional preallocated `Buffer` for the encoded image. The size of the buffer is checked. See `jpg.bufferSize()` for an example of how to preallocate a sufficient `Buffer`. If not given, memory is allocated and reallocated as needed, which eliminates most of the wasted space but is slower and lacks consistency with varying source images.
* **options** is an Object with the following properties:
  - **format** Required. The format of the `raw` pixel data (e.g. `jpg.FORMAT_RGBA`).
  - **width** Required. The width of the image.
  - **height** Required. The height of the image.
  - **subsampling** Optional. The subsampling method to use. Defaults to `jpg.SAMP_420`.
  - **quality** Optional. The desired JPG quality. Defaults to 80.
* **Returns** The encoded image as a `Buffer`. Note that the buffer may actually be a slice of the preallocated `Buffer`, if given. _**Be careful not to reuse the preallocated buffer before you've finished processing the encoded image, as it may corrupt the image.**_

```js
var fs = require('fs')
var jpg = require('jpeg-turbo')

var raw = fs.readFileSync('raw.rgba')

var options = {
  format: jpg.FORMAT_RGBA,
  width: 1080,
  height: 1920,
  subsampling: jpg.SAMP_444,
}

var encoded = jpg.compressSync(raw, options)
```

See `jpg.bufferSize()` for an example of preallocated `Buffer` usage.


### `jpg.decompressSync(image[, out], options)` → `Object`

Decompresses (i.e. decodes) the JPG image into raw pixel data.

* **image** is a `Buffer` with the JPG image data.
* **out** is an optional preallocated `Buffer` for the decoded image. The size of the buffer is checked, and should be at least `width * height * bytes_per_pixel` or larger. If not given, one is created for you. The only benefit of providing the `Buffer` yourself is that you can reuse the same buffer between multiple `jpg.decompressSync()` calls. Note that this can lead to issues with concurrency. See `jpg.compressSync()` for related discussion.
* **options** is an Object with the following properties:
  - **format** Required. The desired format of the `raw` pixel data (e.g. `jpg.FORMAT_RGBA`).
  - **out** _Deprecated._ Use the `out` argument instead.
* **Returns** An `Object` with the following properties:
  - **data** A `Buffer` with the raw pixel data.
  - **width** The width of the image.
  - **height** The height of the image.
  - **subsampling**  The subsampling method used in the JPG.
  - **size** _Deprecated._ Use `data.length` instead.
  - **bpp** The number of bytes per pixel.

```js
var fs = require('fs')
var jpg = require('jpeg-turbo')

var image = fs.readFileSync('image.jpg')

var options = {
  format: jpg.FORMAT_RGBA,
}

var decoded = jpg.decompressSync(image, options)
```

## Thanks

* https://github.com/A2K/node-jpeg-turbo-scaler
* https://github.com/mash/node-imagemagick-native
* https://github.com/google/skia/blob/master/gyp/libjpeg-turbo.gyp
* https://github.com/openstf/android-libjpeg-turbo

## License

See [LICENSE](LICENSE).

Copyright © Simo Kinnunen. All Rights Reserved.
