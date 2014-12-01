'use strict';

var currency = null;
var locale = null;
var localeCode = null;
var jsLocaleCode = null;  // Sometimes slightly different than localeCode
var primaryLocale = null;
var _primaryLocales = [];
var lastRate = null;

var currentState;

var confirmBeep = null;

var accepting = false;

var websocket = null;

var wifiKeyboard = null;

var idKeypad = null;

var previousState = null;
var onSendOnly = false;
var buttonActive = true;
var cartridges = null;

function connect() {
  websocket = new WebSocket('ws://localhost:8080/');
  websocket.onmessage = function (event) {
    var data = $.parseJSON(event.data);
    processData(data);
  };
  setInterval(verifyConnection, 3000);
}

function verifyConnection() {
  if (websocket.readyState === websocket.CLOSED) {
    connect();
  }
}

function buttonPressed(button, data) {
  if (!buttonActive) return;
  wifiKeyboard.deactivate();
  buttonActive = false;
  setTimeout(function () {
    buttonActive = true;
    wifiKeyboard.activate();
  }, 300);
  var res = {button: button};
  if (data || data === null) res.data = data;
  websocket.send(JSON.stringify(res));
}

function processData(data) {
  if (data.localeInfo) setLocaleInfo(data.localeInfo);
  if (!locale) return;
  if (data.currency) setCurrency(data.currency);
  if (data.exchangeRate) setExchangeRate(data.exchangeRate);
  if (data.fiatExchangeRate) setFiatExchangeRate(data.fiatExchangeRate);
  if (data.buyerAddress) setBuyerAddress(data.buyerAddress);
  if (data.credit)
    setCredit(data.credit.fiat, data.credit.bitcoins, data.credit.lastBill);
  if (data.transactionId) setTransactionId(data.transactionId);
  if (data.wifiList) setWifiList(data.wifiList);
  if (data.wifiSsid) setWifiSsid(data.wifiSsid);
  if (data.sendOnly) sendOnly(data.sendOnly);
  if (data.fiatCredit) fiatCredit(data.fiatCredit);
  if (data.depositInfo) setDepositAddress(data.depositInfo);
  if (data.cartridges) setupCartridges(data.cartridges);
  if (data.beep) confirmBeep.play();
  if (data.sent && data.total) setPartialSend(data.sent, data.total);

  switch (data.action) {
    case 'wifiList':
      setState('wifi');
      break;
    case 'wifiPass':
      setState('wifi_password');
      break;
    case 'wifiConnecting':
      t('wifi-connecting',
        locale.translate('This could take a few moments.').fetch());
      setState('wifi_connecting');
      break;
    case 'wifiConnected':
      t('wifi-connecting',
        locale.translate('Connected. Waiting for ticker.').fetch());
      setState('wifi_connecting');  // in case we didn't go through wifi-connecting
      break;
    case 'virgin':
      setState('virgin');
      break;
    case 'unpaired':
      setState('unpaired');
      break;
    case 'pairingScan':
      setState('pairing_scan');
      break;
    case 'pairing':
      confirmBeep.play();
      setState('pairing');
      break;
    case 'pairingError':
      $('.js-pairing-error').text(data.err);
      // Give it some time to update text in background
      setTimeout(function () { setState('pairing_error'); }, 500);
      break;
    case 'booting':
      if (currentState !== 'maintenance') setState('booting');
      break;
    case 'idle':
    case 'fakeIdle':
      setState('idle');
      break;
    case 'dualIdle':
    case 'fakeDualIdle':
      setState('dual_idle');
      break;
    case 'scanId':
      setState('scan_id');
      break;
    case 'idCode':
      idKeypad.activate();
      setState('id_code');
      break;
    case 'verifyingId':
      setState('verifying_id');
      break;
    case 'idVerificationFailed':
      setState('id_verification_failed');
      break;
    case 'idCodeFailed':
      setState('id_code_failed');
      break;
    case 'idVerificationError':
      setState('id_verification_error');
      break;
    case 'scanAddress':
      setState('scan_address');
      break;
    case 'scanned':
      confirmBeep.play();
      setState('insert_bills');
      break;
    case 'acceptingFirstBill':
      setState('insert_bills');
      break;
    case 'acceptingBill':
      setAccepting(true);
      break;
    case 'rejectedBill':
      setAccepting(false);
      break;
    case 'bitcoinTransferPending':
      setState('sending_coins');
      break;
    case 'bitcoinTransferComplete':
      confirmBeep.play();
      setState('completed');
      break;
    case 'goodbye':
      setState('goodbye');
      break;
    case 'maintenance':
      setState('maintenance');
      break;
    case 'withdrawFailure':
      setState('partial_send');
      break;
    case 'networkDown':
      setState('trouble');
      break;
    case 'balanceLow':
    case 'insufficientFunds':
      setState('limit_reached');
      break;
    case 'fixTransaction':
      setState('fix_transaction');
      break;
    case 'highBill':
      highBill(data.highestBill, data.reason);
      break;
    case 'initializing':
      setState('initializing');
      break;
    case 'connecting':
      setState('connecting');
      break;
    case 'chooseFiat':
      chooseFiat(data.chooseFiat);
      break;
    case 'deposit':
      setState('deposit');
      deposit(data.tx);
      break;
    case 'depositTimeout':
      setState('deposit_timeout');
      break;
    case 'pendingDeposit':
      setState('pending_deposit');
      break;
    case 'insufficientDeposit':
      setState('insufficient_deposit');
      break;
    case 'rejectedDeposit':
      setState('deposit_timeout');
      break;
    case 'dispensing':
      setState('dispensing');
      break;
    case 'outOfCash':
      setState('out_of_cash');
      break;
    case 'fiatComplete':
      fiatComplete(data.tx);
      break;
    case 'restart':
      setState('restart');
      break;
  }
}

