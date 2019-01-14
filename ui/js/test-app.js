/* globals $ */

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

$(function () {
  $('body').css('cursor', 'default')

  setupFakes()

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
  console.log('not copying')
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
  let amount = [ '<span class="integer">9</span><span class="decimal-char">',
    '.', '</span><span class="decimal">337</span>'
  ].join('')

  $('.js-i18n-coins-to-address').html('Your BTC will be sent to:')
  let address = '16j1QDLLcAuYkiWhQpnyk34yXihbvLfMfd'
  $('.deposit_state .send-notice .crypto-address').text(address)
  $('.fiat_receipt_state .sent-coins .crypto-address').text(address)
  $('.fiat_complete_state .sent-coins .crypto-address').text(address)
  $('.crypto-address').html(address)
  $('#fiat-inserted').html('per <span class="integer">1</span> EUR inserted')
  $('.tx-fee').html('<strong>+</strong><span class="integer">1</span><span>.</span><span class="decimal">00</span> EUR transaction fee')
  $('.insert_bills_state .bottom-bar .current-crypto').text('Lamassu Cryptomat')
  $('#js-i18n-high-bill-header').text("We're a little low")
  $('#js-i18n-highest-bill').html(`Please insert <span class="integer">10</span> EUR or less.`)
  $('.js-i18n-did-send-coins').html('Have you sent the BTC yet?')
  $('.js-i18n-lowest-bill').html('Please insert <span class="integer">10</span> EUR or more.')

  function updateCrypto (selector) {
    $(selector).find('.crypto-amount').html(amount)
    $(selector).find('.crypto-units').html('mBTC')
  }

  ['.reverse-exchange-rate', '.total-crypto-rec'].forEach(it => {
    console.log(it)
    updateCrypto(it)
  })
}
