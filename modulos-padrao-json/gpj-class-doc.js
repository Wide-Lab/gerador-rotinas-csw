(function (app) {
  if (!app) return;

  const u = app.utils;

  const NUMERIC_TYPES = ["%Double", "%Decimal"];

  function normalizarTipo(tipo) {
    let t = String(tipo || "").trim();
    if (/^%Library\./i.test(t)) t = "%" + t.slice("%Library.".length);
    if (/^%Float$/i.test(t)) t = "%Double";
    return t;
  }

  const ehTipoNumerico = (tipo) => NUMERIC_TYPES.includes(normalizarTipo(tipo));
  const tipoEhString = (tipo) => normalizarTipo(tipo) === "%String";

  const normalizarDisplayList = (valor) =>
    String(valor || "").replace(/^\s+/, "").replace(/,\s+/g, ",");

  function normalizarProp(prop, ehChave) {
    const tipo = normalizarTipo(prop.tipo);
    const params = { ...prop.params };

    if (params.displaylist) params.displaylist = normalizarDisplayList(params.displaylist);

    if (params.truncate && !tipoEhString(tipo)) delete params.truncate;

    if (ehTipoNumerico(tipo) && !params.scale) params.scale = "2";

    return {
      ...prop,
      tipo,
      params,
      required: ehChave ? true : prop.required
    };
  }

  function normalizarModelo(model) {
    const chaves = new Set(model.chaves);
    return {
      ...model,
      propriedades: model.propriedades.map((p) =>
        normalizarProp(p, Boolean(p.nome) && chaves.has(p.nome))
      )
    };
  }

  const TYPE_RULES = [
    { re: /empresa/, tipo: "Cad.Empresa" },
    { re: /(datahora|dthr|dathor)/, tipo: "%DateTime" },
    { re: /(^dt|data|dta|date|vencimento|emissao)/, tipo: "%Date" },
    { re: /\bhora\b/, tipo: "%Time" },
    { re: /(vlr|valor|preco|custo|montante|saldo)/, tipo: "%Double" },
    { re: /(perc|aliquota|taxa)/, tipo: "%Decimal" },
    { re: /(simnao|^flag|^indica|ativo|habilitado)/, tipo: "%Boolean" },
    { re: /(cod|codigo|qtd|quant|numero|^num|seq|sequencia|ordem)/, tipo: "%Integer" },
    {
      re: /(email|nome|desc|descricao|texto|obs|observacao|titulo|mensagem|login|usuario|oper)/,
      tipo: "%String"
    }
  ];

  const semAcento = (s) =>
    String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

  function inferirTipo(nome) {
    const alvo = semAcento(nome).toLowerCase();
    const regra = TYPE_RULES.find((r) => r.re.test(alvo));
    return regra ? regra.tipo : "%String";
  }

  const ALL_PARAMS = [
    "caption", "format", "maxlen", "minlen", "maxval", "minval",
    "scale", "precision", "truncate", "pattern", "valuelist", "displaylist"
  ];

  const PARAMS_BY_TYPE = {
    "%String": ["caption", "maxlen", "minlen", "truncate", "pattern", "valuelist", "displaylist"],
    "%Integer": ["caption", "format", "minval", "maxval", "valuelist", "displaylist"],
    "%Double": ["caption", "format", "minval", "maxval", "scale"],
    "%Decimal": ["caption", "format", "minval", "maxval", "precision", "scale"],
    "%Date": ["caption", "format"],
    "%DateTime": ["caption", "format"],
    "%Time": ["caption", "format"],
    "%Boolean": ["caption", "valuelist", "displaylist"],
    "DataType.SimNao": ["caption"],
    "Cad.Empresa": ["caption"]
  };

  function paramsAplicaveis(tipo) {
    return new Set(PARAMS_BY_TYPE[normalizarTipo(tipo)] || ALL_PARAMS);
  }

  function prunedParams(prop) {
    const permitidos = paramsAplicaveis(prop.tipo);
    const params = {};
    Object.keys(prop.params || {}).forEach((chave) => {
      if (permitidos.has(chave) && prop.params[chave] !== "" && prop.params[chave] != null) {
        params[chave] = prop.params[chave];
      }
    });
    return { ...prop, params };
  }

  const baseGlobal = (global) => String(global || "").replace(/^%/, "");
  const nomeStorage = (global) => `${baseGlobal(global)}Storage`;
  const nomeSqlMap = (global) => `${baseGlobal(global)}Map`;

  const streamLocationSugerido = (pacote, nomeClasse) =>
    pacote && nomeClasse ? `^${pacote}.${nomeClasse}S` : "";

  function montarParams(prop) {
    const p = prop.params || {};
    const partes = [];

    if (p.caption) partes.push(`CAPTION = "${p.caption}"`);
    if (p.format) partes.push(`FORMAT = ${p.format}`);
    if (p.maxlen) partes.push(`MAXLEN = ${p.maxlen}`);
    if (p.minlen) partes.push(`MINLEN = ${p.minlen}`);
    if (p.maxval) partes.push(`MAXVAL = ${p.maxval}`);
    if (p.minval) partes.push(`MINVAL = ${p.minval}`);
    if (p.precision) partes.push(`PRECISION = ${p.precision}`);
    if (p.scale) partes.push(`SCALE = ${p.scale}`);
    if (p.truncate) partes.push(`TRUNCATE = ${p.truncate}`);
    if (p.pattern) partes.push(`PATTERN = "${p.pattern}"`);
    if (p.valuelist) partes.push(`VALUELIST = "${p.valuelist}"`);
    if (p.displaylist) partes.push(`DISPLAYLIST = "${p.displaylist}"`);

    return partes.length ? `(${partes.join(", ")})` : "";
  }

  const ehTipoTextual = (tipo) =>
    /^%(Library\.)?String$/i.test(String(tipo).trim()) ||
    /^%(Library\.)?Date$/i.test(String(tipo).trim());

  function montarKeywords(prop) {
    const partes = [];
    if (prop.required) partes.push("Required");
    if (prop.initialExpression !== undefined && prop.initialExpression !== "") {
      const v = prop.initialExpression;
      partes.push(`InitialExpression = ${ehTipoTextual(prop.tipo) ? `"${v}"` : v}`);
    }
    return partes.length ? ` [ ${partes.join(", ")} ]` : "";
  }

  function montarProperty(prop) {
    const desc = prop.descricao ? `/// ${prop.descricao}\n` : "";
    return `${desc}Property ${prop.nome} As ${prop.tipo}${montarParams(prop)}${montarKeywords(prop)};`;
  }

  function montarData(prop) {
    if (!prop.piece) return "";
    const { pos, delimiter, sub } = prop.piece;
    const delimXml = sub ? `"${delimiter}","${sub.delimiter}"` : `"${delimiter}"`;
    const pieceXml = sub ? `${pos},${sub.pos}` : `${pos}`;
    return [
      `<Data name="${prop.nome}">`,
      `<Delimiter>${delimXml}</Delimiter>`,
      `<Piece>${pieceXml}</Piece>`,
      `</Data>`
    ].join("\n");
  }

  function montarSubscripts(chaves, subscriptsFixos) {
    const subs = [];
    const fixos = new Map((subscriptsFixos || []).map((f) => [f.pos, f.valor]));
    let pos = 1;

    chaves.forEach((nome) => {
      while (fixos.has(pos)) {
        subs.push({ pos, expr: fixos.get(pos) });
        fixos.delete(pos);
        pos += 1;
      }
      subs.push({ pos, expr: `{${nome}}` });
      pos += 1;
    });

    fixos.forEach((valor, p) => subs.push({ pos: p, expr: valor }));
    subs.sort((a, b) => a.pos - b.pos);

    return subs
      .map((s) =>
        [
          `<Subscript name="${s.pos}">`,
          `<Expression>${s.expr}</Expression>`,
          `</Subscript>`
        ].join("\n")
      )
      .join("\n");
  }

  function montarSqlMapIndice(indice) {
    const subscripts = indice.chaves
      .map((chave, i) =>
        [
          `<Subscript name="${i + 1}">`,
          `<Expression>{${chave}}</Expression>`,
          `</Subscript>`
        ].join("\n")
      )
      .join("\n");

    return [
      `<SQLMap name="${nomeSqlMap(indice.nome)}">`,
      `<Global>^${indice.nome}</Global>`,
      `<PopulationType>nonnull</PopulationType>`,
      `<Structure>delimited</Structure>`,
      subscripts,
      `<Type>index</Type>`,
      `</SQLMap>`
    ].join("\n");
  }

  function montarMetodo(m) {
    const secoes = [
      { titulo: "Regra de Obter", campos: [["metodo-obter", m.metodoObter]] },
      { titulo: "F7 e F8", campos: [["f7", m.f7], ["f8", m.f8]] },
      { titulo: "Gravar e Excluir", campos: [["metodo-gravar", m.metodoGravar], ["metodo-excluir", m.metodoExcluir]] },
      { titulo: "Metodos de Lock", campos: [["metodo-lock", m.metodoLock], ["metodo-unlock", m.metodoUnlock]] },
      { titulo: "Programas e Rotinas", campos: [["programa-principal", m.programaPrincipal], ["programa-detalha", m.programaDetalha]] },
      { titulo: "F7 Dinamico", campos: [["ObterCfgF7", m.obterCfgF7]] }
    ];

    const linhas = [
      `ClassMethod ObterMetodoPadrao(tabDadosClass) As %Library.Status`,
      `{`,
      `\tkill tabDadosClass`
    ];

    secoes.forEach((secao) => {
      const presentes = secao.campos.filter(([, valor]) => valor);
      if (!presentes.length) return;
      linhas.push("", `\t// ${secao.titulo}`);
      presentes.forEach(([chave, valor]) =>
        linhas.push(`\tset tabDadosClass("${chave}")="${valor}"`)
      );
    });

    linhas.push("", `\tquit $$$OK`, `}`);
    return linhas.join("\n");
  }

  function montarRowIdSpecs(subscriptsFixos) {
    return subscriptsFixos
      .map((f) =>
        [
          `<RowIdSpec name="${f.pos}">`,
          `<Expression>"${f.valor}"</Expression>`,
          `<Field>fixa</Field>`,
          `</RowIdSpec>`
        ].join("\n")
      )
      .join("\n");
  }

  function montarStorage(model) {
    const ehSomenteFixa = !model.chaves.length && model.subscriptsFixos.length > 0;
    const dataMapName = nomeSqlMap(model.global);

    const datas = model.propriedades
      .filter((p) => p.piece)
      .slice()
      .sort((a, b) => {
        const d = a.piece.pos - b.piece.pos;
        return d !== 0 ? d : (a.piece.sub?.pos ?? 0) - (b.piece.sub?.pos ?? 0);
      })
      .map(montarData)
      .filter(Boolean)
      .join("\n");

    const blocoData = [
      `<SQLMap name="${dataMapName}">`,
      datas,
      `<Global>^${model.global}</Global>`,
      ehSomenteFixa ? montarRowIdSpecs(model.subscriptsFixos) : null,
      montarSubscripts(model.chaves, model.subscriptsFixos),
      `<Type>data</Type>`,
      `</SQLMap>`
    ]
      .filter((l) => l !== null && l !== "")
      .join("\n");

    const blocos = [{ name: dataMapName, texto: blocoData }].concat(
      model.indices.map((indice) => ({
        name: nomeSqlMap(indice.nome),
        texto: montarSqlMapIndice(indice)
      }))
    );
    blocos.sort((a, b) => a.name.localeCompare(b.name));

    return [
      `Storage ${nomeStorage(model.global)}`,
      `{`,
      `<ExtentSize>100000</ExtentSize>`,
      blocos.map((b) => b.texto).join("\n"),
      `<StreamLocation>${model.streamLocation}</StreamLocation>`,
      `<Type>${ehSomenteFixa ? "%CacheSQLStorage" : "%Storage.SQL"}</Type>`,
      `}`
    ].join("\n");
  }

  function gerarCls(model) {
    const m = normalizarModelo(model);
    const ehSomenteFixa = !m.chaves.length && m.subscriptsFixos.length > 0;
    const storage = nomeStorage(m.global);

    const classKeywords = ehSomenteFixa
      ? `ClassType = persistent, Owner = {_SYSTEM}, ProcedureBlock, SqlRowIdPrivate, StorageStrategy = ${storage}`
      : `ClassType = persistent, Owner = {_SYSTEM}, ProcedureBlock, StorageStrategy = ${storage}`;

    const linhasParametros = [
      `Parameter TITULO = "${m.parametros.titulo}";`,
      `Parameter SITUACAO = ${m.parametros.situacao};`
    ];
    m.indices.forEach((indice) => {
      if (indice.nome && indice.descricao) {
        linhasParametros.push(`Parameter ${indice.nome} = "${indice.descricao}";`);
      }
    });

    const temFixa = m.propriedades.some((p) => p.nome === "fixa");
    const propriedadeFixa = "/// Valor fixa\nProperty fixa As %Integer [ Private ];";
    const properties =
      ehSomenteFixa && !temFixa
        ? [propriedadeFixa].concat(m.propriedades.map(montarProperty)).join("\n\n")
        : m.propriedades.map(montarProperty).join("\n\n");

    const index = ehSomenteFixa
      ? `Index RowId On fixa [ IdKey, PrimaryKey ];`
      : `Index RowId On (${m.chaves.join(", ")}) [ IdKey, PrimaryKey ];`;

    return [
      `Class ${m.pacote}.${m.nomeClasse} Extends %Persistent [ ${classKeywords} ]`,
      "{",
      "",
      linhasParametros.join("\n\n"),
      "",
      properties,
      "",
      index,
      "",
      montarMetodo(m.metodo),
      "",
      montarStorage(m),
      "",
      "}",
      ""
    ].join("\n");
  }

  const TIPO_COS = {
    integer: "%Integer",
    string: "%String",
    textArea: "%String",
    float: "%Double",
    decimal: "%Decimal",
    date: "%Date",
    monthYear: "%String",
    combo: "%Integer",
    checkbox: "%Integer",
    radio: "%Integer",
    multiSelect: "%String"
  };

  function cosTypeFor(field) {
    const porNome = inferirTipo(`${field.variable || ""} ${field.description || ""}`);
    if (porNome === "Cad.Empresa") return porNome;

    return TIPO_COS[field.type] || "%String";
  }

  function propertyName(field, usados) {
    const base = semAcento(field.description || field.variable || "campo")
      .replace(/[^A-Za-z0-9 ]+/g, " ")
      .trim()
      .split(/\s+/)
      .map((parte, i) =>
        i === 0
          ? parte.charAt(0).toLowerCase() + parte.slice(1)
          : parte.charAt(0).toUpperCase() + parte.slice(1)
      )
      .join("");

    let nome = base || "campo";
    if (/^\d/.test(nome)) nome = `c${nome}`;

    let final = nome;
    let sufixo = 2;
    while (usados.has(final)) {
      final = `${nome}${sufixo}`;
      sufixo += 1;
    }
    usados.add(final);
    return final;
  }

  // Coluna de grid: `n` inteiro, `d` data, `vN` decimal com N casas.
  function cosTypeForColumn(coluna) {
    const porNome = inferirTipo(`${coluna.variable || ""} ${coluna.title || ""}`);
    if (porNome === "Cad.Empresa") return porNome;

    if (coluna.type === "n") return "%Integer";
    if (coluna.type === "d") return "%Date";
    if (/^v[0-9]$/.test(coluna.type)) return "%Double";
    return "%String";
  }

  function paramsForColumn(coluna) {
    const params = {};
    const caption = String(coluna.title || "").trim();
    if (caption) params.caption = caption;

    const tipo = cosTypeForColumn(coluna);

    if (tipo === "%Date") params.format = "4";
    if (tipo === "%String" && Number(coluna.width) > 0) {
      params.maxlen = String(Number(coluna.width));
    }
    if (tipo === "%Double") {
      params.scale = /^v([0-9])$/.test(coluna.type) ? coluna.type.slice(1) : "2";
    }

    const itens = Array.isArray(coluna.optionsItems) ? coluna.optionsItems : [];
    if (itens.length && tipo === "%Integer") {
      params.valuelist = itens.map((item) => item.value).join(",");
      params.displaylist = itens.map((item) => item.description).join(",");
    }

    return params;
  }

  function paramsForField(field, tipo) {
    const params = {};
    const caption = String(field.description || "").trim();
    if (caption) params.caption = caption;

    if (tipo === "%Date") params.format = "4";

    if (tipo === "%String") {
      const tamanho =
        field.type === "textArea"
          ? Number(field.textAreaMaxLength) || Number(field.inputSize) || 0
          : Number(field.inputSize) || 0;
      if (tamanho > 0) params.maxlen = String(tamanho);
    }

    if (tipo === "%Double" || tipo === "%Decimal") {
      params.scale = field.decimalFormat === "v3" ? "3" : "2";
    }

    const itens = Array.isArray(field.optionsItems) ? field.optionsItems : [];
    if (itens.length && (tipo === "%Integer" || tipo === "%Boolean")) {
      params.valuelist = itens.map((item) => item.value).join(",");
      params.displaylist = itens.map((item) => item.description).join(",");
    }

    return params;
  }

  const toPascalCase = (texto) =>
    semAcento(texto)
      .replace(/[^A-Za-z0-9 ]+/g, " ")
      .trim()
      .split(/\s+/)
      .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
      .join("");
  function projectModels(overrides = {}) {
    const config = app.getConfig();
    const state = app.state;

    const pieces = app.fields.pieceAssignments(config);
    const chavesDefinidas = app.indexes.effectiveKeyDefinitions(config);
    const chavesPorCampo = new Set(chavesDefinidas.map(({ field }) => field.id));

    const global = baseGlobal(u.normalizeVariable(config.globalName, "GLOBAL"));
    const pacote = String(overrides.pacote || "").trim() || "Pacote";
    const rg = u.normalizeVariable(config.rgRoutineName, "");
    const entidade = String(config.entityName || "").trim();

    function propriedadesChave(usados) {
      const nomes = [];
      const props = [];

      if (config.useRoutineCompany) {
        const nome = propertyName({ description: "Codigo Empresa" }, usados);
        nomes.push(nome);
        props.push({
          descricao: "Código da empresa",
          nome,
          tipo: "Cad.Empresa",
          params: { caption: "Empresa" },
          required: true
        });
      }

      chavesDefinidas.forEach(({ field }) => {
        const tipo = cosTypeFor(field);
        const nome = propertyName(field, usados);
        nomes.push(nome);
        props.push(
          prunedParams({
            descricao: String(field.description || "").trim(),
            nome,
            tipo,
            params: paramsForField(field, tipo),
            required: true
          })
        );
      });

      return { nomes, props };
    }

    const fixosDaGlobal = [];
    let posicao = config.useRoutineCompany ? 1 : 0;
    state.globalIndexes.forEach((index) => {
      posicao += 1;
      if (index.type === "fixed") {
        fixosDaGlobal.push({ pos: posicao, valor: String(index.fixedValue || "1").trim() });
      }
    });

    const grupos = new Map();

    const grupo = (dataVariable) => {
      if (!grupos.has(dataVariable)) {
        grupos.set(dataVariable, { dataVariable, titulo: "", subscrito: "", campos: [] });
      }
      return grupos.get(dataVariable);
    };

    const principal = u.normalizeVariable(config.dataVariable, "DADOS");
    grupo(principal).titulo = "Principal";

    state.tabs.forEach((tab) => {
      if (tab.contentType === "grid") return;
      const variavel = u.normalizeVariable(tab.dataVariable, principal);
      const alvo = grupo(variavel);
      if (!alvo.titulo || alvo.titulo === "Principal") alvo.titulo = tab.title || alvo.titulo;
      if (!alvo.subscrito) alvo.subscrito = String(tab.globalSubscript || "").trim();
    });

    app.fields.mainFields().forEach((field) => {
      if (chavesPorCampo.has(field.id)) return;
      const assignment = pieces.get(field.id);
      if (!assignment) return;
      grupo(assignment.dataVariable).campos.push({ field, piece: assignment.piece });
    });

    // Grid com manutenção grava na global de negócio pelo KillMergeG, então a
    // coluna chave é mais um subscrito e as demais colunas são os pieces
    // daquele nó. Sem isso o grid ficava de fora da documentação.
    const gridLocations = [];

    if (state.parentGrid && config.routineMode === "grid") {
      gridLocations.push({ titulo: "Grid", subscrito: "", definicao: state.parentGrid });
    }

    state.tabs.forEach((tab) => {
      if (tab.contentType !== "grid" || !tab.grid) return;
      gridLocations.push({
        titulo: tab.title || "Grid",
        subscrito: String(tab.globalSubscript || "").trim(),
        definicao: tab.grid
      });
    });

    const modelos = [];

    grupos.forEach((item) => {
      if (!item.campos.length && item.dataVariable !== principal) return;

      const usados = new Set();
      const { nomes, props } = propriedadesChave(usados);

      item.campos
        .slice()
        .sort((a, b) => a.piece - b.piece)
        .forEach(({ field, piece }) => {
          const tipo = cosTypeFor(field);
          props.push(
            prunedParams({
              descricao: String(field.description || "").trim(),
              nome: propertyName(field, usados),
              tipo,
              params: paramsForField(field, tipo),
              required: field.required === true,
              piece: { pos: piece, delimiter: "^" }
            })
          );
        });

      const fixos = fixosDaGlobal.slice();
      if (item.subscrito) {
        fixos.push({ pos: nomes.length + 1, valor: item.subscrito });
      }

      const sufixo = item.dataVariable === principal ? "" : toPascalCase(item.titulo || item.dataVariable);
      const nomeClasse = String(overrides.nomeClasse || global) + sufixo;

      modelos.push({
        id: item.dataVariable,
        rotulo: `${item.titulo || item.dataVariable} — ${item.dataVariable}`,
        modelo: {
          pacote,
          nomeClasse,
          global,
          parametros: {
            titulo: String(config.title || config.routineTitle || nomeClasse),
            situacao: 1
          },
          propriedades: props,
          chaves: nomes,
          subscriptsFixos: fixos,
          indices: [],
          metodo: {
            metodoObter: rg && entidade ? `Obter${entidade}^${rg}` : "",
            f7: "",
            f8: "",
            metodoGravar: rg && entidade ? `Gravar${entidade}^${rg}` : "",
            metodoExcluir: rg && entidade ? `Excluir${entidade}^${rg}` : "",
            metodoLock: "",
            metodoUnlock: "",
            programaPrincipal: u.normalizeVariable(config.routineName, ""),
            programaDetalha: "",
            obterCfgF7: ""
          },
          streamLocation: streamLocationSugerido(pacote, nomeClasse)
        }
      });
    });

    gridLocations.forEach((local) => {
      const definicao = local.definicao;
      const settings = definicao.settings || {};
      if (settings.gridMaintenance !== true) return;

      const colunas = (definicao.columns || []).filter(
        (coluna) => coluna.type !== "checkheader"
      );
      const chaveColuna = colunas.find((coluna) => coluna.recordKey === true);
      if (!chaveColuna) return;

      const usados = new Set();
      const { nomes, props } = propriedadesChave(usados);

      const nomeChaveColuna = propertyName(
        { description: chaveColuna.title, variable: chaveColuna.variable },
        usados
      );
      nomes.push(nomeChaveColuna);
      props.push(
        prunedParams({
          descricao: String(chaveColuna.title || "").trim(),
          nome: nomeChaveColuna,
          tipo: cosTypeForColumn(chaveColuna),
          params: paramsForColumn(chaveColuna),
          required: true
        })
      );

      colunas
        .filter((coluna) => coluna !== chaveColuna && Number(coluna.workPiece) > 0)
        .sort((a, b) => Number(a.workPiece) - Number(b.workPiece))
        .forEach((coluna) => {
          props.push(
            prunedParams({
              descricao: String(coluna.title || "").trim(),
              nome: propertyName(
                { description: coluna.title, variable: coluna.variable },
                usados
              ),
              tipo: cosTypeForColumn(coluna),
              params: paramsForColumn(coluna),
              required: coluna.required === true,
              piece: { pos: Number(coluna.workPiece), delimiter: "^" }
            })
          );
        });

      const fixos = fixosDaGlobal.slice();
      if (local.subscrito) {
        fixos.push({ pos: nomes.length, valor: local.subscrito });
      }

      const nomeClasse =
        String(overrides.nomeClasse || global) + toPascalCase(local.titulo);

      modelos.push({
        id: `grid-${local.titulo}`,
        rotulo: `${local.titulo} (grid) — ${settings.gridWorkGlobal || "grid"}`,
        modelo: {
          pacote,
          nomeClasse,
          global,
          parametros: {
            titulo: String(config.title || config.routineTitle || nomeClasse),
            situacao: 1
          },
          propriedades: props,
          chaves: nomes,
          subscriptsFixos: fixos,
          indices: [],
          metodo: {
            metodoObter: "",
            f7: "",
            f8: "",
            metodoGravar: "",
            metodoExcluir: "",
            metodoLock: "",
            metodoUnlock: "",
            programaPrincipal: u.normalizeVariable(config.routineName, ""),
            programaDetalha: "",
            obterCfgF7: ""
          },
          streamLocation: streamLocationSugerido(pacote, nomeClasse)
        }
      });
    });

    return modelos;
  }

  const STYLE = `
    .gpj-cls-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.5);
      display: flex; align-items: center; justify-content: center; z-index: 88; padding: 20px; }
    .gpj-cls-backdrop.hidden { display: none; }
    .gpj-cls-card { background: #fff; border-radius: 14px; width: min(1100px, 100%);
      max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 24px 60px rgba(15,23,42,.32); }
    .gpj-cls-head { padding: 14px 18px; border-bottom: 1px solid #e5e9f0; display: flex;
      justify-content: space-between; gap: 12px; align-items: flex-start; }
    .gpj-cls-head h2 { margin: 0 0 4px; font-size: 17px; }
    .gpj-cls-head p { margin: 0; font-size: 12.5px; opacity: .72; max-width: 780px; }
    .gpj-cls-body { padding: 12px 18px; overflow: auto; }
    .gpj-cls-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; }
    .gpj-cls-toolbar label { font-size: 12px; display: flex; align-items: center; gap: 5px; }
    .gpj-cls-toolbar input { padding: 5px 7px; border: 1px solid #d5dbe6; border-radius: 6px;
      font-size: 12.5px; width: 170px; }
    .gpj-cls-code { border: 1px solid #e5e9f0; border-radius: 10px; background: #0f172a;
      color: #e2e8f0; padding: 12px 14px; overflow: auto; max-height: 56vh;
      font-family: ui-monospace, Consolas, monospace; font-size: 12px; line-height: 1.55;
      white-space: pre; margin: 0; }
    .gpj-cls-warn { font-size: 12.5px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a;
      border-radius: 8px; padding: 8px 10px; margin-top: 8px; }
    .gpj-cls-foot { padding: 12px 18px; border-top: 1px solid #e5e9f0; display: flex;
      justify-content: space-between; align-items: center; gap: 10px; }
    .gpj-cls-foot .right { display: flex; gap: 8px; }
    .gpj-cls-foot button, .gpj-cls-head button {
      border: 1px solid #d5dbe6; background: #f6f8fb; border-radius: 8px; padding: 7px 13px;
      font-size: 12.5px; cursor: pointer; }
    .gpj-cls-foot button.primary { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 600; }
    .gpj-cls-status { font-size: 12.5px; opacity: .78; }
  `;

  let backdrop = null;
  let codeBox = null;
  let statusLabel = null;
  let lastCls = "";

  // O pacote sai das pastas sob `classescls`, não do nome da global: em
  // `WDOMPVPD`, `WD` é a customização, `OM` a conta e `PV` o módulo. A pasta
  // `Wdom_Fat` é o pacote `Wdom.Fat` — o `_` é o separador.
  const CLASSES_FOLDER_KEY = "classes-directory";

  let classesFolder = null;
  let knownPackages = [];
  let folderPath = "";
  const ACCOUNT_PREFIXES = ["WD", "CI", "GC", "AS", "BP", "PR"];

  function accountFromName(nome) {
    const limpo = String(nome || "").toUpperCase();
    const prefixo = ACCOUNT_PREFIXES.find((p) => limpo.startsWith(p));
    if (!prefixo) return null;

    const conta = limpo.slice(prefixo.length, prefixo.length + 2);
    if (!/^[A-Z]{2}$/.test(conta)) return null;

    return {
      prefixo,
      conta: conta.toLowerCase(),
      pacoteBase:
        prefixo.charAt(0) + prefixo.slice(1).toLowerCase() + conta.toLowerCase()
    };
  }

  async function subFolder(handle, nome) {
    try {
      const achada = await handle.getDirectoryHandle(nome, { create: false });
      return achada;
    } catch (erro) {
      return null;
    }
  }

  // Da raiz dá para descer até `DESENV/custom/<conta>/classescls`; subir não
  // dá, a API do navegador não expõe a pasta-mãe.
  async function resolveClassesFolder(handle, conta) {
    if (!handle) return null;

    if (handle.name.toLowerCase() === "classescls") {
      folderPath = handle.name;
      return handle;
    }

    const custom = await customFolder(handle);

    if (custom && conta) {
      const daConta = await subFolder(custom, conta);
      const classes = daConta ? await subFolder(daConta, "classescls") : null;
      if (classes) {
        folderPath = `custom/${conta}/classescls`;
        return classes;
      }
    }

    const direta = await subFolder(handle, "classescls");
    if (direta) {
      folderPath = `${handle.name}/classescls`;
      return direta;
    }

    folderPath = "";
    return null;
  }

  async function cloneAccounts(handle) {
    const desenv = (await subFolder(handle, "DESENV")) || (await subFolder(handle, "desenv"));
    const custom = desenv ? await subFolder(desenv, "custom") : await subFolder(handle, "custom");
    if (!custom) return [];

    const contas = [];
    for await (const [nome, filho] of custom.entries()) {
      if (filho.kind === "directory") contas.push(nome);
    }
    return contas.sort();
  }

  const normalizePackage = (texto) =>
    String(texto || "")
      .replace(/_/g, ".")
      .replace(/\.{2,}/g, ".")
      .replace(/^\.+|\.+$/g, "");

  // Pacote é pasta de primeiro nível, e só ela: descer mais conta subpasta de
  // conteúdo como pacote. O nome guardado é o do disco, para reusar a grafia
  // existente em vez de criar `Wdom_fat` ao lado de `Wdom_Fat`.
  let folderByPackage = new Map();

  async function scanPackages(handle) {
    const encontrados = new Set();
    folderByPackage = new Map();
    if (!handle) return encontrados;

    for await (const [nome, filho] of handle.entries()) {
      if (filho.kind === "directory") {
        const pacote = normalizePackage(nome);
        if (!pacote) continue;
        encontrados.add(pacote);
        folderByPackage.set(pacote.toLowerCase(), nome);
        continue;
      }

      if (!/\.cls$/i.test(nome)) continue;
      const partes = nome.replace(/\.cls$/i, "").split(".").filter(Boolean);
      partes.pop();
      if (!partes.length) continue;

      const pacote = normalizePackage(partes.join("."));
      if (pacote) encontrados.add(pacote);
    }

    return encontrados;
  }

  function packageFolder(pacote) {
    const chave = normalizePackage(pacote).toLowerCase();
    return folderByPackage.get(chave) || normalizePackage(pacote).replace(/\./g, "_");
  }

  let rootFolder = null;
  let pendingRoot = null;
  let accountFolder = null;
  let pinnedFolder = null;
  let availableAccounts = [];

  async function suggestedFolder() {
    if (!rootFolder) {
      const rotinas = app.files.outputDirectory && app.files.outputDirectory();
      return rotinas || "documents";
    }

    const identidade = currentIdentity();
    if (!identidade) return rootFolder;

    const anterior = folderPath;
    const alvo = await resolveClassesFolder(rootFolder, identidade.conta);
    folderPath = anterior;

    return alvo || rootFolder;
  }

  async function selectClassesFolder() {
    if (!app.files || !app.files.supportsDirectoryAccess()) {
      return { erro: "Este navegador não permite escolher uma pasta." };
    }

    try {
      // O Chrome guarda a última pasta por id do seletor. Enquanto falta a
      // raiz é preciso outro id, senão ele reabre na `classescls` da conta
      // anterior.
      const inicio = await suggestedFolder();

      const handle = await window.showDirectoryPicker({
        id: rootFolder ? "gpj-classes" : "gpj-clone-root",
        mode: "readwrite",
        startIn: inicio
      });

      const ehRaiz = Boolean(await customFolder(handle));

      if (ehRaiz) {
        rootFolder = handle;
        pendingRoot = null;
        pinnedFolder = null;

        await app.files.rememberHandle(CLASSES_FOLDER_KEY, { handle, raiz: true });
      } else {
        pinnedFolder = handle;
      }

      await applyRoot();
      return { handle, ehRaiz };
    } catch (error) {
      if (error && error.name === "AbortError") return {};
      return { erro: error?.message || "Não foi possível abrir a pasta." };
    }
  }
  async function customFolder(handle) {
    if (!handle) return null;

    if (handle.name.toLowerCase() === "custom") return handle;

    const desenv = (await subFolder(handle, "DESENV")) || (await subFolder(handle, "desenv"));
    if (desenv) {
      const custom = await subFolder(desenv, "custom");
      if (custom) return custom;
    }

    return await subFolder(handle, "custom");
  }
  async function useRoutinesFolder() {
    if (rootFolder || !app.files.outputDirectory) return;

    const rotinas = app.files.outputDirectory();
    if (!rotinas) return;

    if (await customFolder(rotinas)) {
      rootFolder = rotinas;
      return;
    }

    const classes = await subFolder(rotinas, "classescls");
    if (classes) {
      accountFolder = { conta: rotinas.name.toLowerCase(), handle: classes };
      return;
    }

  }

  async function applyRoot() {
    await useRoutinesFolder();

    if (rootFolder) {
      availableAccounts = await cloneAccounts(rootFolder);

      const identidade = currentIdentity();

      classesFolder = await resolveClassesFolder(
        rootFolder,
        identidade ? identidade.conta : ""
      );

      if (!classesFolder && pinnedFolder) {
        classesFolder = pinnedFolder;
        folderPath = pinnedFolder.name;
      }
    } else if (accountFolder) {
      const identidade = currentIdentity();
      const bate = !identidade || identidade.conta === accountFolder.conta;

      availableAccounts = [];
      classesFolder = bate ? accountFolder.handle : null;
      folderPath = bate ? `custom/${accountFolder.conta}/classescls` : "";

      if (!classesFolder) return;
    } else if (pinnedFolder) {
      availableAccounts = [];
      classesFolder = pinnedFolder;
      folderPath = pinnedFolder.name;
    } else {
      return;
    }

    await loadPackages();
  }

  async function loadPackages() {
    if (!classesFolder) {
      knownPackages = [];
      return;
    }

    try {
      const encontrados = await scanPackages(classesFolder);
      knownPackages = [...encontrados].sort((a, b) => a.localeCompare(b, "pt-BR"));
    } catch (error) {
      knownPackages = [];
    }
  }

  async function recallClassesFolder() {
    if (rootFolder || pendingRoot || !app.files || !app.files.recallHandle) return;

    const guardado = await app.files.recallHandle(CLASSES_FOLDER_KEY);
    if (!guardado) {
      return;
    }

    const handle = guardado.handle || guardado;
    const marcadaComoRaiz = guardado.raiz === true;

    const permissao =
      typeof handle.queryPermission === "function"
        ? await handle.queryPermission({ mode: "readwrite" })
        : "denied";

    if (permissao === "denied") {
      await app.files.rememberHandle(CLASSES_FOLDER_KEY, null);
      return;
    }

    if (permissao === "prompt") {
      if (marcadaComoRaiz) pendingRoot = handle;
      else await app.files.rememberHandle(CLASSES_FOLDER_KEY, null);
      return;
    }

    if (!marcadaComoRaiz && !(await customFolder(handle))) {
      await app.files.rememberHandle(CLASSES_FOLDER_KEY, null);
      return;
    }

    rootFolder = handle;
  }

  // Autorizar exige gesto do usuário, então roda no clique do botão.
  async function grantRememberedRoot() {
    if (!pendingRoot) return false;

    const ok = await app.files.requestWritePermission(pendingRoot);
    if (!ok) return false;

    rootFolder = pendingRoot;
    pendingRoot = null;
    await applyRoot();
    return true;
  }
  async function writeToFolder(pacote, nomeClasse, conteudo) {
    if (!classesFolder) return { erro: "Nenhuma pasta de classes escolhida." };

    const ok = await app.files.requestWritePermission(classesFolder);
    if (!ok) return { erro: "Sem permissão de escrita na pasta." };

    const nomePasta = packageFolder(pacote);
    const nomeArquivo = `${nomeClasse}.cls`;

    try {
      const destino = await classesFolder.getDirectoryHandle(nomePasta, { create: true });
      const arquivo = await destino.getFileHandle(nomeArquivo, { create: true });

      const writable = await arquivo.createWritable();
      try {
        await writable.write(conteudo);
      } finally {
        await writable.close();
      }

      return { caminho: `${nomePasta}/${nomeArquivo}` };
    } catch (error) {
      return { erro: error?.message || "Não foi possível gravar o arquivo." };
    }
  }

  function injectStyle() {
    if (document.getElementById("gpj-cls-style")) return;
    const style = document.createElement("style");
    style.id = "gpj-cls-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  let lastFileName = "";
  let lastPackage = "";
  let lastClassName = "";

  let filledBase = "";

  function applyDefaultPackage(forcar = false) {
    if (!backdrop) return;

    const campo = backdrop.querySelector("[data-cls-pacote]");
    const padrao = defaultPackage();
    if (!padrao) return;

    const atual = campo.value.trim();
    const ehSugestao = !atual || atual === filledBase;

    if (forcar || ehSugestao) {
      campo.value = padrao;
      filledBase = padrao;
    }
  }

  function render() {
    const campoPacote = backdrop.querySelector("[data-cls-pacote]");
    const pacote = canonicalPackage(campoPacote.value);
    const nomeClasse = backdrop.querySelector("[data-cls-nome]").value.trim();
    const seletor = backdrop.querySelector("[data-cls-no]");

    const modelos = projectModels({ pacote, nomeClasse });

    if (!modelos.length) {
      codeBox.textContent = "";
      statusLabel.textContent = "Nenhum nó de global para documentar neste projeto.";
      return;
    }

    const escolhido = seletor.value;
    seletor.innerHTML = modelos
      .map((item) => `<option value="${u.escapeHtml(item.id)}">${u.escapeHtml(item.rotulo)}</option>`)
      .join("");
    seletor.value = modelos.some((item) => item.id === escolhido) ? escolhido : modelos[0].id;
    seletor.parentElement.style.display = modelos.length > 1 ? "" : "none";

    const atual = modelos.find((item) => item.id === seletor.value) || modelos[0];
    const modelo = atual.modelo;

    lastCls = gerarCls(modelo);
    lastPackage = modelo.pacote;
    lastClassName = modelo.nomeClasse;
    lastFileName = `${modelo.pacote}.${modelo.nomeClasse}.cls`;
    codeBox.textContent = lastCls;

    const pieces = modelo.propriedades.filter((p) => p.piece).length;
    const fixos = modelo.subscriptsFixos
      .map((f) => f.valor)
      .join(",");

    const referencia = `^${modelo.global}(${modelo.chaves
      .map((c) => `{${c}}`)
      .concat(fixos ? [fixos] : [])
      .join(",")})`;

    const avisos = [];

    const identidade = currentIdentity();

    if (!pacote) {
      const sugestoes = sortedPackages().slice(0, 6);

      if (sugestoes.length) {
        avisos.push(
          `Escolha o pacote${identidade ? ` — a conta <code>${u.escapeHtml(identidade.conta)}</code> usa` : ":"} ` +
            sugestoes.map((p) => `<code>${u.escapeHtml(p)}</code>`).join(", ") +
            (knownPackages.length > sugestoes.length
              ? ` e mais ${knownPackages.length - sugestoes.length}.`
              : ".")
        );
      } else if (identidade) {
        avisos.push(
          `Escolha o pacote. Pelo nome da rotina a conta é <code>${u.escapeHtml(identidade.conta)}</code>, ` +
            `então os pacotes começam com <code>${u.escapeHtml(identidade.pacoteBase)}</code> ` +
            `(a pasta <code>${u.escapeHtml(identidade.pacoteBase)}_Ped</code> é o pacote ` +
            `<code>${u.escapeHtml(identidade.pacoteBase)}.Ped</code>). Selecione a pasta acima para eu listar os que existem.`
        );
      } else {
        avisos.push(
          "Escolha o pacote. Ele vem das pastas sob <code>classescls</code> — a pasta <code>Wdom_Ped</code> é o pacote <code>Wdom.Ped</code>."
        );
      }
    } else if (knownPackages.length && !knownPackages.includes(pacote)) {
      avisos.push(`O pacote <code>${u.escapeHtml(pacote)}</code> não existe na pasta escolhida — será criado.`);
    }

    if (modelos.length > 1) {
      avisos.push(
        `Este projeto grava em ${modelos.length} nós da global — cada um vira uma classe. Troque no seletor acima para ver e salvar as outras.`
      );
    }

    const nota = avisos.length
      ? `<div class="gpj-cls-warn">${avisos.join("<br>")}</div>`
      : "";

    statusLabel.innerHTML =
      `<code>${u.escapeHtml(referencia)}</code> · ${modelo.propriedades.length} propriedade(s), ` +
      `${modelo.chaves.length} chave(s), ${pieces} piece(s)${nota}`;
  }

  function open() {
    injectStyle();

    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "gpj-cls-backdrop hidden";
      backdrop.innerHTML = `
        <div class="gpj-cls-card">
          <div class="gpj-cls-head">
            <div>
              <h2>Documentação de Global</h2>
              <p>Gera a classe COS (<code>%Persistent</code>) que documenta a global do projeto, no padrão da ferramenta <strong>Mapeamento de Global</strong> do Consistem Tools. As chaves viram subscripts e os campos viram pieces, com os mesmos números que a rotina grava.</p>
            </div>
            <button type="button" data-cls-close>Fechar</button>
          </div>

          <div class="gpj-cls-body">
            <div class="gpj-cls-toolbar">
              <label>Pacote <input type="text" data-cls-pacote list="gpjClsPacotes" placeholder="ex.: Fat"></label>
              <datalist id="gpjClsPacotes"></datalist>
              <label>Classe <input type="text" data-cls-nome placeholder="(nome da global)"></label>
              <label>Nó da global <select data-cls-no></select></label>
            </div>
            <div class="gpj-cls-toolbar">
              <button type="button" data-cls-pasta>Selecionar raiz do clone</button>
              <span class="gpj-cls-pasta"></span>
            </div>
            <pre class="gpj-cls-code"></pre>
          </div>

          <div class="gpj-cls-foot">
            <span class="gpj-cls-status"></span>
            <div class="right">
              <button type="button" data-cls-copy>Copiar .cls</button>
              <button type="button" data-cls-save-todas>Salvar todas</button>
              <button type="button" class="primary" data-cls-save>Salvar esta</button>
            </div>
          </div>
        </div>`;

      document.body.appendChild(backdrop);

      codeBox = backdrop.querySelector(".gpj-cls-code");
      statusLabel = backdrop.querySelector(".gpj-cls-status");

      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) close();
      });
      backdrop.querySelector("[data-cls-close]").addEventListener("click", close);

      ["[data-cls-pacote]", "[data-cls-nome]"].forEach((selector) =>
        backdrop.querySelector(selector).addEventListener("input", render)
      );
      backdrop.querySelector("[data-cls-no]").addEventListener("change", render);

      backdrop.querySelector("[data-cls-pasta]").addEventListener("click", async () => {
        if (pendingRoot && (await grantRememberedRoot())) {
          applyDefaultPackage();
          renderFolder();
          render();
          return;
        }

        const resultado = await selectClassesFolder();
        if (resultado.erro) {
          statusLabel.innerHTML = `<span style="color:#b91c1c">${u.escapeHtml(resultado.erro)}</span>`;
          return;
        }
        applyDefaultPackage();
        renderFolder();
        render();
      });

      backdrop.querySelector("[data-cls-copy]").addEventListener("click", () => {
        u.copyText(lastCls, "Classe copiada.");
      });

      backdrop.querySelector("[data-cls-save]").addEventListener("click", async () => {
        if (!classesFolder) {
          downloadText(lastFileName, lastCls);
          return;
        }

        const resultado = await writeToFolder(lastPackage, lastClassName, lastCls);
        if (resultado.erro) {
          statusLabel.innerHTML = `<span style="color:#b91c1c">${u.escapeHtml(resultado.erro)}</span>`;
          return;
        }

        u.showToast(`${resultado.caminho} salvo.`);
        await loadPackages();
        renderFolder();
      });

      backdrop.querySelector("[data-cls-save-todas]").addEventListener("click", async () => {
        if (!classesFolder) {
          statusLabel.innerHTML =
            `<span style="color:#b91c1c">Escolha a raiz do clone antes: sem pasta não dá para salvar várias.</span>`;
          return;
        }

        const pacote = canonicalPackage(backdrop.querySelector("[data-cls-pacote]").value);
        const nomeClasse = backdrop.querySelector("[data-cls-nome]").value.trim();
        const modelos = projectModels({ pacote, nomeClasse });

        const gravados = [];
        const falhas = [];

        for (const item of modelos) {
          const resultado = await writeToFolder(
            item.modelo.pacote,
            item.modelo.nomeClasse,
            gerarCls(item.modelo)
          );
          if (resultado.erro) falhas.push(`${item.modelo.nomeClasse}: ${resultado.erro}`);
          else gravados.push(resultado.caminho);
        }

        await loadPackages();
        renderFolder();

        statusLabel.innerHTML = falhas.length
          ? `<span style="color:#b91c1c">${u.escapeHtml(falhas.join(" · "))}</span>`
          : `${gravados.length} classe(s) salva(s): ${gravados
              .map((c) => `<code>${u.escapeHtml(c)}</code>`)
              .join(", ")}`;

        if (!falhas.length) u.showToast(`${gravados.length} classe(s) salva(s).`);
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && backdrop && !backdrop.classList.contains("hidden")) {
          close();
        }
      });
    }

    backdrop.classList.remove("hidden");

    applyDefaultPackage(true);
    renderFolder();
    render();

    const preparar = rootFolder
      ? applyRoot()
      : recallClassesFolder().then(() => applyRoot());

    preparar.then(() => {
      if (!backdrop || backdrop.classList.contains("hidden")) return;
      applyDefaultPackage();
      renderFolder();
      render();
    });
  }
  function currentIdentity() {
    const config = app.getConfig();
    const daGlobal = accountFromName(config.globalName);
    const daRotina = accountFromName(config.routineName);

    if (!availableAccounts.length) return daGlobal || daRotina;

    const existe = (item) => item && availableAccounts.includes(item.conta);
    if (existe(daGlobal)) return daGlobal;
    if (existe(daRotina)) return daRotina;

    return daGlobal || daRotina;
  }

  function canonicalPackage(texto) {
    const limpo = normalizePackage(texto);
    if (!limpo) return "";

    const conhecido = knownPackages.find(
      (p) => p.toLowerCase() === limpo.toLowerCase()
    );
    return conhecido || limpo;
  }
  function defaultPackage() {
    const identidade = currentIdentity();
    if (!identidade) return "";

    const base = identidade.pacoteBase;

    const exato = knownPackages.find(
      (p) => p.toLowerCase() === base.toLowerCase()
    );

    return exato || base;
  }

  function sortedPackages() {
    const identidade = currentIdentity();
    if (!identidade) return knownPackages;

    const base = identidade.pacoteBase.toLowerCase();
    const daConta = knownPackages.filter((p) => p.toLowerCase().startsWith(base));
    const resto = knownPackages.filter((p) => !p.toLowerCase().startsWith(base));

    return [...daConta, ...resto];
  }

  function renderFolder() {
    if (!backdrop) return;

    const rotulo = backdrop.querySelector(".gpj-cls-pasta");
    const lista = backdrop.querySelector("#gpjClsPacotes");
    const identidade = currentIdentity();

    if (classesFolder) {
      const daConta = identidade
        ? knownPackages.filter((p) =>
            p.toLowerCase().startsWith(identidade.pacoteBase.toLowerCase())
          ).length
        : 0;

      const presa =
        classesFolder === pinnedFolder
          ? ` — <strong>presa nesta pasta</strong>. Para acompanhar a conta, clique acima e suba até ` +
            `<code>projetos</code> (a pasta que tem <code>DESENV</code> dentro).`
          : "";

      rotulo.innerHTML =
        `<code>${u.escapeHtml(folderPath || classesFolder.name)}</code> — ` +
        `${knownPackages.length} pacote(s)` +
        (identidade && daConta
          ? `, ${daConta} de <code>${u.escapeHtml(identidade.pacoteBase)}</code>`
          : "") +
        presa;
    } else if (rootFolder && availableAccounts.length) {
      rotulo.innerHTML =
        `Não achei <code>custom/${u.escapeHtml(identidade ? identidade.conta : "?")}/classescls</code> em ` +
        `<code>${u.escapeHtml(rootFolder.name)}</code>. Contas disponíveis: ` +
        availableAccounts.map((c) => `<code>${u.escapeHtml(c)}</code>`).join(", ") + ".";
    } else if (rootFolder) {
      rotulo.innerHTML =
        `<code>${u.escapeHtml(rootFolder.name)}</code> não parece a raiz do clone — ` +
        `esperava encontrar <code>DESENV/custom</code> dentro dela.`;
    } else if (accountFolder && identidade && accountFolder.conta !== identidade.conta) {
      rotulo.innerHTML =
        `A pasta de "Salvar no projeto" é da conta <code>${u.escapeHtml(accountFolder.conta)}</code>, ` +
        `mas esta rotina é <code>${u.escapeHtml(identidade.conta)}</code>. Escolha acima ` +
        `<code>projetos</code>, <code>DESENV</code> ou <code>custom</code> — de qualquer uma ` +
        `delas eu acho as duas.`;
    } else if (pendingRoot) {
      rotulo.innerHTML =
        `Pasta lembrada (<code>${u.escapeHtml(pendingRoot.name)}</code>) — clique acima para ` +
        `autorizar. O navegador pede a permissão de novo a cada recarga da página.`;
    } else if (identidade) {
      rotulo.innerHTML =
        `Escolha <code>projetos</code>, <code>DESENV</code> ou <code>custom</code> — ` +
        `de qualquer uma delas eu desço até ` +
        `<code>custom/${u.escapeHtml(identidade.conta)}/classescls</code> sozinho.`;
    } else {
      rotulo.textContent = "Nenhuma pasta escolhida: o botão Salvar faz download.";
    }

    lista.innerHTML = sortedPackages()
      .map((pacote) => `<option value="${u.escapeHtml(pacote)}"></option>`)
      .join("");
  }

  function close() {
    backdrop?.classList.add("hidden");
  }

  function downloadText(nomeArquivo, conteudo) {
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      u.copyText(conteudo, "Sem download aqui: a classe foi copiada.");
      return;
    }

    const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    u.showToast(`${nomeArquivo} salvo.`);
  }

  function install() {
    const slot = document.getElementById("classDocButtonSlot");
    if (!slot || slot.dataset.gpjLigado === "1") return;

    slot.dataset.gpjLigado = "1";
    slot.addEventListener("click", () => open());
  }

  app.classDoc = {
    normalizarTipo, normalizarModelo, inferirTipo, paramsAplicaveis,
    nomeStorage, nomeSqlMap, streamLocationSugerido,
    montarProperty, montarData, montarSubscripts, montarMetodo, gerarCls,
    projectModels, open, close, install
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})(window.GeradorRotinasJsonPadrao);