$(document).ready(function () {

  // Matt's anti-drag hack
  window.onclick =
  window.oncontextmenu =
  window.onmousedown =
  window.onmousemove =
  window.onmouseup =
  function () { return false; };


  wifiKeyboard = new Keyboard('wifi-keyboard').init();

  idKeypad = new Keypad('id-keypad', function(result) {
    if (currentState !== 'id_code') return;
    buttonPressed('idCode', result);
  });

  // buffers automatically when created
  confirmBeep = new Audio('sounds/Confirm8-Bit.ogg');

  connect();
  initTranslatePage();

  var wifiNetworkButtons = document.getElementById('networks');
  touchEvent(wifiNetworkButtons, function(e) {
    var target = $(e.target);
    if (target.attr('id') === 'more-networks') {
      moreNetworks();
    } else {
      var networkButton = target.closest('.wifi-network-button');
      $('#networks > .active').removeClass('active');
      networkButton.addClass('active');
      window.setTimeout(function() { networkButton.removeClass('active'); }, 1000);
      var ssidEl = networkButton.find('.ssid');
      var ssid = ssidEl.data('ssid');
      if (ssid) {
        var displaySsid = ssidEl.text();
        var rawSsid = ssidEl.data('raw-ssid');
        buttonPressed('wifiSelect',
            {ssid: ssid, rawSsid: rawSsid, displaySsid: displaySsid});
      }
    }
  });

  var wifiConnectButton = document.getElementById('wifiConnect');
  touchEvent(wifiConnectButton, function() {
    var wifiConnectButtonJ = $(wifiConnectButton);
    wifiConnectButtonJ.addClass('active');
    window.setTimeout(function() { wifiConnectButtonJ.removeClass('active'); }, 500);
    var pass = $('#wifi-keyboard input.passphrase').data('content');
    var ssid = $('#js-i18n-wifi-for-ssid').data('ssid');
    var rawSsid = $('#js-i18n-wifi-for-ssid').data('raw-ssid');
    buttonPressed('wifiConnect', {pass: pass, ssid: ssid, rawSsid: rawSsid});
  });

  var startButtons = document.getElementById('start-buttons');
  touchEvent(startButtons, function(e) {
    var startButtonJ = $(e.target).closest('.circle-button');
    if (startButtonJ.length === 0) return;
    var newLocale = startButtonJ.data('locale');
    setState('scan_address', null, newLocale);
    buttonPressed('start');
  });

  var sendCoinsButton = document.getElementById('send-coins');
  touchEvent(sendCoinsButton, function() {
    setState('sending_coins');
    buttonPressed('sendBitcoins');
  });

  var insertBillCancelButton = document.getElementById('insertBillCancel');
  touchImmediateEvent(insertBillCancelButton, function() {
    setBuyerAddress(null);
    buttonPressed('cancelInsertBill');
  });

  setupImmediateButton('wifiPassCancel', 'cancelWifiPass');
  setupImmediateButton('wifiListCancel', 'cancelWifiList');
  setupImmediateButton('scanCancel', 'cancelScan');
  setupImmediateButton('completed_viewport', 'completed');
  setupImmediateButton('fiat_completed_viewport', 'completed');
  setupImmediateButton('chooseFiatCancel', 'chooseFiatCancel');
  setupImmediateButton('depositCancel', 'depositCancel');

  setupButton('initialize', 'initialize');
  setupButton('test-mode', 'testMode');
  setupButton('pairing-scan', 'pairingScan');
  setupButton('pairing-scan-cancel', 'pairingScanCancel');
  setupButton('pairing-error-ok', 'pairingScanCancel');
  setupButton('want_bitcoin', 'start');
  setupButton('want_cash', 'startFiat');
  setupButton('cash-out-button', 'cashOut');
  setupButton('send-coins', 'sendBitcoins');
  setupImmediateButton('scan-id-cancel', 'cancelIdScan');
  setupImmediateButton('id-code-cancel', 'cancelIdCode', function() {
    idKeypad.deactivate();
  });
  setupButton('id-verification-failed-ok', 'idVerificationFailedOk');
  setupButton('id-code-failed-retry', 'idCodeFailedRetry');
  setupButton('id-code-failed-cancel', 'idCodeFailedCancel');
  setupButton('id-verification-error-ok', 'idVerificationErrorOk');

  setupButton('limit-reached-ok', 'idle');
  setupButton('insufficient-deposit-ok', 'idle');
  setupButton('deposit-timeout-ok', 'idle');
  setupButton('rejected-deposit-ok', 'idle');
  setupButton('out-of-cash-ok', 'idle');

  var fiatButtons = document.getElementById('js-fiat-buttons');
  var lastTouch = null;
  touchImmediateEvent(fiatButtons, function(e) {
    var now = Date.now();
    if (lastTouch && now - lastTouch < 100) return;
    lastTouch = now;
    var cashButtonJ = $(e.target).closest('.cash-button');
    if (cashButtonJ.length === 0) return;
    if (cashButtonJ.hasClass('disabled')) return;
    if (cashButtonJ.hasClass('clear')) return buttonPressed('clearFiat');
    var denominationIndex = cashButtonJ.attr('data-denomination-index');
    var denominationRec = cartridges[denominationIndex];
    buttonPressed('fiatButton', {denomination: denominationRec.denomination});
  });

  initDebug();
});

