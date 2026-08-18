(function (app) {
  const u = app.utils;

  function unique(values) {
    return [...new Set(values)];
  }

  function dataStructures(config) {
    const structures = [];
    const baseVariable = u.normalizeVariable(
      config.dataVariable,
      "DADOS"
    );

    structures.push({
      variable: baseVariable,
      parameter: u.toParameter(baseVariable),
      subscript: "",
      tabIds: []
    });

    if (config.useTabs) {
      app.state.tabs.forEach((tab, index) => {
        if (tab.contentType === "grid") return;

        const variable = u.normalizeVariable(
          tab.dataVariable,
          baseVariable
        );

        const subscript = String(
          tab.globalSubscript || index + 1
        ).trim();

        let structure = structures.find(
          (item) => item.variable === variable
        );

        if (!structure) {
          structure = {
            variable,
            parameter: u.toParameter(variable),
            subscript,
            tabIds: []
          };

          structures.push(structure);
        } else if (!structure.subscript && subscript) {
          structure.subscript = subscript;
        }

        if (!structure.tabIds.includes(tab.id)) {
          structure.tabIds.push(tab.id);
        }
      });
    }

    const tabKeyDefinitions =
      app.fields.tabKeyDefinitions(config);

    structures.forEach((structure) => {
      structure.keyDefinitions = tabKeyDefinitions.filter(
        (definition) =>
          structure.tabIds.includes(
            definition.field.tabId
          )
      );

      structure.methodSuffix = u.toPascal(
        structure.variable
      );
    });

    const scalarVariables = new Set(
      app.fields.mainFields()
        .filter((field) =>
          !app.fields.isKeyField(field) &&
          !app.fields.isMultiSelect(field) &&
          !app.fields.isGridTabField(field)
        )
        .map((field) => app.fields.dataVariableFor(field, config))
    );

    return structures.filter((structure) =>
      scalarVariables.has(structure.variable)
    );
  }

  function appendSubscript(
    globalReference,
    subscript
  ) {
    if (!subscript) {
      return globalReference;
    }

    if (globalReference.includes("(")) {
      return globalReference.replace(
        /\)$/,
        `,${subscript})`
      );
    }

    return `${globalReference}(${subscript})`;
  }

  function structureGlobalReference(
    config,
    structure
  ) {
    let reference =
      app.indexes.globalReference(config);

    reference = appendSubscript(
      reference,
      structure.subscript
    );

    structure.keyDefinitions.forEach(
      (definition) => {
        reference = appendSubscript(
          reference,
          definition.parameter
        );
      }
    );

    return reference;
  }

  function renderMultiSelectReference(config, field, source) {
    const baseGlobal = app.indexes.globalReference(config);
    const replacements = {
      "{baseGlobal}": baseGlobal,
      "{global}": baseGlobal,
      "{company}": app.indexes.companyParameter(config),
      "{reference}": u.toParameter(field.description || field.variable),
      "{fieldVariable}": app.fields.isMultiSelect(field)
        ? app.fields.multiSelectInputVariable(field)
        : u.normalizeVariable(field.variable),
      "{rgRoutine}": config.rgRoutineName,
      "{routine}": config.routineName
    };

    let result = String(source || "").trim();
    Object.entries(replacements).forEach(([token, value]) => {
      result = result.split(token).join(value);
    });

    return result;
  }

  function multiSelectGlobalReference(config, field) {
    const custom = renderMultiSelectReference(
      config,
      field,
      field.multiSelectGlobalReference
    );

    if (custom) return custom;

    let reference = app.indexes.globalReference(config);

    if (config.useTabs && field.tabId && field.tabId !== "parent") {
      const tabIndex = app.state.tabs.findIndex((tab) => tab.id === field.tabId);
      const tab = app.state.tabs[tabIndex];

      if (tab) {
        const subscript = String(tab.globalSubscript || tabIndex + 1).trim();
        reference = appendSubscript(reference, subscript);

        app.fields
          .tabKeyDefinitions(config)
          .filter((definition) => definition.field.tabId === field.tabId)
          .forEach((definition) => {
            reference = appendSubscript(reference, definition.parameter);
          });
      }
    }

    return reference;
  }

  function multiSelectDefinitions(config) {
    return app.fields.multiSelectFields(config)
      .filter((field) => !app.fields.isGridTabField(field))
      .map((field) => {
      const tableVariable = app.fields.multiSelectTableVariable(field);

      return {
        field,
        tableVariable,
        parameter: u.toParameter(tableVariable),
        globalReference: multiSelectGlobalReference(config, field)
      };
    });
  }

  function multiSelectParameters(config) {
    return multiSelectDefinitions(config).map((definition) => definition.parameter);
  }

  function formatSubscript(value) {
    const clean = String(
      value ?? ""
    ).trim();

    if (
      /^-?(?:\d+|\d+\.\d+)$/
        .test(clean)
    ) {
      return clean;
    }

    return `"${u.escapeMac(clean)}"`;
  }

  function appendGenerateTabs(
    lines,
    config
  ) {
    if (!config.useTabs) {
      return;
    }

    lines.push("\t; Criar Abas");
    lines.push("\t;");
    lines.push(
      "GerarAbas(codEmpresa)\t;"
    );
    lines.push("\t$$$VAR");
    lines.push("\tnew sheet");
    lines.push("\t;");

    app.state.tabs.forEach(
      (tab, index) => {
        const routineName =
          u.normalizeVariable(
            tab.routineName,
            `${config.routineName}TAB${index + 1}`
          );

        lines.push(
          `\tset sheet(${index + 1})="${routineName}^${u.escapeMac(
            tab.title
          )}^${tab.disabled === true ? 1 : 0}"`
        );
      }
    );

    lines.push("\t;");
    lines.push(
      `\tdo criarTabPanel^%CSW1A("${config.sheetId}",${config.tabPanelLine},${config.tabPanelColumn},${config.tabPanelHeight},${config.tabPanelWidth},.sheet)`
    );
    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
  }

  function appendGeneratedTables(lines) {
    app.fields
      .generatedOptionTables()
      .forEach((field) => {
        const suffix = u.toPascal(
          field.description ||
          field.variable
        );

        const parameter =
          u.toParameter(
            `tab ${
              field.description ||
              field.variable
            }`
          );

        const items =
          Array.isArray(
            field.optionsItems
          )
            ? field.optionsItems
            : [];

        lines.push(
          `\t; Obter Tabela ${u.sanitize(
            field.description ||
            field.variable
          )}`
        );

        lines.push(
          `ObterTab${suffix}(${parameter})\t;`
        );

        lines.push("\t;");
        lines.push(
          `\tkill ${parameter}`
        );
        lines.push("\t;");

        items.forEach((item) => {
          lines.push(
            `\tset ${parameter}(${formatSubscript(
              item.value
            )})="${u.escapeMac(
              item.description
            )}"`
          );
        });

        lines.push("\t;");
        lines.push("\tquit $$$OK");
        lines.push("\t;");
      });
  }

  function dataParameters(config) {
    return dataStructures(config)
      .map((structure) => {
        return structure.parameter;
      });
  }

  function initializeParameters(config) {
    return unique([
      ...app.indexes.rgParameters(),
      ...dataParameters(config),
      ...multiSelectParameters(config)
    ]);
  }

  function saveParameters(config) {
    return unique([
      ...app.indexes.rgParameters(),
      ...app.fields.tabKeyRgParameters(config),
      ...dataParameters(config),
      ...multiSelectParameters(config)
    ]);
  }

  function saveValidationArguments(config) {
    const tableParameters = new Set(multiSelectParameters(config));

    return saveParameters(config).map((parameter) =>
      tableParameters.has(parameter) ? `.${parameter}` : parameter
    );
  }

  function appendInitialize(
    lines,
    config
  ) {
    if (!config.generateObtain) {
      return;
    }

    const parameters =
      initializeParameters(config);

    lines.push(
      `\t; Inicializar ${config.title}`
    );

    lines.push(
      `Inicializar${config.entityName}(${parameters.join(",")})\t;`
    );

    lines.push("\t$$$VAR");
    lines.push("\tnew sc");
    lines.push("\t;");

    dataStructures(config)
      .forEach((structure) => {
        lines.push(
          `\tset ${structure.parameter}=""`
        );
      });

    multiSelectDefinitions(config).forEach((definition) => {
      lines.push(`\tkill ${definition.parameter}`);
    });

    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
  }

  function appendObtain(
    lines,
    config
  ) {
    if (!config.generateObtain) {
      return;
    }

    const structures =
      dataStructures(config);

    const parameters =
      initializeParameters(config);

    const unkeyedStructures =
      structures.filter(
        (structure) =>
          !structure.keyDefinitions.length
      );

    lines.push(
      `\t; Obter ${config.title}`
    );

    lines.push(
      `Obter${config.entityName}(${parameters.join(",")})\t;`
    );

    lines.push("\t$$$VAR");
    lines.push("\tnew sc");
    lines.push("\t;");

    structures.forEach((structure) => {
      lines.push(
        `\tset ${structure.parameter}=""`
      );
    });

    multiSelectDefinitions(config).forEach((definition) => {
      lines.push(`\tkill ${definition.parameter}`);
    });

    if (unkeyedStructures.length) {
      const baseGlobal =
        structureGlobalReference(
          config,
          unkeyedStructures[0]
        );

      lines.push("\t;");
      lines.push(
        `\tif '$data(${baseGlobal}) quit $$$ERROR(10000,"${u.escapeMac(
          config.title
        )} não cadastrado!")`
      );
    }

    lines.push("\t;");

    unkeyedStructures.forEach(
      (structure) => {
        lines.push(
          `\tset ${structure.parameter}=$get(${structureGlobalReference(
            config,
            structure
          )})`
        );
      }
    );

    multiSelectDefinitions(config).forEach((definition) => {
      lines.push(
        `\tmerge ${definition.parameter}=${definition.globalReference}`
      );
    });

    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
  }

  function appendStructureObtainMethods(
    lines,
    config
  ) {
    if (!config.generateObtain) {
      return;
    }

    dataStructures(config)
      .filter(
        (structure) =>
          structure.keyDefinitions.length
      )
      .forEach((structure) => {
        const parameters = unique([
          ...app.indexes.rgParameters(),
          ...structure.keyDefinitions.map(
            (definition) =>
              definition.parameter
          ),
          structure.parameter
        ]);

        const globalReference =
          structureGlobalReference(
            config,
            structure
          );

        lines.push(
          `\t; Obter ${config.title} - ${structure.variable}`
        );

        lines.push(
          `Obter${config.entityName}${structure.methodSuffix}(${parameters.join(",")})\t;`
        );

        lines.push("\t$$$VAR");
        lines.push("\tnew sc");
        lines.push("\t;");
        lines.push(
          `\tset ${structure.parameter}=""`
        );
        lines.push("\t;");

        lines.push(
          `\tif '$data(${globalReference}) quit $$$OK`
        );

        lines.push("\t;");
        lines.push(
          `\tset ${structure.parameter}=$get(${globalReference})`
        );

        lines.push("\t;");
        lines.push("\tquit $$$OK");
        lines.push("\t;");
      });
  }

  function appendLock(
    lines,
    config
  ) {
    if (!config.generateLock) {
      return;
    }

    const parameters =
      app.indexes.rgParameters();

    const global =
      app.indexes.globalReference(config);

    lines.push(
      `\t; UnLock ${config.title}`
    );

    lines.push(
      `UnLock${config.entityName}(${parameters.join(",")})\t;`
    );

    lines.push("\t$$$VAR");
    lines.push("\tnew sc");
    lines.push("\t;");
    lines.push(
      `\tdo $$$DoLock("-","${global}")`
    );
    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");

    lines.push(
      `\t; Lock ${config.title}`
    );

    lines.push(
      `Lock${config.entityName}(${parameters.join(",")})\t;`
    );

    lines.push("\t$$$VAR");
    lines.push("\tnew sc");
    lines.push("\t;");
    lines.push(
      `\tif $$$IfLock("+","${global}")`
    );

    lines.push(
      `\telse  quit $$$ERROR(10000,$$$MsgLock("${u.escapeMac(
        config.title
      )} ","o",$name(${global})))`
    );

    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
  }

  function appendBtnManter(
    lines,
    config
  ) {
    if (
      !config.useBtnManter ||
      !config.generateObtain ||
      config.useTabs
    ) {
      return;
    }

    const parameters =
      app.indexes.rgParameters();

    lines.push(
      "\t; Inicializar Botão BtnManter [1-btSalvar 2-btExcluir]"
    );

    lines.push(
      `InicializarBtnManter(${parameters.join(",")})\t;`
    );

    lines.push("\t$$$VAR");
    lines.push(
      "\tnew sc,flgOpcao"
    );
    lines.push("\t;");
    lines.push(
      "\tset flgOpcao=1"
    );
    lines.push("\t;");

    lines.push(
      `\tset sc=$$Obter${config.entityName}^${config.rgRoutineName}(${parameters.join(",")})`
    );

    lines.push(
      "\tif $$$ISOK(sc) set flgOpcao=2"
    );

    lines.push("\t;");
    lines.push(
      "\tquit flgOpcao"
    );
    lines.push("\t;");
  }

  function appendSave(
    lines,
    config
  ) {
    if (!config.generateSave) {
      return;
    }

    const structures =
      dataStructures(config);

    const parameters =
      saveParameters(config);

    const company =
      app.indexes
        .companyParameter(config);

    lines.push(
      `\t; Gravar ${config.title}`
    );

    lines.push(
      `Gravar${config.entityName}(${parameters.join(",")})\t;`
    );

    lines.push("\t$$$VAR");
    lines.push(
      "\tnew sc,dataHora,codOperador"
    );
    lines.push("\t;");

    lines.push(
      `\tset sc=$$ValidarGravar${config.entityName}(${saveValidationArguments(config).join(",")})`
    );

    lines.push(
      "\tif $$$ISERR(sc) quit sc"
    );
    lines.push("\t;");

    lines.push(
      `\tset dataHora=$$$horologEmp(${company})`
    );

    lines.push(
      "\tset codOperador=$$VEROP^%CSUTIUD(1)"
    );

    lines.push("\t;");

    structures.forEach((structure) => {
      const keyCondition =
        structure.keyDefinitions
          .map(
            (definition) =>
              `(${definition.parameter}'="")`
          )
          .join("&");

      if (keyCondition) {
        lines.push(
          `\tif ${keyCondition} do`
        );

        lines.push(
          `\t. set $piece(${structure.parameter},Z,1)=dataHora`
        );

        lines.push(
          `\t. set $piece(${structure.parameter},Z,2)=codOperador`
        );

        lines.push(
          `\t. do $$$SetG(${structureGlobalReference(
            config,
            structure
          )},${structure.parameter})`
        );

        lines.push("\t;");
        return;
      }

      lines.push(
        `\tset $piece(${structure.parameter},Z,1)=dataHora`
      );

      lines.push(
        `\tset $piece(${structure.parameter},Z,2)=codOperador`
      );

      lines.push("\t;");

      lines.push(
        `\tdo $$$SetG(${structureGlobalReference(
          config,
          structure
        )},${structure.parameter})`
      );

      lines.push("\t;");
    });

    multiSelectDefinitions(config).forEach((definition) => {
      lines.push(
        `\tdo $$$KillMergeG(${definition.globalReference},${definition.parameter})`
      );
      lines.push("\t;");
    });

    lines.push("\tquit $$$OK");
    lines.push("\t;");

    lines.push(
      `\t; Validar Gravar ${config.title}`
    );

    lines.push(
      `ValidarGravar${config.entityName}(${parameters.join(",")})\t;`
    );

    lines.push("\t$$$VAR");
    lines.push("\tnew sc");
    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
  }

  function appendDelete(
    lines,
    config
  ) {
    if (!config.generateDelete) {
      return;
    }

    const parameters =
      app.indexes.rgParameters();

    const global =
      app.indexes.globalReference(config);

    lines.push(
      `\t; Excluir ${config.title}`
    );

    lines.push(
      `Excluir${config.entityName}(${parameters.join(",")})\t;`
    );

    lines.push("\t$$$VAR");
    lines.push("\tnew sc");
    lines.push("\t;");

    lines.push(
      `\tset sc=$$ValidarExcluir${config.entityName}(${parameters.join(",")})`
    );

    lines.push(
      "\tif $$$ISERR(sc) quit sc"
    );
    lines.push("\t;");

    lines.push(
      `\tdo $$$KillG(${global})`
    );

    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");

    lines.push(
      `\t; Validar Excluir ${config.title}`
    );

    lines.push(
      `ValidarExcluir${config.entityName}(${parameters.join(",")})\t;`
    );

    lines.push("\t$$$VAR");
    lines.push("\tnew sc");
    lines.push("\t;");

    lines.push(
      `\tif '$data(${global}) quit $$$ERROR(10000,"${u.escapeMac(
        config.title
      )} não cadastrado!")`
    );

    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
  }

  function auxiliaryMethodSuffix(definition) {
    return u.toPascal(definition.title || definition.routineName || "Tela auxiliar");
  }

  function auxiliaryFields(definition, config) {
    return app.fields.fieldsForLocation(definition.key, config);
  }

  function auxiliaryKeyDefinitions(definition, config) {
    return auxiliaryFields(definition, config)
      .filter(
        (field) =>
          app.fields.isKeyField(field) &&
          !app.fields.isMultiSelect(field)
      )
      .map((field) => ({
        field,
        parameter: u.toParameter(field.description || field.variable)
      }));
  }

  function auxiliaryMainIndexDefinitions(definition, config) {
    const selected = new Set(definition.parameters || []);
    const result = app.indexes
      .effectiveKeyDefinitions(config)
      .filter(({ field }) =>
        selected.has(u.normalizeVariable(field.variable, ""))
      );

    if (app.indexes.usesRoutineCompany(config)) {
      result.unshift({
        field: null,
        parameterName: "codEmpresa",
        syntheticCompany: true
      });
    }

    return result;
  }

  function auxiliaryRuleParameters(definition, config, includeData = false) {
    const parameters = [
      ...auxiliaryMainIndexDefinitions(definition, config).map(
        ({ parameterName }) => parameterName
      ),
      ...auxiliaryKeyDefinitions(definition, config).map(
        ({ parameter }) => parameter
      )
    ];

    if (includeData) {
      parameters.push(u.toParameter(definition.dataVariable || "DADOSAUX"));
    }

    return unique(parameters);
  }

  function auxiliaryGlobalReference(definition, config) {
    const selected = new Set(definition.parameters || []);
    const keyParameterByFieldId = new Map(
      app.indexes
        .effectiveKeyDefinitions(config)
        .filter(({ field }) =>
          selected.has(u.normalizeVariable(field.variable, ""))
        )
        .map(({ field, parameterName }) => [field.id, parameterName])
    );

    const indexes = [];

    if (app.indexes.usesRoutineCompany(config)) indexes.push("codEmpresa");

    app.state.globalIndexes.forEach((index) => {
      if (index.type === "fixed") {
        indexes.push(String(index.fixedValue || "1").trim() || "1");
        return;
      }

      const field = app.indexes.fieldById(index.fieldId);
      if (app.indexes.usesRoutineCompany(config) &&
          u.normalizeVariable(field?.variable, "") === "CODEMP") {
        return;
      }

      const parameter = keyParameterByFieldId.get(index.fieldId);
      if (parameter) indexes.push(parameter);
    });

    let reference = indexes.length
      ? `^${config.globalName}(${indexes.join(",")})`
      : `^${config.globalName}`;

    reference = appendSubscript(reference, definition.globalSubscript);

    auxiliaryKeyDefinitions(definition, config).forEach(({ parameter }) => {
      reference = appendSubscript(reference, parameter);
    });

    return reference;
  }

  function generateAuxiliary(definition, config = app.getConfig()) {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const routineName = definition.rgRoutineName || `${definition.routineName}RG`;
    const methodSuffix = auxiliaryMethodSuffix(definition);
    const dataParameter = u.toParameter(definition.dataVariable || "DADOSAUX");
    const keyParameters = auxiliaryRuleParameters(definition, config, false);
    const globalReference = auxiliaryGlobalReference(definition, config);
    const fields = auxiliaryFields(definition, config);
    const lines = [];

    lines.push(`ROUTINE ${routineName}`);
    lines.push(
      `${routineName}	; ${month}/${year} - ${u.escapeMac(definition.title || "Tela auxiliar")} <#ROTINA GERADA AUTOMATICAMENTE#> (REGRAS)`
    );
    lines.push("	;");
    lines.push("	#include %CSUTICSP");
    lines.push("	;");

    lines.push(`	; Obter ${u.sanitize(definition.title || "Tela auxiliar")}`);
    lines.push(
      `Obter${methodSuffix}(${[...keyParameters, dataParameter].join(",")})	;`
    );
    lines.push("	$$$VAR");
    lines.push("	new sc");
    lines.push("	;");
    lines.push(`	set ${dataParameter}=""`);
    lines.push(
      `	if '$data(${globalReference}) quit $$$ERROR(10000,"${u.escapeMac(definition.title || "Registro")} não cadastrado!")`
    );
    lines.push(`	set ${dataParameter}=$get(${globalReference})`);
    lines.push("	;");
    lines.push("	quit $$$OK");
    lines.push("	;");

    lines.push(`	; Gravar ${u.sanitize(definition.title || "Tela auxiliar")}`);
    lines.push(
      `Gravar${methodSuffix}(${[...keyParameters, dataParameter].join(",")})	;`
    );
    lines.push("	$$$VAR");
    lines.push("	new sc");
    lines.push("	;");
    lines.push(`	do $$$SetG(${globalReference},${dataParameter})`);
    lines.push("	;");
    lines.push("	quit $$$OK");
    lines.push("	;");

    if (fields.some((field) => app.fields.isMultiSelect(field))) {
      lines.push("	; Observação: campos de Multi-Seleção precisam de uma referência de global própria.");
      lines.push("	;");
    }

    lines.push("	; Tags CSW");
    lines.push("	;");
    lines.push("	; csw:csp:naogerar");

    return lines.join("\n");
  }

  function generate() {
    const config =
      app.getConfig();

    if (config.routineMode === "grid") {
      if (!config.useRules) return "; Rotina RG desabilitada.";

      const gridRules = app.grid.generateRulesFor("parent", config);
      const tables = [];
      appendGeneratedTables(tables);

      if (!tables.length) return gridRules;

      // As tabelas entram antes do bloco de tags, que fecha a rotina.
      const lines = gridRules.split("\n");
      const marker = lines.findIndex((line) => line.includes("; Tags CSW"));
      const tail = lines.findIndex((line) => line.includes("csw:csp:"));
      const cut = marker >= 0 ? marker : tail >= 0 ? tail - 1 : lines.length;
      return [
        ...lines.slice(0, cut),
        ...tables,
        ...lines.slice(cut)
      ].join("\n");
    }

    if (!config.useRules) {
      return (
        "; Rotina RG desabilitada."
      );
    }

    const now =
      new Date();

    const month =
      String(
        now.getMonth() + 1
      ).padStart(2, "0");

    const year =
      now.getFullYear();

    const lines = [];

    lines.push(
      `ROUTINE ${config.rgRoutineName}`
    );

    lines.push(
      `${config.rgRoutineName}\t; ${month}/${year} - ${u.escapeMac(
        config.title
      )} <#ROTINA GERADA AUTOMATICAMENTE#> (REGRAS)`
    );

    lines.push("\t;");
    lines.push(
      "\t#include %CSUTICSP"
    );
    lines.push("\t;");

    appendGenerateTabs(
      lines,
      config
    );

    appendGeneratedTables(lines);

    appendInitialize(
      lines,
      config
    );

    appendObtain(
      lines,
      config
    );

    appendStructureObtainMethods(
      lines,
      config
    );

    appendLock(
      lines,
      config
    );

    appendBtnManter(
      lines,
      config
    );

    appendSave(
      lines,
      config
    );

    appendDelete(
      lines,
      config
    );

    lines.push(
      "\t; Tags CSW"
    );
    lines.push("\t;");
    lines.push(
      "\t; csw:csp:naogerar"
    );

    return lines.join("\n");
  }

  function generateAll() {
    const config = app.getConfig();

    const result = {
      rg: {
        label:
          config.routineMode === "grid"
            ? "RG do Grid principal"
            : "Rotina RG principal",
        routineName: config.rgRoutineName,
        code: generate()
      }
    };

    if (config.useTabs && config.useRules) {
      app.state.tabs.forEach((tab, index) => {
        if (tab.contentType !== "grid") return;

        const gridConfig = app.grid.configFor(tab.id, config);
        result[`grid-${tab.id}`] = {
          label: `RG Aba ${index + 1} - ${tab.title}`,
          routineName: gridConfig.rgRoutineName,
          code: app.grid.generateRulesFor(tab.id, config)
        };
      });
    }

    if (
      app.customButtons &&
      typeof app.customButtons.generatedScreenDefinitions === "function"
    ) {
      app.customButtons
        .generatedScreenDefinitions(config)
        .forEach((definition) => {
          result[`button-screen-${definition.button.id}`] = {
            label: `RG Tela auxiliar ${definition.routineName}`,
            routineName: definition.rgRoutineName,
            code: generateAuxiliary(definition, config)
          };
        });
    }

    return result;
  }

  function generateCombined() {
    return Object.values(generateAll())
      .map((item) => item.code)
      .join("\n\n");
  }

  app.rg = {
    generate,
    generateAll,
    generateCombined,
    dataStructures,
    structureGlobalReference,
    multiSelectDefinitions,
    multiSelectGlobalReference,
    generateAuxiliary,
    auxiliaryGlobalReference
  };
})(window.GeradorRotinasJsonPadrao);
