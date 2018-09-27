const _ = require('lodash/fp')
const emitter = require('./action-emitter')
const coinUtils = require('./coins/utils')
const pDelay = require('delay')

const dispenseGenerator = function* dispenseGenerator(notes, txId) {
  let batchNum = 1
  let result = []
  for (let index = 0; index < notes.length; index++) {
    this.browser().send({dispenseBatch: {current: index + 1, of: notes.length} })
    let yielded = yield this.billDispenser.dispense(notes[index])
    if (yielded !== undefined) result.push(yielded)
  }
  yield Promise.all(result.map(i => i.value))
    .then(result => {
      const bills = result.map(d => d.bills).reduce((p, c) => {
        return [
        {dispensed: p[0].dispensed + c[0].dispensed, rejected: p[0].rejected + c[0].rejected},
        {dispensed: p[1].dispensed + c[1].dispensed, rejected: p[1].rejected + c[1].rejected}
      ]})

      fillInBills(this.tx, bills) 
      const dispenseConfirmed = fullDispense(this.tx)

      if (dispenseConfirmed) emitter.emit('brain', {action: 'billDispenserDispensed'})
      // update tx and keep track of the
      // dispensed bills
      // and the error code (if any)
      this.fastUpdateTx(_.extend(
        {
          bills: this.tx.bills,
          dispenseConfirmed,
        },
        !dispenseConfirmed
          ? {
            error: _.join(' ', _.reject(_.isEmpty, [result.name, result.message, result.err, result.error])),
            errorCode: result.err,
          }
          : {}))

      if (!dispenseConfirmed) {
        console.log('dispense error5', result)
        return this._transitionState('outOfCash')
      }

      const tx = this.tx
      const toAddress = coinUtils.formatAddress(tx.cryptoCode, tx.toAddress)
      const displayTx = _.set('toAddress', toAddress, tx)

      this._transitionState('fiatComplete', {tx: displayTx})
    }) 
    .then(() => pDelay(60000))
    .then(() => {
      const doComplete = this.state === 'fiatComplete' && this.tx.id === txId

      if (doComplete) {
        emitter.emit('brain', {action: 'billDispenserCollected'})
        return this._completed()
      }
    })
    .catch(err => {
      emitter.emit('brain', {action: 'billDispenserCollected'})

      /*
      * err -> errorCode
      * statusCode
      */
      console.log('dispense error4', err)
      this.fastUpdateTx({
        error: _.join(' ', _.reject(_.isEmpty, [err.name, err.message, err.err, err.error])),
        errorCode: err.err
      })

      // bounce the error to be catched
      // by _dispense function
      throw err
    })
}

function fillInBills (tx, bills) {
  if (!bills) return

  const len = bills.length
  for (let i = 0; i < len; i++) {
    tx.bills[i].dispensed = bills[i].dispensed
    tx.bills[i].rejected = bills[i].rejected
  }
}

function fullDispense (tx) {
  const total = _.sumBy(bill => bill.denomination * bill.dispensed, tx.bills)
  return tx.fiat.eq(total)
}

module.exports = dispenseGenerator