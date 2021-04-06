const fs = require('fs')
const path = require('path')

const _ = require('lodash/fp')
const Xray = require('x-ray')
const x = Xray({
  filters: {strip}
})

const uiPath = path.resolve(__dirname, '..', 'ui')
const startPath = path.resolve(uiPath, 'start.html')
const html = fs.readFileSync(startPath, {encoding: 'utf8'})
const keys = {}

function strip (s) {
  return s.trim().replace(/[\n ]+/g, ' ')
}

function parseAppLine (line) {
  const re = /locale\.translate\(["'](.+)["']\)/
  const res = line.match(re)
  return res && res[1]
}

function parseJs (s) {
  const lines = s.split('\n')
  const results = _.uniq(_.compact(_.map(parseAppLine, lines)))
  return results
}

function parseHtml (s) {
  return new Promise((resolve, reject) => {
    const stream = x(html, '.viewport', [{
      screen: '@data-tr-section',
      str: ['.js-i18n | strip']
    }]).stream()

    stream.on('data', data => resolve(JSON.parse(data.toString())))
    stream.on('error', err => reject(err))
  })
}

function recToPo (string, screen) {
  if (keys[string]) return

  keys[string] = true

  return `#: On screen: ${screen}
msgid "${string}"
msgstr "${string}"

`
}

function screenToPo (strings, screen) {
  const rtp = r => recToPo(r, screen)
  return _.map(rtp, strings)
}

function toPo (res) {
  return _.join('', _.flatMap(r => screenToPo(r.str, r.screen), res))
}

const appPath = path.resolve(uiPath, 'src', 'app.js')
const app = fs.readFileSync(appPath, {encoding: 'utf8'})

const outPath = path.resolve(__dirname, '../i18n/ui/lbm-ui_en-US.po')

const coins = [
  'Bitcoin', 'Ethereum', 'Zcash', 'Litecoin', 'Dash', 'Bitcoin Cash', 'Ducatus'
]

parseHtml(html)
  .then(htmlResults => {
    const appResults = parseJs(app)
    htmlResults.push({screen: 'dynamic', str: appResults})
    htmlResults.push({screen: 'coins', str: coins})
    fs.writeFileSync(outPath, toPo(htmlResults))
  })

console.log('Success. To update, run: crowdin-cli upload sources')
