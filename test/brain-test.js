'use strict';

var Configuration = require('../lib/configuration.js');
var Brain = require("../lib/brain");

// sample test spec
describe("A suite", function() {
	var config = null;
	
	beforeAll(function () {
	  var commandLine = JSON.parse('{"_":[],"mockBTC":"1EyE2nE4hf8JVjV51Veznz9t9vTFv8uRU5","mockBv":"/dev/pts/7","mockTrader":true,"mockCam":true,"mockBillDispenser":true}');
	  config = Configuration.loadConfig(commandLine);
	});
	
  it("contains spec with an expectation", function() {
	  var brain = new Brain(config);
	  
	  expect(true).toBe(true);
  });
});
