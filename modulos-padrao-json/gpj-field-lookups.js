(function (app) {
  const { state, utils: u, el } = app;
  let activeFieldId = "";

  const presets = {
    none: {
      label: "Sem F7 / validação personalizada",
      group: "Geral",
      f7Routine: "",
      extraVariables: "",
      valcpCode: "",
      displayLoadMode: "reference",
      displayLoadCode: ""
    },

    empresa: {
      label: "Empresa",
      group: "Padrões completos — F7 + display",
      f7Routine: "%EMP^CCAFC299",
      extraVariables: "EMP",
      valcpCode: [
        "set sc=$$VerEmpresa^CCAPLRG001({reference},.EMP)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "do Set^%CSW1UTI(%PRG,\"{display}\",$piece(EMP,Z,1))"
      ].join("\n"),
      displayLoadMode: "valcp",
      displayLoadCode: ""
    },

    cliente: {
      label: "Cliente",
      group: "Padrões completos — F7 + display",
      f7Routine: "FTCL^CCCT299",
      extraVariables: "FTCL",
      valcpCode: [
        "set sc=$$ObterNomeCliente^CCFT760RG(CODEMP,{reference},.FTCL)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "do Set^%CSW1UTI(%PRG,\"{display}\",$piece(FTCL,Z,2))"
      ].join("\n"),
      displayLoadMode: "valcp",
      displayLoadCode: ""
    },

    tabelaPreco: {
      label: "Tabela de preço",
      group: "Padrões completos — F7 + display",
      f7Routine: "PVMTBP^CCPVM299",
      extraVariables: "PVMTBP",
      valcpCode: [
        "set sc=$$VerTabelaPrecoMalharia^CCPVRG001(CE,{reference},,,.PVMTBP)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "do Set^%CSW1UTI(%PRG,\"{display}\",$piece(PVMTBP,Z,1))"
      ].join("\n"),
      displayLoadMode: "valcp",
      displayLoadCode: ""
    },

    moeda: {
      label: "Código da moeda",
      group: "Padrões completos — F7 + display",
      f7Routine: ",UNIMON^CCAPL299",
      extraVariables: "CSUM,DESMOE",
      valcpCode: [
        "set sc=$$VerCadUnidade^CCAPLRG001({reference},.CSUM)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "set DESMOE=$piece(CSUM,Z,1)",
        ";",
        "do Set^%CSW1UTI(%PRG,\"{display}\",DESMOE)"
      ].join("\n"),
      displayLoadMode: "valcp",
      displayLoadCode: ""
    },

    condicaoVenda: {
      label: "Condição de venda",
      group: "Padrões completos — F7 + display",
      f7Routine: "%CSCV^CCPV299",
      extraVariables: "CSCV,DESCVEN",
      valcpCode: [
        "set sc=$$ValidarCampoCondicaoVenda^{rgRoutine}(CE,{reference},.DESCVEN)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "set sc=$$VerCondicaoVenda^CCFTRG001(CE,{reference},.CSCV)",
        "if sc'=1 do ME^%CSUTICSP(sc) quit 0",
        ";",
        "if $piece(CSCV,Z,16)=0 do ME^%CSUTIUD(\"Condição de venda inativa!\") quit 0",
        ";",
        "do Set^%CSW1UTI(%PRG,\"{display}\",DESCVEN)"
      ].join("\n"),
      displayLoadMode: "valcp",
      displayLoadCode: ""
    },

    produto: {
      label: "Produto — ITEM^CCCGIRG012(CFGITE)",
      group: "Padrões completos — Leitor tipado + display",
      f7Routine: "",
      extraVariables: "CFGITE,CGIGEN",
      valcpCode: [
        "if {reference}=\"\" do ME^%CSUTIUD(\"Produto: Campo obrigatório!\") quit 0",
        ";",
        "set sc=$$VerItemCGIGEN^CCCGIRG001({company},{reference},.CGIGEN)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "do Set^%CSW1UTI(%PRG,\"{display}\",$piece(CGIGEN,Z,1))"
      ].join("\n"),
      displayLoadMode: "valcp",
      displayLoadCode: "",
      autoDisplay: true,
      typedReaderEnabled: true,
      typedReaderConfigVariable: "CFGITE",
      typedReaderConfigText: "Tipo2: E/S; Tipo3: Pai/Filho/Normal",
      typedReaderConfigMethod: "ObterConfLeitor^CCCGIRG012",
      typedReaderRoutine: "ITEM^CCCGIRG012(CFGITE)",
      typedReaderCompanyExpression: "CE",
      typedReaderControlDefinition: ",,3,{cp}",
      typedReaderExtraDefinition: ",1",
      typedReaderUseCurrentValue: true
    },

    tipoNota: {
      label: "Tipo de Nota — CSTN^CCFT299A",
      group: "Padrões completos — F7 + display",
      f7Routine: "CSTN^CCFT299A",
      extraVariables: "CSTN,DESCTIPNOT",
      valcpCode: [
        "set sc=$$VerTipoNota^CCFTRG001({reference},.CSTN)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "set DESCTIPNOT=$piece(CSTN,Z,1)",
        ";",
        "do Set^%CSW1UTI(%PRG,\"{display}\",DESCTIPNOT)"
      ].join("\n"),
      displayLoadMode: "valcp",
      displayLoadCode: "",
      autoDisplay: true
    },

    representante: {
      label: "Representante — FTRE^CCPV299",
      group: "Padrões completos — F7 + display",
      f7Routine: "FTRE^CCPV299",
      extraVariables: "FTRE,DESCREP",
      valcpCode: [
        "set sc=$$VerRepresentante^CCFTRG001({company},{reference},.FTRE)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "set DESCREP=$piece(FTRE,Z,1)",
        ";",
        "do Set^%CSW1UTI(%PRG,\"{display}\",DESCREP)"
      ].join("\n"),
      displayLoadMode: "valcp",
      displayLoadCode: "",
      autoDisplay: true
    },

    transportadora: {
      label: "Transportadora — %CSTR^CCPV299",
      group: "Padrões completos — F7 + display",
      f7Routine: "%CSTR^CCPV299",
      extraVariables: "CSTR,DESTRANS",
      valcpCode: [
        "set sc=$$VerTransportadora^CCAPLRG001({reference},.CSTR)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "set DESTRANS=$piece(CSTR,Z,1)",
        ";",
        "do Set^%CSW1UTI(%PRG,\"{display}\",DESTRANS)"
      ].join("\n"),
      displayLoadMode: "valcp",
      displayLoadCode: "",
      autoDisplay: true
    },

    tipoNotaMulti: {
      label: "Tipo de Nota — Multi-Seleção + rotina 299",
      group: "Padrões completos — F7 + display",
      f7Routine: "",
      extraVariables: "%CSTN",
      valcpCode: [
        `if {reference}=""&($data({multiTable})) do  quit $$$OK`,
        `. do Set^%CSW1UTI(%PRG,"{display}","{multiSelectedText}")`,
        `;`,
        `if {reference}=""&('$data({multiTable})) do ClearCp^%CSW1UTI("{display}") do ME^%CSUTIUD("{fieldDescription}: Campo obrigatório!") quit 0`,
        `;`,
        `set sc=$$VerTipoNota^CCFTRG001({reference},.%CSTN)`,
        `if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0`,
        `;`,
        `do Set^%CSW1UTI(%PRG,"{display}",$piece(%CSTN,Z,1))`
      ].join("\n"),
      displayLoadMode: "valcp",
      displayLoadCode: ""
    },

    custom: {
      label: "Personalizado",
      group: "Geral",
      f7Routine: "",
      extraVariables: "",
      valcpCode: "",
      displayLoadMode: "reference",
      displayLoadCode: ""
    }
  };

  function availablePresets() {
    const catalog = Array.isArray(window.GeradorRotinasJsonPadraoF7Catalog)
      ? window.GeradorRotinasJsonPadraoF7Catalog
      : [];

    const catalogPresets = catalog.reduce((result, item) => {
      result[item.key] = {
        label: item.label,
        group: item.group || "Consultas F7",
        f7Routine: item.f7Routine || "",
        extraVariables: "",
        valcpCode: "",
        displayLoadMode: "reference",
        displayLoadCode: "",
        autoDisplay: item.autoDisplay === true,
        typedReaderEnabled: false
      };
      return result;
    }, {});

    return {
      ...presets,
      ...catalogPresets
    };
  }

  function presetOptions(selected = "none") {
    const groups = new Map();

    Object.entries(availablePresets()).forEach(([key, preset]) => {
      const group = preset.group || "Outros";
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push([key, preset]);
    });

    return Array.from(groups.entries())
      .map(([group, items]) => {
        const options = items
          .sort((a, b) => a[1].label.localeCompare(b[1].label, "pt-BR"))
          .map(([key, preset]) =>
            `<option value="${u.escapeHtml(key)}" ${key === selected ? "selected" : ""}>${u.escapeHtml(preset.label)}</option>`
          )
          .join("");
        return `<optgroup label="${u.escapeHtml(group)}">${options}</optgroup>`;
      })
      .join("");
  }

  function getActiveField() {
    return state.fields.find((field) => field.id === activeFieldId);
  }

  function applyPresetToField(field, presetKey, keepCustom = false) {
    const presetMap = availablePresets();
    if (!field || !presetMap[presetKey]) return;

    const preset = presetMap[presetKey];
    field.lookupPreset = presetKey;

    if (!keepCustom || presetKey === "none") {
      field.f7Routine = preset.f7Routine;
      field.extraVariables = preset.extraVariables;
      field.valcpCode = preset.valcpCode;
      field.displayLoadMode = preset.displayLoadMode || "reference";
      field.displayLoadCode = preset.displayLoadCode || "";
      field.typedReaderEnabled = preset.typedReaderEnabled === true;
      field.typedReaderConfigVariable =
        preset.typedReaderConfigVariable || "CFGITE";
      field.typedReaderConfigText =
        preset.typedReaderConfigText || "";
      field.typedReaderConfigMethod =
        preset.typedReaderConfigMethod || "ObterConfLeitor^CCCGIRG012";
      field.typedReaderRoutine =
        preset.typedReaderRoutine || "";
      field.typedReaderCompanyExpression =
        preset.typedReaderCompanyExpression || "CE";
      field.typedReaderControlDefinition =
        preset.typedReaderControlDefinition || ",,3,{cp}";
      field.typedReaderExtraDefinition =
        preset.typedReaderExtraDefinition || ",1";
      field.typedReaderUseCurrentValue =
        preset.typedReaderUseCurrentValue !== false;
    }

    if (
      presetKey !== "none" &&
      presetKey !== "custom" &&
      preset.autoDisplay !== false &&
      app.fields.canDisplay(field)
    ) {
      field.hasDisplay = true;
    }

    if (presetKey === "tipoNotaMulti") {
      field.type = "multiSelect";
      field.isKey = false;
      field.tabKey = false;
      field.multiSelectTableVariable =
        field.multiSelectTableVariable || "TABNOT";

      if (
        u.normalizeVariable(field.variable, "CAMPO") ===
        u.normalizeVariable(field.multiSelectTableVariable, "TABNOT")
      ) {
        field.variable = "TIPNOT";
      }

      field.multiSelectSelectedText =
        field.multiSelectSelectedText || "Selecionados";
      field.generateF7Routine299 = true;
      field.f7GeneratedRoutineAuto = true;
      field.f7GeneratedLabelAuto = true;
      field.f7AllGlobalReference =
        field.f7AllGlobalReference ?? field.f7SelectedGlobalReference ?? "";

      if (app.f7 && typeof app.f7.syncField === "function") {
        app.f7.syncField(field);
      }
    } else if (presetKey !== "custom") {
      if (app.fields.isMultiSelect(field) && presetKey !== "none") {
        field.generateF7Routine299 = true;
        field.f7GeneratedRoutineAuto = true;
        field.f7GeneratedLabelAuto = true;

        if (app.f7 && typeof app.f7.syncField === "function") {
          app.f7.syncField(field);
        }
      } else if (presetKey === "none") {
        field.generateF7Routine299 = false;
      }
    }
  }

  function updateTypedReaderVisibility(field = getActiveField()) {
    const enabled = Boolean(field && field.typedReaderEnabled === true);
    el.fieldUseTypedReader.checked = enabled;
    el.fieldTypedReaderFields.classList.toggle("hidden", !enabled);
  }

  function updateDisplayCodeVisibility() {
    const customMode = el.fieldLookupDisplayMode.value === "custom";
    el.fieldLookupDisplayCodeContainer.classList.toggle("hidden", !customMode);
  }

  function updateGeneratedF7Visibility(field = getActiveField()) {
    const show = Boolean(field && app.fields.isMultiSelect(field));
    const enabled = Boolean(show && field.generateF7Routine299 === true);

    el.fieldGeneratedF7Configuration.classList.toggle("hidden", !show);
    el.fieldGenerateF7Routine299.checked = enabled;
    el.fieldGeneratedF7Fields.classList.toggle("hidden", !enabled);
    el.fieldLookupRoutine.disabled = enabled;
  }

  function updateMultiSelectVisibility(field = getActiveField()) {
    const show = Boolean(field && app.fields.isMultiSelect(field));
    el.fieldMultiSelectConfiguration.classList.toggle("hidden", !show);
    updateGeneratedF7Visibility(field);
  }

  function loadFieldIntoModal(field) {
    el.fieldLookupModalTitle.textContent =
      `F7 e validação — ${field.description}`;

    if (app.f7 && typeof app.f7.syncField === "function") {
      app.f7.syncField(field);
    }

    el.fieldLookupPreset.innerHTML = presetOptions(field.lookupPreset || "none");
    el.fieldLookupRoutine.value = field.f7Routine || "";
    el.fieldLookupVariables.value = field.extraVariables || "";
    el.fieldUseTypedReader.checked = field.typedReaderEnabled === true;
    el.fieldTypedReaderConfigVariable.value =
      field.typedReaderConfigVariable || "CFGITE";
    el.fieldTypedReaderConfigText.value =
      field.typedReaderConfigText || "";
    el.fieldTypedReaderConfigMethod.value =
      field.typedReaderConfigMethod || "ObterConfLeitor^CCCGIRG012";
    el.fieldTypedReaderRoutine.value =
      field.typedReaderRoutine || "";
    el.fieldTypedReaderCompanyExpression.value =
      field.typedReaderCompanyExpression || "CE";
    el.fieldTypedReaderControlDefinition.value =
      field.typedReaderControlDefinition || ",,3,{cp}";
    el.fieldTypedReaderExtraDefinition.value =
      field.typedReaderExtraDefinition || ",1";
    el.fieldTypedReaderUseCurrentValue.checked =
      field.typedReaderUseCurrentValue !== false;
    el.fieldLookupValcp.value = field.valcpCode || "";
    el.fieldAfterFieldCode.value = field.afterFieldCode || "";
    el.fieldLookupDisplayMode.value =
      field.displayLoadMode ||
      (String(field.valcpCode || "").trim() ? "valcp" : "reference");
    el.fieldLookupDisplayCode.value = field.displayLoadCode || "";

    el.fieldMultiSelectTableVariable.value = field.multiSelectTableVariable || "";
    el.fieldMultiSelectSelectedText.value = field.multiSelectSelectedText || "Selecionados";
    el.fieldMultiSelectGlobalReference.value = field.multiSelectGlobalReference || "";
    const f7Defaults = app.f7 && typeof app.f7.presetLayout === "function"
      ? app.f7.presetLayout(field)
      : { columnSizes: "7,40", pieces: "1", titles: `${field.description},Descrição`, rows: 15 };

    el.fieldGenerateF7Routine299.checked = field.generateF7Routine299 === true;
    el.fieldGeneratedF7RoutineName.value = field.f7GeneratedRoutineName || "";
    el.fieldGeneratedF7Label.value = field.f7GeneratedLabel || "";
    el.fieldGeneratedF7SelectedGlobal.value =
      field.f7AllGlobalReference ?? field.f7SelectedGlobalReference ?? "";
    el.fieldGeneratedF7ColumnSizes.value = field.f7GeneratedColumnSizes || f7Defaults.columnSizes;
    el.fieldGeneratedF7Pieces.value = field.f7GeneratedPieces || f7Defaults.pieces;
    el.fieldGeneratedF7Titles.value = field.f7GeneratedTitles || f7Defaults.titles;
    el.fieldGeneratedF7Rows.value = Number(field.f7GeneratedRows) > 0
      ? Number(field.f7GeneratedRows)
      : f7Defaults.rows;
    updateDisplayCodeVisibility();
    updateTypedReaderVisibility(field);
    updateMultiSelectVisibility(field);
  }

  function saveModalIntoField() {
    const field = getActiveField();
    if (!field) return;

    field.lookupPreset = el.fieldLookupPreset.value || "custom";
    field.f7Routine = el.fieldLookupRoutine.value.trim();
    field.extraVariables = el.fieldLookupVariables.value.trim();
    field.typedReaderEnabled = el.fieldUseTypedReader.checked;
    field.typedReaderConfigVariable =
      el.fieldTypedReaderConfigVariable.value.trim() || "CFGITE";
    field.typedReaderConfigText =
      el.fieldTypedReaderConfigText.value.trim();
    field.typedReaderConfigMethod =
      el.fieldTypedReaderConfigMethod.value.trim() ||
      "ObterConfLeitor^CCCGIRG012";
    field.typedReaderRoutine =
      el.fieldTypedReaderRoutine.value.trim();
    field.typedReaderCompanyExpression =
      el.fieldTypedReaderCompanyExpression.value.trim() || "CE";
    field.typedReaderControlDefinition =
      el.fieldTypedReaderControlDefinition.value.trim() || ",,3,{cp}";
    field.typedReaderExtraDefinition =
      el.fieldTypedReaderExtraDefinition.value.trim() || ",1";
    field.typedReaderUseCurrentValue =
      el.fieldTypedReaderUseCurrentValue.checked;
    field.valcpCode = el.fieldLookupValcp.value.replace(/\r\n/g, "\n").trim();
    field.afterFieldCode = el.fieldAfterFieldCode.value
      .replace(/\r\n/g, "\n")
      .trim();
    field.displayLoadMode = el.fieldLookupDisplayMode.value || "reference";
    field.displayLoadCode = el.fieldLookupDisplayCode.value
      .replace(/\r\n/g, "\n")
      .trim();
    field.multiSelectTableVariable = el.fieldMultiSelectTableVariable.value.trim();
    field.multiSelectSelectedText = el.fieldMultiSelectSelectedText.value.trim() || "Selecionados";
    field.multiSelectGlobalReference = el.fieldMultiSelectGlobalReference.value.trim();
    field.generateF7Routine299 = el.fieldGenerateF7Routine299.checked;
    field.f7GeneratedRoutineName = el.fieldGeneratedF7RoutineName.value.trim();
    field.f7GeneratedLabel = el.fieldGeneratedF7Label.value.trim();
    field.f7AllGlobalReference = el.fieldGeneratedF7SelectedGlobal.value.trim();
    field.f7GeneratedColumnSizes = el.fieldGeneratedF7ColumnSizes.value.trim();
    field.f7GeneratedPieces = el.fieldGeneratedF7Pieces.value.trim();
    field.f7GeneratedTitles = el.fieldGeneratedF7Titles.value.trim();
    field.f7GeneratedRows = Number(el.fieldGeneratedF7Rows.value) || 15;
    delete field.f7SelectedGlobalReference;

    if (
      field.generateF7Routine299 &&
      app.f7 &&
      typeof app.f7.syncField === "function"
    ) {
      app.f7.syncField(field);
      el.fieldLookupRoutine.value = field.f7Routine || "";
    }
  }

  function open(fieldPosition) {
    const field = state.fields[fieldPosition];
    if (!field) return;

    activeFieldId = field.id;
    loadFieldIntoModal(field);

    el.fieldLookupModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function close() {
    saveModalIntoField();
    activeFieldId = "";
    el.fieldLookupModal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    app.fields.render();
    app.refresh();
  }

  function applySelectedPreset() {
    const field = getActiveField();
    if (!field) return;

    applyPresetToField(field, el.fieldLookupPreset.value);
    loadFieldIntoModal(field);
    app.fields.render();
    app.refresh();
  }

  function clear() {
    const field = getActiveField();
    if (!field) return;

    applyPresetToField(field, "none");
    loadFieldIntoModal(field);
    app.fields.render();
    app.refresh();
  }

  function initialize() {
    el.applyFieldLookupPresetButton.addEventListener("click", applySelectedPreset);
    el.clearFieldLookupButton.addEventListener("click", clear);
    el.closeFieldLookupModalButton.addEventListener("click", close);
    el.finishFieldLookupButton.addEventListener("click", close);

    [
      el.fieldLookupRoutine,
      el.fieldLookupVariables,
      el.fieldTypedReaderConfigVariable,
      el.fieldTypedReaderConfigText,
      el.fieldTypedReaderConfigMethod,
      el.fieldTypedReaderRoutine,
      el.fieldTypedReaderCompanyExpression,
      el.fieldTypedReaderControlDefinition,
      el.fieldTypedReaderExtraDefinition,
      el.fieldLookupValcp,
      el.fieldAfterFieldCode,
      el.fieldLookupDisplayCode,
      el.fieldMultiSelectTableVariable,
      el.fieldMultiSelectSelectedText,
      el.fieldMultiSelectGlobalReference,
      el.fieldGeneratedF7SelectedGlobal,
      el.fieldGeneratedF7ColumnSizes,
      el.fieldGeneratedF7Pieces,
      el.fieldGeneratedF7Titles,
      el.fieldGeneratedF7Rows
    ].forEach((input) => {
      input.addEventListener("input", () => {
        saveModalIntoField();
        app.refresh();
      });
    });

    el.fieldUseTypedReader.addEventListener("change", () => {
      saveModalIntoField();
      updateTypedReaderVisibility();
      app.fields.render();
      app.refresh();
    });

    el.fieldTypedReaderUseCurrentValue.addEventListener("change", () => {
      saveModalIntoField();
      app.refresh();
    });

    el.fieldGenerateF7Routine299.addEventListener("change", () => {
      const field = getActiveField();
      if (!field) return;

      field.generateF7Routine299 = el.fieldGenerateF7Routine299.checked;
      if (field.generateF7Routine299) {
        field.f7GeneratedRoutineAuto = !el.fieldGeneratedF7RoutineName.value.trim();
        field.f7GeneratedLabelAuto = !el.fieldGeneratedF7Label.value.trim();
        if (app.f7 && typeof app.f7.syncField === "function") {
          app.f7.syncField(field);
        }
      }

      loadFieldIntoModal(field);
      app.refresh();
    });

    el.fieldGeneratedF7RoutineName.addEventListener("input", () => {
      const field = getActiveField();
      if (!field) return;
      field.f7GeneratedRoutineAuto = false;
      saveModalIntoField();
      app.refresh();
    });

    el.fieldGeneratedF7Label.addEventListener("input", () => {
      const field = getActiveField();
      if (!field) return;
      field.f7GeneratedLabelAuto = false;
      saveModalIntoField();
      app.refresh();
    });

    el.fieldLookupDisplayMode.addEventListener("change", () => {
      saveModalIntoField();
      updateDisplayCodeVisibility();
      app.refresh();
    });

    el.fieldLookupPreset.addEventListener("change", () => {
      const field = getActiveField();
      if (!field) return;

      field.lookupPreset = el.fieldLookupPreset.value;
      app.refresh();
    });

    el.fieldLookupModal.addEventListener("click", (event) => {
      if (event.target === el.fieldLookupModal) close();
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !el.fieldLookupModal.classList.contains("hidden")
      ) {
        close();
      }
    });
  }

  app.fieldLookups = {
    presets: availablePresets,
    initialize,
    open,
    close,
    clear,
    applyPresetToField,
    presetOptions
  };
})(window.GeradorRotinasJsonPadrao);
