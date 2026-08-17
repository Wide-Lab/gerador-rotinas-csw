(function (app) {
  const { state, utils: u, el } = app;
  let activeColumnId = "";

  const staticPresets = {
    none: {
      label: "Sem regra de obtenção / F7",
      group: "Geral",
      initializerCode: "",
      obtainCode: "",
      displayExpression: "",
      f7Routine: "",
      extraVariables: "",
      ruleVariables: "",
      valcpCode: ""
    },

    empresa: {
      label: "Empresa",
      group: "Padrões completos — F7 + display",
      initializerCode: "",
      obtainCode: [
        "set sc=$$VerEmpresa^CCAPLRG001({value},.EMP)",
        "if $$$ISERR(sc) quit sc"
      ].join("\n"),
      displayExpression: "$piece(EMP,Z,1)",
      f7Routine: "%EMP^CCAFC299",
      extraVariables: "EMP",
      ruleVariables: "EMP",
      valcpCode: [
        "set sc=$$VerEmpresa^CCAPLRG001({reference},.EMP)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "do TbSet^%CSW1UTI({gridLine},{gridColumn},$piece(EMP,Z,1),,,,,{gridCode})"
      ].join("\n")
    },

    cliente: {
      label: "Cliente",
      group: "Padrões completos — F7 + display",
      initializerCode: "",
      obtainCode: [
        "set sc=$$ObterNomeCliente^CCFT760RG(codEmpresa,{value},.FTCL)",
        "if $$$ISERR(sc) quit sc"
      ].join("\n"),
      displayExpression: "$piece(FTCL,Z,2)",
      f7Routine: "FTCL^CCCT299",
      extraVariables: "FTCL",
      ruleVariables: "FTCL",
      valcpCode: [
        "set sc=$$ObterNomeCliente^CCFT760RG({company},{reference},.FTCL)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "do TbSet^%CSW1UTI({gridLine},{gridColumn},$piece(FTCL,Z,2),,,,,{gridCode})"
      ].join("\n")
    },

    tabelaPreco: {
      label: "Tabela de preço",
      group: "Padrões completos — F7 + display",
      initializerCode: "",
      obtainCode: [
        "set sc=$$VerTabelaPrecoMalharia^CCPVRG001(codEmpresa,{value},,,.PVMTBP)",
        "if $$$ISERR(sc) quit sc"
      ].join("\n"),
      displayExpression: "$piece(PVMTBP,Z,1)",
      f7Routine: "PVMTBP^CCPVM299",
      extraVariables: "PVMTBP",
      ruleVariables: "PVMTBP",
      valcpCode: [
        "set sc=$$VerTabelaPrecoMalharia^CCPVRG001({company},{reference},,,.PVMTBP)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "do TbSet^%CSW1UTI({gridLine},{gridColumn},$piece(PVMTBP,Z,1),,,,,{gridCode})"
      ].join("\n")
    },

    moeda: {
      label: "Código da moeda",
      group: "Padrões completos — F7 + display",
      initializerCode: "",
      obtainCode: [
        "set sc=$$VerCadUnidade^CCAPLRG001({value},.CSUM)",
        "if $$$ISERR(sc) quit sc",
        ";",
        "set DESMOE=$piece(CSUM,Z,1)"
      ].join("\n"),
      displayExpression: "DESMOE",
      f7Routine: ",UNIMON^CCAPL299",
      extraVariables: "CSUM,DESMOE",
      ruleVariables: "CSUM,DESMOE",
      valcpCode: [
        "set sc=$$VerCadUnidade^CCAPLRG001({reference},.CSUM)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "set DESMOE=$piece(CSUM,Z,1)",
        ";",
        "do TbSet^%CSW1UTI({gridLine},{gridColumn},DESMOE,,,,,{gridCode})"
      ].join("\n")
    },

    condicaoVenda: {
      label: "Condição de venda",
      group: "Padrões completos — F7 + display",
      initializerCode: "",
      obtainCode: [
        "set sc=$$VerCondicaoVenda^CCFTRG001(codEmpresa,{value},.CSCV)",
        "if sc'=1 quit sc",
        ";",
        "set DESCVEN=$piece(CSCV,Z,1)"
      ].join("\n"),
      displayExpression: "DESCVEN",
      f7Routine: "%CSCV^CCPV299",
      extraVariables: "CSCV,DESCVEN",
      ruleVariables: "CSCV,DESCVEN",
      valcpCode: [
        "set sc=$$ValidarCampoCondicaoVenda^{rgRoutine}({company},{reference},.DESCVEN)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "set sc=$$VerCondicaoVenda^CCFTRG001({company},{reference},.CSCV)",
        "if sc'=1 do ME^%CSUTICSP(sc) quit 0",
        ";",
        "if $piece(CSCV,Z,16)=0 do ME^%CSUTIUD(\"Condição de venda inativa!\") quit 0",
        ";",
        "do TbSet^%CSW1UTI({gridLine},{gridColumn},DESCVEN,,,,,{gridCode})"
      ].join("\n")
    },

    tipoNota: {
      label: "Tipo de Nota — CSTN^CCFT299A",
      group: "Padrões completos — F7 + display",
      initializerCode: "",
      obtainCode: [
        "set sc=$$VerTipoNota^CCFTRG001({value},.CSTN)",
        "if $$$ISERR(sc) quit sc",
        ";",
        "set DESCTIPNOT=$piece(CSTN,Z,1)"
      ].join("\n"),
      displayExpression: "DESCTIPNOT",
      f7Routine: "CSTN^CCFT299A",
      extraVariables: "CSTN,DESCTIPNOT",
      ruleVariables: "CSTN,DESCTIPNOT",
      valcpCode: [
        "set sc=$$VerTipoNota^CCFTRG001({reference},.CSTN)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "set DESCTIPNOT=$piece(CSTN,Z,1)",
        ";",
        "do TbSet^%CSW1UTI({gridLine},{gridColumn},DESCTIPNOT,,,,,{gridCode})"
      ].join("\n")
    },

    representante: {
      label: "Representante — FTRE^CCPV299",
      group: "Padrões completos — F7 + display",
      initializerCode: "",
      obtainCode: [
        "set sc=$$VerRepresentante^CCFTRG001(codEmpresa,{value},.FTRE)",
        "if $$$ISERR(sc) quit sc",
        ";",
        "set DESCREP=$piece(FTRE,Z,1)"
      ].join("\n"),
      displayExpression: "DESCREP",
      f7Routine: "FTRE^CCPV299",
      extraVariables: "FTRE,DESCREP",
      ruleVariables: "FTRE,DESCREP",
      valcpCode: [
        "set sc=$$VerRepresentante^CCFTRG001({company},{reference},.FTRE)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "set DESCREP=$piece(FTRE,Z,1)",
        ";",
        "do TbSet^%CSW1UTI({gridLine},{gridColumn},DESCREP,,,,,{gridCode})"
      ].join("\n")
    },

    transportadora: {
      label: "Transportadora — %CSTR^CCPV299",
      group: "Padrões completos — F7 + display",
      initializerCode: "",
      obtainCode: [
        "set sc=$$VerTransportadora^CCAPLRG001({value},.CSTR)",
        "if $$$ISERR(sc) quit sc",
        ";",
        "set DESTRANS=$piece(CSTR,Z,1)"
      ].join("\n"),
      displayExpression: "DESTRANS",
      f7Routine: "%CSTR^CCPV299",
      extraVariables: "CSTR,DESTRANS",
      ruleVariables: "CSTR,DESTRANS",
      valcpCode: [
        "set sc=$$VerTransportadora^CCAPLRG001({reference},.CSTR)",
        "if $$$ISERR(sc) do ME^%CSUTICSP(sc) quit 0",
        ";",
        "set DESTRANS=$piece(CSTR,Z,1)",
        ";",
        "do TbSet^%CSW1UTI({gridLine},{gridColumn},DESTRANS,,,,,{gridCode})"
      ].join("\n")
    },

    custom: {
      label: "Personalizado",
      group: "Geral",
      initializerCode: "",
      obtainCode: "",
      displayExpression: "",
      f7Routine: "",
      extraVariables: "",
      ruleVariables: "",
      valcpCode: ""
    }
  };

  function dynamicTablePresets() {
    if (!app.grid || typeof app.grid.tableSuggestions !== "function") {
      return {};
    }

    return app.grid.tableSuggestions(app.getConfig()).reduce((result, item) => {
      result[`table:${item.id}`] = {
        label: `Tabela disponível — ${item.table}`,
        initializerCode: item.initializerCode || "",
        obtainCode: "",
        displayExpression: `$get(${item.table}({value}))`,
        f7Routine: "",
        extraVariables: item.table,
        ruleVariables: "",
        valcpCode: "",
        dynamicTable: true
      };
      return result;
    }, {});
  }

  function catalogPresets() {
    const catalog = Array.isArray(window.GeradorRotinasJsonPadraoF7Catalog)
      ? window.GeradorRotinasJsonPadraoF7Catalog
      : [];

    return catalog.reduce((result, item) => {
      result[item.key] = {
        label: item.label,
        group: item.group || "Consultas F7",
        initializerCode: "",
        obtainCode: "",
        displayExpression: "",
        f7Routine: item.f7Routine || "",
        extraVariables: "",
        ruleVariables: "",
        valcpCode: "",
        catalogOnly: true
      };
      return result;
    }, {});
  }

  function presets() {
    return {
      ...staticPresets,
      ...catalogPresets(),
      ...dynamicTablePresets()
    };
  }

  function presetOptions(selected = "none") {
    const groups = new Map();

    Object.entries(presets()).forEach(([key, preset]) => {
      const group = preset.group || (preset.dynamicTable ? "Tabelas disponíveis" : "Outros");
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

  function getActiveColumn() {
    return state.gridColumns.find((column) => column.id === activeColumnId);
  }

  function applyPresetToColumn(column, presetKey) {
    const availablePresets = presets();
    if (!column || !availablePresets[presetKey]) return;

    const preset = availablePresets[presetKey];
    column.lookupPreset = presetKey;
    column.initializerCode = preset.initializerCode || "";
    column.obtainCode = preset.obtainCode || "";
    column.displayExpression = preset.displayExpression || "";
    column.f7Routine = preset.f7Routine || "";
    column.extraVariables = preset.extraVariables || "";
    column.ruleVariables = preset.ruleVariables || "";
    column.valcpCode = preset.valcpCode || "";
  }

  function updateMaintenanceFields(column) {
    const editable = column && column.editable === true;
    const combo = column && column.maintenanceType === "combo";
    const allowF7 = editable && !combo;

    el.gridLookupRoutine.disabled = !allowF7;
    el.gridLookupValcp.disabled = !editable;

    if (el.gridLookupMaintenanceNote) {
      el.gridLookupMaintenanceNote.textContent = editable
        ? combo
          ? "A coluna é editável como ComboBox. A regra de obtenção e a expressão de display continuam disponíveis; o F7 não é usado no ComboBox."
          : "A coluna é editável. O F7 e o Valcp abaixo serão usados na manutenção em linha da label 4000."
        : "A coluna não é editável. A regra de obtenção e o display serão usados ao montar o Grid; F7 e Valcp não são necessários."
    }
  }

  function loadColumnIntoModal(column) {
    el.gridLookupModalTitle.textContent =
      `Regra de obtenção e display — ${column.title}`;

    el.gridLookupPreset.innerHTML = presetOptions(column.lookupPreset || "none");
    el.gridLookupInitializer.value = column.initializerCode || "";
    el.gridLookupObtain.value = column.obtainCode || "";
    el.gridLookupDisplayExpression.value = column.displayExpression || "";
    el.gridLookupRoutine.value = column.f7Routine || "";
    el.gridLookupVariables.value = column.extraVariables || "";
    el.gridLookupRuleVariables.value = column.ruleVariables || "";
    el.gridLookupValcp.value = column.valcpCode || "";

    updateMaintenanceFields(column);
  }

  function saveModalIntoColumn() {
    const column = getActiveColumn();
    if (!column) return;

    column.lookupPreset = el.gridLookupPreset.value || "custom";
    column.initializerCode = el.gridLookupInitializer.value
      .replace(/\r\n/g, "\n")
      .trim();
    column.obtainCode = el.gridLookupObtain.value
      .replace(/\r\n/g, "\n")
      .trim();
    column.displayExpression = el.gridLookupDisplayExpression.value.trim();
    column.f7Routine = el.gridLookupRoutine.value.trim();
    column.extraVariables = el.gridLookupVariables.value.trim();
    column.ruleVariables = el.gridLookupRuleVariables.value.trim();
    column.valcpCode = el.gridLookupValcp.value
      .replace(/\r\n/g, "\n")
      .trim();
  }

  function open(position) {
    const column = state.gridColumns[position];
    if (!column) return;

    activeColumnId = column.id;
    loadColumnIntoModal(column);
    el.gridLookupModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function close() {
    saveModalIntoColumn();
    activeColumnId = "";
    el.gridLookupModal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    app.grid.render();
    app.refresh();
  }

  function applySelectedPreset() {
    const column = getActiveColumn();
    if (!column) return;

    applyPresetToColumn(column, el.gridLookupPreset.value);
    loadColumnIntoModal(column);
    app.grid.render();
    app.refresh();
  }

  function clear() {
    const column = getActiveColumn();
    if (!column) return;

    applyPresetToColumn(column, "none");
    loadColumnIntoModal(column);
    app.grid.render();
    app.refresh();
  }

  function initialize() {
    el.applyGridLookupPresetButton.addEventListener("click", applySelectedPreset);
    el.clearGridLookupButton.addEventListener("click", clear);
    el.closeGridLookupModalButton.addEventListener("click", close);
    el.finishGridLookupButton.addEventListener("click", close);

    [
      el.gridLookupInitializer,
      el.gridLookupObtain,
      el.gridLookupDisplayExpression,
      el.gridLookupRoutine,
      el.gridLookupVariables,
      el.gridLookupRuleVariables,
      el.gridLookupValcp
    ].forEach((input) => {
      input.addEventListener("input", () => {
        saveModalIntoColumn();
        app.refresh();
      });
    });

    el.gridLookupPreset.addEventListener("change", () => {
      const column = getActiveColumn();
      if (!column) return;

      column.lookupPreset = el.gridLookupPreset.value;
      app.refresh();
    });

    el.gridLookupModal.addEventListener("click", (event) => {
      if (event.target === el.gridLookupModal) close();
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !el.gridLookupModal.classList.contains("hidden")
      ) {
        close();
      }
    });
  }

  app.gridLookups = {
    presets,
    initialize,
    open,
    close,
    clear,
    applyPresetToColumn,
    presetOptions
  };
})(window.GeradorRotinasJsonPadrao);
