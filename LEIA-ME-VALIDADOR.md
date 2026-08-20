# Validador de regras Caché / CSW

Branch: `feat/1-validador-cache`

## O que mudou

- **Novo módulo** `modulos-padrao-json/gpj-validator.js`, carregado depois do `gpj-app.js`.
- **Correção real no gerador de F7** (`gpj-f7-generator.js`): as globais de trabalho da
  rotina 299 (`^mtemp...SEL` / `^mtemp...NAOSEL`) podiam passar de 31 caracteres, que é o
  limite do Caché para nome de global — a rotina simplesmente não compilava.
  Agora a base é cortada em 20 caracteres e, quando há corte, os dois últimos viram um
  hash do nome completo para duas consultas diferentes não colidirem.

  Exemplo com rotina `WDOMPVCONFIGURACAO` e label `SELECAOTIPOSDENOTAFISCAL`:

  | antes                                     | depois                            |
  |-------------------------------------------|-----------------------------------|
  | `^mtempWDOMPVCONFIGURACAO299SELECNAOSEL` (37) | `^mtempWDOMPVCONFIGURACAO60NAOSEL` (31) |

## Como usar

Abra o `gerador-json-ui-ajustada.html`. No canto inferior direito aparece um selo:

- verde `✔ Sem problemas`
- laranja `⚠ N avisos`
- vermelho `⚠ N erros`

Clique no selo para abrir a lista. Clicando em um item, a tela rola até o campo/aba
correspondente e o destaca. O botão **Copiar relatório** joga tudo em texto.

O validador roda sozinho a cada alteração (é acoplado ao `app.refresh`) e nunca altera
o código gerado — é só diagnóstico.

## Regras verificadas

**Nomes e limites do Caché**
- nome de rotina, RG, rotina de aba, global e global de trabalho: caracteres válidos e
  limite de 31 caracteres;
- rotina de aba duplicada com outra aba, com a principal ou com a RG;
- RG com o mesmo nome da interface;
- variável de campo inválida, maior que 31 caracteres ou repetida no mesmo local
  (duas variáveis iguais gravam no mesmo piece);
- variável colidindo com as do framework (`Z`, `SC`, `CE`, `CT`, `%PRG`, `TIPF7`…);
- labels e globais das rotinas 299 geradas.

**Layout**
- label, leitor e display que passam da largura da janela ou do TabPanel;
- linha além da altura da janela / do TabPanel;
- sobreposição entre label, leitor e display — do mesmo campo ou de campos diferentes
  (considera altura de textArea);
- TabPanel maior que a janela;
- botões de manutenção fora da janela ou por cima do TabPanel.

**Chaves, RG e persistência**
- cadastro sem nenhuma chave nos índices da global;
- índice apontando para campo inexistente, campo chave dentro de aba;
- rotina sem `CE` e sem campo `CODEMP`;
- combo/checkbox/radio sem variável da tabela, sem itens ou com valor repetido;
- multi-seleção sem variável de tabela;
- multi-seleção gerando 299 sem a global de todos os registros (hoje sai um `TODO`
  silencioso no código);
- 299 com nome igual ao da interface ou maior que 31 caracteres;
- quantidade de colunas x títulos x pieces desalinhada no `%CSUTIPE`;
- Valcp escrevendo em `{display}` num campo sem display;
- Valcp usando `CODEMP` numa rotina que só tem `CE`;
- marcador `{...}` desconhecido no Valcp (sairia literal no .mac);
- leitor tipado ligado sem rotina;
- campo obrigatório e desabilitado ao mesmo tempo.

**Grid**
- aba do tipo Grid sem coluna;
- código de grid repetido na mesma janela;
- global de trabalho repetida entre grids, inválida ou acima de 31 caracteres;
- linha final menor que a inicial, grid estourando a altura do local;
- grid sem coluna chave, manutenção inline sem coluna editável;
- coluna com variável inválida/repetida ou sem piece.

## Correção — tabela de opções na RG de consulta com grid

Numa rotina do tipo *Consulta com Grid*, a RG principal era substituída inteira pela RG do
grid. Como as duas têm o mesmo nome (`<ROTINA>RG`), os labels das tabelas de opção
(combo, radio, checkbox) sumiam: a interface chamava

```objectscript
set sc=$$ObterTabOpcao^WDOMTESTE12RG(.TABOPC)
```

