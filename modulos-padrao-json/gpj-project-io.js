(function (app) {
  const FORMAT = "gerador-rotinas-json-padrao";
  const SCHEMA_VERSION = 1;

  const byId = (id) => document.getElementById(id);

  function clone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function booleanValue(value, fallback = false) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    return ["1", "true", "sim", "yes", "on"].includes(
      String(value).trim().toLowerCase()
    );
  }

  function numberValue(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function currentSettings() {
    if (app.grid && typeof app.grid.saveActive === "function") {
      app.grid.saveActive();
    }

    const config = app.getConfig();

    return {
      routineName: config.routineName,
      routineTitle: config.title,
      routineMode: config.routineMode,
      windowWidth: config.windowWidth,
      windowHeight: config.windowHeight,
      dataVariable: config.dataVariable,

      useTabs: config.useTabs,
      sheetId: config.sheetId,
      tabPanelLine: config.tabPanelLine,
      tabPanelColumn: config.tabPanelColumn,
      tabPanelHeight: config.tabPanelHeight,
      tabPanelWidth: config.tabPanelWidth,
      generateSaveAnother: config.generateSaveAnother,

      useRules: config.useRules,
      rgRoutineName: config.rgRoutineName,
      entityName: config.entityName,
      globalName: config.globalName,
      useRoutineCompany: config.useRoutineCompany,
      generateObtain: config.generateObtain,
      generateSave: config.generateSave,
      generateDelete: config.generateDelete,
      generateLock: config.generateLock,

      useBtnManter: config.useBtnManter,
      btnManterColumn: config.btnManterColumn,
      btnManterLine: config.btnManterLine,
      btnManterLocation: config.btnManterLocation,

      saveInterfaceFiles: app.el.saveInterfaceFiles?.checked !== false,
      saveRuleFiles: app.el.saveRuleFiles?.checked !== false,
      overwriteGeneratedFiles: app.el.overwriteGeneratedFiles?.checked !== false
    };
  }

  function createDocument() {
    if (app.grid && typeof app.grid.saveActive === "function") {
      app.grid.saveActive();
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      format: FORMAT,
      generatedAt: new Date().toISOString(),
      settings: currentSettings(),
      state: {
        tabs: clone(app.state.tabs) || [],
        fields: clone(app.state.fields) || [],
        globalIndexes: clone(app.state.globalIndexes) || [],
        customButtons: clone(app.state.customButtons) || [],
        parentGrid: clone(app.state.parentGrid),
        activeGridLocation: app.state.activeGridLocation || "parent",
        activePreview: app.state.activePreview || "parent",
        activeMacRoutine: app.state.activeMacRoutine || "parent",
        activeRuleRoutine: app.state.activeRuleRoutine || "rg",
        layoutSuggestions: clone(app.state.layoutSuggestions) || {}
      }
    };
  }

  function downloadText(filename, content, mimeType = "application/json") {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJson() {
    const documentValue = createDocument();
    const routineName = app.utils.normalizeVariable(
      documentValue.settings.routineName,
      "ROTINAGERADA"
    );

    downloadText(
      `${routineName}.gerador-json.json`,
      `${JSON.stringify(documentValue, null, 2)}\n`
    );

    app.utils.showToast("Configuração JSON exportada.");
  }

  function copyJson() {
    const text = JSON.stringify(createDocument(), null, 2);
    app.utils.copyText(text, "JSON do projeto copiado.");
  }

  function suggestedSettingsFromSimple(input) {
    const routine = input.routine || {};
    const rules = input.rules || {};
    const current = currentSettings();

    return {
      ...current,
      routineName: routine.name || routine.routineName || input.routineName || current.routineName,
      routineTitle: routine.title || routine.routineTitle || input.title || current.routineTitle,
      routineMode: routine.mode || routine.type || routine.routineMode || current.routineMode,
      windowWidth: numberValue(routine.width ?? routine.windowWidth, current.windowWidth),
      windowHeight: numberValue(routine.height ?? routine.windowHeight, current.windowHeight),
      dataVariable: routine.dataVariable || current.dataVariable,
      useTabs: booleanValue(routine.useTabs, Array.isArray(input.tabs) && input.tabs.length > 0),
      useRules: booleanValue(routine.useRules ?? rules.enabled, current.useRules),
      rgRoutineName: routine.rgRoutineName || rules.name || current.rgRoutineName,
      entityName: routine.entityName || rules.entityName || current.entityName,
      globalName: routine.globalName || rules.globalName || current.globalName,
      useRoutineCompany: booleanValue(
        routine.useRoutineCompany ?? rules.useRoutineCompany,
        current.useRoutineCompany
      ),

      // Origens simples (importador de tela/imagem/desenhador) também definem
      // onde ficam os botões de manutenção.
      useBtnManter: booleanValue(routine.useBtnManter, current.useBtnManter),
      btnManterLine: numberValue(routine.btnManterLine, current.btnManterLine),
      btnManterColumn: numberValue(routine.btnManterColumn, current.btnManterColumn),
      btnManterLocation: routine.btnManterLocation || current.btnManterLocation,
      generateSaveAnother: booleanValue(
        routine.generateSaveAnother,
        current.generateSaveAnother
      ),
      generateDelete: booleanValue(routine.generateDelete, current.generateDelete),
      tabPanelWidth: numberValue(routine.tabPanelWidth, current.tabPanelWidth),
      tabPanelColumn: numberValue(routine.tabPanelColumn, current.tabPanelColumn)
    };
  }

  function normalizeWorkGlobalParameters(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (!item || typeof item !== "object") return "";
          const name = item.name || item.parameter || item.param || "";
          const argument = item.argument || item.value || item.variable || item.expression || "";
          if (!String(name).trim()) return "";
          return String(argument).trim()
            ? `${String(name).trim()}=${String(argument).trim()}`
            : String(name).trim();
        })
        .filter(Boolean)
        .join(",");
    }

    if (value && typeof value === "object") {
      return Object.entries(value)
        .map(([name, argument]) =>
          String(argument ?? "").trim()
            ? `${String(name).trim()}=${String(argument).trim()}`
            : String(name).trim()
        )
        .filter(Boolean)
        .join(",");
    }

    return String(value ?? "").trim();
  }

  function normalizeGridColumnType(value) {
    const clean = String(value || "a").trim().toLowerCase();
    if (["check", "checkbox", "check-header", "check_header", "checkheader"].includes(clean)) {
      return "checkheader";
    }
    if (["n", "integer", "inteiro", "number", "numeric", "numero", "numérico", "numerico"].includes(clean)) {
      return "n";
    }
    if (["d", "date", "data"].includes(clean)) return "d";
    if (["v3", "decimal", "float", "value", "valor"].includes(clean)) return "v3";
    if (["a", "string", "text", "texto", "alphanumeric", "alfanumerico", "alfanumérico"].includes(clean)) {
      return "a";
    }
    return "a";
  }

  function simpleGridList(input) {
    if (Array.isArray(input.grids)) return clone(input.grids) || [];
    if (input.grid && typeof input.grid === "object") return [clone(input.grid)];
    return [];
  }

  function adaptSimpleDocument(input) {
    const tabs = clone(input.tabs) || [];
    const fields = (clone(input.fields) || []).map((field) => {
      const lookup = field.lookup || {};
      const typedReader =
        field.typedReader && typeof field.typedReader === "object"
          ? field.typedReader
          : {};
      return {
        ...field,
        _applyLookupPreset: true,
        typedReaderEnabled:
          field.typedReaderEnabled ?? typedReader.enabled ?? false,
        typedReaderConfigVariable:
          field.typedReaderConfigVariable ?? typedReader.configVariable,
        typedReaderConfigText:
          field.typedReaderConfigText ?? typedReader.configText,
        typedReaderConfigMethod:
          field.typedReaderConfigMethod ?? typedReader.configMethod,
        typedReaderRoutine:
          field.typedReaderRoutine ?? typedReader.routine,
        typedReaderCompanyExpression:
          field.typedReaderCompanyExpression ?? typedReader.companyExpression,
        typedReaderControlDefinition:
          field.typedReaderControlDefinition ?? typedReader.controlDefinition,
        typedReaderExtraDefinition:
          field.typedReaderExtraDefinition ?? typedReader.extraDefinition,
        typedReaderUseCurrentValue:
          field.typedReaderUseCurrentValue ?? typedReader.useCurrentValue,
        tabId: field.tabId ?? field.location ?? "parent",
        multiSelectTableVariable:
          field.multiSelectTableVariable ?? field.tableVariable ?? "",
        multiSelectGlobalReference:
          field.multiSelectGlobalReference ?? field.selectedGlobal ?? "",
        generateF7Routine299:
          field.generateF7Routine299 ?? lookup.generate299 ?? false,
        f7GeneratedRoutineName:
          field.f7GeneratedRoutineName ?? lookup.routineName ?? "",
        f7GeneratedLabel: field.f7GeneratedLabel ?? lookup.label ?? "",
        f7SelectedGlobalReference:
          field.f7SelectedGlobalReference ?? lookup.allRecordsGlobal ?? "",
        f7GeneratedPieces: field.f7GeneratedPieces ?? lookup.pieces ?? "",
        f7GeneratedColumnSizes:
          field.f7GeneratedColumnSizes ?? lookup.columnSizes ?? "",
        f7GeneratedTitles: field.f7GeneratedTitles ?? lookup.columnNames ?? "",
        f7GeneratedRows: field.f7GeneratedRows ?? lookup.lines ?? 15
      };
    });

    const customButtons = (clone(input.buttons || input.customButtons) || []).map(
      (button) => ({
        ...button,
        location: button.location ?? "parent"
      })
    );

    const state = {
      tabs,
      fields,
      globalIndexes: clone(input.indexes || input.globalIndexes) || [],
      customButtons,
      parentGrid: null,
      activeGridLocation: "parent",
      activePreview: "parent",
      activeMacRoutine: "parent",
      activeRuleRoutine: "rg",
      layoutSuggestions: {
        tabPanelLineAuto: true,
        tabPanelHeightAuto: true,
        btnManterLineAuto: true,
        windowHeightAuto: true
      }
    };

    simpleGridList(input).forEach((grid) => {
      const location = grid.location ?? grid.tabId ?? "parent";
      const definition = grid.definition || {
        locationId: location,
        settings: {
          gridCode: grid.code ?? grid.gridCode,
          gridLinePosition: grid.line ?? grid.linePosition ?? grid.gridLinePosition,
          gridHeight: grid.height ?? grid.gridHeight,
          gridLineStart: grid.startLine ?? grid.lineStart ?? grid.line ?? grid.gridLineStart,
          gridLineEnd: grid.endLine ?? grid.lineEnd ?? grid.gridLineEnd,
          gridNavigation: grid.navigation ?? grid.gridNavigation,
          gridWorkGlobal: grid.workGlobal ?? grid.gridWorkGlobal,
          gridWorkGlobalParameters: normalizeWorkGlobalParameters(
            grid.workGlobalParameters ??
            grid.mtempParameters ??
            grid.parameters ??
            grid.gridWorkGlobalParameters
          ),
          gridUseConsultButton:
            grid.consultButton && typeof grid.consultButton === "object"
              ? booleanValue(grid.consultButton.enabled, true)
              : booleanValue(grid.consultButton ?? grid.useConsultButton ?? grid.gridUseConsultButton, true),
          gridConsultButtonColumn: numberValue(
            grid.consultButton?.column ?? grid.consultButtonColumn ?? grid.gridConsultButtonColumn,
            86
          ),
          gridConsultButtonLine: numberValue(
            grid.consultButton?.line ?? grid.consultButtonLine ?? grid.gridConsultButtonLine,
            1
          ),
          gridCheckGlobal:
            grid.checkGlobal ??
            grid.selectionGlobal ??
            grid.checkSelection?.workGlobal ??
            grid.gridCheckGlobal,
          gridEditLabel: grid.editLabel ?? grid.gridEditLabel,
          gridMaintenance: grid.maintenance ?? grid.gridMaintenance,
          gridInlineMaintenance: grid.maintenance ?? grid.gridInlineMaintenance,
          gridAutoButtonPosition:
            grid.automaticButtonPosition ?? grid.gridAutoButtonPosition,
          gridMaintenanceButtonColumn:
            grid.maintenanceButtonColumn ?? grid.gridMaintenanceButtonColumn,
          gridMaintenanceButtonLine:
            grid.maintenanceButtonLine ?? grid.gridMaintenanceButtonLine,
          gridSaveButtonLine: grid.saveButtonLine ?? grid.gridSaveButtonLine,
          gridAllowInsert: grid.allowInsert ?? grid.gridAllowInsert,
          gridAllowRemove: grid.allowRemove ?? grid.gridAllowRemove,
          gridRowEnter: grid.rowEnter ?? grid.gridRowEnter
        },
        columns: (clone(grid.columns) || []).map((column, index) => {
          const type = normalizeGridColumnType(column.type);
          const isCheck = type === "checkheader";
          return {
            ...column,
            type,
            title: isCheck ? String(column.title || "") : column.title,
            width: column.width ?? (isCheck ? 10 : undefined),
            variable: column.variable || (isCheck ? `CHECK${index + 1}` : undefined),
            workPiece: isCheck ? 0 : (column.workPiece ?? column.piece),
            displayOnly: isCheck ? true : column.displayOnly,
            detail: isCheck ? false : (column.detail ?? column.includeInDetail),
            recordKey: isCheck ? false : (column.recordKey ?? column.key),
            editable: isCheck ? false : column.editable,
            required: isCheck ? false : column.required,
            lockOnEdit: isCheck ? false : column.lockOnEdit,
            _applyLookupPreset: !isCheck
          };
        })
      };

      if (String(location).toLowerCase() === "parent") {
        state.parentGrid = definition;
        return;
      }

      const tab = tabs.find(
        (item) =>
          item.id === location ||
          item.routineName === location ||
          item.title === location
      );
      if (tab) tab.grid = definition;
    });

    return {
      schemaVersion: input.schemaVersion || SCHEMA_VERSION,
      format: FORMAT,
      settings: suggestedSettingsFromSimple(input),
      state
    };
  }

  function normalizeDocument(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("O JSON precisa conter um objeto na raiz.");
    }

    if (input.settings && input.state) {
      return clone(input);
    }

    if (input.routine || input.fields || input.tabs || input.grids || input.grid) {
      return adaptSimpleDocument(input);
    }

    throw new Error(
      "Estrutura não reconhecida. Use o JSON exportado pela ferramenta ou o modelo para IA."
    );
  }

  function uniqueId(preferred, used) {
    const base = String(preferred || "").trim();
    if (base && !used.has(base)) {
      used.add(base);
      return base;
    }

    let result = app.utils.createId();
    while (used.has(result)) result = app.utils.createId();
    used.add(result);
    return result;
  }

  function normalizedState(documentValue) {
    const source = documentValue.state || {};
    const usedTabIds = new Set();
    const usedFieldIds = new Set();
    const usedButtonIds = new Set();
    const tabAliases = new Map();
    const fieldAliases = new Map();
    const buttonAliases = new Map();

    const tabs = (clone(source.tabs) || []).map((tab, index) => {
      const oldId = tab.id;
      const id = uniqueId(oldId, usedTabIds);
      const normalized = {
        ...tab,
        id,
        title: String(tab.title || `Aba ${index + 1}`),
        routineName: app.utils.normalizeVariable(
          tab.routineName,
          `${documentValue.settings?.routineName || "ROTINA"}TAB${index + 1}`
        ),
        contentType: tab.contentType === "grid" ? "grid" : "fields",
        disabled: booleanValue(tab.disabled ?? tab.initiallyDisabled, false),
        fieldAlignment:
          String(tab.fieldAlignment ?? tab.fieldsAlignment ?? tab.alignment ?? "left").toLowerCase() === "center"
            ? "center"
            : "left",
        autoFieldLayout: tab.autoFieldLayout !== false,
        finalFocus:
          ["save", "grid", "lastField"].includes(
            String(tab.finalFocus ?? tab.focusAfterFields ?? "auto")
          )
            ? String(tab.finalFocus ?? tab.focusAfterFields)
            : "auto"
      };

      [oldId, tab.routineName, tab.title, String(index + 1)].forEach((alias) => {
        if (alias !== undefined && alias !== null && String(alias).trim()) {
          tabAliases.set(String(alias), id);
        }
      });
      tabAliases.set(id, id);
      return normalized;
    });

    function resolveTabLocation(value) {
      const clean = String(value ?? "parent").trim();
      if (!clean || clean.toLowerCase() === "parent") return "parent";
      return tabAliases.get(clean) || clean;
    }

    const customButtons = (clone(source.customButtons) || []).map((button) => {
      const oldId = button.id;
      const id = uniqueId(oldId, usedButtonIds);
      const location = resolveTabLocation(button.location || "parent");
      const defaults =
        app.customButtons && typeof app.customButtons.create === "function"
          ? app.customButtons.create({ ...button, location })
          : {};
      const normalized = {
        ...defaults,
        ...button,
        id,
        location
      };
      if (oldId) buttonAliases.set(String(oldId), id);
      buttonAliases.set(id, id);
      return normalized;
    });

    function resolveLocation(value) {
      const clean = String(value ?? "parent").trim();
      if (!clean || clean.toLowerCase() === "parent") return "parent";

      if (clean.startsWith("button-screen-")) {
        const oldButtonId = clean.slice("button-screen-".length);
        const newButtonId = buttonAliases.get(oldButtonId) || oldButtonId;
        return `button-screen-${newButtonId}`;
      }

      return resolveTabLocation(clean);
    }

    customButtons.forEach((button) => {
      button.location = resolveLocation(button.location || "parent");
    });

    const fields = (clone(source.fields) || []).map((field, index) => {
      const oldId = field.id;
      const id = uniqueId(oldId, usedFieldIds);
      const location = resolveLocation(field.tabId ?? field.location ?? "parent");
      const defaults =
        app.fields && typeof app.fields.createField === "function"
          ? app.fields.createField({ ...field, tabId: location })
          : {};
      if (
        field._applyLookupPreset === true &&
        field.lookupPreset &&
        field.lookupPreset !== "none" &&
        app.fieldLookups &&
        typeof app.fieldLookups.applyPresetToField === "function"
      ) {
        app.fieldLookups.applyPresetToField(defaults, field.lookupPreset);
      }
      const normalized = {
        ...defaults,
        ...field,
        id,
        description: String(field.description || `Campo ${index + 1}`),
        variable: app.utils.normalizeVariable(field.variable, `CAMPO${index + 1}`),
        tabId: location
      };

      const destinationTab = tabs.find((tab) => tab.id === location);
      if (destinationTab) {
        const centered = destinationTab.fieldAlignment === "center";
        const layout = centered
          ? { labelColumn: 8, labelSize: 27, inputColumn: 36 }
          : { labelColumn: 7, labelSize: 9, inputColumn: 16 };

        if (field.labelColumn === undefined || field.labelColumn === null) {
          normalized.labelColumn = layout.labelColumn;
        }
        if (field.labelSize === undefined || field.labelSize === null) {
          normalized.labelSize = layout.labelSize;
        }
        if (field.inputColumn === undefined || field.inputColumn === null) {
          normalized.inputColumn = layout.inputColumn;
        }
        if (field.displayColumn === undefined || field.displayColumn === null) {
          normalized.displayColumn =
            Number(normalized.inputColumn || layout.inputColumn) +
            Number(normalized.inputSize || 20) +
            2;
        }
      }

      [oldId, field.variable, field.description].forEach((alias) => {
        if (alias !== undefined && alias !== null && String(alias).trim()) {
          fieldAliases.set(String(alias), id);
        }
      });
      fieldAliases.set(id, id);
      delete normalized._applyLookupPreset;
      return normalized;
    });

    const globalIndexes = (clone(source.globalIndexes) || []).map((index) => ({
      ...index,
      id: index.id || app.utils.createId(),
      fieldId:
        index.type === "key"
          ? fieldAliases.get(String(index.fieldId || index.fieldVariable || "")) ||
            index.fieldId ||
            ""
          : ""
    }));

    function normalizeGrid(definition, locationId) {
      if (!definition) return null;
      const result = clone(definition);
      result.locationId = resolveLocation(result.locationId || locationId);
      result.settings = result.settings || {};
      result.settings.gridWorkGlobalParameters = normalizeWorkGlobalParameters(
        result.settings.gridWorkGlobalParameters ||
        result.settings.workGlobalParameters ||
        result.settings.mtempParameters ||
        "term=CT,codSequencia=CODSEQUENCIA"
      );
      result.settings.gridUseConsultButton = booleanValue(
        result.settings.gridUseConsultButton ?? result.settings.useConsultButton,
        true
      );
      result.settings.gridConsultButtonColumn = numberValue(
        result.settings.gridConsultButtonColumn ?? result.settings.consultButtonColumn,
        86
      );
      result.settings.gridConsultButtonLine = numberValue(
        result.settings.gridConsultButtonLine ?? result.settings.consultButtonLine,
        1
      );
      result.columns = (Array.isArray(result.columns) ? result.columns : []).map(
        (column, index) => {
          const defaults =
            app.grid && typeof app.grid.createColumn === "function"
              ? app.grid.createColumn({
                  ...column,
                  title: column.title || `Coluna ${index + 1}`,
                  variable: column.variable || `COLUNA${index + 1}`
                })
              : {};
          if (
            column._applyLookupPreset === true &&
            column.lookupPreset &&
            column.lookupPreset !== "none" &&
            app.gridLookups &&
            typeof app.gridLookups.applyPresetToColumn === "function"
          ) {
            app.gridLookups.applyPresetToColumn(defaults, column.lookupPreset);
          }
          const normalizedColumn = {
            ...defaults,
            ...column,
            id: column.id || defaults.id || app.utils.createId(),
            type: normalizeGridColumnType(column.type || defaults.type)
          };

          if (normalizedColumn.type === "checkheader") {
            normalizedColumn.title = String(column.title || "");
            normalizedColumn.width = numberValue(column.width, 10);
            normalizedColumn.variable = app.utils.normalizeVariable(
              column.variable,
              `CHECK${index + 1}`
            );
            normalizedColumn.workPiece = 0;
            normalizedColumn.displayOnly = true;
            normalizedColumn.displayExpression = "";
            normalizedColumn.detail = false;
            normalizedColumn.recordKey = false;
            normalizedColumn.editable = false;
            normalizedColumn.maintenanceType = "auto";
            normalizedColumn.required = false;
            normalizedColumn.lockOnEdit = false;
            normalizedColumn.lookupPreset = "none";
            normalizedColumn.initializerCode = "";
            normalizedColumn.obtainCode = "";
            normalizedColumn.f7Routine = "";
            normalizedColumn.valcpCode = "";
            normalizedColumn.optionsVariable = "";
            normalizedColumn.createOptionsTable = false;
            normalizedColumn.optionsItems = [];
            normalizedColumn.defaultValue = "";
          }
          delete normalizedColumn._applyLookupPreset;
          return normalizedColumn;
        }
      );
      return result;
    }

    tabs.forEach((tab) => {
      tab.grid = normalizeGrid(tab.grid, tab.id);
    });

    const parentGrid = normalizeGrid(source.parentGrid, "parent");
    const activeGridLocation = resolveLocation(
      source.activeGridLocation || (parentGrid ? "parent" : tabs.find((tab) => tab.grid)?.id || "parent")
    );

    return {
      tabs,
      fields,
      globalIndexes,
      customButtons,
      parentGrid,
      activeGridLocation,
      activePreview: source.activePreview === "rg" ? "rg" : "parent",
      activeMacRoutine: source.activeMacRoutine || "parent",
      activeRuleRoutine: source.activeRuleRoutine || "rg",
      layoutSuggestions: {
        tabPanelLineAuto: source.layoutSuggestions?.tabPanelLineAuto !== false,
        tabPanelHeightAuto: source.layoutSuggestions?.tabPanelHeightAuto !== false,
        btnManterLineAuto: source.layoutSuggestions?.btnManterLineAuto !== false,
        windowHeightAuto: source.layoutSuggestions?.windowHeightAuto !== false
      },
      resolveLocation
    };
  }

  function setInput(id, value) {
    const element = byId(id);
    if (!element || value === undefined || value === null) return;

    if (element.type === "checkbox") {
      element.checked = booleanValue(value, element.checked);
    } else {
      element.value = String(value);
    }
  }

  function applySettings(settings = {}) {
    setInput("routineName", settings.routineName);
    setInput("routineTitle", settings.routineTitle ?? settings.title);
    setInput("routineMode", settings.routineMode);
    setInput("windowWidth", settings.windowWidth);
    setInput("windowHeight", settings.windowHeight);
    setInput("dataVariable", settings.dataVariable);

    setInput("useTabs", settings.useTabs);
    setInput("sheetId", settings.sheetId);
    setInput("tabPanelLine", settings.tabPanelLine);
    setInput("tabPanelColumn", settings.tabPanelColumn);
    setInput("tabPanelHeight", settings.tabPanelHeight);
    setInput("tabPanelWidth", settings.tabPanelWidth);
    setInput("generateSaveAnother", booleanValue(settings.generateSaveAnother) ? "1" : "0");

    setInput("useRules", settings.useRules);
    setInput("rgRoutineName", settings.rgRoutineName);
    setInput("entityName", settings.entityName);
    setInput("globalName", settings.globalName);
    setInput("useRoutineCompany", settings.useRoutineCompany);
    setInput("generateObtain", settings.generateObtain);
    setInput("generateSave", settings.generateSave);
    setInput("generateDelete", settings.generateDelete);
    setInput("generateLock", settings.generateLock);

    setInput("useBtnManter", settings.useBtnManter);
    setInput("btnManterColumn", settings.btnManterColumn);
    setInput("btnManterLine", settings.btnManterLine);

    setInput("saveInterfaceFiles", settings.saveInterfaceFiles);
    setInput("saveRuleFiles", settings.saveRuleFiles);

    // A sobrescrita é uma preferência local de salvamento, não faz parte
    // da configuração funcional da rotina. Importar um JSON não deve
    // desmarcar silenciosamente essa opção.
    if (app.el.overwriteGeneratedFiles && !app.el.overwriteGeneratedFiles.dataset.userChanged) {
      app.el.overwriteGeneratedFiles.checked = true;
    }
  }

  function syncVisibleSections() {
    byId("tabsConfiguration")?.classList.toggle("hidden", !app.el.useTabs.checked);
    byId("rulesConfiguration")?.classList.toggle("hidden", !app.el.useRules.checked);
    byId("btnManterConfiguration")?.classList.toggle("hidden", !app.el.useBtnManter.checked);

    const hasGridTab = app.state.tabs.some((tab) => tab.contentType === "grid");
    byId("gridConfigurationCard")?.classList.toggle(
      "hidden",
      app.el.routineMode.value !== "grid" && !hasGridTab
    );
  }

  function loadDocument(input) {
    const documentValue = normalizeDocument(input);
    const hasExplicitRoutineCompany = Object.prototype.hasOwnProperty.call(
      documentValue.settings || {},
      "useRoutineCompany"
    );
    documentValue.settings = {
      ...currentSettings(),
      ...(documentValue.settings || {})
    };

    const normalized = normalizedState(documentValue);
    applySettings(documentValue.settings);

    app.state.tabs = normalized.tabs;
    app.state.fields = normalized.fields;
    app.state.globalIndexes = normalized.globalIndexes;

    if (!hasExplicitRoutineCompany && app.el.useRoutineCompany) {
      const fieldById = new Map(
        normalized.fields.map((field) => [field.id, field])
      );
      const hasCompanyKey = normalized.globalIndexes.some((index) => {
        if (index.type !== "key") return false;
        const field = fieldById.get(index.fieldId);
        return app.utils.normalizeVariable(field?.variable, "") === "CODEMP";
      });
      app.el.useRoutineCompany.checked = !hasCompanyKey;
    }

    app.state.customButtons = normalized.customButtons;
    app.state.parentGrid = normalized.parentGrid;
    app.state.activeGridLocation = normalized.activeGridLocation;
    app.state.activePreview = normalized.activePreview;
    app.state.activeMacRoutine = normalized.activeMacRoutine;
    app.state.activeRuleRoutine = normalized.activeRuleRoutine;
    app.state.layoutSuggestions = normalized.layoutSuggestions;
    app.state.gridColumns = [];

    if (app.grid && typeof app.grid.ensureLocation === "function") {
      if (app.state.parentGrid) {
        app.grid.ensureLocation("parent", {
          ...(app.state.parentGrid.settings || {}),
          columns: app.state.parentGrid.columns || []
        });
      }

      app.state.tabs.forEach((tab) => {
        if (!tab.grid) return;
        app.grid.ensureLocation(tab.id, {
          ...(tab.grid.settings || {}),
          columns: tab.grid.columns || []
        });
      });
    }

    if (app.fields && typeof app.fields.reflowAllLocations === "function") {
      // O JSON descreve o alinhamento. As posições são recalculadas pelo
      // código usando o maior label da aba, mantendo leitor e display juntos.
      app.fields.reflowAllLocations({ shiftButtons: true });
    }

    app.tabs.render();
    app.fields.render();
    // Depois dos grids carregados, para a coluna marcada como chave entrar
    // nos índices da global.
    app.indexes.syncWithKeys();
    app.indexes.render();
    app.customButtons.render();

    const requestedBtnLocation = normalized.resolveLocation(
      documentValue.settings.btnManterLocation || "parent"
    );
    if (app.el.btnManterLocation) {
      const hasOption = [...app.el.btnManterLocation.options].some(
        (option) => option.value === requestedBtnLocation
      );
      app.el.btnManterLocation.value = hasOption ? requestedBtnLocation : "parent";
    }

    if (app.grid && typeof app.grid.syncLocations === "function") {
      app.grid.syncLocations();
    }

    syncVisibleSections();
    app.refresh();
    app.utils.showToast("Projeto carregado pelo JSON.");
  }

  function setModalMessage(message, type = "neutral") {
    const element = byId("labJsonMessage");
    if (!element) return;
    element.textContent = message || "";
    element.className = `json-io-message ${type}`;
  }

  function openPasteModal(content = "") {
    const modal = byId("labJsonModal");
    const textarea = byId("labJsonTextarea");
    if (!modal || !textarea) return;

    textarea.value = content;
    setModalMessage("Cole o JSON exportado ou um JSON no formato para IA.");
    modal.classList.remove("hidden");
    setTimeout(() => textarea.focus(), 0);
  }

  function closePasteModal() {
    byId("labJsonModal")?.classList.add("hidden");
  }

  function importTextarea() {
    const textarea = byId("labJsonTextarea");
    try {
      const parsed = JSON.parse(textarea.value);
      loadDocument(parsed);
      closePasteModal();
    } catch (error) {
      setModalMessage(error?.message || "Não foi possível carregar o JSON.", "error");
    }
  }

  function formatTextarea() {
    const textarea = byId("labJsonTextarea");
    try {
      textarea.value = JSON.stringify(JSON.parse(textarea.value), null, 2);
      setModalMessage("JSON formatado e válido.", "success");
    } catch (error) {
      setModalMessage(error?.message || "JSON inválido.", "error");
    }
  }

  async function importFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      loadDocument(JSON.parse(text));
    } catch (error) {
      openPasteModal();
      setModalMessage(error?.message || "Não foi possível importar o arquivo.", "error");
    }
  }

  function initialize() {
    byId("labExportJsonButton")?.addEventListener("click", exportJson);
    byId("labCopyJsonButton")?.addEventListener("click", copyJson);
    byId("labPasteJsonButton")?.addEventListener("click", () => openPasteModal());
    byId("labCloseJsonModalButton")?.addEventListener("click", closePasteModal);
    byId("labCancelJsonButton")?.addEventListener("click", closePasteModal);
    byId("labLoadJsonButton")?.addEventListener("click", importTextarea);
    byId("labFormatJsonButton")?.addEventListener("click", formatTextarea);

    const fileInput = byId("labJsonFileInput");
    byId("labImportJsonButton")?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", async () => {
      await importFile(fileInput.files?.[0]);
      fileInput.value = "";
    });

    byId("labJsonModal")?.addEventListener("click", (event) => {
      if (event.target === byId("labJsonModal")) closePasteModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !byId("labJsonModal")?.classList.contains("hidden")) {
        closePasteModal();
      }
    });
  }

  app.projectIO = {
    createDocument,
    exportJson,
    copyJson,
    loadDocument,
    openPasteModal,
    initialize
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})(window.GeradorRotinasJsonPadrao);
