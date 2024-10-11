'use strict'
const path = require('path')
const sqlite = require('./sqlite')

const root = path.join(__dirname, "..", "..")
const dataPath = require(path.join(root, "device_config.json")).brain.dataPath

const filename = path.join(root, dataPath, "lssettings.sqlite")
const migrationsPath = path.join(root, "migrations/lssettings")

const unzip = a => {
  const ls = a.map(([l, _]) => l)
  const rs = a.map(([_, r]) => r)
  return [ls, rs]
}

const zip = (as, bs) => as.map((a, idx) => [a, bs[idx]])

const assign = (to, from) => Object.assign(structuredClone(to), from)

const PromiseObject = obj => {
  const entries = Object.entries(obj)
  const [keys, promises] = unzip(entries)
  return Promise.all(promises)
    .then(results => Object.fromEntries(zip(keys, results)))
}

const getLastID = ({ lastID }) => lastID

const { ensureDB, runInTx } = sqlite.openCached(
  { filename, migrationsPath },
  db => db.run("PRAGMA journal_mode = WAL")
)

let db = null
ensureDB()
  .then(db_ => { db = db_ })
  .catch(console.log)

/* Static config */

const saveStaticConfig = ({
  version,
  enable_paper_wallet_only,
  has_lightening,
  server_version,
  timezone,
  two_way_mode,
  customer_authentication,
  paper_receipt,
  sms_receipt,
}, { // LocaleInfo
  country,
  fiat_code,
  primary_locale,
}, { // MachineInfo
  deviceName,
  numberOfCassettes,
  numberOfRecyclers,
}) => db.run(
  `INSERT INTO static_config (
     rowid,
     version,
     enable_paper_wallet_only,
     has_lightening,
     server_version,
     timezone,
     two_way_mode,
     customer_authentication,

     country,
     fiat_code,
     primary_locale,

     device_name,
     number_of_cassettes,
     number_of_recyclers,
     paper_receipt,
     sms_receipt
   )
   VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT (rowid) DO UPDATE SET
     version = excluded.version,
     enable_paper_wallet_only = excluded.enable_paper_wallet_only,
     has_lightening = excluded.has_lightening,
     server_version = excluded.server_version,
     timezone = excluded.timezone,
     two_way_mode = excluded.two_way_mode,
     customer_authentication = excluded.customer_authentication,

     country = excluded.country,
     fiat_code = excluded.fiat_code,
     primary_locale = excluded.primary_locale,

     device_name = excluded.device_name,
     number_of_cassettes = excluded.number_of_cassettes,
     number_of_recyclers = excluded.number_of_recyclers,

     paper_receipt = excluded.paper_receipt,
     sms_receipt = excluded.sms_receipt`,
  version, enable_paper_wallet_only, has_lightening, server_version, timezone, two_way_mode, customer_authentication,
  country, fiat_code, primary_locale,
  deviceName, numberOfCassettes, numberOfRecyclers,
  !!paper_receipt, !!sms_receipt
)

const loadStaticConfig = () => db.get(
  `SELECT version, enable_paper_wallet_only, has_lightening, server_version, timezone, two_way_mode, customer_authentication,
          country, fiat_code, primary_locale,
          device_name, number_of_cassettes, number_of_recyclers,
          paper_receipt, sms_receipt
   FROM static_config
   WHERE rowid = 1`
)

/* Ping URLs */

const deleteURLsToPing = () =>
  db.run("DELETE FROM urls_to_ping WHERE TRUE")

const insertURLsToPing = newURLs =>
  newURLs.length === 0 ?
    Promise.resolve() :
    db.run(
      "INSERT INTO urls_to_ping (url) VALUES " + sqlite.makeValues(1, newURLs.length),
      newURLs
    )

const saveURLsToPing = newURLs =>
  deleteURLsToPing()
    .then(_ => insertURLsToPing(newURLs))

const loadURLsToPing = () =>
  db.all("SELECT url FROM urls_to_ping")
    .then(urls => urls.map(({ url }) => url))

/* Speedtest files */

