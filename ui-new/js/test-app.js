/* globals $, Keypad, TimelineMax, requestAnimationFrame, Two */

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
let background = null
let aspectRatio800 = true

$(function () {
  $('body').css('cursor', 'default')

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
  setupAnimation(false, aspectRatio800)

  phoneKeypad = new Keypad('phone-keypad', { type: 'phoneNumber', country: 'US' }, function (result) {
    console.log('phoneNumber', result)
  })

  phoneKeypad.activate()

  securityKeypad = new Keypad('security-keypad', { type: 'code' }, function (result) {
    console.log('phoneNumber', result)
  })

  securityKeypad.activate()

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
  $('.js-i18n-total-purchased').html('total purchased')
  $('.js-crypto-display-units').text('mBTC')
  $('.deposit_state .digital .js-amount').html(34.479)
  $('.deposit_state .fiat .js-amount').text(320)
  $('.js-currency').text('EUR')
  $('.js-i18n-scan-your-address').html('Scan your <br/> BTC address')
  $('.js-processing-bill').text('Vous avez introduit un billet de 50 USD')

  let states = [
    $('.scan_address_state'),
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
  qrize(address, $('#cash-in-fail-qr-code'), CASH_IN_QR_COLOR)
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

function setupAnimation (isTwoWay, isAr800) {
  var elem = document.getElementById('bg-to-show')
  while (elem.firstChild) {
    elem.removeChild(elem.firstChild)
  }
  var two = new Two({ fullscreen: true, type: Two.Types.webgl, autostart: true }).appendTo(elem)

  console.log(`${isTwoWay ? 'two-way' : 'one-way'}-${isAr800 ? '800' : '1080'}`)
  background = two.interpret(document.getElementById(`${isTwoWay ? 'two-way' : 'one-way'}-${isAr800 ? '800' : '1080'}`))
  background.scale = 1
}
