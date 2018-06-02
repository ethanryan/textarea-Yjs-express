(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(function (process){
/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // NB: In an Electron preload script, document will be defined but not fully
  // initialized. Since we know we're in Chrome, we'll just detect this case
  // explicitly
  if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
    return true;
  }

  // is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
  return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
    // double check webkit in userAgent just in case we are in a worker
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  try {
    return JSON.stringify(v);
  } catch (err) {
    return '[UnexpectedJSONParseError]: ' + err.message;
  }
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return;

  var c = 'color: ' + this.color;
  args.splice(1, 0, c, 'color: inherit')

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-zA-Z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}

  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
  if (!r && typeof process !== 'undefined' && 'env' in process) {
    r = process.env.DEBUG;
  }

  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
  try {
    return window.localStorage;
  } catch (e) {}
}

}).call(this,require('_process'))
},{"./debug":2,"_process":5}],2:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
 */

exports.formatters = {};

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 * @param {String} namespace
 * @return {Number}
 * @api private
 */

function selectColor(namespace) {
  var hash = 0, i;

  for (i in namespace) {
    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  return exports.colors[Math.abs(hash) % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function createDebug(namespace) {

  function debug() {
    // disabled?
    if (!debug.enabled) return;

    var self = debug;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // turn the `arguments` into a proper Array
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %O
      args.unshift('%O');
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    // apply env-specific formatting (colors, etc.)
    exports.formatArgs.call(self, args);

    var logFn = debug.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }

  debug.namespace = namespace;
  debug.enabled = exports.enabled(namespace);
  debug.useColors = exports.useColors();
  debug.color = selectColor(namespace);

  // env-specific initialization logic for debug instances
  if ('function' === typeof exports.init) {
    exports.init(debug);
  }

  return debug;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  exports.names = [];
  exports.skips = [];

  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":4}],3:[function(require,module,exports){
/**
 * This library modifies the diff-patch-match library by Neil Fraser
 * by removing the patch and match functionality and certain advanced
 * options in the diff function. The original license is as follows:
 *
 * ===
 *
 * Diff Match and Patch
 *
 * Copyright 2006 Google Inc.
 * http://code.google.com/p/google-diff-match-patch/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


/**
 * The data structure representing a diff is an array of tuples:
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
var DIFF_DELETE = -1;
var DIFF_INSERT = 1;
var DIFF_EQUAL = 0;


/**
 * Find the differences between two texts.  Simplifies the problem by stripping
 * any common prefix or suffix off the texts before diffing.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {Int} cursor_pos Expected edit position in text1 (optional)
 * @return {Array} Array of diff tuples.
 */
function diff_main(text1, text2, cursor_pos) {
  // Check for equality (speedup).
  if (text1 == text2) {
    if (text1) {
      return [[DIFF_EQUAL, text1]];
    }
    return [];
  }

  // Check cursor_pos within bounds
  if (cursor_pos < 0 || text1.length < cursor_pos) {
    cursor_pos = null;
  }

  // Trim off common prefix (speedup).
  var commonlength = diff_commonPrefix(text1, text2);
  var commonprefix = text1.substring(0, commonlength);
  text1 = text1.substring(commonlength);
  text2 = text2.substring(commonlength);

  // Trim off common suffix (speedup).
  commonlength = diff_commonSuffix(text1, text2);
  var commonsuffix = text1.substring(text1.length - commonlength);
  text1 = text1.substring(0, text1.length - commonlength);
  text2 = text2.substring(0, text2.length - commonlength);

  // Compute the diff on the middle block.
  var diffs = diff_compute_(text1, text2);

  // Restore the prefix and suffix.
  if (commonprefix) {
    diffs.unshift([DIFF_EQUAL, commonprefix]);
  }
  if (commonsuffix) {
    diffs.push([DIFF_EQUAL, commonsuffix]);
  }
  diff_cleanupMerge(diffs);
  if (cursor_pos != null) {
    diffs = fix_cursor(diffs, cursor_pos);
  }
  diffs = fix_emoji(diffs);
  return diffs;
};


/**
 * Find the differences between two texts.  Assumes that the texts do not
 * have any common prefix or suffix.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @return {Array} Array of diff tuples.
 */
function diff_compute_(text1, text2) {
  var diffs;

  if (!text1) {
    // Just add some text (speedup).
    return [[DIFF_INSERT, text2]];
  }

  if (!text2) {
    // Just delete some text (speedup).
    return [[DIFF_DELETE, text1]];
  }

  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  var i = longtext.indexOf(shorttext);
  if (i != -1) {
    // Shorter text is inside the longer text (speedup).
    diffs = [[DIFF_INSERT, longtext.substring(0, i)],
             [DIFF_EQUAL, shorttext],
             [DIFF_INSERT, longtext.substring(i + shorttext.length)]];
    // Swap insertions for deletions if diff is reversed.
    if (text1.length > text2.length) {
      diffs[0][0] = diffs[2][0] = DIFF_DELETE;
    }
    return diffs;
  }

  if (shorttext.length == 1) {
    // Single character string.
    // After the previous speedup, the character can't be an equality.
    return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
  }

  // Check to see if the problem can be split in two.
  var hm = diff_halfMatch_(text1, text2);
  if (hm) {
    // A half-match was found, sort out the return data.
    var text1_a = hm[0];
    var text1_b = hm[1];
    var text2_a = hm[2];
    var text2_b = hm[3];
    var mid_common = hm[4];
    // Send both pairs off for separate processing.
    var diffs_a = diff_main(text1_a, text2_a);
    var diffs_b = diff_main(text1_b, text2_b);
    // Merge the results.
    return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);
  }

  return diff_bisect_(text1, text2);
};


/**
 * Find the 'middle snake' of a diff, split the problem in two
 * and return the recursively constructed diff.
 * See Myers 1986 paper: An O(ND) Difference Algorithm and Its Variations.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @return {Array} Array of diff tuples.
 * @private
 */
function diff_bisect_(text1, text2) {
  // Cache the text lengths to prevent multiple calls.
  var text1_length = text1.length;
  var text2_length = text2.length;
  var max_d = Math.ceil((text1_length + text2_length) / 2);
  var v_offset = max_d;
  var v_length = 2 * max_d;
  var v1 = new Array(v_length);
  var v2 = new Array(v_length);
  // Setting all elements to -1 is faster in Chrome & Firefox than mixing
  // integers and undefined.
  for (var x = 0; x < v_length; x++) {
    v1[x] = -1;
    v2[x] = -1;
  }
  v1[v_offset + 1] = 0;
  v2[v_offset + 1] = 0;
  var delta = text1_length - text2_length;
  // If the total number of characters is odd, then the front path will collide
  // with the reverse path.
  var front = (delta % 2 != 0);
  // Offsets for start and end of k loop.
  // Prevents mapping of space beyond the grid.
  var k1start = 0;
  var k1end = 0;
  var k2start = 0;
  var k2end = 0;
  for (var d = 0; d < max_d; d++) {
    // Walk the front path one step.
    for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      var k1_offset = v_offset + k1;
      var x1;
      if (k1 == -d || (k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1])) {
        x1 = v1[k1_offset + 1];
      } else {
        x1 = v1[k1_offset - 1] + 1;
      }
      var y1 = x1 - k1;
      while (x1 < text1_length && y1 < text2_length &&
             text1.charAt(x1) == text2.charAt(y1)) {
        x1++;
        y1++;
      }
      v1[k1_offset] = x1;
      if (x1 > text1_length) {
        // Ran off the right of the graph.
        k1end += 2;
      } else if (y1 > text2_length) {
        // Ran off the bottom of the graph.
        k1start += 2;
      } else if (front) {
        var k2_offset = v_offset + delta - k1;
        if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1) {
          // Mirror x2 onto top-left coordinate system.
          var x2 = text1_length - v2[k2_offset];
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(text1, text2, x1, y1);
          }
        }
      }
    }

    // Walk the reverse path one step.
    for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      var k2_offset = v_offset + k2;
      var x2;
      if (k2 == -d || (k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1])) {
        x2 = v2[k2_offset + 1];
      } else {
        x2 = v2[k2_offset - 1] + 1;
      }
      var y2 = x2 - k2;
      while (x2 < text1_length && y2 < text2_length &&
             text1.charAt(text1_length - x2 - 1) ==
             text2.charAt(text2_length - y2 - 1)) {
        x2++;
        y2++;
      }
      v2[k2_offset] = x2;
      if (x2 > text1_length) {
        // Ran off the left of the graph.
        k2end += 2;
      } else if (y2 > text2_length) {
        // Ran off the top of the graph.
        k2start += 2;
      } else if (!front) {
        var k1_offset = v_offset + delta - k2;
        if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {
          var x1 = v1[k1_offset];
          var y1 = v_offset + x1 - k1_offset;
          // Mirror x2 onto top-left coordinate system.
          x2 = text1_length - x2;
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(text1, text2, x1, y1);
          }
        }
      }
    }
  }
  // Diff took too long and hit the deadline or
  // number of diffs equals number of characters, no commonality at all.
  return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
};


/**
 * Given the location of the 'middle snake', split the diff in two parts
 * and recurse.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {number} x Index of split point in text1.
 * @param {number} y Index of split point in text2.
 * @return {Array} Array of diff tuples.
 */
function diff_bisectSplit_(text1, text2, x, y) {
  var text1a = text1.substring(0, x);
  var text2a = text2.substring(0, y);
  var text1b = text1.substring(x);
  var text2b = text2.substring(y);

  // Compute both diffs serially.
  var diffs = diff_main(text1a, text2a);
  var diffsb = diff_main(text1b, text2b);

  return diffs.concat(diffsb);
};


/**
 * Determine the common prefix of two strings.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the start of each
 *     string.
 */
function diff_commonPrefix(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 || text1.charAt(0) != text2.charAt(0)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerstart = 0;
  while (pointermin < pointermid) {
    if (text1.substring(pointerstart, pointermid) ==
        text2.substring(pointerstart, pointermid)) {
      pointermin = pointermid;
      pointerstart = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};


/**
 * Determine the common suffix of two strings.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the end of each string.
 */
function diff_commonSuffix(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 ||
      text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerend = 0;
  while (pointermin < pointermid) {
    if (text1.substring(text1.length - pointermid, text1.length - pointerend) ==
        text2.substring(text2.length - pointermid, text2.length - pointerend)) {
      pointermin = pointermid;
      pointerend = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};


/**
 * Do the two texts share a substring which is at least half the length of the
 * longer text?
 * This speedup can produce non-minimal diffs.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {Array.<string>} Five element Array, containing the prefix of
 *     text1, the suffix of text1, the prefix of text2, the suffix of
 *     text2 and the common middle.  Or null if there was no match.
 */
function diff_halfMatch_(text1, text2) {
  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
    return null;  // Pointless.
  }

  /**
   * Does a substring of shorttext exist within longtext such that the substring
   * is at least half the length of longtext?
   * Closure, but does not reference any external variables.
   * @param {string} longtext Longer string.
   * @param {string} shorttext Shorter string.
   * @param {number} i Start index of quarter length substring within longtext.
   * @return {Array.<string>} Five element Array, containing the prefix of
   *     longtext, the suffix of longtext, the prefix of shorttext, the suffix
   *     of shorttext and the common middle.  Or null if there was no match.
   * @private
   */
  function diff_halfMatchI_(longtext, shorttext, i) {
    // Start with a 1/4 length substring at position i as a seed.
    var seed = longtext.substring(i, i + Math.floor(longtext.length / 4));
    var j = -1;
    var best_common = '';
    var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;
    while ((j = shorttext.indexOf(seed, j + 1)) != -1) {
      var prefixLength = diff_commonPrefix(longtext.substring(i),
                                           shorttext.substring(j));
      var suffixLength = diff_commonSuffix(longtext.substring(0, i),
                                           shorttext.substring(0, j));
      if (best_common.length < suffixLength + prefixLength) {
        best_common = shorttext.substring(j - suffixLength, j) +
            shorttext.substring(j, j + prefixLength);
        best_longtext_a = longtext.substring(0, i - suffixLength);
        best_longtext_b = longtext.substring(i + prefixLength);
        best_shorttext_a = shorttext.substring(0, j - suffixLength);
        best_shorttext_b = shorttext.substring(j + prefixLength);
      }
    }
    if (best_common.length * 2 >= longtext.length) {
      return [best_longtext_a, best_longtext_b,
              best_shorttext_a, best_shorttext_b, best_common];
    } else {
      return null;
    }
  }

  // First check if the second quarter is the seed for a half-match.
  var hm1 = diff_halfMatchI_(longtext, shorttext,
                             Math.ceil(longtext.length / 4));
  // Check again based on the third quarter.
  var hm2 = diff_halfMatchI_(longtext, shorttext,
                             Math.ceil(longtext.length / 2));
  var hm;
  if (!hm1 && !hm2) {
    return null;
  } else if (!hm2) {
    hm = hm1;
  } else if (!hm1) {
    hm = hm2;
  } else {
    // Both matched.  Select the longest.
    hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
  }

  // A half-match was found, sort out the return data.
  var text1_a, text1_b, text2_a, text2_b;
  if (text1.length > text2.length) {
    text1_a = hm[0];
    text1_b = hm[1];
    text2_a = hm[2];
    text2_b = hm[3];
  } else {
    text2_a = hm[0];
    text2_b = hm[1];
    text1_a = hm[2];
    text1_b = hm[3];
  }
  var mid_common = hm[4];
  return [text1_a, text1_b, text2_a, text2_b, mid_common];
};


/**
 * Reorder and merge like edit sections.  Merge equalities.
 * Any edit section can move as long as it doesn't cross an equality.
 * @param {Array} diffs Array of diff tuples.
 */
function diff_cleanupMerge(diffs) {
  diffs.push([DIFF_EQUAL, '']);  // Add a dummy entry at the end.
  var pointer = 0;
  var count_delete = 0;
  var count_insert = 0;
  var text_delete = '';
  var text_insert = '';
  var commonlength;
  while (pointer < diffs.length) {
    switch (diffs[pointer][0]) {
      case DIFF_INSERT:
        count_insert++;
        text_insert += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_DELETE:
        count_delete++;
        text_delete += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_EQUAL:
        // Upon reaching an equality, check for prior redundancies.
        if (count_delete + count_insert > 1) {
          if (count_delete !== 0 && count_insert !== 0) {
            // Factor out any common prefixies.
            commonlength = diff_commonPrefix(text_insert, text_delete);
            if (commonlength !== 0) {
              if ((pointer - count_delete - count_insert) > 0 &&
                  diffs[pointer - count_delete - count_insert - 1][0] ==
                  DIFF_EQUAL) {
                diffs[pointer - count_delete - count_insert - 1][1] +=
                    text_insert.substring(0, commonlength);
              } else {
                diffs.splice(0, 0, [DIFF_EQUAL,
                                    text_insert.substring(0, commonlength)]);
                pointer++;
              }
              text_insert = text_insert.substring(commonlength);
              text_delete = text_delete.substring(commonlength);
            }
            // Factor out any common suffixies.
            commonlength = diff_commonSuffix(text_insert, text_delete);
            if (commonlength !== 0) {
              diffs[pointer][1] = text_insert.substring(text_insert.length -
                  commonlength) + diffs[pointer][1];
              text_insert = text_insert.substring(0, text_insert.length -
                  commonlength);
              text_delete = text_delete.substring(0, text_delete.length -
                  commonlength);
            }
          }
          // Delete the offending records and add the merged ones.
          if (count_delete === 0) {
            diffs.splice(pointer - count_insert,
                count_delete + count_insert, [DIFF_INSERT, text_insert]);
          } else if (count_insert === 0) {
            diffs.splice(pointer - count_delete,
                count_delete + count_insert, [DIFF_DELETE, text_delete]);
          } else {
            diffs.splice(pointer - count_delete - count_insert,
                count_delete + count_insert, [DIFF_DELETE, text_delete],
                [DIFF_INSERT, text_insert]);
          }
          pointer = pointer - count_delete - count_insert +
                    (count_delete ? 1 : 0) + (count_insert ? 1 : 0) + 1;
        } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {
          // Merge this equality with the previous one.
          diffs[pointer - 1][1] += diffs[pointer][1];
          diffs.splice(pointer, 1);
        } else {
          pointer++;
        }
        count_insert = 0;
        count_delete = 0;
        text_delete = '';
        text_insert = '';
        break;
    }
  }
  if (diffs[diffs.length - 1][1] === '') {
    diffs.pop();  // Remove the dummy entry at the end.
  }

  // Second pass: look for single edits surrounded on both sides by equalities
  // which can be shifted sideways to eliminate an equality.
  // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
  var changes = false;
  pointer = 1;
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      if (diffs[pointer][1].substring(diffs[pointer][1].length -
          diffs[pointer - 1][1].length) == diffs[pointer - 1][1]) {
        // Shift the edit over the previous equality.
        diffs[pointer][1] = diffs[pointer - 1][1] +
            diffs[pointer][1].substring(0, diffs[pointer][1].length -
                                        diffs[pointer - 1][1].length);
        diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
        diffs.splice(pointer - 1, 1);
        changes = true;
      } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) ==
          diffs[pointer + 1][1]) {
        // Shift the edit over the next equality.
        diffs[pointer - 1][1] += diffs[pointer + 1][1];
        diffs[pointer][1] =
            diffs[pointer][1].substring(diffs[pointer + 1][1].length) +
            diffs[pointer + 1][1];
        diffs.splice(pointer + 1, 1);
        changes = true;
      }
    }
    pointer++;
  }
  // If shifts were made, the diff needs reordering and another shift sweep.
  if (changes) {
    diff_cleanupMerge(diffs);
  }
};


var diff = diff_main;
diff.INSERT = DIFF_INSERT;
diff.DELETE = DIFF_DELETE;
diff.EQUAL = DIFF_EQUAL;

module.exports = diff;

/*
 * Modify a diff such that the cursor position points to the start of a change:
 * E.g.
 *   cursor_normalize_diff([[DIFF_EQUAL, 'abc']], 1)
 *     => [1, [[DIFF_EQUAL, 'a'], [DIFF_EQUAL, 'bc']]]
 *   cursor_normalize_diff([[DIFF_INSERT, 'new'], [DIFF_DELETE, 'xyz']], 2)
 *     => [2, [[DIFF_INSERT, 'new'], [DIFF_DELETE, 'xy'], [DIFF_DELETE, 'z']]]
 *
 * @param {Array} diffs Array of diff tuples
 * @param {Int} cursor_pos Suggested edit position. Must not be out of bounds!
 * @return {Array} A tuple [cursor location in the modified diff, modified diff]
 */
function cursor_normalize_diff (diffs, cursor_pos) {
  if (cursor_pos === 0) {
    return [DIFF_EQUAL, diffs];
  }
  for (var current_pos = 0, i = 0; i < diffs.length; i++) {
    var d = diffs[i];
    if (d[0] === DIFF_DELETE || d[0] === DIFF_EQUAL) {
      var next_pos = current_pos + d[1].length;
      if (cursor_pos === next_pos) {
        return [i + 1, diffs];
      } else if (cursor_pos < next_pos) {
        // copy to prevent side effects
        diffs = diffs.slice();
        // split d into two diff changes
        var split_pos = cursor_pos - current_pos;
        var d_left = [d[0], d[1].slice(0, split_pos)];
        var d_right = [d[0], d[1].slice(split_pos)];
        diffs.splice(i, 1, d_left, d_right);
        return [i + 1, diffs];
      } else {
        current_pos = next_pos;
      }
    }
  }
  throw new Error('cursor_pos is out of bounds!')
}

/*
 * Modify a diff such that the edit position is "shifted" to the proposed edit location (cursor_position).
 *
 * Case 1)
 *   Check if a naive shift is possible:
 *     [0, X], [ 1, Y] -> [ 1, Y], [0, X]    (if X + Y === Y + X)
 *     [0, X], [-1, Y] -> [-1, Y], [0, X]    (if X + Y === Y + X) - holds same result
 * Case 2)
 *   Check if the following shifts are possible:
 *     [0, 'pre'], [ 1, 'prefix'] -> [ 1, 'pre'], [0, 'pre'], [ 1, 'fix']
 *     [0, 'pre'], [-1, 'prefix'] -> [-1, 'pre'], [0, 'pre'], [-1, 'fix']
 *         ^            ^
 *         d          d_next
 *
 * @param {Array} diffs Array of diff tuples
 * @param {Int} cursor_pos Suggested edit position. Must not be out of bounds!
 * @return {Array} Array of diff tuples
 */
function fix_cursor (diffs, cursor_pos) {
  var norm = cursor_normalize_diff(diffs, cursor_pos);
  var ndiffs = norm[1];
  var cursor_pointer = norm[0];
  var d = ndiffs[cursor_pointer];
  var d_next = ndiffs[cursor_pointer + 1];

  if (d == null) {
    // Text was deleted from end of original string,
    // cursor is now out of bounds in new string
    return diffs;
  } else if (d[0] !== DIFF_EQUAL) {
    // A modification happened at the cursor location.
    // This is the expected outcome, so we can return the original diff.
    return diffs;
  } else {
    if (d_next != null && d[1] + d_next[1] === d_next[1] + d[1]) {
      // Case 1)
      // It is possible to perform a naive shift
      ndiffs.splice(cursor_pointer, 2, d_next, d)
      return merge_tuples(ndiffs, cursor_pointer, 2)
    } else if (d_next != null && d_next[1].indexOf(d[1]) === 0) {
      // Case 2)
      // d[1] is a prefix of d_next[1]
      // We can assume that d_next[0] !== 0, since d[0] === 0
      // Shift edit locations..
      ndiffs.splice(cursor_pointer, 2, [d_next[0], d[1]], [0, d[1]]);
      var suffix = d_next[1].slice(d[1].length);
      if (suffix.length > 0) {
        ndiffs.splice(cursor_pointer + 2, 0, [d_next[0], suffix]);
      }
      return merge_tuples(ndiffs, cursor_pointer, 3)
    } else {
      // Not possible to perform any modification
      return diffs;
    }
  }
}

