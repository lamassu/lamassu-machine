const net = require('net')
const readline = require('readline')
const _ = require('lodash/fp')

let client

function _connect () {
  if (client && !client.destroyed) return

  client = net.connect({port: 3077}, () => {
    console.log('connected to lamassu-machine!')
    getInput(client)
  })

  client.on('end', () => {
    console.log('disconnected from server')
  })

  client.on('error', _ => {})
}

function connect () {
  try {
    _connect()
  } catch (_) {
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'billvalidator> '
})

function getInput (client) {
  rl.prompt()

  rl.on('line', line => {
    const command = line.trim()

    switch(command) {
      case 'open':
        client.write(JSON.stringify({command: 'stackerOpen'}))
        break
      // case 'close':
      //   client.write(JSON.stringify({command: 'enable'}))
      //   break
      default:
        console.log('Please enter a valid command.\n')
        break
    }

    rl.prompt()
  })
  .on('close', () => {
    process.exit(0)
  })
}

console.log('Connecting to lamassu-machine...')
connect()
setInterval(connect, 1000)
