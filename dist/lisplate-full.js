/*! lisplate - v0.6.0
* https://github.com/lisplate/lisplate
* Copyright (c) 2016 ; Released under the MIT License */
(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('lisplate.utils', [], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory();
  } else {
    root.Lisplate = {};
    root.Lisplate.Utils = factory();
  }
}(this, function() {
  'use strict';

  return {
    loadCompiledSource: function loadCompiledSource(compiledSource) {
      var template = null;
      eval('template=' + compiledSource);
      return template;
    },

    resolve: function resolve(item) {
      if (typeof item === 'function') {
        return item();
      } else {
        return item;
      }
    },

    thenable: function thenable(item) {
      return (typeof item === 'object' || typeof item === 'function') && typeof item.then === 'function';
    }
  };
}));

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('lisplate.runtime', ['lisplate.utils'], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory(require('./util'));
  } else {
    root.Lisplate.Runtime = factory(root.Lisplate.Utils);
  }
}(this, function(utils) {
  'use strict';

  var _resolve = utils.resolve;
  var _thenable = utils.thenable;

  var escapeTests = {
    html: /[&<>\"\']/,
    js: /[\\\/\r\n\f\t'"\u2028\u2029]/,
    json: /["<\u2028\u2029]/
  };

  var escapeReplaceRegex = {
    html: /[&<>\"\']/g,
    js: /[\\\/\r\n\f\t'"\u2028\u2029]/g,
    json: /["<\u2028\u2029]/g
  };

  var escapeReplacements = {
    html: {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      '\'': '&#39;'
    },
    js: {
      '\\': '\\\\',
      '/': '\\/',
      '\r': '\\r',
      '\n': '\\n',
      '\f': '\\f',
      '\t': '\\t',
      '\'': '\\\'',
      '"': '\\"',
      '\u2028': '\\u2028',
      '\u2029': '\\u2029'
    },
    json: {
      '"': '\\"',
      '<': '\\u003c',
      '\u2028': '\\u2029',
      '\u2029': '\\u2029'
    }
  };

  var escapeReplacers = {
    html: createEscapeReplacer('html'),
    js: createEscapeReplacer('js'),
    json: createEscapeReplacer('json'),
  };

  function createEscapeReplacer(type) {
    var replacements = escapeReplacements[type];
    return function(match) {
      return replacements[match];
    };
  }

  function createEscaper(type) {
    var testRegex = escapeTests[type];
    var replaceRegex = escapeReplaceRegex[type];
    var replacer = escapeReplacers[type];

    var escaper = function(value) {
      if (_thenable(value)) {
        return value.then(function(v) {
          return escaper(v);
        });
      }

      if (!testRegex.test(value)) {
        return value;
      }
      return value.replace(replaceRegex, replacer);
    };

    return escaper;
  }

  var Runtime = {
    escapeHtml: createEscaper('html'),
    escapeJs: createEscaper('js'),
    escapeJson: createEscaper('json'),

    get: function(obj, key) {
      if (!key) {
        return obj;
      }

      return obj[key];
    },

    not: function(l) {
      return !(l);
    },

    eq: function(l, r) {
      return (l) === (r);
    },

    neq: function(l, r) {
      return (l) !== (r);
    },

    lt: function(l, r) {
      return (l) < (r);
    },

    gt: function(l, r) {
      return (l) > (r);
    },

    lte: function(l, r) {
      return (l) <= (r);
    },

    gte: function(l, r) {
      return (l) >= (r);
    },

    cmpand: function(l, r) {
      return (l) && (r);
    },

    cmpor: function(l, r) {
      return (l) || (r);
    },

    add: function(l, r) {
      return (l) + (r);
    },

    sub: function(l, r) {
      return (l) - (r);
    },

    mul: function(l, r) {
      return (l) * (r);
    },

    div: function(l, r) {
      return (l) / (r);
    },

    mod: function(l, r) {
      return (l) % (r);
    },

    each: function(arr, then, elsethen) {
      var value = (arr);
      if (_thenable(value)) {
        return value.then(function(a) {
          return Runtime.each(a, then, elsethen);
        });
      }

      var totalLen = 0;
      if (value && (totalLen = value.length)) {
        if (then) {
          var chunk = new Chunk();
          var i = 0;
          for (; i < totalLen; i++) {
            if (typeof then === 'function') {
              chunk.w(then(value[i], i));
            } else {
              chunk.w(then);
            }
          }
          return chunk.getOutput();
        }
      } else {
        if (elsethen) {
          return _resolve(elsethen);
        }
      }
      return '';
    },

    if: function(cond, then, elsethen) {
      var value = (cond);
      if (_thenable(value)) {
        return value.then(function(c) {
          return Runtime.if(c, then, elsethen);
        });
      }

      if (value) {
        if (then) {
          return _resolve(then);
        }
      } else {
        if (elsethen) {
          return _resolve(elsethen);
        }
      }
      return '';
    },

    // using the same rules that DustJS uses here
    isEmpty: function(item) {
      var value = (item);

      if (value === 0) {
        return false;
      }
      if (Array.isArray(value) && !value.length) {
        return true;
      }
      return !value;
    },

    isNotEmpty: function(item) {
      return !Runtime.isEmpty(item);
    }
  };

  function Chunk() {
    this.current = '';
    this.stack = [];
    this.lastFlushedIndex = 0;
    this.thenables = [];
    this.isAsync = false;
    this.lastWasAsync = false;
  }
  Chunk.prototype.w = function w(item) {
    var towrite = (item);

    // don't do anything when it's null or undefined
    if (towrite == null) {
      return;
    }

    if (towrite instanceof Chunk) {
      towrite = towrite.getOutput();
    }

    if (_thenable(towrite)) {
      if (this.current.length) {
        this.stack.push(this.current);
        this.current = '';
      }

      this.isAsync = true;
      this.lastWasAsync = true;
      var slotIndex = this.stack.length;
      this.stack.push('');

      var _self = this;
      var promise = towrite.then(function(output) {
        _self.stack[slotIndex] = output;
      });
      this.thenables.push(promise);
      // TODO: flush out the current progress
    } else {
      if (this.lastWasAsync) {
        this.current = towrite;
      } else {
        this.current += towrite;
      }
      this.lastWasAsync = false;
    }
  };
  Chunk.prototype.getOutput = function() {
    var _self = this;

    if (_self.isAsync) {
      if (_self.current.length) {
        _self.stack.push(_self.current);
      }

      return Promise
        .all(_self.thenables)
        .then(function() {
          return _self.stack.join('');
        });
    } else {
      return _self.current;
    }
  };

  Runtime.Chunk = Chunk;

  return Runtime;
}));

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('lisplate.core', ['lisplate.runtime', 'lisplate.utils'], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory(require('./runtime'), require('./util'));
  } else {
    root.Lisplate = factory(root.Lisplate.Runtime, root.Lisplate.Utils);
  }
}(this, function(runtime, utils) {
  'use strict';

  var _thenable = utils.thenable;

  function _callbackify(fn) {
    return function() {
      var totalArgs = arguments.length;
      var callback = totalArgs ? arguments[totalArgs - 1] : null;
      var args = null;
      if (typeof callback === 'function') {
        args = Array.prototype.slice.call(arguments, 0, totalArgs - 1);
      } else {
        args = Array.prototype.slice.call(arguments, 0, totalArgs);
        callback = null;
      }

      var output = fn.apply(this, args);

      if (_thenable(output)) {
        if (!callback) {
          return output;
        }

        output.then(function(str) {
          callback(null, str);
        }).catch(function(err) {
          callback(err);
        });
      } else {
        if (callback) {
          callback(null, output);
          return undefined;
        }
        return output;
      }

      return undefined;
    };
  }

  function _promisifyPossibleAsync(fn) {
    var fnArgCount = fn.length;
    return function() {
      var args = Array.prototype.slice.apply(arguments);
      var argsLength = args.length;

      if (fnArgCount === argsLength + 1) {
        // if callback, promisify
        return new Promise(function(resolve, reject) {
          args.push(function(err, out) {
            if (err) {
              reject(err);
              return;
            }

            resolve(out);
          });

          fn.apply(null, args);
        });
      } else {
        // could be promise or sync
        return Promise.resolve(fn.apply(null, args));
      }
    };
  }

  function Lisplate(options) {
    if (!options) {
      options = {};
    }

    // cacheEnabled must be explicitly set to false to disable
    this.cacheEnabled = !(options.cacheEnabled === false);

    this.sourceLoader = options.sourceLoader;
    this.viewModelLoader = options.viewModelLoader;
    this.stringsLoader = options.stringsLoader;
    this.compilerOptions = options.compilerOptions;

    this.helpers = {};
    this.cache = {};
  }
  Lisplate.Runtime = runtime;
  Lisplate.Utils = utils;
  Lisplate.FactoryCache = {};

  Lisplate.prototype.addHelper = function addHelper(helperName, fn) {
    this.helpers[helperName] = fn;
  };

  Lisplate.prototype.loadTemplate = _callbackify(function loadTemplate(templateInfo) {
    var _self = this;

    if (!templateInfo) {
      return Promise.reject(new Error('Must specify template information to load'));
    }

    var templateName = typeof templateInfo === 'string' ? templateInfo : templateInfo.templateName;
    var renderFactory = templateInfo.renderFactory;

    if (templateName === '') {
      return Promise.reject(new Error('Must specify a valid template name to load'));
    }

    if (renderFactory) {
      renderFactory = Promise.resolve(renderFactory);
    } else if (_self.cacheEnabled && _self.cache[templateName]) {
      return Promise.resolve(_self.cache[templateName]);
    } else if (_self.cacheEnabled && Lisplate.FactoryCache[templateName]) {
      renderFactory = Promise.resolve(Lisplate.FactoryCache[templateName]);
    } else {
      if (!_self.sourceLoader) {
        return Promise.reject(new Error('Must define a sourceLoader'));
      }

      if (!Lisplate.Compiler || !Lisplate.Compiler.compile) {
        return Promise.reject('Compiler is not loaded to compile loaded source');
      }

      renderFactory = _promisifyPossibleAsync(_self
        .sourceLoader)(templateName)
        .then(function(src) {
          var compiled = null;
          var factory = null;

          try {
            compiled = Lisplate.Compiler.compile(templateName, src, _self.compilerOptions);
            factory = Lisplate.Utils.loadCompiledSource(compiled);
          } catch (e) {
            return Promise.reject(e);
          }

          return Promise.resolve(factory);
        });
    }

    return renderFactory.then(function(factory) {
      if (_self.cacheEnabled) {
        Lisplate.FactoryCache[templateName] = factory;
      }

      var promise = null;
      if (_self.viewModelLoader) {
        promise = _promisifyPossibleAsync(_self.viewModelLoader)(templateName);
      } else {
        promise = Promise.resolve(null);
      }

      return promise.then(function(viewModelClass) {
        var fn = factory(_self, viewModelClass);
        fn.templateName = templateName;

        if (_self.cacheEnabled) {
          _self.cache[templateName] = fn;
        }
        return fn;
      });
    });
  });

  Lisplate.prototype.render = _callbackify(function render(template, data, renderContext) {
    var _self = this;
    if (_self.stringsLoader) {
      return _promisifyPossibleAsync(_self
        .stringsLoader)(template.templateName, renderContext)
        .then(function(strings) {
          return template(data, strings, Lisplate.Runtime, renderContext);
        });
    } else {
      // done this way for non-async optimization
      return template(data, null, Lisplate.Runtime, renderContext);
    }
  });

  Lisplate.prototype.renderTemplate = _callbackify(function renderTemplate(templateName, data, renderContext) {
    var _self = this;

    return _self.loadTemplate(templateName).then(function(template) {
      return _self.render(template, data, renderContext);
    });
  });

  return Lisplate;
}));

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('lisplate.parser', ['lisplate.core'], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory(require('./'));
  } else {
    factory(root.Lisplate);
  }
}(this, function(Lisplate) {
  var parser = (function() {
  "use strict";

  /*
   * Generated by PEG.js 0.9.0.
   *
   * http://pegjs.org/
   */

  function peg$subclass(child, parent) {
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }

  function peg$SyntaxError(message, expected, found, location) {
    this.message  = message;
    this.expected = expected;
    this.found    = found;
    this.location = location;
    this.name     = "SyntaxError";

    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, peg$SyntaxError);
    }
  }

  peg$subclass(peg$SyntaxError, Error);

  function peg$parse(input) {
    var options = arguments.length > 1 ? arguments[1] : {},
        parser  = this,

        peg$FAILED = {},

        peg$startRuleFunctions = { start: peg$parsestart },
        peg$startRuleFunction  = peg$parsestart,

        peg$c0 = function(t) { return t; },
        peg$c1 = function(s) { return withPosition(['block', s]); },
        peg$c2 = "\n",
        peg$c3 = { type: "literal", value: "\n", description: "\"\\n\"" },
        peg$c4 = "\r\n",
        peg$c5 = { type: "literal", value: "\r\n", description: "\"\\r\\n\"" },
        peg$c6 = "\r",
        peg$c7 = { type: "literal", value: "\r", description: "\"\\r\"" },
        peg$c8 = "\u2028",
        peg$c9 = { type: "literal", value: "\u2028", description: "\"\\u2028\"" },
        peg$c10 = "\u2029",
        peg$c11 = { type: "literal", value: "\u2029", description: "\"\\u2029\"" },
        peg$c12 = /^[\t\x0B\f \xA0\uFEFF]/,
        peg$c13 = { type: "class", value: "[\\t\\v\\f \\u00A0\\uFEFF]", description: "[\\t\\v\\f \\u00A0\\uFEFF]" },
        peg$c14 = "{",
        peg$c15 = { type: "literal", value: "{", description: "\"{\"" },
        peg$c16 = "}",
        peg$c17 = { type: "literal", value: "}", description: "\"}\"" },
        peg$c18 = "(",
        peg$c19 = { type: "literal", value: "(", description: "\"(\"" },
        peg$c20 = ")",
        peg$c21 = { type: "literal", value: ")", description: "\")\"" },
        peg$c22 = "\"",
        peg$c23 = { type: "literal", value: "\"", description: "\"\\\"\"" },
        peg$c24 = { type: "any", description: "any character" },
        peg$c25 = function(c) {return c},
        peg$c26 = function(s) { return '"' + s.join('') + '"'; },
        peg$c27 = function(n) { return n; },
        peg$c28 = ".",
        peg$c29 = { type: "literal", value: ".", description: "\".\"" },
        peg$c30 = function(l, r) { return parseFloat(l + "." + r); },
        peg$c31 = /^[0-9]/,
        peg$c32 = { type: "class", value: "[0-9]", description: "[0-9]" },
        peg$c33 = function(digits) { return makeInteger(digits); },
        peg$c34 = "-",
        peg$c35 = { type: "literal", value: "-", description: "\"-\"" },
        peg$c36 = function(n) { return n * -1; },
        peg$c37 = "true",
        peg$c38 = { type: "literal", value: "true", description: "\"true\"" },
        peg$c39 = function() { return true; },
        peg$c40 = "false",
        peg$c41 = { type: "literal", value: "false", description: "\"false\"" },
        peg$c42 = function() { return false; },
        peg$c43 = function(l) { return withPosition(['literal', [l]]); },
        peg$c44 = /^[a-zA-Z$_]/,
        peg$c45 = { type: "class", value: "[a-zA-Z$_]", description: "[a-zA-Z$_]" },
        peg$c46 = /^[a-zA-Z0-9$_]/,
        peg$c47 = { type: "class", value: "[a-zA-Z0-9$_]", description: "[a-zA-Z0-9$_]" },
        peg$c48 = function(s, c) { return s + c.join(''); },
        peg$c49 = function(f, p) { return p; },
        peg$c50 = function(f, r) { return r ? [f].concat(r).join('.') : f; },
        peg$c51 = /^[a-zA-Z]/,
        peg$c52 = { type: "class", value: "[a-zA-Z]", description: "[a-zA-Z]" },
        peg$c53 = /^[a-zA-Z0-9_]/,
        peg$c54 = { type: "class", value: "[a-zA-Z0-9_]", description: "[a-zA-Z0-9_]" },
        peg$c55 = "::",
        peg$c56 = { type: "literal", value: "::", description: "\"::\"" },
        peg$c57 = function(c) { return withPosition(['identifier', [c, null]]); },
        peg$c58 = function(c, i) { return withPosition(['identifier', [c, i]]); },
        peg$c59 = function(i) { return withPosition(['identifier', ['', i]]); },
        peg$c60 = function(k) { return k; },
        peg$c61 = function(p) { return p; },
        peg$c62 = function(e) { return e; },
        peg$c63 = function(e, w) { return withPosition(["format", ['\\n' + w.join('')]]); },
        peg$c64 = function(b) { return withPosition(["buffer", [b.join('')]]); },
        peg$c65 = "rb",
        peg$c66 = { type: "literal", value: "rb", description: "\"rb\"" },
        peg$c67 = "lb",
        peg$c68 = { type: "literal", value: "lb", description: "\"lb\"" },
        peg$c69 = "s",
        peg$c70 = { type: "literal", value: "s", description: "\"s\"" },
        peg$c71 = "n",
        peg$c72 = { type: "literal", value: "n", description: "\"n\"" },
        peg$c73 = "r",
        peg$c74 = { type: "literal", value: "r", description: "\"r\"" },
        peg$c75 = "~",
        peg$c76 = { type: "literal", value: "~", description: "\"~\"" },
        peg$c77 = function(k) { return withPosition(['escape', [k]]); },
        peg$c78 = "*",
        peg$c79 = { type: "literal", value: "*", description: "\"*\"" },
        peg$c80 = "`",
        peg$c81 = { type: "literal", value: "`", description: "\"`\"" },
        peg$c82 = function(r) { return withPosition(['raw', [r.join('')]]); },
        peg$c83 = "fn",
        peg$c84 = { type: "literal", value: "fn", description: "\"fn\"" },
        peg$c85 = function(l) { return l; },
        peg$c86 = function(p, b) { return withPosition(['fn', [p, b]]); },
        peg$c87 = "|",
        peg$c88 = { type: "literal", value: "|", description: "\"|\"" },
        peg$c89 = function(c) { return c; },
        peg$c90 = function(c, etal) { return withPosition(['pipe', [c, etal]]); },
        peg$c91 = function(c, p) { return withPosition(['call', [c, p]]); },
        peg$c92 = ":",
        peg$c93 = { type: "literal", value: ":", description: "\":\"" },
        peg$c94 = function(k, v) { return withPosition([k, v]); },
        peg$c95 = function() { return withPosition(['map', []]); },
        peg$c96 = function(a) { return withPosition(['map', [a]]); },
        peg$c97 = function() { return ['array', []]; },
        peg$c98 = function(a) { return withPosition(['array', [a]]); },
        peg$c99 = function() { return withPosition(['empty', []]); },
        peg$c100 = "==",
        peg$c101 = { type: "literal", value: "==", description: "\"==\"" },
        peg$c102 = function() {return 'eq'; },
        peg$c103 = "!=",
        peg$c104 = { type: "literal", value: "!=", description: "\"!=\"" },
        peg$c105 = function() {return 'neq'; },
        peg$c106 = "<=",
        peg$c107 = { type: "literal", value: "<=", description: "\"<=\"" },
        peg$c108 = function() {return 'lte'; },
        peg$c109 = ">=",
        peg$c110 = { type: "literal", value: ">=", description: "\">=\"" },
        peg$c111 = function() {return 'gte'; },
        peg$c112 = "<",
        peg$c113 = { type: "literal", value: "<", description: "\"<\"" },
        peg$c114 = function() {return 'lt'; },
        peg$c115 = ">",
        peg$c116 = { type: "literal", value: ">", description: "\">\"" },
        peg$c117 = function() {return 'gt'; },
        peg$c118 = "and",
        peg$c119 = { type: "literal", value: "and", description: "\"and\"" },
        peg$c120 = function() {return 'cmpand'; },
        peg$c121 = "or",
        peg$c122 = { type: "literal", value: "or", description: "\"or\"" },
        peg$c123 = function() {return 'cmpor'; },
        peg$c124 = "not",
        peg$c125 = { type: "literal", value: "not", description: "\"not\"" },
        peg$c126 = function() {return 'not';},
        peg$c127 = function(c) { return withPosition(['identifier', [null, c]]); },
        peg$c128 = "+",
        peg$c129 = { type: "literal", value: "+", description: "\"+\"" },
        peg$c130 = function() {return 'add'; },
        peg$c131 = function() {return 'sub'; },
        peg$c132 = function() {return 'mul'; },
        peg$c133 = "/",
        peg$c134 = { type: "literal", value: "/", description: "\"/\"" },
        peg$c135 = function() {return 'div'; },
        peg$c136 = "%",
        peg$c137 = { type: "literal", value: "%", description: "\"%\"" },
        peg$c138 = function() {return 'mod'; },

        peg$currPos          = 0,
        peg$savedPos         = 0,
        peg$posDetailsCache  = [{ line: 1, column: 1, seenCR: false }],
        peg$maxFailPos       = 0,
        peg$maxFailExpected  = [],
        peg$silentFails      = 0,

        peg$result;

    if ("startRule" in options) {
      if (!(options.startRule in peg$startRuleFunctions)) {
        throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
      }

      peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
    }

    function text() {
      return input.substring(peg$savedPos, peg$currPos);
    }

    function location() {
      return peg$computeLocation(peg$savedPos, peg$currPos);
    }

    function expected(description) {
      throw peg$buildException(
        null,
        [{ type: "other", description: description }],
        input.substring(peg$savedPos, peg$currPos),
        peg$computeLocation(peg$savedPos, peg$currPos)
      );
    }

    function error(message) {
      throw peg$buildException(
        message,
        null,
        input.substring(peg$savedPos, peg$currPos),
        peg$computeLocation(peg$savedPos, peg$currPos)
      );
    }

    function peg$computePosDetails(pos) {
      var details = peg$posDetailsCache[pos],
          p, ch;

      if (details) {
        return details;
      } else {
        p = pos - 1;
        while (!peg$posDetailsCache[p]) {
          p--;
        }

        details = peg$posDetailsCache[p];
        details = {
          line:   details.line,
          column: details.column,
          seenCR: details.seenCR
        };

        while (p < pos) {
          ch = input.charAt(p);
          if (ch === "\n") {
            if (!details.seenCR) { details.line++; }
            details.column = 1;
            details.seenCR = false;
          } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
            details.line++;
            details.column = 1;
            details.seenCR = true;
          } else {
            details.column++;
            details.seenCR = false;
          }

          p++;
        }

        peg$posDetailsCache[pos] = details;
        return details;
      }
    }

    function peg$computeLocation(startPos, endPos) {
      var startPosDetails = peg$computePosDetails(startPos),
          endPosDetails   = peg$computePosDetails(endPos);

      return {
        start: {
          offset: startPos,
          line:   startPosDetails.line,
          column: startPosDetails.column
        },
        end: {
          offset: endPos,
          line:   endPosDetails.line,
          column: endPosDetails.column
        }
      };
    }

    function peg$fail(expected) {
      if (peg$currPos < peg$maxFailPos) { return; }

      if (peg$currPos > peg$maxFailPos) {
        peg$maxFailPos = peg$currPos;
        peg$maxFailExpected = [];
      }

      peg$maxFailExpected.push(expected);
    }

    function peg$buildException(message, expected, found, location) {
      function cleanupExpected(expected) {
        var i = 1;

        expected.sort(function(a, b) {
          if (a.description < b.description) {
            return -1;
          } else if (a.description > b.description) {
            return 1;
          } else {
            return 0;
          }
        });

        while (i < expected.length) {
          if (expected[i - 1] === expected[i]) {
            expected.splice(i, 1);
          } else {
            i++;
          }
        }
      }

      function buildMessage(expected, found) {
        function stringEscape(s) {
          function hex(ch) { return ch.charCodeAt(0).toString(16).toUpperCase(); }

          return s
            .replace(/\\/g,   '\\\\')
            .replace(/"/g,    '\\"')
            .replace(/\x08/g, '\\b')
            .replace(/\t/g,   '\\t')
            .replace(/\n/g,   '\\n')
            .replace(/\f/g,   '\\f')
            .replace(/\r/g,   '\\r')
            .replace(/[\x00-\x07\x0B\x0E\x0F]/g, function(ch) { return '\\x0' + hex(ch); })
            .replace(/[\x10-\x1F\x80-\xFF]/g,    function(ch) { return '\\x'  + hex(ch); })
            .replace(/[\u0100-\u0FFF]/g,         function(ch) { return '\\u0' + hex(ch); })
            .replace(/[\u1000-\uFFFF]/g,         function(ch) { return '\\u'  + hex(ch); });
        }

        var expectedDescs = new Array(expected.length),
            expectedDesc, foundDesc, i;

        for (i = 0; i < expected.length; i++) {
          expectedDescs[i] = expected[i].description;
        }

        expectedDesc = expected.length > 1
          ? expectedDescs.slice(0, -1).join(", ")
              + " or "
              + expectedDescs[expected.length - 1]
          : expectedDescs[0];

        foundDesc = found ? "\"" + stringEscape(found) + "\"" : "end of input";

        return "Expected " + expectedDesc + " but " + foundDesc + " found.";
      }

      if (expected !== null) {
        cleanupExpected(expected);
      }

      return new peg$SyntaxError(
        message !== null ? message : buildMessage(expected, found),
        expected,
        found,
        location
      );
    }

    function peg$parsestart() {
      var s0;

      s0 = peg$parseblock();

      return s0;
    }

    function peg$parseblock() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = [];
      s2 = peg$currPos;
      s3 = [];
      s4 = peg$parseComment();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseComment();
      }
      if (s3 !== peg$FAILED) {
        s4 = peg$parseTag();
        if (s4 === peg$FAILED) {
          s4 = peg$parsebuffer();
        }
        if (s4 !== peg$FAILED) {
          peg$savedPos = s2;
          s3 = peg$c0(s4);
          s2 = s3;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = peg$currPos;
        s3 = [];
        s4 = peg$parseComment();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseComment();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseTag();
          if (s4 === peg$FAILED) {
            s4 = peg$parsebuffer();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s2;
            s3 = peg$c0(s4);
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseComment();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseComment();
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c1(s1);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseeol() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 10) {
        s0 = peg$c2;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c3); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c4) {
          s0 = peg$c4;
          peg$currPos += 2;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c5); }
        }
        if (s0 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 13) {
            s0 = peg$c6;
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c7); }
          }
          if (s0 === peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 8232) {
              s0 = peg$c8;
              peg$currPos++;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c9); }
            }
            if (s0 === peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 8233) {
                s0 = peg$c10;
                peg$currPos++;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c11); }
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parsews() {
      var s0;

      if (peg$c12.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c13); }
      }
      if (s0 === peg$FAILED) {
        s0 = peg$parseeol();
      }

      return s0;
    }

    function peg$parseopentag() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 123) {
        s0 = peg$c14;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c15); }
      }

      return s0;
    }

    function peg$parseclosetag() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 125) {
        s0 = peg$c16;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c17); }
      }

      return s0;
    }

    function peg$parseopenarray() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 40) {
        s0 = peg$c18;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c19); }
      }

      return s0;
    }

    function peg$parseclosearray() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 41) {
        s0 = peg$c20;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c21); }
      }

      return s0;
    }

    function peg$parsestring() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 34) {
        s1 = peg$c22;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c23); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$currPos;
        peg$silentFails++;
        if (input.charCodeAt(peg$currPos) === 34) {
          s5 = peg$c22;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c23); }
        }
        peg$silentFails--;
        if (s5 === peg$FAILED) {
          s4 = void 0;
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
        if (s4 !== peg$FAILED) {
          s5 = peg$currPos;
          peg$silentFails++;
          s6 = peg$parseeol();
          peg$silentFails--;
          if (s6 === peg$FAILED) {
            s5 = void 0;
          } else {
            peg$currPos = s5;
            s5 = peg$FAILED;
          }
          if (s5 !== peg$FAILED) {
            if (input.length > peg$currPos) {
              s6 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s6 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c24); }
            }
            if (s6 !== peg$FAILED) {
              peg$savedPos = s3;
              s4 = peg$c25(s6);
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$currPos;
          peg$silentFails++;
          if (input.charCodeAt(peg$currPos) === 34) {
            s5 = peg$c22;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c23); }
          }
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$currPos;
            peg$silentFails++;
            s6 = peg$parseeol();
            peg$silentFails--;
            if (s6 === peg$FAILED) {
              s5 = void 0;
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
            if (s5 !== peg$FAILED) {
              if (input.length > peg$currPos) {
                s6 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c24); }
              }
              if (s6 !== peg$FAILED) {
                peg$savedPos = s3;
                s4 = peg$c25(s6);
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 34) {
            s3 = peg$c22;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c23); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c26(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsenumber() {
      var s0, s1;

      s0 = peg$currPos;
      s1 = peg$parsefloat();
      if (s1 === peg$FAILED) {
        s1 = peg$parseinteger();
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c27(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsefloat() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parseinteger();
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s2 = peg$c28;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c29); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseunsigned_integer();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c30(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseunsigned_integer() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = [];
      if (peg$c31.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c32); }
      }
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          if (peg$c31.test(input.charAt(peg$currPos))) {
            s2 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c32); }
          }
        }
      } else {
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c33(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsesigned_integer() {
      var s0, s1, s2;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 45) {
        s1 = peg$c34;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c35); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseunsigned_integer();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c36(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseinteger() {
      var s0;

      s0 = peg$parsesigned_integer();
      if (s0 === peg$FAILED) {
        s0 = peg$parseunsigned_integer();
      }

      return s0;
    }

    function peg$parseboolean() {
      var s0, s1;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 4) === peg$c37) {
        s1 = peg$c37;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c38); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c39();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 5) === peg$c40) {
          s1 = peg$c40;
          peg$currPos += 5;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c41); }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c42();
        }
        s0 = s1;
      }

      return s0;
    }

    function peg$parseliteral() {
      var s0, s1;

      s0 = peg$currPos;
      s1 = peg$parsestring();
      if (s1 === peg$FAILED) {
        s1 = peg$parsenumber();
        if (s1 === peg$FAILED) {
          s1 = peg$parseboolean();
        }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c43(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsekeypart() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (peg$c44.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c45); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        if (peg$c46.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c47); }
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (peg$c46.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c47); }
          }
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c48(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsekey() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parsekeypart();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 46) {
          s4 = peg$c28;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c29); }
        }
        if (s4 !== peg$FAILED) {
          s5 = peg$parsekeypart();
          if (s5 !== peg$FAILED) {
            peg$savedPos = s3;
            s4 = peg$c49(s1, s5);
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 46) {
            s4 = peg$c28;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c29); }
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parsekeypart();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s3;
              s4 = peg$c49(s1, s5);
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c50(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsenamespace() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (peg$c51.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c52); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        if (peg$c53.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c54); }
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (peg$c53.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c54); }
          }
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c48(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsescopeoperator() {
      var s0;

      if (input.substr(peg$currPos, 2) === peg$c55) {
        s0 = peg$c55;
        peg$currPos += 2;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c56); }
      }

      return s0;
    }

    function peg$parseidentifier() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parsenamespace();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsescopeoperator();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s3 = peg$c28;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c29); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c57(s1);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parsenamespace();
        if (s1 !== peg$FAILED) {
          s2 = peg$parsescopeoperator();
          if (s2 !== peg$FAILED) {
            s3 = peg$parsekey();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c58(s1, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parsekey();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c59(s1);
          }
          s0 = s1;
        }
      }

      return s0;
    }

    function peg$parseparamlist() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$parseopenarray();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsefiller();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          s5 = peg$parsekey();
          if (s5 !== peg$FAILED) {
            s6 = peg$parsefiller();
            if (s6 !== peg$FAILED) {
              peg$savedPos = s4;
              s5 = peg$c60(s5);
              s4 = s5;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            s5 = peg$parsekey();
            if (s5 !== peg$FAILED) {
              s6 = peg$parsefiller();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s4;
                s5 = peg$c60(s5);
                s4 = s5;
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsefiller();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseclosearray();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c61(s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseparamset() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = [];
      s2 = peg$currPos;
      s3 = peg$parseexpression();
      if (s3 !== peg$FAILED) {
        s4 = peg$parsefiller();
        if (s4 !== peg$FAILED) {
          peg$savedPos = s2;
          s3 = peg$c62(s3);
          s2 = s3;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = peg$currPos;
        s3 = peg$parseexpression();
        if (s3 !== peg$FAILED) {
          s4 = peg$parsefiller();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s2;
            s3 = peg$c62(s3);
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c61(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsebuffer() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      s1 = peg$parseeol();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parsews();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parsews();
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c63(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$currPos;
        s3 = peg$currPos;
        peg$silentFails++;
        s4 = peg$parseComment();
        peg$silentFails--;
        if (s4 === peg$FAILED) {
          s3 = void 0;
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$currPos;
          peg$silentFails++;
          s5 = peg$parseopentag();
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$currPos;
            peg$silentFails++;
            s6 = peg$parseclosetag();
            peg$silentFails--;
            if (s6 === peg$FAILED) {
              s5 = void 0;
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$currPos;
              peg$silentFails++;
              s7 = peg$parseeol();
              peg$silentFails--;
              if (s7 === peg$FAILED) {
                s6 = void 0;
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
              if (s6 !== peg$FAILED) {
                if (input.length > peg$currPos) {
                  s7 = input.charAt(peg$currPos);
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c24); }
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s2;
                  s3 = peg$c25(s7);
                  s2 = s3;
                } else {
                  peg$currPos = s2;
                  s2 = peg$FAILED;
                }
              } else {
                peg$currPos = s2;
                s2 = peg$FAILED;
              }
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            s2 = peg$currPos;
            s3 = peg$currPos;
            peg$silentFails++;
            s4 = peg$parseComment();
            peg$silentFails--;
            if (s4 === peg$FAILED) {
              s3 = void 0;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$currPos;
              peg$silentFails++;
              s5 = peg$parseopentag();
              peg$silentFails--;
              if (s5 === peg$FAILED) {
                s4 = void 0;
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
              if (s4 !== peg$FAILED) {
                s5 = peg$currPos;
                peg$silentFails++;
                s6 = peg$parseclosetag();
                peg$silentFails--;
                if (s6 === peg$FAILED) {
                  s5 = void 0;
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
                if (s5 !== peg$FAILED) {
                  s6 = peg$currPos;
                  peg$silentFails++;
                  s7 = peg$parseeol();
                  peg$silentFails--;
                  if (s7 === peg$FAILED) {
                    s6 = void 0;
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                  if (s6 !== peg$FAILED) {
                    if (input.length > peg$currPos) {
                      s7 = input.charAt(peg$currPos);
                      peg$currPos++;
                    } else {
                      s7 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c24); }
                    }
                    if (s7 !== peg$FAILED) {
                      peg$savedPos = s2;
                      s3 = peg$c25(s7);
                      s2 = s3;
                    } else {
                      peg$currPos = s2;
                      s2 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s2;
                    s2 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s2;
                  s2 = peg$FAILED;
                }
              } else {
                peg$currPos = s2;
                s2 = peg$FAILED;
              }
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          }
        } else {
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c64(s1);
        }
        s0 = s1;
      }

      return s0;
    }

    function peg$parseescapekeys() {
      var s0;

      if (input.substr(peg$currPos, 2) === peg$c65) {
        s0 = peg$c65;
        peg$currPos += 2;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c66); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c67) {
          s0 = peg$c67;
          peg$currPos += 2;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c68); }
        }
        if (s0 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 115) {
            s0 = peg$c69;
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c70); }
          }
          if (s0 === peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 110) {
              s0 = peg$c71;
              peg$currPos++;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c72); }
            }
            if (s0 === peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 114) {
                s0 = peg$c73;
                peg$currPos++;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c74); }
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parseescapes() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = peg$parseopentag();
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 126) {
          s2 = peg$c75;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c76); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseescapekeys();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseclosetag();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c77(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsecommentopen() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = peg$parseopentag();
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 42) {
          s2 = peg$c78;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c79); }
        }
        if (s2 !== peg$FAILED) {
          s1 = [s1, s2];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsecommentclose() {
      var s0, s1, s2;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 42) {
        s1 = peg$c78;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c79); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseclosetag();
        if (s2 !== peg$FAILED) {
          s1 = [s1, s2];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseComment() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parsecommentopen();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$currPos;
        peg$silentFails++;
        s5 = peg$parsecommentclose();
        peg$silentFails--;
        if (s5 === peg$FAILED) {
          s4 = void 0;
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
        if (s4 !== peg$FAILED) {
          if (input.length > peg$currPos) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c24); }
          }
          if (s5 !== peg$FAILED) {
            s4 = [s4, s5];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$currPos;
          peg$silentFails++;
          s5 = peg$parsecommentclose();
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            if (input.length > peg$currPos) {
              s5 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c24); }
            }
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsecommentclose();
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsefiller() {
      var s0, s1;

      s0 = [];
      s1 = peg$parsews();
      if (s1 === peg$FAILED) {
        s1 = peg$parseComment();
      }
      while (s1 !== peg$FAILED) {
        s0.push(s1);
        s1 = peg$parsews();
        if (s1 === peg$FAILED) {
          s1 = peg$parseComment();
        }
      }

      return s0;
    }

    function peg$parserawopen() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = peg$parseopentag();
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 96) {
          s2 = peg$c80;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c81); }
        }
        if (s2 !== peg$FAILED) {
          s1 = [s1, s2];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parserawclose() {
      var s0, s1, s2;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 96) {
        s1 = peg$c80;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c81); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseclosetag();
        if (s2 !== peg$FAILED) {
          s1 = [s1, s2];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseRaw() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parserawopen();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$currPos;
        peg$silentFails++;
        s5 = peg$parserawclose();
        peg$silentFails--;
        if (s5 === peg$FAILED) {
          s4 = void 0;
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
        if (s4 !== peg$FAILED) {
          if (input.length > peg$currPos) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c24); }
          }
          if (s5 !== peg$FAILED) {
            peg$savedPos = s3;
            s4 = peg$c25(s5);
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$currPos;
          peg$silentFails++;
          s5 = peg$parserawclose();
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            if (input.length > peg$currPos) {
              s5 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c24); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s3;
              s4 = peg$c25(s5);
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parserawclose();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c82(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseFnCreate() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parseopentag();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsefiller();
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c83) {
            s3 = peg$c83;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c84); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsefiller();
            if (s4 !== peg$FAILED) {
              s5 = peg$currPos;
              s6 = peg$parseparamlist();
              if (s6 !== peg$FAILED) {
                s7 = peg$parsefiller();
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s5;
                  s6 = peg$c85(s6);
                  s5 = s6;
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
              if (s5 === peg$FAILED) {
                s5 = null;
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parseblock();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parsefiller();
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parseclosetag();
                    if (s8 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c86(s5, s6);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsepipesymbol() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 124) {
        s0 = peg$c87;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c88); }
      }

      return s0;
    }

    function peg$parsePipe() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parseopentag();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsefiller();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsepipestart();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsefiller();
            if (s4 !== peg$FAILED) {
              s5 = [];
              s6 = peg$currPos;
              s7 = peg$parsepipesymbol();
              if (s7 !== peg$FAILED) {
                s8 = peg$parsepipecontinue();
                if (s8 !== peg$FAILED) {
                  peg$savedPos = s6;
                  s7 = peg$c89(s8);
                  s6 = s7;
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
              if (s6 !== peg$FAILED) {
                while (s6 !== peg$FAILED) {
                  s5.push(s6);
                  s6 = peg$currPos;
                  s7 = peg$parsepipesymbol();
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parsepipecontinue();
                    if (s8 !== peg$FAILED) {
                      peg$savedPos = s6;
                      s7 = peg$c89(s8);
                      s6 = s7;
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                }
              } else {
                s5 = peg$FAILED;
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parsefiller();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseclosetag();
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c90(s3, s5);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseCall() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      s1 = peg$parseopentag();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsefiller();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsecallable();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsefiller();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseparamset();
              if (s5 !== peg$FAILED) {
                s6 = peg$parsefiller();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseclosetag();
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c91(s3, s5);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseassociativeitem() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 58) {
        s1 = peg$c92;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c93); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsekey();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsefiller();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseexpression();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c94(s2, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseMap() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$parseopenarray();
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 58) {
          s2 = peg$c92;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c93); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseclosearray();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c95();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseopenarray();
        if (s1 !== peg$FAILED) {
          s2 = peg$parsefiller();
          if (s2 !== peg$FAILED) {
            s3 = [];
            s4 = peg$currPos;
            s5 = peg$parseassociativeitem();
            if (s5 !== peg$FAILED) {
              s6 = peg$parsefiller();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s4;
                s5 = peg$c62(s5);
                s4 = s5;
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              while (s4 !== peg$FAILED) {
                s3.push(s4);
                s4 = peg$currPos;
                s5 = peg$parseassociativeitem();
                if (s5 !== peg$FAILED) {
                  s6 = peg$parsefiller();
                  if (s6 !== peg$FAILED) {
                    peg$savedPos = s4;
                    s5 = peg$c62(s5);
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              }
            } else {
              s3 = peg$FAILED;
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parsefiller();
              if (s4 !== peg$FAILED) {
                s5 = peg$parseclosearray();
                if (s5 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c96(s3);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }

      return s0;
    }

    function peg$parseArray() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$parseopenarray();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseclosearray();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c97();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseopenarray();
        if (s1 !== peg$FAILED) {
          s2 = peg$parsefiller();
          if (s2 !== peg$FAILED) {
            s3 = [];
            s4 = peg$currPos;
            s5 = peg$parseexpression();
            if (s5 !== peg$FAILED) {
              s6 = peg$parsefiller();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s4;
                s5 = peg$c62(s5);
                s4 = s5;
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              while (s4 !== peg$FAILED) {
                s3.push(s4);
                s4 = peg$currPos;
                s5 = peg$parseexpression();
                if (s5 !== peg$FAILED) {
                  s6 = peg$parsefiller();
                  if (s6 !== peg$FAILED) {
                    peg$savedPos = s4;
                    s5 = peg$c62(s5);
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              }
            } else {
              s3 = peg$FAILED;
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parsefiller();
              if (s4 !== peg$FAILED) {
                s5 = peg$parseclosearray();
                if (s5 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c98(s3);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }

      return s0;
    }

    function peg$parseEmpty() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = peg$parseopentag();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseclosetag();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c99();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseTag() {
      var s0;

      s0 = peg$parseFnCreate();
      if (s0 === peg$FAILED) {
        s0 = peg$parsePipe();
        if (s0 === peg$FAILED) {
          s0 = peg$parseCall();
          if (s0 === peg$FAILED) {
            s0 = peg$parseRaw();
            if (s0 === peg$FAILED) {
              s0 = peg$parseescapes();
              if (s0 === peg$FAILED) {
                s0 = peg$parseEmpty();
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parseexpression() {
      var s0;

      s0 = peg$parseTag();
      if (s0 === peg$FAILED) {
        s0 = peg$parseliteral();
        if (s0 === peg$FAILED) {
          s0 = peg$parseMap();
          if (s0 === peg$FAILED) {
            s0 = peg$parseArray();
            if (s0 === peg$FAILED) {
              s0 = peg$parseidentifier();
            }
          }
        }
      }

      return s0;
    }

    function peg$parsecomparators() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c100) {
        s2 = peg$c100;
        peg$currPos += 2;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c101); }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s1;
        s2 = peg$c102();
      }
      s1 = s2;
      if (s1 === peg$FAILED) {
        s1 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c103) {
          s2 = peg$c103;
          peg$currPos += 2;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c104); }
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s1;
          s2 = peg$c105();
        }
        s1 = s2;
        if (s1 === peg$FAILED) {
          s1 = peg$currPos;
          if (input.substr(peg$currPos, 2) === peg$c106) {
            s2 = peg$c106;
            peg$currPos += 2;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c107); }
          }
          if (s2 !== peg$FAILED) {
            peg$savedPos = s1;
            s2 = peg$c108();
          }
          s1 = s2;
          if (s1 === peg$FAILED) {
            s1 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c109) {
              s2 = peg$c109;
              peg$currPos += 2;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c110); }
            }
            if (s2 !== peg$FAILED) {
              peg$savedPos = s1;
              s2 = peg$c111();
            }
            s1 = s2;
            if (s1 === peg$FAILED) {
              s1 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 60) {
                s2 = peg$c112;
                peg$currPos++;
              } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c113); }
              }
              if (s2 !== peg$FAILED) {
                peg$savedPos = s1;
                s2 = peg$c114();
              }
              s1 = s2;
              if (s1 === peg$FAILED) {
                s1 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 62) {
                  s2 = peg$c115;
                  peg$currPos++;
                } else {
                  s2 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c116); }
                }
                if (s2 !== peg$FAILED) {
                  peg$savedPos = s1;
                  s2 = peg$c117();
                }
                s1 = s2;
                if (s1 === peg$FAILED) {
                  s1 = peg$currPos;
                  if (input.substr(peg$currPos, 3) === peg$c118) {
                    s2 = peg$c118;
                    peg$currPos += 3;
                  } else {
                    s2 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c119); }
                  }
                  if (s2 !== peg$FAILED) {
                    peg$savedPos = s1;
                    s2 = peg$c120();
                  }
                  s1 = s2;
                  if (s1 === peg$FAILED) {
                    s1 = peg$currPos;
                    if (input.substr(peg$currPos, 2) === peg$c121) {
                      s2 = peg$c121;
                      peg$currPos += 2;
                    } else {
                      s2 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c122); }
                    }
                    if (s2 !== peg$FAILED) {
                      peg$savedPos = s1;
                      s2 = peg$c123();
                    }
                    s1 = s2;
                    if (s1 === peg$FAILED) {
                      s1 = peg$currPos;
                      if (input.substr(peg$currPos, 3) === peg$c124) {
                        s2 = peg$c124;
                        peg$currPos += 3;
                      } else {
                        s2 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c125); }
                      }
                      if (s2 !== peg$FAILED) {
                        peg$savedPos = s1;
                        s2 = peg$c126();
                      }
                      s1 = s2;
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c127(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsemathators() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 43) {
        s2 = peg$c128;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c129); }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s1;
        s2 = peg$c130();
      }
      s1 = s2;
      if (s1 === peg$FAILED) {
        s1 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 45) {
          s2 = peg$c34;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c35); }
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s1;
          s2 = peg$c131();
        }
        s1 = s2;
        if (s1 === peg$FAILED) {
          s1 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 42) {
            s2 = peg$c78;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c79); }
          }
          if (s2 !== peg$FAILED) {
            peg$savedPos = s1;
            s2 = peg$c132();
          }
          s1 = s2;
          if (s1 === peg$FAILED) {
            s1 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 47) {
              s2 = peg$c133;
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c134); }
            }
            if (s2 !== peg$FAILED) {
              peg$savedPos = s1;
              s2 = peg$c135();
            }
            s1 = s2;
            if (s1 === peg$FAILED) {
              s1 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 37) {
                s2 = peg$c136;
                peg$currPos++;
              } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c137); }
              }
              if (s2 !== peg$FAILED) {
                peg$savedPos = s1;
                s2 = peg$c138();
              }
              s1 = s2;
            }
          }
        }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c127(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsecallable() {
      var s0;

      s0 = peg$parseFnCreate();
      if (s0 === peg$FAILED) {
        s0 = peg$parsecomparators();
        if (s0 === peg$FAILED) {
          s0 = peg$parsemathators();
          if (s0 === peg$FAILED) {
            s0 = peg$parseidentifier();
          }
        }
      }

      return s0;
    }

    function peg$parsepipestart() {
      var s0;

      s0 = peg$parseFnCreate();
      if (s0 === peg$FAILED) {
        s0 = peg$parseMap();
        if (s0 === peg$FAILED) {
          s0 = peg$parseArray();
          if (s0 === peg$FAILED) {
            s0 = peg$parseliteral();
            if (s0 === peg$FAILED) {
              s0 = peg$parseidentifier();
            }
          }
        }
      }

      return s0;
    }

    function peg$parsepipecontinue() {
      var s0;

      s0 = peg$parseFnCreate();
      if (s0 === peg$FAILED) {
        s0 = peg$parseidentifier();
      }

      return s0;
    }


      function makeInteger(arr) {
        return parseInt(arr.join(''), 10);
      }
      function withPosition(arr) {
        var loc = location().start;
        return arr.concat([loc.line, loc.column]);
      }


    peg$result = peg$startRuleFunction();

    if (peg$result !== peg$FAILED && peg$currPos === input.length) {
      return peg$result;
    } else {
      if (peg$result !== peg$FAILED && peg$currPos < input.length) {
        peg$fail({ type: "end", description: "end of input" });
      }

      throw peg$buildException(
        null,
        peg$maxFailExpected,
        peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
        peg$maxFailPos < input.length
          ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
          : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
      );
    }
  }

  return {
    SyntaxError: peg$SyntaxError,
    parse:       peg$parse
  };
})();

  Lisplate.Parser = parser;
  return parser;
}));

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('lisplate.compiler', ['lisplate.core', 'lisplate.parser'], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory(require('./'), require('./parser'));
  } else {
    factory(root.Lisplate, root.Lisplate.Parser);
  }
}(this, function(Lisplate, parser) {
  'use strict';

  var pegSyntaxError = parser.SyntaxError;

  // some callables are re-mapped internally, such as include
  var internalCallRemap = {
    include: 'processinclude'
  };

  var compilerCalls = {
    def: 'processdef',
    safe: 'processsafe',
    pragma: 'processpragma'
  };

  var compilerPragmas = {
    keepWhitespace: 'setKeepWhitespace',
    defaultEscape: 'setDefaultEscape'
  };

  function Scope() {
    this.vars = [];
    this.defs = {};
  }
  Scope.prototype.addToScope = function(key, value) {
    if (this.vars.indexOf(key) !== -1) {
      return false;
    }

    this.vars.push(key);

    if (arguments.length === 2) {
      this.defs[key] = value;
    }

    return true;
  };
  Scope.prototype.findInScope = function(key) {
    return this.vars.indexOf(key);
  };

  function SymbolTable() {
    this.scopes = [];
  }
  SymbolTable.prototype.pushScope = function(keys) {
    var newScope = new Scope();
    if (keys && keys.length) {
      keys.forEach(function(k) {
        newScope.addToScope(k);
      });
    }
    this.scopes.push(newScope);
  };
  SymbolTable.prototype.popScope = function() {
    var scope = this.scopes.pop();
    return scope.defs;
  };
  SymbolTable.prototype.addDefToScope = function(key, value) {
    return this.scopes[this.scopes.length - 1].addToScope(key, value);
  };
  SymbolTable.prototype.findAddress = function(key) {
    for (var i = this.scopes.length; i--;) {
      var scope = this.scopes[i];
      var index = scope.findInScope(key);
      if (index !== -1) {
        return [i, index];
      }
    }

    // if not set, it's somewhere else
    return null;
  };

  function makeErrorWithParserArray(arr, message, expected, found) {
    var line = arr ? arr[2] : 0;
    var col = arr ? arr[3] : 0;
    return new pegSyntaxError(
      message,
      expected,
      found,
      {
        start: { offset: 0, line: line, column: col },
        end: { offset: 0, line: line, column: col }
      }
    );
  }

  function addCmdOut(cmd, str) {
    if (!str || !str.length) {
      return '';
    }
    return '$c.' + cmd + '(' + str + ')\n';
  }

  function Compiler(options) {
    this.internalsUsed = [];
    this.symbolTable = new SymbolTable();
    this.needLookup = [];

    this.setKeepWhitespace(options ? options.keepWhitespace : undefined);
    this.setDefaultEscape(options ? options.defaultEscape : undefined);
  }

  Compiler.prototype.setKeepWhitespace = function setKeepWhitespace(value) {
    this.keepWhitespace = value === true;
  };

  Compiler.prototype.setDefaultEscape = function setDefaultEscape(value) {
    var escapeIdentifier = value !== undefined ? value : 'escapeHtml';

    if (escapeIdentifier) {
      var parts = escapeIdentifier.split('::');
      if (parts.length === 1) {
        parts = ['', parts[0]];
      }

      this.defaultEscape = this.processidentifier(parts)[0];
    } else {
      this.defaultEscape = null;
    }
  };


  Compiler.prototype.processblock = function processblock(b, paramKeys, disableEscaper) {
    // could be format, buffer, null(comment), or expression
    var _self = this;

    var output = '';

    var bLen = b.length;
    var prevBuff = '';

    this.symbolTable.pushScope(paramKeys);

    b.forEach(function(e, indx) {
      var type = e[0];
      if (!type) {
        output += '';
      } else if (type === 'format' || type === 'buffer') {
        // do a look ahead
        prevBuff += type === 'format' && !_self.keepWhitespace ? '' : e[1];
        var nextIndex = indx + 1;
        if (!(nextIndex < bLen && (b[nextIndex][0] === 'format' || b[nextIndex][0] === 'buffer'))) {
          if (prevBuff.length) {
            output += addCmdOut('w', '"' + prevBuff.replace(/"/g, '\\"') + '"');
            prevBuff = '';
          }
        }
      } else {
        var expression = _self.processexp(e, disableEscaper);
        output += addCmdOut('w', expression);
      }
    });

    var defs = this.symbolTable.popScope();
    var defStr = '';
    for (var prop in defs) {
      defStr += 'var ' + prop + ' = ' + defs[prop] + ';\n';
    }

    return defStr + output;
  };

  Compiler.prototype.processexp = function processexp(e, disableEscaper) {
    var type = e[0];
    try {
      if (type === 'fn') {
        return this.processfn(e[1], disableEscaper);
      } else if (type === 'pipe') {
        return this.processpipe(e[1], disableEscaper);
      } else if (type === 'call') {
        return this.processcall(e[1], disableEscaper);
      } else if (type === 'raw') {
        return this.processraw(e[1]);
      } else if (type === 'escape') {
        return this.processescape(e[1]);
      } else if (type === 'identifier') {
        return this.processidentifier(e[1])[0];
      } else if (type === 'literal') {
        return this.processliteral(e[1]);
      } else if (type === 'map') {
        return this.processmap(e[1], disableEscaper);
      } else if (type === 'array') {
        return this.processarray(e[1], disableEscaper);
      } else if (type === 'empty') {
        return this.processempty();
      } else {
        throw makeErrorWithParserArray(
          null,
          'Expected to find an expression type but did not find one',
          'type',
          'null'
        );
      }
    } catch (err) {
      throw makeErrorWithParserArray(
        e,
        err.message,
        err.expected,
        err.found
      );
    }
  };

  Compiler.prototype.useinternal = function useinternal(i) {
    if (this.internalsUsed.indexOf(i) === -1) {
      this.internalsUsed.push(i);
    }
    return '$i_' + i;
  };

  Compiler.prototype.processidentifier = function processidentifier(v) {
    var ns = v[0];
    var identifierName = v[1];

    if (ns) {
      if (identifierName) {
        return ['$' + ns + '.' + identifierName, true];
      } else {
        return ['$' + ns, true];
      }
    }

    if (Lisplate.Runtime[identifierName]) {
      return [this.useinternal(identifierName), false];
    }

    var parts = identifierName.split('.');
    var nameRoot = parts[0];

    if (this.symbolTable.findAddress(nameRoot)) {
      return [identifierName, true];
    } else {
      if (this.needLookup.indexOf(nameRoot) === -1) {
        this.needLookup.push(nameRoot);
      }

      return ['$lu_' + identifierName, true];
    }
  };

  Compiler.prototype.processliteral = function processliteral(v) {
    return v[0];
  };

  Compiler.prototype.processmap = function processmap(v, disableEscaper) {
    var _self = this;

    var arr = v[0];
    var output = '{';
    if (arr && arr.length) {
      output += arr.map(function(e) {
        return e[0] + ':' + _self.processexp(e[1], disableEscaper);
      }).join(',');
    }
    output += '}';

    return output;
  };

  Compiler.prototype.processarray = function processarray(v, disableEscaper) {
    var _self = this;

    var arr = v[0];
    var output = '[';
    if (arr && arr.length) {
      output += arr.map(function(e) {
        return _self.processexp(e, disableEscaper);
      }).join(',');
    }
    output += ']';

    return output;
  };

  Compiler.prototype.processempty = function processempty() {
    return 'null';
  };

  Compiler.prototype.processfn = function processfn(v, disableEscaper) {
    var params = v[0];
    var block = v[1];

    var output = '(function(';
    if (params && params.length) {
      output += params.map(function(p) {
        return p;
      }).join(',');
    }

    output += ') {\nvar $c = new $_w();\n';

    if (!block || block[0] !== 'block' || !block[1]) {
      throw makeErrorWithParserArray(
        null,
        'Expected function to contain a block',
        'block',
        block ? block[0] : 'null'
      );
    }

    output += this.processblock(block[1], params, disableEscaper);

    output += '\n return $c;\n})\n';
    return output;
  };

  Compiler.prototype.processinclude = function processinclude(params) {
    if (!params || params.length < 1 || params.length > 2) {
      throw makeErrorWithParserArray(
        null,
        'Include must be called with 1 or 2 parameters: template-name and optional data',
        '1 or 2 parameters, template-name and optional data',
        (params ? params.length : 0)
      );
    }

    params = params.slice();

    if (params.length === 1) {
      params.push(['empty']);
    }
    params.push(['identifier', ['ctx', null]]);

    return ['$$Lisplate.renderTemplate', params, false];
  };

  Compiler.prototype.processdef = function processdef(params, disableEscaper) {
    if (!params || params.length !== 2) {
      throw makeErrorWithParserArray(
        null,
        'def must be called with 2 parameters, the identifier to define and a value to bind to',
        '2 parameters, identifier to define and value to use for binding',
        (params ? params.length : 0)
      );
    }

    var keyParam = params[0];
    if (keyParam[0] !== 'identifier') {
      throw makeErrorWithParserArray(
        null,
        'def first parameter must be an identifier to create and bind value to',
        'identifier',
        keyParam[0]
      );
    }
    if (keyParam[1][0] !== '') {
      throw makeErrorWithParserArray(
        null,
        'def first parameter must not be namespaced, cannot bind value to namespaced identifiers',
        'non-namespaced identifier',
        keyParam[1][0] + '::' + keyParam[1][1]
      );
    }

    var key = keyParam[1][1];
    var value = this.processexp(params[1], disableEscaper);

    if (!this.symbolTable.addDefToScope(key, value)) {
      throw makeErrorWithParserArray(
        null,
        'identifier is already defined in the scope and cannot be redefined in the same scope',
        'unused identifier or different scope for identifier',
        key
      );
    }
    return '';
  };

  Compiler.prototype.processsafe = function processsafe(params) {
    if (!params || params.length !== 1) {
      throw makeErrorWithParserArray(
        null,
        'safe must be called with 1 parameter',
        '1 parameter that will not be escaped',
        (params ? params.length : 0)
      );
    }

    return this.processexp(params[0], true);
  };

  Compiler.prototype.processpragma = function processpragma(params) {
    if (!params || params.length !== 2) {
      throw makeErrorWithParserArray(
        null,
        'pragma must be called with 2 parameters',
        '2 parameters, identifier to options and literal',
        (params ? params.length : 0)
      );
    }

    var keyParam = params[0];
    var valueParam = params[1];

    if (keyParam[0] !== 'identifier') {
      throw makeErrorWithParserArray(
        null,
        'pragma first parameter must be a key for the option to set',
        'identifier',
        keyParam[0]
      );
    }

    if (keyParam[1][0] !== '') {
      throw makeErrorWithParserArray(
        null,
        'pragma first parameter must not be namespaced, no options are behind a namespaced',
        'non-namespaced identifier',
        keyParam[1][0] + '::' + keyParam[1][1]
      );
    }

    if (valueParam[0] !== 'literal') {
      throw makeErrorWithParserArray(
        null,
        'pragma second parameter must be a literal to st the option to',
        'literal',
        valueParam[0]
      );
    }

    var key = keyParam[1][1];
    var value = valueParam[1][0];

    if (value[0] === '"' && value[value.length - 1] === '"') {
      value = value.substring(1, value.length - 1);
    }

    var setter = compilerPragmas[key];

    if (!setter) {
      throw makeErrorWithParserArray(
        null,
        'invalid pragma',
        'valid pragma: ' + Object.keys(compilerPragmas).join(', '),
        key
      );
    }

    this[setter](value);

    return '';
  };

  Compiler.prototype.processpipe = function processpipe(v, disableEscaper) {
    // thing|fn3|fn2|fn1
    // in AST form:
    // v = [thing, [fn3, fn2, fn1]]
    // translates to
    // fn1(fn2(fn3(thing)))
    var _self = this;

    var needsProtection = false;
    var lhs = v[0];
    var pipes = v[1];

    function determinePipeable(pipeable) {
      var type = pipeable[0];
      if (type === 'fn') {
        return _self.processfn(pipeable[1], disableEscaper);
      } else if (type === 'identifier') {
        var ret = _self.processidentifier(pipeable[1]);
        needsProtection = needsProtection || ret[1];
        return ret[0];
      } else {
        throw makeErrorWithParserArray(
          null,
          'Unknown callable',
          'fn or identifier',
          type
        );
      }
    }

    var output = null;
    if (lhs[0] === 'literal') {
      output = this.processliteral(lhs[1]);
    } else if (lhs[0] === 'map') {
      output = this.processmap(lhs[1], disableEscaper);
    } else if (lhs[0] === 'array') {
      output = this.processarray(lhs[1], disableEscaper);
    } else {
      var pipestart = determinePipeable(lhs);
      output = '(typeof ' + pipestart + ' === \'function\' ? ' + pipestart + '() : ' + pipestart + ')';
    }

    while (pipes.length) {
      var fn = pipes.shift();
      var callable = determinePipeable(fn);
      output = callable + '(' + output + ')';
    }

    return output;
  };

  Compiler.prototype.processcall = function processcall(v, disableEscaper) {
    var _self = this;

    var needsProtection = true;
    var shouldDisableEscape = disableEscaper;

    var callable = null;
    var lhs = v[0];
    var params = v[1];

    var type = lhs[0];

    if (type === 'fn') {
      needsProtection = false;
      callable = _self.processfn(lhs[1], disableEscaper);
    } else if (type === 'identifier') {
      if (lhs[1][0] === '') {
        callable = lhs[1][1];

        if (internalCallRemap[callable]) {
          var remap = this[internalCallRemap[callable]](params, disableEscaper);
          callable = remap[0];
          params = remap[1];
          needsProtection = remap[2];
        } else if (compilerCalls[callable]) {
          return this[compilerCalls[callable]](params, disableEscaper);
        } else {
          callable = null;
        }
      }

      if (!callable) {
        var ret = _self.processidentifier(lhs[1]);
        callable = ret[0];
        needsProtection = ret[1];
      }
    } else {
      throw makeErrorWithParserArray(
        null,
        'Unknown callable',
        'fn, identifier, or internal',
        type
      );
    }

    needsProtection = needsProtection && disableEscaper !== true;

    var output = callable;

    if (params && params.length) {
      output += '(';
      output += params.map(function(p) {
        return _self.processexp(p, shouldDisableEscape);
      }).join(',');
      output += ')';
    } else {
      // may or may not be a function here
      output = '(typeof ' + output + ' === \'function\' ? ' + output + '() : ' + output + ')';
    }

    if (needsProtection && this.defaultEscape) {
      output = this.defaultEscape + '(' + output + ')';
    }

    return output;
  };

  Compiler.prototype.processraw = function processraw(v) {
    return '"' + v[0] + '"';
  };

  Compiler.prototype.processescape = function processescape(v) {
    var item = v[0];

    if (item === 's') {
      return '" "';
    } else if (item === 'n') {
      return '"\\n"';
    } else if (item === 'r') {
      return '"\\r"';
    } else if (item === 'lb') {
      return '"{"';
    } else if (item === 'rb') {
      return '"}"';
    } else {
      throw new Error('Unknown escape: ' + item);
    }
  };

  Compiler.prototype.outputInternals = function outputInternals() {
    if (!this.internalsUsed.length) {
      return '';
    }

    return 'var ' + this.internalsUsed.map(function(item) {
      return '$i_' + item + ' = $runtime.' + item;
    }).join(',\n') + ';\n\n';
  };

  Compiler.prototype.outputLookups = function outputLookups() {
    if (!this.needLookup.length) {
      return '';
    }

    var lookup = 'function $_lookup(key) {\n' +
                 '  var searches = [$viewmodel, $data, $helper, $strings, $ctx];\n' +
                 '  for (var i=0; i < searches.length; i++) {\n' +
                 '    var s = searches[i];\n' +
                 '    if (s && s[key]) {\n' +
                 '      return s[key];\n' +
                 '    }\n' +
                 '  }\n' +
                 '  return null;\n' +
                 '};\n';

    return lookup + 'var ' + this.needLookup.map(function(key) {
      return '$lu_' + key + ' = $_lookup(\'' + key + '\')';
    }).join(',\n') + ';\n\n';
  };

  function compile(templateName, src, options) {
    var codeGenerator = new Compiler(options);

    try {
      var ast = parser.parse(src);

      if (ast[0] !== 'block') {
        throw new pegSyntaxError(
          'Expected template to start with a block, but found ' + ast[0] + ' instead',
          'block',
          ast[0],
          {
            start: { offset: 0, line: 0, column: 0 },
            end: { offset: 0, line: 0, column: 0 }
          }
        );
      }

      var compiled = codeGenerator.processblock(ast[1], null, false);
      var internals = codeGenerator.outputInternals();
      var lookups = codeGenerator.outputLookups();

      var code = 'function($$Lisplate,$$vmc){' +
        'return function($data,$strings,$runtime,$ctx) {' +
        'var $viewmodel = $$vmc ? new $$vmc($data,$strings,$ctx) : null;' +
        'var $helper = $$Lisplate.helpers;' +
        'var $_w = $runtime.Chunk;' +
        'var $c = new $_w();\n' +
        internals +
        lookups +
        compiled +
        '\nreturn $c.getOutput();\n}\n}';
      return code;
    } catch (err) {
      if (!err.location) {
        throw err;
      }

      var newMessage = err.message + ' [' + templateName + ':' + err.location.start.line + ':' + err.location.start.column + ']';
      throw new pegSyntaxError(newMessage, err.expected, err.found, err.location);
    }
  }

  var wrappers = {
    umd: function(templateName, template) {
      return '(function(root, factory) {\n' +
        'if (typeof define === \'function\' && define.amd) {\n' +
          'define(\'' + templateName + '\', [], factory);\n' +
        '} else if (typeof exports === \'object\') {\n' +
          'module.exports = factory();\n' +
        '} else {\n' +
          'root[\'' + templateName + '\'] = factory();\n' +
        '}\n' +
      '}(this, function() {\n' +
        '\'use strict\';\n' +

        'var fn = ' + template + '\n' +

        'return {\n' +
            'templateName: \'' + templateName + '\',\n' +
            'renderFactory: fn\n' +
        '};\n' +
      '}));\n';
    },

    amd: function(templateName, template) {
      return 'define(\'' + templateName + '\', [], function() {' +
        '\'use strict\';\n' +

        'var fn = ' + template + '\n' +

        'return {\n' +
            'templateName: \'' + templateName + '\',\n' +
            'renderFactory: fn\n' +
        '};\n' +
      '});\n';
    },

    commonjs: function(templateName, template) {
      return '\'use strict\';\n' +

        'var fn = ' + template + '\n' +

        'module.exports = {\n' +
            'templateName: \'' + templateName + '\',\n' +
            'renderFactory: fn\n' +
        '};\n';
    },

    es6: function(templateName, template) {
      return 'const fn = ' + template + '\n' +

        'export default {\n' +
            'templateName: \'' + templateName + '\',\n' +
            'renderFactory: fn\n' +
        '};\n';
    }
  };

  function compileModule(templateName, src, options) {
    if (!options) {
      options = {};
    }

    var template = compile(templateName, src, options);

    var wrapperType = options.wrapper;

    if (wrapperType === undefined) {
      wrapperType = 'umd';
    }

    if (!wrapperType) {
      return template;
    }

    var wrapper = wrappers[wrapperType];

    if (!wrapper) {
      throw new Error('Wrapper type is not valid. Wrapper must be one of:' +
        Object.keys(wrappers).join(', '));
    }

    return wrapper(templateName, template);
  }

  Lisplate.Compiler = {
    compile: compile,
    compileModule: compileModule
  };

  return Lisplate.Compiler;
}));
