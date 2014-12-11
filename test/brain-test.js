'use strict';

var _ = require('lodash');
var Brain = require('../lib/brain');
var Configuration = require('../lib/configuration.js');
var State = require('../lib/constants/state.js');

describe('Brain', function() {
	var config = null;
	var brain = null;
	
	beforeEach(function () {
	  var commandLine = JSON.parse('{"_":[],"mockBTC":"1EyE2nE4hf8JVjV51Veznz9t9vTFv8uRU5","mockBv":"/dev/pts/7","mockTrader":true,"mockCam":true,"mockBillDispenser":true}');
	  config = Configuration.loadConfig(commandLine);
	  
	  brain = new Brain(config);
	});
	
  it('can be configured with default values', function() {
	  expect(brain).toBeDefined();
  });
  
  it('starts off in the state \'start\'', function () {
	  expect(brain.state).toBe(State.START);
  });

  it('initializes its trader correctly', function () {
	  var expectedTraderEvents = [State.POLL_UPDATE, 'networkDown', 'networkUp', 'dispenseUpdate', 'error', 'unpair'];
	  
	  brain._initTraderEvents();
	  
	  _.each(expectedTraderEvents, function(el/*, idx, list*/) { var arr = brain.trader.listeners(el); expect(arr.length).toBe(1); });
  });
});
