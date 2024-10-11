const setVariableInterval = function (_thunk, interval, nextInterval) {
  if (!(this instanceof setVariableInterval))
    return new setVariableInterval(_thunk, interval, nextInterval)

  this.interval = interval
  const thunk = () => {
    const updateInterval = interval => {
      if (interval && this.interval !== interval) {
        clearInterval(this.handle)
        this.handle = setInterval(thunk, interval)
        this.interval = interval
      }
    }

    return _thunk()
      .then(nextInterval)
      // NOTE: As of now it's only used for the Trader's poller, that catches
      // any errors at the end, so this catch is unnecessary.
      //.catch(nextInterval)
      .then(updateInterval)
  }

  this.handle = setInterval(thunk, interval)
}

const clearVariableInterval = vi => {
  if (vi?.handle) {
    clearInterval(vi.handle)
    vi.handle = null
  }
}

module.exports = { setVariableInterval, clearVariableInterval }
