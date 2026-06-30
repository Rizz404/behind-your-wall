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

  function componentHash(component) {
    if (!component || component.value === undefined || component.value === null) return undefined;
    return typeof component.value === 'string' ? component.value : JSON.stringify(component.value);
  }

  function parseUserAgent(ua) {
    var browser;
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\//.test(ua)) browser = 'Opera';
    else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';
    else browser = undefined;

    var os;
    if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    else os = undefined;

    var deviceType;
    if (/iPad|Tablet/.test(ua)) deviceType = 'tablet';
    else if (/Mobi|Android.*Mobile|iPhone/.test(ua)) deviceType = 'mobile';
    else deviceType = 'desktop';

    return { browser: browser, os: os, deviceType: deviceType };
  }

  function send(fingerprintComponents) {
    var fp = fingerprintComponents.visitorId;
    var components = fingerprintComponents.components || {};
    var ua = navigator.userAgent;
    var parsedUa = parseUserAgent(ua);

    var payload = {
      fingerprintId: fp,
      pageUrl: window.location.href,
      referrer: document.referrer || undefined,
      userAgent: ua,
      browser: parsedUa.browser,
      os: parsedUa.os,
      deviceType: parsedUa.deviceType,
      screenRes: window.screen.width + 'x' + window.screen.height,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvasHash: componentHash(components.canvas),
      webglHash: componentHash(components.webGlBasics),
      audioHash: componentHash(components.audio),
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
    import(/* webpackIgnore: true */ 'https://openfpcdn.io/fingerprintjs/v4')
      .then(function (mod) {
        callback(mod.default);
      })
      .catch(function (err) {
        console.error('[tracker.js] failed to load fingerprintjs', err);
      });
  }

  loadFingerprintJs(function (FingerprintJS) {
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
