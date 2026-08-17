(function (app) {
  const { state, utils: u } = app;

  function suggestedRoutineName(config = app.getConfig()) {
    const base = u.normalizeVariable(config.routineName, "ROTINA100");

    if (/\d{3}$/.test(base)) {
      return base.replace(/\d{3}$/, "299");
    }

    return `${base}299`;
  }

  function suggestedLabel(field) {
    if (app.fields && typeof app.fields.multiSelectInputVariable === "function") {
      return u.normalizeVariable(app.fields.multiSelectInputVariable(field), "SELECAO");
    }

    return u.normalizeVariable(field?.variable, "SELECAO");
  }

  function isGeneratedMultiSelect(field) {
    return Boolean(
      field &&
      app.fields &&
      typeof app.fields.isMultiSelect === "function" &&
      app.fields.isMultiSelect(field) &&
      field.generateF7Routine299 === true
    );
  }

  function presetLayout(field) {
    const description = String(field?.description || "Seleção").trim();
    const keySize = Math.max(2, Number(field?.inputSize) || 7);

    const layouts = {
      empresa: {
        columnSizes: `${keySize},50,30`,
        pieces: "1,8",
        titles: `${description},Razão Social,Fantasia`,
        rows: 15
      },
      cliente: {
        columnSizes: `${keySize},50`,
        pieces: "2",
        titles: `${description},Nome`,
        rows: 15
      },
      tabelaPreco: {
        columnSizes: `${keySize},40`,
        pieces: "1",
        titles: `${description},Descrição`,
        rows: 15
      },
      moeda: {
        columnSizes: `${keySize},35`,
        pieces: "1",
        titles: `${description},Descrição`,
        rows: 15
      },
      condicaoVenda: {
        columnSizes: `${keySize},40`,
        pieces: "1",
        titles: `${description},Descrição`,
        rows: 15
      },
      tipoNotaMulti: {
        columnSizes: `${keySize},30`,
        pieces: "1",
        titles: `${description},Descrição`,
        rows: 15
      }
    };

    return layouts[field?.lookupPreset] || {
      columnSizes: `${keySize},40`,
      pieces: "1",
      titles: `${description},Descrição`,
      rows: 15
    };
  }


  function presetAllGlobal(field) {
    const references = {
      empresa: "^%EMP(@1)",
      cliente: "^FTCL(CODEMP,@1)",
      tabelaPreco: "^PVMTBP(CODEMP,@1)",
      tipoNotaMulti: "^%CSTN(@1)"
    };

    return references[field?.lookupPreset] || "";
  }

  function globalName(reference) {
    return String(reference || "").trim().split("(")[0].toUpperCase();
  }

  function syncField(field, config = app.getConfig()) {
    if (!isGeneratedMultiSelect(field)) return;

    if (field.f7GeneratedRoutineAuto !== false || !field.f7GeneratedRoutineName) {
      field.f7GeneratedRoutineName = suggestedRoutineName(config);
    }

    if (field.f7GeneratedLabelAuto !== false || !field.f7GeneratedLabel) {
      field.f7GeneratedLabel = suggestedLabel(field);
    }

    const defaults = presetLayout(field);
    const suggestedAllGlobal = presetAllGlobal(field);

    if (!String(field.f7AllGlobalReference || "").trim() && suggestedAllGlobal) {
      const configuredSelectedGlobal = String(field.multiSelectGlobalReference || "").trim();

      if (
        configuredSelectedGlobal &&
        globalName(configuredSelectedGlobal) === globalName(suggestedAllGlobal)
      ) {
        field.multiSelectGlobalReference = "";
      }

      field.f7AllGlobalReference = suggestedAllGlobal;
    }

    if (!String(field.f7GeneratedColumnSizes || "").trim()) {
      field.f7GeneratedColumnSizes = defaults.columnSizes;
    }

    if (!String(field.f7GeneratedPieces || "").trim()) {
      field.f7GeneratedPieces = defaults.pieces;
    }

    if (!String(field.f7GeneratedTitles || "").trim()) {
      field.f7GeneratedTitles = defaults.titles;
    }

    if (!(Number(field.f7GeneratedRows) > 0)) {
      field.f7GeneratedRows = defaults.rows;
    }

    const routineName = u.normalizeVariable(
      field.f7GeneratedRoutineName,
      suggestedRoutineName(config)
    );
    const label = u.normalizeVariable(
      field.f7GeneratedLabel,
      suggestedLabel(field)
    );

    field.f7GeneratedRoutineName = routineName;
    field.f7GeneratedLabel = label;
    field.f7Routine = `${label}^${routineName}`;
  }

  function syncFields(config = app.getConfig()) {
    state.fields.forEach((field) => syncField(field, config));
  }

  function balanceParentheses(reference) {
    let result = String(reference || "").trim().replace(/;+\s*$/, "");
    const opened = (result.match(/\(/g) || []).length;
    const closed = (result.match(/\)/g) || []).length;

    if (opened > closed) {
      result += ")".repeat(opened - closed);
    }

    return result;
  }

  function appendLookupKey(reference) {
    let clean = balanceParentheses(reference);
    if (!clean) return "";

    if (clean.includes("@1")) return clean;

    if (!clean.includes("(")) return `${clean}(@1)`;
    if (clean.endsWith("(")) return `${clean}@1)`;
    if (clean.endsWith(")")) return clean.replace(/\)$/, ",@1)");

    return `${clean},@1)`;
  }

  function removeLookupKey(reference) {
    const clean = balanceParentheses(reference);
    if (!clean) return "";

    if (/\(\s*@1\s*\)$/.test(clean)) {
      return clean.replace(/\(\s*@1\s*\)$/, "");
    }

    return clean.replace(/,\s*@1\s*\)$/, ")");
  }

  function replaceIdentifier(source, from, to) {
    const name = String(from || "").trim();
    if (!name || name === to) return source;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return String(source || "").replace(
      new RegExp(`(^|[^a-zA-Z0-9%])${escaped}(?=$|[^a-zA-Z0-9%])`, "g"),
      (match, prefix) => `${prefix}${to}`
    );
  }

  function toMacReference(reference, config) {
    let result = String(reference || "").trim();

    if (
      app.indexes &&
      typeof app.indexes.usesRoutineCompany === "function" &&
      app.indexes.usesRoutineCompany(config)
    ) {
      result = replaceIdentifier(result, "codEmpresa", "CE");
    }

    if (app.indexes && typeof app.indexes.keyDefinitions === "function") {
      app.indexes.keyDefinitions().forEach(({ field, parameterName }) => {
        result = replaceIdentifier(
          result,
          parameterName,
          u.normalizeVariable(field.variable)
        );
      });
    }

    if (app.fields && typeof app.fields.tabKeyDefinitions === "function") {
      app.fields.tabKeyDefinitions(config).forEach((definition) => {
        result = replaceIdentifier(
          result,
          definition.parameter,
          definition.variable
        );
      });
    }

    return result;
  }

  function companyMacVariable(config = app.getConfig()) {
    if (!app.indexes || typeof app.indexes.companyMacArgument !== "function") {
      return "CE";
    }

    return app.indexes.companyMacArgument(config);
  }

  function renderReferenceTokens(source, field, config) {
    let result = String(source || "").trim();
    const replacements = {
      "{baseGlobal}": toMacReference(app.indexes.globalReference(config), config),
      "{global}": toMacReference(app.indexes.globalReference(config), config),
      "{company}": companyMacVariable(config),
      "{reference}": app.fields.multiSelectInputVariable(field),
      "{fieldVariable}": app.fields.multiSelectInputVariable(field),
      "{multiTable}": app.fields.multiSelectTableVariable(field),
      "{routine}": config.routineName,
      "{rgRoutine}": config.rgRoutineName
    };

    Object.entries(replacements).forEach(([token, value]) => {
      result = result.split(token).join(value);
    });

    return result;
  }

  function renderAllGlobal(field, config) {
    const configured =
      field.f7AllGlobalReference ??
      field.f7SelectedGlobalReference ??
      "";

    return appendLookupKey(renderReferenceTokens(configured, field, config));
  }

  function renderPersistedSelectedGlobal(field, config) {
    if (!app.rg || typeof app.rg.multiSelectGlobalReference !== "function") {
      return "";
    }

    const reference = app.rg.multiSelectGlobalReference(config, field);
    return toMacReference(reference, config);
  }

  function compactName(value, maxLength = 24) {
    return u.normalizeVariable(value, "F7").slice(0, maxLength);
  }

  function shortHash(value) {
    let hash = 0;
    for (let position = 0; position < value.length; position += 1) {
      hash = (hash * 31 + value.charCodeAt(position)) >>> 0;
    }
    return hash.toString(36).toUpperCase().slice(-2).padStart(2, "0");
  }

  function mtempReferences(routineName, label) {
    // O Caché aceita no máximo 31 caracteres no nome da global. O maior sufixo
    // usado aqui é NAOSEL (6) e o prefixo é mtemp (5), então sobram 20 para a
    // base. Quando o nome precisa ser cortado, os dois últimos caracteres viram
    // um hash do nome completo para duas consultas diferentes não colidirem.
    const full = compactName(`${routineName}${label}`, 64);
    const base =
      full.length <= 20 ? full : `${full.slice(0, 18)}${shortHash(full)}`;

    return {
      selectedRoot: `^mtemp${base}SEL(%index)`,
      selectedItem: `^mtemp${base}SEL(%index,@1)`,
      notSelectedRoot: `^mtemp${base}NAOSEL(%index)`,
      notSelectedItem: `^mtemp${base}NAOSEL(%index,@1)`
    };
  }

  function appendSubscript(reference, subscript) {
    const clean = String(reference || "").trim();
    if (!clean) return "";

    if (clean.endsWith(")")) {
      return clean.replace(/\)$/, `,${subscript})`);
    }

    return `${clean}(${subscript})`;
  }

  function uniqueDefinitions(config = app.getConfig()) {
    syncFields(config);

    const grouped = new Map();
    const usedByRoutine = new Map();

    state.fields
      .filter(isGeneratedMultiSelect)
      .forEach((field) => {
        const routineName = u.normalizeVariable(
          field.f7GeneratedRoutineName,
          suggestedRoutineName(config)
        );
        const baseLabel = u.normalizeVariable(
          field.f7GeneratedLabel,
          suggestedLabel(field)
        );
        const used = usedByRoutine.get(routineName) || new Set();
        let label = baseLabel;
        let suffix = 2;

        while (used.has(label)) {
          label = `${baseLabel}${suffix}`;
          suffix += 1;
        }

        used.add(label);
        usedByRoutine.set(routineName, used);

        if (label !== field.f7GeneratedLabel) {
          field.f7GeneratedLabel = label;
          field.f7GeneratedLabelAuto = false;
          field.f7Routine = `${label}^${routineName}`;
        }

        const defaults = presetLayout(field);
        const definitions = grouped.get(routineName) || [];
        definitions.push({
          field,
          routineName,
          label,
          returnLabel: `${label}PE1`,
          codeVariable: compactName(
            `COD${app.fields.multiSelectInputVariable(field)}`,
            20
          ),
          allGlobal: renderAllGlobal(field, config),
          selectedPersistedGlobal: renderPersistedSelectedGlobal(field, config),
          columnSizes: String(field.f7GeneratedColumnSizes || defaults.columnSizes).trim(),
          pieces: String(field.f7GeneratedPieces || defaults.pieces).trim(),
          titles: String(field.f7GeneratedTitles || defaults.titles).trim(),
          rows: Number(field.f7GeneratedRows) > 0 ? Number(field.f7GeneratedRows) : defaults.rows,
          mtemp: mtempReferences(routineName, label)
        });
        grouped.set(routineName, definitions);
      });

    return grouped;
  }

  function csutipeCall(definition) {
    const allGlobal = definition.allGlobal || "^GLOBAL_TODOS(@1)";
    const parameters = [
      `"${u.escapeMac(definition.columnSizes)}"`,
      `"${u.escapeMac(definition.pieces)}"`,
      `"${u.escapeMac(definition.titles)}"`,
      String(definition.rows),
      `"${u.escapeMac(allGlobal)}"`,
      '"%codret"',
      '"%dadret"',
      "",
      "",
      "",
      `"${definition.returnLabel}^${definition.routineName}"`,
      "",
      "",
      "TIPF7",
      `"${u.escapeMac(definition.mtemp.notSelectedItem)}"`,
      `"${u.escapeMac(definition.mtemp.selectedItem)}"`
    ];

    return `do ^%CSUTIPE(${parameters.join(",")})`;
  }

  function appendDefinition(lines, definition) {
    const allRoot = removeLookupKey(definition.allGlobal);
    const selectedRoot = definition.selectedPersistedGlobal;
    const { selectedRoot: mtempSel, notSelectedRoot: mtempNaoSel } = definition.mtemp;
    const selectedByCode = appendSubscript(mtempSel, definition.codeVariable);
    const notSelectedByCode = appendSubscript(mtempNaoSel, definition.codeVariable);

    lines.push(`\t; ${definition.field.description || "Seleção"}`);
    lines.push("\t;");
    lines.push(`${definition.label}\t;`);
    lines.push(`\tdo NewF7^%CSW1UTI("sc,TIPF7,${definition.codeVariable}")`);
    lines.push(`\tnew sc,TIPF7,${definition.codeVariable}`);
    lines.push("\t;");
    lines.push("\tset TIPF7=3");
    lines.push("\t;");
    lines.push(`\tkill ${mtempNaoSel}`);
    lines.push(`\tkill ${mtempSel}`);
    lines.push("\t;");

    if (selectedRoot) {
      lines.push(`\tmerge ${mtempSel}=${selectedRoot}`);
    } else {
      lines.push("\t; TODO: Configure a Global da tabela da multi-seleção para carregar os selecionados.");
    }

    if (allRoot) {
      lines.push(`\tmerge ${mtempNaoSel}=${allRoot}`);
    } else {
      lines.push("\t; TODO: Informe no gerador a Global com todos os registros.");
    }

    lines.push("\t;");
    lines.push(`\tif $data(${mtempSel}) set TIPF7=4`);
    lines.push("\t;");
    lines.push(`\tset ${definition.codeVariable}=""`);
    lines.push(`\tfor  set ${definition.codeVariable}=$order(${selectedByCode}) quit:${definition.codeVariable}=""  do`);
    lines.push(`\t. kill ${notSelectedByCode}`);
    lines.push("\t;");
    lines.push(`\t${csutipeCall(definition)}`);
    lines.push("\tquit:$$CSP^%CSW1UTI()");
    lines.push("\t;");
    lines.push(`${definition.returnLabel}\t;`);
    lines.push(`\tkill ${mtempNaoSel}`);
    lines.push(`\tkill ${mtempSel}`);
    lines.push("\t;");
    lines.push("\tdo SetF7^%CSW1UTI($get(%codret))");
    lines.push("\tquit");
    lines.push("\t;");
  }

  function generateRoutine(routineName, definitions) {
    const lines = [];
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();

    lines.push(`ROUTINE ${routineName}`);
    lines.push(`${routineName}\t; ${month}/${year} - CONSULTAS F7`);
    lines.push("\t;");
    lines.push("\t#include %CSUTICSP");
    lines.push("\t;");

    definitions.forEach((definition) => appendDefinition(lines, definition));

    lines.push("\t; csw:csp:rotina299");
    return lines.join("\n");
  }

  function generateAll(config = app.getConfig()) {
    const result = {};

    uniqueDefinitions(config).forEach((definitions, routineName) => {
      result[`f7-${routineName}`] = {
        label: "Consultas F7 — rotina 299",
        routineName,
        code: generateRoutine(routineName, definitions)
      };
    });

    return result;
  }

  app.f7 = {
    suggestedRoutineName,
    suggestedLabel,
    isGeneratedMultiSelect,
    presetLayout,
    presetAllGlobal,
    syncField,
    syncFields,
    renderAllGlobal,
    renderPersistedSelectedGlobal,
    generateAll
  };
})(window.GeradorRotinasJsonPadrao);