e o label `ObterTabOpcao` não existia na RG gerada — a rotina não compilava.

Agora, em modo grid, os blocos `ObterTab<X>` são acrescentados à RG do grid, antes do
bloco de tags CSW que fecha a rotina:

```objectscript
	; Obter Tabela Opção
ObterTabOpcao(tabOpcao)	;
	;
	kill tabOpcao
	;
	set tabOpcao(0)="Vigente"
	set tabOpcao(1)="Não Vigente"
	set tabOpcao(2)="Todos"
	;
	quit $$$OK
```

## Correção — a variável do campo comendo o retorno do Valcp

O campo `Empresa` virava a variável `EMP`, que é exatamente a variável de retorno do
Valcp da empresa:

```objectscript
set sc=$$VerEmpresa^CCAPLRG001(EMP,.EMP)
```

O código entrava e o registro da empresa saía **na mesma variável**. Na validação seguinte
o campo já não tinha mais o código e a tela respondia *"Empresa não cadastrada!"* mesmo com
a empresa selecionada pelo F7.

Duas coisas mudaram:

- os importadores passaram a usar o nome padrão da variável quando o campo cai num preset
  conhecido — `CODEMP`, `CODCLI`, `CODITM`, `CODMOE`, `CODTRA`, `CODREP`, `CODTIPNOT`,
  `CODCONVEN`, `CODTABPRE`. O gerado virou `$$VerEmpresa^CCAPLRG001(CODEMP,.EMP)`;
- o validador ganhou a regra `variavel-colide-com-valcp`, que aponta o erro em qualquer
  projeto (inclusive nos montados à mão):
  *Campo "Código da Empresa": a variável "EMP" também é usada como retorno no Valcp.*

## Correção — label do botão personalizado

Os botões importados apontavam todos para `6000^ROTINA` e **esse label não era gerado** —
ele só saía para botões do tipo "abrir outra tela". Clicar em qualquer um estourava em
`zexecuteLabel^Utils.CSW1JavaFunctions`.

Agora cada botão recebe um label próprio (`6000`, `6100`, `6200`…) e a rotina passa a
trazer o label com o esqueleto da ação:

```objectscript
	; Incluir
6000	;
	; TODO: implementar a ação do botão Incluir.
	quit
```

## Correção — `<UNDEFINED> *codEmpresa` no Consultar

Com a manutenção em linha ligada, o `GerarGlobalTrabalho` da RG passa a **ler a global
persistente** para montar a global de trabalho:

```objectscript
for  set artigo=$order(^WDWDNEW015(codEmpresa,artigo)) ...
```

Só que a assinatura não recebia `codEmpresa` — ela tinha apenas `(term,rotina,<filtros>)`.
No primeiro *Consultar* o Caché estourava
`<UNDEFINED>GerarGlobalTrabalho+11^WDWDNEW015RG *codEmpresa`.

O `GerarGrid` já seguia o padrão certo (`GerarGrid(codEmpresa,term,rotina)` chamado com
`(CE,CT,%PRG)`); agora o `GerarGlobalTrabalho` segue o mesmo:

```objectscript
GerarGlobalTrabalho(codEmpresa,term,rotina,empresa)	;
...
2000AG1	set sc=$$GerarGlobalTrabalho^WDWDNEW015RG(CE,CT,%PRG,CODEMP)
```

Os índices só entram quando o corpo realmente lê a global persistente, para não mudar a
assinatura de quem não precisa.

## Coluna do grid como chave da global

Marcando **Chave** numa coluna do grid, a coluna passa a aparecer no combo *CAMPO CHAVE*
de **Índices gerais da global** — antes só campos da seção *Campos* entravam ali, e o
combo ficava vazio numa tela em que a chave do registro é uma coluna (Artigo, por
exemplo). O índice também é criado sozinho, do mesmo jeito que acontece com um campo
marcado como chave.

O resultado é a global filtrada pela empresa e com a coluna como último subscrito:

```
^WDWDNEW015(codEmpresa,artigo)
```

Na RG isso vira o par certo — a base sem a chave para o merge e a chave como variável do
`$order`:

```objectscript
GerarGlobalTrabalho(codEmpresa,term,rotina,empresa)	;
	...
	set artigo=""
	for  set artigo=$order(^WDWDNEW015(codEmpresa,artigo)) quit:artigo=""!$$$ISERR(sc)  do
	. set mtempWDWDNEW015=$get(^WDWDNEW015(codEmpresa,artigo))

GravarConfiguracaoCargaMinimaPorArtigo(codEmpresa,term)	;
	do $$$KillMergeG(^WDWDNEW015(codEmpresa),^mtempWDWDNEW015(term))
```

