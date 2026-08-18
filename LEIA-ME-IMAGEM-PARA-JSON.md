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
