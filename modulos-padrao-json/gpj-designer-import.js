/*
 * Importador do desenhador de telas (o app React que desenha a rotina).
 *
 * Recebe o JSON do projeto desenhado — a mesma estrutura que aparece no estado
 * do app, com `id`, `name` e a lista de `components` posicionados em pixel — e
 * converte para o projeto do gerador: rotina, abas, campos, grid e botões, já
 * na grade de caracteres do CSW.
 *
 * O formato é lido de forma tolerante: cada propriedade aceita vários nomes,
 * porque o desenhador pode mudar de versão. O que não for reconhecido aparece
 * no diagnóstico em vez de sumir calado.
 */
(function (app) {
  if (!app) return;

  /* ------------------------------------------------------------------ *
   * Leitura tolerante do JSON
   * ------------------------------------------------------------------ */

  const first = (...values) =>
    values.find((value) => value !== undefined && value !== null && value !== "");

  function pixels(value) {
    if (typeof value === "number") return value;
    const parsed = parseFloat(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const flat = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase();

  function screensFrom(input) {
    if (!input || typeof input !== "object") return [];

    if (Array.isArray(input)) {
      return input.filter((item) => item && Array.isArray(item.components));
    }

    const list = first(input.screens, input.telas, input.pages, input.views, input.rotinas);
    if (Array.isArray(list)) {
      return list.filter((item) => item && Array.isArray(item.components));
    }

    if (Array.isArray(input.components)) return [input];

    // Despejo do console: objeto com chaves numéricas.
    const values = Object.values(input).filter(
      (item) => item && typeof item === "object" && Array.isArray(item.components)
    );

    return values;
  }

  // No JSON do desenhador o `id` do componente é o tipo ("Grid", "Csle"…),
  // enquanto no da tela é o nome da rotina.
  function componentType(raw) {
    return String(
      first(raw.type, raw.componentType, raw.kind, raw.component, raw.id, raw.name) || ""
    );
  }

  function componentText(raw) {
    const value = first(
      raw.text,
      raw.label,
      raw.title,
      raw.caption,
      raw.description,
      raw.placeholder,
      raw.value,
      raw.displayText
    );
    return String(value ?? "").trim();
  }

  const TYPE_RULES = [
    [/grid|table|tabela|grade|datagrid/, "grid"],
    [/tabpanel|tabs|abas/, "tabstrip"],
    [/\btab\b|\baba\b/, "tab"],
    [/button|botao|btn/, "button"],
    [/display/, "display"],
    [/csle|input|leitor|textbox|textfield|campo|edit\b/, "input"],
    [/checkbox|check/, "checkbox"],
    [/combo|select|dropdown/, "combo"],
    [/radio|opcao|opção|option/, "radio"],
    [/textarea|memo/, "textarea"],
    [/date|data/, "date"],
    [/label|texto|text|title|titulo/, "label"]
  ];

  function classify(raw) {
    const type = flat(componentType(raw));
    const found = TYPE_RULES.find(([pattern]) => pattern.test(type));
    return found ? found[1] : "";
  }

  function normalizeComponent(raw, index) {
    const x = pixels(first(raw.x, raw.left, raw.posX, raw.position?.x, 0));
    const y = pixels(first(raw.y, raw.top, raw.posY, raw.position?.y, 0));
    const width = pixels(first(raw.width, raw.w, raw.size?.width, 0));
    const height = pixels(first(raw.height, raw.h, raw.size?.height, 0));

    return {
      index,
      raw,
      rawType: componentType(raw),
      kind: classify(raw),
      text: componentText(raw),
      x,
      y,
      width,
      height,
      right: x + width,
      bottom: y + height,
      required: raw.required === true || raw.obrigatorio === true,
      key: raw.key === true || raw.chave === true || raw.isKey === true,
      columns: first(
        raw.gridData?.columns,
        raw.columns,
        raw.colunas,
        raw.headers,
        raw.cabecalho,
        raw.fields
      ),
      rows: first(raw.gridData?.data, raw.data, raw.rows, raw.linhas),
      options: first(raw.options, raw.opcoes, raw.items, raw.itens, raw.values),
      hasLookup: String(first(raw.f7, raw.F7, "") || "").trim() !== ""
    };
  }

  /* ------------------------------------------------------------------ *
   * Grade de caracteres
   * ------------------------------------------------------------------ */

  function distinct(values, tolerance) {
    const sorted = [...values].sort((a, b) => a - b);
    const result = [];
    sorted.forEach((value) => {
      if (!result.length || value - result[result.length - 1] > tolerance) result.push(value);
    });
    return result;
  }

  function estimateCell(components, columns) {
    const rows = distinct(
      components.filter((item) => item.height > 0 && item.height < 80).map((item) => item.y),
      4
    );

    const gaps = [];
    for (let index = 1; index < rows.length; index += 1) {
      const gap = rows[index] - rows[index - 1];
      if (gap >= 8) gaps.push(gap);
    }

    // O menor espaçamento que se repete é a altura de uma linha.
    const sorted = [...gaps].sort((a, b) => a - b);
    const repeated = sorted.find(
      (gap) => sorted.filter((other) => Math.abs(other - gap) <= gap * 0.2).length >= 2
    );

    const heights = components
      .filter((item) => item.height >= 12 && item.height <= 60)
      .map((item) => item.height);

    const cellHeight =
      repeated ||
      (heights.length ? Math.round(heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)]) : 0) ||
      28;

    const right = Math.max(1, ...components.map((item) => item.right));
    const cellWidth = Math.max(4, right / Math.max(1, columns));

    return { cellWidth: Number(cellWidth.toFixed(2)), cellHeight };
  }

  /* ------------------------------------------------------------------ *
   * Conversão
   * ------------------------------------------------------------------ */

  const GRID_COLUMN_TYPES = {
    date: "d",
    data: "d",
    integer: "n",
    inteiro: "n",
    number: "n",
    numero: "n",
    decimal: "v3",
    valor: "v3",
    check: "checkheader",
    checkbox: "checkheader"
  };

  function gridColumnType(raw, title) {
    const declared = flat(first(raw?.type, raw?.tipo, ""));
    if (GRID_COLUMN_TYPES[declared]) return GRID_COLUMN_TYPES[declared];

    const name = flat(title);
    if (/^check|^sel\b|marca/.test(name)) return "checkheader";
    if (/data|dt\b|previsao|vencimento|emissao/.test(name)) return "d";
    if (/quantidade|qtd|valor|preco|percent|saldo|peso/.test(name)) return "v3";
    if (/codigo|numero|num\b|seq|pedido|\bop\b/.test(name)) return "n";
    return "a";
  }

  const DATE_SAMPLE = /^\d{2}[/\-.]\d{2}[/\-.]\d{2,4}$/;

  // O desenho traz linhas de exemplo; elas dizem o tipo melhor que o título.
  function typeFromSamples(samples) {
    const clean = samples.map((value) => String(value ?? "").trim()).filter(Boolean);
    if (!clean.length) return "";
    if (clean.every((value) => DATE_SAMPLE.test(value))) return "d";
    if (clean.every((value) => /^-?[\d.]+,\d+$/.test(value))) return "v3";
    if (clean.every((value) => /^[\d.]+$/.test(value))) return "n";
    return "a";
  }

  function normalizeGridColumns(source, cellWidth, helpers, rows = []) {
    const list = Array.isArray(source) ? source : [];
    const used = new Set();
    let piece = 0;

    const columns = list.map((item, index) => {
      const isText = typeof item === "string";
      const title = String(
        isText ? item : first(item.title, item.text, item.label, item.name, item.header, "")
      ).trim() || `Coluna ${index + 1}`;

      const key = isText ? "" : first(item.field, item.campo, item.key, item.dataField, "");
      const samples = key
        ? rows.map((row) => row && row[key]).filter((value) => value !== undefined && value !== "")
        : [];

      const width = isText ? 0 : pixels(first(item.width, item.w, item.size, 0));
      const sampled = typeFromSamples(samples);
      const declared = isText ? "" : flat(first(item.dataType, item.tipo, item.type, ""));

      // "link" é a coluna de ação/marcação do desenhador.
      const type =
        declared === "link" && /check|sel|marca|a[çc][õo]es|editar/i.test(title)
          ? "checkheader"
          : sampled || gridColumnType(isText ? null : item, title);

      if (type !== "checkheader") piece += 1;

      return {
        title: type === "checkheader" ? "" : title,
        variable: helpers.variableFromDescription(title || `COLUNA${index + 1}`, used),
        type,
        width:
          width > 0
            ? Math.max(3, Math.round(width / cellWidth))
            : Math.max(
                6,
                title.length + 2,
                ...samples.map((value) => String(value).length + 2)
              ),
        workPiece: type === "checkheader" ? 0 : piece,
        recordKey: false,
        detail: type !== "checkheader",
        _title: title
      };
    });

    // A chave do registro é a primeira coluna que parece código; sem nenhuma,
    // fica a primeira coluna de dados.
    const candidates = columns.filter((column) => column.type !== "checkheader");
    const key =
      candidates.find((column) => /codigo|pedido|numero|\bnum\b|seq|\bid\b|\bop\b/i.test(column._title)) ||
      candidates[0];

    if (key) {
      key.recordKey = true;
      key.editable = true;
      key.required = true;
    }

    columns.forEach((column) => delete column._title);
    return columns;
  }

  // Barra de botões: todos na mesma linha ganham a mesma largura e o mesmo
  // espaçamento, na ordem em que aparecem no desenho.
  function alignButtonBar(entries, columns) {
    const byLine = new Map();

    entries.forEach((entry) => {
      const list = byLine.get(entry.line) || [];
      list.push(entry);
      byLine.set(entry.line, list);
    });

    byLine.forEach((list) => {
      if (list.length < 2) return;

      list.sort((a, b) => a.column - b.column);

      const gap = 1;
      const start = Math.max(2, Math.min(...list.map((entry) => entry.column)));
      const available = columns - start - gap * (list.length - 1);
      const size = Math.max(
        8,
        Math.min(
          Math.max(...list.map((entry) => entry.size)),
          Math.floor(available / list.length)
        )
      );

      let cursor = start;
      list.forEach((entry) => {
        entry.column = cursor;
        entry.size = size;
        cursor += size + gap;
      });
    });
  }

  // Empurra os elementos de cada linha para a direita até não colidirem.
  function reflowFields(fields, columns) {
    const byLine = new Map();

    fields.forEach((field) => {
      const list = byLine.get(field.inputLine) || [];
      list.push(field);
      byLine.set(field.inputLine, list);
    });

    byLine.forEach((list) => {
      list.sort((a, b) => a.labelColumn - b.labelColumn);

      let cursor = 1;
      list.forEach((field) => {
        field.labelColumn = Math.max(field.labelColumn, cursor);
        field.inputColumn = Math.max(
          field.inputColumn,
          field.labelColumn + field.labelSize + 1
        );

        cursor = field.inputColumn + field.inputSize + 1;

        if (field.hasDisplay) {
          field.displayColumn = Math.max(field.displayColumn, cursor);
          cursor = field.displayColumn + field.displaySize + 1;
        }

        // Sobrou pouco espaço até o fim da janela: encolhe o display.
        if (field.hasDisplay && field.displayColumn + field.displaySize - 1 > columns) {
          field.displaySize = Math.max(4, columns - field.displayColumn + 1);
          cursor = field.displayColumn + field.displaySize + 1;
        }
      });
    });
  }

  const CONSULT_PATTERN = /^(consultar?|pesquisar?|limpar|filtrar)$/i;

  function helpersFor() {
    return (
      (app.specImport && app.specImport.helpers) || {
        variableFromDescription: (description, used) => {
          const base = app.utils.normalizeVariable(description, "CAMPO").slice(0, 10);
          let candidate = base;
          let suffix = 2;
          while (used.has(candidate)) candidate = `${base.slice(0, 8)}${suffix++}`;
          used.add(candidate);
          return candidate;
        },
        inferType: () => "",
        inferLookup: () => "",
        defaultSize: () => 20
      }
    );
  }

  const PLACEHOLDER = /^(csle|display|label|text|input|campo|grid|button|botao)$/i;

  function convert(input, options = {}) {
    const screens = screensFrom(input);
    const warnings = [];

    if (!screens.length) {
      return {
        routine: {},
        tabs: [],
        fields: [],
        grids: [],
        buttons: [],
        indexes: [],
        warnings: ["Nenhuma tela com lista de componentes foi encontrada no JSON."],
        screens: []
      };
    }

    const screenIndex = Math.min(Math.max(0, Number(options.screen) || 0), screens.length - 1);
    const screen = screens[screenIndex];
    const components = (screen.components || []).map(normalizeComponent);

    const columns = Number(options.columns) || 108;
    const estimated = estimateCell(components, columns);
    const cellWidth = Number(options.cellWidth) || estimated.cellWidth;
    const cellHeight = Number(options.cellHeight) || estimated.cellHeight;

    const toColumn = (x) => Math.max(1, Math.round(x / cellWidth) + 1);
    const toLine = (y) => Math.max(1, Math.round(y / cellHeight) + 1);
    const toSize = (width) => Math.max(1, Math.round(width / cellWidth));

    const helpers = helpersFor();
    const used = new Set();

    const unknown = new Map();
    components
      .filter((item) => !item.kind)
      .forEach((item) => unknown.set(item.rawType, (unknown.get(item.rawType) || 0) + 1));

    const labels = components.filter((item) => item.kind === "label");
    const inputs = components.filter((item) =>
      ["input", "checkbox", "combo", "radio", "date", "textarea"].includes(item.kind)
    );
    const displays = components.filter((item) => item.kind === "display");
    const grids = components.filter((item) => item.kind === "grid");
    const buttons = components.filter((item) => item.kind === "button");
    const tabStrips = components.filter((item) => item.kind === "tabstrip" || item.kind === "tab");

    // O label de um leitor é o texto mais próximo à esquerda, na mesma linha.
    function labelSourceFor(input) {
      const sameLine = labels.filter(
        (label) =>
          Math.abs(label.y - input.y) <= cellHeight * 0.8 &&
          label.right <= input.right &&
          label.right <= input.x + cellWidth * 2 &&
          label.text &&
          !PLACEHOLDER.test(label.text)
      );

      return sameLine.sort((a, b) => b.right - a.right)[0] || null;
    }

    function labelFor(input) {
      const own = input.text && !PLACEHOLDER.test(input.text) ? input.text : "";
      if (own) return own;

      const sameLine = labels.filter(
        (label) =>
          Math.abs(label.y - input.y) <= cellHeight * 0.8 &&
          label.x < input.x &&
          label.right <= input.right &&
          label.text &&
          !PLACEHOLDER.test(label.text)
      );

      if (!sameLine.length) return "";

      return sameLine.sort((a, b) => b.right - a.right)[0].text;
    }

    function displayFor(input) {
      const candidates = displays.filter(
        (display) =>
          Math.abs(display.y - input.y) <= cellHeight * 0.8 && display.x >= input.right - cellWidth
      );
      if (!candidates.length) return null;
      return candidates.sort((a, b) => a.x - b.x)[0];
    }

    const kindToType = {
      checkbox: "checkbox",
      combo: "combo",
      radio: "radio",
      date: "date",
      textarea: "textArea"
    };

    function optionItemsOf(component) {
      const list = component.options;
      if (!Array.isArray(list) || !list.length) return null;

      return list.map((item, position) => ({
        value: String(
          typeof item === "object" ? first(item.value, item.valor, item.id, position) : position
        ),
        description: String(
          typeof item === "object"
            ? first(item.description, item.text, item.label, item.descricao, item.title, item)
            : item
        )
      }));
    }

    // Um Display sozinho, com label à esquerda e sem leitor na linha, é o
    // padrão de multi-seleção: o valor é escolhido por um botão ao lado.
    const displayOnly = displays.filter((display) => {
      const attached = inputs.some(
        (input) =>
          Math.abs(input.y - display.y) <= cellHeight * 0.8 &&
          input.right <= display.x + cellWidth &&
          display.x - input.right <= cellWidth * 6
      );
      if (attached) return false;

      return labels.some(
        (label) =>
          Math.abs(label.y - display.y) <= cellHeight * 0.8 &&
          label.right <= display.x + cellWidth * 2 &&
          label.text &&
          !PLACEHOLDER.test(label.text)
      );
    });

    const fields = inputs.concat(displayOnly).map((input, position) => {
      const isDisplayOnly = displayOnly.includes(input);
      const description = labelFor(input) || `Campo ${position + 1}`;
      const display = isDisplayOnly ? input : displayFor(input);
      const inferred = helpers.inferType(description);
      const type = isDisplayOnly
        ? "multiSelect"
        : kindToType[input.kind] || inferred || "string";
      const line = toLine(input.y);

      // No desenhador o texto do label termina na borda direita da caixa; é
      // dali que se acha a coluna real, andando para trás o tamanho do texto.
      const inputColumn = toColumn(input.x);
      const source = labelSourceFor(input);
      const wanted = Math.max(4, description.length + 1);
      // Duas colunas de respiro entre o texto e a caixa, como nas telas do ERP.
      const rightEdge = source ? toColumn(source.right) : inputColumn - 2;
      const labelColumn = Math.max(1, Math.min(rightEdge - wanted, inputColumn - 3));
      const labelSize = Math.max(2, Math.min(wanted, inputColumn - 2 - labelColumn));

      const field = {
        description,
        variable: helpers.variableFromDescription(description, used),
        type,
        tabId: "parent",
        isKey: input.key === true,
        required: input.required === true || input.key === true,
        labelLine: line,
        labelColumn,
        labelSize,
        inputLine: line,
        inputColumn,
        inputSize: isDisplayOnly
          ? 8
          : Math.max(6, toSize(input.width) || helpers.defaultSize(type, description)),
        hasDisplay: Boolean(display) && !["date", "textArea"].includes(type),
        displayLine: line,
        displayColumn: display ? toColumn(display.x) : inputColumn + toSize(input.width) + 2,
        displaySize: display ? Math.max(10, toSize(display.width)) : 30,
        // O desenho marca com f7 quando o campo tem consulta.
        lookupPreset:
          helpers.inferLookup(description) || (input.hasLookup ? "custom" : "none"),
        _applyLookupPreset: true
      };

      if (type === "multiSelect") {
        field.multiSelectTableVariable = `TAB${field.variable}`.slice(0, 20);
        field.multiSelectSelectedText = "Selecionados";
      }

      const options = optionItemsOf(input);
      if (options && ["radio", "combo", "checkbox"].includes(type)) {
        field.optionsVariable = `TAB${app.utils
          .normalizeVariable(description, "OPCAO")
          .slice(0, 8)}`;
        field.createOptionsTable = true;
        field.optionsItems = options;
      }

      return field;
    });

    reflowFields(fields, columns);

    const routineName = app.utils.normalizeVariable(
      first(options.routineName, screen.id, screen.name, "ROTINANOVA"),
      "ROTINANOVA"
    );
    const title = String(first(options.title, screen.name, screen.title, "Tela importada"));

    const tabTitles = tabStrips
      .map((item) => item.text)
      .filter((text) => text && !PLACEHOLDER.test(text));

    const documentTabs = tabTitles.map((tabTitle, index) => ({
      id: `aba${index + 1}`,
      title: tabTitle,
      routineName: `${routineName}TAB${index + 1}`.slice(0, 31),
      gridRgRoutineName: `${routineName}TAB${index + 1}RG`.slice(0, 31),
      dataVariable: `${routineName}T${index + 1}`.slice(0, 20),
      globalSubscript: String(index + 4),
      contentType: "fields"
    }));

    const gridLocation = documentTabs.length ? documentTabs[0].id : "parent";

    const maintenance = buttons.find((button) => /manuten/i.test(button.text));
    const consult = buttons.filter((button) => CONSULT_PATTERN.test(button.text.trim()));
    const extraButtons = buttons.filter(
      (button) => button !== maintenance && !consult.includes(button)
    );

    // Primeiro botão que aparece abaixo de cada grid.
    const buttonLines = buttons.map((button) => toLine(button.y));

    const documentGrids = grids.map((grid, index) => {
      const line = toLine(grid.y);
      const below = buttonLines.filter((buttonLine) => buttonLine > line);
      const limit = below.length ? Math.min(...below) - line - 2 : Infinity;

      const height = Math.max(
        3,
        Math.min(Math.round(grid.height / cellHeight), limit)
      );
      const gridColumns = normalizeGridColumns(
        grid.columns,
        cellWidth,
        helpers,
        Array.isArray(grid.rows) ? grid.rows : []
      );

      if (!gridColumns.length) {
        warnings.push(
          "O grid do desenho não trouxe as colunas. Informe as colunas no card do Grid depois de gerar."
        );
      }

      const location = index === 0 ? gridLocation : "parent";
      if (location !== "parent") {
        const tab = documentTabs.find((item) => item.id === location);
        if (tab) tab.contentType = "grid";
      }

      return {
        location,
        gridCode: index === 0 ? 1 : 40 + index,
        gridLinePosition: line,
        gridHeight: height,
        gridLineStart: line,
        gridLineEnd: line + height - 1,
        gridNavigation: 1,
        // Sem botão de consulta no desenho, não gera o btnConsultar.
        gridUseConsultButton: consult.length > 0,
        gridConsultButtonColumn: consult.length ? toColumn(consult[0].x) : 86,
        gridConsultButtonLine: consult.length ? toLine(consult[0].y) : 1,
        gridWorkGlobal: `mtemp${routineName}`.slice(0, 31),
        gridCheckGlobal: `mtemp${routineName}CHECK`.slice(0, 31),
        columns: gridColumns
      };
    });


    // Nada de botão dentro da faixa do grid: ele fica escondido atrás.
    const gridFloor = documentGrids.length
      ? Math.max(...documentGrids.map((grid) => grid.gridLineEnd)) + 2
      : 0;
    const gridTop = documentGrids.length
      ? Math.min(...documentGrids.map((grid) => grid.gridLinePosition))
      : Infinity;
    // Botão acima do grid (Consultar, Limpar) fica onde está.
    const pushDown = (line) => (line < gridTop ? line : Math.max(line, gridFloor));

    // Manutenção entra na fila junto com os outros para a barra não ficar
    // com um buraco no lugar dela.
    const bar = buttons
      .filter((button) => !consult.includes(button))
      .map((button, index) => ({
        index,
        text: button.text || `Botão ${index + 1}`,
        line: pushDown(toLine(button.y)),
        column: toColumn(button.x),
        size: Math.max(8, toSize(button.width)),
        maintenance: button === maintenance
      }));

    alignButtonBar(bar, columns);

    const maintenanceEntry = bar.find((entry) => entry.maintenance);

    const bottom = Math.max(
      0,
      ...components.map((item) => item.bottom),
      ...documentGrids.map((grid) => (grid.gridLineEnd + 1) * cellHeight)
    );

    if (unknown.size) {
      warnings.push(
        `Componentes sem regra de conversão: ${[...unknown.entries()]
          .map(([type, count]) => `${type} (${count})`)
          .join(", ")}.`
      );
    }

    if (!fields.some((field) => field.isKey)) {
      warnings.push("Nenhum campo veio marcado como chave — marque a chave antes de gerar a RG.");
    }

    return {
      routine: {
        name: routineName,
        title,
        mode: documentGrids.some((grid) => grid.location === "parent") ? "grid" : "crud",
        dataVariable: routineName.slice(0, 8),
        useTabs: documentTabs.length > 0,
        useRules: true,
        useBtnManter: Boolean(maintenanceEntry),
        btnManterLine: maintenanceEntry ? maintenanceEntry.line : undefined,
        btnManterColumn: maintenanceEntry ? maintenanceEntry.column : undefined,
        rgRoutineName: `${routineName}RG`,
        entityName: title,
        globalName: routineName,
        // Sem botão de consulta no desenho, a tela não ganha o btnConsultar.

        width: columns,
        height: Math.max(
          20,
          Math.round(bottom / cellHeight) + 2,
          gridFloor + (buttons.length ? 2 : 0),
          ...buttons.map((button) => pushDown(toLine(button.y)) + 2)
        )
      },
      tabs: documentTabs,
      fields,
      grids: documentGrids,
      buttons: bar.filter((entry) => !entry.maintenance).map((entry) => ({
        location: "parent",
        text: entry.text,
        positionMode: "manual",
        line: entry.line,
        column: entry.column,
        size: entry.size,
        buttonId: `bt${app.utils
          .normalizeVariable(entry.text, `BOTAO${entry.index + 1}`)
          .slice(0, 18)}`
      })),
      indexes: fields
        .filter((field) => field.isKey)
        .map((field) => ({
          type: "key",
          fieldId: field.variable,
          parameterName: app.utils.toParameter(field.description)
        })),
      warnings,
      screens: screens.map((item, index) => ({
        index,
        id: item.id || `tela${index}`,
        name: item.name || item.title || `Tela ${index + 1}`,
        components: (item.components || []).length
      })),
      calibration: { cellWidth, cellHeight, columns, estimated }
    };
  }

  /* ------------------------------------------------------------------ *
   * Interface
   * ------------------------------------------------------------------ */

  const EXAMPLE = JSON.stringify(
    {
      id: "WDWDNEW010",
      name: "Planejamento e Programação da Produção",
      index: 9,
      components: [
        { id: "Label", text: "Período de", x: 80, y: 14, width: 74, height: 20 },
        { id: "Csle", x: 155, y: 14, width: 224, height: 24 },
        { id: "Label", text: "Até", x: 410, y: 14, width: 30, height: 20 },
        { id: "Csle", x: 441, y: 14, width: 224, height: 24 },
        { id: "Label", text: "Finalidade", x: 86, y: 42, width: 68, height: 20 },
        { id: "Csle", x: 155, y: 42, width: 224, height: 24 },
        { id: "Display", x: 390, y: 42, width: 430, height: 24 },
        { id: "Label", text: "Tipo de Nota", x: 1004, y: 42, width: 86, height: 20 },
        { id: "Csle", x: 1092, y: 42, width: 162, height: 24 },
        { id: "Display", x: 1268, y: 42, width: 232, height: 24 },
        { id: "Label", text: "Produto", x: 122, y: 70, width: 54, height: 20 },
        { id: "Csle", x: 155, y: 70, width: 224, height: 24 },
        { id: "Display", x: 390, y: 70, width: 430, height: 24 },
        {
          id: "Grid",
          x: 0,
          y: 120,
          width: "1498px",
          height: "436px",
          displayIcon: "fa-table-cells",
          columns: [
            { title: "Check", width: 100, type: "check" },
            { title: "Previsão de Entrega", width: 310 },
            { title: "Pedido", width: 130 },
            { title: "Controle", width: 160 },
            { title: "OP", width: 70 },
            { title: "Engenharia", width: 210 },
            { title: "Engenharia OF", width: 250 },
            { title: "Quantidade", width: 150 }
          ]
        },
        { id: "Button", text: "Manutenção", x: 16, y: 620, width: 224, height: 26 },
        { id: "Button", text: "Gerar Planejamento", x: 256, y: 620, width: 224, height: 26 },
        { id: "Button", text: "Inclusão Engenharia", x: 496, y: 620, width: 224, height: 26 }
      ]
    },
    null,
    2
  );

  const STYLE = `
    .gpj-des-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.5);
      display: flex; align-items: center; justify-content: center; z-index: 86; padding: 20px; }
    .gpj-des-backdrop.hidden { display: none; }
    .gpj-des-card { background: #fff; border-radius: 14px; width: min(1240px, 100%);
      max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 24px 60px rgba(15,23,42,.32); }
    .gpj-des-head { padding: 14px 18px; border-bottom: 1px solid #e5e9f0; display: flex;
      justify-content: space-between; gap: 12px; align-items: flex-start; }
    .gpj-des-head h2 { margin: 0 0 4px; font-size: 17px; }
    .gpj-des-head p { margin: 0; font-size: 12.5px; opacity: .72; max-width: 820px; }
    .gpj-des-body { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 12px 18px; overflow: auto; }
    @media (max-width: 980px) { .gpj-des-body { grid-template-columns: 1fr; } }
    .gpj-des-body textarea { width: 100%; min-height: 340px; font-family: ui-monospace, Consolas, monospace;
      font-size: 12px; line-height: 1.5; padding: 10px; border: 1px solid #d5dbe6; border-radius: 10px; resize: vertical; }
    .gpj-des-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
    .gpj-des-toolbar label { font-size: 12px; display: flex; align-items: center; gap: 5px; }
    .gpj-des-toolbar input[type=number] { width: 76px; padding: 4px 6px; border: 1px solid #d5dbe6; border-radius: 6px; }
    .gpj-des-toolbar select { padding: 4px 6px; border: 1px solid #d5dbe6; border-radius: 6px; font-size: 12.5px; max-width: 280px; }
    .gpj-des-preview { border: 1px solid #e5e9f0; border-radius: 10px; overflow: auto; max-height: 56vh; }
    .gpj-des-preview table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .gpj-des-preview th, .gpj-des-preview td { padding: 5px 8px; border-bottom: 1px solid #eef1f6; text-align: left; white-space: nowrap; }
    .gpj-des-preview th { position: sticky; top: 0; background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
    .gpj-des-section { background: #f8fafc; font-weight: 600; }
    .gpj-des-warn { font-size: 12.5px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a;
      border-radius: 8px; padding: 8px 10px; margin-top: 8px; }
    .gpj-des-foot { padding: 12px 18px; border-top: 1px solid #e5e9f0; display: flex;
      justify-content: space-between; align-items: center; gap: 10px; }
    .gpj-des-foot .right { display: flex; gap: 8px; }
    .gpj-des-foot button, .gpj-des-head button, .gpj-des-toolbar button {
      border: 1px solid #d5dbe6; background: #f6f8fb; border-radius: 8px; padding: 7px 13px;
      font-size: 12.5px; cursor: pointer; }
    .gpj-des-foot button.primary { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 600; }
    .gpj-des-status { font-size: 12.5px; opacity: .78; }
  `;

  let backdrop = null;
  let textarea = null;
  let previewBox = null;
  let statusLabel = null;
  let screenSelect = null;
  let lastResult = null;

  function injectStyle() {
    if (document.getElementById("gpj-des-style")) return;
    const style = document.createElement("style");
    style.id = "gpj-des-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function currentOptions() {
    return {
      screen: Number(screenSelect?.value) || 0,
      columns: Number(backdrop.querySelector("[data-des-columns]").value) || 108,
      cellWidth: Number(backdrop.querySelector("[data-des-cellwidth]").value) || 0,
      cellHeight: Number(backdrop.querySelector("[data-des-cellheight]").value) || 0
    };
  }

  function renderPreview() {
    let parsed = null;

    try {
      parsed = JSON.parse(textarea.value);
    } catch (error) {
      previewBox.innerHTML = `<div style="padding:22px;text-align:center;opacity:.7;font-size:13px">JSON inválido: ${app.utils.escapeHtml(error.message)}</div>`;
      statusLabel.textContent = "Cole o JSON do desenhador.";
      lastResult = null;
      return;
    }

    const result = convert(parsed, currentOptions());
    lastResult = result;

    if (screenSelect && result.screens.length) {
      const current = screenSelect.value;
      screenSelect.innerHTML = result.screens
        .map(
          (screen) =>
            `<option value="${screen.index}">${app.utils.escapeHtml(screen.id)} — ${app.utils.escapeHtml(screen.name)} (${screen.components} comp.)</option>`
        )
        .join("");
      screenSelect.value = current && Number(current) < result.screens.length ? current : "0";
    }

    const cellInputs = {
      width: backdrop.querySelector("[data-des-cellwidth]"),
      height: backdrop.querySelector("[data-des-cellheight]")
    };
    if (cellInputs.width && !cellInputs.width.value) cellInputs.width.placeholder = result.calibration.cellWidth;
    if (cellInputs.height && !cellInputs.height.value) cellInputs.height.placeholder = result.calibration.cellHeight;

    const fieldRows = result.fields
      .map(
        (field) => `
        <tr>
          <td>${app.utils.escapeHtml(field.description)}</td>
          <td><code>${app.utils.escapeHtml(field.variable)}</code></td>
          <td>${app.utils.escapeHtml(field.type)}</td>
          <td>L${field.inputLine} C${field.inputColumn}</td>
          <td>${field.inputSize}</td>
          <td>${field.hasDisplay ? "display" : ""}</td>
          <td>${field.lookupPreset !== "none" ? app.utils.escapeHtml(field.lookupPreset) : ""}</td>
        </tr>`
      )
      .join("");

    const gridRows = result.grids
      .map(
        (grid) => `
        <tr class="gpj-des-section"><td colspan="7">Grid em ${app.utils.escapeHtml(grid.location)} — linha ${grid.gridLinePosition}, altura ${grid.gridHeight}</td></tr>
        ${grid.columns
          .map(
            (column) => `
            <tr>
              <td>${app.utils.escapeHtml(column.title || "(check)")}</td>
              <td><code>${app.utils.escapeHtml(column.variable)}</code></td>
              <td>${column.type}</td>
              <td>piece ${column.workPiece}</td>
              <td>${column.width}</td>
              <td colspan="2"></td>
            </tr>`
          )
          .join("")}`
      )
      .join("");

    const tabRows = result.tabs.length
      ? `<tr class="gpj-des-section"><td colspan="7">Abas: ${result.tabs
          .map((tab) => `${app.utils.escapeHtml(tab.title)} (${tab.contentType})`)
          .join(" · ")}</td></tr>`
      : "";

    const buttonRows = result.buttons.length || result.routine.useBtnManter
      ? `<tr class="gpj-des-section"><td colspan="7">Botões: ${[
          result.routine.useBtnManter ? `Manutenção (linha ${result.routine.btnManterLine})` : "",
          ...result.buttons.map((button) => `${app.utils.escapeHtml(button.text)} (linha ${button.line})`)
        ]
          .filter(Boolean)
          .join(" · ")}</td></tr>`
      : "";

    previewBox.innerHTML = `
      <table>
        <thead><tr><th>Campo</th><th>Variável</th><th>Tipo</th><th>Posição</th><th>Tam.</th><th></th><th>F7</th></tr></thead>
        <tbody>${fieldRows}${tabRows}${gridRows}${buttonRows}</tbody>
      </table>`;

    const warnings = result.warnings.length
      ? `<div class="gpj-des-warn">${result.warnings.map((warning) => app.utils.escapeHtml(warning)).join("<br>")}</div>`
      : "";

    statusLabel.innerHTML = `Rotina <code>${app.utils.escapeHtml(result.routine.name)}</code> · ${result.fields.length} campo(s), ${result.grids.length} grid(s), ${result.tabs.length} aba(s) · célula ${result.calibration.cellWidth} x ${result.calibration.cellHeight}px${warnings}`;
  }

  function open(initial = "") {
    injectStyle();

    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "gpj-des-backdrop hidden";
      backdrop.innerHTML = `
        <div class="gpj-des-card">
          <div class="gpj-des-head">
            <div>
              <h2>Importar do desenhador de telas</h2>
              <p>Cole o JSON da tela desenhada no app React (o objeto com <code>id</code>, <code>name</code> e <code>components</code>). Os componentes em pixel são convertidos para a grade de caracteres do CSW: campos, display, grid, abas e botões.</p>
            </div>
            <button type="button" data-des-close>Fechar</button>
          </div>

          <div class="gpj-des-body">
            <div>
              <div class="gpj-des-toolbar">
                <label>Tela <select data-des-screen></select></label>
              </div>
              <textarea spellcheck="false" placeholder="Cole aqui o JSON do desenhador…"></textarea>
            </div>

            <div>
              <div class="gpj-des-toolbar">
                <label>Colunas <input type="number" min="40" max="240" data-des-columns value="108"></label>
                <label>Largura da célula <input type="number" min="2" step="0.1" data-des-cellwidth placeholder="auto"></label>
                <label>Altura da linha <input type="number" min="4" data-des-cellheight placeholder="auto"></label>
              </div>
              <div class="gpj-des-preview"></div>
            </div>
          </div>

          <div class="gpj-des-foot">
            <span class="gpj-des-status">Cole o JSON do desenhador.</span>
            <div class="right">
              <button type="button" data-des-example>Carregar exemplo</button>
              <button type="button" data-des-json>Copiar JSON do gerador</button>
              <button type="button" class="primary" data-des-apply>Gerar projeto</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(backdrop);

      textarea = backdrop.querySelector("textarea");
      previewBox = backdrop.querySelector(".gpj-des-preview");
      statusLabel = backdrop.querySelector(".gpj-des-status");
      screenSelect = backdrop.querySelector("[data-des-screen]");

      textarea.addEventListener("input", renderPreview);
      screenSelect.addEventListener("change", renderPreview);

      ["[data-des-columns]", "[data-des-cellwidth]", "[data-des-cellheight]"].forEach((selector) =>
        backdrop.querySelector(selector).addEventListener("input", renderPreview)
      );

      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) close();
      });
      backdrop.querySelectorAll("[data-des-close]").forEach((button) =>
        button.addEventListener("click", close)
      );

      backdrop.querySelector("[data-des-example]").addEventListener("click", () => {
        textarea.value = EXAMPLE;
        renderPreview();
      });

      backdrop.querySelector("[data-des-json]").addEventListener("click", () => {
        if (!lastResult) return;
        app.utils.copyText(JSON.stringify(lastResult, null, 2), "JSON do gerador copiado.");
      });

      backdrop.querySelector("[data-des-apply]").addEventListener("click", () => {
        if (!lastResult || (!lastResult.fields.length && !lastResult.grids.length)) {
          app.utils.showToast("Nada reconhecido no JSON do desenhador.");
          return;
        }

        app.projectIO.loadDocument(lastResult);
        close();
        app.utils.showToast(
          `Projeto gerado com ${lastResult.fields.length} campo(s) e ${lastResult.grids.length} grid(s).`
        );
      });
    }

    if (initial) textarea.value = initial;
    backdrop.classList.remove("hidden");
    renderPreview();
    setTimeout(() => textarea.focus(), 0);
  }

  function close() {
    backdrop?.classList.add("hidden");
  }

  function install() {
    const anchor = document.getElementById("labPasteJsonButton");
    if (!anchor || document.getElementById("gpjDesignerImportButton")) return;

    const button = document.createElement("button");
    button.id = "gpjDesignerImportButton";
    button.type = "button";
    button.className = anchor.className;
    button.textContent = "Importar do desenhador";
    button.title = "Converte o JSON do desenhador React para a rotina Caché";
    button.addEventListener("click", () => open());
    anchor.parentElement.insertBefore(button, anchor);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && backdrop && !backdrop.classList.contains("hidden")) {
        close();
      }
    });
  }

  app.designerImport = { convert, open, close, install, EXAMPLE };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})(window.GeradorRotinasJsonPadrao);
