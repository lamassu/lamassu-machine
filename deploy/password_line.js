'use strict';

// This is not currently used, but could be useful for generating Linux passwords for /etc/shadow
// h/t: https://github.com/nlf/mkpasswd
var crypto = require('crypto');
var sha512crypt = require('sha512crypt-node');
var salt = crypto.randomBytes(10).toString('base64');
var password = process.argv[2];
console.log(sha512crypt.sha512crypt(password, salt));
