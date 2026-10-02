(function (app) {
  const {
    state,
    utils: u
  } = app;

  function normalizedF7Routine(field) {
    if (String(field.f7ListLoad || "").trim()) {
      return `F7${u.normalizeVariable(field.variable)}^${routineForLocation(field.tabId || "parent")}`;
    }
    return String(field.f7Routine || "")
      .trim()
      .replace(/^,+/, "")
      .replace(/,+$/, "");
  }

  function routineForLocation(locationId) {
    const config = app.getConfig();
    if (!locationId || locationId === "parent") return config.routineName;
    const index = state.tabs.findIndex((tab) => tab.id === locationId);
    if (index < 0) return config.routineName;
    return u.normalizeVariable(state.tabs[index].routineName, `${config.routineName}TAB${index + 1}`);
  }

  function appendListF7Labels(lines, locationId, routineName) {
    app.fields.mainFields()
      .filter((field) => (field.tabId || "parent") === locationId && String(field.f7ListLoad || "").trim())
      .forEach((field) => {
        const variable = u.normalizeVariable(field.variable);
        const table = `TABF7${variable}`.slice(0, 31);
        const titles = u.escapeMac(field.f7ListTitles || `${field.description},Descrição`);
        const sizes = u.escapeMac(field.f7ListSizes || "8,50");
        lines.push(`\t; F7 de ${u.sanitize(field.description)}`);
        lines.push(`F7${variable}\tkill ${table}`);
        String(field.f7ListLoad).split(/\r?\n/).filter((line) => line.trim()).forEach((line) => {
          lines.push(`\t${line.trim().split("{table}").join(table)}`);
        });
        lines.push(`\tdo ^%CSUTIPE("${sizes}","1","${titles}",${Number(field.f7ListRows) || 15},"${table}(","%codret","%dadret",,,,"F7${variable}PE1^${routineName}")`);
        lines.push("\tquit:$$CSP^%CSW1UTI()");
        lines.push(`F7${variable}PE1\tdo SetF7^%CSW1UTI(%codret)`);
        lines.push("\tquit");
        lines.push("\t;");
      });
  }

  function f8RoutineOf(source) {
    const clean = String(source?.f8Routine || "").trim().replace(/^,+|,+$/g, "");
    if (!clean) return "";
    return clean.includes("^") ? clean : `^${clean}`;
  }

  function controlDefinition(field, cp) {
    const f7Routine = normalizedF7Routine(field);
    const f8Routine = f8RoutineOf(field);

    if (!f7Routine) {
      return `${f8Routine},,,${cp}`;
    }

    return `${f8Routine},${f7Routine},,${cp}`;
  }

  function standardControlTail(field, cp) {
    return `,,"${controlDefinition(field, cp)}")`;
  }

  function typedReaderRoutine(field) {
    return String(field?.typedReaderRoutine || "")
      .trim()
      .replace(/^"+|"+$/g, "");
  }

  function typedReaderControl(field, cp) {
    return String(field?.typedReaderControlDefinition || ",,3,{cp}")
      .replaceAll("{cp}", cp);
  }

  function typedReaderExtra(field) {
    return String(field?.typedReaderExtraDefinition || ",1");
  }

  function isScaledValueField(field) {
    return ["float", "decimal"].includes(field?.type);
  }

  function decimalFormat(field) {
    if (app.fields && typeof app.fields.normalizedDecimalFormat === "function") {
      return app.fields.normalizedDecimalFormat(field);
    }

    const value = String(field?.decimalFormat || "").toLowerCase();
    if (["v2", "v3", "v4"].includes(value)) return value;
    return field?.type === "float" ? "v3" : "v2";
  }

  function decimalPlaces(field) {
    return Number(decimalFormat(field).slice(1)) || 2;
  }

  function decimalScale(field) {
    return 10 ** decimalPlaces(field);
  }

  function decimalInputVariable(label) {
    return `DEC${label}`;
  }

  function decimalInputReference(field, label, reference) {
    return isScaledValueField(field) ? decimalInputVariable(label) : reference;
  }

  function decimalInitializeLine(field, label, reference) {
    if (!isScaledValueField(field)) return "";
    return `set ${decimalInputVariable(label)}=$select(${reference}="":"",1:${reference}/${decimalScale(field)})`;
  }

  function decimalPersistLine(field, label, reference) {
    if (!isScaledValueField(field)) return "";
    const input = decimalInputVariable(label);
    const scale = decimalScale(field);

    // O valor digitado pode vir no padrão brasileiro (130,5) ou
    // no formato canônico do ObjectScript (130.5). Quando houver vírgula,
    // converte somente o separador decimal antes de aplicar a escala V2/V3/V4.
    return `set ${reference}=$select(${input}="":"",${input}[",":+$justify($translate(${input},",",".")*${scale},0,0),1:+$justify(${input}*${scale},0,0))`;
  }

  function decimalRefreshLines(field, label, reference) {
    if (!isScaledValueField(field)) return [];

    return [
      "do EV^%CSUTIUD",
      `do Set^%CSW1UTI(%PRG,"cp${label}",${reference},"${decimalFormat(field)}")`
    ];
  }

  function component(
    field,
    label,
    reference
  ) {
    const line = Number(field.inputLine) || 1;
    const column = Number(field.inputColumn) || 1;
    const size = Number(field.inputSize) || 1;
    const required = field.required ? 1 : "";
    const cp = `cp${label}`;
    const tail = standardControlTail(field, cp);

    if (field.type === "textArea") {
      const maxLength = Math.max(1, Number(field.textAreaMaxLength) || 500);
      const width = Math.max(1, Number(field.textAreaWidth) || size || 30);
      const height = Math.max(1, Number(field.textAreaHeight) || 3);

      return `do ^%CSW1UTITXTAREA(${line},${column},${maxLength},"${reference}",${reference},,",${cp},,,1",${width},${height},0)`;
    }

    if (app.fields.usesTypedReader(field)) {
      const currentValue =
        field.typedReaderUseCurrentValue === false ? "" : reference;
      const reader = u.escapeMac(typedReaderRoutine(field));
      const control = u.escapeMac(typedReaderControl(field, cp));
      const extra = u.escapeMac(typedReaderExtra(field));

      return `do ^%CSLE(${line},${column},${size},"${reference}",${currentValue},,${required},,"${control}","${extra}",,,,,,"${reader}")`;
    }

    if (field.type === "multiSelect") {
      const mask = field.multiSelectValueType === "string" ? "" : `"@'?.N"`;
      return `do ^%CSLE(${line},${column},${size},"${reference}",,${mask},,,"${controlDefinition(field, cp)}")`;
    }

    if (field.type === "integer") {
      return `do ^%CSLE(${line},${column},${size},"${reference}",${reference},"@'?.N",${required}${tail}`;
    }

    if (field.type === "float") {
      const inputReference = decimalInputReference(field, label, reference);
      return `do ^%CSLE(${line},${column},${size},"${inputReference}",${inputReference},,"1,,18,,,,,DEC"${tail}`;
    }

    if (field.type === "decimal") {
      const inputReference = decimalInputReference(field, label, reference);
      return `do ^%CSLE(${line},${column},${size},"${inputReference}",${inputReference},,"1,,16,,,,,DEC"${tail}`;
    }

    if (field.type === "date") {
      return `do ^%CSLE(${line},${column},8,"${reference}",${reference},,"1,1,3"${tail}`;
    }

    if (field.type === "monthYear") {
      return `do ^%CSLE(${line},${column},6,"${reference}",${reference},,"1,8,9"${tail}`;
    }

    if (["combo", "checkbox", "radio"].includes(field.type)) {
      const defaults = {
        combo: "TABCOMBO",
        checkbox: "TABCHK",
        radio: "TABRADIO"
      };

      const modes = {
        combo: 1,
        checkbox: 2,
        radio: 3
      };

      const table = u.normalizeVariable(
        field.optionsVariable,
        defaults[field.type]
      );

      return `do ^%CSLE(${line},${column},${size},"${reference}",${reference},,${required},,",,,${cp}",,,,,${modes[field.type]},.${table})`;
    }

    return `do ^%CSLE(${line},${column},${size},"${reference}",${reference},,${required}${tail}`;
  }

  function fieldLabelStep(fieldCount) {
    if (fieldCount <= 11) return 100;
    if (fieldCount <= 21) return 50;
    return Math.max(1, Math.floor(1000 / Math.max(1, fieldCount - 1)));
  }

  function buildFieldEntries(fields) {
    const step = fieldLabelStep(fields.length);
    return fields.map((field, index) => ({
      field,
      index,
      label: 1000 + index * step,
      step
    }));
  }

  function localEntries(
    locationId,
    config
  ) {
    return buildFieldEntries(
      app.fields.fieldsForLocation(locationId, config)
    );
  }
  function tabForLocation(locationId) {
    return state.tabs.find((tab) => tab.id === locationId) || null;
  }

  function finalFocusMode(locationId, isTabRoutine) {
    if (!isTabRoutine) return "auto";

    const mode = String(tabForLocation(locationId)?.finalFocus || "auto");
    return ["save", "grid", "lastField"].includes(mode) ? mode : "auto";
  }

  function saveButtonId(config, locationId) {
    const buttons = Array.isArray(config.customButtons)
      ? config.customButtons
      : [];

    const configured = buttons.find((button) => {
      const location = button.location || "parent";
      const id = String(button.buttonId || "");
      return location === locationId && /^btsalvar/i.test(id);
    });

    if (configured?.buttonId) return configured.buttonId;

    return "btSalvar";
  }


  function companyMacArgument(config = app.getConfig()) {
    return app.indexes.companyMacArgument(config);
  }

  function rgDataArguments(
    config,
    byReference = false
  ) {
    return app.fields
      .dataVariables(config)
      .map(
        (variable) =>
          byReference
            ? `.${variable}`
            : variable
      );
  }

  function rgMultiSelectArguments(
    config,
    byReference = false
  ) {
    return app.fields
      .multiSelectTableVariables(config)
      .map((variable) =>
        byReference ? `.${variable}` : variable
      );
  }

  function rgSaveKeyArguments(
    config
  ) {
    return [
      ...app.indexes
        .macArguments(),

      ...app.fields
        .tabKeyMacArguments(config)
    ];
  }

  function appendAfterTabKeys(
    lines,
    config,
    locationId,
    currentLabel
  ) {
    if (
      !config.useRules ||
      !config.generateObtain ||
      !app.rg
    ) {
      return;
    }

    const structures =
      app.rg
        .dataStructures(config)
        .filter(
          (structure) =>
            structure.tabIds.includes(
              locationId
            ) &&
            structure
              .keyDefinitions
              .length
        );

    app.rg
      .keyedMultiSelectDefinitions(config)
      .filter((definition) => definition.field.tabId === locationId)
      .forEach((definition) => {
        const condition = definition.keyDefinitions
          .map((keyDefinition) => `(${keyDefinition.variable}'="")`)
          .join("&");

        const argumentsList = [
          ...app.indexes.macArguments(),
          ...definition.keyDefinitions.map((keyDefinition) => keyDefinition.variable),
          `.${definition.tableVariable}`
        ];

        lines.push(
          `\tset sc=$$${definition.obtainMethod}^${config.rgRoutineName}(${argumentsList.join(",")})`
        );
        lines.push(
          `\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto ${currentLabel}`
        );
        lines.push(`\tif ${condition} do 8000`);
        lines.push("\t;");
      });

    structures.forEach(
      (structure) => {
        const condition =
          structure.keyDefinitions
            .map(
              (definition) =>
                `(${definition.variable}'="")`
            )
            .join("&");

        const argumentsList = [
          ...app.indexes
            .macArguments(),

          ...structure
            .keyDefinitions
            .map(
              (definition) =>
                definition.variable
            ),

          `.${structure.variable}`
        ];

        lines.push(
          `\tif ${condition} do`
        );

        lines.push(
          `\t. set sc=$$Obter${config.entityName}${structure.methodSuffix}^${config.rgRoutineName}(${argumentsList.join(",")})`
        );

        lines.push(
          `\t. if $$$ISERR(sc) do ME^%CSUTICSP(sc) goto ${currentLabel}`
        );

        lines.push(
          "\t. do 8000"
        );

        lines.push("\t;");
      }
    );
  }

  function listEmptyText(field) {
    return u.escapeMac(field.multiSelectEmptyText ?? "");
  }

  function savedFromTab(config) {
    return config.useTabs && config.useBtnManter && (config.btnManterLocation || "parent") !== "parent";
  }

  function openByKey() {
    return (app.state.ruleHooks || {}).openByKey === true;
  }

  function openByKeyKeys() {
    return app.indexes.macArguments().filter((argument) => argument !== "CE");
  }

  function openByKeyParameters() {
    return [...openByKeyKeys(), "FLGFUN", "TABALT", "DISABLE"];
  }

  function tabsEnabledAfterSave() {
    return state.tabs
      .map((tab, index) => ({ tab, position: index + 1 }))
      .filter(({ tab }) => tab.enableAfterSave === true)
      .map(({ position }) => position);
  }

  function callbackRoutineFor(locationId, isTabRoutine, config) {
    return isTabRoutine
      ? u.normalizeVariable(
          state.tabs.find((tab) => tab.id === locationId)?.routineName,
          config.routineName
        )
      : config.routineName;
  }

  function listMultiSelectComponent(field, label, routine) {
    const line = Number(field.inputLine) || 1;
    const column = Number(field.inputColumn) || 1;
    const size = Number(field.inputSize) || 8;
    return `do ^%CSUTIMM("${app.fields.multiSelectOptionsVariable(field)}",1,,,,"${app.fields.multiSelectTableVariable(field)}","${u.escapeMac(field.description)}",,,,,,,"${label}MM1^${routine}","${column},${line},${size},${label}^${routine}")`;
  }

  function appendListMultiSelectOptions(lines, config) {
    const fields = app.fields.listMultiSelectFields(config);
    if (!fields.length) return;

    fields.forEach((field) => {
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

  function routineVariables(
    config
  ) {
    const variables =
      new Set([
        "%PRG",
        "CT",
        "sc"
      ]);

    app.fields
      .dataVariables(config)
      .forEach(
        (variable) =>
          variables.add(variable)
      );

    app.fields.mainFields().forEach(
      (field) => {
        if (
          app.fields
            .usesOwnVariable(field)
        ) {
          variables.add(
            u.normalizeVariable(
              field.variable
            )
          );
        }

        if (app.fields.isListMultiSelect(field)) {
          variables.add(
            app.fields.multiSelectTableVariable(field)
          );
          variables.add(
            app.fields.multiSelectOptionsVariable(field)
          );
        } else if (app.fields.isMultiSelect(field)) {
          variables.add(
            app.fields.multiSelectInputVariable(field)
          );
          variables.add(
            app.fields.multiSelectTableVariable(field)
          );
        }

        if (
          app.fields
            .usesOptions(field)
        ) {
          variables.add(
            u.normalizeVariable(
              field.optionsVariable,
              app.fields
                .defaultOptions(
                  field
                )
            )
          );
        }

        u.parseVariables(
          field.extraVariables
        ).forEach(
          (variable) =>
            variables.add(variable)
        );

        if (String(field.f7ListLoad || "").trim()) {
          variables.add(`TABF7${u.normalizeVariable(field.variable)}`.slice(0, 31));
        }

        if (app.fields.usesTypedReader(field)) {
          variables.add(app.fields.typedReaderConfigVariable(field));
        }
      }
    );

    ["parent", ...state.tabs.map((tab) => tab.id)].forEach((locationId) => {
      localEntries(locationId, config).forEach(({ field, label }) => {
        if (isScaledValueField(field)) variables.add(decimalInputVariable(label));
      });
    });

    if (
      config.useBtnManter ||
      app.fields.multiSelectFields(config).length
    ) {
      variables.add("SN");
    }

    if (config.useTabs) {
      variables.add("CONTINUE");
      variables.add("CODEMP");
      if (tabsEnabledAfterSave().length) variables.add("FLGNOVO");

      if (app.grid && typeof app.grid.sharedVariablesForTabs === "function") {
        app.grid.sharedVariablesForTabs(config).forEach((variable) =>
          variables.add(variable)
        );
      }
    }

    if (app.customButtons && typeof app.customButtons.variables === "function") {
      app.customButtons.variables().forEach((variable) => variables.add(variable));
    }

    return [
      ...variables
    ];
  }

  function typedReaderDefinitions(sourceFields) {
    const definitions = [];
    const seen = new Set();

    (sourceFields || []).forEach((field) => {
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
      definitions.push({ variable, method, company, configText });
    });

    return definitions;
  }

  function appendTypedReaderConfigurations(lines, sourceFields) {
    typedReaderDefinitions(sourceFields).forEach((definition) => {
      lines.push(
        `\tset sc=$$${definition.method}(${definition.company},"${u.escapeMac(definition.configText)}",.${definition.variable})`
      );
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
      lines.push("\t;");
    });
  }

  function appendGeneratedOptionTables(
    lines,
    config
  ) {
    if (!config.useRules) {
      return;
    }

    const tableRoutine =
      config.rgRoutineName;

    app.fields
      .generatedOptionTables()
      .forEach((field) => {
        const table =
          u.normalizeVariable(
            field.optionsVariable,
            "TABELA"
          );

        const suffix =
          u.toPascal(
            field.description ||
            field.variable
          );

        lines.push(
          `\tset sc=$$ObterTab${suffix}^${tableRoutine}(.${table})`
        );

        lines.push(
          "\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit"
        );

        lines.push("\t;");
      });
  }

  function appendParentInitialization(
    lines,
    config
  ) {
    const reset =
      new Set(
        app.fields
          .dataVariables(config)
      );

    app.fields.mainFields()
      .filter(
        (field) =>
          app.fields
            .usesOwnVariable(field)
      )
      .forEach((field) => {
        const variable =
          u.normalizeVariable(
            field.variable
          );

        if (
          variable !== "CODEMP"
        ) {
          reset.add(variable);
        }
      });

    app.fields.multiSelectFields(config).forEach((field) => {
      if (app.fields.isListMultiSelect(field)) return;
      reset.add(app.fields.multiSelectInputVariable(field));
    });

    app.fields.mainFields()
      .filter((field) => app.fields.isGridTabField(field) && !app.fields.isMultiSelect(field))
      .forEach((field) => {
        const variable = u.normalizeVariable(field.variable);
        if (variable !== "CODEMP") reset.add(variable);
      });

    if (config.useTabs) {
      reset.add("CONTINUE");

      if (
        app.grid &&
        typeof app.grid.tabSaveDefinitions === "function"
      ) {
        app.grid
          .tabSaveDefinitions(config)
          .forEach((definition) => {
            reset.add(definition.flagVariable);
          });
      }
    }

    lines.push(
      "\t; Inicializar"
    );

    if (
      config.useRules &&
      config.generateLock &&
      app.indexes
        .macArguments()
        .length
    ) {
      const args =
        app.indexes
          .macArguments()
          .map(
            (argument) =>
              `$get(${argument})`
          )
          .join(",");

      lines.push(
        `0500\tset sc=$$UnLock${config.entityName}^${config.rgRoutineName}(${args})`
      );
    } else {
      lines.push(
        "0500\t;"
      );
    }

    const keyArguments = app.indexes.macArguments();
    const lastKey = keyArguments[keyArguments.length - 1];
    const byKey = openByKey() && config.useRules && config.generateObtain && keyArguments.length > 0;
    const keptKeys = byKey ? [...reset].filter((variable) => keyArguments.includes(variable)) : [];
    const cleared = [...reset].filter((variable) => !keptKeys.includes(variable));

    if (cleared.length) {
      lines.push(
        `\tset (${cleared.join(",")})=""`
      );
    }
    if (keptKeys.length) {
      lines.push(`\tif 'FLGFUN,'DISABLE set (${keptKeys.join(",")})=""`);
    }

    app.fields.multiSelectTableVariables(config).forEach((variable) => {
      lines.push(`\tkill ${variable}`);
    });

    lines.push("\t;");
    lines.push(
      "\tdo 9000,8000"
    );

    lines.push("\t;");

    if (byKey) {
      lines.push(`\tif FLGFUN!DISABLE,${lastKey}'="" goto 0600`);
      lines.push("\t;");
    }

    const parentKeys = app.fields.mainFields().filter(
      (field) => (field.tabId || "parent") === "parent" && app.fields.isKeyField(field)
    );
    if (!parentKeys.length && keyArguments.length) {
      appendAfterParentKeys(lines, config, "9999");
    }
  }

  function appendAfterParentKeys(
    lines,
    config,
    currentLabel
  ) {
    const keyArguments =
      app.indexes
        .macArguments();

    if (
      !config.useRules ||
      !keyArguments.length
    ) {
      return;
    }

    const dataArguments =
      rgDataArguments(
        config,
        true
      );

    if (
      config.generateObtain
    ) {
      if (openByKey()) {
        lines.push("\t; Carregar registro (também quando aberta pelo Editar/Visualizar)");
      }
      lines.push(
        `${openByKey() ? "0600" : ""}\tset sc=$$Obter${config.entityName}^${config.rgRoutineName}(${[
          ...keyArguments,
          ...dataArguments,
          ...rgMultiSelectArguments(config, true)
        ].join(",")})`
      );

      if (openByKey()) {
        lines.push("\tif $$$ISERR(sc),FLGFUN!DISABLE do ME^%CSUTICSP(sc) goto 9999");
      }

      if (tabsEnabledAfterSave().length) {
        lines.push("\tset FLGNOVO=$$$ISERR(sc)");
      }

      lines.push(
        `\tif $$$ISERR(sc) set sc=$$Inicializar${config.entityName}^${config.rgRoutineName}(${[
          ...keyArguments,
          ...dataArguments,
          ...rgMultiSelectArguments(config, true)
        ].join(",")})`
      );

      lines.push("\t;");
    }

    if (
      config.generateLock
    ) {
      lines.push(
        `\t${openByKey() ? "if 'DISABLE " : ""}set sc=$$Lock${config.entityName}^${config.rgRoutineName}(${keyArguments.join(",")})`
      );

      lines.push(
        `\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto ${openByKey() ? `9999:FLGFUN!DISABLE,${currentLabel}` : currentLabel}`
      );

      lines.push("\t;");
    }

    if (
      !config.useTabs &&
      config.useBtnManter &&
      config.generateObtain
    ) {
      lines.push(
        `\tdo BtnManter^%CSW1D($$InicializarBtnManter^${config.rgRoutineName}(${keyArguments.join(",")}))`
      );
    }

    lines.push(
      "\tdo 8000"
    );

    lines.push("\t;");

    if (config.useTabs) {
      const unlessView = openByKey() ? "if 'DISABLE " : "";
      lines.push(
        `\t${unlessView}do HabBotGeral^%CSW1("btSalvar",1)`
      );

      if (config.generateSaveAnother) {
        lines.push(
          `\t${unlessView}do HabBotGeral^%CSW1("btSalvarNovo",1)`
        );
      }

      if (config.generateDelete) {
        lines.push(
          `\t${unlessView}do HabBotGeral^%CSW1("btExcluir",1)`
        );
      }

      lines.push(
        '\tdo HabBotGeral^%CSW1("btCancelar",1)'
      );

      lines.push("\t;");
    }
  }

  function appendFields(
    lines,
    config,
    locationId,
    isTabRoutine = false
  ) {
    const entries =
      localEntries(
        locationId,
        config
      );

    const lastKeyLocalIndex =
      entries.reduce(
        (result, entry) =>
          app.fields
            .isKeyField(
              entry.field
            )
            ? entry.index
            : result,
        -1
      );

    entries.forEach(
      ({
        field,
        index,
        label,
        step
      }) => {
        const skipRead = (entry) =>
          entry.field.disabled === true && !app.fields.isKeyField(entry.field);
        const previousEntry = entries
          .slice(0, index)
          .reverse()
          .find((entry) => !skipRead(entry));
        const previous =
          previousEntry
            ? previousEntry.label
            : "9999";

        const reference =
          app.fields.reference(
            field,
            config
          );

        lines.push(
          `\t; ${u.sanitize(
            field.description
          )}`
        );

        lines.push(
          `${label}\t;`
        );

        if (skipRead({ field })) {
          const nextEntry = entries[index + 1];
          lines.push(`\tset sc=$$Valcp${label}()`);
          lines.push(`\tgoto ${nextEntry ? nextEntry.label : "2999"}`);
          lines.push(
            app.fields.hasDisplay(field)
              ? `${label}ON\tdo ClearCp^%CSW1UTI("ds${label}")`
              : `${label}ON\t;`
          );
          lines.push(`\t${component(field, label, reference)}`);
          lines.push("\tquit");
          lines.push("\t;");
          return;
        }

        const decimalInitialization = decimalInitializeLine(field, label, reference);

        if (
          app.fields
            .hasDisplay(field)
        ) {
          lines.push(
            `${label}ON\tdo ClearCp^%CSW1UTI("ds${label}")`
          );

          if (decimalInitialization) lines.push(`\t${decimalInitialization}`);

          lines.push(
            `\t${component(
              field,
              label,
              reference
            )}`
          );
        } else if (decimalInitialization) {
          lines.push(`${label}ON\t${decimalInitialization}`);
          lines.push(
            `\t${component(
              field,
              label,
              reference
            )}`
          );
        } else if (app.fields.isListMultiSelect(field)) {
          lines.push(
            `${label}ON\t${listMultiSelectComponent(field, label, callbackRoutineFor(locationId, isTabRoutine, config))}`
          );
        } else {
          lines.push(
            `${label}ON\t${component(
              field,
              label,
              reference
            )}`
          );
        }

        lines.push(
          "\tquit:$$CSP^%CSW1UTI()"
        );

        lines.push("\t;");

        const exitLabel = app.fields.isListMultiSelect(field)
          ? `${label}MM1`
          : `${label}EX`;

        lines.push(
          !previousEntry
            ? isTabRoutine
              ? `${exitLabel}\tgoto 9999:%=27,0500:(%=140)`
              : `${exitLabel}\tgoto 9999:%=27!(%=140)`
            : `${exitLabel}\tgoto 9999:%=27,${previous}:%=140`
        );

        lines.push("\t;");

        const decimalPersistence = decimalPersistLine(field, label, reference);
        if (decimalPersistence) {
          lines.push(`\t${decimalPersistence}`);
          decimalRefreshLines(field, label, reference).forEach((line) => {
            lines.push(`\t${line}`);
          });
          lines.push("\t;");
        }

        lines.push(
          `\tif '$$Valcp${label}() goto ${label}`
        );

        lines.push("\t;");

        const afterFieldLines = renderAfterFieldCode(field, label, config);
        if (afterFieldLines.length) {
          appendRenderedFieldCode(lines, afterFieldLines);
          lines.push("\t;");
        }

        if (app.fields.isMultiSelect(field) && !app.fields.isListMultiSelect(field)) {
          const tableVariable =
            app.fields.multiSelectTableVariable(field);
          const nextLabel =
            index === entries.length - 1
              ? "2999"
              : String(entries[index + 1].label);
          const includeLabel = label + Math.max(1, Math.floor(step / 2));
          const callbackRoutine = isTabRoutine
            ? u.normalizeVariable(
                state.tabs.find((tab) => tab.id === locationId)?.routineName,
                config.routineName
              )
            : config.routineName;

          lines.push(`\tif ${reference}="" goto ${nextLabel}`);
          lines.push(`\tif '$data(${tableVariable}(${reference})) goto ${includeLabel}`);
          lines.push("\t;");
          lines.push(`\t; Excluir ${u.sanitize(field.description)}`);
          lines.push("\t;");
          lines.push(
            `\tdo SN^%CSUTIUD(,,,"${u.escapeMac(field.description)} já selecionado! Deseja excluir?","N","${label}SN1^${callbackRoutine}")`
          );
          lines.push("\tquit:$$CSP^%CSW1UTI()");
          lines.push("\t;");
          lines.push(`${label}SN1\tkill:SN="S" ${tableVariable}(${reference})`);
          lines.push(`\tgoto ${label}`);
          lines.push("\t;");
          lines.push(`\t; Gravar ${u.sanitize(field.description)}`);
          lines.push("\t;");
          lines.push(
            `${includeLabel}\tdo SN^%CSUTIUD(,,,,,"${includeLabel}SN1^${callbackRoutine}")`
          );
          lines.push("\tquit:$$CSP^%CSW1UTI()");
          lines.push("\t;");
          lines.push(`${includeLabel}SN1\tset:SN="S" ${tableVariable}(${reference})=""`);
          lines.push(`\tgoto ${label}`);
          lines.push("\t;");
        }

        if (
          !isTabRoutine &&
          index ===
            lastKeyLocalIndex
        ) {
          appendAfterParentKeys(
            lines,
            config,
            label
          );
        }

        if (
          isTabRoutine &&
          index ===
            lastKeyLocalIndex
        ) {
          appendAfterTabKeys(
            lines,
            config,
            locationId,
            label
          );
        }
      }
    );

    if (entries.length) {
      lines.push(
        "\t; Foco final"
      );

      if (
        config.useTabs &&
        !isTabRoutine
      ) {
        lines.push(
          "2999\tgoto 1999"
        );
      } else {
        const focusMode = finalFocusMode(locationId, isTabRoutine);

        if (focusMode === "lastField") {
          lines.push(
            `2999\tdo Focus^%CSW1UTI(%PRG,"cp${entries.at(-1).label}",,1) quit`
          );
        } else {
          lines.push(
            `2999\tdo Focus^%CSW1UTI(%PRG,"${saveButtonId(config, locationId)}",,1) quit`
          );
        }
      }

      lines.push("\t;");
    }
  }

  function appendParentTabActivation(
    lines,
    config
  ) {
    if (!config.useTabs) {
      return;
    }

    lines.push(
      "1999\tif '$$Validate() quit:$$CSP^%CSW1UTI()"
    );

    lines.push("\t;");

    lines.push(
      `\tdo HabilitarTabAll^%CSW1A("${config.sheetId}")`
    );

    tabsEnabledAfterSave().forEach((position) => {
      lines.push(`\tif $get(FLGNOVO) do desabilitarTab^%CSW1A("${config.sheetId}",${position})`);
    });

    lines.push("\t;");

    lines.push(
      "\tdo Disable^%CSW1UTI()"
    );

    lines.push("\t;");

    lines.push(
      `2000\tdo selecionarTab^%CSW1A("${config.sheetId}",1)`
    );

    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
  }

  function appendSave(
    lines,
    config
  ) {
    if (!config.useBtnManter) {
      return;
    }

    lines.push(
      "\t; Salvar"
    );

    lines.push(
      "3000\tif '$$Validate() quit"
    );

    lines.push("\t;");

    if (config.useTabs) {
      state.tabs.forEach((tab, index) => {
        if (tab.contentType === "grid" && tab.saveFields !== true) return;
        if (tab.validateOnSave === false) return;
        lines.push(
          `\tif '$$validateTab^%CSW1A("${config.sheetId}",${index + 1}) quit`
        );
      });

      lines.push("\t;");
    }

    if (
      config.useRules &&
      config.generateSave
    ) {
      const args = [
        ...rgSaveKeyArguments(
          config
        ),

        ...rgDataArguments(
          config,
          false
        ),

        ...rgMultiSelectArguments(
          config,
          true
        )
      ];

      lines.push(
        `\tset sc=$$Gravar${config.entityName}^${config.rgRoutineName}(${args.join(",")})`
      );

      lines.push(
        savedFromTab(config)
          ? "\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit"
          : `\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto ${
              config.useTabs
                ? "1999"
                : "3000EX"
            }`
      );

      lines.push("\t;");

      if (
        config.useTabs &&
        app.grid &&
        typeof app.grid.tabSaveDefinitions === "function"
      ) {
        app.grid
          .tabSaveDefinitions(config)
          .forEach((definition) => {
            const args = definition.arguments.join(",");

            lines.push(
              `\tif $get(${definition.flagVariable}) set sc=$$${definition.methodName}^${definition.rgRoutineName}(${args})`
            );

            lines.push(
              `\tif $get(${definition.flagVariable}),$$$ISERR(sc) do ME^%CSUTICSP(sc) ${savedFromTab(config) ? "quit" : "goto 1999"}`
            );

            lines.push("\t;");
          });
      }

      lines.push(...u.renderHookLines((app.state.ruleHooks || {}).afterSaveCode));

      lines.push(
        '\tdo MECABECALHO^%CSW1UTI("Registro salvo com sucesso!")'
      );

      lines.push("\t;");

      if (openByKey() && app.indexes.macArguments().length) {
        const keys = app.indexes.macArguments();
        lines.push(`\tset TABALT(${keys[keys.length - 1]})=""`);
        lines.push("\t;");
      }

      if (
        !config.useTabs &&
        config.generateObtain
      ) {
        lines.push(
          `\tdo BtnManter^%CSW1D($$InicializarBtnManter^${config.rgRoutineName}(${app.indexes.macArguments().join(",")}))`
        );
      }
    } else {
      lines.push(
        "\t; Implementar gravação"
      );
    }

    if (config.useTabs) {
      if (
        config.generateSaveAnother
      ) {
        const unlockArgs =
          app.indexes
            .macArguments()
            .join(",");

        const displayOnlyKeys = new Set(
          app.fields.mainFields()
            .filter((field) => app.fields.isKeyField(field) && field.disabled === true)
            .map((field) => u.normalizeVariable(field.variable))
        );
        const keyVariables =
          rgSaveKeyArguments(
            config
          ).filter((variable) => !displayOnlyKeys.has(variable));

        lines.push("\t;");

        lines.push(
          savedFromTab(config)
            ? "\tif $get(CONTINUE) do  quit"
            : "\tif $get(CONTINUE) do  goto 0500"
        );

        if (
          config.generateLock &&
          unlockArgs
        ) {
          lines.push(
            `\t. set sc=$$UnLock${config.entityName}^${config.rgRoutineName}(${unlockArgs})`
          );
        }

        if (
          keyVariables.length
        ) {
          lines.push(
            `\t. set (${keyVariables.join(",")})=""`
          );
        }

        lines.push(
          "\t. set CONTINUE=0"
        );

        if (savedFromTab(config)) {
          lines.push(
            `\t. do execLabelTabPanel^%CSW1A("${config.sheetId}","0500^${config.routineName}")`
          );
        }
      }

      lines.push("\t;");

      const afterSaveTabs = tabsEnabledAfterSave();
      if (afterSaveTabs.length) {
        lines.push("\tset FLGNOVO=0");
        if (savedFromTab(config)) {
          lines.push(`\tdo execLabelTabPanel^${"%CSW1A"}("${config.sheetId}","2990^${config.routineName}")`);
          lines.push("\tquit");
          lines.push("\t;");
          lines.push("\t; Liberar as abas depois do primeiro Salvar");
          lines.push(`2990\tdo HabilitarTabAll^%CSW1A("${config.sheetId}")`);
          lines.push("\t;");
          lines.push("\tgoto 2000");
        } else {
          lines.push(`\tdo HabilitarTabAll^%CSW1A("${config.sheetId}")`);
          lines.push("\t;");
          lines.push("\tgoto 2000");
        }
      } else if (savedFromTab(config)) {
        lines.push(`\tdo execLabelTabPanel^%CSW1A("${config.sheetId}","0500^${config.routineName}")`);
        lines.push("\tquit");
      } else {
        lines.push(
          "\tgoto 0500"
        );
      }

      lines.push("\t;");

      if (
        config.generateSaveAnother
      ) {
        lines.push(
          "\t; Salvar e Criar Outro"
        );

        lines.push(
          "3050\tset CONTINUE=1"
        );

        lines.push("\t;");
        lines.push(
          "\tgoto 3000"
        );

        lines.push("\t;");
      }
    } else {
      lines.push("\t;");

      lines.push(
        `3000EX\tgoto ${lastLabelForLocation(
          "parent",
          config
        )}`
      );

      lines.push("\t;");
    }
  }

  function appendShow(
    lines,
    config,
    locationId
  ) {
    const entries =
      localEntries(
        locationId,
        config
      );

    lines.push(
      "\t; Mostrar Dados"
    );

    lines.push(
      "8000\t;"
    );

    entries.forEach(
      ({
        field,
        label
      }) => {
        const reference =
          app.fields.reference(
            field,
            config
          );

        if (app.fields.isListMultiSelect(field)) {
          const tableVariable =
            app.fields.multiSelectTableVariable(field);
          const selectedText =
            u.escapeMac(field.multiSelectSelectedText || "Selecionados");

          lines.push(
            `\tdo Set^%CSW1UTI(%PRG,"cp${label}MM1",$select($data(${tableVariable}):"${selectedText}",1:"${listEmptyText(field)}"))`
          );

          return;
        }

        if (app.fields.isMultiSelect(field)) {
          const tableVariable =
            app.fields.multiSelectTableVariable(field);
          const selectedText =
            u.escapeMac(field.multiSelectSelectedText || "Selecionados");

          lines.push(
            `\tdo Set^%CSW1UTI(%PRG,"cp${label}","")`
          );

          if (app.fields.hasDisplay(field)) {
            lines.push(
              `\tif $data(${tableVariable}) do Set^%CSW1UTI(%PRG,"ds${label}","${selectedText}")`
            );
            lines.push(
              `\tif '$data(${tableVariable}) do ClearCp^%CSW1UTI("ds${label}")`
            );
          }

          return;
        }

        if (
          [
            "combo",
            "checkbox",
            "radio"
          ].includes(field.type)
        ) {
          const names = {
            combo: "Combo",
            checkbox: "Check",
            radio: "Radio"
          };

          const table =
            u.normalizeVariable(
              field.optionsVariable,
              app.fields
                .defaultOptions(
                  field
                )
            );

          lines.push(
            `\tdo Inicializa${names[field.type]}^%CSW1A("cp${label}",.${table},0,${reference},,,1)`
          );
        } else {
          const format =
            field.type === "date"
              ? ',"d"'
              : [
                  "float",
                  "decimal"
                ].includes(
                  field.type
                )
                ? `,"${decimalFormat(field)}"`
                : "";

          lines.push(
            `\tdo Set^%CSW1UTI(%PRG,"cp${label}",${reference}${format})`
          );
        }

        if (
          app.fields
            .hasDisplay(field)
        ) {
          const mode =
            field.displayLoadMode ||
            (String(field.valcpCode || "").trim()
              ? "valcp"
              : "reference");

          if (
            mode === "valcp" &&
            String(field.valcpCode || "").trim()
          ) {
            lines.push(
              `\tif ${reference}="" do Set^%CSW1UTI(%PRG,"ds${label}","")`
            );

            lines.push(
              `\tif ${reference}'="" set sc=$$Valcp${label}()`
            );
          } else if (mode === "custom") {
            const customLines =
              renderDisplayLoadCode(
                field,
                label,
                config
              );

            if (customLines.length) {
              customLines.forEach((line) => {
                lines.push(
                  line.trim() === ";"
                    ? "\t;"
                    : `\t${line}`
                );
              });
            } else {
              lines.push(
                `\tdo Set^%CSW1UTI(%PRG,"ds${label}",${reference})`
              );
            }
          } else {
            lines.push(
              `\tdo Set^%CSW1UTI(%PRG,"ds${label}",${reference})`
            );
          }
        }
      }
    );

    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
  }

  function appendOptionInitializers(
    lines,
    config,
    locationId,
    setupMode = 0
  ) {
    localEntries(
      locationId,
      config
    ).forEach(
      ({
        field,
        label
      }) => {
        if (
          ![
            "combo",
            "checkbox",
            "radio"
          ].includes(field.type)
        ) {
          return;
        }

        const names = {
          combo:
            "Combo",

          checkbox:
            "Check",

          radio:
            "Radio"
        };

        const table =
          u.normalizeVariable(
            field.optionsVariable,
            app.fields
              .defaultOptions(
                field
              )
          );

        lines.push(
          `\tdo Inicializa${names[field.type]}^%CSW1A("cp${label}",.${table},${setupMode},,,,1)`
        );
      }
    );
  }

  function appendDisabledControls(lines, config, locationId) {
    const controls = localEntries(locationId, config)
      .filter(({ field }) => field.disabled === true)
      .map(({ label }) => `cp${label}`);

    if (!controls.length) return;

    lines.push(`\tdo DisableCp^%CSW1UTI("${controls.join(",")}")`);
    lines.push("\t;");
  }

  function appendParentScreen(
    lines,
    config
  ) {
    lines.push(
      "\t; Tela"
    );

    lines.push(
      "9000\tdo Clear^%CSW1UTI()"
    );

    lines.push(
      "\tdo Disable^%CSW1UTI()"
    );

    lines.push("\t;");

    appendOptionInitializers(
      lines,
      config,
      "parent",
      0
    );

    if (app.customButtons) {
      app.customButtons.appendInitializers(lines, "parent");
    }

    if (config.useTabs) {
      lines.push(
        '	do HabBotGeral^%CSW1("btSalvar",0)'
      );

      if (config.generateSaveAnother) {
        lines.push(
          '	do HabBotGeral^%CSW1("btSalvarNovo",0)'
        );
      }

      if (config.generateDelete) {
        lines.push(
          '	do HabBotGeral^%CSW1("btExcluir",0)'
        );
      }

      lines.push(
        '	do HabBotGeral^%CSW1("btCancelar",0)'
      );

      lines.push("	;");

      lines.push(
        `	do DesabilitarTabAll^%CSW1A("${config.sheetId}")`
      );

      lines.push("	;");


      state.tabs.forEach(
        (tab, index) => {
          lines.push(
            `\tdo execLabelTab^%CSW1A("${config.sheetId}",${index + 1},"9000^${u.normalizeVariable(
              tab.routineName,
              `${config.routineName}TAB${index + 1}`
            )}")`
          );
        }
      );

      lines.push("\t;");

      lines.push(
        "\tdo Enable^%CSW1UTI()"
      );
    } else {
      if (
        config.useBtnManter
      ) {
        lines.push(
          "\tdo BtnManter^%CSW1D(0)"
        );
      }


      lines.push(
        "\tdo Enable^%CSW1UTI()"
      );
    }

    appendDisabledControls(lines, config, "parent");

    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
  }

  function appendTabScreen(
    lines,
    config,
    tab
  ) {
    const hooks = (tab.hooks && typeof tab.hooks === "object") ? tab.hooks : {};
    lines.push(...u.renderHookLines(hooks.interfaceCode));

    lines.push(
      "\t; Tela"
    );

    lines.push(
      "9000\tdo Enable^%CSW1UTI()"
    );

    lines.push(
      "\tdo Clear^%CSW1UTI()"
    );

    lines.push("\t;");

    appendOptionInitializers(
      lines,
      config,
      tab.id,
      1
    );

    if (app.customButtons) {
      app.customButtons.appendInitializers(lines, tab.id);
    }

    appendDisabledControls(lines, config, tab.id);
    appendViewOnly(lines, tab.id);
    lines.push(...u.renderHookLines(hooks.screenCode));

    lines.push("\tquit");
    lines.push("\t;");
  }

  function appendViewOnly(lines, locationId) {
    if (!openByKey()) return;
    lines.push("\tif $get(DISABLE) do Disable^%CSW1UTI()");
    if (app.customButtons) {
      app.customButtons.buttonsForLocation(locationId).forEach((button, index) => {
        const id = String(button.buttonId || `btPersonalizado${index + 1}`);
        lines.push(`\tif $get(DISABLE) do HabBotGeral^%CSW1("${id}",0)`);
      });
    }
    lines.push("\t;");
  }

  function appendParentFinish(
    lines,
    config
  ) {
    lines.push(
      "\t; Fim"
    );

    if (
      config.useRules &&
      config.generateLock &&
      app.indexes
        .macArguments()
        .length
    ) {
      const args =
        app.indexes
          .macArguments()
          .map(
            (argument) =>
              `$get(${argument})`
          )
          .join(",");

      lines.push(
        `9999\tset sc=$$UnLock${config.entityName}^${config.rgRoutineName}(${args})`
      );
    } else {
      lines.push(
        "9999\t;"
      );
    }

    if (config.useTabs) {
      lines.push(
        `\tdo removerTabPanel^%CSW1A("${config.sheetId}")`
      );
    }

    lines.push(
      "\tdo FJ^%CSUTIUD"
    );

    lines.push(
      "\tdo FJ^%CSW1UTI"
    );

    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
  }

  function appendDelete(
    lines,
    config
  ) {
    if (!config.useBtnManter) {
      return;
    }

    lines.push(
      "\t; Excluir"
    );

    lines.push(
      "Excluir\t;"
    );

    if (
      config.useRules &&
      config.generateDelete
    ) {
      const args =
        app.rg
          .deleteMacArguments(config)
          .join(",");

      lines.push(
        `\tset sc=$$ValidarExcluir${config.entityName}^${config.rgRoutineName}(${args})`
      );

      lines.push(
        "\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto ExcluirEX"
      );

      lines.push("\t;");

      lines.push(
        `\tdo SN^%CSUTIUD(,,,2,,"ExcluirSN^${config.routineName}")`
      );

      lines.push(
        "\tquit:$$CSP^%CSW1UTI()"
      );

      lines.push("\t;");

      lines.push(
        'ExcluirSN\tif SN\'="S" goto ExcluirEX'
      );

      lines.push("\t;");

      lines.push(
        `\tset sc=$$Excluir${config.entityName}^${config.rgRoutineName}(${args})`
      );

      lines.push(
        "\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto ExcluirEX"
      );

      lines.push("\t;");

      lines.push(
        "\tdo MECABECALHO^%CSW1UTI(2)"
      );

      lines.push("\t;");
      lines.push(
        "\tgoto 0500"
      );
    } else {
      lines.push(
        "\t; Implementar exclusão"
      );
    }

    lines.push("\t;");

    lines.push(
      `ExcluirEX\tgoto ${
        config.useTabs
          ? "1999"
          : lastLabelForLocation(
              "parent",
              config
            )
      }`
    );

    lines.push("\t;");
  }

  function renderFieldCode(code, field, label, config) {
    const source = String(code || "").trim();
    if (!source) return [];

    const fieldReference = app.fields.reference(field, config);

    const replacements = {
      "{variable}": fieldReference,
      "{reference}": fieldReference,
      "{fieldVariable}": app.fields.isMultiSelect(field)
        ? app.fields.multiSelectInputVariable(field)
        : u.normalizeVariable(field.variable),
      "{display}": `ds${label}`,
      "{label}": String(label),
      "{company}": companyMacArgument(),
      "{rgRoutine}": config.rgRoutineName,
      "{routine}": config.routineName,
      "{fieldDescription}": u.escapeMac(field.description),
      "{multiTable}": app.fields.isMultiSelect(field)
        ? app.fields.multiSelectTableVariable(field)
        : "",
      "{multiSelectedText}": u.escapeMac(
        field.multiSelectSelectedText || "Selecionados"
      )
    };

    let result = source;

    Object.entries(replacements).forEach(([token, value]) => {
      result = result.split(token).join(value);
    });

    return result.split(/\r?\n/);
  }

  function isScreenOpeningLine(line) {
    return /\b(?:do|d)\s+Show\^/i.test(String(line || ""));
  }

  function stripScreenOpeningFromValcp(lines) {
    const result = [];

    lines.forEach((line) => {
      if (!isScreenOpeningLine(line)) {
        result.push(line);
        return;
      }

      const previous = String(result.at(-1) || "").trim();
      if (/^if\s+.+=""\s+quit\s+\$\$\$OK$/i.test(previous)) {
        result.pop();
      }
    });

    return result;
  }

  function renderValcpCode(field, label, config) {
    return stripScreenOpeningFromValcp(
      renderFieldCode(field.valcpCode, field, label, config)
    );
  }

  function renderAfterFieldCode(field, label, config) {
    return renderFieldCode(field.afterFieldCode, field, label, config);
  }

  function appendRenderedFieldCode(lines, renderedLines) {
    renderedLines.forEach((line) => {
      lines.push(
        line.trim() === ";"
          ? "\t;"
          : `\t${line}`
      );
    });
  }

  function renderDisplayLoadCode(field, label, config) {
    return renderFieldCode(field.displayLoadCode, field, label, config);
  }

  function appendValidations(
    lines,
    config,
    locationId
  ) {
    const entries =
      localEntries(
        locationId,
        config
      );

    entries.forEach(
      ({
        field,
        label
      }) => {
        const reference =
          app.fields.reference(
            field,
            config
          );

        lines.push(
          `\t; Método Valcp${label}()`
        );

        lines.push(
          `Valcp${label}()\t;`
        );

        if (app.fields.isListMultiSelect(field)) {
          const tableVariable = app.fields.multiSelectTableVariable(field);
          const selectedText = u.escapeMac(field.multiSelectSelectedText || "Selecionados");

          if (field.required) {
            lines.push(
              `\tif '$data(${tableVariable}) do ME^%CSUTIUD("${u.escapeMac(
                field.description
              )}: Campo obrigatório!") quit 0`
            );
            lines.push("\t;");
          }

          lines.push(
            `\tdo Set^%CSW1UTI(%PRG,"cp${label}MM1",$select($data(${tableVariable}):"${selectedText}",1:"${listEmptyText(field)}"))`
          );
          lines.push("\t;");
          lines.push("\tquit $$$OK");
          lines.push("\t;");
          return;
        }

        const requiredLine = `if ${reference}="" do ME^%CSUTIUD("${u.escapeMac(
          field.description
        )}: Campo obrigatório!") quit 0`;

        if (field.required && !app.fields.isMultiSelect(field)) {
          lines.push(`\t${requiredLine}`);

          lines.push("\t;");
        }

        const customValcpLines = renderValcpCode(
          field,
          label,
          config
        ).filter(
          (line) =>
            !(field.required && !app.fields.isMultiSelect(field) &&
              line.trim() === requiredLine)
        );

        while (customValcpLines.length && customValcpLines[0].trim() === ";") {
          customValcpLines.shift();
        }

        if (customValcpLines.length) {
          customValcpLines.forEach((line) => {
            lines.push(
              line.trim() === ";"
                ? "\t;"
                : `\t${line}`
            );
          });

          lines.push("\t;");
        } else if (
          app.fields
            .hasDisplay(field)
        ) {
          lines.push(
            `\tdo Set^%CSW1UTI(%PRG,"ds${label}",${reference})`
          );

          lines.push("\t;");
        }

        lines.push(
          "\tquit $$$OK"
        );

        lines.push("\t;");
      }
    );

    lines.push(
      "\t; Método Validate()"
    );

    lines.push(
      "Validate()\t;"
    );

    entries.forEach(
      ({ field, label }) => {
        const control = app.fields.isListMultiSelect(field)
          ? `cp${label}MM1`
          : `cp${label}`;
        lines.push(
          `\tif '$$Valcp${label}() do Focus^%CSW1UTI(%PRG,"${control}") quit 0`
        );
      }
    );

    lines.push("\t;");
    lines.push(
      "\tquit $$$OK"
    );

    lines.push("\t;");
  }

  function appendTags(
    lines,
    config,
    locationId,
    routineName,
    isTabRoutine
  ) {
    lines.push(
      "\t; Tags CSW"
    );

    lines.push("\t;");

    localEntries(
      locationId,
      config
    ).forEach(
      ({
        field,
        label
      }) => {
        const required =
          field.required
            ? "*"
            : "";

        lines.push(
          `\t; csw:label:${field.labelColumn},${field.labelLine},${field.labelSize},${u.sanitize(
            field.description
          )}${required}`
        );

        if (
          app.fields
            .hasDisplay(field)
        ) {
          lines.push(
            `\t; csw:display:${field.displayColumn},${field.displayLine},${field.displaySize},ds${label}`
          );
        }
      }
    );

    lines.push("\t;");

    const maintenanceLocation = config.useTabs
      ? config.btnManterLocation || "parent"
      : "parent";

    const generateMaintenanceHere =
      config.useBtnManter &&
      maintenanceLocation === locationId;

    if (generateMaintenanceHere) {
      const actionRoutine = config.routineName;

      if (config.useTabs) {
        const column = config.btnManterColumn;
        const line = config.btnManterLine;

        lines.push(
          `\t; csw:botao:${column},${line},btSalvar,<u>S</u>alvar,s,3000^${actionRoutine},edit,,14`
        );

        let nextColumn = column + 15;

        if (config.generateSaveAnother) {
          lines.push(
            `\t; csw:botao:${nextColumn},${line},btSalvarNovo,S<u>a</u>lvar e Criar Outro,a,3050^${actionRoutine},add,,18`
          );
          nextColumn += 20;
        }

        if (config.generateDelete) {
          lines.push(
            `\t; csw:botao:${nextColumn},${line},btExcluir,<u>E</u>xcluir,e,Excluir^${actionRoutine},trash,,14`
          );
          nextColumn += 15;
        }

        const cancelLabel = (app.state.ruleHooks || {}).cancelCloses === true ? "9999" : "0500";
        lines.push(
          `\t; csw:botao:${nextColumn},${line},btCancelar,<u>C</u>ancelar,c,${cancelLabel}^${config.routineName},back,,14`
        );
      } else {
        lines.push(
          `\t; csw:btnManter:${config.btnManterColumn},${config.btnManterLine},3000^${actionRoutine},0500^${actionRoutine},Excluir^${actionRoutine}`
        );
      }
    }

    if (app.customButtons) {
      app.customButtons.appendTags(lines, locationId, routineName);
    }

    lines.push("\t;");

    if (isTabRoutine) {
      lines.push(
        "\t; csw:labelseltab:0500"
      );
    }

    lines.push(
      `\t; csw:labelcreate:${routineName}`
    );

    lines.push(
      "\t; csw:labeldestroy:9999"
    );

    lines.push(
      "\t; csw:csp:gerar"
    );
  }

  function lastLabelForLocation(
    locationId,
    config
  ) {
    const entries =
      localEntries(
        locationId,
        config
      );

    return entries.length
      ? String(
          entries.at(-1).label
        )
      : "0500";
  }

  function appendShowMethod(
    lines,
    routineName
  ) {
    lines.push(
      "\t; Método Show"
    );

    lines.push(
      "Show(%cswP1,%cswP2,%cswP3,%cswP4)\t;"
    );

    lines.push(
      `\tdo Show^%CSW1UTI("${routineName}",$get(%cswP1),$get(%cswP2),$get(%cswP3),$get(%cswP4))`
    );

    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
  }

  function generateParent() {
    const config =
      app.getConfig();

    if (config.routineMode === "grid") {
      return app.grid.generateInterface(config);
    }

    const variables =
      routineVariables(config);

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
      `ROUTINE ${config.routineName}`
    );

    const parameters = openByKey() ? openByKeyParameters() : [];
    const localVariables = variables.filter((variable) => !parameters.includes(variable));

    lines.push(
      `${config.routineName}${parameters.length ? `(${parameters.join(",")})` : ""}\t; ${month}/${year} - ${u.escapeMac(
        config.title
      )} <#ROTINA GERADA AUTOMATICAMENTE#>`
    );

    lines.push("\t;");
    lines.push(
      "\t#include %CSUTICSP"
    );

    lines.push("\t;");

    lines.push(
      `0000\tdo New^%CSW1UTI("${localVariables.join(",")}")`
    );

    lines.push("\t;");

    lines.push(
      `\tnew ${localVariables.join(",")}`
    );

    lines.push("\t;");

    lines.push(
      `\tset %PRG="${config.routineName}"`
    );

    lines.push(
      "\tset CT=%index"
    );

    if (parameters.length) {
      openByKeyKeys().forEach((argument) => {
        lines.push(`\tset ${argument}=$get(${argument})`);
      });
      if (openByKeyKeys().includes("CODEMP")) lines.push("\tif CODEMP=\"\" set CODEMP=CE");
      else if (localVariables.includes("CODEMP")) lines.push("\tset CODEMP=CE");
      lines.push("\tset FLGFUN=+$get(FLGFUN)");
      lines.push("\tset DISABLE=+$get(DISABLE)");
      lines.push("\t;");
      lines.push("\tkill TABALT");
    } else if (localVariables.includes("CODEMP")) {
      lines.push(
        "\tset CODEMP=CE"
      );
    }

    lines.push("\t;");

    lines.push(
      "\tset sc=$$ValidarExecucaoCSW^%CSUTIRG001()"
    );

    lines.push(
      "\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit"
    );

    lines.push("\t;");

    appendTypedReaderConfigurations(
      lines,
      app.fields.mainFields()
    );

    lines.push(
      `\t; csw:aj:${config.windowWidth},${config.windowHeight},${config.title}`
    );

    lines.push(
      `\tdo AJ^%CSUTIUD(${config.windowWidth},${config.windowHeight},"${u.escapeMac(
        config.title
      )}")`
    );

    lines.push("\t;");

    if (config.useTabs) {
      const companyArgument =
        companyMacArgument();

      lines.push(
        `\tset sc=$$GerarAbas^${config.rgRoutineName}(${companyArgument})`
      );

      lines.push(
        "\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit"
      );

      lines.push("\t;");
    }

    appendListMultiSelectOptions(
      lines,
      config
    );

    appendGeneratedOptionTables(
      lines,
      config
    );

    appendParentInitialization(
      lines,
      config
    );

    appendFields(
      lines,
      config,
      "parent",
      false
    );

    appendParentTabActivation(
      lines,
      config
    );

    appendSave(
      lines,
      config
    );

    appendShow(
      lines,
      config,
      "parent"
    );

    appendParentScreen(
      lines,
      config
    );

    appendParentFinish(
      lines,
      config
    );

    appendDelete(
      lines,
      config
    );

    if (app.customButtons) {
      app.customButtons.appendActions(lines, config, "parent", config.routineName);
    }

    appendListF7Labels(lines, "parent", config.routineName);

    lines.push(...u.renderHookLines((app.state.ruleHooks || {}).interfaceCode));

    appendValidations(
      lines,
      config,
      "parent"
    );

    appendShowMethod(
      lines,
      config.routineName
    );

    appendTags(
      lines,
      config,
      "parent",
      config.routineName,
      false
    );

    return lines.join("\n");
  }

  function generateTab(
    tab,
    tabIndex
  ) {
    const config =
      app.getConfig();

    const routineName =
      u.normalizeVariable(
        tab.routineName,
        `${config.routineName}TAB${tabIndex + 1}`
      );

    const lines = [];

    const now =
      new Date();

    const month =
      String(
        now.getMonth() + 1
      ).padStart(2, "0");

    const year =
      now.getFullYear();

    lines.push(
      `ROUTINE ${routineName}`
    );

    lines.push(
      `${routineName}\t; ${month}/${year} - ${u.escapeMac(
        config.title
      )} - ${u.escapeMac(
        tab.title
      )}`
    );

    lines.push("\t;");
    lines.push(
      "\t#include %CSUTICSP"
    );

    lines.push("\t;");
    lines.push(
      "0000\tquit"
    );

    lines.push("\t;");

    lines.push(
      "0500\tdo 9000,8000"
    );

    lines.push("\t;");

    if (openByKey()) {
      lines.push("\tif $get(DISABLE) quit");
      lines.push("\t;");
    }

    appendFields(
      lines,
      config,
      tab.id,
      true
    );

    appendShow(
      lines,
      config,
      tab.id
    );

    appendTabScreen(
      lines,
      config,
      tab
    );

    lines.push(
      "\t; Fim"
    );

    lines.push(
      `9999\tdo execLabelTabPanel^%CSW1A("${config.sheetId}","9999^${config.routineName}")`
    );

    lines.push(
      "\tquit"
    );

    lines.push("\t;");

    if (app.customButtons) {
      app.customButtons.appendActions(lines, config, tab.id, routineName);
    }

    appendListF7Labels(lines, tab.id, routineName);

    appendValidations(
      lines,
      config,
      tab.id
    );

    appendShowMethod(
      lines,
      routineName
    );

    appendTags(
      lines,
      config,
      tab.id,
      routineName,
      true
    );

    return lines.join("\n");
  }

  function auxiliaryEntries(definition, config) {
    return buildFieldEntries(
      app.fields.fieldsForLocation(definition.key, config)
    );
  }

  function auxiliaryMethodSuffix(definition) {
    return u.toPascal(definition.title || definition.routineName || "Tela auxiliar");
  }

  function auxiliaryKeyFields(definition, config) {
    return auxiliaryEntries(definition, config)
      .map(({ field }) => field)
      .filter(
        (field) =>
          app.fields.isKeyField(field) &&
          !app.fields.isMultiSelect(field)
      );
  }

  function auxiliaryMainIndexArguments(definition, config) {
    const selected = new Set(definition.parameters || []);
    const result = app.indexes
      .effectiveKeyDefinitions(config)
      .filter(({ field }) =>
        selected.has(u.normalizeVariable(field.variable, ""))
      )
      .map(({ field }) => u.normalizeVariable(field.variable, "CAMPO"));

    if (app.indexes.usesRoutineCompany(config)) result.unshift("CE");
    return result;
  }

  function auxiliaryRuleArguments(definition, config) {
    return [
      ...auxiliaryMainIndexArguments(definition, config),
      ...auxiliaryKeyFields(definition, config).map((field) =>
        u.normalizeVariable(field.variable, "CAMPO")
      )
    ];
  }

  function auxiliaryCanLoadAtStart(definition, config) {
    const parameters = new Set(definition.parameters || []);

    return auxiliaryKeyFields(definition, config).every((field) =>
      parameters.has(u.normalizeVariable(field.variable, "CAMPO"))
    );
  }

  function auxiliaryLoadTriggerField(definition, config) {
    const parameters = new Set(definition.parameters || []);
    const pendingKeyFields = auxiliaryKeyFields(definition, config).filter(
      (field) =>
        !parameters.has(u.normalizeVariable(field.variable, "CAMPO"))
    );

    return pendingKeyFields.length
      ? pendingKeyFields[pendingKeyFields.length - 1]
      : null;
  }

  function appendAuxiliaryObtainAfterKey(
    lines,
    definition,
    field,
    config
  ) {
    const triggerField = auxiliaryLoadTriggerField(definition, config);
    if (!triggerField || triggerField.id !== field.id) return;

    const obtainArguments = auxiliaryRuleArguments(definition, config);
    if (!obtainArguments.length) return;

    const dataVariable = String(definition.dataVariable || "DADOSAUX")
      .replace(/[^a-zA-Z0-9%]/g, "") || "DADOSAUX";
    const methodSuffix = auxiliaryMethodSuffix(definition);
    const rgRoutineName =
      definition.rgRoutineName || `${definition.routineName}RG`;
    const obtainCallArguments = [
      ...obtainArguments,
      `.${dataVariable}`
    ].join(",");
    const condition = obtainArguments
      .map((argument) => `${argument}'=""`)
      .join(",");

    lines.push(`\tif ${condition} do`);
    lines.push(
      `\t. set sc=$$Obter${methodSuffix}^${rgRoutineName}(${obtainCallArguments})`
    );
    lines.push(`\t. if $$$ISERR(sc) set ${dataVariable}=""`);
    lines.push("\t. do 8000");
    lines.push("\t;");
  }

  function auxiliaryPieceAssignments(definition, config) {
    const result = new Map();
    let piece = Math.max(1, Number(definition.firstPiece) || 3);

    auxiliaryEntries(definition, config).forEach(({ field }) => {
      if (
        app.fields.isKeyField(field) ||
        app.fields.isMultiSelect(field)
      ) {
        return;
      }

      result.set(field.id, piece);
      piece += 1;
    });

    return result;
  }

  function auxiliaryReference(definition, field, config) {
    if (app.fields.isMultiSelect(field)) {
      return app.fields.multiSelectInputVariable(field);
    }

    if (app.fields.isKeyField(field)) {
      return u.normalizeVariable(field.variable, "CAMPO");
    }

    const piece = auxiliaryPieceAssignments(definition, config).get(field.id);
    const dataVariable = String(definition.dataVariable || "DADOSAUX")
      .replace(/[^a-zA-Z0-9%]/g, "") || "DADOSAUX";

    return `$piece(${dataVariable},Z,${piece})`;
  }

  function auxiliaryRoutineVariables(definition, config) {
    const parameters = new Set(definition.parameters || []);
    const variables = new Set(["sc", "CT", "%PRG", "CONTINUE"]);
    const entries = auxiliaryEntries(definition, config);
    const hasAuxiliaryFields = entries.length > 0;

    if (hasAuxiliaryFields) {
      variables.add(
        String(definition.dataVariable || "DADOSAUX")
          .replace(/[^a-zA-Z0-9%]/g, "") || "DADOSAUX"
      );
    }

    if (app.customButtons && typeof app.customButtons.buttonsForLocation === "function") {
      app.customButtons.buttonsForLocation(definition.key).forEach((button) => {
        const reloadVariable = u.normalizeVariable(button.reloadVariable, "");
        if (reloadVariable) variables.add(reloadVariable);
      });
    }

    entries.forEach(({ field, label }) => {
      if (isScaledValueField(field)) {
        variables.add(decimalInputVariable(label));
      }

      if (app.fields.isKeyField(field)) {
        variables.add(u.normalizeVariable(field.variable, "CAMPO"));
      }

      if (app.fields.isMultiSelect(field)) {
        variables.add(app.fields.multiSelectInputVariable(field));
        variables.add(app.fields.multiSelectTableVariable(field));
        variables.add("SN");
      }

      if (app.fields.usesOptions(field)) {
        variables.add(
          u.normalizeVariable(
            field.optionsVariable,
            app.fields.defaultOptions(field)
          )
        );
      }

      u.parseVariables(field.extraVariables).forEach((variable) =>
        variables.add(variable)
      );

      if (app.fields.usesTypedReader(field)) {
        variables.add(app.fields.typedReaderConfigVariable(field));
      }
    });

    return [...variables].filter((variable) => !parameters.has(variable));
  }

  function renderAuxiliaryFieldCode(
    code,
    definition,
    field,
    label,
    config
  ) {
    const source = String(code || "").trim();
    if (!source) return [];

    const fieldReference = auxiliaryReference(
      definition,
      field,
      config
    );

    const replacements = {
      "{variable}": fieldReference,
      "{reference}": fieldReference,
      "{fieldVariable}": app.fields.isMultiSelect(field)
        ? app.fields.multiSelectInputVariable(field)
        : u.normalizeVariable(field.variable),
      "{display}": `ds${label}`,
      "{label}": String(label),
      "{company}": companyMacArgument(),
      "{rgRoutine}": config.rgRoutineName,
      "{routine}": definition.routineName,
      "{fieldDescription}": u.escapeMac(field.description),
      "{multiTable}": app.fields.isMultiSelect(field)
        ? app.fields.multiSelectTableVariable(field)
        : "",
      "{multiSelectedText}": u.escapeMac(
        field.multiSelectSelectedText || "Selecionados"
      )
    };

    let result = source;

    Object.entries(replacements).forEach(([token, value]) => {
      result = result.split(token).join(value);
    });

    return result.split(/\r?\n/);
  }

  function renderAuxiliaryValcpCode(definition, field, label, config) {
    return stripScreenOpeningFromValcp(
      renderAuxiliaryFieldCode(
        field.valcpCode,
        definition,
        field,
        label,
        config
      )
    );
  }

  function renderAuxiliaryAfterFieldCode(definition, field, label, config) {
    return renderAuxiliaryFieldCode(
      field.afterFieldCode,
      definition,
      field,
      label,
      config
    );
  }

  function appendAuxiliaryGeneratedTables(lines, definition, config) {
    app.fields
      .generatedOptionTablesForLocation(definition.key)
      .forEach((field) => {
        const table = u.normalizeVariable(
          field.optionsVariable,
          "TABELA"
        );
        const items = Array.isArray(field.optionsItems)
          ? field.optionsItems
          : [];

        lines.push(`\tkill ${table}`);
        items.forEach((item) => {
          const rawValue = String(item.value ?? "").trim();
          const subscript = /^-?(?:\d+|\d+\.\d+)$/.test(rawValue)
            ? rawValue
            : `"${u.escapeMac(rawValue)}"`;

          lines.push(
            `\tset ${table}(${subscript})="${u.escapeMac(item.description)}"`
          );
        });
        lines.push("\t;");
      });
  }

  function appendAuxiliaryFields(lines, definition, config) {
    const entries = auxiliaryEntries(definition, config);

    entries.forEach(({ field, index, label, step }) => {
      const previous = index === 0
        ? "9999"
        : String(entries[index - 1].label);
      const reference = auxiliaryReference(
        definition,
        field,
        config
      );

      lines.push(`\t; ${u.sanitize(field.description)}`);
      lines.push(`${label}\t;`);

      const decimalInitialization = decimalInitializeLine(field, label, reference);

      if (app.fields.hasDisplay(field)) {
        lines.push(
          `${label}ON\tdo ClearCp^%CSW1UTI("ds${label}")`
        );
        if (decimalInitialization) lines.push(`\t${decimalInitialization}`);
        lines.push(`\t${component(field, label, reference)}`);
      } else if (decimalInitialization) {
        lines.push(`${label}ON\t${decimalInitialization}`);
        lines.push(`\t${component(field, label, reference)}`);
      } else {
        lines.push(`${label}ON\t${component(field, label, reference)}`);
      }

      lines.push("\tquit:$$CSP^%CSW1UTI()");
      lines.push("\t;");
      lines.push(
        index === 0
          ? `${label}EX\tgoto 9999:%=27!(%=140)`
          : `${label}EX\tgoto 9999:%=27,${previous}:%=140`
      );
      lines.push("\t;");
      const decimalPersistence = decimalPersistLine(field, label, reference);
      if (decimalPersistence) {
        lines.push(`\t${decimalPersistence}`);
        decimalRefreshLines(field, label, reference).forEach((line) => {
          lines.push(`\t${line}`);
        });
        lines.push("\t;");
      }

      lines.push(`\tif '$$Valcp${label}() goto ${label}`);
      lines.push("\t;");

      appendAuxiliaryObtainAfterKey(
        lines,
        definition,
        field,
        config
      );

      const afterFieldLines = renderAuxiliaryAfterFieldCode(
        definition,
        field,
        label,
        config
      );
      if (afterFieldLines.length) {
        appendRenderedFieldCode(lines, afterFieldLines);
        lines.push("\t;");
      }

      if (app.fields.isMultiSelect(field)) {
        const tableVariable = app.fields.multiSelectTableVariable(field);
        const nextLabel = index === entries.length - 1
          ? "2999"
          : String(entries[index + 1].label);
        const includeLabel = label + Math.max(1, Math.floor(step / 2));

        lines.push(`\tif ${reference}="" goto ${nextLabel}`);
        lines.push(
          `\tif '$data(${tableVariable}(${reference})) goto ${includeLabel}`
        );
        lines.push("\t;");
        lines.push(`\t; Excluir ${u.sanitize(field.description)}`);
        lines.push("\t;");
        lines.push(
          `\tdo SN^%CSUTIUD(,,,"${u.escapeMac(field.description)} já selecionado! Deseja excluir?","N","${label}SN1^${definition.routineName}")`
        );
        lines.push("\tquit:$$CSP^%CSW1UTI()");
        lines.push("\t;");
        lines.push(
          `${label}SN1\tkill:SN="S" ${tableVariable}(${reference})`
        );
        lines.push(`\tgoto ${label}`);
        lines.push("\t;");
        lines.push(`\t; Gravar ${u.sanitize(field.description)}`);
        lines.push("\t;");
        lines.push(
          `${includeLabel}\tdo SN^%CSUTIUD(,,,,,"${includeLabel}SN1^${definition.routineName}")`
        );
        lines.push("\tquit:$$CSP^%CSW1UTI()");
        lines.push("\t;");
        lines.push(
          `${includeLabel}SN1\tset:SN="S" ${tableVariable}(${reference})=""`
        );
        lines.push(`\tgoto ${label}`);
        lines.push("\t;");
      }
    });

    lines.push("\t; Foco final");
    lines.push("\t;");
    lines.push('2999\tdo Focus^%CSW1UTI(%PRG,"btSalvar",,1) quit');
    lines.push("\t;");
  }

  function appendAuxiliaryShow(lines, definition, config) {
    const entries = auxiliaryEntries(definition, config);

    lines.push("\t; Mostrar Dados");
    lines.push("\t;");
    lines.push("8000\t;");

    entries.forEach(({ field, label }) => {
      const reference = auxiliaryReference(
        definition,
        field,
        config
      );

      if (app.fields.isMultiSelect(field)) {
        const tableVariable = app.fields.multiSelectTableVariable(field);
        const selectedText = u.escapeMac(
          field.multiSelectSelectedText || "Selecionados"
        );

        lines.push(`\tdo Set^%CSW1UTI(%PRG,"cp${label}","")`);

        if (app.fields.hasDisplay(field)) {
          lines.push(
            `\tif $data(${tableVariable}) do Set^%CSW1UTI(%PRG,"ds${label}","${selectedText}")`
          );
          lines.push(
            `\tif '$data(${tableVariable}) do ClearCp^%CSW1UTI("ds${label}")`
          );
        }
        return;
      }

      if (["combo", "checkbox", "radio"].includes(field.type)) {
        const names = {
          combo: "Combo",
          checkbox: "Check",
          radio: "Radio"
        };
        const table = u.normalizeVariable(
          field.optionsVariable,
          app.fields.defaultOptions(field)
        );

        lines.push(
          `\tdo Inicializa${names[field.type]}^%CSW1A("cp${label}",.${table},0,${reference},,,1)`
        );
      } else {
        const format = field.type === "date"
          ? ',"d"'
          : ["float", "decimal"].includes(field.type)
            ? `,"${decimalFormat(field)}"`
            : "";

        lines.push(
          `\tdo Set^%CSW1UTI(%PRG,"cp${label}",${reference}${format})`
        );
      }

      if (app.fields.hasDisplay(field)) {
        const mode = field.displayLoadMode ||
          (String(field.valcpCode || "").trim()
            ? "valcp"
            : "reference");

        if (mode === "valcp" && String(field.valcpCode || "").trim()) {
          lines.push(
            `\tif ${reference}="" do Set^%CSW1UTI(%PRG,"ds${label}","")`
          );
          lines.push(
            `\tif ${reference}'="" set sc=$$Valcp${label}()`
          );
        } else if (mode === "custom") {
          const customLines = renderAuxiliaryFieldCode(
            field.displayLoadCode,
            definition,
            field,
            label,
            config
          );

          if (customLines.length) {
            customLines.forEach((line) =>
              lines.push(line.trim() === ";" ? "\t;" : `\t${line}`)
            );
          } else {
            lines.push(
              `\tdo Set^%CSW1UTI(%PRG,"ds${label}",${reference})`
            );
          }
        } else {
          lines.push(
            `\tdo Set^%CSW1UTI(%PRG,"ds${label}",${reference})`
          );
        }
      }
    });

    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
  }

  function appendAuxiliaryOptionInitializers(lines, definition, config) {
    auxiliaryEntries(definition, config).forEach(({ field, label }) => {
      if (!["combo", "checkbox", "radio"].includes(field.type)) return;

      const names = {
        combo: "Combo",
        checkbox: "Check",
        radio: "Radio"
      };
      const table = u.normalizeVariable(
        field.optionsVariable,
        app.fields.defaultOptions(field)
      );

      lines.push(
        `\tdo Inicializa${names[field.type]}^%CSW1A("cp${label}",.${table},0,,,,1)`
      );
    });
  }

  function appendAuxiliaryValidations(lines, definition, config) {
    const entries = auxiliaryEntries(definition, config);

    entries.forEach(({ field, label }) => {
      const reference = auxiliaryReference(
        definition,
        field,
        config
      );

      lines.push(`\t; Método Valcp${label}()`);
      lines.push("\t;");
      lines.push(`Valcp${label}()\t;`);

      if (field.required && !app.fields.isMultiSelect(field)) {
        lines.push(
          `\tif ${reference}="" do ME^%CSUTIUD("${u.escapeMac(field.description)}: Campo obrigatório!") quit 0`
        );
        lines.push("\t;");
      }

      const customLines = renderAuxiliaryValcpCode(
        definition,
        field,
        label,
        config
      );

      if (customLines.length) {
        customLines.forEach((line) =>
          lines.push(line.trim() === ";" ? "\t;" : `\t${line}`)
        );
        lines.push("\t;");
      } else if (app.fields.hasDisplay(field)) {
        lines.push(
          `\tdo Set^%CSW1UTI(%PRG,"ds${label}",${reference})`
        );
        lines.push("\t;");
      }

      lines.push("\tquit $$$OK");
      lines.push("\t;");
    });

    lines.push("\t; Método Validate()");
    lines.push("\t;");
    lines.push("Validate()\t;");

    entries.forEach(({ label }) => {
      lines.push(
        `\tif '$$Valcp${label}() do Focus^%CSW1UTI(%PRG,"cp${label}") quit 0`
      );
    });

    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
  }

  function appendAuxiliaryTags(lines, definition, config) {
    auxiliaryEntries(definition, config).forEach(({ field, label }) => {
      const required = field.required ? "*" : "";

      lines.push(
        `\t; csw:label:${field.labelColumn},${field.labelLine},${field.labelSize},${u.sanitize(field.description)}${required}`
      );

      if (app.fields.hasDisplay(field)) {
        lines.push(
          `\t; csw:display:${field.displayColumn},${field.displayLine},${field.displaySize},ds${label}`
        );
      }
    });

    if (auxiliaryEntries(definition, config).length) {
      lines.push("\t;");
    }
  }

  function generateAuxiliaryScreen(definition) {
    const config = app.getConfig();
    const button = definition.button;
    const routineName = definition.routineName;
    const parameters = definition.parameters || [];
    const entries = auxiliaryEntries(definition, config);
    const internalVariables = auxiliaryRoutineVariables(
      definition,
      config
    );
    const dataVariable = String(definition.dataVariable || "DADOSAUX")
      .replace(/[^a-zA-Z0-9%]/g, "") || "DADOSAUX";
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const lines = [];
    const extraNames = String(button.extraParameterNames || "")
      .split(/[;,\s]+/)
      .map((item) => u.normalizeVariable(item, ""))
      .filter(Boolean);
    const extraArguments = String(button.extraCallArguments || "")
      .split(",")
      .map((item) => item.trim());
    const argumentByParameter = new Map();

    (app.customButtons.availableParameters(button, config) || []).forEach((item) => {
      if ((button.selectedParameters || []).includes(item.variable)) {
        argumentByParameter.set(item.variable, item.variable);
      }
    });

    extraNames.forEach((parameter, index) => {
      argumentByParameter.set(parameter, extraArguments[index] || "");
    });

    lines.push(`ROUTINE ${routineName}`);
    lines.push(
      `${routineName}(${parameters.join(",")})\t; ${month}/${year} - ${u.escapeMac(definition.title || "Tela auxiliar")}`
    );
    lines.push("\t;");
    lines.push("\t#include %CSUTICSP");
    lines.push("\t;");
    lines.push(`0000\tdo New^%CSW1UTI("${internalVariables.join(",")}")`);
    lines.push(`\tnew ${internalVariables.join(",")}`);
    lines.push("\t;");
    lines.push(`\tset %PRG="${routineName}"`);
    lines.push("\tset CT=%index");
    lines.push("\t;");

    parameters.forEach((parameter) => {
      const argument = argumentByParameter.get(parameter) || "";

      if (argument.startsWith(".")) {
        lines.push(`\tkill ${parameter}`);
      } else {
        lines.push(`\tset ${parameter}=$get(${parameter})`);
      }
    });

    if (parameters.length) lines.push("\t;");

    lines.push("\tset sc=$$ValidarExecucaoCSW^%CSUTIRG001()");
    lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
    lines.push("\t;");
    appendTypedReaderConfigurations(
      lines,
      entries.map(({ field }) => field)
    );
    lines.push(
      `\t; csw:aj:${config.windowWidth},${config.windowHeight},${u.sanitize(definition.title || "Tela auxiliar")}`
    );
    lines.push(
      `\tdo AJ^%CSUTIUD(${config.windowWidth},${config.windowHeight},"${u.escapeMac(definition.title || "Tela auxiliar")}")`
    );
    lines.push("\t;");
    appendAuxiliaryGeneratedTables(lines, definition, config);
    lines.push("\t; Inicializar Variáveis");
    lines.push("\t;");

    const resets = new Set(["CONTINUE"]);
    if (entries.length && !parameters.includes(dataVariable)) {
      resets.add(dataVariable);
    }

    entries.forEach(({ field }) => {
      const fieldVariable = app.fields.isMultiSelect(field)
        ? app.fields.multiSelectInputVariable(field)
        : u.normalizeVariable(field.variable, "CAMPO");

      if (
        (app.fields.isKeyField(field) || app.fields.isMultiSelect(field)) &&
        !parameters.includes(fieldVariable)
      ) {
        resets.add(fieldVariable);
      }
    });

    lines.push(`0500\tset (${[...resets].join(",")})=""`);
    lines.push("\t;");

    if (entries.length && auxiliaryCanLoadAtStart(definition, config)) {
      const obtainArguments = auxiliaryRuleArguments(definition, config);
      const obtainCallArguments = [
        ...obtainArguments,
        `.${dataVariable}`
      ].join(",");
      const methodSuffix = auxiliaryMethodSuffix(definition);
      const rgRoutineName = definition.rgRoutineName || `${routineName}RG`;

      if (obtainArguments.length) {
        lines.push(`\tif ${obtainArguments.map((argument) => `${argument}'=""`).join(",")} do`);
        lines.push(`\t. set sc=$$Obter${methodSuffix}^${rgRoutineName}(${obtainCallArguments})`);
        lines.push(`\t. if $$$ISERR(sc) set ${dataVariable}=""`);
      } else {
        lines.push(`\tset sc=$$Obter${methodSuffix}^${rgRoutineName}(${obtainCallArguments})`);
        lines.push(`\tif $$$ISERR(sc) set ${dataVariable}=""`);
      }

      lines.push("\t;");
    }

    lines.push("\tdo 9000,8000");
    lines.push("\t;");
    lines.push(entries.length ? "\tgoto 1000" : "\tgoto 2999");
    lines.push("\t;");

    appendAuxiliaryFields(lines, definition, config);

    lines.push("\t; Salvar");
    lines.push("\t;");
    lines.push("3000\tif '$$Validate() quit");
    lines.push("\t;");

    if (entries.length) {
      const saveArguments = [
        ...auxiliaryRuleArguments(definition, config),
        dataVariable
      ].join(",");
      const methodSuffix = auxiliaryMethodSuffix(definition);
      const rgRoutineName = definition.rgRoutineName || `${routineName}RG`;

      lines.push(`\tset sc=$$Gravar${methodSuffix}^${rgRoutineName}(${saveArguments})`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
      lines.push("\t;");
    }

    lines.push(
      `\tdo MECABECALHO^%CSW1UTI("${u.escapeMac(definition.title || "Registro")} salvo com sucesso!")`
    );

    const reloadVariable = u.normalizeVariable(button.reloadVariable, "");
    if (reloadVariable && parameters.includes(reloadVariable)) {
      lines.push("\t;");
      lines.push(`\tset ${reloadVariable}=1`);
    }

    if (definition.saveAnother) {
      lines.push("\t;");
      lines.push("\tif $get(CONTINUE) goto 0500");
    }

    lines.push("\t;");
    lines.push("\tgoto 9999");
    lines.push("\t;");

    if (definition.saveAnother) {
      lines.push("\t; Salvar e Continuar");
      lines.push("\t;");
      lines.push("3050\tset CONTINUE=1");
      lines.push("\t;");
      lines.push("\tgoto 3000");
      lines.push("\t;");
    }

    if (app.customButtons) {
      app.customButtons.appendActions(
        lines,
        config,
        definition.key,
        routineName
      );
    }

    appendAuxiliaryShow(lines, definition, config);

    lines.push("\t; Tela");
    lines.push("\t;");
    lines.push("9000\tdo Clear^%CSW1UTI()");
    lines.push("\tdo Enable^%CSW1UTI()");
    appendAuxiliaryOptionInitializers(lines, definition, config);
    lines.push("\t;");
    lines.push('\tdo HabBotGeral^%CSW1("btSalvar",1)');

    if (definition.saveAnother) {
      lines.push('\tdo HabBotGeral^%CSW1("btSalvarNovo",1)');
    }

    if (app.customButtons) {
      app.customButtons.appendInitializers(lines, definition.key);
    }

    lines.push('\tdo HabBotGeral^%CSW1("btCancelar",1)');
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
    lines.push("\t; Fim");
    lines.push("\t;");
    lines.push("9999\tdo FJ^%CSUTIUD");
    lines.push("\tdo FJ^%CSW1UTI");
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");

    appendAuxiliaryValidations(lines, definition, config);
    appendShowMethod(lines, routineName);
    lines.push("\t; Tags CSW");
    lines.push("\t;");
    appendAuxiliaryTags(lines, definition, config);

    if (app.customButtons) {
      app.customButtons.appendTags(lines, definition.key, routineName);
    }

    lines.push(
      `\t; csw:botao:1,${config.windowHeight - 3},btSalvar,<u>S</u>alvar,s,3000^${routineName},salvar,Salvar,15`
    );

    if (definition.saveAnother) {
      lines.push(
        `\t; csw:botao:16,${config.windowHeight - 3},btSalvarNovo,S<u>a</u>lvar e Criar Outro,a,3050^${routineName},salvar,Salvar e Continuar Cadastrando,18`
      );
      lines.push(
        `\t; csw:botao:36,${config.windowHeight - 3},btCancelar,<u>C</u>ancelar,c,9999^${routineName},cancelar,Cancelar,15`
      );
    } else {
      lines.push(
        `\t; csw:botao:16,${config.windowHeight - 3},btCancelar,<u>C</u>ancelar,c,9999^${routineName},cancelar,Cancelar,15`
      );
    }

    lines.push("\t;");
    lines.push(`\t; csw:labelcreate:${routineName}`);
    lines.push("\t; csw:labeldestroy:9999");
    lines.push("\t; csw:csp:gerar");

    return lines.join("\n");
  }

  function generateAll() {
    const config =
      app.getConfig();

    const result = {
      parent: {
        label:
          config.routineMode === "grid"
            ? "Rotina Grid principal"
            : "Rotina principal",

        routineName:
          config.routineName,

        code:
          config.routineMode === "grid"
            ? app.grid.generateInterfaceFor("parent", config)
            : generateParent()
      }
    };

    if (config.useTabs) {
      state.tabs.forEach(
        (tab, index) => {
          const key =
            `tab-${tab.id}`;

          const routineName =
            u.normalizeVariable(
              tab.routineName,
              `${config.routineName}TAB${index + 1}`
            );

          result[key] = {
            label:
              `Aba ${index + 1} - ${tab.title}`,

            routineName,

            code:
              tab.contentType === "grid"
                ? app.grid.generateInterfaceFor(tab.id, config)
                : generateTab(
                    tab,
                    index
                  )
          };
        }
      );
    }

    if (
      app.customButtons &&
      typeof app.customButtons.generatedScreenDefinitions === "function"
    ) {
      app.customButtons
        .generatedScreenDefinitions(config)
        .forEach((definition, index) => {
          result[`button-screen-${definition.button.id}`] = {
            label: `Tela auxiliar ${definition.routineName} — ${definition.title}`,
            routineName: definition.routineName,
            code: generateAuxiliaryScreen(definition, index)
          };
        });
    }

    if (
      app.customButtons &&
      typeof app.customButtons.duplicateScreenDefinitions === "function"
    ) {
      app.customButtons
        .duplicateScreenDefinitions(config)
        .forEach((definition) => {
          result[`duplicate-${definition.button.id}`] = {
            label: `Tela de duplicação ${definition.routineName}`,
            routineName: definition.routineName,
            code: generateDuplicateScreen(definition, config)
          };
        });
    }

    if (
      app.customButtons &&
      typeof app.customButtons.justifyScreenDefinitions === "function"
    ) {
      app.customButtons
        .justifyScreenDefinitions(config)
        .forEach((definition) => {
          result[`justify-${definition.button.id}`] = {
            label: `Tela de justificativa ${definition.routineName}`,
            routineName: definition.routineName,
            code: generateJustifyScreen(definition, config)
          };
        });
    }

    if (app.f7 && typeof app.f7.generateAll === "function") {
      Object.assign(result, app.f7.generateAll(config));
    }

    return result;
  }

  function generateInputScreen(definition, config) {
    const now = new Date();
    const period = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const routine = definition.routineName;
    const title = u.escapeMac(definition.title);
    const parameters = definition.parameters.map((item) => u.normalizeVariable(item)).filter(Boolean);
    const fields = definition.fields.map((field, index) => ({
      ...field,
      label: String(1000 + index * 100),
      variable: u.normalizeVariable(field.variable, `CAMPO${index + 1}`),
      line: Number(field.line) || index * 2 + 1,
      column: Number(field.column) || 15,
      labelSize: Number(field.labelSize) || 13,
      size: Number(field.size) || 10
    }));
    const fieldVariables = fields.map((field) => field.variable);
    const extra = u.parseVariables(definition.extraVariables);
    const variables = [...new Set(["sc", "CT", "%PRG", ...fieldVariables, ...extra])].filter((variable) => !parameters.includes(variable));
    const height = Math.max(8, Math.max(...fields.map((field) => field.line)) + 5);
    const width = Number(definition.width) || 70;
    const rule = definition.rule || "TODO";
    const lines = [];

    lines.push(`ROUTINE ${routine}`);
    lines.push(`${routine}(${parameters.join(",")})\t; ${period} - ${title}`);
    lines.push("\t;");
    lines.push("\t#include %CSUTICSP");
    lines.push("\t;");
    lines.push(`0000\tdo New^%CSW1UTI("${variables.join(",")}")`);
    lines.push(`\tnew ${variables.join(",")}`);
    lines.push("\t;");
    lines.push(`\tset %PRG="${routine}"`);
    lines.push("\tset CT=%index");
    lines.push("\t;");
    lines.push("\tset sc=$$ValidarExecucaoCSW^%CSUTIRG001()");
    lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
    lines.push("\t;");
    lines.push(`\t; csw:aj:${width},${height},${title}`);
    lines.push(`\tdo AJ^%CSUTIUD(${width},${height},"${title}")`);
    lines.push("\t;");
    lines.push(`0500\tset (${fieldVariables.join(",")})=""`);
    fields
      .filter((field) => String(field.defaultValue ?? "") !== "")
      .forEach((field) => lines.push(`\tset ${field.variable}=${field.defaultValue}`));
    lines.push("\t;");
    lines.push("\tdo 9000,8000");
    lines.push("\t;");

    fields.forEach((field, index) => {
      const previous = index === 0 ? "9999" : fields[index - 1].label;
      const next = index === fields.length - 1 ? "2999" : fields[index + 1].label;
      const mask = field.type === "integer" ? '"@\'?.N"' : "";
      const lookup = String(field.f7Routine || "").trim();
      const f8 = String(field.f8Routine || "").trim();
      lines.push(`\t; ${u.sanitize(field.description)}`);
      lines.push(`${field.label}\t;`);
      if (field.hasDisplay) lines.push(`${field.label}ON\tdo ClearCp^%CSW1UTI("ds${field.label}")`);
      lines.push(`${field.hasDisplay ? "" : `${field.label}ON`}\tdo ^%CSLE(${field.line},${field.column},${field.size},"${field.variable}",${field.variable},${mask},${field.required ? 1 : ""},,"${f8},${lookup},,cp${field.label}")`);
      lines.push("\tquit:$$CSP^%CSW1UTI()");
      lines.push("\t;");
      lines.push(`${field.label}EX\tgoto 9999:%=27${index ? `,${previous}:%=140` : ""}`);
      lines.push("\t;");
      lines.push(`\tif '$$Valcp${field.label}() goto ${field.label}`);
      lines.push("\t;");
      lines.push(`\tgoto ${next}`);
      lines.push("\t;");
    });

    lines.push('2999\tdo Focus^%CSW1UTI(%PRG,"btConfirmar") quit');
    lines.push("\t;");
    lines.push("\t; Confirmar");
    lines.push("3000\tif '$$Validate() quit");
    lines.push("\t;");
    if (definition.rule) {
      lines.push(`\tset sc=$$${rule}^${config.rgRoutineName}(${[...parameters, ...fieldVariables].join(",")})`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
    } else {
      lines.push("\t; TODO: informar justifyRule no botão para chamar a regra com os campos.");
    }
    lines.push("\t;");
    lines.push("\tgoto 9999");
    lines.push("\t;");
    lines.push("\t; Mostrar Dados");
    lines.push("8000\t;");
    fields.forEach((field) => {
      lines.push(`\tdo Set^%CSW1UTI(%PRG,"cp${field.label}",${field.variable})`);
    });
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
    lines.push("\t; Tela");
    lines.push("9000\tdo Clear^%CSW1UTI()");
    lines.push("\tdo Enable^%CSW1UTI()");
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
    lines.push("\t; Fim");
    lines.push("9999\tdo FJ^%CSUTIUD");
    lines.push("\tdo FJ^%CSW1UTI");
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");

    fields.forEach((field) => {
      lines.push(`\t; Método Valcp${field.label}()`);
      lines.push(`Valcp${field.label}()\t;`);
      if (field.required) {
        lines.push(`\tif ${field.variable}="" do ME^%CSUTIUD("${u.escapeMac(field.description)}: Campo obrigatório!") quit 0`);
      }
      u.renderHookLines(field.valcpCode).forEach((line) => lines.push(line));
      lines.push("\t;");
      lines.push("\tquit $$$OK");
      lines.push("\t;");
    });

    lines.push("\t; Método Validate()");
    lines.push("Validate()\t;");
    fields.forEach((field) => {
      lines.push(`\tif '$$Valcp${field.label}() do Focus^%CSW1UTI(%PRG,"cp${field.label}") quit 0`);
    });
    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
    lines.push("\t; Método Show");
    lines.push("Show(%cswP1,%cswP2,%cswP3,%cswP4)\t;");
    lines.push(`\tdo Show^%CSW1UTI("${routine}",$get(%cswP1),$get(%cswP2),$get(%cswP3),$get(%cswP4))`);
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
    lines.push("\t; Tags CSW");
    lines.push("\t;");
    fields.forEach((field) => {
      lines.push(`\t; csw:label:1,${field.line},${field.labelSize},${u.escapeMac(field.description)}${field.required ? "*" : ""}`);
      if (field.hasDisplay) {
        lines.push(`\t; csw:display:${field.column + field.size + 2},${field.line},${Number(field.displaySize) || 30},ds${field.label}`);
      }
    });
    lines.push("\t;");
    lines.push(`\t; csw:botao:15,${height - 2},btConfirmar,C<u>o</u>nfirmar,o,3000^${routine},check,Confirmar,15`);
    lines.push(`\t; csw:botao:31,${height - 2},btCancelar,<u>C</u>ancelar,c,9999^${routine},cancelar,Cancelar,15`);
    lines.push("\t;");
    lines.push(`\t; csw:labelcreate:${routine}`);
    lines.push("\t; csw:labeldestroy:9999");
    lines.push("\t; csw:csp:gerar");

    return lines.join("\n");
  }

  function generateJustifyScreen(definition, config) {
    if (Array.isArray(definition.fields) && definition.fields.length) {
      return generateInputScreen(definition, config);
    }
    const now = new Date();
    const period = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const routine = definition.routineName;
    const title = u.escapeMac(definition.title);
    const fieldLabel = u.escapeMac(definition.fieldLabel);
    const parameters = definition.parameters.map((item) => u.normalizeVariable(item)).filter(Boolean);
    const variables = ["sc", "CT", "%PRG", "JUSTIF"].filter((variable) => !parameters.includes(variable));
    const rule = definition.rule || "TODO";
    const lines = [];

    lines.push(`ROUTINE ${routine}`);
    lines.push(`${routine}(${parameters.join(",")})\t; ${period} - ${title}`);
    lines.push("\t;");
    lines.push("\t#include %CSUTICSP");
    lines.push("\t;");
    lines.push(`0000\tdo New^%CSW1UTI("${variables.join(",")}")`);
    lines.push(`\tnew ${variables.join(",")}`);
    lines.push("\t;");
    lines.push(`\tset %PRG="${routine}"`);
    lines.push("\tset CT=%index");
    lines.push("\t;");
    lines.push("\tset sc=$$ValidarExecucaoCSW^%CSUTIRG001()");
    lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
    lines.push("\t;");
    lines.push(`\t; csw:aj:70,10,${title}`);
    lines.push(`\tdo AJ^%CSUTIUD(70,10,"${title}")`);
    lines.push("\t;");
    lines.push('0500\tset JUSTIF=""');
    lines.push("\t;");
    lines.push("\tdo 9000");
    lines.push("\t;");
    lines.push(`\t; ${u.sanitize(definition.fieldLabel)}`);
    lines.push(`1000ON\tdo ^%CSW1UTITXTAREA(1,15,${definition.maxLength},"JUSTIF",JUSTIF,,",cp1000,,,1",54,5,0)`);
    lines.push("\tquit:$$CSP^%CSW1UTI()");
    lines.push("\t;");
    lines.push("1000EX\tgoto 9999:%=27");
    lines.push("\t;");
    lines.push("\tif '$$Valcp1000() goto 1000ON");
    lines.push("\t;");
    lines.push('2999\tdo Focus^%CSW1UTI(%PRG,"btConfirmar") quit');
    lines.push("\t;");
    lines.push("\t; Confirmar");
    lines.push("3000\tif '$$Valcp1000() quit");
    lines.push("\t;");
    if (definition.rule) {
      lines.push(`\tset sc=$$${rule}^${config.rgRoutineName}(${[...parameters, "JUSTIF"].join(",")})`);
      lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
    } else {
      lines.push("\t; TODO: informar justifyRule no botão para chamar a regra com a justificativa.");
    }
    lines.push("\t;");
    lines.push("\tgoto 9999");
    lines.push("\t;");
    lines.push("\t; Tela");
    lines.push("9000\tdo Clear^%CSW1UTI()");
    lines.push("\tdo Enable^%CSW1UTI()");
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
    lines.push("\t; Fim");
    lines.push("9999\tdo FJ^%CSUTIUD");
    lines.push("\tdo FJ^%CSW1UTI");
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
    lines.push("\t; Método Valcp1000()");
    lines.push("Valcp1000()\t;");
    lines.push(`\tif $translate(JUSTIF," ")="" do ME^%CSUTIUD("${fieldLabel}: Campo obrigatório!") quit 0`);
    lines.push("\t;");
    lines.push("\tquit $$$OK");
    lines.push("\t;");
    lines.push("\t; Método Show");
    lines.push("Show(%cswP1,%cswP2,%cswP3,%cswP4)\t;");
    lines.push(`\tdo Show^%CSW1UTI("${routine}",$get(%cswP1),$get(%cswP2),$get(%cswP3),$get(%cswP4))`);
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
    lines.push("\t; Tags CSW");
    lines.push("\t;");
    lines.push(`\t; csw:label:1,1,13,${fieldLabel}*`);
    lines.push("\t;");
    lines.push(`\t; csw:botao:15,8,btConfirmar,C<u>o</u>nfirmar,o,3000^${routine},check,Confirmar,15`);
    lines.push(`\t; csw:botao:31,8,btCancelar,<u>C</u>ancelar,c,9999^${routine},cancelar,Cancelar,15`);
    lines.push("\t;");
    lines.push(`\t; csw:labelcreate:${routine}`);
    lines.push("\t; csw:labeldestroy:9999");
    lines.push("\t; csw:csp:gerar");

    return lines.join("\n");
  }

  function generateDuplicateScreen(definition, config) {
    const now = new Date();
    const period = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const routine = definition.routineName;
    const target = definition.targetVariable;
    const description = `${definition.keyDescription} Destino`;
    const labelSize = Math.max(15, description.length + 1);
    const inputColumn = labelSize + 2;
    const size = Number(definition.keyField.inputSize) || 6;
    const field = {
      ...definition.keyField,
      id: `duplicate-${definition.button.id}`,
      variable: target,
      description,
      tabId: "parent",
      isKey: true,
      tabKey: false,
      required: true,
      labelColumn: 1,
      labelLine: 1,
      labelSize,
      inputColumn,
      inputLine: 1,
      inputSize: size,
      displayColumn: inputColumn + size + 2,
      displayLine: 1,
      displaySize: 30
    };
    const hasDisplay = app.fields.hasDisplay(field);
    const width = Math.max(60, field.displayColumn + (hasDisplay ? 32 : 2));
    const variables = [
      "sc",
      "CT",
      "%PRG",
      target,
      ...u.parseVariables(definition.keyField.extraVariables)
    ].filter((variable, position, all) =>
      variable !== definition.keyVariable && all.indexOf(variable) === position
    );
    const ruleArguments = [
      ...app.indexes.macArguments(),
      target
    ];
    const lines = [];

    lines.push(`ROUTINE ${routine}`);
    lines.push(`${routine}(${definition.keyVariable})\t; ${period} - ${u.escapeMac(definition.title)}`);
    lines.push("\t;");
    lines.push("\t#include %CSUTICSP");
    lines.push("\t;");
    lines.push(`0000\tdo New^%CSW1UTI("${variables.join(",")}")`);
    lines.push(`\tnew ${variables.join(",")}`);
    lines.push("\t;");
    lines.push(`\tset %PRG="${routine}"`);
    lines.push("\tset CT=%index");
    lines.push("\t;");
    lines.push("\tset sc=$$ValidarExecucaoCSW^%CSUTIRG001()");
    lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
    lines.push("\t;");
    lines.push(`\t; csw:aj:${width},6,${definition.title}`);
    lines.push(`\tdo AJ^%CSUTIUD(${width},6,"${u.escapeMac(definition.title)}")`);
    lines.push("\t;");
    lines.push(`0500\tset ${target}=""`);
    lines.push("\t;");
    lines.push("\tdo 9000");
    lines.push("\t;");
    lines.push(`\t; ${u.sanitize(description)}`);
    lines.push("1000\t;");
    lines.push(hasDisplay ? '1000ON\tdo ClearCp^%CSW1UTI("ds1000")' : `1000ON\t${component(field, "1000", target)}`);
    if (hasDisplay) lines.push(`\t${component(field, "1000", target)}`);
    lines.push("\tquit:$$CSP^%CSW1UTI()");
    lines.push("\t;");
    lines.push("1000EX\tgoto 9999:%=27!(%=140)");
    lines.push("\t;");
    lines.push("\tif '$$Valcp1000() goto 1000");
    lines.push("\t;");
    lines.push('2999\tdo Focus^%CSW1UTI(%PRG,"btConfirmar") quit');
    lines.push("\t;");
    lines.push("\t; Confirmar");
    lines.push("3000\tif '$$Valcp1000() quit");
    lines.push("\t;");
    lines.push(`\tset sc=$$Duplicar${config.entityName}^${config.rgRoutineName}(${ruleArguments.join(",")})`);
    lines.push("\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) quit");
    lines.push("\t;");
    lines.push(`\tdo MECABECALHO^%CSW1UTI("${u.escapeMac(config.title)} duplicada para "_${target}_"!")`);
    lines.push("\t;");
    lines.push("\tgoto 9999");
    lines.push("\t;");
    lines.push("\t; Tela");
    lines.push("9000\tdo Clear^%CSW1UTI()");
    lines.push("\tdo Enable^%CSW1UTI()");
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
    lines.push("\t; Fim");
    lines.push("9999\tdo FJ^%CSUTIUD");
    lines.push("\tdo FJ^%CSW1UTI");
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
    lines.push("\t; Método Valcp1000()");
    lines.push("Valcp1000()\t;");
    lines.push(`\tif ${target}="" do ME^%CSUTIUD("${u.escapeMac(description)}: Campo obrigatório!") quit 0`);
    lines.push(`\tif ${target}=${definition.keyVariable} do ME^%CSUTIUD("${u.escapeMac(description)} igual ao de origem!") quit 0`);
    lines.push("\t;");
    const custom = renderValcpCode(field, "1000", config).filter(
      (line) => !/Campo obrigatório!"\) quit 0$/.test(line.trim())
    );
    while (custom.length && custom[0].trim() === ";") custom.shift();
    if (custom.length) {
      custom.forEach((line) => lines.push(line.trim() === ";" ? "\t;" : `\t${line}`));
      lines.push("\t;");
    }
    lines.push("\tquit $$$OK");
    lines.push("\t;");
    lines.push("\t; Método Show");
    lines.push("Show(%cswP1,%cswP2,%cswP3,%cswP4)\t;");
    lines.push(`\tdo Show^%CSW1UTI("${routine}",$get(%cswP1),$get(%cswP2),$get(%cswP3),$get(%cswP4))`);
    lines.push("\t;");
    lines.push("\tquit");
    lines.push("\t;");
    lines.push("\t; Tags CSW");
    lines.push("\t;");
    lines.push(`\t; csw:label:1,1,${labelSize},${u.escapeMac(description)}*`);
    if (hasDisplay) lines.push(`\t; csw:display:${field.displayColumn},1,30,ds1000`);
    lines.push("\t;");
    lines.push(`\t; csw:botao:1,4,btConfirmar,C<u>o</u>nfirmar,o,3000^${routine},check,Duplicar,15`);
    lines.push(`\t; csw:botao:16,4,btCancelar,<u>C</u>ancelar,c,9999^${routine},cancelar,Cancelar,15`);
    lines.push("\t;");
    lines.push(`\t; csw:labelcreate:${routine}`);
    lines.push("\t; csw:labeldestroy:9999");
    lines.push("\t; csw:csp:gerar");

    return lines.join("\n");
  }

  function generateCombined() {
    return Object
      .values(
        generateAll()
      )
      .map(
        (item) =>
          item.code
      )
      .join("\n\n");
  }

  app.mac = {
    appendListF7Labels,
    fieldF7Routine: normalizedF7Routine,
    generate:
      generateParent,

    generateParent,
    generateTab,
    generateAuxiliaryScreen,
    generateAll,
    generateCombined
  };
})(window.GeradorRotinasJsonPadrao);
