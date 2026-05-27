(function () {
  var STORAGE_KEY = 'internet-health-hud-settings';
  var DEFAULT_INTERVAL = 30000;
  var CONTROL_TIMEOUT = 10000;
  var CHECK_TIMEOUT = 8000;
  var MAX_ENDPOINTS = 10;
  var MAX_INCIDENTS = 200;
  var SLOW_RESPONSE_MS = 400;

  var state = {
    autoRefresh: true,
    interval: DEFAULT_INTERVAL,
    showDetails: true,
    activeDetailsTab: 'endpoints',
    incidentFilter: 'all',
    incidentEndpointFilter: 'all',
    isChecking: false,
    pendingRefresh: false,
    controlsVisible: false,
    refreshTimer: null,
    controlsTimer: null,
    lastCheckedAt: null,
    stableSince: null,
    endpoints: [],
    incidents: [],
    statusRows: {},
    editorRows: {}
  };

  var elements = {};

  function init() {
    cacheElements();
    loadSettings();
    rebuildEndpointViews();
    bindEvents();
    syncControls();
    render();
    runChecks();
  }

  function cacheElements() {
    elements.app = document.getElementById('app');
    elements.dashboard = document.getElementById('dashboard');
    elements.overallStatus = document.getElementById('overallStatus');
    elements.statusSummary = document.getElementById('statusSummary');
    elements.lastChecked = document.getElementById('lastChecked');
    elements.refreshState = document.getElementById('refreshState');
    elements.uptimeValue = document.getElementById('uptimeValue');
    elements.incidentSummaryButton = document.getElementById('incidentSummaryButton');
    elements.incidentCountValue = document.getElementById('incidentCountValue');
    elements.detailsPanel = document.getElementById('detailsPanel');
    elements.detailsHeader = document.getElementById('detailsHeader');
    elements.detailsCount = document.getElementById('detailsCount');
    elements.showEndpointsTabButton = document.getElementById('showEndpointsTabButton');
    elements.showIncidentsTabButton = document.getElementById('showIncidentsTabButton');
    elements.endpointScroll = document.getElementById('endpointScroll');
    elements.endpointList = document.getElementById('endpointList');
    elements.incidentPanel = document.getElementById('incidentPanel');
    elements.incidentScroll = document.getElementById('incidentScroll');
    elements.incidentList = document.getElementById('incidentList');
    elements.filterAllButton = document.getElementById('filterAllButton');
    elements.filterFailButton = document.getElementById('filterFailButton');
    elements.filterSlowButton = document.getElementById('filterSlowButton');
    elements.incidentEndpointFilter = document.getElementById('incidentEndpointFilter');
    elements.controlsHint = document.getElementById('controlsHint');
    elements.controlsModal = document.getElementById('controlsModal');
    elements.controlsBackdrop = document.getElementById('controlsBackdrop');
    elements.controlsDialog = document.getElementById('controlsDialog');
    elements.controlsSubtitle = document.getElementById('controlsSubtitle');
    elements.closeControlsButton = document.getElementById('closeControlsButton');
    elements.refreshNowButton = document.getElementById('refreshNowButton');
    elements.toggleAutoButton = document.getElementById('toggleAutoButton');
    elements.toggleDetailsButton = document.getElementById('toggleDetailsButton');
    elements.showHistoryButton = document.getElementById('showHistoryButton');
    elements.intervalSelect = document.getElementById('intervalSelect');
    elements.addEndpointButton = document.getElementById('addEndpointButton');
    elements.endpointEditorList = document.getElementById('endpointEditorList');
    elements.endpointEditorScroll = document.getElementById('endpointEditorScroll');
  }

  function loadSettings() {
    var raw = '';
    var saved = null;

    state.endpoints = createDefaultEndpoints();

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

    if (saved.activeDetailsTab === 'incidents' || saved.activeDetailsTab === 'endpoints') {
      state.activeDetailsTab = saved.activeDetailsTab;
    }

    if (saved.incidentFilter === 'all' || saved.incidentFilter === 'fail' || saved.incidentFilter === 'slow') {
      state.incidentFilter = saved.incidentFilter;
    }

    if (typeof saved.incidentEndpointFilter === 'string') {
      state.incidentEndpointFilter = saved.incidentEndpointFilter;
    }

    if (saved.endpoints && Object.prototype.toString.call(saved.endpoints) === '[object Array]') {
      state.endpoints = normalizeSavedEndpoints(saved.endpoints);
    }

    if (saved.incidents && Object.prototype.toString.call(saved.incidents) === '[object Array]') {
      state.incidents = normalizeSavedIncidents(saved.incidents);
    }
  }

  function saveSettings() {
    var payload = {
      autoRefresh: state.autoRefresh,
      interval: state.interval,
      showDetails: state.showDetails,
      activeDetailsTab: state.activeDetailsTab,
      incidentFilter: state.incidentFilter,
      incidentEndpointFilter: state.incidentEndpointFilter,
      endpoints: serializeEndpoints(),
      incidents: serializeIncidents()
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      return;
    }
  }

  function createDefaultEndpoints() {
    return [
      createEndpoint({
        id: 'google-204',
        label: 'Google 204',
        url: 'https://www.google.com/generate_204',
        enabled: true
      }),
      createEndpoint({
        id: 'cloudflare-trace',
        label: 'Cloudflare Trace',
        url: 'https://cloudflare.com/cdn-cgi/trace',
        enabled: true
      })
    ];
  }

  function createEndpoint(config) {
    var endpoint = {
      id: config && config.id ? String(config.id) : generateEndpointId(),
      label: config && typeof config.label === 'string' ? config.label : '',
      url: config && typeof config.url === 'string' ? trimString(config.url) : '',
      enabled: config && typeof config.enabled === 'boolean' ? config.enabled : true,
      result: null
    };

    endpoint.result = getIdleResult(endpoint);
    return endpoint;
  }

  function normalizeSavedEndpoints(savedEndpoints) {
    var normalized = [];
    var i;

    for (i = 0; i < savedEndpoints.length && normalized.length < MAX_ENDPOINTS; i += 1) {
      if (!savedEndpoints[i] || typeof savedEndpoints[i] !== 'object') {
        continue;
      }

      normalized.push(createEndpoint({
        id: savedEndpoints[i].id,
        label: savedEndpoints[i].label,
        url: savedEndpoints[i].url,
        enabled: typeof savedEndpoints[i].enabled === 'boolean' ? savedEndpoints[i].enabled : true
      }));
    }

    if (!normalized.length && savedEndpoints.length) {
      return createDefaultEndpoints();
    }

    return normalized;
  }

  function serializeEndpoints() {
    var serialized = [];
    var i;

    for (i = 0; i < state.endpoints.length; i += 1) {
      serialized.push({
        id: state.endpoints[i].id,
        label: state.endpoints[i].label,
        url: state.endpoints[i].url,
        enabled: state.endpoints[i].enabled
      });
    }

    return serialized;
  }

  function normalizeSavedIncidents(savedIncidents) {
    var normalized = [];
    var i;

    for (i = 0; i < savedIncidents.length && normalized.length < MAX_INCIDENTS; i += 1) {
      if (!savedIncidents[i] || typeof savedIncidents[i] !== 'object') {
        continue;
      }

      if (savedIncidents[i].type !== 'fail' && savedIncidents[i].type !== 'slow') {
        continue;
      }

      normalized.push({
        id: savedIncidents[i].id ? String(savedIncidents[i].id) : generateIncidentId(),
        endpointId: savedIncidents[i].endpointId ? String(savedIncidents[i].endpointId) : '',
        endpointName: savedIncidents[i].endpointName ? String(savedIncidents[i].endpointName) : 'Unknown endpoint',
        endpointUrl: savedIncidents[i].endpointUrl ? String(savedIncidents[i].endpointUrl) : '',
        type: savedIncidents[i].type,
        latency: typeof savedIncidents[i].latency === 'number' ? savedIncidents[i].latency : null,
        error: savedIncidents[i].error ? String(savedIncidents[i].error) : '',
        checkedAt: typeof savedIncidents[i].checkedAt === 'number' ? savedIncidents[i].checkedAt : Date.now()
      });
    }

    return normalized;
  }

  function serializeIncidents() {
    var serialized = [];
    var i;

    for (i = 0; i < state.incidents.length; i += 1) {
      serialized.push({
        id: state.incidents[i].id,
        endpointId: state.incidents[i].endpointId,
        endpointName: state.incidents[i].endpointName,
        endpointUrl: state.incidents[i].endpointUrl,
        type: state.incidents[i].type,
        latency: state.incidents[i].latency,
        error: state.incidents[i].error,
        checkedAt: state.incidents[i].checkedAt
      });
    }

    return serialized;
  }

  function generateEndpointId() {
    return 'endpoint-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
  }

  function generateIncidentId() {
    return 'incident-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
  }

  function getIdleResult(endpoint) {
    if (!endpoint.enabled) {
      return createResult(null, 'OFF', null, null, '');
    }

    if (!endpoint.url) {
      return createResult(null, 'NO URL', null, null, '');
    }

    return createResult(null, 'WAITING', null, null, '');
  }

  function createResult(ok, statusLabel, latency, checkedAt, error) {
    return {
      ok: ok,
      statusLabel: statusLabel,
      latency: latency,
      checkedAt: checkedAt,
      error: error
    };
  }

  function rebuildEndpointViews() {
    rebuildStatusRows();
    rebuildEditorRows();
  }

  function rebuildStatusRows() {
    var fragment = document.createDocumentFragment();
    var i;

    state.statusRows = {};
    clearChildren(elements.endpointList);

    for (i = 0; i < state.endpoints.length; i += 1) {
      var endpoint = state.endpoints[i];
      var row = document.createElement('div');
      var name = document.createElement('div');
      var nameMain = document.createElement('div');
      var nameSub = document.createElement('div');
      var stateCell = document.createElement('div');
      var latency = document.createElement('div');
      var checked = document.createElement('div');

      row.className = 'endpoint-row';
      name.className = 'endpoint-name';
      nameMain.className = 'endpoint-name-main';
      nameSub.className = 'endpoint-name-sub';
      stateCell.className = 'endpoint-state';
      latency.className = 'endpoint-latency';
      checked.className = 'endpoint-checked';

      name.appendChild(nameMain);
      name.appendChild(nameSub);
      row.appendChild(name);
      row.appendChild(stateCell);
      row.appendChild(latency);
      row.appendChild(checked);
      fragment.appendChild(row);

      state.statusRows[endpoint.id] = {
        row: row,
        nameMain: nameMain,
        nameSub: nameSub,
        state: stateCell,
        latency: latency,
        checked: checked
      };
    }

    elements.endpointList.appendChild(fragment);
  }

  function rebuildEditorRows() {
    var fragment = document.createDocumentFragment();
    var i;

    state.editorRows = {};
    clearChildren(elements.endpointEditorList);

    for (i = 0; i < state.endpoints.length; i += 1) {
      fragment.appendChild(buildEndpointEditorRow(state.endpoints[i], i));
    }

    elements.endpointEditorList.appendChild(fragment);
  }

  function buildEndpointEditorRow(endpoint, index) {
    var row = document.createElement('div');
    var header = document.createElement('div');
    var editorIndex = document.createElement('div');
    var toggleWrap = document.createElement('label');
    var toggleLabel = document.createElement('span');
    var checkboxRow = document.createElement('div');
    var checkbox = document.createElement('input');
    var checkboxText = document.createElement('span');
    var removeButton = document.createElement('button');
    var fields = document.createElement('div');
    var nameField = document.createElement('label');
    var nameSpan = document.createElement('span');
    var nameInput = document.createElement('input');
    var urlField = document.createElement('label');
    var urlSpan = document.createElement('span');
    var urlInput = document.createElement('input');

    row.className = 'endpoint-editor-row';
    header.className = 'editor-row-header';
    editorIndex.className = 'editor-index';
    toggleWrap.className = 'editor-toggle';
    toggleLabel.className = 'editor-toggle-label';
    checkboxRow.className = 'editor-checkbox-row';
    checkbox.className = 'editor-checkbox';
    checkbox.type = 'checkbox';
    removeButton.className = 'control-button control-remove-button';
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';
    fields.className = 'editor-fields';
    nameField.className = 'editor-field';
    nameSpan.textContent = 'Name';
    nameInput.className = 'editor-input';
    nameInput.type = 'text';
    nameInput.placeholder = 'Endpoint ' + (index + 1);
    urlField.className = 'editor-field editor-field-wide';
    urlSpan.textContent = 'URL';
    urlInput.className = 'editor-input';
    urlInput.type = 'text';
    urlInput.placeholder = 'https://example.com/health';

    toggleLabel.textContent = 'Status';
    checkboxText.textContent = 'Enabled';
    editorIndex.textContent = 'Endpoint ' + (index + 1);

    checkboxRow.appendChild(checkbox);
    checkboxRow.appendChild(checkboxText);
    toggleWrap.appendChild(toggleLabel);
    toggleWrap.appendChild(checkboxRow);

    nameField.appendChild(nameSpan);
    nameField.appendChild(nameInput);
    urlField.appendChild(urlSpan);
    urlField.appendChild(urlInput);

    header.appendChild(editorIndex);
    header.appendChild(toggleWrap);
    header.appendChild(removeButton);
    fields.appendChild(nameField);
    fields.appendChild(urlField);
    row.appendChild(header);
    row.appendChild(fields);

    checkbox.addEventListener('change', function () {
      updateEndpointEnabled(endpoint.id, checkbox.checked);
      resetControlsTimer();
    });

    nameInput.addEventListener('input', function () {
      updateEndpointLabel(endpoint.id, nameInput.value);
      resetControlsTimer();
    });

    urlInput.addEventListener('change', function () {
      updateEndpointUrl(endpoint.id, urlInput.value, true);
      resetControlsTimer();
    });

    urlInput.addEventListener('keydown', function (event) {
      var key = event.key || event.keyCode;

      if (key === 'Enter' || key === 13) {
        updateEndpointUrl(endpoint.id, urlInput.value, true);
      }
    });

    removeButton.addEventListener('click', function () {
      removeEndpoint(endpoint.id);
      resetControlsTimer();
    });

    state.editorRows[endpoint.id] = {
      row: row,
      editorIndex: editorIndex,
      checkbox: checkbox,
      nameInput: nameInput,
      urlInput: urlInput,
      removeButton: removeButton
    };

    return row;
  }

  function bindEvents() {
    elements.app.addEventListener('click', function (event) {
      if (state.controlsVisible) {
        return;
      }

      if (elements.controlsModal.contains(event.target)) {
        return;
      }

      if (!state.controlsVisible) {
        showControls();
      }
    });

    elements.closeControlsButton.addEventListener('click', function (event) {
      if (event && event.stopPropagation) {
        event.stopPropagation();
      }

      hideControls();
    });

    elements.controlsBackdrop.addEventListener('click', function (event) {
      if (event && event.stopPropagation) {
        event.stopPropagation();
      }

      hideControls();
    });

    elements.controlsDialog.addEventListener('click', function (event) {
      if (event && event.stopPropagation) {
        event.stopPropagation();
      }

      resetControlsTimer();
    });

    elements.controlsDialog.addEventListener('touchstart', function (event) {
      if (event && event.stopPropagation) {
        event.stopPropagation();
      }

      resetControlsTimer();
    });

    elements.controlsDialog.addEventListener('input', function () {
      resetControlsTimer();
    });

    elements.controlsDialog.addEventListener('change', function () {
      resetControlsTimer();
    });

    elements.controlsDialog.addEventListener('mousemove', function () {
      if (state.controlsVisible) {
        resetControlsTimer();
      }
    });

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
      renderPanelVisibility();
      resetControlsTimer();
    });

    elements.showHistoryButton.addEventListener('click', function () {
      state.showDetails = true;
      showIncidentsTab();
      syncControls();
      renderPanelVisibility();
      hideControls();
    });

    elements.incidentSummaryButton.addEventListener('click', function () {
      state.showDetails = true;
      showIncidentsTab();
      syncControls();
      renderPanelVisibility();
    });

    elements.showEndpointsTabButton.addEventListener('click', function (event) {
      if (event && event.stopPropagation) {
        event.stopPropagation();
      }

      showEndpointsTab();
    });

    elements.showIncidentsTabButton.addEventListener('click', function (event) {
      if (event && event.stopPropagation) {
        event.stopPropagation();
      }

      showIncidentsTab();
    });

    elements.filterAllButton.addEventListener('click', function () {
      setIncidentFilter('all');
    });

    elements.filterFailButton.addEventListener('click', function () {
      setIncidentFilter('fail');
    });

    elements.filterSlowButton.addEventListener('click', function () {
      setIncidentFilter('slow');
    });

    elements.incidentEndpointFilter.addEventListener('change', function () {
      state.incidentEndpointFilter = elements.incidentEndpointFilter.value;
      saveSettings();
      renderIncidents();
    });

    elements.intervalSelect.addEventListener('change', function () {
      state.interval = parseInt(elements.intervalSelect.value, 10) || DEFAULT_INTERVAL;
      saveSettings();
      syncControls();
      scheduleNextCheck();
      resetControlsTimer();
    });

    elements.addEndpointButton.addEventListener('click', function () {
      addEndpoint();
      resetControlsTimer();
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        scheduleNextCheck();
      }
    });
  }

  function showControls() {
    state.controlsVisible = true;
    renderPanelVisibility();
    resetControlsTimer();
  }

  function hideControls() {
    if (state.controlsTimer) {
      clearTimeout(state.controlsTimer);
      state.controlsTimer = null;
    }

    state.controlsVisible = false;
    renderPanelVisibility();
  }

  function resetControlsTimer() {
    if (!state.controlsVisible) {
      return;
    }

    if (state.controlsTimer) {
      clearTimeout(state.controlsTimer);
    }

    state.controlsTimer = window.setTimeout(function () {
      hideControls();
    }, CONTROL_TIMEOUT);
  }

  function addEndpoint() {
    if (state.endpoints.length >= MAX_ENDPOINTS) {
      return;
    }

    state.endpoints.push(createEndpoint({
      label: '',
      url: '',
      enabled: false
    }));

    saveSettings();
    rebuildEndpointViews();
    syncControls();
    render();

    if (state.endpoints.length) {
      var latest = state.endpoints[state.endpoints.length - 1];
      var row = state.editorRows[latest.id];

      if (row && row.nameInput && row.nameInput.focus) {
        row.nameInput.focus();
      }
    }
  }

  function removeEndpoint(id) {
    var i;

    for (i = 0; i < state.endpoints.length; i += 1) {
      if (state.endpoints[i].id === id) {
        state.endpoints.splice(i, 1);
        break;
      }
    }

    saveSettings();
    rebuildEndpointViews();
    syncControls();
    render();
    runChecks();
  }

  function updateEndpointLabel(id, label) {
    var endpoint = getEndpointById(id);

    if (!endpoint) {
      return;
    }

    endpoint.label = label;
    saveSettings();
    renderStatusRow(endpoint, getEndpointIndex(id));
  }

  function updateEndpointUrl(id, url, shouldRunChecks) {
    var endpoint = getEndpointById(id);

    if (!endpoint) {
      return;
    }

    endpoint.url = trimString(url);
    endpoint.result = getIdleResult(endpoint);
    saveSettings();
    renderStatusRow(endpoint, getEndpointIndex(id));
    renderEditorRow(endpoint, getEndpointIndex(id));

    if (shouldRunChecks) {
      runChecks();
    }
  }

  function updateEndpointEnabled(id, enabled) {
    var endpoint = getEndpointById(id);

    if (!endpoint) {
      return;
    }

    endpoint.enabled = enabled;
    endpoint.result = getIdleResult(endpoint);
    saveSettings();
    renderStatusRow(endpoint, getEndpointIndex(id));
    renderEditorRow(endpoint, getEndpointIndex(id));
    runChecks();
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

  function getEndpointIndex(id) {
    var i;

    for (i = 0; i < state.endpoints.length; i += 1) {
      if (state.endpoints[i].id === id) {
        return i;
      }
    }

    return -1;
  }

  function getDisplayName(endpoint, index) {
    var label = trimString(endpoint.label);

    if (label) {
      return label;
    }

    return 'Endpoint ' + (index + 1);
  }

  function getActiveEndpoints() {
    var active = [];
    var i;

    for (i = 0; i < state.endpoints.length; i += 1) {
      if (state.endpoints[i].enabled && state.endpoints[i].url) {
        active.push(state.endpoints[i]);
      }
    }

    return active;
  }

  function syncControls() {
    elements.intervalSelect.value = String(state.interval);
    elements.toggleAutoButton.textContent = state.autoRefresh ? 'Auto: On' : 'Auto: Off';
    elements.toggleDetailsButton.textContent = state.showDetails ? 'Details: On' : 'Details: Off';
    elements.refreshState.textContent = state.autoRefresh ? Math.round(state.interval / 1000) + 's' : 'Paused';
    elements.controlsSubtitle.textContent = state.endpoints.length + ' of ' + MAX_ENDPOINTS + ' endpoint slots used';
    elements.addEndpointButton.disabled = state.endpoints.length >= MAX_ENDPOINTS;
    syncIncidentEndpointFilter();
  }

  function render() {
    renderMeta();
    renderPanelVisibility();
    renderEndpoints();
    renderIncidents();
  }

  function renderPanelVisibility() {
    if (state.showDetails) {
      elements.app.classList.remove('details-hidden');
    } else {
      elements.app.classList.add('details-hidden');
    }

    if (state.controlsVisible) {
      elements.controlsModal.className = 'controls-modal active';
      elements.controlsHint.style.opacity = '0';
    } else {
      elements.controlsModal.className = 'controls-modal';
      elements.controlsHint.style.opacity = '1';
    }

    if (state.activeDetailsTab === 'incidents') {
      elements.detailsPanel.classList.add('show-incidents');
      elements.showEndpointsTabButton.className = 'details-tab-button';
      elements.showEndpointsTabButton.setAttribute('aria-selected', 'false');
      elements.showIncidentsTabButton.className = 'details-tab-button active';
      elements.showIncidentsTabButton.setAttribute('aria-selected', 'true');
    } else {
      elements.detailsPanel.classList.remove('show-incidents');
      elements.showEndpointsTabButton.className = 'details-tab-button active';
      elements.showEndpointsTabButton.setAttribute('aria-selected', 'true');
      elements.showIncidentsTabButton.className = 'details-tab-button';
      elements.showIncidentsTabButton.setAttribute('aria-selected', 'false');
    }
  }

  function renderMeta() {
    elements.lastChecked.textContent = state.lastCheckedAt ? formatClock(state.lastCheckedAt) : '--:--:--';
    elements.uptimeValue.textContent = formatStableTime();
    elements.refreshState.textContent = state.autoRefresh ? Math.round(state.interval / 1000) + 's' : 'Paused';
    elements.incidentCountValue.textContent = state.incidents.length + ' / ' + MAX_INCIDENTS;
  }

  function renderEndpoints() {
    var i;

    if (state.activeDetailsTab === 'endpoints') {
      elements.detailsHeader.textContent = 'ENDPOINT STATUS';
      elements.detailsCount.textContent = state.endpoints.length + ' configured';
    }

    for (i = 0; i < state.endpoints.length; i += 1) {
      renderStatusRow(state.endpoints[i], i);
      renderEditorRow(state.endpoints[i], i);
    }
  }

  function renderStatusRow(endpoint, index) {
    var rowParts = state.statusRows[endpoint.id];
    var result = endpoint.result || getIdleResult(endpoint);
    var stateText = result.statusLabel;
    var stateClass = getStateClass(result);
    var checkedText = 'Last: --:--:--';
    var latencyText = '--';

    if (!rowParts) {
      return;
    }

    rowParts.nameMain.textContent = getDisplayName(endpoint, index);
    rowParts.nameSub.textContent = endpoint.url ? endpoint.url : 'No URL configured';

    if (!endpoint.enabled) {
      stateText = 'OFF';
      stateClass = 'muted-text';
      checkedText = 'Disabled';
    } else if (!endpoint.url) {
      stateText = 'NO URL';
      stateClass = 'warn-text';
      checkedText = 'Waiting for configuration';
    } else {
      if (result.latency !== null && typeof result.latency !== 'undefined') {
        latencyText = result.latency + ' ms';
      }

      if (result.checkedAt) {
        checkedText = 'Last: ' + formatClock(result.checkedAt);
      }

      if (result.ok === false && result.error) {
        checkedText = checkedText + '  ' + result.error;
      }
    }

    rowParts.state.textContent = stateText;
    rowParts.state.className = 'endpoint-state ' + stateClass;
    rowParts.latency.textContent = latencyText;
    rowParts.latency.className = 'endpoint-latency ' + getLatencyClass(result.latency);
    rowParts.checked.textContent = checkedText;
    rowParts.checked.className = endpoint.enabled && endpoint.url ? 'endpoint-checked' : 'endpoint-checked muted-text';
  }

  function renderEditorRow(endpoint, index) {
    var rowParts = state.editorRows[endpoint.id];

    if (!rowParts) {
      return;
    }

    rowParts.editorIndex.textContent = 'Endpoint ' + (index + 1);
    rowParts.checkbox.checked = endpoint.enabled;

    if (document.activeElement !== rowParts.nameInput) {
      rowParts.nameInput.value = endpoint.label;
    }

    if (document.activeElement !== rowParts.urlInput) {
      rowParts.urlInput.value = endpoint.url;
    }
  }

  function getStateClass(result) {
    if (result.ok === true) {
      return 'ok-text';
    }

    if (result.ok === false) {
      return 'fail-text';
    }

    if (result.statusLabel === 'NO URL') {
      return 'warn-text';
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

    if (latency < SLOW_RESPONSE_MS) {
      return 'latency-medium';
    }

    return 'latency-slow';
  }

  function isSlowResult(result) {
    return result && typeof result.latency === 'number' && result.latency >= SLOW_RESPONSE_MS;
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

    if (!activeEndpoints.length) {
      state.lastCheckedAt = Date.now();
      state.stableSince = null;
      updateOverallStatus(0, 0, 0);
      render();
      finishRun();
      return;
    }

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
        recordIncidentForResult(results[j]);

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

      return createEndpointResult(endpoint.id, ok, latency, ok ? '' : 'HTTP error');
    }, function (error) {
      return createEndpointResult(
        endpoint.id,
        false,
        null,
        error && error.message ? error.message : 'Network error'
      );
    });
  }

  function createEndpointResult(id, ok, latency, error) {
    return {
      id: id,
      ok: ok,
      statusLabel: ok ? 'OK' : 'FAIL',
      latency: latency,
      checkedAt: Date.now(),
      error: error
    };
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

  function recordIncidentForResult(result) {
    var endpoint = getEndpointById(result.id);
    var incidentType = '';
    var incident;

    if (!endpoint) {
      return;
    }

    if (result.ok === false) {
      incidentType = 'fail';
    } else if (isSlowResult(result)) {
      incidentType = 'slow';
    }

    if (!incidentType) {
      return;
    }

    incident = {
      id: generateIncidentId(),
      endpointId: endpoint.id,
      endpointName: getDisplayName(endpoint, getEndpointIndex(endpoint.id)),
      endpointUrl: endpoint.url,
      type: incidentType,
      latency: result.latency,
      error: result.error || '',
      checkedAt: result.checkedAt || Date.now()
    };

    state.incidents.unshift(incident);

    if (state.incidents.length > MAX_INCIDENTS) {
      state.incidents.length = MAX_INCIDENTS;
    }

    saveSettings();
  }

  function showEndpointsTab() {
    state.activeDetailsTab = 'endpoints';
    saveSettings();
    renderPanelVisibility();
    renderEndpoints();
  }

  function showIncidentsTab() {
    state.activeDetailsTab = 'incidents';
    saveSettings();
    renderPanelVisibility();
    renderIncidents();
  }

  function setIncidentFilter(filter) {
    state.incidentFilter = filter;
    saveSettings();
    renderIncidents();
  }

  function syncIncidentEndpointFilter() {
    var currentValue = state.incidentEndpointFilter;
    var seen = { all: true };
    var options = [{
      value: 'all',
      label: 'All endpoints'
    }];
    var incidentOptionMap = {};
    var i;

    for (i = 0; i < state.endpoints.length; i += 1) {
      if (seen[state.endpoints[i].id]) {
        continue;
      }

      seen[state.endpoints[i].id] = true;
      options.push({
        value: state.endpoints[i].id,
        label: getDisplayName(state.endpoints[i], i)
      });
    }

    for (i = 0; i < state.incidents.length; i += 1) {
      if (!state.incidents[i].endpointId || seen[state.incidents[i].endpointId]) {
        continue;
      }

      if (!incidentOptionMap[state.incidents[i].endpointId]) {
        incidentOptionMap[state.incidents[i].endpointId] = state.incidents[i].endpointName || 'Unknown endpoint';
      }
    }

    for (var endpointId in incidentOptionMap) {
      if (Object.prototype.hasOwnProperty.call(incidentOptionMap, endpointId)) {
        seen[endpointId] = true;
        options.push({
          value: endpointId,
          label: incidentOptionMap[endpointId]
        });
      }
    }

    clearChildren(elements.incidentEndpointFilter);

    for (i = 0; i < options.length; i += 1) {
      var option = document.createElement('option');
      option.value = options[i].value;
      option.textContent = options[i].label;
      elements.incidentEndpointFilter.appendChild(option);
    }

    if (!seen[currentValue]) {
      state.incidentEndpointFilter = 'all';
    }

    elements.incidentEndpointFilter.value = state.incidentEndpointFilter;
  }

  function getFilteredIncidents() {
    var filtered = [];
    var i;

    for (i = 0; i < state.incidents.length; i += 1) {
      if (state.incidentFilter !== 'all' && state.incidents[i].type !== state.incidentFilter) {
        continue;
      }

      if (state.incidentEndpointFilter !== 'all' && state.incidents[i].endpointId !== state.incidentEndpointFilter) {
        continue;
      }

      filtered.push(state.incidents[i]);
    }

    return filtered;
  }

  function renderIncidents() {
    var incidents = getFilteredIncidents();
    var fragment = document.createDocumentFragment();
    var emptyState;
    var i;

    if (state.activeDetailsTab === 'incidents') {
      elements.detailsHeader.textContent = 'INCIDENT HISTORY';
      elements.detailsCount.textContent = incidents.length + ' shown of ' + state.incidents.length;
    }

    elements.filterAllButton.className = state.incidentFilter === 'all' ? 'incident-filter-button active' : 'incident-filter-button';
    elements.filterFailButton.className = state.incidentFilter === 'fail' ? 'incident-filter-button active' : 'incident-filter-button';
    elements.filterSlowButton.className = state.incidentFilter === 'slow' ? 'incident-filter-button active' : 'incident-filter-button';
    syncIncidentEndpointFilter();
    clearChildren(elements.incidentList);

    if (!incidents.length) {
      emptyState = document.createElement('div');
      emptyState.className = 'incident-empty-state';
      emptyState.textContent = 'No incidents match the current filters.';
      elements.incidentList.appendChild(emptyState);
      return;
    }

    for (i = 0; i < incidents.length; i += 1) {
      fragment.appendChild(buildIncidentRow(incidents[i]));
    }

    elements.incidentList.appendChild(fragment);
  }

  function buildIncidentRow(incident) {
    var row = document.createElement('div');
    var top = document.createElement('div');
    var name = document.createElement('div');
    var time = document.createElement('div');
    var bottom = document.createElement('div');
    var type = document.createElement('div');
    var latency = document.createElement('div');
    var reason = document.createElement('div');

    row.className = 'incident-row';
    top.className = 'incident-row-top';
    name.className = 'incident-name';
    time.className = 'incident-time';
    bottom.className = 'incident-row-bottom';
    type.className = incident.type === 'fail' ? 'incident-type fail-text' : 'incident-type latency-slow';
    latency.className = 'incident-latency ' + getLatencyClass(incident.latency);
    reason.className = 'incident-reason';

    name.textContent = incident.endpointName;
    time.textContent = formatDateTime(incident.checkedAt);
    type.textContent = incident.type === 'fail' ? 'FAIL' : 'SLOW';
    latency.textContent = incident.latency !== null && typeof incident.latency !== 'undefined'
      ? incident.latency + ' ms'
      : '--';
    reason.textContent = getIncidentReason(incident);

    top.appendChild(name);
    top.appendChild(time);
    bottom.appendChild(type);
    bottom.appendChild(latency);
    bottom.appendChild(reason);
    row.appendChild(top);
    row.appendChild(bottom);

    return row;
  }

  function getIncidentReason(incident) {
    if (incident.type === 'fail') {
      return incident.error || 'Request failed';
    }

    if (incident.error) {
      return incident.error;
    }

    return 'Exceeded slow threshold (' + SLOW_RESPONSE_MS + ' ms)';
  }

  function updateOverallStatus(okCount, failedCount, totalCount) {
    var statusText = 'CHECKING...';
    var summaryText = 'Waiting for endpoint data';
    var className = 'overall-status status-checking';

    if (totalCount === 0) {
      statusText = 'OFFLINE';
      summaryText = 'No enabled endpoints configured';
      className = 'overall-status status-offline';
    } else if (okCount === totalCount) {
      statusText = 'ONLINE';
      summaryText = okCount + ' of ' + totalCount + ' active endpoints reachable';
      className = 'overall-status status-online';
    } else if (okCount === 0) {
      statusText = 'OFFLINE';
      summaryText = failedCount + ' of ' + totalCount + ' active endpoints failed';
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

  function formatStableTime() {
    if (!state.lastCheckedAt) {
      return '--:--:--';
    }

    if (!getActiveEndpoints().length) {
      return 'NO TARGET';
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

  function formatDateTime(timestamp) {
    var date = new Date(timestamp);
    return (
      (date.getMonth() + 1) + '/' +
      date.getDate() + ' ' +
      formatClock(timestamp)
    );
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

  function clearChildren(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
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
