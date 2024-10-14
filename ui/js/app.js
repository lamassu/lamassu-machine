/* globals $, URLSearchParams, WebSocket, locales, Keyboard, Keypad, Jed, BigNumber, HOST, PORT, Origami, kjua, TimelineMax, Two */
'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var queryString = window.location.search;
var params = new URLSearchParams(queryString.substring(1));
var DEBUG_MODE = params.get('debug');
var CASH_OUT_QR_COLOR = '#403c51';
var CASH_IN_QR_COLOR = '#0e4160';
var NUMBER_OF_BUTTONS = 3;

var scrollSize = 0;
var textHeightQuantity = 0;
var currentPage = 0;
var totalPages = 0;
var aspectRatio = '16:10';
var isTwoWay = null;
var isRTL = false;
var cryptomatModel = null;
var termsConditionsTimeout = null;
var termsConditionsAcceptanceInterval = null;
var T_C_TIMEOUT = 30000;
var complianceTimeout = null;
var cashDirection = null;

var fiatCode = null;
var locale = null;
var defaultLocale = loadI18n('en-US') || null;
var localeCode = null;
var jsLocaleCode = null; // Sometimes slightly different than localeCode
var _primaryLocales = [];
var lastRates = null;
var coins;

var currentState;

var websocket = null;
var promoKeyboard = null;
var usSsnKeypad = null;
var phoneKeypad = null;
var securityKeypad = null;
var previousState = null;
var buttonActive = true;
var currentCryptoCode = null;
var currentCoin = null;
var currentCoins = [];
var emailKeyboard = null;
var customRequirementNumericalKeypad = null;
var customRequirementTextKeyboard = null;
var customRequirementChoiceList = null;

var MUSEO = ['ca', 'cs', 'da', 'de', 'en', 'es', 'et', 'fi', 'fr', 'hr', 'hu', 'it', 'lt', 'nb', 'nl', 'pl', 'pt', 'ro', 'sl', 'sv', 'tr'];

function connect() {
  console.log('ws://' + HOST + ':' + PORT + '/');
  websocket = new WebSocket('ws://' + HOST + ':' + PORT + '/');
  websocket.onmessage = function (event) {
    var data = $.parseJSON(event.data);
    processData(data);
  };
  websocket.onerror = function (err) {
    return console.log(err);
  };
}

function verifyConnection() {
  if (websocket.readyState === websocket.CLOSED) {
    connect();
  }
}

function buttonPressed(button, data) {
  if (!buttonActive) return;
  promoKeyboard.deactivate();
  emailKeyboard.deactivate();
  customRequirementTextKeyboard.deactivate();
  buttonActive = false;
  setTimeout(function () {
    buttonActive = true;
    promoKeyboard.activate();
    emailKeyboard.activate();
    customRequirementTextKeyboard.activate();
  }, 300);
  var res = { button: button };
  if (data || data === null) res.data = data;
  if (websocket) websocket.send(JSON.stringify(res));
}

var displayLN = 'Lightning Network';
var displayBTC = 'Bitcoin<br>(LN)';
var LN = 'LN';
var BTC = 'BTC';

function processData(data) {
  if (data.localeInfo) setLocaleInfo(data.localeInfo);
  if (data.locale) setLocale(data.locale);
  if (data.supportedCoins) setCoins(data.supportedCoins);
  if (!locale) return;
  if (data.fiatCode) setFiatCode(data.fiatCode);
  if (data.rates) setExchangeRate(data.rates);
  if (data.buyerAddress) setBuyerAddress(data.buyerAddress);
  if (data.credit) {
    var lastBill = data.action === 'rejectedBill' ? null : data.credit.lastBill;
    setCredit(data.credit, lastBill);
  }
  if (data.tx) setTx(data.tx);
  if (data.sendOnly) sendOnly(data.reason);
  if (data.fiatCredit) fiatCredit(data.fiatCredit);
  if (data.depositInfo) setDepositAddress(data.depositInfo);
  if (data.version) setVersion(data.version);
  if (data.cassettes) buildCassetteButtons(data.cassettes, NUMBER_OF_BUTTONS);
  if (data.readingBills) readingBills(data.readingBills);
  if (data.cryptoCode) translateCoin(data.cryptoCode);
  if (data.tx && data.tx.cashInFee) setFixedFee(data.tx.cashInFee);
  if (data.terms) setTermsScreen(data.terms);
  if (data.dispenseBatch) dispenseBatch(data.dispenseBatch);
  if (data.direction) setDirection(data.direction);
  if (data.operatorInfo) setOperatorInfo(data.operatorInfo);
  if (data.hardLimit) setHardLimit(data.hardLimit);
  if (data.cryptomatModel) setCryptomatModel(data.cryptomatModel);
  if (data.areThereAvailablePromoCodes !== undefined) setAvailablePromoCodes(data.areThereAvailablePromoCodes);

  if (data.tx && data.tx.discount) setCurrentDiscount(data.tx.discount);
  if (data.receiptStatus) setReceiptPrint(data.receiptStatus, null);
  if (data.smsReceiptStatus) setReceiptPrint(null, data.smsReceiptStatus);

  if (data.context) {
    $('.js-context').hide();
    $('.js-context-' + data.context).show();
  }

  var isRecycler = function isRecycler(billValidator) {
    return billValidator === 'HCM2';
  };

  switch (data.action) {
    case 'pairing':
      setState('pairing');
      break;
    case 'pairingError':
      $('.js-pairing-error').text(data.err);
      // Give it some time to update text in background
      setTimeout(function () {
        setState('pairing_error');
      }, 500);
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
    case 'registerUsSsn':
      usSsnKeypad.activate();
      setState('register_us_ssn');
      setComplianceTimeout(null, 'finishBeforeSms');
      break;
    case 'registerPhone':
      phoneKeypad.activate();
      setState('register_phone');
      break;
    case 'registerEmail':
      emailKeyboard.setConstraint('email', ['#submit-email']);
      setState('register_email');
      break;
    case 'securityCode':
      securityKeypad.activate();
      setState('security_code');
      break;
    case 'scanned':
      isRecycler(data.billValidator) ? setState('insert_first_bills_recycler') : setState('insert_bills');
      break;
    case 'acceptingFirstBill':
      $('.js-send-crypto-enable').show();
      setState('insert_bills');
      break;
    case 'acceptingBills':
      $('.blocked-customer-top').hide();
      setState('insert_more_bills');
      break;
    case 'acceptingFirstRecyclerBills':
      $('.js-continue-crypto-enable').show();
      $('.js-send-crypto-enable').show();
      setState('insert_first_bills_recycler');
      break;
    case 'recyclerContinue':
      disableRecyclerBillButtons();
      break;
    case 'acceptingRecyclerBills':
      enableRecyclerBillButtons();
      $('.blocked-customer-top').hide();
      setState('insert_bills_recycler');
      break;
    case 'acceptingBill':
    case 'rejectedBill':
      // still need to prevent screen change
      break;
    case 'cryptoTransferPending':
      setState('sending_coins');
      break;
    case 'cryptoTransferComplete':
      setState('completed');
      break;
    case 'networkDown':
      setState('trouble');
      break;
    case 'balanceLow':
      setState('limit_reached');
      break;
    case 'insufficientFunds':
      setState('out_of_coins');
      break;
    case 'highBill':
      highBill(data.highestBill, data.reason);
      break;
    case 'minimumTx':
      minimumTx(data.lowestBill);
      break;
    case 'chooseFiat':
      if (data.isCashInOnlyCoin) {
        setState('cash_in_only_coin');
        break;
      }
      chooseFiat(data.chooseFiat);
      break;
    case 'deposit':
      setState('deposit');
      deposit(data.tx);
      break;
    case 'rejectedDeposit':
      setState('deposit_timeout');
      break;
    case 'fiatReceipt':
      fiatReceipt(data.tx);
      break;
    case 'fiatComplete':
      fiatComplete(data.tx);
      break;
    case 'restart':
      setState('restart');
      break;
    case 'chooseCoin':
      chooseCoin(data.coins, data.twoWayMode);
      break;
    case 'smsVerification':
      smsVerification();
      break;
    case 'emailVerification':
      emailVerification();
      break;
    case 'permission_id':
      idVerification();
      break;
    case 'permission_face_photo':
      facephotoPermission();
      break;
    case 'usSsnPermission':
      usSsnPermission();
      break;
    case 'externalPermission':
      externalPermission();
      break;
    case 'blockedCustomer':
      blockedCustomer();
      break;
    case 'insertPromoCode':
      promoKeyboard.activate();
      setState('insert_promo_code');
      break;
    case 'invalidPromoCode':
      setState('promo_code_not_found');
      break;
    case 'customInfoRequestPermission':
      customInfoRequestPermission(data.customInfoRequest);
      break;
    case 'inputCustomInfoRequest':
      customInfoRequest(data.customInfoRequest);
      break;
    case 'actionRequiredMaintenance':
      setState('action_required_maintenance');
      break;
    case 'cashSlotRemoveBills':
      setState('cash_slot_remove_bills');
      break;
    case 'leftoverBillsInCashSlot':
      setState('leftover_bills_in_cash_slot');
      break;
    case 'invalidAddress':
      invalidAddress(data.lnInvoiceTypeError);
      break;
    case 'externalCompliance':
      clearTimeout(complianceTimeout);
      externalCompliance(data.externalComplianceUrl);
      break;
    default:
      if (data.action) setState(window.snakecase(data.action));
  }
}

