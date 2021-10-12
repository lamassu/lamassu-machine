const fs = require('fs')
const path = require('path')

const cheerio = require('cheerio');
const _ = require('lodash/fp')

const uiPath = path.resolve(__dirname, '..', 'ui')
const startPath = path.resolve(uiPath, 'start.html')
const html = fs.readFileSync(startPath, {encoding: 'utf8'})
const keys = {}

function strip (s) {
  return s.trim().replace(/[\n ]+/g, ' ')
}

function escapeDoubleQuotes(s){
  return s.replace(/\\([\s\S])|(")/g,"\\$1$2")
}

function parseAppLine (line) {
  const re = /translate\(["'](.+)["'][,\)]/
  const res = line.match(re)
  return res && res[1]
}

function parseJs (s) {
  const lines = s.split('\n')
  const results = _.uniq(_.compact(_.map(parseAppLine, lines)))
  return results
}

function parseHtml (s) {
  const $ = cheerio.load(s)
  const data = []
  $('.viewport').each((i, node) => {
    const screen = node.attribs['data-tr-section']
    const screenText = {
      screen: screen,
      str: []
    }
    $(node).find('.js-i18n').each((k, elem) => {
      const strings = $(elem).html()
      screenText.str.push(escapeDoubleQuotes(strip(strings)))
    })
    data.push(screenText)
  })
  return data
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
  'Bitcoin', 'Ethereum', 'Zcash', 'Litecoin', 'Dash', 'Bitcoin Cash'
]

function run (){
  try{
    const htmlResults = parseHtml(html)
    const appResults = parseJs(app)
    htmlResults.push({screen: 'dynamic', str: appResults})
    htmlResults.push({screen: 'coins', str: coins})
    fs.writeFileSync(outPath, toPo(htmlResults))
  }
  catch(err){
    err => console.log('Error ', err)
  }
}

run()

console.log('Success. To update, run: crowdin-cli upload sources')
