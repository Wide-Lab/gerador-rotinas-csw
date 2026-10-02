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

## Alinhamento com as invariantes de interface da Consistem

Comparei o `.mac` gerado contra `resources/interface/invariantes.md` e o
`esqueleto-tela-classica.md` do plugin `csw`. O gerador já atendia quase tudo — trava de
execução, `ME^%CSUTICSP`, `Valcp{NNNN}`/`Validate`, `ValidarDisplay^%CSW1GRID`, saída com
`FJ^%CSUTIUD` + `FJ^%CSW1UTI`, regra chamada com `set sc=$$`, sem `kill (a,b)`. Dois desvios
reais apareceram:

**Ação de botão ocupava o 6000.** No padrão, `6000` é o componente de mensagens (`^%CSMSG`) e
`7000(HABBOT)` a habilitação de botões — nenhum dos dois é label de ação. As ações vivem na
faixa `3XXX`. Os botões personalizados agora nascem em **3500**, de 100 em 100 (3500…3900); do
sexto em diante o passo cai para 10, deslocado em 5 (3505, 3515…) para não bater nas centenas.
O `3000` continua sendo a gravação e o `3100` a exclusão. A faixa `4XXX` do grid editável não
muda — é o padrão documentado da manutenção em linha.

**Altura da tela passava de 28 linhas.** Com abas, a altura automática crescia junto com o
TabPanel e saía `csw:aj:108,29`. A resolução do CSW é 108 x 28; agora a altura é limitada a 28
e quem encolhe é o TabPanel.

**Combo sem tabela de opções.** No *Gerar por documento*, um campo declarado como combo, radio
ou checkbox saía sem tabela — o `^%CSLE` fica sem o que listar e o validador acusava erro.
Agora vem com `TAB<VARIÁVEL>` e dois itens (Inativo/Ativo) para ajustar.

### Como conferir

O harness de teste carrega o HTML real do gerador no jsdom e roda a pipeline inteira
(importar → projeto → `.mac` → validador), verificando: trava de execução, tratamento do
`sc`, `6000` livre, sem label `5XXX`, sem `kill` com parênteses, resolução 108x28, saída
correta e chamada de regra com `set sc=$$`. As três telas de referência passam nas onze regras.

## Espera do Lock (terceiro parâmetro do $$$IfLock)

A RG saía com o Lock sem tempo de espera:

```objectscript
	if $$$IfLock("+","^WDCCMOT(codEmpresa,codigo)")
```

Sem o terceiro parâmetro o Caché **espera indefinidamente** o outro processo soltar o
registro. Na prática a tela congela sem retorno para o operador — não é erro de compilação,
é comportamento em produção.

O padrão real do ERP passa os segundos:

```objectscript
	if '$$$IfLock("+","^WDCAPMPPLT(1,codEmpresa,1,codOF)",3) do  quit sc
	. set sc=$$$ERROR(10000,$$$MsgLock("Paletes da OF "_codOF,"o",...))
```

Agora existe o campo **Espera do Lock (segundos)** ao lado das opções da RG, com 3 por
padrão. Em branco ou 0 o parâmetro não é emitido, mantendo a espera indefinida para quem
precisar dela de propósito.

```
espera 3s   →  if $$$IfLock("+","^WDCCMOTPAR(codEmpresa,codMotivo)",3)
espera 30s  →  if $$$IfLock("+","^WDCCMOTPAR(codEmpresa,codMotivo)",30)
espera 0    →  if $$$IfLock("+","^WDCCMOTPAR(codEmpresa,codMotivo)")
```

O valor entra no JSON do projeto (`lockTimeout`), então viaja junto ao exportar e importar.

## Revisão geral contra a skill de validação

Apliquei o checklist da `cache-consistem-validacao` a **todo** o acervo do builder, não a
telas escolhidas a dedo: 46 telas convertidas, **124 rotinas** conferidas (interfaces, abas e
RGs).

As 20 checagens, por categoria:

| categoria | o que é verificado |
|---|---|
| Labels | `0000`/`0500`/`9000`/`9999`, `Show(`, `Validate()`, ao menos um `Valcp` |
| Variáveis | MAIÚSCULAS na interface, camelCase na RG, `CT=%index` no `0000`, `CE`/`%index`/`%conta` fora do `new` |
| CSLE | `quit:$$CSP` depois de cada campo, `cpNNNN` sem repetição, `NNNNON` casando com o `cpNNNN` da linha |
| Grid | `Inicializar`/`Limpar`/`ValidarDisplay`/`Finalizar`, grid finalizado no `9999` |
| Abas | `csw:labelseltab`, `9999` delegado à pai, botões por `csw:btnManter` e não `csw:botao` |
| Mtemp | indexada por `term`, persistência só por macro (`$$$SetG`/`$$$KillMergeG`) |
| Tags | `csw:labelcreate`, `csw:labeldestroy:9999`, `csw:csp:gerar`, `csw:aj` pareado com `AJ^%CSUTIUD` |
| Navegação | `%=27`/`%=140` nas `EX` de campo, `quit:$$CSP` depois de cada `Show^` |

