import test from 'ava'
import sinon from 'sinon';
import actionEmitter from '../../lib/action-emitter'
import ledManager from '../../lib/ssuboard/mock/led-manager'
import lc from '../../lib/ssuboard/mock/led-control'

let spy

test.before(_ => {
  ledManager.run()
})

test.beforeEach(_ => {
  spy = sinon.spy(lc, 'timedPulse')
})

test.afterEach(_ => {
  lc.timedPulse.restore()
})

test('Should pulse orange if authorized and door secured', t => {
  actionEmitter.emit('door', { action: 'doorSecured' })
  actionEmitter.emit('fob', { action:  'registered' })
  t.true(spy.calledOnceWith([16, 25], 'F03C02ff', 1000))
})

test('Should pulse red if unauthorized and door not secured', t => {
  actionEmitter.emit('door', { action: 'doorSecured' })
  actionEmitter.emit('fob', { action:  'unauthorized' })
  t.true(spy.calledOnceWith([16, 25], 'A30006ff', 1000))
})
