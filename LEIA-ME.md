# Gerador de rotinas JSON padrão — o que foi feito

O projeto virou um repositório git. O estado que existia antes está intacto na branch
`main`; cada ideia foi para uma branch separada para você testar uma de cada vez.

```
git branch                 # ver as branches
git checkout <branch>      # trocar
git checkout main          # voltar ao original
```

Abra o `gerador-json-ui-ajustada.html` normalmente. Direto do disco funciona; pelo Live
Server (`http://localhost:5501`) também, e é o mais confortável quando se está mexendo nos
módulos.

## As branches

| branch | o que faz | leia |
|---|---|---|
| `main` | estado original, sem mexer | — |
| `feat/1-validador-cache` | validador de regras Caché/CSW rodando junto com o gerador + correção real do limite de 31 caracteres nas globais da rotina 299 | [LEIA-ME-VALIDADOR.md](LEIA-ME-VALIDADOR.md) |
| `feat/2-f7-inteligente` | busca dentro do catálogo de F7, sugestão de consulta por campo e aplicação em lote | [LEIA-ME-F7-INTELIGENTE.md](LEIA-ME-F7-INTELIGENTE.md) |
| `feat/3-documento-para-json` | cola a especificação (Word, Excel, PDF, markdown, CSV, lista à mão) e sai o projeto inteiro | [LEIA-ME-DOCUMENTO-PARA-JSON.md](LEIA-ME-DOCUMENTO-PARA-JSON.md) |
| `feat/4-imagem-para-json` | print da tela vira campos por OCR — **retirado do produto** (ver abaixo) | — |
| `feat/6-desenhador-para-cache` | tela do desenhador (builder) vira rotina Caché, puxando o projeto pela API | [LEIA-ME-DESENHADOR-PARA-CACHE.md](LEIA-ME-DESENHADOR-PARA-CACHE.md) |
| — | **Documentar global**: classe COS `%Persistent` da global do projeto, porte do Mapeamento de Global do consistem-tools | [LEIA-ME-DOCUMENTACAO-DE-GLOBAL.md](LEIA-ME-DOCUMENTACAO-DE-GLOBAL.md) |
| `feat/5-tudo-junto` | todas juntas — **é a recomendada para usar** | todos os arquivos acima |

> O **Gerar por imagem** saiu do produto: o OCR acertava pouco, e o mesmo desenho vem exato
> pela API do builder, sem adivinhação. O módulo e o LEIA-ME continuam no histórico do git
> se um dia fizerem falta.
>
> As branches 1, 2 e 3 continuam isoladas se você quiser avaliar uma ideia por vez.

Nada aqui usa IA remota nem serviço pago. A única chamada de rede é a busca do projeto no
builder da Widelab, e ela é opcional — dá para continuar colando o JSON à mão.

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

- **jsdom** (`node`) para o gerador inteiro: carrega o HTML de verdade e os módulos na ordem
  em que ele os declara, roda `app.refresh()`, gera as rotinas de interface, as RGs e as 299,
  e confere que nada estoura. Também exercita o validador, o assistente de F7 (busca, chips e
  lote), o importador de especificação nos três formatos e o do desenhador.
- **Acervo real do builder**: os 24 projetos publicados em `builder.widelab.com.br` — 106
  telas com componentes — passam pelo conversor a cada mudança. Hoje: 106 convertidas, 0
  exceções.
- **Invariantes de interface**: o `.mac` gerado é conferido contra
  `resources/interface/invariantes.md` do plugin `csw` — trava de execução, faixa das labels,
  resolução 108x28, saída, chamada de regra.

Resultados relevantes estão anotados em cada LEIA-ME.

## Limpar a tela

**Limpar tela**, no cabeçalho ao lado de *Restaurar padrão*, zera tudo: campos, abas, grid,
botões, chaves, nome da rotina, global e RG. Sobram só os valores que não fazem sentido em
branco — janela 108x28, espera do Lock em 3 segundos, `Gerar e integrar rotina RG` marcado.

São dois botões porque são duas intenções: *Restaurar padrão* traz o exemplo de volta,
*Limpar tela* deixa a folha em branco para começar do zero.

## O que abre junto com o gerador

O projeto que carrega ao abrir (e que o botão **Restaurar padrão** traz de volta) é o menor
exemplo que ainda mostra o que todo mundo usa:

```
WDCCMOT010 — Motivos de Parada   (modo Grid, 108 x 28)

  Código da Empresa   [1] [Empresa Natreb..................]   ← campo com consulta (F7)
  Código do Motivo    [142]                                    ← campo chave

  ┌ Setor │ Descrição do Setor │ Tempo Meta │ Vigência ┐       ← grid, 1ª coluna é a chave
```

Dois campos, quatro colunas, nenhuma aba, nenhum botão personalizado. Antes vinha um cadastro
de configuração com quatro abas e oito campos, e quem chegava tinha que apagar tudo antes de
começar a própria tela.

Sai limpo no validador: 158 linhas de `.mac` e 94 de RG.

> **Grid na tela principal exige modo Grid.** É por isso que o padrão está em *Consulta com
> grid* e não em *Cadastro*: no modo Grid o label `3000` é o foco do grid, não a gravação.
> Cadastro que precisa de grid junto põe o grid numa aba.

## Gerar rotinas pelo Claude Code

O `cli/` roda o gerador sem navegador (ver [cli/LEIA-ME-CLI.md](cli/LEIA-ME-CLI.md)). A
skill que ensina o Claude Code a usar o gerador está no plugin `gerador-rotinas-csw`;
a instalação está no [README](README.md). Antes de mudar o gerador, rode `npm run teste`
em `cli/`.