```
telas processadas:     46
rotinas verificadas:  124
nenhuma checagem falhou
```

### Quatro alarmes falsos, todos meus

O primeiro resultado acusou 82 falhas. Nenhuma era do gerador — eram regras minhas escritas
sem conferir a convenção real. Vale registrar, porque são armadilhas de quem for escrever
checagem nova:

**`sc` e `mtempROTINA` são minúsculos.** Não é desvio: o próprio esqueleto Consistem tem
`sc`, e rotinas de produção trazem `New^%CSW1UTI("VAR1,...,sc,...,mtempCIAOPGQ060A,...")`.
Exigir MAIÚSCULAS em tudo reprovava 46 rotinas corretas.

**Rotina de aba não tem `CT=%index`.** Ela tem `0000 quit` vazio, como a skill manda. A
checagem só se aplica à rotina pai.

**Tela sem campo CSLE não tem `Valcp`.** Consulta só com grid não valida campo nenhum.

**`EX` de botão não navega por tecla.** `3500EX goto 2999` é retorno de `Show^`, não saída de
campo — `%=27`/`%=140` só valem nas `EX` que têm o `ON` correspondente.

### Global das abas: conferido, está certo

Numa tela com abas a diferença entre os nós é a **fixa**, nunca um nome de global diferente:

```
pai        do $$$SetG(^WDCCMOT010A(codEmpresa,codMotivo),wdccmot0)
aba Geral  do $$$SetG(^WDCCMOT010A(codEmpresa,codMotivo,4),wdccmot010Atab1)
aba grid   do $$$KillMergeG(^WDCCMOT010A(codEmpresa,codMotivo,5),^mtempWDCCMOT010ATAB2(term))
```

A global de trabalho é outra história: sai como `^mtempROTINATABn`, que é convenção real
(74 ocorrências no clone, do tipo `^mtempASALWMS100TAB1`), e o campo **Global de trabalho**
na seção do grid aceita trocar — a edição pega e vai para a RG gerada.

## Primeiro campo na linha 1

O primeiro campo da rotina principal nascia na **linha 2**, deixando a linha 1 vazia. Na tela
isso parece campo faltando — e não havia motivo: aba já começava na linha 1.

Fui conferir em produção antes de mexer. Das rotinas com `csw:label`, 21 começam na linha 1 e
19 na linha 2 — e, nessas 19, a linha 1 está mesmo vazia. Ou seja, as duas formas existem,
nenhuma é regra. Ficou a linha 1, que é a que não deixa buraco.

Mudou em três lugares:

- `nextLine()` em `gpj-fields.js` — o primeiro campo agora começa em 1 tanto na rotina
  principal quanto na aba (antes era `parent ? 2 : 1`);
- o *Gerar por documento*, que somava o mesmo deslocamento;
- o projeto padrão que abre com o gerador.

O TabPanel continua sendo posicionado depois dos campos do cabeçalho — com dois campos na
principal ele vai para a linha 4, sem colidir.

```
; csw:label:1,1,18,Código da Empresa*
; csw:display:25,1,40,ds1000
; csw:label:1,2,18,Código do Motivo*
```

O importador do desenhador não muda: lá a linha vem do desenho.

## Botões de manutenção: linha e alinhamento

A linha sugerida só era calculada **quando havia abas** — duas linhas depois do TabPanel.
Sem abas ela ficava parada no valor do padrão, e um cadastro de três campos saía com o
Salvar lá na linha 26, com um vão enorme no meio da tela.

Agora, sem abas, a sugestão é **duas linhas depois do último campo** — ou do grid, quando
ele existe:

```
campos nas linhas 1,2,3          →  botões na linha 5
grid terminando na linha 15      →  botões na linha 17
```

Com abas nada muda: continua duas linhas após o TabPanel.

### Alinhamento

Campo novo em *Posição e local dos botões*:

| opção | coluna |
|---|---|
| Esquerda da tela | 1 |
| Alinhado com os campos | a coluna do leitor (onde o dado começa) |
| Centro | centralizado na largura da janela |
| Coluna manual | o que estiver digitado |

Num cadastro com os leitores na coluna 19, numa janela de 108:

```
left    → csw:btnManter:1,5
fields  → csw:btnManter:19,5
center  → csw:btnManter:31,5
```

A largura da barra não está no projeto — quem desenha os três botões é o componente. O
`center` usa 48 colunas, medido numa tela de 108, mais 16 quando há "Salvar e outro".

