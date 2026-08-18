# Gerar campos por imagem (print da tela → JSON)

Branch: `feat/4-imagem-para-json` — **inclui também a branch 3** (Gerar por documento),
porque o importador de imagem reaproveita a inferência de tipo, variável e F7 dela.

Botão **Gerar por imagem** no cabeçalho.

## Como funciona

1. Cole (Ctrl+V), arraste ou escolha um print da tela — a antiga que vai ser reescrita,
   um protótipo, uma foto do documento.
2. **Ler com OCR**: o texto é lido dentro do navegador, com o motor e o idioma
   português embarcados em `modulos-padrao-json/vendor/tesseract` (8,7 MB). Sem
   internet, sem API, sem custo.
3. A ferramenta estima a **grade de caracteres** da tela e desenha por cima da imagem,
   e propõe uma lista de campos com linha, coluna, tamanho, tipo e F7.
4. Você confere na tabela ao lado (dá para editar tudo e desmarcar o que não é campo),
   e clica em **Gerar projeto novo** ou **Adicionar ao projeto atual**.

## Calibração da grade

O ponto crítico é converter pixel em linha/coluna. A estimativa usa duas medidas:

- **largura do caractere**: em tela de terminal cada palavra começa numa coluna inteira,
  então a distância entre o início de duas palavras vizinhas dividida pelos caracteres
  entre elas dá o passo exato da grade (bem mais estável do que medir o desenho da letra);
- **altura da linha**: o menor espaçamento vertical que se repete — campos colados um
  embaixo do outro. Um espaçamento que aparece uma vez só costuma ser pulo de linha.

Os dois valores ficam em campos editáveis ao lado (`Colunas` / `Linhas`) e a grade é
redesenhada na hora, então dá para acertar no olho em dois segundos se a estimativa
errar. O botão **Calibrar pelo texto** refaz a estimativa.

## Traçado manual

Funciona com ou sem OCR e é o caminho exato:

1. arraste o mouse sobre o **texto do label** — a descrição vem do OCR se houver;
2. arraste sobre a **área do leitor**;
3. o campo entra na lista com linha, coluna e tamanho tirados da grade.

Repita para os próximos campos. Se o OCR não estiver disponível (por exemplo abrindo o
HTML direto por `file://`, onde o Chrome bloqueia worker), o traçado manual continua
funcionando normalmente — a ferramenta avisa e segue.

> Abrir pelo Live Server (`http://localhost:5501`) é o modo recomendado; é o que faz o
> OCR funcionar.

## Teste feito

Print sintético de 1080x448 px simulando um terminal de 108x28 (célula de 10x16 px),
processado em Chrome headless de verdade:

- OCR leu as 20 palavras corretamente;
- calibração estimada: **108 colunas x 28 linhas** (exato);
- campos detectados nas linhas 3, 4, 5, 6, 8 e 9, coluna 2 — todas exatas;
- `Código da Empresa` e `Código do Cliente` já saíram com preset de F7 e display ligado,
  `Data do Cadastro` como `date`, `Percentual de Desconto` como `decimal`,
  `Situação` como `combo`;
- ao gerar, saiu a rotina `WDOMPV160` compilável com os seis campos posicionados.

## Arquivos embarcados

```
modulos-padrao-json/vendor/tesseract/
  tesseract.min.js                 motor (66 KB)
  worker.min.js                    worker (124 KB)
  tesseract-core-simd-lstm.wasm.js núcleo com SIMD (3,9 MB)
  tesseract-core-lstm.wasm.js      núcleo sem SIMD (3,9 MB)
  por.traineddata.gz               idioma português (1 MB)
```

Nada é baixado em tempo de execução.

---

## Atualização — a tela não é só campo

O primeiro corte lia tudo como "label + leitor", então uma tela cheia de tabela virava
dezenas de campos picados (`8 Ver.`, `ES re`, `Toses`…). Agora o importador separa as
**regiões** da tela antes de montar qualquer campo:

**Grid** — procura o maior bloco de linhas alinhadas em coluna. O cabeçalho vira o título
das colunas (montado palavra a palavra, para não grudar dois títulos vizinhos) e as
linhas de baixo dão o tipo de cada coluna: `11/01/2025` → data, `999999` → número,
`1.234,50` → decimal, resto → texto. Colunas chamadas *Check*/*Sel* viram coluna de
marcação; *Ações*/*Editar* entram como somente exibição.

**Abas** — a tira logo acima do cabeçalho da tabela, quando são textos curtos sem `:`.
Se o OCR juntar ou dividir errado, dá para corrigir os títulos direto num campo de texto
(separados por ` | `).

