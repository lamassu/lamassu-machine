# Install - nix

## Running nix-shell

To get your dev environment setup all you need to do is to run `nix-shell`

## Installation

### Installing packages

When running ``npm install``, don't worry about warnings or skipped optional dependencies. 

```
npm install
bash ./setup.sh
npm run build
```

### Set up crypto wallets

The camera scanner mock reads the wallet addresses from your ``device_config.json`` file. You need to add a property under ``brain.mockCryptoQR`` where the key is the ``cryptoCode`` and the value is the address to be returned by the mocked camera.

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

### Run and pair

First, make sure [lamassu-server](https://github.com/lamassu/lamassu-server) is properly installed, configured, and running. See the ``INSTALL.md`` file in the lamassu-server repository. Then, run lamassu-machine:

In first terminal window, run the bill validator simulator:

```
node bin/fake-bills.js
```

In second terminal window:

```
node bin/lamassu-machine --mockBillValidator --mockBillDispenser --mockCam --devBoard --mockPair '<totem-from-admin>'
```

You can find instructions how to get ``<totem-from-admin>`` in install instructions for lamassu-server. **IMPORTANT**: Make sure to use single quotes and not double quotes, or the shell will mess up the totem.

For subsequent runs, you don't need the ``--mockPair`` flag.

### Open in browser

In firefox or chrome, open the ``ui/start.html`` file. The URL should be something like this:

```
file://<lamassu-machine-dir>/ui/start.html?debug=dev
```

Don't worry if the fonts don't look right. The production software uses a proprietary font. Click on ``Initialize`` (it should be fast on your computer), then ``Scan``. After a few moments of pairing, you should see the start screen.

When the screen asks you to insert a bill, navigate to the terminal
where you opened the mock bill validator, and input **1** <kbd>Enter</kbd>
to insert a one dollar bill.

## Troubleshooting 

### If you're having trouble with tiny-secp256k1 installation related to node-gyp 

Sometimes it might be a [locale-related issue](https://github.com/NixOS/nixpkgs/issues/32848)

Try executing the `npm install` step inside a `--pure` flagged `nix-shell`

```
nix-shell --pure
[nix-shell:<lamassu-machine-dir>]$ npm install
```

### If you're having trouble with serialport bindings

Configure mockPrinter on your device_config.json

```
{
  "brain": {
    ...
    "mockPrinter": true,
  },
  ...
```