function targetButton(element) {
  var classList = element.classList;
  if (classList.contains('button') ||
      classList.contains('circle-button') ||
      classList.contains('wifi-network-button'))
    return element;
  return targetButton(element.parentNode);
}

function touchEvent(element, callback) {
  element.addEventListener('mousedown', function(e) {
    var target = targetButton(e.target);
    target.classList.add('active');

    // Wait for transition to finish
    setTimeout(function () {
      target.classList.remove('active');
    }, 300);

    setTimeout(function () {
      callback(e);
    }, 200);

    e.stopPropagation();
    e.preventDefault();
  });
}

function touchImmediateEvent(element, callback) {
  element.addEventListener('mousedown', function(e) {
    callback(e);
    e.stopPropagation();
    e.preventDefault();
  });
}

function setupImmediateButton(buttonClass, buttonAction, callback) {
  var button = document.getElementById(buttonClass);
  touchImmediateEvent(button, function() {
    if (callback) callback();
    buttonPressed(buttonAction);
  });
}

function setupButton(buttonClass, buttonAction) {
  var button = document.getElementById(buttonClass);
  touchEvent(button, function() {
    buttonPressed(buttonAction);
  });
}

function setScreen(newScreen, oldScreen, newLocale) {
  if (newScreen === oldScreen) return;
  var publicScreens = ['idle','trouble','limit_reached'];
  if (!newLocale && publicScreens.indexOf(newScreen) !== -1)
    newLocale = primaryLocale;

  if (newScreen === 'insert_bills') {
    $('.bill img').css({'-webkit-transform': 'none', top: 0, left: 0});
  }

  var newView = $('.' + newScreen + '_state');

  $('.viewport').css({'display': 'none'});
  setLocale(newLocale);
  newView.css({'display': 'block'});
}

