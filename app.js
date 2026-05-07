(() => {
  "use strict";

  const APP_VERSION = "2026.05.07.22";
  const VERSION_STORAGE_KEY = "eventTicketManager.appVersion";
  const VERSION_RELOAD_GUARD_KEY = "eventTicketManager.versionReloadGuard";
  const VERSION_LAST_REMOTE_KEY = "eventTicketManager.lastRemoteVersion";
  const VERSION_URL_PARAM = "_appv";
  const VERSION_RELOAD_PARAM = "_reload";
  const VERSION_MANIFEST_PATH = "version.json";
  const VERSION_MANIFEST_MAX_LENGTH = 256;
  const REMOTE_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

  const STORAGE_KEY = "eventTicketManagerData.v3";
  const LEGACY_STORAGE_KEYS = ["eventTicketManagerData.v2", "eventTicketManagerData.v1"];
  const MAX_TICKETS = 250;
  const MAX_PRICE = 999_999_999;
  const MAX_NAME_LENGTH = 40;
  const MAX_PHONE_LENGTH = 20;
  const MAX_SEARCH_LENGTH = 80;
  const MAX_STORAGE_LENGTH = 250_000;
  const MAX_CSV_IMPORT_BYTES = 512_000;
  const MAX_CSV_IMPORT_CHARS = 512_000;
  const MAX_VERSION_LENGTH = 64;
  const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
  const CSV_FILE_TYPES = new Set(["text/csv", "application/csv", "application/vnd.ms-excel"]);

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
    versionCheckInFlight: false,
    lastRemoteVersionCheckAt: 0,
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
    limitBadge: document.querySelector("#limitBadge"),
    toast: document.querySelector("#toast"),
    toastMessage: document.querySelector("#toastMessage"),
    dialogBackdrop: document.querySelector("#dialogBackdrop"),
    dialogCard: document.querySelector(".modal-card"),
    dialogTitle: document.querySelector("#dialogTitle"),
    dialogMessage: document.querySelector("#dialogMessage"),
    dialogSkipRow: document.querySelector("#dialogSkipRow"),
    dialogSkipCheckbox: document.querySelector("#dialogSkipCheckbox"),
    dialogCancelBtn: document.querySelector("#dialogCancelBtn"),
    dialogConfirmBtn: document.querySelector("#dialogConfirmBtn"),
  };

  function init() {
    rememberCurrentAppVersion();

    loadData();
    bindEvents();
    updatePriceUi();
    renderApp();
    cleanVersionParamsFromUrl();
    startRemoteVersionChecks();
  }


  function rememberCurrentAppVersion() {
    const storedVersion = safeStorageGet(localStorage, VERSION_STORAGE_KEY, MAX_VERSION_LENGTH);
    if (storedVersion !== APP_VERSION) {
      safeStorageSet(localStorage, VERSION_STORAGE_KEY, APP_VERSION);
    }

    const guardedVersion = safeStorageGet(sessionStorage, VERSION_RELOAD_GUARD_KEY, MAX_VERSION_LENGTH);
    if (guardedVersion === APP_VERSION) {
      safeStorageRemove(sessionStorage, VERSION_RELOAD_GUARD_KEY);
    }
  }

  function startRemoteVersionChecks() {
    if (!canCheckRemoteVersion()) return;

    state.lastRemoteVersionCheckAt = Date.now();

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

      if (guardedVersion === latestVersion || urlVersion === latestVersion) return;

      safeStorageSet(localStorage, VERSION_LAST_REMOTE_KEY, latestVersion);
      safeStorageSet(sessionStorage, VERSION_RELOAD_GUARD_KEY, latestVersion);

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
    els.bulkDeleteBtn.addEventListener("click", deleteSelectedTickets);
    els.resetConfirmationsBtn.addEventListener("click", resetHiddenConfirmations);
    els.exportCsvBtn.addEventListener("click", exportCsv);
    els.importCsvBtn.addEventListener("click", openCsvImportPicker);
    els.csvImportInput.addEventListener("change", handleCsvImportChange);
    els.resetBtn.addEventListener("click", resetAllData);

    els.dialogCancelBtn.addEventListener("click", () => closeDialog(false));
    els.dialogConfirmBtn.addEventListener("click", () => closeDialog(true));

    els.dialogBackdrop.addEventListener("click", (event) => {
      if (event.target === els.dialogBackdrop) {
        closeDialog(false);
      }
    });

    document.addEventListener("keydown", handleGlobalKeydown);
  }

  async function handleFormSubmit(event) {
    event.preventDefault();

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

  async function deleteSelectedTickets() {
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

    if (!saveData()) {
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
    renderTable();
    updateStats();
    updateLimitState();
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
    cell.dataset.label = "Aktionen";

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
    els.bulkDeleteBtn.disabled = selectedCount === 0;
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
    els.saveBtn.disabled = soldOut && !state.editingId;

    if (soldOut && !state.editingId) {
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
    if (state.tickets.length === 0) {
      showToast("Keine Daten für Export.", "warning");
      return;
    }

    const rows = [
      ["Ticketnummer", "Vorname", "Nachname", "Telefonnummer", "Tickettyp", "Menü", "Preis"],
      ...state.tickets.map((ticket) => [
        ticket.ticketNumber,
        ticket.firstName,
        ticket.lastName,
        ticket.phone,
        TYPE_LABELS[ticket.type] || ticket.type,
        MENU_LABELS[isValidMenu(ticket.menu) ? ticket.menu : "menu1"],
        ticket.price,
      ]),
    ];

    const csv = rows.map((row) => row.map(toCsvCell).join(";")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast("CSV exportiert.", "success");
  }

  function openCsvImportPicker() {
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

    if (!saveData()) {
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
    if (["menu 2", "menue 2", "menü 2", "menu2", "menue2", "menü2", "Veggie", "vegetarisch", "vegetarian"].includes(text)) {
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

    if (!saveData()) {
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
  } = {}) {
    const canRememberDialog = isKnownDialogKey(preferenceKey);
    if (canRememberDialog && isDialogSuppressed(preferenceKey)) {
      return Promise.resolve(true);
    }

    closeDialog(false, { silent: true });

    els.dialogTitle.textContent = String(title).slice(0, 80);
    els.dialogMessage.textContent = String(message).slice(0, 220);
    els.dialogConfirmBtn.textContent = String(confirmText).slice(0, 30);
    els.dialogCancelBtn.textContent = String(cancelText).slice(0, 30);
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
      els.dialogBackdrop.classList.remove("open");
      els.dialogBackdrop.hidden = false;
      document.body.classList.add("modal-open");
      void els.dialogBackdrop.offsetWidth;

      requestAnimationFrame(() => {
        els.dialogBackdrop.classList.add("open");
        (showCancel ? els.dialogCancelBtn : els.dialogConfirmBtn).focus();
      });
    });
  }

  function closeDialog(result = false, options = {}) {
    if (!isDialogOpen() && !state.dialogResolve) return;

    const resolver = state.dialogResolve;
    const returnFocus = state.dialogReturnFocus;
    const preferenceKey = state.dialogPreferenceKey;
    const shouldSuppress = Boolean(result && preferenceKey && els.dialogSkipCheckbox.checked);
    state.dialogResolve = null;
    state.dialogReturnFocus = null;
    state.dialogPreferenceKey = "";
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

      resolver(result);
    }
  }

  function handleGlobalKeydown(event) {
    if (!isDialogOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog(false);
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

  function saveData() {
    const data = {
      version: 3,
      tickets: state.tickets.map(sanitizeTicketForStorage),
      counters: sanitizeCounters(state.counters),
      preferences: sanitizePreferences(state.preferences),
    };

    if (safeStorageSet(localStorage, STORAGE_KEY, JSON.stringify(data))) {
      return true;
    }

    showToast("Speichern fehlgeschlagen.", "danger");
    return false;
  }

  function loadData() {
    const rawData = getStoredData();
    if (!rawData) return;

    try {
      const parsed = JSON.parse(rawData);
      const rawTickets = Array.isArray(parsed.tickets) ? parsed.tickets.slice(0, MAX_TICKETS) : [];
      const usedIds = new Set();
      const usedTicketNumbers = new Set();
      const counters = sanitizeCounters(parsed.counters);
      const tickets = [];

      rawTickets.forEach((rawTicket) => {
        const ticket = normalizeTicket(rawTicket, usedIds, usedTicketNumbers, counters);
        if (ticket) tickets.push(ticket);
      });

      state.tickets = tickets;
      state.counters = mergeCounters(counters, deriveCountersFromTickets(tickets));
      state.preferences = sanitizePreferences(parsed.preferences);
      saveData();
    } catch {
      state.tickets = [];
      state.counters = { normal: 1, vip: 1 };
      state.preferences = createDefaultPreferences();
    }
  }

  function getStoredData() {
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