/*
 * Check diff did not split surrogate pairs.
 * Ex. [0, '\uD83D'], [-1, '\uDC36'], [1, '\uDC2F'] -> [-1, '\uD83D\uDC36'], [1, '\uD83D\uDC2F']
 *     '\uD83D\uDC36' === '🐶', '\uD83D\uDC2F' === '🐯'
 *
 * @param {Array} diffs Array of diff tuples
 * @return {Array} Array of diff tuples
 */
function fix_emoji (diffs) {
  var compact = false;
  var starts_with_pair_end = function(str) {
    return str.charCodeAt(0) >= 0xDC00 && str.charCodeAt(0) <= 0xDFFF;
  }
  var ends_with_pair_start = function(str) {
    return str.charCodeAt(str.length-1) >= 0xD800 && str.charCodeAt(str.length-1) <= 0xDBFF;
  }
  for (var i = 2; i < diffs.length; i += 1) {
    if (diffs[i-2][0] === DIFF_EQUAL && ends_with_pair_start(diffs[i-2][1]) &&
        diffs[i-1][0] === DIFF_DELETE && starts_with_pair_end(diffs[i-1][1]) &&
        diffs[i][0] === DIFF_INSERT && starts_with_pair_end(diffs[i][1])) {
      compact = true;

      diffs[i-1][1] = diffs[i-2][1].slice(-1) + diffs[i-1][1];
      diffs[i][1] = diffs[i-2][1].slice(-1) + diffs[i][1];

      diffs[i-2][1] = diffs[i-2][1].slice(0, -1);
    }
  }
  if (!compact) {
    return diffs;
  }
  var fixed_diffs = [];
  for (var i = 0; i < diffs.length; i += 1) {
    if (diffs[i][1].length > 0) {
      fixed_diffs.push(diffs[i]);
    }
  }
  return fixed_diffs;
}

/*
 * Try to merge tuples with their neigbors in a given range.
 * E.g. [0, 'a'], [0, 'b'] -> [0, 'ab']
 *
 * @param {Array} diffs Array of diff tuples.
 * @param {Int} start Position of the first element to merge (diffs[start] is also merged with diffs[start - 1]).
 * @param {Int} length Number of consecutive elements to check.
 * @return {Array} Array of merged diff tuples.
 */
