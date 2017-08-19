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

function safeParseInt (s) {
  try {
    return parseInt(s, 10)
  } catch (e) {
    return null
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'bill> '
})

function getInput (client) {
  rl.prompt()

  rl.on('line', line => {
    const denomination = safeParseInt(line.trim())

    if (_.isInteger(denomination)) {
      client.write(JSON.stringify({command: 'insertBill', denomination}))
    } else {
      console.log('Please enter an integer.\n')
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
