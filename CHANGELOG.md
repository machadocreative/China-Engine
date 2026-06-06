# Changelog

Todas as alterações relevantes deste projeto são registradas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e o projeto segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/):
`MAIOR.MENOR.CORREÇÃO` (ex.: novas funcionalidades sobem o número do meio; correções, o último).

## [Não lançado]

> Registre aqui as mudanças em andamento. Ao fazer um commit que vira uma versão,
> mova estes itens para um novo bloco de versão com a data do dia.

### Adicionado
### Alterado
### Corrigido
### Removido

---

## Planejado (futuro — fora do escopo atual)

Módulo financeiro, a ser desenvolvido **após** o polimento das funcionalidades de estoque,
integrando as movimentações de entrada e saída com a gestão financeira da loja:

- Exportação em `.ofx`.
- Registro do tipo de recebimento na saída (venda em espécie, cartão de crédito, Pix, conta bancária em que foi recebido etc.).
- Emissão/registro de recibo fiscal.
- Registro de despesas da loja (aluguel, energia, internet, funcionários, compra de insumos etc.).
- Apuração de lucro da operação (entender se o negócio dá lucro de fato).

---

## [0.3.0] - 2026-06-05

### Adicionado

**Categorias**
- Edição do nome de categorias diretamente na lista, com sanitização do campo (apenas letras, números, espaços e os caracteres `- / &` são aceitos; especiais são descartados em tempo real).
- Modal de confirmação ao renomear uma categoria que possui estoque ativo associado.
- Bloqueio de nomes duplicados ao adicionar ou renomear categorias.

**Estoque — "A receber"**
- Subrow de largura total exibida imediatamente abaixo do produto quando há saídas pendentes de recebimento, no lugar do badge anterior.
- Modal "Finalizar recebimento": exibe todas as saídas "a receber" pendentes de um produto, permite informar o valor efetivamente recebido por unidade e registra o recebimento. A movimentação original é atualizada no lugar (sem recriar a saída), preservando a baixa de estoque e o histórico com data original.

**Filtro de categorias**
- O dropdown de filtro por categoria da tela principal exibe apenas as categorias com produtos cadastrados, com a contagem entre parênteses — ex.: `Cabos (3)`, `Games (5)`. Categorias sem produtos são omitidas.

**Navegação inferior (protótipo)**
- Barra de navegação fixa no rodapé com três módulos: **Estoque** (ativo), **Gestão** e **Configurações**. Os dois últimos aparecem desabilitados com tooltip "Em desenvolvimento".

**Histórico geral — filtros**
- Painel de filtros na tela de histórico: Tipo (entrada / saída), Categoria, Produto (texto livre), faixa de Data (de / até) e faixa de Valor em R$ (mín–máx). Todos os filtros combinam com a ordenação existente e atualizam a lista em tempo real.

**Código de produto — SKU automático e código de barras**
- O campo SKU agora gera um código automaticamente ao salvar o produto, caso seja deixado em branco (formato: prefixo da categoria + sufixo único, ex.: `CAB-7F3A`). Botão "Gerar" disponível para criar o SKU na hora.
- Novo campo opcional "Código de barras" (EAN/UPC). Suporta duas formas de preenchimento: câmera (botão "Escanear", usa `BarcodeDetector` nativo — Chrome/Edge, requer permissão de câmera e HTTPS) e leitor USB/HID (basta focar o campo; o leitor digita diretamente).
- A busca da tela principal inclui o código de barras no filtro de texto.

**Compra em lote**
- Novo fluxo "Compra em lote" (botão no cabeçalho), para registrar entradas de múltiplos produtos em uma única operação.
- Cada linha permite escolher um produto existente ou criar um novo na hora (campo "Cadastrar novo produto", com nome, marca, categoria e preço de venda).
- Ao confirmar, produtos novos são criados com SKU automático e todas as entradas são lançadas de uma vez com a data da compra.

### Alterado

- Exclusão de produto e restauração de backup agora usam o modal de confirmação estilizado do app, em vez do diálogo nativo do navegador.
- Confirmação de ações que precisam de senha do gerente refatorada em função genérica, reutilizável em qualquer fluxo.