function merge_tuples (diffs, start, length) {
  // Check from (start-1) to (start+length).
  for (var i = start + length - 1; i >= 0 && i >= start - 1; i--) {
    if (i + 1 < diffs.length) {
      var left_d = diffs[i];
      var right_d = diffs[i+1];
      if (left_d[0] === right_d[1]) {
        diffs.splice(i, 2, [left_d[0], left_d[1] + right_d[1]]);
      }
    }
  }
  return diffs;
}

},{}],4:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  if (ms >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (ms >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return;
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name;
  }
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],5:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],6:[function(require,module,exports){
"use strict"

function unique_pred(list, compare) {
  var ptr = 1
    , len = list.length
    , a=list[0], b=list[0]
  for(var i=1; i<len; ++i) {
    b = a
    a = list[i]
    if(compare(a, b)) {
      if(i === ptr) {
        ptr++
        continue
      }
      list[ptr++] = a
    }
  }
  list.length = ptr
  return list
}

function unique_eq(list) {
  var ptr = 1
    , len = list.length
    , a=list[0], b = list[0]
  for(var i=1; i<len; ++i, b=a) {
    b = a
    a = list[i]
    if(a !== b) {
      if(i === ptr) {
        ptr++
        continue
      }
      list[ptr++] = a
    }
  }
  list.length = ptr
  return list
}

function unique(list, compare, sorted) {
  if(list.length === 0) {
    return list
  }
  if(compare) {
    if(!sorted) {
      list.sort(compare)
    }
    return unique_pred(list, compare)
  }
  if(!sorted) {
    list.sort()
  }
  return unique_eq(list)
}

module.exports = unique

},{}],7:[function(require,module,exports){
/* global Y */
'use strict'

function extend (Y) {
  class YArray extends Y.utils.CustomType {
    constructor (os, _model, _content) {
      super()
      this.os = os
      this._model = _model
      // Array of all the neccessary content
      this._content = _content

      // the parent of this type
      this._parent = null
      this._deepEventHandler = new Y.utils.EventListenerHandler()

      // this._debugEvents = [] // TODO: remove!!
      this.eventHandler = new Y.utils.EventHandler((op) => {
        // this._debugEvents.push(JSON.parse(JSON.stringify(op)))
        if (op.struct === 'Insert') {
          // when using indexeddb db adapter, the op could already exist (see y-js/y-indexeddb#2)
          if (this._content.some(function (c) { return Y.utils.compareIds(c.id, op.id) })) {
            // op exists
            return
          }
          let pos
          // we check op.left only!,
          // because op.right might not be defined when this is called
          if (op.left === null) {
            pos = 0
          } else {
            pos = 1 + this._content.findIndex(function (c) {
              return Y.utils.compareIds(c.id, op.left)
            })
            if (pos <= 0) {
              throw new Error('Unexpected operation!')
            }
          }
          /* (see above for new approach)
          var _e = this._content[pos]
          // when using indexeddb db adapter, the op could already exist (see y-js/y-indexeddb#2)
          // If the algorithm works correctly, the double should always exist on the correct position (pos - the computed destination)
          if (_e != null && Y.utils.compareIds(_e.id, op.id)) {
            // is already defined
            return
          }*/
          var values
          var length
          if (op.hasOwnProperty('opContent')) {
            this._content.splice(pos, 0, {
              id: op.id,
              type: op.opContent
            })
            length = 1
            let type = this.os.getType(op.opContent)
            type._parent = this._model
            values = [type]
          } else {
            var contents = op.content.map(function (c, i) {
              return {
                id: [op.id[0], op.id[1] + i],
                val: c
              }
            })
            // insert value in _content
            // It is not possible to insert more than ~2^16 elements in an Array (see #5). We handle this case explicitly
            if (contents.length < 30000) {
              this._content.splice.apply(this._content, [pos, 0].concat(contents))
            } else {
              this._content = this._content.slice(0, pos).concat(contents).concat(this._content.slice(pos))
            }
            values = op.content
            length = op.content.length
          }
          Y.utils.bubbleEvent(this, {
            type: 'insert',
            object: this,
            index: pos,
            values: values,
            length: length
          })
        } else if (op.struct === 'Delete') {
          var i = 0 // current position in _content
          for (; i < this._content.length && op.length > 0; i++) {
            var c = this._content[i]
            if (Y.utils.inDeletionRange(op, c.id)) {
              // is in deletion range!
              var delLength
              // check how many character to delete in one flush
              for (delLength = 1;
                    delLength < op.length && i + delLength < this._content.length && Y.utils.inDeletionRange(op, this._content[i + delLength].id);
                    delLength++) {}
              // last operation that will be deleted
              c = this._content[i + delLength - 1]
              // update delete operation
              op.length -= c.id[1] - op.target[1] + 1
              op.target = [c.id[0], c.id[1] + 1]
              // apply deletion & find send event
              let content = this._content.splice(i, delLength)
              let values = content.map((c) => {
                if (c.val != null) {
                  return c.val
                } else {
                  return this.os.getType(c.type)
                }
              })
              Y.utils.bubbleEvent(this, {
                type: 'delete',
                object: this,
                index: i,
                values: values,
                _content: content,
                length: delLength
              })
              // with the fresh delete op, we can continue
              // note: we don't have to increment i, because the i-th content was deleted
              // but on the other had, the (i+delLength)-th was not in deletion range
              // So we don't do i--
            }
          }
        } else {
          throw new Error('Unexpected struct!')
        }
      })
    }
    _getPathToChild (childId) {
      return this._content.findIndex(c =>
        c.type != null && Y.utils.compareIds(c.type, childId)
      )
    }
    _destroy () {
      this.eventHandler.destroy()
      this.eventHandler = null
      this._content = null
      this._model = null
      this._parent = null
      this.os = null
    }
    get length () {
      return this._content.length
    }
    get (pos) {
      if (pos == null || typeof pos !== 'number') {
        throw new Error('pos must be a number!')
      }
      if (pos >= this._content.length) {
        return undefined
      }
      if (this._content[pos].type == null) {
        return this._content[pos].val
      } else {
        return this.os.getType(this._content[pos].type)
      }
    }
    toArray () {
      return this._content.map((x, i) => {
        if (x.type != null) {
          return this.os.getType(x.type)
        } else {
          return x.val
        }
      })
    }
    push (contents) {
      return this.insert(this._content.length, contents)
    }
    insert (pos, contents) {
      if (typeof pos !== 'number') {
        throw new Error('pos must be a number!')
      }
      if (!Array.isArray(contents)) {
        throw new Error('contents must be an Array of objects!')
      }
      if (contents.length === 0) {
        return
      }
      if (pos > this._content.length || pos < 0) {
        throw new Error('This position exceeds the range of the array!')
      }
      var mostLeft = pos === 0 ? null : this._content[pos - 1].id

      var ops = []
      var prevId = mostLeft
      for (var i = 0; i < contents.length;) {
        var op = {
          left: prevId,
          origin: prevId,
          // right: mostRight,
          // NOTE: I intentionally do not define right here, because it could be deleted
          // at the time of inserting this operation (when we get the transaction),
          // and would therefore not defined in this._content
          parent: this._model,
          struct: 'Insert'
        }
        var _content = []
        var typeDefinition
        while (i < contents.length) {
          var val = contents[i++]
          typeDefinition = Y.utils.isTypeDefinition(val)
          if (!typeDefinition) {
            _content.push(val)
          } else if (_content.length > 0) {
            i-- // come back again later
            break
          } else {
            break
          }
        }
        if (_content.length > 0) {
          // content is defined
          op.content = _content
          op.id = this.os.getNextOpId(_content.length)
        } else {
          // otherwise its a type
          var typeid = this.os.getNextOpId(1)
          this.os.createType(typeDefinition, typeid)
          op.opContent = typeid
          op.id = this.os.getNextOpId(1)
        }
        ops.push(op)
        prevId = op.id
      }
      var eventHandler = this.eventHandler
      this.os.requestTransaction(function *() {
        // now we can set the right reference.
        var mostRight
        if (mostLeft != null) {
          var ml = yield* this.getInsertionCleanEnd(mostLeft)
          mostRight = ml.right
        } else {
          mostRight = (yield* this.getOperation(ops[0].parent)).start
        }
        for (var j = 0; j < ops.length; j++) {
          var op = ops[j]
          op.right = mostRight
        }
        yield* eventHandler.awaitOps(this, this.applyCreatedOperations, [ops])
      })
      // always remember to do that after this.os.requestTransaction
      // (otherwise values might contain a undefined reference to type)
      eventHandler.awaitAndPrematurelyCall(ops)
    }
    delete (pos, length) {
      if (length == null) { length = 1 }
      if (typeof length !== 'number') {
        throw new Error('length must be a number!')
      }
      if (typeof pos !== 'number') {
        throw new Error('pos must be a number!')
      }
      if (pos + length > this._content.length || pos < 0 || length < 0) {
        throw new Error('The deletion range exceeds the range of the array!')
      }
      if (length === 0) {
        return
      }
      var eventHandler = this.eventHandler
      var dels = []
      for (var i = 0; i < length; i = i + delLength) {
        var targetId = this._content[pos + i].id
        var delLength
        // how many insertions can we delete in one deletion?
        for (delLength = 1; i + delLength < length; delLength++) {
          if (!Y.utils.compareIds(this._content[pos + i + delLength].id, [targetId[0], targetId[1] + delLength])) {
            break
          }
        }
        dels.push({
          target: targetId,
          struct: 'Delete',
          length: delLength
        })
      }
      this.os.requestTransaction(function *() {
        yield* eventHandler.awaitOps(this, this.applyCreatedOperations, [dels])
      })
      // always remember to do that after this.os.requestTransaction
      // (otherwise values might contain a undefined reference to type)
      eventHandler.awaitAndPrematurelyCall(dels)
    }
    observe (f) {
      this.eventHandler.addEventListener(f)
    }
    observeDeep (f) {
      this._deepEventHandler.addEventListener(f)
    }
    unobserve (f) {
      this.eventHandler.removeEventListener(f)
    }
    unobserveDeep (f) {
      this._deepEventHandler.removeEventListener(f)
    }
    * _changed (transaction, op) {
      if (!op.deleted) {
        if (op.struct === 'Insert') {
          // update left
          var l = op.left
          var left
          while (l != null) {
            left = yield* transaction.getInsertion(l)
            if (!left.deleted) {
              break
            }
            l = left.left
          }
          op.left = l
          // if op contains opContent, initialize it
          if (op.opContent != null) {
            yield* transaction.store.initType.call(transaction, op.opContent)
          }
        }
        this.eventHandler.receivedOp(op)
      }
    }
  }

  Y.extend('Array', new Y.utils.CustomTypeDefinition({
    name: 'Array',
    class: YArray,
    struct: 'List',
    initType: function * YArrayInitializer (os, model) {
      var _content = []
      var _types = []
      yield* Y.Struct.List.map.call(this, model, function (op) {
        if (op.hasOwnProperty('opContent')) {
          _content.push({
            id: op.id,
            type: op.opContent
          })
          _types.push(op.opContent)
        } else {
          op.content.forEach(function (c, i) {
            _content.push({
              id: [op.id[0], op.id[1] + i],
              val: op.content[i]
            })
          })
        }
      })
      for (var i = 0; i < _types.length; i++) {
        var type = yield* this.store.initType.call(this, _types[i])
        type._parent = model.id
      }
      return new YArray(os, model.id, _content)
    },
    createType: function YArrayCreateType (os, model) {
      return new YArray(os, model.id, [])
    }
  }))
}

module.exports = extend
if (typeof Y !== 'undefined') {
  extend(Y)
}

},{}],8:[function(require,module,exports){
/* global Y */
'use strict'

function extend (Y) {
  require('./RedBlackTree.js')(Y)
  class Transaction extends Y.Transaction {
    constructor (store) {
      super(store)
      this.store = store
      this.ss = store.ss
      this.os = store.os
      this.ds = store.ds
    }
  }
  var Store = Y.utils.RBTree
  var BufferedStore = Y.utils.createSmallLookupBuffer(Store)

  class Database extends Y.AbstractDatabase {
    constructor (y, opts) {
      super(y, opts)
      this.os = new BufferedStore()
      this.ds = new Store()
      this.ss = new BufferedStore()
    }
    logTable () {
      var self = this
      self.requestTransaction(function * () {
        console.log('User: ', this.store.y.connector.userId, "==============================") // eslint-disable-line
        console.log("State Set (SS):", yield* this.getStateSet()) // eslint-disable-line
        console.log("Operation Store (OS):") // eslint-disable-line
        yield* this.os.logTable() // eslint-disable-line
        console.log("Deletion Store (DS):") //eslint-disable-line
        yield* this.ds.logTable() // eslint-disable-line
        if (this.store.gc1.length > 0 || this.store.gc2.length > 0) {
          console.warn('GC1|2 not empty!', this.store.gc1, this.store.gc2)
        }
        if (JSON.stringify(this.store.listenersById) !== '{}') {
          console.warn('listenersById not empty!')
        }
        if (JSON.stringify(this.store.listenersByIdExecuteNow) !== '[]') {
          console.warn('listenersByIdExecuteNow not empty!')
        }
        if (this.store.transactionInProgress) {
          console.warn('Transaction still in progress!')
        }
      }, true)
    }
    transact (makeGen) {
      var t = new Transaction(this)
      while (makeGen !== null) {
        var gen = makeGen.call(t)
        var res = gen.next()
        while (!res.done) {
          res = gen.next(res.value)
        }
        makeGen = this.getNextRequest()
      }
    }
    * destroy () {
      yield* super.destroy()
      delete this.os
      delete this.ss
      delete this.ds
    }
  }
  Y.extend('memory', Database)
}

module.exports = extend
if (typeof Y !== 'undefined') {
  extend(Y)
}

},{"./RedBlackTree.js":9}],9:[function(require,module,exports){
'use strict'

/*
  This file contains a not so fancy implemantion of a Red Black Tree.
*/
module.exports = function (Y) {
  class N {
    // A created node is always red!
    constructor (val) {
      this.val = val
      this.color = true
      this._left = null
      this._right = null
      this._parent = null
      if (val.id === null) {
        throw new Error('You must define id!')
      }
    }
    isRed () { return this.color }
    isBlack () { return !this.color }
    redden () { this.color = true; return this }
    blacken () { this.color = false; return this }
    get grandparent () {
      return this.parent.parent
    }
    get parent () {
      return this._parent
    }
    get sibling () {
      return (this === this.parent.left)
        ? this.parent.right : this.parent.left
    }
    get left () {
      return this._left
    }
    get right () {
      return this._right
    }
    set left (n) {
      if (n !== null) {
        n._parent = this
      }
      this._left = n
    }
    set right (n) {
      if (n !== null) {
        n._parent = this
      }
      this._right = n
    }
    rotateLeft (tree) {
      var parent = this.parent
      var newParent = this.right
      var newRight = this.right.left
      newParent.left = this
      this.right = newRight
      if (parent === null) {
        tree.root = newParent
        newParent._parent = null
      } else if (parent.left === this) {
        parent.left = newParent
      } else if (parent.right === this) {
        parent.right = newParent
      } else {
        throw new Error('The elements are wrongly connected!')
      }
    }
    next () {
      if (this.right !== null) {
        // search the most left node in the right tree
        var o = this.right
        while (o.left !== null) {
          o = o.left
        }
        return o
      } else {
        var p = this
        while (p.parent !== null && p !== p.parent.left) {
          p = p.parent
        }
        return p.parent
      }
    }
    prev () {
      if (this.left !== null) {
        // search the most right node in the left tree
        var o = this.left
        while (o.right !== null) {
          o = o.right
        }
        return o
      } else {
        var p = this
        while (p.parent !== null && p !== p.parent.right) {
          p = p.parent
        }
        return p.parent
      }
    }
    rotateRight (tree) {
      var parent = this.parent
      var newParent = this.left
      var newLeft = this.left.right
      newParent.right = this
      this.left = newLeft
      if (parent === null) {
        tree.root = newParent
        newParent._parent = null
      } else if (parent.left === this) {
        parent.left = newParent
      } else if (parent.right === this) {
        parent.right = newParent
      } else {
        throw new Error('The elements are wrongly connected!')
      }
    }
    getUncle () {
      // we can assume that grandparent exists when this is called!
      if (this.parent === this.parent.parent.left) {
        return this.parent.parent.right
      } else {
        return this.parent.parent.left
      }
    }
  }

  class RBTree {
    constructor () {
      this.root = null
      this.length = 0
    }
    * findNext (id) {
      return yield* this.findWithLowerBound([id[0], id[1] + 1])
    }
    * findPrev (id) {
      return yield* this.findWithUpperBound([id[0], id[1] - 1])
    }
    findNodeWithLowerBound (from) {
      if (from === void 0) {
        throw new Error('You must define from!')
      }
      var o = this.root
      if (o === null) {
        return null
      } else {
        while (true) {
          if ((from === null || Y.utils.smaller(from, o.val.id)) && o.left !== null) {
            // o is included in the bound
            // try to find an element that is closer to the bound
            o = o.left
          } else if (from !== null && Y.utils.smaller(o.val.id, from)) {
            // o is not within the bound, maybe one of the right elements is..
            if (o.right !== null) {
              o = o.right
            } else {
              // there is no right element. Search for the next bigger element,
              // this should be within the bounds
              return o.next()
            }
          } else {
            return o
          }
        }
      }
    }
    findNodeWithUpperBound (to) {
      if (to === void 0) {
        throw new Error('You must define from!')
      }
      var o = this.root
      if (o === null) {
        return null
      } else {
        while (true) {
          if ((to === null || Y.utils.smaller(o.val.id, to)) && o.right !== null) {
            // o is included in the bound
            // try to find an element that is closer to the bound
            o = o.right
          } else if (to !== null && Y.utils.smaller(to, o.val.id)) {
            // o is not within the bound, maybe one of the left elements is..
            if (o.left !== null) {
              o = o.left
            } else {
              // there is no left element. Search for the prev smaller element,
              // this should be within the bounds
              return o.prev()
            }
          } else {
            return o
          }
        }
      }
    }
    findSmallestNode () {
      var o = this.root
      while (o != null && o.left != null) {
        o = o.left
      }
      return o
    }
    * findWithLowerBound (from) {
      var n = this.findNodeWithLowerBound(from)
      return n == null ? null : n.val
    }
    * findWithUpperBound (to) {
      var n = this.findNodeWithUpperBound(to)
      return n == null ? null : n.val
    }
    * iterate (t, from, to, f) {
      var o
      if (from === null) {
        o = this.findSmallestNode()
      } else {
        o = this.findNodeWithLowerBound(from)
      }
      while (o !== null && (to === null || Y.utils.smaller(o.val.id, to) || Y.utils.compareIds(o.val.id, to))) {
        yield* f.call(t, o.val)
        o = o.next()
      }
      return true
    }
    * logTable (from, to, filter) {
      if (filter == null) {
        filter = function () {
          return true
        }
      }
      if (from == null) { from = null }
      if (to == null) { to = null }
      var os = []
      yield* this.iterate(this, from, to, function * (o) {
        if (filter(o)) {
          var o_ = {}
          for (var key in o) {
            if (typeof o[key] === 'object') {
              o_[key] = JSON.stringify(o[key])
            } else {
              o_[key] = o[key]
            }
          }
          os.push(o_)
        }
      })
      if (console.table != null) {
        console.table(os)
      }
    }
    * find (id) {
      var n
      return (n = this.findNode(id)) ? n.val : null
    }
    findNode (id) {
      if (id == null || id.constructor !== Array) {
        throw new Error('Expect id to be an array!')
      }
      var o = this.root
      if (o === null) {
        return false
      } else {
        while (true) {
          if (o === null) {
            return false
          }
          if (Y.utils.smaller(id, o.val.id)) {
            o = o.left
          } else if (Y.utils.smaller(o.val.id, id)) {
            o = o.right
          } else {
            return o
          }
        }
      }
    }
    * delete (id) {
      if (id == null || id.constructor !== Array) {
        throw new Error('id is expected to be an Array!')
      }
      var d = this.findNode(id)
      if (d == null) {
        // throw new Error('Element does not exist!')
        return
      }
      this.length--
      if (d.left !== null && d.right !== null) {
        // switch d with the greates element in the left subtree.
        // o should have at most one child.
        var o = d.left
        // find
        while (o.right !== null) {
          o = o.right
        }
        // switch
        d.val = o.val
        d = o
      }
      // d has at most one child
      // let n be the node that replaces d
      var isFakeChild
      var child = d.left || d.right
      if (child === null) {
        isFakeChild = true
        child = new N({id: 0})
        child.blacken()
        d.right = child
      } else {
        isFakeChild = false
      }

      if (d.parent === null) {
        if (!isFakeChild) {
          this.root = child
          child.blacken()
          child._parent = null
        } else {
          this.root = null
        }
        return
      } else if (d.parent.left === d) {
        d.parent.left = child
      } else if (d.parent.right === d) {
        d.parent.right = child
      } else {
        throw new Error('Impossible!')
      }
      if (d.isBlack()) {
        if (child.isRed()) {
          child.blacken()
        } else {
          this._fixDelete(child)
        }
      }
      this.root.blacken()
      if (isFakeChild) {
        if (child.parent.left === child) {
          child.parent.left = null
        } else if (child.parent.right === child) {
          child.parent.right = null
        } else {
          throw new Error('Impossible #3')
        }
      }
    }
    _fixDelete (n) {
      function isBlack (node) {
        return node !== null ? node.isBlack() : true
      }
      function isRed (node) {
        return node !== null ? node.isRed() : false
      }
      if (n.parent === null) {
        // this can only be called after the first iteration of fixDelete.
        return
      }
      // d was already replaced by the child
      // d is not the root
      // d and child are black
      var sibling = n.sibling
      if (isRed(sibling)) {
        // make sibling the grandfather
        n.parent.redden()
        sibling.blacken()
        if (n === n.parent.left) {
          n.parent.rotateLeft(this)
        } else if (n === n.parent.right) {
          n.parent.rotateRight(this)
        } else {
          throw new Error('Impossible #2')
        }
        sibling = n.sibling
      }
      // parent, sibling, and children of n are black
      if (n.parent.isBlack() &&
        sibling.isBlack() &&
        isBlack(sibling.left) &&
        isBlack(sibling.right)
      ) {
        sibling.redden()
        this._fixDelete(n.parent)
      } else if (n.parent.isRed() &&
        sibling.isBlack() &&
        isBlack(sibling.left) &&
        isBlack(sibling.right)
      ) {
        sibling.redden()
        n.parent.blacken()
      } else {
        if (n === n.parent.left &&
          sibling.isBlack() &&
          isRed(sibling.left) &&
          isBlack(sibling.right)
        ) {
          sibling.redden()
          sibling.left.blacken()
          sibling.rotateRight(this)
          sibling = n.sibling
        } else if (n === n.parent.right &&
          sibling.isBlack() &&
          isRed(sibling.right) &&
          isBlack(sibling.left)
        ) {
          sibling.redden()
          sibling.right.blacken()
          sibling.rotateLeft(this)
          sibling = n.sibling
        }
        sibling.color = n.parent.color
        n.parent.blacken()
        if (n === n.parent.left) {
          sibling.right.blacken()
          n.parent.rotateLeft(this)
        } else {
          sibling.left.blacken()
          n.parent.rotateRight(this)
        }
      }
    }
    * put (v) {
      if (v == null || v.id == null || v.id.constructor !== Array) {
        throw new Error('v is expected to have an id property which is an Array!')
      }
      var node = new N(v)
      if (this.root !== null) {
        var p = this.root // p abbrev. parent
        while (true) {
          if (Y.utils.smaller(node.val.id, p.val.id)) {
            if (p.left === null) {
              p.left = node
              break
            } else {
              p = p.left
            }
          } else if (Y.utils.smaller(p.val.id, node.val.id)) {
            if (p.right === null) {
              p.right = node
              break
            } else {
              p = p.right
            }
          } else {
            p.val = node.val
            return p
          }
        }
        this._fixInsert(node)
      } else {
        this.root = node
      }
      this.length++
      this.root.blacken()
      return node
    }
    _fixInsert (n) {
      if (n.parent === null) {
        n.blacken()
        return
      } else if (n.parent.isBlack()) {
        return
      }
      var uncle = n.getUncle()
      if (uncle !== null && uncle.isRed()) {
        // Note: parent: red, uncle: red
        n.parent.blacken()
        uncle.blacken()
        n.grandparent.redden()
        this._fixInsert(n.grandparent)
      } else {
        // Note: parent: red, uncle: black or null
        // Now we transform the tree in such a way that
        // either of these holds:
        //   1) grandparent.left.isRed
        //     and grandparent.left.left.isRed
        //   2) grandparent.right.isRed
        //     and grandparent.right.right.isRed
        if (n === n.parent.right && n.parent === n.grandparent.left) {
          n.parent.rotateLeft(this)
          // Since we rotated and want to use the previous
          // cases, we need to set n in such a way that
          // n.parent.isRed again
          n = n.left
        } else if (n === n.parent.left && n.parent === n.grandparent.right) {
          n.parent.rotateRight(this)
          // see above
          n = n.right
        }
        // Case 1) or 2) hold from here on.
        // Now traverse grandparent, make parent a black node
        // on the highest level which holds two red nodes.
        n.parent.blacken()
        n.grandparent.redden()
        if (n === n.parent.left) {
          // Case 1
          n.grandparent.rotateRight(this)
        } else {
          // Case 2
          n.grandparent.rotateLeft(this)
        }
      }
    }
    * flush () {}
  }

  Y.utils.RBTree = RBTree
}

},{}],10:[function(require,module,exports){
/* global Y, Element */
'use strict'

var diff = require('fast-diff')
var monacoIdentifierTemplate = { major: 0, minor: 0 }

function extend (Y) {
  Y.requestModules(['Array']).then(function () {
    class YText extends Y.Array.typeDefinition['class'] {
      constructor (os, _model, _content) {
        super(os, _model, _content)
        this.textfields = []
        this.aceInstances = []
        this.codeMirrorInstances = []
        this.monacoInstances = []
      }
      toString () {
        return this._content.map(function (c) {
          return c.val
        }).join('')
      }
      insert (pos, content) {
        var arr = content.split('')
        for (var i = 0; i < arr.length; i++) {
          if (/[\uD800-\uDFFF]/.test(arr[i])) {
            // is surrogate pair
            arr[i] = arr[i] + arr[i + 1]
            arr[i + 1] = ''
            i++
          }
        }
        super.insert(pos, arr)
      }
      delete (pos, length) {
        if (length == null) { length = 1 }
        if (typeof length !== 'number') {
          throw new Error('length must be a number!')
        }
        if (typeof pos !== 'number') {
          throw new Error('pos must be a number!')
        }
        if (pos + length > this._content.length || pos < 0 || length < 0) {
          throw new Error('The deletion range exceeds the range of the array!')
        }
        if (length === 0) {
          return
        }
        // This is for the case that part of a surrogate pair is deleted
        // we store surrogate pairs like this: [.., '🐇', '', ..] (string, code)
        if (this._content.length > pos + length && this._content[pos + length].val === '' && this._content[pos + length - 1].val.length === 2) {
          // case one. first part of the surrogate pair is deleted
          let token = this._content[pos + length - 1].val[0]
          super.delete(pos, length + 1)
          super.insert(pos, [token])
        } else if (pos > 0 && this._content[pos].val === '' && this._content[pos - 1].val.length === 2) {
          // case two. second part of the surrogate pair is deleted
          let token = this._content[pos - 1].val[1]
          super.delete(pos - 1, length + 1)
          super.insert(pos - 1, [token])
        } else {
          super.delete(pos, length)
        }
      }
      unbindAll () {
        this.unbindTextareaAll()
        this.unbindAceAll()
        this.unbindCodeMirrorAll()
        this.unbindMonacoAll()
      }
      // Monaco implementation
      unbindMonaco (monacoInstance) {
        var i = this.monacoInstances.findIndex(function (binding) {
          return binding.editor === monacoInstance
        })
        if (i >= 0) {
          var binding = this.monacoInstances[i]
          this.unobserve(binding.yCallback)
          binding.disposeBinding()
          this.monacoInstances.splice(i, 1)
        }
      }
      unbindMonacoAll () {
        for (let i = this.monacoInstances.length - 1; i >= 0; i--) {
          this.unbindMonaco(this.monacoInstances[i].editor)
        }
      }
      bindMonaco (monacoInstance, options) {
        var self = this
        options = options || {}

        // this function makes sure that either the
        // monaco event is executed, or the yjs observer is executed
        var token = true
        function mutualExcluse (f) {
          if (token) {
            token = false
            try {
              f()
            } catch (e) {
              token = true
              throw new Error(e)
            }
            token = true
          }
        }
        monacoInstance.setValue(this.toString())

        function monacoCallback (event) {
          mutualExcluse(function () {
            // compute start.. (col+row -> index position)
            // We shouldn't compute the offset on the old model..
            //    var start = monacoInstance.model.getOffsetAt({column: event.range.startColumn, lineNumber: event.range.startLineNumber})
            // So we compute the offset using the _content of this type
            for (var i = 0, line = 1; line < event.range.startLineNumber; i++) {
              if (self._content[i].val === '\n') {
                line++
              }
            }
            var start = i + event.range.startColumn - 1

            // apply the delete operation first
            if (event.rangeLength > 0) {
              self.delete(start, event.rangeLength)
            }
            // apply insert operation
            self.insert(start, event.text)
          })
        }
        var disposeBinding = monacoInstance.onDidChangeModelContent(monacoCallback).dispose

        function yCallback (event) {
          mutualExcluse(function () {
            let start = monacoInstance.model.getPositionAt(event.index)
            var end, text
            if (event.type === 'insert') {
              end = start
              text = event.values.join('')
            } else if (event.type === 'delete') {
              end = monacoInstance.model.modifyPosition(start, event.length)
              text = ''
            }
            var range = {
              startLineNumber: start.lineNumber,
              startColumn: start.column,
              endLineNumber: end.lineNumber,
              endColumn: end.column
            }
            var id = {
              major: monacoIdentifierTemplate.major,
              minor: monacoIdentifierTemplate.minor++
            }
            monacoInstance.executeEdits('Yjs', [{
              id: id,
              range: range,
              text: text,
              forceMoveMarkers: true
            }])
          })
        }
        this.observe(yCallback)
        this.monacoInstances.push({
          editor: monacoInstance,
          yCallback: yCallback,
          monacoCallback: monacoCallback,
          disposeBinding: disposeBinding
        })
      }
      // CodeMirror implementation..
      unbindCodeMirror (codeMirrorInstance) {
        var i = this.codeMirrorInstances.findIndex(function (binding) {
          return binding.editor === codeMirrorInstance
        })
        if (i >= 0) {
          var binding = this.codeMirrorInstances[i]
          this.unobserve(binding.yCallback)
          binding.editor.off('changes', binding.codeMirrorCallback)
          this.codeMirrorInstances.splice(i, 1)
        }
      }
      unbindCodeMirrorAll () {
        for (let i = this.codeMirrorInstances.length - 1; i >= 0; i--) {
          this.unbindCodeMirror(this.codeMirrorInstances[i].editor)
        }
      }
      bindCodeMirror (codeMirrorInstance, options) {
        var self = this
        options = options || {}

        // this function makes sure that either the
        // codemirror event is executed, or the yjs observer is executed
        var token = true
        function mutualExcluse (f) {
          if (token) {
            token = false
            try {
              f()
            } catch (e) {
              token = true
              throw new Error(e)
            }
            token = true
          }
        }
        codeMirrorInstance.setValue(this.toString())

        function codeMirrorCallback (cm, deltas) {
          mutualExcluse(function () {
            for (var i = 0; i < deltas.length; i++) {
              var delta = deltas[i]
              var start = codeMirrorInstance.indexFromPos(delta.from)
              // apply the delete operation first
              if (delta.removed.length > 0) {
                var delLength = 0
                for (var j = 0; j < delta.removed.length; j++) {
                  delLength += delta.removed[j].length
                }
                // "enter" is also a character in our case
                delLength += delta.removed.length - 1
                self.delete(start, delLength)
              }
              // apply insert operation
              self.insert(start, delta.text.join('\n'))
            }
          })
        }
        codeMirrorInstance.on('changes', codeMirrorCallback)

        function yCallback (event) {
          mutualExcluse(function () {
            let from = codeMirrorInstance.posFromIndex(event.index)
            if (event.type === 'insert') {
              let to = from
              codeMirrorInstance.replaceRange(event.values.join(''), from, to)
            } else if (event.type === 'delete') {
              let to = codeMirrorInstance.posFromIndex(event.index + event.length)
              codeMirrorInstance.replaceRange('', from, to)
            }
          })
        }
        this.observe(yCallback)
        this.codeMirrorInstances.push({
          editor: codeMirrorInstance,
          yCallback: yCallback,
          codeMirrorCallback: codeMirrorCallback
        })
      }
      unbindAce (aceInstance) {
        var i = this.aceInstances.findIndex(function (binding) {
          return binding.editor === aceInstance
        })
        if (i >= 0) {
          var binding = this.aceInstances[i]
          this.unobserve(binding.yCallback)
          binding.editor.off('change', binding.aceCallback)
          this.aceInstances.splice(i, 1)
        }
      }
      unbindAceAll () {
        for (let i = this.aceInstances.length - 1; i >= 0; i--) {
          this.unbindAce(this.aceInstances[i].editor)
        }
      }
      bindAce (aceInstance, options) {
        var self = this
        options = options || {}

        // this function makes sure that either the
        // ace event is executed, or the yjs observer is executed
        var token = true
        function mutualExcluse (f) {
          if (token) {
            token = false
            try {
              f()
            } catch (e) {
              token = true
              throw new Error(e)
            }
            token = true
          }
        }
        aceInstance.setValue(this.toString())

        function aceCallback (delta) {
          mutualExcluse(function () {
            var start
            var length

            var aceDocument = aceInstance.getSession().getDocument()
            if (delta.action === 'insert') {
              start = aceDocument.positionToIndex(delta.start, 0)
              self.insert(start, delta.lines.join('\n'))
            } else if (delta.action === 'remove') {
              start = aceDocument.positionToIndex(delta.start, 0)
              length = delta.lines.join('\n').length
              self.delete(start, length)
            }
          })
        }
        aceInstance.on('change', aceCallback)

        aceInstance.selection.clearSelection()

        // We don't that ace is a global variable
        // see #2
        var aceClass
        if (typeof ace !== 'undefined' && options.aceClass == null) {
          aceClass = ace // eslint-disable-line
        } else {
          aceClass = options.aceClass
        }
        var aceRequire = options.aceRequire || aceClass.require
        var Range = aceRequire('ace/range').Range

        function yCallback (event) {
          var aceDocument = aceInstance.getSession().getDocument()
          mutualExcluse(function () {
            if (event.type === 'insert') {
              let start = aceDocument.indexToPosition(event.index, 0)
              aceDocument.insert(start, event.values.join(''))
            } else if (event.type === 'delete') {
              let start = aceDocument.indexToPosition(event.index, 0)
              let end = aceDocument.indexToPosition(event.index + event.length, 0)
              var range = new Range(start.row, start.column, end.row, end.column)
              aceDocument.remove(range)
            }
          })
        }
        this.observe(yCallback)
        this.aceInstances.push({
          editor: aceInstance,
          yCallback: yCallback,
          aceCallback: aceCallback
        })
      }
      bind () {
        var e = arguments[0]
        if (e instanceof Element) {
          this.bindTextarea.apply(this, arguments)
        } else if (e != null && e.session != null && e.getSession != null && e.setValue != null) {
          this.bindAce.apply(this, arguments)
        } else if (e != null && e.posFromIndex != null && e.replaceRange != null) {
          this.bindCodeMirror.apply(this, arguments)
        } else if (e != null && e.onDidChangeModelContent != null) {
          this.bindMonaco.apply(this, arguments)
        } else {
          console.error('Cannot bind, unsupported editor!')
        }
      }
      unbindTextarea (textarea) {
        var i = this.textfields.findIndex(function (binding) {
          return binding.editor === textarea
        })
        if (i >= 0) {
          var binding = this.textfields[i]
          this.unobserve(binding.yCallback)
          var e = binding.editor
          e.removeEventListener('input', binding.eventListener)
          this.textfields.splice(i, 1)
        }
      }
      unbindTextareaAll () {
        for (let i = this.textfields.length - 1; i >= 0; i--) {
          this.unbindTextarea(this.textfields[i].editor)
        }
      }
      bindTextarea (textfield, domRoot) {
        domRoot = domRoot || window; // eslint-disable-line
        if (domRoot.getSelection == null) {
          domRoot = window; // eslint-disable-line
        }

        // don't duplicate!
        for (var t = 0; t < this.textfields.length; t++) {
          if (this.textfields[t].editor === textfield) {
            return
          }
        }
        // this function makes sure that either the
        // textfieldt event is executed, or the yjs observer is executed
        var token = true
        function mutualExcluse (f) {
          if (token) {
            token = false
            try {
              f()
            } catch (e) {
              token = true
              throw new Error(e)
            }
            token = true
          }
        }

        var self = this
        textfield.value = this.toString()

        var createRange, writeRange, writeContent, getContent
        if (textfield.selectionStart != null && textfield.setSelectionRange != null) {
          createRange = function (fix) {
            var left = textfield.selectionStart
            var right = textfield.selectionEnd
            if (fix != null) {
              left = fix(left)
              right = fix(right)
            }
            return {
              left: left,
              right: right
            }
          }
          writeRange = function (range) {
            writeContent(self.toString())
            textfield.setSelectionRange(range.left, range.right)
          }
          writeContent = function (content) {
            textfield.value = content
          }
          getContent = function () {
            return textfield.value
          }
        } else {
          createRange = function (fix) {
            var range = {}
            var s = domRoot.getSelection()
            var clength = textfield.textContent.length
            range.left = Math.min(s.anchorOffset, clength)
            range.right = Math.min(s.focusOffset, clength)
            if (fix != null) {
              range.left = fix(range.left)
              range.right = fix(range.right)
            }
            var editedElement = s.focusNode
            if (editedElement === textfield || editedElement === textfield.childNodes[0]) {
              range.isReal = true
            } else {
              range.isReal = false
            }
            return range
          }

          writeRange = function (range) {
            writeContent(self.toString())
            var textnode = textfield.childNodes[0]
            if (range.isReal && textnode != null) {
              if (range.left < 0) {
                range.left = 0
              }
              range.right = Math.max(range.left, range.right)
              if (range.right > textnode.length) {
                range.right = textnode.length
              }
              range.left = Math.min(range.left, range.right)
              var r = document.createRange(); // eslint-disable-line
              r.setStart(textnode, range.left)
              r.setEnd(textnode, range.right)
              var s = domRoot.getSelection(); // eslint-disable-line
              s.removeAllRanges()
              s.addRange(r)
            }
          }
          writeContent = function (content) {
            textfield.innerText = content
            /*
            var contentArray = content.replace(new RegExp('\n', 'g'), ' ').split(' '); // eslint-disable-line
            textfield.innerText = ''
            for (var i = 0; i < contentArray.length; i++) {
              var c = contentArray[i]
              textfield.innerText += c
              if (i !== contentArray.length - 1) {
                textfield.innerHTML += '&nbsp;'
              }
            }
            */
          }
          getContent = function () {
            return textfield.innerText
          }
        }
        writeContent(this.toString())

        function yCallback (event) {
          mutualExcluse(() => {
            var oPos, fix
            if (event.type === 'insert') {
              oPos = event.index
              fix = function (cursor) { // eslint-disable-line
                if (cursor <= oPos) {
                  return cursor
                } else {
                  cursor += 1
                  return cursor
                }
              }
              var r = createRange(fix)
              writeRange(r)
            } else if (event.type === 'delete') {
              oPos = event.index
              fix = function (cursor) { // eslint-disable-line
                if (cursor < oPos) {
                  return cursor
                } else {
                  cursor -= 1
                  return cursor
                }
              }
              r = createRange(fix)
              writeRange(r)
            }
          })
        }
        this.observe(yCallback)

        var textfieldObserver = function textfieldObserver () {
          mutualExcluse(function () {
            var r = createRange(function (x) { return x })
            var oldContent = self.toString()
            var content = getContent()
            var diffs = diff(oldContent, content, r.left)
            var pos = 0
            for (var i = 0; i < diffs.length; i++) {
              var d = diffs[i]
              if (d[0] === 0) { // EQUAL
                pos += d[1].length
              } else if (d[0] === -1) { // DELETE
                self.delete(pos, d[1].length)
              } else { // INSERT
                self.insert(pos, d[1])
                pos += d[1].length
              }
            }
          })
        }
        textfield.addEventListener('input', textfieldObserver)
        this.textfields.push({
          editor: textfield,
          yCallback: yCallback,
          eventListener: textfieldObserver
        })
      }
      _destroy () {
        this.unbindAll()
        this.textfields = null
        this.aceInstances = null
        super._destroy()
      }
    }
    Y.extend('Text', new Y.utils.CustomTypeDefinition({
      name: 'Text',
      class: YText,
      struct: 'List',
      initType: function * YTextInitializer (os, model) {
        var _content = []
        yield * Y.Struct.List.map.call(this, model, function (op) {
          if (op.hasOwnProperty('opContent')) {
            throw new Error('Text must not contain types!')
          } else {
            op.content.forEach(function (c, i) {
              _content.push({
                id: [op.id[0], op.id[1] + i],
                val: op.content[i]
              })
            })
          }
        })
        return new YText(os, model.id, _content)
      },
      createType: function YTextCreator (os, model) {
        return new YText(os, model.id, [])
      }
    }))
  })
}

module.exports = extend
if (typeof Y !== 'undefined') {
  extend(Y)
}

},{"fast-diff":3}],11:[function(require,module,exports){
function canRead (auth) { return auth === 'read' || auth === 'write' }
function canWrite (auth) { return auth === 'write' }

module.exports = function (Y/* :any */) {
  class AbstractConnector {
    /* ::
    y: YConfig;
    role: SyncRole;
    connections: Object;
    isSynced: boolean;
    userEventListeners: Array<Function>;
    whenSyncedListeners: Array<Function>;
    currentSyncTarget: ?UserId;
    syncingClients: Array<UserId>;
    forwardToSyncingClients: boolean;
    debug: boolean;
    syncStep2: Promise;
    userId: UserId;
    send: Function;
    broadcast: Function;
    broadcastOpBuffer: Array<Operation>;
    protocolVersion: number;
    */
    /*
      opts contains the following information:
       role : String Role of this client ("master" or "slave")
       userId : String Uniquely defines the user.
       debug: Boolean Whether to print debug messages (optional)
    */
    constructor (y, opts) {
      this.y = y
      if (opts == null) {
        opts = {}
      }
      // Prefer to receive untransformed operations. This does only work if
      // this client receives operations from only one other client.
      // In particular, this does not work with y-webrtc.
      // It will work with y-websockets-client
      if (opts.role == null || opts.role === 'master') {
        this.role = 'master'
      } else if (opts.role === 'slave') {
        this.role = 'slave'
      } else {
        throw new Error("Role must be either 'master' or 'slave'!")
      }
      this.log = Y.debug('y:connector')
      this.logMessage = Y.debug('y:connector-message')
      this.y.db.forwardAppliedOperations = opts.forwardAppliedOperations || false
      this.role = opts.role
      this.connections = {}
      this.isSynced = false
      this.userEventListeners = []
      this.whenSyncedListeners = []
      this.currentSyncTarget = null
      this.syncingClients = []
      this.forwardToSyncingClients = opts.forwardToSyncingClients !== false
      this.debug = opts.debug === true
      this.syncStep2 = Promise.resolve()
      this.broadcastOpBuffer = []
      this.protocolVersion = 11
      this.authInfo = opts.auth || null
      this.checkAuth = opts.checkAuth || function () { return Promise.resolve('write') } // default is everyone has write access
      if (opts.generateUserId === true) {
        this.setUserId(Y.utils.generateGuid())
      }
    }
    resetAuth (auth) {
      if (this.authInfo !== auth) {
        this.authInfo = auth
        this.broadcast({
          type: 'auth',
          auth: this.authInfo
        })
      }
    }
    reconnect () {
      this.log('reconnecting..')
      return this.y.db.startGarbageCollector()
    }
    disconnect () {
      this.log('discronnecting..')
      this.connections = {}
      this.isSynced = false
      this.currentSyncTarget = null
      this.syncingClients = []
      this.whenSyncedListeners = []
      this.y.db.stopGarbageCollector()
      return this.y.db.whenTransactionsFinished()
    }
    repair () {
      this.log('Repairing the state of Yjs. This can happen if messages get lost, and Yjs detects that something is wrong. If this happens often, please report an issue here: https://github.com/y-js/yjs/issues')
      for (var name in this.connections) {
        this.connections[name].isSynced = false
      }
      this.isSynced = false
      this.currentSyncTarget = null
      this.findNextSyncTarget()
    }
    setUserId (userId) {
      if (this.userId == null) {
        this.log('Set userId to "%s"', userId)
        this.userId = userId
        return this.y.db.setUserId(userId)
      } else {
        return null
      }
    }
    onUserEvent (f) {
      this.userEventListeners.push(f)
    }
    removeUserEventListener (f) {
      this.userEventListeners = this.userEventListeners.filter(g => { f !== g })
    }
    userLeft (user) {
      if (this.connections[user] != null) {
        this.log('User left: %s', user)
        delete this.connections[user]
        if (user === this.currentSyncTarget) {
          this.currentSyncTarget = null
          this.findNextSyncTarget()
        }
        this.syncingClients = this.syncingClients.filter(function (cli) {
          return cli !== user
        })
        for (var f of this.userEventListeners) {
          f({
            action: 'userLeft',
            user: user
          })
        }
      }
    }
    userJoined (user, role) {
      if (role == null) {
        throw new Error('You must specify the role of the joined user!')
      }
      if (this.connections[user] != null) {
        throw new Error('This user already joined!')
      }
      this.log('User joined: %s', user)
      this.connections[user] = {
        isSynced: false,
        role: role
      }
      for (var f of this.userEventListeners) {
        f({
          action: 'userJoined',
          user: user,
          role: role
        })
      }
      if (this.currentSyncTarget == null) {
        this.findNextSyncTarget()
      }
    }
    // Execute a function _when_ we are connected.
    // If not connected, wait until connected
    whenSynced (f) {
      if (this.isSynced) {
        f()
      } else {
        this.whenSyncedListeners.push(f)
      }
    }
    findNextSyncTarget () {
      if (this.currentSyncTarget != null) {
        return // "The current sync has not finished!"
      }

      var syncUser = null
      for (var uid in this.connections) {
        if (!this.connections[uid].isSynced) {
          syncUser = uid
          break
        }
      }
      var conn = this
      if (syncUser != null) {
        this.currentSyncTarget = syncUser
        this.y.db.requestTransaction(function *() {
          var stateSet = yield* this.getStateSet()
          var deleteSet = yield* this.getDeleteSet()
          var answer = {
            type: 'sync step 1',
            stateSet: stateSet,
            deleteSet: deleteSet,
            protocolVersion: conn.protocolVersion,
            auth: conn.authInfo
          }
          conn.send(syncUser, answer)
        })
      } else {
        if (!conn.isSynced) {
          this.y.db.requestTransaction(function *() {
            if (!conn.isSynced) {
              // it is crucial that isSynced is set at the time garbageCollectAfterSync is called
              conn.isSynced = true
              yield* this.garbageCollectAfterSync()
              // call whensynced listeners
              for (var f of conn.whenSyncedListeners) {
                f()
              }
              conn.whenSyncedListeners = []
            }
          })
        }
      }
    }
    send (uid, message) {
      this.log('Send \'%s\' to %s', message.type, uid)
      this.logMessage('Message: %j', message)
    }
    broadcast (message) {
      this.log('Broadcast \'%s\'', message.type)
      this.logMessage('Message: %j', message)
    }
    /*
      Buffer operations, and broadcast them when ready.
    */
    broadcastOps (ops) {
      ops = ops.map(function (op) {
        return Y.Struct[op.struct].encode(op)
      })
      var self = this
      function broadcastOperations () {
        if (self.broadcastOpBuffer.length > 0) {
          self.broadcast({
            type: 'update',
            ops: self.broadcastOpBuffer
          })
          self.broadcastOpBuffer = []
        }
      }
      if (this.broadcastOpBuffer.length === 0) {
        this.broadcastOpBuffer = ops
        if (this.y.db.transactionInProgress) {
          this.y.db.whenTransactionsFinished().then(broadcastOperations)
        } else {
          setTimeout(broadcastOperations, 0)
        }
      } else {
        this.broadcastOpBuffer = this.broadcastOpBuffer.concat(ops)
      }
    }
    /*
      You received a raw message, and you know that it is intended for Yjs. Then call this function.
    */
    receiveMessage (sender/* :UserId */, message/* :Message */) {
      if (sender === this.userId) {
        return Promise.resolve()
      }
      this.log('Receive \'%s\' from %s', message.type, sender)
      this.logMessage('Message: %j', message)
      if (message.protocolVersion != null && message.protocolVersion !== this.protocolVersion) {
        this.log(
          `You tried to sync with a yjs instance that has a different protocol version
          (You: ${this.protocolVersion}, Client: ${message.protocolVersion}).
          The sync was stopped. You need to upgrade your dependencies (especially Yjs & the Connector)!
          `)
        this.send(sender, {
          type: 'sync stop',
          protocolVersion: this.protocolVersion
        })
        return Promise.reject('Incompatible protocol version')
      }
      if (message.auth != null && this.connections[sender] != null) {
        // authenticate using auth in message
        var auth = this.checkAuth(message.auth, this.y, sender)
        this.connections[sender].auth = auth
        auth.then(auth => {
          for (var f of this.userEventListeners) {
            f({
              action: 'userAuthenticated',
              user: sender,
              auth: auth
            })
          }
        })
      } else if (this.connections[sender] != null && this.connections[sender].auth == null) {
        // authenticate without otherwise
        this.connections[sender].auth = this.checkAuth(null, this.y, sender)
      }
      if (this.connections[sender] != null && this.connections[sender].auth != null) {
        return this.connections[sender].auth.then((auth) => {
          if (message.type === 'sync step 1' && canRead(auth)) {
            let conn = this
            let m = message

            this.y.db.requestTransaction(function *() {
              var currentStateSet = yield* this.getStateSet()
              if (canWrite(auth)) {
                yield* this.applyDeleteSet(m.deleteSet)
              }

              var ds = yield* this.getDeleteSet()
              var answer = {
                type: 'sync step 2',
                stateSet: currentStateSet,
                deleteSet: ds,
                protocolVersion: this.protocolVersion,
                auth: this.authInfo
              }
              answer.os = yield* this.getOperations(m.stateSet)
              conn.send(sender, answer)
              if (this.forwardToSyncingClients) {
                conn.syncingClients.push(sender)
                setTimeout(function () {
                  conn.syncingClients = conn.syncingClients.filter(function (cli) {
                    return cli !== sender
                  })
                  conn.send(sender, {
                    type: 'sync done'
                  })
                }, 5000) // TODO: conn.syncingClientDuration)
              } else {
                conn.send(sender, {
                  type: 'sync done'
                })
              }
            })
          } else if (message.type === 'sync step 2' && canWrite(auth)) {
            var db = this.y.db
            var defer = {}
            defer.promise = new Promise(function (resolve) {
              defer.resolve = resolve
            })
            this.syncStep2 = defer.promise
            let m /* :MessageSyncStep2 */ = message
            db.requestTransaction(function * () {
              yield* this.applyDeleteSet(m.deleteSet)
              if (m.osUntransformed != null) {
                yield* this.applyOperationsUntransformed(m.osUntransformed, m.stateSet)
              } else {
                this.store.apply(m.os)
              }
              /*
               * This just sends the complete hb after some time
               * Mostly for debugging..
               *
              db.requestTransaction(function * () {
                var ops = yield* this.getOperations(m.stateSet)
                if (ops.length > 0) {
                  if (!broadcastHB) { // TODO: consider to broadcast here..
                    conn.send(sender, {
                      type: 'update',
                      ops: ops
                    })
                  } else {
                    // broadcast only once!
                    conn.broadcastOps(ops)
                  }
                }
              })
              */
              defer.resolve()
            })
          } else if (message.type === 'sync done') {
            var self = this
            this.syncStep2.then(function () {
              self._setSyncedWith(sender)
            })
          } else if (message.type === 'update' && canWrite(auth)) {
            if (this.forwardToSyncingClients) {
              for (var client of this.syncingClients) {
                this.send(client, message)
              }
            }
            if (this.y.db.forwardAppliedOperations) {
              var delops = message.ops.filter(function (o) {
                return o.struct === 'Delete'
              })
              if (delops.length > 0) {
                this.broadcastOps(delops)
              }
            }
            this.y.db.apply(message.ops)
          }
        })
      } else {
        return Promise.reject('Unable to deliver message')
      }
    }
    _setSyncedWith (user) {
      var conn = this.connections[user]
      if (conn != null) {
        conn.isSynced = true
      }
      if (user === this.currentSyncTarget) {
        this.currentSyncTarget = null
        this.findNextSyncTarget()
      }
    }
    /*
      Currently, the HB encodes operations as JSON. For the moment I want to keep it
      that way. Maybe we support encoding in the HB as XML in the future, but for now I don't want
      too much overhead. Y is very likely to get changed a lot in the future

      Because we don't want to encode JSON as string (with character escaping, wich makes it pretty much unreadable)
      we encode the JSON as XML.

      When the HB support encoding as XML, the format should look pretty much like this.

      does not support primitive values as array elements
      expects an ltx (less than xml) object
    */
    parseMessageFromXml (m/* :any */) {
      function parseArray (node) {
        for (var n of node.children) {
          if (n.getAttribute('isArray') === 'true') {
            return parseArray(n)
          } else {
            return parseObject(n)
          }
        }
      }
      function parseObject (node/* :any */) {
        var json = {}
        for (var attrName in node.attrs) {
          var value = node.attrs[attrName]
          var int = parseInt(value, 10)
          if (isNaN(int) || ('' + int) !== value) {
            json[attrName] = value
          } else {
            json[attrName] = int
          }
        }
        for (var n/* :any */ in node.children) {
          var name = n.name
          if (n.getAttribute('isArray') === 'true') {
            json[name] = parseArray(n)
          } else {
            json[name] = parseObject(n)
          }
        }
        return json
      }
      parseObject(m)
    }
    /*
      encode message in xml
      we use string because Strophe only accepts an "xml-string"..
      So {a:4,b:{c:5}} will look like
      <y a="4">
        <b c="5"></b>
      </y>
      m - ltx element
      json - Object
    */
    encodeMessageToXml (msg, obj) {
      // attributes is optional
      function encodeObject (m, json) {
        for (var name in json) {
          var value = json[name]
          if (name == null) {
            // nop
          } else if (value.constructor === Object) {
            encodeObject(m.c(name), value)
          } else if (value.constructor === Array) {
            encodeArray(m.c(name), value)
          } else {
            m.setAttribute(name, value)
          }
        }
      }
      function encodeArray (m, array) {
        m.setAttribute('isArray', 'true')
        for (var e of array) {
          if (e.constructor === Object) {
            encodeObject(m.c('array-element'), e)
          } else {
            encodeArray(m.c('array-element'), e)
          }
        }
      }
      if (obj.constructor === Object) {
        encodeObject(msg.c('y', { xmlns: 'http://y.ninja/connector-stanza' }), obj)
      } else if (obj.constructor === Array) {
        encodeArray(msg.c('y', { xmlns: 'http://y.ninja/connector-stanza' }), obj)
      } else {
        throw new Error("I can't encode this json!")
      }
    }
  }
  Y.AbstractConnector = AbstractConnector
}

},{}],12:[function(require,module,exports){
/* global getRandom, async */
'use strict'

module.exports = function (Y) {
  var globalRoom = {
    users: {},
    buffers: {},
    removeUser: function (user) {
      for (var i in this.users) {
        this.users[i].userLeft(user)
      }
      delete this.users[user]
      delete this.buffers[user]
    },
    addUser: function (connector) {
      this.users[connector.userId] = connector
      this.buffers[connector.userId] = {}
      for (var uname in this.users) {
        if (uname !== connector.userId) {
          var u = this.users[uname]
          u.userJoined(connector.userId, 'master')
          connector.userJoined(u.userId, 'master')
        }
      }
    },
    whenTransactionsFinished: function () {
      var self = this
      return new Promise(function (resolve, reject) {
        // The connector first has to send the messages to the db.
        // Wait for the checkAuth-function to resolve
        // The test lib only has a simple checkAuth function: `() => Promise.resolve()`
        // Just add a function to the event-queue, in order to wait for the event.
        // TODO: this may be buggy in test applications (but it isn't be for real-life apps)
        setTimeout(function () {
          var ps = []
          for (var name in self.users) {
            ps.push(self.users[name].y.db.whenTransactionsFinished())
          }
          Promise.all(ps).then(resolve, reject)
        }, 10)
      })
    },
    flushOne: function flushOne () {
      var bufs = []
      for (var receiver in globalRoom.buffers) {
        let buff = globalRoom.buffers[receiver]
        var push = false
        for (let sender in buff) {
          if (buff[sender].length > 0) {
            push = true
            break
          }
        }
        if (push) {
          bufs.push(receiver)
        }
      }
      if (bufs.length > 0) {
        var userId = getRandom(bufs)
        let buff = globalRoom.buffers[userId]
        let sender = getRandom(Object.keys(buff))
        var m = buff[sender].shift()
        if (buff[sender].length === 0) {
          delete buff[sender]
        }
        var user = globalRoom.users[userId]
        return user.receiveMessage(m[0], m[1]).then(function () {
          return user.y.db.whenTransactionsFinished()
        }, function () {})
      } else {
        return false
      }
    },
    flushAll: function () {
      return new Promise(function (resolve) {
        // flushes may result in more created operations,
        // flush until there is nothing more to flush
        function nextFlush () {
          var c = globalRoom.flushOne()
          if (c) {
            while (c) {
              c = globalRoom.flushOne()
            }
            globalRoom.whenTransactionsFinished().then(nextFlush)
          } else {
            c = globalRoom.flushOne()
            if (c) {
              c.then(function () {
                globalRoom.whenTransactionsFinished().then(nextFlush)
              })
            } else {
              resolve()
            }
          }
        }
        globalRoom.whenTransactionsFinished().then(nextFlush)
      })
    }
  }
  Y.utils.globalRoom = globalRoom

  var userIdCounter = 0

  class Test extends Y.AbstractConnector {
    constructor (y, options) {
      if (options === undefined) {
        throw new Error('Options must not be undefined!')
      }
      options.role = 'master'
      options.forwardToSyncingClients = false
      super(y, options)
      this.setUserId((userIdCounter++) + '').then(() => {
        globalRoom.addUser(this)
      })
      this.globalRoom = globalRoom
      this.syncingClientDuration = 0
    }
    receiveMessage (sender, m) {
      return super.receiveMessage(sender, JSON.parse(JSON.stringify(m)))
    }
    send (userId, message) {
      var buffer = globalRoom.buffers[userId]
      if (buffer != null) {
        if (buffer[this.userId] == null) {
          buffer[this.userId] = []
        }
        buffer[this.userId].push(JSON.parse(JSON.stringify([this.userId, message])))
      }
    }
    broadcast (message) {
      for (var key in globalRoom.buffers) {
        var buff = globalRoom.buffers[key]
        if (buff[this.userId] == null) {
          buff[this.userId] = []
        }
        buff[this.userId].push(JSON.parse(JSON.stringify([this.userId, message])))
      }
    }
    isDisconnected () {
      return globalRoom.users[this.userId] == null
    }
    reconnect () {
      if (this.isDisconnected()) {
        globalRoom.addUser(this)
        super.reconnect()
      }
      return Y.utils.globalRoom.flushAll()
    }
    disconnect () {
      var waitForMe = Promise.resolve()
      if (!this.isDisconnected()) {
        globalRoom.removeUser(this.userId)
        waitForMe = super.disconnect()
      }
      var self = this
      return waitForMe.then(function () {
        return self.y.db.whenTransactionsFinished()
      })
    }
    flush () {
      var self = this
      return async(function * () {
        var buff = globalRoom.buffers[self.userId]
        while (Object.keys(buff).length > 0) {
          var sender = getRandom(Object.keys(buff))
          var m = buff[sender].shift()
          if (buff[sender].length === 0) {
            delete buff[sender]
          }
          yield this.receiveMessage(m[0], m[1])
        }
        yield self.whenTransactionsFinished()
      })
    }
  }

  Y.Test = Test
}

},{}],13:[function(require,module,exports){
/* @flow */
'use strict'

module.exports = function (Y /* :any */) {
  /*
    Partial definition of an OperationStore.
    TODO: name it Database, operation store only holds operations.

    A database definition must alse define the following methods:
    * logTable() (optional)
      - show relevant information information in a table
    * requestTransaction(makeGen)
      - request a transaction
    * destroy()
      - destroy the database
  */
  class AbstractDatabase {
    /* ::
    y: YConfig;
    forwardAppliedOperations: boolean;
    listenersById: Object;
    listenersByIdExecuteNow: Array<Object>;
    listenersByIdRequestPending: boolean;
    initializedTypes: Object;
    whenUserIdSetListener: ?Function;
    waitingTransactions: Array<Transaction>;
    transactionInProgress: boolean;
    executeOrder: Array<Object>;
    gc1: Array<Struct>;
    gc2: Array<Struct>;
    gcTimeout: number;
    gcInterval: any;
    garbageCollect: Function;
    executeOrder: Array<any>; // for debugging only
    userId: UserId;
    opClock: number;
    transactionsFinished: ?{promise: Promise, resolve: any};
    transact: (x: ?Generator) => any;
    */
    constructor (y, opts) {
      this.y = y
      this.dbOpts = opts
      var os = this
      this.userId = null
      var resolve
      this.userIdPromise = new Promise(function (r) {
        resolve = r
      })
      this.userIdPromise.resolve = resolve
      // whether to broadcast all applied operations (insert & delete hook)
      this.forwardAppliedOperations = false
      // E.g. this.listenersById[id] : Array<Listener>
      this.listenersById = {}
      // Execute the next time a transaction is requested
      this.listenersByIdExecuteNow = []
      // A transaction is requested
      this.listenersByIdRequestPending = false
      /* To make things more clear, the following naming conventions:
         * ls : we put this.listenersById on ls
         * l : Array<Listener>
         * id : Id (can't use as property name)
         * sid : String (converted from id via JSON.stringify
                         so we can use it as a property name)

        Always remember to first overwrite
        a property before you iterate over it!
      */
      // TODO: Use ES7 Weak Maps. This way types that are no longer user,
      // wont be kept in memory.
      this.initializedTypes = {}
      this.waitingTransactions = []
      this.transactionInProgress = false
      this.transactionIsFlushed = false
      if (typeof YConcurrency_TestingMode !== 'undefined') {
        this.executeOrder = []
      }
      this.gc1 = [] // first stage
      this.gc2 = [] // second stage -> after that, remove the op

      function garbageCollect () {
        return os.whenTransactionsFinished().then(function () {
          if (os.gc1.length > 0 || os.gc2.length > 0) {
            if (!os.y.connector.isSynced) {
              console.warn('gc should be empty when not synced!')
            }
            return new Promise((resolve) => {
              os.requestTransaction(function * () {
                if (os.y.connector != null && os.y.connector.isSynced) {
                  for (var i = 0; i < os.gc2.length; i++) {
                    var oid = os.gc2[i]
                    yield* this.garbageCollectOperation(oid)
                  }
                  os.gc2 = os.gc1
                  os.gc1 = []
                }
                // TODO: Use setInterval here instead (when garbageCollect is called several times there will be several timeouts..)
                if (os.gcTimeout > 0) {
                  os.gcInterval = setTimeout(garbageCollect, os.gcTimeout)
                }
                resolve()
              })
            })
          } else {
            // TODO: see above
            if (os.gcTimeout > 0) {
              os.gcInterval = setTimeout(garbageCollect, os.gcTimeout)
            }
            return Promise.resolve()
          }
        })
      }
      this.garbageCollect = garbageCollect
      this.startGarbageCollector()

      this.repairCheckInterval = !opts.repairCheckInterval ? 6000 : opts.repairCheckInterval
      this.opsReceivedTimestamp = new Date()
      this.startRepairCheck()
    }
    startGarbageCollector () {
      this.gc = this.dbOpts.gc == null || this.dbOpts.gc
      if (this.gc) {
        this.gcTimeout = !this.dbOpts.gcTimeout ? 50000 : this.dbOpts.gcTimeout
      } else {
        this.gcTimeout = -1
      }
      if (this.gcTimeout > 0) {
        this.garbageCollect()
      }
    }
    startRepairCheck () {
      var os = this
      if (this.repairCheckInterval > 0) {
        this.repairCheckIntervalHandler = setInterval(function repairOnMissingOperations () {
          /*
            Case 1. No ops have been received in a while (new Date() - os.opsReceivedTimestamp > os.repairCheckInterval)
              - 1.1 os.listenersById is empty. Then the state was correct the whole time. -> Nothing to do (nor to update)
              - 1.2 os.listenersById is not empty.
                      * Then the state was incorrect for at least {os.repairCheckInterval} seconds.
                      * -> Remove everything in os.listenersById and sync again (connector.repair())
            Case 2. An op has been received in the last {os.repairCheckInterval } seconds.
                    It is not yet necessary to check for faulty behavior. Everything can still resolve itself. Wait for more messages.
                    If nothing was received for a while and os.listenersById is still not emty, we are in case 1.2
                    -> Do nothing

            Baseline here is: we really only have to catch case 1.2..
          */
          if (
            new Date() - os.opsReceivedTimestamp > os.repairCheckInterval &&
            Object.keys(os.listenersById).length > 0 // os.listenersById is not empty
          ) {
            // haven't received operations for over {os.repairCheckInterval} seconds, resend state vector
            os.listenersById = {}
            os.opsReceivedTimestamp = new Date() // update so you don't send repair several times in a row
            os.y.connector.repair()
          }
        }, this.repairCheckInterval)
      }
    }
    stopRepairCheck () {
      clearInterval(this.repairCheckIntervalHandler)
    }
    queueGarbageCollector (id) {
      if (this.y.connector.isSynced && this.gc) {
        this.gc1.push(id)
      }
    }
    emptyGarbageCollector () {
      return new Promise(resolve => {
        var check = () => {
          if (this.gc1.length > 0 || this.gc2.length > 0) {
            this.garbageCollect().then(check)
          } else {
            resolve()
          }
        }
        setTimeout(check, 0)
      })
    }
    addToDebug () {
      if (typeof YConcurrency_TestingMode !== 'undefined') {
        var command /* :string */ = Array.prototype.map.call(arguments, function (s) {
          if (typeof s === 'string') {
            return s
          } else {
            return JSON.stringify(s)
          }
        }).join('').replace(/"/g, "'").replace(/,/g, ', ').replace(/:/g, ': ')
        this.executeOrder.push(command)
      }
    }
    getDebugData () {
      console.log(this.executeOrder.join('\n'))
    }
    stopGarbageCollector () {
      var self = this
      this.gc = false
      this.gcTimeout = -1
      return new Promise(function (resolve) {
        self.requestTransaction(function * () {
          var ungc /* :Array<Struct> */ = self.gc1.concat(self.gc2)
          self.gc1 = []
          self.gc2 = []
          for (var i = 0; i < ungc.length; i++) {
            var op = yield* this.getOperation(ungc[i])
            if (op != null) {
              delete op.gc
              yield* this.setOperation(op)
            }
          }
          resolve()
        })
      })
    }
    /*
      Try to add to GC.

      TODO: rename this function

      Rulez:
      * Only gc if this user is online & gc turned on
      * The most left element in a list must not be gc'd.
        => There is at least one element in the list

      returns true iff op was added to GC
    */
    * addToGarbageCollector (op, left) {
      if (
        op.gc == null &&
        op.deleted === true &&
        this.store.gc &&
        this.store.y.connector.isSynced
      ) {
        var gc = false
        if (left != null && left.deleted === true) {
          gc = true
        } else if (op.content != null && op.content.length > 1) {
          op = yield* this.getInsertionCleanStart([op.id[0], op.id[1] + 1])
          gc = true
        }
        if (gc) {
          op.gc = true
          yield* this.setOperation(op)
          this.store.queueGarbageCollector(op.id)
          return true
        }
      }
      return false
    }
    removeFromGarbageCollector (op) {
      function filter (o) {
        return !Y.utils.compareIds(o, op.id)
      }
      this.gc1 = this.gc1.filter(filter)
      this.gc2 = this.gc2.filter(filter)
      delete op.gc
    }
    destroyTypes () {
      for (var key in this.initializedTypes) {
        var type = this.initializedTypes[key]
        if (type._destroy != null) {
          type._destroy()
        } else {
          console.error('The type you included does not provide destroy functionality, it will remain in memory (updating your packages will help).')
        }
      }
    }
    * destroy () {
      clearInterval(this.gcInterval)
      this.gcInterval = null
      this.stopRepairCheck()
    }
    setUserId (userId) {
      if (!this.userIdPromise.inProgress) {
        this.userIdPromise.inProgress = true
        var self = this
        self.requestTransaction(function * () {
          self.userId = userId
          var state = yield* this.getState(userId)
          self.opClock = state.clock
          self.userIdPromise.resolve(userId)
        })
      }
      return this.userIdPromise
    }
    whenUserIdSet (f) {
      this.userIdPromise.then(f)
    }
    getNextOpId (numberOfIds) {
      if (numberOfIds == null) {
        throw new Error('getNextOpId expects the number of created ids to create!')
      } else if (this.userId == null) {
        throw new Error('OperationStore not yet initialized!')
      } else {
        var id = [this.userId, this.opClock]
        this.opClock += numberOfIds
        return id
      }
    }
    /*
      Apply a list of operations.

      * we save a timestamp, because we received new operations that could resolve ops in this.listenersById (see this.startRepairCheck)
      * get a transaction
      * check whether all Struct.*.requiredOps are in the OS
      * check if it is an expected op (otherwise wait for it)
      * check if was deleted, apply a delete operation after op was applied
    */
    apply (ops) {
      this.opsReceivedTimestamp = new Date()
      for (var i = 0; i < ops.length; i++) {
        var o = ops[i]
        if (o.id == null || o.id[0] !== this.y.connector.userId) {
          var required = Y.Struct[o.struct].requiredOps(o)
          if (o.requires != null) {
            required = required.concat(o.requires)
          }
          this.whenOperationsExist(required, o)
        }
      }
    }
    /*
      op is executed as soon as every operation requested is available.
      Note that Transaction can (and should) buffer requests.
    */
    whenOperationsExist (ids, op) {
      if (ids.length > 0) {
        let listener = {
          op: op,
          missing: ids.length
        }

        for (let i = 0; i < ids.length; i++) {
          let id = ids[i]
          let sid = JSON.stringify(id)
          let l = this.listenersById[sid]
          if (l == null) {
            l = []
            this.listenersById[sid] = l
          }
          l.push(listener)
        }
      } else {
        this.listenersByIdExecuteNow.push({
          op: op
        })
      }

      if (this.listenersByIdRequestPending) {
        return
      }

      this.listenersByIdRequestPending = true
      var store = this

      this.requestTransaction(function * () {
        var exeNow = store.listenersByIdExecuteNow
        store.listenersByIdExecuteNow = []

        var ls = store.listenersById
        store.listenersById = {}

        store.listenersByIdRequestPending = false

        for (let key = 0; key < exeNow.length; key++) {
          let o = exeNow[key].op
          yield* store.tryExecute.call(this, o)
        }

        for (var sid in ls) {
          var l = ls[sid]
          var id = JSON.parse(sid)
          var op
          if (typeof id[1] === 'string') {
            op = yield* this.getOperation(id)
          } else {
            op = yield* this.getInsertion(id)
          }
          if (op == null) {
            store.listenersById[sid] = l
          } else {
            for (let i = 0; i < l.length; i++) {
              let listener = l[i]
              let o = listener.op
              if (--listener.missing === 0) {
                yield* store.tryExecute.call(this, o)
              }
            }
          }
        }
      })
    }
    /*
      Actually execute an operation, when all expected operations are available.
    */
    /* :: // TODO: this belongs somehow to transaction
    store: Object;
    getOperation: any;
    isGarbageCollected: any;
    addOperation: any;
    whenOperationsExist: any;
    */
    * tryExecute (op) {
      this.store.addToDebug('yield* this.store.tryExecute.call(this, ', JSON.stringify(op), ')')
      if (op.struct === 'Delete') {
        yield* Y.Struct.Delete.execute.call(this, op)
        // this is now called in Transaction.deleteOperation!
        // yield* this.store.operationAdded(this, op)
      } else {
        // check if this op was defined
        var defined = yield* this.getInsertion(op.id)
        while (defined != null && defined.content != null) {
          // check if this op has a longer content in the case it is defined
          if (defined.id[1] + defined.content.length < op.id[1] + op.content.length) {
            var overlapSize = defined.content.length - (op.id[1] - defined.id[1])
            op.content.splice(0, overlapSize)
            op.id = [op.id[0], op.id[1] + overlapSize]
            op.left = Y.utils.getLastId(defined)
            op.origin = op.left
            defined = yield* this.getOperation(op.id) // getOperation suffices here
          } else {
            break
          }
        }
        if (defined == null) {
          var opid = op.id
          var isGarbageCollected = yield* this.isGarbageCollected(opid)
          if (!isGarbageCollected) {
            // TODO: reduce number of get / put calls for op ..
            yield* Y.Struct[op.struct].execute.call(this, op)
            yield* this.addOperation(op)
            yield* this.store.operationAdded(this, op)
            // operationAdded can change op..
            op = yield* this.getOperation(opid)
            // if insertion, try to combine with left
            yield* this.tryCombineWithLeft(op)
          }
        }
      }
    }
    /*
     * Called by a transaction when an operation is added.
     * This function is especially important for y-indexeddb, where several instances may share a single database.
     * Every time an operation is created by one instance, it is send to all other instances and operationAdded is called
     *
     * If it's not a Delete operation:
     *   * Checks if another operation is executable (listenersById)
     *   * Update state, if possible
     *
     * Always:
     *   * Call type
     */
    * operationAdded (transaction, op) {
      if (op.struct === 'Delete') {
        var type = this.initializedTypes[JSON.stringify(op.targetParent)]
        if (type != null) {
          yield* type._changed(transaction, op)
        }
      } else {
        // increase SS
        yield* transaction.updateState(op.id[0])
        var opLen = op.content != null ? op.content.length : 1
        for (let i = 0; i < opLen; i++) {
          // notify whenOperation listeners (by id)
          var sid = JSON.stringify([op.id[0], op.id[1] + i])
          var l = this.listenersById[sid]
          delete this.listenersById[sid]
          if (l != null) {
            for (var key in l) {
              var listener = l[key]
              if (--listener.missing === 0) {
                this.whenOperationsExist([], listener.op)
              }
            }
          }
        }
        var t = this.initializedTypes[JSON.stringify(op.parent)]

        // if parent is deleted, mark as gc'd and return
        if (op.parent != null) {
          var parentIsDeleted = yield* transaction.isDeleted(op.parent)
          if (parentIsDeleted) {
            yield* transaction.deleteList(op.id)
            return
          }
        }

        // notify parent, if it was instanciated as a custom type
        if (t != null) {
          let o = Y.utils.copyOperation(op)
          yield* t._changed(transaction, o)
        }
        if (!op.deleted) {
          // Delete if DS says this is actually deleted
          var len = op.content != null ? op.content.length : 1
          var startId = op.id // You must not use op.id in the following loop, because op will change when deleted
            // TODO: !! console.log('TODO: change this before commiting')
          for (let i = 0; i < len; i++) {
            var id = [startId[0], startId[1] + i]
            var opIsDeleted = yield* transaction.isDeleted(id)
            if (opIsDeleted) {
              var delop = {
                struct: 'Delete',
                target: id
              }
              yield* this.tryExecute.call(transaction, delop)
            }
          }
        }
      }
    }
    whenTransactionsFinished () {
      if (this.transactionInProgress) {
        if (this.transactionsFinished == null) {
          var resolve
          var promise = new Promise(function (r) {
            resolve = r
          })
          this.transactionsFinished = {
            resolve: resolve,
            promise: promise
          }
        }
        return this.transactionsFinished.promise
      } else {
        return Promise.resolve()
      }
    }
    // Check if there is another transaction request.
    // * the last transaction is always a flush :)
    getNextRequest () {
      if (this.waitingTransactions.length === 0) {
        if (this.transactionIsFlushed) {
          this.transactionInProgress = false
          this.transactionIsFlushed = false
          if (this.transactionsFinished != null) {
            this.transactionsFinished.resolve()
            this.transactionsFinished = null
          }
          return null
        } else {
          this.transactionIsFlushed = true
          return function * () {
            yield* this.flush()
          }
        }
      } else {
        this.transactionIsFlushed = false
        return this.waitingTransactions.shift()
      }
    }
    requestTransaction (makeGen/* :any */, callImmediately) {
      this.waitingTransactions.push(makeGen)
      if (!this.transactionInProgress) {
        this.transactionInProgress = true
        setTimeout(() => {
          this.transact(this.getNextRequest())
        }, 0)
      }
    }
    /*
      Get a created/initialized type.
    */
    getType (id) {
      return this.initializedTypes[JSON.stringify(id)]
    }
    /*
      Init type. This is called when a remote operation is retrieved, and transformed to a type
      TODO: delete type from store.initializedTypes[id] when corresponding id was deleted!
    */
    * initType (id, args) {
      var sid = JSON.stringify(id)
      var t = this.store.initializedTypes[sid]
      if (t == null) {
        var op/* :MapStruct | ListStruct */ = yield* this.getOperation(id)
        if (op != null) {
          t = yield* Y[op.type].typeDefinition.initType.call(this, this.store, op, args)
          this.store.initializedTypes[sid] = t
        }
      }
      return t
    }
    /*
     Create type. This is called when the local user creates a type (which is a synchronous action)
    */
    createType (typedefinition, id) {
      var structname = typedefinition[0].struct
      id = id || this.getNextOpId(1)
      var op = Y.Struct[structname].create(id)
      op.type = typedefinition[0].name

      this.requestTransaction(function * () {
        if (op.id[0] === '_') {
          yield* this.setOperation(op)
        } else {
          yield* this.applyCreatedOperations([op])
        }
      })
      var t = Y[op.type].typeDefinition.createType(this, op, typedefinition[1])
      this.initializedTypes[JSON.stringify(op.id)] = t
      return t
    }
  }
  Y.AbstractDatabase = AbstractDatabase
}

},{}],14:[function(require,module,exports){
/* @flow */
'use strict'

/*
 An operation also defines the structure of a type. This is why operation and
 structure are used interchangeably here.

 It must be of the type Object. I hope to achieve some performance
 improvements when working on databases that support the json format.

 An operation must have the following properties:

 * encode
     - Encode the structure in a readable format (preferably string- todo)
 * decode (todo)
     - decode structure to json
 * execute
     - Execute the semantics of an operation.
 * requiredOps
     - Operations that are required to execute this operation.
*/
module.exports = function (Y/* :any */) {
  var Struct = {
    /* This is the only operation that is actually not a structure, because
    it is not stored in the OS. This is why it _does not_ have an id

    op = {
      target: Id
    }
    */
    Delete: {
      encode: function (op) {
        return {
          target: op.target,
          length: op.length || 0,
          struct: 'Delete'
        }
      },
      requiredOps: function (op) {
        return [] // [op.target]
      },
      execute: function * (op) {
        return yield* this.deleteOperation(op.target, op.length || 1)
      }
    },
    Insert: {
      /* {
          content: [any],
          opContent: Id,
          id: Id,
          left: Id,
          origin: Id,
          right: Id,
          parent: Id,
          parentSub: string (optional), // child of Map type
        }
      */
      encode: function (op/* :Insertion */) /* :Insertion */ {
        // TODO: you could not send the "left" property, then you also have to
        // "op.left = null" in $execute or $decode
        var e/* :any */ = {
          id: op.id,
          left: op.left,
          right: op.right,
          origin: op.origin,
          parent: op.parent,
          struct: op.struct
        }
        if (op.parentSub != null) {
          e.parentSub = op.parentSub
        }
        if (op.hasOwnProperty('opContent')) {
          e.opContent = op.opContent
        } else {
          e.content = op.content.slice()
        }

        return e
      },
      requiredOps: function (op) {
        var ids = []
        if (op.left != null) {
          ids.push(op.left)
        }
        if (op.right != null) {
          ids.push(op.right)
        }
        if (op.origin != null && !Y.utils.compareIds(op.left, op.origin)) {
          ids.push(op.origin)
        }
        // if (op.right == null && op.left == null) {
        ids.push(op.parent)

        if (op.opContent != null) {
          ids.push(op.opContent)
        }
        return ids
      },
      getDistanceToOrigin: function * (op) {
        if (op.left == null) {
          return 0
        } else {
          var d = 0
          var o = yield* this.getInsertion(op.left)
          while (!Y.utils.matchesId(o, op.origin)) {
            d++
            if (o.left == null) {
              break
            } else {
              o = yield* this.getInsertion(o.left)
            }
          }
          return d
        }
      },
      /*
      # $this has to find a unique position between origin and the next known character
      # case 1: $origin equals $o.origin: the $creator parameter decides if left or right
      #         let $OL= [o1,o2,o3,o4], whereby $this is to be inserted between o1 and o4
      #         o2,o3 and o4 origin is 1 (the position of o2)
      #         there is the case that $this.creator < o2.creator, but o3.creator < $this.creator
      #         then o2 knows o3. Since on another client $OL could be [o1,o3,o4] the problem is complex
      #         therefore $this would be always to the right of o3
      # case 2: $origin < $o.origin
      #         if current $this insert_position > $o origin: $this ins
      #         else $insert_position will not change
      #         (maybe we encounter case 1 later, then this will be to the right of $o)
      # case 3: $origin > $o.origin
      #         $this insert_position is to the left of $o (forever!)
      */
      execute: function * (op) {
        var i // loop counter

        // during this function some ops may get split into two pieces (e.g. with getInsertionCleanEnd)
        // We try to merge them later, if possible
        var tryToRemergeLater = []

        if (op.origin != null) { // TODO: !== instead of !=
          // we save in origin that op originates in it
          // we need that later when we eventually garbage collect origin (see transaction)
          var origin = yield* this.getInsertionCleanEnd(op.origin)
          if (origin.originOf == null) {
            origin.originOf = []
          }
          origin.originOf.push(op.id)
          yield* this.setOperation(origin)
          if (origin.right != null) {
            tryToRemergeLater.push(origin.right)
          }
        }
        var distanceToOrigin = i = yield* Struct.Insert.getDistanceToOrigin.call(this, op) // most cases: 0 (starts from 0)

        // now we begin to insert op in the list of insertions..
        var o
        var parent
        var start

        // find o. o is the first conflicting operation
        if (op.left != null) {
          o = yield* this.getInsertionCleanEnd(op.left)
          if (!Y.utils.compareIds(op.left, op.origin) && o.right != null) {
            // only if not added previously
            tryToRemergeLater.push(o.right)
          }
          o = (o.right == null) ? null : yield* this.getOperation(o.right)
        } else { // left == null
          parent = yield* this.getOperation(op.parent)
          let startId = op.parentSub ? parent.map[op.parentSub] : parent.start
          start = startId == null ? null : yield* this.getOperation(startId)
          o = start
        }

        // make sure to split op.right if necessary (also add to tryCombineWithLeft)
        if (op.right != null) {
          tryToRemergeLater.push(op.right)
          yield* this.getInsertionCleanStart(op.right)
        }

        // handle conflicts
        while (true) {
          if (o != null && !Y.utils.compareIds(o.id, op.right)) {
            var oOriginDistance = yield* Struct.Insert.getDistanceToOrigin.call(this, o)
            if (oOriginDistance === i) {
              // case 1
              if (o.id[0] < op.id[0]) {
                op.left = Y.utils.getLastId(o)
                distanceToOrigin = i + 1 // just ignore o.content.length, doesn't make a difference
              }
            } else if (oOriginDistance < i) {
              // case 2
              if (i - distanceToOrigin <= oOriginDistance) {
                op.left = Y.utils.getLastId(o)
                distanceToOrigin = i + 1 // just ignore o.content.length, doesn't make a difference
              }
            } else {
              break
            }
            i++
            if (o.right != null) {
              o = yield* this.getInsertion(o.right)
            } else {
              o = null
            }
          } else {
            break
          }
        }

        // reconnect..
        var left = null
        var right = null
        if (parent == null) {
          parent = yield* this.getOperation(op.parent)
        }

        // reconnect left and set right of op
        if (op.left != null) {
          left = yield* this.getInsertion(op.left)
          // link left
          op.right = left.right
          left.right = op.id

          yield* this.setOperation(left)
        } else {
          // set op.right from parent, if necessary
          op.right = op.parentSub ? parent.map[op.parentSub] || null : parent.start
        }
        // reconnect right
        if (op.right != null) {
          // TODO: wanna connect right too?
          right = yield* this.getOperation(op.right)
          right.left = Y.utils.getLastId(op)

          // if right exists, and it is supposed to be gc'd. Remove it from the gc
          if (right.gc != null) {
            if (right.content != null && right.content.length > 1) {
              right = yield* this.getInsertionCleanEnd(right.id)
            }
            this.store.removeFromGarbageCollector(right)
          }
          yield* this.setOperation(right)
        }

        // update parents .map/start/end properties
        if (op.parentSub != null) {
          if (left == null) {
            parent.map[op.parentSub] = op.id
            yield* this.setOperation(parent)
          }
          // is a child of a map struct.
          // Then also make sure that only the most left element is not deleted
          // We do not call the type in this case (this is what the third parameter is for)
          if (op.right != null) {
            yield* this.deleteOperation(op.right, 1, true)
          }
          if (op.left != null) {
            yield* this.deleteOperation(op.id, 1, true)
          }
        } else {
          if (right == null || left == null) {
            if (right == null) {
              parent.end = Y.utils.getLastId(op)
            }
            if (left == null) {
              parent.start = op.id
            }
            yield* this.setOperation(parent)
          }
        }

        // try to merge original op.left and op.origin
        for (i = 0; i < tryToRemergeLater.length; i++) {
          var m = yield* this.getOperation(tryToRemergeLater[i])
          yield* this.tryCombineWithLeft(m)
        }
      }
    },
    List: {
      /*
      {
        start: null,
        end: null,
        struct: "List",
        type: "",
        id: this.os.getNextOpId(1)
      }
      */
      create: function (id) {
        return {
          start: null,
          end: null,
          struct: 'List',
          id: id
        }
      },
      encode: function (op) {
        var e = {
          struct: 'List',
          id: op.id,
          type: op.type
        }
        if (op.requires != null) {
          e.requires = op.requires
        }
        if (op.info != null) {
          e.info = op.info
        }
        return e
      },
      requiredOps: function () {
        /*
        var ids = []
        if (op.start != null) {
          ids.push(op.start)
        }
        if (op.end != null){
          ids.push(op.end)
        }
        return ids
        */
        return []
      },
      execute: function * (op) {
        op.start = null
        op.end = null
      },
      ref: function * (op, pos) {
        if (op.start == null) {
          return null
        }
        var res = null
        var o = yield* this.getOperation(op.start)

        while (true) {
          if (!o.deleted) {
            res = o
            pos--
          }
          if (pos >= 0 && o.right != null) {
            o = yield* this.getOperation(o.right)
          } else {
            break
          }
        }
        return res
      },
      map: function * (o, f) {
        o = o.start
        var res = []
        while (o != null) { // TODO: change to != (at least some convention)
          var operation = yield* this.getOperation(o)
          if (!operation.deleted) {
            res.push(f(operation))
          }
          o = operation.right
        }
        return res
      }
    },
    Map: {
      /*
        {
          map: {},
          struct: "Map",
          type: "",
          id: this.os.getNextOpId(1)
        }
      */
      create: function (id) {
        return {
          id: id,
          map: {},
          struct: 'Map'
        }
      },
      encode: function (op) {
        var e = {
          struct: 'Map',
          type: op.type,
          id: op.id,
          map: {} // overwrite map!!
        }
        if (op.requires != null) {
          e.requires = op.requires
        }
        if (op.info != null) {
          e.info = op.info
        }
        return e
      },
      requiredOps: function () {
        return []
      },
      execute: function * () {},
      /*
        Get a property by name
      */
      get: function * (op, name) {
        var oid = op.map[name]
        if (oid != null) {
          var res = yield* this.getOperation(oid)
          if (res == null || res.deleted) {
            return void 0
          } else if (res.opContent == null) {
            return res.content[0]
          } else {
            return yield* this.getType(res.opContent)
          }
        }
      }
    }
  }
  Y.Struct = Struct
}

},{}],15:[function(require,module,exports){
/* @flow */
'use strict'

/*
  Partial definition of a transaction

  A transaction provides all the the async functionality on a database.

  By convention, a transaction has the following properties:
  * ss for StateSet
  * os for OperationStore
  * ds for DeleteStore

  A transaction must also define the following methods:
  * checkDeleteStoreForState(state)
    - When increasing the state of a user, an operation with an higher id
      may already be garbage collected, and therefore it will never be received.
      update the state to reflect this knowledge. This won't call a method to save the state!
  * getDeleteSet(id)
    - Get the delete set in a readable format:
      {
        "userX": [
          [5,1], // starting from position 5, one operations is deleted
          [9,4]  // starting from position 9, four operations are deleted
        ],
        "userY": ...
      }
  * getOpsFromDeleteSet(ds) -- TODO: just call this.deleteOperation(id) here
    - get a set of deletions that need to be applied in order to get to
      achieve the state of the supplied ds
  * setOperation(op)
    - write `op` to the database.
      Note: this is allowed to return an in-memory object.
      E.g. the Memory adapter returns the object that it has in-memory.
      Changing values on this object will be stored directly in the database
      without calling this function. Therefore,
      setOperation may have no functionality in some adapters. This also has
      implications on the way we use operations that were served from the database.
      We try not to call copyObject, if not necessary.
  * addOperation(op)
    - add an operation to the database.
      This may only be called once for every op.id
      Must return a function that returns the next operation in the database (ordered by id)
  * getOperation(id)
  * removeOperation(id)
    - remove an operation from the database. This is called when an operation
      is garbage collected.
  * setState(state)
    - `state` is of the form
      {
        user: "1",
        clock: 4
      } <- meaning that we have four operations from user "1"
           (with these id's respectively: 0, 1, 2, and 3)
  * getState(user)
  * getStateVector()
    - Get the state of the OS in the form
    [{
      user: "userX",
      clock: 11
    },
     ..
    ]
  * getStateSet()
    - Get the state of the OS in the form
    {
      "userX": 11,
      "userY": 22
    }
   * getOperations(startSS)
     - Get the all the operations that are necessary in order to achive the
       stateSet of this user, starting from a stateSet supplied by another user
   * makeOperationReady(ss, op)
     - this is called only by `getOperations(startSS)`. It makes an operation
       applyable on a given SS.
*/
module.exports = function (Y/* :any */) {
  class TransactionInterface {
    /* ::
    store: Y.AbstractDatabase;
    ds: Store;
    os: Store;
    ss: Store;
    */
    /*
      Apply operations that this user created (no remote ones!)
        * does not check for Struct.*.requiredOps()
        * also broadcasts it through the connector
    */
    * applyCreatedOperations (ops) {
      var send = []
      for (var i = 0; i < ops.length; i++) {
        var op = ops[i]
        yield* this.store.tryExecute.call(this, op)
        if (op.id == null || typeof op.id[1] !== 'string') {
          send.push(Y.Struct[op.struct].encode(op))
        }
      }
      if (send.length > 0) { // TODO: && !this.store.forwardAppliedOperations (but then i don't send delete ops)
        // is connected, and this is not going to be send in addOperation
        this.store.y.connector.broadcastOps(send)
      }
    }

    * deleteList (start) {
      while (start != null) {
        start = yield* this.getOperation(start)
        if (!start.gc) {
          start.gc = true
          start.deleted = true
          yield* this.setOperation(start)
          var delLength = start.content != null ? start.content.length : 1
          yield* this.markDeleted(start.id, delLength)
          if (start.opContent != null) {
            yield* this.deleteOperation(start.opContent)
          }
          this.store.queueGarbageCollector(start.id)
        }
        start = start.right
      }
    }

    /*
      Mark an operation as deleted, and add it to the GC, if possible.
    */
    * deleteOperation (targetId, length, preventCallType) /* :Generator<any, any, any> */ {
      if (length == null) {
        length = 1
      }
      yield* this.markDeleted(targetId, length)
      while (length > 0) {
        var callType = false
        var target = yield* this.os.findWithUpperBound([targetId[0], targetId[1] + length - 1])
        var targetLength = target != null && target.content != null ? target.content.length : 1
        if (target == null || target.id[0] !== targetId[0] || target.id[1] + targetLength <= targetId[1]) {
          // does not exist or is not in the range of the deletion
          target = null
          length = 0
        } else {
          // does exist, check if it is too long
          if (!target.deleted) {
            if (target.id[1] < targetId[1]) {
              // starts to the left of the deletion range
              target = yield* this.getInsertionCleanStart(targetId)
              targetLength = target.content.length // must have content property!
            }
            if (target.id[1] + targetLength > targetId[1] + length) {
              // ends to the right of the deletion range
              target = yield* this.getInsertionCleanEnd([targetId[0], targetId[1] + length - 1])
              targetLength = target.content.length
            }
          }
          length = target.id[1] - targetId[1]
        }

        if (target != null) {
          if (!target.deleted) {
            callType = true
            // set deleted & notify type
            target.deleted = true
            // delete containing lists
            if (target.start != null) {
              // TODO: don't do it like this .. -.-
              yield* this.deleteList(target.start)
              // yield* this.deleteList(target.id) -- do not gc itself because this may still get referenced
            }
            if (target.map != null) {
              for (var name in target.map) {
                yield* this.deleteList(target.map[name])
              }
              // TODO: here to..  (see above)
              // yield* this.deleteList(target.id) -- see above
            }
            if (target.opContent != null) {
              yield* this.deleteOperation(target.opContent)
              // target.opContent = null
            }
            if (target.requires != null) {
              for (var i = 0; i < target.requires.length; i++) {
                yield* this.deleteOperation(target.requires[i])
              }
            }
          }
          var left
          if (target.left != null) {
            left = yield* this.getInsertion(target.left)
          } else {
            left = null
          }

          // set here because it was deleted and/or gc'd
          yield* this.setOperation(target)

          /*
            Check if it is possible to add right to the gc.
            Because this delete can't be responsible for left being gc'd,
            we don't have to add left to the gc..
          */
          var right
          if (target.right != null) {
            right = yield* this.getOperation(target.right)
          } else {
            right = null
          }
          if (callType && !preventCallType) {
            yield* this.store.operationAdded(this, {
              struct: 'Delete',
              target: target.id,
              length: targetLength,
              targetParent: target.parent
            })
          }
          // need to gc in the end!
          yield* this.store.addToGarbageCollector.call(this, target, left)
          if (right != null) {
            yield* this.store.addToGarbageCollector.call(this, right, target)
          }
        }
      }
    }
    /*
      Mark an operation as deleted&gc'd
    */
    * markGarbageCollected (id, len) {
      // this.mem.push(["gc", id]);
      this.store.addToDebug('yield* this.markGarbageCollected(', id, ', ', len, ')')
      var n = yield* this.markDeleted(id, len)
      if (n.id[1] < id[1] && !n.gc) {
        // un-extend left
        var newlen = n.len - (id[1] - n.id[1])
        n.len -= newlen
        yield* this.ds.put(n)
        n = {id: id, len: newlen, gc: false}
        yield* this.ds.put(n)
      }
      // get prev&next before adding a new operation
      var prev = yield* this.ds.findPrev(id)
      var next = yield* this.ds.findNext(id)

      if (id[1] + len < n.id[1] + n.len && !n.gc) {
        // un-extend right
        yield* this.ds.put({id: [id[0], id[1] + len], len: n.len - len, gc: false})
        n.len = len
      }
      // set gc'd
      n.gc = true
      // can extend left?
      if (
        prev != null &&
        prev.gc &&
        Y.utils.compareIds([prev.id[0], prev.id[1] + prev.len], n.id)
      ) {
        prev.len += n.len
        yield* this.ds.delete(n.id)
        n = prev
        // ds.put n here?
      }
      // can extend right?
      if (
        next != null &&
        next.gc &&
        Y.utils.compareIds([n.id[0], n.id[1] + n.len], next.id)
      ) {
        n.len += next.len
        yield* this.ds.delete(next.id)
      }
      yield* this.ds.put(n)
      yield* this.updateState(n.id[0])
    }
    /*
      Mark an operation as deleted.

      returns the delete node
    */
    * markDeleted (id, length) {
      if (length == null) {
        length = 1
      }
      // this.mem.push(["del", id]);
      var n = yield* this.ds.findWithUpperBound(id)
      if (n != null && n.id[0] === id[0]) {
        if (n.id[1] <= id[1] && id[1] <= n.id[1] + n.len) {
          // id is in n's range
          var diff = id[1] + length - (n.id[1] + n.len) // overlapping right
          if (diff > 0) {
            // id+length overlaps n
            if (!n.gc) {
              n.len += diff
            } else {
              diff = n.id[1] + n.len - id[1] // overlapping left (id till n.end)
              if (diff < length) {
                // a partial deletion
                n = {id: [id[0], id[1] + diff], len: length - diff, gc: false}
                yield* this.ds.put(n)
              } else {
                // already gc'd
                throw new Error('Cannot happen! (it dit though.. :()')
                // return n
              }
            }
          } else {
            // no overlapping, already deleted
            return n
          }
        } else {
          // cannot extend left (there is no left!)
          n = {id: id, len: length, gc: false}
          yield* this.ds.put(n) // TODO: you double-put !!
        }
      } else {
        // cannot extend left
        n = {id: id, len: length, gc: false}
        yield* this.ds.put(n)
      }
      // can extend right?
      var next = yield* this.ds.findNext(n.id)
      if (
        next != null &&
        n.id[0] === next.id[0] &&
        n.id[1] + n.len >= next.id[1]
      ) {
        diff = n.id[1] + n.len - next.id[1] // from next.start to n.end
        while (diff >= 0) {
          // n overlaps with next
          if (next.gc) {
            // gc is stronger, so reduce length of n
            n.len -= diff
            if (diff >= next.len) {
              // delete the missing range after next
              diff = diff - next.len // missing range after next
              if (diff > 0) {
                yield* this.ds.put(n) // unneccessary? TODO!
                yield* this.markDeleted([next.id[0], next.id[1] + next.len], diff)
              }
            }
            break
          } else {
            // we can extend n with next
            if (diff > next.len) {
              // n is even longer than next
              // get next.next, and try to extend it
              var _next = yield* this.ds.findNext(next.id)
              yield* this.ds.delete(next.id)
              if (_next == null || n.id[0] !== _next.id[0]) {
                break
              } else {
                next = _next
                diff = n.id[1] + n.len - next.id[1] // from next.start to n.end
                // continue!
              }
            } else {
              // n just partially overlaps with next. extend n, delete next, and break this loop
              n.len += next.len - diff
              yield* this.ds.delete(next.id)
              break
            }
          }
        }
      }
      yield* this.ds.put(n)
      return n
    }
    /*
      Call this method when the client is connected&synced with the
      other clients (e.g. master). This will query the database for
      operations that can be gc'd and add them to the garbage collector.
    */
    * garbageCollectAfterSync () {
      if (this.store.gc1.length > 0 || this.store.gc2.length > 0) {
        console.warn('gc should be empty after sync')
      }
      if (!this.store.gc) {
        return
      }
      yield* this.os.iterate(this, null, null, function * (op) {
        if (op.gc) {
          delete op.gc
          yield* this.setOperation(op)
        }
        if (op.parent != null) {
          var parentDeleted = yield* this.isDeleted(op.parent)
          if (parentDeleted) {
            op.gc = true
            if (!op.deleted) {
              yield* this.markDeleted(op.id, op.content != null ? op.content.length : 1)
              op.deleted = true
              if (op.opContent != null) {
                yield* this.deleteOperation(op.opContent)
              }
              if (op.requires != null) {
                for (var i = 0; i < op.requires.length; i++) {
                  yield* this.deleteOperation(op.requires[i])
                }
              }
            }
            yield* this.setOperation(op)
            this.store.gc1.push(op.id) // this is ok becaues its shortly before sync (otherwise use queueGarbageCollector!)
            return
          }
        }
        if (op.deleted) {
          var left = null
          if (op.left != null) {
            left = yield* this.getInsertion(op.left)
          }
          yield* this.store.addToGarbageCollector.call(this, op, left)
        }
      })
    }
    /*
      Really remove an op and all its effects.
      The complicated case here is the Insert operation:
      * reset left
      * reset right
      * reset parent.start
      * reset parent.end
      * reset origins of all right ops
    */
    * garbageCollectOperation (id) {
      this.store.addToDebug('yield* this.garbageCollectOperation(', id, ')')
      var o = yield* this.getOperation(id)
      yield* this.markGarbageCollected(id, (o != null && o.content != null) ? o.content.length : 1) // always mark gc'd
      // if op exists, then clean that mess up..
      if (o != null) {
        var deps = []
        if (o.opContent != null) {
          deps.push(o.opContent)
        }
        if (o.requires != null) {
          deps = deps.concat(o.requires)
        }
        for (var i = 0; i < deps.length; i++) {
          var dep = yield* this.getOperation(deps[i])
          if (dep != null) {
            if (!dep.deleted) {
              yield* this.deleteOperation(dep.id)
              dep = yield* this.getOperation(dep.id)
            }
            dep.gc = true
            yield* this.setOperation(dep)
            this.store.queueGarbageCollector(dep.id)
          } else {
            yield* this.markGarbageCollected(deps[i], 1)
          }
        }

        // remove gc'd op from the left op, if it exists
        if (o.left != null) {
          var left = yield* this.getInsertion(o.left)
          left.right = o.right
          yield* this.setOperation(left)
        }
        // remove gc'd op from the right op, if it exists
        // also reset origins of right ops
        if (o.right != null) {
          var right = yield* this.getOperation(o.right)
          right.left = o.left
          yield* this.setOperation(right)

          if (o.originOf != null && o.originOf.length > 0) {
            // find new origin of right ops
            // origin is the first left deleted operation
            var neworigin = o.left
            var neworigin_ = null
            while (neworigin != null) {
              neworigin_ = yield* this.getInsertion(neworigin)
              if (neworigin_.deleted) {
                break
              }
              neworigin = neworigin_.left
            }

            // reset origin of all right ops (except first right - duh!),

            /* ** The following code does not rely on the the originOf property **
                  I recently added originOf to all Insert Operations (see Struct.Insert.execute),
                  which saves which operations originate in a Insert operation.
                  Garbage collecting without originOf is more memory efficient, but is nearly impossible for large texts, or lists!
                  But I keep this code for now
            ```
            // reset origin of right
            right.origin = neworigin
            // search until you find origin pointer to the left of o
            if (right.right != null) {
              var i = yield* this.getOperation(right.right)
              var ids = [o.id, o.right]
              while (ids.some(function (id) {
                return Y.utils.compareIds(id, i.origin)
              })) {
                if (Y.utils.compareIds(i.origin, o.id)) {
                  // reset origin of i
                  i.origin = neworigin
                  yield* this.setOperation(i)
                }
                // get next i
                if (i.right == null) {
                  break
                } else {
                  ids.push(i.id)
                  i = yield* this.getOperation(i.right)
                }
              }
            }
            ```
            */
            // ** Now the new implementation starts **
            // reset neworigin of all originOf[*]
            for (var _i in o.originOf) {
              var originsIn = yield* this.getOperation(o.originOf[_i])
              if (originsIn != null) {
                originsIn.origin = neworigin
                yield* this.setOperation(originsIn)
              }
            }
            if (neworigin != null) {
              if (neworigin_.originOf == null) {
                neworigin_.originOf = o.originOf
              } else {
                neworigin_.originOf = o.originOf.concat(neworigin_.originOf)
              }
              yield* this.setOperation(neworigin_)
            }
            // we don't need to set right here, because
            // right should be in o.originOf => it is set it the previous for loop
          }
        }
        // o may originate in another operation.
        // Since o is deleted, we have to reset o.origin's `originOf` property
        if (o.origin != null) {
          var origin = yield* this.getInsertion(o.origin)
          origin.originOf = origin.originOf.filter(function (_id) {
            return !Y.utils.compareIds(id, _id)
          })
          yield* this.setOperation(origin)
        }
        var parent
        if (o.parent != null) {
          parent = yield* this.getOperation(o.parent)
        }
        // remove gc'd op from parent, if it exists
        if (parent != null) {
          var setParent = false // whether to save parent to the os
          if (o.parentSub != null) {
            if (Y.utils.compareIds(parent.map[o.parentSub], o.id)) {
              setParent = true
              if (o.right != null) {
                parent.map[o.parentSub] = o.right
              } else {
                delete parent.map[o.parentSub]
              }
            }
          } else {
            if (Y.utils.compareIds(parent.start, o.id)) {
              // gc'd op is the start
              setParent = true
              parent.start = o.right
            }
            if (Y.utils.matchesId(o, parent.end)) {
              // gc'd op is the end
              setParent = true
              parent.end = o.left
            }
          }
          if (setParent) {
            yield* this.setOperation(parent)
          }
        }
        // finally remove it from the os
        yield* this.removeOperation(o.id)
      }
    }
    * checkDeleteStoreForState (state) {
      var n = yield* this.ds.findWithUpperBound([state.user, state.clock])
      if (n != null && n.id[0] === state.user && n.gc) {
        state.clock = Math.max(state.clock, n.id[1] + n.len)
      }
    }
    * updateState (user) {
      var state = yield* this.getState(user)
      yield* this.checkDeleteStoreForState(state)
      var o = yield* this.getInsertion([user, state.clock])
      var oLength = (o != null && o.content != null) ? o.content.length : 1
      while (o != null && user === o.id[0] && o.id[1] <= state.clock && o.id[1] + oLength > state.clock) {
        // either its a new operation (1. case), or it is an operation that was deleted, but is not yet in the OS
        state.clock += oLength
        yield* this.checkDeleteStoreForState(state)
        o = yield* this.os.findNext(o.id)
        oLength = (o != null && o.content != null) ? o.content.length : 1
      }
      yield* this.setState(state)
    }
    /*
      apply a delete set in order to get
      the state of the supplied ds
    */
    * applyDeleteSet (ds) {
      var deletions = []

      for (var user in ds) {
        var dv = ds[user]
        var pos = 0
        var d = dv[pos]
        yield* this.ds.iterate(this, [user, 0], [user, Number.MAX_VALUE], function * (n) {
          // cases:
          // 1. d deletes something to the right of n
          //  => go to next n (break)
          // 2. d deletes something to the left of n
          //  => create deletions
          //  => reset d accordingly
          //  *)=> if d doesn't delete anything anymore, go to next d (continue)
          // 3. not 2) and d deletes something that also n deletes
          //  => reset d so that it doesn't contain n's deletion
          //  *)=> if d does not delete anything anymore, go to next d (continue)
          while (d != null) {
            var diff = 0 // describe the diff of length in 1) and 2)
            if (n.id[1] + n.len <= d[0]) {
              // 1)
              break
            } else if (d[0] < n.id[1]) {
              // 2)
              // delete maximum the len of d
              // else delete as much as possible
              diff = Math.min(n.id[1] - d[0], d[1])
              deletions.push([user, d[0], diff, d[2]])
            } else {
              // 3)
              diff = n.id[1] + n.len - d[0] // never null (see 1)
              if (d[2] && !n.gc) {
                // d marks as gc'd but n does not
                // then delete either way
                deletions.push([user, d[0], Math.min(diff, d[1]), d[2]])
              }
            }
            if (d[1] <= diff) {
              // d doesn't delete anything anymore
              d = dv[++pos]
            } else {
              d[0] = d[0] + diff // reset pos
              d[1] = d[1] - diff // reset length
            }
          }
        })
        // for the rest.. just apply it
        for (; pos < dv.length; pos++) {
          d = dv[pos]
          deletions.push([user, d[0], d[1], d[2]])
        }
      }
      for (var i = 0; i < deletions.length; i++) {
        var del = deletions[i]
        // always try to delete..
        yield* this.deleteOperation([del[0], del[1]], del[2])
        if (del[3]) {
          // gc..
          yield* this.markGarbageCollected([del[0], del[1]], del[2]) // always mark gc'd
          // remove operation..
          var counter = del[1] + del[2]
          while (counter >= del[1]) {
            var o = yield* this.os.findWithUpperBound([del[0], counter - 1])
            if (o == null) {
              break
            }
            var oLen = o.content != null ? o.content.length : 1
            if (o.id[0] !== del[0] || o.id[1] + oLen <= del[1]) {
              // not in range
              break
            }
            if (o.id[1] + oLen > del[1] + del[2]) {
              // overlaps right
              o = yield* this.getInsertionCleanEnd([del[0], del[1] + del[2] - 1])
            }
            if (o.id[1] < del[1]) {
              // overlaps left
              o = yield* this.getInsertionCleanStart([del[0], del[1]])
            }
            counter = o.id[1]
            yield* this.garbageCollectOperation(o.id)
          }
        }
        if (this.store.forwardAppliedOperations) {
          var ops = []
          ops.push({struct: 'Delete', target: [del[0], del[1]], length: del[2]})
          this.store.y.connector.broadcastOps(ops)
        }
      }
    }
    * isGarbageCollected (id) {
      var n = yield* this.ds.findWithUpperBound(id)
      return n != null && n.id[0] === id[0] && id[1] < n.id[1] + n.len && n.gc
    }
    /*
      A DeleteSet (ds) describes all the deleted ops in the OS
    */
    * getDeleteSet () {
      var ds = {}
      yield* this.ds.iterate(this, null, null, function * (n) {
        var user = n.id[0]
        var counter = n.id[1]
        var len = n.len
        var gc = n.gc
        var dv = ds[user]
        if (dv === void 0) {
          dv = []
          ds[user] = dv
        }
        dv.push([counter, len, gc])
      })
      return ds
    }
    * isDeleted (id) {
      var n = yield* this.ds.findWithUpperBound(id)
      return n != null && n.id[0] === id[0] && id[1] < n.id[1] + n.len
    }
    * setOperation (op) {
      yield* this.os.put(op)
      return op
    }
    * addOperation (op) {
      yield* this.os.put(op)
      if (this.store.forwardAppliedOperations && typeof op.id[1] !== 'string') {
        // is connected, and this is not going to be send in addOperation
        this.store.y.connector.broadcastOps([op])
      }
    }
    // if insertion, try to combine with left insertion (if both have content property)
    * tryCombineWithLeft (op) {
      if (
        op != null &&
        op.left != null &&
        op.content != null &&
        op.left[0] === op.id[0] &&
        Y.utils.compareIds(op.left, op.origin)
      ) {
        var left = yield* this.getInsertion(op.left)
        if (left.content != null &&
            left.id[1] + left.content.length === op.id[1] &&
            left.originOf.length === 1 &&
            !left.gc && !left.deleted &&
            !op.gc && !op.deleted
        ) {
          // combine!
          if (op.originOf != null) {
            left.originOf = op.originOf
          } else {
            delete left.originOf
          }
          left.content = left.content.concat(op.content)
          left.right = op.right
          yield* this.os.delete(op.id)
          yield* this.setOperation(left)
        }
      }
    }
    * getInsertion (id) {
      var ins = yield* this.os.findWithUpperBound(id)
      if (ins == null) {
        return null
      } else {
        var len = ins.content != null ? ins.content.length : 1 // in case of opContent
        if (id[0] === ins.id[0] && id[1] < ins.id[1] + len) {
          return ins
        } else {
          return null
        }
      }
    }
    * getInsertionCleanStartEnd (id) {
      yield* this.getInsertionCleanStart(id)
      return yield* this.getInsertionCleanEnd(id)
    }
    // Return an insertion such that id is the first element of content
    // This function manipulates an operation, if necessary
    * getInsertionCleanStart (id) {
      var ins = yield* this.getInsertion(id)
      if (ins != null) {
        if (ins.id[1] === id[1]) {
          return ins
        } else {
          var left = Y.utils.copyObject(ins)
          ins.content = left.content.splice(id[1] - ins.id[1])
          ins.id = id
          var leftLid = Y.utils.getLastId(left)
          ins.origin = leftLid
          left.originOf = [ins.id]
          left.right = ins.id
          ins.left = leftLid
          // debugger // check
          yield* this.setOperation(left)
          yield* this.setOperation(ins)
          if (left.gc) {
            this.store.queueGarbageCollector(ins.id)
          }
          return ins
        }
      } else {
        return null
      }
    }
    // Return an insertion such that id is the last element of content
    // This function manipulates an operation, if necessary
    * getInsertionCleanEnd (id) {
      var ins = yield* this.getInsertion(id)
      if (ins != null) {
        if (ins.content == null || (ins.id[1] + ins.content.length - 1 === id[1])) {
          return ins
        } else {
          var right = Y.utils.copyObject(ins)
          right.content = ins.content.splice(id[1] - ins.id[1] + 1) // cut off remainder
          right.id = [id[0], id[1] + 1]
          var insLid = Y.utils.getLastId(ins)
          right.origin = insLid
          ins.originOf = [right.id]
          ins.right = right.id
          right.left = insLid
          // debugger // check
          yield* this.setOperation(right)
          yield* this.setOperation(ins)
          if (ins.gc) {
            this.store.queueGarbageCollector(right.id)
          }
          return ins
        }
      } else {
        return null
      }
    }
    * getOperation (id/* :any */)/* :Transaction<any> */ {
      var o = yield* this.os.find(id)
      if (id[0] !== '_' || o != null) {
        return o
      } else { // type is string
        // generate this operation?
        var comp = id[1].split('_')
        if (comp.length > 1) {
          var struct = comp[0]
          var op = Y.Struct[struct].create(id)
          op.type = comp[1]
          yield* this.setOperation(op)
          return op
        } else {
          // won't be called. but just in case..
          console.error('Unexpected case. How can this happen?')
          debugger // eslint-disable-line
          return null
        }
      }
    }
    * removeOperation (id) {
      yield* this.os.delete(id)
    }
    * setState (state) {
      var val = {
        id: [state.user],
        clock: state.clock
      }
      yield* this.ss.put(val)
    }
    * getState (user) {
      var n = yield* this.ss.find([user])
      var clock = n == null ? null : n.clock
      if (clock == null) {
        clock = 0
      }
      return {
        user: user,
        clock: clock
      }
    }
    * getStateVector () {
      var stateVector = []
      yield* this.ss.iterate(this, null, null, function * (n) {
        stateVector.push({
          user: n.id[0],
          clock: n.clock
        })
      })
      return stateVector
    }
    * getStateSet () {
      var ss = {}
      yield* this.ss.iterate(this, null, null, function * (n) {
        ss[n.id[0]] = n.clock
      })
      return ss
    }
    /*
      Here, we make all missing operations executable for the receiving user.

      Notes:
        startSS: denotes to the SV that the remote user sent
        currSS:  denotes to the state vector that the user should have if he
                 applies all already sent operations (increases is each step)

      We face several problems:
      * Execute op as is won't work because ops depend on each other
       -> find a way so that they do not anymore
      * When changing left, must not go more to the left than the origin
      * When changing right, you have to consider that other ops may have op
        as their origin, this means that you must not set one of these ops
        as the new right (interdependencies of ops)
      * can't just go to the right until you find the first known operation,
        With currSS
          -> interdependency of ops is a problem
        With startSS
          -> leads to inconsistencies when two users join at the same time.
             Then the position depends on the order of execution -> error!

        Solution:
        -> re-create originial situation
          -> set op.left = op.origin (which never changes)
          -> set op.right
               to the first operation that is known (according to startSS)
               or to the first operation that has an origin that is not to the
               right of op.
          -> Enforces unique execution order -> happy user

        Improvements: TODO
          * Could set left to origin, or the first known operation
            (startSS or currSS.. ?)
            -> Could be necessary when I turn GC again.
            -> Is a bad(ish) idea because it requires more computation

      What we do:
      * Iterate over all missing operations.
      * When there is an operation, where the right op is known, send this op all missing ops to the left to the user
      * I explained above what we have to do with each operation. Here is how we do it efficiently:
        1. Go to the left until you find either op.origin, or a known operation (let o denote current operation in the iteration)
        2. Found a known operation -> set op.left = o, and send it to the user. stop
        3. Found o = op.origin -> set op.left = op.origin, and send it to the user. start again from 1. (set op = o)
        4. Found some o -> set o.right = op, o.left = o.origin, send it to the user, continue
    */
    * getOperations (startSS) {
      // TODO: use bounds here!
      if (startSS == null) {
        startSS = {}
      }
      var send = []

      var endSV = yield* this.getStateVector()
      for (var endState of endSV) {
        var user = endState.user
        if (user === '_') {
          continue
        }
        var startPos = startSS[user] || 0
        if (startPos > 0) {
          // There is a change that [user, startPos] is in a composed Insertion (with a smaller counter)
          // find out if that is the case
          var firstMissing = yield* this.getInsertion([user, startPos])
          if (firstMissing != null) {
            // update startPos
            startPos = firstMissing.id[1]
            startSS[user] = startPos
          }
        }
        yield* this.os.iterate(this, [user, startPos], [user, Number.MAX_VALUE], function * (op) {
          op = Y.Struct[op.struct].encode(op)
          if (op.struct !== 'Insert') {
            send.push(op)
          } else if (op.right == null || op.right[1] < (startSS[op.right[0]] || 0)) {
            // case 1. op.right is known
            var o = op
            // Remember: ?
            // -> set op.right
            //    1. to the first operation that is known (according to startSS)
            //    2. or to the first operation that has an origin that is not to the
            //      right of op.
            // For this we maintain a list of ops which origins are not found yet.
            var missing_origins = [op]
            var newright = op.right
            while (true) {
              if (o.left == null) {
                op.left = null
                send.push(op)
                if (!Y.utils.compareIds(o.id, op.id)) {
                  o = Y.Struct[op.struct].encode(o)
                  o.right = missing_origins[missing_origins.length - 1].id
                  send.push(o)
                }
                break
              }
              o = yield* this.getInsertion(o.left)
              // we set another o, check if we can reduce $missing_origins
              while (missing_origins.length > 0 && Y.utils.matchesId(o, missing_origins[missing_origins.length - 1].origin)) {
                missing_origins.pop()
              }
              if (o.id[1] < (startSS[o.id[0]] || 0)) {
                // case 2. o is known
                op.left = Y.utils.getLastId(o)
                send.push(op)
                break
              } else if (Y.utils.matchesId(o, op.origin)) {
                // case 3. o is op.origin
                op.left = op.origin
                send.push(op)
                op = Y.Struct[op.struct].encode(o)
                op.right = newright
                if (missing_origins.length > 0) {
                  console.log('This should not happen .. :( please report this')
                }
                missing_origins = [op]
              } else {
                // case 4. send o, continue to find op.origin
                var s = Y.Struct[op.struct].encode(o)
                s.right = missing_origins[missing_origins.length - 1].id
                s.left = s.origin
                send.push(s)
                missing_origins.push(o)
              }
            }
          }
        })
      }
      return send.reverse()
    }
    /*
     * Get the plain untransformed operations from the database.
     * You can apply these operations using .applyOperationsUntransformed(ops)
     *
     */
    * getOperationsUntransformed () {
      var ops = []
      yield* this.os.iterate(this, null, null, function * (op) {
        if (op.id[0] !== '_') {
          ops.push(op)
        }
      })
      return {
        untransformed: ops
      }
    }
    * applyOperationsUntransformed (m, stateSet) {
      var ops = m.untransformed
      for (var i = 0; i < ops.length; i++) {
        var op = ops[i]
        // create, and modify parent, if it is created implicitly
        if (op.parent != null && op.parent[0] === '_') {
          if (op.struct === 'Insert') {
            // update parents .map/start/end properties
            if (op.parentSub != null && op.left == null) {
              // op is child of Map
              let parent = yield* this.getOperation(op.parent)
              parent.map[op.parentSub] = op.id
              yield* this.setOperation(parent)
            } else if (op.right == null || op.left == null) {
              let parent = yield* this.getOperation(op.parent)
              if (op.right == null) {
                parent.end = Y.utils.getLastId(op)
              }
              if (op.left == null) {
                parent.start = op.id
              }
              yield* this.setOperation(parent)
            }
          }
        }
        yield* this.os.put(op)
      }
      for (var user in stateSet) {
        yield* this.ss.put({
          id: [user],
          clock: stateSet[user]
        })
      }
    }
    /* this is what we used before.. use this as a reference..
    * makeOperationReady (startSS, op) {
      op = Y.Struct[op.struct].encode(op)
      op = Y.utils.copyObject(op) -- use copyoperation instead now!
      var o = op
      var ids = [op.id]
      // search for the new op.right
      // it is either the first known op (according to startSS)
      // or the o that has no origin to the right of op
      // (this is why we use the ids array)
      while (o.right != null) {
        var right = yield* this.getOperation(o.right)
        if (o.right[1] < (startSS[o.right[0]] || 0) || !ids.some(function (id) {
          return Y.utils.compareIds(id, right.origin)
        })) {
          break
        }
        ids.push(o.right)
        o = right
      }
      op.right = o.right
      op.left = op.origin
      return op
    }
    */
    * flush () {
      yield* this.os.flush()
      yield* this.ss.flush()
      yield* this.ds.flush()
    }
  }
  Y.Transaction = TransactionInterface
}

},{}],16:[function(require,module,exports){
/* @flow */
'use strict'

/*
  EventHandler is an helper class for constructing custom types.

  Why: When constructing custom types, you sometimes want your types to work
  synchronous: E.g.
  ``` Synchronous
    mytype.setSomething("yay")
    mytype.getSomething() === "yay"
  ```
  versus
  ``` Asynchronous
    mytype.setSomething("yay")
    mytype.getSomething() === undefined
    mytype.waitForSomething().then(function(){
      mytype.getSomething() === "yay"
    })
  ```

  The structures usually work asynchronously (you have to wait for the
  database request to finish). EventHandler helps you to make your type
  synchronous.
*/
module.exports = function (Y /* : any*/) {
  Y.utils = {}

  Y.utils.bubbleEvent = function (type, event) {
    type.eventHandler.callEventListeners(event)
    event.path = []
    while (type != null && type._deepEventHandler != null) {
      type._deepEventHandler.callEventListeners(event)
      var parent = null
      if (type._parent != null) {
        parent = type.os.getType(type._parent)
      }
      if (parent != null && parent._getPathToChild != null) {
        event.path = [parent._getPathToChild(type._model)].concat(event.path)
        type = parent
      } else {
        type = null
      }
    }
  }

  class EventListenerHandler {
    constructor () {
      this.eventListeners = []
    }
    destroy () {
      this.eventListeners = null
    }
     /*
      Basic event listener boilerplate...
    */
    addEventListener (f) {
      this.eventListeners.push(f)
    }
    removeEventListener (f) {
      this.eventListeners = this.eventListeners.filter(function (g) {
        return f !== g
      })
    }
    removeAllEventListeners () {
      this.eventListeners = []
    }
    callEventListeners (event) {
      for (var i = 0; i < this.eventListeners.length; i++) {
        try {
          var _event = {}
          for (var name in event) {
            _event[name] = event[name]
          }
          this.eventListeners[i](_event)
        } catch (e) {
          console.error('Your observer threw an error. This error was caught so that Yjs still can ensure data consistency! In order to debug this error you have to check "Pause On Caught Exceptions"', e)
        }
      }
    }
  }
  Y.utils.EventListenerHandler = EventListenerHandler

  class EventHandler extends EventListenerHandler {
    /* ::
    waiting: Array<Insertion | Deletion>;
    awaiting: number;
    onevent: Function;
    eventListeners: Array<Function>;
    */
    /*
      onevent: is called when the structure changes.

      Note: "awaiting opertations" is used to denote operations that were
      prematurely called. Events for received operations can not be executed until
      all prematurely called operations were executed ("waiting operations")
    */
    constructor (onevent /* : Function */) {
      super()
      this.waiting = []
      this.awaiting = 0
      this.onevent = onevent
    }
    destroy () {
      super.destroy()
      this.waiting = null
      this.onevent = null
    }
    /*
      Call this when a new operation arrives. It will be executed right away if
      there are no waiting operations, that you prematurely executed
    */
    receivedOp (op) {
      if (this.awaiting <= 0) {
        this.onevent(op)
      } else if (op.struct === 'Delete') {
        var self = this
        var checkDelete = function checkDelete (d) {
          if (d.length == null) {
            throw new Error('This shouldn\'t happen! d.length must be defined!')
          }
          // we check if o deletes something in self.waiting
          // if so, we remove the deleted operation
          for (var w = 0; w < self.waiting.length; w++) {
            var i = self.waiting[w]
            if (i.struct === 'Insert' && i.id[0] === d.target[0]) {
              var iLength = i.hasOwnProperty('content') ? i.content.length : 1
              var dStart = d.target[1]
              var dEnd = d.target[1] + (d.length || 1)
              var iStart = i.id[1]
              var iEnd = i.id[1] + iLength
              // Check if they don't overlap
              if (iEnd <= dStart || dEnd <= iStart) {
                // no overlapping
                continue
              }
              // we check all overlapping cases. All cases:
              /*
                1)  iiiii
                      ddddd
                    --> modify i and d
                2)  iiiiiii
                      ddddd
                    --> modify i, remove d
                3)  iiiiiii
                      ddd
                    --> remove d, modify i, and create another i (for the right hand side)
                4)  iiiii
                    ddddddd
                    --> remove i, modify d
                5)  iiiiiii
                    ddddddd
                    --> remove both i and d (**)
                6)  iiiiiii
                    ddddd
                    --> modify i, remove d
                7)    iii
                    ddddddd
                    --> remove i, create and apply two d with checkDelete(d) (**)
                8)    iiiii
                    ddddddd
                    --> remove i, modify d (**)
                9)    iiiii
                    ddddd
                    --> modify i and d
                (**) (also check if i contains content or type)
              */
              // TODO: I left some debugger statements, because I want to debug all cases once in production. REMEMBER END TODO
              if (iStart < dStart) {
                if (dStart < iEnd) {
                  if (iEnd < dEnd) {
                    // Case 1
                    // remove the right part of i's content
                    i.content.splice(dStart - iStart)
                    // remove the start of d's deletion
                    d.length = dEnd - iEnd
                    d.target = [d.target[0], iEnd]
                    continue
                  } else if (iEnd === dEnd) {
                    // Case 2
                    i.content.splice(dStart - iStart)
                    // remove d, we do that by simply ending this function
                    return
                  } else { // (dEnd < iEnd)
                    // Case 3
                    var newI = {
                      id: [i.id[0], dEnd],
                      content: i.content.slice(dEnd - iStart),
                      struct: 'Insert'
                    }
                    self.waiting.push(newI)
                    i.content.splice(dStart - iStart)
                    return
                  }
                }
              } else if (dStart === iStart) {
                if (iEnd < dEnd) {
                  // Case 4
                  d.length = dEnd - iEnd
                  d.target = [d.target[0], iEnd]
                  i.content = []
                  continue
                } else if (iEnd === dEnd) {
                  // Case 5
                  self.waiting.splice(w, 1)
                  return
                } else { // (dEnd < iEnd)
                  // Case 6
                  i.content = i.content.slice(dEnd - iStart)
                  i.id = [i.id[0], dEnd]
                  return
                }
              } else { // (dStart < iStart)
                if (iStart < dEnd) {
                  // they overlap
                  /*
                  7)    iii
                      ddddddd
                      --> remove i, create and apply two d with checkDelete(d) (**)
                  8)    iiiii
                      ddddddd
                      --> remove i, modify d (**)
                  9)    iiiii
                      ddddd
                      --> modify i and d
                  */
                  if (iEnd < dEnd) {
                    // Case 7
                    // debugger // TODO: You did not test this case yet!!!! (add the debugger here)
                    self.waiting.splice(w, 1)
                    checkDelete({
                      target: [d.target[0], dStart],
                      length: iStart - dStart,
                      struct: 'Delete'
                    })
                    checkDelete({
                      target: [d.target[0], iEnd],
                      length: iEnd - dEnd,
                      struct: 'Delete'
                    })
                    return
                  } else if (iEnd === dEnd) {
                    // Case 8
                    self.waiting.splice(w, 1)
                    w--
                    d.length -= iLength
                    continue
                  } else { // dEnd < iEnd
                    // Case 9
                    d.length = iStart - dStart
                    i.content.splice(0, dEnd - iStart)
                    i.id = [i.id[0], dEnd]
                    continue
                  }
                }
              }
            }
          }
          // finished with remaining operations
          self.waiting.push(d)
        }
        if (op.key == null) {
          // deletes in list
          checkDelete(op)
        } else {
          // deletes in map
          this.waiting.push(op)
        }
      } else {
        this.waiting.push(op)
      }
    }
    /*
      You created some operations, and you want the `onevent` function to be
      called right away. Received operations will not be executed untill all
      prematurely called operations are executed
    */
    awaitAndPrematurelyCall (ops) {
      this.awaiting++
      ops.map(Y.utils.copyOperation).forEach(this.onevent)
    }
    * awaitOps (transaction, f, args) {
      function notSoSmartSort (array) {
        // this function sorts insertions in a executable order
        var result = []
        while (array.length > 0) {
          for (var i = 0; i < array.length; i++) {
            var independent = true
            for (var j = 0; j < array.length; j++) {
              if (Y.utils.matchesId(array[j], array[i].left)) {
                // array[i] depends on array[j]
                independent = false
                break
              }
            }
            if (independent) {
              result.push(array.splice(i, 1)[0])
              i--
            }
          }
        }
        return result
      }
      var before = this.waiting.length
      // somehow create new operations
      yield* f.apply(transaction, args)
      // remove all appended ops / awaited ops
      this.waiting.splice(before)
      if (this.awaiting > 0) this.awaiting--
      // if there are no awaited ops anymore, we can update all waiting ops, and send execute them (if there are still no awaited ops)
      if (this.awaiting === 0 && this.waiting.length > 0) {
        // update all waiting ops
        for (let i = 0; i < this.waiting.length; i++) {
          var o = this.waiting[i]
          if (o.struct === 'Insert') {
            var _o = yield* transaction.getInsertion(o.id)
            if (_o.parentSub != null && _o.left != null) {
              // if o is an insertion of a map struc (parentSub is defined), then it shouldn't be necessary to compute left
              this.waiting.splice(i, 1)
              i-- // update index
            } else if (!Y.utils.compareIds(_o.id, o.id)) {
              // o got extended
              o.left = [o.id[0], o.id[1] - 1]
            } else if (_o.left == null) {
              o.left = null
            } else {
              // find next undeleted op
              var left = yield* transaction.getInsertion(_o.left)
              while (left.deleted != null) {
                if (left.left != null) {
                  left = yield* transaction.getInsertion(left.left)
                } else {
                  left = null
                  break
                }
              }
              o.left = left != null ? Y.utils.getLastId(left) : null
            }
          }
        }
        // the previous stuff was async, so we have to check again!
        // We also pull changes from the bindings, if there exists such a method, this could increase awaiting too
        if (this._pullChanges != null) {
          this._pullChanges()
        }
        if (this.awaiting === 0) {
          // sort by type, execute inserts first
          var ins = []
          var dels = []
          this.waiting.forEach(function (o) {
            if (o.struct === 'Delete') {
              dels.push(o)
            } else {
              ins.push(o)
            }
          })
          this.waiting = []
          // put in executable order
          ins = notSoSmartSort(ins)
          // this.onevent can trigger the creation of another operation
          // -> check if this.awaiting increased & stop computation if it does
          for (var i = 0; i < ins.length; i++) {
            if (this.awaiting === 0) {
              this.onevent(ins[i])
            } else {
              this.waiting = this.waiting.concat(ins.slice(i))
              break
            }
          }
          for (i = 0; i < dels.length; i++) {
            if (this.awaiting === 0) {
              this.onevent(dels[i])
            } else {
              this.waiting = this.waiting.concat(dels.slice(i))
              break
            }
          }
        }
      }
    }
    // TODO: Remove awaitedInserts and awaitedDeletes in favor of awaitedOps, as they are deprecated and do not always work
    // Do this in one of the coming releases that are breaking anyway
    /*
      Call this when you successfully awaited the execution of n Insert operations
    */
    awaitedInserts (n) {
      var ops = this.waiting.splice(this.waiting.length - n)
      for (var oid = 0; oid < ops.length; oid++) {
        var op = ops[oid]
        if (op.struct === 'Insert') {
          for (var i = this.waiting.length - 1; i >= 0; i--) {
            let w = this.waiting[i]
            // TODO: do I handle split operations correctly here? Super unlikely, but yeah..
            // Also: can this case happen? Can op be inserted in the middle of a larger op that is in $waiting?
            if (w.struct === 'Insert') {
              if (Y.utils.matchesId(w, op.left)) {
                // include the effect of op in w
                w.right = op.id
                // exclude the effect of w in op
                op.left = w.left
              } else if (Y.utils.compareIds(w.id, op.right)) {
                // similar..
                w.left = Y.utils.getLastId(op)
                op.right = w.right
              }
            }
          }
        } else {
          throw new Error('Expected Insert Operation!')
        }
      }
      this._tryCallEvents(n)
    }
    /*
      Call this when you successfully awaited the execution of n Delete operations
    */
    awaitedDeletes (n, newLeft) {
      var ops = this.waiting.splice(this.waiting.length - n)
      for (var j = 0; j < ops.length; j++) {
        var del = ops[j]
        if (del.struct === 'Delete') {
          if (newLeft != null) {
            for (var i = 0; i < this.waiting.length; i++) {
              let w = this.waiting[i]
              // We will just care about w.left
              if (w.struct === 'Insert' && Y.utils.compareIds(del.target, w.left)) {
                w.left = newLeft
              }
            }
          }
        } else {
          throw new Error('Expected Delete Operation!')
        }
      }
      this._tryCallEvents(n)
    }
    /* (private)
      Try to execute the events for the waiting operations
    */
    _tryCallEvents () {
      function notSoSmartSort (array) {
        var result = []
        while (array.length > 0) {
          for (var i = 0; i < array.length; i++) {
            var independent = true
            for (var j = 0; j < array.length; j++) {
              if (Y.utils.matchesId(array[j], array[i].left)) {
                // array[i] depends on array[j]
                independent = false
                break
              }
            }
            if (independent) {
              result.push(array.splice(i, 1)[0])
              i--
            }
          }
        }
        return result
      }
      if (this.awaiting > 0) this.awaiting--
      if (this.awaiting === 0 && this.waiting.length > 0) {
        var ins = []
        var dels = []
        this.waiting.forEach(function (o) {
          if (o.struct === 'Delete') {
            dels.push(o)
          } else {
            ins.push(o)
          }
        })
        ins = notSoSmartSort(ins)
        ins.forEach(this.onevent)
        dels.forEach(this.onevent)
        this.waiting = []
      }
    }
  }
  Y.utils.EventHandler = EventHandler

  /*
    Default class of custom types!
  */
  class CustomType {
    getPath () {
      var parent = null
      if (this._parent != null) {
        parent = this.os.getType(this._parent)
      }
      if (parent != null && parent._getPathToChild != null) {
        var firstKey = parent._getPathToChild(this._model)
        var parentKeys = parent.getPath()
        parentKeys.push(firstKey)
        return parentKeys
      } else {
        return []
      }
    }
  }
  Y.utils.CustomType = CustomType

  /*
    A wrapper for the definition of a custom type.
    Every custom type must have three properties:

    * struct
      - Structname of this type
    * initType
      - Given a model, creates a custom type
    * class
      - the constructor of the custom type (e.g. in order to inherit from a type)
  */
  class CustomTypeDefinition { // eslint-disable-line
    /* ::
    struct: any;
    initType: any;
    class: Function;
    name: String;
    */
    constructor (def) {
      if (def.struct == null ||
        def.initType == null ||
        def.class == null ||
        def.name == null ||
        def.createType == null
      ) {
        throw new Error('Custom type was not initialized correctly!')
      }
      this.struct = def.struct
      this.initType = def.initType
      this.createType = def.createType
      this.class = def.class
      this.name = def.name
      if (def.appendAdditionalInfo != null) {
        this.appendAdditionalInfo = def.appendAdditionalInfo
      }
      this.parseArguments = (def.parseArguments || function () {
        return [this]
      }).bind(this)
      this.parseArguments.typeDefinition = this
    }
  }
  Y.utils.CustomTypeDefinition = CustomTypeDefinition

  Y.utils.isTypeDefinition = function isTypeDefinition (v) {
    if (v != null) {
      if (v instanceof Y.utils.CustomTypeDefinition) return [v]
      else if (v.constructor === Array && v[0] instanceof Y.utils.CustomTypeDefinition) return v
      else if (v instanceof Function && v.typeDefinition instanceof Y.utils.CustomTypeDefinition) return [v.typeDefinition]
    }
    return false
  }

  /*
    Make a flat copy of an object
    (just copy properties)
  */
  function copyObject (o) {
    var c = {}
    for (var key in o) {
      c[key] = o[key]
    }
    return c
  }
  Y.utils.copyObject = copyObject

  /*
    Copy an operation, so that it can be manipulated.
    Note: You must not change subproperties (except o.content)!
  */
  function copyOperation (o) {
    o = copyObject(o)
    if (o.content != null) {
      o.content = o.content.map(function (c) { return c })
    }
    return o
  }

  Y.utils.copyOperation = copyOperation

  /*
    Defines a smaller relation on Id's
  */
  function smaller (a, b) {
    return a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || typeof a[1] < typeof b[1]))
  }
  Y.utils.smaller = smaller

  function inDeletionRange (del, ins) {
    return del.target[0] === ins[0] && del.target[1] <= ins[1] && ins[1] < del.target[1] + (del.length || 1)
  }
  Y.utils.inDeletionRange = inDeletionRange

  function compareIds (id1, id2) {
    if (id1 == null || id2 == null) {
      return id1 === id2
    } else {
      return id1[0] === id2[0] && id1[1] === id2[1]
    }
  }
  Y.utils.compareIds = compareIds

  function matchesId (op, id) {
    if (id == null || op == null) {
      return id === op
    } else {
      if (id[0] === op.id[0]) {
        if (op.content == null) {
          return id[1] === op.id[1]
        } else {
          return id[1] >= op.id[1] && id[1] < op.id[1] + op.content.length
        }
      }
    }
  }
  Y.utils.matchesId = matchesId

  function getLastId (op) {
    if (op.content == null || op.content.length === 1) {
      return op.id
    } else {
      return [op.id[0], op.id[1] + op.content.length - 1]
    }
  }
  Y.utils.getLastId = getLastId

  function createEmptyOpsArray (n) {
    var a = new Array(n)
    for (var i = 0; i < a.length; i++) {
      a[i] = {
        id: [null, null]
      }
    }
    return a
  }

  function createSmallLookupBuffer (Store) {
    /*
      This buffer implements a very small buffer that temporarily stores operations
      after they are read / before they are written.
      The buffer basically implements FIFO. Often requested lookups will be re-queued every time they are looked up / written.

      It can speed up lookups on Operation Stores and State Stores. But it does not require notable use of memory or processing power.

      Good for os and ss, bot not for ds (because it often uses methods that require a flush)

      I tried to optimize this for performance, therefore no highlevel operations.
    */
    class SmallLookupBuffer extends Store {
      constructor (arg1, arg2) {
        // super(...arguments) -- do this when this is supported by stable nodejs
        super(arg1, arg2)
        this.writeBuffer = createEmptyOpsArray(5)
        this.readBuffer = createEmptyOpsArray(10)
      }
      * find (id, noSuperCall) {
        var i, r
        for (i = this.readBuffer.length - 1; i >= 0; i--) {
          r = this.readBuffer[i]
          // we don't have to use compareids, because id is always defined!
          if (r.id[1] === id[1] && r.id[0] === id[0]) {
            // found r
            // move r to the end of readBuffer
            for (; i < this.readBuffer.length - 1; i++) {
              this.readBuffer[i] = this.readBuffer[i + 1]
            }
            this.readBuffer[this.readBuffer.length - 1] = r
            return r
          }
        }
        var o
        for (i = this.writeBuffer.length - 1; i >= 0; i--) {
          r = this.writeBuffer[i]
          if (r.id[1] === id[1] && r.id[0] === id[0]) {
            o = r
            break
          }
        }
        if (i < 0 && noSuperCall === undefined) {
          // did not reach break in last loop
          // read id and put it to the end of readBuffer
          o = yield* super.find(id)
        }
        if (o != null) {
          for (i = 0; i < this.readBuffer.length - 1; i++) {
            this.readBuffer[i] = this.readBuffer[i + 1]
          }
          this.readBuffer[this.readBuffer.length - 1] = o
        }
        return o
      }
      * put (o) {
        var id = o.id
        var i, r // helper variables
        for (i = this.writeBuffer.length - 1; i >= 0; i--) {
          r = this.writeBuffer[i]
          if (r.id[1] === id[1] && r.id[0] === id[0]) {
            // is already in buffer
            // forget r, and move o to the end of writeBuffer
            for (; i < this.writeBuffer.length - 1; i++) {
              this.writeBuffer[i] = this.writeBuffer[i + 1]
            }
            this.writeBuffer[this.writeBuffer.length - 1] = o
            break
          }
        }
        if (i < 0) {
          // did not reach break in last loop
          // write writeBuffer[0]
          var write = this.writeBuffer[0]
          if (write.id[0] !== null) {
            yield* super.put(write)
          }
          // put o to the end of writeBuffer
          for (i = 0; i < this.writeBuffer.length - 1; i++) {
            this.writeBuffer[i] = this.writeBuffer[i + 1]
          }
          this.writeBuffer[this.writeBuffer.length - 1] = o
        }
        // check readBuffer for every occurence of o.id, overwrite if found
        // whether found or not, we'll append o to the readbuffer
        for (i = 0; i < this.readBuffer.length - 1; i++) {
          r = this.readBuffer[i + 1]
          if (r.id[1] === id[1] && r.id[0] === id[0]) {
            this.readBuffer[i] = o
          } else {
            this.readBuffer[i] = r
          }
        }
        this.readBuffer[this.readBuffer.length - 1] = o
      }
      * delete (id) {
        var i, r
        for (i = 0; i < this.readBuffer.length; i++) {
          r = this.readBuffer[i]
          if (r.id[1] === id[1] && r.id[0] === id[0]) {
            this.readBuffer[i] = {
              id: [null, null]
            }
          }
        }
        yield* this.flush()
        yield* super.delete(id)
      }
      * findWithLowerBound (id) {
        var o = yield* this.find(id, true)
        if (o != null) {
          return o
        } else {
          yield* this.flush()
          return yield* super.findWithLowerBound.apply(this, arguments)
        }
      }
      * findWithUpperBound (id) {
        var o = yield* this.find(id, true)
        if (o != null) {
          return o
        } else {
          yield* this.flush()
          return yield* super.findWithUpperBound.apply(this, arguments)
        }
      }
      * findNext () {
        yield* this.flush()
        return yield* super.findNext.apply(this, arguments)
      }
      * findPrev () {
        yield* this.flush()
        return yield* super.findPrev.apply(this, arguments)
      }
      * iterate () {
        yield* this.flush()
        yield* super.iterate.apply(this, arguments)
      }
      * flush () {
        for (var i = 0; i < this.writeBuffer.length; i++) {
          var write = this.writeBuffer[i]
          if (write.id[0] !== null) {
            yield* super.put(write)
            this.writeBuffer[i] = {
              id: [null, null]
            }
          }
        }
      }
    }
    return SmallLookupBuffer
  }
  Y.utils.createSmallLookupBuffer = createSmallLookupBuffer

  // Generates a unique id, for use as a user id.
  // Thx to @jed for this script https://gist.github.com/jed/982883
  function generateGuid(a){return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,generateGuid)} // eslint-disable-line
  Y.utils.generateGuid = generateGuid
}

},{}],17:[function(require,module,exports){
/* @flow */
'use strict'

require('./Connector.js')(Y)
require('./Database.js')(Y)
require('./Transaction.js')(Y)
require('./Struct.js')(Y)
require('./Utils.js')(Y)
require('./Connectors/Test.js')(Y)

Y.debug = require('debug')

var requiringModules = {}

module.exports = Y
Y.requiringModules = requiringModules

Y.extend = function (name, value) {
  if (arguments.length === 2 && typeof name === 'string') {
    if (value instanceof Y.utils.CustomTypeDefinition) {
      Y[name] = value.parseArguments
    } else {
      Y[name] = value
    }
    if (requiringModules[name] != null) {
      requiringModules[name].resolve()
      delete requiringModules[name]
    }
  } else {
    for (var i = 0; i < arguments.length; i++) {
      var f = arguments[i]
      if (typeof f === 'function') {
        f(Y)
      } else {
        throw new Error('Expected function!')
      }
    }
  }
}

Y.requestModules = requestModules
function requestModules (modules) {
  var sourceDir
  if (Y.sourceDir === null) {
    sourceDir = null
  } else {
    sourceDir = Y.sourceDir || '/bower_components'
  }
  // determine if this module was compiled for es5 or es6 (y.js vs. y.es6)
  // if Insert.execute is a Function, then it isnt a generator..
  // then load the es5(.js) files..
  var extention = typeof regeneratorRuntime !== 'undefined' ? '.js' : '.es6'
  var promises = []
  for (var i = 0; i < modules.length; i++) {
    var module = modules[i].split('(')[0]
    var modulename = 'y-' + module.toLowerCase()
    if (Y[module] == null) {
      if (requiringModules[module] == null) {
        // module does not exist
        if (typeof window !== 'undefined' && window.Y !== 'undefined') {
          if (sourceDir != null) {
            var imported = document.createElement('script')
            imported.src = sourceDir + '/' + modulename + '/' + modulename + extention
            document.head.appendChild(imported)
          }
          let requireModule = {}
          requiringModules[module] = requireModule
          requireModule.promise = new Promise(function (resolve) {
            requireModule.resolve = resolve
          })
          promises.push(requireModule.promise)
        } else {
          console.info('YJS: Please do not depend on automatic requiring of modules anymore! Extend modules as follows `require(\'y-modulename\')(Y)`')
          require(modulename)(Y)
        }
      } else {
        promises.push(requiringModules[modules[i]].promise)
      }
    }
  }
  return Promise.all(promises)
}

/* ::
type MemoryOptions = {
  name: 'memory'
}
type IndexedDBOptions = {
  name: 'indexeddb',
  namespace: string
}
type DbOptions = MemoryOptions | IndexedDBOptions

type WebRTCOptions = {
  name: 'webrtc',
  room: string
}
type WebsocketsClientOptions = {
  name: 'websockets-client',
  room: string
}
type ConnectionOptions = WebRTCOptions | WebsocketsClientOptions

type YOptions = {
  connector: ConnectionOptions,
  db: DbOptions,
  types: Array<TypeName>,
  sourceDir: string,
  share: {[key: string]: TypeName}
}
*/

function Y (opts/* :YOptions */) /* :Promise<YConfig> */ {
  if (opts.hasOwnProperty('sourceDir')) {
    Y.sourceDir = opts.sourceDir
  }
  opts.types = opts.types != null ? opts.types : []
  var modules = [opts.db.name, opts.connector.name].concat(opts.types)
  for (var name in opts.share) {
    modules.push(opts.share[name])
  }
  return new Promise(function (resolve, reject) {
    if (opts == null) reject('An options object is expected! ')
    else if (opts.connector == null) reject('You must specify a connector! (missing connector property)')
    else if (opts.connector.name == null) reject('You must specify connector name! (missing connector.name property)')
    else if (opts.db == null) reject('You must specify a database! (missing db property)')
    else if (opts.connector.name == null) reject('You must specify db name! (missing db.name property)')
    else {
      opts = Y.utils.copyObject(opts)
      opts.connector = Y.utils.copyObject(opts.connector)
      opts.db = Y.utils.copyObject(opts.db)
      opts.share = Y.utils.copyObject(opts.share)
      setTimeout(function () {
        Y.requestModules(modules).then(function () {
          var yconfig = new YConfig(opts)
          yconfig.db.whenUserIdSet(function () {
            yconfig.init(function () {
              resolve(yconfig)
            })
          })
        }).catch(reject)
      }, 0)
    }
  })
}

class YConfig {
  /* ::
  db: Y.AbstractDatabase;
  connector: Y.AbstractConnector;
  share: {[key: string]: any};
  options: Object;
  */
  constructor (opts, callback) {
    this.options = opts
    this.db = new Y[opts.db.name](this, opts.db)
    this.connector = new Y[opts.connector.name](this, opts.connector)
    this.connected = true
  }
  init (callback) {
    var opts = this.options
    var share = {}
    this.share = share
    this.db.requestTransaction(function * requestTransaction () {
      // create shared object
      for (var propertyname in opts.share) {
        var typeConstructor = opts.share[propertyname].split('(')
        var typeName = typeConstructor.splice(0, 1)
        var type = Y[typeName]
        var typedef = type.typeDefinition
        var id = ['_', typedef.struct + '_' + typeName + '_' + propertyname + '_' + typeConstructor]
        var args = []
        if (typeConstructor.length === 1) {
          try {
            args = JSON.parse('[' + typeConstructor[0].split(')')[0] + ']')
          } catch (e) {
            throw new Error('Was not able to parse type definition! (share.' + propertyname + ')')
          }
          if (type.typeDefinition.parseArguments == null) {
            throw new Error(typeName + ' does not expect arguments!')
          } else {
            args = typedef.parseArguments(args[0])[1]
          }
        }
        share[propertyname] = yield* this.store.initType.call(this, id, args)
      }
      this.store.whenTransactionsFinished()
        .then(callback)
    })
  }
  isConnected () {
    return this.connector.isSynced
  }
  disconnect () {
    if (this.connected) {
      this.connected = false
      return this.connector.disconnect()
    } else {
      return Promise.resolve()
    }
  }
  reconnect () {
    if (!this.connected) {
      this.connected = true
      return this.connector.reconnect()
    } else {
      return Promise.resolve()
    }
  }
  destroy () {
    var self = this
    return this.close().then(function () {
      if (self.db.deleteDB != null) {
        return self.db.deleteDB()
      } else {
        return Promise.resolve()
      }
    })
  }
  close () {
    var self = this
    this.share = null
    if (this.connector.destroy != null) {
      this.connector.destroy()
    } else {
      this.connector.disconnect()
    }
    return this.db.whenTransactionsFinished(function () {
      this.db.destroyTypes()
      // make sure to wait for all transactions before destroying the db
      this.db.requestTransaction(function * () {
        yield* self.db.destroy()
      })
      return this.db.whenTransactionsFinished()
    })
  }
}

},{"./Connector.js":11,"./Connectors/Test.js":12,"./Database.js":13,"./Struct.js":14,"./Transaction.js":15,"./Utils.js":16,"debug":1}],18:[function(require,module,exports){
var unique = require('uniq');

var data = [1, 2, 2, 3, 4, 5, 5, 5, 6];

console.log('2. unique(data) from public/main.js is:', unique(data));

},{"uniq":6}],19:[function(require,module,exports){
console.log("1. FROGS AND TOADS within PUBLIC folder...")

var awesome = "awesome, from script.js in public folder... you got it!"

console.log('1. this is: ', awesome)

},{}],20:[function(require,module,exports){
console.log('hello from src/yjs...')

const Y = require('yjs')

// Yjs plugins
require('y-memory')(Y)
require('y-array')(Y)
require('y-text')(Y)
//will also need a connector here... not y-ipfs-connector, but something with socket.io

Y({
  db: {
    name: 'memory'
  },
  connector: {
    // name: 'ipfs', // use the IPFS connector
    room: 'Textarea-example-dev',
    // ipfs: ipfs
  },
  share: {
    textarea: 'Text' // y.share.textarea is of type Y.Text
  }
}).then(function (y) {
  // bind the textarea to a shared text element
  y.share.textarea.bind(document.getElementById('textfield'))
})

},{"y-array":7,"y-memory":8,"y-text":10,"yjs":17}]},{},[19,18,20]);
