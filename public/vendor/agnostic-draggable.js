(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.agnosticDraggable = {}));
})(this, (function (exports) { 'use strict';

  function _arrayLikeToArray(r, a) {
    (null == a || a > r.length) && (a = r.length);
    for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
    return n;
  }
  function _arrayWithHoles(r) {
    if (Array.isArray(r)) return r;
  }
  function _assertThisInitialized(e) {
    if (void 0 === e) throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    return e;
  }
  function _callSuper(t, o, e) {
    return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
  }
  function _classCallCheck(a, n) {
    if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function");
  }
  function _defineProperties(e, r) {
    for (var t = 0; t < r.length; t++) {
      var o = r[t];
      o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o);
    }
  }
  function _createClass(e, r, t) {
    return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", {
      writable: !1
    }), e;
  }
  function _defineProperty(e, r, t) {
    return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
      value: t,
      enumerable: !0,
      configurable: !0,
      writable: !0
    }) : e[r] = t, e;
  }
  function _get() {
    return _get = "undefined" != typeof Reflect && Reflect.get ? Reflect.get.bind() : function (e, t, r) {
      var p = _superPropBase(e, t);
      if (p) {
        var n = Object.getOwnPropertyDescriptor(p, t);
        return n.get ? n.get.call(arguments.length < 3 ? e : r) : n.value;
      }
    }, _get.apply(null, arguments);
  }
  function _getPrototypeOf(t) {
    return _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function (t) {
      return t.__proto__ || Object.getPrototypeOf(t);
    }, _getPrototypeOf(t);
  }
  function _inherits(t, e) {
    if ("function" != typeof e && null !== e) throw new TypeError("Super expression must either be null or a function");
    t.prototype = Object.create(e && e.prototype, {
      constructor: {
        value: t,
        writable: !0,
        configurable: !0
      }
    }), Object.defineProperty(t, "prototype", {
      writable: !1
    }), e && _setPrototypeOf(t, e);
  }
  function _isNativeReflectConstruct() {
    try {
      var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {}));
    } catch (t) {}
    return (_isNativeReflectConstruct = function () {
      return !!t;
    })();
  }
  function _iterableToArrayLimit(r, l) {
    var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
    if (null != t) {
      var e,
        n,
        i,
        u,
        a = [],
        f = !0,
        o = !1;
      try {
        if (i = (t = t.call(r)).next, 0 === l) {
          if (Object(t) !== t) return;
          f = !1;
        } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0);
      } catch (r) {
        o = !0, n = r;
      } finally {
        try {
          if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return;
        } finally {
          if (o) throw n;
        }
      }
      return a;
    }
  }
  function _nonIterableRest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
  }
  function ownKeys$2(e, r) {
    var t = Object.keys(e);
    if (Object.getOwnPropertySymbols) {
      var o = Object.getOwnPropertySymbols(e);
      r && (o = o.filter(function (r) {
        return Object.getOwnPropertyDescriptor(e, r).enumerable;
      })), t.push.apply(t, o);
    }
    return t;
  }
  function _objectSpread2(e) {
    for (var r = 1; r < arguments.length; r++) {
      var t = null != arguments[r] ? arguments[r] : {};
      r % 2 ? ownKeys$2(Object(t), !0).forEach(function (r) {
        _defineProperty(e, r, t[r]);
      }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$2(Object(t)).forEach(function (r) {
        Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
      });
    }
    return e;
  }
  function _possibleConstructorReturn(t, e) {
    if (e && ("object" == typeof e || "function" == typeof e)) return e;
    if (void 0 !== e) throw new TypeError("Derived constructors may only return object or undefined");
    return _assertThisInitialized(t);
  }
  function _setPrototypeOf(t, e) {
    return _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function (t, e) {
      return t.__proto__ = e, t;
    }, _setPrototypeOf(t, e);
  }
  function _slicedToArray(r, e) {
    return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
  }
  function _superPropBase(t, o) {
    for (; !{}.hasOwnProperty.call(t, o) && null !== (t = _getPrototypeOf(t)););
    return t;
  }
  function _superPropGet(t, e, o, r) {
    var p = _get(_getPrototypeOf(1 & r ? t.prototype : t), e, o);
    return 2 & r && "function" == typeof p ? function (t) {
      return p.apply(o, t);
    } : p;
  }
  function _toPrimitive(t, r) {
    if ("object" != typeof t || !t) return t;
    var e = t[Symbol.toPrimitive];
    if (void 0 !== e) {
      var i = e.call(t, r || "default");
      if ("object" != typeof i) return i;
      throw new TypeError("@@toPrimitive must return a primitive value.");
    }
    return ("string" === r ? String : Number)(t);
  }
  function _toPropertyKey(t) {
    var i = _toPrimitive(t, "string");
    return "symbol" == typeof i ? i : i + "";
  }
  function _unsupportedIterableToArray(r, a) {
    if (r) {
      if ("string" == typeof r) return _arrayLikeToArray(r, a);
      var t = {}.toString.call(r).slice(8, -1);
      return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
    }
  }

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function getDefaultExportFromCjs (x) {
  	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
  }

  /**
   * Checks if `value` is `undefined`.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is `undefined`, else `false`.
   * @example
   *
   * _.isUndefined(void 0);
   * // => true
   *
   * _.isUndefined(null);
   * // => false
   */

  function isUndefined(value) {
    return value === undefined;
  }

  var isUndefined_1 = isUndefined;

  var isUndefined$1 = /*@__PURE__*/getDefaultExportFromCjs(isUndefined_1);

  var Plugin = /*#__PURE__*/function () {
    function Plugin(container) {
      _classCallCheck(this, Plugin);
      _defineProperty(this, "container", null);
      _defineProperty(this, "constraintPosition", function (pos) {
        return pos;
      });
      this.container = container;
    }
    return _createClass(Plugin, [{
      key: "supported",
      get: function get() {
        return false;
      }
    }, {
      key: "startEvent",
      get: function get() {
        if (this.isResizable()) {
          return 'resize:start';
        }
        if (this.isSortable()) {
          return 'sort:start';
        }
        return 'drag:start';
      }
    }, {
      key: "moveEvent",
      get: function get() {
        if (this.isResizable()) {
          return 'resize:change';
        }
        if (this.isSortable()) {
          return 'sort:move';
        }
        return 'drag:move';
      }
    }, {
      key: "stopEvent",
      get: function get() {
        if (this.isResizable()) {
          return 'resize:stop';
        }
        if (this.isSortable()) {
          return 'sort:stop';
        }
        return 'drag:stop';
      }
    }, {
      key: "isDraggable",
      value: function isDraggable() {
        return this.container && !isUndefined$1(this.container.dragging);
      }
    }, {
      key: "isSortable",
      value: function isSortable() {
        return this.container && !isUndefined$1(this.container.items);
      }
    }, {
      key: "isResizable",
      value: function isResizable() {
        return this.container && !isUndefined$1(this.container.resizing);
      }
    }, {
      key: "attach",
      value: function attach() {
        if (this.supported) {
          this.container.on(this.startEvent, this.onDragStart);
          this.container.on(this.moveEvent, this.onDragMove);
          this.container.on(this.stopEvent, this.onDragStop);
        }
      }
    }, {
      key: "detach",
      value: function detach() {
        if (this.supported) {
          this.container.off(this.startEvent, this.onDragStart);
          this.container.off(this.moveEvent, this.onDragMove);
          this.container.off(this.stopEvent, this.onDragStop);
        }
      }
    }, {
      key: "onDragStart",
      value: function onDragStart(event) {}
    }, {
      key: "onDragMove",
      value: function onDragMove(event) {}
    }, {
      key: "onDragStop",
      value: function onDragStop(event) {}
    }]);
  }();

  /**
   * Returns the owner document of a given element.
   * 
   * @param node the element
   */
  function ownerDocument(node) {
    return node && node.ownerDocument || document;
  }

  /**
   * Returns the actively focused element safely.
   *
   * @param doc the document to check
   */

  function activeElement(doc) {
    if (doc === void 0) {
      doc = ownerDocument();
    }

    // Support: IE 9 only
    // IE9 throws an "Unspecified error" accessing document.activeElement from an <iframe>
    try {
      var active = doc.activeElement; // IE11 returns a seemingly empty object in some cases when accessing
      // document.activeElement from an <iframe>

      if (!active || !active.nodeName) return null;
      return active;
    } catch (e) {
      /* ie throws if no active element */
      return doc.body;
    }
  }

  /**
   * Checks if a given element has a CSS class.
   * 
   * @param element the element
   * @param className the CSS class name
   */
  function hasClass(element, className) {
    if (element.classList) return !!className && element.classList.contains(className);
    return (" " + (element.className.baseVal || element.className) + " ").indexOf(" " + className + " ") !== -1;
  }

  /**
   * Adds a CSS class to a given element.
   * 
   * @param element the element
   * @param className the CSS class name
   */

  function addClass(element, className) {
    if (element.classList) element.classList.add(className);else if (!hasClass(element, className)) if (typeof element.className === 'string') element.className = element.className + " " + className;else element.setAttribute('class', (element.className && element.className.baseVal || '') + " " + className);
  }

  var canUseDOM = !!(typeof window !== 'undefined' && window.document && window.document.createElement);

  /* eslint-disable no-return-assign */
  var optionsSupported = false;
  var onceSupported = false;

  try {
    var options = {
      get passive() {
        return optionsSupported = true;
      },

      get once() {
        // eslint-disable-next-line no-multi-assign
        return onceSupported = optionsSupported = true;
      }

    };

    if (canUseDOM) {
      window.addEventListener('test', options, options);
      window.removeEventListener('test', options, true);
    }
  } catch (e) {
    /* */
  }

  /**
   * An `addEventListener` ponyfill, supports the `once` option
   * 
   * @param node the element
   * @param eventName the event name
   * @param handle the handler
   * @param options event options
   */
  function addEventListener(node, eventName, handler, options) {
    if (options && typeof options !== 'boolean' && !onceSupported) {
      var once = options.once,
          capture = options.capture;
      var wrappedHandler = handler;

      if (!onceSupported && once) {
        wrappedHandler = handler.__once || function onceHandler(event) {
          this.removeEventListener(eventName, onceHandler, capture);
          handler.call(this, event);
        };

        handler.__once = wrappedHandler;
      }

      node.addEventListener(eventName, wrappedHandler, optionsSupported ? options : capture);
    }

    node.addEventListener(eventName, handler, options);
  }

  /**
   * Returns the owner window of a given element.
   * 
   * @param node the element
   */

  function ownerWindow(node) {
    var doc = ownerDocument(node);
    return doc && doc.defaultView || window;
  }

  /**
   * Returns one or all computed style properties of an element.
   * 
   * @param node the element
   * @param psuedoElement the style property
   */

  function getComputedStyle$1(node, psuedoElement) {
    return ownerWindow(node).getComputedStyle(node, psuedoElement);
  }

  var rUpper = /([A-Z])/g;
  function hyphenate(string) {
    return string.replace(rUpper, '-$1').toLowerCase();
  }

  /**
   * Copyright 2013-2014, Facebook, Inc.
   * All rights reserved.
   * https://github.com/facebook/react/blob/2aeb8a2a6beb00617a4217f7f8284924fa2ad819/src/vendor/core/hyphenateStyleName.js
   */
  var msPattern = /^ms-/;
  function hyphenateStyleName(string) {
    return hyphenate(string).replace(msPattern, '-ms-');
  }

  var supportedTransforms = /^((translate|rotate|scale)(X|Y|Z|3d)?|matrix(3d)?|perspective|skew(X|Y)?)$/i;
  function isTransform(value) {
    return !!(value && supportedTransforms.test(value));
  }

  function style(node, property) {
    var css = '';
    var transforms = '';

    if (typeof property === 'string') {
      return node.style.getPropertyValue(hyphenateStyleName(property)) || getComputedStyle$1(node).getPropertyValue(hyphenateStyleName(property));
    }

    Object.keys(property).forEach(function (key) {
      var value = property[key];

      if (!value && value !== 0) {
        node.style.removeProperty(hyphenateStyleName(key));
      } else if (isTransform(key)) {
        transforms += key + "(" + value + ") ";
      } else {
        css += hyphenateStyleName(key) + ": " + value + ";";
      }
    });

    if (transforms) {
      css += "transform: " + transforms + ";";
    }

    node.style.cssText += ";" + css;
  }

  /**
   * A `removeEventListener` ponyfill
   * 
   * @param node the element
   * @param eventName the event name
   * @param handle the handler
   * @param options event options
   */
  function removeEventListener(node, eventName, handler, options) {
    var capture = options && typeof options !== 'boolean' ? options.capture : options;
    node.removeEventListener(eventName, handler, capture);

    if (handler.__once) {
      node.removeEventListener(eventName, handler.__once, capture);
    }
  }

  function listen(node, eventName, handler, options) {
    addEventListener(node, eventName, handler, options);
    return function () {
      removeEventListener(node, eventName, handler, options);
    };
  }

  /* https://github.com/component/raf */
  var prev$1 = new Date().getTime();

  function fallback(fn) {
    var curr = new Date().getTime();
    var ms = Math.max(0, 16 - (curr - prev$1));
    var handle = setTimeout(fn, ms);
    prev$1 = curr;
    return handle;
  }

  var vendors = ['', 'webkit', 'moz', 'o', 'ms'];
  var rafImpl = fallback; // eslint-disable-next-line import/no-mutable-exports

  var getKey = function getKey(vendor, k) {
    return vendor + (!vendor ? k : k[0].toUpperCase() + k.substr(1)) + "AnimationFrame";
  };

  if (canUseDOM) {
    vendors.some(function (vendor) {
      var rafMethod = getKey(vendor, 'request');

      if (rafMethod in window) {
        getKey(vendor, 'cancel'); // @ts-ignore

        rafImpl = function rafImpl(cb) {
          return window[rafMethod](cb);
        };
      }

      return !!rafImpl;
    });
  }

  /**
   * Gets or sets an attribute of a given element.
   * 
   * @param node the element
   * @param attr the attribute to get or set
   * @param val the attribute value
   */
  function attribute(node, attr, val) {
    if (node) {
      if (typeof val === 'undefined') {
        return node.getAttribute(attr);
      }

      if (!val && val !== '') {
        node.removeAttribute(attr);
      } else {
        node.setAttribute(attr, String(val));
      }
    }
  }

  var matchesImpl;
  /**
   * Checks if a given element matches a selector.
   * 
   * @param node the element
   * @param selector the selector
   */

  function matches(node, selector) {
    if (!matchesImpl) {
      var body = document.body;
      var nativeMatch = body.matches || body.matchesSelector || body.webkitMatchesSelector || body.mozMatchesSelector || body.msMatchesSelector;

      matchesImpl = function matchesImpl(n, s) {
        return nativeMatch.call(n, s);
      };
    }

    return matchesImpl(node, selector);
  }

  /**
   * Returns the closest parent element that matches a given selector.
   * 
   * @param node the reference element
   * @param selector the selector to match
   * @param stopAt stop traversing when this element is found
   */

  function closest(node, selector, stopAt) {
    if (node.closest && !stopAt) node.closest(selector);
    var nextNode = node;

    do {
      if (matches(nextNode, selector)) return nextNode;
      nextNode = nextNode.parentElement;
    } while (nextNode && nextNode !== stopAt && nextNode.nodeType === document.ELEMENT_NODE);

    return null;
  }

  /* eslint-disable no-bitwise, no-cond-assign */

  /**
   * Checks if an element contains another given element.
   * 
   * @param context the context element
   * @param node the element to check
   */
  function contains(context, node) {
    // HTML DOM and SVG DOM may have different support levels,
    // so we need to check on context instead of a document root element.
    if (context.contains) return context.contains(node);
    if (context.compareDocumentPosition) return context === node || !!(context.compareDocumentPosition(node) & 16);
  }

  Function.prototype.bind.call(Function.prototype.call, [].slice);

  var toArray$2 = Function.prototype.bind.call(Function.prototype.call, [].slice);
  /**
   * Runs `querySelectorAll` on a given element.
   * 
   * @param element the element
   * @param selector the selector
   */

  function qsa(element, selector) {
    return toArray$2(element.querySelectorAll(selector));
  }

  function isDocument(element) {
    return 'nodeType' in element && element.nodeType === document.DOCUMENT_NODE;
  }

  function isWindow(node) {
    if ('window' in node && node.window === node) return node;
    if (isDocument(node)) return node.defaultView || false;
    return false;
  }

  function getscrollAccessor(offset) {
    var prop = offset === 'pageXOffset' ? 'scrollLeft' : 'scrollTop';

    function scrollAccessor(node, val) {
      var win = isWindow(node);

      if (val === undefined) {
        return win ? win[offset] : node[prop];
      }

      if (win) {
        win.scrollTo(win[offset], val);
      } else {
        node[prop] = val;
      }
    }

    return scrollAccessor;
  }

  /**
   * Gets or sets the scroll left position of a given element.
   * 
   * @param node the element
   * @param val the position to set
   */

  var scrollLeft = getscrollAccessor('pageXOffset');

  /**
   * Gets or sets the scroll top position of a given element.
   * 
   * @param node the element
   * @param val the position to set
   */

  var scrollTop = getscrollAccessor('pageYOffset');

  /**
   * Returns the offset of a given element, including top and left positions, width and height.
   * 
   * @param node the element
   */

  function offset(node) {
    var doc = ownerDocument(node);
    var box = {
      top: 0,
      left: 0,
      height: 0,
      width: 0
    };
    var docElem = doc && doc.documentElement; // Make sure it's not a disconnected DOM node

    if (!docElem || !contains(docElem, node)) return box;
    if (node.getBoundingClientRect !== undefined) box = node.getBoundingClientRect();
    box = {
      top: box.top + scrollTop(docElem) - (docElem.clientTop || 0),
      left: box.left + scrollLeft(docElem) - (docElem.clientLeft || 0),
      width: box.width,
      height: box.height
    };
    return box;
  }

  /**
   * Returns the height of a given element.
   * 
   * @param node the element
   * @param client whether to use `clientHeight` if possible
   */

  function height(node, client) {
    var win = isWindow(node);
    return win ? win.innerHeight : client ? node.clientHeight : offset(node).height;
  }

  var regExpInputs = /^(?:input|select|textarea|button)$/i;
  /**
   * Checks if a given element is an input (input, select, textarea or button).
   * 
   * @param node the element to check
   */

  function isInput(node) {
    return node ? regExpInputs.test(node.nodeName) : false;
  }

  var isHTMLElement = function isHTMLElement(e) {
    return !!e && 'offsetParent' in e;
  };

  function offsetParent(node) {
    var doc = ownerDocument(node);
    var parent = node && node.offsetParent;

    while (isHTMLElement(parent) && parent.nodeName !== 'HTML' && style(parent, 'position') === 'static') {
      parent = parent.offsetParent;
    }

    return parent || doc.documentElement;
  }

  function _extends() {
    return _extends = Object.assign ? Object.assign.bind() : function (n) {
      for (var e = 1; e < arguments.length; e++) {
        var t = arguments[e];
        for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
      }
      return n;
    }, _extends.apply(null, arguments);
  }

  var nodeName = function nodeName(node) {
    return node.nodeName && node.nodeName.toLowerCase();
  };
  /**
   * Returns the relative position of a given element.
   * 
   * @param node the element
   * @param offsetParent the offset parent
   */


  function position$1(node, offsetParent$1) {
    var parentOffset = {
      top: 0,
      left: 0
    };
    var offset$1; // Fixed elements are offset from window (parentOffset = {top:0, left: 0},
    // because it is its only offset parent

    if (style(node, 'position') === 'fixed') {
      offset$1 = node.getBoundingClientRect();
    } else {
      var parent = offsetParent$1 || offsetParent(node);
      offset$1 = offset(node);
      if (nodeName(parent) !== 'html') parentOffset = offset(parent);
      var borderTop = String(style(parent, 'borderTopWidth') || 0);
      parentOffset.top += parseInt(borderTop, 10) - scrollTop(parent) || 0;
      var borderLeft = String(style(parent, 'borderLeftWidth') || 0);
      parentOffset.left += parseInt(borderLeft, 10) - scrollLeft(parent) || 0;
    }

    var marginTop = String(style(node, 'marginTop') || 0);
    var marginLeft = String(style(node, 'marginLeft') || 0); // Subtract parent offsets and node margins

    return _extends({}, offset$1, {
      top: offset$1.top - parentOffset.top - (parseInt(marginTop, 10) || 0),
      left: offset$1.left - parentOffset.left - (parseInt(marginLeft, 10) || 0)
    });
  }

  /**
   * Removes a given node from the DOM.
   * 
   * @param node the node to remove
   */
  function remove(node) {
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
      return node;
    }

    return null;
  }

  function replaceClassName(origClass, classToRemove) {
    return origClass.replace(new RegExp("(^|\\s)" + classToRemove + "(?:\\s|$)", 'g'), '$1').replace(/\s+/g, ' ').replace(/^\s*|\s*$/g, '');
  }
  /**
   * Removes a CSS class from a given element.
   * 
   * @param element the element
   * @param className the CSS class name
   */


  function removeClass(element, className) {
    if (element.classList) {
      element.classList.remove(className);
    } else if (typeof element.className === 'string') {
      element.className = replaceClassName(element.className, className);
    } else {
      element.setAttribute('class', replaceClassName(element.className && element.className.baseVal || '', className));
    }
  }

  /* eslint-disable no-cond-assign, no-continue */
  /**
   * Find the first scrollable parent of an element.
   *
   * @param element Starting element
   * @param firstPossible Stop at the first scrollable parent, even if it's not currently scrollable
   */

  function scrollParent$1(element, firstPossible) {
    var position = style(element, 'position');
    var excludeStatic = position === 'absolute';
    var ownerDoc = element.ownerDocument;
    if (position === 'fixed') return ownerDoc || document; // @ts-ignore

    while ((element = element.parentNode) && !isDocument(element)) {
      var isStatic = excludeStatic && style(element, 'position') === 'static';
      var style$1 = (style(element, 'overflow') || '') + (style(element, 'overflow-y') || '') + style(element, 'overflow-x');
      if (isStatic) continue;

      if (/(auto|scroll)/.test(style$1) && (firstPossible || height(element) < element.scrollHeight)) {
        return element;
      }
    }

    return ownerDoc || document;
  }

  /**
   * Returns the width of a given element.
   * 
   * @param node the element
   * @param client whether to use `clientWidth` if possible
   */

  function getWidth(node, client) {
    var win = isWindow(node);
    return win ? win.innerWidth : client ? node.clientWidth : offset(node).width;
  }

  var check = function (it) {
    return it && it.Math == Math && it;
  };

  // https://github.com/zloirock/core-js/issues/86#issuecomment-115759028
  var global$o =
    // eslint-disable-next-line es/no-global-this -- safe
    check(typeof globalThis == 'object' && globalThis) ||
    check(typeof window == 'object' && window) ||
    // eslint-disable-next-line no-restricted-globals -- safe
    check(typeof self == 'object' && self) ||
    check(typeof commonjsGlobal == 'object' && commonjsGlobal) ||
    // eslint-disable-next-line no-new-func -- fallback
    (function () { return this; })() || Function('return this')();

  var objectGetOwnPropertyDescriptor = {};

  var fails$l = function (exec) {
    try {
      return !!exec();
    } catch (error) {
      return true;
    }
  };

  var fails$k = fails$l;

  // Detect IE8's incomplete defineProperty implementation
  var descriptors = !fails$k(function () {
    // eslint-disable-next-line es/no-object-defineproperty -- required for testing
    return Object.defineProperty({}, 1, { get: function () { return 7; } })[1] != 7;
  });

  var fails$j = fails$l;

  var functionBindNative = !fails$j(function () {
    // eslint-disable-next-line es/no-function-prototype-bind -- safe
    var test = (function () { /* empty */ }).bind();
    // eslint-disable-next-line no-prototype-builtins -- safe
    return typeof test != 'function' || test.hasOwnProperty('prototype');
  });

  var NATIVE_BIND$4 = functionBindNative;

  var call$f = Function.prototype.call;

  var functionCall = NATIVE_BIND$4 ? call$f.bind(call$f) : function () {
    return call$f.apply(call$f, arguments);
  };

  var objectPropertyIsEnumerable = {};

  var $propertyIsEnumerable = {}.propertyIsEnumerable;
  // eslint-disable-next-line es/no-object-getownpropertydescriptor -- safe
  var getOwnPropertyDescriptor$2 = Object.getOwnPropertyDescriptor;

  // Nashorn ~ JDK8 bug
  var NASHORN_BUG = getOwnPropertyDescriptor$2 && !$propertyIsEnumerable.call({ 1: 2 }, 1);

  // `Object.prototype.propertyIsEnumerable` method implementation
  // https://tc39.es/ecma262/#sec-object.prototype.propertyisenumerable
  objectPropertyIsEnumerable.f = NASHORN_BUG ? function propertyIsEnumerable(V) {
    var descriptor = getOwnPropertyDescriptor$2(this, V);
    return !!descriptor && descriptor.enumerable;
  } : $propertyIsEnumerable;

  var createPropertyDescriptor$3 = function (bitmap, value) {
    return {
      enumerable: !(bitmap & 1),
      configurable: !(bitmap & 2),
      writable: !(bitmap & 4),
      value: value
    };
  };

  var NATIVE_BIND$3 = functionBindNative;

  var FunctionPrototype$2 = Function.prototype;
  var call$e = FunctionPrototype$2.call;
  var uncurryThisWithBind = NATIVE_BIND$3 && FunctionPrototype$2.bind.bind(call$e, call$e);

  var functionUncurryThis = NATIVE_BIND$3 ? uncurryThisWithBind : function (fn) {
    return function () {
      return call$e.apply(fn, arguments);
    };
  };

  var uncurryThis$o = functionUncurryThis;

  var toString$d = uncurryThis$o({}.toString);
  var stringSlice$3 = uncurryThis$o(''.slice);

  var classofRaw$2 = function (it) {
    return stringSlice$3(toString$d(it), 8, -1);
  };

  var uncurryThis$n = functionUncurryThis;
  var fails$i = fails$l;
  var classof$8 = classofRaw$2;

  var $Object$3 = Object;
  var split = uncurryThis$n(''.split);

  // fallback for non-array-like ES3 and non-enumerable old V8 strings
  var indexedObject = fails$i(function () {
    // throws an error in rhino, see https://github.com/mozilla/rhino/issues/346
    // eslint-disable-next-line no-prototype-builtins -- safe
    return !$Object$3('z').propertyIsEnumerable(0);
  }) ? function (it) {
    return classof$8(it) == 'String' ? split(it, '') : $Object$3(it);
  } : $Object$3;

  // we can't use just `it == null` since of `document.all` special case
  // https://tc39.es/ecma262/#sec-IsHTMLDDA-internal-slot-aec
  var isNullOrUndefined$5 = function (it) {
    return it === null || it === undefined;
  };

  var isNullOrUndefined$4 = isNullOrUndefined$5;

  var $TypeError$f = TypeError;

  // `RequireObjectCoercible` abstract operation
  // https://tc39.es/ecma262/#sec-requireobjectcoercible
  var requireObjectCoercible$5 = function (it) {
    if (isNullOrUndefined$4(it)) throw $TypeError$f("Can't call method on " + it);
    return it;
  };

  // toObject with fallback for non-array-like ES3 strings
  var IndexedObject$2 = indexedObject;
  var requireObjectCoercible$4 = requireObjectCoercible$5;

  var toIndexedObject$6 = function (it) {
    return IndexedObject$2(requireObjectCoercible$4(it));
  };

  var documentAll$2 = typeof document == 'object' && document.all;

  // https://tc39.es/ecma262/#sec-IsHTMLDDA-internal-slot
  // eslint-disable-next-line unicorn/no-typeof-undefined -- required for testing
  var IS_HTMLDDA = typeof documentAll$2 == 'undefined' && documentAll$2 !== undefined;

  var documentAll_1 = {
    all: documentAll$2,
    IS_HTMLDDA: IS_HTMLDDA
  };

  var $documentAll$1 = documentAll_1;

  var documentAll$1 = $documentAll$1.all;

  // `IsCallable` abstract operation
  // https://tc39.es/ecma262/#sec-iscallable
  var isCallable$j = $documentAll$1.IS_HTMLDDA ? function (argument) {
    return typeof argument == 'function' || argument === documentAll$1;
  } : function (argument) {
    return typeof argument == 'function';
  };

  var isCallable$i = isCallable$j;
  var $documentAll = documentAll_1;

  var documentAll = $documentAll.all;

  var isObject$d = $documentAll.IS_HTMLDDA ? function (it) {
    return typeof it == 'object' ? it !== null : isCallable$i(it) || it === documentAll;
  } : function (it) {
    return typeof it == 'object' ? it !== null : isCallable$i(it);
  };

  var global$n = global$o;
  var isCallable$h = isCallable$j;

  var aFunction = function (argument) {
    return isCallable$h(argument) ? argument : undefined;
  };

  var getBuiltIn$7 = function (namespace, method) {
    return arguments.length < 2 ? aFunction(global$n[namespace]) : global$n[namespace] && global$n[namespace][method];
  };

  var uncurryThis$m = functionUncurryThis;

  var objectIsPrototypeOf = uncurryThis$m({}.isPrototypeOf);

  var engineUserAgent = typeof navigator != 'undefined' && String(navigator.userAgent) || '';

  var global$m = global$o;
  var userAgent$5 = engineUserAgent;

  var process$4 = global$m.process;
  var Deno$1 = global$m.Deno;
  var versions = process$4 && process$4.versions || Deno$1 && Deno$1.version;
  var v8 = versions && versions.v8;
  var match$1, version;

  if (v8) {
    match$1 = v8.split('.');
    // in old Chrome, versions of V8 isn't V8 = Chrome / 10
    // but their correct versions are not interesting for us
    version = match$1[0] > 0 && match$1[0] < 4 ? 1 : +(match$1[0] + match$1[1]);
  }

  // BrowserFS NodeJS `process` polyfill incorrectly set `.v8` to `0.0`
  // so check `userAgent` even if `.v8` exists, but 0
  if (!version && userAgent$5) {
    match$1 = userAgent$5.match(/Edge\/(\d+)/);
    if (!match$1 || match$1[1] >= 74) {
      match$1 = userAgent$5.match(/Chrome\/(\d+)/);
      if (match$1) version = +match$1[1];
    }
  }

  var engineV8Version = version;

  /* eslint-disable es/no-symbol -- required for testing */

  var V8_VERSION$3 = engineV8Version;
  var fails$h = fails$l;

  // eslint-disable-next-line es/no-object-getownpropertysymbols -- required for testing
  var symbolConstructorDetection = !!Object.getOwnPropertySymbols && !fails$h(function () {
    var symbol = Symbol();
    // Chrome 38 Symbol has incorrect toString conversion
    // `get-own-property-symbols` polyfill symbols converted to object are not Symbol instances
    return !String(symbol) || !(Object(symbol) instanceof Symbol) ||
      // Chrome 38-40 symbols are not inherited from DOM collections prototypes to instances
      !Symbol.sham && V8_VERSION$3 && V8_VERSION$3 < 41;
  });

  /* eslint-disable es/no-symbol -- required for testing */

  var NATIVE_SYMBOL$1 = symbolConstructorDetection;

  var useSymbolAsUid = NATIVE_SYMBOL$1
    && !Symbol.sham
    && typeof Symbol.iterator == 'symbol';

  var getBuiltIn$6 = getBuiltIn$7;
  var isCallable$g = isCallable$j;
  var isPrototypeOf$2 = objectIsPrototypeOf;
  var USE_SYMBOL_AS_UID$1 = useSymbolAsUid;

  var $Object$2 = Object;

  var isSymbol$4 = USE_SYMBOL_AS_UID$1 ? function (it) {
    return typeof it == 'symbol';
  } : function (it) {
    var $Symbol = getBuiltIn$6('Symbol');
    return isCallable$g($Symbol) && isPrototypeOf$2($Symbol.prototype, $Object$2(it));
  };

  var $String$4 = String;

  var tryToString$5 = function (argument) {
    try {
      return $String$4(argument);
    } catch (error) {
      return 'Object';
    }
  };

  var isCallable$f = isCallable$j;
  var tryToString$4 = tryToString$5;

  var $TypeError$e = TypeError;

  // `Assert: IsCallable(argument) is true`
  var aCallable$a = function (argument) {
    if (isCallable$f(argument)) return argument;
    throw $TypeError$e(tryToString$4(argument) + ' is not a function');
  };

  var aCallable$9 = aCallable$a;
  var isNullOrUndefined$3 = isNullOrUndefined$5;

  // `GetMethod` abstract operation
  // https://tc39.es/ecma262/#sec-getmethod
  var getMethod$4 = function (V, P) {
    var func = V[P];
    return isNullOrUndefined$3(func) ? undefined : aCallable$9(func);
  };

  var call$d = functionCall;
  var isCallable$e = isCallable$j;
  var isObject$c = isObject$d;

  var $TypeError$d = TypeError;

  // `OrdinaryToPrimitive` abstract operation
  // https://tc39.es/ecma262/#sec-ordinarytoprimitive
  var ordinaryToPrimitive$1 = function (input, pref) {
    var fn, val;
    if (pref === 'string' && isCallable$e(fn = input.toString) && !isObject$c(val = call$d(fn, input))) return val;
    if (isCallable$e(fn = input.valueOf) && !isObject$c(val = call$d(fn, input))) return val;
    if (pref !== 'string' && isCallable$e(fn = input.toString) && !isObject$c(val = call$d(fn, input))) return val;
    throw $TypeError$d("Can't convert object to primitive value");
  };

  var shared$4 = {exports: {}};

  var global$l = global$o;

  // eslint-disable-next-line es/no-object-defineproperty -- safe
  var defineProperty$4 = Object.defineProperty;

  var defineGlobalProperty$3 = function (key, value) {
    try {
      defineProperty$4(global$l, key, { value: value, configurable: true, writable: true });
    } catch (error) {
      global$l[key] = value;
    } return value;
  };

  var global$k = global$o;
  var defineGlobalProperty$2 = defineGlobalProperty$3;

  var SHARED = '__core-js_shared__';
  var store$3 = global$k[SHARED] || defineGlobalProperty$2(SHARED, {});

  var sharedStore = store$3;

  var store$2 = sharedStore;

  (shared$4.exports = function (key, value) {
    return store$2[key] || (store$2[key] = value !== undefined ? value : {});
  })('versions', []).push({
    version: '3.28.0',
    mode: 'global',
    copyright: '© 2014-2023 Denis Pushkarev (zloirock.ru)',
    license: 'https://github.com/zloirock/core-js/blob/v3.28.0/LICENSE',
    source: 'https://github.com/zloirock/core-js'
  });

  var sharedExports = shared$4.exports;

  var requireObjectCoercible$3 = requireObjectCoercible$5;

  var $Object$1 = Object;

  // `ToObject` abstract operation
  // https://tc39.es/ecma262/#sec-toobject
  var toObject$4 = function (argument) {
    return $Object$1(requireObjectCoercible$3(argument));
  };

  var uncurryThis$l = functionUncurryThis;
  var toObject$3 = toObject$4;

  var hasOwnProperty$5 = uncurryThis$l({}.hasOwnProperty);

  // `HasOwnProperty` abstract operation
  // https://tc39.es/ecma262/#sec-hasownproperty
  // eslint-disable-next-line es/no-object-hasown -- safe
  var hasOwnProperty_1 = Object.hasOwn || function hasOwn(it, key) {
    return hasOwnProperty$5(toObject$3(it), key);
  };

  var uncurryThis$k = functionUncurryThis;

  var id = 0;
  var postfix = Math.random();
  var toString$c = uncurryThis$k(1.0.toString);

  var uid$2 = function (key) {
    return 'Symbol(' + (key === undefined ? '' : key) + ')_' + toString$c(++id + postfix, 36);
  };

  var global$j = global$o;
  var shared$3 = sharedExports;
  var hasOwn$9 = hasOwnProperty_1;
  var uid$1 = uid$2;
  var NATIVE_SYMBOL = symbolConstructorDetection;
  var USE_SYMBOL_AS_UID = useSymbolAsUid;

  var Symbol$7 = global$j.Symbol;
  var WellKnownSymbolsStore = shared$3('wks');
  var createWellKnownSymbol = USE_SYMBOL_AS_UID ? Symbol$7['for'] || Symbol$7 : Symbol$7 && Symbol$7.withoutSetter || uid$1;

  var wellKnownSymbol$g = function (name) {
    if (!hasOwn$9(WellKnownSymbolsStore, name)) {
      WellKnownSymbolsStore[name] = NATIVE_SYMBOL && hasOwn$9(Symbol$7, name)
        ? Symbol$7[name]
        : createWellKnownSymbol('Symbol.' + name);
    } return WellKnownSymbolsStore[name];
  };

  var call$c = functionCall;
  var isObject$b = isObject$d;
  var isSymbol$3 = isSymbol$4;
  var getMethod$3 = getMethod$4;
  var ordinaryToPrimitive = ordinaryToPrimitive$1;
  var wellKnownSymbol$f = wellKnownSymbol$g;

  var $TypeError$c = TypeError;
  var TO_PRIMITIVE = wellKnownSymbol$f('toPrimitive');

  // `ToPrimitive` abstract operation
  // https://tc39.es/ecma262/#sec-toprimitive
  var toPrimitive$1 = function (input, pref) {
    if (!isObject$b(input) || isSymbol$3(input)) return input;
    var exoticToPrim = getMethod$3(input, TO_PRIMITIVE);
    var result;
    if (exoticToPrim) {
      if (pref === undefined) pref = 'default';
      result = call$c(exoticToPrim, input, pref);
      if (!isObject$b(result) || isSymbol$3(result)) return result;
      throw $TypeError$c("Can't convert object to primitive value");
    }
    if (pref === undefined) pref = 'number';
    return ordinaryToPrimitive(input, pref);
  };

  var toPrimitive = toPrimitive$1;
  var isSymbol$2 = isSymbol$4;

  // `ToPropertyKey` abstract operation
  // https://tc39.es/ecma262/#sec-topropertykey
  var toPropertyKey$3 = function (argument) {
    var key = toPrimitive(argument, 'string');
    return isSymbol$2(key) ? key : key + '';
  };

  var global$i = global$o;
  var isObject$a = isObject$d;

  var document$3 = global$i.document;
  // typeof document.createElement is 'object' in old IE
  var EXISTS$1 = isObject$a(document$3) && isObject$a(document$3.createElement);

  var documentCreateElement$2 = function (it) {
    return EXISTS$1 ? document$3.createElement(it) : {};
  };

  var DESCRIPTORS$8 = descriptors;
  var fails$g = fails$l;
  var createElement$2 = documentCreateElement$2;

  // Thanks to IE8 for its funny defineProperty
  var ie8DomDefine = !DESCRIPTORS$8 && !fails$g(function () {
    // eslint-disable-next-line es/no-object-defineproperty -- required for testing
    return Object.defineProperty(createElement$2('div'), 'a', {
      get: function () { return 7; }
    }).a != 7;
  });

  var DESCRIPTORS$7 = descriptors;
  var call$b = functionCall;
  var propertyIsEnumerableModule = objectPropertyIsEnumerable;
  var createPropertyDescriptor$2 = createPropertyDescriptor$3;
  var toIndexedObject$5 = toIndexedObject$6;
  var toPropertyKey$2 = toPropertyKey$3;
  var hasOwn$8 = hasOwnProperty_1;
  var IE8_DOM_DEFINE$1 = ie8DomDefine;

  // eslint-disable-next-line es/no-object-getownpropertydescriptor -- safe
  var $getOwnPropertyDescriptor$1 = Object.getOwnPropertyDescriptor;

  // `Object.getOwnPropertyDescriptor` method
  // https://tc39.es/ecma262/#sec-object.getownpropertydescriptor
  objectGetOwnPropertyDescriptor.f = DESCRIPTORS$7 ? $getOwnPropertyDescriptor$1 : function getOwnPropertyDescriptor(O, P) {
    O = toIndexedObject$5(O);
    P = toPropertyKey$2(P);
    if (IE8_DOM_DEFINE$1) try {
      return $getOwnPropertyDescriptor$1(O, P);
    } catch (error) { /* empty */ }
    if (hasOwn$8(O, P)) return createPropertyDescriptor$2(!call$b(propertyIsEnumerableModule.f, O, P), O[P]);
  };

  var objectDefineProperty = {};

  var DESCRIPTORS$6 = descriptors;
  var fails$f = fails$l;

  // V8 ~ Chrome 36-
  // https://bugs.chromium.org/p/v8/issues/detail?id=3334
  var v8PrototypeDefineBug = DESCRIPTORS$6 && fails$f(function () {
    // eslint-disable-next-line es/no-object-defineproperty -- required for testing
    return Object.defineProperty(function () { /* empty */ }, 'prototype', {
      value: 42,
      writable: false
    }).prototype != 42;
  });

  var isObject$9 = isObject$d;

  var $String$3 = String;
  var $TypeError$b = TypeError;

  // `Assert: Type(argument) is Object`
  var anObject$d = function (argument) {
    if (isObject$9(argument)) return argument;
    throw $TypeError$b($String$3(argument) + ' is not an object');
  };

  var DESCRIPTORS$5 = descriptors;
  var IE8_DOM_DEFINE = ie8DomDefine;
  var V8_PROTOTYPE_DEFINE_BUG$1 = v8PrototypeDefineBug;
  var anObject$c = anObject$d;
  var toPropertyKey$1 = toPropertyKey$3;

  var $TypeError$a = TypeError;
  // eslint-disable-next-line es/no-object-defineproperty -- safe
  var $defineProperty = Object.defineProperty;
  // eslint-disable-next-line es/no-object-getownpropertydescriptor -- safe
  var $getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  var ENUMERABLE = 'enumerable';
  var CONFIGURABLE$1 = 'configurable';
  var WRITABLE = 'writable';

  // `Object.defineProperty` method
  // https://tc39.es/ecma262/#sec-object.defineproperty
  objectDefineProperty.f = DESCRIPTORS$5 ? V8_PROTOTYPE_DEFINE_BUG$1 ? function defineProperty(O, P, Attributes) {
    anObject$c(O);
    P = toPropertyKey$1(P);
    anObject$c(Attributes);
    if (typeof O === 'function' && P === 'prototype' && 'value' in Attributes && WRITABLE in Attributes && !Attributes[WRITABLE]) {
      var current = $getOwnPropertyDescriptor(O, P);
      if (current && current[WRITABLE]) {
        O[P] = Attributes.value;
        Attributes = {
          configurable: CONFIGURABLE$1 in Attributes ? Attributes[CONFIGURABLE$1] : current[CONFIGURABLE$1],
          enumerable: ENUMERABLE in Attributes ? Attributes[ENUMERABLE] : current[ENUMERABLE],
          writable: false
        };
      }
    } return $defineProperty(O, P, Attributes);
  } : $defineProperty : function defineProperty(O, P, Attributes) {
    anObject$c(O);
    P = toPropertyKey$1(P);
    anObject$c(Attributes);
    if (IE8_DOM_DEFINE) try {
      return $defineProperty(O, P, Attributes);
    } catch (error) { /* empty */ }
    if ('get' in Attributes || 'set' in Attributes) throw $TypeError$a('Accessors not supported');
    if ('value' in Attributes) O[P] = Attributes.value;
    return O;
  };

  var DESCRIPTORS$4 = descriptors;
  var definePropertyModule$4 = objectDefineProperty;
  var createPropertyDescriptor$1 = createPropertyDescriptor$3;

  var createNonEnumerableProperty$4 = DESCRIPTORS$4 ? function (object, key, value) {
    return definePropertyModule$4.f(object, key, createPropertyDescriptor$1(1, value));
  } : function (object, key, value) {
    object[key] = value;
    return object;
  };

  var makeBuiltIn$3 = {exports: {}};

  var DESCRIPTORS$3 = descriptors;
  var hasOwn$7 = hasOwnProperty_1;

  var FunctionPrototype$1 = Function.prototype;
  // eslint-disable-next-line es/no-object-getownpropertydescriptor -- safe
  var getDescriptor = DESCRIPTORS$3 && Object.getOwnPropertyDescriptor;

  var EXISTS = hasOwn$7(FunctionPrototype$1, 'name');
  // additional protection from minified / mangled / dropped function names
  var PROPER = EXISTS && (function something() { /* empty */ }).name === 'something';
  var CONFIGURABLE = EXISTS && (!DESCRIPTORS$3 || (DESCRIPTORS$3 && getDescriptor(FunctionPrototype$1, 'name').configurable));

  var functionName = {
    EXISTS: EXISTS,
    PROPER: PROPER,
    CONFIGURABLE: CONFIGURABLE
  };

  var uncurryThis$j = functionUncurryThis;
  var isCallable$d = isCallable$j;
  var store$1 = sharedStore;

  var functionToString = uncurryThis$j(Function.toString);

  // this helper broken in `core-js@3.4.1-3.4.4`, so we can't use `shared` helper
  if (!isCallable$d(store$1.inspectSource)) {
    store$1.inspectSource = function (it) {
      return functionToString(it);
    };
  }

  var inspectSource$3 = store$1.inspectSource;

  var global$h = global$o;
  var isCallable$c = isCallable$j;

  var WeakMap$2 = global$h.WeakMap;

  var weakMapBasicDetection = isCallable$c(WeakMap$2) && /native code/.test(String(WeakMap$2));

  var shared$2 = sharedExports;
  var uid = uid$2;

  var keys$2 = shared$2('keys');

  var sharedKey$2 = function (key) {
    return keys$2[key] || (keys$2[key] = uid(key));
  };

  var hiddenKeys$4 = {};

  var NATIVE_WEAK_MAP = weakMapBasicDetection;
  var global$g = global$o;
  var isObject$8 = isObject$d;
  var createNonEnumerableProperty$3 = createNonEnumerableProperty$4;
  var hasOwn$6 = hasOwnProperty_1;
  var shared$1 = sharedStore;
  var sharedKey$1 = sharedKey$2;
  var hiddenKeys$3 = hiddenKeys$4;

  var OBJECT_ALREADY_INITIALIZED = 'Object already initialized';
  var TypeError$2 = global$g.TypeError;
  var WeakMap$1 = global$g.WeakMap;
  var set$1, get, has;

  var enforce = function (it) {
    return has(it) ? get(it) : set$1(it, {});
  };

  var getterFor = function (TYPE) {
    return function (it) {
      var state;
      if (!isObject$8(it) || (state = get(it)).type !== TYPE) {
        throw TypeError$2('Incompatible receiver, ' + TYPE + ' required');
      } return state;
    };
  };

  if (NATIVE_WEAK_MAP || shared$1.state) {
    var store = shared$1.state || (shared$1.state = new WeakMap$1());
    /* eslint-disable no-self-assign -- prototype methods protection */
    store.get = store.get;
    store.has = store.has;
    store.set = store.set;
    /* eslint-enable no-self-assign -- prototype methods protection */
    set$1 = function (it, metadata) {
      if (store.has(it)) throw TypeError$2(OBJECT_ALREADY_INITIALIZED);
      metadata.facade = it;
      store.set(it, metadata);
      return metadata;
    };
    get = function (it) {
      return store.get(it) || {};
    };
    has = function (it) {
      return store.has(it);
    };
  } else {
    var STATE = sharedKey$1('state');
    hiddenKeys$3[STATE] = true;
    set$1 = function (it, metadata) {
      if (hasOwn$6(it, STATE)) throw TypeError$2(OBJECT_ALREADY_INITIALIZED);
      metadata.facade = it;
      createNonEnumerableProperty$3(it, STATE, metadata);
      return metadata;
    };
    get = function (it) {
      return hasOwn$6(it, STATE) ? it[STATE] : {};
    };
    has = function (it) {
      return hasOwn$6(it, STATE);
    };
  }

  var internalState = {
    set: set$1,
    get: get,
    has: has,
    enforce: enforce,
    getterFor: getterFor
  };

  var uncurryThis$i = functionUncurryThis;
  var fails$e = fails$l;
  var isCallable$b = isCallable$j;
  var hasOwn$5 = hasOwnProperty_1;
  var DESCRIPTORS$2 = descriptors;
  var CONFIGURABLE_FUNCTION_NAME = functionName.CONFIGURABLE;
  var inspectSource$2 = inspectSource$3;
  var InternalStateModule$1 = internalState;

  var enforceInternalState = InternalStateModule$1.enforce;
  var getInternalState$1 = InternalStateModule$1.get;
  var $String$2 = String;
  // eslint-disable-next-line es/no-object-defineproperty -- safe
  var defineProperty$3 = Object.defineProperty;
  var stringSlice$2 = uncurryThis$i(''.slice);
  var replace$3 = uncurryThis$i(''.replace);
  var join$1 = uncurryThis$i([].join);

  var CONFIGURABLE_LENGTH = DESCRIPTORS$2 && !fails$e(function () {
    return defineProperty$3(function () { /* empty */ }, 'length', { value: 8 }).length !== 8;
  });

  var TEMPLATE = String(String).split('String');

  var makeBuiltIn$2 = makeBuiltIn$3.exports = function (value, name, options) {
    if (stringSlice$2($String$2(name), 0, 7) === 'Symbol(') {
      name = '[' + replace$3($String$2(name), /^Symbol\(([^)]*)\)/, '$1') + ']';
    }
    if (options && options.getter) name = 'get ' + name;
    if (options && options.setter) name = 'set ' + name;
    if (!hasOwn$5(value, 'name') || (CONFIGURABLE_FUNCTION_NAME && value.name !== name)) {
      if (DESCRIPTORS$2) defineProperty$3(value, 'name', { value: name, configurable: true });
      else value.name = name;
    }
    if (CONFIGURABLE_LENGTH && options && hasOwn$5(options, 'arity') && value.length !== options.arity) {
      defineProperty$3(value, 'length', { value: options.arity });
    }
    try {
      if (options && hasOwn$5(options, 'constructor') && options.constructor) {
        if (DESCRIPTORS$2) defineProperty$3(value, 'prototype', { writable: false });
      // in V8 ~ Chrome 53, prototypes of some methods, like `Array.prototype.values`, are non-writable
      } else if (value.prototype) value.prototype = undefined;
    } catch (error) { /* empty */ }
    var state = enforceInternalState(value);
    if (!hasOwn$5(state, 'source')) {
      state.source = join$1(TEMPLATE, typeof name == 'string' ? name : '');
    } return value;
  };

  // add fake Function#toString for correct work wrapped methods / constructors with methods like LoDash isNative
  // eslint-disable-next-line no-extend-native -- required
  Function.prototype.toString = makeBuiltIn$2(function toString() {
    return isCallable$b(this) && getInternalState$1(this).source || inspectSource$2(this);
  }, 'toString');

  var makeBuiltInExports = makeBuiltIn$3.exports;

  var isCallable$a = isCallable$j;
  var definePropertyModule$3 = objectDefineProperty;
  var makeBuiltIn$1 = makeBuiltInExports;
  var defineGlobalProperty$1 = defineGlobalProperty$3;

  var defineBuiltIn$5 = function (O, key, value, options) {
    if (!options) options = {};
    var simple = options.enumerable;
    var name = options.name !== undefined ? options.name : key;
    if (isCallable$a(value)) makeBuiltIn$1(value, name, options);
    if (options.global) {
      if (simple) O[key] = value;
      else defineGlobalProperty$1(key, value);
    } else {
      try {
        if (!options.unsafe) delete O[key];
        else if (O[key]) simple = true;
      } catch (error) { /* empty */ }
      if (simple) O[key] = value;
      else definePropertyModule$3.f(O, key, {
        value: value,
        enumerable: false,
        configurable: !options.nonConfigurable,
        writable: !options.nonWritable
      });
    } return O;
  };

  var objectGetOwnPropertyNames = {};

  var ceil = Math.ceil;
  var floor$1 = Math.floor;

  // `Math.trunc` method
  // https://tc39.es/ecma262/#sec-math.trunc
  // eslint-disable-next-line es/no-math-trunc -- safe
  var mathTrunc = Math.trunc || function trunc(x) {
    var n = +x;
    return (n > 0 ? floor$1 : ceil)(n);
  };

  var trunc = mathTrunc;

  // `ToIntegerOrInfinity` abstract operation
  // https://tc39.es/ecma262/#sec-tointegerorinfinity
  var toIntegerOrInfinity$3 = function (argument) {
    var number = +argument;
    // eslint-disable-next-line no-self-compare -- NaN check
    return number !== number || number === 0 ? 0 : trunc(number);
  };

  var toIntegerOrInfinity$2 = toIntegerOrInfinity$3;

  var max$2 = Math.max;
  var min$1 = Math.min;

  // Helper for a popular repeating case of the spec:
  // Let integer be ? ToInteger(index).
  // If integer < 0, let result be max((length + integer), 0); else let result be min(integer, length).
  var toAbsoluteIndex$3 = function (index, length) {
    var integer = toIntegerOrInfinity$2(index);
    return integer < 0 ? max$2(integer + length, 0) : min$1(integer, length);
  };

  var toIntegerOrInfinity$1 = toIntegerOrInfinity$3;

  var min = Math.min;

  // `ToLength` abstract operation
  // https://tc39.es/ecma262/#sec-tolength
  var toLength$2 = function (argument) {
    return argument > 0 ? min(toIntegerOrInfinity$1(argument), 0x1FFFFFFFFFFFFF) : 0; // 2 ** 53 - 1 == 9007199254740991
  };

  var toLength$1 = toLength$2;

  // `LengthOfArrayLike` abstract operation
  // https://tc39.es/ecma262/#sec-lengthofarraylike
  var lengthOfArrayLike$7 = function (obj) {
    return toLength$1(obj.length);
  };

  var toIndexedObject$4 = toIndexedObject$6;
  var toAbsoluteIndex$2 = toAbsoluteIndex$3;
  var lengthOfArrayLike$6 = lengthOfArrayLike$7;

  // `Array.prototype.{ indexOf, includes }` methods implementation
  var createMethod$3 = function (IS_INCLUDES) {
    return function ($this, el, fromIndex) {
      var O = toIndexedObject$4($this);
      var length = lengthOfArrayLike$6(O);
      var index = toAbsoluteIndex$2(fromIndex, length);
      var value;
      // Array#includes uses SameValueZero equality algorithm
      // eslint-disable-next-line no-self-compare -- NaN check
      if (IS_INCLUDES && el != el) while (length > index) {
        value = O[index++];
        // eslint-disable-next-line no-self-compare -- NaN check
        if (value != value) return true;
      // Array#indexOf ignores holes, Array#includes - not
      } else for (;length > index; index++) {
        if ((IS_INCLUDES || index in O) && O[index] === el) return IS_INCLUDES || index || 0;
      } return !IS_INCLUDES && -1;
    };
  };

  var arrayIncludes = {
    // `Array.prototype.includes` method
    // https://tc39.es/ecma262/#sec-array.prototype.includes
    includes: createMethod$3(true),
    // `Array.prototype.indexOf` method
    // https://tc39.es/ecma262/#sec-array.prototype.indexof
    indexOf: createMethod$3(false)
  };

  var uncurryThis$h = functionUncurryThis;
  var hasOwn$4 = hasOwnProperty_1;
  var toIndexedObject$3 = toIndexedObject$6;
  var indexOf$1 = arrayIncludes.indexOf;
  var hiddenKeys$2 = hiddenKeys$4;

  var push$2 = uncurryThis$h([].push);

  var objectKeysInternal = function (object, names) {
    var O = toIndexedObject$3(object);
    var i = 0;
    var result = [];
    var key;
    for (key in O) !hasOwn$4(hiddenKeys$2, key) && hasOwn$4(O, key) && push$2(result, key);
    // Don't enum bug & hidden keys
    while (names.length > i) if (hasOwn$4(O, key = names[i++])) {
      ~indexOf$1(result, key) || push$2(result, key);
    }
    return result;
  };

  // IE8- don't enum bug keys
  var enumBugKeys$3 = [
    'constructor',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
    'toString',
    'valueOf'
  ];

  var internalObjectKeys$1 = objectKeysInternal;
  var enumBugKeys$2 = enumBugKeys$3;

  var hiddenKeys$1 = enumBugKeys$2.concat('length', 'prototype');

  // `Object.getOwnPropertyNames` method
  // https://tc39.es/ecma262/#sec-object.getownpropertynames
  // eslint-disable-next-line es/no-object-getownpropertynames -- safe
  objectGetOwnPropertyNames.f = Object.getOwnPropertyNames || function getOwnPropertyNames(O) {
    return internalObjectKeys$1(O, hiddenKeys$1);
  };

  var objectGetOwnPropertySymbols = {};

  // eslint-disable-next-line es/no-object-getownpropertysymbols -- safe
  objectGetOwnPropertySymbols.f = Object.getOwnPropertySymbols;

  var getBuiltIn$5 = getBuiltIn$7;
  var uncurryThis$g = functionUncurryThis;
  var getOwnPropertyNamesModule = objectGetOwnPropertyNames;
  var getOwnPropertySymbolsModule = objectGetOwnPropertySymbols;
  var anObject$b = anObject$d;

  var concat$1 = uncurryThis$g([].concat);

  // all object keys, includes non-enumerable and symbols
  var ownKeys$1 = getBuiltIn$5('Reflect', 'ownKeys') || function ownKeys(it) {
    var keys = getOwnPropertyNamesModule.f(anObject$b(it));
    var getOwnPropertySymbols = getOwnPropertySymbolsModule.f;
    return getOwnPropertySymbols ? concat$1(keys, getOwnPropertySymbols(it)) : keys;
  };

  var hasOwn$3 = hasOwnProperty_1;
  var ownKeys = ownKeys$1;
  var getOwnPropertyDescriptorModule = objectGetOwnPropertyDescriptor;
  var definePropertyModule$2 = objectDefineProperty;

  var copyConstructorProperties$1 = function (target, source, exceptions) {
    var keys = ownKeys(source);
    var defineProperty = definePropertyModule$2.f;
    var getOwnPropertyDescriptor = getOwnPropertyDescriptorModule.f;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (!hasOwn$3(target, key) && !(exceptions && hasOwn$3(exceptions, key))) {
        defineProperty(target, key, getOwnPropertyDescriptor(source, key));
      }
    }
  };

  var fails$d = fails$l;
  var isCallable$9 = isCallable$j;

  var replacement = /#|\.prototype\./;

  var isForced$2 = function (feature, detection) {
    var value = data[normalize(feature)];
    return value == POLYFILL ? true
      : value == NATIVE ? false
      : isCallable$9(detection) ? fails$d(detection)
      : !!detection;
  };

  var normalize = isForced$2.normalize = function (string) {
    return String(string).replace(replacement, '.').toLowerCase();
  };

  var data = isForced$2.data = {};
  var NATIVE = isForced$2.NATIVE = 'N';
  var POLYFILL = isForced$2.POLYFILL = 'P';

  var isForced_1 = isForced$2;

  var global$f = global$o;
  var getOwnPropertyDescriptor$1 = objectGetOwnPropertyDescriptor.f;
  var createNonEnumerableProperty$2 = createNonEnumerableProperty$4;
  var defineBuiltIn$4 = defineBuiltIn$5;
  var defineGlobalProperty = defineGlobalProperty$3;
  var copyConstructorProperties = copyConstructorProperties$1;
  var isForced$1 = isForced_1;

  /*
    options.target         - name of the target object
    options.global         - target is the global object
    options.stat           - export as static methods of target
    options.proto          - export as prototype methods of target
    options.real           - real prototype method for the `pure` version
    options.forced         - export even if the native feature is available
    options.bind           - bind methods to the target, required for the `pure` version
    options.wrap           - wrap constructors to preventing global pollution, required for the `pure` version
    options.unsafe         - use the simple assignment of property instead of delete + defineProperty
    options.sham           - add a flag to not completely full polyfills
    options.enumerable     - export as enumerable property
    options.dontCallGetSet - prevent calling a getter on target
    options.name           - the .name of the function if it does not match the key
  */
  var _export = function (options, source) {
    var TARGET = options.target;
    var GLOBAL = options.global;
    var STATIC = options.stat;
    var FORCED, target, key, targetProperty, sourceProperty, descriptor;
    if (GLOBAL) {
      target = global$f;
    } else if (STATIC) {
      target = global$f[TARGET] || defineGlobalProperty(TARGET, {});
    } else {
      target = (global$f[TARGET] || {}).prototype;
    }
    if (target) for (key in source) {
      sourceProperty = source[key];
      if (options.dontCallGetSet) {
        descriptor = getOwnPropertyDescriptor$1(target, key);
        targetProperty = descriptor && descriptor.value;
      } else targetProperty = target[key];
      FORCED = isForced$1(GLOBAL ? key : TARGET + (STATIC ? '.' : '#') + key, options.forced);
      // contained in target
      if (!FORCED && targetProperty !== undefined) {
        if (typeof sourceProperty == typeof targetProperty) continue;
        copyConstructorProperties(sourceProperty, targetProperty);
      }
      // add a flag to not completely full polyfills
      if (options.sham || (targetProperty && targetProperty.sham)) {
        createNonEnumerableProperty$2(sourceProperty, 'sham', true);
      }
      defineBuiltIn$4(target, key, sourceProperty, options);
    }
  };

  var classofRaw$1 = classofRaw$2;
  var uncurryThis$f = functionUncurryThis;

  var functionUncurryThisClause = function (fn) {
    // Nashorn bug:
    //   https://github.com/zloirock/core-js/issues/1128
    //   https://github.com/zloirock/core-js/issues/1130
    if (classofRaw$1(fn) === 'Function') return uncurryThis$f(fn);
  };

  var uncurryThis$e = functionUncurryThisClause;
  var aCallable$8 = aCallable$a;
  var NATIVE_BIND$2 = functionBindNative;

  var bind$6 = uncurryThis$e(uncurryThis$e.bind);

  // optional / simple context binding
  var functionBindContext = function (fn, that) {
    aCallable$8(fn);
    return that === undefined ? fn : NATIVE_BIND$2 ? bind$6(fn, that) : function (/* ...args */) {
      return fn.apply(that, arguments);
    };
  };

  var classof$7 = classofRaw$2;

  // `IsArray` abstract operation
  // https://tc39.es/ecma262/#sec-isarray
  // eslint-disable-next-line es/no-array-isarray -- safe
  var isArray$9 = Array.isArray || function isArray(argument) {
    return classof$7(argument) == 'Array';
  };

  var wellKnownSymbol$e = wellKnownSymbol$g;

  var TO_STRING_TAG$2 = wellKnownSymbol$e('toStringTag');
  var test$1 = {};

  test$1[TO_STRING_TAG$2] = 'z';

  var toStringTagSupport = String(test$1) === '[object z]';

  var TO_STRING_TAG_SUPPORT$2 = toStringTagSupport;
  var isCallable$8 = isCallable$j;
  var classofRaw = classofRaw$2;
  var wellKnownSymbol$d = wellKnownSymbol$g;

  var TO_STRING_TAG$1 = wellKnownSymbol$d('toStringTag');
  var $Object = Object;

  // ES3 wrong here
  var CORRECT_ARGUMENTS = classofRaw(function () { return arguments; }()) == 'Arguments';

  // fallback for IE11 Script Access Denied error
  var tryGet = function (it, key) {
    try {
      return it[key];
    } catch (error) { /* empty */ }
  };

  // getting tag from ES6+ `Object.prototype.toString`
  var classof$6 = TO_STRING_TAG_SUPPORT$2 ? classofRaw : function (it) {
    var O, tag, result;
    return it === undefined ? 'Undefined' : it === null ? 'Null'
      // @@toStringTag case
      : typeof (tag = tryGet(O = $Object(it), TO_STRING_TAG$1)) == 'string' ? tag
      // builtinTag case
      : CORRECT_ARGUMENTS ? classofRaw(O)
      // ES3 arguments fallback
      : (result = classofRaw(O)) == 'Object' && isCallable$8(O.callee) ? 'Arguments' : result;
  };

  var uncurryThis$d = functionUncurryThis;
  var fails$c = fails$l;
  var isCallable$7 = isCallable$j;
  var classof$5 = classof$6;
  var getBuiltIn$4 = getBuiltIn$7;
  var inspectSource$1 = inspectSource$3;

  var noop = function () { /* empty */ };
  var empty = [];
  var construct$1 = getBuiltIn$4('Reflect', 'construct');
  var constructorRegExp = /^\s*(?:class|function)\b/;
  var exec$2 = uncurryThis$d(constructorRegExp.exec);
  var INCORRECT_TO_STRING = !constructorRegExp.exec(noop);

  var isConstructorModern = function isConstructor(argument) {
    if (!isCallable$7(argument)) return false;
    try {
      construct$1(noop, empty, argument);
      return true;
    } catch (error) {
      return false;
    }
  };

  var isConstructorLegacy = function isConstructor(argument) {
    if (!isCallable$7(argument)) return false;
    switch (classof$5(argument)) {
      case 'AsyncFunction':
      case 'GeneratorFunction':
      case 'AsyncGeneratorFunction': return false;
    }
    try {
      // we can't check .prototype since constructors produced by .bind haven't it
      // `Function#toString` throws on some built-it function in some legacy engines
      // (for example, `DOMQuad` and similar in FF41-)
      return INCORRECT_TO_STRING || !!exec$2(constructorRegExp, inspectSource$1(argument));
    } catch (error) {
      return true;
    }
  };

  isConstructorLegacy.sham = true;

  // `IsConstructor` abstract operation
  // https://tc39.es/ecma262/#sec-isconstructor
  var isConstructor$3 = !construct$1 || fails$c(function () {
    var called;
    return isConstructorModern(isConstructorModern.call)
      || !isConstructorModern(Object)
      || !isConstructorModern(function () { called = true; })
      || called;
  }) ? isConstructorLegacy : isConstructorModern;

  var isArray$8 = isArray$9;
  var isConstructor$2 = isConstructor$3;
  var isObject$7 = isObject$d;
  var wellKnownSymbol$c = wellKnownSymbol$g;

  var SPECIES$6 = wellKnownSymbol$c('species');
  var $Array$2 = Array;

  // a part of `ArraySpeciesCreate` abstract operation
  // https://tc39.es/ecma262/#sec-arrayspeciescreate
  var arraySpeciesConstructor$1 = function (originalArray) {
    var C;
    if (isArray$8(originalArray)) {
      C = originalArray.constructor;
      // cross-realm fallback
      if (isConstructor$2(C) && (C === $Array$2 || isArray$8(C.prototype))) C = undefined;
      else if (isObject$7(C)) {
        C = C[SPECIES$6];
        if (C === null) C = undefined;
      }
    } return C === undefined ? $Array$2 : C;
  };

  var arraySpeciesConstructor = arraySpeciesConstructor$1;

  // `ArraySpeciesCreate` abstract operation
  // https://tc39.es/ecma262/#sec-arrayspeciescreate
  var arraySpeciesCreate$2 = function (originalArray, length) {
    return new (arraySpeciesConstructor(originalArray))(length === 0 ? 0 : length);
  };

  var bind$5 = functionBindContext;
  var uncurryThis$c = functionUncurryThis;
  var IndexedObject$1 = indexedObject;
  var toObject$2 = toObject$4;
  var lengthOfArrayLike$5 = lengthOfArrayLike$7;
  var arraySpeciesCreate$1 = arraySpeciesCreate$2;

  var push$1 = uncurryThis$c([].push);

  // `Array.prototype.{ forEach, map, filter, some, every, find, findIndex, filterReject }` methods implementation
  var createMethod$2 = function (TYPE) {
    var IS_MAP = TYPE == 1;
    var IS_FILTER = TYPE == 2;
    var IS_SOME = TYPE == 3;
    var IS_EVERY = TYPE == 4;
    var IS_FIND_INDEX = TYPE == 6;
    var IS_FILTER_REJECT = TYPE == 7;
    var NO_HOLES = TYPE == 5 || IS_FIND_INDEX;
    return function ($this, callbackfn, that, specificCreate) {
      var O = toObject$2($this);
      var self = IndexedObject$1(O);
      var boundFunction = bind$5(callbackfn, that);
      var length = lengthOfArrayLike$5(self);
      var index = 0;
      var create = specificCreate || arraySpeciesCreate$1;
      var target = IS_MAP ? create($this, length) : IS_FILTER || IS_FILTER_REJECT ? create($this, 0) : undefined;
      var value, result;
      for (;length > index; index++) if (NO_HOLES || index in self) {
        value = self[index];
        result = boundFunction(value, index, O);
        if (TYPE) {
          if (IS_MAP) target[index] = result; // map
          else if (result) switch (TYPE) {
            case 3: return true;              // some
            case 5: return value;             // find
            case 6: return index;             // findIndex
            case 2: push$1(target, value);      // filter
          } else switch (TYPE) {
            case 4: return false;             // every
            case 7: push$1(target, value);      // filterReject
          }
        }
      }
      return IS_FIND_INDEX ? -1 : IS_SOME || IS_EVERY ? IS_EVERY : target;
    };
  };

  var arrayIteration = {
    // `Array.prototype.forEach` method
    // https://tc39.es/ecma262/#sec-array.prototype.foreach
    forEach: createMethod$2(0),
    // `Array.prototype.map` method
    // https://tc39.es/ecma262/#sec-array.prototype.map
    map: createMethod$2(1),
    // `Array.prototype.filter` method
    // https://tc39.es/ecma262/#sec-array.prototype.filter
    filter: createMethod$2(2),
    // `Array.prototype.some` method
    // https://tc39.es/ecma262/#sec-array.prototype.some
    some: createMethod$2(3),
    // `Array.prototype.every` method
    // https://tc39.es/ecma262/#sec-array.prototype.every
    every: createMethod$2(4),
    // `Array.prototype.find` method
    // https://tc39.es/ecma262/#sec-array.prototype.find
    find: createMethod$2(5),
    // `Array.prototype.findIndex` method
    // https://tc39.es/ecma262/#sec-array.prototype.findIndex
    findIndex: createMethod$2(6),
    // `Array.prototype.filterReject` method
    // https://github.com/tc39/proposal-array-filtering
    filterReject: createMethod$2(7)
  };

  var fails$b = fails$l;
  var wellKnownSymbol$b = wellKnownSymbol$g;
  var V8_VERSION$2 = engineV8Version;

  var SPECIES$5 = wellKnownSymbol$b('species');

  var arrayMethodHasSpeciesSupport$4 = function (METHOD_NAME) {
    // We can't use this feature detection in V8 since it causes
    // deoptimization and serious performance degradation
    // https://github.com/zloirock/core-js/issues/677
    return V8_VERSION$2 >= 51 || !fails$b(function () {
      var array = [];
      var constructor = array.constructor = {};
      constructor[SPECIES$5] = function () {
        return { foo: 1 };
      };
      return array[METHOD_NAME](Boolean).foo !== 1;
    });
  };

  var $$n = _export;
  var $filter = arrayIteration.filter;
  var arrayMethodHasSpeciesSupport$3 = arrayMethodHasSpeciesSupport$4;

  var HAS_SPECIES_SUPPORT$2 = arrayMethodHasSpeciesSupport$3('filter');

  // `Array.prototype.filter` method
  // https://tc39.es/ecma262/#sec-array.prototype.filter
  // with adding support of @@species
  $$n({ target: 'Array', proto: true, forced: !HAS_SPECIES_SUPPORT$2 }, {
    filter: function filter(callbackfn /* , thisArg */) {
      return $filter(this, callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    }
  });

  var fails$a = fails$l;

  var arrayMethodIsStrict$5 = function (METHOD_NAME, argument) {
    var method = [][METHOD_NAME];
    return !!method && fails$a(function () {
      // eslint-disable-next-line no-useless-call -- required for testing
      method.call(null, argument || function () { return 1; }, 1);
    });
  };

  var $forEach = arrayIteration.forEach;
  var arrayMethodIsStrict$4 = arrayMethodIsStrict$5;

  var STRICT_METHOD$2 = arrayMethodIsStrict$4('forEach');

  // `Array.prototype.forEach` method implementation
  // https://tc39.es/ecma262/#sec-array.prototype.foreach
  var arrayForEach = !STRICT_METHOD$2 ? function forEach(callbackfn /* , thisArg */) {
    return $forEach(this, callbackfn, arguments.length > 1 ? arguments[1] : undefined);
  // eslint-disable-next-line es/no-array-prototype-foreach -- safe
  } : [].forEach;

  var $$m = _export;
  var forEach$3 = arrayForEach;

  // `Array.prototype.forEach` method
  // https://tc39.es/ecma262/#sec-array.prototype.foreach
  // eslint-disable-next-line es/no-array-prototype-foreach -- safe
  $$m({ target: 'Array', proto: true, forced: [].forEach != forEach$3 }, {
    forEach: forEach$3
  });

  var TO_STRING_TAG_SUPPORT$1 = toStringTagSupport;
  var classof$4 = classof$6;

  // `Object.prototype.toString` method implementation
  // https://tc39.es/ecma262/#sec-object.prototype.tostring
  var objectToString$2 = TO_STRING_TAG_SUPPORT$1 ? {}.toString : function toString() {
    return '[object ' + classof$4(this) + ']';
  };

  var TO_STRING_TAG_SUPPORT = toStringTagSupport;
  var defineBuiltIn$3 = defineBuiltIn$5;
  var toString$b = objectToString$2;

  // `Object.prototype.toString` method
  // https://tc39.es/ecma262/#sec-object.prototype.tostring
  if (!TO_STRING_TAG_SUPPORT) {
    defineBuiltIn$3(Object.prototype, 'toString', toString$b, { unsafe: true });
  }

  var classof$3 = classofRaw$2;

  var engineIsNode = typeof process != 'undefined' && classof$3(process) == 'process';

  var uncurryThis$b = functionUncurryThis;
  var aCallable$7 = aCallable$a;

  var functionUncurryThisAccessor = function (object, key, method) {
    try {
      // eslint-disable-next-line es/no-object-getownpropertydescriptor -- safe
      return uncurryThis$b(aCallable$7(Object.getOwnPropertyDescriptor(object, key)[method]));
    } catch (error) { /* empty */ }
  };

  var isCallable$6 = isCallable$j;

  var $String$1 = String;
  var $TypeError$9 = TypeError;

  var aPossiblePrototype$1 = function (argument) {
    if (typeof argument == 'object' || isCallable$6(argument)) return argument;
    throw $TypeError$9("Can't set " + $String$1(argument) + ' as a prototype');
  };

  /* eslint-disable no-proto -- safe */

  var uncurryThisAccessor = functionUncurryThisAccessor;
  var anObject$a = anObject$d;
  var aPossiblePrototype = aPossiblePrototype$1;

  // `Object.setPrototypeOf` method
  // https://tc39.es/ecma262/#sec-object.setprototypeof
  // Works with __proto__ only. Old v8 can't work with null proto objects.
  // eslint-disable-next-line es/no-object-setprototypeof -- safe
  var objectSetPrototypeOf = Object.setPrototypeOf || ('__proto__' in {} ? function () {
    var CORRECT_SETTER = false;
    var test = {};
    var setter;
    try {
      setter = uncurryThisAccessor(Object.prototype, '__proto__', 'set');
      setter(test, []);
      CORRECT_SETTER = test instanceof Array;
    } catch (error) { /* empty */ }
    return function setPrototypeOf(O, proto) {
      anObject$a(O);
      aPossiblePrototype(proto);
      if (CORRECT_SETTER) setter(O, proto);
      else O.__proto__ = proto;
      return O;
    };
  }() : undefined);

  var defineProperty$2 = objectDefineProperty.f;
  var hasOwn$2 = hasOwnProperty_1;
  var wellKnownSymbol$a = wellKnownSymbol$g;

  var TO_STRING_TAG = wellKnownSymbol$a('toStringTag');

  var setToStringTag$1 = function (target, TAG, STATIC) {
    if (target && !STATIC) target = target.prototype;
    if (target && !hasOwn$2(target, TO_STRING_TAG)) {
      defineProperty$2(target, TO_STRING_TAG, { configurable: true, value: TAG });
    }
  };

  var makeBuiltIn = makeBuiltInExports;
  var defineProperty$1 = objectDefineProperty;

  var defineBuiltInAccessor$1 = function (target, name, descriptor) {
    if (descriptor.get) makeBuiltIn(descriptor.get, name, { getter: true });
    if (descriptor.set) makeBuiltIn(descriptor.set, name, { setter: true });
    return defineProperty$1.f(target, name, descriptor);
  };

  var getBuiltIn$3 = getBuiltIn$7;
  var defineBuiltInAccessor = defineBuiltInAccessor$1;
  var wellKnownSymbol$9 = wellKnownSymbol$g;
  var DESCRIPTORS$1 = descriptors;

  var SPECIES$4 = wellKnownSymbol$9('species');

  var setSpecies$1 = function (CONSTRUCTOR_NAME) {
    var Constructor = getBuiltIn$3(CONSTRUCTOR_NAME);

    if (DESCRIPTORS$1 && Constructor && !Constructor[SPECIES$4]) {
      defineBuiltInAccessor(Constructor, SPECIES$4, {
        configurable: true,
        get: function () { return this; }
      });
    }
  };

  var isPrototypeOf$1 = objectIsPrototypeOf;

  var $TypeError$8 = TypeError;

  var anInstance$1 = function (it, Prototype) {
    if (isPrototypeOf$1(Prototype, it)) return it;
    throw $TypeError$8('Incorrect invocation');
  };

  var isConstructor$1 = isConstructor$3;
  var tryToString$3 = tryToString$5;

  var $TypeError$7 = TypeError;

  // `Assert: IsConstructor(argument) is true`
  var aConstructor$1 = function (argument) {
    if (isConstructor$1(argument)) return argument;
    throw $TypeError$7(tryToString$3(argument) + ' is not a constructor');
  };

  var anObject$9 = anObject$d;
  var aConstructor = aConstructor$1;
  var isNullOrUndefined$2 = isNullOrUndefined$5;
  var wellKnownSymbol$8 = wellKnownSymbol$g;

  var SPECIES$3 = wellKnownSymbol$8('species');

  // `SpeciesConstructor` abstract operation
  // https://tc39.es/ecma262/#sec-speciesconstructor
  var speciesConstructor$1 = function (O, defaultConstructor) {
    var C = anObject$9(O).constructor;
    var S;
    return C === undefined || isNullOrUndefined$2(S = anObject$9(C)[SPECIES$3]) ? defaultConstructor : aConstructor(S);
  };

  var NATIVE_BIND$1 = functionBindNative;

  var FunctionPrototype = Function.prototype;
  var apply$2 = FunctionPrototype.apply;
  var call$a = FunctionPrototype.call;

  // eslint-disable-next-line es/no-reflect -- safe
  var functionApply = typeof Reflect == 'object' && Reflect.apply || (NATIVE_BIND$1 ? call$a.bind(apply$2) : function () {
    return call$a.apply(apply$2, arguments);
  });

  var getBuiltIn$2 = getBuiltIn$7;

  var html$2 = getBuiltIn$2('document', 'documentElement');

  var uncurryThis$a = functionUncurryThis;

  var arraySlice$4 = uncurryThis$a([].slice);

  var $TypeError$6 = TypeError;

  var validateArgumentsLength$2 = function (passed, required) {
    if (passed < required) throw $TypeError$6('Not enough arguments');
    return passed;
  };

  var userAgent$4 = engineUserAgent;

  // eslint-disable-next-line redos/no-vulnerable -- safe
  var engineIsIos = /(?:ipad|iphone|ipod).*applewebkit/i.test(userAgent$4);

  var global$e = global$o;
  var apply$1 = functionApply;
  var bind$4 = functionBindContext;
  var isCallable$5 = isCallable$j;
  var hasOwn$1 = hasOwnProperty_1;
  var fails$9 = fails$l;
  var html$1 = html$2;
  var arraySlice$3 = arraySlice$4;
  var createElement$1 = documentCreateElement$2;
  var validateArgumentsLength$1 = validateArgumentsLength$2;
  var IS_IOS$1 = engineIsIos;
  var IS_NODE$3 = engineIsNode;

  var set = global$e.setImmediate;
  var clear = global$e.clearImmediate;
  var process$3 = global$e.process;
  var Dispatch = global$e.Dispatch;
  var Function$2 = global$e.Function;
  var MessageChannel = global$e.MessageChannel;
  var String$1 = global$e.String;
  var counter = 0;
  var queue$2 = {};
  var ONREADYSTATECHANGE = 'onreadystatechange';
  var $location, defer, channel, port;

  fails$9(function () {
    // Deno throws a ReferenceError on `location` access without `--location` flag
    $location = global$e.location;
  });

  var run = function (id) {
    if (hasOwn$1(queue$2, id)) {
      var fn = queue$2[id];
      delete queue$2[id];
      fn();
    }
  };

  var runner = function (id) {
    return function () {
      run(id);
    };
  };

  var eventListener = function (event) {
    run(event.data);
  };

  var globalPostMessageDefer = function (id) {
    // old engines have not location.origin
    global$e.postMessage(String$1(id), $location.protocol + '//' + $location.host);
  };

  // Node.js 0.9+ & IE10+ has setImmediate, otherwise:
  if (!set || !clear) {
    set = function setImmediate(handler) {
      validateArgumentsLength$1(arguments.length, 1);
      var fn = isCallable$5(handler) ? handler : Function$2(handler);
      var args = arraySlice$3(arguments, 1);
      queue$2[++counter] = function () {
        apply$1(fn, undefined, args);
      };
      defer(counter);
      return counter;
    };
    clear = function clearImmediate(id) {
      delete queue$2[id];
    };
    // Node.js 0.8-
    if (IS_NODE$3) {
      defer = function (id) {
        process$3.nextTick(runner(id));
      };
    // Sphere (JS game engine) Dispatch API
    } else if (Dispatch && Dispatch.now) {
      defer = function (id) {
        Dispatch.now(runner(id));
      };
    // Browsers with MessageChannel, includes WebWorkers
    // except iOS - https://github.com/zloirock/core-js/issues/624
    } else if (MessageChannel && !IS_IOS$1) {
      channel = new MessageChannel();
      port = channel.port2;
      channel.port1.onmessage = eventListener;
      defer = bind$4(port.postMessage, port);
    // Browsers with postMessage, skip WebWorkers
    // IE8 has postMessage, but it's sync & typeof its postMessage is 'object'
    } else if (
      global$e.addEventListener &&
      isCallable$5(global$e.postMessage) &&
      !global$e.importScripts &&
      $location && $location.protocol !== 'file:' &&
      !fails$9(globalPostMessageDefer)
    ) {
      defer = globalPostMessageDefer;
      global$e.addEventListener('message', eventListener, false);
    // IE8-
    } else if (ONREADYSTATECHANGE in createElement$1('script')) {
      defer = function (id) {
        html$1.appendChild(createElement$1('script'))[ONREADYSTATECHANGE] = function () {
          html$1.removeChild(this);
          run(id);
        };
      };
    // Rest old browsers
    } else {
      defer = function (id) {
        setTimeout(runner(id), 0);
      };
    }
  }

  var task$1 = {
    set: set,
    clear: clear
  };

  var Queue$2 = function () {
    this.head = null;
    this.tail = null;
  };

  Queue$2.prototype = {
    add: function (item) {
      var entry = { item: item, next: null };
      var tail = this.tail;
      if (tail) tail.next = entry;
      else this.head = entry;
      this.tail = entry;
    },
    get: function () {
      var entry = this.head;
      if (entry) {
        var next = this.head = entry.next;
        if (next === null) this.tail = null;
        return entry.item;
      }
    }
  };

  var queue$1 = Queue$2;

  var userAgent$3 = engineUserAgent;

  var engineIsIosPebble = /ipad|iphone|ipod/i.test(userAgent$3) && typeof Pebble != 'undefined';

  var userAgent$2 = engineUserAgent;

  var engineIsWebosWebkit = /web0s(?!.*chrome)/i.test(userAgent$2);

  var global$d = global$o;
  var bind$3 = functionBindContext;
  var getOwnPropertyDescriptor = objectGetOwnPropertyDescriptor.f;
  var macrotask = task$1.set;
  var Queue$1 = queue$1;
  var IS_IOS = engineIsIos;
  var IS_IOS_PEBBLE = engineIsIosPebble;
  var IS_WEBOS_WEBKIT = engineIsWebosWebkit;
  var IS_NODE$2 = engineIsNode;

  var MutationObserver = global$d.MutationObserver || global$d.WebKitMutationObserver;
  var document$2 = global$d.document;
  var process$2 = global$d.process;
  var Promise$1 = global$d.Promise;
  // Node.js 11 shows ExperimentalWarning on getting `queueMicrotask`
  var queueMicrotaskDescriptor = getOwnPropertyDescriptor(global$d, 'queueMicrotask');
  var microtask$1 = queueMicrotaskDescriptor && queueMicrotaskDescriptor.value;
  var notify$1, toggle, node$1, promise, then;

  // modern engines have queueMicrotask method
  if (!microtask$1) {
    var queue = new Queue$1();

    var flush = function () {
      var parent, fn;
      if (IS_NODE$2 && (parent = process$2.domain)) parent.exit();
      while (fn = queue.get()) try {
        fn();
      } catch (error) {
        if (queue.head) notify$1();
        throw error;
      }
      if (parent) parent.enter();
    };

    // browsers with MutationObserver, except iOS - https://github.com/zloirock/core-js/issues/339
    // also except WebOS Webkit https://github.com/zloirock/core-js/issues/898
    if (!IS_IOS && !IS_NODE$2 && !IS_WEBOS_WEBKIT && MutationObserver && document$2) {
      toggle = true;
      node$1 = document$2.createTextNode('');
      new MutationObserver(flush).observe(node$1, { characterData: true });
      notify$1 = function () {
        node$1.data = toggle = !toggle;
      };
    // environments with maybe non-completely correct, but existent Promise
    } else if (!IS_IOS_PEBBLE && Promise$1 && Promise$1.resolve) {
      // Promise.resolve without an argument throws an error in LG WebOS 2
      promise = Promise$1.resolve(undefined);
      // workaround of WebKit ~ iOS Safari 10.1 bug
      promise.constructor = Promise$1;
      then = bind$3(promise.then, promise);
      notify$1 = function () {
        then(flush);
      };
    // Node.js without promises
    } else if (IS_NODE$2) {
      notify$1 = function () {
        process$2.nextTick(flush);
      };
    // for other environments - macrotask based on:
    // - setImmediate
    // - MessageChannel
    // - window.postMessage
    // - onreadystatechange
    // - setTimeout
    } else {
      // `webpack` dev server bug on IE global methods - use bind(fn, global)
      macrotask = bind$3(macrotask, global$d);
      notify$1 = function () {
        macrotask(flush);
      };
    }

    microtask$1 = function (fn) {
      if (!queue.head) notify$1();
      queue.add(fn);
    };
  }

  var microtask_1 = microtask$1;

  var hostReportErrors$1 = function (a, b) {
    try {
      // eslint-disable-next-line no-console -- safe
      arguments.length == 1 ? console.error(a) : console.error(a, b);
    } catch (error) { /* empty */ }
  };

  var perform$3 = function (exec) {
    try {
      return { error: false, value: exec() };
    } catch (error) {
      return { error: true, value: error };
    }
  };

  var global$c = global$o;

  var promiseNativeConstructor = global$c.Promise;

  /* global Deno -- Deno case */

  var engineIsDeno = typeof Deno == 'object' && Deno && typeof Deno.version == 'object';

  var IS_DENO$1 = engineIsDeno;
  var IS_NODE$1 = engineIsNode;

  var engineIsBrowser = !IS_DENO$1 && !IS_NODE$1
    && typeof window == 'object'
    && typeof document == 'object';

  var global$b = global$o;
  var NativePromiseConstructor$3 = promiseNativeConstructor;
  var isCallable$4 = isCallable$j;
  var isForced = isForced_1;
  var inspectSource = inspectSource$3;
  var wellKnownSymbol$7 = wellKnownSymbol$g;
  var IS_BROWSER = engineIsBrowser;
  var IS_DENO = engineIsDeno;
  var V8_VERSION$1 = engineV8Version;

  NativePromiseConstructor$3 && NativePromiseConstructor$3.prototype;
  var SPECIES$2 = wellKnownSymbol$7('species');
  var SUBCLASSING = false;
  var NATIVE_PROMISE_REJECTION_EVENT$1 = isCallable$4(global$b.PromiseRejectionEvent);

  var FORCED_PROMISE_CONSTRUCTOR$5 = isForced('Promise', function () {
    var PROMISE_CONSTRUCTOR_SOURCE = inspectSource(NativePromiseConstructor$3);
    var GLOBAL_CORE_JS_PROMISE = PROMISE_CONSTRUCTOR_SOURCE !== String(NativePromiseConstructor$3);
    // V8 6.6 (Node 10 and Chrome 66) have a bug with resolving custom thenables
    // https://bugs.chromium.org/p/chromium/issues/detail?id=830565
    // We can't detect it synchronously, so just check versions
    if (!GLOBAL_CORE_JS_PROMISE && V8_VERSION$1 === 66) return true;
    // We can't use @@species feature detection in V8 since it causes
    // deoptimization and performance degradation
    // https://github.com/zloirock/core-js/issues/679
    if (!V8_VERSION$1 || V8_VERSION$1 < 51 || !/native code/.test(PROMISE_CONSTRUCTOR_SOURCE)) {
      // Detect correctness of subclassing with @@species support
      var promise = new NativePromiseConstructor$3(function (resolve) { resolve(1); });
      var FakePromise = function (exec) {
        exec(function () { /* empty */ }, function () { /* empty */ });
      };
      var constructor = promise.constructor = {};
      constructor[SPECIES$2] = FakePromise;
      SUBCLASSING = promise.then(function () { /* empty */ }) instanceof FakePromise;
      if (!SUBCLASSING) return true;
    // Unhandled rejections tracking support, NodeJS Promise without it fails @@species test
    } return !GLOBAL_CORE_JS_PROMISE && (IS_BROWSER || IS_DENO) && !NATIVE_PROMISE_REJECTION_EVENT$1;
  });

  var promiseConstructorDetection = {
    CONSTRUCTOR: FORCED_PROMISE_CONSTRUCTOR$5,
    REJECTION_EVENT: NATIVE_PROMISE_REJECTION_EVENT$1,
    SUBCLASSING: SUBCLASSING
  };

  var newPromiseCapability$2 = {};

  var aCallable$6 = aCallable$a;

  var $TypeError$5 = TypeError;

  var PromiseCapability = function (C) {
    var resolve, reject;
    this.promise = new C(function ($$resolve, $$reject) {
      if (resolve !== undefined || reject !== undefined) throw $TypeError$5('Bad Promise constructor');
      resolve = $$resolve;
      reject = $$reject;
    });
    this.resolve = aCallable$6(resolve);
    this.reject = aCallable$6(reject);
  };

  // `NewPromiseCapability` abstract operation
  // https://tc39.es/ecma262/#sec-newpromisecapability
  newPromiseCapability$2.f = function (C) {
    return new PromiseCapability(C);
  };

  var $$l = _export;
  var IS_NODE = engineIsNode;
  var global$a = global$o;
  var call$9 = functionCall;
  var defineBuiltIn$2 = defineBuiltIn$5;
  var setPrototypeOf = objectSetPrototypeOf;
  var setToStringTag = setToStringTag$1;
  var setSpecies = setSpecies$1;
  var aCallable$5 = aCallable$a;
  var isCallable$3 = isCallable$j;
  var isObject$6 = isObject$d;
  var anInstance = anInstance$1;
  var speciesConstructor = speciesConstructor$1;
  var task = task$1.set;
  var microtask = microtask_1;
  var hostReportErrors = hostReportErrors$1;
  var perform$2 = perform$3;
  var Queue = queue$1;
  var InternalStateModule = internalState;
  var NativePromiseConstructor$2 = promiseNativeConstructor;
  var PromiseConstructorDetection = promiseConstructorDetection;
  var newPromiseCapabilityModule$3 = newPromiseCapability$2;

  var PROMISE = 'Promise';
  var FORCED_PROMISE_CONSTRUCTOR$4 = PromiseConstructorDetection.CONSTRUCTOR;
  var NATIVE_PROMISE_REJECTION_EVENT = PromiseConstructorDetection.REJECTION_EVENT;
  var NATIVE_PROMISE_SUBCLASSING = PromiseConstructorDetection.SUBCLASSING;
  var getInternalPromiseState = InternalStateModule.getterFor(PROMISE);
  var setInternalState = InternalStateModule.set;
  var NativePromisePrototype$1 = NativePromiseConstructor$2 && NativePromiseConstructor$2.prototype;
  var PromiseConstructor = NativePromiseConstructor$2;
  var PromisePrototype = NativePromisePrototype$1;
  var TypeError$1 = global$a.TypeError;
  var document$1 = global$a.document;
  var process$1 = global$a.process;
  var newPromiseCapability$1 = newPromiseCapabilityModule$3.f;
  var newGenericPromiseCapability = newPromiseCapability$1;

  var DISPATCH_EVENT = !!(document$1 && document$1.createEvent && global$a.dispatchEvent);
  var UNHANDLED_REJECTION = 'unhandledrejection';
  var REJECTION_HANDLED = 'rejectionhandled';
  var PENDING = 0;
  var FULFILLED = 1;
  var REJECTED = 2;
  var HANDLED = 1;
  var UNHANDLED = 2;

  var Internal, OwnPromiseCapability, PromiseWrapper, nativeThen;

  // helpers
  var isThenable = function (it) {
    var then;
    return isObject$6(it) && isCallable$3(then = it.then) ? then : false;
  };

  var callReaction = function (reaction, state) {
    var value = state.value;
    var ok = state.state == FULFILLED;
    var handler = ok ? reaction.ok : reaction.fail;
    var resolve = reaction.resolve;
    var reject = reaction.reject;
    var domain = reaction.domain;
    var result, then, exited;
    try {
      if (handler) {
        if (!ok) {
          if (state.rejection === UNHANDLED) onHandleUnhandled(state);
          state.rejection = HANDLED;
        }
        if (handler === true) result = value;
        else {
          if (domain) domain.enter();
          result = handler(value); // can throw
          if (domain) {
            domain.exit();
            exited = true;
          }
        }
        if (result === reaction.promise) {
          reject(TypeError$1('Promise-chain cycle'));
        } else if (then = isThenable(result)) {
          call$9(then, result, resolve, reject);
        } else resolve(result);
      } else reject(value);
    } catch (error) {
      if (domain && !exited) domain.exit();
      reject(error);
    }
  };

  var notify = function (state, isReject) {
    if (state.notified) return;
    state.notified = true;
    microtask(function () {
      var reactions = state.reactions;
      var reaction;
      while (reaction = reactions.get()) {
        callReaction(reaction, state);
      }
      state.notified = false;
      if (isReject && !state.rejection) onUnhandled(state);
    });
  };

  var dispatchEvent = function (name, promise, reason) {
    var event, handler;
    if (DISPATCH_EVENT) {
      event = document$1.createEvent('Event');
      event.promise = promise;
      event.reason = reason;
      event.initEvent(name, false, true);
      global$a.dispatchEvent(event);
    } else event = { promise: promise, reason: reason };
    if (!NATIVE_PROMISE_REJECTION_EVENT && (handler = global$a['on' + name])) handler(event);
    else if (name === UNHANDLED_REJECTION) hostReportErrors('Unhandled promise rejection', reason);
  };

  var onUnhandled = function (state) {
    call$9(task, global$a, function () {
      var promise = state.facade;
      var value = state.value;
      var IS_UNHANDLED = isUnhandled(state);
      var result;
      if (IS_UNHANDLED) {
        result = perform$2(function () {
          if (IS_NODE) {
            process$1.emit('unhandledRejection', value, promise);
          } else dispatchEvent(UNHANDLED_REJECTION, promise, value);
        });
        // Browsers should not trigger `rejectionHandled` event if it was handled here, NodeJS - should
        state.rejection = IS_NODE || isUnhandled(state) ? UNHANDLED : HANDLED;
        if (result.error) throw result.value;
      }
    });
  };

  var isUnhandled = function (state) {
    return state.rejection !== HANDLED && !state.parent;
  };

  var onHandleUnhandled = function (state) {
    call$9(task, global$a, function () {
      var promise = state.facade;
      if (IS_NODE) {
        process$1.emit('rejectionHandled', promise);
      } else dispatchEvent(REJECTION_HANDLED, promise, state.value);
    });
  };

  var bind$2 = function (fn, state, unwrap) {
    return function (value) {
      fn(state, value, unwrap);
    };
  };

  var internalReject = function (state, value, unwrap) {
    if (state.done) return;
    state.done = true;
    if (unwrap) state = unwrap;
    state.value = value;
    state.state = REJECTED;
    notify(state, true);
  };

  var internalResolve = function (state, value, unwrap) {
    if (state.done) return;
    state.done = true;
    if (unwrap) state = unwrap;
    try {
      if (state.facade === value) throw TypeError$1("Promise can't be resolved itself");
      var then = isThenable(value);
      if (then) {
        microtask(function () {
          var wrapper = { done: false };
          try {
            call$9(then, value,
              bind$2(internalResolve, wrapper, state),
              bind$2(internalReject, wrapper, state)
            );
          } catch (error) {
            internalReject(wrapper, error, state);
          }
        });
      } else {
        state.value = value;
        state.state = FULFILLED;
        notify(state, false);
      }
    } catch (error) {
      internalReject({ done: false }, error, state);
    }
  };

  // constructor polyfill
  if (FORCED_PROMISE_CONSTRUCTOR$4) {
    // 25.4.3.1 Promise(executor)
    PromiseConstructor = function Promise(executor) {
      anInstance(this, PromisePrototype);
      aCallable$5(executor);
      call$9(Internal, this);
      var state = getInternalPromiseState(this);
      try {
        executor(bind$2(internalResolve, state), bind$2(internalReject, state));
      } catch (error) {
        internalReject(state, error);
      }
    };

    PromisePrototype = PromiseConstructor.prototype;

    // eslint-disable-next-line no-unused-vars -- required for `.length`
    Internal = function Promise(executor) {
      setInternalState(this, {
        type: PROMISE,
        done: false,
        notified: false,
        parent: false,
        reactions: new Queue(),
        rejection: false,
        state: PENDING,
        value: undefined
      });
    };

    // `Promise.prototype.then` method
    // https://tc39.es/ecma262/#sec-promise.prototype.then
    Internal.prototype = defineBuiltIn$2(PromisePrototype, 'then', function then(onFulfilled, onRejected) {
      var state = getInternalPromiseState(this);
      var reaction = newPromiseCapability$1(speciesConstructor(this, PromiseConstructor));
      state.parent = true;
      reaction.ok = isCallable$3(onFulfilled) ? onFulfilled : true;
      reaction.fail = isCallable$3(onRejected) && onRejected;
      reaction.domain = IS_NODE ? process$1.domain : undefined;
      if (state.state == PENDING) state.reactions.add(reaction);
      else microtask(function () {
        callReaction(reaction, state);
      });
      return reaction.promise;
    });

    OwnPromiseCapability = function () {
      var promise = new Internal();
      var state = getInternalPromiseState(promise);
      this.promise = promise;
      this.resolve = bind$2(internalResolve, state);
      this.reject = bind$2(internalReject, state);
    };

    newPromiseCapabilityModule$3.f = newPromiseCapability$1 = function (C) {
      return C === PromiseConstructor || C === PromiseWrapper
        ? new OwnPromiseCapability(C)
        : newGenericPromiseCapability(C);
    };

    if (isCallable$3(NativePromiseConstructor$2) && NativePromisePrototype$1 !== Object.prototype) {
      nativeThen = NativePromisePrototype$1.then;

      if (!NATIVE_PROMISE_SUBCLASSING) {
        // make `Promise#then` return a polyfilled `Promise` for native promise-based APIs
        defineBuiltIn$2(NativePromisePrototype$1, 'then', function then(onFulfilled, onRejected) {
          var that = this;
          return new PromiseConstructor(function (resolve, reject) {
            call$9(nativeThen, that, resolve, reject);
          }).then(onFulfilled, onRejected);
        // https://github.com/zloirock/core-js/issues/640
        }, { unsafe: true });
      }

      // make `.constructor === Promise` work for native promise-based APIs
      try {
        delete NativePromisePrototype$1.constructor;
      } catch (error) { /* empty */ }

      // make `instanceof Promise` work for native promise-based APIs
      if (setPrototypeOf) {
        setPrototypeOf(NativePromisePrototype$1, PromisePrototype);
      }
    }
  }

  $$l({ global: true, constructor: true, wrap: true, forced: FORCED_PROMISE_CONSTRUCTOR$4 }, {
    Promise: PromiseConstructor
  });

  setToStringTag(PromiseConstructor, PROMISE, false);
  setSpecies(PROMISE);

  var iterators = {};

  var wellKnownSymbol$6 = wellKnownSymbol$g;
  var Iterators$1 = iterators;

  var ITERATOR$4 = wellKnownSymbol$6('iterator');
  var ArrayPrototype$1 = Array.prototype;

  // check on default Array iterator
  var isArrayIteratorMethod$1 = function (it) {
    return it !== undefined && (Iterators$1.Array === it || ArrayPrototype$1[ITERATOR$4] === it);
  };

  var classof$2 = classof$6;
  var getMethod$2 = getMethod$4;
  var isNullOrUndefined$1 = isNullOrUndefined$5;
  var Iterators = iterators;
  var wellKnownSymbol$5 = wellKnownSymbol$g;

  var ITERATOR$3 = wellKnownSymbol$5('iterator');

  var getIteratorMethod$2 = function (it) {
    if (!isNullOrUndefined$1(it)) return getMethod$2(it, ITERATOR$3)
      || getMethod$2(it, '@@iterator')
      || Iterators[classof$2(it)];
  };

  var call$8 = functionCall;
  var aCallable$4 = aCallable$a;
  var anObject$8 = anObject$d;
  var tryToString$2 = tryToString$5;
  var getIteratorMethod$1 = getIteratorMethod$2;

  var $TypeError$4 = TypeError;

  var getIterator$1 = function (argument, usingIterator) {
    var iteratorMethod = arguments.length < 2 ? getIteratorMethod$1(argument) : usingIterator;
    if (aCallable$4(iteratorMethod)) return anObject$8(call$8(iteratorMethod, argument));
    throw $TypeError$4(tryToString$2(argument) + ' is not iterable');
  };

  var call$7 = functionCall;
  var anObject$7 = anObject$d;
  var getMethod$1 = getMethod$4;

  var iteratorClose$1 = function (iterator, kind, value) {
    var innerResult, innerError;
    anObject$7(iterator);
    try {
      innerResult = getMethod$1(iterator, 'return');
      if (!innerResult) {
        if (kind === 'throw') throw value;
        return value;
      }
      innerResult = call$7(innerResult, iterator);
    } catch (error) {
      innerError = true;
      innerResult = error;
    }
    if (kind === 'throw') throw value;
    if (innerError) throw innerResult;
    anObject$7(innerResult);
    return value;
  };

  var bind$1 = functionBindContext;
  var call$6 = functionCall;
  var anObject$6 = anObject$d;
  var tryToString$1 = tryToString$5;
  var isArrayIteratorMethod = isArrayIteratorMethod$1;
  var lengthOfArrayLike$4 = lengthOfArrayLike$7;
  var isPrototypeOf = objectIsPrototypeOf;
  var getIterator = getIterator$1;
  var getIteratorMethod = getIteratorMethod$2;
  var iteratorClose = iteratorClose$1;

  var $TypeError$3 = TypeError;

  var Result = function (stopped, result) {
    this.stopped = stopped;
    this.result = result;
  };

  var ResultPrototype = Result.prototype;

  var iterate$2 = function (iterable, unboundFunction, options) {
    var that = options && options.that;
    var AS_ENTRIES = !!(options && options.AS_ENTRIES);
    var IS_RECORD = !!(options && options.IS_RECORD);
    var IS_ITERATOR = !!(options && options.IS_ITERATOR);
    var INTERRUPTED = !!(options && options.INTERRUPTED);
    var fn = bind$1(unboundFunction, that);
    var iterator, iterFn, index, length, result, next, step;

    var stop = function (condition) {
      if (iterator) iteratorClose(iterator, 'normal', condition);
      return new Result(true, condition);
    };

    var callFn = function (value) {
      if (AS_ENTRIES) {
        anObject$6(value);
        return INTERRUPTED ? fn(value[0], value[1], stop) : fn(value[0], value[1]);
      } return INTERRUPTED ? fn(value, stop) : fn(value);
    };

    if (IS_RECORD) {
      iterator = iterable.iterator;
    } else if (IS_ITERATOR) {
      iterator = iterable;
    } else {
      iterFn = getIteratorMethod(iterable);
      if (!iterFn) throw $TypeError$3(tryToString$1(iterable) + ' is not iterable');
      // optimisation for array iterators
      if (isArrayIteratorMethod(iterFn)) {
        for (index = 0, length = lengthOfArrayLike$4(iterable); length > index; index++) {
          result = callFn(iterable[index]);
          if (result && isPrototypeOf(ResultPrototype, result)) return result;
        } return new Result(false);
      }
      iterator = getIterator(iterable, iterFn);
    }

    next = IS_RECORD ? iterable.next : iterator.next;
    while (!(step = call$6(next, iterator)).done) {
      try {
        result = callFn(step.value);
      } catch (error) {
        iteratorClose(iterator, 'throw', error);
      }
      if (typeof result == 'object' && result && isPrototypeOf(ResultPrototype, result)) return result;
    } return new Result(false);
  };

  var wellKnownSymbol$4 = wellKnownSymbol$g;

  var ITERATOR$2 = wellKnownSymbol$4('iterator');
  var SAFE_CLOSING = false;

  try {
    var called = 0;
    var iteratorWithReturn = {
      next: function () {
        return { done: !!called++ };
      },
      'return': function () {
        SAFE_CLOSING = true;
      }
    };
    iteratorWithReturn[ITERATOR$2] = function () {
      return this;
    };
    // eslint-disable-next-line es/no-array-from, no-throw-literal -- required for testing
    Array.from(iteratorWithReturn, function () { throw 2; });
  } catch (error) { /* empty */ }

  var checkCorrectnessOfIteration$1 = function (exec, SKIP_CLOSING) {
    if (!SKIP_CLOSING && !SAFE_CLOSING) return false;
    var ITERATION_SUPPORT = false;
    try {
      var object = {};
      object[ITERATOR$2] = function () {
        return {
          next: function () {
            return { done: ITERATION_SUPPORT = true };
          }
        };
      };
      exec(object);
    } catch (error) { /* empty */ }
    return ITERATION_SUPPORT;
  };

  var NativePromiseConstructor$1 = promiseNativeConstructor;
  var checkCorrectnessOfIteration = checkCorrectnessOfIteration$1;
  var FORCED_PROMISE_CONSTRUCTOR$3 = promiseConstructorDetection.CONSTRUCTOR;

  var promiseStaticsIncorrectIteration = FORCED_PROMISE_CONSTRUCTOR$3 || !checkCorrectnessOfIteration(function (iterable) {
    NativePromiseConstructor$1.all(iterable).then(undefined, function () { /* empty */ });
  });

  var $$k = _export;
  var call$5 = functionCall;
  var aCallable$3 = aCallable$a;
  var newPromiseCapabilityModule$2 = newPromiseCapability$2;
  var perform$1 = perform$3;
  var iterate$1 = iterate$2;
  var PROMISE_STATICS_INCORRECT_ITERATION$1 = promiseStaticsIncorrectIteration;

  // `Promise.all` method
  // https://tc39.es/ecma262/#sec-promise.all
  $$k({ target: 'Promise', stat: true, forced: PROMISE_STATICS_INCORRECT_ITERATION$1 }, {
    all: function all(iterable) {
      var C = this;
      var capability = newPromiseCapabilityModule$2.f(C);
      var resolve = capability.resolve;
      var reject = capability.reject;
      var result = perform$1(function () {
        var $promiseResolve = aCallable$3(C.resolve);
        var values = [];
        var counter = 0;
        var remaining = 1;
        iterate$1(iterable, function (promise) {
          var index = counter++;
          var alreadyCalled = false;
          remaining++;
          call$5($promiseResolve, C, promise).then(function (value) {
            if (alreadyCalled) return;
            alreadyCalled = true;
            values[index] = value;
            --remaining || resolve(values);
          }, reject);
        });
        --remaining || resolve(values);
      });
      if (result.error) reject(result.value);
      return capability.promise;
    }
  });

  var $$j = _export;
  var FORCED_PROMISE_CONSTRUCTOR$2 = promiseConstructorDetection.CONSTRUCTOR;
  var NativePromiseConstructor = promiseNativeConstructor;
  var getBuiltIn$1 = getBuiltIn$7;
  var isCallable$2 = isCallable$j;
  var defineBuiltIn$1 = defineBuiltIn$5;

  var NativePromisePrototype = NativePromiseConstructor && NativePromiseConstructor.prototype;

  // `Promise.prototype.catch` method
  // https://tc39.es/ecma262/#sec-promise.prototype.catch
  $$j({ target: 'Promise', proto: true, forced: FORCED_PROMISE_CONSTRUCTOR$2, real: true }, {
    'catch': function (onRejected) {
      return this.then(undefined, onRejected);
    }
  });

  // makes sure that native promise-based APIs `Promise#catch` properly works with patched `Promise#then`
  if (isCallable$2(NativePromiseConstructor)) {
    var method = getBuiltIn$1('Promise').prototype['catch'];
    if (NativePromisePrototype['catch'] !== method) {
      defineBuiltIn$1(NativePromisePrototype, 'catch', method, { unsafe: true });
    }
  }

  var $$i = _export;
  var call$4 = functionCall;
  var aCallable$2 = aCallable$a;
  var newPromiseCapabilityModule$1 = newPromiseCapability$2;
  var perform = perform$3;
  var iterate = iterate$2;
  var PROMISE_STATICS_INCORRECT_ITERATION = promiseStaticsIncorrectIteration;

  // `Promise.race` method
  // https://tc39.es/ecma262/#sec-promise.race
  $$i({ target: 'Promise', stat: true, forced: PROMISE_STATICS_INCORRECT_ITERATION }, {
    race: function race(iterable) {
      var C = this;
      var capability = newPromiseCapabilityModule$1.f(C);
      var reject = capability.reject;
      var result = perform(function () {
        var $promiseResolve = aCallable$2(C.resolve);
        iterate(iterable, function (promise) {
          call$4($promiseResolve, C, promise).then(capability.resolve, reject);
        });
      });
      if (result.error) reject(result.value);
      return capability.promise;
    }
  });

  var $$h = _export;
  var call$3 = functionCall;
  var newPromiseCapabilityModule = newPromiseCapability$2;
  var FORCED_PROMISE_CONSTRUCTOR$1 = promiseConstructorDetection.CONSTRUCTOR;

  // `Promise.reject` method
  // https://tc39.es/ecma262/#sec-promise.reject
  $$h({ target: 'Promise', stat: true, forced: FORCED_PROMISE_CONSTRUCTOR$1 }, {
    reject: function reject(r) {
      var capability = newPromiseCapabilityModule.f(this);
      call$3(capability.reject, undefined, r);
      return capability.promise;
    }
  });

  var anObject$5 = anObject$d;
  var isObject$5 = isObject$d;
  var newPromiseCapability = newPromiseCapability$2;

  var promiseResolve$1 = function (C, x) {
    anObject$5(C);
    if (isObject$5(x) && x.constructor === C) return x;
    var promiseCapability = newPromiseCapability.f(C);
    var resolve = promiseCapability.resolve;
    resolve(x);
    return promiseCapability.promise;
  };

  var $$g = _export;
  var getBuiltIn = getBuiltIn$7;
  var FORCED_PROMISE_CONSTRUCTOR = promiseConstructorDetection.CONSTRUCTOR;
  var promiseResolve = promiseResolve$1;

  getBuiltIn('Promise');

  // `Promise.resolve` method
  // https://tc39.es/ecma262/#sec-promise.resolve
  $$g({ target: 'Promise', stat: true, forced: FORCED_PROMISE_CONSTRUCTOR }, {
    resolve: function resolve(x) {
      return promiseResolve(this, x);
    }
  });

  // iterable DOM collections
  // flag - `iterable` interface - 'entries', 'keys', 'values', 'forEach' methods
  var domIterables = {
    CSSRuleList: 0,
    CSSStyleDeclaration: 0,
    CSSValueList: 0,
    ClientRectList: 0,
    DOMRectList: 0,
    DOMStringList: 0,
    DOMTokenList: 1,
    DataTransferItemList: 0,
    FileList: 0,
    HTMLAllCollection: 0,
    HTMLCollection: 0,
    HTMLFormElement: 0,
    HTMLSelectElement: 0,
    MediaList: 0,
    MimeTypeArray: 0,
    NamedNodeMap: 0,
    NodeList: 1,
    PaintRequestList: 0,
    Plugin: 0,
    PluginArray: 0,
    SVGLengthList: 0,
    SVGNumberList: 0,
    SVGPathSegList: 0,
    SVGPointList: 0,
    SVGStringList: 0,
    SVGTransformList: 0,
    SourceBufferList: 0,
    StyleSheetList: 0,
    TextTrackCueList: 0,
    TextTrackList: 0,
    TouchList: 0
  };

  // in old WebKit versions, `element.classList` is not an instance of global `DOMTokenList`
  var documentCreateElement$1 = documentCreateElement$2;

  var classList = documentCreateElement$1('span').classList;
  var DOMTokenListPrototype$1 = classList && classList.constructor && classList.constructor.prototype;

  var domTokenListPrototype = DOMTokenListPrototype$1 === Object.prototype ? undefined : DOMTokenListPrototype$1;

  var global$9 = global$o;
  var DOMIterables = domIterables;
  var DOMTokenListPrototype = domTokenListPrototype;
  var forEach$2 = arrayForEach;
  var createNonEnumerableProperty$1 = createNonEnumerableProperty$4;

  var handlePrototype = function (CollectionPrototype) {
    // some Chrome versions have non-configurable methods on DOMTokenList
    if (CollectionPrototype && CollectionPrototype.forEach !== forEach$2) try {
      createNonEnumerableProperty$1(CollectionPrototype, 'forEach', forEach$2);
    } catch (error) {
      CollectionPrototype.forEach = forEach$2;
    }
  };

  for (var COLLECTION_NAME in DOMIterables) {
    if (DOMIterables[COLLECTION_NAME]) {
      handlePrototype(global$9[COLLECTION_NAME] && global$9[COLLECTION_NAME].prototype);
    }
  }

  handlePrototype(DOMTokenListPrototype);

  var $TypeError$2 = TypeError;
  var MAX_SAFE_INTEGER$2 = 0x1FFFFFFFFFFFFF; // 2 ** 53 - 1 == 9007199254740991

  var doesNotExceedSafeInteger$1 = function (it) {
    if (it > MAX_SAFE_INTEGER$2) throw $TypeError$2('Maximum allowed index exceeded');
    return it;
  };

  var toPropertyKey = toPropertyKey$3;
  var definePropertyModule$1 = objectDefineProperty;
  var createPropertyDescriptor = createPropertyDescriptor$3;

  var createProperty$3 = function (object, key, value) {
    var propertyKey = toPropertyKey(key);
    if (propertyKey in object) definePropertyModule$1.f(object, propertyKey, createPropertyDescriptor(0, value));
    else object[propertyKey] = value;
  };

  var $$f = _export;
  var fails$8 = fails$l;
  var isArray$7 = isArray$9;
  var isObject$4 = isObject$d;
  var toObject$1 = toObject$4;
  var lengthOfArrayLike$3 = lengthOfArrayLike$7;
  var doesNotExceedSafeInteger = doesNotExceedSafeInteger$1;
  var createProperty$2 = createProperty$3;
  var arraySpeciesCreate = arraySpeciesCreate$2;
  var arrayMethodHasSpeciesSupport$2 = arrayMethodHasSpeciesSupport$4;
  var wellKnownSymbol$3 = wellKnownSymbol$g;
  var V8_VERSION = engineV8Version;

  var IS_CONCAT_SPREADABLE = wellKnownSymbol$3('isConcatSpreadable');

  // We can't use this feature detection in V8 since it causes
  // deoptimization and serious performance degradation
  // https://github.com/zloirock/core-js/issues/679
  var IS_CONCAT_SPREADABLE_SUPPORT = V8_VERSION >= 51 || !fails$8(function () {
    var array = [];
    array[IS_CONCAT_SPREADABLE] = false;
    return array.concat()[0] !== array;
  });

  var isConcatSpreadable = function (O) {
    if (!isObject$4(O)) return false;
    var spreadable = O[IS_CONCAT_SPREADABLE];
    return spreadable !== undefined ? !!spreadable : isArray$7(O);
  };

  var FORCED$5 = !IS_CONCAT_SPREADABLE_SUPPORT || !arrayMethodHasSpeciesSupport$2('concat');

  // `Array.prototype.concat` method
  // https://tc39.es/ecma262/#sec-array.prototype.concat
  // with adding support of @@isConcatSpreadable and @@species
  $$f({ target: 'Array', proto: true, arity: 1, forced: FORCED$5 }, {
    // eslint-disable-next-line no-unused-vars -- required for `.length`
    concat: function concat(arg) {
      var O = toObject$1(this);
      var A = arraySpeciesCreate(O, 0);
      var n = 0;
      var i, k, length, len, E;
      for (i = -1, length = arguments.length; i < length; i++) {
        E = i === -1 ? O : arguments[i];
        if (isConcatSpreadable(E)) {
          len = lengthOfArrayLike$3(E);
          doesNotExceedSafeInteger(n + len);
          for (k = 0; k < len; k++, n++) if (k in E) createProperty$2(A, n, E[k]);
        } else {
          doesNotExceedSafeInteger(n + 1);
          createProperty$2(A, n++, E);
        }
      }
      A.length = n;
      return A;
    }
  });

  var $$e = _export;
  var uncurryThis$9 = functionUncurryThis;
  var IndexedObject = indexedObject;
  var toIndexedObject$2 = toIndexedObject$6;
  var arrayMethodIsStrict$3 = arrayMethodIsStrict$5;

  var nativeJoin = uncurryThis$9([].join);

  var ES3_STRINGS = IndexedObject != Object;
  var FORCED$4 = ES3_STRINGS || !arrayMethodIsStrict$3('join', ',');

  // `Array.prototype.join` method
  // https://tc39.es/ecma262/#sec-array.prototype.join
  $$e({ target: 'Array', proto: true, forced: FORCED$4 }, {
    join: function join(separator) {
      return nativeJoin(toIndexedObject$2(this), separator === undefined ? ',' : separator);
    }
  });

  var $$d = _export;
  var isArray$6 = isArray$9;
  var isConstructor = isConstructor$3;
  var isObject$3 = isObject$d;
  var toAbsoluteIndex$1 = toAbsoluteIndex$3;
  var lengthOfArrayLike$2 = lengthOfArrayLike$7;
  var toIndexedObject$1 = toIndexedObject$6;
  var createProperty$1 = createProperty$3;
  var wellKnownSymbol$2 = wellKnownSymbol$g;
  var arrayMethodHasSpeciesSupport$1 = arrayMethodHasSpeciesSupport$4;
  var nativeSlice = arraySlice$4;

  var HAS_SPECIES_SUPPORT$1 = arrayMethodHasSpeciesSupport$1('slice');

  var SPECIES$1 = wellKnownSymbol$2('species');
  var $Array$1 = Array;
  var max$1 = Math.max;

  // `Array.prototype.slice` method
  // https://tc39.es/ecma262/#sec-array.prototype.slice
  // fallback for not array-like ES3 strings and DOM objects
  $$d({ target: 'Array', proto: true, forced: !HAS_SPECIES_SUPPORT$1 }, {
    slice: function slice(start, end) {
      var O = toIndexedObject$1(this);
      var length = lengthOfArrayLike$2(O);
      var k = toAbsoluteIndex$1(start, length);
      var fin = toAbsoluteIndex$1(end === undefined ? length : end, length);
      // inline `ArraySpeciesCreate` for usage native `Array#slice` where it's possible
      var Constructor, result, n;
      if (isArray$6(O)) {
        Constructor = O.constructor;
        // cross-realm fallback
        if (isConstructor(Constructor) && (Constructor === $Array$1 || isArray$6(Constructor.prototype))) {
          Constructor = undefined;
        } else if (isObject$3(Constructor)) {
          Constructor = Constructor[SPECIES$1];
          if (Constructor === null) Constructor = undefined;
        }
        if (Constructor === $Array$1 || Constructor === undefined) {
          return nativeSlice(O, k, fin);
        }
      }
      result = new (Constructor === undefined ? $Array$1 : Constructor)(max$1(fin - k, 0));
      for (n = 0; k < fin; k++, n++) if (k in O) createProperty$1(result, n, O[k]);
      result.length = n;
      return result;
    }
  });

  var uncurryThis$8 = functionUncurryThis;
  var aCallable$1 = aCallable$a;
  var isObject$2 = isObject$d;
  var hasOwn = hasOwnProperty_1;
  var arraySlice$2 = arraySlice$4;
  var NATIVE_BIND = functionBindNative;

  var $Function = Function;
  var concat = uncurryThis$8([].concat);
  var join = uncurryThis$8([].join);
  var factories = {};

  var construct = function (C, argsLength, args) {
    if (!hasOwn(factories, argsLength)) {
      for (var list = [], i = 0; i < argsLength; i++) list[i] = 'a[' + i + ']';
      factories[argsLength] = $Function('C,a', 'return new C(' + join(list, ',') + ')');
    } return factories[argsLength](C, args);
  };

  // `Function.prototype.bind` method implementation
  // https://tc39.es/ecma262/#sec-function.prototype.bind
  // eslint-disable-next-line es/no-function-prototype-bind -- detection
  var functionBind = NATIVE_BIND ? $Function.bind : function bind(that /* , ...args */) {
    var F = aCallable$1(this);
    var Prototype = F.prototype;
    var partArgs = arraySlice$2(arguments, 1);
    var boundFunction = function bound(/* args... */) {
      var args = concat(partArgs, arraySlice$2(arguments));
      return this instanceof boundFunction ? construct(F, args.length, args) : F.apply(that, args);
    };
    if (isObject$2(Prototype)) boundFunction.prototype = Prototype;
    return boundFunction;
  };

  // TODO: Remove from `core-js@4`
  var $$c = _export;
  var bind = functionBind;

  // `Function.prototype.bind` method
  // https://tc39.es/ecma262/#sec-function.prototype.bind
  // eslint-disable-next-line es/no-function-prototype-bind -- detection
  $$c({ target: 'Function', proto: true, forced: Function.bind !== bind }, {
    bind: bind
  });

  var classof$1 = classof$6;

  var $String = String;

  var toString$a = function (argument) {
    if (classof$1(argument) === 'Symbol') throw TypeError('Cannot convert a Symbol value to a string');
    return $String(argument);
  };

  // a string of all valid unicode whitespaces
  var whitespaces$4 = '\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002' +
    '\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028\u2029\uFEFF';

  var uncurryThis$7 = functionUncurryThis;
  var requireObjectCoercible$2 = requireObjectCoercible$5;
  var toString$9 = toString$a;
  var whitespaces$3 = whitespaces$4;

  var replace$2 = uncurryThis$7(''.replace);
  var ltrim = RegExp('^[' + whitespaces$3 + ']+');
  var rtrim = RegExp('(^|[^' + whitespaces$3 + '])[' + whitespaces$3 + ']+$');

  // `String.prototype.{ trim, trimStart, trimEnd, trimLeft, trimRight }` methods implementation
  var createMethod$1 = function (TYPE) {
    return function ($this) {
      var string = toString$9(requireObjectCoercible$2($this));
      if (TYPE & 1) string = replace$2(string, ltrim, '');
      if (TYPE & 2) string = replace$2(string, rtrim, '$1');
      return string;
    };
  };

  var stringTrim = {
    // `String.prototype.{ trimLeft, trimStart }` methods
    // https://tc39.es/ecma262/#sec-string.prototype.trimstart
    start: createMethod$1(1),
    // `String.prototype.{ trimRight, trimEnd }` methods
    // https://tc39.es/ecma262/#sec-string.prototype.trimend
    end: createMethod$1(2),
    // `String.prototype.trim` method
    // https://tc39.es/ecma262/#sec-string.prototype.trim
    trim: createMethod$1(3)
  };

  var global$8 = global$o;
  var fails$7 = fails$l;
  var uncurryThis$6 = functionUncurryThis;
  var toString$8 = toString$a;
  var trim$2 = stringTrim.trim;
  var whitespaces$2 = whitespaces$4;

  var charAt$3 = uncurryThis$6(''.charAt);
  var $parseFloat$1 = global$8.parseFloat;
  var Symbol$6 = global$8.Symbol;
  var ITERATOR$1 = Symbol$6 && Symbol$6.iterator;
  var FORCED$3 = 1 / $parseFloat$1(whitespaces$2 + '-0') !== -Infinity
    // MS Edge 18- broken with boxed symbols
    || (ITERATOR$1 && !fails$7(function () { $parseFloat$1(Object(ITERATOR$1)); }));

  // `parseFloat` method
  // https://tc39.es/ecma262/#sec-parsefloat-string
  var numberParseFloat = FORCED$3 ? function parseFloat(string) {
    var trimmedString = trim$2(toString$8(string));
    var result = $parseFloat$1(trimmedString);
    return result === 0 && charAt$3(trimmedString, 0) == '-' ? -0 : result;
  } : $parseFloat$1;

  var $$b = _export;
  var $parseFloat = numberParseFloat;

  // `parseFloat` method
  // https://tc39.es/ecma262/#sec-parsefloat-string
  $$b({ global: true, forced: parseFloat != $parseFloat }, {
    parseFloat: $parseFloat
  });

  var global$7 = global$o;
  var fails$6 = fails$l;
  var uncurryThis$5 = functionUncurryThis;
  var toString$7 = toString$a;
  var trim$1 = stringTrim.trim;
  var whitespaces$1 = whitespaces$4;

  var $parseInt$1 = global$7.parseInt;
  var Symbol$5 = global$7.Symbol;
  var ITERATOR = Symbol$5 && Symbol$5.iterator;
  var hex = /^[+-]?0x/i;
  var exec$1 = uncurryThis$5(hex.exec);
  var FORCED$2 = $parseInt$1(whitespaces$1 + '08') !== 8 || $parseInt$1(whitespaces$1 + '0x16') !== 22
    // MS Edge 18- broken with boxed symbols
    || (ITERATOR && !fails$6(function () { $parseInt$1(Object(ITERATOR)); }));

  // `parseInt` method
  // https://tc39.es/ecma262/#sec-parseint-string-radix
  var numberParseInt = FORCED$2 ? function parseInt(string, radix) {
    var S = trim$1(toString$7(string));
    return $parseInt$1(S, (radix >>> 0) || (exec$1(hex, S) ? 16 : 10));
  } : $parseInt$1;

  var $$a = _export;
  var $parseInt = numberParseInt;

  // `parseInt` method
  // https://tc39.es/ecma262/#sec-parseint-string-radix
  $$a({ global: true, forced: parseInt != $parseInt }, {
    parseInt: $parseInt
  });

  var anObject$4 = anObject$d;

  // `RegExp.prototype.flags` getter implementation
  // https://tc39.es/ecma262/#sec-get-regexp.prototype.flags
  var regexpFlags$1 = function () {
    var that = anObject$4(this);
    var result = '';
    if (that.hasIndices) result += 'd';
    if (that.global) result += 'g';
    if (that.ignoreCase) result += 'i';
    if (that.multiline) result += 'm';
    if (that.dotAll) result += 's';
    if (that.unicode) result += 'u';
    if (that.unicodeSets) result += 'v';
    if (that.sticky) result += 'y';
    return result;
  };

  var fails$5 = fails$l;
  var global$6 = global$o;

  // babel-minify and Closure Compiler transpiles RegExp('a', 'y') -> /a/y and it causes SyntaxError
  var $RegExp$2 = global$6.RegExp;

  var UNSUPPORTED_Y$1 = fails$5(function () {
    var re = $RegExp$2('a', 'y');
    re.lastIndex = 2;
    return re.exec('abcd') != null;
  });

  // UC Browser bug
  // https://github.com/zloirock/core-js/issues/1008
  var MISSED_STICKY = UNSUPPORTED_Y$1 || fails$5(function () {
    return !$RegExp$2('a', 'y').sticky;
  });

  var BROKEN_CARET = UNSUPPORTED_Y$1 || fails$5(function () {
    // https://bugzilla.mozilla.org/show_bug.cgi?id=773687
    var re = $RegExp$2('^r', 'gy');
    re.lastIndex = 2;
    return re.exec('str') != null;
  });

  var regexpStickyHelpers = {
    BROKEN_CARET: BROKEN_CARET,
    MISSED_STICKY: MISSED_STICKY,
    UNSUPPORTED_Y: UNSUPPORTED_Y$1
  };

  var objectDefineProperties = {};

  var internalObjectKeys = objectKeysInternal;
  var enumBugKeys$1 = enumBugKeys$3;

  // `Object.keys` method
  // https://tc39.es/ecma262/#sec-object.keys
  // eslint-disable-next-line es/no-object-keys -- safe
  var objectKeys$1 = Object.keys || function keys(O) {
    return internalObjectKeys(O, enumBugKeys$1);
  };

  var DESCRIPTORS = descriptors;
  var V8_PROTOTYPE_DEFINE_BUG = v8PrototypeDefineBug;
  var definePropertyModule = objectDefineProperty;
  var anObject$3 = anObject$d;
  var toIndexedObject = toIndexedObject$6;
  var objectKeys = objectKeys$1;

  // `Object.defineProperties` method
  // https://tc39.es/ecma262/#sec-object.defineproperties
  // eslint-disable-next-line es/no-object-defineproperties -- safe
  objectDefineProperties.f = DESCRIPTORS && !V8_PROTOTYPE_DEFINE_BUG ? Object.defineProperties : function defineProperties(O, Properties) {
    anObject$3(O);
    var props = toIndexedObject(Properties);
    var keys = objectKeys(Properties);
    var length = keys.length;
    var index = 0;
    var key;
    while (length > index) definePropertyModule.f(O, key = keys[index++], props[key]);
    return O;
  };

  /* global ActiveXObject -- old IE, WSH */

  var anObject$2 = anObject$d;
  var definePropertiesModule = objectDefineProperties;
  var enumBugKeys = enumBugKeys$3;
  var hiddenKeys = hiddenKeys$4;
  var html = html$2;
  var documentCreateElement = documentCreateElement$2;
  var sharedKey = sharedKey$2;

  var GT = '>';
  var LT = '<';
  var PROTOTYPE = 'prototype';
  var SCRIPT = 'script';
  var IE_PROTO = sharedKey('IE_PROTO');

  var EmptyConstructor = function () { /* empty */ };

  var scriptTag = function (content) {
    return LT + SCRIPT + GT + content + LT + '/' + SCRIPT + GT;
  };

  // Create object with fake `null` prototype: use ActiveX Object with cleared prototype
  var NullProtoObjectViaActiveX = function (activeXDocument) {
    activeXDocument.write(scriptTag(''));
    activeXDocument.close();
    var temp = activeXDocument.parentWindow.Object;
    activeXDocument = null; // avoid memory leak
    return temp;
  };

  // Create object with fake `null` prototype: use iframe Object with cleared prototype
  var NullProtoObjectViaIFrame = function () {
    // Thrash, waste and sodomy: IE GC bug
    var iframe = documentCreateElement('iframe');
    var JS = 'java' + SCRIPT + ':';
    var iframeDocument;
    iframe.style.display = 'none';
    html.appendChild(iframe);
    // https://github.com/zloirock/core-js/issues/475
    iframe.src = String(JS);
    iframeDocument = iframe.contentWindow.document;
    iframeDocument.open();
    iframeDocument.write(scriptTag('document.F=Object'));
    iframeDocument.close();
    return iframeDocument.F;
  };

  // Check for document.domain and active x support
  // No need to use active x approach when document.domain is not set
  // see https://github.com/es-shims/es5-shim/issues/150
  // variation of https://github.com/kitcambridge/es5-shim/commit/4f738ac066346
  // avoid IE GC bug
  var activeXDocument;
  var NullProtoObject = function () {
    try {
      activeXDocument = new ActiveXObject('htmlfile');
    } catch (error) { /* ignore */ }
    NullProtoObject = typeof document != 'undefined'
      ? document.domain && activeXDocument
        ? NullProtoObjectViaActiveX(activeXDocument) // old IE
        : NullProtoObjectViaIFrame()
      : NullProtoObjectViaActiveX(activeXDocument); // WSH
    var length = enumBugKeys.length;
    while (length--) delete NullProtoObject[PROTOTYPE][enumBugKeys[length]];
    return NullProtoObject();
  };

  hiddenKeys[IE_PROTO] = true;

  // `Object.create` method
  // https://tc39.es/ecma262/#sec-object.create
  // eslint-disable-next-line es/no-object-create -- safe
  var objectCreate = Object.create || function create(O, Properties) {
    var result;
    if (O !== null) {
      EmptyConstructor[PROTOTYPE] = anObject$2(O);
      result = new EmptyConstructor();
      EmptyConstructor[PROTOTYPE] = null;
      // add "__proto__" for Object.getPrototypeOf polyfill
      result[IE_PROTO] = O;
    } else result = NullProtoObject();
    return Properties === undefined ? result : definePropertiesModule.f(result, Properties);
  };

  var fails$4 = fails$l;
  var global$5 = global$o;

  // babel-minify and Closure Compiler transpiles RegExp('.', 's') -> /./s and it causes SyntaxError
  var $RegExp$1 = global$5.RegExp;

  var regexpUnsupportedDotAll = fails$4(function () {
    var re = $RegExp$1('.', 's');
    return !(re.dotAll && re.exec('\n') && re.flags === 's');
  });

  var fails$3 = fails$l;
  var global$4 = global$o;

  // babel-minify and Closure Compiler transpiles RegExp('(?<a>b)', 'g') -> /(?<a>b)/g and it causes SyntaxError
  var $RegExp = global$4.RegExp;

  var regexpUnsupportedNcg = fails$3(function () {
    var re = $RegExp('(?<a>b)', 'g');
    return re.exec('b').groups.a !== 'b' ||
      'b'.replace(re, '$<a>c') !== 'bc';
  });

  /* eslint-disable regexp/no-empty-capturing-group, regexp/no-empty-group, regexp/no-lazy-ends -- testing */
  /* eslint-disable regexp/no-useless-quantifier -- testing */
  var call$2 = functionCall;
  var uncurryThis$4 = functionUncurryThis;
  var toString$6 = toString$a;
  var regexpFlags = regexpFlags$1;
  var stickyHelpers = regexpStickyHelpers;
  var shared = sharedExports;
  var create$1 = objectCreate;
  var getInternalState = internalState.get;
  var UNSUPPORTED_DOT_ALL = regexpUnsupportedDotAll;
  var UNSUPPORTED_NCG = regexpUnsupportedNcg;

  var nativeReplace = shared('native-string-replace', String.prototype.replace);
  var nativeExec = RegExp.prototype.exec;
  var patchedExec = nativeExec;
  var charAt$2 = uncurryThis$4(''.charAt);
  var indexOf = uncurryThis$4(''.indexOf);
  var replace$1 = uncurryThis$4(''.replace);
  var stringSlice$1 = uncurryThis$4(''.slice);

  var UPDATES_LAST_INDEX_WRONG = (function () {
    var re1 = /a/;
    var re2 = /b*/g;
    call$2(nativeExec, re1, 'a');
    call$2(nativeExec, re2, 'a');
    return re1.lastIndex !== 0 || re2.lastIndex !== 0;
  })();

  var UNSUPPORTED_Y = stickyHelpers.BROKEN_CARET;

  // nonparticipating capturing group, copied from es5-shim's String#split patch.
  var NPCG_INCLUDED = /()??/.exec('')[1] !== undefined;

  var PATCH = UPDATES_LAST_INDEX_WRONG || NPCG_INCLUDED || UNSUPPORTED_Y || UNSUPPORTED_DOT_ALL || UNSUPPORTED_NCG;

  if (PATCH) {
    patchedExec = function exec(string) {
      var re = this;
      var state = getInternalState(re);
      var str = toString$6(string);
      var raw = state.raw;
      var result, reCopy, lastIndex, match, i, object, group;

      if (raw) {
        raw.lastIndex = re.lastIndex;
        result = call$2(patchedExec, raw, str);
        re.lastIndex = raw.lastIndex;
        return result;
      }

      var groups = state.groups;
      var sticky = UNSUPPORTED_Y && re.sticky;
      var flags = call$2(regexpFlags, re);
      var source = re.source;
      var charsAdded = 0;
      var strCopy = str;

      if (sticky) {
        flags = replace$1(flags, 'y', '');
        if (indexOf(flags, 'g') === -1) {
          flags += 'g';
        }

        strCopy = stringSlice$1(str, re.lastIndex);
        // Support anchored sticky behavior.
        if (re.lastIndex > 0 && (!re.multiline || re.multiline && charAt$2(str, re.lastIndex - 1) !== '\n')) {
          source = '(?: ' + source + ')';
          strCopy = ' ' + strCopy;
          charsAdded++;
        }
        // ^(? + rx + ) is needed, in combination with some str slicing, to
        // simulate the 'y' flag.
        reCopy = new RegExp('^(?:' + source + ')', flags);
      }

      if (NPCG_INCLUDED) {
        reCopy = new RegExp('^' + source + '$(?!\\s)', flags);
      }
      if (UPDATES_LAST_INDEX_WRONG) lastIndex = re.lastIndex;

      match = call$2(nativeExec, sticky ? reCopy : re, strCopy);

      if (sticky) {
        if (match) {
          match.input = stringSlice$1(match.input, charsAdded);
          match[0] = stringSlice$1(match[0], charsAdded);
          match.index = re.lastIndex;
          re.lastIndex += match[0].length;
        } else re.lastIndex = 0;
      } else if (UPDATES_LAST_INDEX_WRONG && match) {
        re.lastIndex = re.global ? match.index + match[0].length : lastIndex;
      }
      if (NPCG_INCLUDED && match && match.length > 1) {
        // Fix browsers whose `exec` methods don't consistently return `undefined`
        // for NPCG, like IE8. NOTE: This doesn't work for /(.?)?/
        call$2(nativeReplace, match[0], reCopy, function () {
          for (i = 1; i < arguments.length - 2; i++) {
            if (arguments[i] === undefined) match[i] = undefined;
          }
        });
      }

      if (match && groups) {
        match.groups = object = create$1(null);
        for (i = 0; i < groups.length; i++) {
          group = groups[i];
          object[group[0]] = match[group[1]];
        }
      }

      return match;
    };
  }

  var regexpExec$2 = patchedExec;

  var $$9 = _export;
  var exec = regexpExec$2;

  // `RegExp.prototype.exec` method
  // https://tc39.es/ecma262/#sec-regexp.prototype.exec
  $$9({ target: 'RegExp', proto: true, forced: /./.exec !== exec }, {
    exec: exec
  });

  var isDevelopment$1 = false;

  /*

  Based off glamor's StyleSheet, thanks Sunil ❤️

  high performance StyleSheet for css-in-js systems

  - uses multiple style tags behind the scenes for millions of rules
  - uses `insertRule` for appending in production for *much* faster performance

  // usage

  import { StyleSheet } from '@emotion/sheet'

  let styleSheet = new StyleSheet({ key: '', container: document.head })

  styleSheet.insert('#box { border: 1px solid red; }')
  - appends a css rule into the stylesheet

  styleSheet.flush()
  - empties the stylesheet of all its contents

  */

  function sheetForTag(tag) {
    if (tag.sheet) {
      return tag.sheet;
    } // this weirdness brought to you by firefox

    /* istanbul ignore next */


    for (var i = 0; i < document.styleSheets.length; i++) {
      if (document.styleSheets[i].ownerNode === tag) {
        return document.styleSheets[i];
      }
    } // this function should always return with a value
    // TS can't understand it though so we make it stop complaining here


    return undefined;
  }

  function createStyleElement(options) {
    var tag = document.createElement('style');
    tag.setAttribute('data-emotion', options.key);

    if (options.nonce !== undefined) {
      tag.setAttribute('nonce', options.nonce);
    }

    tag.appendChild(document.createTextNode(''));
    tag.setAttribute('data-s', '');
    return tag;
  }

  var StyleSheet = /*#__PURE__*/function () {
    // Using Node instead of HTMLElement since container may be a ShadowRoot
    function StyleSheet(options) {
      var _this = this;

      this._insertTag = function (tag) {
        var before;

        if (_this.tags.length === 0) {
          if (_this.insertionPoint) {
            before = _this.insertionPoint.nextSibling;
          } else if (_this.prepend) {
            before = _this.container.firstChild;
          } else {
            before = _this.before;
          }
        } else {
          before = _this.tags[_this.tags.length - 1].nextSibling;
        }

        _this.container.insertBefore(tag, before);

        _this.tags.push(tag);
      };

      this.isSpeedy = options.speedy === undefined ? !isDevelopment$1 : options.speedy;
      this.tags = [];
      this.ctr = 0;
      this.nonce = options.nonce; // key is the value of the data-emotion attribute, it's used to identify different sheets

      this.key = options.key;
      this.container = options.container;
      this.prepend = options.prepend;
      this.insertionPoint = options.insertionPoint;
      this.before = null;
    }

    var _proto = StyleSheet.prototype;

    _proto.hydrate = function hydrate(nodes) {
      nodes.forEach(this._insertTag);
    };

    _proto.insert = function insert(rule) {
      // the max length is how many rules we have per style tag, it's 65000 in speedy mode
      // it's 1 in dev because we insert source maps that map a single rule to a location
      // and you can only have one source map per style tag
      if (this.ctr % (this.isSpeedy ? 65000 : 1) === 0) {
        this._insertTag(createStyleElement(this));
      }

      var tag = this.tags[this.tags.length - 1];

      if (this.isSpeedy) {
        var sheet = sheetForTag(tag);

        try {
          // this is the ultrafast version, works across browsers
          // the big drawback is that the css won't be editable in devtools
          sheet.insertRule(rule, sheet.cssRules.length);
        } catch (e) {
        }
      } else {
        tag.appendChild(document.createTextNode(rule));
      }

      this.ctr++;
    };

    _proto.flush = function flush() {
      this.tags.forEach(function (tag) {
        var _tag$parentNode;

        return (_tag$parentNode = tag.parentNode) == null ? void 0 : _tag$parentNode.removeChild(tag);
      });
      this.tags = [];
      this.ctr = 0;
    };

    return StyleSheet;
  }();

  var MS = '-ms-';
  var MOZ = '-moz-';
  var WEBKIT$1 = '-webkit-';

  var COMMENT = 'comm';
  var RULESET = 'rule';
  var DECLARATION = 'decl';
  var IMPORT = '@import';
  var KEYFRAMES = '@keyframes';
  var LAYER = '@layer';

  /**
   * @param {number}
   * @return {number}
   */
  var abs = Math.abs;

  /**
   * @param {number}
   * @return {string}
   */
  var from = String.fromCharCode;

  /**
   * @param {object}
   * @return {object}
   */
  var assign = Object.assign;

  /**
   * @param {string} value
   * @param {number} length
   * @return {number}
   */
  function hash (value, length) {
  	return charat(value, 0) ^ 45 ? (((((((length << 2) ^ charat(value, 0)) << 2) ^ charat(value, 1)) << 2) ^ charat(value, 2)) << 2) ^ charat(value, 3) : 0
  }

  /**
   * @param {string} value
   * @return {string}
   */
  function trim (value) {
  	return value.trim()
  }

  /**
   * @param {string} value
   * @param {RegExp} pattern
   * @return {string?}
   */
  function match (value, pattern) {
  	return (value = pattern.exec(value)) ? value[0] : value
  }

  /**
   * @param {string} value
   * @param {(string|RegExp)} pattern
   * @param {string} replacement
   * @return {string}
   */
  function replace (value, pattern, replacement) {
  	return value.replace(pattern, replacement)
  }

  /**
   * @param {string} value
   * @param {string} search
   * @return {number}
   */
  function indexof (value, search) {
  	return value.indexOf(search)
  }

  /**
   * @param {string} value
   * @param {number} index
   * @return {number}
   */
  function charat (value, index) {
  	return value.charCodeAt(index) | 0
  }

  /**
   * @param {string} value
   * @param {number} begin
   * @param {number} end
   * @return {string}
   */
  function substr (value, begin, end) {
  	return value.slice(begin, end)
  }

  /**
   * @param {string} value
   * @return {number}
   */
  function strlen (value) {
  	return value.length
  }

  /**
   * @param {any[]} value
   * @return {number}
   */
  function sizeof (value) {
  	return value.length
  }

  /**
   * @param {any} value
   * @param {any[]} array
   * @return {any}
   */
  function append (value, array) {
  	return array.push(value), value
  }

  /**
   * @param {string[]} array
   * @param {function} callback
   * @return {string}
   */
  function combine (array, callback) {
  	return array.map(callback).join('')
  }

  var line = 1;
  var column = 1;
  var length = 0;
  var position = 0;
  var character = 0;
  var characters = '';

  /**
   * @param {string} value
   * @param {object | null} root
   * @param {object | null} parent
   * @param {string} type
   * @param {string[] | string} props
   * @param {object[] | string} children
   * @param {number} length
   */
  function node (value, root, parent, type, props, children, length) {
  	return {value: value, root: root, parent: parent, type: type, props: props, children: children, line: line, column: column, length: length, return: ''}
  }

  /**
   * @param {object} root
   * @param {object} props
   * @return {object}
   */
  function copy (root, props) {
  	return assign(node('', null, null, '', null, null, 0), root, {length: -root.length}, props)
  }

  /**
   * @return {number}
   */
  function char () {
  	return character
  }

  /**
   * @return {number}
   */
  function prev () {
  	character = position > 0 ? charat(characters, --position) : 0;

  	if (column--, character === 10)
  		column = 1, line--;

  	return character
  }

  /**
   * @return {number}
   */
  function next () {
  	character = position < length ? charat(characters, position++) : 0;

  	if (column++, character === 10)
  		column = 1, line++;

  	return character
  }

  /**
   * @return {number}
   */
  function peek () {
  	return charat(characters, position)
  }

  /**
   * @return {number}
   */
  function caret () {
  	return position
  }

  /**
   * @param {number} begin
   * @param {number} end
   * @return {string}
   */
  function slice (begin, end) {
  	return substr(characters, begin, end)
  }

  /**
   * @param {number} type
   * @return {number}
   */
  function token (type) {
  	switch (type) {
  		// \0 \t \n \r \s whitespace token
  		case 0: case 9: case 10: case 13: case 32:
  			return 5
  		// ! + , / > @ ~ isolate token
  		case 33: case 43: case 44: case 47: case 62: case 64: case 126:
  		// ; { } breakpoint token
  		case 59: case 123: case 125:
  			return 4
  		// : accompanied token
  		case 58:
  			return 3
  		// " ' ( [ opening delimit token
  		case 34: case 39: case 40: case 91:
  			return 2
  		// ) ] closing delimit token
  		case 41: case 93:
  			return 1
  	}

  	return 0
  }

  /**
   * @param {string} value
   * @return {any[]}
   */
  function alloc (value) {
  	return line = column = 1, length = strlen(characters = value), position = 0, []
  }

  /**
   * @param {any} value
   * @return {any}
   */
  function dealloc (value) {
  	return characters = '', value
  }

  /**
   * @param {number} type
   * @return {string}
   */
  function delimit (type) {
  	return trim(slice(position - 1, delimiter(type === 91 ? type + 2 : type === 40 ? type + 1 : type)))
  }

  /**
   * @param {number} type
   * @return {string}
   */
  function whitespace (type) {
  	while (character = peek())
  		if (character < 33)
  			next();
  		else
  			break

  	return token(type) > 2 || token(character) > 3 ? '' : ' '
  }

  /**
   * @param {number} index
   * @param {number} count
   * @return {string}
   */
  function escaping (index, count) {
  	while (--count && next())
  		// not 0-9 A-F a-f
  		if (character < 48 || character > 102 || (character > 57 && character < 65) || (character > 70 && character < 97))
  			break

  	return slice(index, caret() + (count < 6 && peek() == 32 && next() == 32))
  }

  /**
   * @param {number} type
   * @return {number}
   */
  function delimiter (type) {
  	while (next())
  		switch (character) {
  			// ] ) " '
  			case type:
  				return position
  			// " '
  			case 34: case 39:
  				if (type !== 34 && type !== 39)
  					delimiter(character);
  				break
  			// (
  			case 40:
  				if (type === 41)
  					delimiter(type);
  				break
  			// \
  			case 92:
  				next();
  				break
  		}

  	return position
  }

  /**
   * @param {number} type
   * @param {number} index
   * @return {number}
   */
  function commenter (type, index) {
  	while (next())
  		// //
  		if (type + character === 47 + 10)
  			break
  		// /*
  		else if (type + character === 42 + 42 && peek() === 47)
  			break

  	return '/*' + slice(index, position - 1) + '*' + from(type === 47 ? type : next())
  }

  /**
   * @param {number} index
   * @return {string}
   */
  function identifier (index) {
  	while (!token(peek()))
  		next();

  	return slice(index, position)
  }

  /**
   * @param {string} value
   * @return {object[]}
   */
  function compile (value) {
  	return dealloc(parse('', null, null, null, [''], value = alloc(value), 0, [0], value))
  }

  /**
   * @param {string} value
   * @param {object} root
   * @param {object?} parent
   * @param {string[]} rule
   * @param {string[]} rules
   * @param {string[]} rulesets
   * @param {number[]} pseudo
   * @param {number[]} points
   * @param {string[]} declarations
   * @return {object}
   */
  function parse (value, root, parent, rule, rules, rulesets, pseudo, points, declarations) {
  	var index = 0;
  	var offset = 0;
  	var length = pseudo;
  	var atrule = 0;
  	var property = 0;
  	var previous = 0;
  	var variable = 1;
  	var scanning = 1;
  	var ampersand = 1;
  	var character = 0;
  	var type = '';
  	var props = rules;
  	var children = rulesets;
  	var reference = rule;
  	var characters = type;

  	while (scanning)
  		switch (previous = character, character = next()) {
  			// (
  			case 40:
  				if (previous != 108 && charat(characters, length - 1) == 58) {
  					if (indexof(characters += replace(delimit(character), '&', '&\f'), '&\f') != -1)
  						ampersand = -1;
  					break
  				}
  			// " ' [
  			case 34: case 39: case 91:
  				characters += delimit(character);
  				break
  			// \t \n \r \s
  			case 9: case 10: case 13: case 32:
  				characters += whitespace(previous);
  				break
  			// \
  			case 92:
  				characters += escaping(caret() - 1, 7);
  				continue
  			// /
  			case 47:
  				switch (peek()) {
  					case 42: case 47:
  						append(comment(commenter(next(), caret()), root, parent), declarations);
  						break
  					default:
  						characters += '/';
  				}
  				break
  			// {
  			case 123 * variable:
  				points[index++] = strlen(characters) * ampersand;
  			// } ; \0
  			case 125 * variable: case 59: case 0:
  				switch (character) {
  					// \0 }
  					case 0: case 125: scanning = 0;
  					// ;
  					case 59 + offset: if (ampersand == -1) characters = replace(characters, /\f/g, '');
  						if (property > 0 && (strlen(characters) - length))
  							append(property > 32 ? declaration(characters + ';', rule, parent, length - 1) : declaration(replace(characters, ' ', '') + ';', rule, parent, length - 2), declarations);
  						break
  					// @ ;
  					case 59: characters += ';';
  					// { rule/at-rule
  					default:
  						append(reference = ruleset(characters, root, parent, index, offset, rules, points, type, props = [], children = [], length), rulesets);

  						if (character === 123)
  							if (offset === 0)
  								parse(characters, root, reference, reference, props, rulesets, length, points, children);
  							else
  								switch (atrule === 99 && charat(characters, 3) === 110 ? 100 : atrule) {
  									// d l m s
  									case 100: case 108: case 109: case 115:
  										parse(value, reference, reference, rule && append(ruleset(value, reference, reference, 0, 0, rules, points, type, rules, props = [], length), children), rules, children, length, points, rule ? props : children);
  										break
  									default:
  										parse(characters, reference, reference, reference, [''], children, 0, points, children);
  								}
  				}

  				index = offset = property = 0, variable = ampersand = 1, type = characters = '', length = pseudo;
  				break
  			// :
  			case 58:
  				length = 1 + strlen(characters), property = previous;
  			default:
  				if (variable < 1)
  					if (character == 123)
  						--variable;
  					else if (character == 125 && variable++ == 0 && prev() == 125)
  						continue

  				switch (characters += from(character), character * variable) {
  					// &
  					case 38:
  						ampersand = offset > 0 ? 1 : (characters += '\f', -1);
  						break
  					// ,
  					case 44:
  						points[index++] = (strlen(characters) - 1) * ampersand, ampersand = 1;
  						break
  					// @
  					case 64:
  						// -
  						if (peek() === 45)
  							characters += delimit(next());

  						atrule = peek(), offset = length = strlen(type = characters += identifier(caret())), character++;
  						break
  					// -
  					case 45:
  						if (previous === 45 && strlen(characters) == 2)
  							variable = 0;
  				}
  		}

  	return rulesets
  }

  /**
   * @param {string} value
   * @param {object} root
   * @param {object?} parent
   * @param {number} index
   * @param {number} offset
   * @param {string[]} rules
   * @param {number[]} points
   * @param {string} type
   * @param {string[]} props
   * @param {string[]} children
   * @param {number} length
   * @return {object}
   */
  function ruleset (value, root, parent, index, offset, rules, points, type, props, children, length) {
  	var post = offset - 1;
  	var rule = offset === 0 ? rules : [''];
  	var size = sizeof(rule);

  	for (var i = 0, j = 0, k = 0; i < index; ++i)
  		for (var x = 0, y = substr(value, post + 1, post = abs(j = points[i])), z = value; x < size; ++x)
  			if (z = trim(j > 0 ? rule[x] + ' ' + y : replace(y, /&\f/g, rule[x])))
  				props[k++] = z;

  	return node(value, root, parent, offset === 0 ? RULESET : type, props, children, length)
  }

  /**
   * @param {number} value
   * @param {object} root
   * @param {object?} parent
   * @return {object}
   */
  function comment (value, root, parent) {
  	return node(value, root, parent, COMMENT, from(char()), substr(value, 2, -2), 0)
  }

  /**
   * @param {string} value
   * @param {object} root
   * @param {object?} parent
   * @param {number} length
   * @return {object}
   */
  function declaration (value, root, parent, length) {
  	return node(value, root, parent, DECLARATION, substr(value, 0, length), substr(value, length + 1, -1), length)
  }

  /**
   * @param {object[]} children
   * @param {function} callback
   * @return {string}
   */
  function serialize (children, callback) {
  	var output = '';
  	var length = sizeof(children);

  	for (var i = 0; i < length; i++)
  		output += callback(children[i], i, children, callback) || '';

  	return output
  }

  /**
   * @param {object} element
   * @param {number} index
   * @param {object[]} children
   * @param {function} callback
   * @return {string}
   */
  function stringify (element, index, children, callback) {
  	switch (element.type) {
  		case LAYER: if (element.children.length) break
  		case IMPORT: case DECLARATION: return element.return = element.return || element.value
  		case COMMENT: return ''
  		case KEYFRAMES: return element.return = element.value + '{' + serialize(element.children, callback) + '}'
  		case RULESET: element.value = element.props.join(',');
  	}

  	return strlen(children = serialize(element.children, callback)) ? element.return = element.value + '{' + children + '}' : ''
  }

  /**
   * @param {function[]} collection
   * @return {function}
   */
  function middleware (collection) {
  	var length = sizeof(collection);

  	return function (element, index, children, callback) {
  		var output = '';

  		for (var i = 0; i < length; i++)
  			output += collection[i](element, index, children, callback) || '';

  		return output
  	}
  }

  /**
   * @param {function} callback
   * @return {function}
   */
  function rulesheet (callback) {
  	return function (element) {
  		if (!element.root)
  			if (element = element.return)
  				callback(element);
  	}
  }

  function memoize(fn) {
    var cache = Object.create(null);
    return function (arg) {
      if (cache[arg] === undefined) cache[arg] = fn(arg);
      return cache[arg];
    };
  }

  var identifierWithPointTracking = function identifierWithPointTracking(begin, points, index) {
    var previous = 0;
    var character = 0;

    while (true) {
      previous = character;
      character = peek(); // &\f

      if (previous === 38 && character === 12) {
        points[index] = 1;
      }

      if (token(character)) {
        break;
      }

      next();
    }

    return slice(begin, position);
  };

  var toRules = function toRules(parsed, points) {
    // pretend we've started with a comma
    var index = -1;
    var character = 44;

    do {
      switch (token(character)) {
        case 0:
          // &\f
          if (character === 38 && peek() === 12) {
            // this is not 100% correct, we don't account for literal sequences here - like for example quoted strings
            // stylis inserts \f after & to know when & where it should replace this sequence with the context selector
            // and when it should just concatenate the outer and inner selectors
            // it's very unlikely for this sequence to actually appear in a different context, so we just leverage this fact here
            points[index] = 1;
          }

          parsed[index] += identifierWithPointTracking(position - 1, points, index);
          break;

        case 2:
          parsed[index] += delimit(character);
          break;

        case 4:
          // comma
          if (character === 44) {
            // colon
            parsed[++index] = peek() === 58 ? '&\f' : '';
            points[index] = parsed[index].length;
            break;
          }

        // fallthrough

        default:
          parsed[index] += from(character);
      }
    } while (character = next());

    return parsed;
  };

  var getRules = function getRules(value, points) {
    return dealloc(toRules(alloc(value), points));
  }; // WeakSet would be more appropriate, but only WeakMap is supported in IE11


  var fixedElements = /* #__PURE__ */new WeakMap();
  var compat = function compat(element) {
    if (element.type !== 'rule' || !element.parent || // positive .length indicates that this rule contains pseudo
    // negative .length indicates that this rule has been already prefixed
    element.length < 1) {
      return;
    }

    var value = element.value,
        parent = element.parent;
    var isImplicitRule = element.column === parent.column && element.line === parent.line;

    while (parent.type !== 'rule') {
      parent = parent.parent;
      if (!parent) return;
    } // short-circuit for the simplest case


    if (element.props.length === 1 && value.charCodeAt(0) !== 58
    /* colon */
    && !fixedElements.get(parent)) {
      return;
    } // if this is an implicitly inserted rule (the one eagerly inserted at the each new nested level)
    // then the props has already been manipulated beforehand as they that array is shared between it and its "rule parent"


    if (isImplicitRule) {
      return;
    }

    fixedElements.set(element, true);
    var points = [];
    var rules = getRules(value, points);
    var parentRules = parent.props;

    for (var i = 0, k = 0; i < rules.length; i++) {
      for (var j = 0; j < parentRules.length; j++, k++) {
        element.props[k] = points[i] ? rules[i].replace(/&\f/g, parentRules[j]) : parentRules[j] + " " + rules[i];
      }
    }
  };
  var removeLabel = function removeLabel(element) {
    if (element.type === 'decl') {
      var value = element.value;

      if ( // charcode for l
      value.charCodeAt(0) === 108 && // charcode for b
      value.charCodeAt(2) === 98) {
        // this ignores label
        element["return"] = '';
        element.value = '';
      }
    }
  };

  /* eslint-disable no-fallthrough */

  function prefix(value, length) {
    switch (hash(value, length)) {
      // color-adjust
      case 5103:
        return WEBKIT$1 + 'print-' + value + value;
      // animation, animation-(delay|direction|duration|fill-mode|iteration-count|name|play-state|timing-function)

      case 5737:
      case 4201:
      case 3177:
      case 3433:
      case 1641:
      case 4457:
      case 2921: // text-decoration, filter, clip-path, backface-visibility, column, box-decoration-break

      case 5572:
      case 6356:
      case 5844:
      case 3191:
      case 6645:
      case 3005: // mask, mask-image, mask-(mode|clip|size), mask-(repeat|origin), mask-position, mask-composite,

      case 6391:
      case 5879:
      case 5623:
      case 6135:
      case 4599:
      case 4855: // background-clip, columns, column-(count|fill|gap|rule|rule-color|rule-style|rule-width|span|width)

      case 4215:
      case 6389:
      case 5109:
      case 5365:
      case 5621:
      case 3829:
        return WEBKIT$1 + value + value;
      // appearance, user-select, transform, hyphens, text-size-adjust

      case 5349:
      case 4246:
      case 4810:
      case 6968:
      case 2756:
        return WEBKIT$1 + value + MOZ + value + MS + value + value;
      // flex, flex-direction

      case 6828:
      case 4268:
        return WEBKIT$1 + value + MS + value + value;
      // order

      case 6165:
        return WEBKIT$1 + value + MS + 'flex-' + value + value;
      // align-items

      case 5187:
        return WEBKIT$1 + value + replace(value, /(\w+).+(:[^]+)/, WEBKIT$1 + 'box-$1$2' + MS + 'flex-$1$2') + value;
      // align-self

      case 5443:
        return WEBKIT$1 + value + MS + 'flex-item-' + replace(value, /flex-|-self/, '') + value;
      // align-content

      case 4675:
        return WEBKIT$1 + value + MS + 'flex-line-pack' + replace(value, /align-content|flex-|-self/, '') + value;
      // flex-shrink

      case 5548:
        return WEBKIT$1 + value + MS + replace(value, 'shrink', 'negative') + value;
      // flex-basis

      case 5292:
        return WEBKIT$1 + value + MS + replace(value, 'basis', 'preferred-size') + value;
      // flex-grow

      case 6060:
        return WEBKIT$1 + 'box-' + replace(value, '-grow', '') + WEBKIT$1 + value + MS + replace(value, 'grow', 'positive') + value;
      // transition

      case 4554:
        return WEBKIT$1 + replace(value, /([^-])(transform)/g, '$1' + WEBKIT$1 + '$2') + value;
      // cursor

      case 6187:
        return replace(replace(replace(value, /(zoom-|grab)/, WEBKIT$1 + '$1'), /(image-set)/, WEBKIT$1 + '$1'), value, '') + value;
      // background, background-image

      case 5495:
      case 3959:
        return replace(value, /(image-set\([^]*)/, WEBKIT$1 + '$1' + '$`$1');
      // justify-content

      case 4968:
        return replace(replace(value, /(.+:)(flex-)?(.*)/, WEBKIT$1 + 'box-pack:$3' + MS + 'flex-pack:$3'), /s.+-b[^;]+/, 'justify') + WEBKIT$1 + value + value;
      // (margin|padding)-inline-(start|end)

      case 4095:
      case 3583:
      case 4068:
      case 2532:
        return replace(value, /(.+)-inline(.+)/, WEBKIT$1 + '$1$2') + value;
      // (min|max)?(width|height|inline-size|block-size)

      case 8116:
      case 7059:
      case 5753:
      case 5535:
      case 5445:
      case 5701:
      case 4933:
      case 4677:
      case 5533:
      case 5789:
      case 5021:
      case 4765:
        // stretch, max-content, min-content, fill-available
        if (strlen(value) - 1 - length > 6) switch (charat(value, length + 1)) {
          // (m)ax-content, (m)in-content
          case 109:
            // -
            if (charat(value, length + 4) !== 45) break;
          // (f)ill-available, (f)it-content

          case 102:
            return replace(value, /(.+:)(.+)-([^]+)/, '$1' + WEBKIT$1 + '$2-$3' + '$1' + MOZ + (charat(value, length + 3) == 108 ? '$3' : '$2-$3')) + value;
          // (s)tretch

          case 115:
            return ~indexof(value, 'stretch') ? prefix(replace(value, 'stretch', 'fill-available'), length) + value : value;
        }
        break;
      // position: sticky

      case 4949:
        // (s)ticky?
        if (charat(value, length + 1) !== 115) break;
      // display: (flex|inline-flex)

      case 6444:
        switch (charat(value, strlen(value) - 3 - (~indexof(value, '!important') && 10))) {
          // stic(k)y
          case 107:
            return replace(value, ':', ':' + WEBKIT$1) + value;
          // (inline-)?fl(e)x

          case 101:
            return replace(value, /(.+:)([^;!]+)(;|!.+)?/, '$1' + WEBKIT$1 + (charat(value, 14) === 45 ? 'inline-' : '') + 'box$3' + '$1' + WEBKIT$1 + '$2$3' + '$1' + MS + '$2box$3') + value;
        }

        break;
      // writing-mode

      case 5936:
        switch (charat(value, length + 11)) {
          // vertical-l(r)
          case 114:
            return WEBKIT$1 + value + MS + replace(value, /[svh]\w+-[tblr]{2}/, 'tb') + value;
          // vertical-r(l)

          case 108:
            return WEBKIT$1 + value + MS + replace(value, /[svh]\w+-[tblr]{2}/, 'tb-rl') + value;
          // horizontal(-)tb

          case 45:
            return WEBKIT$1 + value + MS + replace(value, /[svh]\w+-[tblr]{2}/, 'lr') + value;
        }

        return WEBKIT$1 + value + MS + value + value;
    }

    return value;
  }

  var prefixer = function prefixer(element, index, children, callback) {
    if (element.length > -1) if (!element["return"]) switch (element.type) {
      case DECLARATION:
        element["return"] = prefix(element.value, element.length);
        break;

      case KEYFRAMES:
        return serialize([copy(element, {
          value: replace(element.value, '@', '@' + WEBKIT$1)
        })], callback);

      case RULESET:
        if (element.length) return combine(element.props, function (value) {
          switch (match(value, /(::plac\w+|:read-\w+)/)) {
            // :read-(only|write)
            case ':read-only':
            case ':read-write':
              return serialize([copy(element, {
                props: [replace(value, /:(read-\w+)/, ':' + MOZ + '$1')]
              })], callback);
            // :placeholder

            case '::placeholder':
              return serialize([copy(element, {
                props: [replace(value, /:(plac\w+)/, ':' + WEBKIT$1 + 'input-$1')]
              }), copy(element, {
                props: [replace(value, /:(plac\w+)/, ':' + MOZ + '$1')]
              }), copy(element, {
                props: [replace(value, /:(plac\w+)/, MS + 'input-$1')]
              })], callback);
          }

          return '';
        });
    }
  };

  var defaultStylisPlugins = [prefixer];

  var createCache = function
    /*: EmotionCache */
  createCache(options
  /*: Options */
  ) {
    var key = options.key;

    if (key === 'css') {
      var ssrStyles = document.querySelectorAll("style[data-emotion]:not([data-s])"); // get SSRed styles out of the way of React's hydration
      // document.head is a safe place to move them to(though note document.head is not necessarily the last place they will be)
      // note this very very intentionally targets all style elements regardless of the key to ensure
      // that creating a cache works inside of render of a React component

      Array.prototype.forEach.call(ssrStyles, function (node
      /*: HTMLStyleElement */
      ) {
        // we want to only move elements which have a space in the data-emotion attribute value
        // because that indicates that it is an Emotion 11 server-side rendered style elements
        // while we will already ignore Emotion 11 client-side inserted styles because of the :not([data-s]) part in the selector
        // Emotion 10 client-side inserted styles did not have data-s (but importantly did not have a space in their data-emotion attributes)
        // so checking for the space ensures that loading Emotion 11 after Emotion 10 has inserted some styles
        // will not result in the Emotion 10 styles being destroyed
        var dataEmotionAttribute = node.getAttribute('data-emotion');

        if (dataEmotionAttribute.indexOf(' ') === -1) {
          return;
        }

        document.head.appendChild(node);
        node.setAttribute('data-s', '');
      });
    }

    var stylisPlugins = options.stylisPlugins || defaultStylisPlugins;

    var inserted = {};
    var container;
    /* : Node */

    var nodesToHydrate = [];

    {
      container = options.container || document.head;
      Array.prototype.forEach.call( // this means we will ignore elements which don't have a space in them which
      // means that the style elements we're looking at are only Emotion 11 server-rendered style elements
      document.querySelectorAll("style[data-emotion^=\"" + key + " \"]"), function (node
      /*: HTMLStyleElement */
      ) {
        var attrib = node.getAttribute("data-emotion").split(' ');

        for (var i = 1; i < attrib.length; i++) {
          inserted[attrib[i]] = true;
        }

        nodesToHydrate.push(node);
      });
    }

    var _insert;
    /*: (
    selector: string,
    serialized: SerializedStyles,
    sheet: StyleSheet,
    shouldCache: boolean
    ) => string | void */


    var omnipresentPlugins = [compat, removeLabel];

    {
      var currentSheet;
      var finalizingPlugins = [stringify, rulesheet(function (rule) {
        currentSheet.insert(rule);
      })];
      var serializer = middleware(omnipresentPlugins.concat(stylisPlugins, finalizingPlugins));

      var stylis = function stylis(styles) {
        return serialize(compile(styles), serializer);
      };

      _insert = function
        /*: void */
      insert(selector
      /*: string */
      , serialized
      /*: SerializedStyles */
      , sheet
      /*: StyleSheet */
      , shouldCache
      /*: boolean */
      ) {
        currentSheet = sheet;

        stylis(selector ? selector + "{" + serialized.styles + "}" : serialized.styles);

        if (shouldCache) {
          cache.inserted[serialized.name] = true;
        }
      };
    }

    var cache
    /*: EmotionCache */
    = {
      key: key,
      sheet: new StyleSheet({
        key: key,
        container: container,
        nonce: options.nonce,
        speedy: options.speedy,
        prepend: options.prepend,
        insertionPoint: options.insertionPoint
      }),
      nonce: options.nonce,
      inserted: inserted,
      registered: {},
      insert: _insert
    };
    cache.sheet.hydrate(nodesToHydrate);
    return cache;
  };

  /* eslint-disable */
  // Inspired by https://github.com/garycourt/murmurhash-js
  // Ported from https://github.com/aappleby/smhasher/blob/61a0530f28277f2e850bfc39600ce61d02b518de/src/MurmurHash2.cpp#L37-L86
  function murmur2(str) {
    // 'm' and 'r' are mixing constants generated offline.
    // They're not really 'magic', they just happen to work well.
    // const m = 0x5bd1e995;
    // const r = 24;
    // Initialize the hash
    var h = 0; // Mix 4 bytes at a time into the hash

    var k,
        i = 0,
        len = str.length;

    for (; len >= 4; ++i, len -= 4) {
      k = str.charCodeAt(i) & 0xff | (str.charCodeAt(++i) & 0xff) << 8 | (str.charCodeAt(++i) & 0xff) << 16 | (str.charCodeAt(++i) & 0xff) << 24;
      k =
      /* Math.imul(k, m): */
      (k & 0xffff) * 0x5bd1e995 + ((k >>> 16) * 0xe995 << 16);
      k ^=
      /* k >>> r: */
      k >>> 24;
      h =
      /* Math.imul(k, m): */
      (k & 0xffff) * 0x5bd1e995 + ((k >>> 16) * 0xe995 << 16) ^
      /* Math.imul(h, m): */
      (h & 0xffff) * 0x5bd1e995 + ((h >>> 16) * 0xe995 << 16);
    } // Handle the last few bytes of the input array


    switch (len) {
      case 3:
        h ^= (str.charCodeAt(i + 2) & 0xff) << 16;

      case 2:
        h ^= (str.charCodeAt(i + 1) & 0xff) << 8;

      case 1:
        h ^= str.charCodeAt(i) & 0xff;
        h =
        /* Math.imul(h, m): */
        (h & 0xffff) * 0x5bd1e995 + ((h >>> 16) * 0xe995 << 16);
    } // Do a few final mixes of the hash to ensure the last few
    // bytes are well-incorporated.


    h ^= h >>> 13;
    h =
    /* Math.imul(h, m): */
    (h & 0xffff) * 0x5bd1e995 + ((h >>> 16) * 0xe995 << 16);
    return ((h ^ h >>> 15) >>> 0).toString(36);
  }

  var unitlessKeys = {
    animationIterationCount: 1,
    aspectRatio: 1,
    borderImageOutset: 1,
    borderImageSlice: 1,
    borderImageWidth: 1,
    boxFlex: 1,
    boxFlexGroup: 1,
    boxOrdinalGroup: 1,
    columnCount: 1,
    columns: 1,
    flex: 1,
    flexGrow: 1,
    flexPositive: 1,
    flexShrink: 1,
    flexNegative: 1,
    flexOrder: 1,
    gridRow: 1,
    gridRowEnd: 1,
    gridRowSpan: 1,
    gridRowStart: 1,
    gridColumn: 1,
    gridColumnEnd: 1,
    gridColumnSpan: 1,
    gridColumnStart: 1,
    msGridRow: 1,
    msGridRowSpan: 1,
    msGridColumn: 1,
    msGridColumnSpan: 1,
    fontWeight: 1,
    lineHeight: 1,
    opacity: 1,
    order: 1,
    orphans: 1,
    scale: 1,
    tabSize: 1,
    widows: 1,
    zIndex: 1,
    zoom: 1,
    WebkitLineClamp: 1,
    // SVG-related properties
    fillOpacity: 1,
    floodOpacity: 1,
    stopOpacity: 1,
    strokeDasharray: 1,
    strokeDashoffset: 1,
    strokeMiterlimit: 1,
    strokeOpacity: 1,
    strokeWidth: 1
  };

  var isDevelopment = false;

  var hyphenateRegex = /[A-Z]|^ms/g;
  var animationRegex = /_EMO_([^_]+?)_([^]*?)_EMO_/g;

  var isCustomProperty = function isCustomProperty(property) {
    return property.charCodeAt(1) === 45;
  };

  var isProcessableValue = function isProcessableValue(value) {
    return value != null && typeof value !== 'boolean';
  };

  var processStyleName = /* #__PURE__ */memoize(function (styleName) {
    return isCustomProperty(styleName) ? styleName : styleName.replace(hyphenateRegex, '-$&').toLowerCase();
  });

  var processStyleValue = function processStyleValue(key, value) {
    switch (key) {
      case 'animation':
      case 'animationName':
        {
          if (typeof value === 'string') {
            return value.replace(animationRegex, function (match, p1, p2) {
              cursor = {
                name: p1,
                styles: p2,
                next: cursor
              };
              return p1;
            });
          }
        }
    }

    if (unitlessKeys[key] !== 1 && !isCustomProperty(key) && typeof value === 'number' && value !== 0) {
      return value + 'px';
    }

    return value;
  };

  var noComponentSelectorMessage = 'Component selectors can only be used in conjunction with ' + '@emotion/babel-plugin, the swc Emotion plugin, or another Emotion-aware ' + 'compiler transform.';

  function handleInterpolation(mergedProps, registered, interpolation) {
    if (interpolation == null) {
      return '';
    }

    var componentSelector = interpolation;

    if (componentSelector.__emotion_styles !== undefined) {

      return componentSelector;
    }

    switch (typeof interpolation) {
      case 'boolean':
        {
          return '';
        }

      case 'object':
        {
          var keyframes = interpolation;

          if (keyframes.anim === 1) {
            cursor = {
              name: keyframes.name,
              styles: keyframes.styles,
              next: cursor
            };
            return keyframes.name;
          }

          var serializedStyles = interpolation;

          if (serializedStyles.styles !== undefined) {
            var next = serializedStyles.next;

            if (next !== undefined) {
              // not the most efficient thing ever but this is a pretty rare case
              // and there will be very few iterations of this generally
              while (next !== undefined) {
                cursor = {
                  name: next.name,
                  styles: next.styles,
                  next: cursor
                };
                next = next.next;
              }
            }

            var styles = serializedStyles.styles + ";";

            return styles;
          }

          return createStringFromObject(mergedProps, registered, interpolation);
        }

      case 'function':
        {
          if (mergedProps !== undefined) {
            var previousCursor = cursor;
            var result = interpolation(mergedProps);
            cursor = previousCursor;
            return handleInterpolation(mergedProps, registered, result);
          }

          break;
        }
    } // finalize string values (regular strings and functions interpolated into css calls)


    var asString = interpolation;

    if (registered == null) {
      return asString;
    }

    var cached = registered[asString];
    return cached !== undefined ? cached : asString;
  }

  function createStringFromObject(mergedProps, registered, obj) {
    var string = '';

    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        string += handleInterpolation(mergedProps, registered, obj[i]) + ";";
      }
    } else {
      for (var key in obj) {
        var value = obj[key];

        if (typeof value !== 'object') {
          var asString = value;

          if (registered != null && registered[asString] !== undefined) {
            string += key + "{" + registered[asString] + "}";
          } else if (isProcessableValue(asString)) {
            string += processStyleName(key) + ":" + processStyleValue(key, asString) + ";";
          }
        } else {
          if (key === 'NO_COMPONENT_SELECTOR' && isDevelopment) {
            throw new Error(noComponentSelectorMessage);
          }

          if (Array.isArray(value) && typeof value[0] === 'string' && (registered == null || registered[value[0]] === undefined)) {
            for (var _i = 0; _i < value.length; _i++) {
              if (isProcessableValue(value[_i])) {
                string += processStyleName(key) + ":" + processStyleValue(key, value[_i]) + ";";
              }
            }
          } else {
            var interpolated = handleInterpolation(mergedProps, registered, value);

            switch (key) {
              case 'animation':
              case 'animationName':
                {
                  string += processStyleName(key) + ":" + interpolated + ";";
                  break;
                }

              default:
                {

                  string += key + "{" + interpolated + "}";
                }
            }
          }
        }
      }
    }

    return string;
  }

  var labelPattern = /label:\s*([^\s;\n{]+)\s*(;|$)/g;
  // keyframes are stored on the SerializedStyles object as a linked list


  var cursor;
  function serializeStyles(args, registered, mergedProps) {
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && args[0].styles !== undefined) {
      return args[0];
    }

    var stringMode = true;
    var styles = '';
    cursor = undefined;
    var strings = args[0];

    if (strings == null || strings.raw === undefined) {
      stringMode = false;
      styles += handleInterpolation(mergedProps, registered, strings);
    } else {
      var asTemplateStringsArr = strings;

      styles += asTemplateStringsArr[0];
    } // we start at 1 since we've already handled the first arg


    for (var i = 1; i < args.length; i++) {
      styles += handleInterpolation(mergedProps, registered, args[i]);

      if (stringMode) {
        var templateStringsArr = strings;

        styles += templateStringsArr[i];
      }
    }


    labelPattern.lastIndex = 0;
    var identifierName = '';
    var match; // https://esbench.com/bench/5b809c2cf2949800a0f61fb5

    while ((match = labelPattern.exec(styles)) !== null) {
      identifierName += '-' + match[1];
    }

    var name = murmur2(styles) + identifierName;

    return {
      name: name,
      styles: styles,
      next: cursor
    };
  }

  var isBrowser = true;

  function getRegisteredStyles(registered, registeredStyles, classNames) {
    var rawClassName = '';
    classNames.split(' ').forEach(function (className) {
      if (registered[className] !== undefined) {
        registeredStyles.push(registered[className] + ";");
      } else {
        rawClassName += className + " ";
      }
    });
    return rawClassName;
  }
  var registerStyles = function registerStyles(cache, serialized, isStringTag) {
    var className = cache.key + "-" + serialized.name;

    if ( // we only need to add the styles to the registered cache if the
    // class name could be used further down
    // the tree but if it's a string tag, we know it won't
    // so we don't have to add it to registered cache.
    // this improves memory usage since we can avoid storing the whole style string
    (isStringTag === false || // we need to always store it if we're in compat mode and
    // in node since emotion-server relies on whether a style is in
    // the registered cache to know whether a style is global or not
    // also, note that this check will be dead code eliminated in the browser
    isBrowser === false ) && cache.registered[className] === undefined) {
      cache.registered[className] = serialized.styles;
    }
  };
  var insertStyles = function insertStyles(cache, serialized, isStringTag) {
    registerStyles(cache, serialized, isStringTag);
    var className = cache.key + "-" + serialized.name;

    if (cache.inserted[serialized.name] === undefined) {
      var current = serialized;

      do {
        cache.insert(serialized === current ? "." + className : '', current, cache.sheet, true);

        current = current.next;
      } while (current !== undefined);
    }
  };

  function insertWithoutScoping(cache, serialized) {
    if (cache.inserted[serialized.name] === undefined) {
      return cache.insert('', serialized, cache.sheet, true);
    }
  }

  function merge$1(registered, css, className) {
    var registeredStyles = [];
    var rawClassName = getRegisteredStyles(registered, registeredStyles, className);

    if (registeredStyles.length < 2) {
      return className;
    }

    return rawClassName + css(registeredStyles);
  }

  var createEmotion = function createEmotion(options) {
    var cache = createCache(options);

    cache.sheet.speedy = function (value) {

      this.isSpeedy = value;
    };

    cache.compat = true;

    var css = function css() {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      var serialized = serializeStyles(args, cache.registered, undefined);
      insertStyles(cache, serialized, false);
      return cache.key + "-" + serialized.name;
    };

    var keyframes = function keyframes() {
      for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        args[_key2] = arguments[_key2];
      }

      var serialized = serializeStyles(args, cache.registered);
      var animation = "animation-" + serialized.name;
      insertWithoutScoping(cache, {
        name: serialized.name,
        styles: "@keyframes " + animation + "{" + serialized.styles + "}"
      });
      return animation;
    };

    var injectGlobal = function injectGlobal() {
      for (var _len3 = arguments.length, args = new Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
        args[_key3] = arguments[_key3];
      }

      var serialized = serializeStyles(args, cache.registered);
      insertWithoutScoping(cache, serialized);
    };

    var cx = function cx() {
      for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
        args[_key4] = arguments[_key4];
      }

      return merge$1(cache.registered, css, classnames(args));
    };

    return {
      css: css,
      cx: cx,
      injectGlobal: injectGlobal,
      keyframes: keyframes,
      hydrate: function hydrate(ids) {
        ids.forEach(function (key) {
          cache.inserted[key] = true;
        });
      },
      flush: function flush() {
        cache.registered = {};
        cache.inserted = {};
        cache.sheet.flush();
      },
      sheet: cache.sheet,
      cache: cache,
      getRegisteredStyles: getRegisteredStyles.bind(null, cache.registered),
      merge: merge$1.bind(null, cache.registered, css)
    };
  };

  var classnames = function classnames(args) {
    var cls = '';

    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg == null) continue;
      var toAdd = void 0;

      switch (typeof arg) {
        case 'boolean':
          break;

        case 'object':
          {
            if (Array.isArray(arg)) {
              toAdd = classnames(arg);
            } else {
              toAdd = '';

              for (var k in arg) {
                if (arg[k] && k) {
                  toAdd && (toAdd += ' ');
                  toAdd += k;
                }
              }
            }

            break;
          }

        default:
          {
            toAdd = arg;
          }
      }

      if (toAdd) {
        cls && (cls += ' ');
        cls += toAdd;
      }
    }

    return cls;
  };

  var _createEmotion = createEmotion({
    key: 'css'
  }),
      injectGlobal = _createEmotion.injectGlobal;

  /**
   * A specialized version of `_.forEach` for arrays without support for
   * iteratee shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns `array`.
   */

  function arrayEach$1(array, iteratee) {
    var index = -1,
        length = array == null ? 0 : array.length;

    while (++index < length) {
      if (iteratee(array[index], index, array) === false) {
        break;
      }
    }
    return array;
  }

  var _arrayEach = arrayEach$1;

  /**
   * Creates a base function for methods like `_.forIn` and `_.forOwn`.
   *
   * @private
   * @param {boolean} [fromRight] Specify iterating from right to left.
   * @returns {Function} Returns the new base function.
   */

  function createBaseFor$1(fromRight) {
    return function(object, iteratee, keysFunc) {
      var index = -1,
          iterable = Object(object),
          props = keysFunc(object),
          length = props.length;

      while (length--) {
        var key = props[fromRight ? length : ++index];
        if (iteratee(iterable[key], key, iterable) === false) {
          break;
        }
      }
      return object;
    };
  }

  var _createBaseFor = createBaseFor$1;

  var createBaseFor = _createBaseFor;

  /**
   * The base implementation of `baseForOwn` which iterates over `object`
   * properties returned by `keysFunc` and invokes `iteratee` for each property.
   * Iteratee functions may exit iteration early by explicitly returning `false`.
   *
   * @private
   * @param {Object} object The object to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @param {Function} keysFunc The function to get the keys of `object`.
   * @returns {Object} Returns `object`.
   */
  var baseFor$1 = createBaseFor();

  var _baseFor = baseFor$1;

  /**
   * The base implementation of `_.times` without support for iteratee shorthands
   * or max array length checks.
   *
   * @private
   * @param {number} n The number of times to invoke `iteratee`.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns the array of results.
   */

  function baseTimes$1(n, iteratee) {
    var index = -1,
        result = Array(n);

    while (++index < n) {
      result[index] = iteratee(index);
    }
    return result;
  }

  var _baseTimes = baseTimes$1;

  /** Detect free variable `global` from Node.js. */

  var freeGlobal$1 = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

  var _freeGlobal = freeGlobal$1;

  var freeGlobal = _freeGlobal;

  /** Detect free variable `self`. */
  var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

  /** Used as a reference to the global object. */
  var root$2 = freeGlobal || freeSelf || Function('return this')();

  var _root = root$2;

  var root$1 = _root;

  /** Built-in value references. */
  var Symbol$4 = root$1.Symbol;

  var _Symbol = Symbol$4;

  var Symbol$3 = _Symbol;

  /** Used for built-in method references. */
  var objectProto$6 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$4 = objectProto$6.hasOwnProperty;

  /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
  var nativeObjectToString$1 = objectProto$6.toString;

  /** Built-in value references. */
  var symToStringTag$1 = Symbol$3 ? Symbol$3.toStringTag : undefined;

  /**
   * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the raw `toStringTag`.
   */
  function getRawTag$1(value) {
    var isOwn = hasOwnProperty$4.call(value, symToStringTag$1),
        tag = value[symToStringTag$1];

    try {
      value[symToStringTag$1] = undefined;
      var unmasked = true;
    } catch (e) {}

    var result = nativeObjectToString$1.call(value);
    if (unmasked) {
      if (isOwn) {
        value[symToStringTag$1] = tag;
      } else {
        delete value[symToStringTag$1];
      }
    }
    return result;
  }

  var _getRawTag = getRawTag$1;

  /** Used for built-in method references. */

  var objectProto$5 = Object.prototype;

  /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
  var nativeObjectToString = objectProto$5.toString;

  /**
   * Converts `value` to a string using `Object.prototype.toString`.
   *
   * @private
   * @param {*} value The value to convert.
   * @returns {string} Returns the converted string.
   */
  function objectToString$1(value) {
    return nativeObjectToString.call(value);
  }

  var _objectToString = objectToString$1;

  var Symbol$2 = _Symbol,
      getRawTag = _getRawTag,
      objectToString = _objectToString;

  /** `Object#toString` result references. */
  var nullTag = '[object Null]',
      undefinedTag = '[object Undefined]';

  /** Built-in value references. */
  var symToStringTag = Symbol$2 ? Symbol$2.toStringTag : undefined;

  /**
   * The base implementation of `getTag` without fallbacks for buggy environments.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the `toStringTag`.
   */
  function baseGetTag$6(value) {
    if (value == null) {
      return value === undefined ? undefinedTag : nullTag;
    }
    return (symToStringTag && symToStringTag in Object(value))
      ? getRawTag(value)
      : objectToString(value);
  }

  var _baseGetTag = baseGetTag$6;

  /**
   * Checks if `value` is object-like. A value is object-like if it's not `null`
   * and has a `typeof` result of "object".
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
   * @example
   *
   * _.isObjectLike({});
   * // => true
   *
   * _.isObjectLike([1, 2, 3]);
   * // => true
   *
   * _.isObjectLike(_.noop);
   * // => false
   *
   * _.isObjectLike(null);
   * // => false
   */

  function isObjectLike$6(value) {
    return value != null && typeof value == 'object';
  }

  var isObjectLike_1 = isObjectLike$6;

  var baseGetTag$5 = _baseGetTag,
      isObjectLike$5 = isObjectLike_1;

  /** `Object#toString` result references. */
  var argsTag$1 = '[object Arguments]';

  /**
   * The base implementation of `_.isArguments`.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an `arguments` object,
   */
  function baseIsArguments$1(value) {
    return isObjectLike$5(value) && baseGetTag$5(value) == argsTag$1;
  }

  var _baseIsArguments = baseIsArguments$1;

  var baseIsArguments = _baseIsArguments,
      isObjectLike$4 = isObjectLike_1;

  /** Used for built-in method references. */
  var objectProto$4 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$3 = objectProto$4.hasOwnProperty;

  /** Built-in value references. */
  var propertyIsEnumerable = objectProto$4.propertyIsEnumerable;

  /**
   * Checks if `value` is likely an `arguments` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an `arguments` object,
   *  else `false`.
   * @example
   *
   * _.isArguments(function() { return arguments; }());
   * // => true
   *
   * _.isArguments([1, 2, 3]);
   * // => false
   */
  var isArguments$1 = baseIsArguments(function() { return arguments; }()) ? baseIsArguments : function(value) {
    return isObjectLike$4(value) && hasOwnProperty$3.call(value, 'callee') &&
      !propertyIsEnumerable.call(value, 'callee');
  };

  var isArguments_1 = isArguments$1;

  /**
   * Checks if `value` is classified as an `Array` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an array, else `false`.
   * @example
   *
   * _.isArray([1, 2, 3]);
   * // => true
   *
   * _.isArray(document.body.children);
   * // => false
   *
   * _.isArray('abc');
   * // => false
   *
   * _.isArray(_.noop);
   * // => false
   */

  var isArray$5 = Array.isArray;

  var isArray_1 = isArray$5;

  var isBuffer$1 = {exports: {}};

  /**
   * This method returns `false`.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {boolean} Returns `false`.
   * @example
   *
   * _.times(2, _.stubFalse);
   * // => [false, false]
   */

  function stubFalse() {
    return false;
  }

  var stubFalse_1 = stubFalse;

  isBuffer$1.exports;

  (function (module, exports) {
  	var root = _root,
  	    stubFalse = stubFalse_1;

  	/** Detect free variable `exports`. */
  	var freeExports = exports && !exports.nodeType && exports;

  	/** Detect free variable `module`. */
  	var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  	/** Detect the popular CommonJS extension `module.exports`. */
  	var moduleExports = freeModule && freeModule.exports === freeExports;

  	/** Built-in value references. */
  	var Buffer = moduleExports ? root.Buffer : undefined;

  	/* Built-in method references for those with the same name as other `lodash` methods. */
  	var nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined;

  	/**
  	 * Checks if `value` is a buffer.
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 4.3.0
  	 * @category Lang
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
  	 * @example
  	 *
  	 * _.isBuffer(new Buffer(2));
  	 * // => true
  	 *
  	 * _.isBuffer(new Uint8Array(2));
  	 * // => false
  	 */
  	var isBuffer = nativeIsBuffer || stubFalse;

  	module.exports = isBuffer; 
  } (isBuffer$1, isBuffer$1.exports));

  var isBufferExports = isBuffer$1.exports;

  /** Used as references for various `Number` constants. */

  var MAX_SAFE_INTEGER$1 = 9007199254740991;

  /** Used to detect unsigned integer values. */
  var reIsUint = /^(?:0|[1-9]\d*)$/;

  /**
   * Checks if `value` is a valid array-like index.
   *
   * @private
   * @param {*} value The value to check.
   * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
   * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
   */
  function isIndex$1(value, length) {
    var type = typeof value;
    length = length == null ? MAX_SAFE_INTEGER$1 : length;

    return !!length &&
      (type == 'number' ||
        (type != 'symbol' && reIsUint.test(value))) &&
          (value > -1 && value % 1 == 0 && value < length);
  }

  var _isIndex = isIndex$1;

  /** Used as references for various `Number` constants. */

  var MAX_SAFE_INTEGER = 9007199254740991;

  /**
   * Checks if `value` is a valid array-like length.
   *
   * **Note:** This method is loosely based on
   * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
   * @example
   *
   * _.isLength(3);
   * // => true
   *
   * _.isLength(Number.MIN_VALUE);
   * // => false
   *
   * _.isLength(Infinity);
   * // => false
   *
   * _.isLength('3');
   * // => false
   */
  function isLength$2(value) {
    return typeof value == 'number' &&
      value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
  }

  var isLength_1 = isLength$2;

  var baseGetTag$4 = _baseGetTag,
      isLength$1 = isLength_1,
      isObjectLike$3 = isObjectLike_1;

  /** `Object#toString` result references. */
  var argsTag = '[object Arguments]',
      arrayTag = '[object Array]',
      boolTag = '[object Boolean]',
      dateTag = '[object Date]',
      errorTag = '[object Error]',
      funcTag$1 = '[object Function]',
      mapTag = '[object Map]',
      numberTag = '[object Number]',
      objectTag$1 = '[object Object]',
      regexpTag = '[object RegExp]',
      setTag = '[object Set]',
      stringTag$1 = '[object String]',
      weakMapTag = '[object WeakMap]';

  var arrayBufferTag = '[object ArrayBuffer]',
      dataViewTag = '[object DataView]',
      float32Tag = '[object Float32Array]',
      float64Tag = '[object Float64Array]',
      int8Tag = '[object Int8Array]',
      int16Tag = '[object Int16Array]',
      int32Tag = '[object Int32Array]',
      uint8Tag = '[object Uint8Array]',
      uint8ClampedTag = '[object Uint8ClampedArray]',
      uint16Tag = '[object Uint16Array]',
      uint32Tag = '[object Uint32Array]';

  /** Used to identify `toStringTag` values of typed arrays. */
  var typedArrayTags = {};
  typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
  typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
  typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
  typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
  typedArrayTags[uint32Tag] = true;
  typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
  typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
  typedArrayTags[dataViewTag] = typedArrayTags[dateTag] =
  typedArrayTags[errorTag] = typedArrayTags[funcTag$1] =
  typedArrayTags[mapTag] = typedArrayTags[numberTag] =
  typedArrayTags[objectTag$1] = typedArrayTags[regexpTag] =
  typedArrayTags[setTag] = typedArrayTags[stringTag$1] =
  typedArrayTags[weakMapTag] = false;

  /**
   * The base implementation of `_.isTypedArray` without Node.js optimizations.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
   */
  function baseIsTypedArray$1(value) {
    return isObjectLike$3(value) &&
      isLength$1(value.length) && !!typedArrayTags[baseGetTag$4(value)];
  }

  var _baseIsTypedArray = baseIsTypedArray$1;

  /**
   * The base implementation of `_.unary` without support for storing metadata.
   *
   * @private
   * @param {Function} func The function to cap arguments for.
   * @returns {Function} Returns the new capped function.
   */

  function baseUnary$1(func) {
    return function(value) {
      return func(value);
    };
  }

  var _baseUnary = baseUnary$1;

  var _nodeUtil = {exports: {}};

  _nodeUtil.exports;

  (function (module, exports) {
  	var freeGlobal = _freeGlobal;

  	/** Detect free variable `exports`. */
  	var freeExports = exports && !exports.nodeType && exports;

  	/** Detect free variable `module`. */
  	var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  	/** Detect the popular CommonJS extension `module.exports`. */
  	var moduleExports = freeModule && freeModule.exports === freeExports;

  	/** Detect free variable `process` from Node.js. */
  	var freeProcess = moduleExports && freeGlobal.process;

  	/** Used to access faster Node.js helpers. */
  	var nodeUtil = (function() {
  	  try {
  	    // Use `util.types` for Node.js 10+.
  	    var types = freeModule && freeModule.require && freeModule.require('util').types;

  	    if (types) {
  	      return types;
  	    }

  	    // Legacy `process.binding('util')` for Node.js < 10.
  	    return freeProcess && freeProcess.binding && freeProcess.binding('util');
  	  } catch (e) {}
  	}());

  	module.exports = nodeUtil; 
  } (_nodeUtil, _nodeUtil.exports));

  var _nodeUtilExports = _nodeUtil.exports;

  var baseIsTypedArray = _baseIsTypedArray,
      baseUnary = _baseUnary,
      nodeUtil = _nodeUtilExports;

  /* Node.js helper references. */
  var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;

  /**
   * Checks if `value` is classified as a typed array.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
   * @example
   *
   * _.isTypedArray(new Uint8Array);
   * // => true
   *
   * _.isTypedArray([]);
   * // => false
   */
  var isTypedArray$1 = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;

  var isTypedArray_1 = isTypedArray$1;

  var baseTimes = _baseTimes,
      isArguments = isArguments_1,
      isArray$4 = isArray_1,
      isBuffer = isBufferExports,
      isIndex = _isIndex,
      isTypedArray = isTypedArray_1;

  /** Used for built-in method references. */
  var objectProto$3 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$2 = objectProto$3.hasOwnProperty;

  /**
   * Creates an array of the enumerable property names of the array-like `value`.
   *
   * @private
   * @param {*} value The value to query.
   * @param {boolean} inherited Specify returning inherited property names.
   * @returns {Array} Returns the array of property names.
   */
  function arrayLikeKeys$1(value, inherited) {
    var isArr = isArray$4(value),
        isArg = !isArr && isArguments(value),
        isBuff = !isArr && !isArg && isBuffer(value),
        isType = !isArr && !isArg && !isBuff && isTypedArray(value),
        skipIndexes = isArr || isArg || isBuff || isType,
        result = skipIndexes ? baseTimes(value.length, String) : [],
        length = result.length;

    for (var key in value) {
      if ((inherited || hasOwnProperty$2.call(value, key)) &&
          !(skipIndexes && (
             // Safari 9 has enumerable `arguments.length` in strict mode.
             key == 'length' ||
             // Node.js 0.10 has enumerable non-index properties on buffers.
             (isBuff && (key == 'offset' || key == 'parent')) ||
             // PhantomJS 2 has enumerable non-index properties on typed arrays.
             (isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset')) ||
             // Skip index properties.
             isIndex(key, length)
          ))) {
        result.push(key);
      }
    }
    return result;
  }

  var _arrayLikeKeys = arrayLikeKeys$1;

  /** Used for built-in method references. */

  var objectProto$2 = Object.prototype;

  /**
   * Checks if `value` is likely a prototype object.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
   */
  function isPrototype$1(value) {
    var Ctor = value && value.constructor,
        proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto$2;

    return value === proto;
  }

  var _isPrototype = isPrototype$1;

  /**
   * Creates a unary function that invokes `func` with its argument transformed.
   *
   * @private
   * @param {Function} func The function to wrap.
   * @param {Function} transform The argument transform.
   * @returns {Function} Returns the new function.
   */

  function overArg$2(func, transform) {
    return function(arg) {
      return func(transform(arg));
    };
  }

  var _overArg = overArg$2;

  var overArg$1 = _overArg;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeKeys$1 = overArg$1(Object.keys, Object);

  var _nativeKeys = nativeKeys$1;

  var isPrototype = _isPrototype,
      nativeKeys = _nativeKeys;

  /** Used for built-in method references. */
  var objectProto$1 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$1 = objectProto$1.hasOwnProperty;

  /**
   * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   */
  function baseKeys$1(object) {
    if (!isPrototype(object)) {
      return nativeKeys(object);
    }
    var result = [];
    for (var key in Object(object)) {
      if (hasOwnProperty$1.call(object, key) && key != 'constructor') {
        result.push(key);
      }
    }
    return result;
  }

  var _baseKeys = baseKeys$1;

  /**
   * Checks if `value` is the
   * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
   * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an object, else `false`.
   * @example
   *
   * _.isObject({});
   * // => true
   *
   * _.isObject([1, 2, 3]);
   * // => true
   *
   * _.isObject(_.noop);
   * // => true
   *
   * _.isObject(null);
   * // => false
   */

  function isObject$1(value) {
    var type = typeof value;
    return value != null && (type == 'object' || type == 'function');
  }

  var isObject_1 = isObject$1;

  var baseGetTag$3 = _baseGetTag,
      isObject = isObject_1;

  /** `Object#toString` result references. */
  var asyncTag = '[object AsyncFunction]',
      funcTag = '[object Function]',
      genTag = '[object GeneratorFunction]',
      proxyTag = '[object Proxy]';

  /**
   * Checks if `value` is classified as a `Function` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a function, else `false`.
   * @example
   *
   * _.isFunction(_);
   * // => true
   *
   * _.isFunction(/abc/);
   * // => false
   */
  function isFunction$1(value) {
    if (!isObject(value)) {
      return false;
    }
    // The use of `Object#toString` avoids issues with the `typeof` operator
    // in Safari 9 which returns 'object' for typed arrays and other constructors.
    var tag = baseGetTag$3(value);
    return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
  }

  var isFunction_1 = isFunction$1;

  var isFunction$2 = /*@__PURE__*/getDefaultExportFromCjs(isFunction_1);

  var isFunction = isFunction_1,
      isLength = isLength_1;

  /**
   * Checks if `value` is array-like. A value is considered array-like if it's
   * not a function and has a `value.length` that's an integer greater than or
   * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
   * @example
   *
   * _.isArrayLike([1, 2, 3]);
   * // => true
   *
   * _.isArrayLike(document.body.children);
   * // => true
   *
   * _.isArrayLike('abc');
   * // => true
   *
   * _.isArrayLike(_.noop);
   * // => false
   */
  function isArrayLike$2(value) {
    return value != null && isLength(value.length) && !isFunction(value);
  }

  var isArrayLike_1 = isArrayLike$2;

  var arrayLikeKeys = _arrayLikeKeys,
      baseKeys = _baseKeys,
      isArrayLike$1 = isArrayLike_1;

  /**
   * Creates an array of the own enumerable property names of `object`.
   *
   * **Note:** Non-object values are coerced to objects. See the
   * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
   * for more details.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Object
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   *   this.b = 2;
   * }
   *
   * Foo.prototype.c = 3;
   *
   * _.keys(new Foo);
   * // => ['a', 'b'] (iteration order is not guaranteed)
   *
   * _.keys('hi');
   * // => ['0', '1']
   */
  function keys$1(object) {
    return isArrayLike$1(object) ? arrayLikeKeys(object) : baseKeys(object);
  }

  var keys_1 = keys$1;

  var baseFor = _baseFor,
      keys = keys_1;

  /**
   * The base implementation of `_.forOwn` without support for iteratee shorthands.
   *
   * @private
   * @param {Object} object The object to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Object} Returns `object`.
   */
  function baseForOwn$1(object, iteratee) {
    return object && baseFor(object, iteratee, keys);
  }

  var _baseForOwn = baseForOwn$1;

  var isArrayLike = isArrayLike_1;

  /**
   * Creates a `baseEach` or `baseEachRight` function.
   *
   * @private
   * @param {Function} eachFunc The function to iterate over a collection.
   * @param {boolean} [fromRight] Specify iterating from right to left.
   * @returns {Function} Returns the new base function.
   */
  function createBaseEach$1(eachFunc, fromRight) {
    return function(collection, iteratee) {
      if (collection == null) {
        return collection;
      }
      if (!isArrayLike(collection)) {
        return eachFunc(collection, iteratee);
      }
      var length = collection.length,
          index = fromRight ? length : -1,
          iterable = Object(collection);

      while ((fromRight ? index-- : ++index < length)) {
        if (iteratee(iterable[index], index, iterable) === false) {
          break;
        }
      }
      return collection;
    };
  }

  var _createBaseEach = createBaseEach$1;

  var baseForOwn = _baseForOwn,
      createBaseEach = _createBaseEach;

  /**
   * The base implementation of `_.forEach` without support for iteratee shorthands.
   *
   * @private
   * @param {Array|Object} collection The collection to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array|Object} Returns `collection`.
   */
  var baseEach$1 = createBaseEach(baseForOwn);

  var _baseEach = baseEach$1;

  /**
   * This method returns the first argument it receives.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Util
   * @param {*} value Any value.
   * @returns {*} Returns `value`.
   * @example
   *
   * var object = { 'a': 1 };
   *
   * console.log(_.identity(object) === object);
   * // => true
   */

  function identity$1(value) {
    return value;
  }

  var identity_1 = identity$1;

  var identity = identity_1;

  /**
   * Casts `value` to `identity` if it's not a function.
   *
   * @private
   * @param {*} value The value to inspect.
   * @returns {Function} Returns cast function.
   */
  function castFunction$1(value) {
    return typeof value == 'function' ? value : identity;
  }

  var _castFunction = castFunction$1;

  var arrayEach = _arrayEach,
      baseEach = _baseEach,
      castFunction = _castFunction,
      isArray$3 = isArray_1;

  /**
   * Iterates over elements of `collection` and invokes `iteratee` for each element.
   * The iteratee is invoked with three arguments: (value, index|key, collection).
   * Iteratee functions may exit iteration early by explicitly returning `false`.
   *
   * **Note:** As with other "Collections" methods, objects with a "length"
   * property are iterated like arrays. To avoid this behavior use `_.forIn`
   * or `_.forOwn` for object iteration.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @alias each
   * @category Collection
   * @param {Array|Object} collection The collection to iterate over.
   * @param {Function} [iteratee=_.identity] The function invoked per iteration.
   * @returns {Array|Object} Returns `collection`.
   * @see _.forEachRight
   * @example
   *
   * _.forEach([1, 2], function(value) {
   *   console.log(value);
   * });
   * // => Logs `1` then `2`.
   *
   * _.forEach({ 'a': 1, 'b': 2 }, function(value, key) {
   *   console.log(key);
   * });
   * // => Logs 'a' then 'b' (iteration order is not guaranteed).
   */
  function forEach(collection, iteratee) {
    var func = isArray$3(collection) ? arrayEach : baseEach;
    return func(collection, castFunction(iteratee));
  }

  var forEach_1 = forEach;

  var forEach$1 = /*@__PURE__*/getDefaultExportFromCjs(forEach_1);

  var overArg = _overArg;

  /** Built-in value references. */
  var getPrototype$1 = overArg(Object.getPrototypeOf, Object);

  var _getPrototype = getPrototype$1;

  var baseGetTag$2 = _baseGetTag,
      getPrototype = _getPrototype,
      isObjectLike$2 = isObjectLike_1;

  /** `Object#toString` result references. */
  var objectTag = '[object Object]';

  /** Used for built-in method references. */
  var funcProto = Function.prototype,
      objectProto = Object.prototype;

  /** Used to resolve the decompiled source of functions. */
  var funcToString = funcProto.toString;

  /** Used to check objects for own properties. */
  var hasOwnProperty = objectProto.hasOwnProperty;

  /** Used to infer the `Object` constructor. */
  var objectCtorString = funcToString.call(Object);

  /**
   * Checks if `value` is a plain object, that is, an object created by the
   * `Object` constructor or one with a `[[Prototype]]` of `null`.
   *
   * @static
   * @memberOf _
   * @since 0.8.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   * }
   *
   * _.isPlainObject(new Foo);
   * // => false
   *
   * _.isPlainObject([1, 2, 3]);
   * // => false
   *
   * _.isPlainObject({ 'x': 0, 'y': 0 });
   * // => true
   *
   * _.isPlainObject(Object.create(null));
   * // => true
   */
  function isPlainObject(value) {
    if (!isObjectLike$2(value) || baseGetTag$2(value) != objectTag) {
      return false;
    }
    var proto = getPrototype(value);
    if (proto === null) {
      return true;
    }
    var Ctor = hasOwnProperty.call(proto, 'constructor') && proto.constructor;
    return typeof Ctor == 'function' && Ctor instanceof Ctor &&
      funcToString.call(Ctor) == objectCtorString;
  }

  var isPlainObject_1 = isPlainObject;

  var isPlainObject$1 = /*@__PURE__*/getDefaultExportFromCjs(isPlainObject_1);

  /**
   * A specialized version of `_.reduce` for arrays without support for
   * iteratee shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @param {*} [accumulator] The initial value.
   * @param {boolean} [initAccum] Specify using the first element of `array` as
   *  the initial value.
   * @returns {*} Returns the accumulated value.
   */

  function arrayReduce$1(array, iteratee, accumulator, initAccum) {
    var index = -1,
        length = array == null ? 0 : array.length;

    if (initAccum && length) {
      accumulator = array[++index];
    }
    while (++index < length) {
      accumulator = iteratee(accumulator, array[index], index, array);
    }
    return accumulator;
  }

  var _arrayReduce = arrayReduce$1;

  /**
   * The base implementation of `_.propertyOf` without support for deep paths.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Function} Returns the new accessor function.
   */

  function basePropertyOf$1(object) {
    return function(key) {
      return object == null ? undefined : object[key];
    };
  }

  var _basePropertyOf = basePropertyOf$1;

  var basePropertyOf = _basePropertyOf;

  /** Used to map Latin Unicode letters to basic Latin letters. */
  var deburredLetters = {
    // Latin-1 Supplement block.
    '\xc0': 'A',  '\xc1': 'A', '\xc2': 'A', '\xc3': 'A', '\xc4': 'A', '\xc5': 'A',
    '\xe0': 'a',  '\xe1': 'a', '\xe2': 'a', '\xe3': 'a', '\xe4': 'a', '\xe5': 'a',
    '\xc7': 'C',  '\xe7': 'c',
    '\xd0': 'D',  '\xf0': 'd',
    '\xc8': 'E',  '\xc9': 'E', '\xca': 'E', '\xcb': 'E',
    '\xe8': 'e',  '\xe9': 'e', '\xea': 'e', '\xeb': 'e',
    '\xcc': 'I',  '\xcd': 'I', '\xce': 'I', '\xcf': 'I',
    '\xec': 'i',  '\xed': 'i', '\xee': 'i', '\xef': 'i',
    '\xd1': 'N',  '\xf1': 'n',
    '\xd2': 'O',  '\xd3': 'O', '\xd4': 'O', '\xd5': 'O', '\xd6': 'O', '\xd8': 'O',
    '\xf2': 'o',  '\xf3': 'o', '\xf4': 'o', '\xf5': 'o', '\xf6': 'o', '\xf8': 'o',
    '\xd9': 'U',  '\xda': 'U', '\xdb': 'U', '\xdc': 'U',
    '\xf9': 'u',  '\xfa': 'u', '\xfb': 'u', '\xfc': 'u',
    '\xdd': 'Y',  '\xfd': 'y', '\xff': 'y',
    '\xc6': 'Ae', '\xe6': 'ae',
    '\xde': 'Th', '\xfe': 'th',
    '\xdf': 'ss',
    // Latin Extended-A block.
    '\u0100': 'A',  '\u0102': 'A', '\u0104': 'A',
    '\u0101': 'a',  '\u0103': 'a', '\u0105': 'a',
    '\u0106': 'C',  '\u0108': 'C', '\u010a': 'C', '\u010c': 'C',
    '\u0107': 'c',  '\u0109': 'c', '\u010b': 'c', '\u010d': 'c',
    '\u010e': 'D',  '\u0110': 'D', '\u010f': 'd', '\u0111': 'd',
    '\u0112': 'E',  '\u0114': 'E', '\u0116': 'E', '\u0118': 'E', '\u011a': 'E',
    '\u0113': 'e',  '\u0115': 'e', '\u0117': 'e', '\u0119': 'e', '\u011b': 'e',
    '\u011c': 'G',  '\u011e': 'G', '\u0120': 'G', '\u0122': 'G',
    '\u011d': 'g',  '\u011f': 'g', '\u0121': 'g', '\u0123': 'g',
    '\u0124': 'H',  '\u0126': 'H', '\u0125': 'h', '\u0127': 'h',
    '\u0128': 'I',  '\u012a': 'I', '\u012c': 'I', '\u012e': 'I', '\u0130': 'I',
    '\u0129': 'i',  '\u012b': 'i', '\u012d': 'i', '\u012f': 'i', '\u0131': 'i',
    '\u0134': 'J',  '\u0135': 'j',
    '\u0136': 'K',  '\u0137': 'k', '\u0138': 'k',
    '\u0139': 'L',  '\u013b': 'L', '\u013d': 'L', '\u013f': 'L', '\u0141': 'L',
    '\u013a': 'l',  '\u013c': 'l', '\u013e': 'l', '\u0140': 'l', '\u0142': 'l',
    '\u0143': 'N',  '\u0145': 'N', '\u0147': 'N', '\u014a': 'N',
    '\u0144': 'n',  '\u0146': 'n', '\u0148': 'n', '\u014b': 'n',
    '\u014c': 'O',  '\u014e': 'O', '\u0150': 'O',
    '\u014d': 'o',  '\u014f': 'o', '\u0151': 'o',
    '\u0154': 'R',  '\u0156': 'R', '\u0158': 'R',
    '\u0155': 'r',  '\u0157': 'r', '\u0159': 'r',
    '\u015a': 'S',  '\u015c': 'S', '\u015e': 'S', '\u0160': 'S',
    '\u015b': 's',  '\u015d': 's', '\u015f': 's', '\u0161': 's',
    '\u0162': 'T',  '\u0164': 'T', '\u0166': 'T',
    '\u0163': 't',  '\u0165': 't', '\u0167': 't',
    '\u0168': 'U',  '\u016a': 'U', '\u016c': 'U', '\u016e': 'U', '\u0170': 'U', '\u0172': 'U',
    '\u0169': 'u',  '\u016b': 'u', '\u016d': 'u', '\u016f': 'u', '\u0171': 'u', '\u0173': 'u',
    '\u0174': 'W',  '\u0175': 'w',
    '\u0176': 'Y',  '\u0177': 'y', '\u0178': 'Y',
    '\u0179': 'Z',  '\u017b': 'Z', '\u017d': 'Z',
    '\u017a': 'z',  '\u017c': 'z', '\u017e': 'z',
    '\u0132': 'IJ', '\u0133': 'ij',
    '\u0152': 'Oe', '\u0153': 'oe',
    '\u0149': "'n", '\u017f': 's'
  };

  /**
   * Used by `_.deburr` to convert Latin-1 Supplement and Latin Extended-A
   * letters to basic Latin letters.
   *
   * @private
   * @param {string} letter The matched letter to deburr.
   * @returns {string} Returns the deburred letter.
   */
  var deburrLetter$1 = basePropertyOf(deburredLetters);

  var _deburrLetter = deburrLetter$1;

  /**
   * A specialized version of `_.map` for arrays without support for iteratee
   * shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns the new mapped array.
   */

  function arrayMap$1(array, iteratee) {
    var index = -1,
        length = array == null ? 0 : array.length,
        result = Array(length);

    while (++index < length) {
      result[index] = iteratee(array[index], index, array);
    }
    return result;
  }

  var _arrayMap = arrayMap$1;

  var baseGetTag$1 = _baseGetTag,
      isObjectLike$1 = isObjectLike_1;

  /** `Object#toString` result references. */
  var symbolTag = '[object Symbol]';

  /**
   * Checks if `value` is classified as a `Symbol` primitive or object.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
   * @example
   *
   * _.isSymbol(Symbol.iterator);
   * // => true
   *
   * _.isSymbol('abc');
   * // => false
   */
  function isSymbol$1(value) {
    return typeof value == 'symbol' ||
      (isObjectLike$1(value) && baseGetTag$1(value) == symbolTag);
  }

  var isSymbol_1 = isSymbol$1;

  var Symbol$1 = _Symbol,
      arrayMap = _arrayMap,
      isArray$2 = isArray_1,
      isSymbol = isSymbol_1;

  /** Used as references for various `Number` constants. */
  var INFINITY = 1 / 0;

  /** Used to convert symbols to primitives and strings. */
  var symbolProto = Symbol$1 ? Symbol$1.prototype : undefined,
      symbolToString = symbolProto ? symbolProto.toString : undefined;

  /**
   * The base implementation of `_.toString` which doesn't convert nullish
   * values to empty strings.
   *
   * @private
   * @param {*} value The value to process.
   * @returns {string} Returns the string.
   */
  function baseToString$1(value) {
    // Exit early for strings to avoid a performance hit in some environments.
    if (typeof value == 'string') {
      return value;
    }
    if (isArray$2(value)) {
      // Recursively convert values (susceptible to call stack limits).
      return arrayMap(value, baseToString$1) + '';
    }
    if (isSymbol(value)) {
      return symbolToString ? symbolToString.call(value) : '';
    }
    var result = (value + '');
    return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
  }

  var _baseToString = baseToString$1;

  var baseToString = _baseToString;

  /**
   * Converts `value` to a string. An empty string is returned for `null`
   * and `undefined` values. The sign of `-0` is preserved.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to convert.
   * @returns {string} Returns the converted string.
   * @example
   *
   * _.toString(null);
   * // => ''
   *
   * _.toString(-0);
   * // => '-0'
   *
   * _.toString([1, 2, 3]);
   * // => '1,2,3'
   */
  function toString$5(value) {
    return value == null ? '' : baseToString(value);
  }

  var toString_1 = toString$5;

  var deburrLetter = _deburrLetter,
      toString$4 = toString_1;

  /** Used to match Latin Unicode letters (excluding mathematical operators). */
  var reLatin = /[\xc0-\xd6\xd8-\xf6\xf8-\xff\u0100-\u017f]/g;

  /** Used to compose unicode character classes. */
  var rsComboMarksRange$1 = '\\u0300-\\u036f',
      reComboHalfMarksRange$1 = '\\ufe20-\\ufe2f',
      rsComboSymbolsRange$1 = '\\u20d0-\\u20ff',
      rsComboRange$1 = rsComboMarksRange$1 + reComboHalfMarksRange$1 + rsComboSymbolsRange$1;

  /** Used to compose unicode capture groups. */
  var rsCombo$1 = '[' + rsComboRange$1 + ']';

  /**
   * Used to match [combining diacritical marks](https://en.wikipedia.org/wiki/Combining_Diacritical_Marks) and
   * [combining diacritical marks for symbols](https://en.wikipedia.org/wiki/Combining_Diacritical_Marks_for_Symbols).
   */
  var reComboMark = RegExp(rsCombo$1, 'g');

  /**
   * Deburrs `string` by converting
   * [Latin-1 Supplement](https://en.wikipedia.org/wiki/Latin-1_Supplement_(Unicode_block)#Character_table)
   * and [Latin Extended-A](https://en.wikipedia.org/wiki/Latin_Extended-A)
   * letters to basic Latin letters and removing
   * [combining diacritical marks](https://en.wikipedia.org/wiki/Combining_Diacritical_Marks).
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category String
   * @param {string} [string=''] The string to deburr.
   * @returns {string} Returns the deburred string.
   * @example
   *
   * _.deburr('déjà vu');
   * // => 'deja vu'
   */
  function deburr$1(string) {
    string = toString$4(string);
    return string && string.replace(reLatin, deburrLetter).replace(reComboMark, '');
  }

  var deburr_1 = deburr$1;

  /** Used to match words composed of alphanumeric characters. */

  var reAsciiWord = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g;

  /**
   * Splits an ASCII `string` into an array of its words.
   *
   * @private
   * @param {string} The string to inspect.
   * @returns {Array} Returns the words of `string`.
   */
  function asciiWords$1(string) {
    return string.match(reAsciiWord) || [];
  }

  var _asciiWords = asciiWords$1;

  /** Used to detect strings that need a more robust regexp to match words. */

  var reHasUnicodeWord = /[a-z][A-Z]|[A-Z]{2}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;

  /**
   * Checks if `string` contains a word composed of Unicode symbols.
   *
   * @private
   * @param {string} string The string to inspect.
   * @returns {boolean} Returns `true` if a word is found, else `false`.
   */
  function hasUnicodeWord$1(string) {
    return reHasUnicodeWord.test(string);
  }

  var _hasUnicodeWord = hasUnicodeWord$1;

  /** Used to compose unicode character classes. */

  var rsAstralRange = '\\ud800-\\udfff',
      rsComboMarksRange = '\\u0300-\\u036f',
      reComboHalfMarksRange = '\\ufe20-\\ufe2f',
      rsComboSymbolsRange = '\\u20d0-\\u20ff',
      rsComboRange = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange,
      rsDingbatRange = '\\u2700-\\u27bf',
      rsLowerRange = 'a-z\\xdf-\\xf6\\xf8-\\xff',
      rsMathOpRange = '\\xac\\xb1\\xd7\\xf7',
      rsNonCharRange = '\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf',
      rsPunctuationRange = '\\u2000-\\u206f',
      rsSpaceRange = ' \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000',
      rsUpperRange = 'A-Z\\xc0-\\xd6\\xd8-\\xde',
      rsVarRange = '\\ufe0e\\ufe0f',
      rsBreakRange = rsMathOpRange + rsNonCharRange + rsPunctuationRange + rsSpaceRange;

  /** Used to compose unicode capture groups. */
  var rsApos$1 = "['\u2019]",
      rsBreak = '[' + rsBreakRange + ']',
      rsCombo = '[' + rsComboRange + ']',
      rsDigits = '\\d+',
      rsDingbat = '[' + rsDingbatRange + ']',
      rsLower = '[' + rsLowerRange + ']',
      rsMisc = '[^' + rsAstralRange + rsBreakRange + rsDigits + rsDingbatRange + rsLowerRange + rsUpperRange + ']',
      rsFitz = '\\ud83c[\\udffb-\\udfff]',
      rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')',
      rsNonAstral = '[^' + rsAstralRange + ']',
      rsRegional = '(?:\\ud83c[\\udde6-\\uddff]){2}',
      rsSurrPair = '[\\ud800-\\udbff][\\udc00-\\udfff]',
      rsUpper = '[' + rsUpperRange + ']',
      rsZWJ = '\\u200d';

  /** Used to compose unicode regexes. */
  var rsMiscLower = '(?:' + rsLower + '|' + rsMisc + ')',
      rsMiscUpper = '(?:' + rsUpper + '|' + rsMisc + ')',
      rsOptContrLower = '(?:' + rsApos$1 + '(?:d|ll|m|re|s|t|ve))?',
      rsOptContrUpper = '(?:' + rsApos$1 + '(?:D|LL|M|RE|S|T|VE))?',
      reOptMod = rsModifier + '?',
      rsOptVar = '[' + rsVarRange + ']?',
      rsOptJoin = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*',
      rsOrdLower = '\\d*(?:1st|2nd|3rd|(?![123])\\dth)(?=\\b|[A-Z_])',
      rsOrdUpper = '\\d*(?:1ST|2ND|3RD|(?![123])\\dTH)(?=\\b|[a-z_])',
      rsSeq = rsOptVar + reOptMod + rsOptJoin,
      rsEmoji = '(?:' + [rsDingbat, rsRegional, rsSurrPair].join('|') + ')' + rsSeq;

  /** Used to match complex or compound words. */
  var reUnicodeWord = RegExp([
    rsUpper + '?' + rsLower + '+' + rsOptContrLower + '(?=' + [rsBreak, rsUpper, '$'].join('|') + ')',
    rsMiscUpper + '+' + rsOptContrUpper + '(?=' + [rsBreak, rsUpper + rsMiscLower, '$'].join('|') + ')',
    rsUpper + '?' + rsMiscLower + '+' + rsOptContrLower,
    rsUpper + '+' + rsOptContrUpper,
    rsOrdUpper,
    rsOrdLower,
    rsDigits,
    rsEmoji
  ].join('|'), 'g');

  /**
   * Splits a Unicode `string` into an array of its words.
   *
   * @private
   * @param {string} The string to inspect.
   * @returns {Array} Returns the words of `string`.
   */
  function unicodeWords$1(string) {
    return string.match(reUnicodeWord) || [];
  }

  var _unicodeWords = unicodeWords$1;

  var asciiWords = _asciiWords,
      hasUnicodeWord = _hasUnicodeWord,
      toString$3 = toString_1,
      unicodeWords = _unicodeWords;

  /**
   * Splits `string` into an array of its words.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category String
   * @param {string} [string=''] The string to inspect.
   * @param {RegExp|string} [pattern] The pattern to match words.
   * @param- {Object} [guard] Enables use as an iteratee for methods like `_.map`.
   * @returns {Array} Returns the words of `string`.
   * @example
   *
   * _.words('fred, barney, & pebbles');
   * // => ['fred', 'barney', 'pebbles']
   *
   * _.words('fred, barney, & pebbles', /[^, ]+/g);
   * // => ['fred', 'barney', '&', 'pebbles']
   */
  function words$1(string, pattern, guard) {
    string = toString$3(string);
    pattern = guard ? undefined : pattern;

    if (pattern === undefined) {
      return hasUnicodeWord(string) ? unicodeWords(string) : asciiWords(string);
    }
    return string.match(pattern) || [];
  }

  var words_1 = words$1;

  var arrayReduce = _arrayReduce,
      deburr = deburr_1,
      words = words_1;

  /** Used to compose unicode capture groups. */
  var rsApos = "['\u2019]";

  /** Used to match apostrophes. */
  var reApos = RegExp(rsApos, 'g');

  /**
   * Creates a function like `_.camelCase`.
   *
   * @private
   * @param {Function} callback The function to combine each word.
   * @returns {Function} Returns the new compounder function.
   */
  function createCompounder$1(callback) {
    return function(string) {
      return arrayReduce(words(deburr(string).replace(reApos, '')), callback, '');
    };
  }

  var _createCompounder = createCompounder$1;

  var createCompounder = _createCompounder;

  /**
   * Converts `string` to
   * [kebab case](https://en.wikipedia.org/wiki/Letter_case#Special_case_styles).
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category String
   * @param {string} [string=''] The string to convert.
   * @returns {string} Returns the kebab cased string.
   * @example
   *
   * _.kebabCase('Foo Bar');
   * // => 'foo-bar'
   *
   * _.kebabCase('fooBar');
   * // => 'foo-bar'
   *
   * _.kebabCase('__FOO_BAR__');
   * // => 'foo-bar'
   */
  var kebabCase = createCompounder(function(result, word, index) {
    return result + (index ? '-' : '') + word.toLowerCase();
  });

  var kebabCase_1 = kebabCase;

  var kebabCase$1 = /*@__PURE__*/getDefaultExportFromCjs(kebabCase_1);

  var AbstractEvent = /*#__PURE__*/function () {
    function AbstractEvent() {
      var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      _classCallCheck(this, AbstractEvent);
      _defineProperty(this, "data", null);
      _defineProperty(this, "canceled", false);
      this.data = data;
    }
    return _createClass(AbstractEvent, [{
      key: "type",
      get: function get() {
        return this.constructor.type;
      }
    }, {
      key: "cancelable",
      get: function get() {
        return this.constructor.cancelable;
      }
    }, {
      key: "cancel",
      value: function cancel() {
        if (this.cancelable) {
          this.canceled = true;
        }
      }
    }]);
  }();
  _defineProperty(AbstractEvent, "type", 'event');
  _defineProperty(AbstractEvent, "cancelable", false);

  var SensorEvent = /*#__PURE__*/function (_AbstractEvent) {
    function SensorEvent() {
      _classCallCheck(this, SensorEvent);
      return _callSuper(this, SensorEvent, arguments);
    }
    _inherits(SensorEvent, _AbstractEvent);
    return _createClass(SensorEvent, [{
      key: "pageX",
      get: function get() {
        return this.data.pageX || null;
      }
    }, {
      key: "pageY",
      get: function get() {
        return this.data.pageY || null;
      }
    }, {
      key: "target",
      get: function get() {
        return this.data.target || null;
      },
      set: function set(value) {
        this.data.target = value;
      }
    }, {
      key: "caller",
      get: function get() {
        return this.data.caller || null;
      }
    }, {
      key: "originalEvent",
      get: function get() {
        return this.data.originalEvent || null;
      }
    }, {
      key: "preventDefault",
      value: function preventDefault() {
        var _this$originalEvent;
        (_this$originalEvent = this.originalEvent) === null || _this$originalEvent === void 0 || _this$originalEvent.preventDefault();
      }
    }, {
      key: "stopPropagation",
      value: function stopPropagation() {
        var _this$originalEvent2;
        (_this$originalEvent2 = this.originalEvent) === null || _this$originalEvent2 === void 0 || _this$originalEvent2.stopPropagation();
      }
    }]);
  }(AbstractEvent);

  var MouseDownEvent = /*#__PURE__*/function (_SensorEvent) {
    function MouseDownEvent() {
      _classCallCheck(this, MouseDownEvent);
      return _callSuper(this, MouseDownEvent, arguments);
    }
    _inherits(MouseDownEvent, _SensorEvent);
    return _createClass(MouseDownEvent);
  }(SensorEvent);
  _defineProperty(MouseDownEvent, "type", 'mouse:down');
  _defineProperty(MouseDownEvent, "cancelable", true);
  var MouseStartEvent = /*#__PURE__*/function (_SensorEvent2) {
    function MouseStartEvent() {
      _classCallCheck(this, MouseStartEvent);
      return _callSuper(this, MouseStartEvent, arguments);
    }
    _inherits(MouseStartEvent, _SensorEvent2);
    return _createClass(MouseStartEvent);
  }(SensorEvent);
  _defineProperty(MouseStartEvent, "type", 'mouse:start');
  _defineProperty(MouseStartEvent, "cancelable", true);
  var MouseMoveEvent = /*#__PURE__*/function (_SensorEvent3) {
    function MouseMoveEvent() {
      _classCallCheck(this, MouseMoveEvent);
      return _callSuper(this, MouseMoveEvent, arguments);
    }
    _inherits(MouseMoveEvent, _SensorEvent3);
    return _createClass(MouseMoveEvent);
  }(SensorEvent);
  _defineProperty(MouseMoveEvent, "type", 'mouse:move');
  var MouseStopEvent = /*#__PURE__*/function (_SensorEvent4) {
    function MouseStopEvent() {
      _classCallCheck(this, MouseStopEvent);
      return _callSuper(this, MouseStopEvent, arguments);
    }
    _inherits(MouseStopEvent, _SensorEvent4);
    return _createClass(MouseStopEvent);
  }(SensorEvent);
  _defineProperty(MouseStopEvent, "type", 'mouse:stop');

  var toArray$1 = Function.prototype.bind.call(Function.prototype.call, [].slice);
  var show = function show(element) {
    if (element) {
      if (element.previousDisplay) {
        style(element, {
          display: element.previousDisplay
        });
      } else {
        element.style.display = '';
      }
    }
  };
  var hide = function hide(element) {
    if (element && style(element, 'display') !== 'none') {
      element.previousDisplay = style(element, 'display') || null;
      element.style.display = 'none';
    }
  };
  var disableSelection = function disableSelection(element) {
    if (element) {
      var eventName = 'onselectstart' in document.createElement('div') ? 'selectstart' : 'mousedown';
      return listen(element, eventName, function (event) {
        return event.preventDefault();
      });
    }
    return null;
  };
  var getParents = function getParents(element) {
    var until = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
    var nextNode = element;
    var parents = [];
    while (nextNode && nextNode.parentNode && nextNode.parentNode !== document) {
      if (until && matches(nextNode.parentNode, until)) {
        break;
      }
      parents.push(nextNode.parentNode);
      nextNode = nextNode.parentNode;
    }
    return parents;
  };
  var getSibling = function getSibling(element, direction, skip) {
    var sibling = null;
    var nextNode = element;
    var prop = direction === 'previous' ? 'previousElementSibling' : 'nextElementSibling';
    while (nextNode && nextNode[prop]) {
      if (skip && matches(nextNode[prop], skip)) {
        nextNode = nextNode[prop];
      } else {
        sibling = nextNode[prop];
        break;
      }
    }
    return sibling;
  };
  var getChildIndex = function getChildIndex(element) {
    var index = 0;
    var nextNode = element;
    while (nextNode && nextNode.previousElementSibling) {
      nextNode = nextNode.previousElementSibling;
      index++;
    }
    return index;
  };
  var containsStrict = function containsStrict(reference, element) {
    return reference !== element && contains(reference, element);
  };
  var insertBefore = function insertBefore(element, reference) {
    if (element && reference && reference.parentNode) {
      reference.parentNode.insertBefore(element, reference);
    }
    return element;
  };
  var insertAfter = function insertAfter(element, reference) {
    if (element && reference && reference.parentNode) {
      if (reference.nextSibling) {
        reference.parentNode.insertBefore(element, reference.nextSibling);
      } else {
        reference.parentNode.appendChild(element);
      }
    }
    return element;
  };
  var createElement = function createElement(tag) {
    var attrs = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
    var parent = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
    var contents = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
    var node = document.createElement(tag);
    if (isPlainObject$1(attrs)) {
      forEach$1(attrs, function (value, name) {
        attribute(node, name, value);
      });
    }
    if (parent && parent.nodeType === 1) {
      parent.appendChild(node);
    }
    if (contents) {
      node.innerHTML = contents;
    }
    return node;
  };
  var createMouseStopEvent = function createMouseStopEvent(target) {
    return new MouseStopEvent({
      target: target,
      originalEvent: createMouseEvent('mouseup', target)
    });
  };
  var createMouseEvent = function createMouseEvent(type, target) {
    var eventOptions = {
      button: 0,
      bubbles: true,
      cancelable: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      clientX: 1,
      clientY: 1,
      screenX: 0,
      screenY: 0,
      view: document.defaultView,
      target: target,
      relatedTarget: document.documentElement
    };
    return new MouseEvent('mouseup', eventOptions);
  };
  var triggerEvent = function triggerEvent(element, type) {
    if (element) {
      var event = document.createEvent('HTMLEvents');
      event.initEvent(type, false, true);
      element.dispatchEvent(event);
    }
  };
  var blurActiveElement = function blurActiveElement(event) {
    var active = activeElement();
    if (!containsStrict(active, event.target) && active !== document.body) {
      triggerEvent(active, 'blur');
    }
  };
  var isFloating = function isFloating(element) {
    return /(left|right)/.test(style(element, 'float') || /(inline|table-cell)/.test(style(element, 'display')));
  };
  var getPaddingAndBorder = function getPaddingAndBorder(element) {
    var dimensions = [];
    var borders = [style(element, 'borderTop'), style(element, 'borderRight'), style(element, 'borderBottom'), style(element, 'borderLeft')];
    var paddings = [style(element, 'paddingTop'), style(element, 'paddingRight'), style(element, 'paddingBottom'), style(element, 'paddingLeft')];
    for (var i = 0; i < 4; i++) {
      dimensions[i] = (parseFloat(borders[i]) || 0) + (parseFloat(paddings[i]) || 0);
    }
    return {
      width: dimensions[1] + dimensions[3],
      height: dimensions[0] + dimensions[2]
    };
  };
  var setPositionRelative = function setPositionRelative(element) {
    var pos = style(element, 'position');
    if (!/^(?:r|a|f)/.test(pos)) {
      style(element, {
        position: 'relative'
      });
    }
  };
  var setPositionAbsolute = function setPositionAbsolute(element) {
    var pos = style(element, 'position');
    if (!/^(?:fixed|absolute)/.test(pos)) {
      style(element, {
        position: 'absolute'
      });
    }
  };
  var styleAsNumber = function styleAsNumber(element, prop) {
    return parseInt(style(element, prop), 10) || 0;
  };
  var scrollParent = function scrollParent(element) {
    var includeHidden = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
    var position = style(element, 'position');
    var excludeStatic = position === 'absolute';
    if (position === 'fixed') {
      return document;
    }
    var regex = includeHidden ? /(auto|scroll|hidden)/ : /(auto|scroll)/;
    var filtered = getParents(element).filter(function (parent) {
      if (excludeStatic && style(parent, 'position') === 'static') {
        return false;
      }
      return regex.test(style(parent, 'overflow') + style(parent, 'overflowX') + style(parent, 'overflowY'));
    });
    return filtered.length > 0 ? filtered[0] : document;
  };
  var intersect = function intersect(source, target, tolerance, event) {
    switch (tolerance) {
      case 'fit':
        return source.left >= target.left && source.top >= target.top && source.right >= target.right && source.bottom >= target.bottom;
      case 'intersect':
        return target.left < source.left + source.width / 2 && target.right > source.right - source.width / 2 && target.top < source.top + source.height / 2 && target.bottom > source.bottom - source.height / 2;
      case 'pointer':
        return event.pageX > target.left && event.pageX < target.right && event.pageY > target.top && event.pageY < target.bottom;
      case 'touch':
        return (source.left >= target.left && source.left <= target.right || source.right >= target.left && source.right <= target.right || source.left < target.left && source.right > target.right) && (source.top >= target.top && source.top <= target.top || source.bottom >= target.bottom && source.bottom <= target.bottom || source.top < target.top && source.bottom > target.bottom);
      default:
        return false;
    }
  };
  var isRoot = function isRoot(element) {
    var includeBody = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
    return element === document || element === document.documentElement || includeBody && element === document.body;
  };
  var injectStyles = function injectStyles(className, rules) {
    var buffer = [".".concat(className, " {")];
    forEach$1(rules, function (value, name) {
      buffer.push("".concat(kebabCase$1(name), ": ").concat(value, ";"));
    });
    buffer.push('}');
    injectGlobal(buffer.join('\n'));
  };

  var instance = null;
  var DragDropManager = /*#__PURE__*/_createClass(function DragDropManager() {
    var _this = this;
    _classCallCheck(this, DragDropManager);
    _defineProperty(this, "draggable", null);
    _defineProperty(this, "droppables", {});
    _defineProperty(this, "getDroppables", function (scope) {
      return _this.droppables[scope] || [];
    });
    _defineProperty(this, "addDroppable", function (droppable, scope) {
      if (droppable && scope) {
        if (!_this.droppables[scope]) {
          _this.droppables[scope] = [];
        }
        _this.droppables[scope].push(droppable);
      }
    });
    _defineProperty(this, "removeDroppable", function (droppable, scope) {
      if (droppable && _this.droppables[scope]) {
        _this.droppables[scope] = _this.droppables[scope].filter(function (item) {
          return item !== droppable;
        });
      }
    });
    _defineProperty(this, "prepareOffsets", function (draggable, event) {
      var type = event.type;
      _this.draggable = draggable;
      _this.getDroppables(draggable.scope).forEach(function (droppable) {
        droppable.refreshVisibility();
        if (droppable.visible) {
          if (droppable.accept(draggable)) {
            if (type === 'mouse:start') {
              droppable.activate(event);
            }
            droppable.refreshProportions();
          }
        }
      });
    });
    _defineProperty(this, "onDragMove", function (draggable, event) {
      _this.getDroppables(draggable.scope).forEach(function (droppable) {
        var intersects = droppable.intersect(draggable, event);
        if (intersects && !droppable.isOver || !intersects && droppable.isOver) {
          var parentDroppable;
          var element = droppable.element;
          var _droppable$options = droppable.options,
            greedy = _droppable$options.greedy,
            scope = _droppable$options.scope;
          if (greedy) {
            var parents = getParents(element).filter(function (element) {
              return element[droppable.dataProperty] && element[droppable.dataProperty].options.scope === scope;
            });
            if (parents.length > 0) {
              parentDroppable = parents[0][droppable.dataProperty];
              parentDroppable.greedyChild = intersects;
              if (intersects) {
                parentDroppable.out(event);
              }
            }
          }
          if (intersects) {
            droppable.over(event);
          } else {
            droppable.out(event);
          }
          if (parentDroppable && !intersects) {
            parentDroppable.over(event);
          }
        }
      });
    });
    _defineProperty(this, "onDragStop", function (draggable, event) {
      _this.prepareOffsets(draggable, event);
    });
    _defineProperty(this, "drop", function (draggable, event) {
      var dropped = null;
      _this.getDroppables(draggable.scope).forEach(function (droppable) {
        if (droppable.intersect(draggable, event)) {
          dropped = droppable.drop(event) || dropped;
        }
        if (droppable.accept(draggable)) {
          droppable.deactivate(event);
        }
      });
      _this.draggable = null;
      return dropped;
    });
  });
  if (!instance) {
    instance = new DragDropManager();
  }
  var DragDropManager$1 = instance;

  var AutoScroll = /*#__PURE__*/function (_Plugin) {
    function AutoScroll(container) {
      var _this;
      _classCallCheck(this, AutoScroll);
      _this = _callSuper(this, AutoScroll, [container]);
      _defineProperty(_this, "scrollParent", null);
      _defineProperty(_this, "scrollParentOffset", null);
      _defineProperty(_this, "onDragStart", function (event) {
        if (!_this.scroll) {
          return;
        }
        var helperAttrs = _this.container.helperAttrs;
        if (!_this.scrollParent) {
          _this.scrollParent = helperAttrs.scrollParent;
        }
        if (!isRoot(_this.scrollParent, false)) {
          _this.scrollParentOffset = offset(_this.scrollParent);
        }
      });
      _defineProperty(_this, "onDragMove", function (event) {
        if (!_this.scroll) {
          return;
        }
        var scrolled = false;
        var sensorEvent = event.sensorEvent;
        var _this2 = _this,
          scrollParent = _this2.scrollParent,
          scrollParentOffset = _this2.scrollParentOffset;
        var helperSize = _this.container.helperSize;
        var click = _this.container.offset.click;
        var _this$container$optio = _this.container.options,
          axis = _this$container$optio.axis,
          scrollSensitivity = _this$container$optio.scrollSensitivity,
          scrollSpeed = _this$container$optio.scrollSpeed;
        var pos = {
          x: sensorEvent.pageX - click.left - (isRoot(_this.scrollParent, false) ? scrollLeft(document) : 0),
          y: sensorEvent.pageY - click.top - (isRoot(_this.scrollParent, false) ? scrollTop(document) : 0)
        };
        if (!isRoot(_this.scrollParent, false)) {
          if (!axis || axis !== 'y') {
            if (scrollParentOffset.left + scrollParent.offsetWidth - (pos.x + helperSize.width) < scrollSensitivity) {
              scrollParent.scrollLeft = scrollParent.scrollLeft + scrollSpeed;
              scrolled = true;
            } else if (pos.x - scrollParentOffset.left < scrollSensitivity) {
              scrollParent.scrollLeft = scrollParent.scrollLeft - scrollSpeed;
              scrolled = true;
            }
          }
          if (!axis || axis !== 'x') {
            if (scrollParentOffset.top + scrollParent.offsetHeight - (pos.y + helperSize.height) < scrollSensitivity) {
              scrollParent.scrollTop = scrollParent.scrollTop + scrollSpeed;
              scrolled = true;
            } else if (pos.y - scrollParentOffset.top < scrollSensitivity) {
              scrollParent.scrollTop = scrollParent.scrollTop - scrollSpeed;
              scrolled = true;
            }
          }
        } else {
          if (!axis || axis !== 'y') {
            if (pos.x < scrollSensitivity) {
              scrollLeft(document, scrollLeft(document) - scrollSpeed);
              scrolled = true;
            } else if (window.innerWidth - (pos.x + helperSize.width) < scrollSensitivity) {
              scrollLeft(document, scrollLeft(document) + scrollSpeed);
              scrolled = true;
            }
          }
          if (!axis || axis !== 'x') {
            if (pos.y < scrollSensitivity) {
              scrollTop(document, scrollTop(document) - scrollSpeed);
              scrolled = true;
            } else if (window.innerHeight - (pos.y + helperSize.height) < scrollSensitivity) {
              scrollTop(document, scrollTop(document) + scrollSpeed);
              scrolled = true;
            }
          }
        }
        if (scrolled) {
          DragDropManager$1.prepareOffsets(_this.container, sensorEvent);
        }
      });
      _this.attach();
      return _this;
    }
    _inherits(AutoScroll, _Plugin);
    return _createClass(AutoScroll, [{
      key: "supported",
      get: function get() {
        return this.isDraggable() || this.isSortable();
      }
    }, {
      key: "scroll",
      get: function get() {
        var options = this.container.options;
        return options.scroll;
      }
    }]);
  }(Plugin);

  var AxisConstraint = /*#__PURE__*/function (_Plugin) {
    function AxisConstraint(container) {
      var _this;
      _classCallCheck(this, AxisConstraint);
      _this = _callSuper(this, AxisConstraint, [container]);
      _defineProperty(_this, "constraintPosition", function (pos) {
        var startEvent = _this.container.startEvent;
        if (_this.axis === 'y') {
          pos.pageX = startEvent.pageX;
        } else if (_this.axis === 'x') {
          pos.pageY = startEvent.pageY;
        }
        return pos;
      });
      _this.attach();
      return _this;
    }
    _inherits(AxisConstraint, _Plugin);
    return _createClass(AxisConstraint, [{
      key: "supported",
      get: function get() {
        return this.isDraggable() || this.isSortable();
      }
    }, {
      key: "axis",
      get: function get() {
        var _this$container$optio = this.container.options.axis,
          axis = _this$container$optio === void 0 ? null : _this$container$optio;
        return axis;
      }
    }]);
  }(Plugin);

  var SortableEvent = /*#__PURE__*/function (_AbstractEvent) {
    function SortableEvent() {
      _classCallCheck(this, SortableEvent);
      return _callSuper(this, SortableEvent, arguments);
    }
    _inherits(SortableEvent, _AbstractEvent);
    return _createClass(SortableEvent, [{
      key: "sortable",
      get: function get() {
        return this.data.sortable || null;
      }
    }]);
  }(AbstractEvent);
  _defineProperty(SortableEvent, "type", 'sortable');
  var SortableInitEvent = /*#__PURE__*/function (_SortableEvent2) {
    function SortableInitEvent() {
      _classCallCheck(this, SortableInitEvent);
      return _callSuper(this, SortableInitEvent, arguments);
    }
    _inherits(SortableInitEvent, _SortableEvent2);
    return _createClass(SortableInitEvent);
  }(SortableEvent);
  _defineProperty(SortableInitEvent, "type", 'sortable:init');
  var SortableActivateEvent = /*#__PURE__*/function (_SortableEvent3) {
    function SortableActivateEvent() {
      _classCallCheck(this, SortableActivateEvent);
      return _callSuper(this, SortableActivateEvent, arguments);
    }
    _inherits(SortableActivateEvent, _SortableEvent3);
    return _createClass(SortableActivateEvent, [{
      key: "sensorEvent",
      get: function get() {
        return this.data.sensorEvent || null;
      }
    }, {
      key: "draggable",
      get: function get() {
        return this.data.draggable || null;
      }
    }, {
      key: "peerSortable",
      get: function get() {
        return this.data.sortable || null;
      }
    }]);
  }(SortableEvent);
  _defineProperty(SortableActivateEvent, "type", 'sortable:activate');
  var SortableOverEvent = /*#__PURE__*/function (_SortableActivateEven) {
    function SortableOverEvent() {
      _classCallCheck(this, SortableOverEvent);
      return _callSuper(this, SortableOverEvent, arguments);
    }
    _inherits(SortableOverEvent, _SortableActivateEven);
    return _createClass(SortableOverEvent);
  }(SortableActivateEvent);
  _defineProperty(SortableOverEvent, "type", 'sortable:over');
  var SortableChangeEvent = /*#__PURE__*/function (_SortableEvent4) {
    function SortableChangeEvent() {
      _classCallCheck(this, SortableChangeEvent);
      return _callSuper(this, SortableChangeEvent, arguments);
    }
    _inherits(SortableChangeEvent, _SortableEvent4);
    return _createClass(SortableChangeEvent);
  }(SortableEvent);
  _defineProperty(SortableChangeEvent, "type", 'sortable:change');
  var SortableRemoveEvent = /*#__PURE__*/function (_SortableEvent5) {
    function SortableRemoveEvent() {
      _classCallCheck(this, SortableRemoveEvent);
      return _callSuper(this, SortableRemoveEvent, arguments);
    }
    _inherits(SortableRemoveEvent, _SortableEvent5);
    return _createClass(SortableRemoveEvent, [{
      key: "item",
      get: function get() {
        return this.data.item || null;
      }
    }, {
      key: "previousIndex",
      get: function get() {
        return this.data.previousIndex || null;
      }
    }, {
      key: "peerSortable",
      get: function get() {
        return this.data.peerSortable || null;
      }
    }]);
  }(SortableEvent);
  _defineProperty(SortableRemoveEvent, "type", 'sortable:remove');
  var SortableReceiveEvent = /*#__PURE__*/function (_SortableEvent6) {
    function SortableReceiveEvent() {
      _classCallCheck(this, SortableReceiveEvent);
      return _callSuper(this, SortableReceiveEvent, arguments);
    }
    _inherits(SortableReceiveEvent, _SortableEvent6);
    return _createClass(SortableReceiveEvent, [{
      key: "item",
      get: function get() {
        return this.data.item || null;
      }
    }, {
      key: "newIndex",
      get: function get() {
        return this.data.newIndex || null;
      }
    }, {
      key: "draggable",
      get: function get() {
        return this.data.draggable || null;
      }
    }, {
      key: "peerSortable",
      get: function get() {
        return this.data.peerSortable || null;
      }
    }]);
  }(SortableEvent);
  _defineProperty(SortableReceiveEvent, "type", 'sortable:receive');
  var SortableUpdateEvent = /*#__PURE__*/function (_SortableEvent7) {
    function SortableUpdateEvent() {
      _classCallCheck(this, SortableUpdateEvent);
      return _callSuper(this, SortableUpdateEvent, arguments);
    }
    _inherits(SortableUpdateEvent, _SortableEvent7);
    return _createClass(SortableUpdateEvent, [{
      key: "item",
      get: function get() {
        return this.data.item || null;
      }
    }, {
      key: "previousIndex",
      get: function get() {
        return this.data.previousIndex || null;
      }
    }, {
      key: "newIndex",
      get: function get() {
        return this.data.newIndex || null;
      }
    }, {
      key: "peerSortable",
      get: function get() {
        return this.data.peerSortable || null;
      }
    }]);
  }(SortableEvent);
  _defineProperty(SortableUpdateEvent, "type", 'sortable:update');
  var SortableOutEvent = /*#__PURE__*/function (_SortableActivateEven2) {
    function SortableOutEvent() {
      _classCallCheck(this, SortableOutEvent);
      return _callSuper(this, SortableOutEvent, arguments);
    }
    _inherits(SortableOutEvent, _SortableActivateEven2);
    return _createClass(SortableOutEvent);
  }(SortableActivateEvent);
  _defineProperty(SortableOutEvent, "type", 'sortable:out');
  var SortableDeactivateEvent = /*#__PURE__*/function (_SortableActivateEven3) {
    function SortableDeactivateEvent() {
      _classCallCheck(this, SortableDeactivateEvent);
      return _callSuper(this, SortableDeactivateEvent, arguments);
    }
    _inherits(SortableDeactivateEvent, _SortableActivateEven3);
    return _createClass(SortableDeactivateEvent);
  }(SortableActivateEvent);
  _defineProperty(SortableDeactivateEvent, "type", 'sortable:deactivate');
  var SortableDestroyEvent = /*#__PURE__*/function (_SortableEvent8) {
    function SortableDestroyEvent() {
      _classCallCheck(this, SortableDestroyEvent);
      return _callSuper(this, SortableDestroyEvent, arguments);
    }
    _inherits(SortableDestroyEvent, _SortableEvent8);
    return _createClass(SortableDestroyEvent);
  }(SortableEvent);
  _defineProperty(SortableDestroyEvent, "type", 'sortable:destroy');

  var draggableProp = 'draggableInstance';
  var draggableEl = 'ui-draggable';
  var draggableHandle = 'ui-draggable-handle';
  var draggableHelper = 'ui-draggable-helper';
  var droppableProp = 'droppableInstance';
  var droppableEl = 'ui-droppable';
  var droppableActive = 'ui-droppable-active';
  var droppableHover = 'ui-droppable-hover';
  var sortableProp = 'sortableInstance';
  var sortableEl = 'ui-sortable';
  var sortableHandle = 'ui-sortable-handle';
  var sortableHelper = 'ui-sortable-helper';
  var sortablePlaceholder = 'ui-sortable-placeholder';
  var resizableProp = 'resizableInstance';
  var resizableEl = 'ui-resizable';
  var resizableWrapper = 'ui-resizable-wrapper';
  var resizableAutoHide = 'ui-resizable-autohide';
  var resizableHandle = 'ui-resizable-handle';
  var resizableHandleProp = 'resizableDirection';
  var resizableHelper = 'ui-resizable-helper';
  var resizableResizing = 'ui-resizable-resizing';
  var resizableGhost = 'ui-resizable-ghost';
  var resizableDirections = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  var resizableCornerIcons = {
    ne: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 16 16"><g><polygon points="16,0 16,16 0,0" fill="darkgray" /></g></svg>',
    nw: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 16 16"><g><polygon points="0,0 0,16 16,0" fill="darkgray" /></g></svg>',
    se: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 16 16"><g><polygon points="0,16 16,16 16,0" fill="darkgray" /></g></svg>',
    sw: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 16 16"><g><polygon points="0,0 0,16 16,16" fill="darkgray" /></g></svg>'
  };
  var resizableDirectionStyles = {
    n: {
      cursor: 'n-resize',
      height: '7px',
      width: '100%',
      top: '-5px',
      left: '0'
    },
    s: {
      cursor: 's-resize',
      height: '7px',
      width: '100%',
      bottom: '-5px',
      left: '0'
    },
    e: {
      cursor: 'e-resize',
      width: '7px',
      right: '-5px',
      top: '0',
      height: '100%'
    },
    w: {
      cursor: 'w-resize',
      width: '7px',
      left: '-5px',
      top: '0',
      height: '100%'
    },
    nw: {
      cursor: 'nw-resize',
      width: '12px',
      height: '12px',
      left: '1px',
      top: '1px',
      backgroundImage: "url('data:image/svg+xml;utf8,".concat(encodeURIComponent(resizableCornerIcons.nw), "')"),
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    },
    ne: {
      cursor: 'ne-resize',
      width: '12px',
      height: '12px',
      right: '1px',
      top: '1px',
      backgroundImage: "url('data:image/svg+xml;utf8,".concat(encodeURIComponent(resizableCornerIcons.ne), "')"),
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    },
    se: {
      cursor: 'se-resize',
      width: '12px',
      height: '12px',
      right: '1px',
      bottom: '1px',
      backgroundImage: "url('data:image/svg+xml;utf8,".concat(encodeURIComponent(resizableCornerIcons.se), "')"),
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    },
    sw: {
      cursor: 'sw-resize',
      width: '12px',
      height: '12px',
      left: '1px',
      bottom: '1px',
      backgroundImage: "url('data:image/svg+xml;utf8,".concat(encodeURIComponent(resizableCornerIcons.sw), "')"),
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    }
  };

  var ConnectToSortable = /*#__PURE__*/function (_Plugin) {
    function ConnectToSortable(container) {
      var _this;
      _classCallCheck(this, ConnectToSortable);
      _this = _callSuper(this, ConnectToSortable, [container]);
      _defineProperty(_this, "onDragStart", function (event) {
        if (_this.connectToSortable) {
          _this.container.connectedSortables = [];
          qsa(document, _this.connectToSortable).forEach(function (element) {
            var sortable = element[sortableProp];
            if (sortable && !sortable.disabled) {
              _this.container.connectedSortables.push(sortable);
              sortable.refreshPositions();
              sortable.trigger(new SortableActivateEvent({
                sortable: sortable,
                sensorEvent: event.sensorEvent,
                draggable: _this.container
              }));
            }
          });
        }
      });
      _defineProperty(_this, "onDragMove", function (event) {
        var sensorEvent = event.sensorEvent;
        if (_this.connectToSortable) {
          _this.container.connectedSortables.forEach(function (sortable) {
            var intersecting = false;
            var _this$container = _this.container,
              helperSize = _this$container.helperSize,
              position = _this$container.position;
            var _this$container$offse = _this.container.offset,
              click = _this$container$offse.click,
              parent = _this$container$offse.parent;
            sortable.helperSize = helperSize;
            sortable.offset.click = click;
            sortable.position.absolute = position.absolute;
            if (sortable.intersectsWith(sortable.elementProportions)) {
              intersecting = true;
              _this.container.connectedSortables.forEach(function (innerSortable) {
                innerSortable.helperSize = helperSize;
                innerSortable.offset.click = click;
                innerSortable.position.absolute = position.absolute;
                if (innerSortable !== sortable && innerSortable.intersectsWith(innerSortable.elementProportions) && containsStrict(sortable.element, innerSortable.element)) {
                  intersecting = false;
                }
              });
            }
            if (intersecting) {
              if (!sortable.isDraggableOver) {
                if (!_this.container.previousHelperParent) {
                  _this.container.previousHelperParent = _this.container.helper.parentNode;
                }
                _this.container.helper[sortableProp] = sortable;
                sortable.element.appendChild(_this.container.helper);
                sortable.previousHelper = sortable.options.helper;
                sortable.options.helper = function () {
                  return _this.container.helper;
                };
                sortable.currentItem = _this.container.helper;
                sortable.connectedDraggable = _this.container;
                sensorEvent.target = sortable.currentItem;
                sortable.over(null, _this.container);
                sortable.isDraggableOver = true;
                sortable.onDragStart({
                  detail: sensorEvent
                }, true, true);
                sortable.offset.click = click;
                sortable.offset.parent.left -= parent.left - sortable.offset.parent.left;
                sortable.offset.parent.top -= parent.top - sortable.offset.parent.top;
                _this.container.connectedSortables.forEach(function (sortable) {
                  return sortable.refreshPositions();
                });
              }
              if (sortable.currentItem) {
                sortable.onDragMove({
                  detail: sensorEvent
                }, false, true);
                event.position = sortable.position.current;
              }
            } else if (!intersecting && sortable.isDraggableOver) {
              sortable.previousRevert = sortable.options.revert;
              sortable.options.revert = false;
              sortable.out(null, _this.container);
              sortable.isDraggableOver = false;
              sortable.cancelHelperRemoval = sortable.helper === sortable.currentItem;
              if (sortable.placeholder) {
                sortable.placeholder.parentNode.removeChild(sortable.placeholder);
              }
              sortable.onDragStop({
                detail: sensorEvent
              }, true);
              sortable.options.helper = sortable.previousHelper;
              sortable.previousHelper = null;
              sortable.options.revert = sortable.previousRevert;
              sortable.previousRevert = null;
              _this.container.previousHelperParent.appendChild(_this.container.helper);
              _this.container.helper[sortableProp] = null;
              _this.container.calculateOffsets(sensorEvent);
              _this.container.calculatePosition(sensorEvent);
              _this.container.connectedSortables.forEach(function (sortable) {
                return sortable.refreshPositions();
              });
              event.position = _this.container.position.current;
            }
          });
        }
      });
      _defineProperty(_this, "onDragStop", function (event) {
        var sensorEvent = event.sensorEvent;
        if (_this.connectToSortable) {
          _this.container.cancelHelperRemoval = false;
          _this.container.connectedSortables.forEach(function (sortable) {
            if (sortable.isDraggableOver) {
              delete _this.container.helper[sortableProp];
              _this.container.cancelHelperRemoval = true;
              sortable.cancelHelperRemoval = false;
              sortable.options.helper = sortable.previousHelper;
              sortable.previousHelper = null;
              sortable.previousRevert = sortable.options.revert;
              sortable.options.revert = false;
              event.droppedSortable = sortable;
              sortable.out(null, _this.container);
              sortable.isDraggableOver = false;
              sortable.currentItemStyle = {
                position: style(sortable.placeholder, 'position'),
                left: styleAsNumber(sortable.placeholder, 'left'),
                top: styleAsNumber(sortable.placeholder, 'top')
              };
              sortable.onDragStop({
                detail: sensorEvent
              }, true);
              sortable.options.revert = sortable.previousRevert;
              sortable.previousRevert = null;
              sortable.currentItem = null;
              sortable.connectedDraggable = null;
              _this.container.helper[sortableProp] = null;
              _this.container.connectedSortables.forEach(function (sortable) {
                return sortable.refreshPositions();
              });
            } else {
              sortable.cancelHelperRemoval = false;
            }
            sortable.trigger(new SortableDeactivateEvent({
              sortable: sortable,
              sensorEvent: sensorEvent,
              draggable: _this.container
            }));
            sortable.currentItem = null;
            sortable.connectedDraggable = null;
          });
          _this.container.connectedSortables = [];
        }
      });
      _this.attach();
      return _this;
    }
    _inherits(ConnectToSortable, _Plugin);
    return _createClass(ConnectToSortable, [{
      key: "supported",
      get: function get() {
        return this.isSortable();
      }
    }, {
      key: "connectToSortable",
      get: function get() {
        var connectToSortable = this.container.options.connectToSortable;
        return connectToSortable || null;
      }
    }]);
  }(Plugin);

  var $$8 = _export;
  var isArray$1 = isArray$9;

  // `Array.isArray` method
  // https://tc39.es/ecma262/#sec-array.isarray
  $$8({ target: 'Array', stat: true }, {
    isArray: isArray$1
  });

  var DragContainmentConstraint = /*#__PURE__*/function (_Plugin) {
    function DragContainmentConstraint(container) {
      var _this;
      _classCallCheck(this, DragContainmentConstraint);
      _this = _callSuper(this, DragContainmentConstraint, [container]);
      _defineProperty(_this, "constraintPosition", function (pos) {
        if (_this.containment) {
          var _this$containment = _slicedToArray(_this.containment, 4),
            xMin = _this$containment[0],
            yMin = _this$containment[1],
            xMax = _this$containment[2],
            yMax = _this$containment[3];
          var containmentContainer = _this.container.containmentContainer;
          var click = _this.container.offset.click;
          if (containmentContainer) {
            var containerOffset = offset(containmentContainer);
            xMin += containerOffset.left;
            yMin += containerOffset.top;
            xMax += containerOffset.left;
            yMax += containerOffset.top;
          }
          if (pos.pageX - click.left < xMin) {
            pos.pageX = xMin + click.left;
          }
          if (pos.pageY - click.top < yMin) {
            pos.pageY = yMin + click.top;
          }
          if (pos.pageX - click.left > xMax) {
            pos.pageX = xMax + click.left;
          }
          if (pos.pageY - click.top > yMax) {
            pos.pageY = yMax + click.top;
          }
        }
        return pos;
      });
      _this.attach();
      return _this;
    }
    _inherits(DragContainmentConstraint, _Plugin);
    return _createClass(DragContainmentConstraint, [{
      key: "supported",
      get: function get() {
        return this.isDraggable() || this.isSortable();
      }
    }, {
      key: "containment",
      get: function get() {
        if (this.container.containmentCoords === undefined) {
          var containment = this.container.options.containment;
          var _this$container$offse = this.container.offset,
            parent = _this$container$offse.parent,
            relative = _this$container$offse.relative;
          var _this$container = this.container,
            helper = _this$container.helper,
            helperSize = _this$container.helperSize,
            margins = _this$container.margins;
          if (containment === 'window') {
            this.container.containmentCoords = [window.pageXOffset - parent.left - relative.left, window.pageYOffset - parent.top - relative.top, window.pageXOffset + window.innerWidth - helperSize.width - margins.left, window.pageYOffset + window.innerHeight - helperSize.height - margins.top];
          } else if (containment === 'document') {
            this.container.containmentCoords = [0, 0, getWidth(document) - helperSize.width - margins.left, height(document) - helperSize.height - margins.top];
          } else if (Array.isArray(containment) && containment.length === 4) {
            this.container.containmentCoords = containment;
          } else {
            var node = containment === 'parent' ? helper.parentNode : document.querySelector(containment);
            if (node) {
              var scrollable = /(scroll|auto)/.test(style(node, 'overflow'));
              this.container.containmentContainer = node;
              this.container.containmentCoords = [styleAsNumber(node, 'borderLeftWidth') + styleAsNumber(node, 'paddingLeft'), styleAsNumber(node, 'borderTopWidth') + styleAsNumber(node, 'paddingTop'), (scrollable ? Math.max(node.scrollWidth, node.offsetWidth) : node.offsetWidth) - styleAsNumber(node, 'borderRightWidth') - styleAsNumber(node, 'paddingRight') - helperSize.width - margins.left - margins.right, (scrollable ? Math.max(node.scrollHeight, node.offsetHeight) : node.offsetHeight) - styleAsNumber(node, 'borderBottomWidth') - styleAsNumber(node, 'paddingBottom') - helperSize.height - margins.top - margins.bottom];
            } else {
              this.container.containmentCoords = null;
            }
          }
        }
        return this.container.containmentCoords;
      }
    }]);
  }(Plugin);

  var DragGridConstraint = /*#__PURE__*/function (_Plugin) {
    function DragGridConstraint(container) {
      var _this;
      _classCallCheck(this, DragGridConstraint);
      _this = _callSuper(this, DragGridConstraint, [container]);
      _defineProperty(_this, "constraintPosition", function (pos) {
        if (_this.grid) {
          var xMin, xMax, yMin, yMax;
          var _this$grid = _slicedToArray(_this.grid, 2),
            x = _this$grid[0],
            y = _this$grid[1];
          var _this$container = _this.container,
            containmentCoords = _this$container.containmentCoords,
            containmentContainer = _this$container.containmentContainer,
            startEvent = _this$container.startEvent;
          var click = _this.container.offset.click;
          if (containmentCoords) {
            var _containmentCoords = _slicedToArray(containmentCoords, 4);
            xMin = _containmentCoords[0];
            yMin = _containmentCoords[1];
            xMax = _containmentCoords[2];
            yMax = _containmentCoords[3];
            if (containmentCoords && containmentContainer) {
              var containerOffset = offset(containmentContainer);
              xMin += containerOffset.left;
              yMin += containerOffset.top;
              xMax += containerOffset.left;
              yMax += containerOffset.top;
            }
          }
          var left = x ? startEvent.pageX + Math.round((pos.pageX - startEvent.pageX) / x) * x : startEvent.pageX;
          var top = y ? startEvent.pageY + Math.round((pos.pageY - startEvent.pageY) / y) * y : startEvent.pageY;
          if (containmentCoords) {
            if (left - click.left >= xMin || left - click.left > xMax) {
              pos.pageX = left;
            } else {
              pos.pageX = left + x;
            }
            if (top - click.top >= yMin || top - click.top > yMax) {
              pos.pageY = top;
            } else {
              pos.pageY = top + y;
            }
          } else {
            pos.pageX = left;
            pos.pageY = top;
          }
        }
        return pos;
      });
      _this.attach();
      return _this;
    }
    _inherits(DragGridConstraint, _Plugin);
    return _createClass(DragGridConstraint, [{
      key: "supported",
      get: function get() {
        return this.isDraggable() || this.isSortable();
      }
    }, {
      key: "grid",
      get: function get() {
        var options = this.container.options;
        return Array.isArray(options.grid) && options.grid.length === 2 ? options.grid : null;
      }
    }]);
  }(Plugin);

  var ResizeContainmentConstraint = /*#__PURE__*/function (_Plugin) {
    function ResizeContainmentConstraint(container) {
      var _this;
      _classCallCheck(this, ResizeContainmentConstraint);
      _this = _callSuper(this, ResizeContainmentConstraint, [container]);
      _defineProperty(_this, "containmentContainer", null);
      _defineProperty(_this, "containmentAttrs", {
        offset: null,
        position: null,
        size: null
      });
      _defineProperty(_this, "onDragStart", function (sensorEvent) {
        var helper = _this.container.helper;
        var containment = _this.container.options.containment;
        if (containment === 'document') {
          _this.containmentContainer = document;
          _this.containmentAttrs.offset = {
            left: 0,
            top: 0
          };
          _this.containmentAttrs.position = {
            left: 0,
            top: 0
          };
          _this.containmentAttrs.size = {
            width: getWidth(document),
            height: height(document) || document.body.parentNode.scrollHeight
          };
        } else {
          var paddings = [];
          var node = containment === 'parent' ? helper.parentNode : document.querySelector(containment);
          if (node) {
            _this.containmentContainer = node;
            ['Top', 'Right', 'Bottom', 'Left'].forEach(function (side) {
              paddings[side.toLowerCase()] = styleAsNumber(node, "padding".concat(side));
            });
            _this.containmentAttrs.offset = offset(node);
            _this.containmentAttrs.position = position$1(node);
            _this.containmentAttrs.size = {
              width: getWidth(node) - paddings.left - paddings.right,
              height: height(node) - paddings.top - paddings.bottom
            };
          }
        }
      });
      _defineProperty(_this, "onDragMove", function (sensorEvent) {
        var helperOffset = _this.container.offset.helper;
        var containmentPosition = {
          left: 0,
          top: 0
        };
        var size = sensorEvent.size,
          position = sensorEvent.position;
        var _this$container = _this.container,
          aspectRatio = _this$container.aspectRatio,
          helper = _this$container.helper;
        var containment = _this.container.options.containment;
        var _this$container$curre = _this.container.currentAttrs,
          currentSize = _this$container$curre.size,
          currentPosition = _this$container$curre.position;
        var _this2 = _this,
          containmentContainer = _this2.containmentContainer;
        var _this$containmentAttr = _this.containmentAttrs,
          containmentSize = _this$containmentAttr.size,
          containmentOffset = _this$containmentAttr.offset;
        if (!containmentContainer) {
          return;
        }
        if (containmentContainer !== document && style(containmentContainer, 'position') === 'static') {
          containmentPosition = containmentOffset;
        }
        if (currentPosition.left < 0) {
          size.width += currentPosition.left;
          if (aspectRatio) {
            size.height = size.width / aspectRatio;
          }
          position.left = 0;
        }
        if (currentPosition.top < 0) {
          size.height += currentPosition.top;
          if (aspectRatio) {
            size.width = size.height * aspectRatio;
          }
          position.top = 0;
        }
        if (containment === 'parent' && /absolute|relative/.test(style(containmentContainer, 'position'))) {
          helperOffset.left = containmentPosition.left + currentPosition.left;
          helperOffset.top = containmentPosition.top + currentPosition.top;
        } else {
          helperOffset = offset(helper);
        }
        if (currentSize.width + (helperOffset.left - containmentPosition.left) >= containmentSize.width) {
          size.width = containmentSize.width - (helperOffset.left - containmentPosition.left);
          if (aspectRatio) {
            size.height = currentSize.width / aspectRatio;
          }
        }
        if (currentSize.height + (helperOffset.top - containmentPosition.top) >= containmentSize.height) {
          size.height = containmentSize.height - (helperOffset.top - containmentPosition.top);
          if (aspectRatio) {
            size.width = currentSize.height * aspectRatio;
          }
        }
      });
      _this.attach();
      return _this;
    }
    _inherits(ResizeContainmentConstraint, _Plugin);
    return _createClass(ResizeContainmentConstraint, [{
      key: "supported",
      get: function get() {
        return this.isResizable();
      }
    }]);
  }(Plugin);

  var ResizeGridConstraint = /*#__PURE__*/function (_Plugin) {
    function ResizeGridConstraint(container) {
      var _this;
      _classCallCheck(this, ResizeGridConstraint);
      _this = _callSuper(this, ResizeGridConstraint, [container]);
      _defineProperty(_this, "onDragMove", function (sensorEvent) {
        if (_this.grid) {
          var _this$grid = _slicedToArray(_this.grid, 2),
            x = _this$grid[0],
            y = _this$grid[1];
          var size = sensorEvent.size,
            position = sensorEvent.position;
          var _this$container = _this.container,
            currentDirection = _this$container.currentDirection,
            helper = _this$container.helper;
          var _this$container$origi = _this.container.originalAttrs,
            originalSize = _this$container$origi.size,
            originalPosition = _this$container$origi.position;
          var _this$container$optio = _this.container.options,
            minWidth = _this$container$optio.minWidth,
            maxWidth = _this$container$optio.maxWidth,
            minHeight = _this$container$optio.minHeight,
            maxHeight = _this$container$optio.maxHeight;
          var delta = {
            x: originalSize.width + Math.round((size.width - originalSize.width) / x) * x,
            y: originalSize.height + Math.round((size.height - originalSize.height) / y) * y
          };
          var newSize = {
            width: delta.x,
            height: delta.y
          };
          if (minWidth && minWidth > newSize.width) {
            newSize.width += x;
          }
          if (maxWidth && maxWidth < newSize.width) {
            newSize.width -= x;
          }
          if (minHeight && minHeight > newSize.height) {
            newSize.height += y;
          }
          if (maxHeight && maxHeight < newSize.height) {
            newSize.height -= y;
          }
          if (/^(se|s|e)$/.test(currentDirection)) {
            size.width = newSize.width;
            size.height = newSize.height;
          } else if (/^(ne)$/.test(currentDirection)) {
            size.width = newSize.width;
            size.height = newSize.height;
            position.top = originalPosition.top - delta.y;
          } else if (/^(sw)$/.test(currentDirection)) {
            size.width = newSize.width;
            size.height = newSize.height;
            position.left = originalPosition.left - delta.x;
          } else {
            var dimensions = getPaddingAndBorder(helper);
            if (newSize.width - x > 0) {
              size.width = newSize.width;
              position.left = originalPosition.left - delta.x;
            } else {
              size.width = x - dimensions.width;
              position.left = originalPosition.left + originalSize.width - newSize.width;
            }
            if (newSize.height - y > 0) {
              size.height = newSize.height;
              position.top = originalPosition.top - delta.y;
            } else {
              size.height = y - dimensions.height;
              position.top = originalPosition.top + originalSize.height - newSize.height;
            }
          }
        }
      });
      _this.attach();
      return _this;
    }
    _inherits(ResizeGridConstraint, _Plugin);
    return _createClass(ResizeGridConstraint, [{
      key: "supported",
      get: function get() {
        return this.isResizable();
      }
    }, {
      key: "grid",
      get: function get() {
        var options = this.container.options;
        return Array.isArray(options.grid) && options.grid.length === 2 ? options.grid : null;
      }
    }]);
  }(Plugin);

  /*
   * anime.js v3.2.2
   * (c) 2023 Julian Garnier
   * Released under the MIT license
   * animejs.com
   */

  // Defaults

  var defaultInstanceSettings = {
    update: null,
    begin: null,
    loopBegin: null,
    changeBegin: null,
    change: null,
    changeComplete: null,
    loopComplete: null,
    complete: null,
    loop: 1,
    direction: 'normal',
    autoplay: true,
    timelineOffset: 0
  };

  var defaultTweenSettings = {
    duration: 1000,
    delay: 0,
    endDelay: 0,
    easing: 'easeOutElastic(1, .5)',
    round: 0
  };

  var validTransforms = ['translateX', 'translateY', 'translateZ', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'scale', 'scaleX', 'scaleY', 'scaleZ', 'skew', 'skewX', 'skewY', 'perspective', 'matrix', 'matrix3d'];

  // Caching

  var cache = {
    CSS: {},
    springs: {}
  };

  // Utils

  function minMax(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  function stringContains(str, text) {
    return str.indexOf(text) > -1;
  }

  function applyArguments(func, args) {
    return func.apply(null, args);
  }

  var is = {
    arr: function (a) { return Array.isArray(a); },
    obj: function (a) { return stringContains(Object.prototype.toString.call(a), 'Object'); },
    pth: function (a) { return is.obj(a) && a.hasOwnProperty('totalLength'); },
    svg: function (a) { return a instanceof SVGElement; },
    inp: function (a) { return a instanceof HTMLInputElement; },
    dom: function (a) { return a.nodeType || is.svg(a); },
    str: function (a) { return typeof a === 'string'; },
    fnc: function (a) { return typeof a === 'function'; },
    und: function (a) { return typeof a === 'undefined'; },
    nil: function (a) { return is.und(a) || a === null; },
    hex: function (a) { return /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(a); },
    rgb: function (a) { return /^rgb/.test(a); },
    hsl: function (a) { return /^hsl/.test(a); },
    col: function (a) { return (is.hex(a) || is.rgb(a) || is.hsl(a)); },
    key: function (a) { return !defaultInstanceSettings.hasOwnProperty(a) && !defaultTweenSettings.hasOwnProperty(a) && a !== 'targets' && a !== 'keyframes'; },
  };

  // Easings

  function parseEasingParameters(string) {
    var match = /\(([^)]+)\)/.exec(string);
    return match ? match[1].split(',').map(function (p) { return parseFloat(p); }) : [];
  }

  // Spring solver inspired by Webkit Copyright © 2016 Apple Inc. All rights reserved. https://webkit.org/demos/spring/spring.js

  function spring(string, duration) {

    var params = parseEasingParameters(string);
    var mass = minMax(is.und(params[0]) ? 1 : params[0], .1, 100);
    var stiffness = minMax(is.und(params[1]) ? 100 : params[1], .1, 100);
    var damping = minMax(is.und(params[2]) ? 10 : params[2], .1, 100);
    var velocity =  minMax(is.und(params[3]) ? 0 : params[3], .1, 100);
    var w0 = Math.sqrt(stiffness / mass);
    var zeta = damping / (2 * Math.sqrt(stiffness * mass));
    var wd = zeta < 1 ? w0 * Math.sqrt(1 - zeta * zeta) : 0;
    var a = 1;
    var b = zeta < 1 ? (zeta * w0 + -velocity) / wd : -velocity + w0;

    function solver(t) {
      var progress = duration ? (duration * t) / 1000 : t;
      if (zeta < 1) {
        progress = Math.exp(-progress * zeta * w0) * (a * Math.cos(wd * progress) + b * Math.sin(wd * progress));
      } else {
        progress = (a + b * progress) * Math.exp(-progress * w0);
      }
      if (t === 0 || t === 1) { return t; }
      return 1 - progress;
    }

    function getDuration() {
      var cached = cache.springs[string];
      if (cached) { return cached; }
      var frame = 1/6;
      var elapsed = 0;
      var rest = 0;
      while(true) {
        elapsed += frame;
        if (solver(elapsed) === 1) {
          rest++;
          if (rest >= 16) { break; }
        } else {
          rest = 0;
        }
      }
      var duration = elapsed * frame * 1000;
      cache.springs[string] = duration;
      return duration;
    }

    return duration ? solver : getDuration;

  }

  // Basic steps easing implementation https://developer.mozilla.org/fr/docs/Web/CSS/transition-timing-function

  function steps(steps) {
    if ( steps === void 0 ) steps = 10;

    return function (t) { return Math.ceil((minMax(t, 0.000001, 1)) * steps) * (1 / steps); };
  }

  // BezierEasing https://github.com/gre/bezier-easing

  var bezier = (function () {

    var kSplineTableSize = 11;
    var kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

    function A(aA1, aA2) { return 1.0 - 3.0 * aA2 + 3.0 * aA1 }
    function B(aA1, aA2) { return 3.0 * aA2 - 6.0 * aA1 }
    function C(aA1)      { return 3.0 * aA1 }

    function calcBezier(aT, aA1, aA2) { return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT }
    function getSlope(aT, aA1, aA2) { return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1) }

    function binarySubdivide(aX, aA, aB, mX1, mX2) {
      var currentX, currentT, i = 0;
      do {
        currentT = aA + (aB - aA) / 2.0;
        currentX = calcBezier(currentT, mX1, mX2) - aX;
        if (currentX > 0.0) { aB = currentT; } else { aA = currentT; }
      } while (Math.abs(currentX) > 0.0000001 && ++i < 10);
      return currentT;
    }

    function newtonRaphsonIterate(aX, aGuessT, mX1, mX2) {
      for (var i = 0; i < 4; ++i) {
        var currentSlope = getSlope(aGuessT, mX1, mX2);
        if (currentSlope === 0.0) { return aGuessT; }
        var currentX = calcBezier(aGuessT, mX1, mX2) - aX;
        aGuessT -= currentX / currentSlope;
      }
      return aGuessT;
    }

    function bezier(mX1, mY1, mX2, mY2) {

      if (!(0 <= mX1 && mX1 <= 1 && 0 <= mX2 && mX2 <= 1)) { return; }
      var sampleValues = new Float32Array(kSplineTableSize);

      if (mX1 !== mY1 || mX2 !== mY2) {
        for (var i = 0; i < kSplineTableSize; ++i) {
          sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
        }
      }

      function getTForX(aX) {

        var intervalStart = 0;
        var currentSample = 1;
        var lastSample = kSplineTableSize - 1;

        for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
          intervalStart += kSampleStepSize;
        }

        --currentSample;

        var dist = (aX - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample]);
        var guessForT = intervalStart + dist * kSampleStepSize;
        var initialSlope = getSlope(guessForT, mX1, mX2);

        if (initialSlope >= 0.001) {
          return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
        } else if (initialSlope === 0.0) {
          return guessForT;
        } else {
          return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2);
        }

      }

      return function (x) {
        if (mX1 === mY1 && mX2 === mY2) { return x; }
        if (x === 0 || x === 1) { return x; }
        return calcBezier(getTForX(x), mY1, mY2);
      }

    }

    return bezier;

  })();

  var penner = (function () {

    // Based on jQuery UI's implemenation of easing equations from Robert Penner (http://www.robertpenner.com/easing)

    var eases = { linear: function () { return function (t) { return t; }; } };

    var functionEasings = {
      Sine: function () { return function (t) { return 1 - Math.cos(t * Math.PI / 2); }; },
      Expo: function () { return function (t) { return t ? Math.pow(2, 10 * t - 10) : 0; }; },
      Circ: function () { return function (t) { return 1 - Math.sqrt(1 - t * t); }; },
      Back: function () { return function (t) { return t * t * (3 * t - 2); }; },
      Bounce: function () { return function (t) {
        var pow2, b = 4;
        while (t < (( pow2 = Math.pow(2, --b)) - 1) / 11) {}
        return 1 / Math.pow(4, 3 - b) - 7.5625 * Math.pow(( pow2 * 3 - 2 ) / 22 - t, 2)
      }; },
      Elastic: function (amplitude, period) {
        if ( amplitude === void 0 ) amplitude = 1;
        if ( period === void 0 ) period = .5;

        var a = minMax(amplitude, 1, 10);
        var p = minMax(period, .1, 2);
        return function (t) {
          return (t === 0 || t === 1) ? t : 
            -a * Math.pow(2, 10 * (t - 1)) * Math.sin((((t - 1) - (p / (Math.PI * 2) * Math.asin(1 / a))) * (Math.PI * 2)) / p);
        }
      }
    };

    var baseEasings = ['Quad', 'Cubic', 'Quart', 'Quint'];

    baseEasings.forEach(function (name, i) {
      functionEasings[name] = function () { return function (t) { return Math.pow(t, i + 2); }; };
    });

    Object.keys(functionEasings).forEach(function (name) {
      var easeIn = functionEasings[name];
      eases['easeIn' + name] = easeIn;
      eases['easeOut' + name] = function (a, b) { return function (t) { return 1 - easeIn(a, b)(1 - t); }; };
      eases['easeInOut' + name] = function (a, b) { return function (t) { return t < 0.5 ? easeIn(a, b)(t * 2) / 2 : 
        1 - easeIn(a, b)(t * -2 + 2) / 2; }; };
      eases['easeOutIn' + name] = function (a, b) { return function (t) { return t < 0.5 ? (1 - easeIn(a, b)(1 - t * 2)) / 2 : 
        (easeIn(a, b)(t * 2 - 1) + 1) / 2; }; };
    });

    return eases;

  })();

  function parseEasings(easing, duration) {
    if (is.fnc(easing)) { return easing; }
    var name = easing.split('(')[0];
    var ease = penner[name];
    var args = parseEasingParameters(easing);
    switch (name) {
      case 'spring' : return spring(easing, duration);
      case 'cubicBezier' : return applyArguments(bezier, args);
      case 'steps' : return applyArguments(steps, args);
      default : return applyArguments(ease, args);
    }
  }

  // Strings

  function selectString(str) {
    try {
      var nodes = document.querySelectorAll(str);
      return nodes;
    } catch(e) {
      return;
    }
  }

  // Arrays

  function filterArray(arr, callback) {
    var len = arr.length;
    var thisArg = arguments.length >= 2 ? arguments[1] : void 0;
    var result = [];
    for (var i = 0; i < len; i++) {
      if (i in arr) {
        var val = arr[i];
        if (callback.call(thisArg, val, i, arr)) {
          result.push(val);
        }
      }
    }
    return result;
  }

  function flattenArray(arr) {
    return arr.reduce(function (a, b) { return a.concat(is.arr(b) ? flattenArray(b) : b); }, []);
  }

  function toArray(o) {
    if (is.arr(o)) { return o; }
    if (is.str(o)) { o = selectString(o) || o; }
    if (o instanceof NodeList || o instanceof HTMLCollection) { return [].slice.call(o); }
    return [o];
  }

  function arrayContains(arr, val) {
    return arr.some(function (a) { return a === val; });
  }

  // Objects

  function cloneObject(o) {
    var clone = {};
    for (var p in o) { clone[p] = o[p]; }
    return clone;
  }

  function replaceObjectProps(o1, o2) {
    var o = cloneObject(o1);
    for (var p in o1) { o[p] = o2.hasOwnProperty(p) ? o2[p] : o1[p]; }
    return o;
  }

  function mergeObjects(o1, o2) {
    var o = cloneObject(o1);
    for (var p in o2) { o[p] = is.und(o1[p]) ? o2[p] : o1[p]; }
    return o;
  }

  // Colors

  function rgbToRgba(rgbValue) {
    var rgb = /rgb\((\d+,\s*[\d]+,\s*[\d]+)\)/g.exec(rgbValue);
    return rgb ? ("rgba(" + (rgb[1]) + ",1)") : rgbValue;
  }

  function hexToRgba(hexValue) {
    var rgx = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    var hex = hexValue.replace(rgx, function (m, r, g, b) { return r + r + g + g + b + b; } );
    var rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    var r = parseInt(rgb[1], 16);
    var g = parseInt(rgb[2], 16);
    var b = parseInt(rgb[3], 16);
    return ("rgba(" + r + "," + g + "," + b + ",1)");
  }

  function hslToRgba(hslValue) {
    var hsl = /hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/g.exec(hslValue) || /hsla\((\d+),\s*([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)\)/g.exec(hslValue);
    var h = parseInt(hsl[1], 10) / 360;
    var s = parseInt(hsl[2], 10) / 100;
    var l = parseInt(hsl[3], 10) / 100;
    var a = hsl[4] || 1;
    function hue2rgb(p, q, t) {
      if (t < 0) { t += 1; }
      if (t > 1) { t -= 1; }
      if (t < 1/6) { return p + (q - p) * 6 * t; }
      if (t < 1/2) { return q; }
      if (t < 2/3) { return p + (q - p) * (2/3 - t) * 6; }
      return p;
    }
    var r, g, b;
    if (s == 0) {
      r = g = b = l;
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return ("rgba(" + (r * 255) + "," + (g * 255) + "," + (b * 255) + "," + a + ")");
  }

  function colorToRgb(val) {
    if (is.rgb(val)) { return rgbToRgba(val); }
    if (is.hex(val)) { return hexToRgba(val); }
    if (is.hsl(val)) { return hslToRgba(val); }
  }

  // Units

  function getUnit(val) {
    var split = /[+-]?\d*\.?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(%|px|pt|em|rem|in|cm|mm|ex|ch|pc|vw|vh|vmin|vmax|deg|rad|turn)?$/.exec(val);
    if (split) { return split[1]; }
  }

  function getTransformUnit(propName) {
    if (stringContains(propName, 'translate') || propName === 'perspective') { return 'px'; }
    if (stringContains(propName, 'rotate') || stringContains(propName, 'skew')) { return 'deg'; }
  }

  // Values

  function getFunctionValue(val, animatable) {
    if (!is.fnc(val)) { return val; }
    return val(animatable.target, animatable.id, animatable.total);
  }

  function getAttribute(el, prop) {
    return el.getAttribute(prop);
  }

  function convertPxToUnit(el, value, unit) {
    var valueUnit = getUnit(value);
    if (arrayContains([unit, 'deg', 'rad', 'turn'], valueUnit)) { return value; }
    var cached = cache.CSS[value + unit];
    if (!is.und(cached)) { return cached; }
    var baseline = 100;
    var tempEl = document.createElement(el.tagName);
    var parentEl = (el.parentNode && (el.parentNode !== document)) ? el.parentNode : document.body;
    parentEl.appendChild(tempEl);
    tempEl.style.position = 'absolute';
    tempEl.style.width = baseline + unit;
    var factor = baseline / tempEl.offsetWidth;
    parentEl.removeChild(tempEl);
    var convertedUnit = factor * parseFloat(value);
    cache.CSS[value + unit] = convertedUnit;
    return convertedUnit;
  }

  function getCSSValue(el, prop, unit) {
    if (prop in el.style) {
      var uppercasePropName = prop.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      var value = el.style[prop] || getComputedStyle(el).getPropertyValue(uppercasePropName) || '0';
      return unit ? convertPxToUnit(el, value, unit) : value;
    }
  }

  function getAnimationType(el, prop) {
    if (is.dom(el) && !is.inp(el) && (!is.nil(getAttribute(el, prop)) || (is.svg(el) && el[prop]))) { return 'attribute'; }
    if (is.dom(el) && arrayContains(validTransforms, prop)) { return 'transform'; }
    if (is.dom(el) && (prop !== 'transform' && getCSSValue(el, prop))) { return 'css'; }
    if (el[prop] != null) { return 'object'; }
  }

  function getElementTransforms(el) {
    if (!is.dom(el)) { return; }
    var str = el.style.transform || '';
    var reg  = /(\w+)\(([^)]*)\)/g;
    var transforms = new Map();
    var m; while (m = reg.exec(str)) { transforms.set(m[1], m[2]); }
    return transforms;
  }

  function getTransformValue(el, propName, animatable, unit) {
    var defaultVal = stringContains(propName, 'scale') ? 1 : 0 + getTransformUnit(propName);
    var value = getElementTransforms(el).get(propName) || defaultVal;
    if (animatable) {
      animatable.transforms.list.set(propName, value);
      animatable.transforms['last'] = propName;
    }
    return unit ? convertPxToUnit(el, value, unit) : value;
  }

  function getOriginalTargetValue(target, propName, unit, animatable) {
    switch (getAnimationType(target, propName)) {
      case 'transform': return getTransformValue(target, propName, animatable, unit);
      case 'css': return getCSSValue(target, propName, unit);
      case 'attribute': return getAttribute(target, propName);
      default: return target[propName] || 0;
    }
  }

  function getRelativeValue(to, from) {
    var operator = /^(\*=|\+=|-=)/.exec(to);
    if (!operator) { return to; }
    var u = getUnit(to) || 0;
    var x = parseFloat(from);
    var y = parseFloat(to.replace(operator[0], ''));
    switch (operator[0][0]) {
      case '+': return x + y + u;
      case '-': return x - y + u;
      case '*': return x * y + u;
    }
  }

  function validateValue(val, unit) {
    if (is.col(val)) { return colorToRgb(val); }
    if (/\s/g.test(val)) { return val; }
    var originalUnit = getUnit(val);
    var unitLess = originalUnit ? val.substr(0, val.length - originalUnit.length) : val;
    if (unit) { return unitLess + unit; }
    return unitLess;
  }

  // getTotalLength() equivalent for circle, rect, polyline, polygon and line shapes
  // adapted from https://gist.github.com/SebLambla/3e0550c496c236709744

  function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  function getCircleLength(el) {
    return Math.PI * 2 * getAttribute(el, 'r');
  }

  function getRectLength(el) {
    return (getAttribute(el, 'width') * 2) + (getAttribute(el, 'height') * 2);
  }

  function getLineLength(el) {
    return getDistance(
      {x: getAttribute(el, 'x1'), y: getAttribute(el, 'y1')}, 
      {x: getAttribute(el, 'x2'), y: getAttribute(el, 'y2')}
    );
  }

  function getPolylineLength(el) {
    var points = el.points;
    var totalLength = 0;
    var previousPos;
    for (var i = 0 ; i < points.numberOfItems; i++) {
      var currentPos = points.getItem(i);
      if (i > 0) { totalLength += getDistance(previousPos, currentPos); }
      previousPos = currentPos;
    }
    return totalLength;
  }

  function getPolygonLength(el) {
    var points = el.points;
    return getPolylineLength(el) + getDistance(points.getItem(points.numberOfItems - 1), points.getItem(0));
  }

  // Path animation

  function getTotalLength(el) {
    if (el.getTotalLength) { return el.getTotalLength(); }
    switch(el.tagName.toLowerCase()) {
      case 'circle': return getCircleLength(el);
      case 'rect': return getRectLength(el);
      case 'line': return getLineLength(el);
      case 'polyline': return getPolylineLength(el);
      case 'polygon': return getPolygonLength(el);
    }
  }

  function setDashoffset(el) {
    var pathLength = getTotalLength(el);
    el.setAttribute('stroke-dasharray', pathLength);
    return pathLength;
  }

  // Motion path

  function getParentSvgEl(el) {
    var parentEl = el.parentNode;
    while (is.svg(parentEl)) {
      if (!is.svg(parentEl.parentNode)) { break; }
      parentEl = parentEl.parentNode;
    }
    return parentEl;
  }

  function getParentSvg(pathEl, svgData) {
    var svg = svgData || {};
    var parentSvgEl = svg.el || getParentSvgEl(pathEl);
    var rect = parentSvgEl.getBoundingClientRect();
    var viewBoxAttr = getAttribute(parentSvgEl, 'viewBox');
    var width = rect.width;
    var height = rect.height;
    var viewBox = svg.viewBox || (viewBoxAttr ? viewBoxAttr.split(' ') : [0, 0, width, height]);
    return {
      el: parentSvgEl,
      viewBox: viewBox,
      x: viewBox[0] / 1,
      y: viewBox[1] / 1,
      w: width,
      h: height,
      vW: viewBox[2],
      vH: viewBox[3]
    }
  }

  function getPath(path, percent) {
    var pathEl = is.str(path) ? selectString(path)[0] : path;
    var p = percent || 100;
    return function(property) {
      return {
        property: property,
        el: pathEl,
        svg: getParentSvg(pathEl),
        totalLength: getTotalLength(pathEl) * (p / 100)
      }
    }
  }

  function getPathProgress(path, progress, isPathTargetInsideSVG) {
    function point(offset) {
      if ( offset === void 0 ) offset = 0;

      var l = progress + offset >= 1 ? progress + offset : 0;
      return path.el.getPointAtLength(l);
    }
    var svg = getParentSvg(path.el, path.svg);
    var p = point();
    var p0 = point(-1);
    var p1 = point(+1);
    var scaleX = isPathTargetInsideSVG ? 1 : svg.w / svg.vW;
    var scaleY = isPathTargetInsideSVG ? 1 : svg.h / svg.vH;
    switch (path.property) {
      case 'x': return (p.x - svg.x) * scaleX;
      case 'y': return (p.y - svg.y) * scaleY;
      case 'angle': return Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;
    }
  }

  // Decompose value

  function decomposeValue(val, unit) {
    // const rgx = /-?\d*\.?\d+/g; // handles basic numbers
    // const rgx = /[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g; // handles exponents notation
    var rgx = /[+-]?\d*\.?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g; // handles exponents notation
    var value = validateValue((is.pth(val) ? val.totalLength : val), unit) + '';
    return {
      original: value,
      numbers: value.match(rgx) ? value.match(rgx).map(Number) : [0],
      strings: (is.str(val) || unit) ? value.split(rgx) : []
    }
  }

  // Animatables

  function parseTargets(targets) {
    var targetsArray = targets ? (flattenArray(is.arr(targets) ? targets.map(toArray) : toArray(targets))) : [];
    return filterArray(targetsArray, function (item, pos, self) { return self.indexOf(item) === pos; });
  }

  function getAnimatables(targets) {
    var parsed = parseTargets(targets);
    return parsed.map(function (t, i) {
      return {target: t, id: i, total: parsed.length, transforms: { list: getElementTransforms(t) } };
    });
  }

  // Properties

  function normalizePropertyTweens(prop, tweenSettings) {
    var settings = cloneObject(tweenSettings);
    // Override duration if easing is a spring
    if (/^spring/.test(settings.easing)) { settings.duration = spring(settings.easing); }
    if (is.arr(prop)) {
      var l = prop.length;
      var isFromTo = (l === 2 && !is.obj(prop[0]));
      if (!isFromTo) {
        // Duration divided by the number of tweens
        if (!is.fnc(tweenSettings.duration)) { settings.duration = tweenSettings.duration / l; }
      } else {
        // Transform [from, to] values shorthand to a valid tween value
        prop = {value: prop};
      }
    }
    var propArray = is.arr(prop) ? prop : [prop];
    return propArray.map(function (v, i) {
      var obj = (is.obj(v) && !is.pth(v)) ? v : {value: v};
      // Default delay value should only be applied to the first tween
      if (is.und(obj.delay)) { obj.delay = !i ? tweenSettings.delay : 0; }
      // Default endDelay value should only be applied to the last tween
      if (is.und(obj.endDelay)) { obj.endDelay = i === propArray.length - 1 ? tweenSettings.endDelay : 0; }
      return obj;
    }).map(function (k) { return mergeObjects(k, settings); });
  }


  function flattenKeyframes(keyframes) {
    var propertyNames = filterArray(flattenArray(keyframes.map(function (key) { return Object.keys(key); })), function (p) { return is.key(p); })
    .reduce(function (a,b) { if (a.indexOf(b) < 0) { a.push(b); } return a; }, []);
    var properties = {};
    var loop = function ( i ) {
      var propName = propertyNames[i];
      properties[propName] = keyframes.map(function (key) {
        var newKey = {};
        for (var p in key) {
          if (is.key(p)) {
            if (p == propName) { newKey.value = key[p]; }
          } else {
            newKey[p] = key[p];
          }
        }
        return newKey;
      });
    };

    for (var i = 0; i < propertyNames.length; i++) loop( i );
    return properties;
  }

  function getProperties(tweenSettings, params) {
    var properties = [];
    var keyframes = params.keyframes;
    if (keyframes) { params = mergeObjects(flattenKeyframes(keyframes), params); }
    for (var p in params) {
      if (is.key(p)) {
        properties.push({
          name: p,
          tweens: normalizePropertyTweens(params[p], tweenSettings)
        });
      }
    }
    return properties;
  }

  // Tweens

  function normalizeTweenValues(tween, animatable) {
    var t = {};
    for (var p in tween) {
      var value = getFunctionValue(tween[p], animatable);
      if (is.arr(value)) {
        value = value.map(function (v) { return getFunctionValue(v, animatable); });
        if (value.length === 1) { value = value[0]; }
      }
      t[p] = value;
    }
    t.duration = parseFloat(t.duration);
    t.delay = parseFloat(t.delay);
    return t;
  }

  function normalizeTweens(prop, animatable) {
    var previousTween;
    return prop.tweens.map(function (t) {
      var tween = normalizeTweenValues(t, animatable);
      var tweenValue = tween.value;
      var to = is.arr(tweenValue) ? tweenValue[1] : tweenValue;
      var toUnit = getUnit(to);
      var originalValue = getOriginalTargetValue(animatable.target, prop.name, toUnit, animatable);
      var previousValue = previousTween ? previousTween.to.original : originalValue;
      var from = is.arr(tweenValue) ? tweenValue[0] : previousValue;
      var fromUnit = getUnit(from) || getUnit(originalValue);
      var unit = toUnit || fromUnit;
      if (is.und(to)) { to = previousValue; }
      tween.from = decomposeValue(from, unit);
      tween.to = decomposeValue(getRelativeValue(to, from), unit);
      tween.start = previousTween ? previousTween.end : 0;
      tween.end = tween.start + tween.delay + tween.duration + tween.endDelay;
      tween.easing = parseEasings(tween.easing, tween.duration);
      tween.isPath = is.pth(tweenValue);
      tween.isPathTargetInsideSVG = tween.isPath && is.svg(animatable.target);
      tween.isColor = is.col(tween.from.original);
      if (tween.isColor) { tween.round = 1; }
      previousTween = tween;
      return tween;
    });
  }

  // Tween progress

  var setProgressValue = {
    css: function (t, p, v) { return t.style[p] = v; },
    attribute: function (t, p, v) { return t.setAttribute(p, v); },
    object: function (t, p, v) { return t[p] = v; },
    transform: function (t, p, v, transforms, manual) {
      transforms.list.set(p, v);
      if (p === transforms.last || manual) {
        var str = '';
        transforms.list.forEach(function (value, prop) { str += prop + "(" + value + ") "; });
        t.style.transform = str;
      }
    }
  };

  // Set Value helper

  function setTargetsValue(targets, properties) {
    var animatables = getAnimatables(targets);
    animatables.forEach(function (animatable) {
      for (var property in properties) {
        var value = getFunctionValue(properties[property], animatable);
        var target = animatable.target;
        var valueUnit = getUnit(value);
        var originalValue = getOriginalTargetValue(target, property, valueUnit, animatable);
        var unit = valueUnit || getUnit(originalValue);
        var to = getRelativeValue(validateValue(value, unit), originalValue);
        var animType = getAnimationType(target, property);
        setProgressValue[animType](target, property, to, animatable.transforms, true);
      }
    });
  }

  // Animations

  function createAnimation(animatable, prop) {
    var animType = getAnimationType(animatable.target, prop.name);
    if (animType) {
      var tweens = normalizeTweens(prop, animatable);
      var lastTween = tweens[tweens.length - 1];
      return {
        type: animType,
        property: prop.name,
        animatable: animatable,
        tweens: tweens,
        duration: lastTween.end,
        delay: tweens[0].delay,
        endDelay: lastTween.endDelay
      }
    }
  }

  function getAnimations(animatables, properties) {
    return filterArray(flattenArray(animatables.map(function (animatable) {
      return properties.map(function (prop) {
        return createAnimation(animatable, prop);
      });
    })), function (a) { return !is.und(a); });
  }

  // Create Instance

  function getInstanceTimings(animations, tweenSettings) {
    var animLength = animations.length;
    var getTlOffset = function (anim) { return anim.timelineOffset ? anim.timelineOffset : 0; };
    var timings = {};
    timings.duration = animLength ? Math.max.apply(Math, animations.map(function (anim) { return getTlOffset(anim) + anim.duration; })) : tweenSettings.duration;
    timings.delay = animLength ? Math.min.apply(Math, animations.map(function (anim) { return getTlOffset(anim) + anim.delay; })) : tweenSettings.delay;
    timings.endDelay = animLength ? timings.duration - Math.max.apply(Math, animations.map(function (anim) { return getTlOffset(anim) + anim.duration - anim.endDelay; })) : tweenSettings.endDelay;
    return timings;
  }

  var instanceID = 0;

  function createNewInstance(params) {
    var instanceSettings = replaceObjectProps(defaultInstanceSettings, params);
    var tweenSettings = replaceObjectProps(defaultTweenSettings, params);
    var properties = getProperties(tweenSettings, params);
    var animatables = getAnimatables(params.targets);
    var animations = getAnimations(animatables, properties);
    var timings = getInstanceTimings(animations, tweenSettings);
    var id = instanceID;
    instanceID++;
    return mergeObjects(instanceSettings, {
      id: id,
      children: [],
      animatables: animatables,
      animations: animations,
      duration: timings.duration,
      delay: timings.delay,
      endDelay: timings.endDelay
    });
  }

  // Core

  var activeInstances = [];

  var engine = (function () {
    var raf;

    function play() {
      if (!raf && (!isDocumentHidden() || !anime.suspendWhenDocumentHidden) && activeInstances.length > 0) {
        raf = requestAnimationFrame(step);
      }
    }
    function step(t) {
      // memo on algorithm issue:
      // dangerous iteration over mutable `activeInstances`
      // (that collection may be updated from within callbacks of `tick`-ed animation instances)
      var activeInstancesLength = activeInstances.length;
      var i = 0;
      while (i < activeInstancesLength) {
        var activeInstance = activeInstances[i];
        if (!activeInstance.paused) {
          activeInstance.tick(t);
          i++;
        } else {
          activeInstances.splice(i, 1);
          activeInstancesLength--;
        }
      }
      raf = i > 0 ? requestAnimationFrame(step) : undefined;
    }

    function handleVisibilityChange() {
      if (!anime.suspendWhenDocumentHidden) { return; }

      if (isDocumentHidden()) {
        // suspend ticks
        raf = cancelAnimationFrame(raf);
      } else { // is back to active tab
        // first adjust animations to consider the time that ticks were suspended
        activeInstances.forEach(
          function (instance) { return instance ._onDocumentVisibility(); }
        );
        engine();
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return play;
  })();

  function isDocumentHidden() {
    return !!document && document.hidden;
  }

  // Public Instance

  function anime(params) {
    if ( params === void 0 ) params = {};


    var startTime = 0, lastTime = 0, now = 0;
    var children, childrenLength = 0;
    var resolve = null;

    function makePromise(instance) {
      var promise = window.Promise && new Promise(function (_resolve) { return resolve = _resolve; });
      instance.finished = promise;
      return promise;
    }

    var instance = createNewInstance(params);
    makePromise(instance);

    function toggleInstanceDirection() {
      var direction = instance.direction;
      if (direction !== 'alternate') {
        instance.direction = direction !== 'normal' ? 'normal' : 'reverse';
      }
      instance.reversed = !instance.reversed;
      children.forEach(function (child) { return child.reversed = instance.reversed; });
    }

    function adjustTime(time) {
      return instance.reversed ? instance.duration - time : time;
    }

    function resetTime() {
      startTime = 0;
      lastTime = adjustTime(instance.currentTime) * (1 / anime.speed);
    }

    function seekChild(time, child) {
      if (child) { child.seek(time - child.timelineOffset); }
    }

    function syncInstanceChildren(time) {
      if (!instance.reversePlayback) {
        for (var i = 0; i < childrenLength; i++) { seekChild(time, children[i]); }
      } else {
        for (var i$1 = childrenLength; i$1--;) { seekChild(time, children[i$1]); }
      }
    }

    function setAnimationsProgress(insTime) {
      var i = 0;
      var animations = instance.animations;
      var animationsLength = animations.length;
      while (i < animationsLength) {
        var anim = animations[i];
        var animatable = anim.animatable;
        var tweens = anim.tweens;
        var tweenLength = tweens.length - 1;
        var tween = tweens[tweenLength];
        // Only check for keyframes if there is more than one tween
        if (tweenLength) { tween = filterArray(tweens, function (t) { return (insTime < t.end); })[0] || tween; }
        var elapsed = minMax(insTime - tween.start - tween.delay, 0, tween.duration) / tween.duration;
        var eased = isNaN(elapsed) ? 1 : tween.easing(elapsed);
        var strings = tween.to.strings;
        var round = tween.round;
        var numbers = [];
        var toNumbersLength = tween.to.numbers.length;
        var progress = (void 0);
        for (var n = 0; n < toNumbersLength; n++) {
          var value = (void 0);
          var toNumber = tween.to.numbers[n];
          var fromNumber = tween.from.numbers[n] || 0;
          if (!tween.isPath) {
            value = fromNumber + (eased * (toNumber - fromNumber));
          } else {
            value = getPathProgress(tween.value, eased * toNumber, tween.isPathTargetInsideSVG);
          }
          if (round) {
            if (!(tween.isColor && n > 2)) {
              value = Math.round(value * round) / round;
            }
          }
          numbers.push(value);
        }
        // Manual Array.reduce for better performances
        var stringsLength = strings.length;
        if (!stringsLength) {
          progress = numbers[0];
        } else {
          progress = strings[0];
          for (var s = 0; s < stringsLength; s++) {
            strings[s];
            var b = strings[s + 1];
            var n$1 = numbers[s];
            if (!isNaN(n$1)) {
              if (!b) {
                progress += n$1 + ' ';
              } else {
                progress += n$1 + b;
              }
            }
          }
        }
        setProgressValue[anim.type](animatable.target, anim.property, progress, animatable.transforms);
        anim.currentValue = progress;
        i++;
      }
    }

    function setCallback(cb) {
      if (instance[cb] && !instance.passThrough) { instance[cb](instance); }
    }

    function countIteration() {
      if (instance.remaining && instance.remaining !== true) {
        instance.remaining--;
      }
    }

    function setInstanceProgress(engineTime) {
      var insDuration = instance.duration;
      var insDelay = instance.delay;
      var insEndDelay = insDuration - instance.endDelay;
      var insTime = adjustTime(engineTime);
      instance.progress = minMax((insTime / insDuration) * 100, 0, 100);
      instance.reversePlayback = insTime < instance.currentTime;
      if (children) { syncInstanceChildren(insTime); }
      if (!instance.began && instance.currentTime > 0) {
        instance.began = true;
        setCallback('begin');
      }
      if (!instance.loopBegan && instance.currentTime > 0) {
        instance.loopBegan = true;
        setCallback('loopBegin');
      }
      if (insTime <= insDelay && instance.currentTime !== 0) {
        setAnimationsProgress(0);
      }
      if ((insTime >= insEndDelay && instance.currentTime !== insDuration) || !insDuration) {
        setAnimationsProgress(insDuration);
      }
      if (insTime > insDelay && insTime < insEndDelay) {
        if (!instance.changeBegan) {
          instance.changeBegan = true;
          instance.changeCompleted = false;
          setCallback('changeBegin');
        }
        setCallback('change');
        setAnimationsProgress(insTime);
      } else {
        if (instance.changeBegan) {
          instance.changeCompleted = true;
          instance.changeBegan = false;
          setCallback('changeComplete');
        }
      }
      instance.currentTime = minMax(insTime, 0, insDuration);
      if (instance.began) { setCallback('update'); }
      if (engineTime >= insDuration) {
        lastTime = 0;
        countIteration();
        if (!instance.remaining) {
          instance.paused = true;
          if (!instance.completed) {
            instance.completed = true;
            setCallback('loopComplete');
            setCallback('complete');
            if (!instance.passThrough && 'Promise' in window) {
              resolve();
              makePromise(instance);
            }
          }
        } else {
          startTime = now;
          setCallback('loopComplete');
          instance.loopBegan = false;
          if (instance.direction === 'alternate') {
            toggleInstanceDirection();
          }
        }
      }
    }

    instance.reset = function() {
      var direction = instance.direction;
      instance.passThrough = false;
      instance.currentTime = 0;
      instance.progress = 0;
      instance.paused = true;
      instance.began = false;
      instance.loopBegan = false;
      instance.changeBegan = false;
      instance.completed = false;
      instance.changeCompleted = false;
      instance.reversePlayback = false;
      instance.reversed = direction === 'reverse';
      instance.remaining = instance.loop;
      children = instance.children;
      childrenLength = children.length;
      for (var i = childrenLength; i--;) { instance.children[i].reset(); }
      if (instance.reversed && instance.loop !== true || (direction === 'alternate' && instance.loop === 1)) { instance.remaining++; }
      setAnimationsProgress(instance.reversed ? instance.duration : 0);
    };

    // internal method (for engine) to adjust animation timings before restoring engine ticks (rAF)
    instance._onDocumentVisibility = resetTime;

    // Set Value helper

    instance.set = function(targets, properties) {
      setTargetsValue(targets, properties);
      return instance;
    };

    instance.tick = function(t) {
      now = t;
      if (!startTime) { startTime = now; }
      setInstanceProgress((now + (lastTime - startTime)) * anime.speed);
    };

    instance.seek = function(time) {
      setInstanceProgress(adjustTime(time));
    };

    instance.pause = function() {
      instance.paused = true;
      resetTime();
    };

    instance.play = function() {
      if (!instance.paused) { return; }
      if (instance.completed) { instance.reset(); }
      instance.paused = false;
      activeInstances.push(instance);
      resetTime();
      engine();
    };

    instance.reverse = function() {
      toggleInstanceDirection();
      instance.completed = instance.reversed ? false : true;
      resetTime();
    };

    instance.restart = function() {
      instance.reset();
      instance.play();
    };

    instance.remove = function(targets) {
      var targetsArray = parseTargets(targets);
      removeTargetsFromInstance(targetsArray, instance);
    };

    instance.reset();

    if (instance.autoplay) { instance.play(); }

    return instance;

  }

  // Remove targets from animation

  function removeTargetsFromAnimations(targetsArray, animations) {
    for (var a = animations.length; a--;) {
      if (arrayContains(targetsArray, animations[a].animatable.target)) {
        animations.splice(a, 1);
      }
    }
  }

  function removeTargetsFromInstance(targetsArray, instance) {
    var animations = instance.animations;
    var children = instance.children;
    removeTargetsFromAnimations(targetsArray, animations);
    for (var c = children.length; c--;) {
      var child = children[c];
      var childAnimations = child.animations;
      removeTargetsFromAnimations(targetsArray, childAnimations);
      if (!childAnimations.length && !child.children.length) { children.splice(c, 1); }
    }
    if (!animations.length && !children.length) { instance.pause(); }
  }

  function removeTargetsFromActiveInstances(targets) {
    var targetsArray = parseTargets(targets);
    for (var i = activeInstances.length; i--;) {
      var instance = activeInstances[i];
      removeTargetsFromInstance(targetsArray, instance);
    }
  }

  // Stagger helpers

  function stagger(val, params) {
    if ( params === void 0 ) params = {};

    var direction = params.direction || 'normal';
    var easing = params.easing ? parseEasings(params.easing) : null;
    var grid = params.grid;
    var axis = params.axis;
    var fromIndex = params.from || 0;
    var fromFirst = fromIndex === 'first';
    var fromCenter = fromIndex === 'center';
    var fromLast = fromIndex === 'last';
    var isRange = is.arr(val);
    var val1 = isRange ? parseFloat(val[0]) : parseFloat(val);
    var val2 = isRange ? parseFloat(val[1]) : 0;
    var unit = getUnit(isRange ? val[1] : val) || 0;
    var start = params.start || 0 + (isRange ? val1 : 0);
    var values = [];
    var maxValue = 0;
    return function (el, i, t) {
      if (fromFirst) { fromIndex = 0; }
      if (fromCenter) { fromIndex = (t - 1) / 2; }
      if (fromLast) { fromIndex = t - 1; }
      if (!values.length) {
        for (var index = 0; index < t; index++) {
          if (!grid) {
            values.push(Math.abs(fromIndex - index));
          } else {
            var fromX = !fromCenter ? fromIndex%grid[0] : (grid[0]-1)/2;
            var fromY = !fromCenter ? Math.floor(fromIndex/grid[0]) : (grid[1]-1)/2;
            var toX = index%grid[0];
            var toY = Math.floor(index/grid[0]);
            var distanceX = fromX - toX;
            var distanceY = fromY - toY;
            var value = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
            if (axis === 'x') { value = -distanceX; }
            if (axis === 'y') { value = -distanceY; }
            values.push(value);
          }
          maxValue = Math.max.apply(Math, values);
        }
        if (easing) { values = values.map(function (val) { return easing(val / maxValue) * maxValue; }); }
        if (direction === 'reverse') { values = values.map(function (val) { return axis ? (val < 0) ? val * -1 : -val : Math.abs(maxValue - val); }); }
      }
      var spacing = isRange ? (val2 - val1) / maxValue : val1;
      return start + (spacing * (Math.round(values[i] * 100) / 100)) + unit;
    }
  }

  // Timeline

  function timeline(params) {
    if ( params === void 0 ) params = {};

    var tl = anime(params);
    tl.duration = 0;
    tl.add = function(instanceParams, timelineOffset) {
      var tlIndex = activeInstances.indexOf(tl);
      var children = tl.children;
      if (tlIndex > -1) { activeInstances.splice(tlIndex, 1); }
      function passThrough(ins) { ins.passThrough = true; }
      for (var i = 0; i < children.length; i++) { passThrough(children[i]); }
      var insParams = mergeObjects(instanceParams, replaceObjectProps(defaultTweenSettings, params));
      insParams.targets = insParams.targets || params.targets;
      var tlDuration = tl.duration;
      insParams.autoplay = false;
      insParams.direction = tl.direction;
      insParams.timelineOffset = is.und(timelineOffset) ? tlDuration : getRelativeValue(timelineOffset, tlDuration);
      passThrough(tl);
      tl.seek(insParams.timelineOffset);
      var ins = anime(insParams);
      passThrough(ins);
      children.push(ins);
      var timings = getInstanceTimings(children, params);
      tl.delay = timings.delay;
      tl.endDelay = timings.endDelay;
      tl.duration = timings.duration;
      tl.seek(0);
      tl.reset();
      if (tl.autoplay) { tl.play(); }
      return tl;
    };
    return tl;
  }

  anime.version = '3.2.1';
  anime.speed = 1;
  // TODO:#review: naming, documentation
  anime.suspendWhenDocumentHidden = true;
  anime.running = activeInstances;
  anime.remove = removeTargetsFromActiveInstances;
  anime.get = getOriginalTargetValue;
  anime.set = setTargetsValue;
  anime.convertPx = convertPxToUnit;
  anime.path = getPath;
  anime.setDashoffset = setDashoffset;
  anime.stagger = stagger;
  anime.timeline = timeline;
  anime.easing = parseEasings;
  anime.penner = penner;
  anime.random = function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; };

  var ResizeAnimate = /*#__PURE__*/function (_Plugin) {
    function ResizeAnimate(container) {
      var _this;
      _classCallCheck(this, ResizeAnimate);
      _this = _callSuper(this, ResizeAnimate, [container]);
      _defineProperty(_this, "onDragStop", function (sensorEvent) {
        var _this$container$optio = _this.container.options,
          animate = _this$container$optio.animate,
          animateDuration = _this$container$optio.animateDuration;
        if (animate) {
          var styleProps = {};
          var _this$container = _this.container,
            element = _this$container.element,
            helper = _this$container.helper;
          var originalPosition = _this.container.originalAttrs.position;
          var position = _this.container.currentAttrs.position;
          styleProps.width = "".concat(getWidth(helper), "px");
          styleProps.height = "".concat(height(helper), "px");
          styleProps.top = "".concat(styleAsNumber(element, 'top') + (position.top - originalPosition.top), "px");
          styleProps.left = "".concat(styleAsNumber(element, 'left') + (position.left - originalPosition.left), "px");
          anime(_objectSpread2(_objectSpread2({}, styleProps), {
            targets: [element],
            duration: animateDuration,
            easing: 'linear',
            update: function update() {
              _this.container.currentAttrs.size = {
                width: getWidth(element),
                height: height(element)
              };
              _this.container.currentAttrs.position = {
                left: styleAsNumber(element, 'left'),
                top: styleAsNumber(element, 'top')
              };
              _this.container.updateResizableElements(_this.container.currentAttrs.size);
            }
          }));
        }
      });
      _this.attach();
      return _this;
    }
    _inherits(ResizeAnimate, _Plugin);
    return _createClass(ResizeAnimate, [{
      key: "supported",
      get: function get() {
        return this.isResizable();
      }
    }]);
  }(Plugin);

  var ResizeGhost = /*#__PURE__*/function (_Plugin) {
    function ResizeGhost(container) {
      var _this;
      _classCallCheck(this, ResizeGhost);
      _this = _callSuper(this, ResizeGhost, [container]);
      _defineProperty(_this, "ghost", null);
      _defineProperty(_this, "onDragStart", function (sensorEvent) {
        var ghost = _this.container.options.ghost;
        if (ghost) {
          var originalElement = _this.container.originalElement;
          var size = _this.container.currentAttrs.size;
          _this.ghost = originalElement.cloneNode(true);
          style(_this.ghost, {
            display: 'block',
            position: 'relative',
            width: "".concat(size.width, "px"),
            height: "".concat(size.height, "px"),
            top: '0px',
            left: '0px',
            margin: '0px',
            opacity: 0.25
          });
          addClass(_this.ghost, _this.container.ghostClass);
          _this.container.helper.appendChild(_this.ghost);
        }
      });
      _defineProperty(_this, "onDragMove", function (sensorEvent) {
        if (_this.ghost) {
          var size = _this.container.currentAttrs.size;
          style(_this.ghost, {
            width: "".concat(size.width, "px"),
            height: "".concat(size.height, "px")
          });
        }
      });
      _defineProperty(_this, "onDragStop", function (sensorEvent) {
        if (_this.ghost) {
          _this.container.helper.removeChild(_this.ghost);
          _this.ghost = null;
        }
      });
      _this.attach();
      return _this;
    }
    _inherits(ResizeGhost, _Plugin);
    return _createClass(ResizeGhost, [{
      key: "supported",
      get: function get() {
        return this.isResizable();
      }
    }]);
  }(Plugin);

  var tryToString = tryToString$5;

  var $TypeError$1 = TypeError;

  var deletePropertyOrThrow$1 = function (O, P) {
    if (!delete O[P]) throw $TypeError$1('Cannot delete property ' + tryToString(P) + ' of ' + tryToString(O));
  };

  var toAbsoluteIndex = toAbsoluteIndex$3;
  var lengthOfArrayLike$1 = lengthOfArrayLike$7;
  var createProperty = createProperty$3;

  var $Array = Array;
  var max = Math.max;

  var arraySliceSimple = function (O, start, end) {
    var length = lengthOfArrayLike$1(O);
    var k = toAbsoluteIndex(start, length);
    var fin = toAbsoluteIndex(end === undefined ? length : end, length);
    var result = $Array(max(fin - k, 0));
    for (var n = 0; k < fin; k++, n++) createProperty(result, n, O[k]);
    result.length = n;
    return result;
  };

  var arraySlice$1 = arraySliceSimple;

  var floor = Math.floor;

  var mergeSort = function (array, comparefn) {
    var length = array.length;
    var middle = floor(length / 2);
    return length < 8 ? insertionSort(array, comparefn) : merge(
      array,
      mergeSort(arraySlice$1(array, 0, middle), comparefn),
      mergeSort(arraySlice$1(array, middle), comparefn),
      comparefn
    );
  };

  var insertionSort = function (array, comparefn) {
    var length = array.length;
    var i = 1;
    var element, j;

    while (i < length) {
      j = i;
      element = array[i];
      while (j && comparefn(array[j - 1], element) > 0) {
        array[j] = array[--j];
      }
      if (j !== i++) array[j] = element;
    } return array;
  };

  var merge = function (array, left, right, comparefn) {
    var llength = left.length;
    var rlength = right.length;
    var lindex = 0;
    var rindex = 0;

    while (lindex < llength || rindex < rlength) {
      array[lindex + rindex] = (lindex < llength && rindex < rlength)
        ? comparefn(left[lindex], right[rindex]) <= 0 ? left[lindex++] : right[rindex++]
        : lindex < llength ? left[lindex++] : right[rindex++];
    } return array;
  };

  var arraySort = mergeSort;

  var userAgent$1 = engineUserAgent;

  var firefox = userAgent$1.match(/firefox\/(\d+)/i);

  var engineFfVersion = !!firefox && +firefox[1];

  var UA = engineUserAgent;

  var engineIsIeOrEdge = /MSIE|Trident/.test(UA);

  var userAgent = engineUserAgent;

  var webkit = userAgent.match(/AppleWebKit\/(\d+)\./);

  var engineWebkitVersion = !!webkit && +webkit[1];

  var $$7 = _export;
  var uncurryThis$3 = functionUncurryThis;
  var aCallable = aCallable$a;
  var toObject = toObject$4;
  var lengthOfArrayLike = lengthOfArrayLike$7;
  var deletePropertyOrThrow = deletePropertyOrThrow$1;
  var toString$2 = toString$a;
  var fails$2 = fails$l;
  var internalSort = arraySort;
  var arrayMethodIsStrict$2 = arrayMethodIsStrict$5;
  var FF = engineFfVersion;
  var IE_OR_EDGE = engineIsIeOrEdge;
  var V8 = engineV8Version;
  var WEBKIT = engineWebkitVersion;

  var test = [];
  var nativeSort = uncurryThis$3(test.sort);
  var push = uncurryThis$3(test.push);

  // IE8-
  var FAILS_ON_UNDEFINED = fails$2(function () {
    test.sort(undefined);
  });
  // V8 bug
  var FAILS_ON_NULL = fails$2(function () {
    test.sort(null);
  });
  // Old WebKit
  var STRICT_METHOD$1 = arrayMethodIsStrict$2('sort');

  var STABLE_SORT = !fails$2(function () {
    // feature detection can be too slow, so check engines versions
    if (V8) return V8 < 70;
    if (FF && FF > 3) return;
    if (IE_OR_EDGE) return true;
    if (WEBKIT) return WEBKIT < 603;

    var result = '';
    var code, chr, value, index;

    // generate an array with more 512 elements (Chakra and old V8 fails only in this case)
    for (code = 65; code < 76; code++) {
      chr = String.fromCharCode(code);

      switch (code) {
        case 66: case 69: case 70: case 72: value = 3; break;
        case 68: case 71: value = 4; break;
        default: value = 2;
      }

      for (index = 0; index < 47; index++) {
        test.push({ k: chr + index, v: value });
      }
    }

    test.sort(function (a, b) { return b.v - a.v; });

    for (index = 0; index < test.length; index++) {
      chr = test[index].k.charAt(0);
      if (result.charAt(result.length - 1) !== chr) result += chr;
    }

    return result !== 'DGBEFHACIJK';
  });

  var FORCED$1 = FAILS_ON_UNDEFINED || !FAILS_ON_NULL || !STRICT_METHOD$1 || !STABLE_SORT;

  var getSortCompare = function (comparefn) {
    return function (x, y) {
      if (y === undefined) return -1;
      if (x === undefined) return 1;
      if (comparefn !== undefined) return +comparefn(x, y) || 0;
      return toString$2(x) > toString$2(y) ? 1 : -1;
    };
  };

  // `Array.prototype.sort` method
  // https://tc39.es/ecma262/#sec-array.prototype.sort
  $$7({ target: 'Array', proto: true, forced: FORCED$1 }, {
    sort: function sort(comparefn) {
      if (comparefn !== undefined) aCallable(comparefn);

      var array = toObject(this);

      if (STABLE_SORT) return comparefn === undefined ? nativeSort(array) : nativeSort(array, comparefn);

      var items = [];
      var arrayLength = lengthOfArrayLike(array);
      var itemsLength, index;

      for (index = 0; index < arrayLength; index++) {
        if (index in array) push(items, array[index]);
      }

      internalSort(items, getSortCompare(comparefn));

      itemsLength = lengthOfArrayLike(items);
      index = 0;

      while (index < itemsLength) array[index] = items[index++];
      while (index < arrayLength) deletePropertyOrThrow(array, index++);

      return array;
    }
  });

  var StackController = /*#__PURE__*/function (_Plugin) {
    function StackController(container) {
      var _this;
      _classCallCheck(this, StackController);
      _this = _callSuper(this, StackController, [container]);
      _defineProperty(_this, "onDragStart", function (event) {
        if (_this.stack.length > 0) {
          var helper = _this.container.helper;
          var sorted = _this.stack.sort(function (a, b) {
            return styleAsNumber(a, 'zIndex') - styleAsNumber(b, 'zIndex');
          });
          var min = styleAsNumber(sorted[0], 'zIndex');
          sorted.forEach(function (element, idx) {
            style(element, {
              zIndex: min + idx
            });
          });
          style(helper, {
            zIndex: min + sorted.length
          });
        }
      });
      _this.attach();
      return _this;
    }
    _inherits(StackController, _Plugin);
    return _createClass(StackController, [{
      key: "supported",
      get: function get() {
        return this.isDraggable();
      }
    }, {
      key: "stack",
      get: function get() {
        var options = this.container.options;
        return options.stack ? qsa(document, options.stack) : [];
      }
    }]);
  }(Plugin);

  var wellKnownSymbol$1 = wellKnownSymbol$g;
  var create = objectCreate;
  var defineProperty = objectDefineProperty.f;

  var UNSCOPABLES = wellKnownSymbol$1('unscopables');
  var ArrayPrototype = Array.prototype;

  // Array.prototype[@@unscopables]
  // https://tc39.es/ecma262/#sec-array.prototype-@@unscopables
  if (ArrayPrototype[UNSCOPABLES] == undefined) {
    defineProperty(ArrayPrototype, UNSCOPABLES, {
      configurable: true,
      value: create(null)
    });
  }

  // add a key to Array.prototype[@@unscopables]
  var addToUnscopables$1 = function (key) {
    ArrayPrototype[UNSCOPABLES][key] = true;
  };

  var $$6 = _export;
  var $find = arrayIteration.find;
  var addToUnscopables = addToUnscopables$1;

  var FIND = 'find';
  var SKIPS_HOLES = true;

  // Shouldn't skip holes
  if (FIND in []) Array(1)[FIND](function () { SKIPS_HOLES = false; });

  // `Array.prototype.find` method
  // https://tc39.es/ecma262/#sec-array.prototype.find
  $$6({ target: 'Array', proto: true, forced: SKIPS_HOLES }, {
    find: function find(callbackfn /* , that = undefined */) {
      return $find(this, callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    }
  });

  // https://tc39.es/ecma262/#sec-array.prototype-@@unscopables
  addToUnscopables(FIND);

  var StyleDecorator = /*#__PURE__*/function (_Plugin) {
    function StyleDecorator(container, property) {
      var _this;
      var target = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
      _classCallCheck(this, StyleDecorator);
      _this = _callSuper(this, StyleDecorator, [container]);
      _defineProperty(_this, "property", null);
      _defineProperty(_this, "target", null);
      _defineProperty(_this, "previousValue", null);
      _defineProperty(_this, "onDragStart", function (event) {
        if (!_this.target) {
          _this.target = _this.container.helper;
        }
        if (_this.value !== null && !_this.isSortableInDraggable()) {
          _this.previousValue = _this.getPreviousValue();
          style(_this.target, _defineProperty({}, _this.property, _this.value));
        }
      });
      _defineProperty(_this, "onDragStop", function (event) {
        if (_this.previousValue !== null) {
          style(_this.target, _defineProperty({}, _this.property, _this.previousValue));
          _this.target = null;
        }
      });
      _this.property = property;
      _this.target = target ? target instanceof HTMLElement ? target : document.querySelector(target) : null;
      _this.attach();
      return _this;
    }
    _inherits(StyleDecorator, _Plugin);
    return _createClass(StyleDecorator, [{
      key: "supported",
      get: function get() {
        return this.isDraggable() || this.isSortable();
      }
    }, {
      key: "detach",
      value: function detach() {
        this.constructor.propertyCache = [];
        _superPropGet(StyleDecorator, "detach", this, 3)([]);
      }
    }, {
      key: "value",
      get: function get() {
        var options = this.container.options;
        return this.property && !isUndefined$1(options[this.property]) ? options[this.property] : null;
      }
    }, {
      key: "isSortableInDraggable",
      value: function isSortableInDraggable() {
        return this.isDraggable() && this.container.connectedDraggable;
      }
    }, {
      key: "getPreviousValue",
      value: function getPreviousValue() {
        var _this2 = this;
        var propertyCache = this.constructor.propertyCache;
        var entry = propertyCache.find(function (item) {
          return item.element === _this2.target && item.property === _this2.property;
        });
        if (!entry) {
          entry = {
            element: this.target,
            property: this.property,
            value: style(this.target, this.property)
          };
          propertyCache.push(entry);
        }
        return entry.value;
      }
    }]);
  }(Plugin);
  _defineProperty(StyleDecorator, "propertyCache", []);

  var Sensor = /*#__PURE__*/function () {
    function Sensor(caller) {
      _classCallCheck(this, Sensor);
      _defineProperty(this, "caller", null);
      _defineProperty(this, "active", false);
      _defineProperty(this, "lastEvent", null);
      this.caller = caller;
    }
    return _createClass(Sensor, [{
      key: "attach",
      value: function attach() {}
    }, {
      key: "detach",
      value: function detach() {}
    }, {
      key: "cancel",
      value: function cancel(sensorEvent) {}
    }, {
      key: "trigger",
      value: function trigger(sensorEvent) {
        var event = document.createEvent('Event');
        event.detail = sensorEvent;
        event.initEvent(sensorEvent.type, true, true);
        document.dispatchEvent(event);
        this.lastEvent = event;
      }
    }]);
  }();

  var preventDefault = function preventDefault(event) {
    event.preventDefault();
  };
  var MouseSensor = /*#__PURE__*/function (_Sensor) {
    function MouseSensor(caller) {
      var _this;
      _classCallCheck(this, MouseSensor);
      _this = _callSuper(this, MouseSensor, [caller]);
      _defineProperty(_this, "pageX", null);
      _defineProperty(_this, "pageY", null);
      _defineProperty(_this, "startEvent", null);
      _defineProperty(_this, "mouseMoved", false);
      _defineProperty(_this, "cancel", function (event) {
        _this.onMouseUp(event);
      });
      _defineProperty(_this, "onMouseDown", function (event) {
        if (event.which !== 1 || event.button !== 0 || event.ctrlKey || event.metaKey) {
          return;
        }
        if (_this.caller.options.skip && event.target.nodeName && closest(event.target, _this.caller.options.skip)) {
          return;
        }
        if (_this.active) {
          _this.onMouseUp(event);
        }
        var mouseDown = new MouseDownEvent({
          pageX: event.pageX,
          pageY: event.pageY,
          target: event.target,
          caller: _this.caller,
          originalEvent: event
        });
        _this.pageX = event.pageX;
        _this.pageY = event.pageY;
        _this.startEvent = event;
        _this.trigger(mouseDown);
        if (mouseDown.canceled) {
          return;
        }
        document.addEventListener('dragstart', preventDefault);
        document.addEventListener('mousemove', _this.checkThresholds);
        document.addEventListener('mouseup', _this.onMouseUp);
      });
      _defineProperty(_this, "checkThresholds", function (event) {
        var _this2 = _this,
          startEvent = _this2.startEvent;
        var distance = _this.caller.options.distance;
        _this.pageX = event.pageX;
        _this.pageY = event.pageY;
        var delta = Math.max(Math.abs(event.pageX - startEvent.pageX), Math.abs(event.pageY - startEvent.pageY));
        if (delta >= distance) {
          document.removeEventListener('mousemove', _this.checkThresholds);
          _this.startDrag();
        }
      });
      _defineProperty(_this, "onMouseMove", function (event) {
        if (_this.active) {
          _this.trigger(new MouseMoveEvent({
            pageX: event.pageX,
            pageY: event.pageY,
            target: document.elementFromPoint(event.pageX, event.pageY),
            caller: _this.caller,
            originalEvent: event
          }));
        }
      });
      _defineProperty(_this, "onMouseUp", function (event) {
        clearTimeout(_this.startTimeout);
        document.removeEventListener('dragstart', preventDefault);
        document.removeEventListener('mousemove', _this.checkThresholds);
        document.removeEventListener('mouseup', _this.onMouseUp);
        if (_this.active) {
          _this.active = false;
          _this.trigger(new MouseStopEvent({
            pageX: event.pageX,
            pageY: event.pageY,
            target: document.elementFromPoint(event.pageX, event.pageY),
            caller: _this.caller,
            originalEvent: event
          }));
        }
        document.removeEventListener('contextmenu', preventDefault, true);
        document.removeEventListener('mousemove', _this.onMouseMove);
        event.preventDefault();
      });
      _this.attach();
      return _this;
    }
    _inherits(MouseSensor, _Sensor);
    return _createClass(MouseSensor, [{
      key: "attach",
      value: function attach() {
        document.addEventListener('mousedown', this.onMouseDown, true);
      }
    }, {
      key: "detach",
      value: function detach() {
        document.removeEventListener('mousedown', this.onMouseDown, true);
      }
    }, {
      key: "startDrag",
      value: function startDrag() {
        var startEvent = this.startEvent;
        var mouseStart = new MouseStartEvent({
          pageX: startEvent.pageX,
          pageY: startEvent.pageY,
          target: startEvent.target,
          caller: this.caller,
          originalEvent: startEvent
        });
        this.trigger(mouseStart);
        this.active = !mouseStart.canceled;
        if (this.active) {
          document.addEventListener('contextmenu', preventDefault, true);
          document.addEventListener('mousemove', this.onMouseMove);
        }
      }
    }]);
  }(Sensor);

  var $$5 = _export;
  var $map = arrayIteration.map;
  var arrayMethodHasSpeciesSupport = arrayMethodHasSpeciesSupport$4;

  var HAS_SPECIES_SUPPORT = arrayMethodHasSpeciesSupport('map');

  // `Array.prototype.map` method
  // https://tc39.es/ecma262/#sec-array.prototype.map
  // with adding support of @@species
  $$5({ target: 'Array', proto: true, forced: !HAS_SPECIES_SUPPORT }, {
    map: function map(callbackfn /* , thisArg */) {
      return $map(this, callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    }
  });

  var $$4 = _export;
  var $some = arrayIteration.some;
  var arrayMethodIsStrict$1 = arrayMethodIsStrict$5;

  var STRICT_METHOD = arrayMethodIsStrict$1('some');

  // `Array.prototype.some` method
  // https://tc39.es/ecma262/#sec-array.prototype.some
  $$4({ target: 'Array', proto: true, forced: !STRICT_METHOD }, {
    some: function some(callbackfn /* , thisArg */) {
      return $some(this, callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    }
  });

  /* global Bun -- Deno case */

  var engineIsBun = typeof Bun == 'function' && Bun && typeof Bun.version == 'string';

  var global$3 = global$o;
  var apply = functionApply;
  var isCallable$1 = isCallable$j;
  var ENGINE_IS_BUN = engineIsBun;
  var USER_AGENT = engineUserAgent;
  var arraySlice = arraySlice$4;
  var validateArgumentsLength = validateArgumentsLength$2;

  var Function$1 = global$3.Function;
  // dirty IE9- and Bun 0.3.0- checks
  var WRAP = /MSIE .\./.test(USER_AGENT) || ENGINE_IS_BUN && (function () {
    var version = global$3.Bun.version.split('.');
    return version.length < 3 || version[0] == 0 && (version[1] < 3 || version[1] == 3 && version[2] == 0);
  })();

  // IE9- / Bun 0.3.0- setTimeout / setInterval / setImmediate additional parameters fix
  // https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers
  // https://github.com/oven-sh/bun/issues/1633
  var schedulersFix$2 = function (scheduler, hasTimeArg) {
    var firstParamIndex = hasTimeArg ? 2 : 1;
    return WRAP ? function (handler, timeout /* , ...arguments */) {
      var boundArgs = validateArgumentsLength(arguments.length, 1) > firstParamIndex;
      var fn = isCallable$1(handler) ? handler : Function$1(handler);
      var params = boundArgs ? arraySlice(arguments, firstParamIndex) : [];
      var callback = boundArgs ? function () {
        apply(fn, this, params);
      } : fn;
      return hasTimeArg ? scheduler(callback, timeout) : scheduler(callback);
    } : scheduler;
  };

  var $$3 = _export;
  var global$2 = global$o;
  var schedulersFix$1 = schedulersFix$2;

  var setInterval = schedulersFix$1(global$2.setInterval, true);

  // Bun / IE9- setInterval additional parameters fix
  // https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#dom-setinterval
  $$3({ global: true, bind: true, forced: global$2.setInterval !== setInterval }, {
    setInterval: setInterval
  });

  var $$2 = _export;
  var global$1 = global$o;
  var schedulersFix = schedulersFix$2;

  var setTimeout$1 = schedulersFix(global$1.setTimeout, true);

  // Bun / IE9- setTimeout additional parameters fix
  // https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#dom-settimeout
  $$2({ global: true, bind: true, forced: global$1.setTimeout !== setTimeout$1 }, {
    setTimeout: setTimeout$1
  });

  var events = {exports: {}};

  var R = typeof Reflect === 'object' ? Reflect : null;
  var ReflectApply = R && typeof R.apply === 'function'
    ? R.apply
    : function ReflectApply(target, receiver, args) {
      return Function.prototype.apply.call(target, receiver, args);
    };

  var ReflectOwnKeys;
  if (R && typeof R.ownKeys === 'function') {
    ReflectOwnKeys = R.ownKeys;
  } else if (Object.getOwnPropertySymbols) {
    ReflectOwnKeys = function ReflectOwnKeys(target) {
      return Object.getOwnPropertyNames(target)
        .concat(Object.getOwnPropertySymbols(target));
    };
  } else {
    ReflectOwnKeys = function ReflectOwnKeys(target) {
      return Object.getOwnPropertyNames(target);
    };
  }

  function ProcessEmitWarning(warning) {
    if (console && console.warn) console.warn(warning);
  }

  var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
    return value !== value;
  };

  function EventEmitter() {
    EventEmitter.init.call(this);
  }
  events.exports = EventEmitter;
  events.exports.once = once;

  // Backwards-compat with node 0.10.x
  EventEmitter.EventEmitter = EventEmitter;

  EventEmitter.prototype._events = undefined;
  EventEmitter.prototype._eventsCount = 0;
  EventEmitter.prototype._maxListeners = undefined;

  // By default EventEmitters will print a warning if more than 10 listeners are
  // added to it. This is a useful default which helps finding memory leaks.
  var defaultMaxListeners = 10;

  function checkListener(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
    }
  }

  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
        throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
      }
      defaultMaxListeners = arg;
    }
  });

  EventEmitter.init = function() {

    if (this._events === undefined ||
        this._events === Object.getPrototypeOf(this)._events) {
      this._events = Object.create(null);
      this._eventsCount = 0;
    }

    this._maxListeners = this._maxListeners || undefined;
  };

  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.
  EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
    if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
      throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
    }
    this._maxListeners = n;
    return this;
  };

  function _getMaxListeners(that) {
    if (that._maxListeners === undefined)
      return EventEmitter.defaultMaxListeners;
    return that._maxListeners;
  }

  EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
    return _getMaxListeners(this);
  };

  EventEmitter.prototype.emit = function emit(type) {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var doError = (type === 'error');

    var events = this._events;
    if (events !== undefined)
      doError = (doError && events.error === undefined);
    else if (!doError)
      return false;

    // If there is no 'error' event listener then throw.
    if (doError) {
      var er;
      if (args.length > 0)
        er = args[0];
      if (er instanceof Error) {
        // Note: The comments on the `throw` lines are intentional, they show
        // up in Node's output if this results in an unhandled exception.
        throw er; // Unhandled 'error' event
      }
      // At least give some kind of context to the user
      var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
      err.context = er;
      throw err; // Unhandled 'error' event
    }

    var handler = events[type];

    if (handler === undefined)
      return false;

    if (typeof handler === 'function') {
      ReflectApply(handler, this, args);
    } else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        ReflectApply(listeners[i], this, args);
    }

    return true;
  };

  function _addListener(target, type, listener, prepend) {
    var m;
    var events;
    var existing;

    checkListener(listener);

    events = target._events;
    if (events === undefined) {
      events = target._events = Object.create(null);
      target._eventsCount = 0;
    } else {
      // To avoid recursion in the case that type === "newListener"! Before
      // adding it to the listeners, first emit "newListener".
      if (events.newListener !== undefined) {
        target.emit('newListener', type,
                    listener.listener ? listener.listener : listener);

        // Re-assign `events` because a newListener handler could have caused the
        // this._events to be assigned to a new object
        events = target._events;
      }
      existing = events[type];
    }

    if (existing === undefined) {
      // Optimize the case of one listener. Don't need the extra array object.
      existing = events[type] = listener;
      ++target._eventsCount;
    } else {
      if (typeof existing === 'function') {
        // Adding the second element, need to change to array.
        existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
        // If we've already got an array, just append.
      } else if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }

      // Check for listener leak
      m = _getMaxListeners(target);
      if (m > 0 && existing.length > m && !existing.warned) {
        existing.warned = true;
        // No error code for this since it is a Warning
        // eslint-disable-next-line no-restricted-syntax
        var w = new Error('Possible EventEmitter memory leak detected. ' +
                            existing.length + ' ' + String(type) + ' listeners ' +
                            'added. Use emitter.setMaxListeners() to ' +
                            'increase limit');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        ProcessEmitWarning(w);
      }
    }

    return target;
  }

  EventEmitter.prototype.addListener = function addListener(type, listener) {
    return _addListener(this, type, listener, false);
  };

  EventEmitter.prototype.on = EventEmitter.prototype.addListener;

  EventEmitter.prototype.prependListener =
      function prependListener(type, listener) {
        return _addListener(this, type, listener, true);
      };

  function onceWrapper() {
    if (!this.fired) {
      this.target.removeListener(this.type, this.wrapFn);
      this.fired = true;
      if (arguments.length === 0)
        return this.listener.call(this.target);
      return this.listener.apply(this.target, arguments);
    }
  }

  function _onceWrap(target, type, listener) {
    var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
    var wrapped = onceWrapper.bind(state);
    wrapped.listener = listener;
    state.wrapFn = wrapped;
    return wrapped;
  }

  EventEmitter.prototype.once = function once(type, listener) {
    checkListener(listener);
    this.on(type, _onceWrap(this, type, listener));
    return this;
  };

  EventEmitter.prototype.prependOnceListener =
      function prependOnceListener(type, listener) {
        checkListener(listener);
        this.prependListener(type, _onceWrap(this, type, listener));
        return this;
      };

  // Emits a 'removeListener' event if and only if the listener was removed.
  EventEmitter.prototype.removeListener =
      function removeListener(type, listener) {
        var list, events, position, i, originalListener;

        checkListener(listener);

        events = this._events;
        if (events === undefined)
          return this;

        list = events[type];
        if (list === undefined)
          return this;

        if (list === listener || list.listener === listener) {
          if (--this._eventsCount === 0)
            this._events = Object.create(null);
          else {
            delete events[type];
            if (events.removeListener)
              this.emit('removeListener', type, list.listener || listener);
          }
        } else if (typeof list !== 'function') {
          position = -1;

          for (i = list.length - 1; i >= 0; i--) {
            if (list[i] === listener || list[i].listener === listener) {
              originalListener = list[i].listener;
              position = i;
              break;
            }
          }

          if (position < 0)
            return this;

          if (position === 0)
            list.shift();
          else {
            spliceOne(list, position);
          }

          if (list.length === 1)
            events[type] = list[0];

          if (events.removeListener !== undefined)
            this.emit('removeListener', type, originalListener || listener);
        }

        return this;
      };

  EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

  EventEmitter.prototype.removeAllListeners =
      function removeAllListeners(type) {
        var listeners, events, i;

        events = this._events;
        if (events === undefined)
          return this;

        // not listening for removeListener, no need to emit
        if (events.removeListener === undefined) {
          if (arguments.length === 0) {
            this._events = Object.create(null);
            this._eventsCount = 0;
          } else if (events[type] !== undefined) {
            if (--this._eventsCount === 0)
              this._events = Object.create(null);
            else
              delete events[type];
          }
          return this;
        }

        // emit removeListener for all listeners on all events
        if (arguments.length === 0) {
          var keys = Object.keys(events);
          var key;
          for (i = 0; i < keys.length; ++i) {
            key = keys[i];
            if (key === 'removeListener') continue;
            this.removeAllListeners(key);
          }
          this.removeAllListeners('removeListener');
          this._events = Object.create(null);
          this._eventsCount = 0;
          return this;
        }

        listeners = events[type];

        if (typeof listeners === 'function') {
          this.removeListener(type, listeners);
        } else if (listeners !== undefined) {
          // LIFO order
          for (i = listeners.length - 1; i >= 0; i--) {
            this.removeListener(type, listeners[i]);
          }
        }

        return this;
      };

  function _listeners(target, type, unwrap) {
    var events = target._events;

    if (events === undefined)
      return [];

    var evlistener = events[type];
    if (evlistener === undefined)
      return [];

    if (typeof evlistener === 'function')
      return unwrap ? [evlistener.listener || evlistener] : [evlistener];

    return unwrap ?
      unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
  }

  EventEmitter.prototype.listeners = function listeners(type) {
    return _listeners(this, type, true);
  };

  EventEmitter.prototype.rawListeners = function rawListeners(type) {
    return _listeners(this, type, false);
  };

  EventEmitter.listenerCount = function(emitter, type) {
    if (typeof emitter.listenerCount === 'function') {
      return emitter.listenerCount(type);
    } else {
      return listenerCount.call(emitter, type);
    }
  };

  EventEmitter.prototype.listenerCount = listenerCount;
  function listenerCount(type) {
    var events = this._events;

    if (events !== undefined) {
      var evlistener = events[type];

      if (typeof evlistener === 'function') {
        return 1;
      } else if (evlistener !== undefined) {
        return evlistener.length;
      }
    }

    return 0;
  }

  EventEmitter.prototype.eventNames = function eventNames() {
    return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
  };

  function arrayClone(arr, n) {
    var copy = new Array(n);
    for (var i = 0; i < n; ++i)
      copy[i] = arr[i];
    return copy;
  }

  function spliceOne(list, index) {
    for (; index + 1 < list.length; index++)
      list[index] = list[index + 1];
    list.pop();
  }

  function unwrapListeners(arr) {
    var ret = new Array(arr.length);
    for (var i = 0; i < ret.length; ++i) {
      ret[i] = arr[i].listener || arr[i];
    }
    return ret;
  }

  function once(emitter, name) {
    return new Promise(function (resolve, reject) {
      function errorListener(err) {
        emitter.removeListener(name, resolver);
        reject(err);
      }

      function resolver() {
        if (typeof emitter.removeListener === 'function') {
          emitter.removeListener('error', errorListener);
        }
        resolve([].slice.call(arguments));
      }
      eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
      if (name !== 'error') {
        addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
      }
    });
  }

  function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
    if (typeof emitter.on === 'function') {
      eventTargetAgnosticAddListener(emitter, 'error', handler, flags);
    }
  }

  function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
    if (typeof emitter.on === 'function') {
      if (flags.once) {
        emitter.once(name, listener);
      } else {
        emitter.on(name, listener);
      }
    } else if (typeof emitter.addEventListener === 'function') {
      // EventTarget does not have `error` event semantics like Node
      // EventEmitters, we do not listen for `error` events here.
      emitter.addEventListener(name, function wrapListener(arg) {
        // IE does not have builtin `{ once: true }` support so we
        // have to do it manually.
        if (flags.once) {
          emitter.removeEventListener(name, wrapListener);
        }
        listener(arg);
      });
    } else {
      throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
    }
  }

  var eventsExports = events.exports;
  var EventEmitter$1 = /*@__PURE__*/getDefaultExportFromCjs(eventsExports);

  var CancelableEventEmitter = /*#__PURE__*/function (_EventEmitter) {
    function CancelableEventEmitter() {
      var _this;
      _classCallCheck(this, CancelableEventEmitter);
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      _this = _callSuper(this, CancelableEventEmitter, [].concat(args));
      _defineProperty(_this, "wrappedListeners", []);
      return _this;
    }
    _inherits(CancelableEventEmitter, _EventEmitter);
    return _createClass(CancelableEventEmitter, [{
      key: "wrapListener",
      value: function wrapListener(listener) {
        var wrapped = this.wrappedListeners.find(function (item) {
          return item.listener === listener;
        });
        if (!wrapped) {
          wrapped = {
            listener: listener,
            wrapped: function wrapped(event) {
              if (!event || !event.canceled) {
                listener(event);
              }
            }
          };
          this.wrappedListeners.push(wrapped);
        } else {
          this.wrappedListeners = this.wrappedListeners.filter(function (item) {
            return item !== wrapped;
          });
        }
        return wrapped;
      }
    }, {
      key: "addListener",
      value: function addListener(type, listener) {
        _superPropGet(CancelableEventEmitter, "addListener", this, 3)([type, this.wrapListener(listener)]);
      }
    }, {
      key: "prependListener",
      value: function prependListener(type, listener) {
        _superPropGet(CancelableEventEmitter, "prependListener", this, 3)([type, this.wrapListener(listener)]);
      }
    }, {
      key: "removeListener",
      value: function removeListener(type, listener) {
        _superPropGet(CancelableEventEmitter, "off", this, 3)([type, this.wrapListener(listener)]);
      }
    }]);
  }(EventEmitter$1);

  var DraggableEvent = /*#__PURE__*/function (_AbstractEvent) {
    function DraggableEvent() {
      _classCallCheck(this, DraggableEvent);
      return _callSuper(this, DraggableEvent, arguments);
    }
    _inherits(DraggableEvent, _AbstractEvent);
    return _createClass(DraggableEvent, [{
      key: "draggable",
      get: function get() {
        return this.data.draggable || null;
      }
    }]);
  }(AbstractEvent);
  _defineProperty(DraggableEvent, "type", 'draggable');
  var DraggableInitEvent = /*#__PURE__*/function (_DraggableEvent2) {
    function DraggableInitEvent() {
      _classCallCheck(this, DraggableInitEvent);
      return _callSuper(this, DraggableInitEvent, arguments);
    }
    _inherits(DraggableInitEvent, _DraggableEvent2);
    return _createClass(DraggableInitEvent);
  }(DraggableEvent);
  _defineProperty(DraggableInitEvent, "type", 'draggable:init');
  var DraggableDestroyEvent = /*#__PURE__*/function (_DraggableEvent3) {
    function DraggableDestroyEvent() {
      _classCallCheck(this, DraggableDestroyEvent);
      return _callSuper(this, DraggableDestroyEvent, arguments);
    }
    _inherits(DraggableDestroyEvent, _DraggableEvent3);
    return _createClass(DraggableDestroyEvent);
  }(DraggableEvent);
  _defineProperty(DraggableDestroyEvent, "type", 'draggable:destroy');

  var DragEvent = /*#__PURE__*/function (_AbstractEvent) {
    function DragEvent() {
      _classCallCheck(this, DragEvent);
      return _callSuper(this, DragEvent, arguments);
    }
    _inherits(DragEvent, _AbstractEvent);
    return _createClass(DragEvent, [{
      key: "source",
      get: function get() {
        return this.data.source || null;
      }
    }, {
      key: "helper",
      get: function get() {
        return this.data.helper || null;
      }
    }, {
      key: "sensorEvent",
      get: function get() {
        return this.data.sensorEvent || null;
      }
    }, {
      key: "originalEvent",
      get: function get() {
        return this.data.originalEvent || null;
      }
    }]);
  }(AbstractEvent);
  _defineProperty(DragEvent, "type", 'drag');
  var DragStartEvent = /*#__PURE__*/function (_DragEvent2) {
    function DragStartEvent() {
      _classCallCheck(this, DragStartEvent);
      return _callSuper(this, DragStartEvent, arguments);
    }
    _inherits(DragStartEvent, _DragEvent2);
    return _createClass(DragStartEvent);
  }(DragEvent);
  _defineProperty(DragStartEvent, "type", 'drag:start');
  _defineProperty(DragStartEvent, "cancelable", true);
  var DragMoveEvent = /*#__PURE__*/function (_DragEvent3) {
    function DragMoveEvent() {
      _classCallCheck(this, DragMoveEvent);
      return _callSuper(this, DragMoveEvent, arguments);
    }
    _inherits(DragMoveEvent, _DragEvent3);
    return _createClass(DragMoveEvent, [{
      key: "position",
      get: function get() {
        return this.data.position || null;
      },
      set: function set(value) {
        this.data.position = value;
      }
    }]);
  }(DragEvent);
  _defineProperty(DragMoveEvent, "type", 'drag:move');
  _defineProperty(DragMoveEvent, "cancelable", true);
  var DragStopEvent = /*#__PURE__*/function (_DragEvent4) {
    function DragStopEvent() {
      _classCallCheck(this, DragStopEvent);
      return _callSuper(this, DragStopEvent, arguments);
    }
    _inherits(DragStopEvent, _DragEvent4);
    return _createClass(DragStopEvent, [{
      key: "droppable",
      get: function get() {
        return this.data.droppable || null;
      },
      set: function set(value) {
        this.data.droppable = value;
      }
    }]);
  }(DragEvent);
  _defineProperty(DragStopEvent, "type", 'drag:stop');

  var Draggable = /*#__PURE__*/function () {
    function Draggable(element) {
      var _this = this;
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var listeners = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      _classCallCheck(this, Draggable);
      _defineProperty(this, "element", null);
      _defineProperty(this, "margins", null);
      _defineProperty(this, "dragging", false);
      _defineProperty(this, "reverting", false);
      _defineProperty(this, "helper", null);
      _defineProperty(this, "helperSize", null);
      _defineProperty(this, "helperAttrs", null);
      _defineProperty(this, "startEvent", null);
      _defineProperty(this, "offset", {
        element: null,
        click: null,
        scroll: null,
        parent: null,
        relative: null
      });
      _defineProperty(this, "position", {
        original: null,
        current: null,
        absolute: null
      });
      _defineProperty(this, "emitter", new CancelableEventEmitter());
      _defineProperty(this, "options", {});
      _defineProperty(this, "plugins", []);
      _defineProperty(this, "sensors", []);
      _defineProperty(this, "pendingDestroy", false);
      _defineProperty(this, "cancelHelperRemoval", false);
      _defineProperty(this, "containmentCoords", undefined);
      _defineProperty(this, "containmentContainer", null);
      _defineProperty(this, "scrollListeners", []);
      _defineProperty(this, "connectedSortables", []);
      _defineProperty(this, "droppedSortable", null);
      _defineProperty(this, "setup", function () {
        _this.addPlugin(new AxisConstraint(_this));
        _this.addPlugin(new DragContainmentConstraint(_this));
        _this.addPlugin(new DragGridConstraint(_this));
        _this.addPlugin(new StyleDecorator(_this, 'cursor'));
        _this.addPlugin(new StyleDecorator(_this, 'opacity'));
        _this.addPlugin(new StyleDecorator(_this, 'zIndex'));
        _this.addPlugin(new StackController(_this));
        _this.addPlugin(new AutoScroll(_this));
        _this.addPlugin(new ConnectToSortable(_this));
        _this.addSensor(new MouseSensor(_this));
        document.addEventListener('mouse:down', _this.onMouseDown);
        document.addEventListener('mouse:start', _this.onDragStart);
        document.addEventListener('mouse:move', _this.onDragMove);
        document.addEventListener('mouse:stop', _this.onDragStop);
        if (_this.options.helper !== 'clone' && !isFunction$2(_this.options.helper)) {
          setPositionRelative(_this.element);
        }
        _this.element[_this.dataProperty] = _this;
        addClass(_this.element, _this.elementClass);
        _this.findHandles().forEach(function (handle) {
          addClass(handle, _this.handleClass);
        });
        _this.trigger(new DraggableInitEvent({
          draggable: _this
        }));
      });
      _defineProperty(this, "onMouseDown", function (event) {
        var sensorEvent = event.detail;
        if (sensorEvent.caller !== _this) {
          return;
        }
        if (_this.disabled || _this.reverting) {
          sensorEvent.cancel();
          return;
        }
        if (!_this.isInsideHandle(sensorEvent)) {
          sensorEvent.cancel();
          return;
        }
      });
      _defineProperty(this, "onDragStart", function (event) {
        var sensorEvent = event.detail;
        if (sensorEvent.caller !== _this) {
          return;
        }
        blurActiveElement(sensorEvent);
        _this.dragging = true;
        _this.helper = _this.createHelper(sensorEvent);
        if (!_this.helper) {
          sensorEvent.cancel();
          _this.clear();
          return;
        } else {
          addClass(_this.helper, _this.helperClass);
        }
        _this.startEvent = sensorEvent;
        _this.cacheMargins();
        _this.cacheHelperSize();
        _this.cacheHelperAttrs();
        _this.position.absolute = offset(_this.element);
        _this.calculateOffsets(sensorEvent);
        _this.calculatePosition(sensorEvent, false);
        var dragStart = new DragStartEvent({
          source: _this.element,
          helper: _this.helper,
          sensorEvent: sensorEvent,
          originalEvent: sensorEvent.originalEvent
        });
        _this.trigger(dragStart);
        if (dragStart.canceled) {
          _this.onDragCancel(createMouseStopEvent(_this.helper));
          return;
        }
        _this.cacheHelperSize();
        DragDropManager$1.prepareOffsets(_this, sensorEvent);
        _this.onDragMove(event, true);
        _this.scrollListeners = getParents(_this.element, 'body').map(function (parent) {
          return listen(parent, 'scroll', function () {
            return DragDropManager$1.prepareOffsets(_this, event);
          });
        });
      });
      _defineProperty(this, "onDragCancel", function (event) {
        var sensorEvent = event.detail;
        _this.scrollListeners.forEach(function (listener) {
          return listener();
        });
        _this.scrollListeners = [];
        DragDropManager$1.onDragStop(_this, sensorEvent);
        if (_this.findHandles().some(function (handle) {
          return handle === sensorEvent.target;
        })) {
          triggerEvent(_this.element, 'focus');
        }
        _this.sensors.forEach(function (sensor) {
          return sensor.cancel(event);
        });
        _this.clear();
      });
      _defineProperty(this, "onDragMove", function (event) {
        var noPropagation = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
        var sensorEvent = event.detail;
        if (sensorEvent.caller !== _this) {
          return;
        }
        var hasFixedParent = _this.helperAttrs.hasFixedParent;
        if (hasFixedParent) {
          _this.offset.parent = _this.getParentOffset();
        }
        _this.calculatePosition(sensorEvent);
        var dragMove = new DragMoveEvent({
          source: _this.element,
          helper: _this.helper,
          sensorEvent: sensorEvent,
          originalEvent: sensorEvent.originalEvent,
          position: _this.position.current
        });
        if (!noPropagation) {
          _this.trigger(dragMove);
        } else {
          _this.plugins.forEach(function (plugin) {
            if (!dragMove.canceled) {
              plugin.onDragMove(dragMove);
            }
          });
        }
        if (dragMove.canceled) {
          return;
        } else {
          _this.position.current = dragMove.position;
        }
        style(_this.helper, {
          left: _this.position.current.left + 'px',
          top: _this.position.current.top + 'px'
        });
        DragDropManager$1.onDragMove(_this, sensorEvent);
      });
      _defineProperty(this, "onDragStop", function (event) {
        var sensorEvent = event.detail;
        if (sensorEvent.caller !== _this) {
          return;
        }
        var _this$options = _this.options,
          revert = _this$options.revert,
          revertDuration = _this$options.revertDuration;
        var original = _this.position.original;
        var dragStop = new DragStopEvent({
          source: _this.element,
          helper: _this.helper,
          droppable: DragDropManager$1.drop(_this, sensorEvent),
          sensorEvent: sensorEvent,
          originalEvent: sensorEvent.originalEvent
        });
        if (revert === 'invalid' && !dragStop.droppable || revert === 'valid' && dragStop.droppable || isFunction$2(revert) && revert(_this.element, dragStop.droppable) || revert === true) {
          _this.reverting = true;
          anime({
            targets: [_this.helper],
            left: original.left + 'px',
            top: original.top + 'px',
            duration: revertDuration,
            easing: 'linear',
            complete: function complete() {
              _this.reverting = false;
              _this.trigger(dragStop);
              if (!dragStop.canceled) {
                _this.clear();
              }
            }
          });
        } else {
          _this.trigger(dragStop);
          if (!dragStop.canceled) {
            _this.clear();
          }
        }
      });
      if (element instanceof HTMLElement) {
        this.element = element;
      } else {
        throw new Error('Invalid element');
      }
      this.options = _objectSpread2(_objectSpread2({}, this.constructor.defaultOptions), isPlainObject$1(options) ? options : {});
      if (isPlainObject$1(listeners)) {
        forEach$1(listeners, function (callback, type) {
          _this.on(type, callback);
        });
      }
      setTimeout(function () {
        _this.setup();
      }, 0);
    }
    return _createClass(Draggable, [{
      key: "addPlugin",
      value: function addPlugin(plugin) {
        if (plugin instanceof Plugin) {
          this.plugins.push(plugin);
        }
      }
    }, {
      key: "addSensor",
      value: function addSensor(sensor) {
        if (sensor instanceof Sensor) {
          this.sensors.push(sensor);
        }
      }
    }, {
      key: "setDisabled",
      value: function setDisabled(value) {
        this.setOption('disabled', !!value);
      }
    }, {
      key: "setOption",
      value: function setOption(opt, value) {
        switch (opt) {
          case 'appendTo':
          case 'axis':
          case 'connectToSortable':
          case 'cursor':
          case 'disabled':
          case 'distance':
          case 'grid':
          case 'helper':
          case 'opacity':
          case 'revert':
          case 'revertDuration':
          case 'scope':
          case 'scroll':
          case 'scrollSensitivity':
          case 'scrollSpeed':
          case 'skip':
          case 'stack':
          case 'zIndex':
            this.options[opt] = value;
            break;
          case 'containment':
            this.options.containment = value;
            this.containmentCoords = undefined;
            break;
          default:
            throw new Error("The option ".concat(opt, " is invalid or can't be changed dynamically"));
        }
      }
    }, {
      key: "on",
      value: function on(type, callback) {
        this.emitter.on(type, callback);
      }
    }, {
      key: "off",
      value: function off(type, callback) {
        this.emitter.off(type, callback);
      }
    }, {
      key: "cancel",
      value: function cancel() {
        if (this.dragging) {
          this.onDragCancel(createMouseStopEvent(this.helper));
        } else {
          this.clear();
        }
      }
    }, {
      key: "destroy",
      value: function destroy() {
        var _this2 = this;
        if (this.dragging) {
          this.pendingDestroy = true;
          return;
        }
        this.plugins.forEach(function (plugin) {
          return plugin.detach();
        });
        this.sensors.forEach(function (sensor) {
          return sensor.detach();
        });
        document.removeEventListener('mouse:start', this.onDragStart);
        document.removeEventListener('mouse:move', this.onDragMove);
        document.removeEventListener('mouse:stop', this.onDragStop);
        delete this.element[this.dataProperty];
        removeClass(this.element, this.elementClass);
        this.findHandles().forEach(function (handle) {
          removeClass(handle, _this2.handleClass);
        });
        this.trigger(new DraggableDestroyEvent({
          draggable: this
        }));
      }
    }, {
      key: "disabled",
      get: function get() {
        return this.options.disabled;
      }
    }, {
      key: "dataProperty",
      get: function get() {
        return draggableProp;
      }
    }, {
      key: "elementClass",
      get: function get() {
        return draggableEl;
      }
    }, {
      key: "handleClass",
      get: function get() {
        return draggableHandle;
      }
    }, {
      key: "helperClass",
      get: function get() {
        return draggableHelper;
      }
    }, {
      key: "scope",
      get: function get() {
        return this.options.scope;
      }
    }, {
      key: "proportions",
      get: function get() {
        var absolute = this.position.absolute;
        var margins = this.margins,
          helperSize = this.helperSize;
        return {
          left: absolute.left + margins.left,
          top: absolute.top + margins.top,
          right: absolute.left + margins.left + helperSize.width,
          bottom: absolute.top + margins.top + helperSize.height,
          width: helperSize.width,
          height: helperSize.height
        };
      }
    }, {
      key: "trigger",
      value: function trigger(event) {
        this.emitter.emit(event.type, event);
        if (/^drag:/.test(event.type)) {
          this.position.absolute = this.convertPosition(this.position.current, 'absolute');
        }
      }
    }, {
      key: "findHandles",
      value: function findHandles() {
        var handles = null;
        var handle = this.options.handle;
        if (handle) {
          handles = qsa(this.element, handle);
        } else {
          handles = [this.element];
        }
        return handles;
      }
    }, {
      key: "isInsideHandle",
      value: function isInsideHandle(event) {
        var inside = false;
        this.findHandles().forEach(function (handle) {
          if (!inside && (handle === event.target || containsStrict(handle, event.target))) {
            inside = true;
          }
        });
        return inside;
      }
    }, {
      key: "createHelper",
      value: function createHelper(event) {
        var helperNode = null;
        var _this$options2 = this.options,
          appendTo = _this$options2.appendTo,
          helper = _this$options2.helper;
        if (isFunction$2(helper)) {
          helperNode = helper.apply(this.element, [event]);
        } else if (helper === 'clone') {
          helperNode = this.element.cloneNode(true);
          helperNode.removeAttribute('id');
          helperNode.removeAttribute(this.dataProperty);
          helperNode[this.dataProperty] = this;
        } else {
          helperNode = this.element;
        }
        if (helperNode instanceof HTMLElement) {
          if (!closest(helperNode, 'body')) {
            var parent = appendTo === 'parent' ? this.element.parentNode : document.querySelector(appendTo);
            if (parent instanceof HTMLElement) {
              parent.appendChild(helperNode);
            }
          }
          if (isFunction$2(helper) && helperNode === this.element) {
            setPositionRelative(this.element);
          }
          if (helperNode !== this.element) {
            setPositionAbsolute(helperNode);
          }
          return helperNode;
        }
        return null;
      }
    }, {
      key: "cacheMargins",
      value: function cacheMargins() {
        this.margins = {
          left: styleAsNumber(this.element, 'marginLeft') || 0,
          top: styleAsNumber(this.element, 'marginTop') || 0,
          right: styleAsNumber(this.element, 'marginRight') || 0,
          bottom: styleAsNumber(this.element, 'marginBottom') || 0
        };
      }
    }, {
      key: "cacheHelperSize",
      value: function cacheHelperSize() {
        this.helperSize = {
          width: getWidth(this.helper),
          height: height(this.helper)
        };
      }
    }, {
      key: "cacheHelperAttrs",
      value: function cacheHelperAttrs() {
        this.helperAttrs = {
          cssPosition: style(this.helper, 'position'),
          scrollParent: scrollParent(this.helper, false),
          offsetParent: offsetParent(this.helper),
          hasFixedParent: getParents(this.helper).some(function (parent) {
            return style(parent, 'position') === 'fixed';
          })
        };
      }
    }, {
      key: "calculateOffsets",
      value: function calculateOffsets(event) {
        var absolute = this.position.absolute;
        this.offset.click = {
          left: event.pageX - absolute.left - this.margins.left,
          top: event.pageY - absolute.top - this.margins.top
        };
        this.offset.parent = this.getParentOffset();
        this.offset.relative = this.getRelativeOffset();
      }
    }, {
      key: "getParentOffset",
      value: function getParentOffset() {
        var _this$helperAttrs = this.helperAttrs,
          cssPosition = _this$helperAttrs.cssPosition,
          scrollParent = _this$helperAttrs.scrollParent,
          offsetParent = _this$helperAttrs.offsetParent;
        var result = isRoot(offsetParent) ? {
          left: 0,
          top: 0
        } : offset(offsetParent);
        if (cssPosition === 'absolute' && scrollParent !== document && containsStrict(scrollParent, offsetParent)) {
          result.left += scrollLeft(scrollParent);
          result.top += scrollTop(scrollParent);
        }
        return {
          left: result.left + styleAsNumber(offsetParent, 'borderLeftWidth') || 0,
          top: result.top + styleAsNumber(offsetParent, 'borderTopWidth') || 0
        };
      }
    }, {
      key: "getRelativeOffset",
      value: function getRelativeOffset() {
        var _this$helperAttrs2 = this.helperAttrs,
          cssPosition = _this$helperAttrs2.cssPosition,
          scrollParent = _this$helperAttrs2.scrollParent;
        if (cssPosition !== 'relative') {
          return {
            left: 0,
            top: 0
          };
        }
        var result = position$1(this.helper);
        var scrollIsRoot = scrollParent ? isRoot(scrollParent) : false;
        return {
          left: result.left - (styleAsNumber(this.helper, 'left') || 0) + (scrollIsRoot ? scrollLeft(scrollParent) : 0),
          top: result.top - (styleAsNumber(this.helper, 'top') || 0) + (scrollIsRoot ? scrollTop(scrollParent) : 0)
        };
      }
    }, {
      key: "constraintPosition",
      value: function constraintPosition(event) {
        var position = {
          pageX: event.pageX,
          pageY: event.pageY
        };
        this.plugins.forEach(function (plugin) {
          position = plugin.constraintPosition(position);
        });
        return position;
      }
    }, {
      key: "calculatePosition",
      value: function calculatePosition(event) {
        var constraint = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
        var _ref = constraint ? this.constraintPosition(event) : event,
          pageX = _ref.pageX,
          pageY = _ref.pageY;
        var _this$helperAttrs3 = this.helperAttrs,
          cssPosition = _this$helperAttrs3.cssPosition,
          offsetParent = _this$helperAttrs3.offsetParent,
          scrollParent = _this$helperAttrs3.scrollParent;
        var scrollIsRoot = isRoot(scrollParent);
        if (!scrollIsRoot || !this.offset.scroll) {
          this.offset.scroll = {
            left: scrollIsRoot ? 0 : scrollLeft(scrollParent),
            top: scrollIsRoot ? 0 : scrollTop(scrollParent)
          };
        }
        if (cssPosition === 'relative' && scrollParent === document && scrollParent !== offsetParent) {
          this.offset.relative = this.getRelativeOffset();
        }
        var _this$offset = this.offset,
          click = _this$offset.click,
          scroll = _this$offset.scroll,
          parent = _this$offset.parent,
          relative = _this$offset.relative;
        var position = {
          left: pageX - click.left - parent.left - relative.left + (cssPosition === 'fixed' ? -scroll.left : scrollIsRoot ? 0 : scroll.left),
          top: pageY - click.top - parent.top - relative.top + (cssPosition === 'fixed' ? -scroll.top : scrollIsRoot ? 0 : scroll.top)
        };
        if (!this.position.original) {
          this.position.original = position;
        }
        this.position.current = position;
        this.position.absolute = this.convertPosition(position, 'absolute');
      }
    }, {
      key: "convertPosition",
      value: function convertPosition(position, to) {
        var _this$helperAttrs4 = this.helperAttrs,
          cssPosition = _this$helperAttrs4.cssPosition,
          scrollParent = _this$helperAttrs4.scrollParent;
        var _this$offset2 = this.offset,
          scroll = _this$offset2.scroll,
          parent = _this$offset2.parent,
          relative = _this$offset2.relative;
        var factor = to === 'absolute' ? 1 : -1;
        var scrollIsRoot = isRoot(scrollParent);
        return {
          left: position.left + parent.left * factor + relative.left * factor - (cssPosition === 'fixed' ? -scroll.left : (scrollIsRoot ? 0 : scroll.left) * factor),
          top: position.top + parent.top * factor + relative.top * factor - (cssPosition === 'fixed' ? -scroll.top : (scrollIsRoot ? 0 : scroll.top) * factor)
        };
      }
    }, {
      key: "clear",
      value: function clear() {
        if (this.helper) {
          var helper = this.options.helper;
          removeClass(this.helper, this.helperClass);
          this.dragging = false;
          if (this.helper && helper === 'clone' && !this.cancelHelperRemoval) {
            this.helper.parentNode.removeChild(this.helper);
          }
          this.cancelHelperRemoval = false;
          this.helper = null;
        }
        if (this.pendingDestroy) {
          this.destroy();
          this.pendingDestroy = false;
        }
      }
    }]);
  }();
  _defineProperty(Draggable, "defaultOptions", {
    appendTo: 'parent',
    axis: null,
    connectToSortable: null,
    containment: null,
    cursor: null,
    disabled: false,
    distance: 0,
    grid: null,
    handle: null,
    helper: 'original',
    opacity: null,
    revert: false,
    revertDuration: 200,
    scope: 'default',
    scroll: true,
    scrollSensitivity: 20,
    scrollSpeed: 10,
    skip: 'input, textarea, button, select, option',
    stack: null,
    zIndex: null
  });

  var DroppableEvent = /*#__PURE__*/function (_AbstractEvent) {
    function DroppableEvent() {
      _classCallCheck(this, DroppableEvent);
      return _callSuper(this, DroppableEvent, arguments);
    }
    _inherits(DroppableEvent, _AbstractEvent);
    return _createClass(DroppableEvent, [{
      key: "droppable",
      get: function get() {
        return this.data.droppable || null;
      }
    }]);
  }(AbstractEvent);
  _defineProperty(DroppableEvent, "type", 'droppable');
  var DroppableInitEvent = /*#__PURE__*/function (_DroppableEvent2) {
    function DroppableInitEvent() {
      _classCallCheck(this, DroppableInitEvent);
      return _callSuper(this, DroppableInitEvent, arguments);
    }
    _inherits(DroppableInitEvent, _DroppableEvent2);
    return _createClass(DroppableInitEvent);
  }(DroppableEvent);
  _defineProperty(DroppableInitEvent, "type", 'droppable:init');
  var DroppableActivateEvent = /*#__PURE__*/function (_DroppableEvent3) {
    function DroppableActivateEvent() {
      _classCallCheck(this, DroppableActivateEvent);
      return _callSuper(this, DroppableActivateEvent, arguments);
    }
    _inherits(DroppableActivateEvent, _DroppableEvent3);
    return _createClass(DroppableActivateEvent, [{
      key: "sensorEvent",
      get: function get() {
        return this.data.sensorEvent || null;
      }
    }, {
      key: "draggable",
      get: function get() {
        return this.data.draggable || null;
      }
    }]);
  }(DroppableEvent);
  _defineProperty(DroppableActivateEvent, "type", 'droppable:activate');
  var DroppableOverEvent = /*#__PURE__*/function (_DroppableActivateEve) {
    function DroppableOverEvent() {
      _classCallCheck(this, DroppableOverEvent);
      return _callSuper(this, DroppableOverEvent, arguments);
    }
    _inherits(DroppableOverEvent, _DroppableActivateEve);
    return _createClass(DroppableOverEvent);
  }(DroppableActivateEvent);
  _defineProperty(DroppableOverEvent, "type", 'droppable:over');
  var DroppableDropEvent = /*#__PURE__*/function (_DroppableActivateEve2) {
    function DroppableDropEvent() {
      _classCallCheck(this, DroppableDropEvent);
      return _callSuper(this, DroppableDropEvent, arguments);
    }
    _inherits(DroppableDropEvent, _DroppableActivateEve2);
    return _createClass(DroppableDropEvent);
  }(DroppableActivateEvent);
  _defineProperty(DroppableDropEvent, "type", 'droppable:drop');
  var DroppableOutEvent = /*#__PURE__*/function (_DroppableActivateEve3) {
    function DroppableOutEvent() {
      _classCallCheck(this, DroppableOutEvent);
      return _callSuper(this, DroppableOutEvent, arguments);
    }
    _inherits(DroppableOutEvent, _DroppableActivateEve3);
    return _createClass(DroppableOutEvent);
  }(DroppableActivateEvent);
  _defineProperty(DroppableOutEvent, "type", 'droppable:out');
  var DroppableDeactivateEvent = /*#__PURE__*/function (_DroppableActivateEve4) {
    function DroppableDeactivateEvent() {
      _classCallCheck(this, DroppableDeactivateEvent);
      return _callSuper(this, DroppableDeactivateEvent, arguments);
    }
    _inherits(DroppableDeactivateEvent, _DroppableActivateEve4);
    return _createClass(DroppableDeactivateEvent);
  }(DroppableActivateEvent);
  _defineProperty(DroppableDeactivateEvent, "type", 'droppable:deactivate');
  var DroppableDestroyEvent = /*#__PURE__*/function (_DroppableEvent4) {
    function DroppableDestroyEvent() {
      _classCallCheck(this, DroppableDestroyEvent);
      return _callSuper(this, DroppableDestroyEvent, arguments);
    }
    _inherits(DroppableDestroyEvent, _DroppableEvent4);
    return _createClass(DroppableDestroyEvent);
  }(DroppableEvent);
  _defineProperty(DroppableDestroyEvent, "type", 'droppable:destroy');

  var Droppable = /*#__PURE__*/function () {
    function Droppable(element) {
      var _this = this;
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var listeners = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      _classCallCheck(this, Droppable);
      _defineProperty(this, "element", null);
      _defineProperty(this, "isOver", false);
      _defineProperty(this, "visible", true);
      _defineProperty(this, "greedyChild", false);
      _defineProperty(this, "emitter", new CancelableEventEmitter());
      _defineProperty(this, "options", {});
      _defineProperty(this, "size", null);
      _defineProperty(this, "offset", null);
      _defineProperty(this, "setup", function () {
        var scope = _this.options.scope;
        _this.element[_this.dataProperty] = _this;
        addClass(_this.element, _this.elementClass);
        DragDropManager$1.addDroppable(_this, scope);
        _this.trigger(new DroppableInitEvent({
          droppable: _this
        }));
      });
      if (element instanceof HTMLElement) {
        this.element = element;
      } else {
        throw new Error('Invalid element');
      }
      this.options = _objectSpread2(_objectSpread2({}, this.constructor.defaultOptions), isPlainObject$1(options) ? options : {});
      if (isPlainObject$1(listeners)) {
        forEach$1(listeners, function (callback, type) {
          _this.on(type, callback);
        });
      }
      setTimeout(this.setup, 0);
    }
    return _createClass(Droppable, [{
      key: "setDisabled",
      value: function setDisabled(value) {
        this.setOption('disabled', !!value);
      }
    }, {
      key: "setOption",
      value: function setOption(opt, value) {
        switch (opt) {
          case 'accept':
          case 'disabled':
          case 'greedy':
          case 'tolerance':
            this.options[opt] = value;
            break;
          case 'scope':
            if (value !== this.options.scope) {
              DragDropManager$1.removeDroppable(this, this.options.scope);
              this.options.scope = value;
              DragDropManager$1.addDroppable(this, value);
            }
            break;
          default:
            throw new Error("The option ".concat(opt, " is invalid or can't be changed dynamically"));
        }
      }
    }, {
      key: "destroy",
      value: function destroy() {
        var scope = this.options.scope;
        delete this.element[this.dataProperty];
        removeClass(this.element, this.elementClass);
        DragDropManager$1.removeDroppable(this, scope);
        this.trigger(new DroppableDestroyEvent({
          droppable: this
        }));
      }
    }, {
      key: "disabled",
      get: function get() {
        return this.options.disabled;
      }
    }, {
      key: "dataProperty",
      get: function get() {
        return droppableProp;
      }
    }, {
      key: "elementClass",
      get: function get() {
        return droppableEl;
      }
    }, {
      key: "activeClass",
      get: function get() {
        return droppableActive;
      }
    }, {
      key: "hoverClass",
      get: function get() {
        return droppableHover;
      }
    }, {
      key: "greedy",
      get: function get() {
        return this.options.greedy;
      }
    }, {
      key: "scope",
      get: function get() {
        return this.options.scope;
      }
    }, {
      key: "proportions",
      get: function get() {
        if (!this.offset) {
          this.offset = offset(this.element);
        }
        if (!this.size) {
          this.size = {
            width: getWidth(this.element),
            height: height(this.element)
          };
        }
        return {
          left: this.offset.left,
          top: this.offset.top,
          right: this.offset.left + this.size.width,
          bottom: this.offset.top + this.size.height,
          width: this.size.width,
          height: this.size.height
        };
      }
    }, {
      key: "refreshVisibility",
      value: function refreshVisibility() {
        this.visible = style(this.element, 'display') !== 'none';
      }
    }, {
      key: "refreshProportions",
      value: function refreshProportions() {
        this.offset = offset(this.element);
        this.size = {
          width: getWidth(this.element),
          height: height(this.element)
        };
      }
    }, {
      key: "intersect",
      value: function intersect$1(draggable, event) {
        var tolerance = this.options.tolerance;
        if (this.disabled || this.greedyChild || !this.visible) {
          return false;
        }
        return intersect(draggable.proportions, this.proportions, tolerance, event);
      }
    }, {
      key: "accept",
      value: function accept(draggable) {
        var accept = this.options.accept;
        if (this.disabled || !this.visible) {
          return false;
        }
        if (draggable) {
          if (accept === '*') {
            return true;
          }
          return isFunction$2(accept) ? accept(draggable.currentItem || draggable.element) : matches(draggable.currentItem || draggable.element, accept);
        }
        return false;
      }
    }, {
      key: "activate",
      value: function activate(event) {
        var draggable = DragDropManager$1.draggable;
        addClass(this.element, this.activeClass);
        if (draggable) {
          this.trigger(new DroppableActivateEvent({
            droppable: this,
            sensorEvent: event,
            draggable: draggable
          }));
        }
      }
    }, {
      key: "over",
      value: function over(event) {
        var draggable = DragDropManager$1.draggable;
        if (draggable && (draggable.currentItem || draggable.element) !== this.element && this.accept(draggable)) {
          addClass(this.element, this.hoverClass);
          this.isOver = true;
          this.trigger(new DroppableOverEvent({
            droppable: this,
            sensorEvent: event,
            draggable: draggable
          }));
        }
      }
    }, {
      key: "drop",
      value: function drop(event) {
        var _this2 = this;
        var draggable = DragDropManager$1.draggable;
        var childIntersection = false;
        if (draggable && (draggable.currentItem && draggable.element) !== this.element) {
          var childDroppables = qsa(this.element, ':not(.ui-draggable-dragging)').filter(function (element) {
            return element[_this2.dataProperty];
          });
          childDroppables.forEach(function (child) {
            var droppable = child[_this2.dataProperty];
            if (!childIntersection && droppable.greedy && droppable.scope === draggable.scope && droppable.intersect(draggable, event) && droppable.accept(draggable)) {
              childIntersection = true;
            }
          });
          if (childIntersection) {
            return null;
          }
          if (this.accept(draggable)) {
            removeClass(this.element, this.activeClass);
            removeClass(this.element, this.hoverClass);
            this.isOver = false;
            this.trigger(new DroppableDropEvent({
              droppable: this,
              sensorEvent: event,
              draggable: draggable
            }));
            return this;
          }
        }
        return null;
      }
    }, {
      key: "out",
      value: function out(event) {
        var draggable = DragDropManager$1.draggable;
        if (draggable && (draggable.currentItem || draggable.element) !== this.element && this.accept(draggable)) {
          removeClass(this.element, this.hoverClass);
          this.isOver = false;
          this.trigger(new DroppableOutEvent({
            droppable: this,
            sensorEvent: event,
            draggable: draggable
          }));
        }
      }
    }, {
      key: "deactivate",
      value: function deactivate(event) {
        var draggable = DragDropManager$1.draggable;
        removeClass(this.element, this.activeClass);
        this.isOver = false;
        if (draggable) {
          this.trigger(new DroppableDeactivateEvent({
            droppable: this,
            sensorEvent: event,
            draggable: draggable
          }));
        }
      }
    }, {
      key: "on",
      value: function on(type, callback) {
        this.emitter.on(type, callback);
      }
    }, {
      key: "off",
      value: function off(type, callback) {
        this.emitter.off(type, callback);
      }
    }, {
      key: "trigger",
      value: function trigger(event) {
        this.emitter.emit(event.type, event);
      }
    }]);
  }();
  _defineProperty(Droppable, "defaultOptions", {
    accept: '*',
    disabled: false,
    greedy: false,
    scope: 'default',
    tolerance: 'intersect'
  });

  var SortEvent = /*#__PURE__*/function (_AbstractEvent) {
    function SortEvent() {
      _classCallCheck(this, SortEvent);
      return _callSuper(this, SortEvent, arguments);
    }
    _inherits(SortEvent, _AbstractEvent);
    return _createClass(SortEvent, [{
      key: "source",
      get: function get() {
        return this.data.source || null;
      }
    }, {
      key: "helper",
      get: function get() {
        return this.data.helper || null;
      }
    }, {
      key: "placeholder",
      get: function get() {
        return this.data.placeholder || null;
      }
    }, {
      key: "sensorEvent",
      get: function get() {
        return this.data.sensorEvent || null;
      }
    }, {
      key: "originalEvent",
      get: function get() {
        return this.data.originalEvent || null;
      }
    }]);
  }(AbstractEvent);
  _defineProperty(SortEvent, "type", 'sort');
  var SortStartEvent = /*#__PURE__*/function (_SortEvent2) {
    function SortStartEvent() {
      _classCallCheck(this, SortStartEvent);
      return _callSuper(this, SortStartEvent, arguments);
    }
    _inherits(SortStartEvent, _SortEvent2);
    return _createClass(SortStartEvent);
  }(SortEvent);
  _defineProperty(SortStartEvent, "type", 'sort:start');
  _defineProperty(SortStartEvent, "cancelable", true);
  var SortMoveEvent = /*#__PURE__*/function (_SortEvent3) {
    function SortMoveEvent() {
      _classCallCheck(this, SortMoveEvent);
      return _callSuper(this, SortMoveEvent, arguments);
    }
    _inherits(SortMoveEvent, _SortEvent3);
    return _createClass(SortMoveEvent, [{
      key: "position",
      get: function get() {
        return this.data.position || null;
      }
    }]);
  }(SortEvent);
  _defineProperty(SortMoveEvent, "type", 'sort:move');
  _defineProperty(SortMoveEvent, "cancelable", true);
  var SortStopEvent = /*#__PURE__*/function (_SortEvent4) {
    function SortStopEvent() {
      _classCallCheck(this, SortStopEvent);
      return _callSuper(this, SortStopEvent, arguments);
    }
    _inherits(SortStopEvent, _SortEvent4);
    return _createClass(SortStopEvent, [{
      key: "droppable",
      get: function get() {
        return this.data.droppable || null;
      }
    }]);
  }(SortEvent);
  _defineProperty(SortStopEvent, "type", 'sort:stop');
  _defineProperty(SortStopEvent, "cancelable", true);

  var Sortable = /*#__PURE__*/function (_Draggable) {
    function Sortable() {
      var _this;
      _classCallCheck(this, Sortable);
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      _this = _callSuper(this, Sortable, [].concat(args));
      _defineProperty(_this, "connectedSortables", []);
      _defineProperty(_this, "currentConnectedSortable", null);
      _defineProperty(_this, "connectedDraggable", null);
      _defineProperty(_this, "items", []);
      _defineProperty(_this, "currentItem", null);
      _defineProperty(_this, "currentItemStyle", {});
      _defineProperty(_this, "currentItemProps", null);
      _defineProperty(_this, "elementProportions", null);
      _defineProperty(_this, "placeholder", null);
      _defineProperty(_this, "isOver", false);
      _defineProperty(_this, "isDraggableOver", false);
      _defineProperty(_this, "floating", false);
      _defineProperty(_this, "previousPosition", null);
      _defineProperty(_this, "resetCurrentItem", false);
      _defineProperty(_this, "rearrangeIteration", 0);
      _defineProperty(_this, "setup", function () {
        _this.addPlugin(new AxisConstraint(_this));
        _this.addPlugin(new DragContainmentConstraint(_this));
        _this.addPlugin(new DragGridConstraint(_this));
        _this.addPlugin(new StyleDecorator(_this, 'cursor'));
        _this.addPlugin(new StyleDecorator(_this, 'opacity'));
        _this.addPlugin(new StyleDecorator(_this, 'zIndex'));
        _this.addPlugin(new AutoScroll(_this));
        _this.addSensor(new MouseSensor(_this));
        document.addEventListener('mouse:down', _this.onMouseDown);
        document.addEventListener('mouse:start', _this.onDragStart);
        document.addEventListener('mouse:move', _this.onDragMove);
        document.addEventListener('mouse:stop', _this.onDragStop);
        _this.element[_this.dataProperty] = _this;
        addClass(_this.element, _this.elementClass);
        _this.refresh();
        _this.offset.element = offset(_this.element);
        _this.trigger(new SortableInitEvent({
          sortable: _this
        }));
      });
      _defineProperty(_this, "onMouseDown", function (event) {
        var sensorEvent = event.detail;
        if (sensorEvent.caller !== _this) {
          return;
        }
        if (_this.disabled || _this.reverting) {
          sensorEvent.cancel();
          return;
        }
        if (!_this.findItem(sensorEvent)) {
          sensorEvent.cancel();
        }
      });
      _defineProperty(_this, "onDragStart", function (event) {
        var noActivation = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
        var forceOwnership = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
        var sensorEvent = event.detail;
        if (sensorEvent.caller !== _this && !forceOwnership) {
          return;
        }
        if (_this.disabled || _this.reverting) {
          sensorEvent.cancel();
          return;
        }
        _this.refreshItems();
        _this.currentItem = _this.findItem(sensorEvent);
        if (!_this.currentItem) {
          sensorEvent.cancel();
          return;
        } else {
          _this.currentItemProps = {
            previous: _this.currentItem.previousElementSibling,
            parent: _this.currentItem.parentNode,
            previousIndex: getChildIndex(_this.currentItem)
          };
          _this.refreshPositions();
        }
        if (!_this.isInsideHandle(sensorEvent)) {
          sensorEvent.cancel();
          return;
        }
        _this.helper = _this.createHelper(sensorEvent);
        if (!_this.helper) {
          sensorEvent.cancel();
          return;
        }
        _this.createPlaceholder();
        addClass(_this.helper, _this.helperClass);
        _this.cacheMargins();
        _this.currentConnectedSortable = _this;
        _this.dragging = true;
        _this.cacheHelperSize();
        _this.helperAttrs = {
          scrollParent: scrollParent$1(_this.helper, false)
        };
        _this.startEvent = sensorEvent;
        _this.calculateOffsets(sensorEvent);
        _this.calculatePosition(sensorEvent, false);
        _this.items = _this.items.filter(function (item) {
          return item.element !== _this.currentItem;
        });
        setPositionAbsolute(_this.helper);
        _this.helperAttrs.cssPosition = 'absolute';
        if (_this.helper !== _this.currentItem) {
          hide(_this.currentItem);
        }
        var sortStart = new SortStartEvent({
          source: _this.currentItem,
          sensorEvent: sensorEvent,
          originalEvent: sensorEvent.originalEvent
        });
        _this.trigger(sortStart);
        if (sortStart.canceled) {
          _this.onDragCancel(createMouseStopEvent(_this.helper));
          return;
        }
        _this.cacheHelperSize();
        if (!noActivation) {
          _this.connectedSortables.forEach(function (sortable) {
            sortable.trigger(new SortableActivateEvent({
              sortable: sortable,
              sensorEvent: sensorEvent,
              peerSortable: _this
            }));
          });
        }
        DragDropManager$1.prepareOffsets(_this, sensorEvent);
        _this.onDragMove(event, true, forceOwnership);
        _this.scrollListeners = getParents(_this.element, 'body').map(function (parent) {
          return listen(parent, 'scroll', function () {
            return DragDropManager$1.prepareOffsets(_this, event);
          });
        });
      });
      _defineProperty(_this, "onDragCancel", function (event) {
        var sensorEvent = event.detail;
        _this.scrollListeners.forEach(function (listener) {
          return listener();
        });
        _this.scrollListeners = [];
        DragDropManager$1.onDragStop(_this, sensorEvent);
        _this.sensors.forEach(function (sensor) {
          return sensor.cancel(event);
        });
        _this.clear();
      });
      _defineProperty(_this, "onDragMove", function (event) {
        var noPropagation = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
        var forceOwnership = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
        var sensorEvent = event.detail;
        if ((sensorEvent.caller !== _this || !_this.dragging) && !forceOwnership) {
          return;
        }
        _this.calculatePosition(sensorEvent);
        if (!_this.previousPosition) {
          _this.previousPosition = _this.position.absolute;
        }
        if (!noPropagation) {
          var sortMove = new SortMoveEvent({
            source: _this.currentItem,
            helper: _this.helper,
            placeholder: _this.placeholder,
            sensorEvent: sensorEvent,
            originalEvent: sensorEvent.originalEvent,
            position: _this.position.current
          });
          _this.trigger(sortMove);
          if (sortMove.canceled) {
            return;
          }
        }
        style(_this.helper, {
          left: _this.position.current.left + 'px',
          top: _this.position.current.top + 'px'
        });
        var foundItem = null;
        _this.items.forEach(function (item) {
          if (!foundItem && item.instance === _this.currentConnectedSortable) {
            var intersection = _this.getPointerIntersection(item);
            if (intersection) {
              var tolerance = _this.options.tolerance;
              var element = item.element;
              if (element !== _this.currentItem && element !== _this.placeholder[intersection === 1 ? 'nextElementSibling' : 'previousElementSibling'] && !containsStrict(_this.placeholder, element)) {
                var direction = intersection === 1 ? 'down' : 'up';
                if (tolerance === 'pointer' || _this.intersectsWithSides(item)) {
                  _this.rearrange(null, item, direction);
                  _this.trigger(new SortableChangeEvent({
                    sortable: _this
                  }));
                  foundItem = item;
                }
              }
            }
          }
        });
        _this.contactSortables(sensorEvent);
        DragDropManager$1.onDragMove(_this, sensorEvent);
        _this.previousPosition = _this.position.absolute;
      });
      _defineProperty(_this, "onDragStop", function (event) {
        var forceOwnership = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
        var sensorEvent = event.detail;
        if ((sensorEvent.caller !== _this || !_this.dragging) && !forceOwnership) {
          return;
        }
        var _this$options = _this.options,
          revert = _this$options.revert,
          revertDuration = _this$options.revertDuration;
        var original = _this.position.original;
        var sortStop = new SortStopEvent({
          source: _this.currentItem,
          helper: _this.helper,
          droppable: DragDropManager$1.drop(_this, sensorEvent),
          sensorEvent: sensorEvent,
          originalEvent: sensorEvent.originalEvent
        });
        if (revert === 'invalid' && !sortStop.droppable || revert === 'valid' && sortStop.droppable || isFunction$2(revert) && revert(_this.currentItem, sortStop.droppable) || revert === true) {
          _this.reverting = true;
          anime({
            targets: [_this.helper],
            left: original.left + 'px',
            top: original.top + 'px',
            duration: revertDuration,
            easing: 'linear',
            complete: function complete() {
              _this.reverting = false;
              _this.trigger(sortStop);
              if (!sortStop.canceled) {
                _this.clear();
              }
            }
          });
        } else {
          _this.trigger(sortStop);
          if (!sortStop.canceled) {
            _this.applyChanges();
            _this.clear();
          }
        }
      });
      return _this;
    }
    _inherits(Sortable, _Draggable);
    return _createClass(Sortable, [{
      key: "setOption",
      value: function setOption(opt, value) {
        switch (opt) {
          case 'appendTo':
          case 'axis':
          case 'connectWith':
          case 'cursor':
          case 'disabled':
          case 'distance':
          case 'dropOnEmpty':
          case 'forceHelperSize':
          case 'forcePlaceholderSize':
          case 'hidePlaceholder':
          case 'grid':
          case 'items':
          case 'helper':
          case 'opacity':
          case 'revert':
          case 'revertDuration':
          case 'scope':
          case 'scroll':
          case 'scrollSensitivity':
          case 'scrollSpeed':
          case 'skip':
          case 'tolerance':
          case 'zIndex':
            this.options[opt] = value;
            break;
          case 'containment':
            this.options.containment = value;
            this.containmentCoords = undefined;
            break;
          default:
            throw new Error("The option ".concat(opt, " is invalid or can't be changed dynamically"));
        }
      }
    }, {
      key: "cancel",
      value: function cancel() {
        this.resetCurrentItem = true;
        _superPropGet(Sortable, "cancel", this, 3)([]);
      }
    }, {
      key: "destroy",
      value: function destroy() {
        var _this2 = this;
        if (this.dragging) {
          this.pendingDestroy = true;
          return;
        }
        this.plugins.forEach(function (plugin) {
          return plugin.detach();
        });
        this.sensors.forEach(function (sensor) {
          return sensor.detach();
        });
        document.removeEventListener('mouse:start', this.onDragStart);
        document.removeEventListener('mouse:move', this.onDragMove);
        document.removeEventListener('mouse:stop', this.onDragStop);
        delete this.element[this.dataProperty];
        removeClass(this.element, this.elementClass);
        this.items.forEach(function (item) {
          return delete item.element[_this2.dataProperty];
        });
        this.findHandles().forEach(function (handle) {
          removeClass(handle, _this2.handleClass);
        });
        this.trigger(new SortableDestroyEvent({
          sortable: this
        }));
      }
    }, {
      key: "dataProperty",
      get: function get() {
        return sortableProp;
      }
    }, {
      key: "elementClass",
      get: function get() {
        return sortableEl;
      }
    }, {
      key: "handleClass",
      get: function get() {
        return sortableHandle;
      }
    }, {
      key: "helperClass",
      get: function get() {
        return sortableHelper;
      }
    }, {
      key: "placeholderClass",
      get: function get() {
        return sortablePlaceholder;
      }
    }, {
      key: "over",
      value: function over() {
        var peerSortable = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
        var draggable = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
        if (!this.isOver) {
          this.trigger(new SortableOverEvent({
            sortable: this,
            peerSortable: peerSortable,
            draggable: draggable
          }));
          this.isOver = true;
        }
      }
    }, {
      key: "out",
      value: function out() {
        var peerSortable = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
        var draggable = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
        if (this.isOver) {
          this.trigger(new SortableOutEvent({
            sortable: this,
            peerSortable: peerSortable,
            draggable: draggable
          }));
          this.isOver = false;
        }
      }
    }, {
      key: "refresh",
      value: function refresh() {
        var _this3 = this;
        this.refreshItems();
        this.refreshPositions();
        this.findHandles().forEach(function (handle) {
          addClass(handle, _this3.handleClass);
        });
      }
    }, {
      key: "refreshItems",
      value: function refreshItems() {
        var _this4 = this;
        var connectWith = this.options.connectWith;
        this.connectedSortables = [this];
        this.items = this.findItems();
        var connectedSortables = connectWith ? qsa(document, connectWith) : [];
        connectedSortables.forEach(function (element) {
          var sortable = element[_this4.dataProperty];
          if (sortable && sortable !== _this4 && !sortable.disabled) {
            _this4.items = _this4.items.concat(sortable.findItems(null, _this4.currentItem));
            _this4.connectedSortables.push(sortable);
          }
        });
      }
    }, {
      key: "refreshPositions",
      value: function refreshPositions() {
        var _this5 = this;
        var axis = this.options.axis;
        this.floating = this.items.length ? axis === 'x' || isFloating(this.items[0].element) : false;
        if (this.helper && this.helperAttrs && this.helperAttrs.offsetParent) {
          this.offset.parent = this.getParentOffset();
        }
        this.items.forEach(function (item) {
          if (!_this5.currentConnectedSortable || _this5.currentConnectedSortable === _this5 || item.element === _this5.currentItem) {
            var _offset = offset(item.element),
              _width = _offset.width,
              _height = _offset.height,
              left = _offset.left,
              top = _offset.top;
            item.width = _width;
            item.height = _height;
            item.left = left;
            item.top = top;
          }
        });
        this.connectedSortables.forEach(function (sortable) {
          return sortable.cacheElementProportions();
        });
      }
    }, {
      key: "findItem",
      value: function findItem(event) {
        var _this6 = this;
        var currentItem = getParents(event.target).find(function (element) {
          return element !== _this6.element && element[_this6.dataProperty] === _this6;
        });
        if (!currentItem && event.target !== this.element && event.target[this.dataProperty] === this) {
          currentItem = event.target;
        }
        return currentItem;
      }
    }, {
      key: "findItems",
      value: function findItems() {
        var _this7 = this;
        var filter = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
        var currentItem = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
        var response = [];
        var items = this.options.items;
        var mapToItem = function mapToItem(item) {
          item[_this7.dataProperty] = _this7;
          return {
            element: item,
            instance: _this7,
            width: 0,
            height: 0,
            left: 0,
            top: 0
          };
        };
        if (isFunction$2(items)) {
          response = items({
            options: this.options,
            item: currentItem || this.currentItem
          });
          if (!Array.isArray(response)) {
            return [];
          }
        } else {
          response = items ? qsa(this.element, items) : toArray$1(this.element.childNodes).filter(function (node) {
            return node.nodeType === 1;
          });
        }
        return isFunction$2(filter) ? response.filter(filter).map(mapToItem) : response.map(mapToItem);
      }
    }, {
      key: "findClosestItem",
      value: function findClosestItem(event, sortable) {
        var _this8 = this;
        var closestItem = null;
        var distance = 10000;
        var floating = sortable.floating || isFloating(this.currentItem);
        var nearBottom = false;
        var posValue = null;
        var eventProp = floating ? 'pageX' : 'pageY';
        this.items.forEach(function (item) {
          if (containsStrict(sortable.element, item.element) && item.element !== _this8.currentItem) {
            nearBottom = false;
            posValue = offset(item.element)[floating ? 'left' : 'top'];
            if (event[eventProp] - posValue > item[floating ? 'width' : 'height'] / 2) {
              nearBottom = true;
            }
            if (Math.abs(event[eventProp] - posValue) < distance) {
              distance = Math.abs(event[eventProp] - posValue);
              closestItem = item;
            }
          }
        });
        return {
          item: closestItem,
          nearBottom: nearBottom
        };
      }
    }, {
      key: "findHandles",
      value: function findHandles() {
        var handles = [];
        var handle = this.options.handle;
        this.items.forEach(function (item) {
          if (handle) {
            handles = handles.concat(qsa(item.element, handle));
          } else {
            handles.push(item.element);
          }
        });
        return handles;
      }
    }, {
      key: "createHelper",
      value: function createHelper(event) {
        var helperNode = null;
        var _this$options2 = this.options,
          appendTo = _this$options2.appendTo,
          helper = _this$options2.helper,
          forceHelperSize = _this$options2.forceHelperSize;
        if (isFunction$2(helper)) {
          helperNode = helper.apply(this.element, [event, this.currentItem]);
        } else if (helper === 'clone') {
          helperNode = this.currentItem.cloneNode(true);
          helperNode.removeAttribute('id');
          helperNode.removeAttribute(this.dataProperty);
          helperNode[this.dataProperty] = this;
        } else {
          helperNode = this.currentItem;
        }
        if (helperNode instanceof HTMLElement) {
          if (!closest(helperNode, 'body')) {
            var parent = appendTo === 'parent' ? this.currentItem.parentNode : document.querySelector(appendTo);
            if (parent instanceof HTMLElement) {
              parent.appendChild(helperNode);
            } else {
              return null;
            }
          }
          if (helperNode === this.currentItem) {
            this.currentItemStyle = {
              width: getWidth(this.currentItem),
              height: height(this.currentItem),
              position: style(this.currentItem, 'position'),
              left: style(this.currentItem, 'left'),
              top: style(this.currentItem, 'top')
            };
          }
          if (!helperNode.style.width || forceHelperSize) {
            style(helperNode, {
              width: getWidth(this.currentItem) + 'px',
              boxSizing: 'border-box'
            });
          }
          if (!helperNode.style.height || forceHelperSize) {
            style(helperNode, {
              height: height(this.currentItem) + 'px',
              boxSizing: 'border-box'
            });
          }
          return helperNode;
        }
        return null;
      }
    }, {
      key: "createPlaceholder",
      value: function createPlaceholder() {
        if (!this.placeholder) {
          var nodeName = this.currentItem.nodeName.toLowerCase();
          var element = document.createElement(nodeName);
          element.className = this.currentItem.className;
          addClass(element, this.placeholderClass);
          removeClass(element, this.helperClass);
          if (nodeName === 'thead' || nodeName === 'tbody') {
            var tableRow = document.createElement('tr');
            element.appendChild(tableRow);
            this.createTableRowPlaceholder(this.currentItem.querySelector('tr'), tableRow, nodeName === 'thead' ? 'th' : 'tr');
          } else if (nodeName === 'tr') {
            this.createTableRowPlaceholder(this.currentItem, element, 'tr');
          } else if (nodeName === 'img') {
            element.setAttribute('src', this.currentItem.getAttribute('src'));
          }
          this.placeholder = insertAfter(element, this.currentItem);
          this.updatePlaceholder(this, element);
        } else {
          this.updatePlaceholder(this, this.placeholder);
        }
      }
    }, {
      key: "createTableRowPlaceholder",
      value: function createTableRowPlaceholder(sourceRow, newRow, childTag) {
        qsa(sourceRow, childTag).forEach(function (child) {
          var newChild = document.createElement(childTag);
          newChild.innerHTML = '&#160;';
          newChild.setAttribute('colspan', child.getAttribute('colspan'));
          newRow.appendChild(newChild);
        });
      }
    }, {
      key: "updatePlaceholder",
      value: function updatePlaceholder(sortable, placeholder) {
        var _sortable$options = sortable.options,
          forcePlaceholderSize = _sortable$options.forcePlaceholderSize,
          hidePlaceholder = _sortable$options.hidePlaceholder;
        if (hidePlaceholder) {
          style(placeholder, {
            visibility: 'hidden'
          });
        } else if (forcePlaceholderSize) {
          if (!getWidth(placeholder)) {
            style(placeholder, {
              width: getWidth(this.currentItem) + 'px'
            });
          }
          if (!height(placeholder)) {
            style(placeholder, {
              height: height(this.currentItem) + 'px'
            });
          }
        }
      }
    }, {
      key: "cacheMargins",
      value: function cacheMargins() {
        this.margins = {
          left: parseInt(style(this.currentItem, 'marginLeft'), 10) || 0,
          top: parseInt(style(this.currentItem, 'marginTop'), 10) || 0,
          right: parseInt(style(this.currentItem, 'marginRight'), 10) || 0,
          bottom: parseInt(style(this.currentItem, 'marginBottom'), 10) || 0
        };
      }
    }, {
      key: "cacheElementProportions",
      value: function cacheElementProportions() {
        this.elementProportions = offset(this.element);
      }
    }, {
      key: "calculateOffsets",
      value: function calculateOffsets(event) {
        var itemOffset = offset(this.currentItem);
        this.offset.click = {
          left: event.pageX - itemOffset.left - this.margins.left,
          top: event.pageY - itemOffset.top - this.margins.top
        };
        this.offset.parent = this.getParentOffset();
        this.offset.relative = this.getRelativeOffset();
      }
    }, {
      key: "getParentOffset",
      value: function getParentOffset() {
        this.helperAttrs.offsetParent = offsetParent(this.helper);
        return _superPropGet(Sortable, "getParentOffset", this, 3)([]);
      }
    }, {
      key: "calculatePosition",
      value: function calculatePosition(event) {
        var constraint = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
        var _ref = constraint ? this.constraintPosition(event) : event,
          pageX = _ref.pageX,
          pageY = _ref.pageY;
        var scrollParent = this.helperAttrs.scrollParent;
        var _this$helperAttrs = this.helperAttrs,
          cssPosition = _this$helperAttrs.cssPosition,
          offsetParent = _this$helperAttrs.offsetParent;
        var scrollIsRoot = isRoot(scrollParent);
        if (cssPosition === 'absolute' && !(scrollParent !== document && containsStrict(scrollParent, offsetParent))) {
          scrollParent = offsetParent;
          scrollIsRoot = isRoot(scrollParent);
        }
        if (cssPosition === 'relative' && scrollParent === document && scrollParent !== offsetParent) {
          this.offset.relative = this.getRelativeOffset();
        }
        this.offset.scroll = {
          left: scrollLeft(scrollParent),
          top: scrollTop(scrollParent)
        };
        var _this$offset = this.offset,
          click = _this$offset.click,
          parent = _this$offset.parent,
          relative = _this$offset.relative,
          scroll = _this$offset.scroll;
        var position = {
          left: pageX - click.left - parent.left - relative.left + (cssPosition === 'fixed' ? -scroll.left : scrollIsRoot ? 0 : scroll.left),
          top: pageY - click.top - parent.top - relative.top + (cssPosition === 'fixed' ? -scroll.top : scrollIsRoot ? 0 : scroll.top)
        };
        if (!this.position.original) {
          this.position.original = position;
        }
        this.position.current = position;
        this.position.absolute = this.convertPosition(position, 'absolute');
      }
    }, {
      key: "convertPosition",
      value: function convertPosition(position, to) {
        var scrollParent = this.helperAttrs.scrollParent;
        var _this$helperAttrs2 = this.helperAttrs,
          cssPosition = _this$helperAttrs2.cssPosition,
          offsetParent = _this$helperAttrs2.offsetParent;
        var _this$offset2 = this.offset,
          parent = _this$offset2.parent,
          relative = _this$offset2.relative;
        var factor = to === 'absolute' ? 1 : -1;
        var scrollIsRoot = isRoot(scrollParent);
        if (cssPosition === 'absolute' && !(scrollParent !== document && containsStrict(scrollParent, offsetParent))) {
          scrollParent = offsetParent;
          scrollIsRoot = isRoot(scrollParent);
        }
        return {
          left: position.left + parent.left * factor + relative.left * factor - (cssPosition === 'fixed' ? -scrollLeft(scrollParent) : (scrollIsRoot ? 0 : scrollLeft(scrollParent)) * factor),
          top: position.top + parent.top * factor + relative.top * factor - (cssPosition === 'fixed' ? -scrollTop(scrollParent) : (scrollIsRoot ? 0 : scrollTop(scrollParent)) * factor)
        };
      }
    }, {
      key: "getDragDirection",
      value: function getDragDirection(axis) {
        var delta = this.position.absolute[axis === 'x' ? 'left' : 'top'] - this.previousPosition[axis === 'x' ? 'left' : 'top'];
        return delta !== 0 ? delta > 0 ? axis === 'x' ? 'right' : 'down' : axis === 'x' ? 'left' : 'up' : null;
      }
    }, {
      key: "getPointerIntersection",
      value: function getPointerIntersection(item) {
        var axis = this.options.axis;
        var click = this.offset.click;
        var absolute = this.position.absolute;
        var pointer = {
          x: absolute.left + click.left,
          y: absolute.top + click.top
        };
        var isOverItem = (axis === 'y' || pointer.x >= item.left && pointer.x < item.left + item.width) && (axis === 'x' || pointer.y >= item.top && pointer.y < item.top + item.height);
        if (!isOverItem) {
          return 0;
        }
        var dragDirectionX = this.getDragDirection('x');
        var dragDirectionY = this.getDragDirection('y');
        return this.floating ? dragDirectionX === 'right' || dragDirectionY === 'bottom' ? 2 : 1 : dragDirectionY === 'down' ? 2 : 1;
      }
    }, {
      key: "intersectsWith",
      value: function intersectsWith(compareWith) {
        var _this$options3 = this.options,
          axis = _this$options3.axis,
          tolerance = _this$options3.tolerance;
        var _this$helperSize = this.helperSize,
          width = _this$helperSize.width,
          height = _this$helperSize.height;
        var click = this.offset.click;
        var absolute = this.position.absolute;
        var proportions = {
          left: absolute.left + click.left,
          top: absolute.top + click.top,
          right: absolute.left + click.left + width,
          bottom: absolute.top + click.top + height,
          width: width,
          height: height
        };
        if (tolerance === 'pointer' || this.floating && width > compareWith.width || !this.floating && height > compareWith.height) {
          return (axis === 'y' || proportions.left > compareWith.left && proportions.left < compareWith.left + compareWith.width) && (axis === 'x' || proportions.top > compareWith.top && proportions.top < compareWith.top + compareWith.height);
        }
        return compareWith.left < absolute.left + width / 2 && compareWith.left + compareWith.width > absolute.left + width / 2 && compareWith.top < absolute.top + height / 2 && compareWith.top + compareWith.height > absolute.top + height / 2;
      }
    }, {
      key: "intersectsWithSides",
      value: function intersectsWithSides(item) {
        var width = item.width,
          height = item.height,
          left = item.left,
          top = item.top;
        var click = this.offset.click;
        var absolute = this.position.absolute;
        var pointer = {
          x: absolute.left + click.left,
          y: absolute.top + click.top
        };
        var itemCenter = {
          x: left + width / 2,
          y: top + height / 2
        };
        var dragDirectionX = this.getDragDirection('x');
        var dragDirectionY = this.getDragDirection('y');
        if (this.floating && dragDirectionX) {
          return dragDirectionX === 'right' && pointer.x >= itemCenter.x && pointer.x < itemCenter.x + width || dragDirectionX === 'left' && !(pointer.x >= itemCenter.x && pointer.x < itemCenter.x + width);
        }
        return dragDirectionY === 'down' && pointer.y >= itemCenter.y && pointer.y < itemCenter.y + height || dragDirectionY === 'up' && !(pointer.y >= itemCenter.y && pointer.y < itemCenter.y + height);
      }
    }, {
      key: "contactSortables",
      value: function contactSortables(event) {
        var _this9 = this;
        var activeSortable = null;
        var closestItem = null;
        var changeEvent = new SortableChangeEvent({
          sortable: this
        });
        this.connectedSortables.forEach(function (sortable) {
          if (!containsStrict(_this9.currentItem, sortable.element)) {
            if (_this9.intersectsWith(sortable.elementProportions)) {
              if (!activeSortable || !containsStrict(sortable.element, activeSortable.element)) {
                activeSortable = sortable;
              }
            } else {
              sortable.out(_this9);
            }
          }
        });
        if (activeSortable) {
          if (this.connectedSortables.length === 1) {
            activeSortable.over(null);
          } else {
            closestItem = this.findClosestItem(event, activeSortable);
            if (closestItem.item || this.options.dropOnEmpty) {
              if (this.currentConnectedSortable === activeSortable) {
                activeSortable.over(this);
              } else {
                if (closestItem.item) {
                  this.rearrange(null, closestItem.item, closestItem.nearBottom ? 'up' : 'down');
                } else {
                  this.rearrange(activeSortable.element);
                }
                this.trigger(changeEvent);
                activeSortable.over(this);
                activeSortable.trigger(changeEvent);
                this.currentConnectedSortable = activeSortable;
                this.updatePlaceholder(activeSortable, this.placeholder);
              }
            }
          }
        }
      }
    }, {
      key: "rearrange",
      value: function rearrange() {
        var _this10 = this;
        var parentEl = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
        var refItem = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
        var direction = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
        if (parentEl instanceof HTMLElement) {
          parentEl.appendChild(this.placeholder);
        } else if (refItem && refItem.element instanceof HTMLElement) {
          refItem.element.parentNode.insertBefore(this.placeholder, direction === 'down' ? refItem.element : refItem.element.nextSibling);
        } else {
          return;
        }
        this.rearrangeIteration = this.rearrangeIteration ? this.rearrangeIteration++ : 1;
        var iteration = this.rearrangeIteration;
        setTimeout(function () {
          if (iteration === _this10.rearrangeIteration) {
            _this10.refreshPositions();
          }
        });
      }
    }, {
      key: "applyChanges",
      value: function applyChanges() {
        var _this11 = this;
        var newIndex = null;
        if (this.helper && this.currentItem) {
          insertBefore(this.currentItem, this.placeholder);
          newIndex = getChildIndex(this.currentItem);
          if (this.helper === this.currentItem) {
            forEach$1(this.currentItemStyle, function (value, prop) {
              if (value === 'auto' || value === 'static') {
                _this11.currentItemStyle[prop] = '';
              }
            });
            style(this.currentItem, this.currentItemStyle);
          } else {
            show(this.currentItem);
          }
          if (this.resetCurrentItem) {
            var _this$currentItemProp = this.currentItemProps,
              previous = _this$currentItemProp.previous,
              parent = _this$currentItemProp.parent;
            if (previous) {
              insertAfter(this.currentItem, previous);
            } else {
              insertBefore(this.currentItem, parent.firstElementChild);
            }
            this.resetCurrentItem = false;
          }
        }
        if (this.connectedDraggable) {
          this.trigger(new SortableReceiveEvent({
            sortable: this,
            item: this.connectedDraggable.element,
            newIndex: newIndex,
            draggable: this.connectedDraggable
          }));
        }
        if (this.connectedDraggable || this.currentItemProps.previous !== getSibling(this.currentItem, 'previous', ".".concat(this.helperClass)) || this.currentItemProps.parent !== this.currentItem.parentNode) {
          this.trigger(new SortableUpdateEvent({
            sortable: this,
            item: this.currentItem,
            previousIndex: this.currentItemProps.previousIndex,
            newIndex: newIndex,
            peerSortable: this.currentConnectedSortable !== this ? this.currentConnectedSortable : null
          }));
        }
        if (this.currentConnectedSortable !== this) {
          this.trigger(new SortableRemoveEvent({
            sortable: this,
            item: this.currentItem,
            previousIndex: this.currentItemProps.previousIndex,
            peerSortable: this.currentConnectedSortable
          }));
          this.currentConnectedSortable.trigger(new SortableReceiveEvent({
            sortable: this.currentConnectedSortable,
            item: this.currentItem,
            newIndex: newIndex,
            peerSortable: this
          }));
          this.currentConnectedSortable.trigger(new SortableUpdateEvent({
            sortable: this.currentConnectedSortable,
            peerSortable: this,
            previousIndex: this.currentItemProps.previousIndex,
            newIndex: newIndex
          }));
        }
        this.connectedSortables.forEach(function (sortable) {
          sortable.out(_this11);
          sortable.trigger(new SortableDeactivateEvent({
            sortable: sortable,
            peerSortable: _this11
          }));
        });
      }
    }, {
      key: "clear",
      value: function clear() {
        if (this.placeholder) {
          if (this.placeholder.parentNode) {
            this.placeholder.parentNode.removeChild(this.placeholder);
          }
          this.placeholder = null;
        }
        if (this.helper) {
          removeClass(this.helper, this.helperClass);
          if (this.helper !== this.currentItem && !this.cancelHelperRemoval) {
            this.helper.parentNode.removeChild(this.helper);
          }
          this.cancelHelperRemoval = false;
          this.helper = null;
        }
        this.connectedDraggable = null;
        this.currentItem = null;
        this.currentItemProps = null;
        this.dragging = false;
        if (this.pendingDestroy) {
          this.destroy();
          this.pendingDestroy = false;
        }
      }
    }]);
  }(Draggable);
  _defineProperty(Sortable, "defaultOptions", {
    appendTo: 'parent',
    axis: null,
    connectWith: null,
    containment: null,
    cursor: null,
    disabled: false,
    distance: 0,
    dropOnEmpty: true,
    forceHelperSize: false,
    forcePlaceholderSize: false,
    hidePlaceholder: false,
    grid: null,
    handle: null,
    helper: 'original',
    items: null,
    opacity: null,
    revert: false,
    revertDuration: 200,
    scope: 'default',
    scroll: true,
    scrollSensitivity: 20,
    scrollSpeed: 10,
    skip: 'input, textarea, button, select, option',
    tolerance: 'intersect',
    zIndex: null
  });

  /* eslint-disable es/no-array-prototype-indexof -- required for testing */
  var $$1 = _export;
  var uncurryThis$2 = functionUncurryThisClause;
  var $indexOf = arrayIncludes.indexOf;
  var arrayMethodIsStrict = arrayMethodIsStrict$5;

  var nativeIndexOf = uncurryThis$2([].indexOf);

  var NEGATIVE_ZERO = !!nativeIndexOf && 1 / nativeIndexOf([1], 1, -0) < 0;
  var FORCED = NEGATIVE_ZERO || !arrayMethodIsStrict('indexOf');

  // `Array.prototype.indexOf` method
  // https://tc39.es/ecma262/#sec-array.prototype.indexof
  $$1({ target: 'Array', proto: true, forced: FORCED }, {
    indexOf: function indexOf(searchElement /* , fromIndex = 0 */) {
      var fromIndex = arguments.length > 1 ? arguments[1] : undefined;
      return NEGATIVE_ZERO
        // convert -0 to +0
        ? nativeIndexOf(this, searchElement, fromIndex) || 0
        : $indexOf(this, searchElement, fromIndex);
    }
  });

  // TODO: Remove from `core-js@4` since it's moved to entry points

  var uncurryThis$1 = functionUncurryThisClause;
  var defineBuiltIn = defineBuiltIn$5;
  var regexpExec$1 = regexpExec$2;
  var fails$1 = fails$l;
  var wellKnownSymbol = wellKnownSymbol$g;
  var createNonEnumerableProperty = createNonEnumerableProperty$4;

  var SPECIES = wellKnownSymbol('species');
  var RegExpPrototype = RegExp.prototype;

  var fixRegexpWellKnownSymbolLogic = function (KEY, exec, FORCED, SHAM) {
    var SYMBOL = wellKnownSymbol(KEY);

    var DELEGATES_TO_SYMBOL = !fails$1(function () {
      // String methods call symbol-named RegEp methods
      var O = {};
      O[SYMBOL] = function () { return 7; };
      return ''[KEY](O) != 7;
    });

    var DELEGATES_TO_EXEC = DELEGATES_TO_SYMBOL && !fails$1(function () {
      // Symbol-named RegExp methods call .exec
      var execCalled = false;
      var re = /a/;

      if (KEY === 'split') {
        // We can't use real regex here since it causes deoptimization
        // and serious performance degradation in V8
        // https://github.com/zloirock/core-js/issues/306
        re = {};
        // RegExp[@@split] doesn't call the regex's exec method, but first creates
        // a new one. We need to return the patched regex when creating the new one.
        re.constructor = {};
        re.constructor[SPECIES] = function () { return re; };
        re.flags = '';
        re[SYMBOL] = /./[SYMBOL];
      }

      re.exec = function () { execCalled = true; return null; };

      re[SYMBOL]('');
      return !execCalled;
    });

    if (
      !DELEGATES_TO_SYMBOL ||
      !DELEGATES_TO_EXEC ||
      FORCED
    ) {
      var uncurriedNativeRegExpMethod = uncurryThis$1(/./[SYMBOL]);
      var methods = exec(SYMBOL, ''[KEY], function (nativeMethod, regexp, str, arg2, forceStringMethod) {
        var uncurriedNativeMethod = uncurryThis$1(nativeMethod);
        var $exec = regexp.exec;
        if ($exec === regexpExec$1 || $exec === RegExpPrototype.exec) {
          if (DELEGATES_TO_SYMBOL && !forceStringMethod) {
            // The native String method already delegates to @@method (this
            // polyfilled function), leasing to infinite recursion.
            // We avoid it by directly calling the native @@method method.
            return { done: true, value: uncurriedNativeRegExpMethod(regexp, str, arg2) };
          }
          return { done: true, value: uncurriedNativeMethod(str, regexp, arg2) };
        }
        return { done: false };
      });

      defineBuiltIn(String.prototype, KEY, methods[0]);
      defineBuiltIn(RegExpPrototype, SYMBOL, methods[1]);
    }

    if (SHAM) createNonEnumerableProperty(RegExpPrototype[SYMBOL], 'sham', true);
  };

  var uncurryThis = functionUncurryThis;
  var toIntegerOrInfinity = toIntegerOrInfinity$3;
  var toString$1 = toString$a;
  var requireObjectCoercible$1 = requireObjectCoercible$5;

  var charAt$1 = uncurryThis(''.charAt);
  var charCodeAt = uncurryThis(''.charCodeAt);
  var stringSlice = uncurryThis(''.slice);

  var createMethod = function (CONVERT_TO_STRING) {
    return function ($this, pos) {
      var S = toString$1(requireObjectCoercible$1($this));
      var position = toIntegerOrInfinity(pos);
      var size = S.length;
      var first, second;
      if (position < 0 || position >= size) return CONVERT_TO_STRING ? '' : undefined;
      first = charCodeAt(S, position);
      return first < 0xD800 || first > 0xDBFF || position + 1 === size
        || (second = charCodeAt(S, position + 1)) < 0xDC00 || second > 0xDFFF
          ? CONVERT_TO_STRING
            ? charAt$1(S, position)
            : first
          : CONVERT_TO_STRING
            ? stringSlice(S, position, position + 2)
            : (first - 0xD800 << 10) + (second - 0xDC00) + 0x10000;
    };
  };

  var stringMultibyte = {
    // `String.prototype.codePointAt` method
    // https://tc39.es/ecma262/#sec-string.prototype.codepointat
    codeAt: createMethod(false),
    // `String.prototype.at` method
    // https://github.com/mathiasbynens/String.prototype.at
    charAt: createMethod(true)
  };

  var charAt = stringMultibyte.charAt;

  // `AdvanceStringIndex` abstract operation
  // https://tc39.es/ecma262/#sec-advancestringindex
  var advanceStringIndex$1 = function (S, index, unicode) {
    return index + (unicode ? charAt(S, index).length : 1);
  };

  var call$1 = functionCall;
  var anObject$1 = anObject$d;
  var isCallable = isCallable$j;
  var classof = classofRaw$2;
  var regexpExec = regexpExec$2;

  var $TypeError = TypeError;

  // `RegExpExec` abstract operation
  // https://tc39.es/ecma262/#sec-regexpexec
  var regexpExecAbstract = function (R, S) {
    var exec = R.exec;
    if (isCallable(exec)) {
      var result = call$1(exec, R, S);
      if (result !== null) anObject$1(result);
      return result;
    }
    if (classof(R) === 'RegExp') return call$1(regexpExec, R, S);
    throw $TypeError('RegExp#exec called on incompatible receiver');
  };

  var call = functionCall;
  var fixRegExpWellKnownSymbolLogic = fixRegexpWellKnownSymbolLogic;
  var anObject = anObject$d;
  var isNullOrUndefined = isNullOrUndefined$5;
  var toLength = toLength$2;
  var toString = toString$a;
  var requireObjectCoercible = requireObjectCoercible$5;
  var getMethod = getMethod$4;
  var advanceStringIndex = advanceStringIndex$1;
  var regExpExec = regexpExecAbstract;

  // @@match logic
  fixRegExpWellKnownSymbolLogic('match', function (MATCH, nativeMatch, maybeCallNative) {
    return [
      // `String.prototype.match` method
      // https://tc39.es/ecma262/#sec-string.prototype.match
      function match(regexp) {
        var O = requireObjectCoercible(this);
        var matcher = isNullOrUndefined(regexp) ? undefined : getMethod(regexp, MATCH);
        return matcher ? call(matcher, regexp, O) : new RegExp(regexp)[MATCH](toString(O));
      },
      // `RegExp.prototype[@@match]` method
      // https://tc39.es/ecma262/#sec-regexp.prototype-@@match
      function (string) {
        var rx = anObject(this);
        var S = toString(string);
        var res = maybeCallNative(nativeMatch, rx, S);

        if (res.done) return res.value;

        if (!rx.global) return regExpExec(rx, S);

        var fullUnicode = rx.unicode;
        rx.lastIndex = 0;
        var A = [];
        var n = 0;
        var result;
        while ((result = regExpExec(rx, S)) !== null) {
          var matchStr = toString(result[0]);
          A[n] = matchStr;
          if (matchStr === '') rx.lastIndex = advanceStringIndex(S, toLength(rx.lastIndex), fullUnicode);
          n++;
        }
        return n === 0 ? null : A;
      }
    ];
  });

  var PROPER_FUNCTION_NAME = functionName.PROPER;
  var fails = fails$l;
  var whitespaces = whitespaces$4;

  var non = '\u200B\u0085\u180E';

  // check that a method works with the correct list
  // of whitespaces and has a correct name
  var stringTrimForced = function (METHOD_NAME) {
    return fails(function () {
      return !!whitespaces[METHOD_NAME]()
        || non[METHOD_NAME]() !== non
        || (PROPER_FUNCTION_NAME && whitespaces[METHOD_NAME].name !== METHOD_NAME);
    });
  };

  var $ = _export;
  var $trim = stringTrim.trim;
  var forcedStringTrimMethod = stringTrimForced;

  // `String.prototype.trim` method
  // https://tc39.es/ecma262/#sec-string.prototype.trim
  $({ target: 'String', proto: true, forced: forcedStringTrimMethod('trim') }, {
    trim: function trim() {
      return $trim(this);
    }
  });

  var root = _root;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeIsFinite = root.isFinite;

  /**
   * Checks if `value` is a finite primitive number.
   *
   * **Note:** This method is based on
   * [`Number.isFinite`](https://mdn.io/Number/isFinite).
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a finite number, else `false`.
   * @example
   *
   * _.isFinite(3);
   * // => true
   *
   * _.isFinite(Number.MIN_VALUE);
   * // => true
   *
   * _.isFinite(Infinity);
   * // => false
   *
   * _.isFinite('3');
   * // => false
   */
  function isFinite(value) {
    return typeof value == 'number' && nativeIsFinite(value);
  }

  var _isFinite = isFinite;

  var isFinite$1 = /*@__PURE__*/getDefaultExportFromCjs(_isFinite);

  var baseGetTag = _baseGetTag,
      isArray = isArray_1,
      isObjectLike = isObjectLike_1;

  /** `Object#toString` result references. */
  var stringTag = '[object String]';

  /**
   * Checks if `value` is classified as a `String` primitive or object.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a string, else `false`.
   * @example
   *
   * _.isString('abc');
   * // => true
   *
   * _.isString(1);
   * // => false
   */
  function isString(value) {
    return typeof value == 'string' ||
      (!isArray(value) && isObjectLike(value) && baseGetTag(value) == stringTag);
  }

  var isString_1 = isString;

  var isString$1 = /*@__PURE__*/getDefaultExportFromCjs(isString_1);

  var ResizableEvent = /*#__PURE__*/function (_AbstractEvent) {
    function ResizableEvent() {
      _classCallCheck(this, ResizableEvent);
      return _callSuper(this, ResizableEvent, arguments);
    }
    _inherits(ResizableEvent, _AbstractEvent);
    return _createClass(ResizableEvent, [{
      key: "resizable",
      get: function get() {
        return this.data.resizable || null;
      }
    }]);
  }(AbstractEvent);
  _defineProperty(ResizableEvent, "type", 'resizable');
  var ResizableInitEvent = /*#__PURE__*/function (_ResizableEvent2) {
    function ResizableInitEvent() {
      _classCallCheck(this, ResizableInitEvent);
      return _callSuper(this, ResizableInitEvent, arguments);
    }
    _inherits(ResizableInitEvent, _ResizableEvent2);
    return _createClass(ResizableInitEvent);
  }(ResizableEvent);
  _defineProperty(ResizableInitEvent, "type", 'resizable:init');
  var ResizableDestroyEvent = /*#__PURE__*/function (_ResizableEvent3) {
    function ResizableDestroyEvent() {
      _classCallCheck(this, ResizableDestroyEvent);
      return _callSuper(this, ResizableDestroyEvent, arguments);
    }
    _inherits(ResizableDestroyEvent, _ResizableEvent3);
    return _createClass(ResizableDestroyEvent);
  }(ResizableEvent);
  _defineProperty(ResizableDestroyEvent, "type", 'resizable:destroy');

  var ResizeEvent = /*#__PURE__*/function (_AbstractEvent) {
    function ResizeEvent() {
      _classCallCheck(this, ResizeEvent);
      return _callSuper(this, ResizeEvent, arguments);
    }
    _inherits(ResizeEvent, _AbstractEvent);
    return _createClass(ResizeEvent, [{
      key: "element",
      get: function get() {
        return this.data.element || null;
      }
    }, {
      key: "helper",
      get: function get() {
        return this.data.helper || null;
      }
    }, {
      key: "originalElement",
      get: function get() {
        return this.data.originalElement || null;
      }
    }, {
      key: "originalSize",
      get: function get() {
        return this.data.originalSize || null;
      }
    }, {
      key: "originalPosition",
      get: function get() {
        return this.data.originalPosition || null;
      }
    }, {
      key: "size",
      get: function get() {
        return this.data.size || null;
      }
    }, {
      key: "position",
      get: function get() {
        return this.data.position || null;
      }
    }, {
      key: "sensorEvent",
      get: function get() {
        return this.data.sensorEvent || null;
      }
    }, {
      key: "originalEvent",
      get: function get() {
        return this.data.originalEvent || null;
      }
    }]);
  }(AbstractEvent);
  var ResizeStartEvent = /*#__PURE__*/function (_ResizeEvent) {
    function ResizeStartEvent() {
      _classCallCheck(this, ResizeStartEvent);
      return _callSuper(this, ResizeStartEvent, arguments);
    }
    _inherits(ResizeStartEvent, _ResizeEvent);
    return _createClass(ResizeStartEvent);
  }(ResizeEvent);
  _defineProperty(ResizeStartEvent, "type", 'resize:start');
  _defineProperty(ResizeStartEvent, "cancelable", true);
  var ResizeChangeEvent = /*#__PURE__*/function (_ResizeEvent2) {
    function ResizeChangeEvent() {
      _classCallCheck(this, ResizeChangeEvent);
      return _callSuper(this, ResizeChangeEvent, arguments);
    }
    _inherits(ResizeChangeEvent, _ResizeEvent2);
    return _createClass(ResizeChangeEvent);
  }(ResizeEvent);
  _defineProperty(ResizeChangeEvent, "type", 'resize:change');
  _defineProperty(ResizeChangeEvent, "cancelable", true);
  var ResizeStopEvent = /*#__PURE__*/function (_ResizeEvent3) {
    function ResizeStopEvent() {
      _classCallCheck(this, ResizeStopEvent);
      return _callSuper(this, ResizeStopEvent, arguments);
    }
    _inherits(ResizeStopEvent, _ResizeEvent3);
    return _createClass(ResizeStopEvent);
  }(ResizeEvent);
  _defineProperty(ResizeStopEvent, "type", 'resize:stop');
  _defineProperty(ResizeStopEvent, "cancelable", true);

  var resizeTransforms = {
    n: function n(originalAttrs, delta) {
      return {
        height: Math.max(originalAttrs.size.height - delta.y, 0),
        top: originalAttrs.position.top + delta.y
      };
    },
    s: function s(originalAttrs, delta) {
      return {
        height: Math.max(originalAttrs.size.height + delta.y, 0)
      };
    },
    e: function e(originalAttrs, delta) {
      return {
        width: Math.max(originalAttrs.size.width + delta.x, 0)
      };
    },
    w: function w(originalAttrs, delta) {
      return {
        width: Math.max(originalAttrs.size.width - delta.x, 0),
        left: originalAttrs.position.left + delta.x
      };
    },
    ne: function ne(originalAttrs, delta) {
      return {
        width: Math.max(originalAttrs.size.width + delta.x, 0),
        height: Math.max(originalAttrs.size.height - delta.y, 0),
        top: originalAttrs.position.top + delta.y
      };
    },
    nw: function nw(originalAttrs, delta) {
      return {
        width: Math.max(originalAttrs.size.width - delta.x, 0),
        height: Math.max(originalAttrs.size.height - delta.y, 0),
        top: originalAttrs.position.top + delta.y,
        left: originalAttrs.position.left + delta.x
      };
    },
    se: function se(originalAttrs, delta) {
      return {
        width: Math.max(originalAttrs.size.width + delta.x, 0),
        height: Math.max(originalAttrs.size.height + delta.y, 0)
      };
    },
    sw: function sw(originalAttrs, delta) {
      return {
        width: Math.max(originalAttrs.size.width - delta.x, 0),
        height: Math.max(originalAttrs.size.height + delta.y, 0),
        left: originalAttrs.position.left + delta.x
      };
    }
  };

  var wrappableElements = /^(canvas|textarea|input|select|button|img)$/i;
  var Resizable = /*#__PURE__*/function (_Draggable) {
    function Resizable() {
      var _this;
      _classCallCheck(this, Resizable);
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      _this = _callSuper(this, Resizable, [].concat(args));
      _defineProperty(_this, "originalElement", null);
      _defineProperty(_this, "originalResize", null);
      _defineProperty(_this, "pressing", false);
      _defineProperty(_this, "resizing", false);
      _defineProperty(_this, "wrapped", false);
      _defineProperty(_this, "currentHandle", null);
      _defineProperty(_this, "currentDirection", null);
      _defineProperty(_this, "handleDirections", []);
      _defineProperty(_this, "handleElements", []);
      _defineProperty(_this, "helper", null);
      _defineProperty(_this, "offset", {
        click: null,
        helper: null
      });
      _defineProperty(_this, "originalAttrs", {});
      _defineProperty(_this, "currentAttrs", {});
      _defineProperty(_this, "previousAttrs", {});
      _defineProperty(_this, "aspectRatio", null);
      _defineProperty(_this, "resizableElements", []);
      _defineProperty(_this, "listeners", []);
      _defineProperty(_this, "setup", function () {
        var autoHide = _this.options.autoHide;
        _this.addPlugin(new ResizeGridConstraint(_this));
        _this.addPlugin(new ResizeContainmentConstraint(_this));
        _this.addPlugin(new ResizeAnimate(_this));
        _this.addPlugin(new ResizeGhost(_this));
        _this.addSensor(new MouseSensor(_this));
        document.addEventListener('mouse:down', _this.onMouseDown);
        document.addEventListener('mouse:stop', function () {
          _this.pressing = false;
        });
        document.addEventListener('mouse:start', _this.onDragStart);
        document.addEventListener('mouse:move', _this.onDragMove);
        document.addEventListener('mouse:stop', _this.onDragStop);
        _this.originalElement = _this.element;
        addClass(_this.element, _this.elementClass);
        style(_this.element, {
          position: 'relative'
        });
        if (_this.element.nodeName.match(wrappableElements)) {
          _this.createWrapper();
        } else {
          _this.element[_this.dataProperty] = _this;
        }
        _this.createHandles();
        if (autoHide) {
          addClass(_this.element, _this.autoHideClass);
          _this.listeners.push(listen(_this.element, 'mouseenter', function () {
            if (!_this.disabled) {
              removeClass(_this.element, _this.autoHideClass);
              _this.handleElements.forEach(function (h) {
                return show(h);
              });
            }
          }));
          _this.listeners.push(listen(_this.element, 'mouseleave', function () {
            if (!_this.disabled && !_this.resizing) {
              addClass(_this.element, _this.autoHideClass);
              _this.handleElements.forEach(function (h) {
                return hide(h);
              });
            }
          }));
        }
        _this.trigger(new ResizableInitEvent({
          resizable: _this
        }));
      });
      _defineProperty(_this, "onMouseDown", function (event) {
        var sensorEvent = event.detail;
        if (sensorEvent.caller !== _this || !_this.currentHandle || !_this.currentDirection) {
          return;
        }
        if (_this.disabled) {
          sensorEvent.cancel();
          return;
        }
        if (!_this.isInsideHandle(sensorEvent)) {
          sensorEvent.cancel();
          return;
        }
        _this.pressing = true;
      });
      _defineProperty(_this, "onDragStart", function (event) {
        var handleCursor = null;
        var aspectRatio = _this.options.aspectRatio;
        var sensorEvent = event.detail;
        if (sensorEvent.caller !== _this || !_this.currentHandle || !_this.currentDirection) {
          return;
        }
        _this.resizing = true;
        _this.helper = _this.createHelper(sensorEvent);
        _this.offset.click = {
          left: sensorEvent.pageX,
          top: sensorEvent.pageY
        };
        _this.offset.helper = offset(_this.helper);
        _this.initializeResize();
        _this.aspectRatio = isFinite$1(aspectRatio) ? aspectRatio : null;
        var resizeStart = new ResizeStartEvent({
          source: _this.element,
          helper: _this.helper,
          originalElement: _this.originalElement,
          originalSize: _this.originalAttrs.size,
          originalPosition: _this.originalAttrs.position,
          size: _this.currentAttrs.size,
          position: _this.currentAttrs.position,
          sensorEvent: sensorEvent,
          originalEvent: sensorEvent.originalEvent
        });
        _this.trigger(resizeStart);
        if (resizeStart.canceled) {
          _this.onDragCancel(createMouseStopEvent(_this.helper));
          return;
        }
        addClass(_this.helper, _this.resizingClass);
        handleCursor = style(_this.currentHandle, 'cursor');
        style(document.body, {
          cursor: !handleCursor || handleCursor === 'auto' ? "".concat(_this.elementClass, "-").concat(_this.currentDirection) : handleCursor
        });
      });
      _defineProperty(_this, "onDragCancel", function (event) {
        _this.sensors.forEach(function (sensor) {
          return sensor.cancel(event);
        });
        _this.clear();
      });
      _defineProperty(_this, "onDragMove", function (event) {
        var sensorEvent = event.detail;
        if (sensorEvent.caller !== _this || !_this.currentHandle || !_this.currentDirection) {
          return;
        }
        _this.previousAttrs = {
          size: _objectSpread2({}, _this.currentAttrs.size),
          position: _objectSpread2({}, _this.currentAttrs.position)
        };
        _this.calculateResize(sensorEvent);
        var resizeChange = new ResizeChangeEvent({
          element: _this.element,
          helper: _this.helper,
          originalElement: _this.originalElement,
          originalSize: _this.originalAttrs.size,
          originalPosition: _this.originalAttrs.position,
          size: _this.currentAttrs.size,
          position: _this.currentAttrs.position,
          sensorEvent: sensorEvent,
          originalEvent: sensorEvent.originalEvent
        });
        _this.trigger(resizeChange);
        if (resizeChange.canceled) {
          return;
        } else {
          _this.currentAttrs.size = _objectSpread2({}, resizeChange.size);
          _this.currentAttrs.position = _objectSpread2({}, resizeChange.position);
        }
        _this.applyResize();
        if (_this.helper === _this.element) {
          _this.updateResizableElements();
        }
      });
      _defineProperty(_this, "onDragStop", function (event) {
        var styleProps = {};
        var _this$options = _this.options,
          animate = _this$options.animate,
          flex = _this$options.flex;
        var _this$originalAttrs = _this.originalAttrs,
          originalSize = _this$originalAttrs.size,
          originalPosition = _this$originalAttrs.position;
        var _this$currentAttrs = _this.currentAttrs,
          size = _this$currentAttrs.size,
          position = _this$currentAttrs.position;
        var sensorEvent = event.detail;
        if (sensorEvent.caller !== _this || !_this.currentHandle || !_this.currentDirection) {
          return;
        }
        styleProps[flex ? 'flexBasis' : 'width'] = "".concat(getWidth(_this.helper), "px");
        styleProps.height = "".concat(height(_this.helper), "px");
        styleProps.top = "".concat(styleAsNumber(_this.helper, 'top'), "px");
        styleProps.left = "".concat(styleAsNumber(_this.helper, 'left'), "px");
        style(_this.helper, size);
        if (!animate) {
          style(_this.element, styleProps);
          _this.updateResizableElements();
        }
        var resizeStop = new ResizeStopEvent({
          source: _this.element,
          helper: _this.helper,
          originalElement: _this.originalElement,
          originalSize: _this.originalAttrs.size,
          originalPosition: _this.originalAttrs.position,
          size: size,
          position: position,
          sensorEvent: sensorEvent,
          originalEvent: sensorEvent.originalEvent
        });
        _this.trigger(resizeStop);
        if (resizeStop.canceled) {
          style(_this.element, _defineProperty(_defineProperty(_defineProperty(_defineProperty({}, flex ? 'flexBasis' : 'width', "".concat(originalSize.width, "px")), "height", "".concat(originalSize.height, "px")), "top", "".concat(originalPosition.top, "px")), "left", "".concat(originalPosition.left, "px")));
          _this.clear();
          _this.updateResizableElements();
        } else {
          _this.clear();
        }
      });
      return _this;
    }
    _inherits(Resizable, _Draggable);
    return _createClass(Resizable, [{
      key: "setOption",
      value: function setOption(opt, value) {
        switch (opt) {
          case 'animate':
          case 'animateDuration':
          case 'aspectRatio':
          case 'disabled':
          case 'distance':
          case 'ghost':
          case 'grid':
          case 'maxHeight':
          case 'maxWidth':
          case 'minHeight':
          case 'minWidth':
          case 'zIndex':
            this.options[opt] = value;
            break;
          case 'containment':
            this.options.containment = value;
            this.containmentCoords = undefined;
            break;
          default:
            throw new Error("The option ".concat(opt, " is invalid or can't be changed dynamically"));
        }
      }
    }, {
      key: "cancel",
      value: function cancel() {
        if (this.resizing) {
          this.onDragCancel(createMouseStopEvent(this.helper));
        } else {
          this.clear();
        }
      }
    }, {
      key: "destroy",
      value: function destroy() {
        if (this.resizing) {
          this.pendingDestroy = true;
          return;
        }
        this.plugins.forEach(function (plugin) {
          return plugin.detach();
        });
        this.sensors.forEach(function (sensor) {
          return sensor.detach();
        });
        document.removeEventListener('mouse:start', this.onDragStart);
        document.removeEventListener('mouse:move', this.onDragMove);
        document.removeEventListener('mouse:stop', this.onDragStop);
        removeClass(this.element, this.elementClass);
        if (this.wrapped) {
          this.destroyWrapper();
        } else {
          delete this.element[this.dataProperty];
        }
        if (this.originalElement && this.originalResize) {
          style(this.originalElement, {
            resize: this.originalResize
          });
        }
        this.destroyHandles();
        this.listeners.forEach(function (listener) {
          return listener();
        });
        this.trigger(new ResizableDestroyEvent({
          sortable: this
        }));
      }
    }, {
      key: "dataProperty",
      get: function get() {
        return resizableProp;
      }
    }, {
      key: "elementClass",
      get: function get() {
        return resizableEl;
      }
    }, {
      key: "wrapperClass",
      get: function get() {
        return resizableWrapper;
      }
    }, {
      key: "autoHideClass",
      get: function get() {
        return resizableAutoHide;
      }
    }, {
      key: "handleClass",
      get: function get() {
        return resizableHandle;
      }
    }, {
      key: "handleDirectionProperty",
      get: function get() {
        return resizableHandleProp;
      }
    }, {
      key: "helperClass",
      get: function get() {
        return resizableHelper;
      }
    }, {
      key: "resizingClass",
      get: function get() {
        return resizableResizing;
      }
    }, {
      key: "ghostClass",
      get: function get() {
        return resizableGhost;
      }
    }, {
      key: "createWrapper",
      value: function createWrapper() {
        var wrapper = createElement('div', null, this.element.parentNode);
        addClass(wrapper, this.wrapperClass);
        style(wrapper, {
          position: style(this.element, 'position'),
          width: getWidth(this.element),
          height: height(this.element),
          top: style(this.element, 'top'),
          left: style(this.element, 'left'),
          marginTop: style(this.originalElement, 'marginTop'),
          marginRight: style(this.originalElement, 'marginRight'),
          marginBottom: style(this.originalElement, 'marginBottom'),
          marginLeft: style(this.originalElement, 'marginLeft')
        });
        wrapper[this.dataProperty] = this;
        style(this.originalElement, {
          display: 'block',
          position: 'static',
          zoom: 1
        });
        this.originalResize = style(this.originalElement, 'resize');
        style(this.originalElement, {
          resize: 'none'
        });
        this.resizableElements.push(this.originalElement);
        this.updateResizableElements();
        this.wrapped = true;
      }
    }, {
      key: "destroyWrapper",
      value: function destroyWrapper() {
        var wrapper = this.element;
        var flex = this.options.flex;
        style(this.originalElement, _defineProperty(_defineProperty(_defineProperty(_defineProperty({
          position: style(wrapper, 'position')
        }, flex ? 'flexBasis' : 'width', getWidth(wrapper)), "height", height(wrapper)), "top", style(wrapper, 'top')), "left", style(wrapper, 'left')));
        insertAfter(this.originalElement, wrapper);
        remove(wrapper);
        delete wrapper[this.dataProperty];
      }
    }, {
      key: "createHandles",
      value: function createHandles() {
        var _this2 = this;
        var handles = this.options.handles;
        var _this$options2 = this.options,
          autoHide = _this$options2.autoHide,
          zIndex = _this$options2.zIndex;
        if (!handles || !isString$1(handles)) {
          handles = 'e,s,se';
        } else if (handles === 'all') {
          handles = resizableDirections.join(',');
        }
        this.handleDirections = handles.split(',').map(function (h) {
          return h.trim();
        });
        this.handleDirections.forEach(function (dir) {
          if (resizableDirections.indexOf(dir) !== -1) {
            var handleEl = createElement('div', null, _this2.element);
            addClass(handleEl, _this2.handleClass);
            addClass(handleEl, "".concat(_this2.elementClass, "-").concat(dir));
            if (!Resizable.injectedStyles[dir]) {
              injectStyles("".concat(_this2.elementClass, "-").concat(dir), _objectSpread2(_objectSpread2({}, resizableDirectionStyles[dir]), {
                display: 'block',
                position: 'absolute'
              }));
              Resizable.injectedStyles = true;
            }
            disableSelection(handleEl);
            style(handleEl, {
              zIndex: zIndex + (dir.length === 2 ? 1 : 0)
            });
            _this2.listeners.push(listen(handleEl, 'mouseover', function (e) {
              if (!_this2.pressing) {
                _this2.currentHandle = e.target;
                _this2.currentDirection = e.target[_this2.handleDirectionProperty];
              }
            }));
            handleEl[_this2.handleDirectionProperty] = dir;
            if (autoHide) {
              hide(handleEl);
            }
            if (_this2.wrapped && isInput(_this2.originalElement)) {
              var paddingValue = /sw|ne|nw|se|n|s/.test(dir) ? height(handleEl) : getWidth(handleEl);
              var paddingDirection = /ne|nw|n/.test(dir) ? 'Top' : /se|sw|s/.test(dir) ? 'Bottom' : /^e$/.test(dir) ? 'Right' : 'Left';
              style(handleEl, _defineProperty({}, "padding".concat(paddingDirection), paddingValue));
              _this2.updateResizableElements();
            }
            _this2.handleElements.push(handleEl);
          }
        });
      }
    }, {
      key: "findHandles",
      value: function findHandles() {
        return this.handleElements;
      }
    }, {
      key: "destroyHandles",
      value: function destroyHandles() {
        var _this3 = this;
        this.handleElements.forEach(function (handle) {
          delete handle[_this3.handleDirectionProperty];
          remove(handle);
        });
      }
    }, {
      key: "createHelper",
      value: function createHelper() {
        var helper;
        var _this$options3 = this.options,
          animate = _this$options3.animate,
          flex = _this$options3.flex,
          ghost = _this$options3.ghost,
          zIndex = _this$options3.zIndex;
        var elementOffset = offset(this.element);
        if (animate || ghost) {
          helper = createElement('div', null, document.body);
          addClass(helper, this.helperClass);
          style(helper, _defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty({}, flex ? 'flexBasis' : 'width', "".concat(getWidth(this.element), "px")), "height", "".concat(height(this.element), "px")), "position", 'absolute'), "left", "".concat(elementOffset.left, "px")), "top", "".concat(elementOffset.top, "px")), "zIndex", (zIndex || 1) + 1));
          disableSelection(helper);
        } else {
          helper = this.element;
        }
        return helper;
      }
    }, {
      key: "initializeResize",
      value: function initializeResize() {
        var position = {
          top: styleAsNumber(this.helper, 'top'),
          left: styleAsNumber(this.helper, 'left')
        };
        this.originalAttrs = {
          size: {
            width: getWidth(this.element),
            height: height(this.element)
          },
          position: _objectSpread2({}, position)
        };
        this.currentAttrs = {
          size: _objectSpread2({}, this.originalAttrs.size),
          position: _objectSpread2({}, position)
        };
      }
    }, {
      key: "calculateResize",
      value: function calculateResize(event) {
        var pageX = event.pageX,
          pageY = event.pageY;
        var aspectRatio = this.aspectRatio,
          currentDirection = this.currentDirection;
        var click = this.offset.click;
        var _this$currentAttrs2 = this.currentAttrs,
          currentSize = _this$currentAttrs2.size,
          currentPosition = _this$currentAttrs2.position;
        var delta = {
          y: pageY - click.top,
          x: pageX - click.left
        };
        var styleProps = resizeTransforms[this.currentDirection](this.originalAttrs, delta);
        if (aspectRatio) {
          if (isFinite$1(styleProps.width)) {
            styleProps.height = styleProps.width / aspectRatio;
          } else if (isFinite$1(styleProps.height)) {
            styleProps.width = styleProps.height * aspectRatio;
          }
          if (currentDirection === 'sw') {
            styleProps.left = currentPosition.left + (currentSize.width - styleProps.width);
            styleProps.top = null;
          }
          if (currentDirection === 'nw') {
            styleProps.top = currentPosition.top + (currentSize.height - styleProps.height);
            styleProps.left = currentPosition.left + (currentSize.width - styleProps.width);
          }
        }
        styleProps = this.applyBoundaries(styleProps);
        this.offset.helper = offset(this.helper);
        if (isFinite$1(styleProps.width)) {
          this.currentAttrs.size.width = styleProps.width;
        }
        if (isFinite$1(styleProps.height)) {
          this.currentAttrs.size.height = styleProps.height;
        }
        if (isFinite$1(styleProps.top)) {
          this.currentAttrs.position.top = styleProps.top;
        }
        if (isFinite$1(styleProps.left)) {
          this.currentAttrs.position.left = styleProps.left;
        }
      }
    }, {
      key: "applyBoundaries",
      value: function applyBoundaries(styleProps) {
        var boundaries = {
          minWidth: isFinite$1(this.options.minWidth) ? Math.max(this.options.minWidth, 0) : 0,
          maxWidth: isFinite$1(this.options.maxWidth) ? this.options.maxWidth : Infinity,
          minHeight: isFinite$1(this.options.minHeight) ? Math.max(this.options.minHeight, 0) : 0,
          maxHeight: isFinite$1(this.options.maxHeight) ? this.options.maxHeight : Infinity
        };
        var _this$originalAttrs2 = this.originalAttrs,
          originalSize = _this$originalAttrs2.size,
          originalPosition = _this$originalAttrs2.position;
        var isWest = /sw|nw|w/.test(this.currentDirection);
        var isNorth = /nw|ne|n/.test(this.currentDirection);
        if (isFinite$1(styleProps.width) && boundaries.minWidth > styleProps.width) {
          styleProps.width = boundaries.minWidth;
          if (isWest) {
            styleProps.left = originalPosition.left + originalSize.width - boundaries.minWidth;
          }
        }
        if (isFinite$1(styleProps.width) && boundaries.maxWidth < styleProps.width) {
          styleProps.width = boundaries.maxWidth;
          if (isWest) {
            styleProps.left = originalPosition.left + originalSize.width - boundaries.maxWidth;
          }
        }
        if (isFinite$1(styleProps.height) && boundaries.minHeight > styleProps.height) {
          styleProps.height = boundaries.minHeight;
          if (isNorth) {
            styleProps.top = originalPosition.top + originalSize.height - boundaries.minHeight;
          }
        }
        if (isFinite$1(styleProps.height) && boundaries.maxHeight < styleProps.height) {
          styleProps.height = boundaries.maxHeight;
          if (isNorth) {
            styleProps.top = originalPosition.top + originalSize.height - boundaries.maxHeight;
          }
        }
        return styleProps;
      }
    }, {
      key: "applyResize",
      value: function applyResize() {
        var styleProps = {};
        var flex = this.options.flex;
        var _this$currentAttrs3 = this.currentAttrs,
          size = _this$currentAttrs3.size,
          position = _this$currentAttrs3.position;
        var _this$previousAttrs = this.previousAttrs,
          prevSize = _this$previousAttrs.size,
          prevPosition = _this$previousAttrs.position;
        if (size.width !== prevSize.width) {
          styleProps[flex ? 'flexBasis' : 'width'] = "".concat(size.width, "px");
        }
        if (size.height !== prevSize.height) {
          styleProps.height = "".concat(size.height, "px");
        }
        if (position.top !== prevPosition.top) {
          styleProps.top = "".concat(position.top, "px");
        }
        if (position.left !== prevPosition.left) {
          styleProps.left = "".concat(position.left, "px");
        }
        style(this.helper, styleProps);
        return styleProps;
      }
    }, {
      key: "updateResizableElements",
      value: function updateResizableElements() {
        var dimensions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
        if (!this.resizableElements.length) {
          return;
        }
        var flex = this.options.flex;
        var finalDimensions = dimensions && dimensions.width && dimensions.height ? dimensions : {
          width: getWidth(this.helper || this.element),
          height: height(this.helper || this.element)
        };
        this.resizableElements.forEach(function (el) {
          var innerDimensions = getPaddingAndBorder(el);
          style(el, _defineProperty(_defineProperty({}, flex ? 'flexBasis' : 'width', "".concat(finalDimensions.width - innerDimensions.width, "px")), "height", "".concat(finalDimensions.height - innerDimensions.height, "px")));
        });
      }
    }, {
      key: "clear",
      value: function clear() {
        this.resizing = false;
        this.originalAttrs = {};
        this.currentAttrs = {};
        this.previousAttrs = {};
        this.offset = {
          click: null,
          helper: null
        };
        this.aspectRatio = null;
        if (this.helper && this.helper !== this.element) {
          this.helper.parentNode.removeChild(this.helper);
          this.helper = null;
        }
        style(document.body, {
          cursor: 'auto'
        });
        removeClass(this.element, this.resizingClass);
        if (this.pendingDestroy) {
          this.destroy();
          this.pendingDestroy = false;
        }
      }
    }]);
  }(Draggable);
  _defineProperty(Resizable, "defaultOptions", {
    animate: false,
    animateDuration: 500,
    aspectRatio: false,
    autoHide: false,
    containment: null,
    disabled: false,
    distance: 0,
    flex: false,
    ghost: false,
    grid: null,
    handles: 'e,s,se',
    maxHeight: null,
    maxWidth: null,
    minHeight: null,
    minWidth: null,
    zIndex: 1
  });
  _defineProperty(Resizable, "injectedStyles", {});

  var index = {
    Plugin: Plugin,
    Sensor: Sensor,
    Draggable: Draggable,
    Droppable: Droppable,
    DragDropManager: DragDropManager$1,
    Sortable: Sortable,
    Resizable: Resizable
  };

  exports.DragDropManager = DragDropManager$1;
  exports.Draggable = Draggable;
  exports.Droppable = Droppable;
  exports.Plugin = Plugin;
  exports.Resizable = Resizable;
  exports.Sensor = Sensor;
  exports.Sortable = Sortable;
  exports.default = index;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=agnostic-draggable.js.map
