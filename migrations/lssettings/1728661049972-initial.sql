-- Up

CREATE TABLE static_config (
  version                  INTEGER NOT NULL,
  enable_paper_wallet_only BOOLEAN NOT NULL,
  has_lightening           BOOLEAN NOT NULL,
  server_version           TEXT NOT NULL,
  timezone                 INTEGER NOT NULL,
  two_way_mode             BOOLEAN NOT NULL,
  customer_authentication  TEXT CHECK(customer_authentication IN ('EMAIL', 'SMS')) NOT NULL,

  -- LocaleInfo
  country                  TEXT NOT NULL,
  fiat_code                TEXT NOT NULL,
  primary_locale           TEXT NOT NULL,

  -- MachineInfo
  device_name              TEXT NOT NULL,
  number_of_cassettes      INTEGER NOT NULL,
  number_of_recyclers      INTEGER NOT NULL,

  -- ReceiptInfo
  paper_receipt            BOOLEAN NOT NULL,
  sms_receipt              BOOLEAN NOT NULL
);

CREATE TABLE urls_to_ping (
  url TEXT NOT NULL
);

CREATE TABLE speedtest_files (
  url  TEXT NOT NULL,
  size INTEGER NOT NULL
);

CREATE TABLE terms (
  hash    TEXT PRIMARY KEY NOT NULL,
  title   TEXT NOT NULL,
  text    TEXT NOT NULL,
  accept  TEXT NOT NULL,
  cancel  TEXT NOT NULL,
  active  BOOLEAN NOT NULL,
  tcphoto BOOLEAN NOT NULL,
  delay   BOOLEAN NOT NULL
);

CREATE TABLE triggers_automation (
  trigger_type    TEXT PRIMARY KEY NOT NULL,
  automation_type TEXT CHECK(automation_type IN ('Automatic', 'Manual')) NOT NULL
);

CREATE TABLE locales (
  locale TEXT PRIMARY KEY NOT NULL
);

CREATE TABLE coins (
  crypto_code         TEXT PRIMARY KEY NOT NULL,
  crypto_code_display TEXT NOT NULL,
  display             TEXT NOT NULL,
  minimum_tx          TEXT NOT NULL,
  cash_in_fee         TEXT NOT NULL,
  cash_in_commission  TEXT NOT NULL,
  cash_out_commission TEXT NOT NULL,
  crypto_network      TEXT NOT NULL,
  crypto_units        TEXT NOT NULL,
  batchable           TEXT NOT NULL,
  is_cash_in_only     TEXT NOT NULL
);

CREATE TABLE operator_info (
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT NOT NULL,
  website        TEXT NOT NULL,
  company_number TEXT NOT NULL
);

CREATE TABLE receipt_options (
  field TEXT NOT NULL,
  enabled BOOLEAN NOT NULL
);


CREATE TABLE custom_inputs (
  type TEXT NOT NULL,
  constraint_type TEXT NOT NULL,
  label1 TEXT,
  label2 TEXT
);

CREATE TABLE custom_input_choice_list (
  custom_input INTEGER NOT NULL,
  choice_text  TEXT NOT NULL,

  FOREIGN KEY(custom_input) REFERENCES custom_inputs (rowid)
);

CREATE TABLE custom_screen (
  text  TEXT NOT NULL,
  title TEXT NOT NULL
);

CREATE TABLE custom_requests (
  name    TEXT NOT NULL,
  input   INTEGER NOT NULL,
  screen1 INTEGER NOT NULL,
  screen2 INTEGER NOT NULL,

  FOREIGN KEY(input)   REFERENCES custom_inputs (rowid),
  FOREIGN KEY(screen1) REFERENCES custom_screen (rowid),
  FOREIGN KEY(screen2) REFERENCES custom_screen (rowid)
);

CREATE TABLE custom_info_requests (
  id             TEXT PRIMARY KEY NOT NULL,
  enabled        BOOLEAN NOT NULL,
  custom_request INTEGER NOT NULL,

  FOREIGN KEY(custom_request) REFERENCES custom_requests (rowid)
);

CREATE TABLE triggers (
  id                     TEXT PRIMARY KEY NOT NULL,
  direction              TEXT NOT NULL,
  requirement            TEXT NOT NULL,
  trigger_type           TEXT NOT NULL,

  suspension_days        REAL,
  threshold              INTEGER,
  threshold_days         INTEGER,
  custom_info_request    INTEGER,
  external_service       TEXT,

  FOREIGN KEY(custom_info_request) REFERENCES custom_info_requests (rowid)
);

-- Down

DROP TABLE triggers;
DROP TABLE custom_info_requests;
DROP TABLE custom_requests;
DROP TABLE custom_screen;
DROP TABLE custom_input_choice_list;
DROP TABLE custom_inputs;
DROP TABLE receipt_options;
DROP TABLE operator_info;
DROP TABLE coins;
DROP TABLE locales;
DROP TABLE triggers_automation;
DROP TABLE terms;
DROP TABLE speedtest_files;
DROP TABLE urls_to_ping;
DROP TABLE static_config;
