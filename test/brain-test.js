'use strict';

var Configuration = require("../lib/configuration.js");
var Brain = require("../lib/brain");
var State = require("../lib/constants/state.js");

describe("Brain", function() {
	var config = null;
	
	beforeAll(function () {
	  var commandLine = JSON.parse('{"_":[],"mockBTC":"1EyE2nE4hf8JVjV51Veznz9t9vTFv8uRU5","mockBv":"/dev/pts/7","mockTrader":true,"mockCam":true,"mockBillDispenser":true}');
	  config = Configuration.loadConfig(commandLine);
	});
	
  it("can be configured with default values", function() {
	  var brain = new Brain(config);
	  expect(brain).toBeDefined();
  });
  
  it("starts off in the state 'start'", function () {
	  var brain = new Brain(config);
	  expect(brain.state).toBe(State.START);
  });
});
