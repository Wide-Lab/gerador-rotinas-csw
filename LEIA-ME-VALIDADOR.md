# Validador de regras Caché / CSW

Branch: `feat/1-validador-cache`

## O que mudou

- **Novo módulo** `modulos-padrao-json/gpj-validator.js`, carregado depois do `gpj-app.js`.
- **Correção real no gerador de F7** (`gpj-f7-generator.js`): as globais de trabalho da
  rotina 299 (`^mtemp...SEL` / `^mtemp...NAOSEL`) podiam passar de 31 caracteres, que é o
  limite do Caché para nome de global — a rotina simplesmente não compilava.
  Agora a base é cortada em 20 caracteres e, quando há corte, os dois últimos viram um
  hash do nome completo para duas consultas diferentes não colidirem.

  Exemplo com rotina `WDOMPVCONFIGURACAO` e label `SELECAOTIPOSDENOTAFISCAL`:

  | antes                                     | depois                            |
  |-------------------------------------------|-----------------------------------|
  | `^mtempWDOMPVCONFIGURACAO299SELECNAOSEL` (37) | `^mtempWDOMPVCONFIGURACAO60NAOSEL` (31) |

## Como usar

Abra o `gerador-json-ui-ajustada.html`. No canto inferior direito aparece um selo:

- verde `✔ Sem problemas`
- laranja `⚠ N avisos`
- vermelho `⚠ N erros`

Clique no selo para abrir a lista. Clicando em um item, a tela rola até o campo/aba
correspondente e o destaca. O botão **Copiar relatório** joga tudo em texto.

O validador roda sozinho a cada alteração (é acoplado ao `app.refresh`) e nunca altera
o código gerado — é só diagnóstico.

## Regras verificadas

**Nomes e limites do Caché**
- nome de rotina, RG, rotina de aba, global e global de trabalho: caracteres válidos e
  limite de 31 caracteres;
- rotina de aba duplicada com outra aba, com a principal ou com a RG;
- RG com o mesmo nome da interface;
- variável de campo inválida, maior que 31 caracteres ou repetida no mesmo local
  (duas variáveis iguais gravam no mesmo piece);
- variável colidindo com as do framework (`Z`, `SC`, `CE`, `CT`, `%PRG`, `TIPF7`…);
- labels e globais das rotinas 299 geradas.

**Layout**
- label, leitor e display que passam da largura da janela ou do TabPanel;
- linha além da altura da janela / do TabPanel;
- sobreposição entre label, leitor e display — do mesmo campo ou de campos diferentes
  (considera altura de textArea);
- TabPanel maior que a janela;
- botões de manutenção fora da janela ou por cima do TabPanel.

**Chaves, RG e persistência**
- cadastro sem nenhuma chave nos índices da global;
- índice apontando para campo inexistente, campo chave dentro de aba;
- rotina sem `CE` e sem campo `CODEMP`;
- combo/checkbox/radio sem variável da tabela, sem itens ou com valor repetido;
- multi-seleção sem variável de tabela;
- multi-seleção gerando 299 sem a global de todos os registros (hoje sai um `TODO`
  silencioso no código);
- 299 com nome igual ao da interface ou maior que 31 caracteres;
- quantidade de colunas x títulos x pieces desalinhada no `%CSUTIPE`;
- Valcp escrevendo em `{display}` num campo sem display;
- Valcp usando `CODEMP` numa rotina que só tem `CE`;
- marcador `{...}` desconhecido no Valcp (sairia literal no .mac);
- leitor tipado ligado sem rotina;
- campo obrigatório e desabilitado ao mesmo tempo.

**Grid**
- aba do tipo Grid sem coluna;
- código de grid repetido na mesma janela;
- global de trabalho repetida entre grids, inválida ou acima de 31 caracteres;
- linha final menor que a inicial, grid estourando a altura do local;
- grid sem coluna chave, manutenção inline sem coluna editável;
- coluna com variável inválida/repetida ou sem piece.
