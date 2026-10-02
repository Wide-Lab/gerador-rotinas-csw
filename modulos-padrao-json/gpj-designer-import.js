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
      const telas = input.filter((item) => item && Array.isArray(item.components));
      if (telas.length) return telas;

      return input.flatMap((item) => screensFrom(item));
    }

    if (input.project && typeof input.project === "object" && !input.components) {
      return screensFrom(input.project);
    }

    const list = first(
      input.screens,
      input.telas,
      input.pages,
      input.views,
      input.rotinas,
      input.routines
    );
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
    // Radio e checkbox vêm antes do botão: "RadioButton" e "CheckButton"
    // casariam com a regra do botão e virariam botão na tela.
    [/radio|opcao|opção|option/, "radio"],
    [/checkbox|check/, "checkbox"],
    [/button|botao|btn/, "button"],
    [/display/, "display"],
    [/csle|input|leitor|textbox|textfield|campo|edit\b/, "input"],
    [/combo|select|dropdown/, "combo"],
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
      // Abas que apontam para outras telas do arquivo.
      tabs: first(raw.tabs, raw.abas, raw.paginas),
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

    // Numa tela de terminal o caractere é quase metade da altura da linha.
    // Sem esse piso, um desenho estreito (uma aba, por exemplo) devolvia
    // célula de 4px e jogava campo e botão para o fim da tela.
    const cellWidth = Math.max(4, cellHeight * 0.45, right / Math.max(1, columns));

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
    if (/^check|^sel\b|marca|^acoes?$|^acao$/.test(name)) return "checkheader";
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

  // Número e data ficam do tamanho do dado; texto acompanha o conteúdo, que
  // costuma ser maior que o título.
  function columnWidth(type, title, samples, drawn, cellWidth) {
    const longest = samples.reduce(
      (maior, value) => Math.max(maior, String(value ?? "").length),
      0
    );

    if (["n", "v2", "v3", "d"].includes(type)) {
      return Math.max(6, Math.min(14, (longest || 8) + 2));
    }

    if (type === "checkheader") return Math.max(4, Math.min(10, title.length + 2));

    if (longest) return Math.max(10, Math.min(40, longest + 2));

    if (drawn > 0) return Math.max(6, Math.round(drawn / cellWidth));

    return Math.max(10, title.length + 2);
  }

  const CONTROL_COLUMN = /^(check|selecionar|selecao|marcar|marca|acoes|acao|editar)$/;

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

      // "link" é a coluna de ação/marcação do desenhador; o título sozinho
      // também basta ("Ações", "Check", "Selecionar").
      const controlTitle = CONTROL_COLUMN.test(flat(title));
      const type =
        controlTitle || (declared === "link" && /check|sel|marca|a[çc][õo]es|editar/i.test(title))
          ? "checkheader"
          : sampled || gridColumnType(isText ? null : item, title);

      if (type !== "checkheader") piece += 1;

      return {
        title: type === "checkheader" ? "" : title,
        variable: helpers.variableFromDescription(title || `COLUNA${index + 1}`, used),
        type,
        width: columnWidth(type, title, samples, width, cellWidth),
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
  function columnMinimum(column) {
    if (column.type === "checkheader") return 4;
    if (["n", "v2", "v3"].includes(column.type)) return 6;
    if (column.type === "d") return 10;
    return 8;
  }

  function fitGridColumns(gridColumns, available) {
    const soma = () => gridColumns.reduce((total, column) => total + column.width, 0);
    const antes = soma();
    if (antes <= available) return 0;

    const ordered = [...gridColumns].sort((a, b) => b.width - a.width);

    while (soma() > available) {
      let changed = false;

      ordered.forEach((column) => {
        if (soma() <= available) return;
        if (column.width > columnMinimum(column)) {
          column.width -= 1;
          changed = true;
        }
      });

      if (!changed) break;
    }

    return antes;
  }

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

      const gap = 2;
      const start = Math.max(2, Math.min(...list.map((entry) => entry.column)));

      // Cada botão do tamanho do próprio texto; a largura do desenho é só um
      // retângulo e deixava a barra ocupando a tela inteira.
      const sizeOf = (entry) => Math.max(10, String(entry.text || "").length + 4);
      const total =
        list.reduce((sum, entry) => sum + sizeOf(entry), 0) + gap * (list.length - 1);
      const excess = start + total - columns;

      let cursor = start;
      list.forEach((entry) => {
        const shrink = excess > 0 ? Math.ceil(excess / list.length) : 0;
        entry.size = Math.max(8, sizeOf(entry) - shrink);
        entry.column = cursor;
        cursor += entry.size + gap;
      });
    });
  }

  // Empurra os elementos de cada linha para a direita até não colidirem.
  function reflowFields(fields, columns, limit = columns) {
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

        // Leitor que passa do limite (largura da janela ou do TabPanel)
        // encolhe até caber.
        if (field.inputColumn + field.inputSize - 1 > limit) {
          field.inputSize = Math.max(4, limit - field.inputColumn + 1);
        }

        cursor = field.inputColumn + field.inputSize + 1;

        if (field.hasDisplay) {
          field.displayColumn = Math.max(field.displayColumn, cursor);
          cursor = field.displayColumn + field.displaySize + 1;
        }

        // Sobrou pouco espaço até o fim da janela: encolhe o display.
        if (field.hasDisplay && field.displayColumn + field.displaySize - 1 > limit) {
          field.displaySize = Math.max(4, limit - field.displayColumn + 1);
          cursor = field.displayColumn + field.displaySize + 1;
        }
      });
    });
  }

  const CONSULT_PATTERN = /^(consultar?|pesquisar?|limpar|filtrar)$/i;

  // Botões que o próprio btnManut desenha.
  const MAINTENANCE_PATTERN = /^(incluir|inserir|novo|manuten[çc][ãa]o|remover|excluir)$/i;

  // "+ Incluir" é o mesmo "Incluir"; o "+" é só enfeite do desenho.
  function buttonLabel(text) {
    const clean = String(text || "").replace(/^\s*\+\s*/, "").trim();
    return clean || String(text || "").trim();
  }

  // Barra Confirmar/Cancelar do cadastro (btnManter).
  const SAVE_PATTERN = /^(confirmar|gravar|salvar)$/i;
  const CANCEL_PATTERN = /^(cancelar)$/i;

  // Tamanho usual do código em cada consulta padrão.
  const LOOKUP_SIZES = {
    empresa: 6,
    cliente: 10,
    produto: 15,
    moeda: 5,
    transportadora: 8,
    representante: 6,
    tipoNota: 4,
    condicaoVenda: 6,
    tabelaPreco: 6
  };

  // Nome padrão da variável em cada consulta. Sem isso o campo "Empresa" vira
  // EMP, que é a variável de retorno do próprio Valcp, e o valor se perde.
  const LOOKUP_VARIABLES = {
    empresa: "CODEMP",
    cliente: "CODCLI",
    produto: "CODITM",
    moeda: "CODMOE",
    transportadora: "CODTRA",
    representante: "CODREP",
    tipoNota: "CODTIPNOT",
    condicaoVenda: "CODCONVEN",
    tabelaPreco: "CODTABPRE"
  };

  // O retângulo do botão no desenho é sempre 200px; o que manda é o texto.
  function buttonSizeFactory(toSize) {
    return (button) => {
      const text = buttonLabel(button.text);
      const drawn = toSize(button.width);
      return Math.max(8, Math.min(drawn || 99, text.length + 4));
    };
  }

  // Dois botões com o mesmo texto não podem dividir o id do controle.
  function buttonIdFactory() {
    const used = new Set();

    return (text, index) => {
      const base = `bt${app.utils
        .normalizeVariable(text, `BOTAO${index + 1}`)
        .slice(0, 18)}`;

      let candidate = base;
      let suffix = 2;
      while (used.has(candidate)) {
        candidate = `${base.slice(0, 18)}${suffix}`;
        suffix += 1;
      }

      used.add(candidate);
      return candidate;
    };
  }

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
    const uniqueButtonId = buttonIdFactory();
    const buttonSize = buttonSizeFactory(toSize);

    // Abas do desenhador apontando para outras telas do arquivo.
    function linkedTabsFrom(list) {
      const strip = list.find(
        (item) =>
          (item.kind === "tabstrip" || item.kind === "tab") &&
          Array.isArray(item.tabs) &&
          item.tabs.length
      );

      if (!strip) return [];

      return strip.tabs
        .map((tab, index) => {
          const title = String(
            first(tab?.name, tab?.title, tab?.text, `Aba ${index + 1}`)
          ).trim();
          const routine = String(first(tab?.routine, tab?.rotina, tab?.tela, "") || "").trim();

          return {
            title,
            routine,
            target: screens.findIndex((item) => String(item.id || "") === routine)
          };
        })
        .filter((tab) => tab.title);
    }

    function convertLinkedTabs(linked, parentFields = []) {
      const parentName = app.utils.normalizeVariable(
        first(options.routineName, screen.id, screen.name, "ROTINANOVA"),
        "ROTINANOVA"
      );
      const parentTitle = String(
        first(options.title, screen.name, screen.title, "Tela importada")
      );

      const panelWidth = Math.max(40, columns - 2);
      const documentTabs = [];
      // O cabeçalho fica na rotina pai, acima do TabPanel.
      const allFields = parentFields.map((field) => ({ ...field, tabId: "parent" }));
      const allGrids = [];
      const allButtons = [];
      const notes = [];

      linked.forEach((tab, index) => {
        const id = `aba${index + 1}`;
        const fallbackName = `${parentName}TAB${index + 1}`;
        const routineName = app.utils
          .normalizeVariable(tab.routine || fallbackName, fallbackName)
          .slice(0, 31);

        let sub = null;

        if (tab.target >= 0) {
          sub = convert(input, {
            ...options,
            screen: tab.target,
            routineName,
            title: tab.title,
            nested: true
          });
        } else {
          notes.push(
            `A aba "${tab.title}" aponta para a tela ${tab.routine || "(sem rotina)"}, que não está neste JSON. Ela entrou vazia.`
          );
        }

        const subGrids = sub ? sub.grids : [];
        if (subGrids.length > 1) {
          notes.push(
            `A aba "${tab.title}" tem ${subGrids.length} grids no desenho, mas uma rotina de aba comporta um só. Ficou o primeiro; o outro precisa de uma aba separada.`
          );
        }

        const grid = subGrids[0] || null;

        documentTabs.push({
          id,
          title: tab.title,
          routineName,
          gridRgRoutineName: `${routineName}RG`.slice(0, 31),
          dataVariable: routineName.slice(0, 20),
          globalSubscript: String(index + 4),
          contentType: grid ? "grid" : "fields",
          // O desenho já diz onde cada campo fica; o alinhamento automático
          // empilharia tudo numa coluna só.
          autoFieldLayout: false
        });

        const tabFields = (sub ? sub.fields : []).map((field) => ({ ...field, tabId: id }));
        // O conteúdo da aba vive dentro do TabPanel, que é mais estreito que
        // a janela.
        reflowFields(tabFields, panelWidth, panelWidth);
        tabFields.forEach((field) => allFields.push(field));

        if (grid) {
          allGrids.push({
            ...grid,
            location: id,
            gridCode: (index + 1) * 10 + 1,
            gridWorkGlobal: `mtemp${routineName}`.slice(0, 31),
            gridCheckGlobal: `mtemp${routineName}CHECK`.slice(0, 31)
          });
        }

        (sub ? sub.buttons : []).forEach((button) => {
          allButtons.push({ ...button, location: id });
        });

        (sub ? sub.warnings : []).forEach((note) => notes.push(`${tab.title}: ${note}`));
      });

      if (!allFields.some((field) => field.isKey)) {
        const codigo = allFields.find((field) => /^(codigo|cod|code)\b/.test(flat(field.description)));
        if (codigo) {
          codigo.isKey = true;
          codigo.required = true;
        }
      }

      if (!allFields.some((field) => field.isKey)) {
        notes.push(
          "Nenhum campo veio marcado como chave. Marque a chave nos Índices gerais da global antes de gerar a RG."
        );
      }

      // Botões da tela de fora: Salvar, Salvar e Criar Outro e Cancelar são a
      // barra do btnManter da rotina pai.
      const parentButtons = components.filter((item) => item.kind === "button");
      const save = parentButtons.find((button) => SAVE_PATTERN.test(buttonLabel(button.text)));
      const another = parentButtons.find((button) => /criar outro/i.test(button.text));
      const cancel = parentButtons.find((button) => CANCEL_PATTERN.test(buttonLabel(button.text)));
      const barButtons = parentButtons.filter(
        (button) => button !== save && button !== another && button !== cancel
      );

      const bar = barButtons.map((button, index) => ({
        index,
        text: buttonLabel(button.text) || `Botão ${index + 1}`,
        line: toLine(button.y),
        column: toColumn(button.x),
        size: buttonSize(button)
      }));

      alignButtonBar(bar, columns);

      return {
        routine: {
          name: parentName,
          title: parentTitle,
          mode: "crud",
          dataVariable: parentName.slice(0, 8),
          useTabs: true,
          useRules: true,
          useBtnManter: Boolean(save),
          generateSaveAnother: Boolean(another),
          generateDelete: false,
          btnManterLine: save ? toLine(save.y) : undefined,
          btnManterColumn: save ? toColumn(save.x) : undefined,
          btnManterLocation: "parent",
          rgRoutineName: `${parentName}RG`,
          entityName: parentTitle,
          globalName: parentName,
          tabPanelColumn: 2,
          tabPanelWidth: panelWidth,
          width: columns
        },
        tabs: documentTabs,
        fields: allFields,
        grids: allGrids,
        buttons: [
          ...allButtons,
          ...bar.map((entry) => ({
            location: "parent",
            text: entry.text,
            positionMode: "manual",
            line: entry.line,
            column: entry.column,
            size: entry.size,
            buttonId: uniqueButtonId(entry.text, entry.index),
            actionLabel: String(6000 + entry.index * 100),
            returnLabel: `${6000 + entry.index * 100}EX`
          }))
        ],
        indexes: [],
        warnings: [...warnings, ...notes],
        screens: screens.map((item, index) => ({
          index,
          id: item.id || `tela${index}`,
          name: item.name || item.title || `Tela ${index + 1}`,
          components: (item.components || []).length
        })),
        calibration: { cellWidth, cellHeight, columns, estimated }
      };
    }


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
    // Só o dono do label se ancora nele; quem herdou o nome se ancora no
    // próprio leitor, senão os dois brigam pela mesma coluna.
    function labelSourceFor(input) {
      return labelOwner.get(input) || null;
    }

    function labelFor(input) {
      const owned = labelOwner.get(input);
      if (owned) return owned.text;

      // Sem label próprio, o texto do componente vira o nome — é o caso do
      // checkbox e do radio, que carregam o texto dentro.
      const own = input.text && !PLACEHOLDER.test(input.text) ? input.text : "";
      if (own) return own;

      // Label da linha já pertence a outro leitor: o segundo campo herda o
      // nome com um número, para não sair repetido na tela.
      const shared = labels
        .filter(
          (label) =>
            Math.abs(label.y - input.y) <= cellHeight * 0.8 &&
            label.x < input.x &&
            label.text &&
            !PLACEHOLDER.test(label.text)
        )
        .sort((a, b) => b.right - a.right)[0];

      if (!shared) return "";

      const order = (sharedLabels.get(shared) || 1) + 1;
      sharedLabels.set(shared, order);
      warnings.push(
        `Dois leitores dividem o label "${shared.text}" na mesma linha; o segundo ficou como "${shared.text} ${order}". Renomeie se a tela pedir outro nome.`
      );

      return `${shared.text} ${order}`;
    }

    // O que sobra dentro do leitor depois de achar o label é um valor de
    // exemplo; ele diz o tipo melhor que o nome do campo.
    function sampleOf(input, description) {
      const own = String(input.text || "").trim();
      if (!own || PLACEHOLDER.test(own) || own === description) return "";
      return own;
    }

    function typeFromSample(sample) {
      if (!sample) return "";
      if (DATE_SAMPLE.test(sample)) return "date";
      if (/^-?[\d.]+,\d+$/.test(sample)) return "decimal";
      if (/^\d+$/.test(sample)) return "integer";
      return "";
    }

    // Texto de exemplo separado por barra é a lista de opções do combo:
    // "Ativo / Inativo" vira duas opções.
    function optionsFromSample(sample) {
      if (!sample) return null;

      const parts = sample
        .split(/\s*[\/|;]\s*/)
        .map((part) => part.trim())
        .filter(Boolean);

      if (parts.length < 2) return null;

      return parts.map((description, position) => ({
        value: String(position + 1),
        description
      }));
    }

    // Número não precisa de leitor largo, mesmo que o desenho esteja largo.
    function sizeFor(type, input, description) {
      const drawn = Math.max(
        6,
        toSize(input.width) || helpers.defaultSize(type, description)
      );

      if (type === "date") return 8;
      if (type === "integer") return Math.min(drawn, 10);
      if (type === "decimal") return Math.min(drawn, 14);
      return drawn;
    }

    function displayFor(input) {
      return displayOwner.get(input) || null;
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

    // Um display pertence ao leitor imediatamente à esquerda dele.
    const displayOwner = new Map();

    [...displays]
      .sort((a, b) => a.x - b.x)
      .forEach((display) => {
        const owner = inputs
          .filter(
            (input) =>
              Math.abs(input.y - display.y) <= cellHeight * 0.8 &&
              input.right <= display.x + cellWidth
          )
          .sort((a, b) => b.right - a.right)
          .find((input) => !displayOwner.has(input));

        if (owner) displayOwner.set(owner, display);
      });

    // Um label pertence ao leitor mais próximo à direita, na mesma linha.
    const labelOwner = new Map();
    const sharedLabels = new Map();

    labels
      .filter((label) => label.text && !PLACEHOLDER.test(label.text))
      .sort((a, b) => a.right - b.right)
      .forEach((label) => {
        const owner = inputs
          .concat(displayOnly)
          .filter(
            (item) =>
              Math.abs(item.y - label.y) <= cellHeight * 0.8 &&
              item.x >= label.right - cellWidth
          )
          .sort((a, b) => a.x - b.x)
          .find((item) => !labelOwner.has(item));

        if (owner) labelOwner.set(owner, label);
      });

    // Display solto vira multi-seleção só quando tem um botão do lado (o "+"
    // que abre a escolha). Sem botão é um campo informativo comum.
    const multiSelectDisplays = displayOnly.filter((display) =>
      buttons.some(
        (button) =>
          Math.abs(button.y - display.y) <= cellHeight * 0.8 &&
          button.x >= display.right - cellWidth * 2 &&
          button.x - display.right <= cellWidth * 8
      )
    );

    const fields = inputs.concat(displayOnly).map((input, position) => {
      const isDisplayOnly = displayOnly.includes(input);
      let description = labelFor(input) || `Campo ${position + 1}`;
      const display = isDisplayOnly ? input : displayFor(input);
      const inferred = helpers.inferType(description);
      const sample = sampleOf(input, description);
      // Leitor com um display "Selecionados" ao lado é multi-seleção.
      const selectionDisplay =
        Boolean(display) && /^selecionad/i.test(String(display.text || "").trim());
      const type =
        multiSelectDisplays.includes(input) || selectionDisplay
          ? "multiSelect"
          : isDisplayOnly
            ? typeFromSample(sample) || inferred || "string"
            : kindToType[input.kind] || typeFromSample(sample) || inferred || "string";
      // Radio, combo ou check desenhado só com as opções: o texto é a lista,
      // não o rótulo do campo.
      const drawnOptions =
        ["radio", "combo", "checkbox"].includes(type) && !labelOwner.get(input)
          ? optionsFromSample(String(input.text || ""))
          : null;

      if (drawnOptions) {
        description = "Opção";
        warnings.push(
          `Um ${type} veio no desenho só com as opções (${drawnOptions
            .map((option) => option.description)
            .join(", ")}). O campo ficou como "Opção" — renomeie para o nome que a tela usa.`
        );
      }

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

      const lookup = ["combo", "radio", "checkbox", "textArea", "multiSelect"].includes(type)
        ? "none"
        : helpers.inferLookup(description) || (input.hasLookup ? "custom" : "none");

      // Campo com F7 de catálogo mostra a descrição ao lado; o Valcp do
      // preset grava justamente nesse display.
      const needsDisplay = lookup !== "none" && lookup !== "custom";

      const field = {
        description,
        variable:
          LOOKUP_VARIABLES[lookup] && !used.has(LOOKUP_VARIABLES[lookup])
            ? (used.add(LOOKUP_VARIABLES[lookup]), LOOKUP_VARIABLES[lookup])
            : helpers.variableFromDescription(description, used),
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
          : LOOKUP_SIZES[lookup] || sizeFor(type, input, description),
        hasDisplay: (Boolean(display) || needsDisplay) && !["date", "textArea"].includes(type),
        displayLine: line,
        displayColumn: display ? toColumn(display.x) : inputColumn + toSize(input.width) + 2,
        displaySize: display ? Math.max(10, toSize(display.width)) : 30,
        // O desenho marca com f7 quando o campo tem consulta.
        lookupPreset: lookup,
        _applyLookupPreset: true
      };

      if (type === "multiSelect") {
        field.multiSelectTableVariable = `TAB${field.variable}`.slice(0, 20);
        field.multiSelectSelectedText = "Selecionados";
      }

      if (["radio", "combo", "checkbox"].includes(type)) {
        // Sem a variável da tabela o campo não compila, mesmo quando o
        // desenho não trouxe as opções.
        field.optionsVariable = `TAB${app.utils
          .normalizeVariable(description, "OPCAO")
          .slice(0, 8)}`;

        const options = optionItemsOf(input) || drawnOptions || optionsFromSample(sample);
        if (options) {
          field.createOptionsTable = true;
          field.optionsItems = options;
        }
      }

      return field;
    });

    reflowFields(fields, columns);

    // Depois dos campos: o cabeçalho da tela de fora entra na rotina pai.
    const linkedTabs = options.nested ? [] : linkedTabsFrom(components);
    if (linkedTabs.length) return convertLinkedTabs(linkedTabs, fields);

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

    // Confirmar/Gravar com Cancelar ao lado é a barra do btnManter; o
    // componente desenha os dois sozinho.
    const saveButton = buttons.find((button) => SAVE_PATTERN.test(button.text.trim()));
    const cancelPair = buttons.find((button) => CANCEL_PATTERN.test(button.text.trim()));
    // Cancelar sozinho continua sendo um botão comum; ele só some da lista
    // quando faz par com o Confirmar.
    // Grid na tela principal joga a rotina para o modo Grid, onde o 3000 é
    // o foco do grid e não a gravação.
    const gridInParent = grids.length > 0 && documentTabs.length === 0;
    const manterPair = Boolean(saveButton && cancelPair) && !gridInParent;

    if (saveButton && cancelPair && gridInParent) {
      warnings.push(
        `Os botões "${saveButton.text}" e "${cancelPair.text}" ficaram como botões comuns: com grid na tela principal a rotina sai no modo Grid, onde o label 3000 é o foco do grid. Se a tela é um cadastro, troque o modo para Cadastro (CRUD) e ligue o btnManter.`
      );
    }
    const cancelButton = manterPair ? cancelPair : null;

    // Só faz sentido como btnManter numa rotina de cadastro; em consulta com
    // grid o "Manutenção" é um botão comum.
    const maintenance = manterPair
      ? saveButton
      : grids.length
        ? null
        : buttons.find((button) => /manuten/i.test(button.text));

    // Incluir + Manutenção + Remover no desenho: é a manutenção em linha do
    // grid. O btnManut cobre os três, então eles saem da lista de botões.
    const inlineButtons = grids.length
      ? buttons.filter((button) => MAINTENANCE_PATTERN.test(buttonLabel(button.text)))
      : [];
    const hasInlineMaintenance = inlineButtons.length >= 2;
    const consult = buttons.filter((button) => CONSULT_PATTERN.test(button.text.trim()));
    const extraButtons = buttons.filter(
      (button) =>
        button !== maintenance && button !== cancelButton && !consult.includes(button)
    );

    // Abaixo do último campo: o grid pega a largura toda, então não cabe ao
    // lado deles.
    const fieldsBottom = fields.length
      ? Math.max(
          ...fields.map((field) =>
            Math.max(
              field.labelLine,
              // Área de texto ocupa mais de uma linha.
              field.inputLine +
                (field.type === "textArea" ? Math.max(1, Number(field.textAreaHeight) || 3) : 1) -
                1
            )
          )
        )
      : 0;

    const documentGrids = grids.map((grid, index) => {
      const line = Math.max(toLine(grid.y), fieldsBottom + 2);

      // Só limita a altura com botão que no desenho está mesmo embaixo do
      // grid; botão ao lado é empurrado depois.
      const below = buttons
        .filter((button) => button.y >= grid.y + grid.height)
        .map((button) => toLine(button.y));
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

      const largura = options.nested ? Math.max(40, columns - 4) : columns - 2;
      const antes = fitGridColumns(gridColumns, largura);

      if (antes) {
        const depois = gridColumns.reduce((soma, column) => soma + column.width, 0);
        warnings.push(
          depois <= largura
            ? `O grid tem ${gridColumns.length} colunas somando ${antes} caracteres e a tela tem ${largura}: as colunas maiores foram encolhidas para caber. Revise as larguras.`
            : `O grid tem ${gridColumns.length} colunas e não cabe na tela: mesmo no tamanho mínimo são ${depois} caracteres para ${largura}. Tire colunas ou aceite a rolagem lateral.`
        );
      }

      const acoes = (Array.isArray(grid.columns) ? grid.columns : []).some((column) =>
        CONTROL_COLUMN.test(flat(String(first(column?.title, column?.text, column?.label, ""))))
      );

      if (acoes) {
        warnings.push(
          'A coluna "Ações" virou coluna de marcação do grid. O menu por linha (TbCellClick + ^%CSW1MENUCLICK) precisa ser escrito à mão na rotina.'
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
        gridLinePositionAuto: false,
        gridHeight: height,
        gridLineStart: line,
        gridLineEnd: line + height - 1,
        gridNavigation: 1,
        // A barra de manutenção fica na mesma linha e coluna dos botões do
        // desenho, não quatro linhas abaixo do grid.
        gridMaintenance: hasInlineMaintenance,
        gridInlineMaintenance: hasInlineMaintenance,
        gridAutoButtonPosition: !hasInlineMaintenance,
        gridMaintenanceButtonColumn: hasInlineMaintenance
          ? toColumn(Math.min(...inlineButtons.map((button) => button.x)))
          : undefined,
        gridMaintenanceButtonLine: hasInlineMaintenance
          ? toLine(Math.min(...inlineButtons.map((button) => button.y)))
          : undefined,
        gridAllowInsert: true,
        gridAllowRemove: true,
        gridRowEnter: true,
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
      .filter(
        (button) =>
          !consult.includes(button) &&
          !(hasInlineMaintenance && inlineButtons.includes(button)) &&
          button !== cancelButton
      )
      .map((button, index) => ({
        index,
        text: button.text || `Botão ${index + 1}`,
        line: pushDown(toLine(button.y)),
        column: toColumn(button.x),
        size: buttonSize(button),
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

    const gridHasKey = documentGrids.some((grid) =>
      grid.columns.some((column) => column.recordKey === true)
    );

    if (!fields.some((field) => field.isKey) && !gridHasKey) {
      const codigo = fields.find((field) => /^(codigo|cod|code)$/.test(flat(field.description)));
      if (codigo) {
        codigo.isKey = true;
        codigo.required = true;
      }
    }

    // Numa aba a chave é da rotina pai, não do conteúdo da aba.
    if (!options.nested && !fields.some((field) => field.isKey) && !gridHasKey) {
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
        buttonId: uniqueButtonId(entry.text, entry.index),
        actionLabel: String(3500 + entry.index * 100),
        returnLabel: String(3500 + entry.index * 100) + "EX"
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
      id: "WDCCMOT010",
      name: "Cadastro de Motivo",
      index: 0,
      components: [
        { id: "Label", text: "Empresa", x: 60, y: 20, width: "100px", height: "24px", index: 0 },
        { id: "Csle", text: "1", x: 170, y: 20, width: "60px", height: "24px", f7: "F7", f8: "", index: 1 },
        { id: "Display", text: "1 - Empresa Natreb", x: 240, y: 20, width: "300px", height: "24px", index: 2 },

        { id: "Label", text: "Cód. Motivo", x: 60, y: 48, width: "100px", height: "24px", index: 3 },
        { id: "Csle", text: "142", x: 170, y: 48, width: "60px", height: "24px", f7: "F7", f8: "", index: 4 },
        { id: "Display", text: "142 - Troca de bobina", x: 240, y: 48, width: "300px", height: "24px", index: 5 },

        { id: "Label", text: "Descrição", x: 60, y: 76, width: "100px", height: "24px", index: 6 },
        { id: "Csle", text: "Troca de bobina", x: 170, y: 76, width: "300px", height: "24px", f7: "", f8: "", index: 7 },

        {
          id: "Grid",
          x: 60,
          y: 120,
          width: "800px",
          height: "200px",
          index: 8,
          gridData: {
            columns: [
              { title: "Setor", field: "codSetor", dataType: "n" },
              { title: "Descrição", field: "descSetor", dataType: "a" },
              { title: "Tempo Meta", field: "tempoMeta", dataType: "n" },
              { title: "Vigência", field: "vigencia", dataType: "d" }
            ],
            data: [
              { codSetor: "15", descSetor: "Comercial", tempoMeta: "10,00", vigencia: "01/01/2026" },
              { codSetor: "7", descSetor: "Engenharia", tempoMeta: "15,00", vigencia: "01/03/2026" }
            ]
          }
        },

        { id: "Button", text: "Incluir", x: 60, y: 350, width: "160px", height: "24px", icon: "fa-save", index: 9 },
        { id: "Button", text: "Manutenção", x: 240, y: 350, width: "160px", height: "24px", index: 10 },
        { id: "Button", text: "Excluir", x: 420, y: 350, width: "160px", height: "24px", icon: "fa-trash", index: 11 }
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
    .gpj-des-api { gap: 6px; }
    .gpj-des-api label.grow { flex: 1 1 auto; min-width: 0; }
    .gpj-des-api label.grow input, .gpj-des-api label.grow select { width: 100%; min-width: 0; }
    .gpj-des-api input[type="password"] { width: 92px; }
    .gpj-des-api input[data-des-projectid] { width: 150px; }

    /* Miniatura: o desenho como ele aparece no builder, reduzido. As classes
       imitam o visual dos componentes React para a tela ser reconhecível.

       Atenção: transform scale desenha menor mas NÃO encolhe a caixa de
       layout — um desenho de 1200px continuaria reservando 1200px e
       arrebentaria a grade do modal. Por isso o canvas vive dentro de uma
       moldura de tamanho já reduzido, com overflow hidden. */
    .gpj-des-body > div { min-width: 0; }
    .gpj-des-mini { border: 1px solid #e5e9f0; border-radius: 10px; background: #eceef1;
      margin-bottom: 8px; padding: 6px; height: 200px; overflow: auto;
      display: flex; align-items: flex-start; justify-content: center; }
    .gpj-des-mini.hidden { display: none; }
    .gpj-des-mini-frame { position: relative; overflow: hidden; flex: 0 0 auto; }
    .gpj-des-mini-canvas { position: absolute; top: 0; left: 0;
      transform-origin: top left; background: #eceef1; }
    .gpj-des-mini-canvas > div { position: absolute; box-sizing: border-box; font-size: 12px;
      overflow: hidden; white-space: nowrap; }
    .gpj-des-mini-label { display: flex; align-items: center; justify-content: flex-end;
      color: #111827; padding-right: 4px; }
    .gpj-des-mini-display { background: #d1d5db; border: 1px solid #9ca3af; border-radius: 5px;
      display: flex; align-items: center; padding-left: 4px; color: #111827; }
    .gpj-des-mini-input { background: #fff; border: 1px solid #9ca3af; border-left: 3px solid #ea580c;
      border-radius: 5px; display: flex; align-items: center; justify-content: space-between;
      padding-left: 4px; color: #111827; }
    .gpj-des-mini-input i { background: #e5e7eb; height: 100%; width: 18px; text-align: center;
      font-style: normal; color: #6b7280; display: flex; align-items: center; justify-content: center; }
    .gpj-des-mini-button { background: #1f2937; color: #fff; border-radius: 5px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; gap: 4px; }
    .gpj-des-mini-radio { display: flex; align-items: center; gap: 8px; color: #111827; }
    .gpj-des-mini-radio span::before { content: "◉ "; }
    .gpj-des-mini-text { background: #fff; border: 1px solid #9ca3af; border-left: 3px solid #ea580c;
      border-radius: 5px; padding: 2px 4px; color: #111827; white-space: normal; }
    .gpj-des-mini-tabs { background: #fff; border: 1px solid #9ca3af; border-radius: 5px; }
    .gpj-des-mini-tabs b { display: inline-block; font-weight: 600; font-size: 11px;
      padding: 3px 10px; border-right: 1px solid #d1d5db; background: #f3f4f6; }
    .gpj-des-mini-tabs b.on { background: #fff; border-bottom: 2px solid #1f2937; }
    .gpj-des-mini-grid { background: #fff; border: 1px solid #9ca3af; }
    .gpj-des-mini-grid table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .gpj-des-mini-grid th { border-bottom: 2px solid #d1d5db; border-left: 1px solid #e5e7eb;
      padding: 1px 4px; font-weight: 600; text-align: left; color: #374151; }
    .gpj-des-mini-grid td { border-bottom: 1px solid #f3f4f6; border-left: 1px solid #f3f4f6;
      padding: 1px 4px; color: #4b5563; }

    /* Botões que abrem outra rotina */
    .gpj-des-links { margin-top: 8px; border: 1px solid #e5e9f0; border-radius: 10px; padding: 8px 10px; }
    .gpj-des-links.hidden { display: none; }
    .gpj-des-links h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase;
      letter-spacing: .4px; opacity: .6; }
    .gpj-des-links .row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-size: 12.5px; }
    .gpj-des-links .row b { flex: 0 0 150px; font-weight: 600; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .gpj-des-links .row select { flex: 1 1 auto; min-width: 0; padding: 4px 6px;
      border: 1px solid #d5dbe6; border-radius: 6px; font-size: 12.5px; }
    .gpj-des-links .row em { flex: 0 0 auto; font-style: normal; font-size: 11.5px; opacity: .6; }
  `;

  let backdrop = null;
  let textarea = null;
  let previewBox = null;
  let statusLabel = null;
  let screenSelect = null;
  let lastResult = null;
  let miniatureBox = null;
  let linksBox = null;
  let miniatureOn = true;

  /* ------------------------------------------------------------------ *
   * Busca direta no builder
   *
   * O desenhador publicado guarda cada projeto no back NestJS, e o que ele
   * grava em `routines` é exatamente o JSON que se colava aqui à mão. Puxar
   * pela API evita o copia-e-cola e traz o projeto inteiro de uma vez — o
   * que importa para as abas, que apontam para outras telas pelo id.
   * ------------------------------------------------------------------ */

  const BUILDER_PADRAO = "https://builder.widelab.com.br/api";
  const BUILDER_CHAVE = "gpj-desenhador-builder";

  function builderPrefs() {
    try {
      return JSON.parse(localStorage.getItem(BUILDER_CHAVE) || "{}") || {};
    } catch (erro) {
      return {};
    }
  }

  function salvarBuilderPrefs(valores) {
    try {
      localStorage.setItem(
        BUILDER_CHAVE,
        JSON.stringify({ ...builderPrefs(), ...valores })
      );
    } catch (erro) {
      /* modo anônimo ou storage cheio: a busca continua funcionando */
    }
  }

  function idDoProjeto(valor) {
    const texto = String(valor || "").trim();
    const achado = /[0-9a-f]{24}/i.exec(texto);
    return achado ? achado[0] : texto;
  }

  function baseDaApi(valor) {
    const texto = String(valor || "").trim().replace(/\/+$/, "");
    if (!texto) return BUILDER_PADRAO;
    return /\/api$/.test(texto) ? texto : `${texto}/api`;
  }

  async function builderGet(base, caminho, token) {
    const cabecalhos = { Accept: "application/json" };
    if (token) cabecalhos.Authorization = `Bearer ${token}`;

    const resposta = await fetch(`${baseDaApi(base)}${caminho}`, {
      method: "GET",
      headers: cabecalhos
    });

    if (resposta.status === 401 || resposta.status === 403) {
      throw new Error(
        "O builder recusou a credencial (HTTP " +
          resposta.status +
          "). Cole um token válido — ele está no localStorage do desenhador, chave \"token\"."
      );
    }

    if (!resposta.ok) {
      throw new Error(`O builder respondeu HTTP ${resposta.status}.`);
    }

    return resposta.json();
  }

  async function listarProjetos(base, token) {
    const dados = await builderGet(base, "/project", token);
    const lista = Array.isArray(dados) ? dados : [dados];

    return lista
      .filter((item) => item && item._id)
      .map((item) => ({
        id: item._id,
        nome: String(item.name || item._id),
        rotinas: (item.routines || []).length
      }));
  }

  async function buscarProjeto(base, id, token) {
    const dados = await builderGet(base, `/project/${idDoProjeto(id)}`, token);
    const projeto = Array.isArray(dados) ? dados[0] : dados;

    if (!projeto || !Array.isArray(projeto.routines) || !projeto.routines.length) {
      throw new Error("O builder devolveu um projeto sem rotinas.");
    }

    return projeto;
  }

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

  // Percorre o texto e devolve cada objeto { ... } completo do primeiro
  // nível, ignorando o que estiver solto em volta.
  function topLevelObjects(text) {
    const objects = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        if (depth === 0) start = index;
        depth += 1;
      } else if (character === "}") {
        depth = Math.max(0, depth - 1);
        if (depth === 0 && start >= 0) {
          objects.push(text.slice(start, index + 1));
          start = -1;
        }
      }
    }

    return objects;
  }

  function parseDesignerJson(text) {
    const raw = String(text || "").trim();

    try {
      return JSON.parse(raw);
    } catch (error) {
      const screens = topLevelObjects(raw)
        .map((piece) => {
          try {
            return JSON.parse(piece);
          } catch (ignored) {
            return null;
          }
        })
        .filter((item) => item && Array.isArray(item.components));

      if (screens.length) return screens;
      throw error;
    }
  }

  /* ------------------------------------------------------------------ *
   * Miniatura da tela
   *
   * Redesenha os componentes na mesma posição em que estão no builder, só
   * que reduzidos. Serve para conferir de olho que a tela escolhida na combo
   * é mesmo a que se quer — o quadro de campos ao lado diz o que virou o quê,
   * mas não parece uma tela.
   * ------------------------------------------------------------------ */

  const escapar = (valor) => app.utils.escapeHtml(String(valor ?? ""));

  const ALTURA_MINIATURA = 200;

  function caixaMiniatura(item, deslocaX = 0, deslocaY = 0) {
    const geometria =
      `left:${item.x - deslocaX}px;top:${item.y - deslocaY}px;` +
      `width:${item.width}px;height:${item.height}px`;

    const simples = (classe, conteudo) =>
      `<div class="${classe}" style="${geometria}">${conteudo}</div>`;

    switch (item.kind) {
      case "label":
        return simples("gpj-des-mini-label", escapar(item.text));

      case "display":
        return simples("gpj-des-mini-display", escapar(item.text));

      case "button":
        return simples("gpj-des-mini-button", escapar(item.text));

      case "textarea":
        return simples("gpj-des-mini-text", escapar(item.text));

      case "radio":
      case "checkbox": {
        const opcoes = Array.isArray(item.options) ? item.options : [];
        const textos = opcoes.length
          ? opcoes.map((opcao) => escapar(opcao?.label ?? opcao))
          : String(item.text || "")
              .split("/")
              .map((parte) => escapar(parte.trim()))
              .filter(Boolean);
        return simples(
          "gpj-des-mini-radio",
          textos.map((texto) => `<span>${texto}</span>`).join("")
        );
      }

      case "tabstrip":
      case "tab": {
        const abas = Array.isArray(item.tabs) ? item.tabs : [];
        return simples(
          "gpj-des-mini-tabs",
          abas
            .map(
              (aba, i) =>
                `<b class="${i === 0 ? "on" : ""}">${escapar(aba?.name || aba?.title || `Aba ${i + 1}`)}</b>`
            )
            .join("")
        );
      }

      case "grid": {
        const colunas = Array.isArray(item.columns) ? item.columns : [];
        const linhas = (Array.isArray(item.rows) ? item.rows : []).slice(0, 6);

        const cabecalho = colunas
          .map((coluna) => `<th>${escapar(coluna?.title ?? coluna?.name ?? coluna)}</th>`)
          .join("");

        const corpo = linhas
          .map(
            (linha) =>
              `<tr>${colunas
                .map((coluna) => `<td>${escapar(linha?.[coluna?.field] ?? "")}</td>`)
                .join("")}</tr>`
          )
          .join("");

        return simples(
          "gpj-des-mini-grid",
          `<table><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody></table>`
        );
      }

      default: {
        const lupa = item.hasLookup ? "<i>&#8981;</i>" : item.kind === "combo" ? "<i>v</i>" : "";
        return simples("gpj-des-mini-input", `<span>${escapar(item.text)}</span>${lupa}`);
      }
    }
  }

  function renderMiniature(screen) {
    if (!miniatureBox) return;

    if (!miniatureOn || !screen) {
      miniatureBox.classList.add("hidden");
      return;
    }

    const itens = (screen.components || []).map(normalizeComponent);
    if (!itens.length) {
      miniatureBox.classList.add("hidden");
      return;
    }

    const esquerda = Math.min(...itens.map((item) => item.x));
    const topo = Math.min(...itens.map((item) => item.y));

    const largura = Math.max(1, ...itens.map((item) => item.right)) - esquerda + 8;
    const altura = Math.max(1, ...itens.map((item) => item.bottom)) - topo + 8;

    const disponivel = Math.max(240, (miniatureBox.clientWidth || 520) - 16);

    const escala = Math.min(1, disponivel / largura);

    const larguraFinal = Math.ceil(largura * escala);
    const alturaFinal = Math.ceil(altura * escala);

    miniatureBox.classList.remove("hidden");
    miniatureBox.style.removeProperty("height");
    miniatureBox.innerHTML =
      `<div class="gpj-des-mini-frame" style="width:${larguraFinal}px;height:${alturaFinal}px">` +
      `<div class="gpj-des-mini-canvas" style="width:${largura}px;height:${altura}px;` +
      `transform:scale(${escala.toFixed(4)})">` +
      itens.map((item) => caixaMiniatura(item, esquerda - 4, topo - 4)).join("") +
      "</div></div>";
  }

  /* ------------------------------------------------------------------ *
   * Botão que abre outra rotina
   *
   * No desenho o "Novo" do WDNRWORK002 abre o WDNRWORK002A. O gerador já
   * sabe fazer isso (botão com "Ao clicar: abrir outra tela"), mas o
   * importador não tinha como saber o destino — agora escolhe-se aqui,
   * entre as telas do próprio projeto carregado.
   * ------------------------------------------------------------------ */

  const NOVO_PATTERN = /^(novo|incluir|inserir|adicionar|editar|manuten[çc][ãa]o|detalhar|abrir)\b/i;

  const destinos = new Map();

  const chaveDestino = (telaId, buttonId) => `${telaId}|${buttonId}`;

  function destinoSugerido(telaId, texto, telas) {
    if (!NOVO_PATTERN.test(String(texto || "").replace(/^\+\s*/, "").trim())) return "";

    const candidatas = telas.filter(
      (tela) => tela.id !== telaId && String(tela.id).startsWith(String(telaId))
    );

    if (!candidatas.length) return "";

    const menor = Math.min(...candidatas.map((tela) => String(tela.id).length));
    const curtas = candidatas.filter((tela) => String(tela.id).length === menor);

    return curtas.length === 1 ? curtas[0].id : "";
  }

  function semearDestinos(result, telaId, telas) {
    if (telas.length < 2) return;

    (result.buttons || []).forEach((button) => {
      const chave = chaveDestino(telaId, button.buttonId);
      if (destinos.has(chave)) return;

      const sugerido = destinoSugerido(telaId, button.text, telas);
      if (sugerido) destinos.set(chave, sugerido);
    });
  }

  function aplicarDestinos(result, telaId) {
    (result.buttons || []).forEach((button) => {
      const alvo = destinos.get(chaveDestino(telaId, button.buttonId));
      if (!alvo) return;

      button.actionType = "screen";
      button.generateRoutine = false;
      button.openRoutine = alvo;
    });
  }

  function renderLinks(result, telaId, telas) {
    if (!linksBox) return;

    const botoes = result.buttons || [];
    if (!botoes.length || telas.length < 2) {
      linksBox.classList.add("hidden");
      linksBox.innerHTML = "";
      return;
    }

    linksBox.classList.remove("hidden");
    linksBox.innerHTML =
      "<h3>Ao clicar, abrir</h3>" +
      botoes
        .map((button) => {
          const chave = chaveDestino(telaId, button.buttonId);
          const escolhido = destinos.get(chave) || "";

          const opcoes = [`<option value="">— label na própria rotina —</option>`]
            .concat(
              telas
                .filter((tela) => tela.id !== telaId)
                .map(
                  (tela) =>
                    `<option value="${escapar(tela.id)}" ${
                      escolhido === tela.id ? "selected" : ""
                    }>${escapar(tela.id)} — ${escapar(tela.name)}</option>`
                )
            )
            .join("");

          const nota = escolhido
            ? `do Show^${escapar(escolhido)}`
            : `label ${escapar(button.actionLabel)}`;

          return (
            `<div class="row"><b title="${escapar(button.text)}">${escapar(button.text)}</b>` +
            `<select data-des-target="${escapar(chave)}">${opcoes}</select>` +
            `<em>${nota}</em></div>`
          );
        })
        .join("");

    linksBox.querySelectorAll("[data-des-target]").forEach((select) =>
      select.addEventListener("change", () => {
        const chave = select.getAttribute("data-des-target");
        if (select.value) destinos.set(chave, select.value);
        else destinos.delete(chave);
        renderPreview();
      })
    );
  }

  function renderPreview() {
    let parsed = null;

    try {
      parsed = parseDesignerJson(textarea.value);
    } catch (error) {
      previewBox.innerHTML = `<div style="padding:22px;text-align:center;opacity:.7;font-size:13px">JSON inválido: ${app.utils.escapeHtml(error.message)}<br><br>Cole o arquivo inteiro ou as telas separadas por vírgula — os colchetes de fora não fazem falta.</div>`;
      statusLabel.textContent = "Cole o JSON do desenhador.";
      lastResult = null;
      miniatureBox?.classList.add("hidden");
      linksBox?.classList.add("hidden");
      return;
    }

    const result = convert(parsed, currentOptions());
    lastResult = result;

    const desenhos = screensFrom(parsed);
    const escolhida = Math.min(
      Math.max(0, Number(currentOptions().screen) || 0),
      Math.max(0, desenhos.length - 1)
    );
    const telaId = result.routine.name || String(escolhida);

    renderMiniature(desenhos[escolhida]);
    semearDestinos(result, telaId, result.screens);
    aplicarDestinos(result, telaId);
    renderLinks(result, telaId, result.screens);

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
              <div class="gpj-des-toolbar gpj-des-api">
                <label class="grow">Builder <input type="text" data-des-api placeholder="${BUILDER_PADRAO}"></label>
                <label>Token <input type="password" data-des-token placeholder="opcional" autocomplete="off"></label>
                <button type="button" data-des-list>Listar projetos</button>
              </div>
              <div class="gpj-des-toolbar gpj-des-api">
                <label class="grow">Projeto <select data-des-project><option value="">— cole o id ou clique em Listar —</option></select></label>
                <input type="text" data-des-projectid placeholder="id ou URL do projeto">
                <button type="button" data-des-fetch>Buscar</button>
              </div>
              <div class="gpj-des-toolbar">
                <label>Tela <select data-des-screen></select></label>
              </div>
              <textarea spellcheck="false" placeholder="Cole aqui o JSON do desenhador — ou puxe direto do builder acima."></textarea>
            </div>

            <div>
              <div class="gpj-des-toolbar">
                <label>Colunas <input type="number" min="40" max="240" data-des-columns value="108"></label>
                <label>Largura da célula <input type="number" min="2" step="0.1" data-des-cellwidth placeholder="auto"></label>
                <label>Altura da linha <input type="number" min="4" data-des-cellheight placeholder="auto"></label>
                <label><input type="checkbox" data-des-mini-toggle checked> Miniatura</label>
              </div>
              <div class="gpj-des-mini hidden" data-des-mini></div>
              <div class="gpj-des-preview"></div>
              <div class="gpj-des-links hidden" data-des-links></div>
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
      miniatureBox = backdrop.querySelector("[data-des-mini]");
      linksBox = backdrop.querySelector("[data-des-links]");

      textarea.addEventListener("input", renderPreview);
      screenSelect.addEventListener("change", renderPreview);

      const chaveMini = backdrop.querySelector("[data-des-mini-toggle]");
      chaveMini.addEventListener("change", () => {
        miniatureOn = chaveMini.checked;
        salvarBuilderPrefs({ miniatura: miniatureOn });
        renderPreview();
      });

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

      /* ---- builder ------------------------------------------------- */

      const campoApi = backdrop.querySelector("[data-des-api]");
      const campoToken = backdrop.querySelector("[data-des-token]");
      const campoId = backdrop.querySelector("[data-des-projectid]");
      const comboProjeto = backdrop.querySelector("[data-des-project]");
      const botaoListar = backdrop.querySelector("[data-des-list]");
      const botaoBuscar = backdrop.querySelector("[data-des-fetch]");

      const prefs = builderPrefs();
      campoApi.value = prefs.api || "";
      campoToken.value = prefs.token || "";
      campoId.value = prefs.projeto || "";

      miniatureOn = prefs.miniatura !== false;
      chaveMini.checked = miniatureOn;

      const guardar = () =>
        salvarBuilderPrefs({
          api: campoApi.value.trim(),
          token: campoToken.value.trim(),
          projeto: campoId.value.trim()
        });

      [campoApi, campoToken, campoId].forEach((campo) =>
        campo.addEventListener("change", guardar)
      );

      async function comEspera(botao, rotulo, tarefa) {
        const original = botao.textContent;
        botaoListar.disabled = true;
        botaoBuscar.disabled = true;
        botao.textContent = rotulo;

        try {
          await tarefa();
        } catch (erro) {
          statusLabel.innerHTML = `<span style="color:#b91c1c">${app.utils.escapeHtml(
            erro.message || String(erro)
          )}</span>`;
        } finally {
          botao.textContent = original;
          botaoListar.disabled = false;
          botaoBuscar.disabled = false;
        }
      }

      botaoListar.addEventListener("click", () =>
        comEspera(botaoListar, "Listando…", async () => {
          guardar();
          const projetos = await listarProjetos(campoApi.value, campoToken.value.trim());

          comboProjeto.innerHTML =
            `<option value="">— ${projetos.length} projeto(s) —</option>` +
            projetos
              .map(
                (projeto) =>
                  `<option value="${app.utils.escapeHtml(projeto.id)}">${app.utils.escapeHtml(
                    projeto.nome
                  )} (${projeto.rotinas})</option>`
              )
              .join("");

          if (prefs.projeto) comboProjeto.value = idDoProjeto(prefs.projeto);
          statusLabel.textContent = `${projetos.length} projeto(s) no builder. Escolha um e clique em Buscar.`;
        })
      );

      comboProjeto.addEventListener("change", () => {
        if (!comboProjeto.value) return;
        campoId.value = comboProjeto.value;
        guardar();
        botaoBuscar.click();
      });

      botaoBuscar.addEventListener("click", () =>
        comEspera(botaoBuscar, "Buscando…", async () => {
          const alvo = campoId.value.trim() || comboProjeto.value;
          if (!alvo) {
            statusLabel.textContent = "Informe o id do projeto ou clique em Listar projetos.";
            return;
          }

          guardar();
          const projeto = await buscarProjeto(campoApi.value, alvo, campoToken.value.trim());

          textarea.value = JSON.stringify(projeto.routines, null, 1);
          renderPreview();

          const nome = app.utils.escapeHtml(String(projeto.name || alvo));
          statusLabel.innerHTML =
            `<code>${nome}</code> — ${projeto.routines.length} tela(s) carregada(s). ` +
            statusLabel.innerHTML;
        })
      );

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

  app.designerImport = {
    parseDesignerJson, convert, open, close, install, EXAMPLE,
    listarProjetos, buscarProjeto, idDoProjeto, baseDaApi };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})(window.GeradorRotinasJsonPadrao);