function setState(state, delay, newLocale) {
  if (state === currentState) return;

  onSendOnly = false;

  previousState = currentState;
  currentState = state;

  wifiKeyboard.reset();

  if (state === 'idle') {
    $('#qr-code').empty();
    $('#qr-code-deposit').empty();
  }

  if (delay) window.setTimeout(function() {
    setScreen(currentState, previousState, newLocale);
  }, delay);
  else setScreen(currentState, previousState, newLocale);

  if (state === 'insert_more_bills') {
    $('#limit-reached-section').css({'display': 'none'});
    $('#insert-another').css({'display': 'block'});
    t('or', locale.translate('OR').fetch());
    $('.or-circle circle').attr('r', $('#js-i18n-or').width() / 2 + 15);
  }

}

function revertScreen() { setScreen(currentState); }

function setWifiList(recs, requestedPage) {
  var networks = $('#networks');
  if (!recs) recs = networks.data('recs');
  var page = requestedPage || networks.data('page') || 0;
  var offset = page * 4;
  if (offset > recs.length - 1) {
    offset = 0;
    page = 0;
  }
  $('#more-networks').css({'display': 'none'});
  networks.empty();
  networks.data('page', page);
  networks.data('recs', recs);
  var remainingCount = recs.length - offset;
  var len = Math.min(remainingCount, 4);
  for (var i = 0; i < len; i++) {
    var rec = recs[i + offset];
    var bars = 'bar' + (Math.floor(rec.strength * 4) + 1);
    var html = '<div class="wifi-network-button">' +
        '<span class="ssid" data-raw-ssid="' + rec.rawSsid + '" data-ssid="' +
        rec.ssid + '">' + rec.displaySsid +
        '</span>' + '<span class="icon ' + bars + '"></span></div>';
    networks.append(html);
  }
  var moreTxt = locale.translate('MORE').fetch();
  var button = '<span display="inline-block" id="more-networks" class="button">' + moreTxt + '</span>';
  if (recs.length > 4) {
    networks.append(button);
  }
}

function moreNetworks() {
  var networks = $('#networks');
  var page = networks.data('page');
  setWifiList(null, page + 1);
}

function setWifiSsid(data) {
  $('#js-i18n-wifi-for-ssid').data('ssid', data.ssid);
  $('#js-i18n-wifi-for-ssid').data('raw-ssid', data.rawSsid);
  t('wifi-for-ssid', locale.translate('for %s')
      .fetch('<strong>' + data.ssid + '</strong>'));
  t('wifi-connect', locale.translate("You're connecting to the WiFi network %s")
      .fetch('<strong>' + data.ssid + '</strong>'));
}

function setPrimaryLocale(l) {
  primaryLocale = l;
}

