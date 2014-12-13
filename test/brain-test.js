'use strict';

/*global jasmine:false */

var _ = require('lodash');
var Brain = require('../lib/brain');
var Configuration = require('../lib/configuration.js');
var State = require('../lib/constants/state.js');

describe('Brain', function() {
  var config = null;
  var brain = null;

  beforeEach(function() {
    var overrides = JSON.parse('{"_":[], "mockBTC":"1EyE2nE4hf8JVjV51Veznz9t9vTFv8uRU5", "mockBv":"/dev/pts/7", "mockTrader":true, "mockCam":true, "mockBillDispenser":true, "brain": { "checkIdle":2000, "idleTime":10000, "exitTime":20000} }');
    config = Configuration.loadConfig(overrides);

    brain = new Brain(config);
  });

  it('can be configured with default values', function() {
    expect(brain).toBeDefined();
  });

  it('starts off in the state \'start\'', function() {
    expect(brain.state).toBe(State.START);
  });

  it('calls a callback function once the exitOnIdle time has passed', function() {
    var callback = jasmine.createSpy('callback');
    jasmine.clock().install();

    expect(callback).not.toHaveBeenCalled();

    jasmine.clock().mockDate();

    brain.state = State.IDLE;
    brain._executeCallbackAfterASufficientIdlePeriod(callback);

    jasmine.clock().tick(brain.config.idleTime);
    jasmine.clock().tick(brain.config.idleTime);
    jasmine.clock().tick(brain.config.idleTime);

    expect(callback).toHaveBeenCalled();

    jasmine.clock().uninstall();
  });

  describe('initializes', function() {

    var func = function(arr, testFunc, testObj) {
      testFunc.call(brain);

      _.each(arr, function(el /*, idx, list*/ ) {
        var listeners = testObj.listeners(el);
        expect(listeners.length).toBe(1);
      });
    };

    it('its trader correctly', function() {
      var events = [State.POLL_UPDATE, 'networkDown', 'networkUp', 'dispenseUpdate', 'error', 'unpair'];
      func(events, brain._initTraderEvents, brain.trader);
    });

    it('its browser correctly', function() {
      var events = ['connected', 'message', 'closed', 'messageError', 'error'];
      func(events, brain._initBrowserEvents, brain.browser);
    });

    it('its wifi correctly', function() {
      var events = ['scan', 'authenticationError'];
      func(events, brain._initWifiEvents, brain.wifi);
    });

    it('its billValidator correctly', function() {
      var events = ['error', 'disconnected', 'billAccepted', 'billRead', 'billValid', 'billRejected', 'timeout', 'standby', 'jam', 'stackerOpen', 'enabled'];
      func(events, brain._initBillValidatorEvents, brain.billValidator);
    });

    it('its own event listeners correctly', function() {
      var events = ['newState'];
      func(events, brain._initBrainEvents, brain);
    });

  }); /* initializes */

}); /* Brain */
