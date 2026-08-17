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
