const fs = require('fs')

const BUILD_PATH = 'ui/start.html'

let head = fs.readFileSync('ui/html/head.html', 'utf8')

let content = ''

fs.readdirSync('ui/html/').forEach(it => {
  if (!it.endsWith('head.html')) {
    content += fs.readFileSync(`ui/html/${it}`)
  }
})

const addPrefix = (str, prefix) => str.split('\n').map(s => `${prefix}${s}`).join('\n')

let html = `<html>
${addPrefix(head, '  ')}
  <body>
    <div id="metrics" class="hide"></div>
    <section id="view">
${addPrefix(content, '    ')}
    </section>
  </body>
</html>`

fs.writeFileSync(BUILD_PATH, html)
console.log('HTML compiled successfully!')
