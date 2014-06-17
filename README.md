# lamassu-machine
The software that runs the Lamassu Bitcoin Machine.

# Running

First, run the mock bill validator in a separate terminal window:

```
$ ruby fake_id003.rb 
```

The mock validator will output its device path, e.g. ```/dev/ttys009```.
Use that to run the main program, called sencha-brain, along with a Bitcoin
address you control:

```
node bin/sencha-brain --mock-btc '1KAkLnhU1BpvgjQUgLk1HF4PEgh4asFNS8' --mock-bv '/dev/ttys009' --mock-trader
```

This should output something like this:

```
2014-06-17T19:18:06.293Z LOG Bitcoin Machine software initialized.
2014-06-17T19:18:06.296Z LOG new brain state: booting
2014-06-17T19:18:06.296Z LOG browser not connected
2014-06-17T19:18:06.296Z LOG new brain state: wifiConnected
2014-06-17T19:18:06.297Z LOG FSM: start [ none -> Start ]
2014-06-17T19:18:06.298Z LOG memUse: 30.3 MB, memFree: 37.1%, nodeUptime: 0.00h, osUptime: 105.35h
2014-06-17T19:18:06.300Z LOG FSM: connect [ Start -> Connected ]
2014-06-17T19:18:06.403Z LOG FSM: disable [ Connected -> Disable ]
2014-06-17T19:18:06.404Z LOG FSM: denominations [ Disable -> Denominations ]
2014-06-17T19:18:06.501Z LOG FSM: initialize [ Denominations -> Initialize ]
2014-06-17T19:18:06.801Z LOG Bill validator connected.
2014-06-17T19:18:06.801Z LOG Using mock trader
2014-06-17T19:18:06.803Z LOG new brain state: pendingIdle
2014-06-17T19:18:06.803Z LOG new brain state: idle
2014-06-17T19:18:06.803Z LOG new brain state: pendingIdle
2014-06-17T19:18:06.803Z LOG new brain state: idle
2014-06-17T19:18:07.508Z LOG FSM: disable [ Initialize -> Disable ]
```

Now, open a Chrome or Chromium browser to 

```
file:///<lamassu-machine path>/ui/start.html
```

and you should get this:

![Start screen](docs/images/start-screen.png)

When the screen asks you to insert a bill, navigate to the terminal
where you opened the mock bill validator, and input 1<Enter> to insert
a one dollar bill.
