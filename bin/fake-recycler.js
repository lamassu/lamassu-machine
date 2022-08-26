const express = require('express')
const http = require('http')
const readline = require('readline')
const _ = require('lodash/fp')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'bill> '
})

let bills = []

const getInput = () => {
  const safeParseInt = s => {
    try {
      return parseInt(s, 10)
    } catch (e) {
      return null
    }
  }

  rl.prompt()

  rl.on('line', line => {
    const denomination = safeParseInt(line.trim())

    if (_.isInteger(denomination)) {
      bills.push(denomination)
    } else {
      console.log('Please enter an integer.\n')
    }

    rl.prompt()
  })
  .on('close', () => {
    process.exit(0)
  })
}

const getBills = (req, res, next) => {
  try {
    console.log('Sending bills', bills)
    res.status(200).json({ bills: _.map(it => ({ denomination: it }), bills) })
    bills = []
  } catch (e) {
    res.sendStatus(500)
    next(e)
  }
}

const run = (host, port, cb) => {
  const app = express()

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.get('/bills', getBills)

  const server = http.createServer(app)
  server.listen(port, () => {
    console.log(`Cash recycler server running on http://${host}:${port}`)
    return getInput()
  })
}

run('localhost', 8082)