function translate(data, fetchArgs) {
  if (data === "") return data;

  try {
    var _locale$translate;

    return fetchArgs ? (_locale$translate = locale.translate(data)).fetch.apply(_locale$translate, _toConsumableArray(fetchArgs)) : locale.translate(data).fetch();
  } catch (error) {
    if (!defaultLocale) console.error('Error while translating: ', error);else {
      try {
        var _defaultLocale$transl;

        return fetchArgs ? (_defaultLocale$transl = defaultLocale.translate(data)).fetch.apply(_defaultLocale$transl, _toConsumableArray(fetchArgs)) : defaultLocale.translate(data).fetch();
      } catch (e) {
        console.error('Error while translating: ', e);
        return data;
      }
    }
  }
}

function facephotoPermission() {
  setComplianceTimeout(null, 'finishBeforeSms');
  setScreen('permission_face_photo');
}

function usSsnPermission() {
  setComplianceTimeout(null, 'finishBeforeSms');
  setScreen('us_ssn_permission');
}

function externalPermission() {
  setComplianceTimeout(null, 'finishBeforeSms');
  setScreen('external_permission');
}

function customInfoRequestPermission(customInfoRequest) {
  $('#custom-screen1-title').text(customInfoRequest.screen1.title);
  $('#custom-screen1-text').text(customInfoRequest.screen1.text);
  setComplianceTimeout(null, 'finishBeforeSms');
  setScreen('custom_permission');
}

function setComplianceTimeout(interval, complianceButton) {
  clearTimeout(complianceTimeout);

  if (interval === 0) {
    return;
  }

  complianceTimeout = setTimeout(function () {
    buttonPressed(complianceButton);
  }, interval == null ? 60000 : interval);
}

function invalidAddress(lnInvoiceTypeError) {
  if (lnInvoiceTypeError) {
    $('#invalid-address').hide();
    $('#invalid-invoice').show();
  } else {
    $('#invalid-invoice').hide();
    $('#invalid-address').show();
  }
  setState('invalid_address');
}

function customInfoRequest(customInfoRequest) {
  switch (customInfoRequest.input.type) {
    case 'numerical':
      $('#custom-screen2-numerical-title').text(customInfoRequest.screen2.title);
      $('#custom-screen2-numerical-text').text(customInfoRequest.screen2.text);
      customRequirementNumericalKeypad.setOpts({
        type: 'custom',
        constraint: customInfoRequest.input.constraintType,
        maxLength: customInfoRequest.input.numDigits
      });
      customRequirementNumericalKeypad.activate();
      setState('custom_permission_screen2_numerical');
      setScreen('custom_permission_screen2_numerical');
      setComplianceTimeout(null, 'cancelCustomInfoRequest');
      break;
    case 'text':
      $('#custom-requirement-text-label1').text(customInfoRequest.input.label1);
      $('#custom-requirement-text-label2').text(customInfoRequest.input.label2);
      $('#previous-text-requirement').hide();
      $('#submit-text-requirement').hide();
      $('#next-text-requirement').hide();
      $('#optional-text-field-2').hide();
      $('.key.backspace.standard-backspace-key').removeClass('backspace-margin-left-override');
      $('.custom-info-request-space-key').show();
      // set type of constraint and buttons where that constraint should apply to disable/ enable
      customRequirementTextKeyboard.setConstraint(customInfoRequest.input.constraintType, ['#submit-text-requirement']);
      if (customInfoRequest.input.constraintType === 'spaceSeparation') {
        $('#optional-text-field-2').show();
        $('.key.backspace.standard-backspace-key').addClass('backspace-margin-left-override');
        $('.custom-info-request-space-key').hide();
        customRequirementTextKeyboard.setConstraint(customInfoRequest.input.constraintType, ['#next-text-requirement']);
      }
      setState('custom_permission_screen2_text');
      setScreen('custom_permission_screen2_text');
      setComplianceTimeout(null, 'cancelCustomInfoRequest');
      break;
    case 'choiceList':
      $('#custom-screen2-choiceList-title').text(customInfoRequest.screen2.title);
      $('#custom-screen2-choiceList-text').text(customInfoRequest.screen2.text);
      customRequirementChoiceList.replaceChoices(customInfoRequest.input.choiceList, customInfoRequest.input.constraintType);
      setState('custom_permission_screen2_choiceList');
      setScreen('custom_permission_screen2_choiceList');
      setComplianceTimeout(null, 'cancelCustomInfoRequest');
      break;
    default:
      return blockedCustomer();
  }
}

function idVerification() {
  setComplianceTimeout(null, 'finishBeforeSms');
  setScreen('permission_id');
}

function smsVerification() {
  setComplianceTimeout(null, 'finishBeforeSms');
  setScreen('sms_verification');
}

function emailVerification() {
  setComplianceTimeout(null, 'finishBeforeSms');
  setScreen('email_verification');
}

function blockedCustomer() {
  return setScreen('blocked_customer');
}

function chooseCoin(coins, twoWayMode) {
  if (twoWayMode) {
    $('.choose_coin_state').removeClass('choose-coin-cash-in').addClass('choose-coin-two-way');
  } else {
    $('.choose_coin_state').removeClass('choose-coin-two-way').addClass('choose-coin-cash-in');
  }

  isTwoWay = twoWayMode;
  setChooseCoinColors();

  var defaultCoin = coins[0];

  currentCryptoCode = defaultCoin.cryptoCode;
  currentCoin = defaultCoin;
  currentCoins = coins.slice(0);

  setCryptoBuy(defaultCoin);
  setCryptoSell(defaultCoin);

  setupCoinsButtons(coins, currentCryptoCode);

  setState('choose_coin');
}

function openLanguageDropdown() {
  $('#language-dropdown-toggle').addClass('hide');
  $('#languages').removeClass('hide');
  $('#language-overlay').removeClass('hide');
}

function closeLanguageDropdown() {
  $('#language-dropdown-toggle').removeClass('hide');
  $('#languages').addClass('hide');
  $('#language-overlay').addClass('hide');
}

function openCoinDropdown() {
  $('#crypto-dropdown-toggle').addClass('hide');
  $('#crypto-overlay').removeClass('hide');
  $('#cryptos').removeClass('hide');
}

function closeCoinDropdown() {
  $('#crypto-dropdown-toggle').removeClass('hide');
  $('#crypto-overlay').addClass('hide');
  $('#cryptos').addClass('hide');
}

function setupCoinsButtons() {
  $('.crypto-buttons').empty();
  closeCoinDropdown();

  var coins = currentCoins.slice();
  var dropdownCoins = [];

  if (coins.length === 1) return;

  var showMoreButton = coins.length > 4;
  if (showMoreButton) {
    $('crypto-dropdown-toggle').removeClass('hide');
    dropdownCoins = coins.slice(3);
    coins = coins.slice(0, 3);
  } else {
    $('crypto-dropdown-toggle').addClass('hide');
  }

  coins.forEach(function (coin) {
    var activeClass = coin.cryptoCode === currentCryptoCode ? 'choose-coin-button-active' : '';
    var el = '<div class="choose-coin-button h4 coin-' + coin.cryptoCode.toLowerCase() + ' ' + activeClass + '" data-crypto-code="' + coin.cryptoCode + '">\n      ' + coin.display + '\n      <span class="choose-coin-svg-wrapper">\n        <svg xmlns="http://www.w3.org/2000/svg" width="52" height="8" viewBox="0 0 52 8">\n          <path fill="none" fill-rule="evenodd" stroke="#FFF" stroke-linecap="round" stroke-width="8" d="M4 4h44"/>\n        </svg>\n      </span>\n    </div>';
    $('.crypto-buttons').append(el);
  });
  if (showMoreButton) {
    $('.crypto-buttons').append('\n      <div class="choose-coin-button h4" data-more="true">\n        <div id="crypto-dropdown-toggle" data-more="true">\n          <span class="js-i18n">' + translate('More') + '</span>\n          <span class="choose-coin-svg-wrapper">\n            <svg xmlns="http://www.w3.org/2000/svg" width="52" height="8" viewBox="0 0 52 8">\n              <path fill="none" fill-rule="evenodd" stroke="#FFF" stroke-linecap="round" stroke-width="8" d="M4 4h44"/>\n            </svg>\n          </span>\n        </div>\n        <div id="cryptos" class="dropdown hide"></div>\n      </div>\n    ');
    dropdownCoins.forEach(function (coin) {
      var el = '<button class="h4 sapphire button small-action-button coin-' + coin.cryptoCode.toLowerCase() + '"\n        data-crypto-code="' + coin.cryptoCode + '">' + coin.display + '</button>';
      $('#cryptos').append(el);
    });
    var el = '<button class="h4 sapphire button small-action-button js-i18n" data-less="true">' + translate('Less') + '</button>';
    $('#cryptos').append(el);
    // As we add buttons 'more' and 'less' after initTranslate
    // they don't have baseTranslation translation data attached to them.
    $('.crypto-buttons .js-i18n').each(function () {
      var el = $(this);
      el.data('baseTranslation', el.html().trim());
    });
  }
}

function setCryptoBuy(coin) {
  var cashIn = $('.cash-in');
  var translatedCoin = translate(coin.display === displayLN ? displayBTC : coin.display);
  var buyStr = translate('Buy<br/>%s', [translatedCoin]);

  cashIn.html(buyStr);
}

function setCryptoSell(coin) {
  var cashOut = $('.cash-out');
  var translatedCoin = translate(coin.display === displayLN ? displayBTC : coin.display);
  var sellStr = translate('Sell<br/>%s', [translatedCoin]);

  cashOut.html(sellStr);
}

