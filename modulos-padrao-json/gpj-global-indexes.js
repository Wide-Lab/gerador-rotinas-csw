(function (app) {
  const { state, utils: u, el } = app;
  const keyFields = () => state.fields.filter((field) => field.isKey && !app.fields.isAuxiliaryField(field));
  const fieldById = (id) => state.fields.find((field) => field.id === id);
  const isCompanyField = (field) =>
    u.normalizeVariable(field?.variable, "") === "CODEMP";

  function hasCompanyKey() {
    return keyDefinitions().some(({ field }) => isCompanyField(field));
  }

  function usesRoutineCompany(config = app.getConfig()) {
    // Empresa é obrigatória nas globais. Sem campo CODEMP, CE vira a origem
    // automaticamente, mesmo em projetos antigos que ainda não têm a opção.
    return Boolean(config?.useRoutineCompany) || !hasCompanyKey();
  }

  function createKey(fieldId = "", parameterName = "") {
    const field = fieldById(fieldId) || keyFields()[0];
    return { id: u.createId(), type: "key", fieldId: field?.id || "", fixedValue: "", parameterName: parameterName || u.toParameter(field?.description || field?.variable || "campo") };
  }

  function createFixed(value = "1") {
    return { id: u.createId(), type: "fixed", fieldId: "", fixedValue: value, parameterName: "" };
  }

  function syncWithKeys() {
    const keys = keyFields();
    state.globalIndexes = state.globalIndexes.filter((index) => index.type !== "key" || keys.some((field) => field.id === index.fieldId));
    keys.forEach((field) => {
      if (!state.globalIndexes.some((index) => index.type === "key" && index.fieldId === field.id)) state.globalIndexes.push(createKey(field.id));
    });
  }

  const keyOptions = (selected) => keyFields().map((field) => `<option value="${field.id}" ${field.id === selected ? "selected" : ""}>${u.escapeHtml(field.description)} (${u.escapeHtml(field.variable)})</option>`).join("");

  function render() {
    el.globalIndexesTableBody.innerHTML = "";
    if (!state.globalIndexes.length) el.globalIndexesTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Nenhum índice configurado.</td></tr>';
    state.globalIndexes.forEach((index, position) => {
      const isKey = index.type === "key";
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><div class="row-actions"><button class="icon-button" data-index-action="up" data-index-position="${position}">↑</button><button class="icon-button" data-index-action="down" data-index-position="${position}">↓</button></div></td>
        <td><select class="index-type-select" data-index-position="${position}" data-index-property="type"><option value="key" ${isKey ? "selected" : ""}>Chave</option><option value="fixed" ${!isKey ? "selected" : ""}>Fixo</option></select></td>
        <td><select class="index-key-select" data-index-position="${position}" data-index-property="fieldId" ${isKey ? "" : "disabled"}>${keyOptions(index.fieldId)}</select></td>
        <td><input class="index-fixed-input" data-index-position="${position}" data-index-property="fixedValue" value="${u.escapeHtml(index.fixedValue)}" ${isKey ? "disabled" : ""} placeholder='Ex.: 1 ou "TIPO"'></td>
        <td><input class="index-parameter-input" data-index-position="${position}" data-index-property="parameterName" value="${u.escapeHtml(index.parameterName)}" ${isKey ? "" : "disabled"} placeholder="Ex.: codEmpresa"></td>
        <td><button class="icon-button remove" data-index-action="remove" data-index-position="${position}">×</button></td>`;
      el.globalIndexesTableBody.appendChild(row);
    });
    if (el.useRoutineCompany && !hasCompanyKey()) {
      el.useRoutineCompany.checked = true;
    }
    updatePreview();
  }

  function updateFromInput(target) {
    const position = Number(target.dataset.indexPosition);
    const property = target.dataset.indexProperty;
    if (!Number.isInteger(position) || !property || !state.globalIndexes[position]) return;
    const index = state.globalIndexes[position];
    index[property] = target.value;
    if (property === "type") {
      if (target.value === "key") { const field = keyFields()[0]; index.fieldId = field?.id || ""; index.parameterName = u.toParameter(field?.description || field?.variable || "campo"); index.fixedValue = ""; }
      else { index.fieldId = ""; index.parameterName = ""; index.fixedValue = index.fixedValue || "1"; }
      render();
    }
    if (property === "fieldId" && index.type === "key") { const field = fieldById(index.fieldId); index.parameterName = u.toParameter(field?.description || field?.variable || "campo"); render(); }
    updatePreview(); app.refresh();
  }

  function move(position, direction) {
    const destination = position + direction;
    if (destination < 0 || destination >= state.globalIndexes.length) return;
    [state.globalIndexes[position], state.globalIndexes[destination]] = [state.globalIndexes[destination], state.globalIndexes[position]];
    render(); app.refresh();
  }

  function remove(position) { state.globalIndexes.splice(position,1); render(); app.refresh(); }
  function addKey(fieldId = "") { state.globalIndexes.push(createKey(fieldId)); render(); app.refresh(); }
  function addFixed(value = "1") { state.globalIndexes.push(createFixed(value)); render(); app.refresh(); }

  function keyDefinitions() {
    const seen = new Set(), result = [];
    state.globalIndexes.forEach((index) => {
      if (index.type !== "key" || !index.fieldId || seen.has(index.fieldId)) return;
      const field = fieldById(index.fieldId); if (!field) return;
      seen.add(index.fieldId);
      result.push({ field, parameterName: u.normalizeParameter(index.parameterName, u.toParameter(field.description || field.variable)) });
    });
    return result;
  }

  function effectiveKeyDefinitions(config = app.getConfig()) {
    const definitions = keyDefinitions();
    return usesRoutineCompany(config)
      ? definitions.filter(({ field }) => !isCompanyField(field))
      : definitions;
  }

  function macArguments(config = app.getConfig()) {
    const result = effectiveKeyDefinitions(config).map(({ field }) =>
      u.normalizeVariable(field.variable)
    );
    if (usesRoutineCompany(config)) result.unshift("CE");
    return result;
  }

  function rgParameters(config = app.getConfig()) {
    const result = effectiveKeyDefinitions(config).map(
      ({ parameterName }) => parameterName
    );
    if (usesRoutineCompany(config)) result.unshift("codEmpresa");
    return result;
  }

  function companyParameter(config = app.getConfig()) {
    if (usesRoutineCompany(config)) return "codEmpresa";
    return keyDefinitions().find(({ field }) => isCompanyField(field))
      ?.parameterName || "codEmpresa";
  }

  function companyMacArgument(config = app.getConfig()) {
    if (usesRoutineCompany(config)) return "CE";
    return keyDefinitions().find(({ field }) => isCompanyField(field))
      ? u.normalizeVariable(
          keyDefinitions().find(({ field }) => isCompanyField(field)).field.variable
        )
      : "CE";
  }

  function globalReference(config = app.getConfig()) {
    const definitions = new Map(
      effectiveKeyDefinitions(config).map((definition) => [
        definition.field.id,
        definition.parameterName
      ])
    );
    const indexes = [];

    if (usesRoutineCompany(config)) indexes.push("codEmpresa");

    state.globalIndexes.forEach((index) => {
      if (index.type === "fixed") {
        indexes.push(index.fixedValue.trim() || "1");
        return;
      }

      const field = fieldById(index.fieldId);
      if (usesRoutineCompany(config) && isCompanyField(field)) return;

      const parameter = definitions.get(index.fieldId);
      if (parameter) indexes.push(parameter);
    });

    return indexes.length
      ? `^${config.globalName}(${indexes.join(",")})`
      : `^${config.globalName}`;
  }

  function updatePreview() {
    if (el.globalPreview) el.globalPreview.value = globalReference(app.getConfig());
  }

  app.indexes = {
    keyFields,
    fieldById,
    createKey,
    createFixed,
    syncWithKeys,
    render,
    updateFromInput,
    move,
    remove,
    addKey,
    addFixed,
    keyDefinitions,
    effectiveKeyDefinitions,
    hasCompanyKey,
    usesRoutineCompany,
    macArguments,
    rgParameters,
    companyParameter,
    companyMacArgument,
    globalReference,
    updatePreview
  };
})(window.GeradorRotinasJsonPadrao);
