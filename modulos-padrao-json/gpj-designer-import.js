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
  const MAINTENANCE_PATTERN = /^(incluir|inserir|novo|manuten[çc][ãa]o|remover)$/i;

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

    function convertLinkedTabs(linked) {
      const parentName = app.utils.normalizeVariable(
        first(options.routineName, screen.id, screen.name, "ROTINANOVA"),
        "ROTINANOVA"
      );
      const parentTitle = String(
        first(options.title, screen.name, screen.title, "Tela importada")
      );

      const panelWidth = Math.max(40, columns - 2);
      const documentTabs = [];
      const allFields = [];
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
        notes.push(
          "A tela de fora só tem as abas e os botões, então nenhum campo veio como chave. Marque a chave nos Índices gerais da global antes de gerar a RG."
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
        size: Math.max(8, toSize(button.width))
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

    const linkedTabs = options.nested ? [] : linkedTabsFrom(components);
    if (linkedTabs.length) return convertLinkedTabs(linkedTabs);

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

    const fields = inputs.concat(displayOnly).map((input, position) => {
      const isDisplayOnly = displayOnly.includes(input);
      const description = labelFor(input) || `Campo ${position + 1}`;
      const display = isDisplayOnly ? input : displayFor(input);
      const inferred = helpers.inferType(description);
      const sample = sampleOf(input, description);
      // Leitor com um display "Selecionados" ao lado é multi-seleção.
      const selectionDisplay =
        Boolean(display) && /^selecionad/i.test(String(display.text || "").trim());
      const type =
        isDisplayOnly || selectionDisplay
          ? "multiSelect"
          : kindToType[input.kind] || typeFromSample(sample) || inferred || "string";
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

        const options = optionItemsOf(input) || optionsFromSample(sample);
        if (options) {
          field.createOptionsTable = true;
          field.optionsItems = options;
        }
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
      ? Math.max(...fields.map((field) => Math.max(field.inputLine, field.labelLine)))
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
          !inlineButtons.includes(button) &&
          button !== cancelButton
      )
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
        // Um label por botão; sem isso todos caem no mesmo 6000.
        actionLabel: String(6000 + entry.index * 100),
        returnLabel: String(6000 + entry.index * 100) + "EX"
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

  function renderPreview() {
    let parsed = null;

    try {
      parsed = parseDesignerJson(textarea.value);
    } catch (error) {
      previewBox.innerHTML = `<div style="padding:22px;text-align:center;opacity:.7;font-size:13px">JSON inválido: ${app.utils.escapeHtml(error.message)}<br><br>Cole o arquivo inteiro ou as telas separadas por vírgula — os colchetes de fora não fazem falta.</div>`;
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

  app.designerImport = {
    parseDesignerJson, convert, open, close, install, EXAMPLE };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})(window.GeradorRotinasJsonPadrao);
