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

## Planejado (futuro — fora do escopo atual)

Módulo financeiro, a ser desenvolvido **após** o polimento das funcionalidades de estoque,
integrando as movimentações de entrada e saída com a gestão financeira da loja:

- Exportação em `.ofx`.
- Registro do tipo de recebimento na saída (venda em espécie, cartão de crédito, Pix, conta bancária em que foi recebido etc.).
- Emissão/registro de recibo fiscal.
- Registro de despesas da loja (aluguel, energia, internet, funcionários, compra de insumos etc.).
- Apuração de lucro da operação (entender se o negócio dá lucro de fato).

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
     ex.: https://github.com/machadocreative/China-Engine/releases/tag/v0.2.0 -->
[Não lançado]: #
[0.2.0]: #
[0.1.0]: #
