'use strict'
const path = require('path')
const { open } = require('sqlite')
const sqlite3 = require('sqlite3')

const ensureDBF = dbPromise => () =>
  dbPromise.then(db =>
    db ? db : Promise.reject("Database is not open")
  )

const runInTxF = ensureDB => proc =>
  ensureDB()
    .then(db => new Promise((resolve, reject) =>
      db.getDatabaseInstance().serialize(() =>
        db.run("BEGIN TRANSACTION")
          .then(_ => proc(db))
          .then(ret => db.run("COMMIT TRANSACTION").then(_ => resolve(ret)))
          .catch(err =>
            db.run("ROLLBACK TRANSACTION").then(()=>{},()=>{})
              .finally(() => reject(err))
          )
      )
    ))

const openCachedAndSetup = ({ filename, migrationsPath }, setup) =>
  open({
    filename,
    mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
    driver: sqlite3.cached.Database,
  })
  .then(db => {
    process.on('exit', async function (code) {
      await db.close()
    })
    return db.migrate({ migrationsPath })
      .then(() => setup(db))
      .then(() => db)
  })
  .catch(err => {
    console.log("Failed to open database:", err)
    return null
  })

const openCached = (options, setup) => {
  const dbPromise = openCachedAndSetup(options, setup)
  const ensureDB = ensureDBF(dbPromise)
  const runInTx = runInTxF(ensureDB)

  return {
    dbPromise,
    ensureDB,
    runInTx,
  }
}

const repeat = (n, x) => Array(n).fill(x)
const makeTuple = n => '(' + repeat(n, '?').join(',') + ')'
const makeValues = (nColumns, nRows) => repeat(nRows, makeTuple(nColumns)).join(',')

module.exports = {
  openCached,
  makeValues,
}
