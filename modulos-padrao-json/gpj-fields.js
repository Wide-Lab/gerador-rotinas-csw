(function (app) {
  const { state, utils: u, el } = app;
  const expandedFieldIds = new Set();

  const canDisplay = (field) => !["date", "textArea"].includes(field.type);
  const hasDisplay = (field) => canDisplay(field) && field.hasDisplay === true;
  const usesOptions = (field) => ["combo", "checkbox", "radio"].includes(field.type);
  const isMultiSelect = (field) => field.type === "multiSelect";
  const hasLookup = (field) =>
    Boolean(
      String(field.f7Routine || "").trim() ||
      String(field.valcpCode || "").trim() ||
      String(field.afterFieldCode || "").trim() ||
      String(field.displayLoadCode || "").trim() ||
      String(field.multiSelectTableVariable || "").trim() ||
      String(field.multiSelectGlobalReference || "").trim() ||
      field.typedReaderEnabled === true ||
      String(field.typedReaderRoutine || "").trim() ||
      String(field.lookupPreset || "none") !== "none"
    );
  const isAuxiliaryLocationId = (locationId) =>
    String(locationId || "").startsWith("button-screen-");
  const isAuxiliaryField = (field) =>
    isAuxiliaryLocationId(field?.tabId);
  const isTabKey = (field) =>
    !isAuxiliaryField(field) &&
    state.tabs.some((tab) => tab.id === field?.tabId) &&
    field.tabKey === true;
  const isKeyField = (field) =>
    field?.isKey === true || field?.tabKey === true;

  function defaultInputSizeForType(type) {
    const sizes = {
      integer: 10,
      float: 10,
      decimal: 10,
      date: 8,
      monthYear: 6,
      combo: 10,
      checkbox: 10,
      radio: 10,
      multiSelect: 10,
      string: 20,
      textArea: 40
    };

    return sizes[type] || 20;
  }

  function normalizedDecimalFormat(field) {
    const value = String(field?.decimalFormat || "").toLowerCase();
    if (["v2", "v3", "v4"].includes(value)) return value;
    return field?.type === "float" ? "v3" : "v2";
  }

  const mainFields = () =>
    state.fields.filter((field) => !isAuxiliaryField(field));

  function nextLine(tabId = "parent", excludeFieldId = "") {
    const fields = state.fields.filter((field) => {
      return (field.tabId || "parent") === tabId && field.id !== excludeFieldId;
    });

    return fields.length
      ? Math.max(...fields.map((field) => Number(field.inputLine) || 0)) + 1
      : tabId === "parent"
        ? 2
        : 1;
  }

  function defaultLocation() {
    const config = app.getConfig();

    if (config.useTabs && state.tabs.length) {
      return state.tabs[0].id;
    }

    return "parent";
  }

  function tabFieldAlignment(tabId) {
    const tab = state.tabs.find((item) => item.id === tabId);
    return tab?.fieldAlignment === "center" ? "center" : "left";
  }

  function automaticLayoutEnabled(tabId) {
    if (tabId === "parent") return false;
    const tab = state.tabs.find((item) => item.id === tabId);
    return tab?.autoFieldLayout !== false;
  }

  function visibleLabelLength(field) {
    const text = String(field?.description || field?.variable || "Campo")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const requiredExtra = field?.required === true ? 1 : 0;
    return Array.from(text).length + requiredExtra;
  }

  function estimatedLabelSize(field, minimum = 9) {
    // A largura CSW não equivale exatamente à quantidade de caracteres.
    // Este fator mantém labels curtos compactos e reserva mais espaço para
    // descrições longas, como "Limite da Comissão no Pedido Exportação".
    return Math.max(
      minimum,
      Math.ceil(visibleLabelLength(field) * 0.72) + 2
    );
  }

  function fieldRightWidth(field) {
    const inputSize = Math.max(
      1,
      Number(field?.type === "textArea" ? field.textAreaWidth : field?.inputSize) || 20
    );
    const displayWidth = hasDisplay(field)
      ? 2 + Math.max(1, Number(field.displaySize) || 30)
      : 0;
    return inputSize + displayWidth;
  }

  function availableWidth(tabId) {
    const config = app.getConfig();
    return Math.max(
      1,
      tabId === "parent"
        ? Number(config.windowWidth) || 108
        : Number(config.tabPanelWidth) || 80
    );
  }

  function layoutForLocation(tabId, fields = null) {
    const locationFields = Array.isArray(fields)
      ? fields
      : state.fields.filter((field) => (field.tabId || "parent") === tabId);
    const isTab = tabId !== "parent";
    const alignment = isTab ? tabFieldAlignment(tabId) : "left";
    const minimumLabelSize = isTab ? 9 : 18;
    const labelSize = locationFields.length
      ? Math.max(...locationFields.map((field) => estimatedLabelSize(field, minimumLabelSize)))
      : minimumLabelSize;
    const maxRightWidth = locationFields.length
      ? Math.max(...locationFields.map(fieldRightWidth))
      : 20;
    const width = availableWidth(tabId);

    let labelColumn = 1;
    if (isTab && alignment === "left") {
      // Mantém o leitor perto da coluna 16 para labels curtos (padrão
      // WDOMPV015TAB1). Quando o label cresce, ele ocupa espaço para a
      // esquerda e só desloca o leitor quando realmente necessário.
      labelColumn = Math.max(1, 16 - labelSize);
    } else if (alignment === "center") {
      const totalWidth = labelSize + maxRightWidth;
      labelColumn = Math.max(1, Math.floor((width - totalWidth) / 2) + 1);
    }

    return {
      labelColumn,
      labelSize,
      inputColumn: labelColumn + labelSize,
      alignment,
      maxRightWidth,
      totalWidth: labelSize + maxRightWidth
    };
  }

  function defaultLayout(tabId) {
    return layoutForLocation(tabId);
  }

  function shiftManualButtons(locationId, delta) {
    if (!delta || !Array.isArray(state.customButtons)) return;

    state.customButtons
      .filter(
        (button) =>
          (button.location || "parent") === locationId &&
          button.positionMode === "manual"
      )
      .forEach((button) => {
        button.column = Math.max(1, (Number(button.column) || 1) + delta);
      });
  }

  function reflowLocation(tabId, options = {}) {
    if (!automaticLayoutEnabled(tabId)) return;

    const fields = state.fields.filter(
      (field) => (field.tabId || "parent") === tabId
    );
    if (!fields.length) return;

    const previousInputColumn = Math.min(
      ...fields.map((field) => Math.max(1, Number(field.inputColumn) || 1))
    );
    const layout = layoutForLocation(tabId, fields);

    fields.forEach((field) => {
      const inputSize = Math.max(1, Number(field.inputSize) || 20);
      field.labelColumn = layout.labelColumn;
      field.labelSize = layout.labelSize;
      field.inputColumn = layout.inputColumn;
      field.displayColumn = layout.inputColumn + inputSize + 2;

      if (field.type === "textArea") {
        field.textAreaWidth = Math.max(
          1,
          Number(field.textAreaWidth) || inputSize
        );
      }
    });

    const delta = layout.inputColumn - previousInputColumn;
    if (options.shiftButtons !== false) {
      shiftManualButtons(tabId, delta);
    }
  }

  function reflowAllLocations(options = {}) {
    state.tabs
      .filter((tab) => tab.contentType !== "grid")
      .forEach((tab) => reflowLocation(tab.id, options));
  }

  function applyTabAlignment(tabId, alignment = "left") {
    const tab = state.tabs.find((item) => item.id === tabId);
    if (!tab) return;

    tab.fieldAlignment = alignment === "center" ? "center" : "left";
    tab.autoFieldLayout = true;
    reflowLocation(tabId);
  }

  function alignFieldToLocation(field, tabId) {
    const previousLocation = field.tabId || "parent";
    const destination = tabId || "parent";
    const fieldWasKey = isKeyField(field);
    const line = nextLine(destination, field.id);

    field.tabId = destination;

    if (fieldWasKey) {
      field.isKey = destination === "parent";
      field.tabKey = destination !== "parent";
    } else {
      field.isKey = false;
      field.tabKey = false;
    }

    field.labelLine = line;
    field.inputLine = line;
    field.displayLine = line;

    if (destination === "parent") {
      const layout = defaultLayout(destination);
      field.labelColumn = layout.labelColumn;
      field.labelSize = layout.labelSize;
      field.inputColumn = layout.inputColumn;
      field.displayColumn = layout.inputColumn + (Number(field.inputSize) || 20) + 2;
    }

    if (previousLocation !== "parent") reflowLocation(previousLocation);
    if (destination !== "parent") reflowLocation(destination);
  }

  function defaultOptionItems() {
    return [
      { id: u.createId(), value: "0", description: "Inativo" },
      { id: u.createId(), value: "1", description: "Ativo" }
    ];
  }

  function normalizeOptionItems(items) {
    if (!Array.isArray(items)) return [];

    return items.map((item) => ({
      id: item.id || u.createId(),
      value: String(item.value ?? ""),
      description: String(item.description ?? "")
    }));
  }

  function createField(overrides = {}) {
    const tabId = overrides.tabId || defaultLocation();
    const requestedKey =
      overrides.tabKey ?? overrides.isKey ?? false;
    const isParent = tabId === "parent";

    const layout = defaultLayout(tabId);
    const inputLine = overrides.inputLine ?? nextLine(tabId);
    const inputColumn = overrides.inputColumn ?? layout.inputColumn;
    const type = overrides.type ?? "string";
    const inputSize = overrides.inputSize ?? defaultInputSizeForType(type);
    const labelSize = overrides.labelSize ?? layout.labelSize;
    const fieldUsesOptions = ["combo", "checkbox", "radio"].includes(type);
    const createOptionsTable = fieldUsesOptions
      ? overrides.createOptionsTable ?? false
      : false;
    const providedItems = normalizeOptionItems(overrides.optionsItems);
    const typedReader =
      overrides.typedReader && typeof overrides.typedReader === "object"
        ? overrides.typedReader
        : {};

    return {
      id: u.createId(),
      description: overrides.description ?? "Novo Campo",
      variable: overrides.variable ?? "CAMPO",
      type,
      tabId,
      isKey: isParent ? requestedKey : false,
      tabKey: isParent ? false : requestedKey,
      required: overrides.required ?? false,
      disabled: overrides.disabled ?? false,
      textAreaMaxLength: overrides.textAreaMaxLength ?? 500,
      textAreaWidth: overrides.textAreaWidth ?? inputSize,
      textAreaHeight: overrides.textAreaHeight ?? 3,
      labelColumn:
        overrides.labelColumn ?? layout.labelColumn,
      labelLine: overrides.labelLine ?? inputLine,
      labelSize,
      inputColumn,
      inputLine,
      inputSize,
      decimalFormat:
        overrides.decimalFormat ??
        (type === "float" ? "v3" : "v2"),
      hasDisplay:
        type === "date" ? false : overrides.hasDisplay ?? false,
      displayColumn:
        overrides.displayColumn ?? inputColumn + inputSize + 2,
      displayLine: overrides.displayLine ?? inputLine,
      displaySize: overrides.displaySize ?? 30,
      lookupPreset: overrides.lookupPreset ?? "none",
      f7Routine: overrides.f7Routine ?? "",
      extraVariables: overrides.extraVariables ?? "",
      valcpCode: overrides.valcpCode ?? "",
      afterFieldCode: overrides.afterFieldCode ?? "",
      displayLoadMode:
        overrides.displayLoadMode ??
        (String(overrides.valcpCode || "").trim() ? "valcp" : "reference"),
      displayLoadCode: overrides.displayLoadCode ?? "",
      typedReaderEnabled:
        overrides.typedReaderEnabled ?? typedReader.enabled ?? false,
      typedReaderConfigVariable:
        overrides.typedReaderConfigVariable ??
        typedReader.configVariable ??
        "CFGITE",
      typedReaderConfigText:
        overrides.typedReaderConfigText ??
        typedReader.configText ??
        "",
      typedReaderConfigMethod:
        overrides.typedReaderConfigMethod ??
        typedReader.configMethod ??
        "ObterConfLeitor^CCCGIRG012",
      typedReaderRoutine:
        overrides.typedReaderRoutine ??
        typedReader.routine ??
        "",
      typedReaderCompanyExpression:
        overrides.typedReaderCompanyExpression ??
        typedReader.companyExpression ??
        "CE",
      typedReaderControlDefinition:
        overrides.typedReaderControlDefinition ??
        typedReader.controlDefinition ??
        ",,3,{cp}",
      typedReaderExtraDefinition:
        overrides.typedReaderExtraDefinition ??
        typedReader.extraDefinition ??
        ",1",
      typedReaderUseCurrentValue:
        overrides.typedReaderUseCurrentValue ??
        typedReader.useCurrentValue ??
        true,
      multiSelectTableVariable: overrides.multiSelectTableVariable ?? (type === "multiSelect" ? `TAB${u.normalizeVariable(overrides.variable ?? "CAMPO")}` : ""),
      multiSelectSelectedText: overrides.multiSelectSelectedText ?? "Selecionados",
      multiSelectGlobalReference: overrides.multiSelectGlobalReference ?? "",
      generateF7Routine299: overrides.generateF7Routine299 ?? false,
      f7GeneratedRoutineName: overrides.f7GeneratedRoutineName ?? "",
      f7GeneratedRoutineAuto: overrides.f7GeneratedRoutineAuto ?? true,
      f7GeneratedLabel: overrides.f7GeneratedLabel ?? "",
      f7GeneratedLabelAuto: overrides.f7GeneratedLabelAuto ?? true,
      f7AllGlobalReference:
        overrides.f7AllGlobalReference ?? overrides.f7SelectedGlobalReference ?? "",
      f7SelectedGlobalReference: overrides.f7SelectedGlobalReference ?? "",
      f7GeneratedColumnSizes: overrides.f7GeneratedColumnSizes ?? "",
      f7GeneratedPieces: overrides.f7GeneratedPieces ?? "",
      f7GeneratedTitles: overrides.f7GeneratedTitles ?? "",
      f7GeneratedRows: overrides.f7GeneratedRows ?? 15,
      optionsVariable: overrides.optionsVariable ?? "",
      createOptionsTable,
      optionsItems: providedItems.length
        ? providedItems
        : createOptionsTable
          ? defaultOptionItems()
          : []
    };
  }

  const typeOptions = (selected) =>
    app.fieldTypes
      .map(
        ([value, label]) =>
          `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`
      )
      .join("");

  function locationOptions(field) {
    const config = app.getConfig();
    const selected = field.tabId || "parent";
    const options = [
      `<option value="parent" ${selected === "parent" ? "selected" : ""}>Rotina principal</option>`
    ];

    if (config.useTabs) {
      state.tabs.forEach((tab, index) => {
        options.push(
          `<option value="${tab.id}" ${selected === tab.id ? "selected" : ""}>Aba ${index + 1} - ${u.escapeHtml(tab.title)}${tab.contentType === "grid" ? " (filtro do Grid)" : ""}</option>`
        );
      });
    }

    if (
      app.customButtons &&
      typeof app.customButtons.generatedScreenDefinitions === "function"
    ) {
      app.customButtons.generatedScreenDefinitions(config).forEach((definition) => {
        options.push(
          `<option value="${definition.key}" ${selected === definition.key ? "selected" : ""}>Tela auxiliar - ${u.escapeHtml(definition.routineName)}</option>`
        );
      });
    }

    return options.join("");
  }

  const positionInput = (position, property, label, value, disabled = false) => `
    <label class="field-position-item">
      <span>${label}</span>
      <input
        class="table-number-input"
        type="number"
        min="1"
        data-field-position="${position}"
        data-field-property="${property}"
        value="${value}"
        ${disabled ? "disabled" : ""}
      >
    </label>`;

  function hasAdvancedConfiguration(field) {
    return hasLookup(field) ||
      field.hasDisplay === true ||
      usesOptions(field) ||
      isMultiSelect(field);
  }

  function renderFieldDetails(field, position) {
    const displayEnabled = hasDisplay(field);
    const optionField = usesOptions(field);
    const canConfigureItems = optionField && field.createOptionsTable;
    const itemCount = Array.isArray(field.optionsItems)
      ? field.optionsItems.length
      : 0;

    return `
      <tr class="field-details-row ${expandedFieldIds.has(field.id) ? "" : "hidden"}" data-field-details-id="${u.escapeHtml(field.id)}">
        <td colspan="10">
          <div class="field-details-panel">
            <div class="field-details-section">
              <div class="field-details-title">
                <strong>Posicionamento</strong>
                <span>Label, leitor e display deste campo.</span>
              </div>
              <div class="field-position-groups">
                <div class="field-position-group">
                  <b>Label</b>
                  ${positionInput(position, "labelColumn", "Coluna", field.labelColumn)}
                  ${positionInput(position, "labelLine", "Linha", field.labelLine)}
                  ${positionInput(position, "labelSize", "Tamanho", field.labelSize)}
                </div>
                <div class="field-position-group">
                  <b>Campo</b>
                  ${positionInput(position, "inputColumn", "Coluna", field.inputColumn)}
                  ${positionInput(position, "inputLine", "Linha", field.inputLine)}
                  ${positionInput(position, "inputSize", "Tamanho", field.inputSize)}
                </div>
                <div class="field-position-group ${displayEnabled ? "" : "muted-group"}">
                  <b>Display</b>
                  ${positionInput(position, "displayColumn", "Coluna", field.displayColumn, !displayEnabled)}
                  ${positionInput(position, "displayLine", "Linha", field.displayLine, !displayEnabled)}
                  ${positionInput(position, "displaySize", "Tamanho", field.displaySize, !displayEnabled)}
                </div>
              </div>
            </div>

            ${["float", "decimal"].includes(field.type) ? `
              <div class="field-details-section">
                <div class="field-details-title">
                  <strong>Formato do valor</strong>
                  <span>Define as casas decimais exibidas e a escala gravada na global.</span>
                </div>
                <div class="field-context-actions">
                  <div class="field-context-card">
                    <label>
                      <span class="field-context-label">Casas decimais</span>
                      <select class="table-select" data-field-position="${position}" data-field-property="decimalFormat">
                        <option value="v2" ${normalizedDecimalFormat(field) === "v2" ? "selected" : ""}>V2 — 2 casas</option>
                        <option value="v3" ${normalizedDecimalFormat(field) === "v3" ? "selected" : ""}>V3 — 3 casas</option>
                        <option value="v4" ${normalizedDecimalFormat(field) === "v4" ? "selected" : ""}>V4 — 4 casas</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            ` : ""}

            <div class="field-details-section">
              <div class="field-details-title">
                <strong>Comportamento</strong>
                <span>Somente as opções aplicáveis ao tipo ${u.escapeHtml(field.description || field.variable)}.</span>
              </div>
              <div class="field-context-actions">
                <div class="field-context-card">
                  <span class="field-context-label">F7 / Valcp</span>
                  <button type="button" class="button small field-lookup-button ${hasLookup(field) ? "configured" : ""}" data-field-action="configure-lookup" data-field-position="${position}">
                    ${hasLookup(field) ? "Configurado" : "Configurar"}
                  </button>
                </div>

                ${optionField ? `
                  <div class="field-context-card field-context-card-wide">
                    <label>
                      <span class="field-context-label">Tabela de opções</span>
                      <input class="table-options-input" data-field-position="${position}" data-field-property="optionsVariable" value="${u.escapeHtml(field.optionsVariable)}" placeholder="Ex.: TABSIT">
                    </label>
                    <label class="compact-checkbox-option">
                      <input type="checkbox" data-field-position="${position}" data-field-property="createOptionsTable" ${field.createOptionsTable ? "checked" : ""}>
                      Criar tabela na RG
                    </label>
                    <button class="button small table-items-button" data-field-action="configure-options" data-field-position="${position}" ${canConfigureItems ? "" : "disabled"}>
                      ${itemCount} ${itemCount === 1 ? "item" : "itens"}
                    </button>
                  </div>
                ` : `
                  <div class="field-context-card field-context-empty">
                    <span class="field-context-label">Tabela de opções</span>
                    <small>Não se aplica a este tipo de campo.</small>
                  </div>
                `}
              </div>
            </div>
          </div>
        </td>
      </tr>`;
  }

  function renderFields() {
    el.fieldsTableBody.innerHTML = "";

    state.fields.forEach((field, position) => {
      const row = document.createElement("tr");
      const configured = hasAdvancedConfiguration(field);

      row.innerHTML = `
        <td><div class="row-actions"><button class="icon-button" data-field-action="up" data-field-position="${position}" title="Mover para cima">↑</button><button class="icon-button" data-field-action="down" data-field-position="${position}" title="Mover para baixo">↓</button></div></td>
        <td><button class="icon-button remove" data-field-action="remove" data-field-position="${position}" title="Remover campo">×</button></td>
        <td><input class="table-text-input" data-field-position="${position}" data-field-property="description" value="${u.escapeHtml(field.description)}"></td>
        <td><input class="table-variable-input" data-field-position="${position}" data-field-property="variable" value="${u.escapeHtml(field.variable)}"></td>
        <td><select class="table-select" data-field-position="${position}" data-field-property="type">${typeOptions(field.type)}</select></td>
        <td><select class="field-location-select" data-field-position="${position}" data-field-property="tabId">${locationOptions(field)}</select></td>
        <td class="checkbox-cell"><input type="checkbox" data-field-position="${position}" data-field-property="isKey" ${isKeyField(field) ? "checked" : ""}></td>
        <td class="checkbox-cell"><input type="checkbox" data-field-position="${position}" data-field-property="required" ${field.required ? "checked" : ""}></td>
        <td class="checkbox-cell"><input type="checkbox" data-field-position="${position}" data-field-property="hasDisplay" ${field.hasDisplay ? "checked" : ""} ${canDisplay(field) ? "" : "disabled"}></td>
        <td>
          <button type="button" class="button small field-settings-button ${configured ? "configured" : ""}" data-field-action="toggle-details" data-field-position="${position}">
            ${expandedFieldIds.has(field.id) ? "Fechar" : "Configurar"}
          </button>
        </td>`;

      el.fieldsTableBody.appendChild(row);
      el.fieldsTableBody.insertAdjacentHTML("beforeend", renderFieldDetails(field, position));
    });

    el.fieldCount.textContent = `${state.fields.length} ${state.fields.length === 1 ? "campo" : "campos"}`;
  }

  function toggleDetails(position) {
    const field = state.fields[position];
    if (!field) return;

    if (expandedFieldIds.has(field.id)) expandedFieldIds.delete(field.id);
    else expandedFieldIds.add(field.id);

    renderFields();
  }

  function setAllDetails(open) {
    expandedFieldIds.clear();
    if (open) state.fields.forEach((field) => expandedFieldIds.add(field.id));
    renderFields();
  }

  function updateFromInput(target) {
    const position = Number(target.dataset.fieldPosition);
    const property = target.dataset.fieldProperty;

    if (!Number.isInteger(position) || !property || !state.fields[position]) {
      return;
    }

    const field = state.fields[position];
    const previousLocation = field.tabId || "parent";
    const previousType = field.type;
    const previousInputSize = Number(field.inputSize) || defaultInputSizeForType(previousType);
    let value =
      target.type === "checkbox"
        ? target.checked
        : target.type === "number"
          ? Number(target.value) || 0
          : target.value;

    if (property === "tabId") {
      alignFieldToLocation(field, value);
    } else if (property === "isKey") {
      if ((field.tabId || "parent") === "parent") {
        field.isKey = value;
        field.tabKey = false;
      } else {
        field.isKey = false;
        field.tabKey = value;
      }
    } else {
      field[property] = value;
    }

    if (property === "type") {
      const previousDefaultSize = defaultInputSizeForType(previousType);
      if (previousInputSize === previousDefaultSize || previousInputSize === 20) {
        field.inputSize = defaultInputSizeForType(value);
        field.displayColumn =
          (Number(field.inputColumn) || 1) + Number(field.inputSize) + 2;
      }

      if (["float", "decimal"].includes(value)) {
        field.decimalFormat =
          value === "float" ? "v3" : normalizedDecimalFormat(field);
      }
    }

    if (property === "type" && value === "date") {
      field.hasDisplay = false;
    }

    if (property === "type" && value === "multiSelect") {
      field.isKey = false;
      field.tabKey = false;
      field.hasDisplay = true;
      field.multiSelectTableVariable =
        field.multiSelectTableVariable ||
        `TAB${u.normalizeVariable(field.variable, "CAMPO")}`;
      field.multiSelectSelectedText =
        field.multiSelectSelectedText || "Selecionados";
      field.displayLoadMode = "valcp";

      if (
        field.lookupPreset &&
        field.lookupPreset !== "none" &&
        field.lookupPreset !== "custom"
      ) {
        field.generateF7Routine299 = true;
      }

      if (app.f7 && typeof app.f7.syncField === "function") {
        app.f7.syncField(field);
      }
    }

    if (property === "type" && value !== "multiSelect") {
      field.multiSelectTableVariable = "";
      field.multiSelectSelectedText = "Selecionados";
      field.multiSelectGlobalReference = "";
      field.generateF7Routine299 = false;
      field.f7GeneratedRoutineName = "";
      field.f7GeneratedLabel = "";
      field.f7AllGlobalReference = "";
      field.f7SelectedGlobalReference = "";
      field.f7GeneratedColumnSizes = "";
      field.f7GeneratedPieces = "";
      field.f7GeneratedTitles = "";
      field.f7GeneratedRows = 15;
    }

    if (property === "type" && !usesOptions(field)) {
      field.optionsVariable = "";
      field.createOptionsTable = false;
      field.optionsItems = [];
    }

    if (
      property === "createOptionsTable" &&
      value === true &&
      (!Array.isArray(field.optionsItems) || !field.optionsItems.length)
    ) {
      field.optionsItems = defaultOptionItems();
    }

    const layoutProperties = new Set([
      "description",
      "required",
      "inputSize",
      "displaySize",
      "hasDisplay",
      "type",
      "textAreaWidth"
    ]);

    if (property === "tabId") {
      if (previousLocation !== "parent") reflowLocation(previousLocation);
      if ((field.tabId || "parent") !== "parent") reflowLocation(field.tabId);
    } else if (layoutProperties.has(property) && (field.tabId || "parent") !== "parent") {
      reflowLocation(field.tabId);
    }

    if (property === "isKey" || property === "tabId") {
      app.indexes.syncWithKeys();
      app.indexes.render();
    }

    if (property === "variable" && app.fields.isKeyField(field)) {
      app.indexes.render();
    }

    if (["type", "decimalFormat", "hasDisplay", "createOptionsTable", "isKey", "tabId"].includes(property)) {
      renderFields();
    }

    if (
      property === "tabId" &&
      app.customButtons &&
      typeof app.customButtons.render === "function"
    ) {
      app.customButtons.render();
    }

    app.refresh();
  }

  function move(position, direction) {
    const destination = position + direction;
    if (destination < 0 || destination >= state.fields.length) return;

    [state.fields[position], state.fields[destination]] = [
      state.fields[destination],
      state.fields[position]
    ];

    renderFields();
    app.indexes.render();
    app.refresh();
  }

  function remove(position) {
    const locationId = state.fields[position]?.tabId || "parent";
    state.fields.splice(position, 1);
    if (locationId !== "parent") reflowLocation(locationId);
    app.indexes.syncWithKeys();
    renderFields();
    app.indexes.render();
    if (
      app.customButtons &&
      typeof app.customButtons.render === "function"
    ) {
      app.customButtons.render();
    }
    app.refresh();
  }

  function add(overrides = {}) {
    const field = createField(overrides);
    state.fields.push(field);
    if ((field.tabId || "parent") !== "parent") reflowLocation(field.tabId);
    app.indexes.syncWithKeys();
    renderFields();
    app.indexes.render();
    app.refresh();
  }

  function generatedOptionTables() {
    const seen = new Set();

    return mainFields().filter((field) => {
      if (!usesOptions(field) || !field.createOptionsTable) return false;

      const table = u.normalizeVariable(field.optionsVariable, "TABELA");
      if (seen.has(table)) return false;

      seen.add(table);
      return true;
    });
  }

  function fieldsForLocation(locationId, config = app.getConfig()) {
    return state.fields.filter(
      (field) => (field.tabId || "parent") === locationId
    );
  }

  function isGridTabField(field) {
    if (!field || !field.tabId || field.tabId === "parent") return false;
    const tab = state.tabs.find((item) => item.id === field.tabId);
    return tab?.contentType === "grid";
  }

  function dataVariableFor(field, config = app.getConfig()) {
    if (isAuxiliaryField(field)) {
      if (
        app.customButtons &&
        typeof app.customButtons.dataVariableForLocation === "function"
      ) {
        return app.customButtons.dataVariableForLocation(
          field.tabId,
          config
        );
      }

      return "DADOSAUX";
    }

    if (!config.useTabs || !field.tabId || field.tabId === "parent") {
      return config.dataVariable;
    }

    const tab = state.tabs.find((item) => item.id === field.tabId);
    return u.normalizeVariable(tab?.dataVariable, config.dataVariable);
  }

  function pieceAssignments(config = app.getConfig()) {
    const counters = new Map();
    const result = new Map();

    mainFields().forEach((field) => {
      if (isKeyField(field) || isMultiSelect(field) || isGridTabField(field)) return;

      const dataVariable = dataVariableFor(field, config);
      const piece = (counters.get(dataVariable) || 2) + 1;
      counters.set(dataVariable, piece);
      result.set(field.id, { dataVariable, piece });
    });

    return result;
  }

  function reference(field, config = app.getConfig()) {
    if (isMultiSelect(field)) {
      return multiSelectInputVariable(field);
    }

    if (isKeyField(field) || isGridTabField(field)) {
      return u.normalizeVariable(field.variable);
    }

    const assignment = pieceAssignments(config).get(field.id);
    return `$piece(${assignment.dataVariable},Z,${assignment.piece})`;
  }

  function dataVariables(config = app.getConfig()) {
    const variables = [];

    mainFields().forEach((field) => {
      if (isKeyField(field) || isMultiSelect(field) || isGridTabField(field)) return;

      const variable = dataVariableFor(field, config);
      if (!variables.includes(variable)) variables.push(variable);
    });

    return variables;
  }



  function keyFieldsForLocation(locationId, config = app.getConfig()) {
    return fieldsForLocation(locationId, config).filter(isKeyField);
  }

  function tabKeyFields(config = app.getConfig()) {
    if (!config.useTabs) return [];

    return mainFields().filter((field) => isTabKey(field) && !isGridTabField(field));
  }

  function tabKeyDefinitions(config = app.getConfig()) {
    const seenVariables = new Set();

    return tabKeyFields(config)
      .filter((field) => {
        const variable = u.normalizeVariable(field.variable);
        if (seenVariables.has(variable)) return false;

        seenVariables.add(variable);
        return true;
      })
      .map((field) => ({
        field,
        variable: u.normalizeVariable(field.variable),
        parameter: u.toParameter(field.description || field.variable)
      }));
  }

  function tabKeyMacArguments(config = app.getConfig()) {
    return tabKeyDefinitions(config).map((definition) => definition.variable);
  }

  function tabKeyRgParameters(config = app.getConfig()) {
    return tabKeyDefinitions(config).map((definition) => definition.parameter);
  }

  function tabKeyDefinitionsForVariable(
    dataVariable,
    config = app.getConfig()
  ) {
    const tabIds = new Set(
      state.tabs
        .filter(
          (tab) =>
            tab.contentType !== "grid" &&
            u.normalizeVariable(tab.dataVariable, config.dataVariable) ===
            u.normalizeVariable(dataVariable, config.dataVariable)
        )
        .map((tab) => tab.id)
    );

    return tabKeyDefinitions(config).filter((definition) =>
      tabIds.has(definition.field.tabId)
    );
  }

  function multiSelectFields(config = app.getConfig()) {
    return mainFields().filter(isMultiSelect);
  }

  function generatedOptionTablesForLocation(locationId) {
    const seen = new Set();

    return fieldsForLocation(locationId).filter((field) => {
      if (!usesOptions(field) || !field.createOptionsTable) return false;

      const table = u.normalizeVariable(field.optionsVariable, "TABELA");
      if (seen.has(table)) return false;

      seen.add(table);
      return true;
    });
  }

  function multiSelectTableVariable(field) {
    return u.normalizeVariable(
      field.multiSelectTableVariable,
      `TAB${u.normalizeVariable(field.variable, "CAMPO")}`
    );
  }

  function multiSelectInputVariable(field) {
    const variable = u.normalizeVariable(field.variable, "CAMPO");
    const tableVariable = multiSelectTableVariable(field);

    if (variable !== tableVariable) return variable;

    const suffix = variable.replace(/^TAB/i, "") || "ITEM";
    return u.normalizeVariable(`SEL${suffix}`, "SELITEM");
  }

  function multiSelectTableVariables(config = app.getConfig()) {
    return [...new Set(
      multiSelectFields(config).map(multiSelectTableVariable)
    )];
  }

  function defaultOptions(field) {
    return field.type === "checkbox"
      ? "TABCHK"
      : field.type === "radio"
        ? "TABRADIO"
        : "TABCOMBO";
  }

  function usesTypedReader(field) {
    return Boolean(
      field &&
      field.typedReaderEnabled === true &&
      String(field.typedReaderRoutine || "").trim()
    );
  }

  function typedReaderConfigVariable(field) {
    return u.normalizeVariable(
      field?.typedReaderConfigVariable,
      "CFGITE"
    );
  }

  app.fields = {
    canDisplay,
    hasDisplay,
    usesOptions,
    isMultiSelect,
    usesTypedReader,
    typedReaderConfigVariable,
    hasLookup,
    isAuxiliaryLocationId,
    isAuxiliaryField,
    mainFields,
    defaultInputSizeForType,
    normalizedDecimalFormat,
    isTabKey,
    isKeyField,
    createField,
    defaultLayout,
    layoutForLocation,
    reflowLocation,
    reflowAllLocations,
    applyTabAlignment,
    render: renderFields,
    toggleDetails,
    setAllDetails,
    updateFromInput,
    move,
    remove,
    add,
    generatedOptionTables,
    generatedOptionTablesForLocation,
    fieldsForLocation,
    isGridTabField,
    dataVariableFor,
    pieceAssignments,
    reference,
    dataVariables,
    keyFieldsForLocation,
    tabKeyFields,
    tabKeyDefinitions,
    tabKeyMacArguments,
    tabKeyRgParameters,
    tabKeyDefinitionsForVariable,
    multiSelectFields,
    multiSelectTableVariable,
    multiSelectInputVariable,
    multiSelectTableVariables,
    defaultOptions,
    defaultOptionItems
  };
})(window.GeradorRotinasJsonPadrao);
