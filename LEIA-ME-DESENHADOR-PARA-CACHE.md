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
