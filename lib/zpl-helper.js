function _text (content, y, size, font) {
  return `^FO50,${y}^A${font}N,${size || 28},35^FD${content}^FS\n`
}

function text (content, y) {
  return _text(content, y, 28, 'S')
}

function header (content, y) {
  return _text(content, y, 40, 'Q')
}

function qrCode (content, y) {
  return `^FO80,${y}^BQN,2,10,H^FDHM,B0052${content}^FS\n`
}

function start () {
  return `^XA\n`
}

function end () {
  return `^CN1
^PN1
^XZ`
}

module.exports = {
  text,
  header,
  start,
  end,
  qrCode
}