function setLocaleInfo(data) {
  setPrimaryLocale(data.primaryLocale);
  setPrimaryLocales(data.primaryLocales);
  setLocale(data.primaryLocale);
}

function setLocale(data) {
  if (!data || data === localeCode) return;
  localeCode = data;
  jsLocaleCode = data;
  if (jsLocaleCode === 'fr-QC') jsLocaleCode = 'fr-CA';

  var isArabic = jsLocaleCode.startsWith('ar-');
  var isHebrew = jsLocaleCode.startsWith('he-');
  var isRTL = isArabic || isHebrew;

  if (isRTL)
    $('body').addClass('i18n-rtl');
  else
    $('body').removeClass('i18n-rtl');

  if (isArabic)
    $('body').addClass('i18n-ar');
  else
    $('body').removeClass('i18n-ar');

  if (isHebrew)
    $('body').addClass('i18n-he');
  else
    $('body').removeClass('i18n-he');

  locale = loadI18n(localeCode);
  try { translatePage(); } catch (ex) {}
  if (lastRate) setExchangeRate(lastRate);
}

function areArraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;
  for (var i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
}

function setPrimaryLocales(primaryLocales) {
  if (areArraysEqual(primaryLocales, _primaryLocales)) return;
  _primaryLocales = primaryLocales;
  var langCircles = $('.start-buttons');
  if (primaryLocales.length === 1) {
    var currentLocale = primaryLocales[0];
    var jed = new Jed({'locale_data': {'messages': locales[currentLocale]}});
    var tStart = jed.translate('START').fetch();
    langCircles.html('<div class="circle-button"><span class="js-i18n-' +
      currentLocale + ' solo">' + tStart + '</span></div>');
    langCircles.removeClass('start-multi');
    return;
  }
  if (primaryLocales.length > 1) {
    langCircles.empty();
    $.each(primaryLocales, function(i, l) {
      var jed = new Jed({'locale_data': {'messages': locales[l]}});
      var name = jed.translate('LanguageName').fetch();
      var html = '<div class="circle-button" data-locale="' + l +
          '"><span class="js-i18n-' + l + '">' + name + '</span></div>';
      langCircles.append(html);
      langCircles.addClass('start-multi');
    });
  }
}

function setCurrency(data) {
  currency = data;
  $('.js-currency').text(currency);
}

function setCredit(fiat, bitcoins, lastBill) {
  // TODO: this should go in brain.js
  if (currentState === 'insert_bills') setState('insert_more_bills');

  t('just-inserted',
    locale.translate("You inserted a %s bill").fetch(formatFiat(lastBill)));
  $('.total-deposit').html(formatFiat(fiat));
  updateBitcoins('.total-btc-rec', bitcoins);
}

function setupCartridges(_cartridges) {
  cartridges = _cartridges;
  for (var i = 0; i < cartridges.length; i++) {
    var cartridge = cartridges[i];
    var denomination = cartridge.denomination;
    $('.cash-button[data-denomination-index=' + i + '] .js-denomination').text(denomination);
  }
}

function updateBitcoins(selector, bitcoins) {
  var units = 'mBTC';
  var adjustedValue = bitcoins * 1000;
  $(selector).find('.btc-amount').html(formatBitcoins(adjustedValue));
  $(selector).find('.bitcoin-units').html(units);
}

