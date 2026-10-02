# Importar do desenhador de telas → Caché

Branch: `feat/6-desenhador-para-cache` (parte da `feat/5-tudo-junto`).

Botão **Importar do desenhador** no cabeçalho. Cole o JSON da tela desenhada no app React
e ele vira rotina Caché: campos posicionados na grade de caracteres, grid com colunas,
abas, botões e a RG.

## O formato lido

O JSON esperado é o mesmo que aparece no estado do desenhador:

```json
{
  "id": "WDWDNEW010",
  "name": "Planejamento e Programação da Produção",
  "index": 9,
  "components": [
    { "id": "Csle",  "x": 155, "y": 14, "width": 224, "height": 24 },
    { "id": "Grid",  "x": 0, "y": 120, "width": "1498px", "height": "436px",
      "displayIcon": "fa-table-cells", "columns": [ ... ] }
  ]
}
```

A leitura é **tolerante de propósito**, porque não tenho o código do desenhador aqui:

- aceita a tela solta, um array de telas, `{ screens: [...] }` / `{ telas: [...] }` ou o
  despejo do console com chaves numéricas (`{ "9": { ... } }`) — quando há mais de uma,
  aparece um seletor de tela;
- posição por `x`/`y` ou `left`/`top` ou `position.x`; tamanho por `width`/`height`,
  `w`/`h` ou `size.width`; `"1498px"` e `1498` funcionam igual;
- texto por `text`, `label`, `title`, `caption`, `description`, `placeholder` ou `value`;
- o tipo do componente sai de `type`, `componentType`, `kind`, `component` ou `id` — no
  seu JSON o tipo está em `id` (`"Grid"`, `"Csle"`), e é assim que ele é lido.

Componente que não casar com nenhuma regra **não some calado**: aparece no aviso
"Componentes sem regra de conversão: X (n)", para eu acrescentar a regra depois.

## O que vira o quê

| desenho | Caché |
|---|---|
| `Csle` / `Input` / `Leitor` / `TextBox` | campo (leitor) |
| `Display` à direita do leitor | display do mesmo campo |
| `Label` / `Text` à esquerda | descrição do campo |
| `CheckBox`, `Combo`, `Radio`, `Date`, `TextArea` | tipo do campo |
| `Grid` / `Table` | grid com colunas, global de trabalho `^mtemp<ROTINA>` e RG do grid |
| `Tab` / `TabPanel` | abas (o grid vai para a primeira) |
| `Button` com texto *Manutenção* | btnManter da rotina |
| outros `Button` | botões personalizados, na linha/coluna do desenho |