A chave que vem do grid **não** entra na lista de parâmetros da tela: ela chega pela linha
selecionada, então a assinatura continua com `codEmpresa` e os filtros. Se o nome do
parâmetro for trocado no painel de índices, a RG acompanha.

Duas regras do validador foram ajustadas junto: a coluna chave não precisa mais de *piece*
da global de trabalho (ela é o subscrito, não um pedaço do registro) e o aviso de "campo
usado como chave mas não marcado como chave" não vale para colunas de grid.

## Correção — `<UNDEFINED>` na global do pai com abas

A coluna de grid marcada como chave entra nos índices da global — mas isso só vale para o
grid da **tela principal**. Estava valendo também para grid de aba, e aí a global do pai
saía assim:

```objectscript
UnLockCadastroSequenciaCalculo(codEmpresa)	;
	do $$$DoLock("-","^WDWDNEW02(codEmpresa,produto,empresa)")
```

`produto` e `empresa` são as colunas chave dos grids das abas *Dados Gerais* e *Dados
Programação*. Elas não são parâmetro da rotina pai (chegam pela linha do grid da aba),
então a assinatura tinha só `codEmpresa` e o Caché estourava
`<UNDEFINED>GetRegistroConv+24^%CSINTEGRA *produto` já no primeiro Show.

O mesmo vazamento contaminava as RGs das abas, cada uma carregando a chave da outra:

```objectscript
; antes
do $$$KillMergeG(^WDWDNEW02(codEmpresa,empresa,4),^mtempWDWDNEW03(term))   ; aba 1
do $$$KillMergeG(^WDWDNEW02(codEmpresa,produto,7),^mtempWDWDNEW06(term))   ; aba 4

; agora
do $$$KillMergeG(^WDWDNEW02(codEmpresa,4),^mtempWDWDNEW03(term))
do $$$KillMergeG(^WDWDNEW02(codEmpresa,7),^mtempWDWDNEW06(term))
```

A chave do grid de aba continua funcionando onde ela vale — dentro da RG da aba:

```objectscript
for  set produto=$order(^WDWDNEW02(codEmpresa,4,produto)) quit:produto=""!$$$ISERR(sc)  do
```

Junto foi corrigido o id repetido de botão: dois "Remover Todos" na mesma tela viravam o
mesmo `btREMOVERTODOS`, e o CSW ligava os dois no mesmo controle. Agora o segundo vira
`btREMOVERTODOS2`.

Efeito colateral esperado: telas que não têm campo chave nenhum passaram a acusar
"Nenhuma chave foi definida nos índices da global" — antes a chave do grid de aba
mascarava o problema.

## Correção — campo antes da chave sendo apagado

Na tela Workflow o código da empresa sumia assim que o operador passava para o campo
seguinte. O campo Empresa tinha virado um piece da variável de dados do registro:

```objectscript
1000ON	do ^%CSLE(2,15,8,"$piece(WDNRWORK,Z,3)",$piece(WDNRWORK,Z,3),...)
```

Só que logo depois da chave a rotina carrega o registro, e as duas saídas do carregamento
zeram essa variável:

```objectscript
	set sc=$$ObterWorkflow^WDNRWORK002ARG(CE,CODWOR,.WDNRWORK,...)   ; set wdnrwork=""
	if $$$ISERR(sc) do InicializarWorkflow^WDNRWORK002ARG(...)        ; set wdnrwork=""
```

O piece 3 ia junto, e o `8000` redesenhava o campo vazio.

Um campo lido **antes** da chave ainda faz parte da identificação do registro, não do
conteúdo dele — então agora ele ganha variável própria, como os campos chave já tinham:

```objectscript
1000ON	do ^%CSLE(2,15,8,"CODEMP",CODEMP,,,,",%EMP^CCAFC299,,cp1000")
```

A variável entra no `New` e no reset do `0500` (com a exceção que já existia para `CODEMP`,
que vem da empresa da sessão). A variável de dados base continua declarada e passada para
a RG mesmo quando nenhum campo mora nela — ela guarda data/hora e operador nos dois
primeiros pieces.
