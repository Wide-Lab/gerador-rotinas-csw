(function (app) {
  const { state, utils: u, el } = app;

  const columnTypes = [
    ["a", "Alfanumérico"],
    ["n", "Numérico"],
    ["d", "Data"],
    ["v0", "Valor — sem casas"],
    ["v1", "Valor — 1 casa"],
    ["v2", "Valor — 2 casas"],
    ["v3", "Valor — 3 casas"],
    ["v4", "Valor — 4 casas"],
    ["checkheader", "Check com cabeçalho"]
  ];

  const maintenanceTypes = [
    ["auto", "Automático"],
    ["string", "String"],
    ["integer", "Inteiro"],
    ["float", "Float"],
    ["decimal", "Decimal"],
    ["date", "Data"],
    ["combo", "ComboBox"]
  ];

  const gridSettingIds = new Set([
    "gridCode",
    "gridLinePosition",
    "gridHeight",
    "gridLineStart",
    "gridLineEnd",
    "gridNavigation",
    "gridWorkGlobal",
    "gridWorkGlobalParameters",
    "gridCheckGlobal",
    "gridEditLabel",
    "gridInlineMaintenance",
    "gridInlineSaveOnConfirm",
    "gridAutoButtonPosition",
    "gridMaintenanceButtonColumn",
    "gridMaintenanceButtonLine",
    "gridSaveButtonLine",
    "gridAllowInsert",
    "gridAllowRemove",
    "gridRowEnter",
    "gridUseConsultButton",
    "gridConsultButtonColumn",
    "gridConsultButtonLine",
    "gridFinalFocus",
    "gridAutoSequence"
  ]);

  function normalizeDynamicColumns(value) {
    if (!value || typeof value !== "object") return null;
    const load = String(value.load || "").trim();
    if (!load) return null;
    return {
      load,
      table: u.normalizeVariable(value.table || "TABCOLDIN", "TABCOLDIN"),
      firstWorkPiece: Number(value.firstWorkPiece) || 1
    };
  }

  function dynamicColumnsOf(config) {
    return config && config.gridDynamicColumns && !config.gridInTab ? config.gridDynamicColumns : null;
  }

  function autoSequenceMode(config) {
    const mode = String(config.gridAutoSequence || "").trim().toLowerCase();
    return ["auto", "editavel"].includes(mode) ? mode : "";
  }


  function normalizeWorkGlobalParameterSource(source) {
    const rawItems = Array.isArray(source)
      ? source
      : String(source || "")
          .split(/[;,]+/)
          .map((item) => item.trim())
          .filter(Boolean);

    const result = [];
    const used = new Set();

    rawItems.forEach((item, index) => {
      let name = "";
      let argument = "";

      if (item && typeof item === "object") {
        name = item.name || item.parameter || item.param || "";
        argument = item.argument || item.value || item.variable || item.expression || "";
      } else {
        const text = String(item || "").trim();
        const separator = text.includes("=") ? "=" : text.includes(":") ? ":" : "";
        if (separator) {
          const position = text.indexOf(separator);
          name = text.slice(0, position).trim();
          argument = text.slice(position + 1).trim();
        } else {
          name = text;
        }
      }

      name = u.normalizeParameter(name, `parametro${index + 1}`);
      if (!name || used.has(name.toLowerCase())) return;
      used.add(name.toLowerCase());

      result.push({
        name,
        argument: String(argument || "").trim()
      });
    });

    return result.length
      ? result
      : [
          { name: "term", argument: "CT" },
          { name: "codSequencia", argument: "CODSEQUENCIA" }
        ];
  }

  function serializeWorkGlobalParameters(parameters) {
    return normalizeWorkGlobalParameterSource(parameters)
      .map((item) => `${item.name}=${item.argument}`)
      .join(",");
  }

  function readWorkGlobalParameterEditor() {
    if (!el.gridWorkGlobalParametersList) {
      return normalizeWorkGlobalParameterSource(el.gridWorkGlobalParameters?.value);
    }

    const rows = [...el.gridWorkGlobalParametersList.querySelectorAll("[data-mtemp-parameter-row]")];
    const parameters = rows.map((row, index) => ({
      name: u.normalizeParameter(
        row.querySelector('[data-mtemp-property="name"]')?.value,
        `parametro${index + 1}`
      ),
      argument: String(
        row.querySelector('[data-mtemp-property="argument"]')?.value || ""
      ).trim()
    }));

    return normalizeWorkGlobalParameterSource(parameters);
  }

  function syncWorkGlobalParameterHidden() {
    if (!el.gridWorkGlobalParameters) return;
    el.gridWorkGlobalParameters.value = serializeWorkGlobalParameters(
      readWorkGlobalParameterEditor()
    );
  }

  function renderWorkGlobalParameterEditor(source) {
    const parameters = normalizeWorkGlobalParameterSource(source);

    if (el.gridWorkGlobalParameters) {
      el.gridWorkGlobalParameters.value = serializeWorkGlobalParameters(parameters);
    }

    if (!el.gridWorkGlobalParametersList) return;

    el.gridWorkGlobalParametersList.innerHTML = parameters
      .map((item, index) => `
        <tr data-mtemp-parameter-row data-mtemp-position="${index}">
          <td>
            <input
              data-mtemp-property="name"
              value="${u.escapeHtml(item.name)}"
              placeholder="Ex.: codEmpresa"
            >
          </td>
          <td>
            <input
              data-mtemp-property="argument"
              value="${u.escapeHtml(item.argument)}"
              placeholder="Ex.: CODEMP"
            >
          </td>
          <td>
            <span class="mtemp-parameter-role ${index === parameters.length - 1 ? "record" : "context"}">
              ${index === parameters.length - 1 ? "Chave da linha" : "Contexto"}
            </span>
          </td>
          <td>
            <button
              type="button"
              class="icon-button remove"
              data-mtemp-action="remove"
              data-mtemp-position="${index}"
              title="Remover parâmetro"
              ${parameters.length <= 1 ? "disabled" : ""}
            >×</button>
          </td>
        </tr>`)
      .join("");
  }

  function cloneColumns(columns) {
    return Array.isArray(columns)
      ? columns.map((column, index) => {
          const type = normalizeColumnType(column.type);
          const checkHeader = type === "checkheader";
          return {
            ...column,
            id: column.id || u.createId(),
            type,
            title: checkHeader ? String(column.title || "") : (column.title || `Coluna ${index + 1}`),
            width: Number(column.width) || (checkHeader ? 10 : 20),
            variable: u.normalizeVariable(column.variable, checkHeader ? `CHECK${index + 1}` : `COLUNA${index + 1}`),
            workPiece: checkHeader ? 0 : column.workPiece,
            displayOnly: checkHeader ? true : column.displayOnly === true,
            displayExpression: checkHeader ? "" : String(column.displayExpression || ""),
            detail: checkHeader ? false : column.detail === true,
            recordKey: checkHeader ? false : column.recordKey === true,
            editable: checkHeader ? false : column.editable === true,
            maintenanceType: checkHeader ? "auto" : (column.maintenanceType || "auto"),
            required: checkHeader ? false : column.required === true,
            lockOnEdit: checkHeader ? false : column.lockOnEdit === true,
            optionsItems: checkHeader ? [] : normalizeOptionItems(column.optionsItems)
          };
        })
      : [];
  }

  function lastFieldLine(locationId = "parent") {
    const fields = state.fields.filter(
      (field) => (field.tabId || "parent") === locationId
    );

    if (!fields.length) return locationId === "parent" ? 0 : -1;

    return Math.max(
      ...fields.map((field) =>
        Math.max(
          Number(field.labelLine) || 0,
          // A área de texto ocupa mais de uma linha; o que vem depois começa
          // abaixo dela, não da primeira linha dela.
          (Number(field.inputLine) || 0) + fieldHeight(field) - 1,
          field.hasDisplay === true ? Number(field.displayLine) || 0 : 0
        )
      )
    );
  }

  function buttonsAboveGridLines(locationId, fieldsLine) {
    if (!app.customButtons || typeof app.customButtons.buttonsForLocation !== "function") return [];
    return app.customButtons
      .buttonsForLocation(locationId)
      .filter((button) => button.positionMode === "manual")
      .map((button) => Number(button.line) || 0)
      .filter((line) => line > 0 && line <= Math.max(fieldsLine, 0) + 1);
  }

  function fieldHeight(field) {
    return field.type === "textArea" ? Math.max(1, Number(field.textAreaHeight) || 3) : 1;
  }

  function suggestedGridLinePosition(locationId = "parent") {
    const fieldsLine = lastFieldLine(locationId);
    const lastLine = Math.max(fieldsLine, ...buttonsAboveGridLines(locationId, fieldsLine));

    if (lastLine < 0) return 1;
    if (lastLine === 0) return 2;

    if (locationId === "parent" && app.getConfig().routineMode === "grid") return lastLine + 1;

    return lastLine + 2;
  }

  function defaultSettings(locationId, overrides = {}) {
    const base = app.getConfig();
    const tabIndex = state.tabs.findIndex((tab) => tab.id === locationId);
    const tab = tabIndex >= 0 ? state.tabs[tabIndex] : null;
    const routineName = tab
      ? u.normalizeVariable(tab.routineName, `${base.routineName}TAB${tabIndex + 1}`)
      : base.routineName;
    const defaultCode = tab ? (tabIndex + 1) * 10 + 1 : 1;
    const gridLineEnd = Number(overrides.gridLineEnd) || 20;
    const suggestedMaintenanceLine = gridLineEnd + 4;
    const suggestedSaveLine = suggestedMaintenanceLine + 2;

    return {
      gridCode: Number(overrides.gridCode) || defaultCode,
      gridLinePosition:
        Number(overrides.gridLinePosition) || suggestedGridLinePosition(locationId),
      gridLinePositionAuto: overrides.gridLinePositionAuto !== false,
      gridColumnPosition: Number(overrides.gridColumnPosition) || 0,
      gridDynamicColumns: normalizeDynamicColumns(overrides.gridDynamicColumns),
      gridTableWidth: Number(overrides.gridTableWidth) || 0,
      gridHeight: Number(overrides.gridHeight) || 17,
      gridLineStart: Number(overrides.gridLineStart) || 2,
      gridLineEnd,
      gridNavigation: Number(overrides.gridNavigation) === 0 ? 0 : 1,
      gridWorkGlobal: String(overrides.gridWorkGlobal || `mtemp${routineName}`)
        .replace(/^\^/, "")
        .replace(/[^a-zA-Z0-9%]/g, ""),
      gridWorkGlobalParameters: normalizeWorkGlobalParameterSource(
        overrides.gridWorkGlobalParameters ||
        overrides.workGlobalParameters ||
        "term=CT,codSequencia=CODSEQUENCIA"
      ),
      gridCheckGlobal: String(overrides.gridCheckGlobal || `mtemp${routineName}CHECK`)
        .replace(/^\^/, "")
        .replace(/[^a-zA-Z0-9%]/g, ""),
      gridEditLabel: u.sanitize(overrides.gridEditLabel || "TbCellClick"),
      gridMaintenance: overrides.gridMaintenance === true,
      gridInlineMaintenance: overrides.gridInlineMaintenance === true || overrides.gridMaintenance === true,
      gridInlineSaveOnConfirm: overrides.gridInlineSaveOnConfirm === true,
      gridAutoButtonPosition: overrides.gridAutoButtonPosition !== false,
      gridMaintenanceButtonColumn: Number(overrides.gridMaintenanceButtonColumn) || 1,
      gridMaintenanceButtonLine:
        Number(overrides.gridMaintenanceButtonLine) || suggestedMaintenanceLine,
      gridMaintenanceButtonLineAuto:
        overrides.gridMaintenanceButtonLineAuto !== false,
      gridSaveButtonLine:
        Number(overrides.gridSaveButtonLine) || suggestedSaveLine,
      gridSaveButtonLineAuto: overrides.gridSaveButtonLineAuto !== false,
      gridAllowInsert: overrides.gridAllowInsert !== false,
      gridAllowRemove: overrides.gridAllowRemove !== false,
      gridRowEnter: overrides.gridRowEnter !== false,
      gridUseConsultButton: overrides.gridUseConsultButton !== false,
      gridConsultButtonColumn: Number(overrides.gridConsultButtonColumn) || 86,
      gridConsultButtonLine: Number(overrides.gridConsultButtonLine) || 1,
      gridFinalFocus: String(overrides.gridFinalFocus || "auto").trim() || "auto",
      gridAutoSequence: ["auto", "editavel"].includes(String(overrides.gridAutoSequence || "").trim().toLowerCase())
        ? String(overrides.gridAutoSequence).trim().toLowerCase()
        : ""
    };
  }

  function definitionFor(locationId) {
    if (locationId === "parent") return state.parentGrid;
    const tab = state.tabs.find((item) => item.id === locationId);
    return tab ? tab.grid : null;
  }

  function setDefinition(locationId, definition) {
    if (locationId === "parent") {
      state.parentGrid = definition;
      return;
    }

    const tab = state.tabs.find((item) => item.id === locationId);
    if (tab) tab.grid = definition;
  }

  function ensureLocation(locationId = "parent", overrides = {}) {
    let definition = definitionFor(locationId);

    if (!definition) {
      definition = {
        locationId,
        settings: defaultSettings(locationId, overrides),
        columns: cloneColumns(overrides.columns)
      };
      setDefinition(locationId, definition);
    } else if (Object.keys(overrides).length) {
      definition.settings = {
        ...definition.settings,
        ...defaultSettings(locationId, { ...definition.settings, ...overrides })
      };
      if (Array.isArray(overrides.columns)) {
        definition.columns = cloneColumns(overrides.columns);
      }
    }

    return definition;
  }

  function readSettingsFromEditor() {
    const currentDefinition = definitionFor(state.activeGridLocation || "parent");
    const currentSettings = currentDefinition?.settings || {};

    const automaticButtonPosition = el.gridAutoButtonPosition
      ? el.gridAutoButtonPosition.checked
      : currentSettings.gridAutoButtonPosition !== false;
    const gridEnd = Number(el.gridLineEnd.value) || 20;

    return {
      gridCode: Number(el.gridCode.value) || 1,
      gridLinePosition:
        Number(el.gridLinePosition.value) || suggestedGridLinePosition(state.activeGridLocation || "parent"),
      gridLinePositionAuto: currentSettings.gridLinePositionAuto !== false,
      gridColumnPosition: Number(currentSettings.gridColumnPosition) || 0,
      gridDynamicColumns: normalizeDynamicColumns(currentSettings.gridDynamicColumns),
      gridTableWidth: Number(currentSettings.gridTableWidth) || 0,
      gridHeight: Number(el.gridHeight.value) || 17,
      gridLineStart: Number(el.gridLineStart.value) || 2,
      gridLineEnd: Number(el.gridLineEnd.value) || 20,
      gridNavigation: Number(el.gridNavigation.value) === 0 ? 0 : 1,
      gridWorkGlobal: String(el.gridWorkGlobal.value || "")
        .replace(/^\^/, "")
        .replace(/[^a-zA-Z0-9%]/g, ""),
      gridWorkGlobalParameters: readWorkGlobalParameterEditor(),
      gridCheckGlobal: String(el.gridCheckGlobal?.value || currentSettings.gridCheckGlobal || "")
        .replace(/^\^/, "")
        .replace(/[^a-zA-Z0-9%]/g, ""),
      gridEditLabel: u.sanitize(el.gridEditLabel.value) || "TbCellClick",
      gridMaintenance: el.gridInlineMaintenance.checked,
      gridInlineMaintenance: el.gridInlineMaintenance.checked,
      gridInlineSaveOnConfirm: el.gridInlineSaveOnConfirm ? el.gridInlineSaveOnConfirm.checked : false,
      gridAutoButtonPosition: automaticButtonPosition,
      gridMaintenanceButtonColumn: automaticButtonPosition
        ? 1
        : Number(el.gridMaintenanceButtonColumn.value) || 1,
      gridMaintenanceButtonLine: automaticButtonPosition
        ? gridEnd + 4
        : Number(el.gridMaintenanceButtonLine.value) || gridEnd + 4,
      gridMaintenanceButtonLineAuto: automaticButtonPosition,
      gridSaveButtonLine: automaticButtonPosition
        ? gridEnd + 6
        : Number(el.gridSaveButtonLine.value) || gridEnd + 6,
      gridSaveButtonLineAuto: automaticButtonPosition,
      gridAllowInsert: el.gridAllowInsert.checked,
      gridAllowRemove: el.gridAllowRemove.checked,
      gridRowEnter: el.gridRowEnter.checked,
      gridUseConsultButton: el.gridUseConsultButton?.checked !== false,
      gridConsultButtonColumn: Number(el.gridConsultButtonColumn?.value) || 86,
      gridConsultButtonLine: Number(el.gridConsultButtonLine?.value) || 1,
      gridFinalFocus: String(el.gridFinalFocus?.value || "auto").trim() || "auto",
      gridAutoSequence: el.gridAutoSequence
        ? String(el.gridAutoSequence.value || "")
        : String(currentSettings.gridAutoSequence || "")
    };
  }

  function writeSettingsToEditor(settings) {
    el.gridCode.value = settings.gridCode;
    el.gridLinePosition.value = settings.gridLinePosition;
    el.gridHeight.value = settings.gridHeight;
    el.gridLineStart.value = settings.gridLineStart;
    el.gridLineEnd.value = settings.gridLineEnd;
    el.gridNavigation.value = String(settings.gridNavigation);
    el.gridWorkGlobal.value = settings.gridWorkGlobal;
    renderWorkGlobalParameterEditor(
      settings.gridWorkGlobalParameters || "term=CT,codSequencia=CODSEQUENCIA"
    );
    if (el.gridCheckGlobal) el.gridCheckGlobal.value = settings.gridCheckGlobal || `${settings.gridWorkGlobal || "mtempGRID"}CHECK`;
    el.gridEditLabel.value = settings.gridEditLabel;
    el.gridInlineMaintenance.checked = settings.gridMaintenance === true;
    if (el.gridInlineSaveOnConfirm) {
      el.gridInlineSaveOnConfirm.checked = settings.gridInlineSaveOnConfirm === true;
    }
    if (el.gridAutoButtonPosition) {
      el.gridAutoButtonPosition.checked = settings.gridAutoButtonPosition !== false;
    }
    el.gridMaintenanceButtonColumn.value = settings.gridMaintenanceButtonColumn;
    el.gridMaintenanceButtonLine.value = settings.gridMaintenanceButtonLine;
    el.gridSaveButtonLine.value = settings.gridSaveButtonLine;
    el.gridAllowInsert.checked = settings.gridAllowInsert !== false;
    el.gridAllowRemove.checked = settings.gridAllowRemove !== false;
    if (el.gridAutoSequence) el.gridAutoSequence.value = settings.gridAutoSequence || "";
    el.gridRowEnter.checked = settings.gridRowEnter !== false;
    if (el.gridUseConsultButton) el.gridUseConsultButton.checked = settings.gridUseConsultButton !== false;
    if (el.gridConsultButtonColumn) el.gridConsultButtonColumn.value = settings.gridConsultButtonColumn || 86;
    if (el.gridConsultButtonLine) el.gridConsultButtonLine.value = settings.gridConsultButtonLine || 1;
    renderFinalFocusOptions(settings.gridFinalFocus);

    if (el.gridMaintenanceOptions) {
      el.gridMaintenanceOptions.classList.toggle(
        "hidden",
        settings.gridMaintenance !== true
      );
    }

    if (el.gridManualButtonPosition) {
      el.gridManualButtonPosition.classList.toggle(
        "hidden",
        settings.gridAutoButtonPosition !== false
      );
    }

    if (el.gridAutoButtonPositionSummary) {
      el.gridAutoButtonPositionSummary.classList.toggle(
        "hidden",
        settings.gridAutoButtonPosition === false
      );
    }
  }

  function isEditingWorkGlobalParameters() {
    return Boolean(
      el.gridWorkGlobalParametersList &&
      document.activeElement &&
      el.gridWorkGlobalParametersList.contains(document.activeElement)
    );
  }

  function applyPositionSuggestions() {
    const definitions = [];

    if (state.parentGrid) definitions.push(state.parentGrid);

    state.tabs.forEach((tab) => {
      if (tab.grid) definitions.push(tab.grid);
    });

    definitions.forEach((definition) => {
      const settings = definition.settings;
      if (!settings) return;

      if (settings.gridLinePositionAuto !== false) {
        settings.gridLinePosition = suggestedGridLinePosition(
          definition.locationId || "parent"
        );
      }

      if (settings.gridAutoButtonPosition !== false) {
        settings.gridMaintenanceButtonColumn = 1;
        settings.gridMaintenanceButtonLine =
          (Number(settings.gridLineEnd) || 20) + 4;
        settings.gridSaveButtonLine =
          (Number(settings.gridLineEnd) || 20) + 6;
        settings.gridMaintenanceButtonLineAuto = true;
        settings.gridSaveButtonLineAuto = true;
      }
    });

    const activeDefinition = definitionFor(state.activeGridLocation || "parent");
    if (activeDefinition && !isEditingWorkGlobalParameters()) {
      writeSettingsToEditor(activeDefinition.settings);
    }
  }

  function markPositionManual(property) {
    const definition = ensureLocation(state.activeGridLocation || "parent");
    if (!definition?.settings) return;

    const flags = {
      gridLinePosition: "gridLinePositionAuto",
      gridMaintenanceButtonLine: "gridMaintenanceButtonLineAuto",
      gridSaveButtonLine: "gridSaveButtonLineAuto"
    };

    const flag = flags[property];
    if (flag) definition.settings[flag] = false;
    definition.settings.gridAutoButtonPosition = false;

    if (el.gridAutoButtonPosition) el.gridAutoButtonPosition.checked = false;
    if (el.gridManualButtonPosition) el.gridManualButtonPosition.classList.remove("hidden");
    if (el.gridAutoButtonPositionSummary) el.gridAutoButtonPositionSummary.classList.add("hidden");
  }

  function saveActive() {
    const available = availableLocations();
    const fallbackLocation = available.length ? available[0].value : "parent";
    const locationId = state.activeGridLocation || fallbackLocation;
    const definition = definitionFor(locationId);
    if (!definition) return;

    definition.settings = readSettingsFromEditor();
    definition.columns = state.gridColumns;
  }

  function selectLocation(locationId = "parent") {
    if (state.activeGridLocation && state.activeGridLocation !== locationId) {
      saveActive();
    }

    const definition = ensureLocation(locationId);
    state.activeGridLocation = locationId;
    state.gridColumns = definition.columns;
    writeSettingsToEditor(definition.settings);

    if (el.gridLocation && el.gridLocation.value !== locationId) {
      el.gridLocation.value = locationId;
    }

    render();
  }

  function availableLocations() {
    const result = [];

    if (el.routineMode.value === "grid") {
      result.push({ value: "parent", label: "Rotina principal" });
      ensureLocation("parent");
    }

    if (el.useTabs.checked) {
      state.tabs.forEach((tab, index) => {
        if (tab.contentType !== "grid") return;
        ensureLocation(tab.id);
        result.push({
          value: tab.id,
          label: `Aba ${index + 1} - ${tab.title}`
        });
      });
    }

    return result;
  }

  function syncLocations() {
    const locations = availableLocations();
    const current = state.activeGridLocation;

    if (!el.gridLocation) {
      if (!locations.length) {
        state.gridColumns = [];
        render();
        return;
      }

      const selected = locations.some((item) => item.value === current)
        ? current
        : locations[0].value;

      selectLocation(selected);
      return;
    }

    el.gridLocation.innerHTML = locations
      .map((item) => `<option value="${item.value}">${u.escapeHtml(item.label)}</option>`)
      .join("");

    if (!locations.length) {
      state.gridColumns = [];
      render();
      return;
    }

    const selected = locations.some((item) => item.value === current)
      ? current
      : locations[0].value;

    selectLocation(selected);
  }

  function removeLocation(locationId) {
    if (locationId === "parent") {
      state.parentGrid = null;
    } else {
      const tab = state.tabs.find((item) => item.id === locationId);
      if (tab) tab.grid = null;
    }

    if (state.activeGridLocation === locationId) {
      state.activeGridLocation = "parent";
    }
  }

  function resetLocations() {
    state.parentGrid = null;
    state.tabs.forEach((tab) => { tab.grid = null; });
    state.activeGridLocation = "parent";
    state.gridColumns = [];
  }

  function isGridSettingElement(element) {
    return Boolean(element && gridSettingIds.has(element.id));
  }

  function configFor(locationId, baseConfig = app.getConfig()) {
    if (state.activeGridLocation === locationId) saveActive();

    const definition = ensureLocation(locationId);
    const tabIndex = state.tabs.findIndex((tab) => tab.id === locationId);
    const tab = tabIndex >= 0 ? state.tabs[tabIndex] : null;
    const routineName = tab
      ? u.normalizeVariable(tab.routineName, `${baseConfig.routineName}TAB${tabIndex + 1}`)
      : baseConfig.routineName;
    const rgRoutineName = tab
      ? u.normalizeVariable(tab.gridRgRoutineName, `${routineName}RG`)
      : baseConfig.rgRoutineName;

    return {
      ...baseConfig,
      ...definition.settings,
      routineName,
      rgRoutineName,
      title: tab ? `${baseConfig.title} - ${tab.title}` : baseConfig.title,
      gridLocationId: locationId,
      gridInTab: Boolean(tab),
      gridTab: tab,
      gridTabIndex: tabIndex,
      gridGlobalSubscript: tab ? String(tab.globalSubscript || "").trim() : "",
      parentRoutineName: baseConfig.routineName,
      parentRgRoutineName: baseConfig.rgRoutineName,
      gridColumns: definition.columns
    };
  }

  function withLocation(locationId, callback, baseConfig = app.getConfig()) {
    if (state.activeGridLocation === locationId) saveActive();
    const definition = ensureLocation(locationId);
    const previous = state.gridColumns;
    state.gridColumns = definition.columns;

    try {
      return callback(configFor(locationId, baseConfig));
    } finally {
      state.gridColumns = previous;
    }
  }

  function normalizeOptionItems(items) {
    if (!Array.isArray(items)) return [];

    return items.map((item) => ({
      id: item.id || u.createId(),
      value: String(item.value ?? ""),
      description: String(item.description ?? "")
    }));
  }

  function defaultOptionItems() {
    return app.fields && typeof app.fields.defaultOptionItems === "function"
      ? app.fields.defaultOptionItems()
      : [
          { id: u.createId(), value: "0", description: "Inativo" },
          { id: u.createId(), value: "1", description: "Ativo" }
        ];
  }

  function normalizeColumnType(value) {
    const clean = String(value || "a").trim().toLowerCase();
    if (["check", "checkbox", "check-header", "check_header", "checkheader"].includes(clean)) {
      return "checkheader";
    }
    if (["n", "integer", "inteiro", "number", "numeric", "numero", "numérico", "numerico"].includes(clean)) {
      return "n";
    }
    if (["d", "date", "data"].includes(clean)) return "d";
    if (/^v[0-9]$/.test(clean)) return clean;
    if (["decimal", "float", "value", "valor"].includes(clean)) return "v3";
    if (["a", "string", "text", "texto", "alphanumeric", "alfanumerico", "alfanumérico"].includes(clean)) {
      return "a";
    }
    return "a";
  }

  function isCheckColumn(column) {
    return normalizeColumnType(column?.type) === "checkheader";
  }

  function checkColumns() {
    return state.gridColumns
      .map((column, index) => ({ column, piece: index + 1 }))
      .filter(({ column }) => isCheckColumn(column));
  }

  function hasCheckColumns() {
    return checkColumns().length > 0;
  }

  function checkActionLabel(config) {
    return config.gridMaintenance ? "3900" : "4000";
  }

  function checkGlobalReference(config) {
    const name = String(config.gridCheckGlobal || `mtemp${config.routineName}CHECK`)
      .replace(/^\^/, "")
      .replace(/[^a-zA-Z0-9%]/g, "");
    return `^${name || `mtemp${config.routineName}CHECK`}`;
  }

  function inferredMaintenanceType(column) {
    if (column.type === "n") return "integer";
    if (column.type === "d") return "date";
    if (/^v[0-9]$/.test(column.type)) return "decimal";
    return "string";
  }

  function createColumn(overrides = {}) {
    const position = state.gridColumns.length + 1;
    const type = normalizeColumnType(overrides.type || "a");
    const checkHeader = type === "checkheader";
    const recordKey = !checkHeader && overrides.recordKey === true;

    return {
      id: overrides.id || u.createId(),
      title: checkHeader ? String(overrides.title || "") : (overrides.title || `Coluna ${position}`),
      type,
      width: Number(overrides.width) || (checkHeader ? 10 : 20),
      variable: u.normalizeVariable(overrides.variable, checkHeader ? `CHECK${position}` : `COLUNA${position}`),
      workPiece:
        checkHeader
          ? 0
          : overrides.workPiece === undefined
            ? (recordKey ? 0 : Math.max(1, position - 1))
            : Math.max(0, Number(overrides.workPiece) || 0),
      displayOnly: checkHeader ? true : overrides.displayOnly === true,
      displayExpression: checkHeader ? "" : String(overrides.displayExpression || ""),
      detail: checkHeader ? false : (overrides.detail === true || recordKey),
      recordKey,
      editable: checkHeader ? false : overrides.editable === false ? false : (overrides.editable === true || recordKey),
      maintenanceType: checkHeader ? "auto" : (overrides.maintenanceType || "auto"),
      required: checkHeader ? false : (overrides.required === true || recordKey),
      lockOnEdit: checkHeader ? false : (overrides.lockOnEdit === undefined ? recordKey : overrides.lockOnEdit === true),
      lookupPreset: checkHeader ? "none" : String(overrides.lookupPreset || "none"),
      initializerCode: checkHeader ? "" : String(overrides.initializerCode || ""),
      obtainCode: checkHeader ? "" : String(overrides.obtainCode || ""),
      f7Routine: checkHeader ? "" : String(overrides.f7Routine || ""),
      f8Routine: checkHeader ? "" : String(overrides.f8Routine || ""),
      backgroundColor: checkHeader ? "" : String(overrides.backgroundColor || ""),
      fontColor: checkHeader ? "" : String(overrides.fontColor || ""),
      clickLabel: checkHeader ? "" : String(overrides.clickLabel || ""),
      actionMenu: checkHeader || !Array.isArray(overrides.actionMenu)
        ? []
        : overrides.actionMenu
          .filter((item) => item && String(item.text || "").trim() && String(item.label || "").trim())
          .map((item) => ({ text: String(item.text).trim(), label: String(item.label).trim() })),
      extraVariables: String(overrides.extraVariables || ""),
      ruleVariables: String(overrides.ruleVariables || ""),
      valcpCode: checkHeader ? "" : String(overrides.valcpCode || ""),
      optionsVariable: checkHeader ? "" : u.normalizeVariable(
        overrides.optionsVariable,
        (overrides.maintenanceType || "auto") === "combo" ? "TABSET" : ""
      ),
      createOptionsTable: checkHeader ? false : overrides.createOptionsTable === true,
      optionsItems: checkHeader
        ? []
        : normalizeOptionItems(overrides.optionsItems).length
          ? normalizeOptionItems(overrides.optionsItems)
          : overrides.createOptionsTable === true
            ? defaultOptionItems()
            : [],
      defaultValue: checkHeader ? "" : String(overrides.defaultValue ?? "")
    };
  }

  function loadDefaultColumns() {
    state.gridColumns = [
      createColumn({
        title: "Código Registro",
        type: "n",
        width: 10,
        variable: "CODSEQUENCIA",
        workPiece: 0,
        detail: true,
        recordKey: true,
        editable: true,
        maintenanceType: "integer",
        required: true,
        lockOnEdit: true
      }),
      createColumn({
        title: "Descrição Registro",
        type: "a",
        width: 30,
        variable: "DESCRICAO",
        workPiece: 1,
        displayOnly: true
      }),
      createColumn({
        title: "Situação",
        type: "a",
        width: 12,
        variable: "SITUACAO",
        workPiece: 2,
        editable: true,
        maintenanceType: "combo",
        required: true,
        optionsVariable: "TABSIT",
        displayExpression: "$get(TABSIT({value}))",
        createOptionsTable: true,
        optionsItems: [
          { value: "0", description: "Inativo" },
          { value: "1", description: "Ativo" }
        ],
        defaultValue: "1"
      }),
      createColumn({
        title: "Data Geração",
        type: "d",
        width: 12,
        variable: "DATAREGISTRO",
        workPiece: 3
      }),
      createColumn({
        title: "Observação",
        type: "a",
        width: 40,
        variable: "OBSERVACAO",
        workPiece: 4
      })
    ];

    const definition = ensureLocation(state.activeGridLocation || "parent");
    definition.columns = state.gridColumns;
    render();
  }

  function optionsHtml(options, selected) {
    return options
      .map(([value, label]) =>
        `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`
      )
      .join("");
  }

  function render() {
    renderFinalFocusOptions();

    if (!el.gridColumnsTableBody) return;

    el.gridColumnsTableBody.innerHTML = "";

    if (!state.gridColumns.length) {
      el.gridColumnsTableBody.innerHTML =
        '<tr><td colspan="20" class="empty-row">Nenhuma coluna configurada.</td></tr>';
      return;
    }

    state.gridColumns.forEach((column, position) => {
      const row = document.createElement("tr");
      const maintenanceType = column.maintenanceType || "auto";
      const checkHeader = isCheckColumn(column);
      const displayOnly = checkHeader || column.displayOnly === true;
      const editable = !checkHeader && column.editable === true && !displayOnly;
      const combo = (maintenanceType === "combo") ||
        (maintenanceType === "auto" && inferredMaintenanceType(column) === "combo");
      const lookupConfigured = Boolean(
        String(column.initializerCode || "").trim() ||
        String(column.obtainCode || "").trim() ||
        String(column.displayExpression || "").trim() ||
        String(column.f7Routine || "").trim() ||
        String(column.valcpCode || "").trim()
      );
      const canConfigureCombo = editable && maintenanceType === "combo";
      const comboItemCount = Array.isArray(column.optionsItems)
        ? column.optionsItems.length
        : 0;

      row.innerHTML = `
        <td>
          <div class="row-actions">
            <button type="button" class="icon-button" data-grid-action="up" data-grid-position="${position}">↑</button>
            <button type="button" class="icon-button" data-grid-action="down" data-grid-position="${position}">↓</button>
          </div>
        </td>
        <td><button type="button" class="icon-button remove" data-grid-action="remove" data-grid-position="${position}" title="Remover coluna do Grid">×</button></td>
        <td><input class="grid-title-input" data-grid-position="${position}" data-grid-property="title" value="${u.escapeHtml(column.title)}"></td>
        <td><select class="grid-type-select" data-grid-position="${position}" data-grid-property="type">${optionsHtml(columnTypes, column.type)}</select></td>
        <td><input class="grid-width-input" type="number" min="1" data-grid-position="${position}" data-grid-property="width" value="${column.width}"></td>
        <td><input class="grid-variable-input" data-grid-position="${position}" data-grid-property="variable" value="${u.escapeHtml(column.variable)}" ${checkHeader ? "disabled" : ""}></td>
        <td><input class="grid-work-piece-input" type="number" min="1" data-grid-position="${position}" data-grid-property="workPiece" value="${displayOnly ? "" : column.workPiece}" ${column.recordKey || displayOnly ? "disabled" : ""} placeholder="—"></td>
        <td class="checkbox-cell"><input type="checkbox" data-grid-position="${position}" data-grid-property="displayOnly" ${displayOnly ? "checked" : ""} ${column.recordKey || checkHeader ? "disabled" : ""}></td>
        <td><input class="grid-display-input" data-grid-position="${position}" data-grid-property="displayExpression" value="${u.escapeHtml(column.displayExpression)}" placeholder="Ex.: $piece(FTCL,Z,2)" ${checkHeader ? "disabled" : ""}></td>
        <td class="checkbox-cell"><input type="checkbox" data-grid-position="${position}" data-grid-property="detail" ${column.detail ? "checked" : ""} ${checkHeader ? "disabled" : ""}></td>
        <td class="checkbox-cell"><input type="checkbox" data-grid-position="${position}" data-grid-property="recordKey" ${column.recordKey ? "checked" : ""} ${checkHeader ? "disabled" : ""}></td>
        <td class="checkbox-cell"><input type="checkbox" data-grid-position="${position}" data-grid-property="editable" ${editable ? "checked" : ""} ${checkHeader ? "disabled" : ""}></td>
        <td><select class="grid-maintenance-type-select" data-grid-position="${position}" data-grid-property="maintenanceType" ${editable ? "" : "disabled"}>${optionsHtml(maintenanceTypes, maintenanceType)}</select></td>
        <td class="checkbox-cell"><input type="checkbox" data-grid-position="${position}" data-grid-property="required" ${column.required ? "checked" : ""} ${editable ? "" : "disabled"}></td>
        <td class="checkbox-cell"><input type="checkbox" data-grid-position="${position}" data-grid-property="lockOnEdit" ${column.lockOnEdit ? "checked" : ""} ${editable ? "" : "disabled"}></td>
        <td>
          <button
            type="button"
            class="button small grid-lookup-button ${lookupConfigured ? "configured" : ""}"
            data-grid-action="configure-lookup"
            data-grid-position="${position}"
            ${checkHeader ? "disabled" : ""}
          >
            ${lookupConfigured ? "Configurado" : "Configurar"}
          </button>
        </td>
        <td>
          <input
            class="grid-options-input"
            data-grid-position="${position}"
            data-grid-property="optionsVariable"
            value="${u.escapeHtml(column.optionsVariable)}"
            placeholder="Ex.: TABSET"
            ${canConfigureCombo ? "" : "disabled"}
          >
        </td>
        <td class="checkbox-cell">
          <input
            type="checkbox"
            data-grid-position="${position}"
            data-grid-property="createOptionsTable"
            ${column.createOptionsTable ? "checked" : ""}
            ${canConfigureCombo ? "" : "disabled"}
          >
        </td>
        <td>
          <button
            type="button"
            class="button small grid-combo-items-button ${column.createOptionsTable ? "configured" : ""}"
            data-grid-action="configure-options"
            data-grid-position="${position}"
            ${canConfigureCombo && column.createOptionsTable ? "" : "disabled"}
          >
            ${comboItemCount} ${comboItemCount === 1 ? "item" : "itens"}
          </button>
        </td>
        <td><input class="grid-default-input" data-grid-position="${position}" data-grid-property="defaultValue" value="${u.escapeHtml(column.defaultValue)}" placeholder="Ex.: 1" ${editable ? "" : "disabled"}></td>
      `;

      el.gridColumnsTableBody.appendChild(row);
    });
  }

  function updateFromInput(target) {
    const position = Number(target.dataset.gridPosition);
    const property = target.dataset.gridProperty;

    if (!Number.isInteger(position) || !property || !state.gridColumns[position]) {
      return;
    }

    const column = state.gridColumns[position];
    let value = target.type === "checkbox"
      ? target.checked
      : target.type === "number"
        ? (target.value === "" ? "" : Number(target.value) || 1)
        : target.value;

    if (property === "type") value = normalizeColumnType(value);
    column[property] = value;

    if (property === "type" && isCheckColumn(column)) {
      column.title = String(column.title || "");
      column.width = Number(column.width) || 10;
      column.variable = u.normalizeVariable(column.variable, `CHECK${position + 1}`);
      column.workPiece = 0;
      column.displayOnly = true;
      column.displayExpression = "";
      column.detail = false;
      column.recordKey = false;
      column.editable = false;
      column.maintenanceType = "auto";
      column.required = false;
      column.lockOnEdit = false;
      column.lookupPreset = "none";
      column.initializerCode = "";
      column.obtainCode = "";
      column.f7Routine = "";
      column.valcpCode = "";
      column.optionsVariable = "";
      column.createOptionsTable = false;
      column.optionsItems = [];
      column.defaultValue = "";
    }

    if (property === "recordKey" && value === true) {
      state.gridColumns.forEach((item, index) => {
        item.recordKey = index === position;
      });
      column.detail = true;
      column.displayOnly = false;
      column.workPiece = 0;
      column.editable = true;
      column.required = true;
      column.lockOnEdit = true;
      render();
    }

    if (property === "displayOnly") {
      if (value === true) {
        column.recordKey = false;
        column.editable = false;
        column.required = false;
        column.lockOnEdit = false;
      }

      render();
    }

    if (property === "editable" && value === true && column.displayOnly) {
      column.editable = false;
      render();
    }

    if (property === "editable" && value === false) {
      column.recordKey = false;
      column.required = false;
      column.lockOnEdit = false;
      render();
    }

    if (property === "maintenanceType" && value === "combo") {
      if (!String(column.optionsVariable || "").trim()) {
        column.optionsVariable = "TABSET";
      }
    }

    if (property === "maintenanceType" && value !== "combo") {
      column.createOptionsTable = false;
      column.optionsItems = [];
    }

    if (
      property === "createOptionsTable" &&
      value === true &&
      (!Array.isArray(column.optionsItems) || !column.optionsItems.length)
    ) {
      column.optionsItems = defaultOptionItems();
    }

    if (["editable", "maintenanceType", "type", "createOptionsTable", "displayOnly", "recordKey"].includes(property)) {
      render();
    }

    // A coluna chave do grid entra na lista de índices da global, então o
    // painel de índices precisa ser redesenhado.
    if (property === "recordKey") {
      app.indexes.syncWithKeys();
      app.indexes.render();
    }

    app.refresh();
  }

  function add(overrides = {}) {
    state.gridColumns.push(createColumn(overrides));
    render();
    app.refresh();
  }

  function move(position, direction) {
    const destination = position + direction;
    if (destination < 0 || destination >= state.gridColumns.length) return;

    [state.gridColumns[position], state.gridColumns[destination]] = [
      state.gridColumns[destination],
      state.gridColumns[position]
    ];

    render();
    app.refresh();
  }

  function remove(position) {
    state.gridColumns.splice(position, 1);
    render();
    app.refresh();
  }

  function initialize() {
    if (!el.gridColumnsTableBody || !el.addGridColumnButton) return;

    el.gridColumnsTableBody.addEventListener("input", (event) =>
      updateFromInput(event.target)
    );

    el.gridColumnsTableBody.addEventListener("change", (event) =>
      updateFromInput(event.target)
    );

    el.gridColumnsTableBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-grid-action]");
      if (!button) return;

      const position = Number(button.dataset.gridPosition);
      const action = button.dataset.gridAction;

      if (action === "up") move(position, -1);
      if (action === "down") move(position, 1);
      if (action === "remove") remove(position);
      if (action === "configure-lookup") app.gridLookups.open(position);
      if (action === "configure-options") app.optionTables.openGrid(position);
    });

    el.addGridColumnButton.addEventListener("click", () => add());
    if (el.addGridCheckColumnButton) {
      el.addGridCheckColumnButton.addEventListener("click", () =>
        add({ type: "checkheader", title: "", width: 10 })
      );
    }

    if (el.addGridWorkGlobalParameter) {
      el.addGridWorkGlobalParameter.addEventListener("click", () => {
        const parameters = readWorkGlobalParameterEditor();
        const next = parameters.length + 1;
        parameters.push({
          name: `parametro${next}`,
          argument: `PARAMETRO${next}`
        });
        renderWorkGlobalParameterEditor(parameters);
        saveActive();
        app.refresh();
      });
    }

    if (el.gridWorkGlobalParametersList) {
      const updateParameters = (refreshPreview = false) => {
        const wrapper = el.gridWorkGlobalParametersList.closest(".mtemp-parameters-table-wrap");
        const previousScrollLeft = wrapper ? wrapper.scrollLeft : 0;

        syncWorkGlobalParameterHidden();
        saveActive();

        if (refreshPreview) app.refresh();

        if (wrapper) wrapper.scrollLeft = previousScrollLeft;
      };

      // Enquanto a pessoa digita, não redesenha o editor. Isso evita perder o
      // foco e impede o navegador de deslocar a tela para o canto.
      el.gridWorkGlobalParametersList.addEventListener("input", () =>
        updateParameters(false)
      );

      el.gridWorkGlobalParametersList.addEventListener("change", () =>
        updateParameters(true)
      );
      el.gridWorkGlobalParametersList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-mtemp-action]");
        if (!button || button.dataset.mtempAction !== "remove") return;

        const position = Number(button.dataset.mtempPosition);
        const parameters = readWorkGlobalParameterEditor();
        if (parameters.length <= 1 || !Number.isInteger(position)) return;
        parameters.splice(position, 1);
        renderWorkGlobalParameterEditor(parameters);
        saveActive();
        app.refresh();
      });
    }

    renderWorkGlobalParameterEditor("term=CT,codSequencia=CODSEQUENCIA");
    render();
  }

  function normalizedF7Routine(source) {
    return String(source || "")
      .trim()
      .replace(/^,+/, "")
      .replace(/,+$/, "");
  }

  function normalizedF8Routine(source) {
    const clean = String(source || "").trim().replace(/^,+|,+$/g, "");
    if (!clean) return "";
    return clean.includes("^") ? clean : `^${clean}`;
  }

  function controlDefinition(f7Routine, cp, inlineSuffix = "", f8Routine = "") {
    const f7 = normalizedF7Routine(f7Routine);
    const f8 = normalizedF8Routine(f8Routine);
    return `${f8}${f7 ? `,${f7}` : ","},,${cp}${inlineSuffix}`;
  }

  function fieldF7(field) {
    return app.mac && typeof app.mac.fieldF7Routine === "function"
      ? app.mac.fieldF7Routine(field)
      : field.f7Routine;
  }

  function standardTail(field, cp) {
    return `,,"${controlDefinition(fieldF7(field), cp, "", field.f8Routine)}")`;
  }

  function listEmptyText(field, config) {
    if (field.multiSelectEmptyText !== undefined && field.multiSelectEmptyText !== null) {
      return u.escapeMac(field.multiSelectEmptyText);
    }
    return config.gridTab && config.gridTab.saveFields === true ? "" : "Todos";
  }

  function entryParametersOf() {
    const hooks = (app.state && app.state.ruleHooks) || {};
    const source = Array.isArray(hooks.entryParameters)
      ? hooks.entryParameters
      : String(hooks.entryParameters || "").split(",");
    return source
      .map((item) => u.normalizeVariable(String(item).split(":")[0].trim(), ""))
      .filter(Boolean);
  }

  function entryLoadParameters(config) {
    if (config && config.gridInTab) return [];
    const hooks = (app.state && app.state.ruleHooks) || {};
    const source = Array.isArray(hooks.entryParameters)
      ? hooks.entryParameters
      : String(hooks.entryParameters || "").split(",");
    return source
      .map((item) => String(item).split(":"))
      .filter((parts) => parts.length > 1 && parts[1].trim())
      .map(([variable, parameter]) => ({
        variable: u.normalizeVariable(variable.trim(), ""),
        parameter: parameter.trim()
      }))
      .filter((item) => item.variable);
  }

  function listComponent(field, label, config) {
    const line = Number(field.inputLine) || 1;
    const column = Number(field.inputColumn) || 1;
    const size = Number(field.inputSize) || 8;
    const routine = config.routineName;
    return `do ^%CSUTIMM("${app.fields.multiSelectOptionsVariable(field)}",1,,,,"${app.fields.multiSelectTableVariable(field)}","${u.escapeMac(field.description)}",,,,,,,"${label}MM1^${routine}","${column},${line},${size},${label}^${routine}")`;
  }

  function appendListOptionLoads(lines, config) {
    const listFields = fields(config)
      .map(({ field }) => field)
      .filter((field) => app.fields.isListMultiSelect(field));
    if (!listFields.length) return;

    listFields.forEach((field) => {
      const load = String(field.multiSelectOptionsLoad || "").trim();
      lines.push(`\t; Opções de ${u.sanitize(field.description)}`);
      if (load) {
        load.split(/\r?\n/).forEach((line) => lines.push(`\t${line.trim()}`));
      } else {
        lines.push(`\t; TODO: carregar ${app.fields.multiSelectOptionsVariable(field)}(codigo)="codigo-descrição"`);
      }
    });
    lines.push("\t;");
  }

  function component(field, label) {
    const line = Number(field.inputLine) || 1;
    const column = Number(field.inputColumn) || 1;
    const size = Number(field.inputSize) || 1;
    const required = field.required ? 1 : "";
    const reference = app.fields.isMultiSelect(field)
      ? app.fields.multiSelectInputVariable(field)
      : u.normalizeVariable(field.variable);
    const cp = `cp${label}`;
    const tail = standardTail(field, cp);

    if (field.type === "multiSelect") {
      return `do ^%CSLE(${line},${column},${size},"${reference}",,"@'?.N",,,"${controlDefinition(fieldF7(field), cp, "", field.f8Routine)}")`;
    }

    if (field.type === "textArea") {
      const maxLength = Math.max(1, Number(field.textAreaMaxLength) || 500);
      const width = Math.max(1, Number(field.textAreaWidth) || size || 30);
      const height = Math.max(1, Number(field.textAreaHeight) || 3);
      return `do ^%CSW1UTITXTAREA(${line},${column},${maxLength},"${reference}",${reference},,",${cp},,,1",${width},${height},0)`;
    }

    if (app.fields.usesTypedReader(field)) {
      const currentValue =
        field.typedReaderUseCurrentValue === false ? "" : reference;
      const reader = u.escapeMac(String(field.typedReaderRoutine || "").trim());
      const control = u.escapeMac(
        String(field.typedReaderControlDefinition || ",,3,{cp}")
          .replaceAll("{cp}", cp)
      );
      const extra = u.escapeMac(
        String(field.typedReaderExtraDefinition || ",1")
      );

      return `do ^%CSLE(${line},${column},${size},"${reference}",${currentValue},,${required},,"${control}","${extra}",,,,,,"${reader}")`;
    }

    if (field.type === "integer") {
      return `do ^%CSLE(${line},${column},${size},"${reference}",${reference},"@'?.N",${required}${tail}`;
    }

    if (field.type === "float") {
      return `do ^%CSLE(${line},${column},${size},"${reference}",${reference},,"1,,18,,,,,DEC"${tail}`;
    }

    if (field.type === "decimal") {
      return `do ^%CSLE(${line},${column},${size},"${reference}",${reference},,"1,,16,,,,,DEC"${tail}`;
    }

    if (field.type === "date") {
      return `do ^%CSLE(${line},${column},8,"${reference}",${reference},,"1,1,3"${tail}`;
    }

    if (field.type === "monthYear") {
      return `do ^%CSLE(${line},${column},6,"${reference}",${reference},,"1,8,9"${tail}`;
    }

    if (["combo", "checkbox", "radio"].includes(field.type)) {
      const defaults = { combo: "TABCOMBO", checkbox: "TABCHK", radio: "TABRADIO" };
      const modes = { combo: 1, checkbox: 2, radio: 3 };
      const table = u.normalizeVariable(field.optionsVariable, defaults[field.type]);

      return `do ^%CSLE(${line},${column},${size},"${reference}",${reference},,${required},,",,,${cp}",,,,,${modes[field.type]},.${table})`;
    }

    return `do ^%CSLE(${line},${column},${size},"${reference}",${reference},,${required}${tail}`;
  }

  function fields(config = app.getConfig()) {
    let source = app.fields.mainFields();

    if (config.gridLocationId && config.gridLocationId !== "parent") {
      source = app.fields.mainFields().filter(
        (field) => (field.tabId || "parent") === config.gridLocationId
      );
    } else if (config.useTabs) {
      source = app.fields.mainFields().filter(
        (field) => (field.tabId || "parent") === "parent"
      );
    }

    return source.map((field, index) => ({
      field,
      index,
      label: 1000 + index * 100
    }));
  }
  function renderFinalFocusOptions(selected) {
    const select = el.gridFinalFocus;
    if (!select) return;

    const escolhido = String(selected ?? select.value ?? "auto").trim() || "auto";
    const opcoes = [
      ["auto", "Automático (grid)"],
      ["consult", "Botão Consultar"],
      ["grid", "Primeira linha do grid"],
      ["lastField", "Último campo"]
    ];

    app.fields
      .mainFields()
      .filter((field) => (field.tabId || "parent") === "parent")
      .forEach((field, index) => {
        const label = 1000 + index * 100;
        opcoes.push([`campo:${label}`, `Campo ${label} — ${field.description || field.variable}`]);
      });

    select.innerHTML = opcoes
      .map(([valor, texto]) => {
        const marca = valor === escolhido ? " selected" : "";
        return `<option value="${valor}"${marca}>${app.utils.escapeHtml(texto)}</option>`;
      })
      .join("");

    if (select.value !== escolhido) select.value = "auto";
  }

  function gridFinalFocusMode(config) {
    const mode = String(
      (config.gridInTab ? config.gridTab?.finalFocus : config.gridFinalFocus) || "auto"
    ).trim();

    if (mode === "save" || mode === "lastField" || mode === "grid") return mode;
    if (mode === "consult") {
      return config.gridUseConsultButton === false ? "grid" : "consult";
    }
    if (mode.startsWith("campo:")) {
      const label = mode.slice(6);
      return fields(config).some((entry) => String(entry.label) === label)
        ? mode
        : "grid";
    }

    return "grid";
  }

  function gridSaveButtonId(config) {
    const buttons = Array.isArray(config.customButtons)
      ? config.customButtons
      : [];
    const locationId = config.gridLocationId || "parent";

    const configured = buttons.find((button) => {
      const location = button.location || "parent";
      return location === locationId && /^btsalvar/i.test(String(button.buttonId || ""));
    });

    return configured?.buttonId || "btSalvar";
  }


  function companyVariable(config = app.getConfig()) {
    return app.indexes.companyMacArgument(config);
  }

  function inferWorkGlobalArgument(parameterName, config = app.getConfig()) {
    const name = u.normalizeParameter(parameterName, "parametro");
    const lower = name.toLowerCase();

    if (lower === "term" || lower === "terminal") return "CT";
    if (lower === "rotina") return "%PRG";
    if (["codempresa", "empresa"].includes(lower)) return companyVariable(config);

    const filter = filterDefinitions(config).find(
      (definition) => String(definition.parameter || "").toLowerCase() === lower
    );
    if (filter) return filter.variable;

    return u.normalizeVariable(name, "PARAMETRO");
  }

  function workGlobalParameterDefinitions(config = app.getConfig()) {
    const source = normalizeWorkGlobalParameterSource(
      config.gridWorkGlobalParameters || "term=CT,codSequencia=CODSEQUENCIA"
    );
    const definitions = source.map((item, index) => ({
      name: u.normalizeParameter(item.name, `parametro${index + 1}`),
      argument: item.argument || inferWorkGlobalArgument(item.name, config)
    }));

    if (definitions.length === 1) {
      definitions.unshift({ name: "term", argument: "CT" });
    }

    return definitions;
  }

  function workGlobalContextDefinitions(config = app.getConfig()) {
    const definitions = workGlobalParameterDefinitions(config);
    return definitions.slice(0, -1);
  }

  function workGlobalRecordDefinition(config = app.getConfig()) {
    const definitions = workGlobalParameterDefinitions(config);
    return definitions[definitions.length - 1];
  }

  function workGlobalContextParameters(config = app.getConfig()) {
    return workGlobalContextDefinitions(config).map((definition) => definition.name);
  }

  function workGlobalContextArguments(config = app.getConfig()) {
    return workGlobalContextDefinitions(config).map((definition) => definition.argument);
  }

  function workGlobalRootReference(config = app.getConfig(), useArguments = false) {
    const base = `^${config.gridWorkGlobal}`;
    const definitions = workGlobalContextDefinitions(config);
    const values = definitions.map((definition) =>
      useArguments ? definition.argument : definition.name
    );
    return values.length ? `${base}(${values.join(",")})` : base;
  }

  function workGlobalItemReference(
    config = app.getConfig(),
    recordValue,
    useArguments = false
  ) {
    const base = `^${config.gridWorkGlobal}`;
    const definitions = workGlobalContextDefinitions(config);
    const values = definitions.map((definition) =>
      useArguments ? definition.argument : definition.name
    );
    values.push(recordValue || workGlobalRecordDefinition(config).name);
    return `${base}(${values.join(",")})`;
  }

  function joinCallArguments(values = []) {
    return values.filter((value) => String(value || "").trim()).join(",");
  }

  function contextCallPrefix(config = app.getConfig()) {
    const values = workGlobalContextArguments(config);
    return values.length ? `${values.join(",")},` : "";
  }

  function runtimeTermDefinition(config = app.getConfig()) {
    return workGlobalContextDefinitions(config).find((definition) => {
      const name = String(definition.name || "").toLowerCase();
      const argument = String(definition.argument || "").toUpperCase();
      return name === "term" || name === "terminal" || argument === "CT";
    });
  }

  function gridRuntimeTermParameter(config = app.getConfig()) {
    return runtimeTermDefinition(config)?.name || "term";
  }

  function gridRuntimeTermArgument(config = app.getConfig()) {
    return runtimeTermDefinition(config)?.argument || "CT";
  }

  function gridMethodDefinitions(config = app.getConfig()) {
    const contextDefinitions = workGlobalContextDefinitions(config);
    const configuredCompany = contextDefinitions.find((definition) =>
      ["codempresa", "empresa"].includes(String(definition.name || "").toLowerCase())
    );
    const definitions = [
      configuredCompany || { name: "codEmpresa", argument: companyVariable() }
    ];

    if (!runtimeTermDefinition(config)) {
      definitions.push({ name: "term", argument: "CT" });
    }

    definitions.push(...contextDefinitions);

    const used = new Set();
    return definitions.filter((definition) => {
      const key = String(definition.name || "").toLowerCase();
      if (!key || used.has(key)) return false;
      used.add(key);
      return true;
    });
  }

  function gridMethodContextParameters(config = app.getConfig()) {
    return gridMethodDefinitions(config).map((definition) => definition.name);
  }

  function gridMethodContextArguments(config = app.getConfig()) {
    return gridMethodDefinitions(config).map((definition) => definition.argument);
  }

  function cleanupContextDefinitions(config = app.getConfig()) {
    const values = workGlobalContextDefinitions(config);
    if (!checkColumns().length || runtimeTermDefinition(config)) return values;
    return [{ name: "term", argument: "CT" }, ...values];
  }

  function cleanupContextParameters(config = app.getConfig()) {
    return cleanupContextDefinitions(config).map((definition) => definition.name);
  }

  function cleanupContextArguments(config = app.getConfig()) {
    return cleanupContextDefinitions(config).map((definition) => definition.argument);
  }

  function filterDefinitions(config = app.getConfig()) {
    const keyDefinitions = app.indexes.keyDefinitions();
    const keyByField = new Map(
      keyDefinitions.map((definition) => [definition.field.id, definition])
    );
    const result = [];
    const seen = new Set();

    const usedParameters = new Set();

    function uniqueParameter(name) {
      const base = String(name || "parametro");
      let candidate = base;
      let suffix = 2;

      while (usedParameters.has(candidate)) {
        candidate = `${base}${suffix}`;
        suffix += 1;
      }

      usedParameters.add(candidate);
      return candidate;
    }

    if (config.gridInTab) {
      keyDefinitions.forEach((definition) => {
        const variable = u.normalizeVariable(definition.field.variable);
        if (seen.has(variable)) return;
        seen.add(variable);
        result.push({
          field: definition.field,
          variable,
          parameter: uniqueParameter(definition.parameterName),
          inherited: true
        });
      });
    }

    fields(config).forEach(({ field }) => {
      const variable = app.fields.isMultiSelect(field)
        ? app.fields.multiSelectInputVariable(field)
        : u.normalizeVariable(field.variable);
      if (seen.has(variable)) return;
      seen.add(variable);
      const keyDefinition = keyByField.get(field.id);
      result.push({
        field,
        variable,
        parameter: uniqueParameter(
          keyDefinition
            ? keyDefinition.parameterName
            : u.toParameter(field.description || field.variable)
        ),
        inherited: false
      });
    });

    return result;
  }

  function savedFieldDefinitions(config = app.getConfig()) {
    if (!config.gridTab || config.gridTab.saveFields !== true) return [];
    return filterDefinitions(config).filter(
      (definition) => !definition.inherited && !app.fields.isMultiSelect(definition.field)
    );
  }

  function renderFieldCode(code, field, label, config) {
    const source = String(code || "").trim();
    if (!source) return [];

    const reference = app.fields.isMultiSelect(field)
      ? app.fields.multiSelectInputVariable(field)
      : u.normalizeVariable(field.variable);
    const table = app.fields.isMultiSelect(field)
      ? app.fields.multiSelectTableVariable(field)
      : "";

    const replacements = {
      "{variable}": reference,
      "{reference}": reference,
      "{fieldVariable}": reference,
      "{fieldDescription}": u.escapeMac(field.description),
      "{display}": `ds${label}`,
      "{label}": String(label),
      "{company}": companyVariable(),
      "{rgRoutine}": config.rgRoutineName,
      "{routine}": config.routineName,
      "{multiTable}": table,
      "{multiSelectedText}": u.escapeMac(field.multiSelectSelectedText || "Selecionados")
    };

    let result = source;
    Object.entries(replacements).forEach(([token, value]) => {
      result = result.split(token).join(value);
    });

    return result.split(/\r?\n/);
  }

  function appendFields(lines, config) {
    const entries = fields(config);

    const entryParameters = new Set(entryParametersOf());
    const skipRead = (entry) => entry.field.disabled === true &&
      (!app.fields.isKeyField(entry.field) || entryParameters.has(u.normalizeVariable(entry.field.variable, "")));

    entries.forEach(({ field, index, label }) => {
      const previousEntry = entries.slice(0, index).reverse().find((entry) => !skipRead(entry));
      const previous = previousEntry ? previousEntry.label : "0500";
      const next = index === entries.length - 1 ? "2000" : 1000 + (index + 1) * 100;
      const reference = app.fields.isMultiSelect(field)
        ? app.fields.multiSelectInputVariable(field)
        : u.normalizeVariable(field.variable);

      lines.push(`\t; ${u.sanitize(field.description)}`);
      lines.push(`${label}\t;`);

      if (skipRead({ field })) {
        lines.push(`\tset sc=$$Valcp${label}()`);
        lines.push(`\tgoto ${next}`);
        lines.push(
          app.fields.hasDisplay(field)
            ? `${label}ON\tdo ClearCp^%CSW1UTI("ds${label}")`
            : `${label}ON\t;`
        );
        lines.push(`\t${component(field, label)}`);
        lines.push("\tquit");
        lines.push("\t;");
        return;
      }

      const enabledWhen = String(field.enabledWhen || "").trim();
      if (enabledWhen) {
        const clearDisplay = app.fields.hasDisplay(field) ? ` do ClearCp^%CSW1UTI("ds${label}")` : "";
        lines.push(`\tif '(${enabledWhen}) set ${reference}="" do DisableCp^%CSW1UTI("cp${label}"),Set^%CSW1UTI(%PRG,"cp${label}","")${clearDisplay} goto ${previous}:%=140,${next}`);
        lines.push(`\tdo EnableCp^%CSW1UTI("cp${label}")`);
      }

      const isList = app.fields.isListMultiSelect(field);

      if (isList) {
        lines.push(`${label}ON\t${listComponent(field, label, config)}`);
      } else if (app.fields.hasDisplay(field)) {
        lines.push(`${label}ON\tdo ClearCp^%CSW1UTI("ds${label}")`);
        lines.push(`\t${component(field, label)}`);
      } else {
        lines.push(`${label}ON\t${component(field, label)}`);
      }

      lines.push("\tquit:$$CSP^%CSW1UTI()");
      lines.push("\t;");
      const exitLabel = isList ? `${label}MM1` : `${label}EX`;
      lines.push(
        !previousEntry
          ? `${exitLabel}\tgoto 9999:%=27!(%=140)`
          : `${exitLabel}\tgoto 9999:%=27,${previous}:%=140`
      );
      lines.push("\t;");
      lines.push(`\tif '$$Valcp${label}() goto ${label}`);
      lines.push("\t;");

      const afterField = renderFieldCode(field.afterFieldCode, field, label, config);
      if (afterField.length) {
        afterField.forEach((line) => lines.push(line.trim() === ";" ? "\t;" : `\t${line}`));
        lines.push("\t;");
      }

      if (app.fields.isMultiSelect(field) && !isList) {
        const tableVariable = app.fields.multiSelectTableVariable(field);
        const includeLabel = label + 25;

        lines.push(`\tif ${reference}="" goto ${next}`);
        lines.push(`\tif '$data(${tableVariable}(${reference})) goto ${includeLabel}`);
        lines.push("\t;");
        lines.push(`\t; Excluir ${u.sanitize(field.description)}`);
        lines.push("\t;");
        lines.push(`\tdo SN^%CSUTIUD(,,,"${u.escapeMac(field.description)} já selecionado! Deseja excluir?","N","${label}SN1^${config.routineName}")`);
        lines.push("\tquit:$$CSP^%CSW1UTI()");
        lines.push("\t;");
        lines.push(`${label}SN1\tkill:SN="S" ${tableVariable}(${reference})`);
        lines.push(`\tgoto ${label}`);
        lines.push("\t;");
        lines.push(`\t; Gravar ${u.sanitize(field.description)}`);
        lines.push("\t;");
        lines.push(`${includeLabel}\tdo SN^%CSUTIUD(,,,,,"${includeLabel}SN1^${config.routineName}")`);
        lines.push("\tquit:$$CSP^%CSW1UTI()");
        lines.push("\t;");
        lines.push(`${includeLabel}SN1\tset:SN="S" ${tableVariable}(${reference})=""`);
        lines.push(`\tgoto ${label}`);
        lines.push("\t;");
      } else {
        lines.push(`\tgoto ${next}`);
        lines.push("\t;");
      }
    });
  }

  function appendShow(lines, config) {
    lines.push("\t; Mostrar filtros");
    lines.push("8000\t;");

    fields(config).forEach(({ field, label }) => {
      const reference = app.fields.isMultiSelect(field)
        ? app.fields.multiSelectInputVariable(field)
        : u.normalizeVariable(field.variable);

      if (app.fields.isListMultiSelect(field)) {
        const tableVariable = app.fields.multiSelectTableVariable(field);
        const selectedText = u.escapeMac(field.multiSelectSelectedText || "Selecionados");
        lines.push(`\tdo Set^%CSW1UTI(%PRG,"cp${label}MM1",$select($data(${tableVariable}):"${selectedText}",1:"${listEmptyText(field, config)}"))`);
        return;
      }

      if (app.fields.isMultiSelect(field)) {
        const tableVariable = app.fields.multiSelectTableVariable(field);
        const selectedText = u.escapeMac(field.multiSelectSelectedText || "Selecionados");
        lines.push(`\tdo Set^%CSW1UTI(%PRG,"cp${label}","")`);
        if (app.fields.hasDisplay(field)) {
          lines.push(`\tif $data(${tableVariable}) do Set^%CSW1UTI(%PRG,"ds${label}","${selectedText}")`);
          lines.push(`\tif '$data(${tableVariable}) do ClearCp^%CSW1UTI("ds${label}")`);
        }
        return;
      }

      if (["combo", "checkbox", "radio"].includes(field.type)) {
        const names = { combo: "Combo", checkbox: "Check", radio: "Radio" };
        const table = u.normalizeVariable(
          field.optionsVariable,
          app.fields.defaultOptions(field)
        );
        lines.push(`\tdo Inicializa${names[field.type]}^%CSW1A("cp${label}",.${table},0,${reference},,,1)`);
      } else {
        const format = field.type === "date"
          ? ',"d"'
          : ["float", "decimal"].includes(field.type)
            ? ',"v3"'
            : "";
        lines.push(`\tdo Set^%CSW1UTI(%PRG,"cp${label}",${reference}${format})`);
      }

      if (app.fields.hasDisplay(field)) {
        if (String(field.valcpCode || "").trim()) {
          lines.push(`\tif ${reference}="" do Set^%CSW1UTI(%PRG,"ds${label}","")`);
          lines.push(`\tif ${reference}'="" set sc=$$Valcp${label}()`);
        } else {
          lines.push(`\tdo Set^%CSW1UTI(%PRG,"ds${label}",${reference})`);
        }
      }
    });

    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
  }

  function appendValidations(lines, config) {
    const entries = fields(config);

    entries.forEach(({ field, label }) => {
      const reference = app.fields.isMultiSelect(field)
        ? app.fields.multiSelectInputVariable(field)
        : u.normalizeVariable(field.variable);
      lines.push(`\t; Método Valcp${label}()`);
      lines.push(`Valcp${label}()\t;`);

      if (app.fields.isListMultiSelect(field)) {
        const tableVariable = app.fields.multiSelectTableVariable(field);
        const selectedText = u.escapeMac(field.multiSelectSelectedText || "Selecionados");
        if (field.required) {
          lines.push(`\tif '$data(${tableVariable}) do ME^%CSUTIUD("${u.escapeMac(field.description)}: Campo obrigatório!") quit 0`);
          lines.push("\t;");
        }
        lines.push(`\tdo Set^%CSW1UTI(%PRG,"cp${label}MM1",$select($data(${tableVariable}):"${selectedText}",1:"${listEmptyText(field, config)}"))`);
        lines.push("\t;");
        lines.push("\tquit $$$OK");
        lines.push("\t;");
        return;
      }

      if (field.required && !app.fields.isMultiSelect(field)) {
        lines.push(`\tif ${reference}="" do ME^%CSUTIUD("${u.escapeMac(field.description)}: Campo obrigatório!") quit 0`);
        lines.push("\t;");
      }

      const custom = renderFieldCode(field.valcpCode, field, label, config);
      if (custom.length) {
        custom.forEach((line) => lines.push(line.trim() === ";" ? "\t;" : `\t${line}`));
        lines.push("\t;");
      } else if (app.fields.hasDisplay(field)) {
        lines.push(`\tdo Set^%CSW1UTI(%PRG,"ds${label}",${reference})`);
        lines.push("\t;");
      }

      lines.push("\tquit $$$OK");
      lines.push("\t;");
    });

    lines.push("\t; Método Validate()");
    lines.push("Validate()\t;");
    entries.forEach(({ field, label }) => {
      const control = app.fields.isListMultiSelect(field) ? `cp${label}MM1` : `cp${label}`;
      lines.push(`\tif '$$Valcp${label}() do Focus^%CSW1UTI(%PRG,"${control}") quit 0`);
    });
    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
  }

  function optionVariables(config = app.getConfig()) {
    return fields(config)
      .map(({ field }) => field)
      .filter((field) => app.fields.usesOptions(field))
      .map((field) => u.normalizeVariable(field.optionsVariable, app.fields.defaultOptions(field)));
  }

  function dependentDisplayColumns(column) {
    const variableOf = (item) => u.normalizeVariable(item.variable, "").toLowerCase();
    const own = variableOf(column);
    if (!own) return [];

    const byVariable = new Map(
      state.gridColumns.map((item, index) => [variableOf(item), index + 1])
    );

    return state.gridColumns
      .map((item, index) => ({ item, position: index + 1 }))
      .filter(({ item }) =>
        item.displayOnly === true &&
        String(item.displayExpression || "").trim() &&
        new RegExp(`\\b${own}\\b`).test(item.displayExpression)
      )
      .map(({ item, position }) => ({
        position,
        expression: String(item.displayExpression)
          .replace(/\bcodEmpresa\b/g, "CE")
          .replace(/\b([a-z][a-z0-9]*)\b/g, (word) =>
            byVariable.has(word) ? `$piece(VARDET,Z,${byVariable.get(word)})` : word
          )
      }));
  }

  function clickableColumns() {
    return state.gridColumns
      .map((column, index) => ({ column, position: index + 1 }))
      .filter(({ column }) => String(column.clickLabel || "").trim())
      .map(({ column, position }) => ({
        position,
        label: String(column.clickLabel).trim(),
        title: String(column.title || ""),
        menu: Array.isArray(column.actionMenu) ? column.actionMenu : []
      }));
  }

  function tabHooks(config) {
    const tab = state.tabs.find((item) => item.id === config.gridLocationId);
    return (tab && tab.hooks && typeof tab.hooks === "object") ? tab.hooks : {};
  }

  function sessionCompanyLoad(config) {
    return !config.gridInTab &&
      app.indexes.usesRoutineCompany(config) &&
      !state.fields.some((field) => u.normalizeVariable(field.variable, "") === "CODEMP");
  }

  function viewOnlyTab(config) {
    return Boolean(config.gridInTab) && ((app.state && app.state.ruleHooks) || {}).openByKey === true;
  }

  function actionMenuColumns() {
    return clickableColumns().filter(({ menu }) => menu.length);
  }

  function actionMenuVariables({ position }) {
    return { options: `OPCOES${position}`, table: `TABOPC${position}`, method: `ObterMenuOpcoes${position}` };
  }

  function appendActionMenuInitializers(lines, config) {
    actionMenuColumns().forEach((column) => {
      const { options, table, method } = actionMenuVariables(column);
      lines.push(`\tset sc=$$${method}^${config.rgRoutineName}(.${options},.${table})`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
      lines.push("\t;");
    });
  }

  function appendActionMenuMethods(lines, config) {
    actionMenuColumns().forEach((column) => {
      const { method } = actionMenuVariables(column);
      lines.push(`\t; Obter Menu de Opções da coluna ${u.sanitize(column.title)}`);
      lines.push(`${method}(strOpcoes,tabOpcoes)\t;`);
      lines.push("\t$$$VAR");
      lines.push("\tnew sc");
      lines.push("\t;");
      lines.push("\tset strOpcoes=\"\"");
      lines.push("\t;");
      lines.push("\tkill tabOpcoes");
      lines.push("\t;");
      column.menu.forEach((item) => {
        lines.push(`\tset sc=$$AdicionarOpcaoAcoes^CCUTIRG011("${u.escapeMac(item.text)}","${item.label}-${config.routineName}",,.strOpcoes,.tabOpcoes)`);
      });
      lines.push("\t;");
      lines.push("\tquit $$$OK");
      lines.push("\t;");
    });
  }

  function appendActionMenuLabels(lines, config, focusLabel) {
    actionMenuColumns().forEach((column) => {
      const { options, table } = actionMenuVariables(column);
      const label = column.label;
      lines.push(`\t; ${u.sanitize(column.title)}`);
      lines.push("\t;");
      lines.push(`${label}\tdo ^%CSW1MENUCLICK(${options},"OPCLICK","${label}EX^${config.routineName}")`);
      lines.push("\tquit:$$CSP^%CSW1UTI()");
      lines.push("\t;");
      lines.push(`${label}EX\tset sc=$$ObterDirecaoOpcaoAcoes^CCUTIRG011(.${table},OPCLICK,.LABROT,.FLGCHA)`);
      lines.push(`\tif $$$ISERR(sc) goto ${label}EX1`);
      lines.push("\t;");
      lines.push(`\tif LABROT=""!(FLGCHA'=1) goto ${label}EX1`);
      lines.push("\t;");
      lines.push("\tgoto @LABROT");
      lines.push("\t;");
      lines.push(`${label}EX1\tgoto ${focusLabel}`);
      lines.push("\t;");
    });
  }

  function editFlowColumns(config) {
    const columns = maintenanceColumns();
    const key = recordKeyDefinition();
    if (key && autoSequenceMode(config) === "auto" && !columns.some(({ column }) => column.id === key.column.id)) {
      columns.unshift({ column: key.column, piece: key.piece });
    }
    return columns;
  }

  function maintenanceColumns() {
    return state.gridColumns
      .map((column, index) => ({ column, piece: index + 1 }))
      .filter(({ column }) => !isCheckColumn(column) && column.editable === true && column.displayOnly !== true);
  }

  function recordKeyDefinition() {
    const marked = state.gridColumns.findIndex((column) => !isCheckColumn(column) && column.recordKey === true);
    const fallback = state.gridColumns.findIndex((column) => !isCheckColumn(column) && column.detail === true);
    const firstData = state.gridColumns.findIndex((column) => !isCheckColumn(column));
    const index = marked >= 0 ? marked : fallback >= 0 ? fallback : firstData;
    const column = index >= 0 ? state.gridColumns[index] : null;

    if (!column) return null;

    // Se a coluna já é um índice da global, o nome do parâmetro vem de lá.
    const indexEntry = state.globalIndexes.find(
      (item) => item.type === "key" && item.fieldId === column.id
    );

    return {
      column,
      piece: index + 1,
      parameter: u.normalizeParameter(
        indexEntry ? indexEntry.parameterName : "",
        u.toParameter(column.title || column.variable)
      ),
      isGlobalIndex: Boolean(indexEntry)
    };
  }

  function maintenanceType(column) {
    return column.maintenanceType && column.maintenanceType !== "auto"
      ? column.maintenanceType
      : inferredMaintenanceType(column);
  }

  function maintenanceTable(column) {
    return u.normalizeVariable(column.optionsVariable, "TABSIT");
  }

  function maintenanceReference(piece) {
    return `$piece(VARDET,Z,${piece})`;
  }

  function workPiece(column) {
    if (column.displayOnly === true) return 0;
    return Math.max(0, Number(column.workPiece) || 0);
  }

  function columnSource(column, mtempVariable, recordKeyVariable = "codSequencia") {
    if (column.recordKey || column.displayOnly === true) {
      return recordKeyVariable;
    }

    const piece = workPiece(column);
    return piece > 0
      ? `$piece(${mtempVariable},Z,${piece})`
      : recordKeyVariable;
  }

  function maintenanceDisplay(column, piece) {
    const reference = maintenanceReference(piece);
    const type = maintenanceType(column);

    if (type === "combo") {
      return `$select(${reference}="":"",1:$get(${maintenanceTable(column)}(${reference})))`;
    }

    const expression = String(column.displayExpression || "").trim();
    return expression ? expression.split("{value}").join(reference) : reference;
  }

  function maintenanceComponent(column, label, piece, config) {
    const reference = maintenanceReference(piece);
    const size = Number(column.width) || 1;
    const required = column.required ? 1 : "";
    const cp = `cp${label}`;
    const inlineSuffix = `,,,,,,0,3,3,${config.gridCode}`;
    const tail = `,,"${controlDefinition(column.f7Routine, cp, inlineSuffix, column.f8Routine)}")`;
    const type = maintenanceType(column);

    if (type === "integer") {
      return `do ^%CSLE(CODLIN,${piece},${size},"${reference}",${reference},"@'?.N",${required}${tail}`;
    }

    if (type === "float") {
      return `do ^%CSLE(CODLIN,${piece},${size},"${reference}",${reference},,"1,,18,,,,,DEC"${tail}`;
    }

    if (type === "decimal") {
      return `do ^%CSLE(CODLIN,${piece},${size},"${reference}",${reference},,"1,,16,,,,,DEC"${tail}`;
    }

    if (type === "date") {
      return `do ^%CSLE(CODLIN,${piece},8,"${reference}",${reference},,"1,1,3"${tail}`;
    }

    if (type === "combo") {
      const table = maintenanceTable(column);
      return `do ^%CSLE(CODLIN,${piece},${size},"${reference}",${reference},,${required},,",,,${cp}${inlineSuffix}",,,,,1,.${table})`;
    }

    return `do ^%CSLE(CODLIN,${piece},${size},"${reference}",${reference},,${required}${tail}`;
  }

  function workVariable(config) {
    const fallback = `mtemp${config.routineName}`;
    const value = String(config.gridWorkGlobal || fallback)
      .replace(/^\^/, "")
      .replace(/[^a-zA-Z0-9%]/g, "");

    return value || fallback;
  }

  function saveFlagVariable(config) {
    return `FLGGRAVAR${u.normalizeVariable(config.routineName, "GRID")}`;
  }

  function btnManterEnabledHere(config) {
    if (!config.useBtnManter) return false;

    const selectedLocation = config.useTabs
      ? config.btnManterLocation || "parent"
      : "parent";

    return selectedLocation === (config.gridLocationId || "parent");
  }

  function gridTabKeyDefinitions(config) {
    if (!config.gridInTab) return [];

    const seen = new Set();

    return fields(config)
      .map(({ field }) => field)
      .filter((field) => app.fields.isTabKey(field))
      .filter((field) => {
        const variable = u.normalizeVariable(field.variable);
        if (seen.has(variable)) return false;
        seen.add(variable);
        return true;
      })
      .map((field) => ({
        field,
        variable: u.normalizeVariable(field.variable),
        parameter: u.toParameter(field.description || field.variable)
      }));
  }

  function generatedGridOptionTables() {
    const seen = new Set();

    return maintenanceColumns()
      .map(({ column }) => column)
      .filter((column) => {
        if (
          maintenanceType(column) !== "combo" ||
          column.createOptionsTable !== true
        ) {
          return false;
        }

        const table = maintenanceTable(column);
        if (seen.has(table)) return false;

        seen.add(table);
        return true;
      });
  }

  function gridOptionTableMethod(column) {
    return `ObterTabGrid${u.toPascal(maintenanceTable(column))}`;
  }

  function tableSuggestions(config = app.getConfig()) {
    const result = [];
    const seen = new Set();

    app.fields.generatedOptionTables().forEach((field) => {
      const table = u.normalizeVariable(field.optionsVariable, "TABELA");
      if (seen.has(table)) return;
      seen.add(table);

      const suffix = u.toPascal(field.description || field.variable);
      result.push({
        id: `field-${field.id}`,
        table,
        initializerCode: [
          `set sc=$$ObterTab${suffix}^${config.rgRoutineName}(.${table})`,
          "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit"
        ].join("\n")
      });
    });

    generatedGridOptionTables().forEach((column) => {
      const table = maintenanceTable(column);
      if (seen.has(table)) return;
      seen.add(table);

      result.push({
        id: `grid-${column.id}`,
        table,
        initializerCode: [
          `set sc=$$${gridOptionTableMethod(column)}^${config.rgRoutineName}(.${table})`,
          "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit"
        ].join("\n")
      });
    });

    if (!seen.has("TABSIT")) {
      result.push({
        id: "situacao-padrao",
        table: "TABSIT",
        initializerCode: [
          "set sc=$$ObterSituacao^%CSW1E(.TABSIT,2)",
          "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit"
        ].join("\n")
      });
    }

    return result;
  }

  function renderCodeLines(code, replacements = {}) {
    let result = String(code || "").trim();
    if (!result) return [];

    Object.entries(replacements).forEach(([token, value]) => {
      result = result.split(token).join(String(value));
    });

    return result.split(/\r?\n/);
  }

  function renderInitializerCode(code, config) {
    return renderCodeLines(code, {
      "{company}": companyVariable(),
      "{rgRoutine}": config.rgRoutineName,
      "{routine}": config.routineName,
      "{gridCode}": config.gridCode
    });
  }

  function renderObtainCode(code, column, variable, source, piece, config) {
    return renderCodeLines(code, {
      "{value}": source,
      "{variable}": variable,
      "{source}": source,
      "{column}": piece,
      "{gridColumn}": piece,
      "{gridCode}": config.gridCode,
      "{company}": "codEmpresa",
      "{rgRoutine}": config.rgRoutineName,
      "{routine}": config.routineName
    });
  }

  function formatTableSubscript(value) {
    const clean = String(value ?? "").trim();
    if (/^-?(?:\d+|\d+\.\d+)$/.test(clean)) return clean;
    return `"${u.escapeMac(clean)}"`;
  }

  function appendGeneratedGridOptionTableInitializers(lines, config) {
    if (!config.useRules) return;

    generatedGridOptionTables().forEach((column) => {
      const table = maintenanceTable(column);
      lines.push(`\tset sc=$$${gridOptionTableMethod(column)}^${config.rgRoutineName}(.${table})`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
      lines.push("\t;");
    });
  }

  function automaticInitializerBlocks(config) {
    const blocks = new Set();

    const localIds = new Set(fields(config).map(({ field }) => field.id));
    const fieldTableRoutine = config.gridInTab
      ? config.parentRgRoutineName
      : config.rgRoutineName;

    app.fields.generatedOptionTables()
      .filter((field) => localIds.has(field.id))
      .forEach((field) => {
        const table = u.normalizeVariable(field.optionsVariable, "TABELA");
        const suffix = u.toPascal(field.description || field.variable);
        blocks.add([
          `set sc=$$ObterTab${suffix}^${fieldTableRoutine}(.${table})`,
          "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit"
        ].join("\n"));
      });

    generatedGridOptionTables().forEach((column) => {
      const table = maintenanceTable(column);
      blocks.add([
        `set sc=$$${gridOptionTableMethod(column)}^${config.rgRoutineName}(.${table})`,
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit"
      ].join("\n"));
    });

    if (
      config.gridMaintenance &&
      maintenanceColumns().some(({ column }) =>
        maintenanceType(column) === "combo" &&
        maintenanceTable(column) === "TABSIT" &&
        column.createOptionsTable !== true
      )
    ) {
      blocks.add([
        "set sc=$$ObterSituacao^%CSW1E(.TABSIT,2)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit"
      ].join("\n"));
    }

    return blocks;
  }

  function appendColumnInitializers(lines, config) {
    const automatic = automaticInitializerBlocks(config);
    const emitted = new Set();

    state.gridColumns.forEach((column) => {
      const source = String(column.initializerCode || "").trim();
      if (!source || automatic.has(source) || emitted.has(source)) return;

      emitted.add(source);
      lines.push(`	; Inicializar regra da coluna ${u.sanitize(column.title)}`);
      renderInitializerCode(source, config).forEach((line) => {
        lines.push(line.trim() === ";" ? "	;" : `	${line}`);
      });
      lines.push("	;");
    });
  }

  function appendGeneratedGridOptionTableMethods(lines) {
    generatedGridOptionTables().forEach((column) => {
      const table = maintenanceTable(column);
      const parameter = u.toParameter(table);
      const items = Array.isArray(column.optionsItems) ? column.optionsItems : [];

      lines.push(`\t; Obter Tabela Grid ${u.sanitize(column.title || table)}`);
      lines.push(`${gridOptionTableMethod(column)}(${parameter})\t;`);
      lines.push("\t;");
      lines.push(`\tkill ${parameter}`);
      lines.push("\t;");

      items.forEach((item) => {
        lines.push(`\tset ${parameter}(${formatTableSubscript(item.value)})="${u.escapeMac(item.description)}"`);
      });

      lines.push("\t;");
      lines.push("\tquit $$$OK");
      lines.push("\t;");
    });
  }

  function appendTypedReaderConfigurations(lines, config) {
    const seen = new Set();

    fields(config).forEach(({ field }) => {
      if (!app.fields.usesTypedReader(field)) return;

      const variable = app.fields.typedReaderConfigVariable(field);
      const method = String(
        field.typedReaderConfigMethod || "ObterConfLeitor^CCCGIRG012"
      ).trim();
      const company = String(
        field.typedReaderCompanyExpression || "CE"
      ).trim();
      const configText = String(field.typedReaderConfigText || "").trim();
      const key = [variable, method, company, configText].join("|");

      if (seen.has(key)) return;
      seen.add(key);

      lines.push(
        `\tset sc=$$${method}(${company},"${u.escapeMac(configText)}",.${variable})`
      );
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
      lines.push("\t;");
    });
  }

  function routineVariables(config) {
    const vars = new Set([
      "sc",
      "%PRG",
      "CT",
      "TABGRID",
      ...fields(config).map(({ field }) =>
        app.fields.isMultiSelect(field)
          ? app.fields.multiSelectInputVariable(field)
          : u.normalizeVariable(field.variable)
      ),
      ...optionVariables(config)
    ]);

    const dynamicColumns = dynamicColumnsOf(config);
    if (dynamicColumns) ["COLDIN", "SEQDIN", dynamicColumns.table].forEach((variable) => vars.add(variable));

    workGlobalContextArguments(config).forEach((argument) => {
      const clean = String(argument || "").trim();
      if (/^[A-Za-z%][A-Za-z0-9%]*$/.test(clean)) {
        vars.add(u.normalizeVariable(clean));
      }
    });

    fields(config).forEach(({ field }) => {
      u.parseVariables(field.extraVariables).forEach((variable) => vars.add(variable));
      if (app.fields.usesTypedReader(field)) {
        vars.add(app.fields.typedReaderConfigVariable(field));
      }
      if (app.fields.isMultiSelect(field)) {
        vars.add(app.fields.multiSelectTableVariable(field));
        vars.add("SN");
      }
      if (app.fields.isListMultiSelect(field)) {
        vars.add(app.fields.multiSelectOptionsVariable(field));
      }
    });

    state.gridColumns.forEach((column) => {
      u.parseVariables(column.extraVariables).forEach((variable) => vars.add(variable));
    });

    if (hasCheckColumns()) {
      ["CHECK", "CODCOL", "CODGRID", "TABERRO"].forEach((variable) => vars.add(variable));
    }
    if (clickableColumns().length || String((config.gridInTab ? tabHooks(config) : ((app.state && app.state.ruleHooks) || {})).cellClickCode || "").trim()) {
      ["CODCOL", "CODGRID"].forEach((variable) => vars.add(variable));
    }
    if (actionMenuColumns().length) {
      ["OPCLICK", "LABROT", "FLGCHA"].forEach((variable) => vars.add(variable));
      actionMenuColumns().forEach((column) => {
        const { options, table } = actionMenuVariables(column);
        vars.add(options);
        vars.add(table);
      });
    }

    if (config.gridMaintenance) {
      ["CODLIN", "CODREG", "FLGMANUT", "VARDET", workVariable(config)].forEach((variable) => vars.add(variable));
      if (autoSequenceMode(config) === "editavel") vars.add("CHVANT");
      if (config.gridAllowRemove) vars.add("SN");
      maintenanceColumns().forEach(({ column }) => {
        if (maintenanceType(column) === "combo") vars.add(maintenanceTable(column));
      });
    }

    if (config.gridInTab && config.gridMaintenance && config.generateSave) {
      vars.add(saveFlagVariable(config));
    }

    if (!config.gridInTab && config.useTabs) {
      vars.add("CONTINUE");
      vars.add("CODEMP");

      app.fields.dataVariables(config).forEach((variable) => vars.add(variable));

      app.fields.mainFields().forEach((field) => {
        if (app.fields.isKeyField(field)) {
          vars.add(u.normalizeVariable(field.variable));
        }

        if (app.fields.isMultiSelect(field)) {
          vars.add(app.fields.multiSelectInputVariable(field));
          vars.add(app.fields.multiSelectTableVariable(field));
          vars.add("SN");
        }

        if (app.fields.usesOptions(field)) {
          vars.add(
            u.normalizeVariable(
              field.optionsVariable,
              app.fields.defaultOptions(field)
            )
          );
        }

        u.parseVariables(field.extraVariables).forEach((variable) => vars.add(variable));
      });

      sharedVariablesForTabs(config).forEach((variable) => vars.add(variable));
    }

    if (app.customButtons && typeof app.customButtons.variables === "function") {
      app.customButtons.variables().forEach((variable) => vars.add(variable));
    }

    return [...vars];
  }

  function appendGeneratedOptionTables(lines, config) {
    if (!config.useRules) return;

    const localIds = new Set(fields(config).map(({ field }) => field.id));
    const tableRoutine = config.gridInTab
      ? config.parentRgRoutineName
      : config.rgRoutineName;

    app.fields.generatedOptionTables()
      .filter((field) => localIds.has(field.id))
      .forEach((field) => {
        const table = u.normalizeVariable(field.optionsVariable, "TABELA");
        const suffix = u.toPascal(field.description || field.variable);
        lines.push(`\tset sc=$$ObterTab${suffix}^${tableRoutine}(.${table})`);
        lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
        lines.push("\t;");
      });
  }

  function appendMaintenanceTableInitializers(lines, config) {
    const seen = new Set();
    const localIds = new Set(fields(config).map(({ field }) => field.id));
    const generatedTables = new Set([
      ...app.fields.generatedOptionTables()
        .filter((field) => localIds.has(field.id))
        .map((field) => u.normalizeVariable(field.optionsVariable, "TABELA")),
      ...generatedGridOptionTables().map((column) => maintenanceTable(column))
    ]);

    maintenanceColumns().forEach(({ column }) => {
      if (maintenanceType(column) !== "combo") return;
      const table = maintenanceTable(column);
      if (seen.has(table)) return;
      seen.add(table);

      if (generatedTables.has(table)) return;

      if (table === "TABSIT") {
        lines.push(`\tset sc=$$ObterSituacao^%CSW1E(.${table},2)`);
        lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
        lines.push("\t;");
      } else {
        lines.push(`\t; TODO: carregar a tabela ${table} utilizada na manutenção do Grid`);
        lines.push("\t;");
      }
    });
  }

  function appendOptionInitializers(lines, config) {
    fields(config).forEach(({ field, label }) => {
      if (!["combo", "checkbox", "radio"].includes(field.type)) return;
      const names = { combo: "Combo", checkbox: "Check", radio: "Radio" };
      const table = u.normalizeVariable(field.optionsVariable, app.fields.defaultOptions(field));
      lines.push(`\tdo Inicializa${names[field.type]}^%CSW1A("cp${label}",.${table},0,,,,1)`);
    });
  }

  function appendMaintenanceActions(lines, config) {
    if (!config.gridMaintenance || !maintenanceColumns().length) return;

    const key = recordKeyDefinition();
    if (!key) return;

    const mtemp = workVariable(config);
    const firstMaintenanceLabel = 4100;
    const workContextArguments = workGlobalContextArguments(config);
    const workContextPrefix = workContextArguments.length
      ? `${workContextArguments.join(",")},`
      : "";
    const gridContextArguments = gridMethodContextArguments(config);

    if (btnManterEnabledHere(config) && !config.gridInTab) {
      lines.push("\t; Salvar alterações do Grid");
      lines.push("3000\tif '$$Validate() quit:$$CSP^%CSW1UTI()");
      lines.push("\t;");

      if (config.useRules && config.generateSave) {
        const args = [...new Set([
          ...app.indexes.macArguments(),
          ...gridTabKeyDefinitions(config).map((definition) => definition.variable),
          ...workContextArguments
        ])];
        lines.push(`	set sc=$$Gravar${config.entityName}^${config.rgRoutineName}(${args.join(",")})`);
        lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 2999");
        lines.push("\t;");
        lines.push("\tdo MECABECALHO^%CSW1UTI()");
      } else {
        lines.push("\t; Implementar gravação definitiva dos registros da global de trabalho");
      }

      lines.push("\t;");
      lines.push("\tgoto 2000");
      lines.push("\t;");
    }

    if (config.gridAllowInsert) {
      lines.push("\t; Incluir");
      lines.push(`3100\tset sc=$$IncluirLinha^%CSW1GRID2(CT,%PRG,${config.gridCode})`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 2999");
      lines.push("\t;");
      lines.push(`\tset sc=$$ModoManutencao^%CSW1GRID(CT,%PRG,${config.gridCode},1,1)`);
      lines.push("\t;");
      lines.push("\tset FLGMANUT=0");
      lines.push("\t;");
      lines.push("\tgoto 4000");
      lines.push("\t;");
    }

    if (config.gridAllowRemove) {
      lines.push("\t; Remover");
      lines.push(`3200\tset sc=$$ObterDadosLinha^%CSW1GRID(CT,%PRG,${config.gridCode},,.VARDET,,.CODREG)`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 4999");
      lines.push("\t;");
      lines.push(`\tset sc=$$RemoverGlobalTrabalho^${config.rgRoutineName}(${workContextPrefix}$piece(VARDET,Z,${key.piece}))`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 4999");
      lines.push("\t;");
      lines.push(`\tset sc=$$ExcluirLinha^%CSW1GRID2(CT,%PRG,${config.gridCode},,,,CODREG)`);
      lines.push("\t;");

      if (config.gridInlineSaveOnConfirm && config.useRules && config.generateSave) {
        const removeSaveArgs = [...new Set([
          ...app.indexes.macArguments(),
          ...gridTabKeyDefinitions(config).map((definition) => definition.variable),
          ...workContextArguments
        ])];

        lines.push(`\tset sc=$$Gravar${config.entityName}^${config.rgRoutineName}(${removeSaveArgs.join(",")})`);
        lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 2999");
        lines.push("\t;");
      }

      lines.push("\tgoto 2999");
      lines.push("\t;");
    }

    lines.push("\t; Manutenção");
    lines.push("3300\t;");
    if (btnManterEnabledHere(config)) lines.push("\tdo BtnManter^%CSW1D(0)");
    lines.push(`\tdo BtnManut^%CSW1D(0,${config.gridCode})`);
    lines.push("\t;");
    lines.push("\tset FLGMANUT=1");
    lines.push("\t;");
    lines.push(`\tset sc=$$ModoManutencao^%CSW1GRID(CT,%PRG,${config.gridCode},1,1)`);
    lines.push("\t;");
    lines.push("\tgoto 4000");
    lines.push("\t;");

    lines.push("\t; Manutenção em linha do Grid");
    lines.push(`4000\tset sc=$$ObterDadosLinha^%CSW1GRID(CT,%PRG,${config.gridCode},,.VARDET,.CODLIN,.CODREG)`);
    lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 4999");
    lines.push("\t;");
    if (autoSequenceMode(config) === "editavel") {
      lines.push(`\tset CHVANT=$select(FLGMANUT:$piece(VARDET,Z,${key.piece}),1:"")`);
      lines.push("\t;");
    }
    lines.push(`\tset ${mtemp}=""`);
    lines.push("\tif FLGMANUT do");
    lines.push(`\t. set sc=$$ObterGlobalTrabalho^${config.rgRoutineName}(${workContextPrefix}$piece(VARDET,Z,${key.piece}),.${mtemp})`);
    lines.push("\t. if $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 4999");
    lines.push("\t;");

    state.gridColumns.forEach((column, index) => {
      const piece = index + 1;
      const sourcePiece = workPiece(column);

      if (!column.recordKey && sourcePiece > 0) {
        lines.push(`\tif FLGMANUT set $piece(VARDET,Z,${piece})=$piece(${mtemp},Z,${sourcePiece})`);
      }

      if (column.editable && String(column.defaultValue || "").trim()) {
        lines.push(`\tif 'FLGMANUT,$piece(VARDET,Z,${piece})="" set $piece(VARDET,Z,${piece})=${formatObjectScriptValue(column.defaultValue)}`);
      }
    });
    lines.push("\t;");

    const editColumns = editFlowColumns(config);
    editColumns.forEach(({ column, piece }, editIndex) => {
      const label = 4100 + editIndex * 100;
      const previousIsAutoKey =
        editIndex > 0 &&
        autoSequenceMode(config) === "auto" &&
        key &&
        editColumns[editIndex - 1].column.id === key.column.id;
      const previousLabel = editIndex === 0 || previousIsAutoKey ? "4999" : 4100 + (editIndex - 1) * 100;
      const nextLabel = editIndex === editColumns.length - 1 ? "4900" : 4100 + (editIndex + 1) * 100;
      const reference = maintenanceReference(piece);
      const type = maintenanceType(column);

      lines.push(`\t; ${u.sanitize(column.title)}`);
      lines.push(`${label}\t;`);

      const sequenceMode = key && column.id === key.column.id ? autoSequenceMode(config) : "";
      const nextSequence = `$$ProximaSequencia^${config.rgRoutineName}(${workContextPrefix.replace(/,$/, "")})`;

      if (sequenceMode === "auto") {
        lines.push(`${label}ON\tif 'FLGMANUT,${reference}="" set ${reference}=${nextSequence}`);
        lines.push(`\tdo TbSet^%CSW1UTI(CODLIN,${piece},${reference},,,,,${config.gridCode})`);
        lines.push(`\tgoto ${nextLabel}`);
        lines.push("\t;");
        return;
      }

      if (sequenceMode === "editavel") {
        lines.push(`${label}ON\tif 'FLGMANUT,${reference}="" set ${reference}=${nextSequence}`);
      } else if (column.lockOnEdit) {
        lines.push(`${label}ON\tif %=140,FLGMANUT goto 4999`);
        lines.push(`\tif FLGMANUT goto ${nextLabel}`);
      } else {
        lines.push(`${label}ON\t;`);
      }

      if (type === "combo") {
        const table = maintenanceTable(column);
        lines.push(`\tdo InicializaCombo^%CSW1A("cp${label}",.${table},0,${reference},,,1)`);
        lines.push(`\tdo TbSet^%CSW1UTI(CODLIN,${piece},$select(${reference}="":"",1:$get(${table}(${reference}))),,,,,${config.gridCode})`);
        lines.push("\t;");
      }

      lines.push(`\t${maintenanceComponent(column, label, piece, config)}`);
      lines.push("\tquit:$$CSP^%CSW1UTI()");
      lines.push(`${label}EX\tgoto 4999:%=27${editIndex === 0 ? "!(%=140)" : `,${previousLabel}:(%=140)`}`);
      lines.push("\t;");
      lines.push(`\tif '$$Valcp${label}() goto ${label}`);
      lines.push("\t;");
      lines.push(`\tgoto ${nextLabel}`);
      lines.push("\t;");
    });

    lines.push("\t; Gravar a Linha");
    lines.push("4900\t;");
    editColumns.forEach(({ column, piece }) => {
      const sourcePiece = workPiece(column);
      if (!column.recordKey && sourcePiece > 0) {
        lines.push(`\tset $piece(${mtemp},Z,${sourcePiece})=$piece(VARDET,Z,${piece})`);
      }
    });
    lines.push("\t;");
    lines.push(`\tif $piece(VARDET,Z,${key.piece})="" do ME^%CSUTIUD("${u.escapeMac(key.column.title)}: Campo obrigatório!") goto ${firstMaintenanceLabel}`);
    lines.push("\t;");
    if (autoSequenceMode(config) === "editavel") {
      lines.push(`\tset sc=$$ReordenarGlobalTrabalho^${config.rgRoutineName}(${workContextPrefix}CHVANT,$piece(VARDET,Z,${key.piece}))`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 4999");
      lines.push("\t;");
    }
    lines.push(`\tset sc=$$GravarGlobalTrabalho^${config.rgRoutineName}(${workContextPrefix}$piece(VARDET,Z,${key.piece}),${mtemp})`);
    lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 4999");
    lines.push("\t;");
    if (autoSequenceMode(config) === "editavel") {
      lines.push(`\tset sc=$$Limpar^%CSW1GRID(CT,%PRG,${config.gridCode})`);
      lines.push(`\tset sc=$$GerarGrid^${config.rgRoutineName}(${joinCallArguments([...gridContextArguments, "%PRG"])})`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 4999");
      lines.push("\t;");
      lines.push("\tif FLGMANUT goto 4999");
      if (config.gridAllowInsert) {
        lines.push(`\tset sc=$$IncluirLinha^%CSW1GRID2(CT,%PRG,${config.gridCode})`);
        lines.push("\tif $$$ISERR(sc) goto 4999");
        lines.push(`\tset sc=$$ModoManutencao^%CSW1GRID(CT,%PRG,${config.gridCode},1,1)`);
        lines.push("\tset FLGMANUT=0");
        lines.push("\t;");
        lines.push("\tgoto 4000");
      } else {
        lines.push("\tgoto 4999");
      }
      lines.push("\t;");
      lines.push("\t; Encerrar Manutenção");
      appendMaintenanceEnd(lines, config);
      return;
    }
    lines.push(`\tset sc=$$GravarGrid^${config.rgRoutineName}(${joinCallArguments([...gridContextArguments, "%PRG", `$piece(VARDET,Z,${key.piece})`, "CODREG"])})`);
    lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 4999");
    lines.push("\t;");

    if (config.gridInlineSaveOnConfirm && config.useRules && config.generateSave) {
      const confirmSaveArgs = [...new Set([
        ...app.indexes.macArguments(),
        ...gridTabKeyDefinitions(config).map((definition) => definition.variable),
        ...workContextArguments
      ])];

      lines.push(`\tset sc=$$Gravar${config.entityName}^${config.rgRoutineName}(${confirmSaveArgs.join(",")})`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 4999");
      lines.push("\t;");
    }

    lines.push(`\tset sc=$$AtualizarLinhaGrid^%CSW1GRID2(CT,%PRG,${config.gridCode},,CODREG,,,,,1)`);
    lines.push("\t;");
    lines.push(`\tif FLGMANUT set sc=$$Movimentar^%CSW1GRID(CT,%PRG,${config.gridCode},141)`);
    if (config.gridAllowInsert) {
      lines.push(`\tif 'FLGMANUT set sc=$$IncluirLinha^%CSW1GRID2(CT,%PRG,${config.gridCode})`);
    } else {
      lines.push("\tif 'FLGMANUT set sc=$$$ERROR(10000,\"Inclusão desabilitada!\")");
    }
    lines.push("\tif $$$ISERR(sc) goto 4999");
    lines.push("\t;");
    lines.push("\tgoto 4000");
    lines.push("\t;");

    lines.push("\t; Encerrar Manutenção");
    appendMaintenanceEnd(lines, config);
  }

  function appendMaintenanceEnd(lines, config) {
    lines.push(`4999\tset sc=$$ModoManutencao^%CSW1GRID(CT,%PRG,${config.gridCode},0,0)`);
    lines.push(`\tset sc=$$AtualizarLinhaGrid^%CSW1GRID2(CT,%PRG,${config.gridCode},CODLIN,CODREG,,,,,1)`);
    lines.push("\t;");
    lines.push(`\tdo BtnManut^%CSW1D(1,${config.gridCode})`);
    if (btnManterEnabledHere(config)) lines.push("\tdo BtnManter^%CSW1D(1)");
    lines.push("\t;");
    lines.push("\tgoto 2999");
    lines.push("\t;");
  }

  function renderGridValcpCode(column, piece, config) {
    const source = String(column.valcpCode || "").trim();
    if (!source) return [];

    const replacements = {
      "{reference}": maintenanceReference(piece),
      "{fieldVariable}": u.normalizeVariable(column.variable),
      "{gridLine}": "CODLIN",
      "{gridColumn}": String(piece),
      "{gridCode}": String(config.gridCode),
      "{company}": companyVariable(),
      "{rgRoutine}": config.rgRoutineName,
      "{routine}": config.routineName
    };

    let result = source;

    Object.entries(replacements).forEach(([token, value]) => {
      result = result.split(token).join(value);
    });

    return result.split(/\r?\n/);
  }

  function appendMaintenanceValidations(lines, config) {
    if (!config.gridMaintenance || !maintenanceColumns().length) return;

    const key = recordKeyDefinition();

    editFlowColumns(config).forEach(({ column, piece }, index) => {
      const label = 4100 + index * 100;
      const reference = maintenanceReference(piece);
      const display = maintenanceDisplay(column, piece);

      lines.push(`\t; Método Valcp${label}()`);
      lines.push(`Valcp${label}()\t;`);

      if (column.required) {
        lines.push(`\tif ${reference}="" do ME^%CSUTIUD("${u.escapeMac(column.title)}: Campo obrigatório!") quit 0`);
        lines.push("\t;");
      }

      const customValcpLines = renderGridValcpCode(column, piece, config);

      if (customValcpLines.length) {
        customValcpLines.forEach((line) => {
          lines.push(line === ";" ? "\t;" : `\t${line}`);
        });
        lines.push("\t;");
      }

      lines.push(`\tdo TbSet^%CSW1UTI(CODLIN,${piece},${display},,,,,${config.gridCode})`);

      dependentDisplayColumns(column).forEach(({ position, expression }) => {
        lines.push(`\tdo TbSet^%CSW1UTI(CODLIN,${position},${expression},,,,,${config.gridCode})`);
      });
      lines.push("\t;");

      if (key && column.id === key.column.id && !autoSequenceMode(config)) {
        lines.push(`\tif '$get(FLGMANUT),$$ExisteGlobalTrabalho^${config.rgRoutineName}(CT,${reference}) do ME^%CSUTIUD("${u.escapeMac(column.title)} "_${reference}_" já informado!") quit 0`);
        lines.push("\t;");
      }

      lines.push("\tquit $$$OK");
      lines.push("\t;");
    });
  }

  function formatObjectScriptValue(value) {
    const clean = String(value ?? "").trim();
    if (/^-?(?:\d+|\d+\.\d+)$/.test(clean)) return clean;
    if (clean.startsWith("$") || clean.startsWith("^") || clean.includes("(")) return clean;
    return `"${u.escapeMac(clean)}"`;
  }

  function generateInterface(config = app.getConfig()) {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const lines = [];
    const vars = routineVariables(config);
    const filterDefs = filterDefinitions(config);
    const localFilterDefs = filterDefs.filter((definition) => !definition.inherited);
    const entryParameterNames = new Set(entryParametersOf().map((item) => item.toUpperCase()));
    const filterVars = localFilterDefs
      .map((definition) => definition.variable)
      .filter((variable) => config.gridInTab || !entryParameterNames.has(String(variable).toUpperCase()));
    const multiTableVars = fields(config)
      .map(({ field }) => field)
      .filter((field) => app.fields.isMultiSelect(field))
      .map((field) => app.fields.multiSelectTableVariable(field));
    const firstLabel = fields(config).length ? "1000" : "2000";
    const focusLabel = config.gridMaintenance ? "2999" : "3000";
    const checkDefs = checkColumns();
    const checkLabel = checkActionLabel(config);
    const workContextArguments = workGlobalContextArguments(config);
    const workContextCall = joinCallArguments(workContextArguments);
    const workContextPrefix = workContextCall ? `${workContextCall},` : "";
    const cleanupArguments = cleanupContextArguments(config);
    const persistentArgumentList =
      config.gridMaintenance && recordKeyDefinition() ? app.indexes.macArguments(config) : [];
    const contextArgumentSet = new Set(
      [...cleanupArguments, ...persistentArgumentList].map((argument) =>
        String(argument || "").replace(/^\./, "").toUpperCase()
      )
    );
    const allFilterArgs = [
      ...filterDefs
        .map((definition) => definition.variable)
        .filter((variable) => !contextArgumentSet.has(String(variable || "").toUpperCase())),
      ...multiTableVars
        .map((variable) => `.${variable}`)
        .filter((variable) => !contextArgumentSet.has(String(variable || "").replace(/^\./, "").toUpperCase())),
      ...entryLoadParameters(config).map((item) => item.variable)
    ];
    const filterArgs = allFilterArgs.length ? `,${allFilterArgs.join(",")}` : "";
    const cleanupCall = joinCallArguments(cleanupArguments);
    const cleanupPrefix = cleanupCall ? `${cleanupCall},` : "";
    const gridContextArguments = gridMethodContextArguments(config);

    const entryParameters = !config.gridInTab ? entryParametersOf() : [];
    const entryParameterSet = new Set(entryParameters.map((item) => item.toUpperCase()));
    if (entryParameterSet.size) {
      for (let index = vars.length - 1; index >= 0; index -= 1) {
        if (entryParameterSet.has(String(vars[index]).toUpperCase())) vars.splice(index, 1);
      }
    }

    lines.push(`ROUTINE ${config.routineName}`);
    lines.push(`${config.routineName}${entryParameters.length ? `(${entryParameters.join(",")})` : ""}\t; ${month}/${year} - ${u.escapeMac(config.title)} <#ROTINA GERADA AUTOMATICAMENTE#>`);
    lines.push("\t;");
    lines.push("\t#include %CSUTICSP");
    lines.push("\t;");

    if (config.gridInTab) {
      lines.push("0000\tquit");
      lines.push("\t;");
      lines.push("\t; Inicializar");
      lines.push("0500\t;");

      appendGeneratedOptionTables(lines, config);
      appendGeneratedGridOptionTableInitializers(lines, config);
      if (config.gridMaintenance) appendMaintenanceTableInitializers(lines, config);
      appendColumnInitializers(lines, config);
      appendListOptionLoads(lines, config);
      appendActionMenuInitializers(lines, config);

      if (filterVars.length) {
        lines.push(`\tset (${filterVars.join(",")})=""`);
      }

      const savedFields = savedFieldDefinitions(config);
      if (savedFields.length && config.gridMaintenance && config.generateSave) {
        lines.push(
          `\tset sc=$$ObterDados${config.entityName}^${config.rgRoutineName}(${[
            ...app.indexes.macArguments(),
            ...gridTabKeyDefinitions(config).map((definition) => definition.variable),
            ...savedFields.map((definition) => `.${definition.variable}`)
          ].join(",")})`
        );
      }
      multiTableVars.forEach((variable) => lines.push(`\tkill ${variable}`));
      if (checkDefs.length) {
        lines.push("\tkill TABERRO");
        lines.push(`\tset CODCOL="",CODGRID=${config.gridCode}`);
      }

      if (config.gridMaintenance) {
        lines.push(`\tset (CODLIN,CODREG,FLGMANUT,VARDET,${workVariable(config)})=""`);
        lines.push(`\tset sc=$$ExcluirGlobalTrabalho^${config.rgRoutineName}(${cleanupCall})`);
      }

      lines.push("\t;");
      lines.push("\tdo 9000,8000");
      lines.push("\t;");
      lines.push(`\tgoto ${config.gridTab && config.gridTab.gridFirst === true && fields(config).length ? "2000" : firstLabel}`);
      lines.push("\t;");
    } else {
      lines.push(`0000\tdo New^%CSW1UTI("${vars.join(",")}")`);
      lines.push("\t;");
      lines.push(`\tnew ${vars.join(",")}`);
      lines.push("\t;");
      lines.push(`\tset %PRG="${config.routineName}"`);
      lines.push("\tset CT=%index");

      if (companyVariable() === "CODEMP") {
        lines.push("\tset CODEMP=CE");
      }

      lines.push("\t;");
      lines.push("\tset sc=$$ValidarExecucaoCSW^%CSUTIRG001()");
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
      lines.push("\t;");

      if (config.useTabs) {
        lines.push(`\tset sc=$$GerarAbas^${config.rgRoutineName}($get(${companyVariable()}))`);
        lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
        lines.push("\t;");
      }

      appendTypedReaderConfigurations(lines, config);
      appendGeneratedOptionTables(lines, config);
      appendGeneratedGridOptionTableInitializers(lines, config);
      if (config.gridMaintenance) appendMaintenanceTableInitializers(lines, config);
      appendColumnInitializers(lines, config);
      appendListOptionLoads(lines, config);
      appendActionMenuInitializers(lines, config);

      lines.push(`\t; csw:aj:${config.windowWidth},${config.windowHeight},${u.escapeMac(config.title)}`);
      lines.push(`\tdo AJ^%CSUTIUD(${config.windowWidth},${config.windowHeight},"${u.escapeMac(config.title)}")`);
      lines.push("\t;");
      lines.push("\t; Inicializar");

      if (filterVars.length) {
        lines.push(`0500\tset (${filterVars.join(",")})=""`);
      } else {
        lines.push("0500\t;");
      }

      multiTableVars.forEach((variable) => lines.push(`\tkill ${variable}`));
      if (checkDefs.length) {
        lines.push("\tkill TABERRO");
        lines.push(`\tset CODCOL="",CODGRID=${config.gridCode}`);
      }
      if (config.gridMaintenance) {
        lines.push(`\tset (CODLIN,CODREG,FLGMANUT,VARDET,${workVariable(config)})=""`);
        lines.push(`\tset sc=$$ExcluirGlobalTrabalho^${config.rgRoutineName}(${cleanupCall})`);
      }
      lines.push("\t;");
      lines.push("\tdo 9000,8000");
      lines.push("\t;");
      lines.push(`\tgoto ${firstLabel}`);
      lines.push("\t;");
    }

    appendFields(lines, config);

    const enableAfterConsult = app.customButtons && typeof app.customButtons.buttonsForLocation === "function"
      ? app.customButtons.buttonsForLocation(config.gridLocationId || "parent").filter((button) => button.initialState === 0)
      : [];

    lines.push("\t; Gerar Grid");
    lines.push("2000\tif '$$Validate() quit");
    lines.push("\t;");
    lines.push(`\tset sc=$$Limpar^%CSW1GRID(CT,%PRG,${config.gridCode})`);
    lines.push("\t;");
    if (enableAfterConsult.length) {
      enableAfterConsult.forEach((button) => {
        lines.push(`\tdo HabBotGeral^%CSW1("${u.escapeMac(button.buttonId)}",0)`);
      });
      lines.push("\t;");
    }
    // Os argumentos do índice acompanham a assinatura da RG.
    const persistentArgs =
      config.gridMaintenance && recordKeyDefinition()
        ? app.indexes.macArguments(config)
        : (sessionCompanyLoad(config) ? ["CE"] : []);
    const persistentPrefix = persistentArgs.length ? `${persistentArgs.join(",")},` : "";

    const dynamicColumns = dynamicColumnsOf(config);
    if (dynamicColumns) {
      lines.push("\t; Colunas conforme os filtros");
      lines.push(`\tkill ${dynamicColumns.table}`);
      dynamicColumns.load.split(/\r?\n/).filter((line) => line.trim()).forEach((line) => {
        lines.push(`\t${line.trim().split("{table}").join(dynamicColumns.table)}`);
      });
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 2000EX");
      lines.push("\tdo 9050");
      lines.push("\t;");
    }

    lines.push(
      `\tset sc=$$GerarGlobalTrabalho^${config.rgRoutineName}(${persistentPrefix}${cleanupPrefix}%PRG${filterArgs})`
    );
    lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 2000EX");
    lines.push("\t;");

    if (config.gridInTab && config.gridMaintenance && config.generateSave) {
      lines.push(`\tset ${saveFlagVariable(config)}=1`);
      lines.push("\t;");
    }

    lines.push(`\tset sc=$$GerarGrid^${config.rgRoutineName}(${joinCallArguments([...gridContextArguments, "%PRG"])})`);
    lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc)");
    lines.push("\t;");
    if (enableAfterConsult.length) {
      enableAfterConsult.forEach((button) => {
        lines.push(`\tif $$$ISOK(sc) do HabBotGeral^%CSW1("${u.escapeMac(button.buttonId)}",1)`);
      });
      lines.push("\t;");
    }
    lines.push("2000EX\t;");
    lines.push("\t;");

    if (config.gridMaintenance && maintenanceColumns().length) {
      lines.push(`\t${viewOnlyTab(config) ? "if '$get(DISABLE) " : ""}do BtnManut^%CSW1D(1,${config.gridCode})`);
      lines.push("\t;");
    }

    const afterGridLabel = config.gridTab && config.gridTab.gridFirst === true && fields(config).length ? "1000" : focusLabel;
    lines.push(`\tset sc=$$ValidarDisplay^%CSW1GRID(CT,%PRG,${config.gridCode})`);
    lines.push(`\tif $$$ISERR(sc) goto ${afterGridLabel}`);
    lines.push("\t;");
    lines.push(`\tset sc=$$Movimentar^%CSW1GRID(CT,%PRG,${config.gridCode},,1)`);
    lines.push("\t;");

    if (config.gridMaintenance && maintenanceColumns().length && btnManterEnabledHere(config)) {
      lines.push("\tdo BtnManter^%CSW1D(1)");
      lines.push("\t;");
    }

    lines.push(`\tgoto ${afterGridLabel}`);
    lines.push("\t;");
    lines.push("\t; Foco final");
    const finalFocusMode = gridFinalFocusMode(config);
    const gridFields = fields(config);

    if (finalFocusMode === "save") {
      lines.push(`${focusLabel}\tdo Focus^%CSW1UTI(%PRG,"${gridSaveButtonId(config)}",,1) quit`);
    } else if (finalFocusMode === "consult") {
      lines.push(`${focusLabel}\tdo Focus^%CSW1UTI(%PRG,"btConsultar",,1) quit`);
    } else if (finalFocusMode.startsWith("campo:")) {
      lines.push(`${focusLabel}\tdo Focus^%CSW1UTI(%PRG,"cp${finalFocusMode.slice(6)}",,1) quit`);
    } else if (finalFocusMode === "lastField" && gridFields.length) {
      lines.push(`${focusLabel}\tdo Focus^%CSW1UTI(%PRG,"cp${gridFields.at(-1).label}",,1) quit`);
    } else if (checkDefs.length) {
      lines.push(`${focusLabel}\t;`);
      checkDefs.forEach(({ piece }) => {
        lines.push(`\tdo TbSetCheckHeader^%CSW1GRID3(${config.gridCode},${piece},$$ValidarSelecaoTodos^%CSW1GRIDCHECK(CT,%PRG,${config.gridCode},${piece}))`);
      });
      lines.push("\t;");
      lines.push(`\tdo Focus^%CSW1GRID3(CT,%PRG,${config.gridCode},1) quit`);
    } else {
      lines.push(`${focusLabel}\tdo Focus^%CSW1GRID3(CT,%PRG,${config.gridCode},1) quit`);
    }
    lines.push("\t;");

    if (checkDefs.length) {
      lines.push("\t; Marca/Desmarca");
      lines.push(`${checkLabel}\tset sc=$$MarcaDesmarca^%CSW1GRIDCHECK(CT,%PRG,CODGRID,CODCOL,1)`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc)");
      lines.push("\t;");
      lines.push(`\tgoto ${focusLabel}`);
      lines.push("\t;");
    }

    appendMaintenanceActions(lines, config);
    appendShow(lines, config);

    if (app.customButtons) {
      app.customButtons.appendActions(
        lines,
        config,
        config.gridLocationId || "parent",
        config.routineName
      );
    }

    const interfaceCode = config.gridInTab
      ? tabHooks(config).interfaceCode
      : ((app.state && app.state.ruleHooks) || {}).interfaceCode;
    appendActionMenuLabels(lines, config, config.gridMaintenance ? "2999" : "3000");

    if (app.mac && typeof app.mac.appendListF7Labels === "function") {
      app.mac.appendListF7Labels(lines, config.gridLocationId || "parent", config.routineName);
    }

    lines.push(...u.renderHookLines(interfaceCode));

    lines.push("\t; Montar Tela");
    lines.push("9000\tdo Clear^%CSW1UTI()");
    lines.push("\tdo Enable^%CSW1UTI()");
    lines.push("\t;");

    if (!config.gridInTab && config.routineMode === "grid" && config.gridUseConsultButton !== false) {
      lines.push("\tdo BtnConsultar^%CSW1D(1)");
      lines.push("\t;");
    }

    appendOptionInitializers(lines, config);

    const disabledGridControls = fields(config)
      .filter(({ field }) => field.disabled === true)
      .map(({ label }) => `cp${label}`);

    if (disabledGridControls.length) {
      lines.push(`\tdo DisableCp^%CSW1UTI("${disabledGridControls.join(",")}")`);
      lines.push("\t;");
    }

    const conditionalControls = fields(config)
      .filter(({ field }) => field.disabled !== true && String(field.enabledWhen || "").trim());
    conditionalControls.forEach(({ field, label }) => {
      lines.push(`\tif '(${String(field.enabledWhen).trim()}) do DisableCp^%CSW1UTI("cp${label}")`);
    });
    if (conditionalControls.length) lines.push("\t;");

    if (app.customButtons) {
      app.customButtons.appendInitializers(
        lines,
        config.gridLocationId || "parent"
      );
    }

    if (viewOnlyTab(config)) {
      lines.push("\tif $get(DISABLE) do Disable^%CSW1UTI()");
      if (app.customButtons) {
        app.customButtons.buttonsForLocation(config.gridLocationId).forEach((button, index) => {
          const id = String(button.buttonId || `btPersonalizado${index + 1}`);
          lines.push(`\tif $get(DISABLE) do HabBotGeral^%CSW1("${u.escapeMac(id)}",0)`);
        });
      }
      lines.push("\t;");
    }

    if (config.gridMaintenance && maintenanceColumns().length) {
      lines.push(`\tdo BtnManut^%CSW1D(0,${config.gridCode})`);
      if (btnManterEnabledHere(config)) lines.push("\tdo BtnManter^%CSW1D(0)");
      lines.push("\t;");
    }

    const dynamicGrid = dynamicColumnsOf(config);
    if (dynamicGrid) {
      lines.push(`\tkill ${dynamicGrid.table}`);
      lines.push("\tdo 9050");
      lines.push("\t;");
      if (config.gridInTab) lines.push(...u.renderHookLines(tabHooks(config).screenCode));
      lines.push("\tquit");
      lines.push("\t;");
      lines.push("\t; Montar o grid (colunas fixas + dinâmicas)");
      lines.push("9050\t;");
    }
    lines.push(`\tkill TABGRID(${config.gridCode})`);
    lines.push("\t;");
    const columnPlacement = Number(config.gridColumnPosition) > 0
      ? ` ColPos=${Number(config.gridColumnPosition)};${Number(config.gridTableWidth) > 0 ? ` TamTab=${Number(config.gridTableWidth)};` : ""}`
      : "";
    lines.push(`\tset TABGRID(${config.gridCode})="; csw:gridConf:cod=${config.gridCode}; LinPos=${config.gridLinePosition}; Altura=${config.gridHeight}; LinIni=${config.gridLineStart}; LinFim=${config.gridLineEnd};${columnPlacement} HabilitaNavegacao=${config.gridNavigation}; LabelEdit=${config.gridEditLabel}^${config.routineName};"`);

    state.gridColumns.forEach((column, index) => {
      const piece = index + 1;
      if (isCheckColumn(column)) {
        lines.push(`\tset TABGRID(${config.gridCode},${piece})="; csw:gridCols:cod=${config.gridCode}; Tipo=checkheader; Csw=${column.width}^${u.escapeMac(column.title)};"`);
        return;
      }
      if (String(column.clickLabel || "").trim()) {
        lines.push(`\tset TABGRID(${config.gridCode},${piece})="; csw:gridCols:cod=${config.gridCode}; Tipo=${column.type}; Csw=${column.width}^${u.escapeMac(column.title)}^^^^1^^1;"`);
        return;
      }
      const staticSuffix = config.gridMaintenance && column.editable ? "^^^^1" : "";
      lines.push(`\tset TABGRID(${config.gridCode},${piece})="; csw:gridCols:cod=${config.gridCode}; Tipo=${column.type}; Csw=${column.width}^${u.escapeMac(column.title)}${staticSuffix};"`);
    });

    lines.push("\t;");
    if (dynamicGrid) {
      const base = state.gridColumns.length;
      lines.push(`\tset COLDIN=${base},SEQDIN=""`);
      lines.push(`\tfor  set SEQDIN=$order(${dynamicGrid.table}(SEQDIN)) quit:SEQDIN=""  set COLDIN=COLDIN+1,TABGRID(${config.gridCode},COLDIN)="; csw:gridCols:cod=${config.gridCode}; Tipo="_$piece(${dynamicGrid.table}(SEQDIN),Z,1)_"; Csw="_$piece(${dynamicGrid.table}(SEQDIN),Z,2)_"^"_$piece(${dynamicGrid.table}(SEQDIN),Z,3)_";"`);
      lines.push("\t;");
      lines.push(`\tset sc=$$AtuConfGrid^%CSW1GRID2(CT,%PRG,${config.gridCode},.TABGRID)`);
      lines.push(`\tset sc=$$Inicializar^%CSW1GRID(CT,%PRG,${config.gridCode},.TABGRID)`);
      lines.push("\t;");
      lines.push("\tquit");
      lines.push("\t;");
    } else {
      lines.push(`\tset sc=$$Inicializar^%CSW1GRID(CT,%PRG,${config.gridCode},.TABGRID)`);
      lines.push("\t;");
      if (config.gridInTab) lines.push(...u.renderHookLines(tabHooks(config).screenCode));
      lines.push("\tquit");
      lines.push("\t;");
    }
    lines.push("\t; Fim");
    lines.push(`9999\tset sc=$$ExcluirGlobalTrabalho^${config.rgRoutineName}(${cleanupCall})`);
    lines.push("\t;");
    lines.push(`\tset sc=$$Finalizar^%CSW1GRID(CT,%PRG,${config.gridCode})`);
    lines.push("\t;");

    if (config.gridInTab) {
      lines.push(`\tdo execLabelTabPanel^%CSW1A("${config.sheetId}","9999^${config.parentRoutineName}")`);
    } else {
      lines.push("\tdo FJ^%CSUTIUD");
      lines.push("\tdo FJ^%CSW1UTI");
    }

    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");

    if (checkDefs.length) {
      lines.push("\t; Erros na seleção");
      lines.push("ERROSELECAO\t;");
      lines.push(`\tdo ^%CSUTIPE("5,50","1","Erros,Erro,Cod.",25,"TABERRO(@1","%codret",,,,,"ERROSELECAOPE1^${config.routineName}")`);
      lines.push("\tquit:$$CSP^%CSW1UTI()");
      lines.push("\t;");
      lines.push(`ERROSELECAOPE1\tgoto ${focusLabel}`);
      lines.push("\t;");
    }

    appendValidations(lines, config);
    appendMaintenanceValidations(lines, config);

    if (config.gridMaintenance && config.gridRowEnter && maintenanceColumns().length) {
      lines.push("\t; Evento Enter do Grid");
      lines.push("TbRowEnter(%cswTabela,%cswLin)\t;");
      lines.push(`\tset sc=$$ObterDadosLinha^%CSW1GRID(CT,%PRG,${config.gridCode})`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
      lines.push("\t;");
      lines.push("\tgoto 3300");
      lines.push("\t;");
    }

    lines.push("\t; Método Click no Grid");
    lines.push(`${config.gridEditLabel}(%cswLin,%cswCol)\t;`);
    const clickColumns = clickableColumns();
    const cellClickCode = u.renderHookLines(
      config.gridInTab ? tabHooks(config).cellClickCode : ((app.state && app.state.ruleHooks) || {}).cellClickCode
    );
    if (checkDefs.length || clickColumns.length || cellClickCode.length) {
      lines.push("\tset CODCOL=$piece(%cswCol,Y,1)");
      lines.push("\tset CODGRID=$piece(%cswCol,Y,2)");
      lines.push("\t;");
    }
    lines.push(...cellClickCode);
    if (checkDefs.length) {
      lines.push(`\tif ${checkDefs.map(({ piece }) => `(CODCOL=${piece})`).join("!")} goto ${checkLabel}`);
      lines.push("\t;");
    }
    if (clickColumns.length) {
      clickColumns.forEach(({ position, label, title }) => {
        lines.push(`\tif CODCOL=${position} goto ${label}\t; ${u.sanitize(title)}`);
      });
      lines.push("\t;");
    }
    lines.push(`\tgoto ${focusLabel}`);
    lines.push("\t;");

    if (checkDefs.length) {
      lines.push("\t; Evento Click no Cabeçalho do Grid");
      lines.push("TbHeaderClick(%cswNumTab,%cswColuna,%cswChecked)\t;");
      lines.push(`\tif ${checkDefs.map(({ piece }) => `(%cswColuna'=${piece})`).join("&&")} quit`);
      lines.push("\t;");
      lines.push("\tset CODCOL=$piece(%cswColuna,Y,1)");
      lines.push("\tset CODGRID=%cswNumTab");
      lines.push("\tset CHECK=%cswChecked");
      lines.push("\t;");
      lines.push("\tset sc=$$MarcaDesmarcaTodos^%CSW1GRIDCHECK(CT,%PRG,CHECK,CODGRID,CODCOL,1,.TABERRO)");
      lines.push("\t;");
      lines.push("\tif $$$ISERR(sc) goto ERROSELECAO");
      lines.push("\t;");
      lines.push(`\tgoto ${focusLabel}`);
      lines.push("\t;");
    }

    lines.push("\t; Método Show");
    lines.push("Show(%cswP1,%cswP2,%cswP3,%cswP4)\t;");
    lines.push(`\tdo Show^%CSW1UTI("${config.routineName}",$get(%cswP1),$get(%cswP2),$get(%cswP3),$get(%cswP4))`);
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
    lines.push("\t; Tags CSW");
    lines.push("\t;");

    fields(config).forEach(({ field, label }) => {
      lines.push(`\t; csw:label:${field.labelColumn},${field.labelLine},${field.labelSize},${u.sanitize(field.description)}${field.required ? "*" : ""}`);
      if (app.fields.hasDisplay(field)) {
        lines.push(`\t; csw:display:${field.displayColumn},${field.displayLine},${field.displaySize},ds${label}`);
      }
    });

    if (config.gridMaintenance && maintenanceColumns().length) {
      const includeAction = config.gridAllowInsert ? `3100^${config.routineName}` : `2999^${config.routineName}`;
      const removeAction = config.gridAllowRemove ? `3200^${config.routineName}` : `2999^${config.routineName}`;
      lines.push("\t;");
      lines.push(`\t; csw:btnManut:${config.gridMaintenanceButtonColumn},${config.gridMaintenanceButtonLine},3300^${config.routineName},${includeAction},${removeAction},${config.gridCode}`);
      if (btnManterEnabledHere(config)) {
        const actionRoutine = config.gridInTab
          ? config.parentRoutineName
          : config.routineName;

        lines.push(`\t; csw:btnManter:${config.gridMaintenanceButtonColumn},${config.gridSaveButtonLine},3000^${actionRoutine},0500^${actionRoutine}`);
      }
    }

    if (!config.gridInTab && config.routineMode === "grid" && config.gridUseConsultButton !== false) {
      lines.push("	;");
      lines.push(`	; csw:btnConsultar:${config.gridConsultButtonColumn},${config.gridConsultButtonLine},2000^${config.routineName},0500^${config.routineName}`);
    }

    if (app.customButtons) {
      app.customButtons.appendTags(
        lines,
        config.gridLocationId || "parent",
        config.routineName
      );
    }

    lines.push("\t;");
    if (config.gridInTab) lines.push("\t; csw:labelseltab:0500");
    lines.push(`\t; csw:labelcreate:${config.routineName}`);
    lines.push("\t; csw:labeldestroy:9999");
    lines.push("\t; csw:csp:gerar");

    return lines.join("\n");
  }

  // Tira um subscrito da referência: ^G(codEmpresa,artigo) -> ^G(codEmpresa).
  function removeSubscript(globalReference, subscript) {
    const match = globalReference.match(/^([^(]+)\((.*)\)$/);
    if (!match) return globalReference;

    const remaining = match[2]
      .split(",")
      .filter((item) => item.trim() !== subscript);

    return remaining.length ? `${match[1]}(${remaining.join(",")})` : match[1];
  }

  function replaceSubscript(globalReference, subscript, replacement) {
    const match = globalReference.match(/^([^(]+)\((.*)\)$/);
    if (!match) return globalReference;

    const items = match[2]
      .split(",")
      .map((item) => (item.trim() === subscript ? replacement : item));

    return `${match[1]}(${items.join(",")})`;
  }

  function appendSubscript(globalReference, subscript) {
    if (!subscript) return globalReference;
    if (globalReference.includes("(")) {
      return globalReference.replace(/\)$/, `,${subscript})`);
    }
    return `${globalReference}(${subscript})`;
  }

  function columnExpression(column, source, variable = source) {
    const expression = String(column.displayExpression || "").trim();
    if (!expression) return source;

    return expression
      .split("{value}").join(source)
      .split("{source}").join(source)
      .split("{variable}").join(variable);
  }

  function uniqueColumnVariables() {
    const reserved = new Set([
      "sc", "dados", "display", "detalha", "codEmpresa", "term",
      "rotina", "codSequencia", "codRegistro"
    ]);
    const used = new Set(reserved);

    return state.gridColumns.map((column, index) => {
      let variable = u.toParameter(column.variable || column.title || `coluna${index + 1}`);
      if (used.has(variable)) {
        variable = `${variable}Grid`;
      }
      let suffix = 2;
      const base = variable;
      while (used.has(variable)) {
        variable = `${base}${suffix++}`;
      }
      used.add(variable);
      return variable;
    });
  }

  function appendGenerateTabsMethod(lines, config) {
    if (config.gridInTab || !config.useTabs) return;

    lines.push("\t; Criar Abas");
    lines.push("\t;");
    lines.push("GerarAbas(codEmpresa)\t;");
    lines.push("\t$$$VAR");
    lines.push("\tnew sheet");
    lines.push("\t;");

    state.tabs.forEach((tab, index) => {
      const routineName = u.normalizeVariable(
        tab.routineName,
        `${config.routineName}TAB${index + 1}`
      );

      lines.push(
        `\tset sheet(${index + 1})="${routineName}^${u.escapeMac(tab.title)}^${tab.disabled === true ? 1 : 0}"`
      );
    });

    lines.push("\t;");
    lines.push(
      `\tdo criarTabPanel^%CSW1A("${config.sheetId}",${config.tabPanelLine},${config.tabPanelColumn},${config.tabPanelHeight},${config.tabPanelWidth},.sheet)`
    );
    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
  }

  function generateRules(config = app.getConfig()) {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const lines = [];
    const workGlobal = `^${config.gridWorkGlobal}`;
    const workContextParameters = workGlobalContextParameters(config);
    const workContextSignature = workContextParameters.join(",");
    const cleanupParameters = cleanupContextParameters(config);
    const cleanupSignature = cleanupParameters.join(",");
    const gridContextParameters = gridMethodContextParameters(config);
    const runtimeTermParameter = gridRuntimeTermParameter(config);
    const workRecord = workGlobalRecordDefinition(config);
    const workRecordName = workRecord.name;
    const gridRegistrationParameter =
      workRecordName.toLowerCase() === "codregistro" ? "codReg" : "codRegistro";
    const workRoot = workGlobalRootReference(config);
    const workItem = workGlobalItemReference(config, workRecordName);
    const checkGlobal = checkGlobalReference(config);
    const checkContextParameter = workContextParameters[0] || "term";
    const checkDefs = checkColumns();
    const mtempVariable = workVariable(config);
    const filterDefs = filterDefinitions(config);
    const workArgumentSet = new Set(
      cleanupContextDefinitions(config).map((definition) =>
        String(definition.argument || "").replace(/^\./, "").toUpperCase()
      )
    );
    const filterParams = filterDefs
      .filter((definition) => !workArgumentSet.has(String(definition.variable || "").toUpperCase()))
      .map((definition) => definition.parameter);
    const multiTableParams = fields(config)
      .map(({ field }) => field)
      .filter((field) => app.fields.isMultiSelect(field))
      .map((field) => u.toParameter(app.fields.multiSelectTableVariable(field)));
    const persistentParameterSet = new Set(
      (config.gridMaintenance && recordKeyDefinition()
        ? app.indexes.rgParameters(config)
        : []
      ).map((parameter) => String(parameter || "").toUpperCase())
    );
    const allFilterParams = [...filterParams, ...multiTableParams].filter(
      (parameter) => !persistentParameterSet.has(String(parameter || "").toUpperCase())
    ).concat(entryLoadParameters(config).map((item) => item.parameter));
    const filterArgs = allFilterParams.length ? `,${allFilterParams.join(",")}` : "";
    const columnVariables = uniqueColumnVariables();
    const key = recordKeyDefinition();
    // Quando a coluna chave do grid também é índice da global, ela já vem no
    // ^GLOBAL(codEmpresa,artigo). Aqui a base fica sem ela: o nó com a chave é
    // montado adiante, para o $order poder percorrer os registros.
    const baseReference =
      key && key.isGlobalIndex
        ? removeSubscript(app.indexes.globalReference(config), key.parameter)
        : app.indexes.globalReference(config);
    const tabKeyDefs = gridTabKeyDefinitions(config);
    let persistentBase = config.gridGlobalSubscript
      ? appendSubscript(baseReference, config.gridGlobalSubscript)
      : baseReference;

    tabKeyDefs.forEach((definition) => {
      persistentBase = appendSubscript(persistentBase, definition.parameter);
    });

    const persistentNode = key ? appendSubscript(persistentBase, key.parameter) : persistentBase;

    lines.push(`ROUTINE ${config.rgRoutineName}`);
    lines.push(`${config.rgRoutineName}\t; ${month}/${year} - ${u.escapeMac(config.title)} <#ROTINA GERADA AUTOMATICAMENTE#> (REGRAS GRID)`);
    lines.push("\t;");
    lines.push("\t#include %CSUTICSP");
    lines.push("\t;");

    appendGenerateTabsMethod(lines, config);
    appendGeneratedGridOptionTableMethods(lines);
    appendActionMenuMethods(lines, config);

    if (config.gridMaintenance && config.generateSave) {
      const savedFields = savedFieldDefinitions(config);
      const keyParams = [...new Set([
        ...app.indexes.rgParameters(),
        ...tabKeyDefs.map((definition) => definition.parameter)
      ])];
      const saveParams = [...new Set([
        ...keyParams,
        ...workContextParameters,
        ...savedFields.map((definition) => definition.parameter)
      ])];
      lines.push(`\t; Gravar ${u.sanitize(config.title)}`);
      lines.push("\t;");
      lines.push(`\t; set sc=$$Gravar${config.entityName}^${config.rgRoutineName}(${saveParams.join(",")})`);
      lines.push(`Gravar${config.entityName}(${saveParams.join(",")})\t;`);
      lines.push("\t$$$VAR");
      lines.push(savedFields.length ? "\tnew sc,dadosAba" : "\tnew sc");
      lines.push("\t;");
      if (tabKeyDefs.length) {
        lines.push(
          `\tif ${tabKeyDefs.map((definition) => `($get(${definition.parameter})="")`).join("!")} quit $$$OK`
        );
        lines.push("\t;");
      }
      lines.push(`\tdo $$$KillMergeG(${persistentBase},${workRoot})`);
      lines.push("\t;");

      if (savedFields.length) {
        lines.push('\tset dadosAba=""');
        savedFields.forEach((definition, index) => {
          lines.push(`\tset $piece(dadosAba,Z,${index + 1})=${definition.parameter}`);
        });
        lines.push(`\tdo $$$SetG(${persistentBase},dadosAba)`);
        lines.push("\t;");
      }

      lines.push("\tquit $$$OK");
      lines.push("\t;");

      if (savedFields.length) {
        const obtainParams = [...keyParams, ...savedFields.map((definition) => definition.parameter)];
        lines.push(`\t; Obter Dados ${u.sanitize(config.title)}`);
        lines.push("\t;");
        lines.push(`\t; set sc=$$ObterDados${config.entityName}^${config.rgRoutineName}(${[...keyParams, ...savedFields.map((definition) => `.${definition.parameter}`)].join(",")})`);
        lines.push(`ObterDados${config.entityName}(${obtainParams.join(",")})\t;`);
        lines.push("\t$$$VAR");
        lines.push("\tnew dadosAba");
        lines.push("\t;");
        lines.push(`\tset (${savedFields.map((definition) => definition.parameter).join(",")})=""`);
        lines.push(`\tset dadosAba=$get(${persistentBase})`);
        savedFields.forEach((definition, index) => {
          lines.push(`\tset ${definition.parameter}=$piece(dadosAba,Z,${index + 1})`);
        });
        lines.push("\t;");
        lines.push("\tquit $$$OK");
        lines.push("\t;");
      }
    }

    lines.push("\t; Excluir Global de Trabalho");
    lines.push(`ExcluirGlobalTrabalho(${cleanupSignature})\t;`);
    lines.push("\t$$$VAR");
    lines.push("\tnew sc");
    lines.push("\t;");
    lines.push(`\tkill ${workRoot}`);
    if (checkDefs.length) {
      const checkRoot = `${checkGlobal}(${runtimeTermParameter})`;
      lines.push(`\tkill ${checkRoot}`);
    }
    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
    // Quando o corpo lê a global persistente, os índices dela (codEmpresa e
    // as chaves) precisam entrar na assinatura.
    const persistentParameters =
      config.gridMaintenance && key
        ? app.indexes.rgParameters(config)
        : (sessionCompanyLoad(config) ? ["codEmpresa"] : []);

    lines.push("\t; Gerar Global de Trabalho");
    lines.push(
      `GerarGlobalTrabalho(${joinCallArguments([
        ...persistentParameters,
        ...cleanupParameters,
        "rotina"
      ])}${filterArgs})\t;`
    );
    // Nome do laço livre de colisão com os parâmetros da assinatura.
    const signatureNames = new Set([
      ...persistentParameters,
      ...cleanupParameters,
      "rotina",
      ...allFilterParams
    ]);

    let loopVariable = key ? key.parameter : workRecordName;
    if (signatureNames.has(loopVariable)) {
      let suffix = 2;
      while (signatureNames.has(`${loopVariable}${suffix}`)) suffix += 1;
      loopVariable = `${loopVariable}${suffix}`;
    }

    lines.push("\t$$$VAR");
    lines.push(`\tnew sc,${loopVariable},${mtempVariable}`);
    lines.push("\t;");
    lines.push("\tset sc=1");
    lines.push("\t;");
    lines.push(`\tset sc=$$ExcluirGlobalTrabalho(${cleanupSignature})`);
    lines.push("\tif $$$ISERR(sc) quit sc");
    lines.push("\t;");

    const workGlobalHook = String(
      (config.gridInTab ? tabHooks(config) : ((app.state && app.state.ruleHooks) || {})).workGlobalCode || ""
    ).trim();
    if (workGlobalHook) {
      lines.push(`\tset ${mtempVariable}=""`);
      workGlobalHook.replace(/\r\n/g, "\n").split("\n").forEach((line) => {
        const text = line.split("{mtemp}").join(mtempVariable);
        if (!text.trim()) lines.push("\t;");
        else if (/^[%A-Za-z0-9]+\t/.test(text)) lines.push(text);
        else lines.push(`\t${text.replace(/^\t/, "")}`);
      });
    } else if (config.gridMaintenance && key) {
      const loopNode =
        loopVariable === key.parameter
          ? persistentNode
          : replaceSubscript(persistentNode, key.parameter, loopVariable);

      lines.push(`\tset ${loopVariable}=""`);
      lines.push("\t;");
      lines.push(`\tfor  set ${loopVariable}=$order(${loopNode}) quit:${loopVariable}=""!$$$ISERR(sc)  do`);
      lines.push(`\t. set ${mtempVariable}=$get(${loopNode})`);
      lines.push(`\t. set sc=$$GravarGlobalTrabalho(${joinCallArguments([...workContextParameters, loopVariable, mtempVariable])})`);
      lines.push("\t. quit:$$$ISERR(sc)");
    } else {
      lines.push("\t; TODO: percorrer a origem dos dados, montar a variável da global de trabalho");
      lines.push(`\t; e chamar: set sc=$$GravarGlobalTrabalho(${joinCallArguments([...workContextParameters, workRecordName, mtempVariable])})`);
    }

    if (!config.gridMaintenance && !config.gridInTab) {
      lines.push("\t;");
      lines.push(`\tif $$$ISOK(sc),$order(${appendSubscript(workRoot, '""')})="" quit $$$ERROR(10000,"Não há dados para consulta!")`);
    }

    lines.push("\t;");
    lines.push("\tquit sc");
    lines.push("\t;");
    lines.push("\t; Gravar Global de Trabalho");
    lines.push(`GravarGlobalTrabalho(${joinCallArguments([...workContextParameters, workRecordName, mtempVariable])})\t;`);
    lines.push("\t$$$VAR");
    lines.push("\tnew sc");
    lines.push("\t;");
    lines.push(`\tset ${workItem}=${mtempVariable}`);
    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");

    if (config.gridMaintenance) {
      lines.push("\t; Remover Global de Trabalho");
      lines.push(`RemoverGlobalTrabalho(${joinCallArguments([...workContextParameters, workRecordName])})\t;`);
      lines.push("\t$$$VAR");
      lines.push("\tnew sc");
      lines.push("\t;");
      lines.push(`\tkill ${workItem}`);
      lines.push("\t;");
      lines.push("\tquit $$$OK");
      lines.push("\t;");
      lines.push("\t; Verificar Global de Trabalho");
      lines.push(`ExisteGlobalTrabalho(${joinCallArguments([...workContextParameters, workRecordName])})\t;`);
      lines.push(`\tquit $data(${workItem})`);
      lines.push("\t;");

      if (autoSequenceMode(config)) {
        const lastItem = appendSubscript(workRoot, '""');
        const itemFor = (variable) => appendSubscript(workRoot, variable);
        lines.push("\t; Próxima Sequência");
        lines.push("\t;");
        lines.push(`\t; set sequencia=$$ProximaSequencia^${config.rgRoutineName}(${workContextParameters.join(",")})`);
        lines.push(`ProximaSequencia(${workContextParameters.join(",")})\t;`);
        lines.push("\t$$$VAR");
        lines.push("\tnew ultima");
        lines.push("\t;");
        lines.push(`\tset ultima=$order(${lastItem},-1)`);
        lines.push("\t;");
        lines.push('\tquit $select(ultima="":1,1:ultima+1)');
        lines.push("\t;");
      }

      if (autoSequenceMode(config) === "editavel") {
        const itemFor = (variable) => appendSubscript(workRoot, variable);
        lines.push("\t; Reordenar Global de Trabalho");
        lines.push("\t;");
        lines.push(`\t; set sc=$$ReordenarGlobalTrabalho^${config.rgRoutineName}(${joinCallArguments([...workContextParameters, "sequenciaAnterior", "sequenciaNova"])})`);
        lines.push(`ReordenarGlobalTrabalho(${joinCallArguments([...workContextParameters, "sequenciaAnterior", "sequenciaNova"])})\t;`);
        lines.push("\t$$$VAR");
        lines.push("\tnew sequencia");
        lines.push("\t;");
        lines.push('\tif $get(sequenciaAnterior)=sequenciaNova quit $$$OK');
        lines.push(`\tif $get(sequenciaAnterior)'="" kill ${itemFor("sequenciaAnterior")}`);
        lines.push(`\tif '$data(${itemFor("sequenciaNova")}) quit $$$OK`);
        lines.push("\t;");
        lines.push('\tset sequencia=""');
        lines.push(`\tfor  set sequencia=$order(${itemFor("sequencia")},-1) quit:sequencia=""!(sequencia<sequenciaNova)  do`);
        lines.push(`\t. merge ${itemFor("sequencia+1")}=${itemFor("sequencia")}`);
        lines.push(`\t. kill ${itemFor("sequencia")}`);
        lines.push("\t;");
        lines.push("\tquit $$$OK");
        lines.push("\t;");
      }
    }

    if (checkDefs.length) {
      const keyPiece = key ? key.piece : 1;
      lines.push("\t; Verificar registro marcado/selecionado");
      lines.push("VerificarRegistroMarcado(term,codGrid,codigo,coluna)\t;");
      lines.push("\t$$$VAR");
      lines.push("\t;");
      lines.push("\tset coluna=$get(coluna,1)");
      lines.push("\t;");
      lines.push(`\tif '$data(${checkGlobal}(term,codGrid,coluna,codigo)) quit 0`);
      lines.push("\t;");
      lines.push("\tquit $$$OK");
      lines.push("\t;");
      lines.push("\t; Obter chave para marcar/desmarcar");
      lines.push("ObterChaveMarcaDesmarca(term,detalha,codGrid,coluna)\t;");
      lines.push("\t$$$VAR");
      lines.push("\tnew codigo");
      lines.push("\t;");
      lines.push("\tset coluna=$get(coluna,1)");
      lines.push(`\tset codigo=$piece(detalha,Z,${keyPiece})`);
      lines.push("\t;");
      lines.push(`\tquit $name(${checkGlobal}(term,codGrid,coluna,codigo))`);
      lines.push("\t;");
      lines.push("\t; Validar marcação/desmarcação");
      lines.push("ValidarMarcaDesmarca(term,detalha,codGrid,coluna,flgAcaoCheck)\t;");
      lines.push("\t$$$VAR");
      lines.push("\tnew sc");
      lines.push("\t;");
      lines.push("\t; Inclua aqui regras específicas para permitir ou bloquear a alteração do check.");
      lines.push("\t;");
      lines.push("\tquit $$$OK");
      lines.push("\t;");
    }

    lines.push("\t; Obter Global de Trabalho");
    lines.push(`ObterGlobalTrabalho(${joinCallArguments([...workContextParameters, workRecordName, mtempVariable])})\t;`);
    lines.push("\t$$$VAR");
    lines.push("\tnew sc");
    lines.push("\t;");
    lines.push(`\tset ${mtempVariable}=""`);
    lines.push(`\tif '$data(${workItem}) quit $$$ERROR(10000,"Registro "_${workRecordName}_" não cadastrado!")`);
    lines.push("\t;");
    lines.push(`\tset ${mtempVariable}=$get(${workItem})`);
    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
    lines.push("\t; Gerar Grid");
    lines.push(`GerarGrid(${joinCallArguments([...gridContextParameters, "rotina"])})\t;`);
    lines.push("\t$$$VAR");
    lines.push(`\tnew sc,${workRecordName}`);
    lines.push("\t;");
    lines.push("\tset sc=1");
    lines.push(`\tset ${workRecordName}=\"\"`);
    lines.push("\t;");
    lines.push(`\tfor  set ${workRecordName}=$order(${workItem}) quit:${workRecordName}=""!$$$ISERR(sc)  do`);
    lines.push(`\t. set sc=$$GravarGrid(${joinCallArguments([...gridContextParameters, "rotina", workRecordName])})`);
    lines.push("\t. quit:$$$ISERR(sc)");
    lines.push("\t;");
    lines.push("\tquit sc");
    lines.push("\t;");
    lines.push("\t; Gravar Grid");
    lines.push(`GravarGrid(${joinCallArguments([...gridContextParameters, "rotina", workRecordName, gridRegistrationParameter])})\t;`);
    lines.push("\t$$$VAR");
    const hasColor = state.gridColumns.some((column) => String(column.backgroundColor || "").trim() || String(column.fontColor || "").trim());
    lines.push(`\tnew sc,dados,display,detalha,${mtempVariable}${hasColor ? ",corFundo,corFonte" : ""}`);
    if (columnVariables.length) {
      lines.push(`\tnew ${columnVariables.join(",")}`);
    }

    const ruleExtraVariables = [...new Set(
      state.gridColumns.flatMap((column) => u.parseVariables(column.ruleVariables))
    )].filter((variable) => !columnVariables.includes(variable));

    if (ruleExtraVariables.length) {
      lines.push(`\tnew ${ruleExtraVariables.join(",")}`);
    }
    lines.push("\t;");
    lines.push(`\tset (dados,display,detalha,${mtempVariable})=""`);
    lines.push("\t;");
    lines.push(`\tset sc=$$ObterGlobalTrabalho(${joinCallArguments([...workContextParameters, workRecordName, `.${mtempVariable}`])})`);
    lines.push("\tif $$$ISERR(sc) quit sc");
    lines.push("\t;");

    state.gridColumns.forEach((column, index) => {
      const piece = index + 1;
      const variable = columnVariables[index] || `coluna${piece}`;
      const source = columnSource(column, mtempVariable, workRecordName);

      if (isCheckColumn(column)) {
        lines.push(`\tset ${variable}=$$VerificarRegistroMarcado(${runtimeTermParameter},${config.gridCode},${workRecordName},${piece})`);
      } else {
        lines.push(
          column.displayOnly === true
            ? `\tset ${variable}=""`
            : `\tset ${variable}=${source}`
        );
      }
    });

    if (state.gridColumns.length) lines.push("\t;");

    state.gridColumns.forEach((column, index) => {
      const piece = index + 1;
      const variable = columnVariables[index] || `coluna${piece}`;
      const source = columnSource(column, mtempVariable, workRecordName);
      if (isCheckColumn(column)) return;

      const obtainLines = renderObtainCode(
        column.obtainCode,
        column,
        variable,
        source,
        piece,
        config
      );

      if (obtainLines.length) {
        lines.push(`\t; Obter ${u.sanitize(column.title)}`);
        obtainLines.forEach((line) => {
          lines.push(line.trim() === ";" ? "\t;" : `\t${line}`);
        });
      }

      if (column.displayOnly === true) {
        lines.push(`\tset ${variable}=${columnExpression(column, source, variable)}`);
      }

      if (obtainLines.length || column.displayOnly === true) {
        lines.push("\t;");
      }
    });

    state.gridColumns.forEach((column, index) => {
      const piece = index + 1;
      const source = columnSource(column, mtempVariable, workRecordName);
      const variable = columnVariables[index] || `coluna${piece}`;

      if (isCheckColumn(column)) {
        lines.push(`\tset $piece(dados,Z,${piece})=${variable}`);
        return;
      }

      if (column.displayOnly === true) {
        lines.push(`\tset $piece(dados,Z,${piece})=${variable}`);
        return;
      }

      lines.push(`\tset $piece(dados,Z,${piece})=${source}`);

      const expression = String(column.displayExpression || "").trim();
      if (expression) {
        lines.push(`\tset $piece(display,Z,${piece})=${columnExpression(column, variable, variable)}`);
      }
    });

    const detailColumns = config.gridMaintenance
      ? state.gridColumns
          .map((column, index) => ({ column, piece: index + 1 }))
          .filter(({ column }) => !isCheckColumn(column) && column.displayOnly !== true)
      : state.gridColumns
          .map((column, index) => ({ column, piece: index + 1 }))
          .filter(({ column }) => !isCheckColumn(column) && column.detail);

    if (checkDefs.length && key && !detailColumns.some(({ piece }) => piece === key.piece)) {
      detailColumns.push(key);
    }

    if (detailColumns.length) {
      lines.push("\t;");
      detailColumns.forEach(({ column, piece }) => {
        const value = columnSource(column, mtempVariable, workRecordName);
        lines.push(`\tset $piece(detalha,Z,${piece})=${value}`);
      });
    }

    const colored = state.gridColumns
      .map((column, index) => ({ column, piece: index + 1 }))
      .filter(({ column }) => String(column.backgroundColor || "").trim() || String(column.fontColor || "").trim());
    if (colored.length) {
      lines.push("\t;");
      lines.push("\tset (corFundo,corFonte)=\"\"");
      colored.forEach(({ column, piece }) => {
        if (String(column.backgroundColor || "").trim()) lines.push(`\tset $piece(corFundo,Z,${piece})=${String(column.backgroundColor).trim()}`);
        if (String(column.fontColor || "").trim()) lines.push(`\tset $piece(corFonte,Z,${piece})=${String(column.fontColor).trim()}`);
      });
    }

    const dynamicColumnsRg = dynamicColumnsOf(config);
    if (dynamicColumnsRg) {
      const base = state.gridColumns.length;
      const first = dynamicColumnsRg.firstWorkPiece;
      lines.push("\t;");
      lines.push(`\tif $length(${mtempVariable},Z)'<${first} set $piece(dados,Z,${base + 1},${base}+$length(${mtempVariable},Z)-${first - 1})=$piece(${mtempVariable},Z,${first},$length(${mtempVariable},Z))`);
    }

    lines.push("\t;");
    lines.push(`\tset sc=$$GravarLinhas^%CSW1GRID(${runtimeTermParameter},rotina,${config.gridCode},dados,$select(display'="":display,1:""),detalha,$get(${gridRegistrationParameter}),${colored.length ? "corFundo,corFonte" : ","},,,,1)`);
    lines.push("\t;");
    lines.push("\tquit sc");
    lines.push("\t;");
    if (config.gridInTab) lines.push(...u.renderHookLines(tabHooks(config).extraMethods));
    lines.push("\t; Tags CSW");
    lines.push("\t;");
    lines.push("\t; csw:csp:naogerar");

    return lines.join("\n");
  }

  function generateInterfaceFor(locationId, baseConfig = app.getConfig()) {
    return withLocation(
      locationId,
      (config) => generateInterface(config),
      baseConfig
    );
  }

  function generateRulesFor(locationId, baseConfig = app.getConfig()) {
    return withLocation(
      locationId,
      (config) => generateRules(config),
      baseConfig
    );
  }

  function sharedVariablesForTabs(baseConfig = app.getConfig()) {
    const variables = new Set();

    state.tabs
      .filter((tab) => tab.contentType === "grid")
      .forEach((tab) => {
        withLocation(tab.id, (config) => {
          routineVariables(config).forEach((variable) => variables.add(variable));
        }, baseConfig);
      });

    return [...variables];
  }

  function tabSaveDefinitions(baseConfig = app.getConfig()) {
    return state.tabs
      .filter((tab) => tab.contentType === "grid")
      .map((tab, tabIndex) => withLocation(tab.id, (config) => {
        if (!config.gridMaintenance || !config.generateSave) {
          return null;
        }

        return {
          tabId: tab.id,
          tabIndex,
          title: tab.title,
          routineName: config.routineName,
          rgRoutineName: config.rgRoutineName,
          methodName: `Gravar${config.entityName}`,
          flagVariable: saveFlagVariable(config),
          arguments: [
            ...app.indexes.macArguments(),
            ...gridTabKeyDefinitions(config).map((definition) => definition.variable),
            "CT",
            ...savedFieldDefinitions(config).map((definition) => definition.variable)
          ]
        };
      }, baseConfig))
      .filter(Boolean);
  }

  app.grid = {
    createColumn,
    loadDefaultColumns,
    render,
    updateFromInput,
    add,
    move,
    remove,
    initialize,
    generateInterface,
    generateRules,
    maintenanceColumns,
    recordKeyDefinition,
    generatedGridOptionTables,
    tableSuggestions,
    ensureLocation,
    selectLocation,
    syncLocations,
    saveActive,
    removeLocation,
    resetLocations,
    isGridSettingElement,
    applyPositionSuggestions,
    markPositionManual,
    suggestedGridLinePosition,
    configFor,
    generateInterfaceFor,
    generateRulesFor,
    sharedVariablesForTabs,
    tabSaveDefinitions,
    saveFlagVariable,
    availableLocations,
    normalizeColumnType,
    isCheckColumn,
    checkColumns,
    normalizeWorkGlobalParameterSource,
    renderWorkGlobalParameterEditor
  };
})(window.GeradorRotinasJsonPadrao);
