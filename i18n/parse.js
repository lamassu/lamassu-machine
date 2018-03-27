const fs = require('fs')

const Xray = require('x-ray')
const x = Xray({
  filters: {strip}
})

const html = fs.readFileSync('./start.html')

function strip (s) {
  return s.trim().replace(/[\n ]+/g, ' ')
}

x(html, '.viewport', [{
  screen: '@data-tr-section',
  str: ['.js-i18n | strip']
}])((err, r) => console.log(r))
