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
