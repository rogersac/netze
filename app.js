(function () {
  var STORAGE_KEY = 'internet-health-hud-settings';
  var DEFAULT_INTERVAL = 30000;
  var CONTROL_TIMEOUT = 10000;
  var CHECK_TIMEOUT = 8000;

  var state = {
    autoRefresh: true,
    interval: DEFAULT_INTERVAL,
    showDetails: true,
    customUrl: '',
    isChecking: false,
    pendingRefresh: false,
    refreshTimer: null,
    controlsTimer: null,
    lastCheckedAt: null,
    stableSince: null,
    startedAt: Date.now(),
    endpoints: [
      {
        id: 'google',
        label: 'Google 204',
        url: 'https://www.google.com/generate_204',
        enabled: true,
        optional: false,
        result: createInitialResult('Waiting')
      },
      {
        id: 'cloudflare',
        label: 'Cloudflare Trace',
        url: 'https://cloudflare.com/cdn-cgi/trace',
        enabled: true,
        optional: false,
        result: createInitialResult('Waiting')
      },
      {
        id: 'custom',
        label: 'Custom Endpoint',
        url: '',
        enabled: false,
        optional: true,
        result: createInitialResult('Not set')
      }
    ],
    rows: {}
  };

  var elements = {};

  function createInitialResult(message) {
    return {
      ok: null,
      statusLabel: message,
      latency: null,
      checkedAt: null,
      error: ''
    };
  }

  function init() {
    cacheElements();
    loadSettings();
    buildEndpointRows();
    bindEvents();
    syncControls();
    render();
    showControls();
    runChecks();
  }

  function cacheElements() {
    elements.app = document.getElementById('app');
    elements.overallStatus = document.getElementById('overallStatus');
    elements.statusSummary = document.getElementById('statusSummary');
    elements.lastChecked = document.getElementById('lastChecked');
    elements.refreshState = document.getElementById('refreshState');
    elements.uptimeValue = document.getElementById('uptimeValue');
    elements.detailsPanel = document.getElementById('detailsPanel');
    elements.endpointList = document.getElementById('endpointList');
    elements.controlsHint = document.getElementById('controlsHint');
    elements.controlsOverlay = document.getElementById('controlsOverlay');
    elements.refreshNowButton = document.getElementById('refreshNowButton');
    elements.toggleAutoButton = document.getElementById('toggleAutoButton');
    elements.toggleDetailsButton = document.getElementById('toggleDetailsButton');
    elements.intervalSelect = document.getElementById('intervalSelect');
    elements.customUrlInput = document.getElementById('customUrlInput');
    elements.saveCustomUrlButton = document.getElementById('saveCustomUrlButton');
  }

  function loadSettings() {
    var raw = '';
    var saved = null;

    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch (error) {
      saved = null;
    }

    if (!saved) {
      return;
    }

    if (typeof saved.autoRefresh === 'boolean') {
      state.autoRefresh = saved.autoRefresh;
    }

    if (saved.interval === 15000 || saved.interval === 30000 || saved.interval === 60000) {
      state.interval = saved.interval;
    }

    if (typeof saved.showDetails === 'boolean') {
      state.showDetails = saved.showDetails;
    }

    if (typeof saved.customUrl === 'string') {
      state.customUrl = saved.customUrl;
      setCustomEndpointUrl(saved.customUrl);
    }
  }

  function saveSettings() {
    var payload = {
      autoRefresh: state.autoRefresh,
      interval: state.interval,
      showDetails: state.showDetails,
      customUrl: state.customUrl
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      return;
    }
  }

  function buildEndpointRows() {
    var fragment = document.createDocumentFragment();
    var i;

    for (i = 0; i < state.endpoints.length; i += 1) {
      var endpoint = state.endpoints[i];
      var row = document.createElement('div');
      var name = document.createElement('div');
      var stateCell = document.createElement('div');
      var latency = document.createElement('div');
      var checked = document.createElement('div');

      row.className = 'endpoint-row';
      name.className = 'endpoint-name';
      stateCell.className = 'endpoint-state';
      latency.className = 'endpoint-latency';
      checked.className = 'endpoint-checked';

      name.textContent = endpoint.label;

      row.appendChild(name);
      row.appendChild(stateCell);
      row.appendChild(latency);
      row.appendChild(checked);
      fragment.appendChild(row);

      state.rows[endpoint.id] = {
        row: row,
        name: name,
        state: stateCell,
        latency: latency,
        checked: checked
      };
    }

    elements.endpointList.appendChild(fragment);
  }

  function bindEvents() {
    elements.refreshNowButton.addEventListener('click', function () {
      runChecks();
      resetControlsTimer();
    });

    elements.toggleAutoButton.addEventListener('click', function () {
      state.autoRefresh = !state.autoRefresh;
      saveSettings();
      syncControls();
      scheduleNextCheck();
      resetControlsTimer();
    });

    elements.toggleDetailsButton.addEventListener('click', function () {
      state.showDetails = !state.showDetails;
      saveSettings();
      syncControls();
      render();
      resetControlsTimer();
    });

    elements.intervalSelect.addEventListener('change', function () {
      state.interval = parseInt(elements.intervalSelect.value, 10) || DEFAULT_INTERVAL;
      saveSettings();
      syncControls();
      scheduleNextCheck();
      resetControlsTimer();
    });

    elements.saveCustomUrlButton.addEventListener('click', function () {
      applyCustomUrl();
      resetControlsTimer();
    });

    elements.customUrlInput.addEventListener('keydown', function (event) {
      var key = event.key || event.keyCode;

      if (key === 'Enter' || key === 13) {
        applyCustomUrl();
      }
    });

    document.addEventListener('click', handleUserPresence, true);
    document.addEventListener('touchstart', handleUserPresence, true);
    document.addEventListener('mousemove', function () {
      if (elements.controlsOverlay.classList.contains('active')) {
        resetControlsTimer();
      }
    }, true);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        scheduleNextCheck();
      }
    });
  }

  function handleUserPresence() {
    showControls();
  }

  function showControls() {
    elements.controlsOverlay.classList.add('active');
    elements.controlsHint.style.opacity = '0';
    resetControlsTimer();
  }

  function hideControls() {
    elements.controlsOverlay.classList.remove('active');
    elements.controlsHint.style.opacity = '1';
  }

  function resetControlsTimer() {
    if (state.controlsTimer) {
      clearTimeout(state.controlsTimer);
    }

    state.controlsTimer = window.setTimeout(function () {
      hideControls();
    }, CONTROL_TIMEOUT);
  }

  function syncControls() {
    elements.intervalSelect.value = String(state.interval);
    elements.customUrlInput.value = state.customUrl;
    elements.toggleAutoButton.textContent = state.autoRefresh ? 'Auto: On' : 'Auto: Off';
    elements.toggleDetailsButton.textContent = state.showDetails ? 'Details: On' : 'Details: Off';
    elements.refreshState.textContent = state.autoRefresh ? Math.round(state.interval / 1000) + 's' : 'Paused';
  }

  function applyCustomUrl() {
    var value = trimString(elements.customUrlInput.value);

    state.customUrl = value;
    setCustomEndpointUrl(value);
    saveSettings();
    renderEndpoints();
    runChecks();
  }

  function setCustomEndpointUrl(url) {
    var customEndpoint = getEndpointById('custom');

    if (!customEndpoint) {
      return;
    }

    customEndpoint.url = url;
    customEndpoint.enabled = !!url;
    customEndpoint.result = url ? createInitialResult('Waiting') : createInitialResult('Not set');
  }

  function getEndpointById(id) {
    var i;

    for (i = 0; i < state.endpoints.length; i += 1) {
      if (state.endpoints[i].id === id) {
        return state.endpoints[i];
      }
    }

    return null;
  }

  function getActiveEndpoints() {
    var active = [];
    var i;

    for (i = 0; i < state.endpoints.length; i += 1) {
      if (state.endpoints[i].enabled) {
        active.push(state.endpoints[i]);
      }
    }

    return active;
  }

  function runChecks() {
    if (state.isChecking) {
      state.pendingRefresh = true;
      return;
    }

    state.isChecking = true;
    state.pendingRefresh = false;

    setCheckingState();

    var activeEndpoints = getActiveEndpoints();
    var tasks = [];
    var i;

    for (i = 0; i < activeEndpoints.length; i += 1) {
      tasks.push(checkEndpoint(activeEndpoints[i]));
    }

    Promise.all(tasks).then(function (results) {
      var okCount = 0;
      var failedCount = 0;
      var checkedAt = Date.now();
      var j;

      for (j = 0; j < results.length; j += 1) {
        updateEndpointResult(results[j].id, results[j]);

        if (results[j].ok) {
          okCount += 1;
        } else {
          failedCount += 1;
        }
      }

      state.lastCheckedAt = checkedAt;

      if (failedCount === 0) {
        if (!state.stableSince) {
          state.stableSince = checkedAt;
        }
      } else {
        state.stableSince = null;
      }

      updateOverallStatus(okCount, failedCount, activeEndpoints.length);
      render();
      finishRun();
    }, function () {
      state.lastCheckedAt = Date.now();
      state.stableSince = null;
      updateOverallStatus(0, activeEndpoints.length, activeEndpoints.length);
      render();
      finishRun();
    });
  }

  function finishRun() {
    state.isChecking = false;
    scheduleNextCheck();

    if (state.pendingRefresh) {
      state.pendingRefresh = false;
      runChecks();
    }
  }

  function scheduleNextCheck() {
    if (state.refreshTimer) {
      clearTimeout(state.refreshTimer);
      state.refreshTimer = null;
    }

    if (!state.autoRefresh || document.hidden) {
      return;
    }

    state.refreshTimer = window.setTimeout(function () {
      runChecks();
    }, state.interval);
  }

  function setCheckingState() {
    elements.overallStatus.textContent = 'CHECKING...';
    elements.overallStatus.className = 'overall-status status-checking';
    elements.statusSummary.textContent = 'Refreshing endpoint status';
  }

  function checkEndpoint(endpoint) {
    var startedAt = Date.now();
    var requestUrl = addCacheBuster(endpoint.url);

    return fetchWithTimeout(requestUrl, CHECK_TIMEOUT).then(function (response) {
      var latency = Date.now() - startedAt;
      var ok = true;

      if (response && response.type !== 'opaque' && response.ok === false) {
        ok = false;
      }

      return {
        id: endpoint.id,
        ok: ok,
        statusLabel: ok ? 'OK' : 'FAIL',
        latency: latency,
        checkedAt: Date.now(),
        error: ok ? '' : 'HTTP error'
      };
    }, function (error) {
      return {
        id: endpoint.id,
        ok: false,
        statusLabel: 'FAIL',
        latency: null,
        checkedAt: Date.now(),
        error: error && error.message ? error.message : 'Network error'
      };
    });
  }

  function fetchWithTimeout(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = window.setTimeout(function () {
        if (done) {
          return;
        }

        done = true;
        reject(new Error('Timeout'));
      }, timeoutMs);

      fetch(url, {
        method: 'GET',
        mode: 'no-cors'
      }).then(function (response) {
        if (done) {
          return;
        }

        done = true;
        clearTimeout(timer);
        resolve(response);
      }, function (error) {
        if (done) {
          return;
        }

        done = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function updateEndpointResult(id, result) {
    var endpoint = getEndpointById(id);

    if (!endpoint) {
      return;
    }

    endpoint.result = result;
  }

  function updateOverallStatus(okCount, failedCount, totalCount) {
    var statusText = 'CHECKING...';
    var summaryText = 'Waiting for endpoint data';
    var className = 'overall-status status-checking';

    if (totalCount === 0) {
      statusText = 'OFFLINE';
      summaryText = 'No active endpoints configured';
      className = 'overall-status status-offline';
    } else if (okCount === totalCount) {
      statusText = 'ONLINE';
      summaryText = totalCount + ' of ' + totalCount + ' endpoints reachable';
      className = 'overall-status status-online';
    } else if (okCount === 0) {
      statusText = 'OFFLINE';
      summaryText = failedCount + ' of ' + totalCount + ' endpoints failed';
      className = 'overall-status status-offline';
    } else {
      statusText = 'DEGRADED';
      summaryText = okCount + ' OK / ' + failedCount + ' FAIL';
      className = 'overall-status status-degraded';
    }

    elements.overallStatus.textContent = statusText;
    elements.overallStatus.className = className;
    elements.statusSummary.textContent = summaryText;
  }

  function render() {
    renderMeta();
    renderEndpoints();

    if (state.showDetails) {
      elements.app.classList.remove('details-hidden');
    } else {
      elements.app.classList.add('details-hidden');
    }
  }

  function renderMeta() {
    elements.lastChecked.textContent = state.lastCheckedAt ? formatClock(state.lastCheckedAt) : '--:--:--';
    elements.uptimeValue.textContent = formatStableTime();
    elements.refreshState.textContent = state.autoRefresh ? Math.round(state.interval / 1000) + 's' : 'Paused';
  }

  function renderEndpoints() {
    var i;

    for (i = 0; i < state.endpoints.length; i += 1) {
      renderEndpointRow(state.endpoints[i]);
    }
  }

  function renderEndpointRow(endpoint) {
    var rowParts = state.rows[endpoint.id];
    var result = endpoint.result;

    if (!rowParts) {
      return;
    }

    rowParts.name.textContent = endpoint.label;

    if (!endpoint.enabled) {
      rowParts.row.style.display = 'none';
      return;
    }

    rowParts.row.style.display = '';
    rowParts.state.textContent = result.statusLabel;
    rowParts.state.className = 'endpoint-state ' + getStateClass(result);
    rowParts.latency.textContent = result.latency !== null ? result.latency + ' ms' : '--';
    rowParts.latency.className = 'endpoint-latency ' + getLatencyClass(result.latency);
    rowParts.checked.textContent = result.checkedAt ? 'Last: ' + formatClock(result.checkedAt) : 'Last: --:--:--';
    rowParts.checked.className = result.error ? 'endpoint-checked muted-text' : 'endpoint-checked';
  }

  function getStateClass(result) {
    if (result.ok === true) {
      return 'ok-text';
    }

    if (result.ok === false) {
      return 'fail-text';
    }

    return 'muted-text';
  }

  function getLatencyClass(latency) {
    if (latency === null || typeof latency === 'undefined') {
      return 'muted-text';
    }

    if (latency < 150) {
      return 'latency-good';
    }

    if (latency < 400) {
      return 'latency-medium';
    }

    return 'latency-slow';
  }

  function formatStableTime() {
    if (!state.lastCheckedAt) {
      return '--:--:--';
    }

    if (!state.stableSince) {
      return 'UNSTABLE';
    }

    return formatDuration(Date.now() - state.stableSince);
  }

  function formatClock(timestamp) {
    var date = new Date(timestamp);

    return padNumber(date.getHours()) + ':' + padNumber(date.getMinutes()) + ':' + padNumber(date.getSeconds());
  }

  function formatDuration(ms) {
    var totalSeconds = Math.max(0, Math.floor(ms / 1000));
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;

    return padNumber(hours) + ':' + padNumber(minutes) + ':' + padNumber(seconds);
  }

  function padNumber(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function trimString(value) {
    return String(value || '').replace(/^\s+|\s+$/g, '');
  }

  function addCacheBuster(url) {
    var separator = url.indexOf('?') === -1 ? '?' : '&';

    return url + separator + '_ts=' + Date.now();
  }

  window.setInterval(function () {
    if (!state.lastCheckedAt) {
      return;
    }

    renderMeta();
  }, 1000);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
