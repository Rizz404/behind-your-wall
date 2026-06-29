(function () {
  'use strict';

  var script = document.currentScript;
  var siteKey = script && script.getAttribute('data-site-key');
  var apiBase = (script && script.getAttribute('data-api-base')) || new URL(script.src).origin;

  if (!siteKey) {
    console.error('[tracker.js] missing data-site-key attribute');
    return;
  }

  function dispatch(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail }));
  }

  function defaultBlockHandler() {
    if (window.__trackerBlockHandled) return;
    window.location.href = '/blocked';
  }

  function send(fingerprintComponents) {
    var fp = fingerprintComponents.visitorId;
    var components = fingerprintComponents.components || {};

    var payload = {
      fingerprintId: fp,
      pageUrl: window.location.href,
      referrer: document.referrer || undefined,
      userAgent: navigator.userAgent,
      browser: undefined,
      os: undefined,
      deviceType: undefined,
      screenRes: window.screen.width + 'x' + window.screen.height,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvasHash: components.canvas && components.canvas.value,
      webglHash: components.webgl && components.webgl.value,
      audioHash: components.audio && components.audio.value,
      rawComponents: components,
    };

    fetch(apiBase + '/v1/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Site-Key': siteKey,
      },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.blocked) {
          dispatch('tracker:blocked', data);
          defaultBlockHandler();
        } else {
          dispatch('tracker:ready', data);
        }
      })
      .catch(function (err) {
        console.error('[tracker.js] failed to send tracking payload', err);
      });
  }

  function loadFingerprintJs(callback) {
    var existing = document.querySelector('script[data-tracker-fpjs]');
    if (existing) {
      existing.addEventListener('load', callback);
      return;
    }

    var fpScript = document.createElement('script');
    fpScript.src = 'https://openfpcdn.io/fingerprintjs/v4';
    fpScript.async = true;
    fpScript.setAttribute('data-tracker-fpjs', '1');
    fpScript.addEventListener('load', callback);
    document.head.appendChild(fpScript);
  }

  loadFingerprintJs(function () {
    // eslint-disable-next-line no-undef
    FingerprintJS.load()
      .then(function (fp) {
        return fp.get();
      })
      .then(send)
      .catch(function (err) {
        console.error('[tracker.js] fingerprint generation failed', err);
      });
  });
})();
