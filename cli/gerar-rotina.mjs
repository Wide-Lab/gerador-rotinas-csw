#!/usr/bin/env node

import { JSDOM, VirtualConsole } from "jsdom";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = path.join(RAIZ, "gerador-json-ui-ajustada.html");

const AJUDA = `gerar-rotina — gera rotinas .mac com o gerador de rotinas JSON/Caché

Entrada (uma delas):
  --projeto <arq.json>     JSON exportado pela tela ou JSON simples ("formato para IA")
  --spec <arq.txt>         especificação em texto (Rotina:, Título:, Global:, campos, # abas, # Grid:)
  --desenhador <arq.json>  JSON do desenhador (builder); --tela <n> escolhe a tela (padrão 0)
  --builder <id|url>       busca o projeto na API do builder; --api <url> --token <t> opcionais
  --padrao                 o exemplo que abre com a tela (WDCCMOT010)
  -                        lê a entrada (JSON ou spec) do stdin

Saída:
  --saida <pasta>          grava os .mac (sem isso é só simulação)
  --sobrescrever           substitui .mac que já existem com conteúdo diferente
  --eol crlf|lf            fim de linha dos arquivos gravados (padrão crlf, como as rotinas do repositório)
  --so-interface | --so-rg grava só um dos lados
  --mostrar [rotina]       imprime o código gerado (todas ou só a rotina pedida)
  --exportar-projeto <arq> salva o projeto normalizado para reabrir na tela (Importar JSON)
  --json                   resultado em JSON (para ferramentas/Claude)
  --estrito                código de saída 1 também com avisos, não só com erros
  --forcar                 grava mesmo com erro no validador (padrão: não grava)

Outros:
  --modelo spec|json       imprime um modelo de entrada para começar
  --ajuda
`;

function lerArgumentos(argv) {
  const opcoes = { tela: 0, eol: "crlf" };
  const comValor = new Set([
    "projeto", "spec", "desenhador", "builder", "api", "token", "tela",
    "saida", "eol", "exportar-projeto", "modelo"
  ]);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-") { opcoes.stdin = true; continue; }
    if (!arg.startsWith("--")) throw new Error(`Argumento inesperado: ${arg}`);
    const nome = arg.slice(2);

    if (comValor.has(nome)) {
      const valor = argv[i + 1];
      if (valor === undefined) throw new Error(`--${nome} precisa de um valor.`);
      opcoes[nome] = valor;
      i += 1;
    } else if (nome === "mostrar") {
      const proximo = argv[i + 1];
      opcoes.mostrar = proximo && !proximo.startsWith("--") ? (i += 1, proximo) : true;
    } else {
      opcoes[nome] = true;
    }
  }
  return opcoes;
}

async function lerStdin() {
  const partes = [];
  for await (const parte of process.stdin) partes.push(parte);
  return Buffer.concat(partes).toString("utf8");
}

async function existe(arquivo) {
  try { await access(arquivo); return true; } catch { return false; }
}

async function abrirGerador() {
  const erros = [];
  const consoleVirtual = new VirtualConsole();
  consoleVirtual.on("jsdomError", (erro) => erros.push(erro.message));
  consoleVirtual.on("error", (...args) => erros.push(args.join(" ")));

  const html = await readFile(HTML, "utf8");
  const dom = new JSDOM(html, {
    url: pathToFileURL(HTML).href,
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: consoleVirtual,
    beforeParse(window) {
      window.fetch = (...args) => fetch(...args);
      window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      window.HTMLElement.prototype.scrollIntoView ??= () => {};
      window.navigator.clipboard ??= { writeText: async () => {} };
    }
  });

  await new Promise((resolve) => {
    if (dom.window.document.readyState === "complete") resolve();
    else dom.window.addEventListener("load", resolve, { once: true });
  });

  const app = dom.window.GeradorRotinasJsonPadrao;
  if (!app || !app.mac || !app.projectIO) {
    throw new Error(`Os módulos do gerador não carregaram.\n${erros.join("\n")}`);
  }

  dom.window.document.getElementById("clearProjectButton")?.click();

  return { dom, app, erros };
}

