# Gerar projeto por documento

Branch: `feat/3-documento-para-json`

Novo módulo `modulos-padrao-json/gpj-spec-import.js`. Botão **Gerar por documento** no
cabeçalho, ao lado de *Colar JSON*.

Cole (ou arraste um `.txt`, `.md`, `.csv`, `.tsv`) a especificação e a ferramenta monta o
projeto inteiro: rotina, abas, campos, tipos, tamanhos, chaves, obrigatoriedade, layout e
sugestão de F7. A tela mostra a prévia do que foi reconhecido antes de aplicar, e existe
um **Copiar JSON** caso você prefira revisar o JSON antes.

Tudo local, sem IA e sem nenhuma chamada externa.

## Formatos aceitos

**1. Tabela (markdown, Excel colado, CSV, TSV, separado por `;` ou `|`)**

```
Campo | Tipo | Tamanho | Obrigatório | Chave
Código da Empresa | Inteiro | 4 | Sim | Sim
Nome do Contrato | Texto | 60 | Sim |
Valor Total | Decimal | 14 | Sim |
```

Cabeçalhos reconhecidos: campo, descrição, nome, variável, tipo, tamanho, obrigatório,
chave, aba, página, F7/consulta, observação. A ordem das colunas não importa.
Uma linha de dados que por acaso contenha "chave" e "obrigatório" **não** é confundida
com cabeçalho.

**2. Lista escrita à mão**

```
Código da Empresa (inteiro, 4) chave
- Descrição (texto, 45) obrigatório
- Percentual de Comissão (decimal, 8)
Data de Vigência: data
Observação Geral (textarea, 200)
```

**3. Metadados da rotina** (em qualquer lugar do texto)

```
Rotina: WDOMPV130
Título: Cadastro de Parâmetros de Pedido
Global: WDOMPVPAR
RG: WDOMPV130RG
Variável: WDOMCFG
Tipo de rotina: cadastro | consulta
Largura: 108
Altura: 28
```

**4. Abas e grids**

```
# Dados Gerais          -> aba de campos
## Parâmetros           -> aba de campos
Aba: Tipos de Nota      -> aba de campos
[Clientes]              -> aba de campos
# Aba Grid: Produtos    -> aba do tipo Grid (as linhas viram colunas do grid)
```

Campos marcados como chave vão para a rotina principal automaticamente, mesmo escritos
dentro de um bloco de aba.

## O que é inferido

| entrada | resultado |
|---|---|
| "inteiro", "numérico", "código", "quantidade" | `integer` |
| "texto", "alfanumérico", "nome", "descrição" | `string` |
| "data" | `date` |
| "mês/ano", "competência" | `monthYear` |
| "decimal", "valor", "preço", "percentual", "alíquota" | `decimal` (v2) |
| "float", "real" | `float` (v3) |
| "combo", "lista", "seleção", "situação" | `combo` |
| "checkbox", "sim/não", "flag" | `checkbox` |
| "textarea", "memo", "texto longo" | `textArea` (o número vira o total de caracteres, não a largura) |
| "multi-seleção" | `multiSelect` |

- **Variável**: montada com as abreviações do padrão CSW — *Código da Empresa* → `CODEMP`,
  *Percentual de Desconto* → `PERCDSC`, *Data de Vigência* → `DATVIG`. Repetições ganham
  sufixo numérico automático.
- **Layout**: uma linha por campo dentro de cada local, com o tamanho do label calculado
  pelo maior texto da aba e o leitor logo em seguida.
- **F7**: quando a descrição casa com um preset completo (empresa, cliente, produto,
  moeda, transportadora, representante, condição de venda, tabela de preço, tipo de nota),
  o preset já vem aplicado com display ligado. Se a branch do assistente de F7 estiver
  junta, o catálogo inteiro é usado no lugar dessa lista curta.
- **Índices da global**: gerados a partir dos campos marcados como chave, com o nome do
  parâmetro no padrão `codEmpresa`, `codParametro`.

## Exemplo verificado

A entrada do botão *Carregar exemplo* produz, ao aplicar:

- rotina `WDOMPV130` / global `^WDOMPVPAR` / RG `WDOMPV130RG`;
- abas `Dados Gerais` e `Observações` (com `WDOMPV130TAB1` e `WDOMPV130TAB2`);
- campos `CODEMP`, `CODPAR` (chaves, na principal), `DESC`, `SIT`, `CODCLI` (com F7 de
  cliente), `DATCAD`, `PERCDSC`, `OBSGER`;
- índices `codEmpresa` e `codParametro`.

## O formato, campo a campo

O botão **Carregar exemplo** traz este texto, que exercita tudo que o leitor entende:

```
Rotina: WDCCMOT010A
Título: Cadastro de Motivo de Parada
Global: WDCCMOTPAR

Código da Empresa | inteiro | 4 | chave | obrigatório
Código do Motivo | inteiro | 6 | chave | obrigatório

# Dados Gerais
Campo | Tipo | Tamanho | Obrigatório
Descrição | texto | 45 | sim
Data do Cadastro | data | 8 | sim
Tempo Padrão | decimal | 8 |
Situação | combo | 10 | sim

# Grid: Setores
Coluna | Tipo | Tamanho
Setor | inteiro | 6
Descrição do Setor | texto | 30
Responsável | texto | 25
Tempo Meta | decimal | 8
Vigência | data | 10

# Observações
Observação Geral (textarea, 200)
```

### Cabeçalho

| linha | para que serve |
|---|---|
| `Rotina:` | nome da rotina (vira o `.mac` e a `RG`) |
| `Título:` | o que aparece no `csw:aj` |
| `Global:` | nome da global de negócio |

Também valem `Programa:`, `Nome da rotina:`, `Variável:`, `Entidade:` e `Modo:`
(`Modo: grid` ou `Modo: consulta` força o modo Grid em vez de cadastro).

### Chaves

As linhas **antes do primeiro `#`** são as chaves da global, na ordem dos subscritos.
`Código da Empresa | inteiro | 4 | chave | obrigatório` vira o primeiro subscrito.

### Blocos

Cada `# Alguma coisa` abre uma aba. Três formas equivalentes:

```
# Dados Gerais
Aba: Dados Gerais
[Dados Gerais]
```

Um bloco cujo título contenha a palavra **Grid** vira grid em vez de campos — as linhas
passam a ser colunas. É o caso do `# Grid: Setores` acima. A **primeira coluna** entra como
chave do registro; se outra for a chave, marque com `| chave`.

### Linhas de campo

A linha aceita separação por `|`, por tabulação, ou texto corrido:

```
Descrição | texto | 45 | sim
Descrição	texto	45	sim
Observação Geral (textarea, 200)
```

Tipos reconhecidos: `texto`, `inteiro`, `decimal`, `float`, `data`, `hora`, `combo`, `radio`,
`checkbox`, `textarea`, `multi`. O que não bater é deduzido pelo nome do campo — "Data do
Cadastro" sai como data mesmo sem o tipo escrito.

Marcadores soltos na linha: `chave`, `obrigatório`, `sim`/`não` na coluna de obrigatoriedade.

Campo `combo`, `radio` ou `checkbox` já sai com tabela de opções `TAB<VARIÁVEL>` e dois itens
(Inativo/Ativo) — é só ajustar os valores depois, porque a especificação quase nunca traz.

### O que ele deduz sozinho

- **Variável**: das iniciais da descrição, sem repetir.
- **Tipo e tamanho**: do nome quando não vêm escritos.
- **F7**: pelo catálogo — "Código da Empresa" pega o F7 de empresa sozinho.
- **Posição**: label, leitor e display distribuídos na grade de 108 colunas.
