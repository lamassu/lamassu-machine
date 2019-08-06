/* globals $, URLSearchParams, WebSocket, Audio, locales, Keyboard, Keypad, Jed, BigNumber, HOST, PORT, Origami, kjua, TimelineMax, Two */
'use strict'

const queryString = window.location.search
const params = new URLSearchParams(queryString.substring(1))
const SCREEN = params.get('screen')
const DEBUG_MODE = SCREEN ? 'demo' : params.get('debug')
const CASH_OUT_QR_COLOR = '#403c51'
const CASH_IN_QR_COLOR = '#0e4160'

var scrollSize = 0
var textHeightQuantity = 0
var currentPage = 0
var totalPages = 0
var aspectRatio = '16:10'
var isTwoWay = null
var isRTL = false
var two = null
var cryptomatModel = null
var termsConditionsTimeout = null
var T_C_TIMEOUT = 30000

var fiatCode = null
var locale = null
var localeCode = null
var jsLocaleCode = null // Sometimes slightly different than localeCode
var _primaryLocales = []
var lastRates = null
var coins = {
  BTC: {
    unitScale: 8,
    displayScale: 5,
    displayCode: 'mBTC'
  },
  ETH: {
    unitScale: 18,
    displayScale: 15,
    displayCode: 'mETH'
  },
  ZEC: {
    unitScale: 8,
    displayScale: 5,
    displayCode: 'mZEC'
  },
  LTC: {
    unitScale: 8,
    displayScale: 5,
    displayCode: 'mLTC'
  },
  DASH: {
    unitScale: 8,
    displayScale: 5,
    displayCode: 'mDASH'
  },
  BCH: {
    unitScale: 8,
    displayScale: 5,
    displayCode: 'mBCH'
  }
}

var currentState

var confirmBeep = null
var accepting = false
var websocket = null
var wifiKeyboard = null
var phoneKeypad = null
var securityKeypad = null
var previousState = null
var buttonActive = true
var cassettes = null
let currentCryptoCode = null
let currentCoin = null
let currentCoins = []

var MUSEO = ['ca', 'cs', 'da', 'de', 'en', 'es', 'et', 'fi', 'fr', 'hr',
  'hu', 'it', 'lt', 'nb', 'nl', 'pl', 'pt', 'ro', 'sl', 'sv', 'tr']

function connect () {
  console.log(`ws://${HOST}:${PORT}/`)
  websocket = new WebSocket(`ws://${HOST}:${PORT}/`)
  websocket.onmessage = function (event) {
    var data = $.parseJSON(event.data)
    processData(data)
  }
  websocket.onerror = err => console.log(err)
}

function verifyConnection () {
  if (websocket.readyState === websocket.CLOSED) {
    connect()
  }
}

function buttonPressed (button, data) {
  if (!buttonActive) return
  wifiKeyboard.deactivate()
  buttonActive = false
  setTimeout(function () {
    buttonActive = true
    wifiKeyboard.activate()
  }, 300)
  var res = {button: button}
  if (data || data === null) res.data = data
  if (websocket) websocket.send(JSON.stringify(res))
}

function processData (data) {
  if (data.localeInfo) setLocaleInfo(data.localeInfo)
  if (data.locale) setLocale(data.locale)
  if (!locale) return
  if (data.fiatCode) setFiatCode(data.fiatCode)
  if (data.rates) setExchangeRate(data.rates)
  if (data.buyerAddress) setBuyerAddress(data.buyerAddress)
  if (data.credit) {
    var lastBill = data.action === 'rejectedBill' ? null : data.credit.lastBill
    setCredit(data.credit.fiat, data.credit.cryptoAtoms, lastBill, data.credit.cryptoCode)
  }
  if (data.tx) setTx(data.tx)
  if (data.wifiList) setWifiList(data.wifiList)
  if (data.wifiSsid) setWifiSsid(data.wifiSsid)
  if (data.sendOnly) sendOnly(data.reason)
  if (data.fiatCredit) fiatCredit(data.fiatCredit)
  if (data.depositInfo) setDepositAddress(data.depositInfo)
  if (data.version) setVersion(data.version)
  if (data.cassettes) setupCassettes(data.cassettes)
  if (data.beep) confirmBeep.play()
  if (data.sent && data.total) setPartialSend(data.sent, data.total)
  if (data.readingBill) readingBill(data.readingBill)
  if (data.cryptoCode) translateCoin(data.cryptoCode)
  if (data.tx && data.tx.cashInFee) setFixedFee(data.tx.cashInFee)
  if (data.terms) setTermsScreen(data.terms)
  if (data.dispenseBatch) dispenseBatch(data.dispenseBatch)
  if (data.direction) setDirection(data.direction)
  if (data.operatorInfo) setOperatorInfo(data.operatorInfo)
  if (data.hardLimitHours) setHardLimitHours(data.hardLimitHours)
  if (data.cryptomatModel) setCryptomatModel(data.cryptomatModel)

  if (data.context) {
    $('.js-context').hide()
    $('.js-context-' + data.context).show()
  }

  switch (data.action) {
    case 'wifiList':
      if (cryptomatModel === 'douro1') {
        setState('wifi')
      } else {
        setState('connect_ethernet')
      }
      break
    case 'wifiPass':
      setState('wifi_password')
      break
    case 'wifiConnecting':
      t('wifi-connecting',
        locale.translate('This could take a few moments.').fetch())
      setState('wifi_connecting')
      break
    case 'wifiConnected':
      t('wifi-connecting',
        locale.translate('Connected. Waiting for ticker.').fetch())
      setState('wifi_connecting') // in case we didn't go through wifi-connecting
      break
    case 'pairing':
      confirmBeep.play()
      setState('pairing')
      break
    case 'pairingError':
      $('.js-pairing-error').text(data.err)
      // Give it some time to update text in background
      setTimeout(function () { setState('pairing_error') }, 500)
      break
    case 'booting':
      if (currentState !== 'maintenance') setState('booting')
      break
    case 'idle':
    case 'fakeIdle':
      setState('idle')
      break
    case 'dualIdle':
    case 'fakeDualIdle':
      setState('dual_idle')
      break
    case 'registerPhone':
      phoneKeypad.activate()
      setState('register_phone')
      break
    case 'securityCode':
      securityKeypad.activate()
      setState('security_code')
      break
    case 'scanned':
      setState('insert_bills')
      break
    case 'acceptingFirstBill':
      $('.js-send-crypto-disable').hide()
      $('.js-send-crypto-enable').show()
      setState('insert_bills')
      break
    case 'acceptingBills':
      $('.blocked-customer-top').hide()
      setState('insert_more_bills')
      break
    case 'acceptingBill':
      setAccepting(true)
      break
    case 'rejectedBill':
      setAccepting(false)
      break
    case 'cryptoTransferPending':
      setState('sending_coins')
      break
    case 'cryptoTransferComplete':
      confirmBeep.play()
      setState('completed')
      break
    case 'networkDown':
      setState('trouble')
      break
    case 'balanceLow':
    case 'insufficientFunds':
      setState('limit_reached')
      break
    case 'highBill':
      highBill(data.highestBill, data.reason)
      break
    case 'minimumTx':
      minimumTx(data.lowestBill)
      break
    case 'chooseFiat':
      chooseFiat(data.chooseFiat)
      break
    case 'deposit':
      setState('deposit')
      deposit(data.tx)
      break
    case 'rejectedDeposit':
      setState('deposit_timeout')
      break
    case 'fiatReceipt':
      fiatReceipt(data.tx)
      break
    case 'fiatComplete':
      fiatComplete(data.tx)
      break
    case 'restart':
      setState('restart')
      break
    case 'chooseCoin':
      chooseCoin(data.coins, data.twoWayMode)
      break
    case 'smsVerification':
      smsVerification(data.threshold)
      break
    case 'idVerification':
      idVerification()
      break
    case 'facephotoPermission':
      facephotoPermission()
      break
    case 'blockedCustomer':
      blockedCustomer()
      break
    default:
      if (data.action) setState(window.snakecase(data.action))
  }
}

