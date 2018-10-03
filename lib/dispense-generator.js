const _ = require('lodash/fp')
const actionEmitter = require('./action-emitter')
const coinUtils = require('./coins/utils')

const emit = event => actionEmitter.emit('dispenseGenerator', event)

const dispenseGenerator = function* dispenseGenerator(notes, tx, txId) {
  let result = []
  
  for (let index = 0; index < notes.length; index++) {
    emit({ action: 'updateUI', current: index + 1, of: notes.length })
    let yielded = yield emit({ action: 'dispenseBatch', notes: notes[index] })
    if (yielded !== undefined) result.push(yielded)
  }
  
  const bills = result.map(d => d.bills).reduce((p, c) => {
    return [
    {dispensed: p[0].dispensed + c[0].dispensed, rejected: p[0].rejected + c[0].rejected},
    {dispensed: p[1].dispensed + c[1].dispensed, rejected: p[1].rejected + c[1].rejected}
  ]})

  fillInBills(tx, bills)
  const dispenseConfirmed = fullDispense(tx)

  if (dispenseConfirmed) emit({action: 'billDispenserDispensed'})
    // update tx and keep track of the
    // dispensed bills
    // and the error code (if any)
  const fastUpdateTxEventDataErr = {
      error: _.join(' ', _.reject(_.isEmpty, [result.name, result.message, result.err, result.error])),
      errorCode: result.err,
    }
  const fastUpdateTxEventData = _.extend(
    { bills: tx.bills, dispenseConfirmed, },
      !dispenseConfirmed ? fastUpdateTxEventDataErr : {}
    )
  emit({
    action: 'fastUpdateTx',
    value: fastUpdateTxEventData
  })
    
  if (!dispenseConfirmed) {
    console.log('dispense error5', result)
    return emit({ action: 'transitionState', state: 'outOfCash' })
  }

  const toAddress = coinUtils.formatAddress(tx.cryptoCode, tx.toAddress)
  const displayTx = _.set('toAddress', toAddress, tx)

  emit({ action: 'transitionState', state: 'fiatComplete', auxData: {tx: displayTx} })

  if (tx.id === txId) {
    emit({ action: 'billDispenserCollected' })
    emit({ action: 'completed' })
  }
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

module.exports = function(notes, tx, txId) {
  let g = dispenseGenerator(notes, tx, txId)
  let yieldedVal = g.next()
  
  actionEmitter.on('billDispenser', event => g.next(event.value) )
}
