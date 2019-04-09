(function() {
    var normalizeNonFiniteValue = function (value) {
        value = +value;
        return (isNaN(value) || value == Infinity || value == -Infinity) ? 0 : value;
    }
    
    var isBodyPotentiallyScrollable = function (body) {
        body = body ? body : document.getElementsByTagName("BODY")[0];
    
        var bodyComputedStyle = window.getComputedStyle(body);
        var parentComputedStyle =  window.getComputedStyle(body.parent);
        var bodyComputedOverflowX = bodyComputedStyle.overflowX;
        var bodyComputedOverflowY = bodyComputedStyle.overflowY;
        var parentComputedOverflowX = parentComputedStyle.overflowX;
        var parentComputedOverflowY = parentComputedStyle.overflowY;
    
        return (
            (
                bodyComputedStyle.display == "table-column" || 
                bodyComputedStyle.display == "table-column-group"
            ) && (
                parentComputedOverflowX != "visible" && 
                parentComputedOverflowX != "clip" && 
                parentComputedOverflowY != "visible" && 
                parentComputedOverflowY != "clip"
            ) && (
                bodyComputedOverflowX != "visible" && 
                bodyComputedOverflowX != "clip" && 
                bodyComputedOverflowY != "visible" && 
                bodyComputedOverflowY != "clip"
            )
        );
    }
    
    if (!Element.prototype.scroll) {
        Element.prototype.scroll = function () {
            var argsLength = arguments.length;
            var doc = this.ownerDocument;
            var win = doc.defaultView;
            var quirksMode = (doc.compatMode == "BackCompat");
            var body = document.getElementsByTagName("BODY")[0];
            var options = {};
            var x, y;
    
            if (doc != window.document) return;
            if (!win) return;
    
            if (argsLength === 0) {
                return;
            } else if (argsLength === 1) {
                var arg = arguments[0];
                if (typeof arg != "object") throw "Failed to execute 'scrollBy' on 'Element': parameter 1 ('options') is not an object.";
        
                if ('left' in arg) {
                    options.left = normalizeNonFiniteValue(arg.left);
                }
        
                if ('top' in arg) {
                    options.top = normalizeNonFiniteValue(arg.top);
                }
    
                x = (('left' in options) ? options.left : this.scrollLeft);
                y = (('top' in options) ? options.top : this.scrollTop);
            } else {
                options.left = x = normalizeNonFiniteValue(arguments[0]);
                options.top = y = normalizeNonFiniteValue(arguments[1]);
            }
    
            if (this == document.documentElement) {
                if (quirksMode) return;
    
                win.scroll(('scrollX' in win) ? win.scrollX : (('pageXOffset' in win) ? win.pageXOffset : this.scrollLeft), y);
                return;
            }
    
            if (this == body && quirksMode && !isBodyPotentiallyScrollable(body)) {
                win.scroll(options.left, options.top);
                return;
            }
            
            this.scrollLeft = x;
            this.scrollTop = y;
        };
    }
    
    if (!Element.prototype.scrollTo) {
        Element.prototype.scrollTo = Element.prototype.scroll;
    }
    
    if (!Element.prototype.scrollBy) {
        Element.prototype.scrollBy = function () {
            var argsLength = arguments.length;
            var options = {};
    
            if (argsLength === 0) {
                return;
            } else if (argsLength === 1) {
                var arg = arguments[0];
                if (typeof arg != "object") throw "Failed to execute 'scrollBy' on 'Element': parameter 1 ('options') is not an object.";
    
                if ('left' in arg) {
                    options.left = normalizeNonFiniteValue(arg.left);
                }
    
                if ('top' in arg) {
                    options.top = normalizeNonFiniteValue(arg.top);
                }
            } else {
                options.left = normalizeNonFiniteValue(arguments[0]);
                options.top = normalizeNonFiniteValue(arguments[1]);
            }
    
            options.left = (('left' in options) ? options.left + this.scrollLeft : this.scrollLeft);
            options.top = (('top' in options) ? options.top + this.scrollTop : this.scrollTop);
            this.scroll(options);
        };
    }
})();