function setCoins(supportedCoins) {
  coins = supportedCoins;
}

function getCryptoCurrency(cryptoCode) {
  var cryptoCurrency = coins.find(function (c) {
    return c.cryptoCode === cryptoCode;
  });
  if (!cryptoCurrency) throw new Error('Unsupported crypto: ' + cryptoCode);
  return cryptoCurrency;
}

function switchCoin(coin) {
  var cashIn = $('.cash-in');
  var cashOut = $('.cash-out');
  var cryptoCode = coin.cryptoCode;

  if (currentCryptoCode === cryptoCode) return;

  $('.coin-' + currentCryptoCode.toLowerCase()).removeClass('choose-coin-button-active');
  $('.coin-' + cryptoCode.toLowerCase()).addClass('choose-coin-button-active');
  currentCryptoCode = cryptoCode;
  currentCoin = coin;

  cashIn.addClass('crypto-switch');
  setTimeout(function () {
    return setCryptoBuy(coin);
  }, 100);
  setTimeout(function () {
    return cashIn.removeClass('crypto-switch');
  }, 1000);

  setTimeout(function () {
    cashOut.addClass('crypto-switch');
    setTimeout(function () {
      return setCryptoSell(coin);
    }, 100);
    setTimeout(function () {
      return cashOut.removeClass('crypto-switch');
    }, 1000);
  }, 80);

  var selectedIndex = currentCoins.indexOf(currentCoins.find(function (it) {
    return it.cryptoCode === cryptoCode;
  }));
  if (currentCoins.length > 4 && selectedIndex > 2) {
    currentCoins.splice(2, 0, currentCoins.splice(selectedIndex, 1)[0]);
  }

  setupCoinsButtons();
}

