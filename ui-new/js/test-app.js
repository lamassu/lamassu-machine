/* globals $, Keypad */

/*
How this currently works: change the app.js import on start.html to test-app.js

TODO:
  - Some way to change screen state (like dispensing with and w/o batch)
  - Start script to serve start.html without the need to change it
  - Add default state to the following screens
    7. choose_coin
    8. choose_fiat
    9. completed
    12. deposit
    13. deposit_timeout_state
    14. dispensing
    15. fiat_complete
    17. fiat_receipt
    21. high_bill
    27. insert_bills
    28. insert_more_bills
    34. minimum_tx_state
    36. pairing_error
    47. scan_address
    48. scan_id
    49. scan_photo
    51. select_locale
    54. terms_screen_state
    67. wifi
    68. withdrawn_failure
*/

'use strict'

let clicker = null
let screen = null
var phoneKeypad = null
var securityKeypad = null

$(function () {
  $('body').css('cursor', 'default')

  setupFakes()

  phoneKeypad = new Keypad('phone-keypad', { type: 'phoneNumber', country: 'US' }, function (result) {
    console.log('phoneNumber', result)
  })

  phoneKeypad.activate()

  securityKeypad = new Keypad('security-keypad', { type: 'code' }, function (result) {
    console.log('phoneNumber', result)
  })

  phoneKeypad.activate()

  var cList = document.createElement('div')
  cList.id = 'clicker-list'
  cList.setAttribute('style', 'position: absolute; right: 12px; top: 0; height: 800px; overflow: scroll')
  document.body.appendChild(cList)

  var style = document.createElement('style')
  style.type = 'text/css'
  style.innerHTML = '.bgyellow { background-color: yellow } '
  document.getElementsByTagName('head')[0].appendChild(style)

  let values = Array.from(document.getElementsByClassName('viewport'))
    .map(it => it.className.split(/\s+/))
    .flat()
    .filter(it => it.endsWith('_state'))
    .sort()

  let i = 1
  values.forEach(it => {
    var newElement = document.createElement('div')
    newElement.id = `clicker-${it}`
    newElement.setAttribute('original', it)
    newElement.innerHTML = `${i}. ${it}`
    newElement.addEventListener('click', click)
    cList.appendChild(newElement)
    i++
  })
})

function click (e) {
  document.execCommand('copy')
  if (screen) {
    screen.classList.remove('viewport-active')
    clicker.classList.remove('bgyellow')
  }

  clicker = e.target
  screen = Array.from(document.getElementsByClassName(e.target.getAttribute('original')))[0]

  clicker.classList.add('bgyellow')
  copyToClipboard(clicker)
  screen.classList.add('viewport-active')
}

function copyToClipboard (element) {
  var $temp = $('<input>')
  $('body').append($temp)
  $temp.val($(element).text()).select()
  document.execCommand('copy')
  $temp.remove()
}

function setupFakes () {
  let amount = [ '<span class="integer">34</span><span class="decimal-char">',
    '.', '</span><span class="decimal">479</span>'
  ].join('')

  $('.js-i18n-coins-to-address').html('Your coins will be sent to:')
  let address = 'wjy98nu928ud1o82dbj2u9i81wqjjyu98iwn'
  $('.deposit_state .send-notice .crypto-address').text(formatAddress(address))
  $('.fiat_receipt_state .sent-coins .crypto-address').text(formatAddress(address))
  $('.fiat_complete_state .sent-coins .crypto-address').text(formatAddress(address))
  $('.deposit_state .send-notice .crypto-address').text(formatAddress(address))
  $('.crypto-address').html(formatAddress(address))
  $('#fiat-inserted').html('per <span class="integer">1</span> EUR inserted')
  $('.js-i18n-fixed-fee').html('Transaction Fee: <span class="integer">1</span><span>.</span><span class="decimal">00</span> EUR')
  $('.insert_bills_state .bottom-bar .current-crypto').text('Lamassu Cryptomat')
  $('#js-i18n-high-bill-header').text("We're a little low")
  $('#js-i18n-highest-bill').html(`Please insert <span class="integer">10</span> EUR or less.`)
  $('.js-i18n-did-send-coins').html('Have you sent the BTC yet?')
  $('.js-i18n-lowest-bill').html('Please insert <span class="integer">10</span> EUR or more.')
  $('.js-crypto-display-units').text('mBTC')
  $('.deposit_state .digital .js-amount').html(34.479)
  $('.deposit_state .fiat .js-amount').text(320)
  $('.js-currency').text('EUR')

  let states = [
    $('.scan_photo_state'),
    $('.scan_id_state'),
    $('.security_code_state'),
    $('.register_phone_state')
  ]

  states.forEach(it => {
    setUpDirectionElement(it, 'cashOut')
  })

  function setUpDirectionElement (element, direction) {
    if (direction === 'cashOut') {
      element.removeClass('cash-in-color')
      element.addClass('cash-out-color')
    } else {
      element.addClass('cash-in-color')
      element.removeClass('cash-out-color')
    }
  }

  function updateCrypto (selector) {
    $(selector).find('.crypto-amount').html(amount)
    $(selector).find('.crypto-units').html('mBTC')
  }

  ['.reverse-exchange-rate', '.total-crypto-rec'].forEach(it => {
    updateCrypto(it)
  })

  function formatAddress (address) {
    const withSpace = address.replace(/(.{4})/g, '$1 ')
    return withSpace.replace(/((.{4} ){5})/g, '$1<br/> ')
  }

  const CASH_IN_QR_COLOR = '#0e4160'
  const CASH_OUT_QR_COLOR = '#403c51'

  qrize(address, $('#cash-in-qr-code'), CASH_IN_QR_COLOR)
  qrize(address, $('#cash-in-fail-qr-code'))
  qrize(address, $('#qr-code-fiat-receipt'))
  qrize(address, $('#qr-code-fiat-complete'), CASH_OUT_QR_COLOR)
  qrize(address, $('#qr-code-deposit'), CASH_OUT_QR_COLOR)
}

function qrize (text, target, color, lightning) {
  const image = document.getElementById('bolt-img')
  const opts = {
    crisp: true,
    fill: color || 'black',
    text,
    size: target.width(),
    render: 'canvas',
    rounded: 50,
    quiet: 2,
    mPosX: 50,
    mPosY: 50,
    mSize: 30,
    image
  }

  if (lightning) {
    opts.mode = 'image'
  }

  const el = kjua(opts)

  target.empty().append(el)

  $('#doAnimation').click(event => {
    transitionOut()
    click({ target: $('clicker-insert_bills_state') })
    setTimeout(() => {
      cleanUpTransition()
    }, 300)
  })

  function transitionOut () {
    $('#animate-me').addClass('animate-me')
  }

  function cleanUpTransition () {
    $('#animate-me').removeClass('animate-me')
  }
}
