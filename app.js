'use strict';

const Homey = require('homey');

class MyApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('Stiebel Eltron ISG is initialized');
  }

}

module.exports = MyApp;
