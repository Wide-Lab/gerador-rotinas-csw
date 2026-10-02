# gerador-rotinas-csw

Gerador de rotinas Caché/CSW do ERP Consistem: a partir de um projeto JSON, de uma
especificação em texto ou da tela do desenhador, gera a interface (`.mac`), as abas, a RG
e os F7 no padrão das customizações, com validador de regras CSW.

- **Tela:** abra `gerador-json-ui-ajustada.html` no navegador (detalhes em [LEIA-ME.md](LEIA-ME.md)).
- **Linha de comando:** `cli/gerar-rotina.mjs` (detalhes em [cli/LEIA-ME-CLI.md](cli/LEIA-ME-CLI.md)).
- **Claude Code:** o plugin `gerador-rotinas-csw` usa o gerador para montar a tela a partir
  do documento, validar, gravar, compilar no DESENV e regerar a interface.

## Usar pelo Claude Code

A skill fica no plugin **gerador-rotinas-csw** do marketplace interno
[widelab-plugins](https://github.com/Wide-Lab/widelab-plugins):

```
claude plugin marketplace add Wide-Lab/widelab-plugins
claude plugin install gerador-rotinas-csw@widelab
```

Na primeira vez, a skill pergunta onde está este repositório (ou clona) e pede para
definir `GERADOR_ROTINAS` com o caminho. Depois é só pedir a tela no Claude Code, na
pasta do DESENV ("cria a tela de cadastro de X" ou cole o documento da tarefa).

## Exemplos

`cli/exemplo-*.json` traz um projeto de cada tipo: cadastro simples, cadastro com abas,
consulta com filtros, monitor com ações por linha, grid de manutenção, colunas por mês,
impressão de etiquetas e tela aberta por parâmetros.

## Antes de mudar o gerador

```
cd cli
npm run teste
```
