# Documentação de Global → classe COS

Botão **Documentar global** na seção *Gerar e integrar rotina RG*. Gera a classe
`%Persistent` que documenta a global do projeto — propriedades, chaves, pieces, Storage e
`ObterMetodoPadrao` — sem redigitar nada: tudo sai do que já está montado no gerador.

## De onde vem

É um porte da camada de domínio da ferramenta **Mapeamento de Global** do
[consistem-tools](https://github.com/consistem/consistem-tools), a extensão VS Code da
Consistem. A pasta `src/features/classDoc/cos/` é JavaScript puro — sem VS Code, sem React —
justamente para poder ser reaproveitada:

| arquivo original | o que trouxe |
|---|---|
| `cos/types.ts` | `ClassModel`, `nomeStorage`, `nomeSqlMap`, `streamLocationSugerido` |
| `cos/normalize.ts` | `normalizarTipo` (`%Library.` e `%Float`), SCALE obrigatório, TRUNCATE só em string, DisplayList sem espaços |
| `cos/typeInference.ts` | `inferirTipo` pelo nome da variável (é o que promove "empresa" para `Cad.Empresa`) |
| `cos/paramRules.ts` | quais parâmetros valem para cada tipo |
| `cos/generator.ts` | `gerarCls` e os blocos `<Data>`, `<Subscript>`, `<SQLMap>`, `Storage` |

O porte é fiel: mesma ordem de parâmetros, mesmas aspas, mesmo `%CacheSQLStorage` no padrão
"global só com fixa", mesma ordenação alfabética dos SQLMaps.

### Nomes: por que o módulo mistura dois idiomas

Os módulos do gerador usam identificadores em inglês (`collectGeneratedFiles`,
`applyPresetToColumn`), e a ponte e a interface deste seguem esse padrão —
`resolveClassesFolder`, `scanPackages`, `projectModels`, `currentIdentity`.

As funções **portadas** ficaram com o nome do original (`gerarCls`, `montarProperty`,
`montarData`, `montarSubscripts`, `montarMetodo`, `normalizarTipo`, `inferirTipo`,
`paramsAplicaveis`, `nomeStorage`, `nomeSqlMap`). Não é descuido: é o que permite abrir
`src/features/classDoc/cos/generator.ts` ao lado e comparar função por função. Renomeá-las
tornaria o teste diferencial ilegível e o próximo `git pull` do consistem-tools mais difícil
de acompanhar.

### Como sei que é fiel

Teste diferencial: o gerador **original em TypeScript** roda lado a lado com o porte, no
mesmo `ClassModel`, e a saída é comparada caractere a caractere.

```
IGUAL  cadastro simples com pieces        (72 linhas)
IGUAL  subpiece + subscript fixo + índice (92 linhas)
IGUAL  global só com fixa (sem chaves)    (53 linhas)

3 de 3 idênticos
```

Os casos cobrem o que tem de traiçoeiro: subpiece (`<Piece>11,1</Piece>` com delimitador
duplo), subscript literal no meio das chaves, SQLMap de índice com `Parameter` de descrição,
normalização de `%Library.Float` → `%Double`, DisplayList com espaço depois da vírgula, e o
caminho `fixa` (sem chaves, com `Property fixa` privada e `RowIdSpec`).

O original roda no Node 22 com `--experimental-strip-types`; os arquivos `.ts` são copiados
para o scratchpad só com as extensões dos imports resolvidas.

## A ponte com o gerador

O que a ferramenta original pede na mão, aqui já existe:

| no .cls | vem de |
|---|---|
| nome da global | Global da rotina |
| `Parameter TITULO` | Título da tela |
| chaves / `Index RowId` | Índices gerais da global |
| pieces `<Data>` | a mesma numeração que a rotina grava (`$piece(DADOS,Z,n)`) |
| tipo COS | tipo do campo, com o nome podendo promover para `Cad.Empresa` |
| `MAXLEN` | tamanho do campo (ou o total de caracteres, em área de texto) |
| `SCALE` | 2 ou 3, conforme o formato decimal do campo |
| `VALUELIST` / `DISPLAYLIST` | a tabela de opções do combo/radio |
| `CAPTION` e `/// descrição` | descrição do campo |
| `ObterMetodoPadrao` | rotina, RG e entidade |

O nome da Property é derivado da **descrição**, não da variável: `CODEMP` viraria `Codemp`,
enquanto "Código da Empresa" vira `codigoDaEmpresa`. Nomes repetidos ganham sufixo.

## Uma classe por nó da global

Foi o ponto que mudou o desenho da integração. Numa tela com abas, cada aba grava numa
variável de dados própria — e variável de dados diferente é **nó diferente da global**, logo
**classe diferente**. O subscrito da aba entra como subscript literal depois das chaves.

O exemplo do *Gerar por documento* rende três:

```
Cad.WDCCMOTPAR                 ^WDCCMOTPAR({codigoDaEmpresa},{codigoDoMotivo})
   pieces: (nenhum — é o nó das chaves)

Cad.WDCCMOTPARDadosGerais      ^WDCCMOTPAR({codigoDaEmpresa},{codigoDoMotivo},4)
   pieces: descricao, dataDoCadastro, tempoPadrao, situacao

Cad.WDCCMOTPARObservacoes      ^WDCCMOTPAR({codigoDaEmpresa},{codigoDoMotivo},6)
   pieces: observacaoGeral
```

O seletor **Nó da global** só aparece quando há mais de um. Cada um copia e salva separado.

## O que ele não faz

- **Não abre o painel de manutenção** da ferramenta original (editar uma `.cls` que já
  existe, com edição cirúrgica e CodeLens). Isso é do VS Code e continua lá.
- **Não cria a classe no IRIS.** Aqui sai o texto: copie ou salve o `.cls` e leve para o
  Studio / VS Code.
- **Não gera SQLMaps de índice.** O modelo suporta (`indices`), mas o gerador não tem de
  onde tirá-los — índice secundário de global não é conceito da tela.
- **Grid sem manutenção não vira classe.** Ali o `^mtemp…` é só a fonte da tela, é temporário
  e não há nó persistente para documentar. Com manutenção em linha vira — veja
  *O grid também vira classe*, no fim.

## Onde fica o botão

Na seção **Gerar e integrar rotina RG**, logo abaixo dos índices da global e das opções
Obter/Gravar/Excluir/Lock. É ali que se está pensando na estrutura que a classe documenta —
antes ele ficava no cabeçalho, longe do assunto.

## O pacote vem das pastas, não do nome da global

A primeira versão chutava `Cad` como pacote. Estava errado, e o erro é instrutivo: numa
global como `WDOMPVPD` nenhum pedaço do nome é pacote COS —

```
WD    Widelab (customização)
OM    conta do cliente
PV    módulo — Pedido de Venda
PD    o resto do nome
```

Quem sabe o pacote são as **pastas sob `classescls`**, que é de onde a ferramenta original
também tira a lista. A convenção da Consistem usa `_` como separador de pacote no nome da
pasta, e um `.cls` exportado "flat" também declara o pacote no próprio nome:

| no repositório | pacote |
|---|---|
| `classescls/Wdom_Fat/` | `Wdom.Fat` |
| `classescls/Wdom_Sfa_Sol/` | `Wdom.Sfa.Sol` |
| `classescls/Asnr_Ppcp_Pmp/` | `Asnr.Ppcp.Pmp` |
| `classescls/Wdom.Fat.Classe.cls` | `Wdom.Fat` (export flat na raiz) |

São as pastas do **primeiro nível**, e só elas. Descer mais níveis conta subpasta de
conteúdo como se fosse pacote — numa `classescls` de produto isso inflou a lista para
milhares de entradas.

### A pasta é encontrada sozinha

A conta sai do nome, e a conta diz a pasta. Em `WDOMPVPD`: `WD` é o prefixo da customização
e `OM` é a conta, então as classes vivem em

```
<raiz do clone>/DESENV/custom/om/classescls
```

Basta escolher **a raiz do clone** (`C:\workspacecsw\projetos`) uma vez, no botão
**Selecionar raiz do clone** — daí em diante o caminho é resolvido sozinho. Descer é
permitido pela API do navegador; **subir não é**, e é por isso que se escolhe a raiz e não a
pasta final.

O seletor de pasta abre **já na pasta da conta atual**. Sem isso o Chrome reabre onde parou
da última vez: com a rotina em `fk`, ele ainda oferecia a pasta de `om`.

E escolher uma `classescls` direto **não sobrescreve a raiz**. Só vira raiz o que tem
`DESENV/custom` dentro; uma `classescls` avulsa vale para uma conta só, então fica como
destino secundário e a resolução automática continua mandando.

A mesma checagem vale para a pasta **lembrada** entre sessões — e é aí que a coisa pegava.
Versões anteriores guardavam qualquer pasta escolhida sob a chave da raiz, então uma
`classescls` avulsa voltava como se fosse raiz na sessão seguinte e prendia tudo naquela
conta: com a rotina em `fk`, o seletor continuava abrindo em `om`.

Agora o handle lembrado é validado igual. Sem `DESENV/custom` dentro ele é **descartado**,
não convertido em destino fixo — manter esse valor faria o seletor reabrir exatamente na
conta errada, que era o sintoma. Uma sessão antiga se cura sozinha na primeira abertura.

E o seletor usa **ids diferentes** conforme o estado: enquanto falta a raiz vai como
`gpj-clone-root`, para o Chrome não reabrir na `classescls` de antes (ele guarda a última
pasta por id). Com a raiz em mãos volta a ser `gpj-classes`, apontando para a conta certa.

### Qualquer nível serve de raiz

Exigir exatamente a pasta `projetos` fazia subir demais no seletor. Vale qualquer uma:

```
projetos       →  custom/om/classescls
DESENV         →  custom/om/classescls
DESENV/custom  →  custom/om/classescls
```

E enquanto falta a raiz, o seletor abre na **pasta das rotinas** já escolhida em "Salvar no
projeto" — ela fica dentro do clone, então a raiz está a poucos cliques na trilha de cima.
Só cai em "Documentos" quando nem a pasta de rotinas foi escolhida ainda.

### Normalmente não precisa escolher pasta nenhuma

A pasta autorizada em **Salvar no projeto** já está dentro do clone. Ela é aproveitada antes
de qualquer seletor:

| o que foi escolhido lá | o que dá para fazer |
|---|---|
| `projetos`, `DESENV` ou `custom` | serve de raiz — resolve qualquer conta |
| `custom/om` (a pasta da conta) | resolve a `classescls` do `om`, sem seletor |
| `custom/om/rotinas` | não serve — nem raiz nem pasta de conta |

Com a pasta da conta, uma rotina daquela conta resolve com **zero cliques**. Uma rotina de
outra conta avisa em vez de gravar no lugar errado:

> A pasta de "Salvar no projeto" é da conta `om`, mas esta rotina é `mk`. Escolha acima
> `projetos`, `DESENV` ou `custom` — de qualquer uma delas eu acho as duas.

### Escolher uma vez basta

O que ainda obrigava a reescolher a pasta a cada uso era a permissão. Depois de recarregar a
página o Chrome devolve `queryPermission` como **`prompt`**: o handle continua válido, só
falta autorizar. Eu tratava isso como "não tenho pasta" e descartava.

Agora o handle é guardado com a marca de raiz (`{ handle, raiz: true }`) — necessário porque,
em `prompt`, ler a pasta para reconferir não é permitido. Na abertura seguinte o rótulo diz
*"Pasta lembrada (projetos) — clique acima para autorizar"*, e o botão **autoriza** em vez de
reabrir o seletor:

```
sessão 1 (primeira vez)          abriu o seletor: SIM   → custom/om/classescls
sessão 2 (depois do F5)          abriu o seletor: não, só autorizou
sessão 3 (idem)                  abriu o seletor: não, só autorizou
```

Em todas elas, trocar a global para `WDFKCCMOT` leva a `custom/fk/classescls` com o pacote
`Wdfk`. O clique de autorização é exigência do navegador e não tem como evitar; o que dá para
evitar — e foi feito — é obrigar a navegar de novo até a pasta.

Uma escolha da raiz resolve de vez:

```
WDOMPVPD   pacote=Wdom   seletor abre em DESENV/custom/om/classescls
WDFKCCMOT  pacote=Wdfk   seletor abre em DESENV/custom/fk/classescls
WDMKPVMOT  pacote=Wdmk   seletor abre em DESENV/custom/mk/classescls
```

Trocar de rotina troca a pasta. Reabrir a modal reavalia:

```
WDOMPVPD    →  DESENV/custom/om/classescls  — 61 pacote(s), 16 de Wdom
WDNRWORK002 →  DESENV/custom/nr/classescls  — 12 pacote(s),  1 de Wdnr
WDFKPV990   →  DESENV/custom/fk/classescls  — 90 pacote(s),  6 de Wdfk
```

Prefixos reconhecidos: `WD` (Widelab), `CI`, `GC`, `AS`, `BP` e `PR`.

**A global vem antes da rotina.** É ela que a classe documenta, e é comum a tela ter outro
prefixo — uma rotina `WDCCMOT010` gravando em `^WDOMPVPD` é conta `om`, não `cc`. Quando as
duas discordam, vence a que **existe** em `custom/`; quando nenhuma existe, a lista de contas
do clone aparece no lugar do caminho, em vez de fingir uma pasta vazia.

### E o pacote é sugerido

Os pacotes da conta vêm **na frente da lista**, porque numa pasta de 61 só os do prefixo
certo interessam para esta rotina. Para a conta `om`:

```
Wdom.CCACC, Wdom.Cgi, Wdom.Com, Wdom.Cpg, Wdom.Cre, Wdom.Cred, Wdom.Fat, Wdom.Ped …
```

### O campo já vem preenchido pelo nome

O pacote base sai do próprio nome — prefixo + conta:

```
WDMKPVMOT  →  Wdmk
WDOMPVPD   →  Wdom
WDFKPV     →  Wdfk
ASOMPV     →  Asom
```

Isso vale **sempre**, a cada abertura. Antes eu lembrava o último pacote digitado, e o efeito
era o projeto seguinte nascer com o pacote do projeto anterior — errado com cara de certo.

Quando a base já existe no disco, a grafia de lá é reusada. Quando não existe, ela é
sugerida assim mesmo e o aviso diz que será criada: a conta `mk`, por exemplo, hoje só tem
`Asmk`, `Bpmk`, `Cimk` e `Gcmk` — uma customização Widelab nova ali é `Wdmk` mesmo.

Digitar por cima continua valendo (`Wdom.Ped`, por exemplo) e a digitação é respeitada
enquanto a janela fica aberta. Reabrir volta ao padrão do nome, de propósito.

A raiz escolhida é lembrada entre sessões enquanto o navegador mantiver a permissão.

### Onde o arquivo vai

A classe é gravada **dentro da pasta do pacote**, com o nome puro da classe:

```
classescls/Wdom_Fat/AlertaCliSemCompra.cls   →   Class Wdom.Fat.AlertaCliSemCompra
```

A pasta é criada quando ainda não existe. Digitar `Wdom_fat`, `wdom.fat` ou `Wdom.Fat` dá no
mesmo: o campo é normalizado e, quando a pasta já existe, a **grafia do disco é reusada** —
nada de criar `Wdom_fat` ao lado de `Wdom_Fat`.

**Salvar esta** grava a classe do nó selecionado. **Salvar todas** grava as de todos os nós de
uma vez, útil em tela com abas. Sem pasta escolhida, o botão cai no download do navegador.

## Por que não sai junto com "Salvar códigos"

Cheguei a pôr as classes na mesma lista das rotinas. Está errado: `.mac` e `.cls` moram em
**árvores diferentes** do clone —

```
DESENV/custom/om/rotinas/      ← as rotinas
DESENV/custom/om/classescls/   ← as classes
```

Salvar a classe ao lado do `.mac` colocava o arquivo no lugar errado, com o nome errado. A
gravação ficou só aqui, onde a pasta e o pacote são escolhidos com conhecimento de causa.

## O grid também vira classe

Eu tinha escrito aqui que "grid não vira classe, as colunas moram no `^mtemp` temporário".
Está errado quando há **manutenção em linha**: nesse caso a gravação é
`$$$KillMergeG(^GLOBAL(chaves[,fixa]), ^mtemp…(term))`, ou seja, a global de trabalho é
copiada para a de negócio. As colunas são pieces de verdade, num nó de verdade.

A coluna marcada como **chave do registro** vira mais um subscrito; as demais viram os
pieces, com o número que está em *Piece trabalho*:

```objectscript
Property setor As %Integer(CAPTION = "Setor") [ Required ];
Property descricaoDoSetor As %String(CAPTION = "Descrição do Setor", MAXLEN = 30);
Property tempoMeta As %Double(CAPTION = "Tempo Meta", SCALE = 2);
Property vigencia As %Date(CAPTION = "Vigência", FORMAT = 4);

Index RowId On (codigoDaEmpresa, codigoDoMotivo, setor) [ IdKey, PrimaryKey ];

<Data name="descricaoDoSetor"><Piece>1</Piece></Data>
<Data name="tempoMeta">      <Piece>2</Piece></Data>
<Data name="vigencia">       <Piece>3</Piece></Data>
```

O tipo COS sai do tipo da coluna: `n` → `%Integer`, `d` → `%Date` com `FORMAT = 4`,
`vN` → `%Double` com `SCALE = N`, o resto `%String` com `MAXLEN` da largura. Grid de aba
entra com o subscrito da aba antes da coluna chave.

Grid **sem** manutenção continua fora: ali o `^mtemp` é só a fonte da tela e não há nó
persistente para documentar.
