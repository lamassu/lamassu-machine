const fs = require('fs')

const BUILD_PATH = 'ui-new/start.html'

let head = fs.readFileSync('ui-new/html/head.html', 'utf8')

let content = ''

fs.readdirSync('ui-new/html/').forEach(it => {
  if (!it.endsWith('head.html')) {
    content += fs.readFileSync(`ui-new/html/${it}`)
  }
})

const addPrefix = (str, prefix) => str.split('\n').map(s => `${prefix}${s}`).join('\n')

let html = `<html>
${addPrefix(head, '  ')}
  <body>
    <img id="bolt-img" src="images/bolt-o.png" style="display:none">
    <div id="metrics" class="hide"></div>
    <section id="view">
${addPrefix(content, '    ')}
    </section>
  </body>
</html>`

fs.writeFileSync(BUILD_PATH, html)
console.log('HTML compiled successfully!')
