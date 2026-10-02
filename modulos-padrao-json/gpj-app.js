(function (app) {
  const { el, state, utils: u } = app;

  function createTab(overrides = {}) {
    const position = state.tabs.length + 1;
    const config = app.getConfig();

    return {
      id: u.createId(),
      title: overrides.title || `Aba ${position}`,
      routineName: u.normalizeVariable(
        overrides.routineName,
        `${config.routineName}TAB${position}`
      ),
      dataVariable: u.normalizeVariable(
        overrides.dataVariable,
        config.dataVariable
      ),
      globalSubscript:
        overrides.globalSubscript === undefined
          ? String(position)
          : String(overrides.globalSubscript),
      contentType: overrides.contentType === "grid" ? "grid" : "fields",
      gridRgRoutineName: u.normalizeVariable(
        overrides.gridRgRoutineName,
        `${u.normalizeVariable(overrides.routineName, `${config.routineName}TAB${position}`)}RG`
      ),
      disabled: overrides.disabled === true || overrides.initiallyDisabled === true,
      fieldAlignment:
        ["left", "center"].includes(String(overrides.fieldAlignment || overrides.fieldsAlignment || overrides.alignment || "").toLowerCase())
          ? String(overrides.fieldAlignment || overrides.fieldsAlignment || overrides.alignment).toLowerCase()
          : "left",
      autoFieldLayout: overrides.autoFieldLayout !== false,
      finalFocus:
        ["auto", "save", "grid", "lastField"].includes(String(overrides.finalFocus || overrides.focusAfterFields || "").trim())
          ? String(overrides.finalFocus || overrides.focusAfterFields).trim()
          : "auto",
      grid: overrides.grid || null
    };
  }

  function renderTabs() {
    el.tabsTableBody.innerHTML = "";

    if (!state.tabs.length) {
      el.tabsTableBody.innerHTML =
        '<tr><td colspan="11" class="empty-row">Nenhuma aba configurada.</td></tr>';
      renderBtnManterLocations();
      return;
    }

    state.tabs.forEach((tab, position) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td><div class="row-actions"><button class="icon-button" data-tab-action="up" data-tab-position="${position}">↑</button><button class="icon-button" data-tab-action="down" data-tab-position="${position}">↓</button></div></td>
        <td class="center-cell"><button class="icon-button remove" data-tab-action="remove" data-tab-position="${position}" title="Remover aba">×</button></td>
        <td><input class="tab-title-input" data-tab-position="${position}" data-tab-property="title" value="${u.escapeHtml(tab.title)}"></td>
        <td><input class="tab-routine-input" data-tab-position="${position}" data-tab-property="routineName" value="${u.escapeHtml(tab.routineName)}"></td>
        <td>
          <select class="tab-content-select" data-tab-position="${position}" data-tab-property="contentType">
            <option value="fields" ${tab.contentType !== "grid" ? "selected" : ""}>Campos</option>
            <option value="grid" ${tab.contentType === "grid" ? "selected" : ""}>Grid</option>
          </select>
        </td>
        <td>
          <select class="tab-field-alignment-select" data-tab-position="${position}" data-tab-property="fieldAlignment" ${tab.contentType === "grid" ? "disabled" : ""} title="Reposiciona labels, leitores, displays e botões. O maior nome de campo define automaticamente o espaço dos labels.">
            <option value="left" ${tab.fieldAlignment !== "center" ? "selected" : ""}>Esquerda</option>
            <option value="center" ${tab.fieldAlignment === "center" ? "selected" : ""}>Meio</option>
          </select>
        </td>
        <td>
          <select class="tab-final-focus-select" data-tab-position="${position}" data-tab-property="finalFocus" title="Define para onde vai o foco depois do último campo.">
            <option value="auto" ${tab.finalFocus === "auto" ? "selected" : ""}>Automático</option>
            <option value="save" ${tab.finalFocus === "save" ? "selected" : ""}>Salvar</option>
            <option value="grid" ${tab.finalFocus === "grid" ? "selected" : ""}>Grid</option>
            <option value="lastField" ${tab.finalFocus === "lastField" ? "selected" : ""}>Último campo</option>
          </select>
        </td>
        <td><input class="tab-grid-rg-input" data-tab-position="${position}" data-tab-property="gridRgRoutineName" value="${u.escapeHtml(tab.gridRgRoutineName || `${tab.routineName}RG`)}" ${tab.contentType === "grid" ? "" : "disabled"}></td>
        <td><input class="tab-data-input" data-tab-position="${position}" data-tab-property="dataVariable" value="${u.escapeHtml(tab.dataVariable)}" ${tab.contentType === "grid" ? "disabled" : ""}></td>
        <td><input class="tab-subscript-input" data-tab-position="${position}" data-tab-property="globalSubscript" value="${u.escapeHtml(tab.globalSubscript)}" placeholder="Ex.: 1" title="Em abas Grid, este valor é usado como subíndice fixo da origem persistente."></td>
        <td class="center-cell"><input type="checkbox" data-tab-position="${position}" data-tab-property="disabled" ${tab.disabled === true ? "checked" : ""} title="Gera a aba inicialmente desabilitada."></td>`;

      el.tabsTableBody.appendChild(row);
    });

    renderBtnManterLocations();
    if (app.grid && typeof app.grid.syncLocations === "function") {
      app.grid.syncLocations();
    }
  }

  function renderBtnManterLocations() {
    const current = el.btnManterLocation.value || "parent";
    const options = [
      '<option value="parent">Rotina principal</option>'
    ];

    if (el.useTabs.checked) {
      state.tabs.forEach((tab, index) => {
        options.push(
          `<option value="${tab.id}">Aba ${index + 1} - ${u.escapeHtml(tab.title)}</option>`
        );
      });
    }

    el.btnManterLocation.innerHTML = options.join("");
    el.btnManterLocation.value = options.some((option) =>
      option.includes(`value="${current}"`)
    )
      ? current
      : "parent";

    if (app.customButtons && typeof app.customButtons.syncLocations === "function") {
      app.customButtons.syncLocations();
    }
  }

  function updateTabFromInput(target) {
    const position = Number(target.dataset.tabPosition);
    const property = target.dataset.tabProperty;

    if (!Number.isInteger(position) || !property || !state.tabs[position]) {
      return;
    }

    const tab = state.tabs[position];
    const previousRoutineName = tab.routineName;
    const previousGridRgRoutineName = tab.gridRgRoutineName;

    tab[property] = target.type === "checkbox" ? target.checked : target.value;

    if (property === "routineName" && tab.contentType === "grid") {
      const previousDefaultRg = `${u.normalizeVariable(previousRoutineName)}RG`;
      const currentGridRg = u.normalizeVariable(previousGridRgRoutineName, previousDefaultRg);

      if (!previousGridRgRoutineName || currentGridRg === previousDefaultRg) {
        tab.gridRgRoutineName = `${u.normalizeVariable(tab.routineName)}RG`;

        const row = target.closest("tr");
        const gridRgInput = row?.querySelector('[data-tab-property="gridRgRoutineName"]');
        if (gridRgInput) gridRgInput.value = tab.gridRgRoutineName;
      }
    }

    if (property === "gridRgRoutineName") {
      tab.gridRgRoutineName = u.normalizeVariable(target.value, `${tab.routineName}RG`);
    }

    if (property === "fieldAlignment" && app.fields && typeof app.fields.applyTabAlignment === "function") {
      tab.fieldAlignment = target.value === "center" ? "center" : "left";
      app.fields.applyTabAlignment(tab.id, tab.fieldAlignment);
    }

    if (property === "finalFocus") {
      tab.finalFocus = ["save", "grid", "lastField"].includes(target.value)
        ? target.value
        : "auto";
    }

    if (property === "contentType" && app.grid) {
      if (tab.contentType === "grid") {
        app.grid.ensureLocation(tab.id);
      }
      renderTabs();
    } else {
      renderBtnManterLocations();
      if (app.grid && typeof app.grid.syncLocations === "function") {
        app.grid.syncLocations();
      }
    }

    app.fields.render();
    app.refresh();
  }

  function addTab(overrides = {}) {
    const tab = createTab(overrides);
    state.tabs.push(tab);
    if (tab.contentType === "grid" && app.grid) {
      app.grid.ensureLocation(tab.id);
    }
    renderTabs();
    app.fields.render();
    app.refresh();
  }

  function moveTab(position, direction) {
    const destination = position + direction;
    if (destination < 0 || destination >= state.tabs.length) return;

    [state.tabs[position], state.tabs[destination]] = [
      state.tabs[destination],
      state.tabs[position]
    ];

    renderTabs();
    app.fields.render();
    app.refresh();
  }

  function removeTab(position) {
    const tab = state.tabs[position];
    if (!tab) return;

    state.fields.forEach((field) => {
      if (field.tabId === tab.id) field.tabId = "parent";
    });

    if (app.grid && typeof app.grid.removeLocation === "function") {
      app.grid.removeLocation(tab.id);
    }

    state.tabs.splice(position, 1);
    renderTabs();
    app.fields.render();
    app.refresh();
  }

  function syncFields() {
    const validTabIds = new Set(state.tabs.map((tab) => tab.id));
    const validAuxiliaryIds = new Set(
      state.customButtons.map((button) =>
        app.customButtons
          ? app.customButtons.screenLocationId(button)
          : `button-screen-${button.id}`
      )
    );

    state.fields.forEach((field) => {
      if (app.fields.isAuxiliaryField(field)) {
        if (!validAuxiliaryIds.has(field.tabId)) {
          field.tabId = "parent";
          field.isKey = false;
          field.tabKey = false;
        }
        return;
      }

      if (field.isKey) {
        field.tabId = "parent";
        return;
      }

      if (field.tabId !== "parent" && !validTabIds.has(field.tabId)) {
        field.tabId = "parent";
      }
    });
  }

  app.tabs = {
    create: createTab,
    render: renderTabs,
    add: addTab,
    move: moveTab,
    remove: removeTab,
    updateFromInput: updateTabFromInput,
    syncFields
  };

  function toggleSections() {
    el.tabsConfiguration.classList.toggle("hidden", !el.useTabs.checked);
    el.rulesConfiguration.classList.toggle("hidden", !el.useRules.checked);
    el.btnManterConfiguration.classList.toggle(
      "hidden",
      !el.useBtnManter.checked
    );
    const hasGridTab = state.tabs.some((tab) => tab.contentType === "grid");
    el.gridConfigurationCard.classList.toggle(
      "hidden",
      el.routineMode.value !== "grid" && !hasGridTab
    );

    if (el.gridMaintenanceOptions) {
      el.gridMaintenanceOptions.classList.toggle(
        "hidden",
        !el.gridInlineMaintenance.checked
      );
    }
  }

  function getRuleRoutines() {
    return typeof app.rg.generateAll === "function"
      ? app.rg.generateAll()
      : {
          rg: {
            label: "Rotina RG",
            routineName: app.getConfig().rgRoutineName,
            code: app.rg.generate()
          }
        };
  }

  function renderRoutinePreviewOptions(routines, currentRoutine) {
    el.macRoutinePreviewSelect.innerHTML = Object.entries(routines)
      .map(([key, item]) => {
        const selected = key === currentRoutine ? "selected" : "";

        return `<option value="${key}" ${selected}>${u.escapeHtml(item.label)} — ${u.escapeHtml(item.routineName)}</option>`;
      })
      .join("");
  }

  function lastFieldLine(locationId = "parent") {
    const fields = state.fields.filter(
      (field) => (field.tabId || "parent") === locationId
    );

    if (!fields.length) return 0;

    return Math.max(
      ...fields.map((field) =>
        Math.max(
          Number(field.labelLine) || 0,
          // A área de texto ocupa mais de uma linha.
          (Number(field.inputLine) || 0) +
            (field.type === "textArea" ? Math.max(1, Number(field.textAreaHeight) || 3) : 1) -
            1,
          field.hasDisplay === true ? Number(field.displayLine) || 0 : 0
        )
      )
    );
  }

  function tabContentBottomLine(tab) {
    let bottomLine = lastFieldLine(tab.id);
    const grid = tab.grid;

    if (grid?.settings) {
      const settings = grid.settings;
      const gridPosition = Number(settings.gridLinePosition) || 1;
      const gridHeight = Number(settings.gridHeight) || 1;

      bottomLine = Math.max(
        bottomLine,
        Number(settings.gridLineEnd) || 0,
        gridPosition + gridHeight - 1
      );

      if (settings.gridMaintenance === true) {
        bottomLine = Math.max(
          bottomLine,
          Number(settings.gridMaintenanceButtonLine) || 0,
          Number(settings.gridSaveButtonLine) || 0
        );
      }
    }

    if (
      el.useBtnManter.checked &&
      el.btnManterLocation.value === tab.id
    ) {
      bottomLine = Math.max(bottomLine, Number(el.btnManterLine.value) || 0);
    }

    if (
      app.customButtons &&
      typeof app.customButtons.resolvedPosition === "function"
    ) {
      state.customButtons
        .filter((button) => button.location === tab.id)
        .forEach((button) => {
          const position = app.customButtons.resolvedPosition(button);
          bottomLine = Math.max(bottomLine, Number(position.line) || 0);
        });
    }

    return bottomLine;
  }

  function suggestedTabPanelHeight() {
    const largestContentLine = state.tabs.reduce(
      (largest, tab) => Math.max(largest, tabContentBottomLine(tab)),
      0
    );

    // O padrão CSW usa abas amplas. Mesmo abas pequenas recebem altura 20,
    // evitando que Grid, btnManut e bordas do TabPanel fiquem espremidos.
    return Math.max(20, largestContentLine);
  }

  function btnManterWidth() {
    const config = app.getConfig();
    return 48 + (String(config.generateSaveAnother) === "1" ? 16 : 0);
  }

  function applyBtnManterAlignment() {
    if (!el.btnManterAlignment) return;

    const alinhamento = el.btnManterAlignment.value;
    if (alinhamento === "manual") return;

    if (alinhamento === "left") {
      el.btnManterColumn.value = 1;
      return;
    }

    if (alinhamento === "fields") {
      const local = el.btnManterLocation.value || "parent";
      const campos = state.fields.filter(
        (field) => (field.tabId || "parent") === local
      );

      const coluna = campos.length
        ? Math.min(...campos.map((field) => Number(field.inputColumn) || 1))
        : 1;

      el.btnManterColumn.value = Math.max(1, coluna);
      return;
    }

    const largura = Number(el.windowWidth.value) || 108;
    el.btnManterColumn.value = Math.max(
      1,
      Math.floor((largura - btnManterWidth()) / 2) + 1
    );
  }

  function hasTabs() {
    return el.useTabs.checked && state.tabs.length > 0;
  }

  function parentGridLastLine() {
    if (el.routineMode.value !== "grid") return 0;

    if (!state.parentGrid || !state.parentGrid.settings) return 0;

    const settings = state.parentGrid.settings;
    const inicio = Number(settings.gridLinePosition) || 0;
    const altura = Number(settings.gridHeight) || 0;
    const fim = Number(settings.gridLineEnd) || 0;

    return Math.max(fim, inicio ? inicio + altura - 1 : 0);
  }

  function applyLayoutSuggestions() {
    state.layoutSuggestions = state.layoutSuggestions || {
      tabPanelLineAuto: true,
      tabPanelHeightAuto: true,
      btnManterLineAuto: true,
      windowHeightAuto: true
    };

    if (state.layoutSuggestions.tabPanelLineAuto !== false) {
      const lastLine = lastFieldLine("parent");
      el.tabPanelLine.value = lastLine > 0 ? lastLine + 2 : 2;
    }

    if (app.grid && typeof app.grid.applyPositionSuggestions === "function") {
      app.grid.applyPositionSuggestions();
    }

    if (hasTabs() && state.layoutSuggestions.tabPanelHeightAuto !== false) {
      el.tabPanelHeight.value = suggestedTabPanelHeight();
    }

    if (
      el.useBtnManter.checked &&
      el.btnManterLocation.value === "parent" &&
      state.layoutSuggestions.btnManterLineAuto !== false
    ) {
      if (hasTabs()) {
        const panelLine = Number(el.tabPanelLine.value) || 2;
        const panelHeight = Number(el.tabPanelHeight.value) || 20;

        el.btnManterLine.value = panelLine + panelHeight - 1 + 2;
      } else {
        el.btnManterLine.value = Math.max(lastFieldLine("parent"), parentGridLastLine()) + 2;
      }
    }

    applyBtnManterAlignment();

    if (el.btnManterLineAuto) {
      el.btnManterLineAuto.checked =
        state.layoutSuggestions.btnManterLineAuto !== false;
    }

    if (hasTabs() && state.layoutSuggestions.windowHeightAuto !== false) {
      const panelLine = Number(el.tabPanelLine.value) || 2;
      const panelHeight = Number(el.tabPanelHeight.value) || 20;
      const panelLastLine = panelLine + panelHeight - 1;
      const maintenanceLine =
        el.useBtnManter.checked && el.btnManterLocation.value === "parent"
          ? Number(el.btnManterLine.value) || 0
          : 0;
      const requiredWindowHeight = Math.max(
        panelLastLine + 4,
        maintenanceLine + 2
      );

      el.windowHeight.value = Math.min(28, Math.max(28, requiredWindowHeight));
    }
  }

  function renderOwnF7Fields() {
    const select = el.ownF7DescriptionField;
    if (!select) return;

    const config = app.getConfig();
    const pieces = app.fields.pieceAssignments(config);

    const escolhido = select.dataset.pendente || select.value;
    delete select.dataset.pendente;

    const opcoes = state.fields
      .filter((field) => pieces.has(field.id))
      .map(
        (field) =>
          `<option value="${field.id}">${u.escapeHtml(field.description || field.variable)}</option>`
      );

    select.innerHTML = opcoes.length
      ? `<option value="">— escolha o campo —</option>${opcoes.join("")}`
      : '<option value="">— nenhum campo com piece —</option>';

    if (escolhido && state.fields.some((field) => field.id === escolhido)) {
      select.value = escolhido;
    }

    select.disabled = !el.generateOwnF7 || !el.generateOwnF7.checked;
  }

  app.refresh = function () {
    syncFields();

    if (app.f7 && typeof app.f7.syncFields === "function") {
      app.f7.syncFields();
    }

    renderOwnF7Fields();

    applyLayoutSuggestions();

    const interfaceRoutines = app.mac.generateAll();
    const ruleRoutines = getRuleRoutines();

    if (state.activePreview === "rg") {
      if (!ruleRoutines[state.activeRuleRoutine]) {
        state.activeRuleRoutine = "rg";
      }

      renderRoutinePreviewOptions(ruleRoutines, state.activeRuleRoutine);

      const selectedRule =
        ruleRoutines[state.activeRuleRoutine] || ruleRoutines.rg;

      el.rgCodePreview.textContent = selectedRule.code;
    } else {
      if (!interfaceRoutines[state.activeMacRoutine]) {
        state.activeMacRoutine = "parent";
        state.activeRuleRoutine = "rg";
      }

      renderRoutinePreviewOptions(
        interfaceRoutines,
        state.activeMacRoutine
      );

      const selectedInterface =
        interfaceRoutines[state.activeMacRoutine] || interfaceRoutines.parent;

      el.macCodePreview.textContent = selectedInterface.code;
    }

    app.indexes.updatePreview();

    if (app.files && typeof app.files.updateSummary === "function") {
      app.files.updateSummary();
    }
  };

  function setPreview(type) {
    state.activePreview = type;
    const showInterfaces = type !== "rg";

    el.macCodePreview.classList.toggle("hidden", !showInterfaces);
    el.rgCodePreview.classList.toggle("hidden", showInterfaces);
    el.macRoutinePreviewSelect.classList.remove("hidden");
    el.showMacPreviewButton.classList.toggle("active", showInterfaces);
    el.showRgPreviewButton.classList.toggle("active", !showInterfaces);

    app.refresh();
  }

  function loadExample() {
    state.layoutSuggestions = {
      tabPanelLineAuto: true,
      tabPanelHeightAuto: true,
      btnManterLineAuto: true,
      windowHeightAuto: true
    };

    el.routineName.value = "WDCCMOT010";
    el.routineTitle.value = "Motivos de Parada";
    el.routineMode.value = "grid";
    el.windowWidth.value = 108;
    el.windowHeight.value = 28;
    el.dataVariable.value = "WDCCMOT";

    el.useTabs.checked = false;
    el.sheetId.value = "sheet1";
    el.tabPanelLine.value = 2;
    el.tabPanelColumn.value = 1;
    el.tabPanelHeight.value = 20;
    el.tabPanelWidth.value = 106;
    el.generateSaveAnother.value = "0";

    el.useRules.checked = true;
    el.rgRoutineName.value = "WDCCMOT010RG";
    el.entityName.value = "Motivo";
    el.globalName.value = "WDCCMOT";
    if (el.useRoutineCompany) el.useRoutineCompany.checked = false;
    el.generateObtain.checked = true;
    el.generateSave.checked = true;
    el.generateDelete.checked = true;
    el.generateLock.checked = true;
    if (el.lockTimeout) el.lockTimeout.value = 3;

    el.useBtnManter.checked = true;
    el.btnManterColumn.value = 1;
    el.btnManterLine.value = 26;
    el.btnManterLocation.value = "parent";

    el.gridCode.value = 1;
    el.gridLinePosition.value = 6;
    el.gridHeight.value = 16;
    el.gridLineStart.value = 7;
    el.gridLineEnd.value = 21;
    el.gridNavigation.value = "1";
    el.gridWorkGlobal.value = "mtempWDCCMOT010";
    if (app.grid && typeof app.grid.renderWorkGlobalParameterEditor === "function") {
      app.grid.renderWorkGlobalParameterEditor([
        { name: "term", argument: "CT" }
      ]);
    } else if (el.gridWorkGlobalParameters) {
      el.gridWorkGlobalParameters.value = "term=CT";
    }
    if (el.gridUseConsultButton) el.gridUseConsultButton.checked = false;
    if (el.gridCheckGlobal) el.gridCheckGlobal.value = "";
    el.gridEditLabel.value = "TbCellClick";
    el.gridInlineMaintenance.checked = false;
    if (el.gridAutoButtonPosition) el.gridAutoButtonPosition.checked = true;
    el.gridMaintenanceButtonColumn.value = 1;
    el.gridMaintenanceButtonLine.value = 23;
    el.gridSaveButtonLine.value = 26;
    el.gridAllowInsert.checked = true;
    el.gridAllowRemove.checked = true;
    el.gridRowEnter.checked = true;

    state.customButtons = [];
    state.ruleHooks = {};
    state.tabs = [];

    const codEmpresa = app.fields.createField({
      description: "Código da Empresa",
      variable: "CODEMP",
      type: "integer",
      tabId: "parent",
      isKey: true,
      required: true,
      labelColumn: 1,
      labelLine: 1,
      labelSize: 18,
      inputColumn: 20,
      inputLine: 1,
      inputSize: 4,
      hasDisplay: true,
      displayColumn: 25,
      displayLine: 1,
      displaySize: 40
    });

    app.fieldLookups.applyPresetToField(codEmpresa, "empresa");

    const codigo = app.fields.createField({
      description: "Código do Motivo",
      variable: "CODIGO",
      type: "integer",
      tabId: "parent",
      isKey: true,
      required: true,
      labelColumn: 1,
      labelLine: 2,
      labelSize: 18,
      inputColumn: 20,
      inputLine: 2,
      inputSize: 6
    });

    state.fields = [codEmpresa, codigo];

    state.globalIndexes = [
      app.indexes.createKey(codEmpresa.id, "codEmpresa"),
      app.indexes.createKey(codigo.id, "codigo")
    ];

    app.grid.resetLocations();
    app.grid.ensureLocation("parent", {
      gridCode: 1,
      gridWorkGlobal: "mtempWDCCMOT010",
      gridLinePosition: 6,
      gridHeight: 16,
      gridLineStart: 7,
      gridLineEnd: 21
    });
    app.grid.selectLocation("parent");

    state.gridColumns = [
      app.grid.createColumn({
        title: "Setor",
        type: "n",
        width: 8,
        variable: "CODSETOR",
        recordKey: true
      }),
      app.grid.createColumn({
        title: "Descrição do Setor",
        type: "a",
        width: 30,
        variable: "DESCSETOR",
        workPiece: 1
      }),
      app.grid.createColumn({
        title: "Tempo Meta",
        type: "decimal",
        width: 12,
        variable: "TEMPOMETA",
        workPiece: 2,
        editable: true
      }),
      app.grid.createColumn({
        title: "Vigência",
        type: "d",
        width: 12,
        variable: "VIGENCIA",
        workPiece: 3,
        editable: true
      })
    ];

    app.grid.saveActive();
    app.grid.render();

    if (app.customButtons && typeof app.customButtons.render === "function") {
      app.customButtons.render();
    }

    state.activeMacRoutine = "parent";
    state.activeRuleRoutine = "rg";

    toggleSections();
    renderTabs();
    app.fields.render();
    app.indexes.render();
    app.refresh();
    setPreview("parent");
    u.showToast("Padrão simples carregado.");
  }

  function clearProject() {
    state.layoutSuggestions = {
      tabPanelLineAuto: true,
      tabPanelHeightAuto: true,
      btnManterLineAuto: true,
      windowHeightAuto: true
    };

    el.routineName.value = "";
    el.routineTitle.value = "";
    el.routineMode.value = "crud";
    el.windowWidth.value = 108;
    el.windowHeight.value = 28;
    el.dataVariable.value = "";

    el.useTabs.checked = false;
    el.sheetId.value = "sheet1";
    el.tabPanelLine.value = 2;
    el.tabPanelColumn.value = 1;
    el.tabPanelHeight.value = 20;
    el.tabPanelWidth.value = 106;
    el.generateSaveAnother.value = "0";

    el.useRules.checked = true;
    el.rgRoutineName.value = "";
    el.entityName.value = "";
    el.globalName.value = "";
    if (el.useRoutineCompany) el.useRoutineCompany.checked = false;
    el.generateObtain.checked = true;
    el.generateSave.checked = true;
    el.generateDelete.checked = true;
    el.generateLock.checked = true;
    if (el.lockTimeout) el.lockTimeout.value = 3;

    el.useBtnManter.checked = false;
    el.btnManterColumn.value = 1;
    el.btnManterLine.value = 26;
    el.btnManterLocation.value = "parent";

    state.fields = [];
    state.tabs = [];
    state.globalIndexes = [];
    state.customButtons = [];
    state.gridColumns = [];
    state.ruleHooks = {};

    app.grid.resetLocations();
    app.grid.render();

    if (app.customButtons && typeof app.customButtons.render === "function") {
      app.customButtons.render();
    }

    state.activeMacRoutine = "parent";
    state.activeRuleRoutine = "rg";

    toggleSections();
    renderTabs();
    app.fields.render();
    app.indexes.render();
    app.refresh();
    setPreview("parent");
    u.showToast("Tela limpa.");
  }

  function registerFieldEvents() {
    el.fieldsTableBody.addEventListener("input", (event) =>
      app.fields.updateFromInput(event.target)
    );
    el.fieldsTableBody.addEventListener("change", (event) =>
      app.fields.updateFromInput(event.target)
    );
    el.fieldsTableBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-field-action]");
      if (!button) return;

      const position = Number(button.dataset.fieldPosition);
      const action = button.dataset.fieldAction;

      if (action === "up") app.fields.move(position, -1);
      if (action === "down") app.fields.move(position, 1);
      if (action === "remove") app.fields.remove(position);
      if (action === "toggle-details") app.fields.toggleDetails(position);
      if (action === "configure-options") app.optionTables.open(position);
      if (action === "configure-lookup") app.fieldLookups.open(position);
    });
  }

  function registerTabEvents() {
    el.tabsTableBody.addEventListener("input", (event) =>
      updateTabFromInput(event.target)
    );
    el.tabsTableBody.addEventListener("change", (event) =>
      updateTabFromInput(event.target)
    );
    el.tabsTableBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tab-action]");
      if (!button) return;

      const position = Number(button.dataset.tabPosition);
      const action = button.dataset.tabAction;

      if (action === "up") moveTab(position, -1);
      if (action === "down") moveTab(position, 1);
      if (action === "remove") removeTab(position);
    });
  }

  function registerIndexEvents() {
    el.globalIndexesTableBody.addEventListener("input", (event) =>
      app.indexes.updateFromInput(event.target)
    );
    el.globalIndexesTableBody.addEventListener("change", (event) =>
      app.indexes.updateFromInput(event.target)
    );
    el.globalIndexesTableBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-index-action]");
      if (!button) return;

      const position = Number(button.dataset.indexPosition);
      const action = button.dataset.indexAction;

      if (action === "up") app.indexes.move(position, -1);
      if (action === "down") app.indexes.move(position, 1);
      if (action === "remove") app.indexes.remove(position);
    });
  }

  function registerEvents() {
    const fieldLayoutToggle = document.querySelector("#showFieldLayout");
    const fieldsTable = document.querySelector(".fields-table");

    function syncFieldLayoutMode() {
      if (!fieldLayoutToggle || !fieldsTable) return;
      fieldsTable.classList.toggle("show-layout", fieldLayoutToggle.checked);
      if (app.fields && typeof app.fields.setAllDetails === "function") {
        app.fields.setAllDetails(fieldLayoutToggle.checked);
      }
    }

    if (fieldLayoutToggle) {
      fieldLayoutToggle.addEventListener("change", syncFieldLayoutMode);
    }

    registerFieldEvents();
    registerTabEvents();
    registerIndexEvents();
    app.optionTables.initialize();
    app.fieldLookups.initialize();
    app.gridLookups.initialize();
    app.grid.initialize();
    app.customButtons.initialize();

    if (app.files && typeof app.files.initialize === "function") {
      app.files.initialize();
    }

    el.addFieldButton.addEventListener("click", () => app.fields.add());
    el.addTabButton.addEventListener("click", () => addTab());
    el.addKeyIndexButton.addEventListener("click", () => app.indexes.addKey());
    el.addFixedIndexButton.addEventListener("click", () => app.indexes.addFixed());
    el.loadExampleButton.addEventListener("click", loadExample);

    if (el.clearProjectButton) {
      el.clearProjectButton.addEventListener("click", clearProject);
    }

    [el.generateOwnF7, el.ownF7DescriptionField, el.btnManterAlignment]
      .filter(Boolean)
      .forEach((input) => input.addEventListener("change", () => app.refresh()));

    if (el.btnManterColumn && el.btnManterAlignment) {
      el.btnManterColumn.addEventListener("input", () => {
        el.btnManterAlignment.value = "manual";
      });
    }

    if (el.saveOwnF7Button) {
      el.saveOwnF7Button.addEventListener("click", () => {
        const definition = app.f7.ownLookupDefinition();

        if (!definition) {
          u.showToast("Marque a opção e escolha o campo do display primeiro.");
          return;
        }

        const guardado = app.fieldLookups.saveLookup({
          key: `own-${definition.routineName}-${definition.label}`.toLowerCase(),
          label: `${definition.entity} (${definition.label}^${definition.routineName})`,
          f7Routine: `${definition.label}^${definition.routineName}`,
          extraVariables: definition.company ? "CODEMP" : ""
        });

        u.showToast(
          guardado
            ? `F7 guardado: ${definition.label}^${definition.routineName}`
            : "Não foi possível guardar no catálogo."
        );
      });
    }

    el.showMacPreviewButton.addEventListener("click", () =>
      setPreview("parent")
    );
    el.showRgPreviewButton.addEventListener("click", () => setPreview("rg"));

    el.macRoutinePreviewSelect.addEventListener("change", () => {
      if (state.activePreview === "rg") {
        state.activeRuleRoutine = el.macRoutinePreviewSelect.value;
      } else {
        state.activeMacRoutine = el.macRoutinePreviewSelect.value;
      }

      app.refresh();
    });

    el.copyMacButton.addEventListener("click", () =>
      u.copyText(app.mac.generateCombined(), "Rotinas de interface copiadas.")
    );

    el.copyRgButton.addEventListener("click", () =>
      u.copyText(
        typeof app.rg.generateCombined === "function"
          ? app.rg.generateCombined()
          : app.rg.generate(),
        "Rotinas RG copiadas."
      )
    );

    if (el.gridLocation) {
      el.gridLocation.addEventListener("change", () => {
        app.grid.selectLocation(el.gridLocation.value);
        app.refresh();
      });
    }

    el.copyCurrentPreviewButton.addEventListener("click", () => {
      if (state.activePreview === "rg") {
        const routines = getRuleRoutines();
        const selected =
          routines[state.activeRuleRoutine] || routines.rg;

        u.copyText(selected.code, `${selected.routineName} copiada.`);
        return;
      }

      const routines = app.mac.generateAll();
      const selected = routines[state.activeMacRoutine] || routines.parent;
      u.copyText(selected.code, `${selected.routineName} copiada.`);
    });

    [
      el.useTabs,
      el.useRules,
      el.useRoutineCompany,
      el.useBtnManter,
      el.routineMode,
      el.gridInlineMaintenance
    ].filter(Boolean).forEach(
      (input) =>
        input.addEventListener("change", () => {
          if (app.grid && typeof app.grid.isGridSettingElement === "function" && app.grid.isGridSettingElement(input)) {
            app.grid.saveActive();
          }

          if (input === el.useTabs && el.useTabs.checked && !state.tabs.length) {
            addTab({ title: "Dados Gerais" });
          }

          if (
            input === el.useRoutineCompany &&
            !el.useRoutineCompany.checked &&
            app.indexes &&
            typeof app.indexes.hasCompanyKey === "function" &&
            !app.indexes.hasCompanyKey()
          ) {
            el.useRoutineCompany.checked = true;
            u.showToast("Sem campo CODEMP, a empresa deve usar CE da rotina.");
          }

          toggleSections();
          renderBtnManterLocations();
          if (app.grid && typeof app.grid.syncLocations === "function") {
            app.grid.syncLocations();
          }
          app.fields.render();
          app.refresh();
        })
    );

    el.tabPanelLine.addEventListener("input", () => {
      state.layoutSuggestions = state.layoutSuggestions || {};
      state.layoutSuggestions.tabPanelLineAuto = false;
    });

    el.tabPanelHeight.addEventListener("input", () => {
      state.layoutSuggestions = state.layoutSuggestions || {};
      state.layoutSuggestions.tabPanelHeightAuto = false;
    });

    el.btnManterLine.addEventListener("input", () => {
      state.layoutSuggestions = state.layoutSuggestions || {};
      state.layoutSuggestions.btnManterLineAuto = false;
      if (el.btnManterLineAuto) el.btnManterLineAuto.checked = false;
    });

    if (el.btnManterLineAuto) {
      el.btnManterLineAuto.addEventListener("change", () => {
        state.layoutSuggestions = state.layoutSuggestions || {};
        state.layoutSuggestions.btnManterLineAuto = el.btnManterLineAuto.checked;
        app.refresh();
      });
    }

    el.btnManterLocation.addEventListener("change", () => {
      state.layoutSuggestions = state.layoutSuggestions || {};
      state.layoutSuggestions.btnManterLineAuto = true;
    });

    el.windowHeight.addEventListener("input", () => {
      state.layoutSuggestions = state.layoutSuggestions || {};
      state.layoutSuggestions.windowHeightAuto = false;
    });

    [
      [el.gridLinePosition, "gridLinePosition"],
      [el.gridMaintenanceButtonLine, "gridMaintenanceButtonLine"],
      [el.gridSaveButtonLine, "gridSaveButtonLine"]
    ].forEach(([input, property]) => {
      input.addEventListener("input", () => {
        if (app.grid && typeof app.grid.markPositionManual === "function") {
          app.grid.markPositionManual(property);
        }
      });
    });

    document
      .querySelectorAll(
        "input:not([data-field-property]):not([data-index-property]):not([data-tab-property]):not([data-custom-property]), " +
          "select:not([data-field-property]):not([data-index-property]):not([data-tab-property]):not([data-custom-property]):not(#macRoutinePreviewSelect):not(#gridLocation)"
      )
      .forEach((input) => {
        input.addEventListener("input", () => {
          if (app.grid && typeof app.grid.isGridSettingElement === "function" && app.grid.isGridSettingElement(input)) {
            app.grid.saveActive();
          }
          app.refresh();
        });
        input.addEventListener("change", () => {
          if (app.grid && typeof app.grid.isGridSettingElement === "function" && app.grid.isGridSettingElement(input)) {
            app.grid.saveActive();
          }
          app.refresh();
        });
      });
  }

  registerEvents();
  loadExample();
})(window.GeradorRotinasJsonPadrao);
