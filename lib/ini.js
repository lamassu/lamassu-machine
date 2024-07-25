/*
 * This file implements a dumb INI parser and unparser. It's released under the
 * terms of the UNLICENSE (unlicense.org) and the latest version can be found
 * at https://git.sr.ht/~siiky/ini.js/blob/main/ini.js
 */
'use strict';

const RE = {
  header: /^\[([^\[\]]+)\]$/,
  setting: /^([a-zA-Z_]+)=(.*)$/,
}

const parse1 = {
  header: line => {
    const m = line.match(RE.header)
    return m ? m[1] : null
  },

  setting: line => {
    const m = line.match(RE.setting)
    return m ? [m[1], m[2]] : null
  },
}

const ST = {
  init: (ret, line, acc) => {
    let m = null;
    if (m = parse1.header(line))
      return [null, ST.insection, ret, [m, []]]

    if (m = parse1.setting(line))
      return ['setting_outside_section', ST.init, ret, acc]

    return ['bad_line', ST.init, line, acc]
  },

  insection: (ret, line, acc) => {
    let m = null;
    if (m = parse1.header(line)) {
      ret = ret.concat([acc])
      acc = [m, []]
      return [null, ST.insection, ret, acc]
    }

    if (m = parse1.setting(line)) {
      acc = [acc[0], acc[1].concat([m])]
      return [null, ST.insection, ret, acc]
    }

    return ['bad_line', ST.insection, line, acc]
  },
}

const parse = str => {
  const kons = ([err, cst, ret, acc], line) =>
    (line === '' || err) ? [err, cst, ret, acc] : cst(ret, line, acc)
  let [err, _cst, ret, acc] = str
    .split('\n')
    .map(line => line.trim())
    .reduce(kons, [null, ST.init, [], null])
  if (!err && acc) ret = ret.concat([acc])
  return [err, ret]
}

const unparse = ini => ini
  .map(([header, settings]) => [
    '['+header+']',
    settings
      .map(([key, value]) => [key, value].join('='))
      .join('\n')
  ].join('\n'))
  .join('\n') + '\n'

module.exports = { parse, unparse }
