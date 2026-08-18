/*
 * Importador de especificação.
 *
 * Recebe o texto de um documento (Word, Excel, PDF colado, markdown, CSV, lista
 * solta escrita à mão) e monta o projeto: rotina, abas, campos, tipos, tamanhos,
 * chaves, obrigatoriedade, layout e sugestão de F7.
 *
 * Nenhuma chamada externa e nenhuma IA — é análise de texto pura.
 */
(function (app) {
  if (!app) return;

  /* ------------------------------------------------------------------ *
   * Utilidades de texto
   * ------------------------------------------------------------------ */

  const removeAccents = (value) =>
    String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

  const flat = (value) => removeAccents(value).trim().toLowerCase();

  const CONNECTORS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "por", "a", "o", "no", "na", "com"]);

  // Abreviações usadas no padrão CSW para montar o nome da variável.
  const ABBREVIATIONS = {
    codigo: "COD", empresa: "EMP", filial: "FIL", cliente: "CLI", clientes: "CLI",
    fornecedor: "FOR", descricao: "DESC", situacao: "SIT", status: "SIT",
    data: "DAT", datas: "DAT", quantidade: "QTD", valor: "VLR", preco: "PRE",
    percentual: "PERC", percentagem: "PERC", tipo: "TIP", nota: "NOT",
    fiscal: "FIS", produto: "PRO", produtos: "PRO", item: "ITE", itens: "ITE",
    observacao: "OBS", observacoes: "OBS", numero: "NUM", nome: "NOME",
    pedido: "PED", pedidos: "PED", representante: "REP", vendedor: "VEN",
    transportadora: "TRA", transportador: "TRA", moeda: "MOE", tabela: "TAB",
    condicao: "CON", venda: "VEN", vendas: "VEN", compra: "CMP",
    cadastro: "CAD", inicial: "INI", inicio: "INI", final: "FIM", fim: "FIM",
    usuario: "USU", unidade: "UNI", grupo: "GRU", setor: "SET", ramo: "RAM",
    atividade: "ATI", natureza: "NAT", origem: "ORI", destino: "DES",
    estoque: "EST", deposito: "DEP", lote: "LOT", cor: "COR", peso: "PES",
    largura: "LAR", altura: "ALT", comprimento: "COMP", gramatura: "GRA",
    formato: "FOR", diametro: "DIA", embalagem: "EMB", operacao: "OPE",
    motivo: "MOT", limite: "LIM", saldo: "SLD", conta: "CTA", banco: "BAN",
    portador: "POR", frete: "FRE", desconto: "DSC", acrescimo: "ACR",
    comissao: "COM", vencimento: "VCT", emissao: "EMI", entrega: "ENT",
    referencia: "REF", classificacao: "CLA", categoria: "CAT",
    parametro: "PAR", configuracao: "CFG", regra: "REG", ordem: "ORD",
    sequencia: "SEQ", exportacao: "EXP", importacao: "IMP", contrato: "CTR",
    endereco: "END", cidade: "CID", estado: "UF", telefone: "TEL",
    email: "MAIL", cnpj: "CNPJ", cpf: "CPF", inscricao: "INSC"
  };

  const HEADER_ALIASES = {
    campo: "description", descricao: "description", nome: "description",
    label: "description", titulo: "description", "nome do campo": "description",
    variavel: "variable", var: "variable", "variavel csw": "variable",
    tipo: "type", "tipo do campo": "type", formato: "type",
    tamanho: "size", tam: "size", "tamanho maximo": "size", largura: "size",
    obrigatorio: "required", obrig: "required", requerido: "required",
    chave: "key", pk: "key", "chave primaria": "key",
    aba: "tab", "aba/pagina": "tab", pagina: "tab", grupo: "tab",
    f7: "lookup", consulta: "lookup", lookup: "lookup",
    observacao: "note", observacoes: "note", obs: "note", regra: "note"
  };

  const TYPE_WORDS = [
    [/multi.?selec|multi.?sele|multipla escolha|varios/, "multiSelect"],
    [/text.?area|memo|texto longo|texto grande|observac/, "textArea"],
    [/mes.?ano|competencia/, "monthYear"],
    [/\bdata\b|\bdate\b|dt\b|periodo|vigencia|emissao|entrega/, "date"],
    [/checkbox|check|sim.?nao|flag|booleano|logico/, "checkbox"],
    [/radio/, "radio"],
    [/combo|lista|selec|dominio|opcoes|situacao|status/, "combo"],
    [/decimal|monetario|moeda|dinheiro|valor|preco|percent|aliquota|taxa/, "decimal"],
    [/float|real|fracion/, "float"],
    [/inteiro|integer|\bint\b|numerico|numero|\bnum\b|quantidade|qtd|sequenc|codigo/, "integer"],
    [/texto|string|alfanumerico|alfa|char|varchar|descric|nome/, "string"]
  ];

  // Presets completos (com Valcp e display prontos) sugeridos pela descrição.
  const LOOKUP_HINTS = [
    [/\bempresa\b|\bfilial\b/, "empresa"],
    [/\bcliente\b/, "cliente"],
    [/\bproduto\b|\bitem\b/, "produto"],
    [/\bmoeda\b/, "moeda"],
    [/transportador/, "transportadora"],
    [/representante|vendedor/, "representante"],
    [/condicao de venda|condicao venda/, "condicaoVenda"],
    [/tabela de preco|tabela preco/, "tabelaPreco"],
    [/tipo de nota|tipo nota/, "tipoNota"]
  ];

  function words(value) {
    return flat(value)
      .replace(/([a-z])([0-9])/g, "$1 $2")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function abbreviate(word) {
    if (ABBREVIATIONS[word]) return ABBREVIATIONS[word];
    if (word.length <= 4) return word.toUpperCase();
    // Corta em 3 letras mantendo a primeira consoante do fim quando ajuda a ler.
    return word.slice(0, 3).toUpperCase();
  }

  function variableFromDescription(description, used) {
    const significant = words(description).filter((word) => !CONNECTORS.has(word));
    const source = significant.length ? significant : words(description);

    let base = source.map(abbreviate).join("").slice(0, 10);
    if (!base) base = "CAMPO";
    if (/^[0-9]/.test(base)) base = `C${base}`;

    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      const trimmed = base.slice(0, Math.max(1, 10 - String(suffix).length));
      candidate = `${trimmed}${suffix}`;
      suffix += 1;
    }

    used.add(candidate);
    return candidate;
  }

  function inferType(text) {
    const value = flat(text);
    if (!value) return "";
    const found = TYPE_WORDS.find(([pattern]) => pattern.test(value));
    return found ? found[1] : "";
  }

  function inferLookup(description) {
    if (app.f7Assistant && typeof app.f7Assistant.suggest === "function") {
      const best = app.f7Assistant.suggest({ description, variable: "" }, 1)[0];
      if (best && best.score >= 8) return best.candidate.key;
    }

    const value = flat(description);
    const found = LOOKUP_HINTS.find(([pattern]) => pattern.test(value));
    return found ? found[1] : "";
  }

  function defaultSize(type, description) {
    const sizes = {
      integer: 8, float: 12, decimal: 12, date: 8, monthYear: 6,
      combo: 12, checkbox: 10, radio: 10, multiSelect: 10, textArea: 50
    };
    if (sizes[type]) return sizes[type];

    const length = String(description || "").length;
    if (length > 30) return 60;
    if (length > 18) return 40;
    return 30;
  }

  /* ------------------------------------------------------------------ *
   * Quebra do texto em blocos
   * ------------------------------------------------------------------ */

  function splitCells(line) {
    const delimiters = [
      { char: "\t", count: (line.match(/\t/g) || []).length },
      { char: "|", count: (line.match(/\|/g) || []).length },
      { char: ";", count: (line.match(/;/g) || []).length }
    ].sort((a, b) => b.count - a.count);

    const best = delimiters[0];
    if (!best || best.count < 1) return null;

    return line
      .split(best.char)
      .map((cell) => cell.trim())
      .filter((cell, index, list) => !(cell === "" && (index === 0 || index === list.length - 1)));
  }

  function isSeparatorRow(line) {
    return /^[\s|:+-]+$/.test(line) && /[-]{2,}/.test(line);
  }

  function headerMapping(cells) {
    const mapping = {};
    let hits = 0;

    cells.forEach((cell, index) => {
      const key = HEADER_ALIASES[flat(cell)];
      if (key && mapping[key] === undefined) {
        mapping[key] = index;
        hits += 1;
      }
    });

    // Uma linha de dados como "Código da Empresa | inteiro | 4 | chave | obrigatório"
    // também bate em dois nomes de coluna. Só é cabeçalho quando tem a coluna da
    // descrição e a maioria das células é nome de coluna conhecido.
    const recognized = hits / cells.length;
    return hits >= 2 && mapping.description !== undefined && recognized >= 0.6
      ? mapping
      : null;
  }

  const TAB_PATTERNS = [
    /^#{1,6}\s*(.+)$/,
    /^aba\s*(?:grid)?\s*[:\-]\s*(.+)$/i,
    /^\[(.+)\]$/,
    /^p[áa]gina\s*[:\-]\s*(.+)$/i,
    /^={2,}\s*(.+?)\s*={2,}$/
  ];

  function tabHeading(line) {
    const clean = line.trim();
    if (!clean) return null;

    for (const pattern of TAB_PATTERNS) {
      const match = clean.match(pattern);
      if (match) {
        const title = match[1]
          .replace(/^(aba|p[áa]gina|pagina)\s*(grid)?\s*[:\-]\s*/i, "")
          .replace(/^grid\s*[:\-]\s*/i, "")
          .replace(/[:\-=\s]+$/, "")
          .trim();
        if (!title || title.length > 60) return null;
        return { title, grid: /grid/i.test(clean) };
      }
    }

    return null;
  }

  const META_PATTERN =
    /^(rotina|programa|nome da rotina|t[ií]tulo|titulo|global|rg|rotina rg|vari[áa]vel|variavel|entidade|tipo de rotina|modo|largura|altura)\s*[:=]\s*(.+)$/i;

  function metadataFrom(line) {
    const match = line.match(META_PATTERN);
    if (!match) return null;

    const key = flat(match[1]);
    const value = match[2].trim();

    if (["rotina", "programa", "nome da rotina"].includes(key)) return { routineName: value };
    if (["titulo"].includes(key)) return { title: value };
    if (key === "global") return { globalName: value.replace(/^\^/, "") };
    if (["rg", "rotina rg"].includes(key)) return { rgRoutineName: value };
    if (["variavel"].includes(key)) return { dataVariable: value };
    if (key === "entidade") return { entityName: value };
    if (["tipo de rotina", "modo"].includes(key)) {
      return { routineMode: /grid|consulta/i.test(value) ? "grid" : "crud" };
    }
    if (key === "largura") return { windowWidth: Number(value.replace(/\D/g, "")) || undefined };
    if (key === "altura") return { windowHeight: Number(value.replace(/\D/g, "")) || undefined };

    return null;
  }

  /* ------------------------------------------------------------------ *
   * Leitura de uma linha de campo
   * ------------------------------------------------------------------ */

  // Em célula de tabela um "sim" ou "x" já significa obrigatório; em texto
  // corrido isso apagaria palavras legítimas da descrição.
  const REQUIRED_PATTERN = /\b(obrigat[óo]ri[oa]|requerid[oa]|mandat[óo]rio|not null|sim|x)\b/i;
  const REQUIRED_TEXT_PATTERN = /\b(obrigat[óo]ri[oa]|requerid[oa]|mandat[óo]rio|not null)\b/i;
  const KEY_PATTERN = /\b(chave|primary key|pk|identificador)\b/i;

  function cleanDescription(text) {
    return String(text || "")
      .replace(/^[\s\-*•▪·o]+/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/^\[[ xX]\]\s*/, "")
      .replace(/\*+$/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function parseFreeLine(line) {
    let text = cleanDescription(line);
    if (!text) return null;

    const record = { required: false, key: false, size: 0, type: "", note: "" };

    if (/\*\s*$/.test(line) || REQUIRED_TEXT_PATTERN.test(text)) record.required = true;
    if (KEY_PATTERN.test(text)) record.key = true;

    // Tira as marcações antes de procurar tipo/tamanho, senão "Descrição
    // (texto, 45) obrigatório" nunca casa com o parêntese no fim.
    text = text
      .replace(REQUIRED_TEXT_PATTERN, "")
      .replace(KEY_PATTERN, "")
      .replace(/[\s,;:–-]+$/, "")
      .trim();

    // "Descrição (inteiro, 4)" / "Descrição [texto 45]" / "Descrição - data"
    const parenthesis = text.match(/[([{]([^)\]}]*)[)\]}]\s*$/);
    if (parenthesis) {
      const inside = parenthesis[1];
      const type = inferType(inside);
      const size = Number((inside.match(/\d+/) || [])[0]);
      if (type) record.type = type;
      if (size) record.size = size;
      if (REQUIRED_TEXT_PATTERN.test(inside)) record.required = true;
      if (KEY_PATTERN.test(inside)) record.key = true;
      if (type || size) text = text.slice(0, parenthesis.index).trim();
    }

    // "Descrição: texto 45 obrigatório" / "Descrição - inteiro"
    const separator = text.match(/^(.+?)\s*[:\-–]\s*(.+)$/);
    if (separator && !record.type) {
      const type = inferType(separator[2]);
      if (type) {
        record.type = type;
        const size = Number((separator[2].match(/\d+/) || [])[0]);
        if (size) record.size = size;
        text = separator[1].trim();
      }
    }

    text = text.replace(/[\s,;:–-]+$/, "").trim();

    if (!text || text.length < 2) return null;
    if (/^[\d\W]+$/.test(text)) return null;

    record.description = text;
    return record;
  }

  function parseMappedRow(cells, mapping) {
    const pick = (key) =>
      mapping[key] !== undefined ? String(cells[mapping[key]] ?? "").trim() : "";

    const description = cleanDescription(pick("description"));
    if (!description) return null;

    const typeText = pick("type");
    const sizeText = pick("size");
    const requiredText = pick("required");
    const keyText = pick("key");

    return {
      description,
      variable: pick("variable"),
      type: inferType(typeText) || inferType(description),
      size: Number((sizeText.match(/\d+/) || [])[0]) || 0,
      required: REQUIRED_PATTERN.test(requiredText) || /^[1x]$/i.test(requiredText.trim()),
      key: REQUIRED_PATTERN.test(keyText) || /^[1x]$/i.test(keyText.trim()) || KEY_PATTERN.test(keyText),
      tab: pick("tab"),
      lookup: pick("lookup"),
      note: pick("note")
    };
  }

  /* ------------------------------------------------------------------ *
   * Parser principal
   * ------------------------------------------------------------------ */

  function parse(text) {
    const rawLines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const warnings = [];

    const routine = {
      routineName: "",
      title: "",
      routineMode: "crud",
      dataVariable: "",
      rgRoutineName: "",
      globalName: "",
      entityName: "",
      windowWidth: 108,
      windowHeight: 28
    };

    const blocks = [];
    let current = { title: "", grid: false, records: [] };
    let mapping = null;
    blocks.push(current);

    rawLines.forEach((rawLine) => {
      const line = rawLine.replace(/\s+$/, "");
      if (!line.trim()) return;

      const meta = metadataFrom(line.trim());
      if (meta) {
        Object.assign(routine, meta);
        return;
      }

      const heading = tabHeading(line);
      if (heading) {
        current = { title: heading.title, grid: heading.grid, records: [] };
        mapping = null;
        blocks.push(current);
        return;
      }

      if (isSeparatorRow(line)) return;

      const cells = splitCells(line);

      if (cells && cells.length >= 2) {
        const detected = headerMapping(cells);
        if (detected) {
          mapping = detected;
          return;
        }

        if (mapping) {
          const record = parseMappedRow(cells, mapping);
          if (record) current.records.push(record);
          return;
        }

        // Tabela sem cabeçalho reconhecido: assume descrição | tipo | tamanho.
        const description = cleanDescription(cells[0]);
        if (description && description.length > 1) {
          const joined = cells.slice(1).join(" ");
          current.records.push({
            description,
            variable: cells.find((cell) => /^[A-Z][A-Z0-9]{2,9}$/.test(cell.trim())) || "",
            type: inferType(joined) || inferType(description),
            size: Number((joined.match(/\b(\d{1,3})\b/) || [])[1]) || 0,
            required: REQUIRED_PATTERN.test(joined),
            key: KEY_PATTERN.test(joined),
            note: ""
          });
          return;
        }
      }

      const record = parseFreeLine(line);
      if (record) current.records.push(record);
    });

    const used = new Set();
    const filled = blocks.filter((block) => block.records.length);

    if (!filled.length) {
      return { routine, tabs: [], fields: [], indexes: [], grids: [], warnings: ["Nenhum campo foi reconhecido no texto."] };
    }

    // Sem cabeçalho de aba, tudo vai para a rotina principal.
    const useTabs = filled.some((block) => block.title);
    const fields = [];
    const grids = [];
    const tabs = [];

    const suggestedName =
      app.utils.normalizeVariable(routine.routineName, "") ||
      app.utils.normalizeVariable(routine.title, "").slice(0, 10) ||
      "ROTINANOVA";
    const baseDataVariable =
      app.utils.normalizeVariable(routine.dataVariable, "") || suggestedName.slice(0, 8);

    filled.forEach((block, blockIndex) => {
      const isParent = !block.title;
      const tabId = isParent ? "parent" : `aba${blockIndex}`;

      if (!isParent) {
        const position = tabs.length + 1;
        const suffix = words(block.title)
          .filter((word) => !CONNECTORS.has(word))
          .map((word) => abbreviate(word))
          .join("")
          .slice(0, 6);

        tabs.push({
          id: tabId,
          title: block.title,
          routineName: `${suggestedName}TAB${position}`.slice(0, 31),
          gridRgRoutineName: `${suggestedName}TAB${position}RG`.slice(0, 31),
          dataVariable: `${baseDataVariable}${suffix}`.slice(0, 20),
          globalSubscript: String(position + 3),
          contentType: block.grid ? "grid" : "fields"
        });
      }

      if (block.grid && !isParent) {
        grids.push({
          location: tabId,
          gridCode: 40 + tabs.length,
          columns: block.records.map((record, index) => ({
            title: record.description,
            variable: record.variable
              ? app.utils.normalizeVariable(record.variable)
              : variableFromDescription(record.description, used),
            type: record.type || inferType(record.description) || "string",
            width: record.size || defaultSize(record.type, record.description),
            workPiece: index + 1,
            recordKey: record.key === true,
            detail: true
          }))
        });
        return;
      }

      block.records.forEach((record) => {
        const type = record.type || inferType(record.description) || "string";
        const size = record.size || defaultSize(type, record.description);
        const variable = record.variable
          ? app.utils.normalizeVariable(record.variable)
          : variableFromDescription(record.description, used);
        const lookup = record.lookup
          ? String(record.lookup).trim()
          : inferLookup(record.description);

        const field = {
          description: record.description,
          variable,
          type,
          tabId: record.key ? "parent" : tabId,
          isKey: record.key === true,
          required: record.required === true || record.key === true,
          inputSize: Math.min(Math.max(size, 2), 78),
          lookupPreset: lookup || "none",
          _lookupSuggested: Boolean(lookup),
          _note: record.note || ""
        };

        if (type === "textArea") {
          // Em textArea o número da especificação é o total de caracteres,
          // não a largura na tela.
          field.textAreaMaxLength = Math.max(50, size);
          field.textAreaWidth = Math.min(60, Math.max(20, size));
          field.textAreaHeight = size > 200 ? 5 : 3;
          field.inputSize = field.textAreaWidth;
        }

        if (type === "decimal" || type === "float") {
          field.decimalFormat = type === "float" ? "v3" : "v2";
        }

        fields.push(field);
      });
    });

    // Layout: uma linha por campo dentro de cada local, label alinhado pelo maior.
    const byLocation = new Map();
    fields.forEach((field) => {
      const list = byLocation.get(field.tabId) || [];
      list.push(field);
      byLocation.set(field.tabId, list);
    });

    byLocation.forEach((list, tabId) => {
      const isParent = tabId === "parent";
      const labelSize = Math.max(
        12,
        ...list.map((field) => Math.ceil(field.description.length * 0.72) + 2)
      );
      const inputColumn = 1 + labelSize + 1;

      list.forEach((field, index) => {
        const line = (isParent ? 2 : 1) + index;
        field.labelColumn = 1;
        field.labelLine = line;
        field.labelSize = labelSize;
        field.inputColumn = inputColumn;
        field.inputLine = line;
        field.displayLine = line;
        field.displayColumn = inputColumn + field.inputSize + 2;
        field.displaySize = 30;
        field.hasDisplay =
          field._lookupSuggested === true && !["date", "textArea"].includes(field.type);
      });
    });

    const keyFields = fields.filter((field) => field.isKey);
    if (!keyFields.length) {
      warnings.push("Nenhum campo foi identificado como chave. Marque a chave antes de gerar a RG.");
    }

    const result = {
      routine: {
        name: suggestedName,
        title: routine.title || "Rotina gerada pela especificação",
        mode: routine.routineMode,
        dataVariable: baseDataVariable,
        useTabs,
        useRules: true,
        rgRoutineName:
          app.utils.normalizeVariable(routine.rgRoutineName, "") || `${suggestedName}RG`,
        entityName: routine.entityName || routine.title || "Cadastro",
        globalName: app.utils.normalizeVariable(routine.globalName, "") || suggestedName,
        width: routine.windowWidth,
        height: routine.windowHeight
      },
      tabs,
      fields,
      grids,
      indexes: keyFields.map((field) => ({
        type: "key",
        fieldId: field.variable,
        parameterName: app.utils.toParameter(field.description)
      })),
      warnings
    };

    fields.forEach((field) => {
      delete field._lookupSuggested;
      delete field._note;
    });

    return result;
  }

  /* ------------------------------------------------------------------ *
   * Interface
   * ------------------------------------------------------------------ */

  const EXAMPLE = `Rotina: WDOMPV130
Título: Cadastro de Parâmetros de Pedido
Global: WDOMPVPAR

Código da Empresa | inteiro | 4 | chave | obrigatório
Código do Parâmetro | inteiro | 6 | chave | obrigatório

# Dados Gerais
Campo | Tipo | Tamanho | Obrigatório
Descrição | texto | 45 | sim
Situação | combo | 10 | sim
Código do Cliente | inteiro | 10 |
Data do Cadastro | data | 8 |
Percentual de Desconto | decimal | 8 |

# Observações
Observação Geral (textarea, 200)
`;

  const STYLE = `
    .gpj-spec-backdrop {
      position: fixed; inset: 0; background: rgba(15,23,42,.45);
      display: flex; align-items: center; justify-content: center; z-index: 80; padding: 24px;
    }
    .gpj-spec-backdrop.hidden { display: none; }
    .gpj-spec-card {
      background: #fff; border-radius: 14px; width: min(1180px, 100%);
      max-height: 88vh; display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 24px 60px rgba(15,23,42,.3);
    }
    .gpj-spec-head {
      padding: 16px 18px; border-bottom: 1px solid #e5e9f0;
      display: flex; justify-content: space-between; gap: 12px; align-items: flex-start;
    }
    .gpj-spec-head h2 { margin: 0 0 4px; font-size: 17px; }
    .gpj-spec-head p { margin: 0; font-size: 12.5px; opacity: .72; max-width: 760px; }
    .gpj-spec-body { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 14px 18px; overflow: auto; }
    @media (max-width: 900px) { .gpj-spec-body { grid-template-columns: 1fr; } }
    .gpj-spec-body textarea {
      width: 100%; min-height: 320px; font-family: ui-monospace, Consolas, monospace;
      font-size: 12.5px; line-height: 1.5; padding: 10px; border: 1px solid #d5dbe6; border-radius: 10px;
      resize: vertical;
    }
    .gpj-spec-drop { border: 2px dashed #cbd5e1; border-radius: 10px; padding: 10px; text-align: center; font-size: 12.5px; opacity: .8; margin-top: 8px; }
    .gpj-spec-drop.over { border-color: #2563eb; background: #eff6ff; }
    .gpj-spec-preview { border: 1px solid #e5e9f0; border-radius: 10px; overflow: auto; max-height: 460px; }
    .gpj-spec-preview table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .gpj-spec-preview th, .gpj-spec-preview td { padding: 6px 8px; border-bottom: 1px solid #eef1f6; text-align: left; white-space: nowrap; }
    .gpj-spec-preview th { position: sticky; top: 0; background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
    .gpj-spec-tag { font-size: 10.5px; padding: 1px 7px; border-radius: 999px; background: #eef2ff; color: #3730a3; }
    .gpj-spec-warn { font-size: 12.5px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 10px; margin-top: 8px; }
    .gpj-spec-foot { padding: 12px 18px; border-top: 1px solid #e5e9f0; display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .gpj-spec-foot .right { display: flex; gap: 8px; }
    .gpj-spec-foot button, .gpj-spec-head button {
      border: 1px solid #d5dbe6; background: #f6f8fb; border-radius: 8px;
      padding: 8px 14px; font-size: 13px; cursor: pointer;
    }
    .gpj-spec-foot button.primary { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 600; }
    .gpj-spec-count { font-size: 12.5px; opacity: .75; }
  `;

  let backdrop = null;
  let textarea = null;
  let previewBox = null;
  let countLabel = null;
  let lastResult = null;

  function injectStyle() {
    if (document.getElementById("gpj-spec-style")) return;
    const style = document.createElement("style");
    style.id = "gpj-spec-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function renderPreview() {
    const result = parse(textarea.value);
    lastResult = result;

    const locationName = (tabId) =>
      tabId === "parent"
        ? "Principal"
        : result.tabs.find((tab) => tab.id === tabId)?.title || tabId;

    const rows = result.fields
      .map(
        (field) => `
        <tr>
          <td>${app.utils.escapeHtml(field.description)}</td>
          <td><code>${app.utils.escapeHtml(field.variable)}</code></td>
          <td>${app.utils.escapeHtml(field.type)}</td>
          <td>${field.inputSize}</td>
          <td>${field.isKey ? "chave" : field.required ? "obrig." : ""}</td>
          <td>${app.utils.escapeHtml(locationName(field.tabId))}</td>
          <td>${field.lookupPreset && field.lookupPreset !== "none" ? `<span class="gpj-spec-tag">${app.utils.escapeHtml(field.lookupPreset)}</span>` : ""}</td>
        </tr>`
      )
      .join("");

    const gridRows = result.grids
      .map(
        (grid) => `
        <tr>
          <td colspan="7"><strong>Grid — ${app.utils.escapeHtml(locationName(grid.location))}</strong>: ${grid.columns.length} coluna(s): ${app.utils.escapeHtml(grid.columns.map((column) => column.title).join(", "))}</td>
        </tr>`
      )
      .join("");

    previewBox.innerHTML = result.fields.length || result.grids.length
      ? `<table>
          <thead><tr><th>Campo</th><th>Variável</th><th>Tipo</th><th>Tam.</th><th></th><th>Local</th><th>F7</th></tr></thead>
          <tbody>${rows}${gridRows}</tbody>
        </table>`
      : `<div style="padding:24px;text-align:center;opacity:.65;font-size:13px">Cole a especificação ao lado para ver os campos reconhecidos.</div>`;

    const warnings = result.warnings.length
      ? `<div class="gpj-spec-warn">${result.warnings.map((warning) => app.utils.escapeHtml(warning)).join("<br>")}</div>`
      : "";

    countLabel.innerHTML = `${result.fields.length} campo(s), ${result.tabs.length} aba(s), ${result.grids.length} grid(s) · rotina <code>${app.utils.escapeHtml(result.routine.name)}</code>${warnings}`;
  }

  function open(initialText = "") {
    injectStyle();

    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "gpj-spec-backdrop hidden";
      backdrop.innerHTML = `
        <div class="gpj-spec-card">
          <div class="gpj-spec-head">
            <div>
              <h2>Gerar projeto por documento</h2>
              <p>Cole a especificação (Word, Excel, PDF, markdown, CSV ou uma lista escrita à mão) e o gerador monta rotina, abas, campos, tipos, tamanhos, chaves, layout e sugestão de F7.</p>
            </div>
            <button type="button" data-spec-close>Fechar</button>
          </div>
          <div class="gpj-spec-body">
            <div>
              <textarea spellcheck="false" placeholder="Cole aqui o texto da especificação…"></textarea>
              <div class="gpj-spec-drop">Ou arraste um arquivo .txt, .md, .csv ou .tsv para cá</div>
            </div>
            <div>
              <div class="gpj-spec-preview"></div>
            </div>
          </div>
          <div class="gpj-spec-foot">
            <span class="gpj-spec-count"></span>
            <div class="right">
              <button type="button" data-spec-example>Carregar exemplo</button>
              <button type="button" data-spec-json>Copiar JSON</button>
              <button type="button" class="primary" data-spec-apply>Gerar projeto</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      textarea = backdrop.querySelector("textarea");
      previewBox = backdrop.querySelector(".gpj-spec-preview");
      countLabel = backdrop.querySelector(".gpj-spec-count");

      textarea.addEventListener("input", renderPreview);

      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) close();
      });

      backdrop.querySelectorAll("[data-spec-close]").forEach((button) =>
        button.addEventListener("click", close)
      );

      backdrop.querySelector("[data-spec-example]").addEventListener("click", () => {
        textarea.value = EXAMPLE;
        renderPreview();
      });

      backdrop.querySelector("[data-spec-json]").addEventListener("click", () => {
        app.utils.copyText(
          JSON.stringify(lastResult || parse(textarea.value), null, 2),
          "JSON da especificação copiado."
        );
      });

      backdrop.querySelector("[data-spec-apply]").addEventListener("click", () => {
        const result = lastResult || parse(textarea.value);
        if (!result.fields.length && !result.grids.length) {
          app.utils.showToast("Nenhum campo reconhecido no texto.");
          return;
        }

        app.projectIO.loadDocument(result);
        close();
        app.utils.showToast(`Projeto gerado com ${result.fields.length} campo(s).`);
      });

      const drop = backdrop.querySelector(".gpj-spec-drop");
      ["dragenter", "dragover"].forEach((type) =>
        drop.addEventListener(type, (event) => {
          event.preventDefault();
          drop.classList.add("over");
        })
      );
      ["dragleave", "drop"].forEach((type) =>
        drop.addEventListener(type, (event) => {
          event.preventDefault();
          drop.classList.remove("over");
        })
      );
      drop.addEventListener("drop", async (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;
        textarea.value = await file.text();
        renderPreview();
      });
    }

    if (initialText) textarea.value = initialText;
    backdrop.classList.remove("hidden");
    renderPreview();
    setTimeout(() => textarea.focus(), 0);
  }

  function close() {
    backdrop?.classList.add("hidden");
  }

  function install() {
    const anchor = document.getElementById("labPasteJsonButton");
    if (!anchor || document.getElementById("gpjSpecImportButton")) return;

    const button = document.createElement("button");
    button.id = "gpjSpecImportButton";
    button.type = "button";
    button.className = anchor.className;
    button.textContent = "Gerar por documento";
    button.title = "Transforma uma especificação em texto no projeto completo";
    button.addEventListener("click", () => open());
    anchor.parentElement.insertBefore(button, anchor);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && backdrop && !backdrop.classList.contains("hidden")) {
        close();
      }
    });
  }

  app.specImport = {
    parse,
    open,
    close,
    install,
    EXAMPLE,
    // Reaproveitados pelo importador de imagem.
    helpers: { variableFromDescription, inferType, inferLookup, defaultSize, words }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})(window.GeradorRotinasJsonPadrao);
