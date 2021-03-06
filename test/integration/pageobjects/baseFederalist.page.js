/**
 * BaseFederalistPage
 *
 * [Page](http://martinfowler.com/bliki/PageObject.html)
 * [object](https://code.google.com/p/selenium/wiki/PageObjects) to provide an
 * API for common actions on most Federalist web pages.
 */

var webdriverio = require('webdriverio');
var Promise = require('bluebird');

function BaseFederalistPage(driver) {
  if (!driver) {
    throw new Error('You must pass an instance of a webdriverio client.');
  }

  this.url = '/';
  this.driver = driver;
}

BaseFederalistPage.prototype.open = function (url) {
  return this.driver.url(url || this.url);
};

BaseFederalistPage.prototype.init = function () {
  // Noop
  return Promise.resolve();
};

BaseFederalistPage.prototype.end = function () {
  return helpers.webdriver.clearSession();
};

BaseFederalistPage.prototype.login = function (user, password) {
  return this.driver
    .url('/')
    .click('[href="/auth/github"]')
    .waitForExist('#login')
    .setValue('#login_field', process.env.FEDERALIST_TEST_USER)
    .setValue('#password', process.env.FEDERALIST_TEST_PASSWORD)
    .submitForm('#login_field')
    .waitForExist('.list');
};

module.exports = BaseFederalistPage;