$(document).ready(function () {
  var attachFastClick = Origami.fastclick;
  attachFastClick(document.body);

  window.addEventListener('resize', function () {
    calculateAspectRatio();
    setChooseCoinColors();
  });

  // Matt's anti-drag hack
  window.onclick = window.oncontextmenu = window.onmousedown = window.onmousemove = window.onmouseup = function () {
    return false;
  };

  BigNumber.config({ ROUNDING_MODE: BigNumber.ROUND_HALF_EVEN });

  promoKeyboard = new Keyboard({
    id: 'promo-keyboard',
    inputBox: '.promo-code-input'
  }).init(function () {
    if (currentState !== 'insert_promo_code') return;
    buttonPressed('cancelPromoCode');
  });

  usSsnKeypad = new Keypad('us-ssn-keypad', { type: 'usSsn' }, function (result) {
    if (currentState !== 'register_us_ssn') return;
    buttonPressed('usSsn', result);
  });

  phoneKeypad = new Keypad('phone-keypad', { type: 'phoneNumber', country: 'US' }, function (result) {
    if (currentState !== 'register_phone') return;
    buttonPressed('phoneNumber', result);
  });

  securityKeypad = new Keypad('security-keypad', { type: 'code' }, function (result) {
    if (currentState !== 'security_code') return;
    buttonPressed('securityCode', result);
  });

  customRequirementNumericalKeypad = new Keypad('custom-requirement-numeric-keypad', {
    type: 'custom'
  }, function (result) {
    if (currentState !== 'custom_permission_screen2_numerical') return;
    buttonPressed('customInfoRequestSubmit', result);
  });

  emailKeyboard = new Keyboard({
    id: 'email-keyboard',
    inputBox: '#email-input',
    submitButtonWrapper: '#submit-email-wrapper',
    setComplianceTimeout: setComplianceTimeout
  }).init(function (result) {
    if (currentState !== 'register_email') return;
    buttonPressed('email', result);
  });

  customRequirementTextKeyboard = new Keyboard({
    id: 'custom-requirement-text-keyboard',
    inputBox: '.text-input-field-1',
    submitButtonWrapper: '.submit-text-requirement-button-wrapper',
    setComplianceTimeout: setComplianceTimeout
  }).init(function () {
    if (currentState !== 'custom_permission_screen2_text') return;
    buttonPressed('customInfoRequestSubmit');
  });

  customRequirementChoiceList = new ChoiceList({
    id: 'custom-requirement-choicelist-wrapper',
    setComplianceTimeout: setComplianceTimeout
  }).init(function (result) {
    if (currentState !== 'custom_permission_screen2_choiceList') return;
    buttonPressed('customInfoRequestSubmit', result);
  });

  if (DEBUG_MODE !== 'demo') {
    connect();
    setInterval(verifyConnection, 1000);
  }

  initTranslatePage();

  var sendCoinsButton = document.getElementById('send-coins');
  var sendCoinsButton2 = document.getElementById('send-only-send-coins');
  touchEvent(sendCoinsButton, function () {
    setState('sending_coins');
    buttonPressed('sendCoins');
  });

  touchEvent(sendCoinsButton2, function () {
    setState('sending_coins');
    buttonPressed('sendCoins');
  });

  setupButton('recycler-continue-start', 'recyclerContinue');
  setupButton('recycler-continue', 'recyclerContinue');
  setupButton('recycler-finish', 'sendCoins');
  setupButton('cash-slot-bills-removed', 'cashSlotBillsRemoved');
  setupButton('leftover-bills-removed', 'leftoverBillsRemoved');

  var blockedCustomerOk = document.getElementById('blocked-customer-ok');
  touchEvent(blockedCustomerOk, function () {
    buttonPressed('blockedCustomerOk');
  });
  var insertBillCancelButton = document.getElementById('insertBillCancel');
  touchImmediateEvent(insertBillCancelButton, function () {
    setBuyerAddress(null);
    buttonPressed('cancelInsertBill');
  });

  var insertBillCancelRecyclerButton = document.getElementById('insertBillCancelRecycler');
  touchImmediateEvent(insertBillCancelRecyclerButton, function () {
    setBuyerAddress(null);
    buttonPressed('cancelInsertBill');
  });

  setupImmediateButton('scanCancel', 'cancelScan');
  setupImmediateButton('completed_viewport', 'completed');
  setupImmediateButton('withdraw_failure_viewport', 'completed');
  setupImmediateButton('out_of_coins_viewport', 'completed');
  setupImmediateButton('fiat_receipt_viewport', 'completed');
  setupImmediateButton('fiat_complete_viewport', 'completed');
  setupImmediateButton('chooseFiatCancel', 'chooseFiatCancel');
  setupImmediateButton('depositCancel', 'depositCancel');
  setupImmediateButton('printer-scan-cancel', 'cancelScan');

  setupButton('printer-back-to-home', 'idle');
  setupButton('printer-print-again', 'printAgain');
  setupButton('printer-print-again2', 'printAgain');
  setupButton('printer-scan-again', 'printerScanAgain');

  setupButton('insert-first-bill-promo-button', 'insertPromoCode');
  setupButton('insert-first-recycler-bills-promo-button', 'insertPromoCode');
  setupButton('choose-fiat-promo-button', 'insertPromoCode');

  var promoCodeCancelButton = document.getElementById('promo-code-cancel');
  touchImmediateEvent(promoCodeCancelButton, function () {
    promoKeyboard.deactivate.bind(promoKeyboard);
    buttonPressed('cancelPromoCode');
  });

  var submitCodeButton = document.getElementById('submit-promo-code');
  touchEvent(submitCodeButton, function () {
    promoKeyboard.deactivate.bind(promoKeyboard);
    var code = $('.promo-code-input').data('content');
    buttonPressed('submitPromoCode', { input: code });
  });

  var submitEmailButton = document.getElementById('submit-email');
  var submitTextRequirementButton = document.getElementById('submit-text-requirement');
  var nextFieldTextRequirementButton = document.getElementById('next-text-requirement');
  var previousFieldTextRequirementButton = document.getElementById('previous-text-requirement');
  touchEvent(submitEmailButton, function () {
    emailKeyboard.deactivate.bind(emailKeyboard);
    var text = $('#email-input').data('content');
    buttonPressed('email', text);
    $('#email-input').data('content', '').val('');
    emailKeyboard.setInputBox('#email-input');
  });
  touchEvent(submitTextRequirementButton, function () {
    customRequirementTextKeyboard.deactivate.bind(customRequirementTextKeyboard);
    var text = $('.text-input-field-1').data('content') + ' ' + ($('.text-input-field-2').data('content') || '');
    buttonPressed('customInfoRequestSubmit', text);
    $('.text-input-field-1').removeClass('faded').data('content', '').val('');
    $('.text-input-field-2').addClass('faded').data('content', '').val('');
    customRequirementTextKeyboard.setInputBox('.text-input-field-1');
  });
  touchEvent(nextFieldTextRequirementButton, function () {
    $('.text-input-field-1').addClass('faded');
    $('.text-input-field-2').removeClass('faded');
    $('#next-text-requirement').hide();
    $('#previous-text-requirement').show();
    $('#submit-text-requirement').show();
    // changing input box changes buttons where validation works on
    customRequirementTextKeyboard.setInputBox('.text-input-field-2', ['#submit-text-requirement']);
  });
  touchEvent(previousFieldTextRequirementButton, function () {
    $('.text-input-field-1').removeClass('faded');
    $('.text-input-field-2').addClass('faded');
    $('#next-text-requirement').show();
    $('#previous-text-requirement').hide();
    $('#submit-text-requirement').hide();
    customRequirementTextKeyboard.setInputBox('.text-input-field-1', ['#next-text-requirement']);
  });

  setupButton('submit-promo-code', 'submitPromoCode', {
    input: $('.promo-code-input').data('content')
  });
  setupButton('promo-code-try-again', 'insertPromoCode');
  setupButton('promo-code-continue', 'cancelPromoCode');

  setupButton('initialize', 'initialize');
  setupButton('pairing-scan', 'pairingScan');
  setupImmediateButton('pairing-scan-cancel', 'pairingScanCancel');
  setupButton('pairing-error-ok', 'pairingErrorOk');
  setupButton('cash-out-button', 'cashOut');

  setupImmediateButton('scan-id-cancel', 'idDataActionCancel');
  setupImmediateButton('scan-photo-cancel', 'idPhotoActionCancel');
  setupImmediateButton('scan-photo-manual-cancel', 'idPhotoActionCancel');
  setupImmediateButton('us-ssn-cancel', 'cancelUsSsn', usSsnKeypad.deactivate.bind(usSsnKeypad));
  setupImmediateButton('phone-number-cancel', 'cancelPhoneNumber', phoneKeypad.deactivate.bind(phoneKeypad));
  setupImmediateButton('security-code-cancel', 'cancelSecurityCode', securityKeypad.deactivate.bind(securityKeypad));
  setupButton('id-verification-failed-ok', 'idVerificationFailedOk');
  setupButton('id-scan-failed-try-again', 'idCodeFailedRetry');
  setupButton('id-scan-failed-cancel', 'idVerificationFailedOk');
  setupButton('id-code-failed-retry', 'idCodeFailedRetry');
  setupButton('id-code-failed-cancel', 'bye');
  setupButton('id-verification-error-ok', 'idVerificationErrorOk');
  setupButton('photo-scan-failed-retry', 'retryPhotoScan');
  setupButton('photo-scan-failed-cancel', 'photoScanVerificationCancel');
  setupButton('photo-verification-failed-ok', 'cancelIdScan');
  setupButton('invalid-address-try-again', 'invalidAddressTryAgain');
  setupButton('address-reuse-start-over', 'idle');
  setupButton('suspicious-address-start-over', 'idle');

  setupButton('sanctions-failure-ok', 'idle');
  setupButton('limit-reached-ok', 'idle');
  setupButton('hard-limit-reached-ok', 'idle');
  setupButton('deposit-timeout-sent-yes', 'depositTimeout');
  setupButton('deposit-timeout-sent-no', 'depositTimeoutNotSent');
  setupButton('out-of-cash-ok', 'idle');
  setupButton('cash-in-disabled-ok', 'idle');
  setupButton('cash-in-only-ok', 'idle');

  setupButton('bad-phone-number-ok', 'badPhoneNumberOk');
  setupButton('bad-security-code-ok', 'badSecurityCodeOk');
  setupButton('max-phone-retries-ok', 'maxPhoneRetriesOk');
  //setupButton('max-email-retries-ok', 'maxEmailRetriesOk')
  setupButton('redeem-later-ok', 'idle');
  setupButton('fiat-error-ok', 'idle');
  setupButton('network-down-ok', 'idle');
  setupButton('fiat-transaction-error-ok', 'fiatReceipt');

  setupButton('unknown-phone-number-ok', 'idle');
  setupButton('unknown-email-ok', 'idle');
  setupButton('unconfirmed-deposit-ok', 'idle');
  setupButton('tx-not-seen-ok', 'idle');
  setupButton('wrong-dispenser-currency-ok', 'idle');

  setupButton('print-receipt-cash-in-button', 'printReceipt');
  setupButton('print-receipt-cash-out-button', 'printReceipt');
  setupButton('print-receipt-cash-in-fail-button', 'printReceipt');

  setupButton('send-sms-receipt-cash-in-button', 'sendSmsReceipt');
  setupButton('send-sms-receipt-cash-out-button', 'sendSmsReceipt');
  setupButton('send-sms-receipt-cash-in-fail-button', 'sendSmsReceipt');

  setupButton('terms-ok', 'termsAccepted');
  setupButton('terms-ko', 'idle');

  setupButton('maintenance_restart', 'maintenanceRestart');

  calculateAspectRatio();

  var cryptoButtons = document.getElementById('crypto-buttons');
  touchEvent(cryptoButtons, function (event) {
    var el = $(event.target);
    if (el.is('path') || el.is('svg') || el.is('span')) {
      el = el.closest('div');
    }

    if (el.data('more')) {
      openCoinDropdown();
      return;
    }

    if (el.data('less')) {
      closeCoinDropdown();
      return;
    }

    var cryptoCode = el.data('cryptoCode');
    if (!cryptoCode) return;

    var wantedCoin = currentCoins.find(function (it) {
      return it.cryptoCode === cryptoCode;
    });
    if (!wantedCoin) return;

    var coin = { cryptoCode: cryptoCode, display: wantedCoin.display === displayLN ? displayBTC : wantedCoin.display };
    switchCoin(coin);
  });

  var areYouSureCancel = document.getElementById('are-you-sure-cancel-transaction');
  touchEvent(areYouSureCancel, function () {
    return buttonPressed('cancelTransaction', previousState);
  });

  var areYouSureContinue = document.getElementById('are-you-sure-continue-transaction');
  touchEvent(areYouSureContinue, function () {
    return buttonPressed('continueTransaction', previousState);
  });

  var coinRedeem = document.getElementById('coin-redeem-button');
  touchEvent(coinRedeem, function () {
    setDirection('cashOut');
    buttonPressed('redeem');
  });

  setupButton('facephoto-scan-failed-retry', 'retryFacephoto');
  setupButton('id-start-verification', 'permissionIdCompliance');
  setupButton('sms-start-verification', 'permissionSmsCompliance');
  setupButton('email-start-verification', 'permissionEmailCompliance');
  setupButton('ready-to-scan-id-card-photo', 'scanIdCardPhoto');
  setupButton('facephoto-permission-yes', 'permissionPhotoCompliance');
  setupButton('us-ssn-permission-yes', 'permissionUsSsnCompliance');
  setupButton('external-permission-yes', 'permissionExternalCompliance');

  setupButton('send-coins-id', 'finishBeforeSms');
  setupButton('send-coins-id-2', 'finishBeforeSms');
  setupButton('send-coins-sms', 'finishBeforeSms');
  setupButton('send-coins-sms-2', 'finishBeforeSms');
  setupButton('send-coins-email', 'finishBeforeSms');
  setupButton('send-coins-email-2', 'finishBeforeSms');

  setupButton('facephoto-permission-no', 'finishBeforeSms');
  setupButton('us-ssn-permission-send-coins', 'finishBeforeSms');
  setupButton('us-ssn-permission-cancel', 'finishBeforeSms');
  setupButton('us-ssn-cancel', 'finishBeforeSms');
  setupButton('external-permission-send-coins', 'finishBeforeSms');
  setupButton('facephoto-scan-failed-cancel', 'finishBeforeSms');
  setupButton('facephoto-scan-failed-cancel2', 'finishBeforeSms');

  setupButton('custom-permission-yes', 'permissionCustomInfoRequest');
  setupButton('custom-permission-no', 'finishBeforeSms');
  setupImmediateButton('custom-permission-cancel-numerical', 'cancelCustomInfoRequest', function () {
    customRequirementNumericalKeypad.deactivate.bind(customRequirementNumericalKeypad);
  });
  setupImmediateButton('email-cancel', 'cancelEmail', function () {
    emailKeyboard.deactivate.bind(emailKeyboard);
    $('#email-input').data('content', '').val('');
    emailKeyboard.setInputBox('#email-input');
  });
  setupImmediateButton('custom-permission-cancel-text', 'cancelCustomInfoRequest', function () {
    customRequirementTextKeyboard.deactivate.bind(customRequirementTextKeyboard);
    $('.text-input-field-1').removeClass('faded').data('content', '').val('');
    $('.text-input-field-2').addClass('faded').data('content', '').val('');
    customRequirementTextKeyboard.setInputBox('.text-input-field-1');
  });
  setupImmediateButton('custom-permission-cancel-choiceList', 'cancelCustomInfoRequest', function () {});

  setupButton('custom-permission-yes', 'permissionCustomInfoRequest');
  setupButton('custom-permission-no', 'finishBeforeSms');
  setupImmediateButton('custom-permission-cancel-numerical', 'cancelCustomInfoRequest', function () {
    customRequirementNumericalKeypad.deactivate.bind(customRequirementNumericalKeypad);
  });

  setupButton('external-validation-ok', 'finishBeforeSms');

  touchEvent(document.getElementById('change-language-section'), function () {
    if (_primaryLocales.length === 2) {
      setLocale(otherLocale());
      setCryptoBuy(currentCoin);
      setCryptoSell(currentCoin);
      return;
    }
    openLanguageDropdown();
  });

  var cashInBox = document.getElementById('cash-in-box');
  touchEvent(cashInBox, function () {
    buttonPressed('start', { cryptoCode: currentCryptoCode, direction: 'cashIn' });
  });

  var cashOutBox = document.getElementById('cash-out-box');
  touchEvent(cashOutBox, function () {
    buttonPressed('start', { cryptoCode: currentCryptoCode, direction: 'cashOut' });
  });

  var languageOverlay = document.getElementById('language-overlay');
  touchEvent(languageOverlay, function (e) {
    closeLanguageDropdown();
  });

  var cryptoOverlay = document.getElementById('crypto-overlay');
  touchEvent(cryptoOverlay, function (e) {
    closeCoinDropdown();
  });

  var languageButtons = document.getElementById('languages');
  touchEvent(languageButtons, function (e) {
    var languageButtonJ = $(e.target).closest('button');
    if (languageButtonJ.length === 0) return;
    var newLocale = languageButtonJ.attr('data-locale');

    if (!newLocale) {
      closeLanguageDropdown();
      return;
    }

    setLocale(newLocale);
    setCryptoBuy(currentCoin);
    setCryptoSell(currentCoin);
    closeLanguageDropdown();
  });

  buildCassetteButtonEvents();
  if (DEBUG_MODE === 'dev') initDebug();
});

