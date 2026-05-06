(() => {
  "use strict";

  const STORAGE_KEY = "eventTicketManagerData.v3";
  const LEGACY_STORAGE_KEYS = ["eventTicketManagerData.v2", "eventTicketManagerData.v1"];
  const MAX_TICKETS = 250;
  const MAX_PRICE = 999_999_999;
  const MAX_NAME_LENGTH = 40;
  const MAX_PHONE_LENGTH = 20;
  const MAX_SEARCH_LENGTH = 80;

  const PRICES = Object.freeze({
    normal: 2500,
    vip: 5000,
  });

  const TYPE_LABELS = Object.freeze({
    normal: "Normal",
    vip: "VIP",
  });

  const state = {
    tickets: [],
    counters: { normal: 1, vip: 1 },
    search: "",
    filter: "all",
    editingId: null,
    dialogResolve: null,
    dialogReturnFocus: null,
  };

  const els = {
    form: document.querySelector("#ticketForm"),
    editId: document.querySelector("#editId"),
    firstName: document.querySelector("#firstName"),
    lastName: document.querySelector("#lastName"),
    phone: document.querySelector("#phone"),
    ticketType: document.querySelector("#ticketType"),
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
    tableBody: document.querySelector("#ticketTableBody"),
    soldCount: document.querySelector("#soldCount"),
    normalCount: document.querySelector("#normalCount"),
    vipCount: document.querySelector("#vipCount"),
    remainingCount: document.querySelector("#remainingCount"),
    totalRevenue: document.querySelector("#totalRevenue"),
    exportCsvBtn: document.querySelector("#exportCsvBtn"),
    resetBtn: document.querySelector("#resetBtn"),
    limitBadge: document.querySelector("#limitBadge"),
    toast: document.querySelector("#toast"),
    dialogBackdrop: document.querySelector("#dialogBackdrop"),
    dialogCard: document.querySelector(".modal-card"),
    dialogIcon: document.querySelector("#dialogIcon"),
    dialogTitle: document.querySelector("#dialogTitle"),
    dialogMessage: document.querySelector("#dialogMessage"),
    dialogCancelBtn: document.querySelector("#dialogCancelBtn"),
    dialogConfirmBtn: document.querySelector("#dialogConfirmBtn"),
  };

  function init() {
    loadData();
    bindEvents();
    updatePriceUi();
    renderApp();
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
      renderTable();
    });

    els.typeFilter.addEventListener("change", () => {
      state.filter = isValidFilter(els.typeFilter.value) ? els.typeFilter.value : "all";
      els.typeFilter.value = state.filter;
      renderTable();
    });

    els.tableBody.addEventListener("click", handleTableAction);
    els.exportCsvBtn.addEventListener("click", exportCsv);
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
      customPrice: customPriceEnabled,
      price: customPriceEnabled ? manualPrice : PRICES[type],
    };
  }

  function validateFormData(data) {
    if (!data.firstName || !data.lastName || !data.phone || !data.type) {
      return { message: "Bitte alle Felder ausfüllen." };
    }

    if (!isValidType(data.type)) {
      return { message: "Ungültiger Tickettyp." };
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
      price: data.price,
      customPrice: data.customPrice,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    state.tickets.push(ticket);

    if (!saveData()) return;

    clearForm();
    renderApp();
    showToast("Ticket gespeichert.");
  }

  function editTicket(id, data) {
    const ticket = state.tickets.find((item) => item.id === id);
    if (!ticket) return;

    const typeChanged = ticket.type !== data.type;

    ticket.firstName = data.firstName;
    ticket.lastName = data.lastName;
    ticket.phone = data.phone;
    ticket.type = data.type;
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
    showToast("Eintrag aktualisiert.");
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
    });

    if (!confirmed) return;

    state.tickets = state.tickets.filter((item) => item.id !== id);

    if (state.editingId === id) {
      clearForm();
    }

    if (!saveData()) return;

    renderApp();
    showToast("Ticket gelöscht.");
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
      cell.colSpan = 7;
      cell.textContent = "Keine Einträge";
      row.append(cell);
      els.tableBody.append(row);
      return;
    }

    const fragment = document.createDocumentFragment();

    tickets.forEach((ticket) => {
      const row = document.createElement("tr");
      row.append(
        createTextCell(ticket.ticketNumber, "ticket-number"),
        createTextCell(ticket.firstName),
        createTextCell(ticket.lastName),
        createTextCell(ticket.phone),
        createBadgeCell(ticket.type),
        createTextCell(formatCurrency(ticket.price)),
        createActionCell(ticket.id),
      );
      fragment.append(row);
    });

    els.tableBody.append(fragment);
  }

  function createTextCell(text, className = "") {
    const cell = document.createElement("td");

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

  function createBadgeCell(type) {
    const cell = document.createElement("td");
    const badge = document.createElement("span");
    const safeType = isValidType(type) ? type : "normal";

    badge.className = `badge ${safeType === "vip" ? "badge-vip" : "badge-normal"}`;
    badge.textContent = TYPE_LABELS[safeType];
    cell.append(badge);
    return cell;
  }

  function createActionCell(id) {
    const cell = document.createElement("td");
    const wrapper = document.createElement("div");
    const editButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    wrapper.className = "action-cell";

    editButton.className = "action-btn";
    editButton.type = "button";
    editButton.dataset.action = "edit";
    editButton.dataset.id = id;
    editButton.textContent = "Bearbeiten";

    deleteButton.className = "action-btn delete";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.id = id;
    deleteButton.textContent = "Löschen";

    wrapper.append(editButton, deleteButton);
    cell.append(wrapper);
    return cell;
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
      showToast("Keine Daten für Export.");
      return;
    }

    const rows = [
      ["Ticketnummer", "Vorname", "Nachname", "Telefonnummer", "Tickettyp", "Preis"],
      ...state.tickets.map((ticket) => [
        ticket.ticketNumber,
        ticket.firstName,
        ticket.lastName,
        ticket.phone,
        TYPE_LABELS[ticket.type] || ticket.type,
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

    showToast("CSV exportiert.");
  }

  // Verhindert CSV-/Spreadsheet-Formel-Injektion beim Öffnen in Tabellenprogrammen.
  function toCsvCell(value) {
    const text = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ");
    const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  }

  async function resetAllData() {
    if (state.tickets.length === 0) {
      showToast("Keine Daten vorhanden.");
      return;
    }

    const confirmed = await openDialog({
      title: "Daten zurücksetzen",
      message: "Alle Daten zurücksetzen?",
      confirmText: "Zurücksetzen",
      cancelText: "Abbrechen",
      showCancel: true,
      variant: "danger",
    });

    if (!confirmed) return;

    state.tickets = [];
    state.counters = { normal: 1, vip: 1 };
    clearForm();
    saveData();
    renderApp();
    showToast("Daten zurückgesetzt.");
  }

  function openDialog({
    title = "Hinweis",
    message = "",
    confirmText = "OK",
    cancelText = "Abbrechen",
    showCancel = false,
    variant = "info",
  } = {}) {
    closeDialog(false, { silent: true });

    els.dialogTitle.textContent = String(title).slice(0, 80);
    els.dialogMessage.textContent = String(message).slice(0, 220);
    els.dialogConfirmBtn.textContent = String(confirmText).slice(0, 30);
    els.dialogCancelBtn.textContent = String(cancelText).slice(0, 30);
    els.dialogCancelBtn.hidden = !showCancel;
    els.dialogIcon.textContent = variant === "danger" ? "×" : "!";
    els.dialogIcon.classList.toggle("danger", variant === "danger");

    els.dialogConfirmBtn.className = variant === "danger"
      ? "btn btn-danger-filled"
      : "btn btn-primary";

    return new Promise((resolve) => {
      state.dialogResolve = resolve;
      state.dialogReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      els.dialogBackdrop.hidden = false;
      document.body.classList.add("modal-open");

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
    state.dialogResolve = null;
    state.dialogReturnFocus = null;
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
    const focusable = Array.from(els.dialogCard.querySelectorAll("button:not([hidden]):not(:disabled)"));
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

  function saveData() {
    const data = {
      version: 3,
      tickets: state.tickets.map(sanitizeTicketForStorage),
      counters: sanitizeCounters(state.counters),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      showToast("Speichern fehlgeschlagen.");
      return false;
    }
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
      saveData();
    } catch {
      state.tickets = [];
      state.counters = { normal: 1, vip: 1 };
    }
  }

  function getStoredData() {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return current;

    for (const key of LEGACY_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
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
      id: String(ticket.id || createId()).slice(0, 80),
      ticketNumber: normalizeTicketNumber(ticket.ticketNumber, type) || generateTicketNumber(type),
      firstName: normalizeStoredText(ticket.firstName, MAX_NAME_LENGTH),
      lastName: normalizeStoredText(ticket.lastName, MAX_NAME_LENGTH),
      phone: sanitizeDigits(ticket.phone).slice(0, MAX_PHONE_LENGTH),
      type,
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
    let id = String(value || "").trim().slice(0, 80);

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

  function showToast(message) {
    els.toast.textContent = String(message).slice(0, 120);
    els.toast.classList.add("show");

    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      els.toast.classList.remove("show");
    }, 2400);
  }

  init();
})();
