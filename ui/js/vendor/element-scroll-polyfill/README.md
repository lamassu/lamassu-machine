# element-scroll-polyfill
[![npm](https://img.shields.io/npm/v/element-scroll-polyfill.svg)](https://www.npmjs.com/package/element-scroll-polyfill)
![npm bundle size (minified)](https://img.shields.io/bundlephobia/min/element-scroll-polyfill.svg)

A minimal polyfill for `Element` scroll extensions. Mostly meant for Microsoft IE/Edge.

Implements the following methods if not present natively, in compliance with the W3C Editor's Draft (2018-10-24):
- [`Element.scroll()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/scroll)
- [`Element.scrollTo()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTo)
- [`Element.scrollBy()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollBy)

Does not implement [`ScrollBehavior`](https://drafts.csswg.org/cssom-view/#enumdef-scrollbehavior), the `ScrollToOptions.behavior` parameter is ignored.

## Install

```sh
$ npm install --save element-scroll-polyfill
```

## Usage

Pick your favorite:

```js
require("element-scroll-polyfill");
```

```js
import 'element-scroll-polyfill';
```