**Botões** — achados pela cor do fundo: o módulo lê os pixels em volta do texto e, quando
o fundo é bem mais escuro que a página, trata como botão. A partir daí ele cresce o
retângulo escuro para achar a coluna e a largura reais (o texto costuma estar centralizado
dentro do botão). Um botão chamado *Manutenção* vira o btnManter da rotina; os outros
viram botões personalizados. Sem leitura de pixel (ex.: navegador antigo), vale a
posição: texto curto abaixo da tabela.

**Campos** — o texto ao lado do label agora é entendido como o **conteúdo do leitor**, e o
texto seguinte como o **display**. Antes cada um desses virava um campo solto. O valor
também define o tipo: `22` → inteiro, `11/01/2025` → data, `1.234,50` → decimal.

O que a tela gera:

- com abas + grid, o grid vai para dentro da primeira aba (`contentType: grid`), que é
  como a tela do ERP se organiza, e sai também a RG do grid;
- sem abas, o grid fica na rotina principal e o modo da rotina vira *Consulta com Grid*.

### Traçado manual por tipo

O seletor **Marcar como** define o que o próximo arrasto do mouse cria:

| modo | o que faz |
|---|---|
| Campo (label + leitor) | dois arrastos: primeiro o label, depois a área do leitor |
| Grid | marca a área da tabela; as colunas saem do texto de dentro |
| Aba | marca o texto de cada aba |
| Botão | marca cada botão |

### Teste feito

Print sintético do estilo *Monitor de Regra Comercial* (1512x560, célula 14x20, campo no
topo, cinco abas, tabela de 8 colunas com 6 linhas e dois botões escuros), em Chrome
headless de verdade:

- calibração estimada: **108 colunas x 28 linhas** (exato);
- **grid** na linha 7, altura 7, com as 8 colunas separadas e tipadas —
  `Acoes`, `Editar`, `Seq Calculo(n)`, `Codigo Regra(n)`, `Descricao(a)`, `Situacao(a)`,
  `Tipo(a)`, `Data Inicio(d)`;
- **abas**: `Regra Gerais | Regra Excecao | Geral | Catalogo | Tipo de Nota`;
- **botões**: `Novo` e `Definir Dados`, ambos na linha 18;
- **campos**: só o `Empresa` do topo — tipado como inteiro pelo valor `22` que estava na
  tela, com display para a razão social ao lado;
- projeto gerado com `WDOMPV200` + 5 abas + `WDOMPV200TAB1RG` (a RG do grid).

A tela de formulário simples do teste anterior continua saindo igual — nenhum grid falso.

---

## Segunda rodada — testado em print de verdade do ERP

A primeira versão foi calibrada em imagem sintética e errou feio em print real:
lia a primeira linha de dados como cabeçalho do grid, pegava a linha de checkboxes
como se fosse a tira de abas, transformava o título da janela em campo e não achava
nenhum dos botões. O que mudou:

**Cabeçalho do grid.** O bloco de linhas alinhadas encontra o corpo da tabela, mas o
cabeçalho fica de fora porque tem ícone de filtro e de ordenação picado no meio do texto.
Agora ele é procurado até três linhas acima (o OCR costuma soltar um fragmento solto entre
o cabeçalho e a primeira linha) e é promovido quando cobre quase uma coluna por título.
As colunas que só existem no cabeçalho — sem dado embaixo — também entram, senão dois
títulos vizinhos caíam na mesma coluna (`Seg. Cálculo Código Regra`).

**Tira de abas.** Antes era "a linha logo acima da tabela", que numa tela com filtros é a
linha dos checkboxes. Agora é a primeira faixa do topo com dois ou mais títulos curtos,
descartando linhas que tenham caixa de marcação desenhada à esquerda do texto — isso é
verificado lendo os pixels ao lado da palavra.

**Botões.** O tesseract não lê texto claro sobre fundo escuro, e é assim que os botões do
ERP são desenhados: eles simplesmente sumiam. Agora as faixas escuras da tela são achadas
por varredura de pixel (blocos + preenchimento por conexão), cada uma é recortada,
invertida, ampliada 4x e lida em modo "linha única". Quando o texto ainda sai ilegível,
o botão entra como `Botão 1`, `Botão 2` — a posição e a quantidade estão certas e o nome
é editável na tela.

**Cabeçalho da janela.** Título e caminho (que repete o título) são descartados; um filtro
global acima das abas, como o campo `Empresa`, continua virando campo.

**Leitura.** Print de tela cheia vem com fonte de 11px; a imagem é ampliada 2x antes do
OCR (as coordenadas voltam divididas). Isso sozinho já resolveu boa parte do texto picado.

