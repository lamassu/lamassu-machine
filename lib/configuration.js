'use strict';

	var _ = require('lodash');
	var fs = require('fs');
	var path = require('path');

	var SOFTWARE_CONFIG = require('../software_config.json');
	var DEVICE_CONFIG = require('../device_config.json');
	var LICENSES = require('../licenses.json');
	
	exports.loadConfig = function (commandLine) {
	  var config = SOFTWARE_CONFIG;

	  _.merge(config, DEVICE_CONFIG);
	  _.merge(config, commandLine);
	  _.merge(config, LICENSES);
	  delete config._;

	  if (config.mockBv) config.id003.rs232.device = config.mockBv;
	  
	  if (config.mockCam) {
	    var fakeLicense = fs.readFileSync(path.join(__dirname,
	        '../mock_data/compliance/license.jpg'));
	    var pdf417Data = fs.readFileSync(path.join(__dirname,
	        '../mock_data/compliance/nh.dat'));
	    var mockCamConfig = {
	      pairingData: config.mockPair,
	      qrData: config.brain.mockQR || config.mockBTC,
	      pdf417Data: pdf417Data,
	      fakeLicense: fakeLicense
	    };
	    config.scanner = {
	      mock: {
	        data: mockCamConfig
	      }
	    };
	  }

	  return config;
	};
		
