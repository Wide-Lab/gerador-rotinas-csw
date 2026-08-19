/*
 * Validador de regras Caché / padrão CSW.
 *
 * Roda a cada refresh e aponta o que quebraria na compilação ou em runtime:
 * nomes inválidos, limites do Caché (31 caracteres), colisões de layout,
 * chaves ausentes, multi-seleção sem global, grid sem coluna chave etc.
 *
 * Nada aqui altera o código gerado — é só diagnóstico.
 */
(function (app) {
  if (!app) return;

  const CACHE_NAME_LIMIT = 31;
  const RESERVED_VARIABLES = new Set([
    "Z", "SC", "X", "Y", "CE", "CT", "%PRG", "%INDEX", "%CODRET", "%DADRET",
    "TIPF7", "%RO", "%CSP", "I", "J"
  ]);

  const LEVELS = { error: 0, warn: 1, info: 2 };

  function u() {
    return app.utils;
  }

  function normalize(value, fallback = "") {
    return u().normalizeVariable(value, fallback);
  }

  function isValidCacheName(name) {
    return /^%?[A-Za-z][A-Za-z0-9]*$/.test(String(name || ""));
  }

  function locationLabel(locationId, tabs) {
    if (!locationId || locationId === "parent") return "Rotina principal";
    if (String(locationId).startsWith("button-screen-")) return "Tela de botão";
    const tab = tabs.find((item) => item.id === locationId);
    return tab ? `Aba "${tab.title}"` : "Local desconhecido";
  }

  /* ------------------------------------------------------------------ *
   * Coletor
   * ------------------------------------------------------------------ */

  function createCollector() {
    const issues = [];

    function push(level, code, message, extra = {}) {
      issues.push({
        level,
        code,
        message,
        hint: extra.hint || "",
        where: extra.where || "",
        target: extra.target || null
      });
    }

    return {
      issues,
      error: (code, message, extra) => push("error", code, message, extra),
      warn: (code, message, extra) => push("warn", code, message, extra),
      info: (code, message, extra) => push("info", code, message, extra)
    };
  }

  /* ------------------------------------------------------------------ *
   * Regras — nomes e limites do Caché
   * ------------------------------------------------------------------ */

  function checkNames(add, config, state) {
    const routine = config.routineName;

    if (!isValidCacheName(routine)) {
      add.error(
        "nome-rotina",
        `Nome da rotina "${routine}" não é um nome válido de rotina Caché.`,
        { hint: "Use letras e números, começando por letra (ou %).", where: "Dados da rotina" }
      );
    }

    if (routine.length > CACHE_NAME_LIMIT) {
      add.error(
        "nome-rotina-tamanho",
        `Nome da rotina tem ${routine.length} caracteres (limite Caché: ${CACHE_NAME_LIMIT}).`,
        { where: "Dados da rotina" }
      );
    }

    if (config.useRules) {
      if (config.rgRoutineName === routine) {
        add.error(
          "rg-igual-interface",
          "A rotina RG tem o mesmo nome da rotina de interface.",
          { hint: "O padrão é <ROTINA>RG.", where: "Rotina de regras RG" }
        );
      }

      if (config.rgRoutineName.length > CACHE_NAME_LIMIT) {
        add.error(
          "rg-tamanho",
          `Nome da RG "${config.rgRoutineName}" tem ${config.rgRoutineName.length} caracteres (limite ${CACHE_NAME_LIMIT}).`,
          { where: "Rotina de regras RG" }
        );
      }

      const globalName = config.globalName;
      if (!isValidCacheName(globalName)) {
        add.error(
          "global-invalida",
          `Global "^${globalName}" tem caracteres inválidos.`,
          { where: "Rotina de regras RG" }
        );
      }
      if (globalName.length > CACHE_NAME_LIMIT) {
        add.error(
          "global-tamanho",
          `Global "^${globalName}" tem ${globalName.length} caracteres (limite ${CACHE_NAME_LIMIT}).`,
          { where: "Rotina de regras RG" }
        );
      }
    }

    const usedRoutines = new Map([[routine, "rotina principal"]]);
    if (config.useRules) usedRoutines.set(config.rgRoutineName, "rotina RG");

    state.tabs.forEach((tab, index) => {
      const name = normalize(tab.routineName, "");

      if (!isValidCacheName(name)) {
        add.error(
          "aba-rotina-invalida",
          `Aba ${index + 1} ("${tab.title}") usa um nome de rotina inválido.`,
          { where: `Aba ${index + 1}`, target: { type: "tab", id: tab.id } }
        );
        return;
      }

      if (name.length > CACHE_NAME_LIMIT) {
        add.error(
          "aba-rotina-tamanho",
          `Rotina da aba "${tab.title}" tem ${name.length} caracteres (limite ${CACHE_NAME_LIMIT}).`,
          { where: `Aba ${index + 1}`, target: { type: "tab", id: tab.id } }
        );
      }

      if (usedRoutines.has(name)) {
        add.error(
          "aba-rotina-duplicada",
          `Rotina "${name}" da aba "${tab.title}" já é usada pela ${usedRoutines.get(name)}.`,
          { hint: "Cada aba precisa do próprio .mac.", where: `Aba ${index + 1}`, target: { type: "tab", id: tab.id } }
        );
      } else {
        usedRoutines.set(name, `aba "${tab.title}"`);
      }

      if (tab.contentType === "grid") {
        const gridRg = normalize(tab.gridRgRoutineName, "");
        if (gridRg && gridRg.length > CACHE_NAME_LIMIT) {
          add.error(
            "aba-grid-rg-tamanho",
            `RG do grid da aba "${tab.title}" tem ${gridRg.length} caracteres (limite ${CACHE_NAME_LIMIT}).`,
            { where: `Aba ${index + 1}`, target: { type: "tab", id: tab.id } }
          );
        }
      }
    });
  }

  function checkFieldVariables(add, config, state) {
    const byLocation = new Map();

    state.fields.forEach((field, index) => {
      const variable = normalize(field.variable, "");
      const position = index + 1;

      if (!isValidCacheName(variable)) {
        add.error(
          "campo-variavel-invalida",
          `Campo "${field.description}" usa a variável "${field.variable}", que não é um nome válido.`,
          { where: `Campo ${position}`, target: { type: "field", id: field.id } }
        );
      }

      if (variable.length > CACHE_NAME_LIMIT) {
        add.error(
          "campo-variavel-tamanho",
          `Variável "${variable}" tem ${variable.length} caracteres (limite ${CACHE_NAME_LIMIT}).`,
          { where: `Campo ${position}`, target: { type: "field", id: field.id } }
        );
      }

      if (RESERVED_VARIABLES.has(variable)) {
        add.warn(
          "campo-variavel-reservada",
          `Variável "${variable}" colide com uma variável usada pelo framework CSW.`,
          { hint: "Z, SC, CE, CT, %PRG e afins são controladas pelo %CSW1UTI.", where: `Campo ${position}`, target: { type: "field", id: field.id } }
        );
      }

      const locationId = field.tabId || "parent";
      const bucket = byLocation.get(locationId) || new Map();

      if (bucket.has(variable)) {
        add.error(
          "campo-variavel-duplicada",
          `Variável "${variable}" repetida em ${locationLabel(locationId, state.tabs)} (campos "${bucket.get(variable)}" e "${field.description}").`,
          { hint: "Duas variáveis iguais no mesmo local sobrescrevem o mesmo piece.", where: `Campo ${position}`, target: { type: "field", id: field.id } }
        );
      } else {
        bucket.set(variable, field.description);
      }

      byLocation.set(locationId, bucket);
    });
  }

  /* ------------------------------------------------------------------ *
   * Regras — layout
   * ------------------------------------------------------------------ */

  function fieldSegments(field) {
    const segments = [];
    const labelSize = Number(field.labelSize) || 0;
    const inputSize = Number(field.type === "textArea" ? field.textAreaWidth : field.inputSize) || 0;

    if (labelSize > 0) {
      segments.push({
        kind: "label",
        line: Number(field.labelLine) || 0,
        start: Number(field.labelColumn) || 0,
        size: labelSize,
        height: 1
      });
    }

    segments.push({
      kind: "leitor",
      line: Number(field.inputLine) || 0,
      start: Number(field.inputColumn) || 0,
      size: inputSize,
      height: field.type === "textArea" ? Math.max(1, Number(field.textAreaHeight) || 1) : 1
    });

    if (app.fields.hasDisplay(field)) {
      segments.push({
        kind: "display",
        line: Number(field.displayLine) || 0,
        start: Number(field.displayColumn) || 0,
        size: Number(field.displaySize) || 0,
        height: 1
      });
    }

    return segments;
  }

  function overlaps(a, b) {
    const aEnd = a.start + a.size;
    const bEnd = b.start + b.size;
    const sameLines =
      a.line < b.line + b.height && b.line < a.line + a.height;

    return sameLines && a.start < bEnd && b.start < aEnd;
  }

  function checkLayout(add, config, state) {
    const groups = new Map();

    state.fields.forEach((field) => {
      const locationId = field.tabId || "parent";
      const list = groups.get(locationId) || [];
      list.push(field);
      groups.set(locationId, list);
    });

    groups.forEach((fields, locationId) => {
      const isParent = locationId === "parent";
      const maxWidth = isParent ? config.windowWidth : config.tabPanelWidth;
      const maxHeight = isParent ? config.windowHeight : config.tabPanelHeight;
      const where = locationLabel(locationId, state.tabs);
      const placed = [];

      fields.forEach((field) => {
        fieldSegments(field).forEach((segment) => {
          const end = segment.start + segment.size - 1;

          if (segment.start < 1) {
            add.error(
              "layout-coluna-invalida",
              `${where}: ${segment.kind} do campo "${field.description}" está na coluna ${segment.start}.`,
              { hint: "A primeira coluna é 1.", where, target: { type: "field", id: field.id } }
            );
          }

          if (maxWidth && end > maxWidth) {
            add.error(
              "layout-estoura-largura",
              `${where}: ${segment.kind} do campo "${field.description}" termina na coluna ${end}, além do limite ${maxWidth}.`,
              {
                hint: isParent
                  ? "Aumente a largura da janela ou reduza o tamanho do campo."
                  : "Aumente a largura do TabPanel ou reduza o tamanho do campo.",
                where,
                target: { type: "field", id: field.id }
              }
            );
          }

          const bottomLine = segment.line + segment.height - 1;
          if (maxHeight && bottomLine > maxHeight) {
            add.warn(
              "layout-estoura-altura",
              `${where}: ${segment.kind} do campo "${field.description}" está na linha ${bottomLine}, além do limite ${maxHeight}.`,
              { where, target: { type: "field", id: field.id } }
            );
          }

          placed.forEach((other) => {
            if (other.field.id === field.id && other.segment.kind === segment.kind) return;
            if (!overlaps(other.segment, segment)) return;

            const sameField = other.field.id === field.id;
            add.error(
              "layout-sobreposicao",
              sameField
                ? `${where}: ${other.segment.kind} e ${segment.kind} do campo "${field.description}" se sobrepõem na linha ${segment.line}.`
                : `${where}: ${other.segment.kind} de "${other.field.description}" sobrepõe ${segment.kind} de "${field.description}" na linha ${segment.line}.`,
              { where, target: { type: "field", id: field.id } }
            );
          });

          placed.push({ field, segment });
        });
      });
    });

    if (config.useTabs) {
      const panelBottom = config.tabPanelLine + config.tabPanelHeight - 1;
      if (panelBottom > config.windowHeight) {
        add.error(
          "tabpanel-estoura-janela",
          `O TabPanel termina na linha ${panelBottom}, além da altura da janela (${config.windowHeight}).`,
          { where: "Abas" }
        );
      }

      const panelRight = config.tabPanelColumn + config.tabPanelWidth - 1;
      if (panelRight > config.windowWidth) {
        add.error(
          "tabpanel-estoura-largura",
          `O TabPanel termina na coluna ${panelRight}, além da largura da janela (${config.windowWidth}).`,
          { where: "Abas" }
        );
      }
    }

    if (config.useBtnManter && config.btnManterLocation === "parent") {
      if (config.btnManterLine > config.windowHeight) {
        add.error(
          "btnmanter-fora",
          `Os botões de manutenção estão na linha ${config.btnManterLine}, além da altura da janela (${config.windowHeight}).`,
          { where: "Botões de manutenção" }
        );
      }

      if (config.useTabs) {
        const panelBottom = config.tabPanelLine + config.tabPanelHeight - 1;
        if (config.btnManterLine <= panelBottom) {
          add.warn(
            "btnmanter-sobre-tabpanel",
            `Os botões de manutenção (linha ${config.btnManterLine}) ficam por cima do TabPanel, que vai até a linha ${panelBottom}.`,
            { where: "Botões de manutenção" }
          );
        }
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Regras — chaves, RG e persistência
   * ------------------------------------------------------------------ */

  const variableOf = (field) => app.utils.normalizeVariable(field.variable, "");

  function checkKeysAndRules(add, config, state) {
    const fieldById = new Map(state.fields.map((field) => [field.id, field]));
    const keyIndexes = state.globalIndexes.filter((index) => index.type === "key");

    if (config.useRules && config.routineMode === "crud" && !keyIndexes.length) {
      add.error(
        "sem-chave",
        "Nenhuma chave foi definida nos índices da global.",
        { hint: "Sem chave o RG não consegue localizar, gravar nem excluir o registro.", where: "Rotina de regras RG" }
      );
    }

    keyIndexes.forEach((index) => {
      const field = fieldById.get(index.fieldId);

      if (!field) {
        add.error(
          "indice-sem-campo",
          "Existe um índice do tipo chave que não aponta para nenhum campo.",
          { where: "Índices da global" }
        );
        return;
      }

      if ((field.tabId || "parent") !== "parent") {
        add.error(
          "chave-fora-da-principal",
          `O campo chave "${field.description}" está em uma aba. Chaves precisam ficar na rotina principal.`,
          { where: "Campos", target: { type: "field", id: field.id } }
        );
      }

      if (!field.isKey) {
        add.warn(
          "indice-campo-nao-chave",
          `O campo "${field.description}" é usado como chave da global mas não está marcado como chave.`,
          { where: "Campos", target: { type: "field", id: field.id } }
        );
      }
    });

    const hasCompanyKey = keyIndexes.some(
      (index) => normalize(fieldById.get(index.fieldId)?.variable, "") === "CODEMP"
    );

    if (!config.useRoutineCompany && !hasCompanyKey) {
      add.error(
        "empresa-sem-origem",
        "A rotina não usa a empresa da sessão (CE) e também não tem um campo CODEMP como chave.",
        { hint: "Marque \"usar empresa da rotina\" ou crie o campo CODEMP.", where: "Rotina de regras RG" }
      );
    }

    state.fields.forEach((field) => {
      const where = `Campo "${field.description}"`;
      const target = { type: "field", id: field.id };

      if (app.fields.usesOptions(field)) {
        const optionsVariable = normalize(field.optionsVariable, "");
        if (!optionsVariable) {
          add.error(
            "combo-sem-tabela",
            `${where} é ${field.type} e não tem variável da tabela de opções.`,
            { where, target }
          );
        }

        if (field.createOptionsTable === true) {
          const items = Array.isArray(field.optionsItems) ? field.optionsItems : [];
          if (!items.length) {
            add.error(
              "combo-sem-itens",
              `${where} pede para gerar a tabela de opções, mas nenhum item foi cadastrado.`,
              { where, target }
            );
          }

          const values = new Set();
          items.forEach((item) => {
            const value = String(item?.value ?? "").trim();
            if (values.has(value)) {
              add.error(
                "combo-item-duplicado",
                `${where}: o valor "${value}" aparece mais de uma vez na tabela de opções.`,
                { where, target }
              );
            }
            values.add(value);
          });
        }
      }

      if (app.fields.isMultiSelect(field)) {
        if (!String(field.multiSelectTableVariable || "").trim()) {
          add.warn(
            "multi-sem-tabela",
            `${where} é multi-seleção sem variável da tabela selecionada.`,
            { hint: "Sem ela o gerador assume TAB<VARIAVEL>.", where, target }
          );
        }

        if (field.generateF7Routine299 === true) {
          const allGlobal = String(
            field.f7AllGlobalReference ?? field.f7SelectedGlobalReference ?? ""
          ).trim();

          if (!allGlobal) {
            add.error(
              "f7-sem-global-todos",
              `${where}: a rotina 299 vai ser gerada sem a global com todos os registros.`,
              { hint: "O código sai com um TODO e não compila o merge dos disponíveis.", where, target }
            );
          }

          const generatedRoutine = normalize(field.f7GeneratedRoutineName, "");
          if (generatedRoutine === config.routineName) {
            add.error(
              "f7-rotina-igual-interface",
              `${where}: a rotina 299 tem o mesmo nome da rotina de interface.`,
              { where, target }
            );
          }

          if (generatedRoutine && generatedRoutine.length > CACHE_NAME_LIMIT) {
            add.error(
              "f7-rotina-tamanho",
              `${where}: a rotina 299 "${generatedRoutine}" tem ${generatedRoutine.length} caracteres (limite ${CACHE_NAME_LIMIT}).`,
              { where, target }
            );
          }

          const pieces = String(field.f7GeneratedPieces || "").split(",").filter((item) => item !== "");
          const titles = String(field.f7GeneratedTitles || "").split(",").filter((item) => item !== "");
          const sizes = String(field.f7GeneratedColumnSizes || "").split(",").filter((item) => item !== "");

          if (sizes.length && titles.length && sizes.length !== titles.length) {
            add.warn(
              "f7-colunas-desalinhadas",
              `${where}: a rotina 299 tem ${sizes.length} tamanhos de coluna para ${titles.length} títulos.`,
              { hint: "O %CSUTIPE espera a mesma quantidade nas duas listas.", where, target }
            );
          }

          if (sizes.length && pieces.length && sizes.length !== pieces.length + 1) {
            add.warn(
              "f7-pieces-desalinhados",
              `${where}: ${sizes.length} colunas para ${pieces.length} pieces. A primeira coluna é sempre a chave, então o esperado são ${sizes.length - 1} pieces.`,
              { where, target }
            );
          }
        }
      }

      const valcp = String(field.valcpCode || "");
      if (valcp.includes("{display}") && !app.fields.hasDisplay(field)) {
        add.error(
          "valcp-display-inexistente",
          `${where}: o Valcp escreve em {display}, mas o campo não tem display habilitado.`,
          { hint: "Marque o display do campo ou remova o Set^%CSW1UTI do display.", where, target }
        );
      }

      if (/\bCODEMP\b/.test(valcp) && config.useRoutineCompany) {
        const hasCodEmpField = state.fields.some(
          (item) => normalize(item.variable, "") === "CODEMP"
        );
        if (!hasCodEmpField) {
          add.error(
            "valcp-codemp-indefinido",
            `${where}: o Valcp usa CODEMP, mas a rotina não tem esse campo e trabalha com a empresa da sessão.`,
            { hint: "Troque CODEMP por CE ou pelo marcador {company}.", where, target }
          );
        }
      }

      const unknownTokens = (valcp.match(/\{[a-zA-Z0-9]+\}/g) || []).filter(
        (token) =>
          ![
            "{reference}", "{fieldVariable}", "{display}", "{label}",
            "{company}", "{rgRoutine}", "{routine}", "{multiTable}",
            "{multiSelectedText}", "{fieldDescription}", "{cp}"
          ].includes(token)
      );

      [...new Set(unknownTokens)].forEach((token) => {
        add.warn(
          "valcp-marcador-desconhecido",
          `${where}: o marcador ${token} não é reconhecido e vai sair literal no código.`,
          { where, target }
        );
      });

      // O Valcp recebe o código e devolve o registro. Se as duas variáveis
      // forem a mesma, o código se perde na primeira validação e a tela passa a
      // dizer que o registro não existe.
      const extras = app.utils.parseVariables(field.extraVariables);
      if (extras.includes(variableOf(field))) {
        add.error(
          "variavel-colide-com-valcp",
          `${where}: a variável "${variableOf(field)}" também é usada como retorno no Valcp.`,
          {
            hint: "O Valcp faz $Ver...(campo,.retorno); com o mesmo nome nos dois, o valor digitado é sobrescrito.",
            where,
            target
          }
        );
      }

      if (field.typedReaderEnabled === true && !String(field.typedReaderRoutine || "").trim()) {
        add.error(
          "leitor-tipado-sem-rotina",
          `${where}: o leitor tipado está ligado sem informar a rotina do leitor.`,
          { where, target }
        );
      }

      if (field.required === true && field.disabled === true) {
        add.warn(
          "campo-obrigatorio-desabilitado",
          `${where} é obrigatório e desabilitado ao mesmo tempo.`,
          { where, target }
        );
      }

      if (field.type === "date" && field.hasDisplay === true) {
        add.info(
          "data-com-display",
          `${where} é data e não suporta display — a marcação vai ser ignorada.`,
          { where, target }
        );
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Regras — grid
   * ------------------------------------------------------------------ */

  function gridDefinitions(state) {
    const result = [];
    if (state.parentGrid) {
      result.push({ locationId: "parent", definition: state.parentGrid });
    }
    state.tabs.forEach((tab) => {
      if (tab.grid) result.push({ locationId: tab.id, definition: tab.grid, tab });
    });
    return result;
  }

  function checkConsultButtons(add, config, state) {
    const consult = /^(consultar?|pesquisar?|limpar|filtrar)$/i;

    state.customButtons
      .filter((button) => consult.test(String(button.text || "").trim()))
      .forEach((button) => {
        add.warn(
          "botao-consulta-duplicado",
          `O botão "${button.text}" faz o que o botão padrão da consulta já faz.`,
          {
            hint: config.gridUseConsultButton
              ? "A tela já gera o btnConsultar; remova este botão personalizado."
              : "Ligue \"Gerar BtnConsultar\" no card do Grid e remova este botão.",
            where: "Botões personalizados"
          }
        );
      });
  }

  function checkGrids(add, config, state) {
    const usedCodes = new Map();
    const usedWorkGlobals = new Map();

    state.tabs.forEach((tab) => {
      if (tab.contentType !== "grid") return;
      const columns = tab.grid?.columns || [];
      if (!columns.length) {
        add.error(
          "grid-sem-colunas",
          `A aba "${tab.title}" é do tipo Grid e não tem nenhuma coluna configurada.`,
          { where: `Aba "${tab.title}"`, target: { type: "tab", id: tab.id } }
        );
      }
    });

    gridDefinitions(state).forEach(({ locationId, definition }) => {
      const settings = definition.settings || {};
      const where = `Grid — ${locationLabel(locationId, state.tabs)}`;
      const code = Number(settings.gridCode) || 0;
      const workGlobal = String(settings.gridWorkGlobal || "").replace(/^\^/, "");

      if (code) {
        if (usedCodes.has(code)) {
          add.error(
            "grid-codigo-duplicado",
            `O código de grid ${code} é usado em "${usedCodes.get(code)}" e em "${locationLabel(locationId, state.tabs)}".`,
            { hint: "Cada grid da mesma janela precisa de um código próprio.", where }
          );
        } else {
          usedCodes.set(code, locationLabel(locationId, state.tabs));
        }
      }

      if (workGlobal) {
        if (workGlobal.length > CACHE_NAME_LIMIT) {
          add.error(
            "grid-global-tamanho",
            `A global de trabalho "^${workGlobal}" tem ${workGlobal.length} caracteres (limite ${CACHE_NAME_LIMIT}).`,
            { where }
          );
        }

        if (!isValidCacheName(workGlobal)) {
          add.error(
            "grid-global-invalida",
            `A global de trabalho "^${workGlobal}" tem caracteres inválidos.`,
            { where }
          );
        }

        if (usedWorkGlobals.has(workGlobal)) {
          add.error(
            "grid-global-duplicada",
            `A global de trabalho "^${workGlobal}" é usada por mais de um grid (${usedWorkGlobals.get(workGlobal)}).`,
            { hint: "Grids diferentes na mesma tela precisam de globais mtemp diferentes.", where }
          );
        } else {
          usedWorkGlobals.set(workGlobal, locationLabel(locationId, state.tabs));
        }
      }

      const lineStart = Number(settings.gridLineStart) || 0;
      const lineEnd = Number(settings.gridLineEnd) || 0;
      const height = Number(settings.gridHeight) || 0;
      const position = Number(settings.gridLinePosition) || 0;

      if (lineEnd && lineStart && lineEnd < lineStart) {
        add.error(
          "grid-linhas-invertidas",
          `A linha final do grid (${lineEnd}) é menor que a inicial (${lineStart}).`,
          { where }
        );
      }

      if (height && position) {
        const bottom = position + height - 1;
        const limit = locationId === "parent" ? config.windowHeight : config.tabPanelHeight;
        if (limit && bottom > limit) {
          add.warn(
            "grid-estoura-altura",
            `O grid termina na linha ${bottom}, além do limite do local (${limit}).`,
            { where }
          );
        }
      }

      const columns = definition.columns || [];
      const hasKey = columns.some((column) => column.recordKey === true);
      const hasEditable = columns.some((column) => column.editable === true);

      if (columns.length && !hasKey) {
        add.warn(
          "grid-sem-chave",
          `${where}: nenhuma coluna está marcada como chave do registro.`,
          { hint: "Sem chave a manutenção não consegue localizar a linha na global.", where }
        );
      }

      if (settings.gridMaintenance === true && !hasEditable) {
        add.warn(
          "grid-manutencao-sem-coluna",
          `${where}: a manutenção inline está ligada mas nenhuma coluna é editável.`,
          { where }
        );
      }

      const seenVariables = new Map();
      columns.forEach((column, index) => {
        const variable = normalize(column.variable, "");

        if (!isValidCacheName(variable)) {
          add.error(
            "grid-coluna-variavel",
            `${where}: a coluna ${index + 1} ("${column.title || ""}") usa a variável inválida "${column.variable}".`,
            { where }
          );
        }

        if (seenVariables.has(variable)) {
          add.error(
            "grid-coluna-duplicada",
            `${where}: a variável "${variable}" se repete nas colunas ${seenVariables.get(variable)} e ${index + 1}.`,
            { where }
          );
        } else {
          seenVariables.set(variable, index + 1);
        }

        const piece = Number(column.workPiece);
        if (column.type !== "checkheader" && !(piece > 0)) {
          add.warn(
            "grid-coluna-sem-piece",
            `${where}: a coluna "${column.title || variable}" não tem piece da global de trabalho.`,
            { where }
          );
        }
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Regras — rotinas 299 geradas
   * ------------------------------------------------------------------ */

  function checkGeneratedF7(add, config) {
    if (!app.f7 || typeof app.f7.generateAll !== "function") return;

    let generated = {};
    try {
      generated = app.f7.generateAll(config) || {};
    } catch (error) {
      add.warn("f7-erro-geracao", `Não foi possível gerar as rotinas 299: ${error.message}`);
      return;
    }

    Object.values(generated).forEach((routine) => {
      const lines = String(routine.code || "").split("\n");
      const labels = new Map();

      lines.forEach((line) => {
        const match = line.match(/^([A-Za-z%][A-Za-z0-9]*)\t/);
        if (!match) return;
        const label = match[1];

        if (label.length > CACHE_NAME_LIMIT) {
          add.error(
            "f7-label-tamanho",
            `Rotina ${routine.routineName}: o label "${label}" tem ${label.length} caracteres (limite ${CACHE_NAME_LIMIT}).`,
            { where: routine.routineName }
          );
        }

        if (labels.has(label) && label !== routine.routineName) {
          add.error(
            "f7-label-duplicado",
            `Rotina ${routine.routineName}: o label "${label}" aparece mais de uma vez.`,
            { where: routine.routineName }
          );
        }
        labels.set(label, true);
      });

      const globalMatches = String(routine.code || "").match(/\^(mtemp[A-Za-z0-9%]*)/g) || [];
      [...new Set(globalMatches)].forEach((reference) => {
        const name = reference.slice(1);
        if (name.length > CACHE_NAME_LIMIT) {
          add.error(
            "f7-global-tamanho",
            `Rotina ${routine.routineName}: a global "^${name}" tem ${name.length} caracteres (limite ${CACHE_NAME_LIMIT}).`,
            { hint: "Encurte o label da consulta ou o nome da rotina 299.", where: routine.routineName }
          );
        }
      });

      if (String(routine.code || "").includes("TODO:")) {
        add.warn(
          "f7-todo",
          `Rotina ${routine.routineName} foi gerada com um TODO pendente.`,
          { where: routine.routineName }
        );
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Execução
   * ------------------------------------------------------------------ */

  function run() {
    const add = createCollector();

    try {
      const config = app.getConfig();
      const state = app.state;

      checkNames(add, config, state);
      checkFieldVariables(add, config, state);
      checkLayout(add, config, state);
      checkKeysAndRules(add, config, state);
      checkGrids(add, config, state);
      checkConsultButtons(add, config, state);
      checkGeneratedF7(add, config);
    } catch (error) {
      add.warn("validador-erro", `O validador encontrou um erro interno: ${error.message}`);
    }

    return add.issues.sort((a, b) => LEVELS[a.level] - LEVELS[b.level]);
  }

  /* ------------------------------------------------------------------ *
   * Interface
   * ------------------------------------------------------------------ */

  const STYLE = `
    .gpj-validator {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 60;
      font-family: inherit;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      max-width: min(520px, calc(100vw - 36px));
    }
    .gpj-validator-badge {
      border: none;
      border-radius: 999px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #16a34a;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28);
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .gpj-validator-badge.has-error { background: #dc2626; }
    .gpj-validator-badge.has-warn { background: #d97706; }
    .gpj-validator-panel {
      width: min(520px, calc(100vw - 36px));
      max-height: min(60vh, 560px);
      overflow: auto;
      background: #ffffff;
      border: 1px solid #d5dbe6;
      border-radius: 14px;
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
      padding: 12px;
    }
    .gpj-validator-panel.hidden { display: none; }
    .gpj-validator-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }
    .gpj-validator-head strong { font-size: 14px; }
    .gpj-validator-head-actions { display: flex; gap: 6px; }
    .gpj-validator-head button {
      border: 1px solid #d5dbe6;
      background: #f6f8fb;
      border-radius: 8px;
      padding: 4px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    .gpj-validator-item {
      border-left: 4px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 8px;
      padding: 8px 10px;
      margin-bottom: 6px;
      font-size: 12.5px;
      line-height: 1.45;
      cursor: pointer;
    }
    .gpj-validator-item.level-error { border-left-color: #dc2626; background: #fef2f2; }
    .gpj-validator-item.level-warn { border-left-color: #d97706; background: #fffbeb; }
    .gpj-validator-item.level-info { border-left-color: #2563eb; background: #eff6ff; }
    .gpj-validator-item .gpj-validator-where {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      opacity: 0.65;
      margin-bottom: 2px;
    }
    .gpj-validator-item .gpj-validator-hint {
      display: block;
      margin-top: 4px;
      opacity: 0.75;
      font-style: italic;
    }
    .gpj-validator-empty {
      padding: 14px;
      text-align: center;
      font-size: 13px;
      opacity: 0.7;
    }
    .gpj-validator-highlight {
      outline: 2px solid #dc2626 !important;
      outline-offset: 2px;
      transition: outline-color 0.4s ease;
    }
  `;

  let container = null;
  let badge = null;
  let panel = null;
  let lastIssues = [];
  let open = false;

  function buildInterface() {
    if (container) return;

    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    container = document.createElement("div");
    container.className = "gpj-validator";

    panel = document.createElement("div");
    panel.className = "gpj-validator-panel hidden";

    badge = document.createElement("button");
    badge.type = "button";
    badge.className = "gpj-validator-badge";
    badge.textContent = "Validando…";
    badge.addEventListener("click", () => {
      open = !open;
      panel.classList.toggle("hidden", !open);
    });

    container.appendChild(panel);
    container.appendChild(badge);
    document.body.appendChild(container);
  }

  function highlight(target) {
    if (!target) return;

    let element = null;

    if (target.type === "field") {
      const position = app.state.fields.findIndex((field) => field.id === target.id);
      if (position >= 0) {
        element = document.querySelector(`[data-field-position="${position}"]`)?.closest("tr");
      }
    }

    if (target.type === "tab") {
      const position = app.state.tabs.findIndex((tab) => tab.id === target.id);
      if (position >= 0) {
        element = document.querySelector(`[data-tab-position="${position}"]`)?.closest("tr");
      }
    }

    if (!element) return;

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("gpj-validator-highlight");
    setTimeout(() => element.classList.remove("gpj-validator-highlight"), 2200);
  }

  function reportText(issues) {
    if (!issues.length) return "Nenhum problema encontrado.";

    return issues
      .map((issue) => {
        const prefix =
          issue.level === "error" ? "ERRO" : issue.level === "warn" ? "AVISO" : "INFO";
        const hint = issue.hint ? `\n     ${issue.hint}` : "";
        return `[${prefix}] ${issue.message}${hint}`;
      })
      .join("\n");
  }

  function render(issues) {
    buildInterface();
    lastIssues = issues;

    const errors = issues.filter((issue) => issue.level === "error").length;
    const warnings = issues.filter((issue) => issue.level === "warn").length;

    badge.classList.toggle("has-error", errors > 0);
    badge.classList.toggle("has-warn", errors === 0 && warnings > 0);

    if (!issues.length) {
      badge.textContent = "✔ Sem problemas";
    } else {
      const parts = [];
      if (errors) parts.push(`${errors} erro${errors > 1 ? "s" : ""}`);
      if (warnings) parts.push(`${warnings} aviso${warnings > 1 ? "s" : ""}`);
      const info = issues.length - errors - warnings;
      if (info) parts.push(`${info} nota${info > 1 ? "s" : ""}`);
      badge.textContent = `⚠ ${parts.join(" · ")}`;
    }

    const head = document.createElement("div");
    head.className = "gpj-validator-head";
    head.innerHTML = "<strong>Validação Caché / CSW</strong>";

    const actions = document.createElement("div");
    actions.className = "gpj-validator-head-actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Copiar relatório";
    copyButton.addEventListener("click", () =>
      app.utils.copyText(reportText(lastIssues), "Relatório de validação copiado.")
    );

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Fechar";
    closeButton.addEventListener("click", () => {
      open = false;
      panel.classList.add("hidden");
    });

    actions.appendChild(copyButton);
    actions.appendChild(closeButton);
    head.appendChild(actions);

    panel.innerHTML = "";
    panel.appendChild(head);

    if (!issues.length) {
      const empty = document.createElement("div");
      empty.className = "gpj-validator-empty";
      empty.textContent = "Nenhuma regra violada. A configuração está consistente.";
      panel.appendChild(empty);
      return;
    }

    issues.forEach((issue) => {
      const item = document.createElement("div");
      item.className = `gpj-validator-item level-${issue.level}`;
      item.innerHTML = `
        <span class="gpj-validator-where">${app.utils.escapeHtml(issue.where || issue.code)}</span>
        ${app.utils.escapeHtml(issue.message)}
        ${issue.hint ? `<span class="gpj-validator-hint">${app.utils.escapeHtml(issue.hint)}</span>` : ""}
      `;
      item.addEventListener("click", () => highlight(issue.target));
      panel.appendChild(item);
    });
  }

  let scheduled = null;
  function schedule() {
    clearTimeout(scheduled);
    scheduled = setTimeout(() => render(run()), 120);
  }

  function install() {
    const original = app.refresh;
    if (typeof original !== "function") return;

    app.refresh = function () {
      const result = original.apply(this, arguments);
      schedule();
      return result;
    };

    schedule();
  }

  app.validator = { run, render, install, reportText };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})(window.GeradorRotinasJsonPadrao);
