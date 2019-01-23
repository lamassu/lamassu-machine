const fs = require('fs')

const BUILD_PATH = 'ui-new/start.html'

// TODO this is unfinished
let content = fs.readFileSync('ui-new/html/goodbye.html', 'utf8')
let content2 = fs.readFileSync('ui-new/html/start.html', 'utf8')
let head = fs.readFileSync('ui-new/html/head.html', 'utf8')

const addPrefix = (str, prefix) => str.split('\n').map(s => `${prefix}${s}`).join('\n')

let html = `<html>
${addPrefix(head, '  ')}

  <body>
${addPrefix(content, '    ')}
${addPrefix(content2, '    ')}
  </body>
</html>`

fs.writeFileSync(BUILD_PATH, html)
console.log('HTML compiled successfully!')