function targetButton(element) {
  var classList = element.classList || [];
  var special = classList.contains('button') || classList.contains('circle-button') || classList.contains('square-button');
  if (special) {
    return element;
  }
  return targetButton(element.parentNode);
}

function touchEvent(element, callback) {
  function handler(e) {
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
  }

  if (shouldEnableTouch()) {
    element.addEventListener('touchstart', handler);
  }
  element.addEventListener('mousedown', handler);
}

function touchImmediateEvent(element, callback) {
  function handler(e) {
    callback(e);
    e.stopPropagation();
    e.preventDefault();
  }
  if (shouldEnableTouch()) {
    element.addEventListener('touchstart', handler);
  }
  element.addEventListener('mousedown', handler);
}

function setupImmediateButton(buttonClass, buttonAction, callback) {
  var button = document.getElementById(buttonClass);
  touchImmediateEvent(button, function () {
    if (callback) callback();
    buttonPressed(buttonAction);
  });
}

function setupButton(buttonClass, buttonAction, actionData) {
  var button = document.getElementById(buttonClass);
  touchEvent(button, function () {
    buttonPressed(buttonAction, actionData);
  });
}

function setScreen(newScreen, oldScreen) {
  if (newScreen === oldScreen) return;

  if (newScreen === 'insert_bills') {
    $('.js-processing-bill').html(translate('Lamassu Cryptomat'));
    $('.bill img').css({ '-webkit-transform': 'none', top: 0, left: 0 });
  }

  var newView = $('.' + newScreen + '_state');
  if (newView.length !== 1) console.log('FATAL: ' + newView.length + ' screens found of class ' + newScreen + '_state');

  $('.viewport').removeClass('viewport-active');
  newView.addClass('viewport-active');
}

function setState(state, delay) {
  if (state === currentState) return;

  if (currentState === 'terms_screen') {
    clearTermsConditionsTimeout();
    clearTermsConditionsAcceptanceDelay();
  }

  setComplianceTimeout(0);

  previousState = currentState;
  currentState = state;

  promoKeyboard.reset();
  emailKeyboard.reset();
  customRequirementTextKeyboard.reset();

  if (state === 'idle') {
    $('.qr-code').empty();
    $('.qr-code-deposit').empty();
  }

  if (delay) {
    window.setTimeout(function () {
      setScreen(currentState, previousState);
    }, delay);
  } else setScreen(currentState, previousState);
}

function revertScreen() {
  setScreen(currentState);
}

function setUpDirectionElement(element, direction) {
  if (direction === 'cashOut') {
    element.removeClass('cash-in-color');
    element.addClass('cash-out-color');
  } else {
    element.addClass('cash-in-color');
    element.removeClass('cash-out-color');
  }
}

function setOperatorInfo(operator) {
  if (!operator || !operator.active) {
    $('.contacts, .contacts-compact').addClass('hide');
  } else {
    $('.contacts, .contacts-compact').removeClass('hide');
    $('.operator-name').text(operator.name);
    $('.operator-email').text(operator.email);
    $('.operator-phone').text(operator.phone);
  }
}

function setHardLimit(limits) {
  var component = $('#hard-limit-hours');
  if (limits.hardLimitWeeks >= 1) {
    return component.text(translate('Please come back in %s weeks', [limits.hardLimitWeeks]));
  }

  if (limits.hardLimitDays >= 1) {
    return component.text(translate('Please come back in %s days and %s hours', [limits.hardLimitDays, limits.hardLimitHours]));
  }

  component.text(translate('Please come back in %s hours', [limits.hardLimitHours]));
}

function setCryptomatModel(model) {
  cryptomatModel = model;
  var versions = ['sintra', 'douro', 'gaia', 'tejo', 'grandola', 'aveiro', 'coincloud', 'gmuk1', 'batm7in'];
  var body = $('body');

  versions.forEach(function (it) {
    return body.removeClass(it);
  });
  $('body').addClass(model.startsWith('douro') ? 'douro' : model);
}

function enableRecyclerBillButtons() {
  var continueButton = document.getElementById('recycler-continue');
  var finishButton = document.getElementById('recycler-finish');
  continueButton.disabled = false;
  finishButton.disabled = false;
}

function disableRecyclerBillButtons() {
  var continueButton = document.getElementById('recycler-continue');
  var finishButton = document.getElementById('recycler-finish');
  continueButton.disabled = true;
  finishButton.disabled = true;
}

