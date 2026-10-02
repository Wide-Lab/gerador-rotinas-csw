# gerador-rotinas-csw

Gerador de rotinas Caché/CSW do ERP Consistem: a partir de um projeto JSON, de uma
especificação em texto ou da tela do desenhador, gera a interface (`.mac`), as abas, a RG
e os F7 no padrão das customizações, com validador de regras CSW.

- **Tela:** abra `gerador-json-ui-ajustada.html` no navegador (detalhes em [LEIA-ME.md](LEIA-ME.md)).
- **Linha de comando:** `cli/gerar-rotina.mjs` (detalhes em [cli/LEIA-ME-CLI.md](cli/LEIA-ME-CLI.md)).
- **Claude Code:** a skill `gerar-rotina-cache` usa o gerador para montar a tela a partir
  do documento, validar, gravar, compilar no DESENV e regerar a interface.

## Instalar a skill no Claude Code

1. Clone o repositório e rode `npm install` dentro de `cli/`.
2. Defina a variável `GERADOR_ROTINAS` com o caminho do clone:
   `setx GERADOR_ROTINAS "C:\caminho\gerador-rotinas-csw"`
3. Copie a pasta `skill/gerar-rotina-cache` para `%USERPROFILE%\.claude\skills\`.
4. Abra o Claude Code na pasta do DESENV e peça a tela ("cria a tela de cadastro de X" ou
   cole o documento da tarefa).

Recomendado junto: o plugin **cache-consistem** (padrões das rotinas e busca nos fontes do
ERP) e o plugin **consistem** (massa de dados em base versionada, `gerar-dados-base`).

## Exemplos

`cli/exemplo-*.json` traz um projeto de cada tipo: cadastro simples, cadastro com abas,
consulta com filtros, monitor com ações por linha, grid de manutenção, colunas por mês,
impressão de etiquetas e tela aberta por parâmetros.

## Antes de mudar o gerador

```
cd cli
npm run teste
```
