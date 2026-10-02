import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(aqui, "gerar-rotina.mjs");
const rodar = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" });

const pasta = mkdtempSync(path.join(tmpdir(), "gerador-cli-"));
const spec = path.join(pasta, "spec.txt");
writeFileSync(spec, rodar("--modelo", "spec"));

let falhas = 0;
function gerar(nome, ...args) {
  try {
    const r = JSON.parse(rodar(...args, "--json", "--mostrar"));
    const erros = r.validador.filter((p) => p.nivel === "error");
    console.log(`${erros.length ? "FALHOU" : "ok    "} ${nome}: ${r.arquivos.length} arquivo(s)`);
    if (erros.length) falhas += 1;
    return r;
  } catch (erro) {
    console.log(`FALHOU ${nome}: ${erro.stdout || erro.message}`);
    falhas += 1;
    return null;
  }
}

gerar("exemplo padrão", "--padrao");
const deSpec = gerar("modelo de especificação", "--spec", spec);
const deJson = gerar("modelo JSON", "--projeto", path.join(aqui, "modelo-projeto.json"));
gerar("exemplo do desenhador", "--desenhador", path.join(aqui, "exemplo-desenhador.json"));

const aba = gerar("configuração com chave na aba", "--projeto", path.join(aqui, "exemplo-configuracao-aba.json"));
if (aba) {
  const rg = aba.codigo["WDOMTESTEAARG.mac"] || "";
  const tela = aba.codigo["WDOMTESTEAATAB1.mac"] || "";
  const confere = [
    ["Excluir só abaixo da natureza", rg.includes("do $$$KillG(^WDOMPVCFG(2,codEmpresa,1,natureza))") && !rg.includes("do $$$KillG(^WDOMPVCFG(2,codEmpresa))")],
    ["Obter da seleção recebe a natureza", /ObterCfgProntaEntregaTabsitsel\(codEmpresa,natureza,tabsitsel\)/.test(rg)],
    ["itens gravam data/operador", rg.includes("tabGravar(codSelecionado)=dataHora_Z_codOperador")],
    ["aba usa a lista ^%CSUTIMM", tela.includes('do ^%CSUTIMM("TABSIT"')],
    ["aba carrega a seleção depois da natureza", tela.includes("$$ObterCfgProntaEntregaTabsitsel^WDOMTESTEAARG(CODEMP,CODNAT,.TABSITSEL)")]
  ];
  confere.forEach(([nome, ok]) => {
    console.log(`${ok ? "ok    " : "FALHOU"}   ${nome}`);
    if (!ok) falhas += 1;
  });
}