function facephotoPermission () {
  setScreen('facephoto_permission')
}

function idVerification () {
  setScreen('id_verification')
}

function smsVerification (threshold) {
  console.log('sms threshold to be displayed', threshold)
  setScreen('sms_verification')
}

function blockedCustomer () {
  return setScreen('blocked_customer')
}

function chooseCoin (coins, twoWayMode) {
  if (twoWayMode) {
    $('.choose_coin_state').removeClass('choose-coin-cash-in').addClass('choose-coin-two-way')
  } else {
    $('.choose_coin_state').removeClass('choose-coin-two-way').addClass('choose-coin-cash-in')
  }

  isTwoWay = twoWayMode
  setChooseCoinColors()
  // setupAnimation(twoWayMode, aspectRatio800)

  const defaultCoin = coins[0]

  currentCryptoCode = defaultCoin.cryptoCode
  currentCoin = defaultCoin
  currentCoins = coins.slice(0)

  setCryptoBuy(defaultCoin)
  setCryptoSell(defaultCoin)

  setupCoinsButtons(coins, currentCryptoCode)

  setState('choose_coin')
}

function openLanguageDropdown () {
  $('#language-dropdown-toggle').addClass('hide')
  $('#languages').removeClass('hide')
  $('#language-overlay').removeClass('hide')
}

function closeLanguageDropdown () {
  $('#language-dropdown-toggle').removeClass('hide')
  $('#languages').addClass('hide')
  $('#language-overlay').addClass('hide')
}

function openCoinDropdown () {
  $('#crypto-dropdown-toggle').addClass('hide')
  $('#crypto-overlay').removeClass('hide')
  $('#cryptos').removeClass('hide')
}

function closeCoinDropdown () {
  $('#crypto-dropdown-toggle').removeClass('hide')
  $('#crypto-overlay').addClass('hide')
  $('#cryptos').addClass('hide')
}

function setupCoinsButtons () {
  $('.crypto-buttons').empty()
  closeCoinDropdown()

  let coins = currentCoins.slice()
  let dropdownCoins = []

  if (coins.length === 1) return

  const showMoreButton = coins.length > 4
  if (showMoreButton) {
    $('crypto-dropdown-toggle').removeClass('hide')
    dropdownCoins = coins.slice(3)
    coins = coins.slice(0, 3)
  } else {
    $('crypto-dropdown-toggle').addClass('hide')
  }

  coins.forEach(function (coin) {
    const activeClass = coin.cryptoCode === currentCryptoCode ? 'choose-coin-button-active' : ''
    const el = `<div class="choose-coin-button h4 coin-${coin.cryptoCode.toLowerCase()} ${activeClass}" data-crypto-code="${coin.cryptoCode}">
      ${coin.display}
      <span class="choose-coin-svg-wrapper">
        <svg xmlns="http://www.w3.org/2000/svg" width="52" height="8" viewBox="0 0 52 8">
          <path fill="none" fill-rule="evenodd" stroke="#FFF" stroke-linecap="round" stroke-width="8" d="M4 4h44"/>
        </svg>
      </span>
    </div>`
    $('.crypto-buttons').append(el)
  })
  if (showMoreButton) {
    $('.crypto-buttons').append(`
      <div class="choose-coin-button h4" data-more="true">
        <div id="crypto-dropdown-toggle" data-more="true">
          More
          <span class="choose-coin-svg-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="52" height="8" viewBox="0 0 52 8">
              <path fill="none" fill-rule="evenodd" stroke="#FFF" stroke-linecap="round" stroke-width="8" d="M4 4h44"/>
            </svg>
          </span>
        </div>
        <div id="cryptos" class="dropdown hide"></div>
      </div>
    `)
    dropdownCoins.forEach(coin => {
      const el = `<button class="h4 sapphire button small-action-button coin-${coin.cryptoCode.toLowerCase()}"
        data-crypto-code="${coin.cryptoCode}">${coin.display}</button>`
      $('#cryptos').append(el)
    })
    const el = `<button class="h4 sapphire button small-action-button" data-less="true">Less</button>`
    $('#cryptos').append(el)
  }
}

function setCryptoBuy (coin) {
  const cashIn = $('.cash-in')
  const translatedCoin = locale.translate(coin.display).fetch()
  const buyStr = locale.translate('Buy<br/>%s').fetch(translatedCoin)

  cashIn.html(buyStr)
}

function setCryptoSell (coin) {
  const cashOut = $('.cash-out')
  const translatedCoin = locale.translate(coin.display).fetch()
  const sellStr = locale.translate('Sell<br/>%s').fetch(translatedCoin)

  cashOut.html(sellStr)
}

function switchCoin (coin) {
  const cashIn = $('.cash-in')
  const cashOut = $('.cash-out')
  const cryptoCode = coin.cryptoCode

  if (currentCryptoCode === cryptoCode) return

  $(`.coin-${currentCryptoCode.toLowerCase()}`).removeClass('choose-coin-button-active')
  $(`.coin-${cryptoCode.toLowerCase()}`).addClass('choose-coin-button-active')
  currentCryptoCode = cryptoCode
  currentCoin = coin

  cashIn.addClass('crypto-switch')
  setTimeout(() => setCryptoBuy(coin), 100)
  setTimeout(() => cashIn.removeClass('crypto-switch'), 1000)

  setTimeout(() => {
    cashOut.addClass('crypto-switch')
    setTimeout(() => setCryptoSell(coin), 100)
    setTimeout(() => cashOut.removeClass('crypto-switch'), 1000)
  }, 80)

  const selectedIndex = currentCoins.indexOf(currentCoins.find(it => it.cryptoCode === cryptoCode)) 
  if (currentCoins.length > 4 && selectedIndex > 2) {
    currentCoins.splice(2, 0, currentCoins.splice(selectedIndex, 1)[0])
  }

  setupCoinsButtons()
}

