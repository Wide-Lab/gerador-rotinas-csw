(function (app) {
  const $ = (selector) => document.querySelector(selector);
  const connectors = new Set(["da", "de", "do", "das", "dos", "e"]);
  const abbreviations = {
    codigo: "cod",
    quantidade: "qtd",
    numero: "num",
    percentual: "perc"
  };

  const removeAccents = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const splitWords = (value) =>
    removeAccents(value)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

  const capitalize = (value) =>
    value ? value.charAt(0).toUpperCase() + value.slice(1) : "";

  app.$ = $;

  app.el = {
    routineName: $("#routineName"),
    routineTitle: $("#routineTitle"),
    routineMode: $("#routineMode"),
    windowWidth: $("#windowWidth"),
    windowHeight: $("#windowHeight"),
    dataVariable: $("#dataVariable"),

    useTabs: $("#useTabs"),
    tabsConfiguration: $("#tabsConfiguration"),
    tabsTableBody: $("#tabsTableBody"),
    addTabButton: $("#addTabButton"),
    sheetId: $("#sheetId"),
    tabPanelLine: $("#tabPanelLine"),
    tabPanelColumn: $("#tabPanelColumn"),
    tabPanelHeight: $("#tabPanelHeight"),
    tabPanelWidth: $("#tabPanelWidth"),
    generateSaveAnother: $("#generateSaveAnother"),

    fieldsTableBody: $("#fieldsTableBody"),
    fieldCount: $("#fieldCount"),
    addFieldButton: $("#addFieldButton"),
    loadExampleButton: $("#loadExampleButton"),

    generatedFilesCount: $("#generatedFilesCount"),
    outputFolderStatus: $("#outputFolderStatus"),
    selectedFolderName: $("#selectedFolderName"),
    selectedFolderHint: $("#selectedFolderHint"),
    selectOutputFolderButton: $("#selectOutputFolderButton"),
    saveGeneratedFilesButton: $("#saveGeneratedFilesButton"),
    saveInterfaceFiles: $("#saveInterfaceFiles"),
    saveRuleFiles: $("#saveRuleFiles"),
    overwriteGeneratedFiles: $("#overwriteGeneratedFiles"),
    saveFilesResult: $("#saveFilesResult"),

    useRules: $("#useRules"),
    rulesConfiguration: $("#rulesConfiguration"),
    rgRoutineName: $("#rgRoutineName"),
    entityName: $("#entityName"),
    globalName: $("#globalName"),
    globalPreview: $("#globalPreview"),
    globalIndexesTableBody: $("#globalIndexesTableBody"),
    useRoutineCompany: $("#useRoutineCompany"),
    addKeyIndexButton: $("#addKeyIndexButton"),
    addFixedIndexButton: $("#addFixedIndexButton"),
    generateObtain: $("#generateObtain"),
    generateSave: $("#generateSave"),
    generateDelete: $("#generateDelete"),
    generateLock: $("#generateLock"),

    useBtnManter: $("#useBtnManter"),
    btnManterConfiguration: $("#btnManterConfiguration"),
    btnManterColumn: $("#btnManterColumn"),
    btnManterLine: $("#btnManterLine"),
    btnManterLocation: $("#btnManterLocation"),

    gridConfigurationCard: $("#gridConfigurationCard"),
    gridLocation: $("#gridLocation"),
    gridCode: $("#gridCode"),
    gridLinePosition: $("#gridLinePosition"),
    gridHeight: $("#gridHeight"),
    gridLineStart: $("#gridLineStart"),
    gridLineEnd: $("#gridLineEnd"),
    gridNavigation: $("#gridNavigation"),
    gridWorkGlobal: $("#gridWorkGlobal"),
    gridWorkGlobalParameters: $("#gridWorkGlobalParameters"),
    gridWorkGlobalParametersList: $("#gridWorkGlobalParametersList"),
    addGridWorkGlobalParameter: $("#addGridWorkGlobalParameter"),
    gridCheckGlobal: $("#gridCheckGlobal"),
    gridEditLabel: $("#gridEditLabel"),
    gridInlineMaintenance: $("#gridInlineMaintenance"),
    gridMaintenanceOptions: $("#gridMaintenanceOptions"),
    gridAutoButtonPosition: $("#gridAutoButtonPosition"),
    gridAutoButtonPositionSummary: $("#gridAutoButtonPositionSummary"),
    gridManualButtonPosition: $("#gridManualButtonPosition"),
    gridMaintenanceButtonColumn: $("#gridMaintenanceButtonColumn"),
    gridMaintenanceButtonLine: $("#gridMaintenanceButtonLine"),
    gridSaveButtonLine: $("#gridSaveButtonLine"),
    gridAllowInsert: $("#gridAllowInsert"),
    gridAllowRemove: $("#gridAllowRemove"),
    gridRowEnter: $("#gridRowEnter"),
    gridUseConsultButton: $("#gridUseConsultButton"),
    gridConsultButtonColumn: $("#gridConsultButtonColumn"),
    gridConsultButtonLine: $("#gridConsultButtonLine"),
    gridConsultButtonOptions: $("#gridConsultButtonOptions"),
    gridColumnsTableBody: $("#gridColumnsTableBody"),
    addGridColumnButton: $("#addGridColumnButton"),
    addGridCheckColumnButton: $("#addGridCheckColumnButton"),

    customButtonCount: $("#customButtonCount"),
    customButtonsContainer: $("#customButtonsContainer"),
    addCustomButtonButton: $("#addCustomButtonButton"),

    showMacPreviewButton: $("#showMacPreviewButton"),
    showRgPreviewButton: $("#showRgPreviewButton"),
    macRoutinePreviewSelect: $("#macRoutinePreviewSelect"),
    macCodePreview: $("#macCodePreview"),
    rgCodePreview: $("#rgCodePreview"),
    copyMacButton: $("#copyMacButton"),
    copyRgButton: $("#copyRgButton"),
    copyCurrentPreviewButton: $("#copyCurrentPreviewButton"),

    optionTableModal: $("#optionTableModal"),
    optionTableModalTitle: $("#optionTableModalTitle"),
    optionTableModalDescription: $("#optionTableModalDescription"),
    optionTableItemsBody: $("#optionTableItemsBody"),
    addOptionTableItemButton: $("#addOptionTableItemButton"),
    closeOptionTableModalButton: $("#closeOptionTableModalButton"),
    finishOptionTableButton: $("#finishOptionTableButton"),

    fieldLookupModal: $("#fieldLookupModal"),
    fieldLookupModalTitle: $("#fieldLookupModalTitle"),
    fieldLookupPreset: $("#fieldLookupPreset"),
    fieldLookupRoutine: $("#fieldLookupRoutine"),
    fieldLookupVariables: $("#fieldLookupVariables"),
    fieldTypedReaderConfiguration: $("#fieldTypedReaderConfiguration"),
    fieldUseTypedReader: $("#fieldUseTypedReader"),
    fieldTypedReaderFields: $("#fieldTypedReaderFields"),
    fieldTypedReaderConfigVariable: $("#fieldTypedReaderConfigVariable"),
    fieldTypedReaderConfigText: $("#fieldTypedReaderConfigText"),
    fieldTypedReaderConfigMethod: $("#fieldTypedReaderConfigMethod"),
    fieldTypedReaderRoutine: $("#fieldTypedReaderRoutine"),
    fieldTypedReaderCompanyExpression: $("#fieldTypedReaderCompanyExpression"),
    fieldTypedReaderControlDefinition: $("#fieldTypedReaderControlDefinition"),
    fieldTypedReaderExtraDefinition: $("#fieldTypedReaderExtraDefinition"),
    fieldTypedReaderUseCurrentValue: $("#fieldTypedReaderUseCurrentValue"),
    fieldLookupValcp: $("#fieldLookupValcp"),
    fieldAfterFieldCode: $("#fieldAfterFieldCode"),
    fieldLookupDisplayMode: $("#fieldLookupDisplayMode"),
    fieldLookupDisplayCode: $("#fieldLookupDisplayCode"),
    fieldLookupDisplayCodeContainer: $("#fieldLookupDisplayCodeContainer"),
    fieldMultiSelectConfiguration: $("#fieldMultiSelectConfiguration"),
    fieldMultiSelectTableVariable: $("#fieldMultiSelectTableVariable"),
    fieldMultiSelectSelectedText: $("#fieldMultiSelectSelectedText"),
    fieldMultiSelectGlobalReference: $("#fieldMultiSelectGlobalReference"),
    fieldGeneratedF7Configuration: $("#fieldGeneratedF7Configuration"),
    fieldGenerateF7Routine299: $("#fieldGenerateF7Routine299"),
    fieldGeneratedF7Fields: $("#fieldGeneratedF7Fields"),
    fieldGeneratedF7RoutineName: $("#fieldGeneratedF7RoutineName"),
    fieldGeneratedF7Label: $("#fieldGeneratedF7Label"),
    fieldGeneratedF7SelectedGlobal: $("#fieldGeneratedF7SelectedGlobal"),
    fieldGeneratedF7ColumnSizes: $("#fieldGeneratedF7ColumnSizes"),
    fieldGeneratedF7Pieces: $("#fieldGeneratedF7Pieces"),
    fieldGeneratedF7Titles: $("#fieldGeneratedF7Titles"),
    fieldGeneratedF7Rows: $("#fieldGeneratedF7Rows"),
    applyFieldLookupPresetButton: $("#applyFieldLookupPresetButton"),
    clearFieldLookupButton: $("#clearFieldLookupButton"),
    closeFieldLookupModalButton: $("#closeFieldLookupModalButton"),
    finishFieldLookupButton: $("#finishFieldLookupButton"),

    gridLookupModal: $("#gridLookupModal"),
    gridLookupModalTitle: $("#gridLookupModalTitle"),
    gridLookupPreset: $("#gridLookupPreset"),
    gridLookupInitializer: $("#gridLookupInitializer"),
    gridLookupObtain: $("#gridLookupObtain"),
    gridLookupDisplayExpression: $("#gridLookupDisplayExpression"),
    gridLookupRoutine: $("#gridLookupRoutine"),
    gridLookupVariables: $("#gridLookupVariables"),
    gridLookupRuleVariables: $("#gridLookupRuleVariables"),
    gridLookupValcp: $("#gridLookupValcp"),
    gridLookupMaintenanceNote: $("#gridLookupMaintenanceNote"),
    applyGridLookupPresetButton: $("#applyGridLookupPresetButton"),
    clearGridLookupButton: $("#clearGridLookupButton"),
    closeGridLookupModalButton: $("#closeGridLookupModalButton"),
    finishGridLookupButton: $("#finishGridLookupButton"),

    toast: $("#toast")
  };

  app.utils = {
    createId() {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }

      return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    },

    normalizeVariable(value, fallback = "CAMPO") {
      return (
        removeAccents(value)
          .replace(/[^a-zA-Z0-9%]/g, "")
          .toUpperCase() || fallback
      );
    },

    normalizeParameter(value, fallback = "parametro") {
      const clean = removeAccents(value).replace(/[^a-zA-Z0-9]/g, "");
      return clean ? clean.charAt(0).toLowerCase() + clean.slice(1) : fallback;
    },

    toPascal(value) {
      const words = splitWords(value).filter((word) => !connectors.has(word));
      return words.map(capitalize).join("") || "Campo";
    },

    toParameter(value) {
      const words = splitWords(value).filter((word) => !connectors.has(word));
      if (!words.length) return "campo";

      return (
        (abbreviations[words[0]] || words[0]) +
        words.slice(1).map(capitalize).join("")
      );
    },

    escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    },

    escapeMac(value) {
      return String(value || "").replace(/"/g, '""');
    },

    sanitize(value) {
      return String(value || "").replace(/[\r\n]/g, " ").trim();
    },

    parseVariables(value) {
      return String(value || "")
        .split(/[;,\s]+/)
        .map((item) => app.utils.normalizeVariable(item, ""))
        .filter(Boolean);
    },

    showToast(message) {
      app.el.toast.textContent = message;
      app.el.toast.classList.add("visible");
      clearTimeout(app.utils.toastTimer);
      app.utils.toastTimer = setTimeout(
        () => app.el.toast.classList.remove("visible"),
        1800
      );
    },

    async copyText(text, message) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }

      app.utils.showToast(message);
    }
  };

  app.getConfig = function () {
    const e = app.el;
    const u = app.utils;
    const routineName = u.normalizeVariable(e.routineName.value, "ROTINATEST");

    return {
      routineName,
      title: e.routineTitle.value.trim() || "Rotina Gerada",
      routineMode: e.routineMode.value || "crud",
      windowWidth: Number(e.windowWidth.value) || 108,
      windowHeight: Number(e.windowHeight.value) || 28,
      dataVariable: u.normalizeVariable(e.dataVariable.value, "DADOS"),

      useTabs: e.useTabs.checked,
      sheetId: e.sheetId.value.trim() || "sheet1",
      tabPanelLine: Number(e.tabPanelLine.value) || 2,
      tabPanelColumn: Number(e.tabPanelColumn.value) || 1,
      tabPanelHeight: Number(e.tabPanelHeight.value) || 20,
      tabPanelWidth: Number(e.tabPanelWidth.value) || 80,
      generateSaveAnother: e.generateSaveAnother.value === "1",

      useRules: e.useRules.checked,
      rgRoutineName: u.normalizeVariable(
        e.rgRoutineName.value,
        `${routineName}RG`
      ),
      entityName: u.toPascal(e.entityName.value || "Cadastro"),
      globalName: u.normalizeVariable(
        e.globalName.value.replace(/^\^/, ""),
        "GLOBAL"
      ),
      useRoutineCompany: e.useRoutineCompany?.checked !== false,
      generateObtain: e.generateObtain.checked,
      generateSave: e.generateSave.checked,
      generateDelete: e.generateDelete.checked,
      generateLock: e.generateLock.checked,

      useBtnManter: e.useBtnManter.checked,
      btnManterColumn: Number(e.btnManterColumn.value) || 1,
      btnManterLine: Number(e.btnManterLine.value) || 1,
      btnManterLocation: e.btnManterLocation.value || "parent",

      gridCode: Number(e.gridCode.value) || 1,
      gridLinePosition: Number(e.gridLinePosition.value) || 2,
      gridHeight: Number(e.gridHeight.value) || 17,
      gridLineStart: Number(e.gridLineStart.value) || 2,
      gridLineEnd: Number(e.gridLineEnd.value) || 20,
      gridNavigation: Number(e.gridNavigation.value) === 0 ? 0 : 1,
      gridWorkGlobal:
        e.gridWorkGlobal.value
          .replace(/^\^/, "")
          .replace(/[^a-zA-Z0-9%]/g, "") ||
        `mtemp${routineName}`,
      gridWorkGlobalParameters:
        u.sanitize(e.gridWorkGlobalParameters?.value) ||
        "term=CT,codSequencia=CODSEQUENCIA",
      gridCheckGlobal:
        (e.gridCheckGlobal?.value || "")
          .replace(/^\^/, "")
          .replace(/[^a-zA-Z0-9%]/g, "") ||
        `mtemp${routineName}CHECK`,
      gridEditLabel: u.sanitize(e.gridEditLabel.value) || "TbCellClick",
      gridMaintenance: e.gridInlineMaintenance.checked,
      gridInlineMaintenance: e.gridInlineMaintenance.checked,
      gridAutoButtonPosition: e.gridAutoButtonPosition
        ? e.gridAutoButtonPosition.checked
        : true,
      gridMaintenanceButtonColumn:
        Number(e.gridMaintenanceButtonColumn.value) || 1,
      gridMaintenanceButtonLine:
        Number(e.gridMaintenanceButtonLine.value) ||
        (Number(e.gridLineEnd.value) || 20) + 4,
      gridSaveButtonLine:
        Number(e.gridSaveButtonLine.value) ||
        (Number(e.gridMaintenanceButtonLine.value) ||
          (Number(e.gridLineEnd.value) || 20) + 4) + 2,
      gridAllowInsert: e.gridAllowInsert.checked,
      gridAllowRemove: e.gridAllowRemove.checked,
      gridRowEnter: e.gridRowEnter.checked,
      gridUseConsultButton: e.gridUseConsultButton?.checked !== false,
      gridConsultButtonColumn: Number(e.gridConsultButtonColumn?.value) || 86,
      gridConsultButtonLine: Number(e.gridConsultButtonLine?.value) || 1,

      customButtons:
        app.customButtons && typeof app.customButtons.all === "function"
          ? app.customButtons.all()
          : []
    };
  };
})(window.GeradorRotinasJsonPadrao);