const deleteSpeedtestFiles = () =>
  db.run("DELETE FROM speedtest_files WHERE TRUE")

const insertSpeedtestFiles = newFiles =>
  newFiles.length === 0 ?
    Promise.resolve() :
    db.run(
      "INSERT INTO speedtest_files (url, size) VALUES " + sqlite.makeValues(2, newFiles.length),
      newFiles.map(({ url, size }) => [url, size]).flat()
    )

const saveSpeedtestFiles = newFiles =>
  deleteSpeedtestFiles()
    .then(_ => insertSpeedtestFiles(newFiles))

const loadSpeedtestFiles = () =>
  db.all("SELECT url, size FROM speedtest_files")

/* Terms */

const loadTerms = () =>
  db.get("SELECT active, hash, title, text, accept, cancel, tcphoto, delay FROM terms WHERE rowid = 1")
    .then(terms => {
      if (!terms) return [null, { active: false }]
      const { hash, title, text, accept, cancel, active, tcphoto, delay } = terms
      terms = { title, text, accept, cancel, active, tcPhoto: !!tcphoto, delay: !!delay }
      return [hash, terms]
    })

const insertTerms = (hash, { title, text, accept, cancel, active, tcPhoto, delay }) =>
  db.run(
    `INSERT INTO terms (rowid, hash, title, text, accept, cancel, active, tcphoto, delay)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (rowid) DO UPDATE SET
       hash = excluded.hash,
       title = excluded.title,
       text = excluded.text,
       accept = excluded.accept,
       cancel = excluded.cancel,
       active = excluded.active,
       tcphoto = excluded.tcphoto,
       delay = excluded.delay`,
    hash, title, text, accept, cancel, active, tcPhoto, delay
  )

const deleteTerms = () => db.run("DELETE FROM terms WHERE TRUE")
const disableTerms = () => db.run("UPDATE terms SET active = FALSE WHERE TRUE")

const saveTerms_ = (hash, terms) =>
  (!hash || !terms) ? // There are no terms
    deleteTerms() :
  terms.active ? // There are terms, but they've been updated
    deleteTerms().then(_ => insertTerms(hash, terms)) :
    disableTerms() // There are terms but they've been disabled

/* Triggers automation */

const deleteTriggersAutomation = () =>
  db.run("DELETE FROM triggers_automation WHERE TRUE")

const insertTriggersAutomation = triggersAutomation => {
  triggersAutomation = Object.entries(triggersAutomation)
  return db.run(
    "INSERT INTO triggers_automation (trigger_type, automation_type) VALUES " + sqlite.makeValues(2, triggersAutomation.length),
    triggersAutomation.flat()
  )
}

const saveTriggersAutomation = triggersAutomation =>
  deleteTriggersAutomation()
    .then(_ => insertTriggersAutomation(triggersAutomation))

const loadTriggersAutomation = () =>
  db.all("SELECT trigger_type, automation_type FROM triggers_automation")
    .then(triggers =>
      triggers.reduce(
        (ret, { trigger_type, automation_type }) =>
          Object.assign(ret, { [trigger_type]: automation_type }),
        {}
      )
    )

/* Triggers */

const deleteTriggers = () => Promise.all([
  'triggers',
  'custom_info_requests',
  'custom_requests',
  'custom_screen',
  'custom_input_choice_list',
  'custom_inputs',
].map(table => db.run(`DELETE FROM ${table} WHERE TRUE`)))