function setDirection(direction) {
  var states = [$('.scan_id_photo_state'), $('.scan_manual_id_photo_state'), $('.scan_id_data_state'), $('.security_code_state'), $('.register_us_ssn_state'), $('.us_ssn_permission_state'), $('.register_phone_state'), $('.register_email_state'), $('.terms_screen_state'), $('.verifying_id_photo_state'), $('.verifying_face_photo_state'), $('.verifying_id_data_state'), $('.permission_id_state'), $('.sms_verification_state'), $('.email_verification_state'), $('.bad_phone_number_state'), $('.bad_security_code_state'), $('.max_phone_retries_state'), $('.max_email_retries_state'), $('.failed_permission_id_state'), $('.failed_verifying_id_photo_state'), $('.blocked_customer_state'), $('.fiat_error_state'), $('.fiat_transaction_error_state'), $('.failed_scan_id_data_state'), $('.sanctions_failure_state'), $('.error_permission_id_state'), $('.scan_face_photo_state'), $('.retry_scan_face_photo_state'), $('.permission_face_photo_state'), $('.failed_scan_face_photo_state'), $('.hard_limit_reached_state'), $('.failed_scan_id_photo_state'), $('.retry_permission_id_state'), $('.waiting_state'), $('.insert_promo_code_state'), $('.promo_code_not_found_state'), $('.custom_permission_state'), $('.external_permission_state'), $('.custom_permission_screen2_numerical_state'), $('.custom_permission_screen2_text_state'), $('.custom_permission_screen2_choiceList_state'), $('.external_compliance_state')];
  cashDirection = direction;
  states.forEach(function (it) {
    setUpDirectionElement(it, direction);
  });
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
function setTermsScreen(data) {
  var $screen = $('.terms_screen_state');
  $screen.find('.js-terms-title').html(data.title);
  startPage(data.text, data.acceptDisabled);
  $screen.find('.js-terms-cancel-button').html(data.cancel);
  $screen.find('.js-terms-accept-button').html(data.accept);
  setTermsConditionsTimeout();
  setAcceptButtonDisabled($screen, data);
  setTermsConditionsAcceptanceDelay($screen, data);
}

function setAcceptButtonDisabled(screen, data) {
  var acceptButton = screen.find('.js-terms-accept-button');
  acceptButton.prop('disabled', Boolean(data.acceptDisabled));
}

function clearTermsConditionsTimeout() {
  clearTimeout(termsConditionsTimeout);
}

function setTermsConditionsTimeout() {
  termsConditionsTimeout = setTimeout(function () {
    if (currentState === 'terms_screen') {
      buttonPressed('idle');
    }
  }, T_C_TIMEOUT);
}

function setTermsConditionsAcceptanceDelay(screen, data) {
  var acceptButton = screen.find('.js-terms-accept-button');
  acceptButton.css({ 'min-width': 0 });

  if (!data.delay) return;

  var delayTimer = isNaN(data.delayTimer) ? 0 : data.delayTimer;
  var seconds = delayTimer / 1000;
  acceptButton.prop('disabled', true);
  acceptButton.html(seconds > 0 ? data.accept + ' (' + seconds + ')' : '' + data.accept);

  var tmpbtn = acceptButton.clone().appendTo('body').css({ 'display': 'block', 'visibility': 'hidden' });
  var width = tmpbtn.outerWidth();
  tmpbtn.remove();
  acceptButton.css({ 'min-width': width + 'px' });
  termsConditionsAcceptanceInterval = setInterval(function () {
    seconds--;
    if (currentState === 'terms_screen' && seconds > 0) {
      acceptButton.html(data.accept + ' (' + seconds + ')');
    }
    if (currentState === 'terms_screen' && seconds <= 0) {
      acceptButton.prop('disabled', false);
      acceptButton.html('' + data.accept);
    }
    if (seconds <= 0) {
      clearInterval(termsConditionsAcceptanceInterval);
    }
  }, 1000);
}

function clearTermsConditionsAcceptanceDelay() {
  clearInterval(termsConditionsAcceptanceInterval);
}

function resetTermsConditionsTimeout() {
  clearTermsConditionsTimeout();
  setTermsConditionsTimeout();
}

// click page up button
function scrollUp() {
  resetTermsConditionsTimeout();
  var div = document.getElementById('js-terms-text-div');
  if (currentPage !== 0) {
    currentPage -= 1;
    updateButtonStyles();
    updatePageCounter();
    div.scrollTo(0, currentPage * scrollSize);
  }
}

// start page
function startPage(text, acceptedTerms) {
  var $screen = $('.terms_screen_state');
  $screen.find('.js-terms-text').html(text);
  if (!acceptedTerms) currentPage = 0;
  totalPages = 0;
  setTimeout(function () {
    var div = document.getElementById('js-terms-text-div');
    textHeightQuantity = document.getElementById('js-terms-text').offsetHeight;
    scrollSize = div.offsetHeight - 40;
    updateButtonStyles();
    if (text.length <= 1000 && textHeightQuantity <= div.offsetHeight) {
      document.getElementById('actions-scroll').style.display = 'none';
    } else {
      document.getElementById('actions-scroll').style.display = '';
      if (!acceptedTerms) div.scrollTo(0, 0);
      totalPages = Math.ceil(textHeightQuantity / scrollSize);
      updatePageCounter();
    }
  }, 100);
}

function updatePageCounter() {
  document.getElementById('terms-page-counter').textContent = currentPage + 1 + '/' + totalPages;
}

// click page up button
function scrollDown() {
  resetTermsConditionsTimeout();
  var div = document.getElementById('js-terms-text-div');
  if (!(currentPage * scrollSize + scrollSize > textHeightQuantity && currentPage !== 0)) {
    currentPage += 1;
    updateButtonStyles();
    updatePageCounter();
    div.scrollTo(0, currentPage * scrollSize);
  }
}

function updateButtonStyles() {
  textHeightQuantity = document.getElementById('js-terms-text').offsetHeight;
  var buttonDown = document.getElementById('scroll-down');
  var buttonUp = document.getElementById('scroll-up');
  buttonUp.disabled = currentPage === 0;
  buttonDown.disabled = currentPage * scrollSize + scrollSize > textHeightQuantity && currentPage !== 0;
}

function setLocaleInfo(data) {
  phoneKeypad.setCountry(data.country);
  setPrimaryLocales(data.primaryLocales);
  setLocale(data.primaryLocale);
}

function otherLanguageName() {
  var lang = lookupLocaleNames(otherLocale());
  return lang && lang.nativeName;
}

function otherLocale() {
  return _primaryLocales.find(function (c) {
    return c !== localeCode;
  });
}

function setLocale(data) {
  if (!data || data === localeCode) return;
  localeCode = data;
  jsLocaleCode = data;
  var lang = localeCode.split('-')[0];

  if (jsLocaleCode === 'fr-QC') jsLocaleCode = 'fr-CA';

  var isArabic = jsLocaleCode.indexOf('ar-') === 0;
  var isHebrew = jsLocaleCode.indexOf('he-') === 0;
  isRTL = isArabic || isHebrew;

  setChooseCoinColors();

  if (isRTL) {
    $('body').addClass('i18n-rtl');
  } else {
    $('body').removeClass('i18n-rtl');
  }

  if (isArabic) {
    $('body').addClass('i18n-ar');
  } else {
    $('body').removeClass('i18n-ar');
  }

  if (isHebrew) {
    $('body').addClass('i18n-he');
  } else {
    $('body').removeClass('i18n-he');
  }

  if (MUSEO.indexOf(lang) !== -1) $('body').addClass('museo');else $('body').removeClass('museo');

  locale = loadI18n(localeCode);
  try {
    translatePage();
  } catch (ex) {}

  $('.js-two-language').html(otherLanguageName());

  if (lastRates) setExchangeRate(lastRates);
}

function setChooseCoinColors() {
  var elem = $('#bg-to-show > img');
  var img = 'images/background/' + (isTwoWay ? '2way' : '1way') + '-' + aspectRatio + (isRTL ? '-rtl' : '') + '.svg';
  if (img !== elem.attr('src')) {
    elem.attr('src', img);
  }

  if (isTwoWay) {
    $('.choose_coin_state .change-language').removeClass('cash-in-color').addClass('cash-out-color');
  } else {
    $('.choose_coin_state .change-language').removeClass('cash-out-color').addClass('cash-in-color');
  }
}

function areArraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;
  for (var i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
}

function lookupLocaleNames(locale) {
  if (!locale) return;
  var langMap = window.languageMappingList;
  var language = locale.split('-')[0];
  var localeNames = langMap[language];
  return localeNames || langMap[locale];
}

function setPrimaryLocales(primaryLocales) {
  if (areArraysEqual(primaryLocales, _primaryLocales)) return;
  _primaryLocales = primaryLocales;

  var languages = $('#languages');
  closeLanguageDropdown();
  languages.empty();
  var sortedPrimaryLocales = primaryLocales.filter(lookupLocaleNames).sort(function (a, b) {
    var langA = lookupLocaleNames(a);
    var langB = lookupLocaleNames(b);
    return langA.englishName.localeCompare(langB.englishName);
  });

  languages.append('<button class="square-button small-action-button tl2">Languages</button>');
  for (var i = 0; i < sortedPrimaryLocales.length; i++) {
    var l = sortedPrimaryLocales[i];
    var lang = lookupLocaleNames(l);
    var name = lang.nativeName || lang.englishName;
    var div = '<button class="square-button small-action-button tl2" data-locale="' + l + '">' + name + '</button>';
    languages.append(div);
  }

  $('.js-two-language').html(otherLanguageName());

  $('.js-menu-language').toggleClass('hide', sortedPrimaryLocales.length <= 1);
  $('.js-multi-language').toggleClass('hide', sortedPrimaryLocales.length === 2);
  $('.js-two-language').toggleClass('hide', sortedPrimaryLocales.length > 2);
}

function setFiatCode(data) {
  fiatCode = data;
  $('.js-currency').text(fiatCode);
}

function setFixedFee(_fee) {
  var fee = parseFloat(_fee);
  if (fee > 0) {
    var fixedFee = translate('Transaction Fee: %s', [formatFiat(fee, 2)]);
    $('.js-i18n-fixed-fee').html(fixedFee);
  } else {
    $('.js-i18n-fixed-fee').html('');
  }
}

function setCredit(credit, lastBill) {
  var fiat = credit.fiat,
      cryptoAtoms = credit.cryptoAtoms,
      cryptoCode = credit.cryptoCode;

  var coin = getCryptoCurrency(cryptoCode);

  var scale = new BigNumber(10).pow(coin.displayScale);
  var cryptoAmount = new BigNumber(cryptoAtoms).div(scale).toNumber();
  var cryptoDisplayCode = coin.displayCode;
  updateCrypto('.total-crypto-rec', cryptoAmount, cryptoDisplayCode);
  $('.amount-deposited').html(translate('You deposited %s', [fiat + ' ' + fiatCode]));
  $('.fiat .js-amount').html(fiat);

  var inserted = lastBill ? translate('You inserted a %s bill', [formatFiat(lastBill)]) : translate('Lamassu Cryptomat');

  $('.js-processing-bill').html(inserted);

  $('.js-continue-crypto-enable').show();
  $('.js-send-crypto-enable').show();
}

function formatDenomination(denom) {
  return denom.toLocaleString(jsLocaleCode, {
    useGrouping: true,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  });
}

function buildCassetteButtons(_cassettes, numberOfButtons) {
  var activeCassettes = _cassettes.filter(function (it) {
    return it.count === null || it.count > 0;
  });
  var inactiveCassettes = _cassettes.filter(function (it) {
    return it.count === 0;
  });

  var allCassettes = activeCassettes.concat(inactiveCassettes);
  var selectedCassettes = allCassettes.slice(0, numberOfButtons);
  var sortedCassettes = selectedCassettes.sort(function (a, b) {
    return a.denomination - b.denomination;
  });

  for (var i = 0; i < sortedCassettes.length; i++) {
    var denomination = formatDenomination(sortedCassettes[i].denomination || 0);
    $('.cash-button[data-denomination-index=' + i + '] .js-denomination').text(denomination);
  }
}

function updateCassetteButtons(activeDenoms, numberOfButtons) {
  for (var i = 0; i < numberOfButtons; i++) {
    var button = $('.choose_fiat_state .cash-button[data-denomination-index=' + i + ']');
    var denomination = button.children('.js-denomination').text();
    button.prop('disabled', !Boolean(activeDenoms[denomination]));
  }
}

function buildCassetteButtonEvents() {
  var fiatButtons = document.getElementById('js-fiat-buttons');
  var lastTouch = null;

  touchImmediateEvent(fiatButtons, function (e) {
    var now = Date.now();
    if (lastTouch && now - lastTouch < 100) return;
    lastTouch = now;
    var cashButtonJ = $(e.target).closest('.cash-button');
    if (cashButtonJ.length === 0) return;
    if (cashButtonJ.hasClass('disabled')) return;
    if (cashButtonJ.hasClass('clear')) return buttonPressed('clearFiat');
    buttonPressed('fiatButton', { denomination: cashButtonJ.children('.js-denomination').text() });
  });
}

function updateCrypto(selector, cryptoAmount, cryptoDisplayCode) {
  $(selector).find('.crypto-amount').html(formatCrypto(cryptoAmount));
  $(selector).find('.crypto-units').html(cryptoDisplayCode);
}

function lookupDecimalChar(localeCode) {
  var num = 1.1;
  var localized = num.toLocaleString(localeCode, {
    useGrouping: true,
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  });

  return localized[1];
}

function splitNumber(localize, localeCode) {
  var decimalChar = lookupDecimalChar(localeCode);
  var split = localize.split(decimalChar);

  if (split.length === 1) {
    return ['<span class="integer">', split[0], '</span>'].join('');
  }

  return ['<span class="integer">', split[0], '</span><span class="decimal-char">', decimalChar, '</span><span class="decimal">', split[1], '</span>'].join('');
}

function formatNumber(num) {
  var localized = num.toLocaleString(jsLocaleCode, {
    useGrouping: true,
    maximumFractionDigits: 6,
    minimumFractionDigits: 3
  });

  return splitNumber(localized, jsLocaleCode);
}

function formatCrypto(amount) {
  return formatNumber(amount);
}

function formatFiat(amount, fractionDigits) {
  if (!fractionDigits) fractionDigits = 0;

  var localized = amount.toLocaleString(jsLocaleCode, {
    useGrouping: true,
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits
  });
  return splitNumber(localized, jsLocaleCode) + ' ' + fiatCode;
}

function setExchangeRate(_rates) {
  lastRates = _rates;
  var cryptoCode = _rates.cryptoCode;
  var rates = _rates.rates;

  var coin = getCryptoCurrency(cryptoCode);
  var displayCode = coin.displayCode;

  if (rates.cashIn) {
    var cryptoToFiat = new BigNumber(rates.cashIn);
    var rateStr = formatFiat(cryptoToFiat.round(2).toNumber(), 2);

    $('.crypto-rate-cash-in').html('1 ' + (cryptoCode === LN ? BTC : cryptoCode) + ' = ' + rateStr);
  }

  if (rates.cashOut) {
    var cashOut = new BigNumber(rates.cashOut);
    var cashOutCryptoToFiat = cashOut && formatFiat(cashOut.round(2).toNumber(), 2);

    $('.crypto-rate-cash-out').html('1 ' + (cryptoCode === LN ? BTC : cryptoCode) + ' = ' + cashOutCryptoToFiat);
  }

  $('.js-crypto-display-units').text(displayCode);
}

function qrize(text, target, color, lightning) {
  var size = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 'normal';

  var image = document.getElementById('bolt-img');
  // Hack for surf browser
  var _size = size === 'normal' ? document.body.clientHeight * 0.36 : document.body.clientHeight * 0.25;

  var opts = {
    crisp: true,
    fill: color || 'black',
    text: text,
    size: _size,
    render: 'canvas',
    rounded: 50,
    quiet: 2,
    mPosX: 50,
    mPosY: 50,
    mSize: 30,
    image: image
  };

  if (lightning) {
    opts.mode = 'image';
  }

  var el = kjua(opts);

  target.empty().append(el);
}

function setTx(tx) {
  var txId = tx.id;
  var isPaperWallet = tx.isPaperWallet;
  var hasBills = tx.bills && tx.bills.length > 0;

  if (hasBills) {
    $('.js-inserted-notes').show();
    $('.js-no-inserted-notes').hide();
  } else {
    $('.js-inserted-notes').hide();
    $('.js-no-inserted-notes').show();
  }

  $('.js-paper-wallet').toggleClass('hide', !isPaperWallet);

  setCurrentDiscount(tx.discount, tx.promoCodeApplied);

  setTimeout(function () {
    qrize(txId, $('#cash-in-qr-code'), CASH_IN_QR_COLOR);
    qrize(txId, $('#cash-in-fail-qr-code'), CASH_IN_QR_COLOR);
    qrize(txId, $('#cash-in-no-funds-qr-code'), CASH_IN_QR_COLOR, null, 'small');
    qrize(txId, $('#qr-code-fiat-receipt'), CASH_OUT_QR_COLOR);
    qrize(txId, $('#qr-code-fiat-complete'), CASH_OUT_QR_COLOR);
  }, 1000);
}

function formatAddressNoBreakLines(address) {
  if (!address) return;
  if (address.length > 60) {
    var firstPart = address.substring(0, 40).replace(/(.{4})/g, '$1 ');
    var secondPart = address.substring(address.length - 16, address.length).replace(/(.{4})/g, '$1 ');
    return firstPart.concat('... ').concat(secondPart);
  }
  return address.replace(/(.{4})/g, '$1 ');
}

function formatAddress(address) {
  var toBr = formatAddressNoBreakLines(address);
  if (!toBr) return;

  return toBr.replace(/((.{4} ){5})/g, '$1<br/> ');
}

function setBuyerAddress(address) {
  $('.crypto-address-no-br').html(formatAddressNoBreakLines(address));
  $('.crypto-address').html(formatAddress(address));
}

function highBill(highestBill, reason) {
  var reasonText = reason === 'transactionLimit' ? translate('Transaction limit reached.') : translate("We're a little low on crypto.");

  t('high-bill-header', reasonText);
  t('highest-bill', translate('Please insert %s or less.', [formatFiat(highestBill)]));

  setScreen('high_bill');
  window.setTimeout(revertScreen, 3000);
}

function minimumTx(lowestBill) {
  t('lowest-bill', translate('Minimum first bill is %s.', [formatFiat(lowestBill)]));

  setScreen('minimum_tx');
  window.setTimeout(revertScreen, 3000);
}

function readingBills(bill) {
  $('.js-processing-bill').html(translate('Processing %s ...', [formatFiat(bill)]));
  $('.js-continue-crypto-enable').hide();
  $('.js-send-crypto-enable').hide();
}

function sendOnly(reason) {
  // TODO: sendOnly should be made into its own state on brain.js
  if (currentState === 'send_only') return;

  var errorMessages = {
    transactionLimit: translate('Transaction limit reached'),
    validatorError: translate('Error in validation'),
    lowBalance: translate("We're out of coins!"),
    blockedCustomer: translate('Transaction limit reached')

    // If no reason provided defaults to lowBalance
  };var reasonText = errorMessages[reason] || errorMessages.lowBalance;
  $('#send-only-title').text(reasonText);

  if (reason === 'blockedCustomer') {
    $('.js-send-only-text').text(translate("Due to local regulations, you've reached your transaction limit. Please contact us if you'd like to raise your limit."));
  } else {
    $('.js-send-only-text').text('');
  }

  setState('send_only');
}

function t(id, str) {
  $('#js-i18n-' + id).html(str);
}

function translateCoin(_cryptoCode) {
  var coin = getCryptoCurrency(_cryptoCode);
  var cryptoCode = coin.cryptoCodeDisplay || _cryptoCode;
  $('.js-i18n-scan-your-address').html(translate('Scan your <br/> %s address', [cryptoCode]));
  $('.js-i18n-please-scan').html(translate('Please scan the QR code <br/> to send us your %s.', [cryptoCode]));
  $('.js-i18n-did-send-coins').html(translate('Have you sent the %s yet?', [cryptoCode]));
  $('.js-i18n-scan-address').html(translate('Scan your %s address', [cryptoCode]));
  $('.js-i18n-invalid-address').html(translate('Invalid %s address', [cryptoCode]));
}

function initTranslatePage() {
  $('.js-i18n').each(function () {
    var el = $(this);
    el.data('baseTranslation', el.html().trim());
  });
  $('input[placeholder]').each(function () {
    var el = $(this);
    el.data('baseTranslation', el.attr('placeholder'));
  });
}

function translatePage() {
  $('.js-i18n').each(function () {
    var el = $(this);
    var base = el.data('baseTranslation');
    el.html(translate(base));
  });
  $('input[placeholder]').each(function () {
    var el = $(this);
    var base = el.data('baseTranslation');
    el.attr('placeholder', translate(base));
  });

  // Adjust send coins button
  var length = $('#send-coins span').text().length;
  if (length > 17) $('body').addClass('i18n-long-send-coins');else $('body').removeClass('i18n-long-send-coins');
}

function loadI18n(localeCode) {
  var messages = locales[localeCode] || locales['en-US'];

  return new Jed({
    'missing_key_callback': function missing_key_callback() {},
    'locale_data': {
      'messages': messages
    }
  });
}

function reachFiatLimit(rec) {
  var msg = null;
  if (rec.isEmpty) msg = translate('We\'re a little low, please cash out');else if (rec.txLimitReached) msg = translate('Transaction limit reached, please cash out');

  var el = $('.choose_fiat_state .limit');
  if (msg) el.html(msg).show();else el.hide();
}

function chooseFiat(data) {
  fiatCredit(data);
  setState('choose_fiat');
}

function displayCrypto(cryptoAtoms, cryptoCode) {
  var coin = getCryptoCurrency(cryptoCode);
  var scale = new BigNumber(10).pow(coin.displayScale);
  // number of decimal places vary based on displayScale value
  var decimalPlaces = coin.displayScale - coin.unitScale + 6;
  var cryptoAmount = new BigNumber(cryptoAtoms).div(scale).round(decimalPlaces).toNumber();
  return formatCrypto(cryptoAmount);
}

function BN(s) {
  return new BigNumber(s);
}

function fiatCredit(data) {
  var tx = data.tx;
  var cryptoCode = tx.cryptoCode;
  var activeDenominations = data.activeDenominations;
  var coin = getCryptoCurrency(cryptoCode);
  var fiat = BN(tx.fiat);

  var fiatDisplay = BN(tx.fiat).toNumber().toLocaleString(jsLocaleCode, {
    useGrouping: true,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  });

  var cryptoAtoms = BN(tx.cryptoAtoms);
  var cryptoDisplay = displayCrypto(cryptoAtoms, cryptoCode);

  var cryptoDisplayCode = coin.displayCode;

  setCurrentDiscount(tx.discount, tx.promoCodeApplied);

  if (cryptoAtoms.eq(0) || cryptoAtoms.isNaN()) $('#js-i18n-choose-digital-amount').hide();else $('#js-i18n-choose-digital-amount').show();

  if (fiat.eq(0)) $('#cash-out-button').prop('disabled', true);else $('#cash-out-button').prop('disabled', false);

  updateCassetteButtons(activeDenominations.activeMap, NUMBER_OF_BUTTONS);
  $('.choose_fiat_state .fiat-amount').text(fiatDisplay);
  t('choose-digital-amount', translate("You'll be sending %s %s", [cryptoDisplay, cryptoDisplayCode]));

  reachFiatLimit(activeDenominations);
}

function setDepositAddress(depositInfo) {
  $('.deposit_state .loading').hide();
  $('.deposit_state .send-notice .crypto-address').html(formatAddress(depositInfo.toAddress));
  $('.deposit_state .send-notice').show();

  qrize(depositInfo.depositUrl, $('#qr-code-deposit'), CASH_OUT_QR_COLOR);
}

function setVersion(version) {
  $('.version-number').html('Version: ' + version);
}

function deposit(tx) {
  var cryptoCode = tx.cryptoCode;
  var display = displayCrypto(tx.cryptoAtoms, cryptoCode);

  $('.js-wallet-address').show();

  $('.deposit_state .digital .js-amount').html(display);
  $('.deposit_state .fiat .js-amount').text(tx.fiat);
  $('.deposit_state .send-notice').hide();
  $('#qr-code-deposit').empty();
  $('.deposit_state .loading').show();
  $('#qr-code-deposit').show();
  $('#lightning-enabled').hide();
  if (tx.cryptoCode === 'LN') $('#lightning-enabled').show();

  setState('deposit');
}

function fiatReceipt(tx) {
  var cryptoCode = tx.cryptoCode;
  var display = displayCrypto(tx.cryptoAtoms, cryptoCode);

  $('.fiat_receipt_state .digital .js-amount').html(display);
  $('.fiat_receipt_state .fiat .js-amount').text(tx.fiat);
  $('.fiat_receipt_state .sent-coins .crypto-address').html(formatAddress(tx.toAddress));

  setState('fiat_receipt');
}

function fiatComplete(tx) {
  var cryptoCode = tx.cryptoCode;
  var display = displayCrypto(tx.cryptoAtoms, cryptoCode);

  $('.fiat_complete_state .digital .js-amount').html(display);
  $('.fiat_complete_state .fiat .js-amount').text(tx.fiat);
  $('.fiat_complete_state .sent-coins .crypto-address').html(formatAddress(tx.toAddress));

  setState('fiat_complete');
}

function dispenseBatch(data) {
  $('.batch').css('visibility', data.of === 1 ? 'hidden' : 'visible');
  $('.batch').text(data.current + '/' + data.of);
}

function initDebug() {
  $('body').css('cursor', 'default');
  var style = document.createElement('style');
  style.type = 'text/css';
  style.innerHTML = 'button { cursor: default !important; }';
  document.getElementsByTagName('head')[0].appendChild(style);
}

function calculateAspectRatio() {
  var width = $('body').width();
  var height = $('body').height();

  function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
  }

  var w = width;
  var h = height;
  var r = gcd(w, h);
  var aspectRatioPt1 = w / r;
  var aspectRatioPt2 = h / r;

  if (aspectRatioPt1 < aspectRatioPt2) {
    aspectRatio = '9:16';
  } else if (aspectRatioPt1 === 8 && aspectRatioPt2 === 5) {
    aspectRatio = '16:10';
  } else if (aspectRatioPt1 === 16 && aspectRatioPt2 === 9) {
    aspectRatio = '16:9';
  } else {
    aspectRatio = w < 1420 ? '16:10' : '16:9';
  }
}

