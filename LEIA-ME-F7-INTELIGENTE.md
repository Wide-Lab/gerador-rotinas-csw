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
