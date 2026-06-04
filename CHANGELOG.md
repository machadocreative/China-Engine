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
     ex.: https://github.com/SEU-USUARIO/SEU-REPO/releases/tag/v0.1.0 -->
[Não lançado]: #
[0.1.0]: #