var background = null;

function shouldEnableTouch() {
  var ua = navigator.userAgent;
  if (ua.match(/surf/ig)) return false;

  // ACP has chromium 34 and upboard 73
  var chromiumVersion = ua.match(/chromium\/(\d+)/i);
  var chromeVersion = ua.match(/chrome\/(\d+)/i);
  var chromiumPlus73 = chromiumVersion && chromiumVersion[1] >= 73;
  var chromePlus73 = chromeVersion && chromeVersion[1] >= 73;

  return chromiumPlus73 || chromePlus73;
}

function setAvailablePromoCodes(areThereAvailablePromoCodes) {
  if (areThereAvailablePromoCodes) {
    $('#insert-first-bill-promo-button').show();
    $('#insert-first-recycler-bills-promo-button').show();
    $('#choose-fiat-promo-button').show();
  } else {
    $('#insert-first-bill-promo-button').hide();
    $('#insert-first-recycler-bills-promo-button').hide();
    $('#choose-fiat-promo-button').hide();
  }
}

function setCurrentDiscount(currentDiscount, promoCodeApplied) {
  if (promoCodeApplied) {
    $('#insert-first-bill-promo-button').hide();
    $('#insert-first-recycler-bills-promo-button').hide();
    $('#choose-fiat-promo-button').hide();
  }

  if (!currentDiscount) {
    $('#insert-first-bill-code-added').hide();
    $('#insert-first-recycler-bills-code-added').hide();
    $('#choose-fiat-code-added').hide();
  } else if (currentDiscount > 0) {
    var successMessage = '✔ ' + translate('Discount added (%s off commissions)', [currentDiscount + '%']);
    $('#insert-first-bill-code-added').html(successMessage);
    $('#insert-first-recycler-bills-code-added').html(successMessage);
    $('#choose-fiat-code-added').html(successMessage);
    $('#insert-first-bill-code-added').show();
    $('#insert-first-recycler-bills-code-added').show();
    $('#choose-fiat-code-added').show();
  } else {
    $('#insert-first-bill-promo-button').show();
    $('#insert-first-recycler-bills-promo-button').show();
    $('#choose-fiat-promo-button').show();
    $('#insert-first-bill-code-added').hide();
    $('#insert-first-recycler-bills-code-added').hide();
    $('#choose-fiat-code-added').hide();
  }
}