**Calibração.** Acima de 160 colunas estimadas é print web com fonte pequena — cai para as
108 colunas da janela CSW e as posições continuam proporcionais. A altura da linha nunca
fica menor que a altura do próprio texto.

**Campos.** O valor ao lado do label vira o conteúdo do leitor e o texto seguinte vira o
display; uma linha de caixas de marcação vira campos `checkbox`; texto sobre faixa escura
acima da tabela é rótulo de seção e não vira campo; abaixo da tabela só existe botão.

### Resultado nos dois prints reais

`Liberação de Usuário para o Camanuf` (1841x694):

```
2 abas: Liberação Acesso Usuário [grid, 8 colunas] · Autorização de Acesso Usuário
grid: Linha(n) · Descrição · Situação · E-mail · Convite Enviado · Data Envio(d) · Status · Último Acesso(d)
campos: Inativo (checkbox) · Ativo (checkbox)
botões: 3, nas colunas 2, 28 e 53 da linha 30
gera: WDOMLIB010 + WDOMLIB010TAB1 + WDOMLIB010TAB2 + WDOMLIB010RG + WDOMLIB010TAB1RG
```

`Monitor de Regra Comercial` (1848x900):

```
5 abas: Regra Gerais · Regra Exceção · Geral · Catálogo · Tipo de Nota
grid com 9 colunas: Ações · Editar · Seq. Cálculo(n) · Código Regra · Descrição · Situação
                    · Tipo · Data Início(d) · Data Fim
campo: Empresa, com display para a razão social
botões: 2, nas colunas 2 e 15
```

O que continua manual: o nome dos botões quando o OCR não consegue ler, a chave da global
e a tabela de opções dos checkboxes — o validador aponta os três.

---

## Terceira rodada — grid vazio e print do navegador inteiro

A tela `Configurar Ágio de Material no Período` trouxe dois casos que ainda quebravam:
a tabela estava **vazia** (só o cabeçalho, `0 registro(s)`) e o print era do **navegador
inteiro**, com barra de endereço, favoritos e o menu lateral do ERP.

**Tabela pelas bordas desenhadas.** Sem linha de dados não há o que alinhar, então o
módulo passou a ler as linhas horizontais e verticais desenhadas na imagem. Duas
horizontais próximas formam a faixa do cabeçalho e a última fecha a área de dados; os
separadores verticais dentro do cabeçalho dão o limite de cada coluna. Na tela do Ágio
isso devolve exatamente as sete colunas, e o tipo vem do nome quando não há valor para
olhar: `Data Início`/`Data Fim` → data, `Perc. Ágio(%)` → decimal.

Esse caminho é o **plano B**: o alinhamento de texto continua sendo o primeiro, porque
numa tabela com dados ele acerta mais (a tabela do ERP desenha borda em cada linha, e
as bordas sozinhas confundiriam a primeira linha de dados com o cabeçalho).

**Área útil.** Quando existe uma barra lateral escura — sinal de print do navegador — a
imagem é recortada: fora a barra lateral e tudo acima da divisória que atravessa a tela
inteira. Sem barra lateral nada é recortado, senão os filtros do topo (o campo `Empresa`)
sumiriam.

**Botões fora da tabela.** Antes só valia o que estava abaixo do grid; os botões de ação
que ficam ao lado dos filtros (`Consultar`, `Limpar`, `Cadastro de Parâmetro`) eram
ignorados. Agora vale qualquer faixa escura fora da área da tabela, com pelo menos 8
caracteres de largura — isso descarta rótulo de seção com fundo escuro, que é curto.
E um botão na mesma linha de um campo não apaga mais o campo.

### Resultado nas três telas reais

| tela | grid | abas | botões | campos |
|---|---|---|---|---|
| Configurar Ágio (vazia, print do navegador) | 7 colunas, tipos certos | — | 5 | Empresa, Item, filtro de vigência |
| Liberação de Usuário (Camanuf) | 8 colunas | 2, corretas | 3 | Inativo, Ativo (checkbox) |
| Monitor de Regra Comercial | 9 colunas | 5, corretas | 3 | Empresa com display |

A tela do Ágio gera `WDOMAGI010` em modo *Consulta com Grid*, com o fluxo
`Limpar^%CSW1GRID` → `GerarGrid^WDOMAGI010RG` → `Movimentar^%CSW1GRID`, e passa no
validador sem nenhum apontamento.

---

## Quarta rodada — radios e o título da janela

**Radio agora é um campo só, com as opções.** O módulo mede a marca desenhada à esquerda
de cada texto e classifica pela forma: no quadrado a borda passa pelos cantos da caixa
envolvente, no círculo os cantos ficam vazios. Quadrado → `checkbox` (um campo por
opção); redondo → um único campo `radio` com a tabela de opções montada.

