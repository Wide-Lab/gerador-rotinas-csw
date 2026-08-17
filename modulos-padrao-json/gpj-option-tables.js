(function (app) {
  const { state, utils: u, el } = app;

  let activeTargetType = "";
  let activeTargetId = "";

  function getActiveTarget() {
    if (activeTargetType === "field") {
      return state.fields.find((field) => field.id === activeTargetId);
    }

    if (activeTargetType === "grid") {
      return state.gridColumns.find((column) => column.id === activeTargetId);
    }

    return null;
  }

  function nextNumericValue(items) {
    const numbers = items
      .map((item) => String(item.value ?? "").trim())
      .filter((value) => /^-?\d+$/.test(value))
      .map(Number);

    return numbers.length ? String(Math.max(...numbers) + 1) : "";
  }

  function defaultItems() {
    return app.fields && typeof app.fields.defaultOptionItems === "function"
      ? app.fields.defaultOptionItems()
      : [
          { id: u.createId(), value: "0", description: "Inativo" },
          { id: u.createId(), value: "1", description: "Ativo" }
        ];
  }

  function ensureItems(target) {
    if (!Array.isArray(target.optionsItems)) {
      target.optionsItems = [];
    }

    if (!target.optionsItems.length) {
      target.optionsItems = defaultItems();
    }
  }

  function targetTableName(target) {
    return u.normalizeVariable(
      target.optionsVariable,
      activeTargetType === "grid" ? "TABSET" : "TABELA"
    );
  }

  function targetDescription(target) {
    return activeTargetType === "grid"
      ? target.title || "Coluna do Grid"
      : target.description || "Campo";
  }

  function render() {
    const target = getActiveTarget();
    if (!target) return;

    ensureItems(target);

    const tableName = targetTableName(target);
    el.optionTableModalTitle.textContent = `Itens da tabela ${tableName}`;
    el.optionTableModalDescription.textContent = activeTargetType === "grid"
      ? `${targetDescription(target)} — os itens serão carregados para o ComboBox da manutenção na label 4000.`
      : `${targetDescription(target)} — os valores abaixo serão gerados diretamente na RG.`;

    el.optionTableItemsBody.innerHTML = "";

    target.optionsItems.forEach((item, position) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>
          <div class="row-actions">
            <button type="button" class="icon-button" data-option-action="up" data-option-position="${position}">↑</button>
            <button type="button" class="icon-button" data-option-action="down" data-option-position="${position}">↓</button>
          </div>
        </td>
        <td>
          <input
            class="option-value-input"
            data-option-position="${position}"
            data-option-property="value"
            value="${u.escapeHtml(item.value)}"
            placeholder="Ex.: 0, 1 ou A"
          >
        </td>
        <td>
          <input
            class="option-description-input"
            data-option-position="${position}"
            data-option-property="description"
            value="${u.escapeHtml(item.description)}"
            placeholder="Descrição exibida"
          >
        </td>
        <td>
          <button type="button" class="icon-button remove" data-option-action="remove" data-option-position="${position}">×</button>
        </td>
      `;

      el.optionTableItemsBody.appendChild(row);
    });
  }

  function showModal() {
    render();
    el.optionTableModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function open(fieldPosition) {
    const field = state.fields[fieldPosition];

    if (
      !field ||
      !app.fields.usesOptions(field) ||
      !field.createOptionsTable
    ) {
      return;
    }

    activeTargetType = "field";
    activeTargetId = field.id;
    ensureItems(field);
    showModal();
  }

  function openGrid(columnPosition) {
    const column = state.gridColumns[columnPosition];

    if (
      !column ||
      !column.editable ||
      column.maintenanceType !== "combo" ||
      !column.createOptionsTable
    ) {
      return;
    }

    activeTargetType = "grid";
    activeTargetId = column.id;

    if (!String(column.optionsVariable || "").trim()) {
      column.optionsVariable = "TABSET";
    }

    ensureItems(column);
    showModal();
  }

  function close() {
    const targetType = activeTargetType;

    activeTargetType = "";
    activeTargetId = "";

    el.optionTableModal.classList.add("hidden");
    document.body.classList.remove("modal-open");

    if (targetType === "field") {
      app.fields.render();
    }

    if (targetType === "grid") {
      app.grid.render();
    }

    app.refresh();
  }

  function addItem() {
    const target = getActiveTarget();
    if (!target) return;

    ensureItems(target);

    target.optionsItems.push({
      id: u.createId(),
      value: nextNumericValue(target.optionsItems),
      description: ""
    });

    render();
    app.refresh();
  }

  function updateItem(targetInput) {
    const target = getActiveTarget();
    const position = Number(targetInput.dataset.optionPosition);
    const property = targetInput.dataset.optionProperty;

    if (
      !target ||
      !Number.isInteger(position) ||
      !property ||
      !target.optionsItems[position]
    ) {
      return;
    }

    target.optionsItems[position][property] = targetInput.value;
    app.refresh();
  }

  function moveItem(position, direction) {
    const target = getActiveTarget();
    if (!target) return;

    const destination = position + direction;

    if (
      destination < 0 ||
      destination >= target.optionsItems.length
    ) {
      return;
    }

    [
      target.optionsItems[position],
      target.optionsItems[destination]
    ] = [
      target.optionsItems[destination],
      target.optionsItems[position]
    ];

    render();
    app.refresh();
  }

  function removeItem(position) {
    const target = getActiveTarget();
    if (!target) return;

    target.optionsItems.splice(position, 1);
    render();
    app.refresh();
  }

  function initialize() {
    el.optionTableItemsBody.addEventListener("input", (event) => {
      updateItem(event.target);
    });

    el.optionTableItemsBody.addEventListener("change", (event) => {
      updateItem(event.target);
    });

    el.optionTableItemsBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-option-action]");
      if (!button) return;

      const position = Number(button.dataset.optionPosition);
      const action = button.dataset.optionAction;

      if (action === "up") moveItem(position, -1);
      if (action === "down") moveItem(position, 1);
      if (action === "remove") removeItem(position);
    });

    el.addOptionTableItemButton.addEventListener("click", addItem);
    el.closeOptionTableModalButton.addEventListener("click", close);
    el.finishOptionTableButton.addEventListener("click", close);

    el.optionTableModal.addEventListener("click", (event) => {
      if (event.target === el.optionTableModal) close();
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !el.optionTableModal.classList.contains("hidden")
      ) {
        close();
      }
    });
  }

  app.optionTables = {
    initialize,
    open,
    openGrid,
    close,
    render
  };
})(window.GeradorRotinasJsonPadrao);
