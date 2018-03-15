const _ = require('lodash/fp')
const pify = require('pify')
const fs = pify(require('fs'))
const uuid = require('uuid')
const path = require('path')

const BN = require('./bn')

let dbName

module.exports = {save, prune}

function list (dbRoot) {
  return fs.mkdir(dbRoot)
    .catch(() => {})
    .then(() => fs.readdir(dbRoot))
}

function rotate (dbRoot) {
  dbName = 'tx-db-' + uuid.v4() + '.dat'
  return fs.mkdir(dbRoot)
    .catch(() => {})
    .then(() => fs.writeFile(path.resolve(dbRoot, dbName), ''))
}

function save (dbRoot, tx) {
  return fs.appendFile(path.resolve(dbRoot, dbName), JSON.stringify(tx) + '\n')
}

function nuke (dbPath) {
  return fs.unlink(dbPath)
}

function safeJsonParse (txt) {
  try {
    return JSON.parse(txt)
  } catch (_) {

  }
}

function pruneFile (dbRoot, cleanP, _dbName) {
  const dbPath = path.resolve(dbRoot, _dbName)

  return load(dbPath)
    .then(txs => cleanP(txs))
    .then(r => {
      return nuke(dbPath)
        .catch(err => console.log(`Couldn't nuke ${dbPath}: ${err}`))
        .then(() => r)
    })
}

function prune (dbRoot, cleanP) {
  return list(dbRoot)
    .then(files => {
      console.log(`Processing ${files.length} db files`)

      return rotate(dbRoot)
        .then(() => {
          const promises = _.map(file => pruneFile(dbRoot, cleanP, file), files)
          return Promise.all(promises)
            .then(results => {
              const sum = _.sum(results)
              if (sum === 0) return console.log('No pending txs to process.')
              console.log(`Successfully processed ${_.sum(results)} pending txs.`)
            })
            .catch(err => console.log(`Error processing pending txs: ${err.stack}`))
        })
    })
}

function massage (tx) {
  if (!tx) return

  const massagedFields = {
    fiat: _.isNil(tx.fiat) ? undefined : BN(tx.fiat),
    cryptoAtoms: _.isNil(tx.cryptoAtoms) ? undefined : BN(tx.cryptoAtoms)
  }

  return _.assign(tx, massagedFields)
}

function load (dbPath) {
  const txTable = {}

  return fs.readFile(dbPath, {encoding: 'utf8'})
    .then(f => {
      const recs = f.split('\n')
      const parse = _.flow([safeJsonParse, massage])
      const txs = _.remove(_.isEmpty, _.map(parse, recs))
      _.forEach(tx => { txTable[tx.id] = tx }, txs)
      return _.sortBy(tx => tx.deviceTime, _.values(txTable))
    })
}
