"use strict";

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/*! (C) Andrea Giammarchi - Mit Style License */
var URLSearchParams = URLSearchParams || function () {
  "use strict";
  function URLSearchParams(query) {
    var index,
        key,
        value,
        pairs,
        i,
        length,
        dict = Object.create(null);this[secret] = dict;if (!query) return;if (typeof query === "string") {
      if (query.charAt(0) === "?") {
        query = query.slice(1);
      }for (pairs = query.split("&"), i = 0, length = pairs.length; i < length; i++) {
        value = pairs[i];index = value.indexOf("=");if (-1 < index) {
          appendTo(dict, decode(value.slice(0, index)), decode(value.slice(index + 1)));
        } else if (value.length) {
          appendTo(dict, decode(value), "");
        }
      }
    } else {
      if (isArray(query)) {
        for (i = 0, length = query.length; i < length; i++) {
          value = query[i];appendTo(dict, value[0], value[1]);
        }
      } else {
        for (key in query) {
          appendTo(dict, key, query[key]);
        }
      }
    }
  }var isArray = Array.isArray,
      URLSearchParamsProto = URLSearchParams.prototype,
      find = /[!'\(\)~]|%20|%00/g,
      plus = /\+/g,
      replace = { "!": "%21", "'": "%27", "(": "%28", ")": "%29", "~": "%7E", "%20": "+", "%00": "\0" },
      replacer = function replacer(match) {
    return replace[match];
  },
      secret = "__URLSearchParams__:" + Math.random();function appendTo(dict, name, value) {
    if (name in dict) {
      dict[name].push("" + value);
    } else {
      dict[name] = isArray(value) ? value : ["" + value];
    }
  }function decode(str) {
    return decodeURIComponent(str.replace(plus, " "));
  }function encode(str) {
    return encodeURIComponent(str).replace(find, replacer);
  }URLSearchParamsProto.append = function append(name, value) {
    appendTo(this[secret], name, value);
  };URLSearchParamsProto["delete"] = function del(name) {
    delete this[secret][name];
  };URLSearchParamsProto.get = function get(name) {
    var dict = this[secret];return name in dict ? dict[name][0] : null;
  };URLSearchParamsProto.getAll = function getAll(name) {
    var dict = this[secret];return name in dict ? dict[name].slice(0) : [];
  };URLSearchParamsProto.has = function has(name) {
    return name in this[secret];
  };URLSearchParamsProto.set = function set(name, value) {
    this[secret][name] = ["" + value];
  };URLSearchParamsProto.forEach = function forEach(callback, thisArg) {
    var dict = this[secret];Object.getOwnPropertyNames(dict).forEach(function (name) {
      dict[name].forEach(function (value) {
        callback.call(thisArg, value, name, this);
      }, this);
    }, this);
  };URLSearchParamsProto.toJSON = function toJSON() {
    return {};
  };URLSearchParamsProto.toString = function toString() {
    var dict = this[secret],
        query = [],
        i,
        key,
        name,
        value;for (key in dict) {
      name = encode(key);for (i = 0, value = dict[key]; i < value.length; i++) {
        query.push(name + "=" + encode(value[i]));
      }
    }return query.join("&");
  };var dP = Object.defineProperty,
      gOPD = Object.getOwnPropertyDescriptor,
      createSearchParamsPollute = function createSearchParamsPollute(search) {
    function append(name, value) {
      URLSearchParamsProto.append.call(this, name, value);name = this.toString();search.set.call(this._usp, name ? "?" + name : "");
    }function del(name) {
      URLSearchParamsProto["delete"].call(this, name);name = this.toString();search.set.call(this._usp, name ? "?" + name : "");
    }function set(name, value) {
      URLSearchParamsProto.set.call(this, name, value);name = this.toString();search.set.call(this._usp, name ? "?" + name : "");
    }return function (sp, value) {
      sp.append = append;sp["delete"] = del;sp.set = set;return dP(sp, "_usp", { configurable: true, writable: true, value: value });
    };
  },
      createSearchParamsCreate = function createSearchParamsCreate(polluteSearchParams) {
    return function (obj, sp) {
      dP(obj, "_searchParams", { configurable: true, writable: true, value: polluteSearchParams(sp, obj) });return sp;
    };
  },
      updateSearchParams = function updateSearchParams(sp) {
    var append = sp.append;sp.append = URLSearchParamsProto.append;URLSearchParams.call(sp, sp._usp.search.slice(1));sp.append = append;
  },
      verifySearchParams = function verifySearchParams(obj, Class) {
    if (!(obj instanceof Class)) throw new TypeError("'searchParams' accessed on an object that " + "does not implement interface " + Class.name);
  },
      upgradeClass = function upgradeClass(Class) {
    var ClassProto = Class.prototype,
        searchParams = gOPD(ClassProto, "searchParams"),
        href = gOPD(ClassProto, "href"),
        search = gOPD(ClassProto, "search"),
        createSearchParams;if (!searchParams && search && search.set) {
      createSearchParams = createSearchParamsCreate(createSearchParamsPollute(search));Object.defineProperties(ClassProto, { href: { get: function get() {
            return href.get.call(this);
          }, set: function set(value) {
            var sp = this._searchParams;href.set.call(this, value);if (sp) updateSearchParams(sp);
          } }, search: { get: function get() {
            return search.get.call(this);
          }, set: function set(value) {
            var sp = this._searchParams;search.set.call(this, value);if (sp) updateSearchParams(sp);
          } }, searchParams: { get: function get() {
            verifySearchParams(this, Class);return this._searchParams || createSearchParams(this, new URLSearchParams(this.search.slice(1)));
          }, set: function set(sp) {
            verifySearchParams(this, Class);createSearchParams(this, sp);
          } } });
    }
  };upgradeClass(HTMLAnchorElement);if (/^function|object$/.test(typeof URL === "undefined" ? "undefined" : _typeof(URL)) && URL.prototype) upgradeClass(URL);return URLSearchParams;
}();(function (URLSearchParamsProto) {
  var iterable = function () {
    try {
      return !!Symbol.iterator;
    } catch (error) {
      return false;
    }
  }();if (!("forEach" in URLSearchParamsProto)) {
    URLSearchParamsProto.forEach = function forEach(callback, thisArg) {
      var names = Object.create(null);this.toString().replace(/=[\s\S]*?(?:&|$)/g, "=").split("=").forEach(function (name) {
        if (!name.length || name in names) return;(names[name] = this.getAll(name)).forEach(function (value) {
          callback.call(thisArg, value, name, this);
        }, this);
      }, this);
    };
  }if (!("keys" in URLSearchParamsProto)) {
    URLSearchParamsProto.keys = function keys() {
      var items = [];this.forEach(function (value, name) {
        items.push(name);
      });var iterator = { next: function next() {
          var value = items.shift();return { done: value === undefined, value: value };
        } };if (iterable) {
        iterator[Symbol.iterator] = function () {
          return iterator;
        };
      }return iterator;
    };
  }if (!("values" in URLSearchParamsProto)) {
    URLSearchParamsProto.values = function values() {
      var items = [];this.forEach(function (value) {
        items.push(value);
      });var iterator = { next: function next() {
          var value = items.shift();return { done: value === undefined, value: value };
        } };if (iterable) {
        iterator[Symbol.iterator] = function () {
          return iterator;
        };
      }return iterator;
    };
  }if (!("entries" in URLSearchParamsProto)) {
    URLSearchParamsProto.entries = function entries() {
      var items = [];this.forEach(function (value, name) {
        items.push([name, value]);
      });var iterator = { next: function next() {
          var value = items.shift();return { done: value === undefined, value: value };
        } };if (iterable) {
        iterator[Symbol.iterator] = function () {
          return iterator;
        };
      }return iterator;
    };
  }if (iterable && !(Symbol.iterator in URLSearchParamsProto)) {
    URLSearchParamsProto[Symbol.iterator] = URLSearchParamsProto.entries;
  }if (!("sort" in URLSearchParamsProto)) {
    URLSearchParamsProto.sort = function sort() {
      var entries = this.entries(),
          entry = entries.next(),
          done = entry.done,
          keys = [],
          values = Object.create(null),
          i,
          key,
          value;while (!done) {
        value = entry.value;key = value[0];keys.push(key);if (!(key in values)) {
          values[key] = [];
        }values[key].push(value[1]);entry = entries.next();done = entry.done;
      }keys.sort();for (i = 0; i < keys.length; i++) {
        this["delete"](keys[i]);
      }for (i = 0; i < keys.length; i++) {
        key = keys[i];this.append(key, values[key].shift());
      }
    };
  }
})(URLSearchParams.prototype);
//# sourceMappingURL=url-search-params.js.map