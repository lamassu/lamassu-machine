import test from 'ava'
import sinon from 'sinon';
import actionEmitter from '../../lib/action-emitter'
import ledManager from '../../lib/ssuboard/mock/led-manager'
import lc from '../../lib/ssuboard/mock/led-control'
import pd from '../../lib/ssuboard/process-door'

let spyLC
let spyPD

test.before(_ => {
  ledManager.run()
})

test.beforeEach(_ => {
  spyLC = sinon.spy(lc, 'timedPulse')
  spyPD = sinon.spy(pd, 'isDoorSecured')
})

test.afterEach(_ => {
  lc.timedPulse.restore()
  pd.isDoorSecured.restore()
})

test('Should pulse orange if authorized and door secured', t => {
  actionEmitter.emit('door', { action: 'doorSecured' })
  actionEmitter.emit('fob', { action:  'registered' })
  t.true(spyLC.calledOnceWith([16, 25], 'F03C02ff', 1000))
})

test('Should pulse red if unauthorized and door not secured', t => {
  actionEmitter.emit('door', { action: 'doorSecured' })
  actionEmitter.emit('fob', { action:  'unauthorized' })
  t.true(spyLC.calledOnceWith([16, 25], 'A30006ff', 1000))
})

test('isDoorSecured should be false', t => {
  t.plan(2)
  actionEmitter.emit('door', { action: 'doorNotSecured' })
  actionEmitter.emit('fob', { action:  'unauthorized' })
  t.true(spyPD.calledOnce)
  t.false(spyPD.returnValues[0])
})
