'use strict'

function initDebug () {
  window.setTimeout(doInitDebug, 500)
}

function doInitDebug () {
  var forceLocale = 'en-US'
  var forceCurrency = 'USD'
  setPrimaryLocales([forceLocale])

  //  setPrimaryLocale('pt-PT')
  setPrimaryLocales(['ru-RU', 'en-US', 'fr-QC'])
  //  setPrimaryLocales(['en-US', 'nl-NL'])

  setLocale(forceLocale)

  setCurrency(forceCurrency)
  setCredit(25, 0.202, 20)
  // setState('insert_more_bills')
  // setState('scan_address')
  setState('waiting')
  //  setState('choose_fiat')

  var counter = 0

  $(document).keypress(function() {
    switch (counter) {
      case 0:
        setExchangeRate({xbtToFiat: 123.34, fiatToXbt:  0.0081})
        break
      case 1:
        setState('scan_address')
        break
      case 2:
        setBuyerAddress('1AdN2my8NxvGcisPGYeQTAKdWJuUzNkQxG')
        setState('insert_bills')
        break
      case 3:
        setCredit(5, 0.0405, 5)
        break
      case 4:
        highBill(10, 'lowBalance')
        break
      case 5:
        highBill(10, 'transactionLimit')
        break
      case 6:
        setState('insert_bills')
        setCredit(25, 0.202, 20)
        sendOnly('lowBalance')
        break
      case 7:
        setState('insert_bills')
        setCredit(25, 0.202, 20)
        sendOnly('transactionLimit')
        break
      case 8:
        setState('sending_coins')
        break
      case 9:
        setTransactionHash('d9565aa4cb55155feb8730387fb3be67d583c061754adeb98125544bdfc06fbf')
        setState('completed')
        break
      case 10:
        setState('goodbye')
        break
      case 11:
        setState('limit_reached')
        break
      case 13:
        setWifiList(wifiList())
        setState('wifi')
        break
      case 14:
        setWifiSsid({ssid: 'Bernardo'})
        setState('wifi_password')
        break
      case 15:
        t('wifi-connecting',
          locale.translate('This could take a few moments.').fetch())
        setState('wifi_connecting')
        break
      case 16:
        t('wifi-connecting',
          locale.translate('Connected. Waiting for ticker.').fetch())
        break
      case 17:
        setState('idle')
        counter = 0
        break
    }
    counter += 1
  })
}

