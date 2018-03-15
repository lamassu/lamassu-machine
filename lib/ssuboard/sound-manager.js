const path = require('path')

const actionEmitter = require('../action-emitter')
const playSound = require('./play-sound')

module.exports = {run}

function play (sound) {
  const soundPath = path.resolve(__dirname, '../../ui/sounds/confirm.wav')
  return playSound.play(soundPath)
}

function processSound (event) {
  switch (event.action) {
    case 'playSound':
      return play(event.sound)
  }
}

function run () {
  actionEmitter.on('brain', processSound)
}