Digitar na coluna à mão troca o alinhamento para **Coluna manual** sozinho, para o
automático não sobrescrever a escolha no refresh seguinte. O valor viaja no JSON do projeto.

### A linha travava depois de editada uma vez

O cálculo automático desligava quando se digitava na linha — e **não voltava mais**. Não
havia como religar: nem tirando as abas, nem trocando os campos. Uma tela que teve abas em
algum momento ficava com a linha daquele TabPanel (`2 + 20 - 1 + 2 = 23`) mesmo depois de
virar um cadastro de três campos.

Agora existe a caixa **Linha automática**, ao lado do campo:

```
1) automático         linha  5   caixa marcada
2) digitei 23         linha 23   caixa desmarcada
3) remarquei a caixa  linha  5   caixa marcada
```

Editar a linha continua desmarcando — o valor digitado manda. A diferença é que dá para
voltar.

### "Usar abas" marcado sem nenhuma aba

O `23` que aparecia numa tela de dois campos é a conta **com abas**: `2 + 20 - 1 + 2`. E a
tela não tinha aba nenhuma — só a caixa *Usar abas* marcada.

O layout olhava a caixa, não o conteúdo. Um projeto nesse estado (importado assim, ou vindo
de uma sessão em que as abas foram removidas) reservava espaço para um TabPanel que não é
desenhado, e os botões iam para o fim da tela.

Agora as três sugestões que dependem de aba — altura do painel, linha dos botões e altura da
janela — perguntam por `hasTabs()`, que exige a caixa marcada **e** ao menos uma aba:

```
usar abas marcado, zero abas  →  linha 4   (antes: 23)
uma aba de verdade            →  linha 25
```

### Trocar de Grid para Cadastro deixava a linha do grid

Segundo motivo para a linha teimar num valor alto: **o grid não some quando o modo muda.**
Trocar de *Consulta com grid* para *Cadastro* mantém a definição do grid no projeto — ela
fica lá para quando se voltar atrás. Só que eu contava a linha final dela na hora de
posicionar os botões, e uma tela de dois campos herdava a linha do grid que a rotina nem
desenha mais.

Grid na tela principal só é gerado no modo Grid (é o `generateParent` que desvia para
`app.grid.generateInterface`). Então a linha final do grid agora só entra na conta nesse
modo:

```
modo Grid, grid até a linha 21   →  botões na linha 23
troco para Cadastro              →  botões na linha 4    (campos nas linhas 1,2)
volto para Grid                  →  botões na linha 23
```

## Chamada x assinatura: três defeitos

O `2000AG1` que você mostrou repetia argumentos:

```
set sc=$$GerarGlobalTrabalho^WDCCMOT010RG(CODEMP,CODIGO,CT,%PRG,CODEMP,CODIGO)
```

Virou checagem automática sobre o acervo — para cada `$$Label^ROTINA(...)`, comparar com a
assinatura **daquela** rotina: sem argumento repetido, sem parâmetro repetido, e chamada
nunca com mais argumentos que a assinatura (menos é legítimo; os últimos ficam indefinidos).
Ela encontrou três coisas.

**1. Chave que também é filtro entrava duas vezes.** Com manutenção no grid, as chaves da
global entram pelo prefixo persistente do `2000AG1`. O campo que é chave *e* filtro aparecia
de novo na lista de filtros — dos dois lados, chamada e assinatura:

```
antes   chamada    (CODEMP,CODIGO,CT,%PRG,CODEMP,CODIGO)
        assinatura (codEmpresa,codigo,term,rotina,codEmpresa,codigo)
depois  chamada    (CODEMP,CODIGO,CT,%PRG)
        assinatura (codEmpresa,codigo,term,rotina)
```

**2. Parâmetros com o mesmo nome.** A deduplicação era por *variável*, não por parâmetro.
Três campos de "Perdas" com variáveis `PER`, `PER2` e `PER3` viravam `perdas` três vezes:

```
antes   (term,rotina,dadosProducao,dadosBobina,operadoresLinha,perdas,perdas,perdas,of)
depois  (term,rotina,dadosProducao,dadosBobina,operadoresLinha,perdas,perdas2,perdas3,of)
```

**3. Regressão minha.** Quando fiz a interface sempre passar a variável de dados base em modo
Cadastro (ela guarda data, hora e operador nos dois primeiros pieces), não fiz o mesmo do
lado da RG — lá a estrutura base era descartada quando nenhum campo morava nela. Resultado:
chamada com quatro argumentos, assinatura com três.

```
antes   assinatura (codEmpresa,wdwdnew04,tabempnatesta)
        chamada    (CE,WDWDNEW0,WDWDNEW04,.TABEMPNATESTA)
depois  assinatura (codEmpresa,wdwdnew0,wdwdnew04,tabempnatesta)
```