function wifiList () {
  return [ { bssid: '74:ea:3a:e5:19:62',
    strength: 0.78,
    security: '[WPA-PSK-TKIP+CCMP][WPA2-PSK-TKIP+CCMP][WPS][ESS]',
    ssid: 'Bernardo',
    displaySsid: 'Bernardo',
    rawSsid: 'Bernardo' },
    { bssid: 'c4:39:3a:9f:5a:c8',
      strength: 0.76,
      security: '[WPA-PSK-TKIP+CCMP][WPA2-PSK-TKIP+CCMP][WPS][ESS]',
      ssid: 'HOME-5AC8',
      displaySsid: 'HOME-5AC8',
      rawSsid: 'HOME-5AC8' },
    { bssid: '28:c6:8e:1e:38:70',
      strength: 0.74,
      security: '[WPA2-PSK-CCMP][WPS][ESS]',
      ssid: 'OnlyUsChickens',
      displaySsid: 'OnlyUsChickens',
      rawSsid: 'OnlyUsChickens' },
    { bssid: '58:6d:8f:92:3d:d8',
      strength: 0.68,
      security: '[WPA-PSK-TKIP+CCMP][WPA2-PSK-TKIP+CCMP][WPS][ESS]',
      ssid: 'snoogins!',
      displaySsid: 'snoogins!',
      rawSsid: 'snoogins!' },
    { bssid: '00:23:97:1e:a8:3a',
      strength: 0.64,
      security: '[WEP][ESS]',
      ssid: '09FX01048785',
      displaySsid: '09FX01048785',
      rawSsid: '09FX01048785' },
    { bssid: '08:86:3b:62:9f:8a',
      strength: 0.54,
      security: '[WPA-PSK-CCMP][WPA2-PSK-CCMP][ESS]',
      ssid: 'belkin.f8a',
      displaySsid: 'belkin.f8a',
      rawSsid: 'belkin.f8a' },
    { bssid: '94:44:52:69:b8:af',
      strength: 0.54,
      security: '[WPA2-PSK-CCMP][ESS]',
      ssid: 'Dooshbags',
      displaySsid: 'Dooshbags',
      rawSsid: 'Dooshbags' },
    { bssid: '00:26:f3:77:e2:28',
      strength: 0.52,
      security: '[WPA-PSK-TKIP+CCMP][WPA2-PSK-TKIP+CCMP][WPS][ESS]',
      ssid: 'HOME-E228',
      displaySsid: 'HOME-E228',
      rawSsid: 'HOME-E228' },
    { bssid: 'e8:89:2c:f4:4b:90',
      strength: 0.48,
      security: '[WPA-PSK-TKIP+CCMP][WPA2-PSK-TKIP+CCMP][WPS][ESS]',
      ssid: 'HOME-4B92',
      displaySsid: 'HOME-4B92',
      rawSsid: 'HOME-4B92' },
    { bssid: 'c8:d7:19:b0:5b:81',
      strength: 0.44,
      security: '[WPA-PSK-TKIP+CCMP][WPA2-PSK-TKIP+CCMP][WPS][ESS]',
      ssid: "Timmy's 2 shoe express",
      displaySsid: "Timmy's..express",
      rawSsid: "Timmy's 2 shoe express" },
    { bssid: 'e8:89:2c:f6:c9:80',
      strength: 0.36,
      security: '[WPA-PSK-TKIP+CCMP][WPA2-PSK-TKIP+CCMP][WPS][ESS]',
      ssid: 'HOME-C982',
      displaySsid: 'HOME-C982',
      rawSsid: 'HOME-C982' },
    { bssid: 'b8:c7:5d:09:e2:dd',
      strength: 0.3,
      security: '[WPA-PSK-TKIP][WPA2-PSK-TKIP+CCMP][ESS]',
      ssid: 'belgiannet',
      displaySsid: 'belgiannet',
      rawSsid: 'belgiannet' },
    { bssid: '20:10:7a:83:30:06',
      strength: 0.28,
      security: '[WPA2-PSK-CCMP][WPS][ESS]',
      ssid: 'MOTOROLA-EABC1',
      displaySsid: 'MOTOROLA-EABC1',
      rawSsid: 'MOTOROLA-EABC1' },
    { bssid: '20:e5:2a:25:c9:02',
      strength: 0.22,
      security: '[WPA2-PSK-CCMP][WPS][ESS]',
      ssid: 'NETGEAR65',
      displaySsid: 'NETGEAR65',
      rawSsid: 'NETGEAR65' },
    { bssid: 'c4:39:3a:9f:db:d8',
      strength: 0.22,
      security: '[WPA-PSK-TKIP+CCMP][WPA2-PSK-TKIP+CCMP][WPS][ESS]',
      ssid: 'HOME-DBD8',
      displaySsid: 'HOME-DBD8',
      rawSsid: 'HOME-DBD8' },
    { bssid: 'cc:35:40:63:7d:b9',
      strength: 0.2,
      security: '[WPA-PSK-TKIP+CCMP][WPA2-PSK-TKIP+CCMP][WPS][ESS]',
      ssid: 'HOME-7DB9',
      displaySsid: 'HOME-7DB9',
      rawSsid: 'HOME-7DB9' },
    { bssid: '0c:f8:93:22:3c:e0',
      strength: 0.18,
      security: '[WPA-PSK-TKIP+CCMP][WPA2-PSK-TKIP+CCMP][WPS][ESS]',
      ssid: 'HOME-3CE2',
      displaySsid: 'HOME-3CE2',
    rawSsid: 'HOME-3CE2' } ]
}
