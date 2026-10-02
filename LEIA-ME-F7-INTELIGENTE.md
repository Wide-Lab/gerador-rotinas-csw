# Assistente de F7

Branch: `feat/2-f7-inteligente`

Novo módulo `modulos-padrao-json/gpj-f7-assistant.js` (carregado depois do `gpj-app.js`).
Nenhum arquivo existente foi alterado além da linha do `<script>` no HTML.

## 1. Busca no catálogo de F7

O catálogo tem mais de 130 consultas em um `<select>` comum. Agora, dentro do modal
**F7 e validação**, existe um campo de busca acima da lista:

- filtra por descrição, por rotina (`PVTB`, `%CSTN`, `CCPV299`) ou pela chave do preset;
- mostra quantas consultas sobraram;
- `Enter` aplica a primeira da lista;
- a opção já selecionada nunca some do filtro, então nada é perdido sem querer.

## 2. Sugestão para o campo aberto

Abaixo da lista aparecem até 5 sugestões em forma de chip, calculadas a partir da
descrição e da variável do campo. Cada chip mostra a rotina e a confiança
(alta / média / baixa). Clicar aplica a sugestão na hora.

O ranking usa duas coisas:

- um dicionário do domínio CSW (empresa, cliente, produto, moeda, transportadora,
  representante, condição de venda, tabela de preço, tipo de nota, gramatura, formato,
  diâmetro, revestimento, laca, setor, ramo de atividade, portador, tipo de frete,
  natureza, lote, orçamento…), que dá preferência aos presets completos — os que já
  trazem Valcp e display prontos;
- similaridade de palavras contra a descrição de todas as consultas do catálogo,
  com penalização para descrições muito longas.

Exemplos reais medidos:

| campo                | sugestão                    |
|----------------------|-----------------------------|
| Código do Cliente    | `FTCL^CCCT299` (alta)       |
| Condição de Venda    | `%CSCV^CCPV299` (alta)      |
| Tabela de Preço      | `PVMTBP^CCPVM299` (alta)    |
| Ramo de Atividade    | `FTRA^CCPV299` (alta)       |
| Gramatura            | `PVTB5^CCPV299` (alta)      |
| Situação do Pedido   | `PVTB1^CCPV299` (alta)      |
| Observação livre     | nenhuma                     |

## 3. Aplicação em lote

Botão **Sugerir F7** no cabeçalho do card *Campos*. Ele varre todos os campos que ainda
estão sem F7 e abre uma tela com uma linha por campo:

- combo com as melhores sugestões (dá para trocar antes de aplicar);
- selo de confiança;
- checkbox marcado só quando a confiança é média ou alta.

Nada é aplicado sem clicar em **Aplicar selecionados**. Campos de multi-seleção ficam
fora do lote de propósito: eles dependem da rotina 299 própria e das globais que só quem
está montando a tela sabe informar.

Tudo roda local no navegador — nenhuma chamada externa, nenhum custo.

## F7 do próprio cadastro

Na seção **Gerar e integrar rotina RG**, a opção *Gerar o F7 deste cadastro (rotina 299)*
mais a combo **Campo que aparece no display da consulta**.

O raciocínio: uma tela que cadastra magazine grava código e descrição na global. Outras
telas vão querer um campo "Magazine" com F7 que consulte essa global e devolva a descrição
para o display. Esse F7 sempre foi escrito à mão — e o gerador já sabe tudo que ele precisa.

A combo lista **só os campos que têm piece**: chave é subscrito da global, não conteúdo do
nó, então não serve de descrição.

Para um cadastro `WDOMMAG010` com global `WDOMMAG`, chave `Codigo do Magazine` e a descrição
escolhida no piece 3:

```objectscript
	; F7 de Cadastro de Magazine
	;
MAGAZINE(CODEMP)	;
	do ^%CSUTIPE("6,40","3","Codigo do Magazine,Descricao",15,"^WDOMMAG(CODEMP,@1)","%codret",,,,,"MAGAZINEPE1^WDOMMAG299")
	quit:$$CSP^%CSW1UTI()
	;
MAGAZINEPE1	;
	do SetF7^%CSW1UTI(%codret)
	quit
```

É o padrão *F7 direto em global* da skill `cache-consistem-f7` (Exemplo 2), com três coisas
que saem do projeto sem digitação:

- **a empresa é parâmetro da label** (`MAGAZINE(CODEMP)`) e entra como subscrito da global,
  quando *Usar CE da rotina* está marcado — foi o pedido de "o F7 tem que ser por empresa";
- **o piece é o real**, o mesmo número que a rotina grava (`$piece(WDOMMAG,Z,3)`), não um
  palpite;
- **os tamanhos e títulos** das colunas vêm do tamanho e da descrição dos próprios campos.

A rotina 299 sai com o nome derivado da tela (`WDOMMAG010` → `WDOMMAG299`) e entra no
*Salvar códigos* junto com a interface e a RG:

```
WDOMMAG010.mac, WDOMMAG299.mac, WDOMMAG010RG.mac
```

Se a 299 já tiver outros F7 (multi-seleção, por exemplo), este é acrescentado à mesma
rotina, sem duplicar label. A escolha viaja no JSON do projeto.

### Como testar, e como a outra tela usa

**Ver o 299.** Ele sai no seletor **Interfaces .mac**, não no de RG — é rotina de interface,
não de regra. Marque a opção, escolha o campo do display e o `WDOMMAG299` aparece na lista
ao lado do `WDOMMAG010`.

**Usar em outra tela.** Aqui estava o buraco: o F7 nasce no cadastro de magazine mas é
consumido noutra tela, que é *outro projeto* no gerador — a sugestão do projeto atual não
alcança o projeto seguinte.

O botão **Guardar no catálogo de F7** resolve. Guardado, ele passa a aparecer na lista de
sugestões de qualquer projeto, no grupo *Gerados aqui*, e o campo é configurado pela
sugestão em vez de digitar a rotina na mão:

```
projeto 1 (cadastro)  guardar  →  MAGAZINE^WDOMMAG299
projeto 2 (pedido)    sugestão →  "Cadastro de Magazine (MAGAZINE^WDOMMAG299)"
                      campo    →  do ^%CSLE(1,19,10,"$piece(WDOMPED,Z,3)",…,",MAGAZINE^WDOMMAG299,,cp1100")
```

O catálogo do arquivo (`gpj-f7-catalog.js`) continua fixo; estes ficam no `localStorage`,
separados, e podem ser removidos com `fieldLookups.removeLookup(chave)`.

**Sobre o piece 3.** Não há piece a preencher na janela de F7 do campo que *consulta*. O
piece pertence ao 299 — é lá que ele diz de qual pedaço do nó sai a descrição, e o gerador
já o escreveu a partir do cadastro. Do lado de quem consulta, o display é preenchido pelo
retorno do F7.
