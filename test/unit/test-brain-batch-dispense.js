import test from 'ava'
import Brain from '../../lib/brain'
import Configuration from '../../lib/configuration'

Brain.prototype.selectBillValidatorClass = function selectBillValidatorClass() {
  return require('../../lib/mocks/id003')
}

test('new Brain', t => {
  var overrides = JSON.parse('{"_":[], "mockBTC":"1EyE2nE4hf8JVjV51Veznz9t9vTFv8uRU5", "mockBv":"/dev/pts/7", "mockTrader":true, "mockCam":true, "mockBillDispenser":true, "brain": { "checkIdle":2000, "idleTime":10000, "exitTime":20000} }');
  const config = Configuration.loadConfig(overrides)
  const brain = new Brain(config)

  t.true(false)
})