Colunas do grid: `title`/`text`/`label`/`name`, largura em pixel convertida para
caracteres, e o tipo pelo nome quando não vier declarado — *Previsão de Entrega* → data,
*Quantidade* → decimal, *Pedido*/*OP* → número, *Check* → coluna de marcação. Os `piece`
saem sequenciais ignorando a coluna de marcação, e a primeira coluna que parece código
(*Pedido*, *Código*, *Número*, *Seq*, *OP*) entra como chave do registro.

## Pixel → linha e coluna

- **altura da linha**: o menor espaçamento vertical que se repete entre componentes;
- **largura do caractere**: a borda direita da tela dividida pelas colunas da janela
  (108 por padrão).

Os dois valores ficam editáveis na tela (`Colunas`, `Largura da célula`, `Altura da
linha`) e a prévia é refeita na hora, então dá para corrigir se o desenho usar outra
escala.

O label recebe a coluna que ele tem no desenho e o tamanho é cortado para não invadir o
leitor — sem isso, dois campos na mesma linha (`Período de` … `Até`) saíam sobrepostos.

## Teste feito

Com a tela `WDWDNEW010` do seu print reconstruída em JSON (3 linhas de filtros com
display, grid de 8 colunas, três botões):

```
rotina: WDWDNEW010 | Planejamento e Programação da Produção | modo: grid
calibração: célula 13.89 x 28 px  ->  108 colunas

campos:
  Período de     PER      date    L2 colLabel=7  colLeitor=12 tam=16
  Até            ATE      string  L2 colLabel=31 colLeitor=33 tam=16
  Finalidade     FIN      string  L3 colLabel=7  colLeitor=12 tam=16 display@29
  Tipo de Nota   TIPNOT   string  L3 colLabel=73 colLeitor=80 tam=12 display@92  f7=tipoNota
  Produto        PRO      string  L4 colLabel=10 colLeitor=12 tam=16 display@29  f7=produto

grid (rotina principal, linha 5, altura 16, ^mtempWDWDNEW010):
  (check) piece 0 · Previsão de Entrega(d) · Pedido(n, chave) · Controle(a) · OP(n)
  · Engenharia(a) · Engenharia OF(a) · Quantidade(v3)

botões: Manutenção -> btnManter (linha 23) · Gerar Planejamento · Inclusão Engenharia
validador: nenhum problema encontrado
```

E o `.mac` sai com o fluxo do grid montado:

```
2000	if '$$Validate() quit
	set sc=$$Limpar^%CSW1GRID(CT,%PRG,1)
	do AG^%CSUTIUD(,"2000AG1^WDWDNEW010")
	quit:$$CSP^%CSW1UTI()
2000AG1	set sc=$$GerarGlobalTrabalho^WDWDNEW010RG(CT,%PRG,PER,ATE,FIN,TIPNOT,PRO)
	if $$$ISERR(sc) do ME^%CSUTICSP(sc) goto 2000AGEX
	set sc=$$GerarGrid^WDWDNEW010RG(CE,CT,%PRG)
```

## Limite conhecido

O JSON que eu tinha à mão é o do print (`id`, `name`, `components`, `x`, `y`, `width`,
`height`, `displayIcon`). Se o desenhador guardar mais coisa por componente — nome da
variável, obrigatoriedade, F7 escolhido, pieces, colunas do grid num formato próprio —
me mande um JSON completo de uma tela que eu ligo esses campos direto, em vez de inferir
pelo texto. O botão **Copiar JSON do gerador** ajuda a comparar o antes e o depois.

---

## Segunda rodada — com o JSON completo em mãos

Com o JSON real de uma tela do desenhador ficou claro o que estava faltando.

**`gridData`.** As colunas não estão em `components[].columns` e sim em
`components[].gridData.columns`, com `title`, `field` e `dataType` — e as linhas de
exemplo em `gridData.data`, indexadas pelo `field`. Era por isso que o grid saía vazio.
Agora as colunas vêm completas e o **tipo sai das próprias linhas de exemplo**, que é bem
mais confiável do que adivinhar pelo nome:

| coluna | exemplo no desenho | tipo |
|---|---|---|
| Previsão de Entrega | `21/03/2025` | data |
| Pedido | `35659` | número (e vira a chave do registro) |
| Quantidade | `5,000` | decimal |
| Cliente | `11888` | número |
| Check (`dataType: "link"`) | — | coluna de marcação |

**Label alinhado à direita.** No desenhador o texto do label é desenhado encostado na
borda direita da caixa: `Período de` tem `x:22, width:100`, mas aparece colado no campo
que começa em `x:127`. Usando o `x` cru, o label ia para o lugar errado e o campo vizinho
(`Até`) ficava por cima. Agora a coluna é calculada a partir de `x + width`, andando para
trás o tamanho do texto.

**Reflow por linha.** O desenho usa fonte proporcional e a tela CSW é monoespaçada, então
um label longo ocupa muito mais colunas do que pixels. Depois de converter, cada linha é
reorganizada da esquerda para a direita e o display é encolhido se bater no fim da janela
— o projeto sai sem nenhuma sobreposição.

**Display sem leitor.** `Empresas Naturezas Estoque (Acabados)` é um Label + Display sem
`Csle`, com um botão `+` ao lado. Esse par sumia; agora vira campo de **multi-seleção**
com a tabela de selecionados já nomeada.

**`f7` do Csle.** Quando o componente traz `"f7": "1"`, o campo é marcado como tendo
consulta mesmo que o nome não case com nenhum preset do catálogo.

**Radio.** Componente de opção vira campo `radio`; se o desenho trouxer a lista de
opções, ela já sai como tabela de opções pronta (`createOptionsTable`), que é o que o
gerador usa para emitir o `InicializaRadio^%CSW1A` no label `9000`.

### Resultado com o JSON da tela `WDWDNEW010`

```
rotina WDWDNEW010, modo Consulta com Grid, janela 108x23
campos: Período de(date) · Até · Finalidade(display) · Produto(display, F7 produto)
        · Tipo de Nota(display, F7 tipo de nota) · Empresas Naturezas Estoque (multi-seleção)
grid na linha 5, altura 16, ^mtempWDWDNEW010, 9 colunas:
        (check) · Previsão de Entrega(d) · Pedido(n, chave) · Controle · OP(n)
        · Engenharia · Engenharia OF · Quantidade(v3) · Cliente(n)
Manutenção -> btnManter (linha 21) · Gerar Planejamento · Inclusão Engenharia · +
validador: nenhum problema encontrado
```

---

## Terceira rodada — grid sobre os botões e botão de consulta

**O grid comia a barra de botões.** No desenho o grid vai até quase encostar nos botões,
e o componente do CSW ainda desenha a navegação embaixo dele — o resultado era a barra de
botões escondida atrás do grid. Agora a altura é cortada para deixar duas linhas livres
antes do primeiro botão que estiver abaixo.

No JSON de `WDWDNEW015`: o grid passou de `Altura=18` (indo até a linha 21, com os botões
na 22) para `Altura=16`, terminando na linha 19.

**Botão de consulta só quando existe no desenho.** Toda rotina de *Consulta com Grid*
ganhava o `btnConsultar` automaticamente, mesmo quando o desenho não tinha nenhum botão de
consulta — e a tela saía com um "Consultar / Limpar" que não foi pedido. Agora ele só é
gerado quando o desenho (ou o print) traz um botão chamado *Consultar*, *Pesquisar*,
*Limpar* ou *Filtrar*; e nesse caso a posição vem do próprio desenho.

Esses mesmos botões também deixaram de virar botões personalizados — antes o `Consultar`
aparecia duas vezes na tela.

---

## Quarta rodada — barra de botões no padrão e folga do campo

**Barra de botões alinhada.** No desenho cada botão tem uma largura diferente (200px,
164px, 176px) e o `Manutenção`, ao virar o btnManter, deixava um buraco no meio da fila.
Agora todos os botões de uma mesma linha recebem **a mesma largura e o mesmo
espaçamento**, na ordem em que aparecem — e o btnManter entra na fila junto, ocupando o
lugar dele.

Antes e depois no `WDWDNEW015`:

```
antes:  Incluir(19) col 2 · [buraco] · Cancelar(19) col 40 · Excluir(15) col 59
        · Importar(15) col 75 · Histórico(16) col 90
depois: Incluir col 2 · Manutenção col 19 · Cancelar col 36 · Excluir col 53
        · Importar col 70 · Histórico col 87   — todos com 16 de largura
```

Quando a soma não cabe na janela, a largura de cada um é reduzida para caber.

**Folga entre o rótulo e o leitor.** O texto do label terminava colado na caixa; agora
ficam duas colunas de respiro, como nas telas do ERP. O leitor também passou a ter um
mínimo de 6 colunas, para um campo estreito no desenho não virar uma caixa inutilizável.

O importador por imagem ganhou o mesmo alinhamento de barra.

---

## Quinta rodada — botão do tamanho do texto e campo pelo F7

**Botão pequeno.** Uniformizar todos pela maior largura do desenho fazia a barra ocupar a
tela inteira. Agora cada botão tem a largura do **próprio texto** (`texto + 4`, mínimo 10)
e dois espaços entre eles; se a soma não couber na janela, todos encolhem junto.

```
antes:  Incluir(16) col 2 · [buraco] · Cancelar(16) col 36 · Excluir(16) col 53 ...
depois: Incluir(11) col 2 · Manutenção(14) col 15 · Cancelar(12) col 31
        · Excluir(11) col 45 · Importar(12) col 58 · Histórico(13) col 72
```

**O buraco no meio da barra.** O `Manutenção` virava o btnManter, que é a barra
Salvar/Excluir/Cancelar de uma rotina de **cadastro** — numa consulta com grid ele não
aparece, e o lugar dele ficava vazio. Agora, quando a rotina tem grid, o `Manutenção` é um
botão comum como os outros; o btnManter continua sendo usado nas rotinas de cadastro.

**Tamanho do campo pelo F7.** O desenho dá um retângulo (114px), mas quem manda é o dado:
um código de empresa tem 6 dígitos. Quando o campo cai num preset conhecido, o tamanho vem
de uma tabela — empresa 6, cliente 10, produto 15, moeda 5, transportadora 8,
representante 6, tipo de nota 4, condição de venda 6, tabela de preço 6. O campo `Empresa`
saiu de 11 para 6 colunas. O importador por imagem usa a mesma tabela.

---

## Sexta rodada — largura da coluna pelo dado

O título mandava na largura: `Peso Liquido Padrão (Multiplo)` tem 30 caracteres e valores
de dois dígitos, e a coluna saía com 32, empurrando a tabela inteira.

Agora quem manda é o conteúdo, com a régua separada por tipo:

- **número, decimal e data** ficam do tamanho do dado (mínimo 6, máximo 14);
- **texto** acompanha o maior valor de exemplo (mínimo 10, máximo 40);
- **coluna de marcação** fica estreita.

No `WDWDNEW015`:

| coluna | antes | agora |
|---|---|---|
| Artigo (n) | 10 | 10 |
| Descrição (a) | 16 | 16 |
| Peso Liquido Padrão (Multiplo) (n) | 32 | **6** |
| Quantidade Minima Carga (n) | 25 | **6** |
| Catalogo (a) | 28 | 28 |
| Tabela de Preço (a) | 24 | 24 |

O importador por imagem usa a mesma régua, com as amostras lidas pelo OCR.

---

## Sétima rodada — manutenção em linha reconhecida no desenho

Uma tela com **Incluir + Manutenção + Remover** é uma manutenção em linha do grid: o
componente `btnManut` já desenha esses três botões sozinho. O conversor tratava cada um
como botão personalizado, e a tela saía com a barra duplicada — uma linha com
`Incluir | Manutenção | …` e outra logo abaixo com `Manutenção | Incluir | Remover`.

Agora, quando o desenho tem dois ou mais desses botões e existe grid:

- a opção **Gerar manutenção em linha no Grid** já vem marcada, com os labels
  `3100 / 3200 / 3300 / 4000 / 4999`;
- esses botões saem da lista de personalizados — quem os desenha é o `btnManut`;
- o `btnManut` fica **na linha e na coluna do desenho**, não quatro linhas abaixo do grid;
- os botões que sobram (Cancelar, Excluir, Importar, Histórico) continuam na mesma linha,
  ao lado da barra.

No `WDWDNEW015`:

```
csw:btnManut:2,22,3300^WDWDNEW015,3100^WDWDNEW015,3200^WDWDNEW015,1
botões restantes: Cancelar (col 40) · Excluir (54) · Importar (67) · Histórico (81)
```

O desenho sem esses botões (`WDWDNEW010`) continua sem manutenção em linha, como antes.

## Tela de cadastro com grid ao lado (Cadastro de Coleções)

Esse desenho quebrou várias suposições do importador de uma vez. O que mudou:

**O nome do campo é o label, não o texto de dentro do leitor.** No desenho o Csle vem com
um valor de exemplo (`1`, `Colecao Premium`, `Ativo / Inativo`) e o importador usava esse
texto como nome — saíam variáveis como `C1`, `COLPRE` e `ATIINA`, e um parâmetro chamado
`1` na RG, que nem compila. Agora o label à esquerda manda; o texto do componente só vira
nome quando não existe label (checkbox e radio, que carregam o texto dentro).

**O valor de exemplo virou informação útil.** Ele diz o tipo melhor que o nome:
`1` → inteiro, `21/03/2025` → data, `1.234,56` → decimal. E `Ativo / Inativo`, separado
por barra, vira a tabela de opções do combo com as duas opções.

**Combo, radio e check sempre saem com a variável da tabela** (`TABSITUACAO`), mesmo quando
o desenho não trouxe as opções — sem ela a rotina não compila.

**Multi-seleção.** Leitor com um display escrito "Selecionados" ao lado é o componente de
multi-seleção: o campo vira `multiSelect`, ganha `TAB<VARIAVEL>` e o ciclo de incluir/
excluir item na tela.

**O grid desce para baixo dos campos.** No CSW o grid ocupa a largura inteira da janela,
então grid desenhado *ao lado* do formulário vira grid *embaixo* dele. A linha do grid
agora é fixada pelo importador (antes a tela recalculava por conta própria e a tag saía
com `LinPos=10; LinIni=4; LinFim=7`, três valores que não conversam), a altura vem do
desenho e os botões que ficavam na faixa do grid descem para baixo dele.

**Coluna "Ações".** Vira a coluna de marcação do grid, com um aviso: o menu por linha
(`TbCellClick` + `^%CSW1MENUCLICK`) continua sendo escrito à mão.

**Confirmar + Cancelar.** Sem grid na tela principal, os dois viram o `btnManter` do
cadastro (`; csw:btnManter:13,10,3000^ROTINA,0500^ROTINA,Excluir^ROTINA`) e somem da lista
de botões personalizados. Com grid na tela principal a rotina sai no modo Grid, onde o
label 3000 é o foco do grid e não a gravação — aí eles continuam botões comuns e o
importador avisa que, se a tela é um cadastro, o caminho é trocar o modo para CRUD.

**Chave do cadastro.** Num cadastro sem grid, o campo "Código" já vem marcado como chave.

**Nome de parâmetro e de variável nunca começa com dígito** (`gpj-utils.js`), e a variável
do laço do `GerarGlobalTrabalho` não repete um parâmetro da assinatura: um filtro "Código"
e a coluna chave "Codigo" davam os dois em `cod`, e o `new sc,cod` apagava o filtro que
tinha acabado de chegar. Agora o laço usa `cod2`.

## Desenho com abas apontando para outras telas

O componente de abas do desenhador não guarda o conteúdo: ele lista as abas e o nome da
rotina de cada uma, e o conteúdo mora em outras telas do mesmo arquivo.

```json
{ "id": "Tabs", "tabs": [
  { "name": "Dados Gerais", "routine": "WDWDNEW03" },
  { "name": "Dados Pedido", "routine": "WDWDNEW04" }
]}
```

Antes o importador convertia só a primeira tela e o desenho inteiro se perdia — a tela de
fora só tem o componente de abas e os botões, então saía um projeto vazio. Agora ele segue
os ponteiros: cada aba é convertida a partir da tela que ela aponta e entra como aba da
rotina pai, com o nome de rotina que está no JSON.

Do desenho `WDWDNEW02` (Cadastro de Sequência de Cálculo) saem cinco rotinas:

```
WDWDNEW02    rotina pai, 4 abas, btnManter Salvar / Salvar e Criar Outro / Cancelar
WDWDNEW03    Dados Gerais       campos + grid (Produto, Descrição Produto)
WDWDNEW04    Dados Pedido       campos
WDWDNEW05    Dados Estoque      multi-seleção
WDWDNEW06    Dados Programação  campos + grid
```

Detalhes que precisaram de regra própria:

- **Salvar / Salvar e Criar Outro / Cancelar** na tela de fora viram a barra do btnManter
  da rotina pai (`btSalvar`, `btSalvarNovo`, `btCancelar`). O "Salvar e Criar Outro" liga
  a opção correspondente; sem ele o botão não é gerado.
- **"+ Incluir" é "Incluir"**: o `+` do desenho não conta para reconhecer a manutenção em
  linha do grid.
- **Um label pertence a um leitor só.** Uma linha com `Tipo de Nota [combo] [leitor]
  [display]` fazia os dois leitores pegarem o mesmo label e o mesmo display: label, leitor
  e display saíam sobrepostos e um dos campos ia parar na coluna 110. Agora o label vai
  para o leitor mais próximo à direita, o display para o leitor mais próximo à esquerda, e
  o campo que herdou o nome ganha um número (`Tipo de Nota 2`) com um aviso na conversão.
- **Combo, radio e check não recebem preset de F7.** O Valcp do preset escreve na descrição
  ao lado, e esses componentes não têm display. Leitor com F7 de catálogo, ao contrário,
  passou a ganhar o display mesmo quando o desenho não desenhou um.
- **A aba é mais estreita que a janela.** O conteúdo é reposicionado dentro da largura do
  TabPanel (`janela - 2`), e o leitor que não cabe encolhe — antes só o display encolhia.
  A aba importada também guarda as posições do desenho (`autoFieldLayout: false`); o
  alinhamento automático empilharia tudo numa coluna só.
- **Duas grids na mesma aba** não cabem numa rotina de aba: fica a primeira e o importador
  avisa que a outra precisa de uma aba separada.

## Colar um recorte do arquivo

Copiar um pedaço do arquivo do desenhador traz as telas separadas por vírgula, sem os
colchetes de fora e às vezes com uma chave sobrando no fim:

```
{ "id": "WDWDNEW02", ... },
{ "id": "WDWDNEW03", ... },
}
```

Isso não é JSON válido e o painel só respondia "JSON inválido". Agora ele varre o texto e
recolhe os objetos completos do primeiro nível, ignorando o que estiver solto em volta —
colar o arquivo inteiro ou só o trecho das telas dá no mesmo.

## Radio virando botão e área de texto por cima do grid

Duas coisas que apareceram no desenho "Novoooo":

**O grupo de opções virava um botão.** O desenhador nomeia o componente `RadioButton`, e a
regra de classificação testava `button` **antes** de `radio` — o grupo `● Aberto ●
Encerrado ● Todos` saía na tela como "Botão 1". Radio e checkbox agora são testados antes
do botão.

Junto veio o resto do radio: quando ele é desenhado sem label, o texto é a **lista de
opções**, não o nome do campo. Antes virava um label gigante (`Aberto/Encerrado/Todos`) com
a tabela de opções vazia. Agora sai assim, com aviso para renomear o campo:

```objectscript
	set sc=$$ObterTabOpcao^WDWDNEW016RG(.TABOPCAO)
1300ON	do ^%CSLE(5,59,12,"OPC",OPC,,,,",,,cp1300",,,,,3,.TABOPCAO)
```

**A área de texto ficava por baixo do grid.** O grid nasce duas linhas depois do último
campo, mas a conta usava só a linha do leitor — e uma área de texto ocupa três. O grid
subia para cima da Observação. A altura do campo agora entra na conta, no importador e
também no posicionamento automático do app:

```
antes:  Observação na linha 8, grid em LinPos=10   (por cima)
agora:  Observação na linha 8 (8..10), grid em LinPos=12
```

## Tela Workflow: cinco ajustes de uma vez

**O cabeçalho da tela de fora sumia.** Numa tela com abas, os campos que ficam *acima* do
TabPanel (Empresa, Cód. Workflow) eram descartados: a conversão decidia pelo caminho das
abas antes de montar os campos. Agora eles entram na rotina pai:

```
; csw:label:6,2,7,Empresa
; csw:display:24,2,28,ds1000
; csw:label:1,3,12,Cód. Workflow*
; csw:display:24,3,28,ds1100
```

E um campo do cabeçalho chamado "Código…" (inclusive "Cód. Workflow") já vem marcado como
chave.

**Tudo saía empurrado para a direita.** A escala vinha de dividir a largura do conteúdo
desenhado por 108 colunas. Numa aba estreita (conteúdo até 476px) isso dava célula de 4px,
e um leitor desenhado na coluna 9 nascia na coluna 25. A célula agora tem piso pela
proporção de fonte de terminal (quase metade da altura da linha).

**Botão de 200px virava botão de 45 colunas.** O retângulo do botão no desenho é sempre o
mesmo; quem manda é o texto. `Detalhar Pedido` agora sai com 19 colunas, não com a tela
inteira.

**"Excluir" ao lado de Incluir/Manutenção** é o botão de remover da manutenção em linha.
Sem isso a aba saía com quatro botões: os três do `btnManut` mais o Excluir desenhado.

**Display sozinho não é mais multi-seleção por padrão.** Um Display com label e sem leitor
só vira multi-seleção quando tem um botão do lado (o "+" que abre a escolha). Sem botão é
campo informativo comum — antes ganhava todo o ciclo de incluir/excluir item.

**Grid que não cabe.** Um grid de 18 colunas somava 220 caracteres numa tela de 104. As
colunas maiores encolhem até caber, respeitando um mínimo por tipo (número 6, data 10,
texto 8); quando nem no mínimo cabe, o aviso diz o tamanho real e sugere tirar colunas.

## Buscar direto no builder (sem copiar e colar)

O desenhador publicado é o **builder** (`https://builder.widelab.com.br`): front Vite/React
na frente de um back NestJS com Mongo. Cada projeto é gravado com um campo `routines`, e o
que está lá dentro é **exatamente** o JSON que antes se colava na modal — o desenhador não
transforma nada entre a tela e o banco.

Então a modal ganhou duas linhas em cima do textarea:

```
Builder [ https://builder.widelab.com.br ]  Token [ ····· ]  (Listar projetos)
Projeto [ combo com os projetos ▾ ]  [ id ou URL ]        (Buscar)
```

- **Listar projetos** faz `GET {api}/project` e enche a combo com nome e número de telas.
  Escolher um item já dispara a busca.
- **Buscar** faz `GET {api}/project/{id}`, desembrulha o array que a API devolve, joga
  `routines` no textarea e roda a conversão de sempre. O campo aceita o id cru ou uma URL
  colada da barra do navegador — o id de 24 dígitos é extraído.
- Endereço, token e último projeto ficam no `localStorage` (`gpj-desenhador-builder`), então
  na próxima vez é um clique.

O textarea continua valendo: quem preferir colar, cola. A busca só preenche o mesmo campo.

### O token

A rota exige credencial no ambiente publicado. O token sai do próprio desenhador — com o
builder aberto, no console do navegador:

```js
localStorage.getItem("token")
```

Vale 7 dias. Token errado ou vencido devolve uma mensagem dizendo isso e onde achar o
certo, em vez de um erro de rede seco.

### Formatos que o `screensFrom` passou a aceitar

Além do array de telas e do fragmento colado, agora entram:

| origem                          | formato                                  |
| ------------------------------- | ---------------------------------------- |
| resposta da API                 | `[{ name, routines: [...] }]`            |
| área de transferência do editor | `{ project: { routines: [...] } }`       |
| chave em inglês                 | `{ routines: [...] }`                    |

## Teste contra o acervo inteiro

Com a API ligada dá para passar tudo que já foi desenhado pelo conversor, não só as cinco
telas de exemplo. São 24 projetos e **106 telas com componentes**:

```
telas convertidas:      106
telas que estouraram:     0
```

Os avisos que sobraram, agrupados: 82 de label dividida entre dois leitores, 27 de coluna
"Ações", 27 de tela sem chave, 16 de grid que não cabe na largura, 14 de Confirmar/Cancelar
no modo Grid, 4 de aba com dois grids.

O campeão **não é defeito**: são telas de demonstrativo financeiro (`(-) Impostos`,
`(=) Lucro Bruto`) onde uma label serve duas colunas de valor. O sufixo ` 2` está certo, só
o nome fica feio.

Os 27 "sem chave" são em boa parte telas de consulta e painel, que não têm chave mesmo —
vale rever se o aviso deveria calar quando a rotina sai em modo Grid.

Frequência dos componentes no acervo: `Label` 603, `Display` 398, `Csle` 276, `Button` 246,
`Grid` 95, `TextArea` 30, `ComboBox` 25, `Tabs` 11, `RadioButton` 5. Nenhum `BtnManter` —
esse componente está comentado fora do catálogo do desenhador, então ninguém desenhou um.

## Miniatura: ver a tela como ela é no builder

O quadro de campos diz o que virou o quê, mas não parece uma tela — na hora de
escolher entre dez rotinas na combo, não dá para saber qual é qual.

A modal agora desenha a tela escolhida em cima do quadro, com os componentes na
mesma posição do builder e reduzidos para caber. Label alinhada à direita,
Display cinza, Csle branco com a borda laranja e a lupa quando tem F7, botão
escuro, grid com os títulos e as primeiras linhas de dado, radio com as opções,
Tabs com as abas.

O conteúdo é desenhado em tamanho natural e encolhido por `transform: scale()`,
então o texto diminui junto e a proporção continua a do builder.

A caixa **Miniatura** na barra liga e desliga, e a escolha fica no
`localStorage` junto com as preferências do builder.

### Por que ela arrebentava o modal

`transform: scale()` desenha menor mas **não encolhe a caixa de layout**. Um
desenho de 1200px continuava reservando 1200px na grade do modal: a coluna da
esquerda era espremida até virar uma tira e a janela inteira crescia.

Duas correções:

- O canvas passou a viver dentro de uma **moldura já do tamanho reduzido**, com
  `overflow: hidden`. O que o `scale()` desenha não vaza mais para o layout.
- As colunas do corpo ganharam `min-width: 0`, senão o `1fr 1fr` do grid CSS
  aceita ser empurrado pelo conteúdo.

E a altura pulava a cada troca de tela — de 28px a 459px conforme o desenho. A
caixa agora tem **altura fixa de 200px**, e o que passar disso **rola dentro
dela**. Trocar de rotina na combo não mexe no tamanho de nada.

A escala sai **só da largura**, nunca amplia. Entrar a altura na conta parece
tentador — caberia tudo sem rolagem — mas espreme a tela alta até o texto virar
borrão, e a miniatura existe justamente para reconhecer a tela de olho. Melhor
manter o tamanho e arrastar.

Medido nas 112 telas do acervo, com a caixa na largura que ela tem no navegador:

```
largura do conteúdo:  min 439  média 542  max 544   (limite 544)
altura  do conteúdo:  min  28  média 205  max 459   (a caixa mostra 186)
estouros de largura:  0
```

Metade das telas cabe inteira; a outra metade rola. A caixa, em todas, tem os
mesmos 200px.

O desenho também passou a ser recortado a partir do primeiro componente: telas
desenhadas longe do canto superior esquerdo desperdiçavam uma faixa vazia do
tamanho da margem.

## Botão que abre outra rotina

No desenho o `WDNRWORK002` (Cadastro de Workflow) tem um **Novo** que abre o
`WDNRWORK002A`. O gerador sempre soube fazer isso — é o botão com *"Ao clicar:
abrir outra tela"* — mas o importador não tinha como adivinhar o destino.

Abaixo do quadro de campos aparece agora **Ao clicar, abrir**, uma linha por
botão detectado, com a lista das outras telas do projeto carregado:

```
Novo        [ WDNRWORK002A — Workflow ▾ ]   do Show^WDNRWORK002A
Detalhar    [ — label na própria rotina — ]  label 6100
```

Escolhido um destino, o botão sai como `actionType: "screen"` com
`generateRoutine: false` — ou seja, aponta para a rotina que já existe em vez de
mandar o gerador criar uma tela auxiliar. O `.mac` sai assim:

```objectscript
6000	;
	do Show^WDNRWORK002A("6000EX^WDNRWORK002","()")
	quit:$$CSP^%CSW1UTI()
	;
6000EX	goto 2999
	; csw:botao:6,3,btNOVO,Novo,,6000^WDNRWORK002,,,8
```

A escolha fica guardada por tela e por botão, então trocar de tela na combo e
voltar não perde nada.

**Sugestão automática.** Botão cujo texto começa com Novo, Incluir, Inserir,
Adicionar, Editar, Manutenção, Detalhar ou Abrir já vem apontando para a rotina
que continua o nome da tela atual — `WDNRWORK002` → `WDNRWORK002A`. Quando há
empate no nome mais curto a sugestão não é feita, para não chutar. Ela aparece
selecionada na combo, dá para trocar ou zerar.

### Correção junto: "Novo" sozinho sumia da tela

Com grid na tela, os botões cujo texto casa com Incluir/Manutenção/Excluir são a
manutenção em linha do grid (`btnManut`) e por isso saem da barra. Só que o corte
acontecia **mesmo quando a manutenção em linha não era ligada** — ela exige dois
ou mais desses botões juntos.

Resultado: um **Novo** sozinho ao lado do grid não virava `btnManut` nem botão
comum. Sumia. Era o caso do `WDNRWORK002` do print, do `WDNRWORK100`, do
`WDNRWORK110` e dos três `WDEXEMPLO` do Linshalm — seis telas do acervo.

Agora o corte só vale quando a manutenção em linha existe de fato. `Consultar` e
`Limpar` continuam saindo da barra porque viram o `csw:btnConsultar`, que desenha
os dois.

## Escrevendo o JSON à mão

Nem sempre se tem o builder aberto. O botão **Carregar exemplo** traz uma tela completa —
campo de empresa, campo com F7, grid e a trinca de manutenção — que serve de molde:

```json
[
  {
    "id": "WDCCMOT010",
    "name": "Cadastro de Motivo",
    "index": 0,
    "components": [
      { "id": "Label",   "text": "Empresa", "x": 60, "y": 20, "width": "100px", "height": "24px", "index": 0 },
      { "id": "Csle",    "text": "1", "x": 170, "y": 20, "width": "60px", "height": "24px", "f7": "F7", "index": 1 },
      { "id": "Display", "text": "1 - Empresa Natreb", "x": 240, "y": 20, "width": "300px", "height": "24px", "index": 2 },

      { "id": "Grid", "x": 60, "y": 120, "width": "800px", "height": "200px", "index": 8,
        "gridData": {
          "columns": [
            { "title": "Setor",      "field": "codSetor",  "dataType": "n" },
            { "title": "Descrição",  "field": "descSetor", "dataType": "a" },
            { "title": "Vigência",   "field": "vigencia",  "dataType": "d" }
          ],
          "data": [
            { "codSetor": "15", "descSetor": "Comercial", "vigencia": "01/01/2026" }
          ]
        }
      },

      { "id": "Button", "text": "Incluir",    "x": 60,  "y": 350, "width": "160px", "height": "24px", "icon": "fa-save",  "index": 9 },
      { "id": "Button", "text": "Manutenção", "x": 240, "y": 350, "width": "160px", "height": "24px", "index": 10 },
      { "id": "Button", "text": "Excluir",    "x": 420, "y": 350, "width": "160px", "height": "24px", "icon": "fa-trash", "index": 11 }
    ]
  }
]
```

### A tela

| chave | o que é |
|---|---|
| `id` | nome da rotina — vira o `.mac` e a `RG` |
| `name` | título da tela |
| `components` | a lista, na ordem em que foram desenhados |

Um arquivo é um **array de telas**. Colar uma tela sozinha ou um recorte sem os colchetes
também funciona.

### Os componentes

| `id` | vira | o que importa |
|---|---|---|
| `Label` | rótulo | o `text` nomeia o campo do leitor à direita |
| `Csle` | leitor | `f7` preenchido liga a consulta; `text` é a amostra que define tipo e tamanho |
| `Display` | descrição ao lado | fica à direita do leitor |
| `ComboBox` | combo | `text` com barras (`Ativo/Inativo`) vira a tabela de opções |
| `RadioButton` | radio | `options: [{label, value}]` |
| `TextArea` | área de texto | a `height` define quantas linhas ocupa |
| `Grid` | grid | `gridData.columns` e `gridData.data` |
| `Button` | botão | `text` classifica; `icon` ajuda (`fa-save`, `fa-trash`, `fa-search`) |
| `Tabs` | abas | `tabs: [{ name, routine }]` apontando outras telas do array |

**Posição e tamanho em pixel.** `x`/`y` são números; `width`/`height` aceitam número ou
`"200px"`. A conversão para a grade de 108 colunas é feita pela proporção do desenho — não
precisa acertar coluna nenhuma, só manter as coisas alinhadas como ficariam na tela.

**A regra do alinhamento:** label, leitor e display do mesmo campo ficam **na mesma linha**
(mesmo `y`), a label à esquerda do leitor e o display à direita. É assim que o importador
sabe que os três são o mesmo campo.

### Detalhes que mudam o resultado

- **`dataType` da coluna**: `n` número, `a` texto, `d` data. Define alinhamento e largura.
- **Coluna chamada "Ações"** vira coluna de marcação; o menu por linha fica como TODO.
- **Incluir + Manutenção + Excluir juntos** viram o `btnManut` do grid (edição em linha).
  Um **"Novo" sozinho** ao lado do grid é botão comum — e é aí que entra a escolha de rotina
  de destino descrita acima.
- **Consultar e Limpar** viram o `csw:btnConsultar`, que já desenha os dois.
- **Confirmar + Cancelar** viram o `btnManter` do cadastro — mas só quando **não** há grid na
  tela principal; com grid a rotina sai no modo Grid e eles ficam botões comuns (com aviso).
