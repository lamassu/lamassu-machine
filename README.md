# lamassu-machine
The software that runs the Lamassu Bitcoin Machine.

## Mac OS X environment setup

```
> curl -L https://git.io/n-install | bash -s -- -y lts
> . ~/.bash_profile
> npm install yarn -g
```

## Installing

```
> git clone -b https --single-branch https://github.com/lamassu/lamassu-machine.git
> cd lamassu-machine
> ./setup.sh
```

## Running

In a separate window start a fake bill validator, and use the outputted ttys number on the next command, like
``/dev/ttys008``.

```
> ruby fake_id003.rb
```

# run lamassu-machine

```
> node bin/lamassu-machine --mockTrader --mockCam --mockBillDispenser --mockBv /dev/ttys008
```

Replace ``--mockBv`` with the value you got above.

The camera scanner mock reads the wallet addresses from your ``device_config.json``,
you need to add a property under brain.mockCryptoQR
where the key is the cryptoCode and the value is the address to be returned by the mocked camera.

Example

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

Now, in a new terminal:

```
> open ui/start.html
```

and you should get this:

![Start screen](docs/images/start-screen.png)

When the screen asks you to insert a bill, navigate to the terminal
where you opened the mock bill validator, and input **1**<kbd>Enter</kbd>
to insert a one dollar bill.