function formatBitcoins(amount) {
  var log = Math.floor(Math.log(amount) / Math.log(10));
  var digits = (log > 0) ? 2 : 2 - log;
  return amount.toLocaleString(jsLocaleCode, {
    useGrouping: true,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function formatFiat(amount, fractionDigits) {
  if (!fractionDigits) fractionDigits = 0;
  switch (currency + ':' + jsLocaleCode) {
    case 'DKK:en-US':
    case 'SEK:en-US':
      return '<strong>' + amount.toLocaleString(jsLocaleCode, {
        useGrouping: true,
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: fractionDigits
      }) + '</strong> ' + currency;
    default:
      return '<strong>' + amount.toLocaleString(jsLocaleCode, {
        style: 'currency',
        currency: currency,
        currencyDisplay: 'symbol',
        useGrouping: true,
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: fractionDigits
      }) + '</strong>';
  }
}

function singleCurrencyUnit() {
  return formatFiat(1);
}

function setExchangeRate(rate) {
  lastRate = rate;
  var rateStr = formatFiat(rate.xbtToFiat, 2);
  var translated = locale.translate('Our current Bitcoin price is %s').fetch(rateStr);
  $('.js-i18n-current-bitcoin-price').html(translated);
  updateBitcoins('.reverse-exchange-rate', rate.fiatToXbt);
  var insertedText = locale.translate("per %s inserted")
    .fetch(singleCurrencyUnit());
  $('#fiat-inserted').html(insertedText);
  $('.js-digital-rate').text(parseFloat(rate.xbtToFiat).toFixed(2));  // TODO clean up
}

function setFiatExchangeRate(rate) {
  $('.js-fiat-rate').text(parseFloat(rate).toFixed(2));  // TODO clean up
}

function setTransactionId(txId) {
  $('#qr-code').empty();
  $('#qr-code').qrcode({
    render: 'canvas',
    width: 225,
    height: 225,
    text: txId
  });
}

function setBuyerAddress(address) {
  $('.bitcoin-address').html(address);
}

function setAccepting(currentAccepting) {
  accepting = currentAccepting;
  if (accepting) {
    $('.bill img').transition({x:0, y: -303}, 1000, 'ease-in');
  } else {
    $('.bill img').transition({x:0, y: 0}, 1000, 'ease-out');
  }
}

function highBill(highestBill, reason) {
  var reasonText = reason === 'transactionLimit' ? "Transaction limit reached." : "We're a little low.";
  t('high-bill-header', locale.translate(reasonText).fetch());
  t('highest-bill', locale.translate("Please insert %s or less.")
    .fetch(formatFiat(highestBill)));
  setScreen('high_bill');
  window.setTimeout(revertScreen, 3000);
}

function sendOnly(reason) {
  // TODO: sendOnly should be made into its own state.
  // Remove all instances of onSendOnly when doing this.
  if (onSendOnly) return;
  onSendOnly = true;

  t('or', '!');
  $('.or-circle circle').attr('r', $('#js-i18n-or').width() / 2 + 15);
  var reasonText = reason === 'transactionLimit' ?
    'Transaction limit reached.' :
    'We\'re out of bitcoins.';
  t('limit-reached', locale.translate(reasonText).fetch());
  t('limit-description',
    locale.translate('Please touch <strong>Send Bitcoins</strong> to complete your purchase.').fetch());
  $('#insert-another').css({'display': 'none'});
  $('#limit-reached-section').css({'display': 'block'});
}

function setPartialSend(sent, total) {
  $('#already-sent').text(formatFiat(sent.fiat));
  $('#pending-sent').text(formatFiat(total.fiat - sent.fiat));
}

function t(id, str) {
  $('#js-i18n-' + id).html(str);
}

function initTranslatePage() {
  $('.js-i18n').each(function() {
    var el = $(this);
    el.data('baseTranslation', el.html());
  });
  $('input[placeholder]').each(function() {
    var el = $(this);
    el.data('baseTranslation', el.attr('placeholder'));
  });
}

function translatePage() {
  $('.js-i18n').each(function() {
    var el = $(this);
    var base = el.data('baseTranslation');
    el.html(locale.translate(base).fetch());
  });
  $('input[placeholder]').each(function() {
    var el = $(this);
    var base = el.data('baseTranslation');
    el.attr('placeholder', locale.translate(base).fetch());
  });

  // Adjust send coins button
  var length = $('#send-coins span').text().length;
  if (length > 17) $('body').addClass('i18n-long-send-coins');
  else $('body').removeClass('i18n-long-send-coins');
}

function loadI18n(localeCode) {
  var messages = locales[localeCode] || locales['en-US'];

  return new Jed({
    'missing_key_callback': function() {},
    'locale_data': {
      'messages': messages
    }
  });
}

function initDebug() {}

// Polyfill
if (!String.prototype.startsWith) {
  Object.defineProperty(String.prototype, 'startsWith', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: function (searchString, position) {
      position = position || 0;
      return this.lastIndexOf(searchString, position) === position;
    }
  });
}


function reachFiatLimit(rec) {
  var msg = null;
  if (rec.txLimitReached) msg = 'We\'re a little low, please cash out';
  else if (rec.isEmpty) msg = 'Transaction limit reached, please cash out';

  var el = $('.choose_fiat_state .limit');
  if (msg) el.html(msg).show();
  else el.hide();
}

function chooseFiat(data) {
  fiatCredit(data);
  setState('choose_fiat');
}

function manageFiatButtons(activeDenominations) {
  for (var i = 0; i < cartridges.length; i++) {
    var cartridge = cartridges[i];
    var denomination = cartridge.denomination;
    var enabled = activeDenominations[denomination];
    var button = $('.choose_fiat_state .cash-button[data-denomination-index=' + i + ']');
    if (enabled) button.removeClass('disabled');
    else button.addClass('disabled');
  }
}

function fiatCredit(data) {
  var credit = data.credit;
  var activeDenominations = data.activeDenominations;
  var fiat = credit.fiat;
  var mbtc = credit.satoshis / 1e5;
  if (mbtc === 0) $('#js-i18n-choose-digital-amount').hide();
  else $('#js-i18n-choose-digital-amount').show();

  if (fiat === 0) $('#cash-out-button').hide();
  else $('#cash-out-button').show();

  manageFiatButtons(activeDenominations.activeMap);
  $('.choose_fiat_state .fiat-amount').text(fiat);
  t('choose-digital-amount',
    locale.translate('You\'ll be sending %s mBTC').fetch(mbtc));

  reachFiatLimit({
    isEmpty: activeDenominations.isEmpty,
    txLimitReached: data.txLimitReached
  });
}

function satoshisToBitcoins(satoshis) {
  var bitcoins = satoshis / 1e8;
  return Number(bitcoins.toFixed(8)).toString();
}

function satoshisToMilliBitcoins(satoshis) {
  var millies = satoshis / 1e5;
  return Number(millies.toFixed(5)).toString();
}

function setDepositAddress(tx) {
  var bitcoins = satoshisToBitcoins(tx.satoshis);

  $('.deposit_state .loading').hide();
  $('.deposit_state .send-notice .bitcoin-address').text(tx.toAddress);
  $('.deposit_state .send-notice').show();

  $('#qr-code-deposit').empty();
  $('#qr-code-deposit').qrcode({
    render: 'canvas',
    width: 275,
    height: 275,
    text: 'bitcoin:' + tx.toAddress + '?amount=' + bitcoins
  });
}

function deposit(tx) {
  var millies = satoshisToMilliBitcoins(tx.satoshis);
  $('.deposit_state .digital .js-amount').text(millies);
  $('.deposit_state .fiat .js-amount').text(tx.fiat);
  $('.deposit_state .send-notice').hide();
  $('#qr-code-deposit').empty();
  $('.deposit_state .loading').show();

  setState('deposit');
}

function fiatComplete(tx) {
  var millies = satoshisToMilliBitcoins(tx.satoshis);
  $('.fiat_complete_state .digital .js-amount').text(millies);
  $('.fiat_complete_state .fiat .js-amount').text(tx.fiat);
  $('.fiat_complete_state .sent-coins .bitcoin-address').text(tx.toAddress);

  $('#qr-code-fiat-receipt').empty();
  $('#qr-code-fiat-receipt').qrcode({
    render: 'canvas',
    width: 275,
    height: 275,
    text: JSON.stringify(tx)
  });

  setState('fiat_complete');
}

function initDebug() {}
