(function (app) {
  const { state, utils: u, el } = app;
  const expandedButtonIds = new Set();

  function cleanLabel(value, fallback = "6000") {
    return String(value || "")
      .replace(/[^a-zA-Z0-9%]/g, "") || fallback;
  }

  function cleanRoutine(value, fallback = "") {
    return u.normalizeVariable(value, fallback);
  }

  function cleanVariableCase(value, fallback = "DADOSAUX") {
    return String(value || "")
      .replace(/[^a-zA-Z0-9%]/g, "") || fallback;
  }

  function cleanSuffix(value, fallback = "A") {
    const clean = String(value || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 1);

    return clean || fallback;
  }

  function parseParameterNames(value) {
    const seen = new Set();

    return String(value || "")
      .split(/[;,\s]+/)
      .map((item) => u.normalizeVariable(item, ""))
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }

  function normalizeSelectedParameters(value) {
    if (!Array.isArray(value)) return [];

    const seen = new Set();

    return value
      .map((item) => u.normalizeVariable(item, ""))
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }

  function screenLocationId(button) {
    return `button-screen-${button.id}`;
  }

  function sourceRoutineName(button, config = app.getConfig(), visited = new Set()) {
    const locationId = button?.location || "parent";

    if (locationId === "parent") {
      return config.routineName;
    }

    const tab = state.tabs.find((item) => item.id === locationId);
    if (tab) {
      return cleanRoutine(tab.routineName, config.routineName);
    }

    const sourceButton = buttonByScreenLocation(locationId);
    if (!sourceButton) {
      return config.routineName;
    }

    const buttonId = String(button?.id || "");
    if (buttonId && visited.has(buttonId)) {
      return config.routineName;
    }

    const nextVisited = new Set(visited);
    if (buttonId) nextVisited.add(buttonId);

    return generatedRoutineName(sourceButton, config, nextVisited);
  }

  function generatedRoutineName(button, config = app.getConfig(), visited = new Set()) {
    return `${sourceRoutineName(button, config, visited)}${cleanSuffix(button.routineSuffix, "A")}`;
  }

  function auxiliaryRgRoutineName(button, config = app.getConfig()) {
    return `${generatedRoutineName(button, config)}RG`;
  }

  function suggestedAuxiliarySubscript(button) {
    const configuredTabSubscripts = state.tabs
      .map((tab) => Number(String(tab.globalSubscript || "").trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    const highestTabSubscript = configuredTabSubscripts.length
      ? Math.max(...configuredTabSubscripts)
      : 0;

    const generatedScreens = state.customButtons.filter(
      (item) =>
        item.actionType === "screen" &&
        item.generateRoutine !== false
    );

    const screenPosition = Math.max(0, generatedScreens.indexOf(button));

    return String(highestTabSubscript + screenPosition + 1);
  }

  function auxiliaryGlobalSubscript(button) {
    const configured = String(button?.auxiliaryGlobalSubscript || "").trim();
    return configured || suggestedAuxiliarySubscript(button);
  }

  function buttonByScreenLocation(locationId) {
    return state.customButtons.find(
      (button) => screenLocationId(button) === locationId
    );
  }

  function dataVariableForButton(button) {
    return cleanVariableCase(
      button?.auxiliaryDataVariable,
      "DADOSAUX"
    );
  }

  function dataVariableForLocation(locationId) {
    return dataVariableForButton(
      buttonByScreenLocation(locationId)
    );
  }

  function auxiliaryFields(button) {
    return state.fields.filter(
      (field) => field.tabId === screenLocationId(button)
    );
  }

  function nextSuffix(location = "parent") {
    const used = new Set(
      state.customButtons
        .filter(
          (button) =>
            button.actionType === "screen" &&
            button.generateRoutine !== false &&
            (button.location || "parent") === location
        )
        .map((button) => cleanSuffix(button.routineSuffix, "A"))
    );

    for (let code = 65; code <= 90; code += 1) {
      const suffix = String.fromCharCode(code);
      if (!used.has(suffix)) return suffix;
    }

    return "A";
  }

  function create(overrides = {}) {
    const position = state.customButtons.length;
    const baseLabel = 6000 + position * 100;

    return {
      id: overrides.id || u.createId(),
      location: overrides.location || "parent",
      positionMode:
        overrides.positionMode === "manual" ||
        (overrides.positionMode === undefined &&
          (overrides.column !== undefined || overrides.line !== undefined))
          ? "manual"
          : "auto",
      column: Number(overrides.column) || 1,
      line: Number(overrides.line) || 21,
      buttonId: String(overrides.buttonId || `btPersonalizado${position + 1}`),
      text: String(overrides.text || `Botão ${position + 1}`),
      shortcut: String(overrides.shortcut || "").slice(0, 1),
      icon: String(overrides.icon || ""),
      help: String(overrides.help || ""),
      size: Number(overrides.size) || 14,
      initialState: Number(overrides.initialState) === 0 ? 0 : 1,
      actionType: overrides.actionType === "screen" ? "screen" : "label",
      actionLabel: cleanLabel(overrides.actionLabel, String(baseLabel)),
      actionRoutine: String(overrides.actionRoutine || ""),
      generateRoutine: overrides.generateRoutine !== false,
      routineSuffix: cleanSuffix(overrides.routineSuffix, nextSuffix(overrides.location || "parent")),
      auxiliaryTitle: String(overrides.auxiliaryTitle || overrides.text || `Tela auxiliar ${position + 1}`),
      auxiliaryDataVariable: String(overrides.auxiliaryDataVariable || "DADOSAUX"),
      auxiliaryFirstPiece: Math.max(1, Number(overrides.auxiliaryFirstPiece) || 3),
      auxiliaryGlobalSubscript: String(overrides.auxiliaryGlobalSubscript || ""),
      selectedParameters: normalizeSelectedParameters(overrides.selectedParameters),
      extraParameterNames: String(overrides.extraParameterNames || ""),
      extraCallArguments: String(overrides.extraCallArguments || ""),
      auxiliarySaveAnother: overrides.auxiliarySaveAnother !== false,
      openRoutine: String(overrides.openRoutine || ""),
      openParameters: String(overrides.openParameters || "()"),
      returnLabel: cleanLabel(overrides.returnLabel, `${baseLabel}EX`),
      afterCloseLabel: cleanLabel(overrides.afterCloseLabel, "2999"),
      reloadVariable: String(overrides.reloadVariable || ""),
      reloadDestination: cleanLabel(overrides.reloadDestination, "2000")
    };
  }

  function isGeneratedScreenButton(button) {
    return Boolean(
      button &&
      button.actionType === "screen" &&
      button.generateRoutine !== false
    );
  }

  function locationWouldCreateCycle(button, locationId) {
    if (!button || !String(locationId || "").startsWith("button-screen-")) {
      return false;
    }

    const visited = new Set();
    let currentLocation = locationId;

    while (String(currentLocation || "").startsWith("button-screen-")) {
      const owner = buttonByScreenLocation(currentLocation);
      if (!owner) return false;
      if (owner === button || owner.id === button.id) return true;
      if (visited.has(owner.id)) return true;

      visited.add(owner.id);
      currentLocation = owner.location || "parent";
    }

    return false;
  }

  function locations(currentButton = null) {
    const config = app.getConfig();
    const result = [{
      value: "parent",
      label: `Rotina principal — ${config.routineName}`,
      disabled: false
    }];

    if (el.useTabs && el.useTabs.checked) {
      state.tabs.forEach((tab, index) => {
        result.push({
          value: tab.id,
          label: `Aba ${index + 1} — ${tab.title} — ${cleanRoutine(tab.routineName, `${config.routineName}TAB${index + 1}`)}`,
          disabled: false
        });
      });
    }

    state.customButtons
      .filter((button) => isGeneratedScreenButton(button))
      .forEach((button) => {
        const isOwnAuxiliary = Boolean(
          currentButton && button.id === currentButton.id
        );
        const createsCycle = !isOwnAuxiliary &&
          locationWouldCreateCycle(currentButton, screenLocationId(button));

        result.push({
          value: screenLocationId(button),
          label: isOwnAuxiliary
            ? `Rotina auxiliar ${generatedRoutineName(button)} — ${button.auxiliaryTitle || button.text || "Tela auxiliar"} — criada por este botão`
            : `Rotina auxiliar ${generatedRoutineName(button)} — ${button.auxiliaryTitle || button.text || "Tela auxiliar"}`,
          disabled: isOwnAuxiliary || createsCycle
        });
      });

    return result;
  }

  function locationOptions(button) {
    const selected = button?.location || "parent";

    return locations(button)
      .map(
        (location) =>
          `<option value="${location.value}" ${location.value === selected ? "selected" : ""} ${location.disabled ? "disabled" : ""}>${u.escapeHtml(location.label)}</option>`
      )
      .join("");
  }

  function availableParameters(button, config = app.getConfig()) {
    const result = [];
    const seen = new Set();

    function add(variable, label, source) {
      const normalized = u.normalizeVariable(variable, "");
      if (!normalized || seen.has(normalized)) return;

      seen.add(normalized);
      result.push({
        variable: normalized,
        label: label || normalized,
        source: source || "Tela"
      });
    }

    const locationId = button.location || "parent";
    const auxiliaryOwner = buttonByScreenLocation(locationId);

    if (auxiliaryOwner) {
      const auxiliaryLabel = `Rotina auxiliar ${generatedRoutineName(auxiliaryOwner, config)}`;

      signatureParameters(auxiliaryOwner, config).forEach((parameter) =>
        add(parameter, `Parâmetro recebido ${parameter}`, auxiliaryLabel)
      );

      auxiliaryFields(auxiliaryOwner)
        .filter((field) => app.fields.isKeyField(field) || app.fields.isMultiSelect(field))
        .forEach((field) => add(field.variable, field.description, auxiliaryLabel));

      const auxiliaryDataVariable = dataVariableForButton(auxiliaryOwner);
      add(
        auxiliaryDataVariable,
        `Variável de dados ${auxiliaryDataVariable}`,
        auxiliaryLabel
      );
    } else {
      state.fields
        .filter(
          (field) =>
            !app.fields.isAuxiliaryField(field) &&
            (field.tabId || "parent") === "parent"
        )
        .forEach((field) => add(field.variable, field.description, "Rotina principal"));

      if (locationId !== "parent") {
        const tab = state.tabs.find((item) => item.id === locationId);

        state.fields
          .filter(
            (field) =>
              !app.fields.isAuxiliaryField(field) &&
              (field.tabId || "parent") === locationId
          )
          .forEach((field) => add(field.variable, field.description, tab?.title || "Aba"));

        if (tab?.dataVariable) {
          add(tab.dataVariable, `Variável de dados ${tab.dataVariable}`, tab.title || "Aba");
        }
      }

      if (config.dataVariable) {
        add(config.dataVariable, `Variável de dados ${config.dataVariable}`, "Rotina principal");
      }
    }

    add("CE", "Empresa corrente (CE)", "Padrão CSW");
    add("CT", "Terminal/índice (CT)", "Padrão CSW");

    return result;
  }

  function selectedParameterDefinitions(button, config = app.getConfig()) {
    const candidates = availableParameters(button, config);
    const selected = new Set(normalizeSelectedParameters(button.selectedParameters));

    return candidates.filter((item) => selected.has(item.variable));
  }

  function signatureParameters(button, config = app.getConfig()) {
    const result = selectedParameterDefinitions(button, config).map((item) => item.variable);

    parseParameterNames(button.extraParameterNames).forEach((parameter) => {
      if (!result.includes(parameter)) result.push(parameter);
    });

    return result;
  }

  function splitExtraArguments(value) {
    const text = String(value || "").trim();
    if (!text) return [];

    return text.split(",").map((item) => item.trim());
  }

  function callArguments(button, config = app.getConfig()) {
    return [
      ...selectedParameterDefinitions(button, config).map((item) => item.variable),
      ...splitExtraArguments(button.extraCallArguments)
    ];
  }

  function showParameters(button, config = app.getConfig()) {
    if (button.generateRoutine !== false) {
      return `(${callArguments(button, config).join(",")})`;
    }

    const manual = String(button.openParameters || "()").trim();
    return manual || "()";
  }

  function parameterOptions(button) {
    const selected = new Set(normalizeSelectedParameters(button.selectedParameters));

    return availableParameters(button)
      .map((item) => `
        <label class="custom-parameter-option">
          <input
            type="checkbox"
            data-custom-parameter-position="${state.customButtons.indexOf(button)}"
            data-custom-parameter-variable="${u.escapeHtml(item.variable)}"
            ${selected.has(item.variable) ? "checked" : ""}
          >
          <span><strong>${u.escapeHtml(item.variable)}</strong><small>${u.escapeHtml(item.label)} · ${u.escapeHtml(item.source)}</small></span>
        </label>
      `)
      .join("");
  }

  function suffixOptions(selected) {
    const options = [];

    for (let code = 65; code <= 90; code += 1) {
      const value = String.fromCharCode(code);
      options.push(`<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`);
    }

    return options.join("");
  }

  function iconOptions(selected) {
    return app.buttonIcons
      .map(
        ([value, label]) =>
          `<option value="${u.escapeHtml(value)}" ${value === selected ? "selected" : ""}>${u.escapeHtml(label)}</option>`
      )
      .join("");
  }

  function locationLabel(locationId) {
    return locations().find((location) => location.value === locationId)?.label || "Rotina principal";
  }

  function locationGrid(locationId) {
    if (locationId === "parent") return state.parentGrid;
    return state.tabs.find((tab) => tab.id === locationId)?.grid || null;
  }

  function lastFieldLine(locationId) {
    const lines = state.fields
      .filter(
        (field) =>
          (field.tabId || "parent") === locationId
      )
      .flatMap((field) => [
        Number(field.labelLine) || 0,
        Number(field.inputLine) || 0,
        field.hasDisplay === true ? Number(field.displayLine) || 0 : 0
      ]);

    return lines.length ? Math.max(...lines) : 0;
  }

  function automaticPositionKind(button) {
    if ((button.location || "parent") === "parent") {
      return "Topo direito da rotina principal";
    }

    if (locationGrid(button.location)) {
      return "Quatro linhas após o Grid";
    }

    if (buttonByScreenLocation(button.location)) {
      return "Duas linhas após o último campo da rotina auxiliar";
    }

    return "Duas linhas após o último campo da aba";
  }

  function automaticPosition(button, config = app.getConfig()) {
    const locationId = button.location || "parent";
    const siblings = state.customButtons.filter(
      (item) =>
        (item.location || "parent") === locationId &&
        item.positionMode !== "manual"
    );
    const position = Math.max(0, siblings.indexOf(button));
    const preceding = siblings.slice(0, position);
    const size = Math.max(1, Number(button.size) || 14);

    if (locationId === "parent") {
      const width = Math.max(1, Number(config.windowWidth) || 108);
      const occupied = preceding.reduce(
        (total, item) => total + Math.max(1, Number(item.size) || 14) + 1,
        0
      );

      return {
        column: Math.max(1, width - size - occupied + 1),
        line: 2
      };
    }

    const grid = locationGrid(locationId);
    const line = grid
      ? (Number(grid.settings?.gridLineEnd) || 0) + 4
      : Math.max(0, lastFieldLine(locationId)) + 2;
    const column =
      1 +
      preceding.reduce(
        (total, item) => total + Math.max(1, Number(item.size) || 14) + 1,
        0
      );

    return {
      column: Math.max(1, column),
      line: Math.max(1, line || 2)
    };
  }

  function resolvedPosition(button, config = app.getConfig()) {
    if (button.positionMode === "manual") {
      return {
        column: Math.max(1, Number(button.column) || 1),
        line: Math.max(1, Number(button.line) || 1)
      };
    }

    return automaticPosition(button, config);
  }

  function buttonText(button) {
    const source = String(button.text || "Botão").trim();
    if (/<u>.*?<\/u>/i.test(source)) return source;

    const shortcut = String(button.shortcut || "").trim().slice(0, 1);
    if (!shortcut) return source;

    const position = source.toLocaleLowerCase("pt-BR")
      .indexOf(shortcut.toLocaleLowerCase("pt-BR"));

    if (position < 0) return source;

    return `${source.slice(0, position)}<u>${source.charAt(position)}</u>${source.slice(position + 1)}`;
  }

  function render() {
    if (!el.customButtonsContainer) return;

    el.customButtonCount.textContent = `${state.customButtons.length} ${state.customButtons.length === 1 ? "botão" : "botões"}`;
    el.customButtonsContainer.innerHTML = "";

    if (!state.customButtons.length) {
      el.customButtonsContainer.innerHTML =
        '<div class="custom-buttons-empty"><strong>Nenhum botão personalizado.</strong><span>Use “Adicionar botão” somente quando precisar de uma ação além de Salvar, Excluir e Cancelar.</span></div>';
      return;
    }

    state.customButtons.forEach((button, position) => {
      const card = document.createElement("div");
      const isScreen = button.actionType === "screen";
      const isExpanded = expandedButtonIds.has(button.id);
      const cleanText = button.text.replace(/<\/?u>/gi, "") || `Botão ${position + 1}`;
      const buttonPosition = resolvedPosition(button);
      const actionSummary = isScreen
        ? button.generateRoutine !== false
          ? `Abre ${generatedRoutineName(button)}`
          : `Abre ${button.openRoutine || "rotina existente"}`
        : `Executa ${button.actionLabel}${button.actionRoutine ? `^${button.actionRoutine}` : ""}`;

      card.className = `custom-button-card ${isExpanded ? "expanded" : "collapsed"}`;
      card.dataset.customButtonPosition = String(position);

      card.innerHTML = `
        <div class="custom-button-card-header">
          <button
            type="button"
            class="custom-button-summary"
            data-custom-action="toggle"
            data-custom-position="${position}"
            aria-expanded="${isExpanded ? "true" : "false"}"
          >
            <span class="custom-button-chevron">${isExpanded ? "▾" : "▸"}</span>
            <span class="custom-button-summary-text">
              <strong>${u.escapeHtml(cleanText)}</strong>
              <span>${u.escapeHtml(actionSummary)} · ${u.escapeHtml(locationLabel(button.location))} · Col. ${buttonPosition.column}, linha ${buttonPosition.line}</span>
            </span>
          </button>

          <div class="custom-button-header-actions">
            <button type="button" class="button small custom-button-edit-button" data-custom-action="toggle" data-custom-position="${position}">${isExpanded ? "Fechar" : "Editar"}</button>
            <div class="row-actions">
              <button type="button" class="icon-button" data-custom-action="up" data-custom-position="${position}" title="Mover para cima">↑</button>
              <button type="button" class="icon-button" data-custom-action="down" data-custom-position="${position}" title="Mover para baixo">↓</button>
              <button type="button" class="icon-button remove" data-custom-action="remove" data-custom-position="${position}" title="Remover">×</button>
            </div>
          </div>
        </div>

        <div class="custom-button-card-content ${isExpanded ? "" : "hidden"}">
          <div class="custom-button-section">
            <div class="custom-button-section-title">
              <strong>Configuração principal</strong>
              <span>Defina onde o botão aparece e o que ele faz.</span>
            </div>

            <div class="custom-button-grid">
              <div class="field span-2">
                <label>Texto do botão</label>
                <input data-custom-position="${position}" data-custom-property="text" value="${u.escapeHtml(button.text)}">
              </div>

              <div class="field span-2">
                <label>Tela / aba</label>
                <select data-custom-position="${position}" data-custom-property="location">${locationOptions(button)}</select>
              </div>

              <div class="field span-2">
                <label>Ao clicar</label>
                <select data-custom-position="${position}" data-custom-property="actionType">
                  <option value="label" ${!isScreen ? "selected" : ""}>Executar uma label</option>
                  <option value="screen" ${isScreen ? "selected" : ""}>Abrir outra tela</option>
                </select>
              </div>

              <div class="field span-2">
                <label>Posição</label>
                <select data-custom-position="${position}" data-custom-property="positionMode">
                  <option value="auto" ${button.positionMode !== "manual" ? "selected" : ""}>Automática — recomendada</option>
                  <option value="manual" ${button.positionMode === "manual" ? "selected" : ""}>Manual</option>
                </select>
              </div>

              <div class="field span-2">
                <label>Estado inicial</label>
                <select data-custom-position="${position}" data-custom-property="initialState">
                  <option value="1" ${button.initialState !== 0 ? "selected" : ""}>Visível</option>
                  <option value="0" ${button.initialState === 0 ? "selected" : ""}>Oculto</option>
                </select>
              </div>

              <div class="custom-position-summary span-4">
                <strong>${u.escapeHtml(automaticPositionKind(button))}</strong>
                <span>Posição gerada: coluna ${buttonPosition.column}, linha ${buttonPosition.line}. Botões adicionais são organizados automaticamente sem sobreposição.</span>
              </div>
            </div>
          </div>

          <details class="advanced-details custom-button-appearance-details">
            <summary>Aparência, identificação e posição manual</summary>
            <div class="custom-button-grid advanced-details-content">
              <div class="field"><label>Coluna</label><input type="number" min="1" step="1" data-custom-position="${position}" data-custom-property="column" value="${buttonPosition.column}" ${button.positionMode !== "manual" ? "disabled" : ""}></div>
              <div class="field"><label>Linha</label><input type="number" min="1" step="1" data-custom-position="${position}" data-custom-property="line" value="${buttonPosition.line}" ${button.positionMode !== "manual" ? "disabled" : ""}></div>
              <div class="field"><label>Tamanho</label><input type="number" min="1" data-custom-position="${position}" data-custom-property="size" value="${button.size}"></div>
              <div class="field"><label>Atalho</label><input maxlength="1" data-custom-position="${position}" data-custom-property="shortcut" value="${u.escapeHtml(button.shortcut)}"></div>
              <div class="field span-2"><label>ID técnico</label><input data-custom-position="${position}" data-custom-property="buttonId" value="${u.escapeHtml(button.buttonId)}"></div>
              <div class="field span-2"><label>Ícone</label><select data-custom-position="${position}" data-custom-property="icon">${iconOptions(button.icon)}</select></div>
              <div class="field span-4"><label>Texto de ajuda</label><input data-custom-position="${position}" data-custom-property="help" value="${u.escapeHtml(button.help)}"></div>
            </div>
          </details>

          <div class="custom-button-action ${isScreen ? "hidden" : ""}" data-custom-label-settings="${position}">
            <div class="custom-button-section-title">
              <strong>Ação da label</strong>
              <span>A rotina pode ficar vazia para usar a própria tela ou aba.</span>
            </div>
            <div class="custom-button-grid">
              <div class="field span-2"><label>Label</label><input data-custom-position="${position}" data-custom-property="actionLabel" value="${u.escapeHtml(button.actionLabel)}" placeholder="Ex.: 3100"></div>
              <div class="field span-2"><label>Rotina da label</label><input data-custom-position="${position}" data-custom-property="actionRoutine" value="${u.escapeHtml(button.actionRoutine)}" placeholder="Em branco usa a tela/aba escolhida"></div>
            </div>
          </div>

          <div class="custom-button-action ${isScreen ? "" : "hidden"}" data-custom-screen-settings="${position}">
            <div class="custom-button-section-title">
              <strong>Tela aberta pelo botão</strong>
              <span>O padrão recomendado gera automaticamente a rotina com a letra A.</span>
            </div>

            <div class="custom-button-grid">
              <div class="field"><label>Label local</label><input data-custom-position="${position}" data-custom-property="actionLabel" value="${u.escapeHtml(button.actionLabel)}" placeholder="Ex.: 3100"></div>
              <div class="field"><label>Label de retorno</label><input data-custom-position="${position}" data-custom-property="returnLabel" value="${u.escapeHtml(button.returnLabel)}" placeholder="Ex.: 3100EX"></div>
              <label class="checkbox-option span-2 custom-generate-screen-option">
                <input type="checkbox" data-custom-position="${position}" data-custom-property="generateRoutine" ${button.generateRoutine !== false ? "checked" : ""}>
                Gerar a nova tela automaticamente
              </label>
            </div>

            <div class="custom-generated-screen ${button.generateRoutine !== false ? "" : "hidden"}">
              <div class="custom-button-grid">
                <div class="field">
                  <label>Letra da rotina</label>
                  <select data-custom-position="${position}" data-custom-property="routineSuffix">${suffixOptions(cleanSuffix(button.routineSuffix, "A"))}</select>
                </div>
                <div class="field span-2">
                  <label>Rotina gerada</label>
                  <input value="${u.escapeHtml(generatedRoutineName(button))}" disabled>
                </div>
                <div class="field span-1 custom-auxiliary-fields-action">
                  <label>Campos da tela</label>
                  <button type="button" class="button primary" data-custom-action="add-aux-field" data-custom-position="${position}">Adicionar campo (${auxiliaryFields(button).length})</button>
                </div>
                <div class="field span-4">
                  <label>Título da tela auxiliar</label>
                  <input data-custom-position="${position}" data-custom-property="auxiliaryTitle" value="${u.escapeHtml(button.auxiliaryTitle)}" placeholder="Ex.: Cadastro de Cliente da Etiqueta">
                </div>
              </div>

              <details class="advanced-details nested-details">
                <summary>Persistência e rotina RG</summary>
                <div class="custom-button-grid advanced-details-content">
                  <div class="field span-2">
                    <label>Variável dos dados</label>
                    <input data-custom-position="${position}" data-custom-property="auxiliaryDataVariable" value="${u.escapeHtml(dataVariableForButton(button))}" placeholder="Ex.: WDOMPVCFG2">
                  </div>
                  <div class="field">
                    <label>Primeiro piece</label>
                    <input type="number" min="1" data-custom-position="${position}" data-custom-property="auxiliaryFirstPiece" value="${Math.max(1, Number(button.auxiliaryFirstPiece) || 3)}">
                  </div>
                  <div class="field">
                    <label>Salvar e continuar</label>
                    <select data-custom-position="${position}" data-custom-property="auxiliarySaveAnother">
                      <option value="1" ${button.auxiliarySaveAnother !== false ? "selected" : ""}>Sim</option>
                      <option value="0" ${button.auxiliarySaveAnother === false ? "selected" : ""}>Não</option>
                    </select>
                  </div>
                  <div class="field span-2"><label>Rotina RG gerada</label><input value="${u.escapeHtml(auxiliaryRgRoutineName(button))}" disabled></div>
                  <div class="field"><label>Global base</label><input value="^${u.escapeHtml(app.getConfig().globalName)}" disabled></div>
                  <div class="field"><label>Subíndice global</label><input data-custom-position="${position}" data-custom-property="auxiliaryGlobalSubscript" value="${u.escapeHtml(auxiliaryGlobalSubscript(button))}" placeholder="Ex.: 6"></div>
                </div>
                <p class="helper compact-helper">Campos-chave usam variável direta. Os demais usam pieces de <code>${u.escapeHtml(dataVariableForButton(button))}</code> a partir do piece ${Math.max(1, Number(button.auxiliaryFirstPiece) || 3)}.</p>
              </details>

              <details class="advanced-details nested-details">
                <summary>Parâmetros recebidos pela nova tela</summary>
                <div class="advanced-details-content">
                  <div class="custom-parameter-section">
                    <div class="custom-parameter-header">
                      <div>
                        <strong>Variáveis disponíveis na origem</strong>
                        <span>Marque somente o que a tela realmente precisa receber.</span>
                      </div>
                    </div>
                    <div class="custom-parameter-options">${parameterOptions(button)}</div>
                  </div>

                  <div class="custom-button-grid">
                    <div class="field span-2"><label>Parâmetros extras da rotina</label><input data-custom-position="${position}" data-custom-property="extraParameterNames" value="${u.escapeHtml(button.extraParameterNames)}" placeholder="Ex.: CODCLI,TABALT,FLGFUN"></div>
                    <div class="field span-2"><label>Valores extras enviados no Show</label><input data-custom-position="${position}" data-custom-property="extraCallArguments" value="${u.escapeHtml(button.extraCallArguments)}" placeholder="Ex.: ,,.TABALT,0 ou ,,0"></div>
                    <div class="field span-4"><label>Chamada gerada</label><input value="do Show^${u.escapeHtml(generatedRoutineName(button))}(&quot;${u.escapeHtml(button.returnLabel)}^${u.escapeHtml(sourceRoutineName(button))}&quot;,&quot;${u.escapeHtml(showParameters(button))}&quot;)" disabled></div>
                  </div>
                </div>
              </details>
            </div>

            <div class="custom-manual-screen ${button.generateRoutine === false ? "" : "hidden"}">
              <div class="custom-button-grid">
                <div class="field span-2"><label>Rotina existente</label><input data-custom-position="${position}" data-custom-property="openRoutine" value="${u.escapeHtml(button.openRoutine)}" placeholder="Ex.: EXEMPLOCRUDA"></div>
                <div class="field span-2"><label>Parâmetros enviados ao Show</label><input data-custom-position="${position}" data-custom-property="openParameters" value="${u.escapeHtml(button.openParameters)}" placeholder="Ex.: (CE,,,.RELOAD)"></div>
              </div>
            </div>

            <details class="advanced-details nested-details">
              <summary>Comportamento após fechar a tela</summary>
              <div class="custom-button-grid advanced-details-content">
                <div class="field span-2"><label>Após fechar, ir para</label><input data-custom-position="${position}" data-custom-property="afterCloseLabel" value="${u.escapeHtml(button.afterCloseLabel)}" placeholder="Ex.: 2999"></div>
                <div class="field"><label>Variável de recarga</label><input data-custom-position="${position}" data-custom-property="reloadVariable" value="${u.escapeHtml(button.reloadVariable)}" placeholder="Ex.: RELOAD"></div>
                <div class="field"><label>Se recarregar, ir para</label><input data-custom-position="${position}" data-custom-property="reloadDestination" value="${u.escapeHtml(button.reloadDestination)}" placeholder="Ex.: 2000"></div>
              </div>
            </details>
          </div>
        </div>
      `;

      el.customButtonsContainer.appendChild(card);
    });
  }

  function add(overrides = {}) {
    const button = create(overrides);
    state.customButtons.push(button);
    expandedButtonIds.add(button.id);
    render();
    app.refresh();
  }

  function move(position, direction) {
    const destination = position + direction;
    if (destination < 0 || destination >= state.customButtons.length) return;

    [state.customButtons[position], state.customButtons[destination]] = [
      state.customButtons[destination],
      state.customButtons[position]
    ];

    render();
    app.refresh();
  }

  function remove(position) {
    const button = state.customButtons[position];
    if (!button) return;

    const locationId = screenLocationId(button);
    expandedButtonIds.delete(button.id);
    state.fields = state.fields.filter(
      (field) => field.tabId !== locationId
    );

    state.customButtons.splice(position, 1);
    state.customButtons.forEach((item) => {
      if ((item.location || "parent") === locationId) item.location = "parent";
    });
    app.fields.render();
    app.indexes.syncWithKeys();
    app.indexes.render();
    render();
    app.refresh();
  }

  function updateFromInput(target) {
    const position = Number(target.dataset.customPosition);
    const property = target.dataset.customProperty;

    if (!Number.isInteger(position) || !property || !state.customButtons[position]) {
      return;
    }

    const button = state.customButtons[position];
    let value = target.type === "checkbox"
      ? target.checked
      : target.type === "number"
        ? Number(target.value)
        : target.value;

    if (["column", "line", "size", "initialState", "auxiliaryFirstPiece"].includes(property)) {
      value = Number(value);
    }

    if (property === "auxiliaryFirstPiece") {
      value = Math.max(1, Number(value) || 1);
      target.value = value;
    }

    if (property === "auxiliaryDataVariable") {
      value = cleanVariableCase(value, "DADOSAUX");
      target.value = value;
    }

    if (property === "auxiliarySaveAnother") {
      value = String(value) !== "0";
    }

    if (["actionLabel", "returnLabel", "afterCloseLabel", "reloadDestination"].includes(property)) {
      value = cleanLabel(value, button[property]);
      target.value = value;
    }

    if (property === "shortcut") {
      value = String(value || "").slice(0, 1);
      target.value = value;
    }

    if (property === "positionMode" && value === "manual") {
      const currentPosition = resolvedPosition(button);
      button.column = currentPosition.column;
      button.line = currentPosition.line;
    }

    button[property] = value;

    if (property === "location") {
      const validParameters = new Set(
        availableParameters(button).map((item) => item.variable)
      );

      button.selectedParameters = normalizeSelectedParameters(button.selectedParameters)
        .filter((parameter) => validParameters.has(parameter));

      const duplicate = state.customButtons.some(
        (item) =>
          item !== button &&
          item.actionType === "screen" &&
          item.generateRoutine !== false &&
          (item.location || "parent") === (button.location || "parent") &&
          cleanSuffix(item.routineSuffix, "A") === cleanSuffix(button.routineSuffix, "A")
      );

      if (duplicate) button.routineSuffix = nextSuffix(button.location || "parent");
    }

    if (["actionType", "generateRoutine"].includes(property)) {
      syncLocations();
    } else if (["location", "positionMode", "routineSuffix"].includes(property)) {
      render();
    }

    app.refresh();
  }

  function toggleParameter(position, variable, checked) {
    if (!Number.isInteger(position) || !state.customButtons[position]) return;

    const button = state.customButtons[position];
    const normalized = u.normalizeVariable(variable, "");
    const selected = new Set(normalizeSelectedParameters(button.selectedParameters));

    if (checked) selected.add(normalized);
    else selected.delete(normalized);

    button.selectedParameters = [...selected];
    render();
    app.refresh();
  }

  function syncLocations() {
    state.customButtons.forEach((button) => {
      const valid = new Set(
        locations(button)
          .filter((location) => !location.disabled)
          .map((location) => location.value)
      );
      if (!valid.has(button.location)) button.location = "parent";
    });
    render();
  }

  function initialize() {
    if (!el.customButtonsContainer || !el.addCustomButtonButton) return;

    el.addCustomButtonButton.addEventListener("click", () => add());

    el.customButtonsContainer.addEventListener("input", (event) => {
      const target = event.target.closest("[data-custom-property]");
      if (target) updateFromInput(target);
    });

    el.customButtonsContainer.addEventListener("change", (event) => {
      const parameter = event.target.closest("[data-custom-parameter-variable]");

      if (parameter) {
        toggleParameter(
          Number(parameter.dataset.customParameterPosition),
          parameter.dataset.customParameterVariable,
          parameter.checked
        );
        return;
      }

      const target = event.target.closest("[data-custom-property]");
      if (target) updateFromInput(target);
    });

    el.customButtonsContainer.addEventListener("click", (event) => {
      const button = event.target.closest("[data-custom-action]");
      if (!button) return;

      const position = Number(button.dataset.customPosition);
      const action = button.dataset.customAction;

      if (action === "toggle") {
        const sourceButton = state.customButtons[position];
        if (!sourceButton) return;

        if (expandedButtonIds.has(sourceButton.id)) {
          expandedButtonIds.delete(sourceButton.id);
        } else {
          expandedButtonIds.add(sourceButton.id);
        }

        render();
        return;
      }

      if (action === "up") move(position, -1);
      if (action === "down") move(position, 1);
      if (action === "remove") remove(position);

      if (action === "add-aux-field") {
        const sourceButton = state.customButtons[position];
        if (!sourceButton) return;

        app.fields.add({
          tabId: screenLocationId(sourceButton),
          description: "Novo Campo",
          variable: `CAMPO${auxiliaryFields(sourceButton).length + 1}`,
          type: "string",
          required: true
        });

        render();
      }
    });

    render();
  }

  function all() {
    return state.customButtons.map((button) => ({ ...button }));
  }

  function buttonsForLocation(locationId) {
    return state.customButtons.filter(
      (button) => (button.location || "parent") === locationId
    );
  }

  function variables() {
    const result = new Set();

    state.customButtons.forEach((button) => {
      if (button.actionType !== "screen") return;
      const reload = u.normalizeVariable(button.reloadVariable, "");
      if (reload) result.add(reload);
    });

    return [...result];
  }

  function appendInitializers(lines, locationId) {
    const buttons = buttonsForLocation(locationId);
    if (!buttons.length) return;

    buttons.forEach((button) => {
      lines.push(`\tdo HabBotGeral^%CSW1("${u.escapeMac(button.buttonId)}",${button.initialState === 0 ? 0 : 1})`);
    });
    lines.push("\t;");
  }

  function appendActions(lines, config, locationId, routineName) {
    const buttons = buttonsForLocation(locationId).filter(
      (button) => button.actionType === "screen"
    );

    buttons.forEach((button) => {
      const label = cleanLabel(button.actionLabel, "6000");
      const returnLabel = cleanLabel(button.returnLabel, `${label}EX`);
      const openRoutine = button.generateRoutine !== false
        ? generatedRoutineName(button, config)
        : cleanRoutine(button.openRoutine, "OUTRAROTINA");
      const parameters = showParameters(button, config);
      const afterClose = cleanLabel(button.afterCloseLabel, "2999");
      const reloadVariable = u.normalizeVariable(button.reloadVariable, "");
      const reloadDestination = cleanLabel(button.reloadDestination, "2000");
      const title = u.sanitize(button.text.replace(/<\/?u>/gi, "")) || "Abrir outra tela";

      lines.push(`\t; ${title}`);

      if (reloadVariable) {
        lines.push(`${label}\tset ${reloadVariable}=""`);
      } else {
        lines.push(`${label}\t;`);
      }

      lines.push(`\tdo Show^${openRoutine}("${returnLabel}^${routineName}","${u.escapeMac(parameters)}")`);
      lines.push("\tquit:$$CSP^%CSW1UTI()");
      lines.push("\t;");

      if (reloadVariable) {
        lines.push(`${returnLabel}\tif $get(${reloadVariable}) goto ${reloadDestination}`);
        lines.push(`\tgoto ${afterClose}`);
      } else {
        lines.push(`${returnLabel}\tgoto ${afterClose}`);
      }

      lines.push("\t;");
    });
  }

  function appendTags(lines, locationId, routineName) {
    buttonsForLocation(locationId).forEach((button) => {
      const label = cleanLabel(button.actionLabel, "6000");
      const targetRoutine = button.actionType === "screen"
        ? routineName
        : cleanRoutine(button.actionRoutine, routineName);

      const position = resolvedPosition(button);

      lines.push(
        `\t; csw:botao:${position.column},${position.line},${u.escapeMac(button.buttonId)},${u.sanitize(buttonText(button))},${u.escapeMac(button.shortcut)},${label}^${targetRoutine},${u.escapeMac(button.icon)},${u.escapeMac(button.help)},${button.size}`
      );
    });
  }

  function generatedScreenDefinitions(config = app.getConfig()) {
    return state.customButtons
      .filter(
        (button) =>
          button.actionType === "screen" &&
          button.generateRoutine !== false
      )
      .map((button, index) => ({
        key: screenLocationId(button),
        button,
        index,
        routineName: generatedRoutineName(button, config),
        sourceRoutineName: sourceRoutineName(button, config),
        title: button.auxiliaryTitle || button.text || `Tela auxiliar ${index + 1}`,
        parameters: signatureParameters(button, config),
        callArguments: callArguments(button, config),
        dataVariable: dataVariableForButton(button),
        firstPiece: Math.max(1, Number(button.auxiliaryFirstPiece) || 3),
        rgRoutineName: auxiliaryRgRoutineName(button, config),
        globalSubscript: auxiliaryGlobalSubscript(button),
        saveAnother: button.auxiliarySaveAnother !== false
      }));
  }

  app.customButtons = {
    create,
    add,
    move,
    remove,
    render,
    syncLocations,
    initialize,
    all,
    buttonsForLocation,
    variables,
    appendInitializers,
    appendActions,
    appendTags,
    screenLocationId,
    sourceRoutineName,
    generatedRoutineName,
    auxiliaryRgRoutineName,
    auxiliaryGlobalSubscript,
    buttonByScreenLocation,
    dataVariableForButton,
    dataVariableForLocation,
    auxiliaryFields,
    availableParameters,
    signatureParameters,
    callArguments,
    showParameters,
    resolvedPosition,
    buttonText,
    generatedScreenDefinitions
  };
})(window.GeradorRotinasJsonPadrao);