$(document).ready(function () {
  const attachFastClick = Origami.fastclick
  attachFastClick(document.body)

  window.addEventListener('resize', () => {
    calculateAspectRatio()
    setChooseCoinColors()
  })

  // Matt's anti-drag hack
  window.onclick =
    window.oncontextmenu =
      window.onmousedown =
        window.onmousemove =
          window.onmouseup =
            function () { return false }

  BigNumber.config({ROUNDING_MODE: BigNumber.ROUND_HALF_EVEN})

  wifiKeyboard = new Keyboard('wifi-keyboard').init()

  phoneKeypad = new Keypad('phone-keypad', {type: 'phoneNumber', country: 'US'}, function (result) {
    if (currentState !== 'register_phone') return
    buttonPressed('phoneNumber', result)
  })

  securityKeypad = new Keypad('security-keypad', {type: 'code'}, function (result) {
    if (currentState !== 'security_code') return
    buttonPressed('securityCode', result)
  })

  // buffers automatically when created
  confirmBeep = new Audio('sounds/Confirm8-Bit.ogg')

  if (DEBUG_MODE !== 'demo') {
    connect()
    setInterval(verifyConnection, 1000)
  }

  initTranslatePage()

  var wifiNetworkButtons = document.getElementById('networks')
  touchEvent(wifiNetworkButtons, function (e) {
    var target = $(e.target)
    if (target.attr('id') === 'more-networks') {
      moreNetworks()
    } else {
      var networkButton = target.closest('.wifi-network-button')
      $('#networks > .active').removeClass('active')
      networkButton.addClass('active')
      window.setTimeout(function () { networkButton.removeClass('active') }, 1000)
      var ssidEl = networkButton.find('.ssid')
      var ssid = ssidEl.data('ssid')
      if (ssid) {
        var displaySsid = ssidEl.text()
        var rawSsid = ssidEl.data('raw-ssid')
        buttonPressed('wifiSelect',
          {ssid: ssid, rawSsid: rawSsid, displaySsid: displaySsid})
      }
    }
  })

  var wifiConnectButton = document.getElementById('wifiConnect')
  touchEvent(wifiConnectButton, function () {
    var wifiConnectButtonJ = $(wifiConnectButton)
    wifiConnectButtonJ.addClass('active')
    window.setTimeout(function () { wifiConnectButtonJ.removeClass('active') }, 500)
    var pass = $('#wifi-keyboard input.passphrase').data('content')
    var ssid = $('#js-i18n-wifi-for-ssid').data('ssid')
    var rawSsid = $('#js-i18n-wifi-for-ssid').data('raw-ssid')
    buttonPressed('wifiConnect', {pass: pass, ssid: ssid, rawSsid: rawSsid})
  })

  var sendCoinsButton = document.getElementById('send-coins')
  var sendCoinsButton2 = document.getElementById('send-only-send-coins')
  touchEvent(sendCoinsButton, function () {
    setState('sending_coins')
    buttonPressed('sendCoins')
  })

  touchEvent(sendCoinsButton2, function () {
    setState('sending_coins')
    buttonPressed('sendCoins')
  })

  const blockedCustomerOk = document.getElementById('blocked-customer-ok')
  touchEvent(blockedCustomerOk, function () {
    buttonPressed('blockedCustomerOk')
  })
  var insertBillCancelButton = document.getElementById('insertBillCancel')
  touchImmediateEvent(insertBillCancelButton, function () {
    setBuyerAddress(null)
    buttonPressed('cancelInsertBill')
  })

  setupImmediateButton('wifiPassCancel', 'cancelWifiPass')
  setupImmediateButton('scanCancel', 'cancelScan')
  setupImmediateButton('completed_viewport', 'completed')
  setupImmediateButton('withdraw_failure_viewport', 'completed')
  setupImmediateButton('fiat_receipt_viewport', 'completed')
  setupImmediateButton('fiat_complete_viewport', 'completed')
  setupImmediateButton('chooseFiatCancel', 'chooseFiatCancel')
  setupImmediateButton('depositCancel', 'depositCancel')
  setupImmediateButton('printer-scan-cancel', 'cancelScan')

  setupButton('printer-back-to-home', 'idle')
  setupButton('printer-print-again', 'printAgain')
  setupButton('printer-print-again2', 'printAgain')
  setupButton('printer-scan-again', 'printerScanAgain')

  setupButton('initialize', 'initialize')
  // setupButton('test-mode', 'testMode')
  setupButton('pairing-scan', 'pairingScan')
  setupButton('pairing-scan-cancel', 'pairingScanCancel')
  setupButton('pairing-error-ok', 'pairingErrorOk')
  setupButton('cash-out-button', 'cashOut')

  setupImmediateButton('scan-id-cancel', 'cancelIdScan')
  setupImmediateButton('scan-photo-cancel', 'cancelIdScan')
  setupImmediateButton('phone-number-cancel', 'cancelPhoneNumber',
    phoneKeypad.deactivate.bind(phoneKeypad))
  setupImmediateButton('security-code-cancel', 'cancelSecurityCode',
    securityKeypad.deactivate.bind(securityKeypad))
  setupButton('id-verification-failed-ok', 'idVerificationFailedOk')
  setupButton('id-scan-failed-try-again', 'idCodeFailedRetry')
  setupButton('id-scan-failed-cancel', 'idVerificationFailedOk')
  setupButton('id-code-failed-retry', 'idCodeFailedRetry')
  setupButton('id-code-failed-cancel', 'bye')
  setupButton('id-verification-error-ok', 'idVerificationErrorOk')
  setupButton('photo-scan-failed-retry', 'retryPhotoScan')
  setupButton('photo-scan-failed-cancel', 'bye')
  setupButton('photo-verification-failed-ok', 'cancelIdScan')
  setupButton('invalid-address-try-again', 'invalidAddressTryAgain')
  setupButton('address-reuse-start-over', 'idle')
  setupButton('suspicious-address-start-over', 'idle')

  setupButton('sanctions-failure-ok', 'idle')
  setupButton('limit-reached-ok', 'idle')
  setupButton('hard-limit-reached-ok', 'idle')
  setupButton('deposit-timeout-sent-yes', 'depositTimeout')
  setupButton('deposit-timeout-sent-no', 'depositTimeoutNotSent')
  setupButton('out-of-cash-ok', 'idle')

  setupButton('bad-phone-number-ok', 'badPhoneNumberOk')
  setupButton('bad-security-code-ok', 'badSecurityCodeOk')
  setupButton('max-phone-retries-ok', 'maxPhoneRetriesOk')
  setupButton('redeem-later-ok', 'idle')
  setupButton('pre-receipt-ok', 'fiatReceipt')
  setupButton('fiat-error-ok', 'idle')
  setupButton('network-down-ok', 'idle')
  setupButton('fiat-transaction-error-ok', 'fiatReceipt')

  setupButton('unknown-phone-number-ok', 'idle')
  setupButton('unconfirmed-deposit-ok', 'idle')
  setupButton('tx-not-seen-ok', 'idle')
  setupButton('wrong-dispenser-currency-ok', 'idle')

  setupButton('terms-ok', 'termsAccepted')
  setupButton('terms-ko', 'idle')

  calculateAspectRatio()

  const cryptoButtons = document.getElementById('crypto-buttons')
  touchEvent(cryptoButtons, event => {
    let el = $(event.target)
    if (el.is('path') || el.is('svg') || el.is('span')) {
      el = el.closest('div')
    }

    if (el.data('more')) {
      openCoinDropdown()
      return
    }

    if (el.data('less')) {
      closeCoinDropdown()
      return
    }

    const coin = { cryptoCode: el.data('cryptoCode'), display: el.text() }
    if (!coin.cryptoCode) return
    switchCoin(coin)
  })

  var areYouSureCancel = document.getElementById('are-you-sure-cancel-transaction')
  touchEvent(areYouSureCancel, () => buttonPressed('cancelTransaction', previousState))

  var areYouSureContinue = document.getElementById('are-you-sure-continue-transaction')
  touchEvent(areYouSureContinue, () => buttonPressed('continueTransaction', previousState))

  var coinRedeem = document.getElementById('coin-redeem-button')
  touchEvent(coinRedeem, () => {
    setDirection('cashOut')
    buttonPressed('redeem')
  })

  setupButton('facephoto-scan-failed-retry', 'retryFacephoto')
  setupButton('id-start-verification', 'permissionIdCompliance')
  setupButton('sms-start-verification', 'permissionSmsCompliance')
  setupButton('facephoto-permission-yes', 'permissionPhotoCompliance')

  setupButton('send-coins-id', 'finishBeforeSms')
  setupButton('send-coins-id-2', 'finishBeforeSms')
  setupButton('send-coins-sms', 'finishBeforeSms')
  setupButton('send-coins-sms-2', 'finishBeforeSms')

  setupButton('facephoto-permission-no', 'finishBeforeSms')
  setupButton('facephoto-scan-failed-cancel', 'finishBeforeSms')
  setupButton('facephoto-scan-failed-cancel2', 'finishBeforeSms')

  touchEvent(document.getElementById('change-language-section'), () => {
    if (_primaryLocales.length === 2) {
      setLocale(otherLocale())
      setCryptoBuy(currentCoin)
      setCryptoSell(currentCoin)
      return
    }
    openLanguageDropdown()
  })

  const cashInBox = document.getElementById('cash-in-box')
  touchEvent(cashInBox, () => {
    buttonPressed('start', { cryptoCode: currentCryptoCode, direction: 'cashIn' })
  })

  const cashOutBox = document.getElementById('cash-out-box')
  touchEvent(cashOutBox, () => {
    buttonPressed('start', { cryptoCode: currentCryptoCode, direction: 'cashOut' })
  })

  var lastTouch = null

  var languageOverlay = document.getElementById('language-overlay')
  touchEvent(languageOverlay, function (e) {
    closeLanguageDropdown()
  })

  var cryptoOverlay = document.getElementById('crypto-overlay')
  touchEvent(cryptoOverlay, function (e) {
    closeCoinDropdown()
  })

  var languageButtons = document.getElementById('languages')
  touchEvent(languageButtons, function (e) {
    var languageButtonJ = $(e.target).closest('button')
    if (languageButtonJ.length === 0) return
    var newLocale = languageButtonJ.attr('data-locale')

    if (!newLocale) {
      closeLanguageDropdown()
      return
    }

    setLocale(newLocale)
    setCryptoBuy(currentCoin)
    setCryptoSell(currentCoin)
    closeLanguageDropdown()
  })

  var fiatButtons = document.getElementById('js-fiat-buttons')
  touchImmediateEvent(fiatButtons, function (e) {
    var now = Date.now()
    if (lastTouch && now - lastTouch < 100) return
    lastTouch = now
    var cashButtonJ = $(e.target).closest('.cash-button')
    if (cashButtonJ.length === 0) return
    if (cashButtonJ.hasClass('disabled')) return
    if (cashButtonJ.hasClass('clear')) return buttonPressed('clearFiat')
    var denominationIndex = cashButtonJ.attr('data-denomination-index')
    var denominationRec = cassettes[denominationIndex]
    buttonPressed('fiatButton', {denomination: denominationRec.denomination})
  })

  initDebug()
})

