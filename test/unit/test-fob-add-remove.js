import test from 'ava'
import path from 'path'
import fs from 'fs'
import rewire from 'rewire'

const mockData = { successfull: true, keyHandle: 'small' } 
const u2fPath = path.resolve('./', 'u2f.json')
const u2f = rewire('../../lib/ssuboard/u2f')
const fobManager = rewire('../../lib/ssuboard/fob-manager')

test.before(t => setupMocks())

test.serial('should migrate to new version', async t => {
  const list = await fobManager.list()
  t.deepEqual(list, ['default'])
})

test.serial('should unregister default', async t => {
  await fobManager.unregister('default')
  const reg = JSON.parse(fs.readFileSync(u2fPath))
  t.deepEqual({}, reg)
})


test.serial('should register fob', async t => {
  await fobManager.register('fob')
  const reg = JSON.parse(fs.readFileSync(u2fPath))
  t.deepEqual(reg, {fob: mockData})
})

test.serial('should fail unregistering nonexisting name', async t => {
  const r = await t.throws(fobManager.unregister('fob2'))
  t.is(r.message, 'No FOB registered with the name: fob2')
})

test.serial('should fail registering already existing name', async t => {
  const r = await t.throws(fobManager.register('fob'))
  t.is(r.message, 'There\'s already a FOB named: fob')
})

const setupMocks = () => {
  u2f.__set__('checkRegistration', () => Promise.resolve(mockData))
  u2f.__set__('u2f', {request: () => ''})
  u2f.__set__('nfc', {transmit: () => Promise.resolve()})
  u2f.__set__('u2fPath', u2fPath)
  fs.writeFileSync(u2fPath, JSON.stringify(mockData))
  fobManager.__set__('u2f', u2f)
}

test.after(() => {
  fs.unlinkSync(u2fPath)
})
