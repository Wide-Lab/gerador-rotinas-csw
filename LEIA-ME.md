# Gerador de rotinas JSON padrão — o que foi feito

O projeto virou um repositório git. O estado que existia antes está intacto na branch
`main`; cada ideia foi para uma branch separada para você testar uma de cada vez.

```
git branch                 # ver as branches
git checkout <branch>      # trocar
git checkout main          # voltar ao original
```

Abra o `gerador-json-ui-ajustada.html` normalmente (de preferência pelo Live Server,
`http://localhost:5501`, que é o que faz o OCR da branch 4 funcionar).

## As branches

| branch | o que faz | leia |
|---|---|---|
| `main` | estado original, sem mexer | — |
| `feat/1-validador-cache` | validador de regras Caché/CSW rodando junto com o gerador + correção real do limite de 31 caracteres nas globais da rotina 299 | [LEIA-ME-VALIDADOR.md](LEIA-ME-VALIDADOR.md) |
| `feat/2-f7-inteligente` | busca dentro do catálogo de F7, sugestão de consulta por campo e aplicação em lote | [LEIA-ME-F7-INTELIGENTE.md](LEIA-ME-F7-INTELIGENTE.md) |
| `feat/3-documento-para-json` | cola a especificação (Word, Excel, PDF, markdown, CSV, lista à mão) e sai o projeto inteiro | [LEIA-ME-DOCUMENTO-PARA-JSON.md](LEIA-ME-DOCUMENTO-PARA-JSON.md) |
| `feat/4-imagem-para-json` | print da tela vira campos, grid, abas e botões, com OCR rodando dentro do navegador (inclui a branch 3) | [LEIA-ME-IMAGEM-PARA-JSON.md](LEIA-ME-IMAGEM-PARA-JSON.md) |
| `feat/6-desenhador-para-cache` | JSON do desenhador React vira rotina Caché (inclui as branches 3 e 4) | [LEIA-ME-DESENHADOR-PARA-CACHE.md](LEIA-ME-DESENHADOR-PARA-CACHE.md) |
| `feat/5-tudo-junto` | todas juntas | todos os arquivos acima |

Nenhuma delas usa serviço pago, API ou IA remota. Tudo roda local no navegador.

## Como cada branch mexeu no código

Cada funcionalidade é um módulo novo em `modulos-padrao-json/`, que se instala sozinho
(injeta o próprio CSS e os próprios botões). Do código que já existia, só duas coisas
mudaram:

- uma linha de `<script>` no HTML por módulo;
- `gpj-f7-generator.js`, na branch 1, para corrigir o nome das globais `mtemp` da
  rotina 299 que estourava o limite de 31 caracteres do Caché.

Ou seja: dá para descartar qualquer ideia sem sobra de código no meio do gerador.

## O bug que já estava lá

Na geração da rotina 299 de multi-seleção, as globais de trabalho eram montadas assim:

```
^mtemp + <ROTINA><LABEL> (até 22 caracteres) + NAOSEL
```

que dá até 33 caracteres. O Caché aceita 31 no nome da global, então a rotina não
compilava quando o nome da rotina e o label eram um pouco maiores. Exemplo real:

```
antes:  ^mtempWDOMPVCONFIGURACAO299SELECNAOSEL   (37 caracteres, não compila)
depois: ^mtempWDOMPVCONFIGURACAO60NAOSEL         (31 caracteres)
```

Corrigido na branch 1 (e presente nas branches 5). Os dois últimos caracteres viram um
hash do nome completo, para duas consultas diferentes na mesma rotina não colidirem
depois do corte.

## Como isso foi testado

Não deu para testar só olhando: montei um ambiente de teste que carrega o HTML de
verdade e executa o gerador.

- **jsdom** (`node`) para o gerador inteiro: carrega os módulos na ordem do HTML, roda
  `app.refresh()`, gera as rotinas de interface, as RGs e as 299, e confere que nada
  estoura. Também exercita o validador, o assistente de F7 (busca, chips e lote) e o
  importador de especificação nos três formatos.
- **Chrome headless** (puppeteer) para a parte que precisa de canvas e worker: desenha um
  print sintético de um terminal 108x28, joga no importador por imagem, roda o OCR real e
  confere a grade estimada, os campos detectados e a rotina gerada no fim.

Resultados relevantes estão anotados em cada LEIA-ME.
