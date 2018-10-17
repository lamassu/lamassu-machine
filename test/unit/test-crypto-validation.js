import test from 'ava'
import BTCValidator from '../../lib/coins/btc'

test('Should validate P2PKH on main network', t => {
  const addr = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
  const validated = BTCValidator.parseUrl('main', addr)
  t.is(validated, addr)
})

test('Should validate P2SH on main network', t => {
  const addr = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'
  const validated = BTCValidator.parseUrl('main', addr)
  t.is(validated, addr)
})

test('Should validate bech32 on main network', t => {
  const addr = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
  const validated = BTCValidator.parseUrl('main', addr)
  t.is(validated, addr)

})

test('Should validate P2PKH on test network', t => {
  const addr = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn'
  const validated = BTCValidator.parseUrl('test', addr)
  t.is(validated, addr)

})

test('Should validate P2SH on test network', t => {
  const addr = '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc'
  const validated = BTCValidator.parseUrl('test', addr)
  t.is(validated, addr)

})

test('Should validate bech32 on test network', t => {
  const addr = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
  const validated = BTCValidator.parseUrl('test', addr)
  t.is(validated, addr)
})

test('Should fail for invalid address', t => {
  const addr = 'bc1qw507d68ejxt3g4y5r3drrgard0c5xw7kv8f3t4'
  const validated = BTCValidator.parseUrl('test', addr)
  t.is(validated, null)
})