function pareceJson(texto) {
  return /^\s*[[{]/.test(texto);
}

async function carregarEntrada(app, opcoes) {
  if (opcoes.padrao) {
    app.el.loadExampleButton.click();
    return { origem: "padrao", avisos: [] };
  }

  let texto;
  let tipo;
  if (opcoes.stdin) {
    texto = await lerStdin();
    tipo = pareceJson(texto) ? "projeto" : "spec";
  } else if (opcoes.projeto) {
    texto = await readFile(opcoes.projeto, "utf8"); tipo = "projeto";
  } else if (opcoes.spec) {
    texto = await readFile(opcoes.spec, "utf8"); tipo = "spec";
  } else if (opcoes.desenhador) {
    texto = await readFile(opcoes.desenhador, "utf8"); tipo = "desenhador";
  } else if (opcoes.builder) {
    tipo = "builder";
  } else {
    throw new Error("Informe a entrada: --projeto, --spec, --desenhador, --builder, --padrao ou -.\nUse --ajuda.");
  }

  texto = texto?.replace(/^﻿/, "");

  if (tipo === "projeto") {
    const json = JSON.parse(texto);
    const ehDesenhador = Array.isArray(json) || (Array.isArray(json.routines) && !json.fields);
    if (!ehDesenhador) {
      app.projectIO.loadDocument(json);
      return { origem: "projeto", avisos: [] };
    }
    tipo = "desenhador";
  }

  if (tipo === "spec") {
    const resultado = app.specImport.parse(texto);
    if (!resultado.fields.length && !resultado.grids.length) {
      throw new Error(`Nenhum campo reconhecido na especificação.\n${(resultado.warnings || []).join("\n")}`);
    }
    app.projectIO.loadDocument(resultado);
    return { origem: "spec", avisos: resultado.warnings || [] };
  }

  let desenho;
  if (tipo === "builder") {
    desenho = await app.designerImport.buscarProjeto(opcoes.api, opcoes.builder, opcoes.token);
  } else {
    desenho = app.designerImport.parseDesignerJson(texto);
  }
  const resultado = app.designerImport.convert(desenho, { screen: Number(opcoes.tela) || 0 });
  if (!resultado.fields.length && !resultado.grids.length) {
    throw new Error(`O desenhador não trouxe campos.\n${(resultado.warnings || []).join("\n")}`);
  }
  app.projectIO.loadDocument(resultado);
  const telas = (resultado.screens || []).map((tela, i) => `${i}: ${tela.name || tela.id || tela}`);
  return { origem: tipo, avisos: resultado.warnings || [], telas };
}

async function gravar(arquivos, opcoes) {
  const pasta = path.resolve(opcoes.saida);
  await mkdir(pasta, { recursive: true });
  const relatorio = [];

  for (const arquivo of arquivos) {
    const destino = path.join(pasta, arquivo.filename);
    const conteudo = opcoes.eol === "lf" ? arquivo.code : arquivo.code.replace(/\n/g, "\r\n");

    if (await existe(destino)) {
      const atual = await readFile(destino, "utf8");
      if (atual.replace(/\r\n/g, "\n") === arquivo.code) {
        relatorio.push({ arquivo: destino, acao: "igual" });
        continue;
      }
      if (!opcoes.sobrescrever) {
        relatorio.push({ arquivo: destino, acao: "mantido (já existe; use --sobrescrever)" });
        continue;
      }
    }
    await writeFile(destino, conteudo, "utf8");
    relatorio.push({ arquivo: destino, acao: "gravado" });
  }
  return relatorio;
}

async function main() {
  const opcoes = lerArgumentos(process.argv.slice(2));

  if (opcoes.ajuda || process.argv.length <= 2) {
    process.stdout.write(AJUDA);
    return 0;
  }

  const { dom, app } = await abrirGerador();

  try {
    if (opcoes.modelo) {
      if (opcoes.modelo === "spec") process.stdout.write(`${app.specImport.EXAMPLE}`);
      else process.stdout.write(`${await readFile(path.join(RAIZ, "cli", "modelo-projeto.json"), "utf8")}`);
      return 0;
    }

    const entrada = await carregarEntrada(app, opcoes);
    app.refresh();

    const config = app.getConfig();
    const { files, conflicts } = app.files.collectGeneratedFiles();
    const arquivos = files.filter((arquivo) =>
      opcoes["so-interface"] ? arquivo.type === "interface" : opcoes["so-rg"] ? arquivo.type === "rg" : true
    );
    const problemas = app.validator.run();
    const erros = problemas.filter((p) => p.level === "error");
    const avisos = problemas.filter((p) => p.level === "warn");

    if (opcoes["exportar-projeto"]) {
      const documento = app.projectIO.createDocument();
      await mkdir(path.dirname(path.resolve(opcoes["exportar-projeto"])), { recursive: true });
      await writeFile(opcoes["exportar-projeto"], `${JSON.stringify(documento, null, 2)}\n`, "utf8");
    }

    const bloqueado = opcoes.saida && (erros.length || conflicts.length) && !opcoes.forcar;
    const gravados = opcoes.saida && !bloqueado ? await gravar(arquivos, opcoes) : [];
    if (bloqueado) {
      process.stderr.write("Nada gravado: o validador apontou erro. Corrija a entrada ou use --forcar.\n");
    }

    const resultado = {
      rotina: config.routineName,
      titulo: config.title,
      modo: config.routineMode,
      rg: config.useRules ? config.rgRoutineName : null,
      global: config.globalName,
      origem: entrada.origem,
      telasDisponiveis: entrada.telas,
      avisosDaEntrada: entrada.avisos,
      arquivos: arquivos.map((a) => ({ arquivo: a.filename, tipo: a.type, descricao: a.label, linhas: a.code.split("\n").length - 1 })),
      conflitos: conflicts,
      validador: problemas.map(({ level, code, message, hint, where }) => ({ nivel: level, codigo: code, mensagem: message, dica: hint, onde: where })),
      gravados
    };

    if (opcoes.json) {
      if (opcoes.mostrar) resultado.codigo = Object.fromEntries(arquivos.map((a) => [a.filename, a.code]));
      process.stdout.write(`${JSON.stringify(resultado, null, 2)}\n`);
    } else {
      imprimirResumo(resultado, arquivos, opcoes);
    }

    if (erros.length || conflicts.length) return 1;
    if (opcoes.estrito && avisos.length) return 1;
    return 0;
  } finally {
    dom.window.close();
  }
}

function imprimirResumo(r, arquivos, opcoes) {
  const linhas = [];
  linhas.push(`${r.rotina} — ${r.titulo}  (modo ${r.modo}, origem ${r.origem})`);
  if (r.rg) linhas.push(`RG: ${r.rg}   global: ^${r.global}`);
  if (r.telasDisponiveis?.length > 1) linhas.push(`Telas do desenhador (use --tela):\n  ${r.telasDisponiveis.join("\n  ")}`);
  r.avisosDaEntrada.forEach((a) => linhas.push(`entrada: ${a}`));
  linhas.push("");
  linhas.push("Arquivos:");
  r.arquivos.forEach((a) => linhas.push(`  ${a.arquivo.padEnd(34)} ${a.tipo.padEnd(9)} ${String(a.linhas).padStart(5)} linhas  ${a.descricao}`));
  r.conflitos.forEach((c) => linhas.push(`  CONFLITO: ${c} gerado com dois conteúdos diferentes`));

  linhas.push("");
  if (!r.validador.length) linhas.push("Validador: nada a apontar.");
  else {
    linhas.push("Validador:");
    r.validador.forEach((p) => {
      linhas.push(`  [${p.nivel}] ${p.codigo}: ${p.mensagem}${p.onde ? ` (${p.onde})` : ""}`);
      if (p.dica) linhas.push(`      → ${p.dica}`);
    });
  }

  if (r.gravados.length) {
    linhas.push("");
    r.gravados.forEach((g) => linhas.push(`${g.acao.padEnd(10)} ${g.arquivo}`));
  } else if (!opcoes.saida) {
    linhas.push("");
    linhas.push("Simulação: nada gravado. Use --saida <pasta> para gravar.");
  }
  process.stdout.write(`${linhas.join("\n")}\n`);

  if (opcoes.mostrar) {
    arquivos
      .filter((a) => opcoes.mostrar === true || a.routineName.toUpperCase() === String(opcoes.mostrar).toUpperCase().replace(/\.MAC$/, ""))
      .forEach((a) => process.stdout.write(`\n;;;;; ${a.filename} ;;;;;\n${a.code}`));
  }
}

main().then(
  (codigo) => process.exit(codigo),
  (erro) => {
    process.stderr.write(`erro: ${erro.message}\n`);
    process.exit(2);
  }
);