function targetButton (element) {
  var classList = element.classList || []
  var special = classList.contains('button') ||
    classList.contains('circle-button') ||
    classList.contains('wifi-network-button') ||
    classList.contains('square-button')
  if (special) { return element }
  return targetButton(element.parentNode)
}

function touchEvent (element, callback) {
  function handler (e) {
    var target = targetButton(e.target)

    target.classList.add('active')

    // Wait for transition to finish
    setTimeout(function () {
      target.classList.remove('active')
    }, 300)

    setTimeout(function () {
      callback(e)
    }, 200)

    e.stopPropagation()
    e.preventDefault()
  }

  element.addEventListener('touchstart', handler)
  element.addEventListener('mousedown', handler)
}

function touchImmediateEvent (element, callback) {
  function handler (e) {
    callback(e)
    e.stopPropagation()
    e.preventDefault()
  }
  element.addEventListener('touchstart', handler)
  element.addEventListener('mousedown', handler)
}

function setupImmediateButton (buttonClass, buttonAction, callback) {
  var button = document.getElementById(buttonClass)
  touchImmediateEvent(button, function () {
    if (callback) callback()
    buttonPressed(buttonAction)
  })
}

function setupButton (buttonClass, buttonAction, actionData) {
  var button = document.getElementById(buttonClass)
  touchEvent(button, function () {
    buttonPressed(buttonAction, actionData)
  })
}

function setScreen (newScreen, oldScreen) {
  if (newScreen === oldScreen) return

  if (newScreen === 'insert_bills') {
    $('.js-processing-bill').html(locale.translate('Lamassu Cryptomat').fetch())
    $('.bill img').css({'-webkit-transform': 'none', top: 0, left: 0})
  }

  var newView = $('.' + newScreen + '_state')

  $('.viewport').removeClass('viewport-active')
  newView.addClass('viewport-active')
}

function setState (state, delay) {
  if (state === currentState) return

  previousState = currentState
  currentState = state

  wifiKeyboard.reset()

  if (state === 'idle') {
    $('.qr-code').empty()
    $('.qr-code-deposit').empty()
  }

  if (delay) {
    window.setTimeout(function () {
      setScreen(currentState, previousState)
    }, delay)
  } else setScreen(currentState, previousState)
}

function revertScreen () { setScreen(currentState) }

