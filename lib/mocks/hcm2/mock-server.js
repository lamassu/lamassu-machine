const http = require('http')
const express = require('express')

const responses = require('./mock-responses')

const handler = (req, res, next) => {
  const data = req.body
  switch(data.method) {
    case 'getFirmwareVersion':
      return Promise.resolve(responses.getFirmwareVersion(data.id, data.params))
        .then(r => res.status(200).json({ body: r }))
    case 'getInfo':
      return Promise.resolve(responses.getInfo(data.id, data.params))
        .then(r => res.status(200).json({ body: r }))
    case 'getBanknoteInfo':
      return Promise.resolve(responses.getBanknoteInfo(data.id, data.params))
        .then(r => res.status(200).json({ body: r }))
    case 'setDenomination':
      return Promise.resolve(responses.setDenomination(data.id, data.params))
        .then(r => res.status(200).json({ body: r }))
    case 'setInfo':
      return Promise.resolve(responses.setInfo(data.id, data.params))
        .then(r => res.status(200).json({ body: r }))
    case 'reset':
      return Promise.resolve(responses.reset(data.id, data.params))
        .then(r => res.status(200).json({ body: r }))
    case 'openCloseShutter':
      return Promise.resolve(responses.openCloseShutter(data.id, data.params))
        .then(r => res.status(200).json({ body: r }))
    case 'cashCount':
      return Promise.resolve(responses.cashCount(data.id, data.params))
        .then(r => res.status(200).json({ body: r }))
    case 'deposit':
      return Promise.resolve(responses.deposit(data.id, data.params))
        .then(r => res.status(200).json({ body: r }))
    case 'cashRollback':
      return Promise.resolve(responses.cashRollback(data.id, data.params))
        .then(r => res.status(200).json({ body: r }))
    case 'dispenseByRoom':
      return Promise.resolve(responses.dispenseByRoom(data.id, data.params))
        .then(r => res.status(200).json({ body: r }))
    default:
      return res.status(404).json({ error: 'Invalid method' })
  }
}

const run = (host, port, cb) => {
  const app = express()

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.post('/api', handler)

  const server = http.createServer(app)
  server.listen(port, () => {
    console.log(`Cash recycler server running on http://${host}:${port}`)
    return cb()
  })
}

module.exports = { run }