Dois detalhes que faziam a leitura falhar:

- o contorno do radio é um traço **claro** (~200 de luminância num fundo 255); comparar
  por fração do fundo deixava ele passar batido — agora a comparação é por diferença;
- a busca da marca parava dentro da palavra anterior da linha, e a letra entrava na caixa
  do marcador estragando a forma; agora ela respeita o fim da palavra anterior.

Resultado na tela do Ágio: um campo `radio` com **Vigente / Não Vigente / Todos**. Na tela
do Camanuf continuam saindo dois `checkbox` (Inativo e Ativo), que é o desenho correto de lá.

**Título da janela não vira mais campo.** Depender de "as duas primeiras linhas" falhava
porque o OCR quebra o título em três ou quatro pedaços. Agora o cabeçalho da janela
termina na **régua horizontal desenhada** logo abaixo do caminho (`y=87` na tela do Ágio,
`y=160` na versão com navegador). Acima dela só sobrevive label com valor **colado** ao
lado — assim o filtro `Empresa 22` continua virando campo e o título, que tem a versão do
ERP na outra ponta da linha, não.

**Confiança do OCR.** Cada campo carrega a confiança média da leitura; abaixo de 70 ele
entra na lista **desmarcado**. O lixo de OCR aparece para conferência, mas não vai para o
projeto sem alguém olhar.

---

## Quinta rodada — conferido contra a rotina de verdade

A rotina `WDOMCPG258` existe no projeto, então dessa vez deu para comparar o resultado com
o gabarito em vez de só olhar a tela.

**Coluna que sumia.** A borda esquerda da tabela encosta na margem e não aparece como
régua vertical, então a primeira coluna do cabeçalho ficava fora de todas as faixas —
era por isso que `Material` desaparecia e `Histórico` virava `Coluna 7`. Agora, quando o
primeiro título começa antes da primeira régua, um limite extra é criado à esquerda.

**Origem da grade.** A linha 1 da rotina passou a ser a primeira linha útil do print, não
o topo da imagem, e a coluna 1 é o começo do conteúdo (sem o menu lateral). Antes o
cabeçalho do ERP virava dez linhas em branco no começo da tela gerada.

**Largura da coluna** deixou de perder um caractere, e `percentual`/`ágio` passou a ser
`v2` (duas casas) em vez de `v3`.

### Comparação com `WDOMCPG258.mac`

| item | rotina real | gerado |
|---|---|---|
| Empresa | linha 1, coluna 12 | linha 1, coluna 15 |
| Vigência (radio) | linha 2, coluna 78, `,3,.TABVIG` | linha 3, coluna 78, `,3,.TABOPC` |
| Grid | LinPos 3 | linha 4 |
| Material | `Tipo=a  Csw=10` | `a, 10` |
| Descrição | `Tipo=a  Csw=20` | `a, 20` |
| Data Início | `Tipo=d  Csw=10` | `d, 10` |
| Data Fim | `Tipo=d  Csw=10` | `d, 10` |
| Perc. Ágio(%) | `Tipo=v2 Csw=8` | `v2, 8` |
| Utilizado | `Tipo=a  Csw=6` | `a, 6` |
| Histórico | `Tipo=a  Csw=30` | `a, 29` |

As sete colunas do grid saem com título, tipo e largura praticamente iguais aos da rotina
escrita à mão. O que sobra é uma linha de diferença na vertical (o print tem espaçamento
maior entre os campos do que a grade fixa do CSW) e o nome do grupo de radio, que fica
como `Opção` quando não há um label ao lado.

---

## Sexta rodada — posição do Consultar e botões atrás do grid

**Botão Consultar/Limpar.** A tag saía sempre em `csw:btnConsultar:50,1`, ou seja, no meio
da tela, colado nos campos de filtro. Na tela do ERP ele fica no canto direito — o padrão
passou a ser a coluna 86 (numa janela de 108), tanto no importador quanto no card de Grid.

**Botão escondido atrás do grid.** O grid ocupa a faixa dele inteira, incluindo o rodapé
de navegação, então um botão posicionado dentro dessa faixa some da tela. Agora todo botão
(e o btnManter) é empurrado para pelo menos duas linhas depois do fim do grid, e a altura
da janela cresce junto para caber a barra de botões.

No JSON de `WDWDNEW015`: grid nas linhas 4 a 21, botões que caíam na 22 (em cima do rodapé
do grid) passam para a 23, e a janela vai de 24 para 25 linhas. O validador fica limpo.
