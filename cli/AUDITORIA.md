# Auditoria do gerador contra o padrão (29/09/2026)

Referências: skill `regra-custom-wd`; plugin `erp-padroes` (`resources/interface/invariantes.md`,
`esqueleto-tela-classica.md`, `rules/convencoes-codigo.md`, `padroes-interface.md`); as 147 WD*RG
e as telas de `custom/om/rotinas/WDOM`; `config/sourcecheck.xml` e `dicionario_pt.xml`.

Os git-hooks do `config` só sincronizam com o IRIS e não validam conteúdo. Então "quebra"
aqui quer dizer compilador do CSW ou lei do padrão, não hook.

Já está correto: trava (`$$ValidarExecucaoCSW^%CSUTIRG001` + `ME^%CSUTICSP`), `csw:aj`/`AJ^%CSUTIUD`,
fechamento `csw:labelcreate/labeldestroy/csp:gerar` (`naogerar` na RG), `$$$SetG/$$$KillG`,
`InicializaCombo` no 9000.

## Corrigido no gerador (29/09/2026, teste da WDOMTESTEAA)

- #1 `do Inicializar...` → `set sc=$$Inicializar...`.
- Chave de aba com multi-seleção: o Obter principal fazia `merge ...(natureza)` sem receber `natureza`. Agora há `Obter<Ent><Tabela>(empresa,chave,.tabela)`, chamado pela aba depois da chave.
- Excluir apagava o nó da empresa (`KillG(^WDOMPVCFG(2,codEmpresa))`), que outras telas dividem. Quando a principal não tem dado próprio, exclui só abaixo da chave da aba, e o Gravar não escreve mais no nó contêiner.
- Itens da multi-seleção gravam data/hora (piece 1) e operador (piece 2); o ValidarGravar confere multi-seleção obrigatória.
- Multi-seleção por lista (`^%CSUTIMM`, opções de uma regra) no gerador e no editor de campo: `multiSelectSource: "lista"`.
- Obrigatório repetido na validação personalizada sai uma vez só; o `0500` não limpa variável sem `new`.
- Validador lê o código gerado: variável na global da RG sem ser parâmetro/new, regra chamada com `do`, variável limpa no `0500` fora do `new`.
- #3 CRLF: o CLI grava CRLF (a tela ainda grava LF).

## Corrigido no gerador (30/09/2026, teste da WDOMTESTETI)

- Grid pelo JSON simples punha todas as colunas no piece 1 (o `undefined` apagava o padrão); agora numera pela posição, e o validador acusa piece repetido.
- Aba de grid com campos gravados (`saveFields`), F8 em campo e coluna (`f8Routine`), sequência automática/editável com reordenação (`autoSequence`), botão Duplicar (`actionType: "duplicate"`), ganchos de regra (`ruleHooks`).
- Validador não avisa mais "coluna sem piece" em coluna só de exibição.
- #4 em parte: o Gravar do grid e os métodos novos saem com o comentário `; set sc=$$Label^RG(...)`.

## A. Lei impeditiva / compilação — ainda pendente no gerador

| # | O quê | Onde no gerador | Como deve ficar |
|---|---|---|---|
| 2 | RG do grid usa `$get(TABSIT(...))`, variável da tela sem `new`/parâmetro | `gpj-grid.js:803`, emitido em `:3393` | passar o valor por parâmetro ou usar o `ObterTab...` que a própria RG gera |
| 3 | Tela grava em LF; fontes do time são CRLF | `gpj-file-saver.js:103` | o CLI já grava CRLF; pela tela, converter antes de subir |

## B. Fora do padrão do time

| # | O quê | Onde |
|---|---|---|
| 4 | RG sem comentário de chamada nem autor/data (`; set sc=$$Label^...RG(...)`, `; (INI - dd/mm/aaaa);`), que 132 das 147 WD*RG reais têm | `gpj-rg-generator.js:550-572`, `gpj-grid.js:3123+` |
| 5 | Exclusão em label textual `Excluir/ExcluirSN/ExcluirEX`; o padrão é `3100/3100SN1` | `gpj-mac-generator.js:1554-1632`, `:1900`, `:1910` |
| 6 | `3000` grava sem confirmação (`SN^%CSUTIUD` → `3000SN1`) | `gpj-mac-generator.js:984` |
| 7 | `2999 goto 1999` antes de `1999`; no modo grid, foco no 3000 (o time também faz isso em WDOMCGI010) | `gpj-mac-generator.js:916`, `gpj-grid.js:2558` |
| 8 | Labels da RG fora dos verbos do dicionário: `Inicializar<Ent>`, `Lock/UnLock<Ent>` | `gpj-rg-generator.js:535-590` |
| 9 | RG do grid: `set sc=1` em vez de `$$$OK`; `for ... do .` pontuado; `$piece` copiado de `$piece` sem variável nomeada; `new` de variáveis nunca usadas | `gpj-grid.js:3192`, `:3206`, `:3294`, `:3297`, `:3389` |
| 10 | Variável local `%CSTN` como retorno de `VerTipoNota` | `gpj-field-lookups.js:183`, `:190` |
| 11 | "`<Título> não cadastrado!`" sem o código do registro | `gpj-rg-generator.js:447`, `:834`, `:972` |
| 12 | A 299 faz `merge` direto da global de negócio (o time repete isso em WDOMCHECK299 e WDOMPV299) | `gpj-f7-generator.js` |

## C. Cosmético

- 13: cabeçalho `; MM/AAAA - Título <#ROTINA GERADA AUTOMATICAMENTE#>`; o time usa `; [INICIAIS] MM/AAAA - DESCRIÇÃO EM MAIÚSCULA` (`- REGRAS` na RG).
- 14: comentário da label em uma linha; o time usa `; Desc` / `;`.
- 15: exemplo com título no plural ("Motivos de Parada"); `$$$ERROR(10000,...)` onde `$$$Error` é o preferido.
- 16: botão sem `actionLabel` cai em `6000` (`gpj-custom-buttons.js:5`, `:1051`), que é a label de mensagens; o LEIA-ME-VALIDADOR ainda fala em 6000/6100.

## O que o validador não confere e deveria

Hoje ele só olha o estado do projeto e, do código, só a 299. Faltam: presença da trava, `csw:aj` e
fechamento no `.mac`; `do X^...RG(`; variável da tela dentro da RG; labels de ação fora de 3XXX;
3000 sem `SN^%CSUTIUD`; verbo das labels da RG; título no plural ou começando com verbo; palavras
contra o `dicionario_pt.xml` (PalavrasInvalidas e Abreviacoes); variável com `%`; leitura direta
de global na tela ou na 299; CRLF; e `regra-custom-wd` (interface custom sem prefixo WD, ou RG `RGOM*`).
