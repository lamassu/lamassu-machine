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

  it('is created when given common dev command line overrides', function() {
    expect(brain).toBeDefined();
  });

  it('starts off in the state \'start\'', function() {
    expect(brain.state).toBe(State.START);
  });
  
  describe(', when _billJam is called', function () {
	 it(', then a State.NETWORK_DOWN msg is sent to the browser', function() {
		 var callback = jasmine.createSpyObj('callback', ['send']);
		 
		 spyOn(brain, 'browser').and.returnValue(callback);
		 
		 brain._billJam();
		 
		 expect(callback.send).toHaveBeenCalledWith({action: State.NETWORK_DOWN});
	 });
  });
  
  describe(', when _forceNetworkDown is called', function() {
	  it(', and brain.hasConnected is true, state becomes State.NETWORK_DOWN', function() {
		  brain.hasConnected = true;
		  
		  brain._forceNetworkDown();
		  
		  expect(brain.state).toBe(State.NETWORK_DOWN);
	  });
  });
  
  describe(', when _networkUp is called', function () {
	  describe(', and state is State.NETWORK_DOWN', function() {
		  it(', then _restart() is called', function() {
			  spyOn(brain, '_restart');
			  spyOn(brain, 'getBillValidator').and.callFake(function() {
				  var rtn = {};

				  rtn.hasDenominations = function() {
					  return true;
				  };
				  
				  return rtn;
			  });
			  
			  brain.state = State.NETWORK_DOWN;
			  
			  brain._networkUp();
			  
			  expect(brain._restart).toHaveBeenCalled();
		  });
	  });
  });
  
  describe(', when _idle() is called', function() {
	  it(', state becomes State.PENDING_IDLE', function () {
		  spyOn(brain, '_setState');
		  
		  brain._idle();
		  
		  expect(brain._setState).toHaveBeenCalledWith(State.PENDING_IDLE);
	  });
	  
	  it(', and trader.twoWayMode is true, don\'t expect state to become State.IDLE', function() {
		  brain.networkDown = false;
		  brain.trader.twoWayMode = true;
		  
		  spyOn(brain, '_setState');
		  
		  brain._idle();
		  
		  expect(brain._setState).not.toHaveBeenCalledWith(State.IDLE);
	  });

	  it(', and trader.twoWayMode is false, expect state to become State.IDLE', function() {
		  brain.networkDown = false;
		  brain.trader.twoWayMode = false;
		  
		  spyOn(brain, '_setState');
		  spyOn(brain, '_idleOneWay').and.callThrough();

		  brain._idle();
		  
		  expect(brain._idleOneWay).toHaveBeenCalled();
		  expect(brain._setState).toHaveBeenCalledWith(State.IDLE);
	  });
  });
  
  describe(', when _idleOneWay is called', function() {
	  it(', state becomes State.IDLE', function() {
		  spyOn(brain, '_setState');
		  
		  brain._idleOneWay();
		  
		  expect(brain._setState).toHaveBeenCalledWith(State.IDLE);
		  expect(brain._setState.calls.count()).toEqual(1);
	  });
  });

  describe('calls a callback function once the exitOnIdle time has passed', function() {
	  var EXPECT_TO_PASS = true;
	  var EXPECT_TO_FAIL = false;
	  
	  var theTest = function(brainState, expectation) {
		    var callback = jasmine.createSpy('callback');
		    jasmine.clock().install();

		    expect(callback).not.toHaveBeenCalled();

		    jasmine.clock().mockDate();

		    brain.state = brainState;
		    brain._executeCallbackAfterASufficientIdlePeriod(callback);

		    jasmine.clock().tick(brain.config.idleTime);
		    jasmine.clock().tick(brain.config.idleTime);
		    jasmine.clock().tick(brain.config.idleTime);

		    if (expectation === undefined || expectation === EXPECT_TO_PASS)
		    	expect(callback).toHaveBeenCalled();
		    else 
		    	expect(callback).not.toHaveBeenCalled();

		    jasmine.clock().uninstall();
	  };
	  
	  // test each of the states in Brain.STATIC_STATES
	  it('when state is State.IDLE', function() {
		    theTest(State.IDLE);
	  });
	  
	  it('when state is State.PENDING_IDLE', function() {
		    theTest(State.PENDING_IDLE);
	  });

	  it('when state is State.NETWORK_DOWN', function() {
		    theTest(State.NETWORK_DOWN);
	  });

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
      var events = [State.POLL_UPDATE, State.NETWORK_DOWN, 'networkUp', 'dispenseUpdate', 'error', 'unpair'];
      func(events, brain._initTraderEvents, brain.trader);
    });

    it('its browser correctly', function() {
      var events = ['connected', 'message', 'closed', 'messageError', 'error'];
      func(events, brain._initBrowserEvents, brain.browser());
    });

    it('its wifi correctly', function() {
      var events = ['scan', 'authenticationError'];
      func(events, brain._initWifiEvents, brain.wifi);
    });

    it('its billValidator correctly', function() {
      var events = ['error', 'disconnected', 'billAccepted', 'billRead', 'billValid', 'billRejected', 'timeout', 'standby', 'jam', 'stackerOpen', 'enabled'];
      func(events, brain._initBillValidatorEvents, brain.getBillValidator());
    });

    it('its own event listeners correctly', function() {
      var events = ['newState'];
      func(events, brain._initBrainEvents, brain);
    });

  }); /* initializes */
  
  describe(' stores and retrieves the correct object using getters and setters for ', function() {
	  var obj = undefined;
	  var obj2 = undefined;
	  
	  beforeAll(function() {
		  obj = jasmine.createSpy('obj');
		  obj2 = jasmine.createSpy('obj2');		  
	  });
	  
	  it(' BillValidator', function() {
		  brain.setBillValidator(obj);
		  expect(brain.getBillValidator()).toBe(obj);
		  brain.setBillValidator(obj2);
		  expect(brain.getBillValidator()).toBe(obj2);
	  }); 

	  it(' Browser', function() {
		  brain.setBrowser(obj);
		  expect(brain.browser()).toBe(obj);
		  brain.setBrowser(obj2);
		  expect(brain.browser()).toBe(obj2);
	  }); 
  }); /* getters and setters */

}); /* Brain */
