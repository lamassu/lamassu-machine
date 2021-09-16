/* globals $, Keypad, TimelineMax, requestAnimationFrame, kjua, Keyboard, locales, Jed */

/*
How this currently works: change the app.js import on start.html to test-app.js

TODO:
  - Some way to change screen state (like dispensing with and w/o batch)
  - Start script to serve start.html without the need to change it
*/

'use strict'

let clicker = null
let screen = null
var phoneKeypad = null
var securityKeypad = null
var usSsnKeypad = null
let background = null
let aspectRatio800 = true
let locale = null
let localeCode = 'bg-BG'

$(function () {
  $('body').css('cursor', 'default')
  $('body').addClass('sintra')
  $('body').addClass('museo')

  const width = $('body').width()
  const height = $('body').height()

  function gcd (a, b) {
    return (b === 0) ? a : gcd(b, a % b)
  }

  const w = width
  const h = height
  const r = gcd(w, h)
  const aspectRatioPt1 = w / r
  const aspectRatioPt2 = h / r

  aspectRatio800 = aspectRatioPt1 === 8 && aspectRatioPt2 === 5

  if (aspectRatio800) {
    $('body').addClass('aspect-ratio-8-5')
  } else {
    $('body').addClass('aspect-ratio-16-9')
  }
  setupFakes()

  phoneKeypad = new Keypad('phone-keypad', { type: 'phoneNumber', country: 'US' }, function (result) {
    console.log('phoneNumber', result)
  })

  phoneKeypad.activate()

  let wifiKeyboard = new Keyboard('wifi-keyboard').init()

  usSsnKeypad = new Keypad('us-ssn-keypad', { type: 'usSsn' }, function (result) {
    console.log('phoneNumber', result)
  })

  usSsnKeypad.activate()

  securityKeypad = new Keypad('security-keypad', { type: 'code' }, function (result) {
    console.log('phoneNumber', result)
  })

  securityKeypad.activate()

  var cList = document.createElement('div')
  cList.id = 'clicker-list'
  cList.setAttribute('style', 'position: absolute; right: 12px; top: 200px; height: 600px; overflow: scroll')
  document.body.appendChild(cList)

  var style = document.createElement('style')
  style.type = 'text/css'
  style.innerHTML = '.bgyellow { background-color: yellow } '
  document.getElementsByTagName('head')[0].appendChild(style)

  var tList = document.createElement('div')
  tList.id = 'types-list'
  tList.setAttribute('style', 'position: absolute; right: 12px; top: 0; height: 200px; overflow: scroll')
  document.body.appendChild(tList)

  const screens = []
  let finalTypes = []

  Array.from(document.getElementsByClassName('viewport')).forEach(it => {
    const possibleName = it.className.split(/\s+/).filter(it => it.endsWith('_state'))

    if (!possibleName || !possibleName.length) return console.log(possibleName)

    const name = possibleName[0]
    let types = null
    if (it.dataset.screentype) {
      types = it.dataset.screentype.split(/\s+/)
      finalTypes.push(...types)
    }

    screens.push({ name, types })
  })

  finalTypes = new Set(finalTypes.sort())

  let i = 1
  screens.sort((a, b) => {
    let nameA = a.name.toUpperCase()
    let nameB = b.name.toUpperCase()

    if (nameA < nameB) {
      return -1
    }
    if (nameA > nameB) {
      return 1
    }
    return 0
  }).forEach(it => {
    var newElement = document.createElement('div')
    newElement.id = `clicker-${it.name}`
    newElement.setAttribute('original', it.name)
    newElement.setAttribute('class', (it.types || []).join(' '))
    newElement.innerHTML = `${i}. ${it.name}`
    newElement.addEventListener('click', click)
    cList.appendChild(newElement)
    i++
  })

  finalTypes.forEach(it => {
    var newElement = document.createElement('div')
    newElement.innerHTML = it
    newElement.addEventListener('click', (e) => {
      $('#clicker-list div').show()
      let oldElem = $('.bgyellow')
      oldElem.removeClass('bgyellow')

      if (!e.target.getAttribute('clicked') || e.target.getAttribute('clicked') === 'false') {
        oldElem.attr('clicked', false)
        e.target.setAttribute('clicked', true)
        e.target.classList.add('bgyellow')
        $(`#clicker-list div:not(.${it})`).hide()
      } else {
        e.target.setAttribute('clicked', false)
      }
    })
    tList.appendChild(newElement)
  })

  initTranslatePage()
  locale = loadI18n(localeCode)
  try { translatePage() } catch (ex) {}
})

