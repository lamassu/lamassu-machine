# Installation on Ubuntu 16.04

This assumes nodejs 8 and npm are already installed. When running ``npm install``, don't worry about warnings or skipped optional dependencies.

```
npm install
bash ./setup.sh
npm run build
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
Click on ``Init``, then ``Scan``. You should see the start screen.

For subsequent runs, you don't need the ``--mockPair`` flag.

## Open in browser

In firefox or chrome, open the ``ui/start.html`` file. The URL should be something like this:

```
file://<lamassu-machine-dir>/ui/start.html?debug=dev
```

Don't worry if the fonts don't look right. The production software uses a proprietary font. Click on ``INIT`` (it should be fast on your computer), then ``SCAN``. After a few moments of pairing, you should see the start screen.

