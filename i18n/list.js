'use strict';

/*
This script lists all languages defined in the locales.js.
Possible parameters
--compare: compares translations from the locales.js to keys from the .po file
--quiet: suppress listing of translations. Works with `--compare` flag
When `--compare` is used all other parameters will be treated as language codes.
*/

const fs = require('fs');
const path = require('path');

const localePath = path.resolve(__dirname, '..', 'ui', 'src', 'locales.js');
const json = fs.readFileSync(localePath).slice(14, -1).toString();
const languages = JSON.parse(json);

let selectedLanguages = []
let compare = false
let quiet = false

const parseCommand = s => {
  if(s === '--compare')
    compare = true
  else if (s == '--quiet')
    quiet = true
  else
    selectedLanguages.push(s)
}

process.argv.slice(2).forEach(parseCommand)

if (!compare) {
  Object.keys(languages).sort().forEach(loc => console.log(loc));
} else {
  const poFile = fs.readFileSync(path.resolve(__dirname, 'ui', 'lbm-ui_en-US.po')).toString()
  const poSentences = poFile
    .match(/msgid "(.+?)"\n/g)
    .map(s => s.match(/msgid "(.+?)"\n/)[1])
    .map(s => s.replace(/\\/g, ''))

  if (selectedLanguages.length === 0)
    selectedLanguages = Object.keys(languages)

  Object.keys(languages).forEach(lang => {

    if (!selectedLanguages.includes(lang))
      return

    let missingSentences = []
    let emptySentences = []
    let excessSentences = []

    const langSentences = Object.keys(languages[lang]).filter(s => s !== '')

    poSentences.forEach(s => {
      if(!langSentences.includes(s)) 
        missingSentences.push(s)
    })

    langSentences.forEach(s => {
      if(languages[lang][s][1].length == 0) {
        emptySentences.push(s)
      }
    })
    
    langSentences.forEach(s => {
      if(!poSentences.includes(s))
        excessSentences.push(s)
    })

    console.log('\n\x1b[34m%s\x1b[0m', lang)
    
    if (missingSentences.length === 0) {
      console.log('\x1b[32m%s\x1b[0m', 'No missing translations')
    } else {
      console.log('\x1b[31m%s\x1b[0m', `Detected ${missingSentences.length} missing translations (key not detected in .po file)`)
      quiet || console.log(missingSentences.reduce((a, b) => a + b + '\n', '').slice(0, -1))
    }

    if (emptySentences.length === 0) {
      console.log('\x1b[32m%s\x1b[0m', 'No empty translations')
    } else {
      console.log('\x1b[31m%s\x1b[0m', `Detected ${emptySentences.length} empty translations (key detected in .po file but translation is empty)`)
      quiet || console.log(emptySentences.reduce((a, b) => a + b + '\n', '').slice(0, -1))
    }

    if (excessSentences.length === 0) {
      console.log('\x1b[32m%s\x1b[0m', 'No excess translations')
    } else {
      console.log('\x1b[31m%s\x1b[0m', `Detected ${excessSentences.length} excess translations (key detected in .po file but not in reference)`)
      quiet || console.log(excessSentences.reduce((a, b) => a + b + '\n', '').slice(0, -1))
    }
  });
}
