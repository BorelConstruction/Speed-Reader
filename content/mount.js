/* SpeedReader — mounts the overlay into the current page.
 *
 * Injected on demand together with lib/*.js. Everything is scoped inside an
 * IIFE so a repeat injection is harmless. */
(function () {
  'use strict';

  var NS = (window.SpeedReader = window.SpeedReader || {});
  var HOST_ID = '__speedreader_host__';

  NS.close = function close() {
    if (NS._active) NS._active.destroy();
  };

  NS.open = function open(text) {
    if (!text || !String(text).trim()) return;

    NS.close();

    var existing = document.getElementById(HOST_ID);
    if (existing) existing.remove();

    var host = document.createElement('div');
    host.id = HOST_ID;
    // `all:initial` first, so nothing the page declares can leak into the host.
    host.setAttribute('style', 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;');
    // <html>, not <body>: a transformed body would become the containing block
    // for our position:fixed overlay and pin it to the wrong box.
    (document.documentElement || document.body).appendChild(host);

    window.__SPEEDREADER_MOUNTED__ = true;

    NS.Settings.load().then(function (settings) {
      if (!host.isConnected) return;
      NS._active = NS.createReader(host, {
        text: text,
        settings: settings,
        autoplay: false,        // open on the first word; Space starts it
        onClose: function () {
          NS._active = null;
          window.__SPEEDREADER_MOUNTED__ = false;
          host.remove();
        }
      });
    });
  };
})();