function setWifiList (recs, requestedPage) {
  var networks = $('#networks')
  if (!recs) recs = networks.data('recs')
  var page = requestedPage || networks.data('page') || 0
  var offset = page * 4
  if (offset > recs.length - 1) {
    offset = 0
    page = 0
  }
  $('#more-networks').css({'display': 'none'})
  networks.empty()
  networks.data('page', page)
  networks.data('recs', recs)
  var remainingCount = recs.length - offset
  var len = Math.min(remainingCount, 4)
  for (var i = 0; i < len; i++) {
    var rec = recs[i + offset]
    var bars = Math.floor(rec.strength * 4) + 1
    var html = '<div class="wifi-network-button filled-action-button tl2">' +
    '<span class="ssid" data-raw-ssid="' + rec.rawSsid + '" data-ssid="' +
      rec.ssid + '">' + rec.displaySsid +
    '</span>' + '<div class="wifiicon-wrapper"><img src="images/wifiicon/' + bars + '.svg"/></div></div>'
    networks.append(html)
  }

  var moreTxt = locale.translate('MORE').fetch()
  var button = '<span display="inline-block" id="more-networks" class="button filled-action-button tl2">' + moreTxt + '</span>'
  if (recs.length > 4) {
    networks.append(button)
  }
}

function setUpDirectionElement (element, direction) {
  if (direction === 'cashOut') {
    element.removeClass('cash-in-color')
    element.addClass('cash-out-color')
  } else {
    element.addClass('cash-in-color')
    element.removeClass('cash-out-color')
  }
}

function setOperatorInfo (operator) {
  if (!operator || !operator.active) {
    $('.contacts, .contacts-compact').addClass('hide')
  } else {
    $('.contacts, .contacts-compact').removeClass('hide')
    $('.operator-name').text(operator.name)
    $('.operator-email').text(operator.email)
    $('.operator-phone').text(operator.phone)
  }
}

function setHardLimitHours (hours) {
  $('#hard-limit-hours').text(locale.translate('Please come back in %s hours').fetch(hours))
}

function setCryptomatModel (model) {
  cryptomatModel = model
  const versions = ['sintra', 'douro', 'gaia']
  const body = $('body')

  versions.forEach(it => body.removeClass(it))
  $('body').addClass(model.startsWith('douro') ? 'douro' : model)
}

function setDirection (direction) {
  let states = [
    $('.scan_photo_state'),
    $('.scan_id_state'),
    $('.security_code_state'),
    $('.register_phone_state'),
    $('.terms_screen_state'),
    $('.verifying_photo_state'),
    $('.verifying_facephoto_state'),
    $('.verifying_id_state'),
    $('.id_verification_state'),
    $('.sms_verification_state'),
    $('.bad_phone_number_state'),
    $('.bad_security_code_state'),
    $('.max_phone_retries_state'),
    $('.id_verification_failed_state'),
    $('.photo_verification_failed_state'),
    $('.blocked_customer_state'),
    $('.fiat_error_state'),
    $('.fiat_transaction_error_state'),
    $('.id_scan_failed_state'),
    $('.sanctions_failure_state'),
    $('.id_verification_error_state'),
    $('.facephoto_state'),
    $('.facephoto_retry_state'),
    $('.facephoto_permission_state'),
    $('.facephoto_failed_state'),
    $('.hard_limit_reached_state'),
    $('.photo_scan_failed_state'),
    $('.id_code_failed_state'),
    $('.waiting_state')
  ]
  states.forEach(it => {
    setUpDirectionElement(it, direction)
  })
}

/**
 *
 * @param {Object} data
 * @param {boolean} data.active
 * @param {String} data.title
 * @param {String} data.text
 * @param {String} data.accept
 * @param {String} data.cancel
 */
function setTermsScreen (data) {
  const $screen = $('.terms_screen_state')
  $screen.find('.js-terms-title').html(data.title)
  startPage(data.text)
  $screen.find('.js-terms-accept-button').html(data.accept)
  $screen.find('.js-terms-cancel-button').html(data.cancel)
  setTermsConditionsTimeout()
}

function clearTermsConditionsTimeout () {
  clearTimeout(termsConditionsTimeout)
}

function setTermsConditionsTimeout () {
  termsConditionsTimeout = setTimeout(function () {
    if (currentState === 'terms_screen') {
      buttonPressed('idle')
    }
  }, T_C_TIMEOUT)
}

function resetTermsConditionsTimeout () {
  clearTermsConditionsTimeout()
  setTermsConditionsTimeout()
}

// click page up button
function scrollUp () {
  resetTermsConditionsTimeout()
  const div = document.getElementById('js-terms-text-div')
  if (currentPage !== 0) {
    currentPage -= 1
    updateButtonStyles()
    updatePageCounter()
    div.scrollTo(0, currentPage * scrollSize)
  }
}

// start page
function startPage (text) {
  const $screen = $('.terms_screen_state')
  $screen.find('.js-terms-text').html(text)
  currentPage = 0
  totalPages = 0
  setTimeout(function () {
    const div = document.getElementById('js-terms-text-div')
    textHeightQuantity = document.getElementById('js-terms-text').offsetHeight
    scrollSize = div.offsetHeight - 40
    updateButtonStyles()
    if (textHeightQuantity <= div.offsetHeight) {
      document.getElementById('actions-scroll').style.display = 'none'
    } else {
      div.scrollTo(0, 0)
      totalPages = Math.ceil(textHeightQuantity / scrollSize)
      updatePageCounter()
    }
  }, 100)
}

function updatePageCounter () {
  document.getElementById('terms-page-counter').textContent = `${currentPage + 1}/${totalPages}`
}

// click page up button
function scrollDown () {
  resetTermsConditionsTimeout()
  const div = document.getElementById('js-terms-text-div')
  if (!(currentPage * scrollSize + scrollSize > textHeightQuantity && currentPage !== 0)) {
    currentPage += 1
    updateButtonStyles()
    updatePageCounter()
    div.scrollTo(0, currentPage * scrollSize)
  }
}

function updateButtonStyles () {
  textHeightQuantity = document.getElementById('js-terms-text').offsetHeight
  const buttonDown = document.getElementById('scroll-down')
  const buttonUp = document.getElementById('scroll-up')
  if (currentPage === 0) {
    buttonUp.disabled = true
  } else {
    buttonUp.disabled = false
  }

  if (currentPage * scrollSize + scrollSize > textHeightQuantity && currentPage !== 0) {
    buttonDown.disabled = true
  } else {
    buttonDown.disabled = false
  }
}

function moreNetworks () {
  var networks = $('#networks')
  var page = networks.data('page')
  setWifiList(null, page + 1)
}

function setWifiSsid (data) {
  $('#js-i18n-wifi-for-ssid').data('ssid', data.ssid)
  $('#js-i18n-wifi-for-ssid').data('raw-ssid', data.rawSsid)
  t('wifi-for-ssid', locale.translate('for %s')
    .fetch('<strong>' + data.ssid + '</strong>'))
  t('wifi-connect', locale.translate("You're connecting to the WiFi network %s")
    .fetch('<strong>' + data.ssid + '</strong>'))
}