const insertTrigger = () => ({
  id,
  direction,
  requirement,
  triggerType,
  suspensionDays,
  threshold,
  thresholdDays,
  customInfoRequest,
  externalService,
}) =>
  db.run(
    `INSERT INTO triggers (
       id,
       direction,
       requirement,
       trigger_type,
       suspension_days,
       threshold,
       threshold_days,
       custom_info_request,
       external_service
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    direction,
    requirement,
    triggerType,
    suspensionDays,
    threshold,
    thresholdDays,
    customInfoRequest,
    externalService,
  )

const insertCustomInfoRequest = () => ({ id, enabled, customRequest }) =>
  db.run(
    "INSERT INTO custom_info_requests (id, enabled, custom_request) VALUES (?, ?, ?)",
    id, enabled, customRequest
  )
  .then(getLastID)

const insertCustomRequest = () => ({ name, input, screen1, screen2 }) =>
  db.run(
    "INSERT INTO custom_requests (name, input, screen1, screen2) VALUES (?, ?, ?, ?)",
    name, input, screen1, screen2
  )
  .then(getLastID)

const insertCustomScreen = ({ text, title }) =>
  db.run("INSERT INTO custom_screen (text, title) VALUES (?, ?)", text, title)
    .then(getLastID)

const saveCustomInputChoiceList = (customInputID, choiceList) =>
  db.run(
    "INSERT INTO custom_input_choice_list (custom_input, choice_text) VALUES " + sqlite.makeValues(2, choiceList.length),
    choiceList.map(text => [customInputID, text]).flat()
  )
  .then(_ => customInputID)

const insertCustomInput = ({ type, constraintType, label1, label2 }) =>
  db.run(
    "INSERT INTO custom_inputs (type, constraint_type, label1, label2) VALUES (?, ?, ?, ?)",
    type, constraintType, label1, label2
  )
  .then(getLastID)

const saveCustomInput = customInput =>
  insertCustomInput(customInput)
    .then(customInputID => saveCustomInputChoiceList(customInputID, customInput.choiceList))

const saveCustomRequest = customRequest =>
  PromiseObject({
    input: saveCustomInput(customRequest.input),
    screen1: insertCustomScreen(customRequest.screen1),
    screen2: insertCustomScreen(customRequest.screen2),
  })
  .then(from => assign(customRequest, from))
  .then(insertCustomRequest())

const saveCustomInfoRequest = customInfoRequest =>
  saveCustomRequest(customInfoRequest.customRequest)
    .then(customRequest => assign(customInfoRequest, { customRequest }))
    .then(insertCustomInfoRequest())

/*
 * NOTE: Recursively save all constituents of a trigger, replacing the
 * respective field with its ID in the DB, thus preparing the object for
 * insertion. For example, saveCustomInfoRequest() returns the ID of the
 * inserted custom_info_request; saveTrigger() updates its customInfoRequest
 * field to this ID; and finally inserts it into the DB.
 */
const saveTrigger = trigger => (
  trigger.customInfoRequest === null ?
    Promise.resolve(trigger) :
    saveCustomInfoRequest(trigger.customInfoRequest)
      .then(customInfoRequest => assign(trigger, { customInfoRequest }))
).then(insertTrigger())

const saveTriggers = triggers =>
  deleteTriggers()
    .then(_ => Promise.all(triggers.map(saveTrigger)))

const getCustomInput = customInput =>
  db.get(
    "SELECT type, constraint_type, label1, label2 FROM custom_inputs WHERE rowid = ?",
    customInput
  )
  .then(({ type, constraint_type, label1, label2 }) => ({
    type, constraintType: constraint_type, label1, label2
  }))

const loadCustomInputChoiceList = customInput =>
  db.all(
    "SELECT choice_text FROM custom_input_choice_list WHERE custom_input = ?",
    customInput
  )
  .then(choiceList => choiceList.map(({ choice_text }) => choice_text))

const loadCustomInput = customInput =>
  Promise.all([
    getCustomInput(customInput),
    loadCustomInputChoiceList(customInput),
  ])
  .then(([customInput, choiceList]) => Object.assign(customInput, { choiceList }))

const loadCustomScreen = customScreen =>
  db.get("SELECT text, title FROM custom_screen WHERE rowid = ?", customScreen)

const loadCustomRequest = customRequest =>
  db.get(
    "SELECT name, input, screen1, screen2 FROM custom_requests WHERE rowid = ?",
    customRequest
  )
  .then(customRequest =>
    PromiseObject({
      input: loadCustomInput(customRequest.input),
      screen1: loadCustomScreen(customRequest.screen1),
      screen2: loadCustomScreen(customRequest.screen2),
    })
    .then(from => Object.assign(customRequest, from))
  )

const loadCustomInfoRequest = rowid =>
  db.get(
    "SELECT id, enabled, custom_request FROM custom_info_requests WHERE rowid = ?",
    rowid
  )
  .then(({ id, enabled, custom_request }) =>
    loadCustomRequest(custom_request)
      .then(customRequest => ({ id, enabled, customRequest }))
  )

const loadTrigger = trigger =>
  !trigger.customInfoRequest ?
    Promise.resolve(trigger) :
    loadCustomInfoRequest(trigger.customInfoRequest)
      .then(customInfoRequest => Object.assign(trigger, { customInfoRequest }))

const loadTriggers = () =>
  db.all(
    `SELECT
       id,
       direction,
       requirement,
       trigger_type,
       suspension_days,
       threshold,
       threshold_days,
       custom_info_request,
       external_service
     FROM triggers`
  )
  .then(triggers => Promise.all(
    (triggers ?? [])
      .map(({
        id,
        direction,
        requirement,
        trigger_type,
        suspension_days,
        threshold,
        threshold_days,
        custom_info_request,
        external_service
      }) => loadTrigger({
        id: id,
        direction: direction,
        requirement: requirement,
        triggerType: trigger_type,
        suspensionDays: suspension_days,
        threshold: threshold,
        thresholdDays: threshold_days,
        customInfoRequest: custom_info_request,
        externalService: external_service,
      }))
  ))

/* Locales */

const deleteLocales = () => db.run("DELETE FROM locales WHERE TRUE")

const insertLocales = primaryLocales => db.run(
  "INSERT INTO locales (locale) VALUES " + sqlite.makeValues(1, primaryLocales.length),
  primaryLocales
)

const saveLocales = ({ locales }) =>
  deleteLocales()
    .then(_ => insertLocales(locales))

const loadLocales = () =>
  db.all("SELECT locale FROM locales")
    .then(locales => locales.map(({ locale }) => locale))

/* Coins */

const deleteCoins = () => db.run("DELETE FROM coins WHERE TRUE")
const insertCoins = coins =>
  db.run(
    `INSERT INTO coins (
       crypto_code,
       crypto_code_display,
       display,
       minimum_tx,
       cash_in_fee,
       cash_in_commission,
       cash_out_commission,
       crypto_network,
       crypto_units,
       batchable,
       is_cash_in_only
     ) VALUES` + sqlite.makeValues(11, coins.length),
    coins.map(({
      cryptoCode,
      cryptoCodeDisplay,
      display,
      minimumTx,
      cashInFee,
      cashInCommission,
      cashOutCommission,
      cryptoNetwork,
      cryptoUnits,
      batchable,
      isCashInOnly,
    }) => [
      cryptoCode,
      cryptoCodeDisplay,
      display,
      minimumTx,
      cashInFee,
      cashInCommission,
      cashOutCommission,
      cryptoNetwork,
      cryptoUnits,
      batchable,
      isCashInOnly,
    ]).flat()
  )

const saveCoins = coins =>
  deleteCoins()
    .then(_ => insertCoins(coins))

const loadCoins = () =>
  db.all(
    `SELECT crypto_code,
            crypto_code_display,
            display,
            minimum_tx,
            cash_in_fee,
            cash_in_commission,
            cash_out_commission,
            crypto_network,
            crypto_units,
            batchable,
            is_cash_in_only
     FROM coins`
  )
  .then(coins =>
      (coins ?? []).map(
        ({
          crypto_code,
          crypto_code_display,
          display,
          minimum_tx,
          cash_in_fee,
          cash_in_commission,
          cash_out_commission,
          crypto_network,
          crypto_units,
          batchable,
          is_cash_in_only
        }) => ({
          cryptoCode: crypto_code,
          cryptoCodeDisplay: crypto_code_display,
          display,
          minimumTx: minimum_tx,
          cashInFee: cash_in_fee,
          cashInCommission: cash_in_commission,
          cashOutCommission: cash_out_commission,
          cryptoNetwork: crypto_network,
          cryptoUnits: crypto_units,
          batchable,
          isCashInOnly: is_cash_in_only,
        })
      )
  )

/* Operator info */

const deleteOperatorInfo = () => db.run("DELETE FROM operator_info WHERE TRUE")

const insertOperatorInfo = ({ name, phone, email, website, companyNumber }) =>
  db.run(
    "INSERT INTO operator_info (name, phone, email, website, company_number) VALUES (?, ?, ?, ?, ?)",
    name, phone, email, website, companyNumber
  )

const saveOperatorInfo = operatorInfo =>
  deleteOperatorInfo()
    .then(_ => operatorInfo ? insertOperatorInfo(operatorInfo) : null)

const loadOperatorInfo = () =>
  db.get(
    `SELECT name, phone, email, website, company_number
     FROM operator_info
     ORDER BY rowid DESC
     LIMIT 1`
  )
  .then(operatorInfo =>
    operatorInfo === undefined ?
      { active: false } :
      Object.assign(
        operatorInfo,
        { active: true, companyNumber: operatorInfo.company_number }
      )
  )

/* Receipt info */

const deleteReceiptOptions = () =>
  db.run("DELETE FROM receipt_options WHERE TRUE")

const insertReceiptOptions = receiptOptions => {
  receiptOptions = Object.entries(receiptOptions)
  if (receiptOptions.length === 0) return Promise.resolve()
  return db.run(
    "INSERT INTO receipt_options (field, enabled) VALUES " + sqlite.makeValues(2, receiptOptions.length),
    receiptOptions.flat()
  )
}

const saveReceiptOptions = receiptOptions =>
  deleteReceiptOptions()
    .then(_ => insertReceiptOptions(receiptOptions ?? {}))

const loadReceiptOptions = () =>
  db.all("SELECT field, enabled FROM receipt_options")
    .then(receiptOptions =>
      (receiptOptions ?? []).reduce(
        (ret, { field, enabled }) =>
          Object.assign(ret, { [field]: enabled }),
        {}
      )
    )

/* Public functions */

/* Called after the Trader's poll to save new configs */
const saveConfig = ({
  coins,
  locales,
  machineInfo,
  operatorInfo,
  receiptOptions,
  speedtestFiles,
  staticConfig,
  terms,
  termsHash,
  triggersAutomation,
  triggers,
  urlsToPing,
}) =>
  runInTx(() => PromiseObject({
    coins: saveCoins(coins),
    locales: saveLocales(locales),
    operatorInfo: saveOperatorInfo(operatorInfo),
    receiptOptions: saveReceiptOptions(receiptOptions),
    speedtestFiles: saveSpeedtestFiles(speedtestFiles),
    staticConfig: saveStaticConfig(staticConfig, locales, machineInfo),
    terms: saveTerms_(termsHash, terms),
    triggersAutomation: saveTriggersAutomation(triggersAutomation),
    triggers: saveTriggers(triggers),
    urlsToPing: saveURLsToPing(urlsToPing),
  }))

const saveTerms = (termsHash, terms) =>
  runInTx(() => saveTerms_(termsHash, terms))

/* Called on machine start-up to load the last known static config */
const loadConfig = () =>
  runInTx(() => PromiseObject({
    coins: loadCoins(),
    locales: loadLocales(),
    operatorInfo: loadOperatorInfo(),
    receiptOptions: loadReceiptOptions(),
    speedtestFiles: loadSpeedtestFiles(),
    staticConfig: loadStaticConfig(),
    terms: loadTerms(),
    triggersAutomation: loadTriggersAutomation(),
    triggers: loadTriggers(),
    urlsToPing: loadURLsToPing(),
  }))
  .then(config =>
    (config === undefined || config.staticConfig === undefined) ?
      null :
      config
  )

const loadMachineInfo = () =>
  ensureDB()
    .then(loadStaticConfig)
    .then(config =>
      config === null ?
        { active: false } :
        {
          active: true,
          deviceName: config.device_name,
          numberOfCassettes: config.number_of_cassettes,
          numberOfRecyclers: config.number_of_recyclers,
        }
    )

module.exports = {
  saveConfig,
  saveTerms,
  loadConfig,
  loadMachineInfo,
}
