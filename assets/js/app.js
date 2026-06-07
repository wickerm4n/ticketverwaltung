(() => {
  "use strict";

  const APP_VERSION = "2026.06.07.10";
  const VERSION_STORAGE_KEY = "eventTicketManager.appVersion";
  const VERSION_RELOAD_GUARD_KEY = "eventTicketManager.versionReloadGuard";
  const VERSION_RELOAD_GUARD_AT_KEY = "eventTicketManager.versionReloadGuardAt";
  const VERSION_LAST_REMOTE_KEY = "eventTicketManager.lastRemoteVersion";
  const VERSION_URL_PARAM = "_appv";
  const VERSION_RELOAD_PARAM = "_reload";
  const VERSION_MANIFEST_PATH = "config/version.json";
  const VERSION_MANIFEST_MAX_LENGTH = 256;
  const REMOTE_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const VERSION_RELOAD_RETRY_MS = 60 * 1000;

  const STORAGE_KEY = "eventTicketManagerData.v3";
  const EVENTS_STORAGE_KEY = "eventTicketManagerEvents.v1";
  const ACTIVE_EVENT_STORAGE_KEY = "eventTicketManagerActiveEvent.v1";
  const EVENT_DATA_PREFIX = "eventTicketManagerEventData.v1:";
  const LEGACY_REMOTE_SESSION_STORAGE_KEY = "eventTicketManagerRemote.v1";
  const OWNER_SESSION_STORAGE_KEY = "eventTicketManagerOwnerRemote.v1";
  const SHARED_STORAGE_PREFIX = "eventTicketManagerSharedData.v1:";
  const LEGACY_STORAGE_KEYS = ["eventTicketManagerData.v2", "eventTicketManagerData.v1"];
  const MAX_EVENTS = 100;
  const MAX_TICKETS = 250;
  const MAX_PRICE = 999_999_999;
  const MAX_NAME_LENGTH = 40;
  const MAX_EVENT_NAME_LENGTH = 48;
  const MAX_PHONE_LENGTH = 20;
  const MAX_SEARCH_LENGTH = 80;
  const MAX_STORAGE_LENGTH = 250_000;
  const MAX_CSV_IMPORT_BYTES = 512_000;
  const MAX_CSV_IMPORT_CHARS = 512_000;
  const MAX_VERSION_LENGTH = 64;
  const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
  const CSV_FILE_TYPES = new Set(["text/csv", "application/csv", "application/vnd.ms-excel"]);
  const FIREBASE_SDK_VERSION = "12.13.0";
  const SHARE_PARAM_LIST = "list";
  const SHARE_PARAM_TOKEN = "token";
  const SHARE_PARAM_ROLE = "role";
  const SHARE_PARAM_EVENT = "event";
  const SHARE_PARAM_SCOPE = "scope";
  const SHARE_PARAM_BUNDLE = "bundle";
  const SHARE_SCOPE_EVENT = "event";
  const SHARE_SCOPE_ALL = "all";
  const SHARE_ROLE_READ = "reader";
  const SHARE_ROLE_EDIT = "editor";
  const SHARE_ROLE_OWNER = "owner";
  const SHARE_TOKEN_LENGTH = 24;
  const SHARE_LIST_ID_LENGTH = 18;
  const SHARE_BUNDLE_ID_LENGTH = 18;
  const REMOTE_SAVE_DEBOUNCE_MS = 350;
  const REMOTE_SAVE_RETRY_MS = 1200;
  const REMOTE_TOAST_COOLDOWN_MS = 2500;
  const FIREBASE_REQUIRED_CONFIG_KEYS = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];

  let firebaseConfig = null;
  let appConfig = {};
  let initializeApp = null;
  let getAuth = null;
  let signInAnonymously = null;
  let getDatabase = null;
  let dbRef = null;
  let dbSet = null;
  let dbUpdate = null;
  let dbGet = null;
  let onValue = null;
  let runTransaction = null;
  let firebaseRuntimeLoadPromise = null;

  const PRICES = Object.freeze({
    normal: 2500,
    vip: 4000,
  });

  const TYPE_LABELS = Object.freeze({
    normal: "Normal",
    vip: "VIP",
  });

  const MENU_LABELS = Object.freeze({
    menu1: "Menü 1",
    menu2: "Menü 2 (Veggie)",
  });

  const TOAST_TYPES = new Set(["info", "success", "warning", "danger"]);
  const TOAST_DURATION_MS = 4200;
  const DIALOG_KEYS = Object.freeze({
    TICKET_DELETE: "ticket-delete",
    BULK_TICKET_DELETE: "bulk-ticket-delete",
    DATA_RESET: "data-reset",
    CSV_IMPORT: "csv-import",
    TICKET_LIMIT: "ticket-limit",
  });
  const DIALOG_KEY_SET = new Set(Object.values(DIALOG_KEYS));

  const state = {
    tickets: [],
    counters: { normal: 1, vip: 1 },
    preferences: createDefaultPreferences(),
    selectedTicketIds: new Set(),
    search: "",
    filter: "all",
    editingId: null,
    dialogResolve: null,
    dialogReturnFocus: null,
    dialogPreferenceKey: "",
    dialogInputEnabled: false,
    versionCheckInFlight: false,
    lastRemoteVersionCheckAt: 0,
    events: { items: [], activeId: "" },
    remote: createDefaultRemoteState(),
  };

  const els = {
    form: document.querySelector("#ticketForm"),
    editId: document.querySelector("#editId"),
    firstName: document.querySelector("#firstName"),
    lastName: document.querySelector("#lastName"),
    phone: document.querySelector("#phone"),
    ticketType: document.querySelector("#ticketType"),
    ticketMenu: document.querySelector("#ticketMenu"),
    customPriceToggle: document.querySelector("#customPriceToggle"),
    customPriceField: document.querySelector("#customPriceField"),
    customPrice: document.querySelector("#customPrice"),
    saveBtn: document.querySelector("#saveBtn"),
    cancelEditBtn: document.querySelector("#cancelEditBtn"),
    formTitle: document.querySelector("#formTitle"),
    formModeBadge: document.querySelector("#formModeBadge"),
    formError: document.querySelector("#formError"),
    searchInput: document.querySelector("#searchInput"),
    typeFilter: document.querySelector("#typeFilter"),
    selectAllTickets: document.querySelector("#selectAllTickets"),
    selectionBar: document.querySelector("#selectionBar"),
    selectionCount: document.querySelector("#selectionCount"),
    bulkExportCsvBtn: document.querySelector("#bulkExportCsvBtn"),
    bulkDeleteBtn: document.querySelector("#bulkDeleteBtn"),
    resetConfirmationsBtn: document.querySelector("#resetConfirmationsBtn"),
    tableBody: document.querySelector("#ticketTableBody"),
    soldCount: document.querySelector("#soldCount"),
    normalCount: document.querySelector("#normalCount"),
    vipCount: document.querySelector("#vipCount"),
    remainingCount: document.querySelector("#remainingCount"),
    totalRevenue: document.querySelector("#totalRevenue"),
    exportCsvBtn: document.querySelector("#exportCsvBtn"),
    importCsvBtn: document.querySelector("#importCsvBtn"),
    csvImportInput: document.querySelector("#csvImportInput"),
    resetBtn: document.querySelector("#resetBtn"),
    shareBtn: document.querySelector("#shareBtn"),
    eventSelect: document.querySelector("#eventSelect"),
    newEventBtn: document.querySelector("#newEventBtn"),
    renameEventBtn: document.querySelector("#renameEventBtn"),
    deleteEventBtn: document.querySelector("#deleteEventBtn"),
    shareStatus: document.querySelector("#shareStatus"),
    shareDialogBackdrop: document.querySelector("#shareDialogBackdrop"),
    shareDialogCard: document.querySelector(".share-modal-card"),
    shareModeRead: document.querySelector("#shareModeRead"),
    shareModeEdit: document.querySelector("#shareModeEdit"),
    shareAllEventsToggle: document.querySelector("#shareAllEventsToggle"),
    shareLinkInput: document.querySelector("#shareLinkInput"),
    shareRotateBtn: document.querySelector("#shareRotateBtn"),
    shareCopyBtn: document.querySelector("#shareCopyBtn"),
    shareCloseBtn: document.querySelector("#shareCloseBtn"),
    shareDialogNote: document.querySelector("#shareDialogNote"),
    limitBadge: document.querySelector("#limitBadge"),
    toast: document.querySelector("#toast"),
    toastMessage: document.querySelector("#toastMessage"),
    dialogBackdrop: document.querySelector("#dialogBackdrop"),
    dialogCard: document.querySelector(".modal-card"),
    dialogTitle: document.querySelector("#dialogTitle"),
    dialogMessage: document.querySelector("#dialogMessage"),
    dialogInputRow: document.querySelector("#dialogInputRow"),
    dialogInputLabel: document.querySelector("#dialogInputLabel"),
    dialogInput: document.querySelector("#dialogInput"),
    dialogSkipRow: document.querySelector("#dialogSkipRow"),
    dialogSkipCheckbox: document.querySelector("#dialogSkipCheckbox"),
    dialogCancelBtn: document.querySelector("#dialogCancelBtn"),
    dialogConfirmBtn: document.querySelector("#dialogConfirmBtn"),
  };

  function init() {
    rememberCurrentAppVersion();
    migrateLegacyRemoteSession();
    initializeEvents();

    loadData();
    bindEvents();
    updatePriceUi();
    renderApp();
    cleanVersionParamsFromUrl();
    startRemoteVersionChecks();
    state.remote.initPromise = initFirebaseAndMaybeOpenSharedList();
    void state.remote.initPromise;
  }


  function rememberCurrentAppVersion() {
    const storedVersion = safeStorageGet(localStorage, VERSION_STORAGE_KEY, MAX_VERSION_LENGTH);
    if (storedVersion !== APP_VERSION) {
      safeStorageSet(localStorage, VERSION_STORAGE_KEY, APP_VERSION);
    }

    const guardedVersion = safeStorageGet(sessionStorage, VERSION_RELOAD_GUARD_KEY, MAX_VERSION_LENGTH);
    if (guardedVersion === APP_VERSION) {
      safeStorageRemove(sessionStorage, VERSION_RELOAD_GUARD_KEY);
      safeStorageRemove(sessionStorage, VERSION_RELOAD_GUARD_AT_KEY);
    }
  }

  function startRemoteVersionChecks() {
    if (!canCheckRemoteVersion()) return;

    state.lastRemoteVersionCheckAt = Date.now();
    void checkRemoteVersion();

    window.setInterval(() => {
      void checkRemoteVersion();
    }, REMOTE_VERSION_CHECK_INTERVAL_MS);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && shouldCheckRemoteVersionNow()) {
        void checkRemoteVersion();
      }
    });

    window.addEventListener("focus", () => {
      if (shouldCheckRemoteVersionNow()) {
        void checkRemoteVersion();
      }
    });
  }

  function shouldCheckRemoteVersionNow() {
    return Date.now() - state.lastRemoteVersionCheckAt >= REMOTE_VERSION_CHECK_INTERVAL_MS;
  }

  function canCheckRemoteVersion() {
    return typeof fetch === "function" && ["http:", "https:"].includes(window.location.protocol);
  }

  async function checkRemoteVersion() {
    if (state.versionCheckInFlight) return;

    state.versionCheckInFlight = true;
    state.lastRemoteVersionCheckAt = Date.now();

    try {
      const latestVersion = await fetchLatestAppVersion();
      if (!latestVersion || !isRemoteVersionNewer(latestVersion, APP_VERSION)) return;

      const guardedVersion = safeStorageGet(sessionStorage, VERSION_RELOAD_GUARD_KEY, MAX_VERSION_LENGTH);
      const lastRemoteVersion = safeStorageGet(localStorage, VERSION_LAST_REMOTE_KEY, MAX_VERSION_LENGTH);
      const urlVersion = getUrlVersionParam();

      if (urlVersion === latestVersion || isVersionReloadGuardActive(guardedVersion, latestVersion)) return;

      safeStorageSet(localStorage, VERSION_LAST_REMOTE_KEY, latestVersion);
      safeStorageSet(sessionStorage, VERSION_RELOAD_GUARD_KEY, latestVersion);
      safeStorageSet(sessionStorage, VERSION_RELOAD_GUARD_AT_KEY, String(Date.now()), MAX_VERSION_LENGTH);

      if (lastRemoteVersion !== latestVersion) {
        showToast("Neue Version wird geladen.", "info");
      }

      window.setTimeout(() => {
        reloadWithVersionParam(latestVersion, true);
      }, 250);
    } catch {
      // Versionsprüfung ist ein Komfort-Feature und darf die App nicht stören.
    } finally {
      state.versionCheckInFlight = false;
    }
  }

  async function fetchLatestAppVersion() {
    const manifestUrl = new URL(VERSION_MANIFEST_PATH, window.location.href);
    manifestUrl.searchParams.set("_", String(Date.now()));

    const response = await fetch(manifestUrl.href, {
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) return "";

    const manifestText = await response.text();
    if (manifestText.length > VERSION_MANIFEST_MAX_LENGTH) return "";

    const manifest = JSON.parse(manifestText);
    return normalizeAppVersion(manifest?.version);
  }

  function reloadWithVersionParam(version = APP_VERSION, cacheBust = false) {
    try {
      const targetUrl = new URL(window.location.href);
      if (!isReloadableAppUrl(targetUrl)) {
        window.location.reload();
        return;
      }

      targetUrl.searchParams.set(VERSION_URL_PARAM, normalizeAppVersion(version) || APP_VERSION);
      if (cacheBust) {
        targetUrl.searchParams.set(VERSION_RELOAD_PARAM, String(Date.now()));
      }
      window.location.replace(targetUrl.href);
    } catch {
      window.location.reload();
    }
  }

  function getUrlVersionParam() {
    try {
      const version = new URL(window.location.href).searchParams.get(VERSION_URL_PARAM) || "";
      return normalizeAppVersion(version);
    } catch {
      return "";
    }
  }

  function isVersionReloadGuardActive(guardedVersion, latestVersion) {
    if (guardedVersion !== latestVersion) return false;

    const guardedAt = Number(safeStorageGet(sessionStorage, VERSION_RELOAD_GUARD_AT_KEY, MAX_VERSION_LENGTH));
    return Number.isFinite(guardedAt) && Date.now() - guardedAt < VERSION_RELOAD_RETRY_MS;
  }

  function cleanVersionParamsFromUrl() {
    try {
      const targetUrl = new URL(window.location.href);
      if (!isReloadableAppUrl(targetUrl)) return;
      if (!targetUrl.searchParams.has(VERSION_URL_PARAM) && !targetUrl.searchParams.has(VERSION_RELOAD_PARAM)) return;

      targetUrl.searchParams.delete(VERSION_URL_PARAM);
      targetUrl.searchParams.delete(VERSION_RELOAD_PARAM);
      window.history.replaceState(null, document.title, targetUrl.href);
    } catch {
      // Die sichtbare URL-Bereinigung ist rein kosmetisch.
    }
  }

  function normalizeAppVersion(version) {
    const text = String(version ?? "").trim();
    return /^[\w.-]{1,64}$/.test(text) ? text : "";
  }

  function isRemoteVersionNewer(remoteVersion, currentVersion) {
    const remoteParts = normalizeAppVersion(remoteVersion).split(/[.-]/);
    const currentParts = normalizeAppVersion(currentVersion).split(/[.-]/);
    const length = Math.max(remoteParts.length, currentParts.length);

    for (let index = 0; index < length; index += 1) {
      const remotePart = remoteParts[index] ?? "0";
      const currentPart = currentParts[index] ?? "0";
      const remoteNumber = /^\d+$/.test(remotePart) ? Number(remotePart) : NaN;
      const currentNumber = /^\d+$/.test(currentPart) ? Number(currentPart) : NaN;

      if (Number.isFinite(remoteNumber) && Number.isFinite(currentNumber)) {
        if (remoteNumber !== currentNumber) return remoteNumber > currentNumber;
        continue;
      }

      const textCompare = remotePart.localeCompare(currentPart, undefined, { numeric: true, sensitivity: "base" });
      if (textCompare !== 0) return textCompare > 0;
    }

    return false;
  }

  function isReloadableAppUrl(url) {
    if (url.protocol === "file:") return true;
    return ["http:", "https:"].includes(url.protocol) && url.origin === window.location.origin;
  }

  function clearVersionReloadGuard() {
    safeStorageRemove(sessionStorage, VERSION_RELOAD_GUARD_KEY);
    safeStorageRemove(sessionStorage, VERSION_RELOAD_GUARD_AT_KEY);
  }

  function safeStorageGet(storage, key, maxLength = MAX_STORAGE_LENGTH) {
    try {
      const value = storage.getItem(key);
      return typeof value === "string" && value.length <= maxLength ? value : "";
    } catch {
      return "";
    }
  }

  function safeStorageSet(storage, key, value, maxLength = MAX_STORAGE_LENGTH) {
    try {
      const text = String(value);
      if (text.length > maxLength) return false;
      storage.setItem(key, text);
      return true;
    } catch {
      return false;
    }
  }

  function safeStorageRemove(storage, key) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage kann z. B. im privaten Modus blockiert sein.
    }
  }

  function initializeEvents() {
    const restoredEvents = loadEventRegistry();
    if (restoredEvents.items.length > 0) {
      state.events = restoredEvents;
      saveEventRegistry();
      return;
    }

    const legacySession = loadOwnerRemoteSession();
    const firstEvent = createEventMeta({
      name: "Event 1",
      listId: legacySession?.listId || "",
    });

    state.events = {
      items: [firstEvent],
      activeId: firstEvent.id,
    };
    saveEventRegistry();
  }

  function loadEventRegistry() {
    const rawRegistry = safeStorageGet(localStorage, EVENTS_STORAGE_KEY);
    const activeIdFromStorage = sanitizeEventId(safeStorageGet(localStorage, ACTIVE_EVENT_STORAGE_KEY, 128));
    let parsed = null;

    if (rawRegistry) {
      try {
        parsed = JSON.parse(rawRegistry);
      } catch {
        parsed = null;
      }
    }

    const rawEvents = Array.isArray(parsed?.events) ? parsed.events.slice(0, MAX_EVENTS) : [];
    const usedIds = new Set();
    const items = rawEvents
      .map((event, index) => sanitizeEventMeta(event, index, usedIds))
      .filter(Boolean);
    const activeId = activeIdFromStorage || sanitizeEventId(parsed?.activeId);
    const safeActiveId = items.some((event) => event.id === activeId)
      ? activeId
      : (items[0]?.id || "");

    return {
      items,
      activeId: safeActiveId,
    };
  }

  function saveEventRegistry({ render = true } = {}) {
    if (state.events.items.length === 0) {
      const firstEvent = createEventMeta({ name: "Event 1" });
      state.events.items = [firstEvent];
      state.events.activeId = firstEvent.id;
    }

    const usedIds = new Set();
    state.events.items = state.events.items
      .slice(0, MAX_EVENTS)
      .map((event, index) => sanitizeEventMeta(event, index, usedIds))
      .filter(Boolean);

    if (!state.events.items.some((event) => event.id === state.events.activeId)) {
      state.events.activeId = state.events.items[0]?.id || "";
    }

    const payload = {
      version: 1,
      activeId: state.events.activeId,
      events: state.events.items.map((event) => ({
        id: event.id,
        name: event.name,
        listId: event.listId,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      })),
    };
    const registrySaved = safeStorageSet(localStorage, EVENTS_STORAGE_KEY, JSON.stringify(payload));
    const activeSaved = safeStorageSet(localStorage, ACTIVE_EVENT_STORAGE_KEY, state.events.activeId, 128);

    if (render) {
      renderEventSelector();
    }

    return registrySaved && activeSaved;
  }

  function sanitizeEventMeta(event, index, usedIds) {
    const now = Date.now();
    const id = getUniqueEventId(event?.id, usedIds);
    const name = normalizeEventName(event?.name) || `Event ${index + 1}`;
    const listId = sanitizeShareToken(event?.listId, 128);
    const createdAt = normalizeTimestamp(event?.createdAt, now);
    const updatedAt = Math.max(createdAt, normalizeTimestamp(event?.updatedAt, createdAt));

    return {
      id,
      name,
      listId,
      createdAt,
      updatedAt,
    };
  }

  function createEventMeta({ name = "", listId = "" } = {}) {
    const now = Date.now();
    return {
      id: createEventId(),
      name: normalizeEventName(name) || getNextEventName(),
      listId: sanitizeShareToken(listId, 128),
      createdAt: now,
      updatedAt: now,
    };
  }

  function renderEventSelector() {
    if (!els.eventSelect) return;

    const activeId = state.events.activeId;
    clearChildren(els.eventSelect);

    state.events.items.forEach((event) => {
      const option = document.createElement("option");
      option.value = event.id;
      option.textContent = getEventOptionLabel(event);
      els.eventSelect.append(option);
    });

    els.eventSelect.value = activeId;
  }

  function getEventOptionLabel(event) {
    const name = normalizeEventName(event?.name) || "Event";
    return event?.listId ? `${name} (geteilt)` : name;
  }

  function getNextEventName() {
    const usedNames = new Set(state.events.items.map((event) => normalizeEventName(event.name).toLocaleLowerCase("de-DE")));
    let index = state.events.items.length + 1;
    let name = `Event ${index}`;

    while (usedNames.has(name.toLocaleLowerCase("de-DE"))) {
      index += 1;
      name = `Event ${index}`;
    }

    return name;
  }

  function getActiveEvent() {
    return state.events.items.find((event) => event.id === state.events.activeId) || null;
  }

  function findEventById(eventId) {
    const safeEventId = sanitizeEventId(eventId);
    return safeEventId ? state.events.items.find((event) => event.id === safeEventId) || null : null;
  }

  function findEventByListId(listId) {
    const safeListId = sanitizeShareToken(listId, 128);
    return safeListId ? state.events.items.find((event) => event.listId === safeListId) || null : null;
  }

  function activateEventForRemoteList(listId, eventName = "", { persist = true, restrictToShare = false } = {}) {
    const safeListId = sanitizeShareToken(listId, 128);
    if (!safeListId) return null;

    const sharedEventName = normalizeEventName(eventName);
    let event = findEventByListId(safeListId);

    if (restrictToShare) {
      event = event
        ? { ...event, name: sharedEventName || event.name, listId: safeListId }
        : createEventMeta({ name: sharedEventName || "Geteiltes Event", listId: safeListId });
      event.updatedAt = Date.now();
      state.events.items = [event];
      state.events.activeId = event.id;
      renderEventSelector();
      return event;
    }

    if (!event) {
      const reusableEvent = getReusableDefaultEventForShare();
      if (reusableEvent) {
        event = reusableEvent;
        event.name = sharedEventName || event.name;
        event.listId = safeListId;
        event.updatedAt = Date.now();
        safeStorageRemove(localStorage, `${EVENT_DATA_PREFIX}${event.id}`);
      } else {
        event = createEventMeta({ name: sharedEventName || getNextEventName(), listId: safeListId });
        state.events.items.push(event);
      }
    } else if (sharedEventName && event.name !== sharedEventName) {
      event.name = sharedEventName;
      event.updatedAt = Date.now();
    }

    state.events.activeId = event.id;
    if (persist) {
      saveEventRegistry();
    } else {
      renderEventSelector();
    }
    return event;
  }

  function getReusableDefaultEventForShare() {
    const event = getActiveEvent();
    if (!event || event.listId || state.events.items.length !== 1) return null;
    if (normalizeEventName(event.name) !== "Event 1") return null;
    if (!isCurrentEventEmpty()) return null;
    return event;
  }

  function isCurrentEventEmpty() {
    const preferences = sanitizePreferences(state.preferences);
    return state.tickets.length === 0
      && state.counters.normal === 1
      && state.counters.vip === 1
      && Object.keys(preferences.suppressedConfirmations || {}).length === 0;
  }

  function linkActiveEventToRemoteList(listId) {
    const safeListId = sanitizeShareToken(listId, 128);
    const activeEvent = getActiveEvent();
    if (!safeListId || !activeEvent) return false;

    activeEvent.listId = safeListId;
    activeEvent.updatedAt = Date.now();
    saveEventRegistry();
    return true;
  }

  async function handleEventSelectionChange() {
    const targetEventId = els.eventSelect?.value || "";
    if (!targetEventId || targetEventId === state.events.activeId) {
      renderEventSelector();
      return;
    }

    const switched = await switchToEvent(targetEventId);
    if (!switched) {
      renderEventSelector();
    }
  }

  async function handleNewEventClick() {
    if (!guardEventManagementAccess()) return;

    const name = await openEventNameDialog({
      title: "Neues Event",
      message: "Name für das neue Event:",
      defaultName: getNextEventName(),
      confirmText: "Starten",
    });
    if (!name) return;

    await createAndSwitchToNewEvent(name);
  }

  async function handleRenameEventClick() {
    if (!guardEventManagementAccess()) return;

    const activeEvent = getActiveEvent();
    if (!activeEvent) {
      showToast("Kein aktives Event gefunden.", "warning");
      return;
    }

    const previousName = activeEvent.name;
    const nextName = await openEventNameDialog({
      title: "Event umbenennen",
      message: "Neuer Name für das aktive Event:",
      defaultName: previousName,
      confirmText: "Speichern",
    });
    if (!nextName) return;

    if (nextName === previousName) {
      renderEventSelector();
      return;
    }

    activeEvent.name = nextName;
    activeEvent.updatedAt = Date.now();

    if (!saveEventRegistry()) {
      const currentEvent = getActiveEvent();
      if (currentEvent) {
        currentEvent.name = previousName;
        currentEvent.updatedAt = Date.now();
      }
      saveEventRegistry();
      showToast("Eventname konnte nicht gespeichert werden.", "danger");
      return;
    }

    showToast("Event umbenannt.", "success");
  }

  async function handleDeleteEventClick() {
    if (!guardEventManagementAccess()) return;

    const activeEvent = getActiveEvent();
    if (!activeEvent) {
      showToast("Kein aktives Event gefunden.", "warning");
      return;
    }

    const deleteSharedNote = activeEvent.listId
      ? " Die Firebase-Liste und bestehende Share-Links bleiben abrufbar."
      : "";
    const lastEventNote = state.events.items.length <= 1
      ? " Danach wird ein neues leeres Event angelegt."
      : "";
    const confirmed = await openDialog({
      title: "Event löschen",
      message: `Event "${activeEvent.name}" aus dieser App löschen?${deleteSharedNote}${lastEventNote}`,
      confirmText: "Löschen",
      cancelText: "Abbrechen",
      showCancel: true,
      variant: "danger",
    });

    if (!confirmed) return;

    await deleteActiveEvent();
  }

  async function deleteActiveEvent() {
    if (!guardEventManagementAccess()) return false;

    const activeEvent = getActiveEvent();
    if (!activeEvent) return false;

    const deletedIndex = Math.max(0, state.events.items.findIndex((event) => event.id === activeEvent.id));
    const deletedEventId = activeEvent.id;
    const deletedListId = activeEvent.listId;

    resetRemoteListConnection();
    removeEventLocalData(activeEvent);
    clearShareUrlForList(deletedListId);

    state.events.items = state.events.items.filter((event) => event.id !== deletedEventId);
    if (state.events.items.length === 0) {
      const replacement = createEventMeta({ name: "Event 1" });
      state.events.items.push(replacement);
      state.events.activeId = replacement.id;
    } else {
      const nextIndex = Math.min(deletedIndex, state.events.items.length - 1);
      state.events.activeId = state.events.items[nextIndex].id;
    }

    saveEventRegistry();
    loadDataForActiveEvent();
    clearForm();
    saveLocalData();
    renderApp();

    const nextEvent = getActiveEvent();
    if (nextEvent?.listId) {
      await connectActiveEventRemoteList(nextEvent);
    }

    showToast("Event gelöscht.", "success");
    return true;
  }

  function removeEventLocalData(event) {
    const eventId = sanitizeEventId(event?.id);
    const listId = sanitizeShareToken(event?.listId, 128);

    if (eventId) {
      safeStorageRemove(localStorage, `${EVENT_DATA_PREFIX}${eventId}`);
    }
    if (listId) {
      safeStorageRemove(localStorage, `${SHARED_STORAGE_PREFIX}${listId}`);

      const session = loadOwnerRemoteSession();
      if (session?.listId === listId) {
        clearOwnerRemoteSession();
      }
    }
  }

  function clearShareUrlForList(listId) {
    const safeListId = sanitizeShareToken(listId, 128);
    if (!safeListId) return;

    try {
      const shareParams = getShareParamsFromUrl();
      if (shareParams?.listId !== safeListId) return;

      const url = new URL(window.location.href);
      url.searchParams.delete(SHARE_PARAM_LIST);
      url.searchParams.delete(SHARE_PARAM_TOKEN);
      url.searchParams.delete(SHARE_PARAM_ROLE);
      url.searchParams.delete(SHARE_PARAM_EVENT);
      url.searchParams.delete(SHARE_PARAM_SCOPE);
      url.searchParams.delete(SHARE_PARAM_BUNDLE);
      url.hash = "";
      window.history.replaceState(null, document.title, url.href);
    } catch {
      // URL-Bereinigung ist optional.
    }
  }

  async function openEventNameDialog({ title, message, defaultName = "", confirmText = "Speichern" }) {
    let inputValue = normalizeEventName(defaultName) || getNextEventName();

    while (true) {
      const result = await openDialog({
        title,
        message,
        confirmText,
        cancelText: "Abbrechen",
        showCancel: true,
        inputLabel: "Eventname",
        inputValue,
        inputPlaceholder: "Eventname",
        inputMaxLength: MAX_EVENT_NAME_LENGTH,
      });

      if (result === false) return "";

      const name = normalizeEventName(result);
      if (name) return name;

      inputValue = "";
      showToast("Bitte gib einen Eventnamen ein.", "warning");
    }
  }

  async function createAndSwitchToNewEvent(name = "") {
    if (!guardEventManagementAccess()) return;
    if (!(await prepareCurrentEventForNavigation())) return;

    const event = createEventMeta({ name: normalizeEventName(name) || getNextEventName() });
    state.events.items.push(event);
    state.events.activeId = event.id;
    saveEventRegistry();
    resetRemoteListConnection();
    resetStateToDefaults();
    clearForm();
    saveLocalData();
    renderApp();
    showToast(`${event.name} gestartet. Vorherige Events bleiben gespeichert.`, "success");
  }

  async function switchToEvent(eventId, { silent = false } = {}) {
    if (state.remote.openedFromShareLink && state.remote.shareScope === SHARE_SCOPE_ALL) {
      return switchToSharedBundleEvent(eventId, { silent });
    }

    const targetEvent = findEventById(eventId);
    if (!targetEvent) return false;
    if (targetEvent.id === state.events.activeId) return true;
    if (!(await prepareCurrentEventForNavigation())) return false;

    state.events.activeId = targetEvent.id;
    saveEventRegistry();
    resetRemoteListConnection();
    loadDataForActiveEvent();
    clearForm();
    renderApp();

    if (targetEvent.listId) {
      await connectActiveEventRemoteList(targetEvent);
    }

    if (!silent) {
      showToast(`${targetEvent.name} geöffnet.`, "success");
    }

    return true;
  }

  async function prepareCurrentEventForNavigation() {
    const data = createPersistedData();
    if (!saveCurrentDataSnapshot(data)) {
      showToast("Aktuelles Event konnte nicht gespeichert werden.", "danger");
      return false;
    }

    if (canWriteRemoteList() && !state.remote.applyingRemote) {
      window.clearTimeout(state.remote.saveTimer);
      state.remote.saveTimer = 0;
      await writeRemoteStateNow();
    }

    return true;
  }

  async function connectActiveEventRemoteList(event) {
    const listId = sanitizeShareToken(event?.listId, 128);
    if (!listId) return false;

    await waitForFirebaseInitialization();
    if (!state.remote.configured) {
      updateAccessUi();
      return false;
    }
    if (!(await ensureFirebaseReady())) return false;

    const uid = state.remote.user?.uid || "";
    if (uid && await connectOwnedSharedList(listId, uid)) {
      return true;
    }

    showToast("Event lokal geladen. Firebase-Besitzerzugriff wurde nicht gefunden.", "warning");
    updateAccessUi();
    return false;
  }

  function resetRemoteListConnection() {
    if (typeof state.remote.unsubscribe === "function") {
      state.remote.unsubscribe();
    }

    window.clearTimeout(state.remote.saveTimer);
    state.remote.listId = "";
    state.remote.token = "";
    state.remote.readToken = "";
    state.remote.editToken = "";
    state.remote.shareKey = "";
    state.remote.role = "local";
    state.remote.canWrite = true;
    state.remote.openedFromShareLink = false;
    state.remote.shareScope = SHARE_SCOPE_EVENT;
    state.remote.bundleId = "";
    state.remote.bundleToken = "";
    state.remote.bundleReadToken = "";
    state.remote.bundleEditToken = "";
    state.remote.sharedEventAccess = {};
    state.remote.unsubscribe = null;
    state.remote.applyingRemote = false;
    state.remote.saveTimer = 0;
    state.remote.saving = false;
    state.remote.saveQueued = false;
    state.remote.pendingFullReplace = false;
    state.remote.pendingDeletedTicketIds.clear();
    updateAccessUi();
  }

  function loadDataForActiveEvent() {
    resetStateToDefaults();

    const rawData = getStoredData();
    if (!rawData) return;

    try {
      applyPersistedData(JSON.parse(rawData));
      saveLocalData();
    } catch {
      resetStateToDefaults();
    }
  }

  function getUniqueEventId(value, usedIds) {
    let eventId = sanitizeEventId(value);

    if (!eventId || usedIds.has(eventId)) {
      do {
        eventId = createEventId();
      } while (usedIds.has(eventId));
    }

    usedIds.add(eventId);
    return eventId;
  }

  function createEventId() {
    return createShareId("evt", 14);
  }

  function sanitizeEventId(value) {
    const text = String(value || "").trim();
    return /^evt_[A-Za-z0-9_-]{14}$/.test(text) ? text : "";
  }

  function normalizeEventName(value) {
    return normalizeStoredText(value, MAX_EVENT_NAME_LENGTH);
  }

  function normalizeTimestamp(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
  }

  function migrateLegacyRemoteSession() {
    const rawSession = safeStorageGet(localStorage, LEGACY_REMOTE_SESSION_STORAGE_KEY, 4096);

    if (rawSession) {
      try {
        const parsed = JSON.parse(rawSession);
        const listId = sanitizeShareToken(parsed?.listId, 128);
        const authUid = sanitizeAuthUid(parsed?.authUid);
        if (listId && authUid && parsed?.role === SHARE_ROLE_OWNER) {
          saveOwnerRemoteSession({ listId, authUid });
        }
      } catch {
        // Alte Sitzungsdaten sind optional und werden bei Fehlern verworfen.
      }
    }

    safeStorageRemove(localStorage, LEGACY_REMOTE_SESSION_STORAGE_KEY);
  }

  function saveOwnerRemoteSession({ listId, authUid }) {
    const safeListId = sanitizeShareToken(listId, 128);
    const safeAuthUid = sanitizeAuthUid(authUid);
    if (!safeListId || !safeAuthUid) return false;

    return safeStorageSet(localStorage, OWNER_SESSION_STORAGE_KEY, JSON.stringify({
      listId: safeListId,
      authUid: safeAuthUid,
      savedAt: Date.now(),
      appVersion: APP_VERSION,
    }), 1024);
  }

  function loadOwnerRemoteSession() {
    const rawSession = safeStorageGet(localStorage, OWNER_SESSION_STORAGE_KEY, 1024);
    if (!rawSession) return null;

    try {
      const parsed = JSON.parse(rawSession);
      const listId = sanitizeShareToken(parsed?.listId, 128);
      const authUid = sanitizeAuthUid(parsed?.authUid);
      return listId && authUid ? { listId, authUid } : null;
    } catch {
      return null;
    }
  }

  function clearOwnerRemoteSession() {
    safeStorageRemove(localStorage, OWNER_SESSION_STORAGE_KEY);
  }

  function bindEvents() {
    els.form.addEventListener("submit", handleFormSubmit);
    els.cancelEditBtn.addEventListener("click", clearForm);

    els.firstName.addEventListener("input", () => {
      els.firstName.value = normalizeNameInput(els.firstName.value);
    });

    els.lastName.addEventListener("input", () => {
      els.lastName.value = normalizeNameInput(els.lastName.value);
    });

    els.phone.addEventListener("input", () => {
      els.phone.value = sanitizeDigits(els.phone.value).slice(0, MAX_PHONE_LENGTH);
    });

    els.customPrice.addEventListener("input", () => {
      els.customPrice.value = sanitizeDigits(els.customPrice.value).slice(0, String(MAX_PRICE).length);
    });

    els.customPriceToggle.addEventListener("change", updatePriceUi);
    els.ticketType.addEventListener("change", updatePriceUi);

    els.searchInput.addEventListener("input", () => {
      const value = els.searchInput.value.slice(0, MAX_SEARCH_LENGTH);
      els.searchInput.value = value;
      state.search = normalizeSearch(value);
      clearSelectedTickets();
      renderTable();
    });

    els.typeFilter.addEventListener("change", () => {
      state.filter = isValidFilter(els.typeFilter.value) ? els.typeFilter.value : "all";
      els.typeFilter.value = state.filter;
      clearSelectedTickets();
      renderTable();
    });

    els.tableBody.addEventListener("click", handleTableAction);
    els.tableBody.addEventListener("change", handleTableSelectionChange);
    els.selectAllTickets.addEventListener("change", handleSelectAllTickets);
    els.bulkExportCsvBtn.addEventListener("click", exportSelectedCsv);
    els.bulkDeleteBtn.addEventListener("click", deleteSelectedTickets);
    els.resetConfirmationsBtn.addEventListener("click", resetHiddenConfirmations);
    els.exportCsvBtn.addEventListener("click", exportCsv);
    els.importCsvBtn.addEventListener("click", openCsvImportPicker);
    els.csvImportInput.addEventListener("change", handleCsvImportChange);
    els.resetBtn.addEventListener("click", resetAllData);
    els.eventSelect?.addEventListener("change", handleEventSelectionChange);
    els.newEventBtn?.addEventListener("click", handleNewEventClick);
    els.renameEventBtn?.addEventListener("click", handleRenameEventClick);
    els.deleteEventBtn?.addEventListener("click", handleDeleteEventClick);
    els.shareBtn?.addEventListener("click", handleShareButtonClick);
    els.shareModeRead?.addEventListener("change", handleShareDialogOptionChange);
    els.shareModeEdit?.addEventListener("change", handleShareDialogOptionChange);
    els.shareAllEventsToggle?.addEventListener("change", handleShareDialogOptionChange);
    els.shareRotateBtn?.addEventListener("click", rotateShareLinks);
    els.shareCopyBtn?.addEventListener("click", copyShareLinkFromDialog);
    els.shareCloseBtn?.addEventListener("click", closeShareDialog);
    els.shareDialogBackdrop?.addEventListener("click", (event) => {
      if (event.target === els.shareDialogBackdrop) closeShareDialog();
    });

    els.dialogCancelBtn.addEventListener("click", () => closeDialog(false));
    els.dialogConfirmBtn.addEventListener("click", () => closeDialog(true));

    els.dialogBackdrop.addEventListener("click", (event) => {
      if (event.target === els.dialogBackdrop) {
        closeDialog(false);
      }
    });

    document.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("hashchange", handleShareHashChange);
    window.addEventListener("pagehide", persistCurrentDataBeforeUnload);
  }

  async function handleFormSubmit(event) {
    event.preventDefault();

    if (!guardWriteAccess()) return;

    const formData = getFormData();
    const validationError = validateFormData(formData);

    if (validationError) {
      showFormError(validationError.message);

      if (validationError.dialog) {
        await openDialog({
          title: "Hinweis",
          message: validationError.message,
          confirmText: "OK",
          showCancel: false,
          variant: "warning",
          preferenceKey: DIALOG_KEYS.TICKET_LIMIT,
        });
      }

      return;
    }

    if (state.editingId) {
      editTicket(state.editingId, formData);
    } else {
      addTicket(formData);
    }
  }

  function getFormData() {
    const type = isValidType(els.ticketType.value) ? els.ticketType.value : "normal";
    const customPriceEnabled = els.customPriceToggle.checked;
    const manualPrice = parseSafeInteger(els.customPrice.value);

    return {
      firstName: normalizeStoredText(els.firstName.value, MAX_NAME_LENGTH),
      lastName: normalizeStoredText(els.lastName.value, MAX_NAME_LENGTH),
      phone: sanitizeDigits(els.phone.value).slice(0, MAX_PHONE_LENGTH),
      type,
      menu: isValidMenu(els.ticketMenu.value) ? els.ticketMenu.value : "menu1",
      customPrice: customPriceEnabled,
      price: customPriceEnabled ? manualPrice : PRICES[type],
    };
  }

  function validateFormData(data) {
    if (!data.firstName || !data.lastName || !data.phone || !data.type || !data.menu) {
      return { message: "Bitte alle Felder ausfüllen." };
    }

    if (!isValidType(data.type)) {
      return { message: "Ungültiger Tickettyp." };
    }

    if (!isValidMenu(data.menu)) {
      return { message: "Ungültiges Menü." };
    }

    if (data.customPrice && (!Number.isSafeInteger(data.price) || data.price <= 0 || data.price > MAX_PRICE)) {
      return { message: "Bitte gültigen Preis eingeben." };
    }

    if (!state.editingId && state.tickets.length >= MAX_TICKETS) {
      return { message: "Maximale Anzahl erreicht.", dialog: true };
    }

    return null;
  }

  function addTicket(data) {
    if (state.tickets.length >= MAX_TICKETS) {
      openDialog({
        title: "Hinweis",
        message: "Maximale Anzahl erreicht.",
        confirmText: "OK",
        showCancel: false,
        variant: "warning",
        preferenceKey: DIALOG_KEYS.TICKET_LIMIT,
      });
      return;
    }

    const ticket = {
      id: createId(),
      ticketNumber: generateTicketNumber(data.type),
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      type: data.type,
      menu: data.menu,
      price: data.price,
      customPrice: data.customPrice,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    state.tickets.push(ticket);

    if (!saveData()) return;

    clearForm();
    renderApp();
    showToast("Ticket gespeichert.", "success");
  }

  function editTicket(id, data) {
    const ticket = state.tickets.find((item) => item.id === id);
    if (!ticket) return;

    const typeChanged = ticket.type !== data.type;

    ticket.firstName = data.firstName;
    ticket.lastName = data.lastName;
    ticket.phone = data.phone;
    ticket.type = data.type;
    ticket.menu = data.menu;
    ticket.price = data.price;
    ticket.customPrice = data.customPrice;
    ticket.updatedAt = new Date().toISOString();

    // Bei Typwechsel bleibt der Prefix zum Tickettyp passend.
    if (typeChanged) {
      ticket.ticketNumber = generateTicketNumber(data.type);
    }

    if (!saveData()) return;

    clearForm();
    renderApp();
    showToast("Eintrag aktualisiert.", "success");
  }

  async function deleteTicket(id) {
    if (!guardWriteAccess()) return;

    const ticket = state.tickets.find((item) => item.id === id);
    if (!ticket) return;

    const confirmed = await openDialog({
      title: "Ticket löschen",
      message: `Ticket ${ticket.ticketNumber} löschen?`,
      confirmText: "Löschen",
      cancelText: "Abbrechen",
      showCancel: true,
      variant: "danger",
      preferenceKey: DIALOG_KEYS.TICKET_DELETE,
    });

    if (!confirmed) return;

    const result = removeTicketsByIds([id]);
    if (!result.saved) return;

    renderApp();

    if (result.deletedCount > 0) {
      showToast("Ticket gelöscht.", "success");
    } else {
      showToast("Ticket nicht mehr vorhanden.", "warning");
    }
  }

  function exportSelectedCsv() {
    const selectedTickets = getSelectedTickets();

    if (selectedTickets.length === 0) {
      clearSelectedTickets();
      renderApp();
      showToast("Keine Tickets ausgewählt.", "warning");
      return;
    }

    exportTicketsAsCsv(selectedTickets, {
      filePrefix: "ausgewählte-tickets",
      successMessage: `${formatTicketCount(selectedTickets.length)} als CSV-Datei exportiert.`,
      emptyMessage: "Keine Tickets ausgewählt.",
    });
  }

  async function deleteSelectedTickets() {
    if (!guardWriteAccess()) return;

    const selectedTickets = getSelectedTickets();

    if (selectedTickets.length === 0) {
      clearSelectedTickets();
      renderApp();
      showToast("Keine Tickets ausgewählt.", "warning");
      return;
    }

    const selectedLabel = formatSelectedTicketCount(selectedTickets.length);
    const confirmed = await openDialog({
      title: "Ausgewählte Tickets löschen",
      message: `Möchtest du wirklich ${selectedLabel} löschen?`,
      confirmText: "Löschen",
      cancelText: "Abbrechen",
      showCancel: true,
      variant: "danger",
      preferenceKey: DIALOG_KEYS.BULK_TICKET_DELETE,
    });

    if (!confirmed) return;

    const currentSelectedIds = getExistingSelectedTicketIds();
    if (currentSelectedIds.length === 0) {
      clearSelectedTickets();
      renderApp();
      showToast("Ausgewählte Tickets nicht mehr vorhanden.", "warning");
      return;
    }

    const result = removeTicketsByIds(currentSelectedIds);
    if (!result.saved) return;

    clearSelectedTickets();
    renderApp();

    if (result.deletedCount > 0) {
      showToast(`${formatTicketCount(result.deletedCount)} gelöscht.`, "success");
    } else {
      showToast("Ausgewählte Tickets nicht mehr vorhanden.", "warning");
    }
  }

  function removeTicketsByIds(ids) {
    const existingIds = new Set(state.tickets.map((ticket) => ticket.id));
    const targetIds = new Set(Array.from(ids).filter((id) => existingIds.has(id)));

    if (targetIds.size === 0) {
      return { deletedCount: 0, saved: true };
    }

    const previousTickets = state.tickets;
    const nextTickets = previousTickets.filter((ticket) => !targetIds.has(ticket.id));
    const deletedCount = previousTickets.length - nextTickets.length;

    state.tickets = nextTickets;

    if (!saveData({ deletedTicketIds: targetIds })) {
      state.tickets = previousTickets;
      return { deletedCount: 0, saved: false };
    }

    targetIds.forEach((id) => state.selectedTicketIds.delete(id));

    if (state.editingId && targetIds.has(state.editingId)) {
      clearForm();
    }

    return { deletedCount, saved: true };
  }

  function startEditTicket(id) {
    const ticket = state.tickets.find((item) => item.id === id);
    if (!ticket) return;

    const defaultPrice = PRICES[ticket.type] || 0;
    const storedPrice = parseSafeInteger(ticket.price) || defaultPrice;
    const customPriceEnabled = Boolean(ticket.customPrice) || storedPrice !== defaultPrice;

    state.editingId = id;
    els.editId.value = id;
    els.firstName.value = ticket.firstName;
    els.lastName.value = ticket.lastName;
    els.phone.value = sanitizeDigits(ticket.phone).slice(0, MAX_PHONE_LENGTH);
    els.ticketType.value = ticket.type;
    els.ticketMenu.value = isValidMenu(ticket.menu) ? ticket.menu : "menu1";
    els.customPriceToggle.checked = customPriceEnabled;
    els.customPrice.value = String(storedPrice || "");

    els.formTitle.textContent = "Ticket bearbeiten";
    els.formModeBadge.textContent = ticket.ticketNumber;
    els.saveBtn.textContent = "Aktualisieren";
    els.cancelEditBtn.classList.remove("hidden");
    showFormError("");
    updatePriceUi();

    els.firstName.focus();
  }

  function handleTableAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || !els.tableBody.contains(button)) return;

    const { action, id } = button.dataset;
    if (!id) return;

    if (action === "edit") startEditTicket(id);
    if (action === "delete") deleteTicket(id);
  }

  function handleTableSelectionChange(event) {
    const checkbox = event.target.closest("input[data-select-ticket]");
    if (!checkbox || !els.tableBody.contains(checkbox)) return;

    const id = checkbox.dataset.id;
    if (!state.tickets.some((ticket) => ticket.id === id)) {
      state.selectedTicketIds.delete(id);
      renderTable();
      showToast("Ticket nicht mehr vorhanden.", "warning");
      return;
    }

    if (checkbox.checked) {
      state.selectedTicketIds.add(id);
    } else {
      state.selectedTicketIds.delete(id);
    }

    const row = checkbox.closest("tr");
    if (row) {
      row.classList.toggle("row-selected", checkbox.checked);
    }

    updateSelectionUi();
  }

  function handleSelectAllTickets() {
    const visibleTickets = getFilteredTickets();
    const shouldSelect = els.selectAllTickets.checked;

    visibleTickets.forEach((ticket) => {
      if (shouldSelect) {
        state.selectedTicketIds.add(ticket.id);
      } else {
        state.selectedTicketIds.delete(ticket.id);
      }
    });

    renderTable();
  }

  function generateTicketNumber(type) {
    const safeType = isValidType(type) ? type : "normal";
    const prefix = safeType === "vip" ? "VIP" : "N";
    let nextNumber = Math.max(1, parseSafeInteger(state.counters[safeType]) || 1);
    let ticketNumber = "";
    let guard = 0;

    do {
      ticketNumber = `${prefix}-${String(nextNumber).padStart(3, "0")}`;
      nextNumber += 1;
      guard += 1;
    } while (state.tickets.some((ticket) => ticket.ticketNumber === ticketNumber) && guard < 10000);

    state.counters[safeType] = nextNumber;
    return ticketNumber;
  }

  function renderApp() {
    syncSelectedTickets();
    renderEventSelector();
    renderTable();
    updateStats();
    updateLimitState();
    updateAccessUi();
  }

  function renderTable() {
    const tickets = getFilteredTickets();
    clearChildren(els.tableBody);

    if (tickets.length === 0) {
      const row = document.createElement("tr");
      row.className = "empty-row";
      const cell = document.createElement("td");
      cell.colSpan = 9;
      cell.textContent = "Keine Einträge";
      row.append(cell);
      els.tableBody.append(row);
      updateSelectionUi();
      return;
    }

    const fragment = document.createDocumentFragment();

    tickets.forEach((ticket) => {
      const row = document.createElement("tr");
      row.dataset.id = ticket.id;
      row.classList.toggle("row-selected", state.selectedTicketIds.has(ticket.id));
      row.append(
        createSelectCell(ticket),
        createTextCell(ticket.ticketNumber, "ticket-number", "Ticketnummer"),
        createTextCell(ticket.firstName, "", "Vorname"),
        createTextCell(ticket.lastName, "", "Nachname"),
        createTextCell(ticket.phone, "", "Telefonnummer"),
        createBadgeCell(ticket.type, "Tickettyp"),
        createMenuCell(ticket.menu, "Menü"),
        createTextCell(formatCurrency(ticket.price), "", "Preis"),
        createActionCell(ticket.id),
      );
      fragment.append(row);
    });

    els.tableBody.append(fragment);
    updateSelectionUi();
  }

  function createSelectCell(ticket) {
    const cell = document.createElement("td");
    const label = document.createElement("label");
    const input = document.createElement("input");
    const visual = document.createElement("span");

    cell.className = "select-cell";
    label.className = "ticket-select";
    input.type = "checkbox";
    input.dataset.selectTicket = "true";
    input.dataset.id = ticket.id;
    input.checked = state.selectedTicketIds.has(ticket.id);
    input.setAttribute("aria-label", `Ticket ${ticket.ticketNumber} auswählen`);
    visual.className = "check-visual";
    visual.setAttribute("aria-hidden", "true");

    label.append(input, visual);
    cell.append(label);
    return cell;
  }

  function createTextCell(text, className = "", label = "") {
    const cell = document.createElement("td");
    if (label) cell.dataset.label = label;

    if (className) {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = String(text ?? "");
      cell.append(span);
      return cell;
    }

    cell.textContent = String(text ?? "");
    return cell;
  }

  function createBadgeCell(type, label = "") {
    const cell = document.createElement("td");
    const badge = document.createElement("span");
    const safeType = isValidType(type) ? type : "normal";
    if (label) cell.dataset.label = label;

    badge.className = `badge ${safeType === "vip" ? "badge-vip" : "badge-normal"}`;
    badge.textContent = TYPE_LABELS[safeType];
    cell.append(badge);
    return cell;
  }

  function createMenuCell(menu, label = "") {
    const cell = document.createElement("td");
    const badge = document.createElement("span");
    const safeMenu = isValidMenu(menu) ? menu : "menu1";
    if (label) cell.dataset.label = label;

    badge.className = `badge menu-badge ${safeMenu === "menu2" ? "menu-veggie" : "menu-standard"}`;
    badge.textContent = MENU_LABELS[safeMenu];
    cell.append(badge);
    return cell;
  }

  function createActionCell(id) {
    const cell = document.createElement("td");
    cell.dataset.label = "Aktionen";

    if (!canWriteCurrentList()) {
      const badge = document.createElement("span");
      badge.className = "readonly-action-badge";
      badge.textContent = "Nur Lesen";
      cell.append(badge);
      return cell;
    }

    const wrapper = document.createElement("div");
    const editButton = createActionButton({
      action: "edit",
      id,
      label: "Bearbeiten",
      icon: "edit",
      className: "edit",
    });
    const deleteButton = createActionButton({
      action: "delete",
      id,
      label: "Löschen",
      icon: "trash",
      className: "delete",
    });

    wrapper.className = "action-cell";

    wrapper.append(editButton, deleteButton);
    cell.append(wrapper);
    return cell;
  }

  function createActionButton({ action, id, label, icon, className = "" }) {
    const button = document.createElement("button");

    button.className = `action-btn icon-action ${className}`.trim();
    button.type = "button";
    button.dataset.action = action;
    button.dataset.id = id;
    button.dataset.tooltip = label;
    button.setAttribute("aria-label", label);

    button.append(createActionIcon(icon));
    return button;
  }

  function createActionIcon(name) {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    const paths = name === "trash"
      ? [
          "M5 7h14",
          "M9 7V5h6v2",
          "M7 7l1 13h8l1-13",
          "M10 11v5",
          "M14 11v5",
        ]
      : [
          "M4 20h4.5L19 9.5 14.5 5 4 15.5V20z",
          "M13.5 6 18 10.5",
        ];

    svg.setAttribute("class", "action-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    paths.forEach((pathData) => {
      const path = document.createElementNS(svgNamespace, "path");
      path.setAttribute("d", pathData);
      svg.append(path);
    });

    return svg;
  }

  function updateSelectionUi() {
    syncSelectedTickets();

    const selectedCount = state.selectedTicketIds.size;
    els.selectionBar.hidden = selectedCount === 0;
    els.bulkExportCsvBtn.disabled = selectedCount === 0;
    els.bulkDeleteBtn.disabled = selectedCount === 0 || !canWriteCurrentList();
    els.bulkDeleteBtn.hidden = !canWriteCurrentList();
    els.selectionCount.textContent = selectedCount === 1
      ? "1 Ticket ausgewählt"
      : `${selectedCount} Tickets ausgewählt`;

    updateSelectAllState();
  }

  function updateSelectAllState() {
    const visibleTickets = getFilteredTickets();
    const visibleCount = visibleTickets.length;
    const selectedVisibleCount = visibleTickets.filter((ticket) => state.selectedTicketIds.has(ticket.id)).length;

    els.selectAllTickets.disabled = visibleCount === 0;
    els.selectAllTickets.checked = visibleCount > 0 && selectedVisibleCount === visibleCount;
    els.selectAllTickets.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleCount;
  }

  function syncSelectedTickets() {
    const existingIds = new Set(state.tickets.map((ticket) => ticket.id));
    state.selectedTicketIds.forEach((id) => {
      if (!existingIds.has(id)) {
        state.selectedTicketIds.delete(id);
      }
    });
  }

  function clearSelectedTickets() {
    state.selectedTicketIds.clear();
  }

  function getSelectedTickets() {
    return state.tickets.filter((ticket) => state.selectedTicketIds.has(ticket.id));
  }

  function getExistingSelectedTicketIds() {
    return getSelectedTickets().map((ticket) => ticket.id);
  }

  function formatSelectedTicketCount(count) {
    return count === 1 ? "1 ausgewähltes Ticket" : `${count} ausgewählte Tickets`;
  }

  function formatTicketCount(count) {
    return count === 1 ? "1 Ticket" : `${count} Tickets`;
  }

  function getFilteredTickets() {
    return state.tickets.filter((ticket) => {
      const matchesFilter = state.filter === "all" || ticket.type === state.filter;
      const query = state.search;

      if (!matchesFilter) return false;
      if (!query) return true;

      const searchableText = normalizeSearch([
        ticket.ticketNumber,
        ticket.firstName,
        ticket.lastName,
        ticket.phone,
        TYPE_LABELS[ticket.type],
        MENU_LABELS[isValidMenu(ticket.menu) ? ticket.menu : "menu1"],
      ].join(" "));

      return searchableText.includes(query);
    });
  }

  function updateStats() {
    const sold = state.tickets.length;
    const normal = countByType("normal");
    const vip = countByType("vip");
    const remaining = Math.max(MAX_TICKETS - sold, 0);
    const revenue = calculateTotalRevenue();

    els.soldCount.textContent = String(sold);
    els.normalCount.textContent = String(normal);
    els.vipCount.textContent = String(vip);
    els.remainingCount.textContent = String(remaining);
    els.totalRevenue.textContent = formatCurrency(revenue);
  }

  function countByType(type) {
    return state.tickets.filter((ticket) => ticket.type === type).length;
  }

  function calculateTotalRevenue() {
    return state.tickets.reduce((sum, ticket) => sum + (parseSafeInteger(ticket.price) || 0), 0);
  }

  function updateLimitState() {
    const soldOut = state.tickets.length >= MAX_TICKETS;

    els.limitBadge.textContent = soldOut ? "Ausgebucht" : `${MAX_TICKETS} Plätze`;
    els.saveBtn.disabled = !canWriteCurrentList() || (soldOut && !state.editingId);

    if (!canWriteCurrentList()) {
      showFormError("Nur-Lesen-Modus: Änderungen sind mit diesem Link nicht erlaubt.");
    } else if (soldOut && !state.editingId) {
      showFormError("Maximale Anzahl erreicht.");
    } else if (!state.editingId) {
      showFormError("");
    }
  }

  function updatePriceUi() {
    const type = isValidType(els.ticketType.value) ? els.ticketType.value : "normal";
    const customEnabled = els.customPriceToggle.checked;
    const defaultPrice = PRICES[type] || 0;

    els.ticketType.value = type;
    els.customPriceField.classList.toggle("hidden", !customEnabled);
    els.customPrice.disabled = !customEnabled;
    els.customPrice.placeholder = formatCurrency(defaultPrice);

    if (!customEnabled) {
      els.customPrice.value = String(defaultPrice);
      return;
    }

    const sanitized = sanitizeDigits(els.customPrice.value).slice(0, String(MAX_PRICE).length);
    els.customPrice.value = sanitized || String(defaultPrice);
  }

  function clearForm() {
    state.editingId = null;
    els.form.reset();
    els.editId.value = "";
    els.ticketType.value = "normal";
    els.ticketMenu.value = "menu1";
    els.customPriceToggle.checked = false;
    els.formTitle.textContent = "Ticket hinzufügen";
    els.formModeBadge.textContent = "Neu";
    els.saveBtn.textContent = "Speichern";
    els.cancelEditBtn.classList.add("hidden");
    showFormError("");
    updatePriceUi();
    updateLimitState();
  }

  function exportCsv() {
    exportTicketsAsCsv(state.tickets, {
      filePrefix: "tickets",
      successMessage: "CSV-Datei exportiert.",
      emptyMessage: "Keine Daten für Export.",
    });
  }

  function exportTicketsAsCsv(tickets, { filePrefix, successMessage, emptyMessage }) {
    if (!Array.isArray(tickets) || tickets.length === 0) {
      showToast(emptyMessage || "Keine Daten für Export.", "warning");
      return false;
    }

    const csv = createTicketsCsv(tickets);
    downloadCsv(csv, `${filePrefix || "tickets"}-${new Date().toISOString().slice(0, 10)}.csv`);
    showToast(successMessage || "CSV-Datei exportiert.", "success");
    return true;
  }

  function createTicketsCsv(tickets) {
    const rows = [
      ["Ticketnummer", "Vorname", "Nachname", "Telefonnummer", "Tickettyp", "Menü", "Preis"],
      ...tickets.map((ticket) => [
        ticket.ticketNumber,
        ticket.firstName,
        ticket.lastName,
        ticket.phone,
        TYPE_LABELS[ticket.type] || ticket.type,
        MENU_LABELS[isValidMenu(ticket.menu) ? ticket.menu : "menu1"],
        ticket.price,
      ]),
    ];

    return rows.map((row) => row.map(toCsvCell).join(";")).join("\r\n");
  }

  function downloadCsv(csv, filename) {
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function openCsvImportPicker() {
    if (!guardWriteAccess()) return;

    els.csvImportInput.value = "";
    els.csvImportInput.click();
  }

  async function handleCsvImportChange() {
    const file = els.csvImportInput.files?.[0];
    if (!file) return;

    try {
      await importCsvFile(file);
    } catch {
      showToast("CSV konnte nicht importiert werden.", "danger");
    } finally {
      els.csvImportInput.value = "";
    }
  }

  async function importCsvFile(file) {
    if (!isLikelyCsvFile(file)) {
      showToast("Bitte eine CSV-Datei auswählen.", "warning");
      return;
    }

    if (file.size > MAX_CSV_IMPORT_BYTES) {
      showToast("CSV-Datei ist zu groß.", "warning");
      return;
    }

    const text = await readTextFile(file);
    if (text.length > MAX_CSV_IMPORT_CHARS) {
      showToast("CSV-Datei ist zu groß.", "warning");
      return;
    }

    if (!String(text ?? "").replace(/^\uFEFF/, "").trim()) {
      showToast("CSV-Datei ist leer.", "warning");
      return;
    }

    const result = parseTicketsCsv(text);
    if (result.malformed) {
      showToast("CSV-Datei ist beschädigt.", "warning");
      return;
    }

    if (!result.hasHeader) {
      showToast("CSV-Spalten nicht erkannt.", "warning");
      return;
    }

    if (result.tickets.length === 0) {
      showToast("Keine gültigen Tickets gefunden.", "warning");
      return;
    }

    if (state.tickets.length > 0) {
      const confirmed = await openDialog({
        title: "CSV importieren",
        message: `Aktuelle Tabelle durch ${formatTicketCount(result.tickets.length)} aus der CSV ersetzen?`,
        confirmText: "Importieren",
        cancelText: "Abbrechen",
        showCancel: true,
        variant: "warning",
        preferenceKey: DIALOG_KEYS.CSV_IMPORT,
      });

      if (!confirmed) return;
    }

    if (!replaceTicketsFromImport(result)) return;

    showToast(createCsvImportMessage(result.tickets.length, result.skippedCount), result.skippedCount ? "warning" : "success");
  }

  function isLikelyCsvFile(file) {
    const name = normalizeStoredText(file?.name, 160).toLocaleLowerCase("de-DE");
    const type = normalizeStoredText(file?.type, 80).toLocaleLowerCase("en-US");

    return name.endsWith(".csv") || (Boolean(type) && CSV_FILE_TYPES.has(type));
  }

  function readTextFile(file) {
    if (typeof file.text === "function") {
      return file.text();
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsText(file, "utf-8");
    });
  }

  function replaceTicketsFromImport(result) {
    const previousTickets = state.tickets;
    const previousCounters = { ...state.counters };
    const previousSelectedTicketIds = new Set(state.selectedTicketIds);

    state.tickets = result.tickets;
    state.counters = result.counters;
    clearSelectedTickets();

    if (!saveData({ fullReplace: true })) {
      state.tickets = previousTickets;
      state.counters = previousCounters;
      state.selectedTicketIds = previousSelectedTicketIds;
      renderApp();
      return false;
    }

    clearForm();
    renderApp();
    return true;
  }

  function parseTicketsCsv(text) {
    const source = String(text ?? "").replace(/^\uFEFF/, "");
    const semicolonResult = parseTicketsCsvWithDelimiter(source, ";");
    if (semicolonResult) return semicolonResult;

    const commaResult = parseTicketsCsvWithDelimiter(source, ",");
    if (commaResult) return commaResult;

    return {
      tickets: [],
      counters: { normal: 1, vip: 1 },
      skippedCount: 0,
      hasHeader: false,
      malformed: false,
    };
  }

  function parseTicketsCsvWithDelimiter(source, delimiter) {
    const parsed = parseDelimitedCsv(source, delimiter);
    if (parsed.malformed) {
      return {
        tickets: [],
        counters: { normal: 1, vip: 1 },
        skippedCount: 0,
        hasHeader: false,
        malformed: true,
      };
    }

    const rows = parsed.rows.filter((row) => !isEmptyCsvRow(row));
    if (rows.length === 0) return null;

    const headerIndices = getCsvHeaderIndices(rows[0]);
    if (!headerIndices) return null;

    return buildImportedTickets(rows.slice(1), headerIndices);
  }

  function parseDelimitedCsv(source, delimiter) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];

      if (inQuotes) {
        if (char === '"') {
          if (source[index + 1] === '"') {
            cell += '"';
            index += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cell += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
        continue;
      }

      if (char === delimiter) {
        row.push(cell);
        cell = "";
        continue;
      }

      if (char === "\r" || char === "\n") {
        if (char === "\r" && source[index + 1] === "\n") {
          index += 1;
        }
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        continue;
      }

      cell += char;
    }

    if (cell || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }

    return { rows, malformed: inQuotes };
  }

  function getCsvHeaderIndices(header) {
    const headers = header.map(normalizeCsvHeader);
    const indices = {
      ticketNumber: findCsvHeaderIndex(headers, ["ticketnummer", "ticket number", "ticketnumber", "nummer"]),
      firstName: findCsvHeaderIndex(headers, ["vorname", "first name", "firstname"]),
      lastName: findCsvHeaderIndex(headers, ["nachname", "last name", "lastname"]),
      phone: findCsvHeaderIndex(headers, ["telefonnummer", "telefon", "phone", "phone number"]),
      type: findCsvHeaderIndex(headers, ["tickettyp", "ticket typ", "typ", "type"]),
      menu: findCsvHeaderIndex(headers, ["menü", "menu", "speise", "essen", "meal", "food"]),
      price: findCsvHeaderIndex(headers, ["preis", "price"]),
    };

    const requiredIndices = [
      indices.ticketNumber,
      indices.firstName,
      indices.lastName,
      indices.phone,
      indices.type,
      indices.price,
    ];

    return requiredIndices.some((index) => index < 0) ? null : indices;
  }

  function findCsvHeaderIndex(headers, aliases) {
    const normalizedAliases = aliases.map(normalizeCsvHeader);
    return headers.findIndex((header) => normalizedAliases.includes(header));
  }

  function buildImportedTickets(rows, indices) {
    const usedIds = new Set();
    const usedTicketNumbers = new Set();
    const counters = { normal: 1, vip: 1 };
    const importedAt = new Date().toISOString();
    const tickets = [];
    let skippedCount = 0;

    rows.forEach((row) => {
      if (isEmptyCsvRow(row)) return;

      if (tickets.length >= MAX_TICKETS) {
        skippedCount += 1;
        return;
      }

      const type = parseImportedTicketType(row[indices.type])
        || inferTicketTypeFromNumber(row[indices.ticketNumber])
        || "normal";
      const menu = parseImportedMenu(indices.menu >= 0 ? row[indices.menu] : "") || "menu1";
      const defaultPrice = PRICES[type];
      const rawPrice = parseImportedPrice(row[indices.price]);
      const price = rawPrice > 0 && rawPrice <= MAX_PRICE ? rawPrice : defaultPrice;
      const firstName = normalizeStoredText(unescapeImportedCsvCell(row[indices.firstName]), MAX_NAME_LENGTH);
      const lastName = normalizeStoredText(unescapeImportedCsvCell(row[indices.lastName]), MAX_NAME_LENGTH);
      const phone = sanitizeDigits(row[indices.phone]).slice(0, MAX_PHONE_LENGTH);

      if (!firstName || !lastName || !phone) {
        skippedCount += 1;
        return;
      }

      const ticket = normalizeTicket({
        id: createId(),
        ticketNumber: row[indices.ticketNumber],
        firstName,
        lastName,
        phone,
        type,
        menu,
        price,
        customPrice: price !== defaultPrice,
        createdAt: importedAt,
        updatedAt: importedAt,
      }, usedIds, usedTicketNumbers, counters);

      if (ticket) {
        tickets.push(ticket);
      } else {
        skippedCount += 1;
      }
    });

    return {
      tickets,
      counters: mergeCounters(counters, deriveCountersFromTickets(tickets)),
      skippedCount,
      hasHeader: true,
      malformed: false,
    };
  }

  function isEmptyCsvRow(row) {
    return row.every((cell) => !String(cell ?? "").trim());
  }

  function normalizeCsvHeader(value) {
    return String(value ?? "")
      .replace(/^\uFEFF/, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("de-DE")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseImportedTicketType(value) {
    const text = normalizeStoredText(unescapeImportedCsvCell(value), 20).toLocaleLowerCase("de-DE");
    if (text === "vip") return "vip";
    if (text === "normal" || text === "n") return "normal";
    return "";
  }

  function parseImportedMenu(value) {
    const text = normalizeCsvHeader(unescapeImportedCsvCell(value));
    if (["menu 2", "menue 2", "menü 2", "menu2", "menue2", "menü2", "veggie", "vegetarisch", "vegetarian"].includes(text)) {
      return "menu2";
    }
    if (["menu 1", "menue 1", "menü 1", "menu1", "menue1", "menü1"].includes(text)) {
      return "menu1";
    }
    return "";
  }

  function parseImportedPrice(value) {
    const text = normalizeStoredText(unescapeImportedCsvCell(value), 40);
    if (!text || /^[+\-]/.test(text) || /[=+\-@]/.test(text)) return 0;
    if (!/^\d[\d\s.,$€]*$/.test(text)) return 0;

    return parseSafeInteger(text);
  }

  function inferTicketTypeFromNumber(value) {
    const text = String(value ?? "").trim().toUpperCase();
    if (/^VIP-\d/.test(text)) return "vip";
    if (/^N-\d/.test(text)) return "normal";
    return "";
  }

  function unescapeImportedCsvCell(value) {
    const text = String(value ?? "");
    return /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
  }

  function createCsvImportMessage(importedCount, skippedCount) {
    if (skippedCount > 0) {
      return `${formatTicketCount(importedCount)} importiert, ${skippedCount} Zeilen übersprungen.`;
    }

    return `${formatTicketCount(importedCount)} importiert.`;
  }

  // Verhindert CSV-/Spreadsheet-Formel-Injektion beim Öffnen in Tabellenprogrammen.
  function toCsvCell(value) {
    const text = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ");
    const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  }

  function resetHiddenConfirmations() {
    if (!hasSuppressedDialogs()) {
      showToast("Keine ausgeblendeten Bestätigungsdialoge.", "info");
      return;
    }

    const previousSuppressedConfirmations = { ...state.preferences.suppressedConfirmations };
    state.preferences.suppressedConfirmations = {};

    if (!saveData()) {
      state.preferences.suppressedConfirmations = previousSuppressedConfirmations;
      return;
    }

    showToast("Bestätigungsdialoge zurückgesetzt.", "success");
  }

  async function resetAllData() {
    if (!guardWriteAccess()) return;

    if (state.tickets.length === 0) {
      showToast("Keine Daten vorhanden.", "info");
      return;
    }

    const confirmed = await openDialog({
      title: "Alle Tickets löschen",
      message: "Alle Tickets aus der Liste löschen?",
      confirmText: "Alle Tickets löschen",
      cancelText: "Abbrechen",
      showCancel: true,
      variant: "danger",
      preferenceKey: DIALOG_KEYS.DATA_RESET,
    });

    if (!confirmed) return;

    const previousTickets = state.tickets;
    const previousCounters = { ...state.counters };
    const previousSelectedTicketIds = new Set(state.selectedTicketIds);
    state.tickets = [];
    state.counters = { normal: 1, vip: 1 };
    clearSelectedTickets();

    if (!saveData({ fullReplace: true })) {
      state.tickets = previousTickets;
      state.counters = previousCounters;
      state.selectedTicketIds = previousSelectedTicketIds;
      renderApp();
      return;
    }

    clearForm();
    renderApp();
    showToast("Alle Tickets gelöscht.", "success");
  }

  function openDialog({
    title = "Hinweis",
    message = "",
    confirmText = "OK",
    cancelText = "Abbrechen",
    showCancel = false,
    variant = "info",
    preferenceKey = "",
    inputLabel = "",
    inputValue = "",
    inputPlaceholder = "",
    inputMaxLength = 0,
  } = {}) {
    const canRememberDialog = isKnownDialogKey(preferenceKey);
    if (canRememberDialog && isDialogSuppressed(preferenceKey)) {
      return Promise.resolve(true);
    }

    closeDialog(false, { silent: true });

    const hasInput = Boolean(els.dialogInput && els.dialogInputRow && inputLabel);
    els.dialogTitle.textContent = String(title).slice(0, 80);
    els.dialogMessage.textContent = String(message).slice(0, 220);
    els.dialogConfirmBtn.textContent = String(confirmText).slice(0, 30);
    els.dialogCancelBtn.textContent = String(cancelText).slice(0, 30);
    if (els.dialogInputRow) {
      els.dialogInputRow.hidden = !hasInput;
    }
    if (els.dialogInputLabel) {
      els.dialogInputLabel.textContent = String(inputLabel).slice(0, 40);
    }
    if (els.dialogInput) {
      els.dialogInput.value = hasInput ? String(inputValue).slice(0, MAX_EVENT_NAME_LENGTH) : "";
      els.dialogInput.placeholder = hasInput ? String(inputPlaceholder).slice(0, 40) : "";
      els.dialogInput.maxLength = Math.max(1, parseSafeInteger(inputMaxLength) || MAX_EVENT_NAME_LENGTH);
      els.dialogInput.disabled = !hasInput;
    }
    els.dialogCancelBtn.hidden = !showCancel;
    els.dialogSkipRow.hidden = !canRememberDialog;
    els.dialogSkipCheckbox.checked = false;
    els.dialogSkipCheckbox.disabled = !canRememberDialog;
    els.dialogConfirmBtn.className = variant === "danger"
      ? "btn btn-danger-filled"
      : "btn btn-primary";

    return new Promise((resolve) => {
      state.dialogResolve = resolve;
      state.dialogReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      state.dialogPreferenceKey = canRememberDialog ? preferenceKey : "";
      state.dialogInputEnabled = hasInput;
      els.dialogBackdrop.classList.remove("open");
      els.dialogBackdrop.hidden = false;
      document.body.classList.add("modal-open");
      void els.dialogBackdrop.offsetWidth;

      requestAnimationFrame(() => {
        els.dialogBackdrop.classList.add("open");
        if (hasInput) {
          els.dialogInput.focus();
          els.dialogInput.select();
        } else {
          (showCancel ? els.dialogCancelBtn : els.dialogConfirmBtn).focus();
        }
      });
    });
  }

  function closeDialog(result = false, options = {}) {
    if (!isDialogOpen() && !state.dialogResolve) return;

    const resolver = state.dialogResolve;
    const returnFocus = state.dialogReturnFocus;
    const preferenceKey = state.dialogPreferenceKey;
    const inputEnabled = state.dialogInputEnabled;
    const dialogInputValue = inputEnabled ? (els.dialogInput?.value || "") : "";
    const resolverResult = result && inputEnabled ? dialogInputValue : result;
    const shouldSuppress = Boolean(result && preferenceKey && els.dialogSkipCheckbox.checked);
    state.dialogResolve = null;
    state.dialogReturnFocus = null;
    state.dialogPreferenceKey = "";
    state.dialogInputEnabled = false;
    if (els.dialogInputRow) {
      els.dialogInputRow.hidden = true;
    }
    if (els.dialogInput) {
      els.dialogInput.value = "";
      els.dialogInput.disabled = true;
    }
    els.dialogSkipCheckbox.checked = false;
    els.dialogSkipCheckbox.disabled = true;
    els.dialogBackdrop.classList.remove("open");
    document.body.classList.remove("modal-open");

    window.setTimeout(() => {
      if (!els.dialogBackdrop.classList.contains("open")) {
        els.dialogBackdrop.hidden = true;
      }
    }, 200);

    if (returnFocus && typeof returnFocus.focus === "function") {
      requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
    }

    if (resolver && !options.silent) {
      if (shouldSuppress) {
        suppressDialog(preferenceKey);
      }

      resolver(resolverResult);
    }
  }

  function handleGlobalKeydown(event) {
    if (els.shareDialogBackdrop && !els.shareDialogBackdrop.hidden && els.shareDialogBackdrop.classList.contains("open")) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeShareDialog();
      }
      return;
    }

    if (!isDialogOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog(false);
      return;
    }

    if (event.key === "Enter" && state.dialogInputEnabled && document.activeElement === els.dialogInput) {
      event.preventDefault();
      closeDialog(true);
      return;
    }

    if (event.key === "Tab") {
      trapDialogFocus(event);
    }
  }

  function trapDialogFocus(event) {
    const focusable = Array.from(
      els.dialogCard.querySelectorAll("button:not([hidden]):not(:disabled), input:not(:disabled)"),
    ).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function isDialogOpen() {
    return !els.dialogBackdrop.hidden && els.dialogBackdrop.classList.contains("open");
  }

  function createDefaultPreferences() {
    return {
      suppressedConfirmations: {},
    };
  }

  function isKnownDialogKey(key) {
    return DIALOG_KEY_SET.has(key);
  }

  function isDialogSuppressed(key) {
    return Boolean(isKnownDialogKey(key) && state.preferences.suppressedConfirmations[key]);
  }

  function suppressDialog(key) {
    if (!isKnownDialogKey(key)) return;

    const wasSuppressed = Boolean(state.preferences.suppressedConfirmations[key]);
    state.preferences.suppressedConfirmations[key] = true;

    if (!saveData()) {
      if (wasSuppressed) {
        state.preferences.suppressedConfirmations[key] = true;
      } else {
        delete state.preferences.suppressedConfirmations[key];
      }
    }
  }

  function hasSuppressedDialogs() {
    return Object.keys(state.preferences.suppressedConfirmations).some((key) => (
      isKnownDialogKey(key) && state.preferences.suppressedConfirmations[key]
    ));
  }


  function createDefaultRemoteState() {
    return {
      configured: false,
      app: null,
      auth: null,
      db: null,
      user: null,
      listId: "",
      token: "",
      readToken: "",
      editToken: "",
      shareKey: "",
      role: "local",
      canWrite: true,
      openedFromShareLink: false,
      shareScope: SHARE_SCOPE_EVENT,
      bundleId: "",
      bundleToken: "",
      bundleReadToken: "",
      bundleEditToken: "",
      sharedEventAccess: {},
      unsubscribe: null,
      initPromise: null,
      applyingRemote: false,
      saveTimer: 0,
      saving: false,
      saveQueued: false,
      changeVersion: 0,
      pendingFullReplace: false,
      pendingDeletedTicketIds: new Set(),
      lastToastAt: 0,
      lastShareErrorMessage: "",
      baseUrl: "",
    };
  }

  async function initFirebaseAndMaybeOpenSharedList() {
    state.remote.baseUrl = resolveAppBaseUrl();

    if (isLocalShareEnvironment()) {
      state.remote.configured = false;
      updateAccessUi();
      if (getShareParamsFromUrl()) {
        showToast("Share-Links sind im lokalen Modus deaktiviert. Bitte öffne den Link über die veröffentlichte GitHub-Pages-Seite.", "warning");
      }
      return;
    }

    if (!(await loadFirebaseRuntime())) {
      state.remote.configured = false;
      updateAccessUi();
      if (getShareParamsFromUrl()) {
        showToast("Firebase konnte nicht geladen werden.", "warning");
      }
      return;
    }

    state.remote.baseUrl = resolveAppBaseUrl();

    if (!isFirebaseConfigured()) {
      state.remote.configured = false;
      updateAccessUi();
      if (getShareParamsFromUrl()) {
        showToast("Firebase ist noch nicht konfiguriert.", "warning");
      }
      return;
    }

    try {
      state.remote.app = initializeApp(firebaseConfig);
      state.remote.auth = getAuth(state.remote.app);
      state.remote.db = getDatabase(state.remote.app);
      state.remote.configured = true;
      updateAccessUi();

      const shareParams = getShareParamsFromUrl();
      if (shareParams) {
        await joinSharedListFromUrl(shareParams);
      } else {
        const restoredOwnerList = await restoreOwnedSharedListFromLocalSession();
        if (!restoredOwnerList) {
          updateAccessUi();
        }
      }
    } catch (error) {
      console.error("Firebase-Initialisierung fehlgeschlagen:", error);
      showToast("Firebase konnte nicht gestartet werden.", "danger");
      state.remote.configured = false;
      updateAccessUi();
    }
  }

  async function loadFirebaseRuntime() {
    if (initializeApp && getAuth && getDatabase && dbRef) return true;
    if (isLocalShareEnvironment()) return false;

    if (!firebaseRuntimeLoadPromise) {
      firebaseRuntimeLoadPromise = Promise.all([
        import("./firebase-config.js"),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`),
      ]).then(([configModule, appModule, authModule, databaseModule]) => {
        firebaseConfig = configModule.firebaseConfig || null;
        appConfig = configModule.appConfig || {};
        initializeApp = appModule.initializeApp;
        getAuth = authModule.getAuth;
        signInAnonymously = authModule.signInAnonymously;
        getDatabase = databaseModule.getDatabase;
        dbRef = databaseModule.ref;
        dbSet = databaseModule.set;
        dbUpdate = databaseModule.update;
        dbGet = databaseModule.get;
        onValue = databaseModule.onValue;
        runTransaction = databaseModule.runTransaction;
        return true;
      }).catch((error) => {
        console.error("Firebase-Module konnten nicht geladen werden:", error);
        firebaseRuntimeLoadPromise = null;
        return false;
      });
    }

    return firebaseRuntimeLoadPromise;
  }

  function isLocalFileUrl() {
    return window.location.protocol === "file:";
  }

  function isLocalShareEnvironment() {
    return isLocalDevelopmentUrl();
  }

  function canUseShareFeature() {
    return !isLocalShareEnvironment();
  }

  function isFirebaseConfigured() {
    return Boolean(firebaseConfig && FIREBASE_REQUIRED_CONFIG_KEYS.every((key) => {
      const value = firebaseConfig[key];
      return typeof value === "string" && value.trim().length > 0 && !value.includes("HIER_EINFUEGEN");
    }));
  }

  async function ensureFirebaseReady() {
    if (!state.remote.configured || !state.remote.auth || !state.remote.db) {
      showToast("Firebase-Konfiguration fehlt.", "warning");
      return false;
    }

    if (state.remote.user?.uid) return true;

    try {
      const credential = await signInAnonymously(state.remote.auth);
      state.remote.user = credential.user;
      return Boolean(state.remote.user?.uid);
    } catch (error) {
      console.error("Anonyme Firebase-Anmeldung fehlgeschlagen:", error);
      showToast("Firebase-Anmeldung fehlgeschlagen.", "danger");
      return false;
    }
  }

  async function waitForFirebaseInitialization() {
    if (state.remote.configured || !state.remote.initPromise) return;

    try {
      await state.remote.initPromise;
    } catch {
      // Der konkrete Fehler wird beim eigentlichen Firebase-Zugriff gemeldet.
    }
  }

  function getShareParamsFromUrl() {
    try {
      return getShareParamsFromSearchParams(new URLSearchParams(window.location.hash.replace(/^#/, "")))
        || getShareParamsFromSearchParams(new URLSearchParams(window.location.search));
    } catch {
      return null;
    }
  }

  function getShareParamsFromSearchParams(params) {
    const token = sanitizeShareToken(params.get(SHARE_PARAM_TOKEN), 256);
    const rawRole = String(params.get(SHARE_PARAM_ROLE) || "read").toLowerCase();
    const role = rawRole === "edit" || rawRole === SHARE_ROLE_EDIT ? SHARE_ROLE_EDIT : SHARE_ROLE_READ;
    const rawScope = String(params.get(SHARE_PARAM_SCOPE) || SHARE_SCOPE_EVENT).toLowerCase();
    const scope = rawScope === SHARE_SCOPE_ALL ? SHARE_SCOPE_ALL : SHARE_SCOPE_EVENT;
    const eventName = normalizeEventName(params.get(SHARE_PARAM_EVENT));

    if (scope === SHARE_SCOPE_ALL) {
      const bundleId = sanitizeShareBundleId(params.get(SHARE_PARAM_BUNDLE));
      if (!bundleId || !token) return null;
      return { scope, bundleId, token, role, eventName };
    }

    const listId = sanitizeShareToken(params.get(SHARE_PARAM_LIST), 128);
    if (!listId || !token) return null;
    return { scope, listId, token, role, eventName };
  }

  function getShareKey({ scope = SHARE_SCOPE_EVENT, listId = "", bundleId = "", token, role } = {}) {
    if (scope === SHARE_SCOPE_ALL) {
      return bundleId && token ? `${SHARE_SCOPE_ALL}:${bundleId}:${token}:${role || SHARE_ROLE_READ}` : "";
    }
    return listId && token ? `${SHARE_SCOPE_EVENT}:${listId}:${token}:${role || SHARE_ROLE_READ}` : "";
  }

  async function handleShareHashChange() {
    const shareParams = getShareParamsFromUrl();
    if (!shareParams) {
      if (state.remote.openedFromShareLink) {
        state.remote.openedFromShareLink = false;
        state.remote.shareKey = "";
        updateAccessUi();
      }
      return;
    }

    const shareKey = getShareKey(shareParams);
    if (shareKey && shareKey === state.remote.shareKey) return;
    await joinSharedListFromUrl(shareParams);
  }

  async function joinSharedListFromUrl({ scope = SHARE_SCOPE_EVENT, bundleId = "", listId = "", token, role, eventName = "" }) {
    if (scope === SHARE_SCOPE_ALL) {
      await joinSharedBundleFromUrl({ bundleId, token, role });
      return;
    }

    if (!(await ensureFirebaseReady())) return;
    if (!(await prepareCurrentEventForNavigation())) return;

    const canWrite = role === SHARE_ROLE_EDIT;
    const shareKey = getShareKey({ scope: SHARE_SCOPE_EVENT, listId, token, role });
    const uid = state.remote.user.uid;
    const memberData = createMemberData({ role, canWrite, token, joinedAt: Date.now() });

    try {
      await dbSet(dbRef(state.remote.db, `members/${listId}/${uid}`), memberData);
      const isOwner = await isCurrentUserListOwner(listId, uid);
      const ownerTokens = isOwner ? await loadShareTokensForOwner(listId) : null;
      const readToken = ownerTokens?.readToken || (role === SHARE_ROLE_READ ? token : "");
      const editToken = ownerTokens?.editToken || (role === SHARE_ROLE_EDIT ? token : "");
      resetRemoteListConnection();
      activateEventForRemoteList(listId, eventName, { persist: false, restrictToShare: true });
      state.remote.listId = listId;
      state.remote.token = isOwner ? (editToken || token) : token;
      state.remote.role = isOwner ? SHARE_ROLE_OWNER : role;
      state.remote.canWrite = isOwner || canWrite;
      state.remote.openedFromShareLink = true;
      state.remote.shareScope = SHARE_SCOPE_EVENT;
      state.remote.shareKey = shareKey;
      state.remote.readToken = readToken;
      state.remote.editToken = editToken;
      loadDataForActiveEvent();
      if (isOwner) {
        saveOwnerRemoteSession({ listId, authUid: uid });
      }
      subscribeToSharedList(listId);
      replaceLegacyShareQueryWithHash(listId, token, canWrite ? "edit" : "read", eventName);
      showToast(state.remote.canWrite ? "Editierbarer Share-Link geöffnet." : "Read-only-Share-Link geöffnet.", "success");
      updateAccessUi();
    } catch (error) {
      console.error("Share-Link konnte nicht geöffnet werden:", error);
      showToast("Share-Link ungültig oder ohne Berechtigung.", "danger");
      updateAccessUi();
    }
  }

  async function joinSharedBundleFromUrl({ bundleId, token, role }) {
    if (!(await ensureFirebaseReady())) return;
    if (!(await prepareCurrentEventForNavigation())) return;

    const safeBundleId = sanitizeShareBundleId(bundleId);
    const safeToken = sanitizeShareToken(token, 256);
    const requestedRole = role === SHARE_ROLE_EDIT ? SHARE_ROLE_EDIT : SHARE_ROLE_READ;
    const shareKey = getShareKey({ scope: SHARE_SCOPE_ALL, bundleId: safeBundleId, token: safeToken, role: requestedRole });

    if (!safeBundleId || !safeToken) {
      showToast("Share-Link ungültig.", "danger");
      return;
    }

    try {
      const snapshot = await dbGet(dbRef(state.remote.db, `shareBundles/${safeBundleId}/links/${safeToken}`));
      if (!snapshot.exists()) {
        throw new Error("Bundle-Link nicht gefunden.");
      }

      const bundle = normalizeShareBundleLink(snapshot.val(), requestedRole);
      if (bundle.events.length === 0) {
        throw new Error("Bundle enthält keine Events.");
      }

      const uid = state.remote.user.uid;
      const memberUpdates = {};
      bundle.events.forEach((event) => {
        memberUpdates[`members/${event.listId}/${uid}`] = createMemberData({
          role: bundle.role,
          canWrite: bundle.canWrite,
          token: event.token,
          joinedAt: Date.now(),
        });
      });
      await dbUpdate(dbRef(state.remote.db), memberUpdates);

      resetRemoteListConnection();
      state.events.items = bundle.events.map((event) => ({
        id: event.eventId,
        name: event.name,
        listId: event.listId,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      }));
      state.events.activeId = state.events.items[0]?.id || "";
      renderEventSelector();

      const activeAccess = bundle.accessByEventId[state.events.activeId];
      applySharedBundleRemoteAccess(activeAccess, {
        bundleId: safeBundleId,
        bundleToken: safeToken,
        bundleRole: bundle.role,
        bundleCanWrite: bundle.canWrite,
        shareKey,
        sharedEventAccess: bundle.accessByEventId,
      });
      loadDataForActiveEvent();
      subscribeToSharedList(activeAccess.listId);
      replaceBundleShareQueryWithHash(safeBundleId, safeToken, bundle.canWrite ? "edit" : "read");
      showToast(bundle.canWrite ? "Editierbarer Alle-Events-Share-Link geöffnet." : "Read-only-Alle-Events-Share-Link geöffnet.", "success");
      updateAccessUi();
      renderApp();
    } catch (error) {
      console.error("Alle-Events-Share-Link konnte nicht geöffnet werden:", error);
      showToast("Share-Link ungültig oder ohne Berechtigung.", "danger");
      updateAccessUi();
    }
  }

  function normalizeShareBundleLink(value, requestedRole = SHARE_ROLE_READ) {
    const linkRole = value?.role === SHARE_ROLE_EDIT && value?.canWrite === true
      ? SHARE_ROLE_EDIT
      : SHARE_ROLE_READ;
    const role = requestedRole === SHARE_ROLE_EDIT && linkRole === SHARE_ROLE_EDIT
      ? SHARE_ROLE_EDIT
      : linkRole;
    const canWrite = role === SHARE_ROLE_EDIT;
    const rawEvents = value?.events && typeof value.events === "object" && !Array.isArray(value.events)
      ? Object.entries(value.events)
      : [];
    const seenEventIds = new Set();
    const seenListIds = new Set();
    const createdAt = normalizeTimestamp(value?.createdAt, Date.now());

    const events = rawEvents
      .map(([key, event], index) => {
        const eventId = sanitizeEventId(event?.eventId) || sanitizeEventId(event?.id) || sanitizeEventId(key) || createEventId();
        const listId = sanitizeShareToken(event?.listId, 128);
        const token = sanitizeShareToken(event?.token, 256);
        if (!eventId || !listId || !token || seenEventIds.has(eventId) || seenListIds.has(listId)) return null;
        seenEventIds.add(eventId);
        seenListIds.add(listId);
        return {
          eventId,
          name: normalizeEventName(event?.name) || `Event ${index + 1}`,
          listId,
          token,
          order: Math.max(0, parseSafeInteger(event?.order) || index),
          createdAt,
          updatedAt: normalizeTimestamp(event?.updatedAt, createdAt),
          canWrite,
          role,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.order - right.order)
      .slice(0, MAX_EVENTS);

    const accessByEventId = {};
    events.forEach((event) => {
      accessByEventId[event.eventId] = {
        eventId: event.eventId,
        listId: event.listId,
        token: event.token,
        role,
        canWrite,
      };
    });

    return { role, canWrite, events, accessByEventId };
  }

  function getSharedBundleContext() {
    return {
      bundleId: state.remote.bundleId,
      bundleToken: state.remote.bundleToken,
      bundleRole: state.remote.role === SHARE_ROLE_EDIT ? SHARE_ROLE_EDIT : SHARE_ROLE_READ,
      bundleCanWrite: Boolean(state.remote.canWrite),
      shareKey: state.remote.shareKey,
      sharedEventAccess: { ...(state.remote.sharedEventAccess || {}) },
    };
  }

  function getSharedEventAccess(eventId) {
    const safeEventId = sanitizeEventId(eventId);
    return safeEventId ? state.remote.sharedEventAccess?.[safeEventId] || null : null;
  }

  function applySharedBundleRemoteAccess(access, context) {
    if (!access?.listId || !access?.token) return false;

    state.remote.listId = access.listId;
    state.remote.token = access.token;
    state.remote.readToken = access.canWrite ? "" : access.token;
    state.remote.editToken = access.canWrite ? access.token : "";
    state.remote.role = access.canWrite ? SHARE_ROLE_EDIT : SHARE_ROLE_READ;
    state.remote.canWrite = Boolean(access.canWrite);
    state.remote.openedFromShareLink = true;
    state.remote.shareScope = SHARE_SCOPE_ALL;
    state.remote.bundleId = context.bundleId || state.remote.bundleId;
    state.remote.bundleToken = context.bundleToken || state.remote.bundleToken;
    state.remote.bundleReadToken = context.bundleCanWrite ? "" : (context.bundleToken || state.remote.bundleReadToken);
    state.remote.bundleEditToken = context.bundleCanWrite ? (context.bundleToken || state.remote.bundleEditToken) : "";
    state.remote.shareKey = context.shareKey || state.remote.shareKey;
    state.remote.sharedEventAccess = { ...(context.sharedEventAccess || state.remote.sharedEventAccess || {}) };
    return true;
  }

  async function switchToSharedBundleEvent(eventId, { silent = false } = {}) {
    const targetEvent = findEventById(eventId);
    if (!targetEvent) return false;
    if (targetEvent.id === state.events.activeId) return true;

    const access = getSharedEventAccess(targetEvent.id);
    if (!access) {
      showToast("Dieses Event ist in diesem Share-Link nicht freigegeben.", "warning");
      renderEventSelector();
      return false;
    }

    if (!(await prepareCurrentEventForNavigation())) return false;

    const context = getSharedBundleContext();
    resetRemoteListConnection();
    state.events.activeId = targetEvent.id;
    renderEventSelector();
    applySharedBundleRemoteAccess(access, context);
    loadDataForActiveEvent();
    subscribeToSharedList(access.listId);
    clearForm();
    renderApp();
    updateAccessUi();

    if (!silent) {
      showToast(`${targetEvent.name} geöffnet.`, "success");
    }

    return true;
  }

  async function handleShareButtonClick() {
    if (!canUseShareFeature()) {
      showToast("Teilen ist im lokalen Modus deaktiviert. Share-Links bitte nur über die veröffentlichte GitHub-Pages-Seite erstellen.", "warning");
      updateAccessUi();
      return;
    }

    try {
      await waitForFirebaseInitialization();
      if (!(await ensureFirebaseReady())) {
        openShareDialog({ allowEmpty: true, note: "Firebase konnte nicht gestartet werden. Ohne Firebase kann kein Share-Link erstellt werden." });
        return;
      }

      if (!state.remote.listId) {
        openShareDialog({ allowEmpty: true, note: "Share-Link wird erstellt ..." });
        const created = await createSharedListFromCurrentState();
        if (!created) {
          setShareDialogEmptyState(state.remote.lastShareErrorMessage || "Share-Link konnte nicht erstellt werden. Bitte prüfe die Firebase-Regeln und versuche es erneut.");
          return;
        }
      }

      if (!state.remote.listId) return;
      if (canManageShareLinks() && (!state.remote.readToken || !state.remote.editToken)) {
        const tokens = await loadShareTokensForOwner(state.remote.listId);
        state.remote.readToken = tokens.readToken || state.remote.readToken;
        state.remote.editToken = tokens.editToken || state.remote.editToken;
        state.remote.token = state.remote.editToken || state.remote.token;
      }
      openShareDialog();
    } catch (error) {
      console.error("Teilen-Dialog konnte nicht vorbereitet werden:", error);
      openShareDialog({ allowEmpty: true, note: "Teilen konnte nicht vorbereitet werden. Bitte lade die Seite neu und versuche es noch einmal." });
    }
  }

  async function restoreOwnedSharedListFromLocalSession() {
    const session = loadOwnerRemoteSession();
    const activeEvent = getActiveEvent();
    const cachedListIds = !activeEvent?.listId && state.events.items.length === 1
      ? loadCachedSharedListIds()
      : [];
    if (!activeEvent?.listId && !session && cachedListIds.length === 0) return false;
    if (!(await ensureFirebaseReady())) return false;

    const uid = state.remote.user?.uid || "";

    if (activeEvent?.listId && await connectOwnedSharedList(activeEvent.listId, uid)) {
      return true;
    }

    if (session && session.authUid !== uid) {
      clearOwnerRemoteSession();
    }

    if (!activeEvent?.listId && session?.authUid === uid && await connectOwnedSharedList(session.listId, uid)) {
      linkActiveEventToRemoteList(session.listId);
      return true;
    }

    if (!activeEvent?.listId && state.events.items.length === 1) {
      for (const listId of cachedListIds) {
        if (listId === session?.listId) continue;
        if (await connectOwnedSharedList(listId, uid)) {
          linkActiveEventToRemoteList(listId);
          return true;
        }
      }
    }

    if (session) {
      clearOwnerRemoteSession();
    }
    return false;
  }

  async function connectOwnedSharedList(listId, uid) {
    if (!(await isCurrentUserListOwner(listId, uid))) return false;

    const tokens = await loadShareTokensForOwner(listId);
    state.remote.listId = listId;
    state.remote.token = tokens.editToken || "";
    state.remote.readToken = tokens.readToken || "";
    state.remote.editToken = tokens.editToken || "";
    state.remote.shareKey = "";
    state.remote.role = SHARE_ROLE_OWNER;
    state.remote.canWrite = true;
    state.remote.openedFromShareLink = false;
    linkActiveEventToRemoteList(listId);
    saveOwnerRemoteSession({ listId, authUid: uid });
    subscribeToSharedList(listId);
    updateAccessUi();
    return true;
  }

  function loadCachedSharedListIds() {
    const listIds = [];
    const seen = new Set();

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index) || "";
        if (!key.startsWith(SHARED_STORAGE_PREFIX)) continue;

        const listId = sanitizeShareToken(key.slice(SHARED_STORAGE_PREFIX.length), 128);
        if (listId && !seen.has(listId)) {
          seen.add(listId);
          listIds.push(listId);
        }
      }
    } catch {
      // Storage-Zugriff ist optional; ohne Cache gibt es einfach nichts zu migrieren.
    }

    return listIds;
  }

  function hasAnyEventDataSnapshot() {
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        if ((localStorage.key(index) || "").startsWith(EVENT_DATA_PREFIX)) {
          return true;
        }
      }
    } catch {
      return false;
    }

    return false;
  }

  function createShareTokenBundle(createdAt = Date.now()) {
    const readToken = createShareId("ro", SHARE_TOKEN_LENGTH);
    const editToken = createShareId("ed", SHARE_TOKEN_LENGTH);
    return {
      readToken,
      editToken,
      tokensData: {
        [readToken]: { role: SHARE_ROLE_READ, canWrite: false, createdAt },
        [editToken]: { role: SHARE_ROLE_EDIT, canWrite: true, createdAt },
      },
    };
  }

  async function isCurrentUserListOwner(listId, uid) {
    try {
      const snapshot = await dbGet(dbRef(state.remote.db, `lists/${listId}/meta/ownerUid`));
      return snapshot.exists() && snapshot.val() === uid;
    } catch {
      return false;
    }
  }

  async function loadShareTokensForOwner(listId) {
    const tokens = { readToken: "", editToken: "" };

    try {
      const snapshot = await dbGet(dbRef(state.remote.db, `tokens/${listId}`));
      const value = snapshot.exists() ? snapshot.val() : null;
      if (!value || typeof value !== "object") return tokens;

      Object.entries(value).forEach(([token, data]) => {
        const safeToken = sanitizeShareToken(token, 256);
        if (!safeToken || !data || typeof data !== "object") return;

        if (data.role === SHARE_ROLE_READ && data.canWrite === false) {
          tokens.readToken = safeToken;
        }
        if (data.role === SHARE_ROLE_EDIT && data.canWrite === true) {
          tokens.editToken = safeToken;
        }
      });
    } catch (error) {
      console.error("Share-Tokens konnten nicht geladen werden:", error);
    }

    return tokens;
  }

  function createMemberData({ role, canWrite, token, joinedAt = Date.now() }) {
    return {
      role,
      canWrite: Boolean(canWrite),
      token,
      joinedAt,
    };
  }

  function createOwnerMemberData(token, joinedAt = Date.now()) {
    return createMemberData({
      role: SHARE_ROLE_OWNER,
      canWrite: true,
      token,
      joinedAt,
    });
  }

  async function createSharedListFromCurrentState() {
    const uid = state.remote.user?.uid;
    if (!uid) return false;

    state.remote.lastShareErrorMessage = "";
    const listId = createShareId("lst", SHARE_LIST_ID_LENGTH);
    const now = Date.now();
    const { readToken, editToken, tokensData } = createShareTokenBundle(now);
    const initialState = createPersistedData();

    const listData = {
      meta: {
        ownerUid: uid,
        appVersion: APP_VERSION,
        createdAt: now,
        updatedAt: now,
        revision: now,
      },
      state: initialState,
    };

    try {
      await dbSet(dbRef(state.remote.db, `lists/${listId}`), listData);
      await dbUpdate(dbRef(state.remote.db, `tokens/${listId}`), tokensData);
      await dbSet(dbRef(state.remote.db, `members/${listId}/${uid}`), createOwnerMemberData(editToken, now));

      state.remote.listId = listId;
      state.remote.readToken = readToken;
      state.remote.editToken = editToken;
      state.remote.token = editToken;
      state.remote.shareKey = "";
      state.remote.bundleId = "";
      state.remote.bundleToken = "";
      state.remote.bundleReadToken = "";
      state.remote.bundleEditToken = "";
      state.remote.sharedEventAccess = {};
      state.remote.role = SHARE_ROLE_OWNER;
      state.remote.canWrite = true;
      state.remote.openedFromShareLink = false;
      linkActiveEventToRemoteList(listId);
      saveSharedData(listId, initialState);
      saveOwnerRemoteSession({ listId, authUid: uid });
      subscribeToSharedList(listId);
      showToast("Geteilte Ticketliste erstellt.", "success");
      updateAccessUi();
      return true;
    } catch (error) {
      console.error("Share-Liste konnte nicht erstellt werden:", error);
      state.remote.lastShareErrorMessage = formatFirebaseErrorMessage(error, "Share-Link konnte nicht erstellt werden.");
      showToast(state.remote.lastShareErrorMessage, "danger");
      return false;
    }
  }

  async function ensureAllEventsShareBundleForDialog({ force = false } = {}) {
    if (!canCreateAllEventsShare()) {
      showToast("Alle-Events-Links können nur lokal oder als Besitzer erstellt werden.", "warning");
      return false;
    }

    if (!force && state.remote.bundleId && state.remote.bundleReadToken && state.remote.bundleEditToken) {
      return true;
    }

    if (ensureAllEventsShareBundleForDialog.promise) {
      return ensureAllEventsShareBundleForDialog.promise;
    }

    ensureAllEventsShareBundleForDialog.promise = createShareBundleForAllEvents()
      .finally(() => {
        ensureAllEventsShareBundleForDialog.promise = null;
      });

    return ensureAllEventsShareBundleForDialog.promise;
  }

  async function createShareBundleForAllEvents() {
    const uid = state.remote.user?.uid || "";
    if (!uid) return false;
    if (!(await prepareCurrentEventForNavigation())) return false;

    const events = state.events.items.slice(0, MAX_EVENTS);
    if (events.length === 0) {
      showToast("Keine Events zum Teilen vorhanden.", "warning");
      return false;
    }

    const remoteEvents = [];
    for (const [index, event] of events.entries()) {
      const remoteEvent = await ensureRemoteListForEvent(event, uid, index);
      if (!remoteEvent) {
        showToast(`Event "${event.name}" konnte nicht für den Alle-Events-Link vorbereitet werden.`, "danger");
        return false;
      }
      remoteEvents.push(remoteEvent);
    }

    const now = Date.now();
    const bundleId = createShareId("bun", SHARE_BUNDLE_ID_LENGTH);
    const readBundleToken = createShareId("br", SHARE_TOKEN_LENGTH);
    const editBundleToken = createShareId("be", SHARE_TOKEN_LENGTH);
    const readEvents = {};
    const editEvents = {};

    remoteEvents.forEach((remoteEvent, index) => {
      const base = {
        eventId: remoteEvent.event.id,
        name: normalizeEventName(remoteEvent.event.name) || `Event ${index + 1}`,
        listId: remoteEvent.listId,
        order: index,
        updatedAt: normalizeTimestamp(remoteEvent.event.updatedAt, now),
      };
      readEvents[remoteEvent.event.id] = { ...base, token: remoteEvent.readToken };
      editEvents[remoteEvent.event.id] = { ...base, token: remoteEvent.editToken };
    });

    const bundleData = {
      meta: {
        ownerUid: uid,
        appVersion: APP_VERSION,
        createdAt: now,
        updatedAt: now,
      },
      links: {
        [readBundleToken]: {
          role: SHARE_ROLE_READ,
          canWrite: false,
          createdAt: now,
          appVersion: APP_VERSION,
          events: readEvents,
        },
        [editBundleToken]: {
          role: SHARE_ROLE_EDIT,
          canWrite: true,
          createdAt: now,
          appVersion: APP_VERSION,
          events: editEvents,
        },
      },
    };

    try {
      await dbSet(dbRef(state.remote.db, `shareBundles/${bundleId}`), bundleData);
      state.remote.bundleId = bundleId;
      state.remote.bundleReadToken = readBundleToken;
      state.remote.bundleEditToken = editBundleToken;
      state.remote.bundleToken = editBundleToken;
      saveEventRegistry();
      showToast("Alle-Events-Share-Link vorbereitet.", "success");
      return true;
    } catch (error) {
      console.error("Alle-Events-Share-Link konnte nicht erstellt werden:", error);
      showToast(formatFirebaseErrorMessage(error, "Alle-Events-Share-Link konnte nicht erstellt werden."), "danger");
      return false;
    }
  }

  async function ensureRemoteListForEvent(event, uid, index = 0) {
    const safeUid = sanitizeAuthUid(uid);
    if (!event || !safeUid) return null;

    const data = getPersistedDataForEvent(event);
    const existingListId = sanitizeShareToken(event.listId, 128);

    if (existingListId && await isCurrentUserListOwner(existingListId, safeUid)) {
      const tokens = await ensureShareTokensForOwnedList(existingListId, safeUid);
      if (!tokens.readToken || !tokens.editToken) return null;
      await writePersistedDataToRemoteList(existingListId, data);
      saveEventDataSnapshot(event, data, existingListId);
      return {
        event,
        listId: existingListId,
        readToken: tokens.readToken,
        editToken: tokens.editToken,
        order: index,
      };
    }

    return createRemoteListForEvent(event, data, safeUid, index);
  }

  async function ensureShareTokensForOwnedList(listId, uid) {
    const tokens = await loadShareTokensForOwner(listId);
    if (tokens.readToken && tokens.editToken) return tokens;

    const now = Date.now();
    const bundle = createShareTokenBundle(now);
    await dbUpdate(dbRef(state.remote.db), {
      [`tokens/${listId}`]: bundle.tokensData,
      [`members/${listId}/${uid}`]: createOwnerMemberData(bundle.editToken, now),
      [`lists/${listId}/meta/updatedAt`]: now,
      [`lists/${listId}/meta/revision`]: now,
      [`lists/${listId}/meta/appVersion`]: APP_VERSION,
    });

    return { readToken: bundle.readToken, editToken: bundle.editToken };
  }

  async function createRemoteListForEvent(event, data, uid, index = 0) {
    const listId = createShareId("lst", SHARE_LIST_ID_LENGTH);
    const now = Date.now();
    const { readToken, editToken, tokensData } = createShareTokenBundle(now);
    const safeData = normalizePersistedData(data);
    const listData = {
      meta: {
        ownerUid: uid,
        appVersion: APP_VERSION,
        createdAt: now,
        updatedAt: now,
        revision: now,
      },
      state: safeData,
    };

    await dbSet(dbRef(state.remote.db, `lists/${listId}`), listData);
    await dbUpdate(dbRef(state.remote.db, `tokens/${listId}`), tokensData);
    await dbSet(dbRef(state.remote.db, `members/${listId}/${uid}`), createOwnerMemberData(editToken, now));

    event.listId = listId;
    event.updatedAt = now;
    saveEventDataSnapshot(event, safeData, listId);

    return { event, listId, readToken, editToken, order: index };
  }

  async function writePersistedDataToRemoteList(listId, data) {
    const safeListId = sanitizeShareToken(listId, 128);
    if (!safeListId) return false;

    const now = Date.now();
    await dbSet(dbRef(state.remote.db, `lists/${safeListId}/state`), normalizePersistedData(data));
    await dbUpdate(dbRef(state.remote.db, `lists/${safeListId}/meta`), {
      updatedAt: now,
      revision: now,
      appVersion: APP_VERSION,
    });
    return true;
  }

  function getPersistedDataForEvent(event) {
    if (event?.id === state.events.activeId) {
      return normalizePersistedData(createPersistedData());
    }

    const eventId = sanitizeEventId(event?.id);
    const listId = sanitizeShareToken(event?.listId, 128);
    const rawEventData = eventId ? safeStorageGet(localStorage, `${EVENT_DATA_PREFIX}${eventId}`) : "";
    const rawSharedData = listId ? safeStorageGet(localStorage, `${SHARED_STORAGE_PREFIX}${listId}`) : "";

    for (const raw of [rawEventData, rawSharedData]) {
      if (!raw) continue;
      try {
        return normalizePersistedData(JSON.parse(raw));
      } catch {
        // Nächsten Snapshot probieren.
      }
    }

    return normalizePersistedData(null);
  }

  function saveEventDataSnapshot(event, data, listId = event?.listId || "") {
    const eventId = sanitizeEventId(event?.id);
    const safeListId = sanitizeShareToken(listId, 128);
    const payload = JSON.stringify(normalizePersistedData(data));

    if (eventId) {
      safeStorageSet(localStorage, `${EVENT_DATA_PREFIX}${eventId}`, payload);
    }
    if (safeListId) {
      safeStorageSet(localStorage, `${SHARED_STORAGE_PREFIX}${safeListId}`, payload);
    }
  }

  function subscribeToSharedList(listId) {
    if (typeof state.remote.unsubscribe === "function") {
      state.remote.unsubscribe();
    }

    state.remote.unsubscribe = onValue(dbRef(state.remote.db, `lists/${listId}/state`), (snapshot) => {
      if (!snapshot.exists()) {
        showRemoteToast("Geteilte Ticketliste nicht gefunden.", "warning");
        return;
      }

      if (hasPendingRemoteSave()) {
        return;
      }

      applyRemotePersistedData(snapshot.val(), listId);
    }, (error) => {
      console.error("Firebase-Synchronisierung fehlgeschlagen:", error);
      showToast("Firebase-Synchronisierung fehlgeschlagen.", "danger");
    });
  }

  function markRemoteStateDirty({ fullReplace = false, deletedTicketIds = [] } = {}) {
    if (fullReplace) {
      state.remote.pendingFullReplace = true;
      state.remote.pendingDeletedTicketIds.clear();
    } else {
      Array.from(deletedTicketIds).forEach((id) => {
        const safeId = String(id ?? "").trim();
        if (SAFE_ID_PATTERN.test(safeId)) {
          state.remote.pendingDeletedTicketIds.add(safeId);
        }
      });
    }

    state.remote.changeVersion += 1;
    scheduleRemoteSave();
  }

  function hasPendingRemoteSave() {
    return Boolean(
      state.remote.saving
      || state.remote.saveTimer
      || state.remote.saveQueued
      || state.remote.pendingFullReplace
      || state.remote.pendingDeletedTicketIds.size > 0
    );
  }

  function scheduleRemoteSave(delay = REMOTE_SAVE_DEBOUNCE_MS) {
    window.clearTimeout(state.remote.saveTimer);
    state.remote.saveTimer = window.setTimeout(() => {
      state.remote.saveTimer = 0;
      void writeRemoteStateNow();
    }, delay);
  }

  async function writeRemoteStateNow() {
    if (!canWriteRemoteList()) return;

    if (state.remote.saving) {
      state.remote.saveQueued = true;
      return;
    }

    state.remote.saving = true;
    state.remote.saveQueued = false;

    const listId = state.remote.listId;
    const payload = createPersistedData();
    const startedChangeVersion = state.remote.changeVersion;
    const forceReplace = Boolean(state.remote.pendingFullReplace);
    const deletedTicketIds = new Set(state.remote.pendingDeletedTicketIds);
    const now = Date.now();

    try {
      const transactionResult = await runTransaction(
        dbRef(state.remote.db, `lists/${listId}/state`),
        (remoteValue) => {
          if (forceReplace || !remoteValue || typeof remoteValue !== "object") {
            return payload;
          }

          return mergePersistedDataForRemoteTransaction(remoteValue, payload, deletedTicketIds);
        },
        { applyLocally: false },
      );

      if (!transactionResult.committed) {
        throw new Error("Remote-Transaktion wurde nicht übernommen.");
      }

      deletedTicketIds.forEach((id) => state.remote.pendingDeletedTicketIds.delete(id));
      if (forceReplace && state.remote.changeVersion === startedChangeVersion) {
        state.remote.pendingFullReplace = false;
      }

      await dbUpdate(dbRef(state.remote.db, `lists/${listId}/meta`), {
        updatedAt: now,
        revision: now,
        appVersion: APP_VERSION,
      });

      if (state.remote.changeVersion === startedChangeVersion) {
        state.remote.saveQueued = false;
      } else {
        state.remote.saveQueued = true;
      }

      if (transactionResult.snapshot.exists() && state.remote.listId === listId && !state.remote.saveQueued) {
        applyRemotePersistedData(transactionResult.snapshot.val(), listId);
      }
    } catch (error) {
      console.error("Remote-Speichern fehlgeschlagen:", error);
      state.remote.saveQueued = true;
      showRemoteToast("Remote-Speichern fehlgeschlagen. Erneuter Versuch läuft automatisch.", "danger");
    } finally {
      state.remote.saving = false;

      if (state.remote.saveQueued || state.remote.pendingFullReplace || state.remote.pendingDeletedTicketIds.size > 0) {
        scheduleRemoteSave(state.remote.saveQueued ? REMOTE_SAVE_RETRY_MS : REMOTE_SAVE_DEBOUNCE_MS);
      }
    }
  }

  function applyRemotePersistedData(data, listId = state.remote.listId) {
    state.remote.applyingRemote = true;
    try {
      applyPersistedData(data);
      saveSharedData(listId);
      clearSelectedTickets();
      if (state.editingId && !state.tickets.some((ticket) => ticket.id === state.editingId)) {
        clearForm();
      }
      renderApp();
    } catch (error) {
      console.error("Remote-Daten konnten nicht verarbeitet werden:", error);
      showRemoteToast("Remote-Daten konnten nicht verarbeitet werden.", "danger");
    } finally {
      state.remote.applyingRemote = false;
    }
  }

  function canWriteRemoteList() {
    return Boolean(state.remote.configured && state.remote.db && state.remote.listId && state.remote.canWrite);
  }

  function canWriteCurrentList() {
    return !state.remote.listId || Boolean(state.remote.canWrite);
  }

  function guardWriteAccess() {
    if (canWriteCurrentList()) return true;
    showToast("Dieser Share-Link ist nur zum Lesen freigegeben.", "warning");
    return false;
  }

  function canManageCurrentEvents() {
    if (!state.remote.listId) return true;
    return state.remote.role === SHARE_ROLE_OWNER && !state.remote.openedFromShareLink;
  }

  function guardEventManagementAccess() {
    if (canManageCurrentEvents()) return true;
    showToast("Event-Verwaltung ist mit diesem Share-Link nicht erlaubt.", "warning");
    return false;
  }

  function canCreateAllEventsShare() {
    return Boolean(state.remote.configured && state.remote.db && canManageCurrentEvents());
  }

  function canPersistEventRegistry() {
    return !state.remote.openedFromShareLink || state.remote.role === SHARE_ROLE_OWNER;
  }

  function updateAccessUi() {
    const shared = Boolean(state.remote.listId);
    const readOnly = shared && !state.remote.canWrite;
    const shareLinkMode = Boolean(state.remote.openedFromShareLink && state.remote.listId);

    document.body.classList.toggle("shared-mode", shared);
    document.body.classList.toggle("read-only-mode", readOnly);
    document.body.classList.toggle("share-link-mode", shareLinkMode);
    document.body.classList.toggle("local-share-disabled", !canUseShareFeature());

    updateShareButtonAvailability();

    const formControls = els.form?.querySelectorAll("input, select, button") || [];
    formControls.forEach((control) => {
      control.disabled = readOnly || control.disabled && control.id === "customPrice" && !els.customPriceToggle.checked;
    });

    if (!readOnly) {
      updatePriceUi();
    }

    if (els.importCsvBtn) els.importCsvBtn.disabled = readOnly;
    if (els.resetBtn) els.resetBtn.disabled = readOnly;
    if (els.bulkDeleteBtn) {
      els.bulkDeleteBtn.disabled = readOnly || state.selectedTicketIds.size === 0;
      els.bulkDeleteBtn.hidden = readOnly;
    }
    const canManageEvents = canManageCurrentEvents();
    [els.newEventBtn, els.renameEventBtn, els.deleteEventBtn].forEach((button) => {
      if (!button) return;
      button.disabled = !canManageEvents;
      button.hidden = !canManageEvents;
    });

    if (els.shareRotateBtn) {
      const canManage = canManageShareLinks();
      els.shareRotateBtn.disabled = !canManage;
      els.shareRotateBtn.hidden = !canManage;
    }

    if (els.shareAllEventsToggle) {
      const canShareAll = canCreateAllEventsShare();
      els.shareAllEventsToggle.disabled = !canShareAll;
      if (!canShareAll) {
        els.shareAllEventsToggle.checked = false;
      }
    }

    if (els.shareStatus) {
      const statusText = getShareStatusText();
      els.shareStatus.textContent = statusText;
      els.shareStatus.hidden = !statusText;
    }
  }

  function updateShareButtonAvailability() {
    if (!els.shareBtn) return;

    const disabledLocally = !canUseShareFeature();
    els.shareBtn.disabled = disabledLocally;
    els.shareBtn.setAttribute("aria-disabled", disabledLocally ? "true" : "false");

    if (disabledLocally) {
      els.shareBtn.dataset.tooltip = "Teilen lokal deaktiviert";
      els.shareBtn.title = "Share-Links können nur über die veröffentlichte GitHub-Pages-Seite erstellt werden.";
    } else {
      els.shareBtn.dataset.tooltip = "Ticketliste teilen";
      els.shareBtn.removeAttribute("title");
    }
  }

  function getShareStatusText() {
    if (!state.remote.openedFromShareLink || !state.remote.listId) return "";
    if (state.remote.role === SHARE_ROLE_OWNER) {
      return "Geteilte Liste: Besitzerzugriff";
    }
    if (state.remote.canWrite) return "Geteilte Liste: Bearbeiten erlaubt";
    return "Geteilte Liste: Nur ansehen";
  }

  function canManageShareLinks() {
    return Boolean(state.remote.configured && state.remote.db && state.remote.listId && state.remote.role === SHARE_ROLE_OWNER);
  }

  function openShareDialog({ allowEmpty = false, note = "" } = {}) {
    if (!canUseShareFeature()) {
      showToast("Teilen ist im lokalen Modus deaktiviert.", "warning");
      return;
    }

    if (!els.shareDialogBackdrop) {
      showToast("Teilen-Dialog konnte nicht geöffnet werden. Bitte lade die Seite neu.", "danger");
      return;
    }

    const canManage = canManageShareLinks();
    const hasReadToken = Boolean(state.remote.readToken);
    const hasEditToken = Boolean(state.remote.editToken) && state.remote.canWrite;
    const hasAnyToken = hasReadToken || hasEditToken;

    if (!allowEmpty && !canManage && !state.remote.canWrite && !state.remote.readToken) {
      showToast("Dieser Link kann nicht weiter freigegeben werden.", "warning");
      return;
    }
    if (!allowEmpty && !hasAnyToken && !canManage) {
      showToast("Share-Links konnten nicht geladen werden.", "warning");
      return;
    }

    if (els.shareModeRead) {
      els.shareModeRead.disabled = !hasAnyToken || (!hasReadToken && hasEditToken);
      els.shareModeRead.checked = hasReadToken || !hasEditToken;
    }
    if (els.shareModeEdit) {
      els.shareModeEdit.checked = !hasReadToken && hasEditToken;
      els.shareModeEdit.disabled = !hasAnyToken || !hasEditToken;
    }
    if (els.shareAllEventsToggle) {
      const canShareAll = canCreateAllEventsShare();
      els.shareAllEventsToggle.disabled = !canShareAll;
      els.shareAllEventsToggle.checked = false;
    }
    if (els.shareLinkInput) {
      els.shareLinkInput.disabled = !hasAnyToken;
      els.shareLinkInput.placeholder = hasAnyToken ? "" : "Keine Links geladen";
    }
    if (els.shareCopyBtn) {
      els.shareCopyBtn.disabled = !hasAnyToken;
    }
    if (els.shareRotateBtn) {
      els.shareRotateBtn.disabled = !canManage;
      els.shareRotateBtn.hidden = !canManage;
    }
    if (hasAnyToken) {
      updateShareDialogLink();
    } else {
      setShareDialogEmptyState(note || (canManage
        ? "Die bestehenden Share-Links konnten nicht geladen werden. Über Links erneuern erstellst du neue Links; alte Links werden dabei ungültig."
        : "Für diesen Zugriff ist kein teilbarer Link verfügbar."));
    }

    els.shareDialogBackdrop.classList.remove("open");
    els.shareDialogBackdrop.hidden = false;
    document.body.classList.add("modal-open");
    void els.shareDialogBackdrop.offsetWidth;

    requestAnimationFrame(() => {
      els.shareDialogBackdrop.classList.add("open");
      els.shareDialogCard?.focus({ preventScroll: true });
    });
  }

  function closeShareDialog() {
    if (!els.shareDialogBackdrop) return;
    els.shareDialogBackdrop.classList.remove("open");
    window.setTimeout(() => {
      els.shareDialogBackdrop.hidden = true;
      if (!els.dialogBackdrop || els.dialogBackdrop.hidden) {
        document.body.classList.remove("modal-open");
      }
    }, 200);
  }

  function handleShareDialogOptionChange(event) {
    const wantsAllEvents = Boolean(els.shareAllEventsToggle?.checked);
    const forceRefreshBundle = event?.target === els.shareAllEventsToggle && wantsAllEvents;

    if (!wantsAllEvents) {
      updateShareDialogLink();
      return;
    }

    if (!canCreateAllEventsShare()) {
      if (els.shareAllEventsToggle) els.shareAllEventsToggle.checked = false;
      showToast("Alle-Events-Links können nur lokal oder als Besitzer erstellt werden.", "warning");
      updateShareDialogLink();
      return;
    }

    if (!state.remote.bundleId || !state.remote.bundleReadToken || !state.remote.bundleEditToken || forceRefreshBundle) {
      setShareDialogEmptyState("Alle vorhandenen Events werden für den Share-Link vorbereitet ...");
      void ensureAllEventsShareBundleForDialog({ force: forceRefreshBundle }).then((success) => {
        if (!success && els.shareAllEventsToggle) {
          els.shareAllEventsToggle.checked = false;
        }
        updateShareDialogLink();
      });
      return;
    }

    updateShareDialogLink();
  }

  function updateShareDialogLink() {
    if (!els.shareLinkInput) return;

    const useAllEvents = Boolean(els.shareAllEventsToggle?.checked && canCreateAllEventsShare());
    const hasSingleToken = Boolean(state.remote.readToken || state.remote.editToken);
    const hasBundleToken = Boolean(state.remote.bundleId && state.remote.bundleReadToken && state.remote.bundleEditToken);

    if (useAllEvents && !hasBundleToken) {
      setShareDialogEmptyState("Alle vorhandenen Events werden für den Share-Link vorbereitet ...");
      return;
    }

    if (!useAllEvents && !hasSingleToken) {
      setShareDialogEmptyState(canManageShareLinks()
        ? "Die bestehenden Share-Links konnten nicht geladen werden. Über Links erneuern erstellst du neue Links; alte Links werden dabei ungültig."
        : "Für diesen Zugriff ist kein teilbarer Link verfügbar.");
      return;
    }

    let mode = els.shareModeEdit?.checked ? "edit" : "read";
    if (mode === "read" && !useAllEvents && !state.remote.readToken && state.remote.editToken) {
      mode = "edit";
      if (els.shareModeEdit) els.shareModeEdit.checked = true;
      if (els.shareModeRead) els.shareModeRead.checked = false;
    }

    const token = useAllEvents
      ? (mode === "edit" ? state.remote.bundleEditToken : state.remote.bundleReadToken)
      : (mode === "edit" ? state.remote.editToken : (state.remote.readToken || state.remote.token));
    const link = createShareLink(state.remote.listId, token, mode, {
      scope: useAllEvents ? SHARE_SCOPE_ALL : SHARE_SCOPE_EVENT,
      bundleId: state.remote.bundleId,
    });

    els.shareLinkInput.value = link;
    els.shareLinkInput.disabled = false;
    if (els.shareCopyBtn) {
      els.shareCopyBtn.disabled = !link;
    }

    if (els.shareDialogNote) {
      const scopeText = useAllEvents
        ? "Dieser Link enthält alle aktuell vorhandenen Events aus dem Dropdown."
        : "Dieser Link enthält nur das aktuell aktive Event.";
      const permissionText = mode === "edit"
        ? "Editierbare Links erlauben Ticketänderungen innerhalb der freigegebenen Events, aber keine Event-Verwaltung."
        : "Read-only-Links erlauben Ansehen und CSV-Export, aber keine Änderungen.";
      els.shareDialogNote.textContent = `${scopeText} ${permissionText}`;
    }
  }

  function setShareDialogEmptyState(note) {
    if (els.shareLinkInput) {
      els.shareLinkInput.value = "";
      els.shareLinkInput.disabled = true;
      els.shareLinkInput.placeholder = "Kein Share-Link verfügbar";
    }
    if (els.shareCopyBtn) {
      els.shareCopyBtn.disabled = true;
    }
    if (els.shareDialogNote) {
      els.shareDialogNote.textContent = note;
    }
  }

  function formatFirebaseErrorMessage(error, fallback) {
    const code = String(error?.code || "").trim();
    const message = String(error?.message || "").trim();
    const normalizedCode = code.toLowerCase();

    if (normalizedCode === "permission_denied" || normalizedCode === "permission-denied") {
      return `${fallback} Firebase meldet: Zugriff durch Regeln verweigert.`;
    }
    if (normalizedCode.includes("network")) {
      return `${fallback} Firebase ist gerade nicht erreichbar.`;
    }
    if (code) {
      return `${fallback} Firebase-Code: ${code}.`;
    }
    if (message) {
      return `${fallback} ${message.slice(0, 180)}`;
    }
    return fallback;
  }

  async function rotateShareLinks() {
    if (!canManageShareLinks()) {
      showToast("Nur der Besitzer kann Share-Links erneuern.", "warning");
      return;
    }

    const confirmed = await openDialog({
      title: "Share-Links erneuern",
      message: "Alle bisherigen Share-Links ungültig machen und neue Links erzeugen?",
      confirmText: "Erneuern",
      cancelText: "Abbrechen",
      showCancel: true,
      variant: "warning",
    });

    if (!confirmed) return;

    const uid = state.remote.user?.uid;
    const listId = state.remote.listId;
    const previousBundleId = state.remote.bundleId;
    if (!uid || !listId) return;

    const now = Date.now();
    const { readToken, editToken, tokensData } = createShareTokenBundle(now);
    const updates = {
      [`tokens/${listId}`]: tokensData,
      [`members/${listId}/${uid}`]: createOwnerMemberData(editToken, now),
      [`lists/${listId}/meta/updatedAt`]: now,
      [`lists/${listId}/meta/revision`]: now,
      [`lists/${listId}/meta/appVersion`]: APP_VERSION,
    };

    try {
      await dbUpdate(dbRef(state.remote.db), updates);
      if (previousBundleId) {
        try {
          await dbSet(dbRef(state.remote.db, `shareBundles/${previousBundleId}`), null);
        } catch (bundleError) {
          console.warn("Bestehender Alle-Events-Link konnte nicht entfernt werden:", bundleError);
        }
      }
      state.remote.readToken = readToken;
      state.remote.editToken = editToken;
      state.remote.token = editToken;
      state.remote.shareKey = "";
      state.remote.bundleId = "";
      state.remote.bundleToken = "";
      state.remote.bundleReadToken = "";
      state.remote.bundleEditToken = "";
      state.remote.sharedEventAccess = {};
      state.remote.role = SHARE_ROLE_OWNER;
      state.remote.canWrite = true;
      saveOwnerRemoteSession({ listId, authUid: uid });
      if (els.shareModeRead) {
        els.shareModeRead.disabled = false;
        els.shareModeRead.checked = true;
      }
      if (els.shareModeEdit) {
        els.shareModeEdit.disabled = false;
        els.shareModeEdit.checked = false;
      }
      if (els.shareLinkInput) {
        els.shareLinkInput.disabled = false;
        els.shareLinkInput.placeholder = "";
      }
      if (els.shareCopyBtn) {
        els.shareCopyBtn.disabled = false;
      }
      updateShareDialogLink();
      updateAccessUi();
      showToast("Share-Links erneuert.", "success");
    } catch (error) {
      console.error("Share-Links konnten nicht erneuert werden:", error);
      showToast("Share-Links konnten nicht erneuert werden.", "danger");
    }
  }

  async function copyShareLinkFromDialog() {
    const link = els.shareLinkInput?.value || "";
    if (!link) return;
    await copyTextToClipboard(link);
    showToast("Share-Link wurde kopiert.", "success");
  }

  function createShareLink(listId, token, mode, { scope = SHARE_SCOPE_EVENT, bundleId = "" } = {}) {
    if (!canUseShareFeature()) return "";
    const url = new URL(state.remote.baseUrl || getCurrentBaseUrl());
    removeShareParamsFromUrl(url);
    url.hash = createShareHash(listId, token, mode, getCurrentShareEventName(listId), { scope, bundleId });
    return url.href;
  }

  function createShareHash(listId, token, mode, eventName = "", { scope = SHARE_SCOPE_EVENT, bundleId = "" } = {}) {
    const params = new URLSearchParams();
    params.set(SHARE_PARAM_TOKEN, token);
    params.set(SHARE_PARAM_ROLE, mode === "edit" ? "edit" : "read");

    if (scope === SHARE_SCOPE_ALL) {
      const safeBundleId = sanitizeShareBundleId(bundleId);
      params.set(SHARE_PARAM_SCOPE, SHARE_SCOPE_ALL);
      if (safeBundleId) {
        params.set(SHARE_PARAM_BUNDLE, safeBundleId);
      }
    } else {
      params.set(SHARE_PARAM_LIST, listId);
      const safeEventName = normalizeEventName(eventName);
      if (safeEventName) {
        params.set(SHARE_PARAM_EVENT, safeEventName);
      }
    }

    return params.toString();
  }

  function getCurrentShareEventName(listId = state.remote.listId) {
    const safeListId = sanitizeShareToken(listId, 128);
    const activeEvent = getActiveEvent();
    const event = activeEvent?.listId === safeListId
      ? activeEvent
      : findEventByListId(safeListId);
    return normalizeEventName(event?.name);
  }

  function replaceLegacyShareQueryWithHash(listId, token, mode, eventName = "") {
    try {
      const url = new URL(window.location.href);
      if (!hasShareSearchParams(url)) {
        return;
      }

      removeShareParamsFromUrl(url);
      url.hash = createShareHash(listId, token, mode, eventName);
      window.history.replaceState(null, document.title, url.href);
    } catch {
      // Alte Query-Links funktionieren weiter, die Bereinigung ist nur Härtung.
    }
  }

  function replaceBundleShareQueryWithHash(bundleId, token, mode) {
    try {
      const url = new URL(window.location.href);
      if (!hasShareSearchParams(url)) {
        return;
      }

      removeShareParamsFromUrl(url);
      url.hash = createShareHash("", token, mode, "", {
        scope: SHARE_SCOPE_ALL,
        bundleId,
      });
      window.history.replaceState(null, document.title, url.href);
    } catch {
      // Query-Bereinigung ist optional.
    }
  }

  function hasShareSearchParams(url) {
    return url.searchParams.has(SHARE_PARAM_LIST)
      || url.searchParams.has(SHARE_PARAM_TOKEN)
      || url.searchParams.has(SHARE_PARAM_ROLE)
      || url.searchParams.has(SHARE_PARAM_EVENT)
      || url.searchParams.has(SHARE_PARAM_SCOPE)
      || url.searchParams.has(SHARE_PARAM_BUNDLE);
  }

  function removeShareParamsFromUrl(url) {
    url.searchParams.delete(SHARE_PARAM_LIST);
    url.searchParams.delete(SHARE_PARAM_TOKEN);
    url.searchParams.delete(SHARE_PARAM_ROLE);
    url.searchParams.delete(SHARE_PARAM_EVENT);
    url.searchParams.delete(SHARE_PARAM_SCOPE);
    url.searchParams.delete(SHARE_PARAM_BUNDLE);
  }

  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback unten verwenden.
    }

    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.append(input);
    input.select();
    try {
      document.execCommand("copy");
      return true;
    } finally {
      input.remove();
    }
  }

  function normalizeBaseUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw.endsWith("/") ? raw : `${raw}/`);
      return url.href;
    } catch {
      return "";
    }
  }

  function resolveAppBaseUrl() {
    const currentBaseUrl = getCurrentBaseUrl();
    if (isLocalDevelopmentUrl()) return currentBaseUrl;
    return normalizeBaseUrl(appConfig?.baseUrl) || currentBaseUrl;
  }

  function isLocalDevelopmentUrl() {
    const protocol = window.location.protocol;
    if (protocol === "file:") return true;
    if (protocol !== "http:") return false;

    const host = normalizeHostName(window.location.hostname);
    return host === "localhost"
      || host.endsWith(".localhost")
      || host === "127.0.0.1"
      || host === "::1"
      || isPrivateIpv4Host(host);
  }

  function normalizeHostName(hostname) {
    return String(hostname || "").trim().replace(/^\[|\]$/g, "").toLowerCase();
  }

  function isPrivateIpv4Host(hostname) {
    const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
    if (!match) return false;

    const parts = match.slice(1).map(Number);
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

    const [first, second] = parts;
    return first === 10
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 169 && second === 254);
  }

  function getCurrentBaseUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    const pathname = url.pathname.endsWith("/") ? url.pathname : url.pathname.replace(/\/[^/]*$/, "/");
    url.pathname = pathname;
    return url.href;
  }

  function createShareId(prefix, length) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let token = `${prefix}_`;
    bytes.forEach((byte) => {
      token += alphabet[byte % alphabet.length];
    });
    return token;
  }

  function sanitizeShareToken(value, maxLength) {
    const text = String(value || "").trim();
    if (!text || text.length > maxLength) return "";
    return /^[A-Za-z0-9_-]+$/.test(text) ? text : "";
  }

  function sanitizeShareBundleId(value) {
    const text = sanitizeShareToken(value, 128);
    return /^bun_[A-Za-z0-9_-]{18}$/.test(text) ? text : "";
  }

  function sanitizeAuthUid(value) {
    const text = String(value || "").trim();
    return /^[A-Za-z0-9_-]{1,128}$/.test(text) ? text : "";
  }

  function showRemoteToast(message, type = "info") {
    const now = Date.now();
    if (now - state.remote.lastToastAt < REMOTE_TOAST_COOLDOWN_MS) return;
    state.remote.lastToastAt = now;
    showToast(message, type);
  }

  function saveData(remoteOptions = {}) {
    const data = createPersistedData();
    const saved = saveCurrentDataSnapshot(data);

    if (!saved) {
      showToast("Speichern fehlgeschlagen.", "danger");
      return false;
    }

    if (canWriteRemoteList() && !state.remote.applyingRemote) {
      markRemoteStateDirty(remoteOptions);
    }

    return true;
  }

  function saveCurrentDataSnapshot(data = createPersistedData()) {
    const localSaved = state.remote.openedFromShareLink ? true : saveLocalData(data);
    const sharedSaved = state.remote.listId ? saveSharedData(state.remote.listId, data) : true;
    return localSaved && sharedSaved;
  }

  function persistCurrentDataBeforeUnload() {
    const data = createPersistedData();
    saveCurrentDataSnapshot(data);

    if (canWriteRemoteList() && !state.remote.applyingRemote) {
      window.clearTimeout(state.remote.saveTimer);
      void writeRemoteStateNow();
    }
  }

  function createPersistedData() {
    return {
      version: 4,
      tickets: state.tickets.map(sanitizeTicketForStorage),
      counters: sanitizeCounters(state.counters),
      preferences: sanitizePreferences(state.preferences),
    };
  }

  function saveLocalData(data = createPersistedData()) {
    const activeEvent = getActiveEvent();
    const payload = JSON.stringify(data);
    const eventSaved = activeEvent
      ? safeStorageSet(localStorage, `${EVENT_DATA_PREFIX}${activeEvent.id}`, payload)
      : true;
    const legacyCurrentSaved = safeStorageSet(localStorage, STORAGE_KEY, payload);

    if (activeEvent && canPersistEventRegistry()) {
      activeEvent.updatedAt = Date.now();
      saveEventRegistry();
    }

    return eventSaved && legacyCurrentSaved;
  }

  function saveSharedData(listId, data = createPersistedData()) {
    const safeListId = sanitizeShareToken(listId, 128);
    if (!safeListId) return false;
    const payload = JSON.stringify(data);
    const sharedSaved = safeStorageSet(localStorage, `${SHARED_STORAGE_PREFIX}${safeListId}`, payload);
    const activeEvent = getActiveEvent();
    const eventSaved = activeEvent?.listId === safeListId
      ? safeStorageSet(localStorage, `${EVENT_DATA_PREFIX}${activeEvent.id}`, payload)
      : true;

    if (activeEvent?.listId === safeListId && canPersistEventRegistry()) {
      activeEvent.updatedAt = Date.now();
      saveEventRegistry();
    }

    return sharedSaved && eventSaved;
  }

  function loadData() {
    loadDataForActiveEvent();
  }

  function applyPersistedData(parsed) {
    const data = normalizePersistedData(parsed);
    state.tickets = data.tickets;
    state.counters = data.counters;
    state.preferences = data.preferences;
  }

  function normalizePersistedData(parsed) {
    const rawTickets = Array.isArray(parsed?.tickets) ? parsed.tickets.slice(0, MAX_TICKETS) : [];
    const usedIds = new Set();
    const usedTicketNumbers = new Set();
    const counters = sanitizeCounters(parsed?.counters);
    const tickets = [];

    rawTickets.forEach((rawTicket) => {
      const ticket = normalizeTicket(rawTicket, usedIds, usedTicketNumbers, counters);
      if (ticket) tickets.push(ticket);
    });

    return {
      version: 4,
      tickets,
      counters: mergeCounters(counters, deriveCountersFromTickets(tickets)),
      preferences: sanitizePreferences(parsed?.preferences),
    };
  }

  function mergePersistedDataForRemoteTransaction(remoteValue, localValue, deletedTicketIds) {
    const remoteData = normalizePersistedData(remoteValue);
    const localData = normalizePersistedData(localValue);
    const removedIds = deletedTicketIds instanceof Set ? deletedTicketIds : new Set();
    const mergedTickets = [];
    const indexById = new Map();

    remoteData.tickets.forEach((ticket) => {
      if (removedIds.has(ticket.id)) return;
      indexById.set(ticket.id, mergedTickets.length);
      mergedTickets.push(ticket);
    });

    localData.tickets.forEach((localTicket) => {
      if (removedIds.has(localTicket.id)) return;

      const existingIndex = indexById.get(localTicket.id);
      if (typeof existingIndex === "number") {
        const remoteTicket = mergedTickets[existingIndex];
        if (isTicketNewerOrEqual(localTicket, remoteTicket)) {
          mergedTickets[existingIndex] = localTicket;
        }
        return;
      }

      if (mergedTickets.length < MAX_TICKETS) {
        indexById.set(localTicket.id, mergedTickets.length);
        mergedTickets.push(localTicket);
      }
    });

    return normalizePersistedData({
      version: 4,
      tickets: mergedTickets,
      counters: mergeCounters(localData.counters, remoteData.counters),
      preferences: mergePreferences(remoteData.preferences, localData.preferences),
    });
  }

  function isTicketNewerOrEqual(left, right) {
    const leftTime = Date.parse(left?.updatedAt || left?.createdAt || "");
    const rightTime = Date.parse(right?.updatedAt || right?.createdAt || "");

    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
      return leftTime >= rightTime;
    }

    if (!Number.isNaN(leftTime)) return true;
    if (!Number.isNaN(rightTime)) return false;
    return true;
  }

  function mergePreferences(remotePreferences, localPreferences) {
    const remoteSafe = sanitizePreferences(remotePreferences);
    const localSafe = sanitizePreferences(localPreferences);

    return {
      suppressedConfirmations: {
        ...remoteSafe.suppressedConfirmations,
        ...localSafe.suppressedConfirmations,
      },
    };
  }

  function resetStateToDefaults() {
    state.tickets = [];
    state.counters = { normal: 1, vip: 1 };
    state.preferences = createDefaultPreferences();
    clearSelectedTickets();
  }

  function getStoredData() {
    const activeEvent = getActiveEvent();
    if (activeEvent) {
      const eventData = safeStorageGet(localStorage, `${EVENT_DATA_PREFIX}${activeEvent.id}`);
      if (eventData) return eventData;

      if (activeEvent.listId) {
        const sharedData = safeStorageGet(localStorage, `${SHARED_STORAGE_PREFIX}${activeEvent.listId}`);
        if (sharedData) return sharedData;
        if (state.remote.openedFromShareLink) return null;
      }

      if (hasAnyEventDataSnapshot()) return null;
    }

    const current = safeStorageGet(localStorage, STORAGE_KEY);
    if (current) return current;

    for (const key of LEGACY_STORAGE_KEYS) {
      const value = safeStorageGet(localStorage, key);
      if (value) return value;
    }

    return null;
  }

  function normalizeTicket(ticket, usedIds, usedTicketNumbers, counters) {
    if (!ticket || typeof ticket !== "object") return null;

    const type = isValidType(ticket.type) ? ticket.type : "normal";
    const defaultPrice = PRICES[type];
    const rawPrice = parseSafeInteger(ticket.price);
    const price = rawPrice && rawPrice > 0 && rawPrice <= MAX_PRICE ? rawPrice : defaultPrice;
    const id = getUniqueId(ticket.id, usedIds);
    const ticketNumber = getSafeTicketNumber(ticket.ticketNumber, type, usedTicketNumbers, counters);

    return {
      id,
      ticketNumber,
      firstName: normalizeStoredText(ticket.firstName, MAX_NAME_LENGTH),
      lastName: normalizeStoredText(ticket.lastName, MAX_NAME_LENGTH),
      phone: sanitizeDigits(ticket.phone).slice(0, MAX_PHONE_LENGTH),
      type,
      menu: isValidMenu(ticket.menu) ? ticket.menu : "menu1",
      price,
      customPrice: Boolean(ticket.customPrice) || price !== defaultPrice,
      createdAt: normalizeIsoDate(ticket.createdAt),
      updatedAt: normalizeIsoDate(ticket.updatedAt),
    };
  }

  function sanitizeTicketForStorage(ticket) {
    const type = isValidType(ticket.type) ? ticket.type : "normal";
    const defaultPrice = PRICES[type];
    const price = parseSafeInteger(ticket.price) || defaultPrice;

    return {
      id: normalizeStoredId(ticket.id),
      ticketNumber: normalizeTicketNumber(ticket.ticketNumber, type) || generateTicketNumber(type),
      firstName: normalizeStoredText(ticket.firstName, MAX_NAME_LENGTH),
      lastName: normalizeStoredText(ticket.lastName, MAX_NAME_LENGTH),
      phone: sanitizeDigits(ticket.phone).slice(0, MAX_PHONE_LENGTH),
      type,
      menu: isValidMenu(ticket.menu) ? ticket.menu : "menu1",
      price: price > 0 && price <= MAX_PRICE ? price : defaultPrice,
      customPrice: Boolean(ticket.customPrice),
      createdAt: normalizeIsoDate(ticket.createdAt),
      updatedAt: normalizeIsoDate(ticket.updatedAt),
    };
  }

  function getSafeTicketNumber(value, type, usedTicketNumbers, counters) {
    const normalized = normalizeTicketNumber(value, type);

    if (normalized && !usedTicketNumbers.has(normalized)) {
      usedTicketNumbers.add(normalized);
      return normalized;
    }

    const generated = generateTicketNumberFromCounter(type, usedTicketNumbers, counters);
    usedTicketNumbers.add(generated);
    return generated;
  }

  function generateTicketNumberFromCounter(type, usedTicketNumbers, counters) {
    const safeType = isValidType(type) ? type : "normal";
    const prefix = safeType === "vip" ? "VIP" : "N";
    let nextNumber = Math.max(1, parseSafeInteger(counters[safeType]) || 1);
    let ticketNumber = "";
    let guard = 0;

    do {
      ticketNumber = `${prefix}-${String(nextNumber).padStart(3, "0")}`;
      nextNumber += 1;
      guard += 1;
    } while (usedTicketNumbers.has(ticketNumber) && guard < 10000);

    counters[safeType] = nextNumber;
    return ticketNumber;
  }

  function normalizeTicketNumber(value, type) {
    const text = String(value ?? "").trim().toUpperCase();
    const match = text.match(/^(VIP|N)-(\d{1,6})$/);
    if (!match) return "";

    const expectedPrefix = type === "vip" ? "VIP" : "N";
    if (match[1] !== expectedPrefix) return "";

    return `${expectedPrefix}-${String(Number(match[2])).padStart(3, "0")}`;
  }

  function getUniqueId(value, usedIds) {
    let id = normalizeStoredId(value);

    if (!id || usedIds.has(id)) {
      do {
        id = createId();
      } while (usedIds.has(id));
    }

    usedIds.add(id);
    return id;
  }

  function deriveCountersFromTickets(tickets) {
    const counters = { normal: 1, vip: 1 };

    tickets.forEach((ticket) => {
      const match = String(ticket.ticketNumber || "").match(/^(VIP|N)-(\d+)$/i);
      if (!match) return;

      const type = match[1].toUpperCase() === "VIP" ? "vip" : "normal";
      const number = parseSafeInteger(match[2]);
      counters[type] = Math.max(counters[type], number + 1);
    });

    return counters;
  }

  function mergeCounters(savedCounters, derivedCounters) {
    return {
      normal: Math.max(parseSafeInteger(savedCounters?.normal) || 1, derivedCounters.normal),
      vip: Math.max(parseSafeInteger(savedCounters?.vip) || 1, derivedCounters.vip),
    };
  }

  function sanitizeCounters(counters) {
    return {
      normal: Math.max(1, parseSafeInteger(counters?.normal) || 1),
      vip: Math.max(1, parseSafeInteger(counters?.vip) || 1),
    };
  }

  function sanitizePreferences(preferences) {
    const safePreferences = createDefaultPreferences();
    const suppressed = preferences?.suppressedConfirmations;

    if (!suppressed || typeof suppressed !== "object" || Array.isArray(suppressed)) {
      return safePreferences;
    }

    Object.keys(suppressed).forEach((key) => {
      if (isKnownDialogKey(key) && suppressed[key] === true) {
        safePreferences.suppressedConfirmations[key] = true;
      }
    });

    return safePreferences;
  }

  function normalizeStoredId(value) {
    const id = String(value ?? "").trim();
    return SAFE_ID_PATTERN.test(id) ? id : createId();
  }

  function sanitizeDigits(value) {
    return String(value ?? "").replace(/\D+/g, "");
  }

  function normalizeNameInput(value) {
    return String(value ?? "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .slice(0, MAX_NAME_LENGTH);
  }

  function normalizeStoredText(value, maxLength) {
    return String(value ?? "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function normalizeSearch(value) {
    return normalizeStoredText(value, MAX_SEARCH_LENGTH).toLocaleLowerCase("de-DE");
  }

  function parseSafeInteger(value) {
    const digits = typeof value === "number" ? String(Math.trunc(value)) : sanitizeDigits(value);
    if (!digits) return 0;

    const number = Number(digits);
    return Number.isSafeInteger(number) ? number : 0;
  }

  function normalizeIsoDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString();
    }

    return date.toISOString();
  }

  function isValidMenu(menu) {
    return Object.prototype.hasOwnProperty.call(MENU_LABELS, menu);
  }

  function isValidType(type) {
    return Object.prototype.hasOwnProperty.call(PRICES, type);
  }

  function isValidFilter(filter) {
    return filter === "all" || isValidType(filter);
  }

  function createId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    const random = new Uint32Array(2);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(random);
      return `${Date.now().toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`;
    }

    return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  }

  function formatCurrency(value) {
    return `${(parseSafeInteger(value) || 0).toLocaleString("de-DE")} $`;
  }

  function clearChildren(element) {
    while (element.firstChild) {
      element.firstChild.remove();
    }
  }

  function showFormError(message) {
    els.formError.textContent = message;
  }

  function showToast(message, type = "info") {
    if (!els.toast) return;

    const safeType = TOAST_TYPES.has(type) ? type : "info";
    const safeMessage = String(message ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 120);
    const target = els.toastMessage || els.toast;

    window.clearTimeout(showToast.timer);
    els.toast.classList.remove("show", "toast-info", "toast-success", "toast-warning", "toast-danger");

    // Reflow erzwingen, damit schnelle Folgemeldungen die Animation neu starten.
    void els.toast.offsetWidth;

    target.textContent = safeMessage || "Hinweis";
    els.toast.dataset.position = els.toast.dataset.position || "top-right";
    els.toast.classList.add(`toast-${safeType}`, "show");

    showToast.timer = window.setTimeout(() => {
      els.toast.classList.remove("show");
    }, TOAST_DURATION_MS);
  }

  init();
})();