### Removido

- Botão de exclusão individual de movimentações (ícone ✕) no histórico do painel do produto — o histórico agora é imutável para preservar a integridade dos dados.

---

## [0.2.1] - 2026-06-05

### Alterado
- Nas ações rápidas (toque e segure), "Registrar entrada" e "Registrar saída" passam a abrir um modal apenas com o bloco correspondente, em vez de rolar até ele no painel completo.
- O botão "Editar dados do produto" foi movido para logo abaixo dos cards de estado geral do estoque (antes ficava no fim do painel).

---

## [0.2.0] - 2026-06-05

### Adicionado
- Número da versão exibido no cabeçalho do app.
- "Toque e segure" um produto na lista para abrir ações rápidas: Registrar entrada, Registrar saída e Editar informações do produto.
- Composição do estoque atual por custo: mostra quantas unidades correspondem a cada preço de compra (ex.: 12 un. a R$ 10,00 · 8 un. a R$ 15,00).
- Confirmação de custo ao registrar entrada em produto já existente: lembra o custo da última compra e, se houve mudança, permite informar novo custo e novo preço de venda mostrando o lucro resultante. O custo das unidades já em estoque não é alterado.
- Tela de histórico geral de movimentações (todas as entradas e saídas de todos os produtos), com ordenação por entrada/saída, categoria, nome do produto, data e valor.

### Alterado
- Alterar o preço de venda na edição do produto agora também exige a senha do gerente (antes, só na saída).

### Segurança
- A senha de gerente continua no código do app (client-side) — trava operacional, não segurança real.

---

## [0.1.0] - 2026-06-04

Primeira versão do MVP — controle de estoque com custo por lote.

### Adicionado
- Cadastro de produtos: marca/fabricante, nome, categoria, código, preço de venda e estoque mínimo.
- Categorias editáveis (criar e remover; remoção bloqueada quando há produtos usando a categoria).
- Registro de movimentações por produto:
  - Entradas (compras) com data, quantidade e custo unitário.
  - Saídas (baixas) com data, quantidade e motivo: Venda, A receber, Perda / avaria, Devolução, Ajuste e Outros.
- Cálculo automático de estoque atual (entradas − saídas) e de custo médio ponderado das entradas.
- Indicador de variação de custo entre lotes (menor → maior custo de compra).
- Card de lucro estimado: R$ por unidade, margem (%) e total do estoque, a partir do preço de venda e do custo médio.
- Motivo de saída "A receber": registra valor R$ 0,00 e exibe o selo "X a receber" na lista.
- Motivo de saída "Outros": campo de texto livre para descrição.
- Alteração de preço na saída com confirmação por senha de gerente.
- Lista de estoque com busca (nome, marca ou código), filtro por categoria e ordenação por nome, quantidade, preço ou custo médio, com direção ascendente/descendente.
- Aviso visual de estoque baixo quando a quantidade atinge ou fica abaixo do mínimo.
- Backup manual: exportar e restaurar todos os dados em arquivo JSON.
- Identidade visual da loja: cores da marca, logo no cabeçalho e mascote na tela de estoque vazio.
- Arquivo `dados-exemplo.json` com dados de demonstração para importar via "Restaurar".

### Segurança
- A senha de gerente para alterar o preço na saída fica no código do app (client-side).
  Ela funciona como trava operacional (estilo caixa de supermercado), **não** como segurança
  real — qualquer pessoa com acesso ao código consegue lê-la.

### Notas técnicas
- Os dados são salvos no navegador do aparelho (localStorage). Isso é frágil para uso real:
  somem ao limpar o navegador e não sincronizam entre dispositivos. Por isso o backup em JSON
  é a forma recomendada de proteger os dados nesta fase.
- Aplicativo estático (HTML + CSS + JS), pensado para hospedagem no GitHub Pages.

<!-- Ao publicar no GitHub, troque o "#" abaixo pelos links de comparação do seu repositório,
     ex.: https://github.com/machadocreative/China-Engine/releases/tag/v0.3.0 -->
[Não lançado]: #
[0.3.0]: #
[0.2.1]: #
[0.2.0]: #
[0.1.0]: #
