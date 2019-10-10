import test from 'ava'
import sinon from 'sinon'
import {parseUrl as parseBTCAddress} from '../../lib/coins/btc'
import {parseUrl as parseLTCAddress} from '../../lib/coins/ltc'
import {parseUrl as parseDASHAddress} from '../../lib/coins/dash'
import {parseUrl as parseZECAddress} from '../../lib/coins/zec'
import {parseUrl as parseADAAddress} from '../../lib/coins/ada';

test('Should parse BTC address', t => {
  const addr = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
  const parsed = parseBTCAddress('main', addr)
  t.is(parsed, addr)
})

test('Should throw for invalid BTC address', t => {
  const addr = '1BvBMSEYstWetqTgn5Au4m4GFg2xJaNVN4'
  let spy = sinon.spy(parseBTCAddress)
  try {
    spy('main', addr)
  } catch (error) { }
  t.true(spy.threw())
})

test('Should parse LTC address', t => {
  const addr = 'LVdPgVLae4mTeAdywWqmwWkJypAGcRkHy3'
  const parsed = parseLTCAddress('main', addr)
  t.is(parsed, addr)
})

test('Should throw for invalid LTC address', t => {
  const addr = 'LVddgVL4e4mTeAdywWqmwWkJypAGcRkHd3'
  let spy = sinon.spy(parseLTCAddress)
  try {
    spy('main', addr)
  } catch (error) { }
  t.true(spy.threw())
})

test('Should parse DASH address', t => {
  const addr = 'XuvPuKz7JPkyzWn8g7PNLjYVNdouedLc56'
  const parsed = parseDASHAddress('main', addr)
  t.is(parsed, addr)
})

test('Should throw for invalid DASH address', t => {
  const addr = 'XuvPuKz7JPkyzWn8g7PNLjYVN3ouedsc56'
  let spy = sinon.spy(parseDASHAddress)
  try {
    spy('main', addr)
  } catch (error) { }
  t.true(spy.threw())
})

test('Should parse ZEC address', t => {
  const addr = 't1ZYZS6ynUDbvht7vH3dMiM3rsAJ1p6EGWC'
  const parsed = parseZECAddress('main', addr)
  t.is(parsed, addr)
})

test('Should throw for invalid ZEC address', t => {
  const addr = 't1ZYZS6ynUDbvht7vH3dMi23rs3J1p6dGWC'
  let spy = sinon.spy(parseZECAddress)
  try {
    spy('main', addr)
  } catch (error) { }
  t.true(spy.threw())
})

test('Should parse ADA address (Byron era)', t => {
  const addresses = [
    '37btjrVyb4KFTChjvZKjxBfUHjpEFz3CzNDyChYqSfCVLABzxKcW6JWWTYXd1ELD8cirXJ6osWpkN3dVqouRgFbLmua5gCWv8Pha1AQyPtwSeMkF9s', // Daedalus like address
    'Ae2tdPwUPEZKmwoy3AU3cXb5Chnasj6mvVNxV1H11997q3VW5ihbSfQwGpm' // Yoroi like address
  ]
  
  for (let addr of addresses) {
    let parsed = parseADAAddress('main', addr)
    t.is(parsed, addr)
  }
})

test('Should recognize invalid ADA address', t => {
  const addresses = [
    '37btjrVyb4KFTChjvZKjxBfUHjpEFz3CzNDyChYqSfCVLABzxKcW6JWWTYXd1ELD8cirXJ6osWpkN3dVqouRgFbLmua5gCWv8Pha1AQyPtwSeMkF9', // not valid CBOR
    '37btjrVyb4KFTChjvZKjxBfUHjpEFz3CzNDyChYqSfCVLABzxKcW6JWWTYXd1ELD8cirXJ6osWpkN3dVqouRgFbLmua5gCWv8Pha1AQyPtwSeMkF8s' // not valid checksum
  ]

  for (let addr of addresses) {
    let parsed = parseADAAddress('main', addr)
    t.is(parsed, null)
  }
})