function setLocaleInfo (data) {
  phoneKeypad.setCountry(data.country)
  setPrimaryLocales(data.primaryLocales)
  setLocale(data.primaryLocale)
}

function otherLanguageName () {
  const lang = lookupLocaleNames(otherLocale())
  return lang && lang.nativeName
}

function otherLocale () {
  return _primaryLocales.find(c => c !== localeCode)
}

function setLocale (data) {
  if (!data || data === localeCode) return
  localeCode = data
  jsLocaleCode = data
  var lang = localeCode.split('-')[0]

  if (jsLocaleCode === 'fr-QC') jsLocaleCode = 'fr-CA'

  var isArabic = jsLocaleCode.indexOf('ar-') === 0
  var isHebrew = jsLocaleCode.indexOf('he-') === 0
  isRTL = isArabic || isHebrew

  setChooseCoinColors()
  // setupAnimation(isTwoWay, aspectRatio800)

  if (isRTL) {
    $('body').addClass('i18n-rtl')
  } else {
    $('body').removeClass('i18n-rtl')
  }

  if (isArabic) {
    $('body').addClass('i18n-ar')
  } else {
    $('body').removeClass('i18n-ar')
  }

  if (isHebrew) {
    $('body').addClass('i18n-he')
  } else {
    $('body').removeClass('i18n-he')
  }

  if (MUSEO.indexOf(lang) !== -1) $('body').addClass('museo')
  else $('body').removeClass('museo')

  locale = loadI18n(localeCode)
  try { translatePage() } catch (ex) {}

  $('.js-two-language').html(otherLanguageName())

  if (lastRates) setExchangeRate(lastRates)
}

function setChooseCoinColors () {
  var elem = $('#bg-to-show > img')
  let img = `images/background/${isTwoWay ? '2way' : '1way'}-${aspectRatio}${isRTL ? '-rtl' : ''}.svg`
  if (img !== elem.attr('src')) {
    elem.attr('src', img)
  }

  if (isTwoWay) {
    $('.choose_coin_state .change-language').removeClass('cash-in-color').addClass('cash-out-color')
  } else {
    $('.choose_coin_state .change-language').removeClass('cash-out-color').addClass('cash-in-color')
  }
}

function areArraysEqual (arr1, arr2) {
  if (arr1.length !== arr2.length) return false
  for (var i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false
  }
  return true
}

function lookupLocaleNames (locale) {
  if (!locale) return
  var langMap = window.languageMappingList
  var language = locale.split('-')[0]
  var localeNames = langMap[language]
  return localeNames || langMap[locale]
}

function setPrimaryLocales (primaryLocales) {
  if (areArraysEqual(primaryLocales, _primaryLocales)) return
  _primaryLocales = primaryLocales

  var languages = $('#languages')
  closeLanguageDropdown()
  languages.empty()
  var sortedPrimaryLocales = primaryLocales.filter(lookupLocaleNames).sort(function (a, b) {
    var langA = lookupLocaleNames(a)
    var langB = lookupLocaleNames(b)
    return langA.englishName.localeCompare(langB.englishName)
  })

  languages.append(`<button class="square-button small-action-button tl2">Languages</button>`)
  for (var i = 0; i < sortedPrimaryLocales.length; i++) {
    var l = sortedPrimaryLocales[i]
    var lang = lookupLocaleNames(l)
    var name = lang.nativeName || lang.englishName
    var div = `<button class="square-button small-action-button tl2" data-locale="${l}">${name}</button>`
    languages.append(div)
  }

  $('.js-two-language').html(otherLanguageName())

  $('.js-menu-language').toggleClass('hide', sortedPrimaryLocales.length <= 1)
  $('.js-multi-language').toggleClass('hide', sortedPrimaryLocales.length === 2)
  $('.js-two-language').toggleClass('hide', sortedPrimaryLocales.length > 2)
}

function setFiatCode (data) {
  fiatCode = data
  $('.js-currency').text(fiatCode)
}

function setFixedFee (_fee) {
  const fee = parseFloat(_fee)

  if (fee > 0) {
    const fixedFee = locale.translate('Transaction Fee: %s').fetch(formatFiat(fee, 2))
    $('.js-i18n-fixed-fee').html(fixedFee)
  } else {
    $('.js-i18n-fixed-fee').html('')
  }
}

function setCredit (fiat, crypto, lastBill, cryptoCode) {
  var coin = coins[cryptoCode]

  var scale = new BigNumber(10).pow(coin.displayScale)
  var cryptoAmount = new BigNumber(crypto).div(scale).toNumber()
  var cryptoDisplayCode = coin.displayCode
  updateCrypto('.total-crypto-rec', cryptoAmount, cryptoDisplayCode)
  $('.amount-deposited').html(locale.translate('You deposited %s').fetch(`${fiat} ${fiatCode}`))
  $('.fiat .js-amount').html(fiat)

  var inserted = lastBill
    ? locale.translate('You inserted a %s bill').fetch(formatFiat(lastBill))
    : locale.translate('Lamassu Cryptomat').fetch()

  $('.js-processing-bill').html(inserted)

  $('.js-send-crypto-disable').hide()
  $('.js-send-crypto-enable').show()
}

function setupCassettes (_cassettes) {
  cassettes = _cassettes
  for (var i = 0; i < cassettes.length; i++) {
    var cassette = cassettes[i]
    var denomination = cassette.denomination.toLocaleString(jsLocaleCode, {
      useGrouping: true,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0
    })
    $('.cash-button[data-denomination-index=' + i + '] .js-denomination').text(denomination)
  }
}

function updateCrypto (selector, cryptoAmount, cryptoDisplayCode) {
  $(selector).find('.crypto-amount').html(formatCrypto(cryptoAmount))
  $(selector).find('.crypto-units').html(cryptoDisplayCode)
}

function lookupDecimalChar (localeCode) {
  var num = 1.1
  var localized = num.toLocaleString(jsLocaleCode, {
    useGrouping: true,
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  })

  return localized[1]
}

function splitNumber (localize, localeCode) {
  var decimalChar = lookupDecimalChar(localeCode)
  var split = localize.split(decimalChar)

  if (split.length === 1) {
    return ['<span class="integer">', split[0], '</span>'].join('')
  }

  return [
    '<span class="integer">', split[0], '</span><span class="decimal-char">',
    decimalChar, '</span><span class="decimal">', split[1], '</span>'
  ].join('')
}

function formatNumber (num) {
  var localized = num.toLocaleString(jsLocaleCode, {
    useGrouping: true,
    maximumFractionDigits: 3,
    minimumFractionDigits: 3
  })

  return splitNumber(localized, jsLocaleCode)
}

function formatCrypto (amount) {
  return formatNumber(amount)
}

