const net = require('net')
const readline = require('readline')
const _ = require('lodash/fp')

const server = net.createServer((socket) => {
  getInput()
  socket.end('goodbye\n')
}).on('error', (err) => {
  console.log(err)
})

server.listen({port: 3077}, (err, res) => {
  if (err) throw err
  console.log('Bills server listening on port 3077')
})

function safeParseInt (s) {
  try {
    return parseInt(s, 10)
  } catch (e) {
    return null
  }
}

function getInput (socket) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'bill> '
  })

  rl.prompt()

  rl.on('line', line => {
    const denomination = safeParseInt(line.trim())

    if (_.isInteger(denomination)) {
      socket.write(JSON.stringify({command: 'insertBill', denomination}))
    } else {
      console.log('Please enter an integer.\n')
    }

    rl.prompt()
  })
  .on('close', () => {
    process.exit(0)
  })
}
