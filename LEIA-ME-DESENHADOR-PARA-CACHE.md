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
