(function () {
  'use strict';

  var script = document.currentScript;
  var siteKey = script && script.getAttribute('data-site-key');
  var apiBase = (script && script.getAttribute('data-api-base')) || new URL(script.src).origin;

  // opt-in flags
  var blockRedirect = script && script.getAttribute('data-block-redirect') === 'true';
  var geoEnabled = script && script.getAttribute('data-geo') === 'true';
  var geoTriggerSelector = geoEnabled ? (script.getAttribute('data-geo-trigger') || null) : null;

  if (!siteKey) {
    console.error('[tracker.js] missing data-site-key attribute');
    return;
  }

  // fingerprintId is cached after the first sync so the geo-trigger secondary sync can reuse it
  var cachedFingerprintId = null;

  function dispatch(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail }));
  }

  function defaultBlockHandler() {
    if (!blockRedirect) return;
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

  // Collect User-Agent Client Hints high-entropy values (Chromium 90+).
  // Falls back to low-entropy navigator.userAgentData on older Chromium,
  // returns null on Firefox/Safari which don't implement the API.
  function getUaClientHints() {
    var uaData = navigator.userAgentData;
    if (!uaData) return Promise.resolve(null);
    if (!uaData.getHighEntropyValues) {
      return Promise.resolve({
        brands: uaData.brands,
        mobile: uaData.mobile,
        platform: uaData.platform,
      });
    }
    return uaData
      .getHighEntropyValues([
        'platform',
        'platformVersion',
        'architecture',
        'model',
        'uaFullVersion',
        'fullVersionList',
      ])
      .catch(function () { return null; });
  }

  // Request HTML5 Geolocation with a hard 3-second timeout.
  // Resolves to {lat, lon, accuracy} or null if denied / timed out / unavailable.
  function getGeolocation() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve(null); return; }
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) { settled = true; resolve(null); }
      }, 3000);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(null);
        },
        { timeout: 3000, maximumAge: 60000 }
      );
    });
  }

  // Check if geolocation permission is already granted without triggering a dialog.
  // Resolves to geo data if already granted, null otherwise.
  function getGeoIfAlreadyGranted() {
    if (!navigator.geolocation) return Promise.resolve(null);
    if (!navigator.permissions) return Promise.resolve(null);
    return navigator.permissions
      .query({ name: 'geolocation' })
      .then(function (result) {
        return result.state === 'granted' ? getGeolocation() : null;
      })
      .catch(function () { return null; });
  }

  // Send a sync request. Used for both the initial sync and the secondary geo-trigger sync.
  function postSync(payload) {
    return fetch(apiBase + '/v1/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Site-Key': siteKey,
      },
      body: JSON.stringify(payload),
    }).then(function (res) { return res.json(); });
  }

  function send(fingerprintComponents, geo, uaCh) {
    var fp = fingerprintComponents.visitorId;
    cachedFingerprintId = fp;
    var components = fingerprintComponents.components || {};
    var ua = navigator.userAgent;
    var parsedUa = parseUserAgent(ua);

    // Low-entropy UA-CH always available in Chromium even if getHighEntropyValues failed
    var uaData = navigator.userAgentData;

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
      // User-Agent Client Hints: prefer high-entropy hints, fall back to low-entropy
      uaBrands: uaCh
        ? (uaCh.fullVersionList || uaCh.brands || undefined)
        : (uaData ? uaData.brands : undefined),
      uaMobile: uaCh
        ? uaCh.mobile
        : (uaData ? uaData.mobile : undefined),
      uaPlatform: uaCh
        ? uaCh.platform
        : (uaData ? uaData.platform : undefined),
      uaPlatformVersion: uaCh ? uaCh.platformVersion : undefined,
      uaChRaw: uaCh || undefined,
      // HTML5 Geolocation (null if disabled, denied, or timed out)
      geoLat: geo ? geo.lat : undefined,
      geoLon: geo ? geo.lon : undefined,
      geoAccuracy: geo ? geo.accuracy : undefined,
    };

    postSync(payload)
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

  // When data-geo-trigger is set: bind a one-time click handler on the target element.
  // On click, request geolocation (shows browser dialog) then send a secondary sync
  // containing only fingerprintId + geo coords. Creates a new VisitLog entry.
  function setupGeoTrigger(selector) {
    function bind() {
      var el = document.querySelector(selector);
      if (!el) return;
      el.addEventListener('click', function () {
        getGeolocation().then(function (geo) {
          if (!geo || !cachedFingerprintId) return;
          postSync({
            fingerprintId: cachedFingerprintId,
            geoLat: geo.lat,
            geoLon: geo.lon,
            geoAccuracy: geo.accuracy,
          }).catch(function () {});
        });
      }, { once: true });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bind);
    } else {
      bind();
    }
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

  // Determine geo promise based on opt-in flags:
  // - geo disabled → always null
  // - geo enabled, button trigger → silently get geo if already granted; dialog deferred to click
  // - geo enabled, no trigger → request immediately (shows dialog on page load)
  var geoPromise;
  if (!geoEnabled) {
    geoPromise = Promise.resolve(null);
  } else if (geoTriggerSelector) {
    geoPromise = getGeoIfAlreadyGranted();
    setupGeoTrigger(geoTriggerSelector);
  } else {
    geoPromise = getGeolocation();
  }

  // Kick off UA-CH immediately — runs in parallel with FingerprintJS loading
  var uaChPromise = getUaClientHints();

  loadFingerprintJs(function (FingerprintJS) {
    FingerprintJS.load()
      .then(function (fp) { return fp.get(); })
      .then(function (fpResult) {
        return Promise.all([geoPromise, uaChPromise]).then(function (extras) {
          send(fpResult, extras[0], extras[1]);
        });
      })
      .catch(function (err) {
        console.error('[tracker.js] fingerprint generation failed', err);
      });
  });
})();