function formatFiat (amount, fractionDigits) {
  if (!fractionDigits) fractionDigits = 0

  const localized = amount.toLocaleString(jsLocaleCode, {
    useGrouping: true,
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits
  })
  return splitNumber(localized, jsLocaleCode) + ' ' + fiatCode
}

function setExchangeRate (_rates) {
  lastRates = _rates
  var cryptoCode = _rates.cryptoCode
  var rates = _rates.rates

  var coin = coins[cryptoCode]
  var displayCode = coin.displayCode

  var cryptoToFiat = new BigNumber(rates.cashIn)

  var rateStr = formatFiat(cryptoToFiat.round(2).toNumber(), 2)
  $('.crypto-rate-cash-in').html(`1 ${cryptoCode} = ${rateStr}`)

  if (rates.cashOut) {
    var cashOut = new BigNumber(rates.cashOut)
    var cashOutCryptoToFiat = cashOut && formatCrypto(cashOut.round(3).toNumber())

    $('.crypto-rate-cash-out').html(`1 ${cryptoCode} = ${cashOutCryptoToFiat} ${fiatCode}`)
  }

  $('.js-crypto-display-units').text(displayCode)
}

function qrize (text, target, color, lightning) {
  const image = document.getElementById('bolt-img')
  // Hack for surf browser
  const size = document.body.clientHeight * 0.36

  const opts = {
    crisp: true,
    fill: color || 'black',
    text,
    size,
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
}

function setTx (tx) {
  const txId = tx.id
  const isPaperWallet = tx.isPaperWallet
  const hasBills = tx.bills && tx.bills.length > 0

  if (hasBills) {
    $('.js-inserted-notes').show()
    $('.js-no-inserted-notes').hide()
  } else {
    $('.js-inserted-notes').hide()
    $('.js-no-inserted-notes').show()
  }

  $('.js-paper-wallet').toggleClass('hide', !isPaperWallet)

  setTimeout(() => {
    qrize(txId, $('#cash-in-qr-code'), CASH_IN_QR_COLOR)
    qrize(txId, $('#cash-in-fail-qr-code'), CASH_IN_QR_COLOR)
    qrize(txId, $('#qr-code-fiat-receipt'), CASH_OUT_QR_COLOR)
    qrize(txId, $('#qr-code-fiat-complete'), CASH_OUT_QR_COLOR)
  }, 1000)
}

function formatAddressNoBreakLines (address) {
  if (!address) return
  return address.replace(/(.{4})/g, '$1 ')
}

function formatAddress (address) {
  let toBr = formatAddressNoBreakLines(address)
  if (!toBr) return

  return toBr.replace(/((.{4} ){5})/g, '$1<br/> ')
}

function setBuyerAddress (address) {
  $('.crypto-address-no-br').html(formatAddressNoBreakLines(address))
  $('.crypto-address').html(formatAddress(address))
}

function setAccepting (currentAccepting) {
  accepting = currentAccepting
  if (accepting) {
    $('.bill img').transition({x: 0, y: -303}, 1000, 'ease-in')
  } else {
    $('.bill img').transition({x: 0, y: 0}, 1000, 'ease-out')
  }
}

function highBill (highestBill, reason) {
  var reasonText = reason === 'transactionLimit'
    ? locale.translate('Transaction limit reached.').fetch()
    : locale.translate("We're a little low on crypto.").fetch()

  t('high-bill-header', reasonText)
  t('highest-bill', locale.translate('Please insert %s or less.')
    .fetch(formatFiat(highestBill)))
  setScreen('high_bill')
  window.setTimeout(revertScreen, 3000)
}

function minimumTx (lowestBill) {
  t('lowest-bill', locale.translate('Minimum first bill is %s.')
    .fetch(formatFiat(lowestBill)))
  setScreen('minimum_tx')
  window.setTimeout(revertScreen, 3000)
}

function readingBill (bill) {
  $('.js-processing-bill').html(locale.translate('Processing %s ...').fetch(formatFiat(bill)))
  $('.js-send-crypto-enable').hide()
  $('.js-send-crypto-disable').show()
}

function sendOnly (reason) {
  // TODO: sendOnly should be made into its own state on brain.js
  if (currentState === 'send_only') return

  const errorMessages = {
    transactionLimit: locale.translate('Transaction limit reached').fetch(),
    validatorError: locale.translate('Error in validation').fetch(),
    lowBalance: locale.translate("We're out of coins!").fetch(),
    blockedCustomer: locale.translate('Transaction limit reached')
  }

  // If no reason provided defaults to lowBalance
  const reasonText = errorMessages[reason] || errorMessages.lowBalance
  $('#send-only-title').text(reasonText)

  if (reason === 'blockedCustomer') {
    $('.js-send-only-text').text(locale.translate("Due to local regulations, you've reached your transaction limit. Please contact us if you'd like to raise your limit.").fetch())
  } else {
    $('.js-send-only-text').text('')
  }

  setState('send_only')
}

function setPartialSend (sent, total) {
  $('#already-sent').text(formatFiat(sent.fiat))
  $('#pending-sent').text(formatFiat(total.fiat - sent.fiat))
}

function t (id, str) {
  $('#js-i18n-' + id).html(str)
}

function translateCoin (cryptoCode) {
  $('.js-i18n-scan-your-address').html(locale.translate('Scan your <br/> %s address').fetch(cryptoCode))
  $('.js-i18n-please-scan').html(locale.translate('Please scan the QR code <br/> to send us your %s.').fetch(cryptoCode))
  $('.js-i18n-did-send-coins').html(locale.translate('Have you sent the %s yet?').fetch(cryptoCode))
  $('.js-i18n-scan-address').html(locale.translate('Scan your %s address').fetch(cryptoCode))
  $('.js-i18n-invalid-address').html(locale.translate('Invalid %s address').fetch(cryptoCode))

  if (cryptoCode === 'ETH') {
    $('.js-i18n-authorizing-note').html(locale.translate('This should take <strong>15 seconds</strong> on average.<br/>Occasionally, it will take over a minute.').fetch(cryptoCode))
  }
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

function loadI18n (localeCode) {
  var messages = locales[localeCode] || locales['en-US']

  return new Jed({
    'missing_key_callback': function () {},
    'locale_data': {
      'messages': messages
    }
  })
}

function reachFiatLimit (rec) {
  var msg = null
  if (rec.isEmpty) msg = locale.translate(`We're a little low, please cash out`)
  else if (rec.txLimitReached) msg = locale.translate('Transaction limit reached, please cash out')

  var el = $('.choose_fiat_state .limit')
  if (msg) el.html(msg).show()
  else el.hide()
}

function chooseFiat (data) {
  fiatCredit(data)
  setState('choose_fiat')
}

function manageFiatButtons (activeDenominations) {
  for (var i = 0; i < cassettes.length; i++) {
    var cassette = cassettes[i]
    var denomination = cassette.denomination
    var enabled = activeDenominations[denomination]
    var button = $('.choose_fiat_state .cash-button[data-denomination-index=' + i + ']')
    if (enabled) button.prop('disabled', false)
    else button.prop('disabled', true)
  }
}

function displayCrypto (cryptoAtoms, cryptoCode) {
  var coin = coins[cryptoCode]
  var scale = new BigNumber(10).pow(coin.displayScale)
  var cryptoAmount = new BigNumber(cryptoAtoms).div(scale).round(3).toNumber()
  var cryptoDisplay = formatCrypto(cryptoAmount)

  return cryptoDisplay
}

function BN (s) { return new BigNumber(s) }

function fiatCredit (data) {
  var tx = data.tx
  var cryptoCode = tx.cryptoCode
  var activeDenominations = data.activeDenominations
  var coin = coins[cryptoCode]
  const fiat = BN(tx.fiat)

  var fiatDisplay = BN(tx.fiat).toNumber().toLocaleString(jsLocaleCode, {
    useGrouping: true,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  })

  var cryptoAtoms = BN(tx.cryptoAtoms)
  var cryptoDisplay = displayCrypto(cryptoAtoms, cryptoCode)

  var cryptoDisplayCode = coin.displayCode

  if (cryptoAtoms.eq(0)) $('#js-i18n-choose-digital-amount').hide()
  else $('#js-i18n-choose-digital-amount').show()

  if (fiat.eq(0)) $('#cash-out-button').prop('disabled', true)
  else $('#cash-out-button').prop('disabled', false)

  manageFiatButtons(activeDenominations.activeMap)
  $('.choose_fiat_state .fiat-amount').text(fiatDisplay)
  t('choose-digital-amount',
    locale.translate("You'll be sending %s %s").fetch(cryptoDisplay, cryptoDisplayCode))

  reachFiatLimit(activeDenominations)
}

function setDepositAddress (depositInfo) {
  $('.deposit_state .loading').hide()
  $('.deposit_state .send-notice .crypto-address').html(formatAddress(depositInfo.toAddress))
  $('.deposit_state .send-notice').show()

  qrize(depositInfo.depositUrl, $('#qr-code-deposit'), CASH_OUT_QR_COLOR)
}

function setVersion (version) {
  $('.version-number').html(`Version: ${version}`)
}

function deposit (tx) {
  var cryptoCode = tx.cryptoCode
  var display = displayCrypto(tx.cryptoAtoms, cryptoCode)

  $('.js-wallet-address').show()

  $('.deposit_state .digital .js-amount').html(display)
  $('.deposit_state .fiat .js-amount').text(tx.fiat)
  $('.deposit_state .send-notice').hide()
  $('#qr-code-deposit').empty()
  $('.deposit_state .loading').show()
  $('#qr-code-deposit').show()

  setState('deposit')
}

function fiatReceipt (tx) {
  var cryptoCode = tx.cryptoCode
  var display = displayCrypto(tx.cryptoAtoms, cryptoCode)

  $('.fiat_receipt_state .digital .js-amount').html(display)
  $('.fiat_receipt_state .fiat .js-amount').text(tx.fiat)
  $('.fiat_receipt_state .sent-coins .crypto-address').html(formatAddress(tx.toAddress))

  setState('fiat_receipt')
}

function fiatComplete (tx) {
  var cryptoCode = tx.cryptoCode
  var display = displayCrypto(tx.cryptoAtoms, cryptoCode)

  $('.fiat_complete_state .digital .js-amount').html(display)
  $('.fiat_complete_state .fiat .js-amount').text(tx.fiat)
  $('.fiat_complete_state .sent-coins .crypto-address').html(formatAddress(tx.toAddress))

  setState('fiat_complete')
}

function dispenseBatch (data) {
  $('.batch').css('visibility', data.of === 1 ? 'hidden' : 'visible')
  $('.batch').text(`${data.current}/${data.of}`)
}

function initDebug () {
  if (DEBUG_MODE === 'dev') {
    $('body').css('cursor', 'default')
    var style = document.createElement('style')
    style.type = 'text/css'
    style.innerHTML = 'button { cursor: default !important; }'
    document.getElementsByTagName('head')[0].appendChild(style)

    return
  }

  if (DEBUG_MODE === 'demo') {
    setPrimaryLocales(['en-US'])
    setLocale('en-US')
    $('body').css('cursor', 'default')
    var style = document.createElement('style')
    style.type = 'text/css'
    style.innerHTML = 'button { cursor: default !important; }'
    document.getElementsByTagName('head')[0].appendChild(style)

    if (!SCREEN) {
      return chooseCoin([
        {display: 'Bitcoin', cryptoCode: 'BTC'},
        {display: 'Ethereum', cryptoCode: 'ETH'},
        {display: 'ZCash', cryptoCode: 'ZEC'}
      ], true)
    }

    setState(SCREEN)
  }
}

function calculateAspectRatio () {
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

  if (aspectRatioPt1 === 8 && aspectRatioPt2 === 5) {
    aspectRatio = '16:10'
  } else if (aspectRatioPt1 === 16 && aspectRatioPt2 === 9) {
    aspectRatio = '16:9'
  } else {
    aspectRatio = w < 1420 ? '16:10' : '16:9'
  }
}

let background = null

function doTransition (cb) {
  // TODO Disable animations for V1
  let toShow = null
  let toShowOver = null

  if (isTwoWay) {
    toShow = ['#bg-to-show']
    toShowOver = ['.crypto-buttons', '.cash-in-box-wrapper']
  } else {
    toShow = ['#bg-to-show']
    toShowOver = ['header', 'main']
  }

  two.start()
  var tl = new TimelineMax()
  tl.set('.fade-in-delay', { opacity: 0, y: +30 })
    .set('.fade-in', { opacity: 0, y: +30 })
    .set(toShow, { zIndex: 1 })
    .set(toShowOver, { zIndex: 2 })
    .to(background, 0.5, { scale: isTwoWay ? 3 : 2 })
    .to('.fade-in', 0.4, {
      opacity: 1,
      onStart: cb,
      y: 0
    }, '=-0.2')
    .to('.fade-in-delay', 0.4, { opacity: 1, y: 0 }, '=-0.2')
    .set(background, { scale: 1 })
    .set(toShow, { zIndex: -1 })
    .set(toShowOver, { zIndex: 0 })
  two.pause()
}

function setupAnimation (isTwoWay, isAr800) {
  var elem = document.getElementById('bg-to-show')
  while (elem.firstChild) {
    elem.removeChild(elem.firstChild)
  }
  two = new Two({ fullscreen: true, type: Two.Types.svg, autostart: true }).appendTo(elem)

  let elementId = `${isTwoWay ? 'two-way' : 'one-way'}-${isAr800 ? '800' : '1080'}${isRTL ? '-rtl' : ''}`
  background = two.interpret(document.getElementById(elementId))
  background.scale = 1
}