Esse é o tipo de erro que não aparece na compilação: o Caché aceita a chamada e o parâmetro
a mais simplesmente se perde. Por isso a checagem ficou no conjunto que roda a cada mudança.

### Dois alarmes falsos, de novo meus

A primeira versão do verificador acusou 80 divergências de aridade. Nenhuma era real:

- **Vírgula dentro de argumento.** `$piece(VARDET,Z,1)` é *um* argumento, não três — o
  contador precisa quebrar só nas vírgulas de primeiro nível.
- **Label com o mesmo nome em RGs diferentes.** `GravarCadastroSequenciaCalculo` existe em
  três RGs do mesmo projeto, com assinaturas diferentes. Comparar com a primeira que aparece
  não diz nada; a comparação tem que ser com a rotina que a chamada nomeia.

## Confirmar a linha já gravando na global

Na manutenção em linha, confirmar a linha escreve na **global de trabalho** e o registro só
chega à global de negócio quando o operador clica em *Salvar*. Para um grid em que incluir a
linha já é o cadastro, isso é um passo a mais sem função.

Caixa nova, embaixo da manutenção em linha: **Confirmar a linha já grava na global (dispensa
o Salvar)**. Ligada, a gravação definitiva entra na própria label `4900`, logo depois do
`GravarGlobalTrabalho`:

```objectscript
4900	;
	set sc=$$GravarGlobalTrabalho^WDCCMOT010RG(CT,$piece(VARDET,Z,1),mtempWDCCMOT010)
	if $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 4999
	;
	set sc=$$GravarGrid^WDCCMOT010RG(CODEMP,CT,%PRG,$piece(VARDET,Z,1),CODREG)
	if $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 4999
	;
	set sc=$$GravarMotivo^WDCCMOT010RG(CODEMP,CODIGO,CT)
	if $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 4999
```

**A remoção entra junto.** No `3200`, depois do `RemoverGlobalTrabalho` e do `ExcluirLinha`,
a mesma gravação. Sem isso a linha sumiria da tela e continuaria na global até alguém salvar
— o oposto do que a opção promete.

A gravação usa o mesmo `Gravar<Entidade>` do botão Salvar, com os mesmos argumentos: é o
`$$$KillMergeG` da global de trabalho para a de negócio, não um caminho novo. O botão Salvar
continua existindo e funcionando.

A opção fica por local de grid (principal ou aba, cada um com o seu) e viaja no JSON do
projeto.

## Casas decimais na coluna do grid

O tipo "Valor / decimal" era fixo em `v3` — três casas, sem escolha. No CSW o número do tipo
**é** a quantidade de casas, então a lista passou a trazer `v0` a `v4`:

```
Tipo=v2; Csw=12^Tempo Meta^3
```

A escolha atravessa tudo: a tag do grid, o tipo de manutenção da coluna (qualquer `vN` é
decimal) e o `SCALE` da propriedade na classe COS.

## Botão de consulta nascia travado

Com *Usar botão de consultar*, o `9000` emitia `do BtnConsultar^%CSW1D(0)` — desabilitado — e
não havia nenhuma outra chamada que o liberasse. O botão aparecia e não clicava, em nenhum
momento da tela.

Fui conferir a convenção em rotinas de produção (`ASALCIB600`, `ASALPV600`, `ASALCCESG135`):
todas fazem `do BtnConsultar^%CSW1D(1)` logo depois do `Enable^%CSW1UTI()`, no `9000`. É o
que o gerador emite agora.

## Foco depois dos campos, na tela de grid

Escolher o foco só existia para grid **dentro de aba** (`finalFocus` da aba). Na tela de grid
direta o `gridFinalFocusMode` abria com `if (!config.gridInTab) return "grid";` — ou seja,
sempre a primeira linha do grid, sem opção. E mesmo na aba as opções eram só
Automático/Salvar/Grid/Último campo: nunca dava para apontar **um** campo.

Agora há *Foco depois dos campos* junto das opções da consulta, e a lista é montada a partir
dos campos da tela:

```
Automático (grid)      do Focus^%CSW1GRID3(CT,%PRG,1,1)
Botão Consultar        do Focus^%CSW1UTI(%PRG,"btConsultar",,1)
Primeira linha do grid do Focus^%CSW1GRID3(CT,%PRG,1,1)
Último campo           do Focus^%CSW1UTI(%PRG,"cp1100",,1)
Campo 1000 — Código da Empresa   do Focus^%CSW1UTI(%PRG,"cp1000",,1)
```

Dois cuidados: apagar o campo escolhido não quebra a geração — cai no automático; e escolher
*Botão Consultar* com o botão desligado também cai no automático, em vez de mandar foco para
um `btConsultar` que não existe na tela.
