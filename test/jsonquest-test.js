'use strict';

var State = require('../lib/constants/state.js');

describe('jsonquest', function() {
	var jsonquest = require('../lib/jsonquest');
	
	describe(', request()', function() {
		describe(' throws error', function() {
			it(' if empty protocol object passed in as member of the options variable', function() {
				expect( function () { var options = {}; options.protocol = {}; jsonquest(options, function() {}); } ).toThrowError();
			});

			it(' if invalid "requestEncoding" object passed in as member of the options variable', function() {
				expect( function () { var options = {}; options.requestEncoding = 'foo'; jsonquest(options, function() {}); } ).toThrowError();
			});
		});
	});
	
	describe(', function returned from repeatCallback', function() {
		it(' emits State.NETWORK_DOWN', function() {
			
		});
	});
});
