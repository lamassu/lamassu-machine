'use strict'

const https = require('https')
const fs = require('fs')
const async = require('./async')
const cp = require('child_process')
const report = require('./report').report

const hardwareCode = process.argv[2]
const isAaeon = hardwareCode === 'aaeon'

const clientFolder = isAaeon ? '/var/lib/lamassu-machine' : '/opt/lamassu-machine/data'
const lamassuCertFolder = isAaeon ? '/var/lib/lamassu-machine' : '/opt/certs'

const key = fs.readFileSync(`${clientFolder}/client.key`)
const cert = fs.readFileSync(`${clientFolder}/client.pem`)
const ca = fs.readFileSync(`${lamassuCertFolder}/lamassu.pem`)

const TIMEOUT = 600000

const logFolder = isAaeon ? '/var/log/upstart' : '/var/log/supervisor'
const logFile = isAaeon ? 'lamassu-machine.log' : 'lamassu-machine.err.log'
const machineLogs = `${logFolder}/${logFile}`

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err)
  })
}

function tailFile(file, cb) {
  fs.exists(file, function(exists) {
    if (!exists) {
      report(file + ' does not exist', null, cb)
      return
    }
    fs.stat(file, function(err, stats) {
      if (err) return report(err, null, cb)
      var opts = {
        start: stats.size - 51200000
      }

      var httpsOptions = {
        host: 'updates.lamassu.is',
        port: 8000,
        path: '/log',
        method: 'POST',
        key: key,
        cert: cert,
        ca: ca,
        ciphers: 'AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH',
        secureProtocol: 'TLSv1_method',
        rejectUnauthorized: true,
        headers: {
          'Content-Type': 'application/gzip'
        }
      }
      httpsOptions.agent = new https.Agent(httpsOptions)

      var req = https.request(httpsOptions, function(res) {
        res.resume()
        res.on('end', cb)
      })
      fs.createReadStream(file, opts).pipe(req)
    })
  })
}

async.series([
  async.apply(command, `tar -czf /tmp/log-file.tar.gz ${machineLogs}`),
  async.apply(tailFile, '/tmp/log-file.tar.gz'),
  async.apply(report, null, 'finished.')
], function(err) {
  if (err) throw err
})