function loadI18n (localeCode) {
  var messages = locales[localeCode] || locales['en-US']

  return new Jed({
    'missing_key_callback': function () {},
    'locale_data': {
      'messages': messages
    }
  })
}

function initTranslatePage () {
  $('.js-i18n').each(function () {
    var el = $(this)
    el.data('baseTranslation', el.html().trim())
  })
  $('input[placeholder]').each(function () {
    var el = $(this)
    el.data('baseTranslation', el.attr('placeholder'))
  })
}

function translatePage () {
  $('.js-i18n').each(function () {
    var el = $(this)
    var base = el.data('baseTranslation')
    el.html(locale.translate(base).fetch())
  })
  $('input[placeholder]').each(function () {
    var el = $(this)
    var base = el.data('baseTranslation')
    el.attr('placeholder', locale.translate(base).fetch())
  })

  // Adjust send coins button
  var length = $('#send-coins span').text().length
  if (length > 17) $('body').addClass('i18n-long-send-coins')
  else $('body').removeClass('i18n-long-send-coins')
}

function click (e) {
  setTimeout(() => {
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
  }, 0)
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

  let address = 'wjy98nu928ud1o82dbj2u9i81wqjjyu98iwn'
  $('.deposit_state .send-notice .crypto-address').text(formatAddress(address))
  $('.fiat_receipt_state .sent-coins .crypto-address').text(formatAddress(address))
  $('.fiat_complete_state .sent-coins .crypto-address').text(formatAddress(address))
  $('.deposit_state .send-notice .crypto-address').text(formatAddress(address))
  $('.crypto-address').html(formatAddress(address))
  $('.crypto-address-no-br').html(formatAddressNoBreakLines(address))
  $('.js-i18n-fixed-fee').html('Transaction Fee: <span class="integer">1</span><span>.</span><span class="decimal">00</span> EUR')
  $('.insert_bills_state .bottom-bar .current-crypto').text('Lamassu Cryptomat')
  $('#js-i18n-high-bill-header').text('We\'re a little low on crypto.')
  $('#js-i18n-highest-bill').html(`Please insert <span class="integer">10</span> EUR or less.`)
  $('.js-i18n-did-send-coins').html('Have you sent the BTC yet?')
  $('.js-i18n-lowest-bill').html('Please insert <span class="integer">10</span> EUR or more.')
  $('.js-i18n-total-purchased').html('total purchased')
  $('.js-crypto-display-units').text('mBTC')
  $('.deposit_state .digital .js-amount').html(34.479)
  $('.fiat .js-amount').text(320)
  $('.js-currency').text('EUR')
  $('.js-i18n-scan-your-address').html('Scan your <br/> BTC address')
  $('.js-processing-bill').text('Vous avez introduit un billet de 50 USD')
  $('.js-terms-title').text('Disclaimer')
  $('.js-terms-text').text(`Once cryptocurrency is transferred to any party, it cannot be reversed, cancelled, or refunded. By using this cryptomat, you agree that all sales are final and that you are using an address that you own and control. By using this cryptomat, you agree that all sales are final and that you are using an address that you own and control.`)
  $('.js-pairing-error').text('Failure accessing server')
  $('.js-i18n-wifi-connect').text('You\'re connecting to the WiFi network Taranto')
  $('.js-i18n-wifi-connecting').html('This could take a few moments.')
  $('.operator-name').html('Rafael Taranto')
  $('.operator-phone').html('+55 82 2288-3828')
  $('.operator-email').html('my-long-email@hotmail.com.br')
  $('#networks').html(`
    <div class="wifi-network-button filled-action-button tl2">
      <span class="ssid" data-raw-ssid="taranto" data-ssid="taranto">sm</span>
      <div class="wifiicon-wrapper"><img src="images/wifiicon/4.svg"></span></div>
    </div>
    <div class="wifi-network-button filled-action-button tl2">
      <span class="ssid" data-raw-ssid="taranto" data-ssid="taranto">larger</span>
      <div class="wifiicon-wrapper"><img src="images/wifiicon/3.svg"></span></div>
    </div>
    <div class="wifi-network-button filled-action-button tl2">
      <span class="ssid" data-raw-ssid="taranto" data-ssid="taranto">some letter</span>
      <div class="wifiicon-wrapper"><img src="images/wifiicon/2.svg"></span></div>
    </div>
    <div class="wifi-network-button filled-action-button tl2">
      <span class="ssid" data-raw-ssid="taranto" data-ssid="taranto">lots and lots of letters</span>
      <div class="wifiicon-wrapper"><img src="images/wifiicon/1.svg"></span></div>
    </div>
  `)

  let states = [
    $('.scan_id_photo_state'),
    $('.scan_id_data_state'),
    $('.security_code_state'),
    $('.register_phone_state'),
    $('.register_us_ssn_state'),
    $('.terms_screen_state'),
    $('.verifying_id_photo_state'),
    $('.verifying_face_photo_state'),
    $('.verifying_id_data_state'),
    $('.sms_verification_state'),
    $('.permission_id_state'),
    $('.bad_phone_number_state'),
    $('.bad_security_code_state'),
    $('.max_phone_retries_state'),
    $('.failed_permission_id_state'),
    $('.failed_verifying_id_photo_state'),
    $('.blocked_customer_state'),
    $('.fiat_error_state'),
    $('.fiat_transaction_error_state'),
    $('.failed_scan_id_data_state'),
    $('.sanctions_failure_state'),
    $('.error_permission_id_state'),
    $('.scan_face_photo_state'),
    $('.retry_scan_face_photo_state'),
    $('.permission_face_photo_state'),
    $('.us_ssn_permission_state'),
    $('.failed_scan_face_photo_state'),
    $('.hard_limit_reached_state'),
    $('.failed_scan_id_photo_state'),
    $('.retry_permission_id_state'),
    $('.waiting_state'),
    $('.scan_manual_id_photo_state'),
    $('.promo_code_not_found_state')
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

  function formatAddressNoBreakLines (address) {
    if (!address) return
    return address.replace(/(.{4})/g, '$1 ')
  }

  function formatAddress (address) {
    let toBr = formatAddressNoBreakLines(address)
    if (!toBr) return

    return toBr.replace(/((.{4} ){5})/g, '$1<br/> ')
  }

  const CASH_IN_QR_COLOR = '#0e4160'
  const CASH_OUT_QR_COLOR = '#403c51'

  qrize(address, $('#cash-in-qr-code'), CASH_IN_QR_COLOR)
  qrize(address, $('#cash-in-fail-qr-code'), CASH_IN_QR_COLOR)
  qrize(address, $('#qr-code-fiat-receipt'), CASH_OUT_QR_COLOR)
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
  let animationFinished = true
  let then = 0
  let lowest = 0
  let highest = 0
  let avg = 0
  let frameNumber = 0

  $('.cash-in-box').click(doTransition)

  function doTransition () {
    then = 0
    lowest = 0
    highest = 0
    avg = 0
    frameNumber = 0
    animationFinished = false

    requestAnimationFrame(render)
    var tl = new TimelineMax({ onComplete: () => { animationFinished = true } })
    const target = document.getElementById('clicker-insert_bills_state')
    tl.set('.fade-in-delay', { opacity: 0, y: +30 })
      .set('.fade-in', { opacity: 0, y: +30 })
      .set('.crypto-buttons', { zIndex: -2 })
      .to(background, 0.5, { scale: 2 })
      .to('.fade-in', 0.4, {
        opacity: 1,
        onStart: click,
        onStartParams: [{ target }],
        y: 0
      }, '=-0.2')
      .to('.fade-in-delay', 0.4, { opacity: 1, y: 0 }, '=-0.2')
      .set(background, { scale: 1 })
      .set('.crypto-buttons', { zIndex: 0 })
  }

  const metrics = document.querySelector('#metrics')
  metrics.classList.remove('hide')

  function render (now) {
    const deltaTime = now - then

    frameNumber++
    if (then) {
      if (!lowest || deltaTime < lowest) {
        lowest = deltaTime
      }

      if (!highest || deltaTime > highest) {
        highest = deltaTime
      }

      avg = (deltaTime + (avg * (frameNumber - 1))) / frameNumber
    }

    metrics.innerHTML = `
frame: ${frameNumber} <br/>
ms: ${deltaTime} <br/>
lowest: ${lowest} <br/>
highest: ${highest} <br/>
avg: ${avg}
    `

    then = now
    if (!animationFinished) {
      requestAnimationFrame(render)
    }
  }
}
