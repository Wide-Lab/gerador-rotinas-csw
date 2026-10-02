# Gerador pela linha de comando (VS Code e Claude)

`cli/gerar-rotina.mjs` roda o gerador sem abrir o navegador. Ele não tem regra própria:
carrega o `gerador-json-ui-ajustada.html` no jsdom, com os módulos na ordem do HTML, e
chama as mesmas funções dos botões. O `.mac` que sai é o mesmo da tela.

## Instalar

```
cd cli
npm install
```

## Usar

```
node cli/gerar-rotina.mjs --spec minha-tela.txt                 # simula e mostra o validador
node cli/gerar-rotina.mjs --spec minha-tela.txt --mostrar       # imprime o código
node cli/gerar-rotina.mjs --spec minha-tela.txt --saida C:\...\rotinas\WDOM
node cli/gerar-rotina.mjs --projeto WDCCMOT010.gerador-json.json --saida .
node cli/gerar-rotina.mjs --desenhador tela.json --tela 1
node cli/gerar-rotina.mjs --modelo spec > minha-tela.txt        # começar do modelo
node cli/gerar-rotina.mjs --ajuda
```

- Sem `--saida` é só simulação.
- Um `.mac` que já existe com outro conteúdo **não** é sobrescrito sem `--sobrescrever`.
- Grava em UTF-8 com CRLF, como as rotinas do repositório (`--eol lf` para LF).
- `--exportar-projeto x.gerador-json.json` gera o projeto para abrir na tela (Importar JSON).
- `--json` devolve arquivos, validador e o que foi gravado em JSON (é o que o Claude lê).
- Código de saída: 0 ok, 1 erro do validador ou conflito (`--estrito` inclui avisos), 2 entrada inválida.

Antes de carregar a entrada o CLI faz o mesmo que **Limpar tela**, para nada do exemplo
WDCCMOT010 vazar para a rotina nova.

## No VS Code

`.vscode/tasks.json` traz quatro tarefas (Ctrl+Shift+P → *Tasks: Run Task*), todas sobre o
arquivo aberto no editor: simular, gerar os `.mac` numa pasta, mostrar o código e imprimir
o modelo de especificação. A tela continua abrindo pelo Live Server (porta 5501).

## Com o Claude Code

A skill `gerar-rotina-cache` (em `~/.claude/skills`) ensina o Claude a escrever a
especificação, simular, corrigir o que o validador apontar e só gravar depois de você
confirmar a pasta.

## Teste

`npm run teste` (dentro de `cli/`) gera o exemplo padrão, o modelo de especificação, o
modelo JSON e o exemplo do desenhador. Ele confere que nenhum tem erro no validador e que
a especificação e o JSON equivalente produzem os mesmos arquivos.