function setReceiptPrint(receiptStatus, smsReceiptStatus) {
  var status = receiptStatus ? receiptStatus : smsReceiptStatus;

  var className = receiptStatus ? 'print-receipt' : 'send-sms-receipt';
  var printing = receiptStatus ? 'Printing receipt...' : 'Sending receipt...';
  var success = receiptStatus ? 'Receipt printed successfully!' : 'Receipt sent successfully!';

  switch (status) {
    case 'disabled':
      $('#' + className + '-cash-in-message').addClass('hide');
      $('#' + className + '-cash-in-button').addClass('hide');
      $('#' + className + '-cash-out-message').addClass('hide');
      $('#' + className + '-cash-out-button').addClass('hide');
      $('#' + className + '-cash-in-fail-message').addClass('hide');
      $('#' + className + '-cash-in-fail-button').addClass('hide');
      break;
    case 'available':
      $('#' + className + '-cash-in-message').addClass('hide');
      $('#' + className + '-cash-in-button').removeClass('hide');
      $('#' + className + '-cash-out-message').addClass('hide');
      $('#' + className + '-cash-out-button').removeClass('hide');
      $('#' + className + '-cash-in-fail-message').addClass('hide');
      $('#' + className + '-cash-in-fail-button').removeClass('hide');
      break;
    case 'printing':
      var message = locale.translate(printing).fetch();
      $('#' + className + '-cash-in-button').addClass('hide');
      $('#' + className + '-cash-in-message').html(message);
      $('#' + className + '-cash-in-message').removeClass('hide');
      $('#' + className + '-cash-out-button').addClass('hide');
      $('#' + className + '-cash-out-message').html(message);
      $('#' + className + '-cash-out-message').removeClass('hide');
      $('#' + className + '-cash-in-fail-button').addClass('hide');
      $('#' + className + '-cash-in-fail-message').html(message);
      $('#' + className + '-cash-in-fail-message').removeClass('hide');
      break;
    case 'success':
      var successMessage = '✔ ' + locale.translate(success).fetch();
      $('#' + className + '-cash-in-button').addClass('hide');
      $('#' + className + '-cash-in-message').html(successMessage);
      $('#' + className + '-cash-in-message').removeClass('hide');
      $('#' + className + '-cash-out-button').addClass('hide');
      $('#' + className + '-cash-out-message').html(successMessage);
      $('#' + className + '-cash-out-message').removeClass('hide');
      $('#' + className + '-cash-in-fail-button').addClass('hide');
      $('#' + className + '-cash-in-fail-message').html(successMessage);
      $('#' + className + '-cash-in-fail-message').removeClass('hide');
      break;
    case 'failed':
      var failMessage = '✖ ' + locale.translate('An error occurred, try again.').fetch();
      $('#' + className + '-cash-in-button').addClass('hide');
      $('#' + className + '-cash-in-message').html(failMessage);
      $('#' + className + '-cash-in-message').removeClass('hide');
      $('#' + className + '-cash-out-button').addClass('hide');
      $('#' + className + '-cash-out-message').html(failMessage);
      $('#' + className + '-cash-out-message').removeClass('hide');
      $('#' + className + '-cash-in-fail-button').addClass('hide');
      $('#' + className + '-cash-in-fail-message').html(failMessage);
      $('#' + className + '-cash-in-fail-message').removeClass('hide');
      break;
  }
}

function externalCompliance(url) {
  qrize(url, $('#qr-code-external-validation'), cashDirection === 'cashIn' ? CASH_IN_QR_COLOR : CASH_OUT_QR_COLOR);
  return setScreen('external_compliance');
}
//# sourceMappingURL=app.js.map