const receita = gerar("abas de grid com campos, F8 e Duplicar", "--projeto", path.join(aqui, "exemplo-receita-grids.json"));
if (receita) {
  const c = receita.codigo;
  const confere = [
    ["F8 na coluna Obs", (c["WDOMTESTETITAB1.mac"] || "").includes('"^CCTTG095,TTGTAB14^CCTTG299,,cp')],
    ["Processo Industrial gravado no nó da aba", (c["WDOMTESTETITAB1RG.mac"] || "").includes("do $$$SetG(^WDOMTESTETI(codEmpresa,codPrograma,1),dadosAba)")],
    ["sequência automática no Tempo", (c["WDOMTESTETITAB1.mac"] || "").includes("$$ProximaSequencia^WDOMTESTETITAB1RG(CT)")],
    ["reordenação nos Componentes", (c["WDOMTESTETITAB2.mac"] || "").includes("$$ReordenarGlobalTrabalho^WDOMTESTETITAB2RG(CT,CHVANT,")],
    ["tela de duplicação", (c["WDOMTESTETIDUP.mac"] || "").includes("$$DuplicarCfgReceita^WDOMTESTETIRG(CE,CODPRG,CODPRGDES)")],
    ["Excluir confere vínculo com receita", (c["WDOMTESTETIRG.mac"] || "").includes("set sc=$$ValidarVinculoReceita(codEmpresa,codPrograma)")],
    ["componente aparece na célula e com descrição", (c["WDOMTESTETITAB2.mac"] || "").includes("do TbSet^%CSW1UTI(CODLIN,3,$$ObterDescricaoItem^WDOMTESTETIRG($piece(VARDET,Z,2)),,,,,42)")],
    ["seta para cima após sequência automática sai do grid", (c["WDOMTESTETITAB1.mac"] || "").includes("4200EX\tgoto 4999:%=27,4999:(%=140)")],
    ["combo com código vazio não estoura", /\$select\(\$piece\(VARDET,Z,\d+\)="":"",1:\$get\(TABPOS\(/.test(c["WDOMTESTETITAB3.mac"] || "") && !/CODLIN,\d+,\$get\(TABPOS\(/.test(c["WDOMTESTETITAB3.mac"] || "")],
    ["EP e FC são chave das exceções", (c["WDOMTESTETITAB3RG.mac"] || "").includes("do $$$KillMergeG(^WDOMTESTETI(codEmpresa,codPrograma,3,ep,fc),")],
    ["inclusão religa a manutenção depois de remontar", /IncluirLinha\^%CSW1GRID2\(CT,%PRG,42\)\n\tif \$\$\$ISERR\(sc\) goto 4999\n\tset sc=\$\$ModoManutencao/.test(c["WDOMTESTETITAB2.mac"] || "")]
  ];
  confere.forEach(([nome, ok]) => {
    console.log(`${ok ? "ok    " : "FALHOU"}   ${nome}`);
    if (!ok) falhas += 1;
  });
}

const monitor = gerar("consulta com grid, filtros em lista e botões", "--projeto", path.join(aqui, "exemplo-monitor-grid.json"));
if (monitor) {
  const tela = monitor.codigo["WDOMREQ100.mac"] || "";
  const ids = [...tela.matchAll(/csw:botao:[^,]*,[^,]*,([^,]+),/g)].map((m) => m[1]);
  const confere = [
    ["filtro em lista no modo grid", tela.includes('do ^%CSUTIMM("TABTIPREQ",1,,,,"SELTIPREQ"')],
    ["opções carregadas na abertura", tela.includes("set sc=$$ObterTabTipoRequisicao^WDOMREQ100RG(.TABTIPREQ)")],
    ["métodos próprios na RG de grid", (monitor.codigo["WDOMREQ100RG.mac"] || "").includes("ObterTabTipoRequisicao(tabOpcoes)")],
    ["botões com ids diferentes", ids.length === 12 && new Set(ids).size === 12],
    ["filtro vazio mostra Todos", tela.includes('$select($data(SELTIPREQ):"Selecionados",1:"Todos")')],
    ["nenhum botão atrás do grid", !monitor.validador.some((p) => p.codigo === "botao-sobre-grid")],
    ["consulta sem dados avisa", (monitor.codigo["WDOMREQ100RG.mac"] || "").includes('quit $$$ERROR(10000,"Não há dados para consulta!")')],
    ["botões só liberados se a consulta trouxe dados", tela.includes('\tif $$$ISOK(sc) do HabBotGeral^%CSW1("btPersonalizado1",1)') && !/2000AGEX[^\n]*\n\tdo FJAG\^%CSW1UTI\n\t;\n\tdo HabBotGeral/.test(tela)],
    ["cada consulta desabilita os botões antes", /Limpar\^%CSW1GRID\(CT,%PRG,41\)\n\t;\n\tdo HabBotGeral\^%CSW1\("btPersonalizado1",0\)/.test(tela)]
  ];
  confere.forEach(([nome, ok]) => {
    console.log(`${ok ? "ok    " : "FALHOU"}   ${nome}`);
    if (!ok) falhas += 1;
  });
}

const checklist = gerar("abas liberadas no salvar, F7 por lista, justificativa", "--projeto", path.join(aqui, "exemplo-checklist-abas.json"));
const parametros = gerar("tela de grid com parâmetros de entrada", "--projeto", path.join(aqui, "exemplo-tela-parametros.json"));
if (checklist && parametros) {
  const c = checklist.codigo;
  const confere = [
    ["abas desabilitadas em registro novo", (c["WDOMTESTEROM100A.mac"] || "").includes('if $get(FLGNOVO) do desabilitarTab^%CSW1A("sheet1",2)')],
    ["piece fixo do campo", (c["WDOMTESTEROM100ATAB1.mac"] || "").includes("$piece(WDOMTESTEROMCDG,Z,5)")],
    ["F7 por lista na própria rotina", (c["WDOMTESTEROM100A.mac"] || "").includes('"TABF7CODCHK(","%codret"')],
    ["aba de captura entra pelo grid", /0500\t;[\s\S]*?goto 2000/.test(c["WDOMTESTEROM100ATAB2.mac"] || "")],
    ["Salvar na aba libera as abas pela principal", (c["WDOMTESTEROM100A.mac"] || "").includes('do execLabelTabPanel^%CSW1A("sheet1","2990^WDOMTESTEROM100A")') && (c["WDOMTESTEROM100A.mac"] || "").includes('. do execLabelTabPanel^%CSW1A("sheet1","0500^WDOMTESTEROM100A")')],
    ["Salvar não valida aba de captura", !(c["WDOMTESTEROM100A.mac"] || "").includes('validateTab^%CSW1A("sheet1",2)') && /0500\t[^\n]*\n\tset \([^)]*CODPED[^)]*\)=""/.test(c["WDOMTESTEROM100A.mac"] || "")],
    ["sem TbRowEnter sem coluna editável", !(c["WDOMTESTEROM100ATAB2.mac"] || "").includes("TbRowEnter")],
    ["tela de justificativa chama a regra", (c["WDOMTESTEROM100AJUS.mac"] || "").includes("$$RemoverItemChecklist^WDOMTESTEROM100ARG(CODEMP,CODCHK,SEQSEL,JUSTIF)")],
    ["parâmetros de entrada na assinatura", (parametros.codigo["WDOMTESTEROM100ATAB2A.mac"] || "").includes("WDOMTESTEROM100ATAB2A(CODEMP,CODCHK,CODENG)")],
    ["carga própria do grid", (parametros.codigo["WDOMTESTEROM100ATAB2ARG.mac"] || "").includes("GerarExplosaoEstruturadaEng^CCPMERG007")],
    ["aberta por chave (Editar/Visualizar)", (c["WDOMTESTEROM100A.mac"] || "").includes("WDOMTESTEROM100A(CODEMP,CODCHK,FLGFUN,TABALT,DISABLE)") && (c["WDOMTESTEROM100A.mac"] || "").includes("\tif FLGFUN!DISABLE,CODCHK'=\"\" goto 0600") && (c["WDOMTESTEROM100A.mac"] || "").includes("\tset TABALT(CODCHK)=\"\"") && !/\n\tnew [^\n]*\bCODCHK\b/.test(c["WDOMTESTEROM100A.mac"] || "")],
    ["abas travadas no visualizar", (c["WDOMTESTEROM100ATAB3.mac"] || "").includes('if $get(DISABLE) do HabBotGeral^%CSW1("btEncerrar",0)') && (c["WDOMTESTEROM100ATAB2.mac"] || "").includes("if $get(DISABLE) do Disable^%CSW1UTI()")]
  ];
  confere.forEach(([nome, ok]) => {
    console.log(`${ok ? "ok    " : "FALHOU"}   ${nome}`);
    if (!ok) falhas += 1;
  });
}

const acoes = gerar("colunas clicáveis e menu de ações", "--projeto", path.join(aqui, "exemplo-consulta-acoes.json"));
if (acoes) {
  const m = acoes.codigo["WDOMTESTEROM110.mac"] || "";
  const confere = [
    ["clique na coluna vai para o label", m.includes("\tif CODCOL=1 goto 3500") && m.includes("\tif CODCOL=2 goto 3600")],
    ["coluna clicável no formato de link", m.includes("Csw=8^Editar^^^^1^^1;")],
    ["menu de ações pelo CCUTIRG011", m.includes('3600\tdo ^%CSW1MENUCLICK(OPCOES2,"OPCLICK","3600EX^WDOMTESTEROM110")') && m.includes("goto @LABROT") && m.includes("set sc=$$ObterMenuOpcoes2^WDOMTESTEROM110RG(.OPCOES2,.TABOPC2)") && (acoes.codigo["WDOMTESTEROM110RG.mac"] || "").includes('AdicionarOpcaoAcoes^CCUTIRG011("Excluir","3630-WDOMTESTEROM110",,.strOpcoes,.tabOpcoes)')],
    ["coluna de detalhe no DADDET", (acoes.codigo["WDOMTESTEROM110RG.mac"] || "").includes("set $piece(detalha,Z,5)=")],
    ["quit sozinho não vira label", !/\nquit\r?\n/.test(m)],
    ["botão abaixo dos filtros empurra o grid", m.includes("LinPos=3;")]
  ];
  confere.forEach(([nome, ok]) => {
    console.log(`${ok ? "ok    " : "FALHOU"}   ${nome}`);
    if (!ok) falhas += 1;
  });
}

const romaneio = gerar("abas com hooks, dois grids e tela de entrada", "--projeto", path.join(aqui, "exemplo-romaneio-abas.json"));
const embalagem = gerar("cadastro simples com decimais", "--projeto", path.join(aqui, "exemplo-cadastro-simples.json"));
if (romaneio && embalagem) {
  const c = romaneio.codigo;
  const t2 = c["WDOMTESTEROM110ATAB2.mac"] || "";
  const confere = [
    ["hooks da aba: labels, montagem e clique", t2.includes("\n5200\tset sc=$$Limpar^%CSW1GRID(CT,%PRG,22)") && t2.includes("set sc=$$Inicializar^%CSW1GRID(CT,%PRG,22,.TABGRID)") && t2.includes("\tif CODGRID=22 goto 5400")],
    ["métodos da aba na RG do grid", (c["WDOMTESTEROM110ATAB2RG.mac"] || "").includes("GerarGridVolume(codEmpresa,codRomaneio,codVolume,term,rotina)")],
    ["carga própria da aba de grid", (c["WDOMTESTEROM110ATAB2RG.mac"] || "").includes("quit:$$VolumeDoItem^WDOMTESTEROM110ARG(codEmpresa,codRomaneio,codSequencia)'=\"\"")],
    ["grid ao lado dos campos (ColPos/TamTab)", t2.includes("LinPos=1; Altura=7; LinIni=2; LinFim=7; ColPos=50; TamTab=56;")],
    ["F7 por lista em campo de aba de grid", t2.includes(",F7CODVOL^WDOMTESTEROM110ATAB2,,cp1000") && t2.includes("\nF7CODVOL\tkill TABF7CODVOL")],
    ["aba de grid vazia não avisa como consulta", !(c["WDOMTESTEROM110ATAB3RG.mac"] || "").includes("Não há dados para consulta!")],
    ["menu de ações em aba de grid", (c["WDOMTESTEROM110ATAB3.mac"] || "").includes("0500\t;\n\tset sc=$$ObterMenuOpcoes2^WDOMTESTEROM110ATAB3RG(.OPCOES2,.TABOPC2)")],
    ["tela de entrada com campos próprios", (c["WDOMTESTEROM110AITE.mac"] || "").includes("set sc=$$IncluirNovoItemRomaneio^WDOMTESTEROM110ARG(CODEMP,CODROM,CODPRO,QTDPRO)") && (c["WDOMTESTEROM110AITE.mac"] || "").includes('"CODPRO",CODPRO,"@\'?.N",1,,",CGIGEN^CCPV299,,cp1000")')],
    ["campo só de tela não vai para a global e desabilitado não é lido", !(c["WDOMTESTEROM110ARG.mac"] || "").includes("ENDCLI") && (c["WDOMTESTEROM110ATAB1.mac"] || "").includes('\tset sc=$$Valcp1300()\n\tgoto 1400\n1300ON\t;\n\tdo ^%CSLE(4,10,80,"ENDCLI",ENDCLI,')],
    ["aba com Confirmar próprio fora do Salvar", !(c["WDOMTESTEROM110A.mac"] || "").includes('validateTab^%CSW1A("sheet1",4)')],
    ["labels próprios na principal do cadastro", (c["WDOMTESTEROM110A.mac"] || "").includes('\n5900\tdo selecionarTab^%CSW1A("sheet1",2)')],
    ["decimais em v3", (embalagem.codigo["WDOMTESTEROM005.mac"] || "").includes(`do Set^%CSW1UTI(%PRG,"cp1200",$piece(WDOMTESTEROMTAB,Z,4),"v3")`)],
    ["empresa da sessão no meio da global", (embalagem.codigo["WDOMTESTEROM005RG.mac"] || "").includes("^WDOMTESTEROMTAB(1,codEmpresa,1,codEmbalagem)") && !(embalagem.codigo["WDOMTESTEROM005.mac"] || "").includes("CODEMP")],
    ["sem componentes descontinuados (AG/FJAG, List=/Csv=)", [romaneio, embalagem].every((g) => Object.values(g.codigo).every((code) => !/AG^%CSUTIUD|FJAG^%CSW1UTI|csw:gridCols:[^"]*(List|Csv)=/.test(code)))],
    ["botões na coluna dos campos", (embalagem.codigo["WDOMTESTEROM005.mac"] || "").includes("; csw:btnManter:14,8,")]
  ];
  confere.forEach(([nome, ok]) => {
    console.log(`${ok ? "ok    " : "FALHOU"}   ${nome}`);
    if (!ok) falhas += 1;
  });
}

const monitorPed = gerar("monitor com cor na coluna", "--projeto", path.join(aqui, "exemplo-monitor-pedidos.json"));
const cadastroPed = gerar("cadastro com aba no nó da capa", "--projeto", path.join(aqui, "exemplo-cadastro-pedido.json"));
if (monitorPed && cadastroPed) {
  const rg = monitorPed.codigo["WDOMTESTEPV100RG.mac"] || "";
  const cad = cadastroPed.codigo["WDOMTESTEPV100A.mac"] || "";
  const cadRg = cadastroPed.codigo["WDOMTESTEPV100ARG.mac"] || "";
  const confere = [
    ["cor de fundo por coluna no GravarLinhas", rg.includes('set $piece(corFundo,Z,7)=$select(sitped="I":"#FF0000",1:"")') && rg.includes(",$get(codRegistro),corFundo,corFonte,,,,1)")],
    ["aba com a variável da capa grava na capa", cadRg.includes("do $$$SetG(^WDOMTESTEPVPD(1,codEmpresa,1,codPedido),wdomtestepvpd)")],
    ["código depois do Salvar", /set sc=\$\$FinalizarGravacaoPedido\^WDOMTESTEPV100ARG[^\n]*\n[\s\S]*?Registro salvo com sucesso/.test(cad)]
  ];
  confere.forEach(([nome, ok]) => {
    console.log(`${ok ? "ok    " : "FALHOU"}   ${nome}`);
    if (!ok) falhas += 1;
  });
}

const etiquetas = gerar("grid de trabalho com campo condicional e edição", "--projeto", path.join(aqui, "exemplo-impressao-etiquetas.json"));
if (etiquetas) {
  const t = etiquetas.codigo["WDOMTESTEPMP110.mac"] || "";
  const rg = etiquetas.codigo["WDOMTESTEPMP110RG.mac"] || "";
  const projeto = JSON.parse(readFileSync(path.join(aqui, "exemplo-impressao-etiquetas.json"), "utf8"));
  projeto.grid.maintenanceButtonColumn = 5;
  const sobreposto = path.join(pasta, "sobreposto.json");
  writeFileSync(sobreposto, JSON.stringify(projeto));
  let validador = [];
  try { validador = JSON.parse(rodar("--projeto", sobreposto, "--json")).validador; } catch (erro) { validador = JSON.parse(erro.stdout || "{}").validador || []; }
  const confere = [
    ["campo habilitado por condição (pula na direção da seta)", t.includes('\tif \'(("^OF^OR^"[("^"_TIPDOC_"^"))&(DOCUME="")) set CONTRO="" do DisableCp^%CSW1UTI("cp1400"),Set^%CSW1UTI(%PRG,"cp1400","") goto 1300:%=140,2000\n\tdo EnableCp^%CSW1UTI("cp1400")') && t.includes("\tif '(TIPDOC'=\"\") do DisableCp^%CSW1UTI(\"cp1300\")")],
    ["generateSave false: sem Gravar na RG", !/^Gravar(?!GlobalTrabalho|Grid)/m.test(rg) && !rg.includes("KillMergeG")],
    ["coluna calculada atualizada ao editar", t.includes("do TbSet^%CSW1UTI(CODLIN,8,$$QtdePorEtiqueta^WDOMTESTEPMP110RG($piece(VARDET,Z,6),$piece(VARDET,Z,7)),,,,,41)")],
    ["chave não editável fica fora do fluxo", !t.includes("\n4200\t")],
    ["botão Manutenção na posição informada", t.includes("; csw:btnManut:12,24,")],
    ["validador acusa botões sobrepostos", validador.some((p) => p.codigo === "botao-sobreposto")]
  ];
  confere.forEach(([nome, ok]) => {
    console.log(`${ok ? "ok    " : "FALHOU"}   ${nome}`);
    if (!ok) falhas += 1;
  });
}

const gerenciador = gerar("consulta com colunas dinâmicas por mês", "--projeto", path.join(aqui, "exemplo-consulta-colunas-mes.json"));
const detalheFat = gerar("detalhe aberto com parâmetros na carga", "--projeto", path.join(aqui, "exemplo-detalhe-parametros.json"));
const configSeg = gerar("configuração com multi-seleção alfanumérica", "--projeto", path.join(aqui, "exemplo-config-segmento.json"));
if (gerenciador && detalheFat && configSeg) {
  const t = gerenciador.codigo["WDOMTESTECOM110.mac"] || "";
  const rg = gerenciador.codigo["WDOMTESTECOM110RG.mac"] || "";
  const det = detalheFat.codigo["WDOMTESTECOM120.mac"] || "";
  const detRg = detalheFat.codigo["WDOMTESTECOM120RG.mac"] || "";
  const tab1 = configSeg.codigo["WDOMTESTECOM100TAB1.mac"] || "";
  const confere = [
    ["colunas dinâmicas montadas no Consultar (9050)", t.includes("\tset sc=$$ObterColunasMes^WDOMTESTECOM110RG(DATINI,DATFIN,.TABCOLDIN)\n\tif $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 2000EX\n\tdo 9050") && t.includes("set sc=$$AtuConfGrid^%CSW1GRID2(CT,%PRG,41,.TABGRID)")],
    ["valores das colunas dinâmicas no GravarLinhas", rg.includes("set $piece(dados,Z,9,8+$length(mtempWDOMTESTECOM110,Z)-7)=$piece(mtempWDOMTESTECOM110,Z,8,$length(mtempWDOMTESTECOM110,Z))")],
    ["coluna v2 mantém o tipo", t.includes("Tipo=v2; Csw=11^Valor do CCI;")],
    ["parâmetro de entrada vai para a carga", det.includes("GerarGlobalTrabalho^WDOMTESTECOM120RG(CE,CT,%PRG,MESANO,CODSEG,CODCLI)") && detRg.includes("GerarGlobalTrabalho(codEmpresa,term,rotina,mesAno,codSegmento,codCliente)") && det.includes("WDOMTESTECOM120(CODSEG,CODCLI,MESANO)")],
    ["multi-seleção alfanumérica sem máscara numérica", tab1.includes('do ^%CSLE(2,19,12,"MASENV",,,,,",,,cp1100")')]
  ];
  confere.forEach(([nome, ok]) => {
    console.log(`${ok ? "ok    " : "FALHOU"}   ${nome}`);
    if (!ok) falhas += 1;
  });
}

if (deSpec && deJson && JSON.stringify(deSpec.codigo) !== JSON.stringify(deJson.codigo)) {
  console.log("FALHOU especificação e JSON equivalente geraram código diferente");
  falhas += 1;
}

process.exit(falhas ? 1 : 0);
