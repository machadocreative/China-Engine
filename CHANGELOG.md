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

Próximas etapas do módulo financeiro (iniciado na 0.4.0 com o Faturamento MEI),
integrando as movimentações de entrada e saída com a gestão financeira da loja:

- Decidir se as vendas registradas no estoque também contam no faturamento do MEI (hoje só as notas fiscais importadas contam) e como evitar contar duas vezes uma venda que tem nota.
- Exportação em `.ofx`.
- Registro do tipo de recebimento na saída (venda em espécie, cartão de crédito, Pix, conta bancária em que foi recebido etc.).
- Emissão/registro de recibo fiscal.
- Registro de despesas da loja (aluguel, energia, internet, funcionários, compra de insumos etc.).
- Apuração de lucro da operação (entender se o negócio dá lucro de fato).

---

## [2.3.0] - 2026-11-10

### Adicionado

- **Configurações no menu lateral (PC):** virou um item do menu lateral. No celular, continua na engrenagem do cabeçalho.
- **Chave do Modo Faz-de-Conta no PC:** fica no pé do menu lateral e mostra se o modo está ligado. Ela funciona junto com a chave de Configurações.
- **Campo de leitura do PDV:** o contorno pulsa de leve, para ficar mais fácil de achar. Quem ativou "reduzir movimento" no sistema vê o contorno fixo.
- **Movimentação avulsa (Histórico):** o Histórico ganhou o botão ⊕ de ações rápidas, por enquanto com uma ação, "Inserir movimentação avulsa". Ela registra receitas que não passam pelo estoque, como xerox, impressão, fichas de jogo, reparos ou a venda de um produto sem cadastro.
  - **Campos:** data, breve descrição, tipo (Serviço ou Produto), valor e forma de pagamento.
  - **No Histórico:** aparece com o selo verde "Avulsa", a forma de pagamento, a descrição e o tipo na coluna Categoria. Entra no saldo do dia, e o filtro Tipo ganhou a opção "Avulsa".
  - **Edição:** toque longo, com a senha do gerente. Dá para corrigir ou excluir.
  - **Nas Métricas:** entra no faturamento, nas formas de pagamento, nos dias da semana e nas melhores datas. Em "Vendas por categoria" aparece como "Serviços" ou "Produtos avulsos". Não entra no ranking de produtos mais vendidos. Como não tem custo informado, conta inteira no lucro, e uma nota avisa quanto do período veio de avulsas.
  - **Outros aparelhos:** recebem a notificação de "Movimentação avulsa", como numa venda.
  - **Dados:** ficam em `avulsas`, junto do estoque. Vão no backup e na sincronização e nunca mexem no estoque.

### Alterado

- **Desempenho → Métricas:** o módulo mudou de nome no menu, no título da tela e nos textos do app.
- **Sandbox → Modo Faz-de-Conta:** a pedido do gerente, o modo de teste mudou de nome na faixa amarela, em Configurações, no menu lateral e nos avisos.
- **PDV com o caixa livre:** a tela mostra só o visor, o campo de leitura e "Iniciar venda (F2)". A leitura de um código nesse estado continua sendo consulta de preço. "Consultar preço (F4)" volta a aparecer depois que a venda começa, e o menu ☰ do celular segue a mesma regra.
- **Menu lateral do PC:** passa a ter 350px de largura. Em telas de PC mais estreitas, até 1279px, fica com 270px para o PDV continuar em duas colunas.
- **Categorias de produtos:** a lista voltou a ficar num modal, aberto pelo botão "Gerenciar categorias" em Configurações. O campo de nova categoria fica fixo no topo do modal e só a lista rola.
- **Nova ordem das Configurações:** Categorias, Notificações de venda, Sincronização na nuvem, Backup dos dados, Senha do gerente, Modo Faz-de-Conta e Financeiro.
- **Número da versão:** saiu do cabeçalho e agora aparece só no fim de Configurações.

---

## [2.2.0] - 2026-11-10

### Adicionado

- **Histórico agrupado:** os produtos de uma mesma venda do PDV, ou de uma mesma compra em lote, aparecem juntos num só bloco.
  - O bloco tem um selo de tipo, a forma de pagamento, o horário (ou o fornecedor, na compra) e o total da operação. Embaixo vêm os produtos, em linhas mais leves.
  - O toque longo num produto continua abrindo a edição.
  - As compras em lote passam a guardar a identificação do lote, mas só as feitas a partir desta versão aparecem agrupadas. Registros antigos continuam um por linha.
- **Subtotais do dia no Histórico:** quando o dia tem entradas e saídas de dinheiro, aparecem "Entradas" e "Saídas" ao lado do "Saldo no dia".
- **Desempenho depois da venda:** a tela de venda concluída mostra um link para o Desempenho.
- **Menu ☰ no PDV (celular e tablet):** reúne Iniciar venda, Consultar preço, Aplicar desconto, Finalizar venda e Cancelar venda, no mesmo estilo do botão ⊕.
- **Menu lateral no PC:** em telas com mais de 900px, a navegação vira um menu lateral à esquerda, com ícone e nome lado a lado e o logo da loja no topo. A barra inferior fica só no celular e no tablet em pé.
- **Atalho para o Financeiro em Ajustes:** novo bloco "Financeiro (em pausa)".

### Alterado

- **PDV no celular e no tablet:** os botões saíram da tela e foram para o menu ☰. O campo de leitura do código de barras desceu para depois da lista de itens e do total.
- **Comemoração da venda:** some sozinha depois de 15 segundos, e o caixa volta a ficar livre.
- **Estoque:**
  - os filtros e o cabeçalho da tabela ficam fixos, e só a lista de produtos rola;
  - os filtros seguem o mesmo visual do Histórico: Categoria, Ordenar e Crescente/Decrescente em chips, com a busca à direita.
- **Valores no Histórico e no Painel do Produto:**
  - o total fica maior e em destaque;
  - quando a movimentação é de 1 unidade, o valor unitário não se repete embaixo.
- **Botão ⊕:** aparece só no Estoque, com Novo produto e Nova compra em lote.
- **Navegação:** fica com PDV, Estoque, Histórico e Desempenho.

### Removido

- Coluna e ordenação por **custo médio** na lista do Estoque. É uma informação sensível; ela continua no Painel do Produto.
- "Nova venda" do botão ⊕. A venda é feita pelo PDV.
- Botão ⊕ da tela Histórico.
- **Financeiro** da navegação principal. O módulo continua acessível pelo atalho em Ajustes.

---

## [2.1.0] - 2026-11-10

### Adicionado

- **Comemoração da venda:** ao finalizar uma venda no PDV, uma chuva de confete nas cores da marca sai dos cantos da tela, e o visor mostra o mascote com a mensagem "Parabéns pela venda!", o total e a forma de pagamento. Quem ativou "reduzir movimento" no sistema vê só a mensagem, sem animação.
- **Imagem nova:** `icones/mascote-cabeca.png`, a cabeça do mascote usada na comemoração.

### Alterado

- **Ajustes no cabeçalho:** o botão Ajustes saiu da barra inferior e virou uma engrenagem no cabeçalho, à esquerda do sininho. Tocar de novo volta para a tela anterior. A barra inferior fica com PDV, Estoque, Histórico, Desempenho e Financeiro.
- **PDV antes da venda:**
  - o painel da direita (itens e total) só aparece depois de "Iniciar venda";
  - com o caixa livre, o visor e os botões ocupam a largura toda.
- **Alinhamento no PDV:**
  - o cabeçalho preto "Venda em andamento" tem a mesma altura da faixa do visor;
  - a linha preta acima do subtotal fica na altura do campo de leitura do código de barras.
- **Câmera só no celular:** os botões de ler o código de barras com a câmera não aparecem mais no computador. Isso vale para o PDV, o cadastro de produto, a aba Dados e a compra em lote. No PC, o leitor USB digita direto no campo.

---

## [2.0.0] - 2026-11-10

Versão com o PDV como tela inicial, forma de pagamento, notificações entre aparelhos e modo de teste.

### Adicionado

**PDV — Ponto de venda (nova tela inicial)**
- O app abre direto no PDV, pensado para o leitor de código de barras no PC. A tela usa a largura toda, com o nome do produto e o preço de venda em letras grandes.
- "Iniciar venda" abre a venda. Cada produto lido entra na lista ao lado, que mostra quantidade, subtotal e total.
- "Consultar preço" mostra o produto sem colocar na venda e vale só para a próxima leitura. Sem venda aberta, toda leitura é uma consulta.
- "Aplicar desconto" funciona na venda toda ou em um item, em R$ ou em %, sempre com a senha do gerente. O desconto é repartido entre os itens, então o lucro no Desempenho continua certo.
- "Finalizar venda" pede a forma de pagamento e lança as saídas de todos os produtos de uma vez.
- O campo de leitura aceita o leitor USB, a câmera e a busca por nome, marca ou código. No PC, qualquer tecla digitada fora de um campo vai para ele.
- Atalhos de teclado: F2 inicia a venda, F4 consulta preço, F8 aplica desconto e F9 finaliza. Na tela de finalizar, as teclas 1 a 4 escolhem a forma de pagamento e Enter confirma.
- O visor avisa quando o código não foi encontrado, quando o produto está sem estoque ou sem preço cadastrado.
- A venda em andamento não se perde se a página for recarregada.
- O visor já tem o espaço da foto do produto. Por enquanto, a foto vem de um link de imagem informado na aba Dados do produto.

**Forma de pagamento**
- Cada venda registra uma forma de pagamento: Espécie, Pix, Cartão de crédito ou Outros. É só registro, o app não processa pagamentos.
- A forma é escolhida ao finalizar no PDV. Também pode ser informada em Registrar saída, ao receber uma venda "a receber" e na edição da movimentação.
- No Histórico e no Painel do Produto, a forma aparece abaixo do selo da venda.
- O Desempenho ganhou o bloco "Formas de pagamento", com o faturamento e o número de vendas de cada forma.

**Pontos de atenção no sininho**
- Estoque baixo e pagamentos pendentes viraram uma tela própria, aberta pelo sininho do cabeçalho. Tocar de novo no sininho volta para a tela anterior.

**Notificações de venda entre aparelhos**
- Quando uma venda é concluída, os outros aparelhos conectados à sincronização recebem uma notificação, mesmo com o app fechado.
- Cada aparelho ativa em Configurações → Notificações de venda. Há um botão para enviar um teste.
- Se a venda for feita sem internet, o aviso fica guardado por até 6 horas e sai quando a conexão voltar.
- O Worker de sincronização ganhou as rotas de notificação. As chaves são criadas sozinhas e ficam no banco D1, sem senha nova para cadastrar. O texto do aviso viaja criptografado até o aparelho.
- Arquivos novos: `sw.js` e `manifest.webmanifest` na raiz do site, e os ícones na pasta `icones/`. Com eles, o app também pode ser instalado na tela de início do celular.

**Favicon e ícones do app com o mascote**
- Ícone da aba do navegador com a cabeça do mascote sorrindo, sobre um círculo amarelo da marca: `favicon.ico` (16, 32 e 48 px) e `favicon-96.png` (telas de alta resolução). Nos tamanhos de 16 e 32 px o rosto aparece um pouco maior, para continuar reconhecível.
- Ícones do app instalado no celular também com o mascote, sobre fundo amarelo: `icone-192.png`, `icone-512.png`, `icone-180.png` (iPhone) e o novo `icone-maskable-512.png` (Android, com a cabeça dentro da área que o sistema recorta em círculo ou outras formas).
- Selo das notificações no Android (`icone-selo-96.png`): silhueta branca da cabeça do mascote.

**Sandbox (modo de teste)**
- Nova chave em Configurações. Com o sandbox ligado, nada é salvo, sincronizado ou notificado, e uma faixa amarela avisa o tempo todo.
- Ao desligar, ou ao recarregar a página, os dados voltam a ser exatamente os de antes.
- Backup, restauração e sincronização ficam bloqueados enquanto o sandbox está ligado.

### Alterado

- **Barra inferior:** ganhou o item **PDV** como primeiro da lista. Quando os seis nomes não cabem na largura da tela, só o item ativo mostra o nome.
- **Botão ⊕:** "Nova venda" agora abre o PDV com uma venda já iniciada. As ações rápidas do toque longo no Estoque continuam iguais, sem passar pelo PDV.
- **Logo e título do cabeçalho:** voltam para o PDV.
- **Configurações:** a ordem dos blocos passa a ser Categorias, Senha do gerente, Backup, Sincronização na nuvem, Notificações de venda e Sandbox.

### Corrigido

- A data de hoje usava o horário universal. Depois das 21h, vendas e entradas eram registradas com a data do dia seguinte. Agora vale a data do aparelho.

### Removido

- Consulta de produtos pela API GTIN: bloco de Configurações, preenchimento automático no cadastro e na compra em lote, e o arquivo `cloudflare/gtin-worker.js`. Ela não encontrava os produtos da loja. O endereço e a chave guardados no aparelho são apagados.
- Janela antiga "Nova venda", substituída pelo PDV.
- Tela Início com os atalhos grandes, substituída pelo PDV e pela tela do sininho.

---

## [1.0.0] - 2026-11-09

Primeira versão estável do China Engine. A numeração passa para a série 1.x.

### Adicionado

- **Início:** atalhos grandes para Nova venda, Nova compra em lote e Novo produto, com os mesmos ícones das ações rápidas. Eles ficam acima dos pontos de atenção.
- **Estoque:** novas opções de ordenação por **Marca** e **Categoria**, com desempate pelo nome. Produtos sem marca ficam no fim.
- **Histórico:** nova coluna **Produto**, separada da coluna Movimentação. A coluna do tipo tem largura fixa, então os nomes ficam alinhados à esquerda qualquer que seja o tamanho do selo.

### Alterado

- **Novo produto:** os campos de estoque inicial só aparecem ao marcar a caixa "Estoque inicial?". O custo por unidade vem antes da quantidade, e com a caixa marcada os dois campos são obrigatórios.
- **Estoque:** o selo "estoque baixo" fica abaixo do número de unidades, e não mais ao lado do nome. No celular, aparece como "baixo".
- **Histórico:**
  - As movimentações de Estoque inicial ficam ocultas por padrão. Elas só aparecem ao escolher Tipo → Estoque inicial.
  - No celular, a coluna do tipo se chama "Tipo", o selo do estoque inicial aparece como "Inicial" e a quantidade aparece abaixo do valor.
- **Início:**
  - O botão ⊕ de ações rápidas não aparece mais nessa tela; continua em Estoque e Histórico.
  - Os blocos "Estoque baixo" e "Pagamentos pendentes" só aparecem quando têm itens. Sem nenhum dos dois, fica só uma linha "Tudo em dia".
- **Tipografia:** o tamanho mínimo de fonte em todo o app passa a ser **14px**, inclusive nos eixos dos gráficos.
- **Campos lado a lado:** ficam alinhados mesmo quando um rótulo quebra em duas linhas.
- **Rótulo "Marca":** o antigo "Marca / fabricante" virou "Marca" no cadastro e na aba Dados.
- **Barra inferior:** "Configurações" passa a se chamar **"Ajustes"** para caber com a fonte de 14px. O título da tela continua "Configurações".
- **Configurações:** nova ordem dos blocos: Categorias, Senha do gerente, Backup, Sincronização na nuvem e Consulta por código de barras.
- **Placeholder do endereço da sincronização:** passa a mostrar o nome do Worker `china-sync`.

---

## [0.10.0] - 2026-11-09

### Adicionado

**Sincronização na nuvem**
- Novo bloco "Sincronização na nuvem" em Configurações, com endereço do Worker, senha da sincronização e nome do aparelho. Esses dados ficam salvos só no aparelho, fora do GitHub e do backup.
- Os dados da loja (o mesmo conteúdo do backup) ficam no Cloudflare do próprio usuário, num Worker com banco D1 do plano gratuito. O código está em `cloudflare/sync-worker.js`, e a senha fica guardada como segredo no Worker (`SENHA_SYNC`).
- Envio automático poucos segundos depois de cada alteração (no máximo 30 s de espera) e ao sair do app.
- Recebimento automático ao abrir o app, ao voltar para ele, a cada 30 s com o app aberto e quando a internet volta.
- Alterações feitas em aparelhos diferentes são juntadas automaticamente, item por item, sem que um aparelho sobrescreva o outro:
  - vendas, entradas, produtos e notas novas dos dois lados entram;
  - um item apagado num aparelho e editado no outro é mantido;
  - o mesmo campo editado nos dois vale pela alteração mais recente.
- A junção nunca acontece com um formulário aberto. Ela espera o formulário fechar.
- Primeira conexão:
  - se a nuvem estiver vazia, o aparelho envia os dados dele;
  - se o aparelho estiver vazio, recebe os dados da nuvem;
  - se os dois tiverem dados, o app pergunta quais manter e oferece baixar um backup antes.
- Status em Configurações mostra se está sincronizado, enviando, sem internet ou com erro, além do horário e do aparelho da última alteração. Erros também aparecem como aviso rápido.
- Cópias diárias na nuvem: o Worker guarda como os dados estavam no fim de cada dia, pelos últimos 30 dias. Em Configurações, "Cópias diárias" lista e baixa cada cópia como arquivo de backup.

### Alterado

- O texto do bloco Backup dos dados agora menciona a nuvem.
- O modal de aviso aceita outro rótulo no botão de fechar (usado como "Agora não" na escolha da primeira conexão).

### Segurança

- A senha do gerente continua sendo só uma trava de operação e **não** protege a sincronização. Quem protege os dados na nuvem é a `SENHA_SYNC`, guardada como segredo no Worker. O Worker compara a senha em tempo constante, atrasa as tentativas erradas e só aceita chamadas do site do app (CORS).

---

## [0.9.4] - 2026-11-09

### Adicionado

**Estoque inicial (cadastro da loja)**
- Novo bloco opcional "Estoque que já está na loja" no cadastro de **Novo produto**, com quantidade e custo por unidade. O produto já nasce com estoque, sem precisar registrar uma entrada depois.
- Esse lançamento vira uma entrada marcada como **Estoque inicial**. Ela conta no estoque, no custo médio, na composição (FIFO) e no lucro, mas **não** é tratada como compra.
- No Histórico, aparece com selo cinza tracejado "Estoque inicial", mostra o valor em estoque (sem sinal) com a nota "fora do saldo" e não entra no "Saldo no dia".
- Novo tipo "Estoque inicial" no filtro Tipo do Histórico.

### Alterado

- Painel do Produto: na Composição, os lotes de estoque inicial aparecem como "Estoque inicial" em vez de "Não informado". Esses lotes também não entram na aba Fornecedores, já que não são compras.
- Edição de movimentação: o estoque inicial pode ter data, quantidade e custo corrigidos, mas não tem campo de fornecedor.
- Compras feitas daqui em diante, por Registrar entrada ou Compra em lote, continuam como "Aquisição" e pesam no saldo do dia.

---

## [0.9.3] - 2026-11-09

### Adicionado

- **Servidor intermediário da API GTIN (Cloudflare Worker):** novo arquivo `cloudflare/gtin-worker.js`, que roda no Cloudflare (plano gratuito). O usuário e a senha da API ficam guardados nele como segredos (`GTIN_USUARIO`, `GTIN_SENHA`). Ele gera e reaproveita o token e repassa só a consulta do código de barras para o app. Aceita apenas chamadas do site do China Engine que enviem a chave do app (`CHAVE_APP`). O arquivo não contém senhas e pode ficar no GitHub.

### Alterado

- **Consulta por código de barras:** o app passa a consultar a API GTIN pelo Worker, porque a API não aceita chamadas direto do navegador (bloqueio de CORS confirmado no teste).
- Em **Configurações → Consulta por código de barras**, os campos "Usuário" e "Senha" da API deram lugar a **"Endereço do Worker"** e **"Chave do app"**, salvos só no aparelho e fora do backup. "Salvar e testar" confere a chave e o login da API pelo Worker.
- Usuário e senha da API salvos no aparelho pela 0.9.0 são apagados automaticamente.

---

## [0.9.2] - 2026-11-09

### Removido

- Botão "Categorias" do cabeçalho da tela Estoque e o modal de categorias. As categorias agora são gerenciadas só em **Configurações → Categorias de produtos**, deixando o cabeçalho limpo.

---

## [0.9.1] - 2026-11-09

### Adicionado

- **Configurações → Categorias de produtos:** gerenciamento completo das categorias direto na tela de Configurações. É possível adicionar (Enter ou botão), renomear (Enter salva, Esc cancela) e remover. Cada categoria mostra quantos produtos usa.
- As mesmas regras de antes valem aqui: nomes sanitizados, sem duplicados; renomear uma categoria com estoque ativo pede confirmação e move os produtos para o novo nome; remover só é possível em categorias sem produtos.

### Alterado

- Remover uma categoria agora pede confirmação.

---

## [0.9.0] - 2026-11-09

### Adicionado

**Consulta por código de barras (API GTIN)**
- Integração com a API GTIN (gtin.rscsistemas.com.br) para preencher **marca, nome e categoria** ao cadastrar um produto novo.
- Em **Configurações**, novo bloco "Consulta por código de barras": usuário e senha da conta na API, com "Salvar e testar" (testa a conexão na hora) e "Remover deste aparelho". As credenciais ficam salvas só no aparelho, separadas dos dados do app: não vão para o GitHub nem para o arquivo de backup.
- **Novo produto:** ao ler o código de barras (câmera ou leitor USB) ou digitá-lo, o app consulta a API e preenche os campos que estiverem vazios. Uma linha de status abaixo do campo mostra o resultado: encontrado, não encontrado, código inválido ou erro.
- **Nova compra em lote:** ao cadastrar um produto novo numa linha com código lido e não cadastrado no estoque, os dados também são buscados na API.
- **Categoria:** só é sugerida se existir no China Engine. A sugestão usa palavras do nome (ex.: "controle" → Joysticks, "cabo" → Cabos), depois o NCM (ex.: 8544 → Cabos, 8517 → Celulares, 8523 → Memória e armazenamento) e, por fim, a categoria informada pela API.
- Nomes que vêm em letras maiúsculas são ajustados (ex.: "CABO USB C 2M" → "Cabo USB C 2m").
- O token da API (válido por 1 hora) é gerado e renovado automaticamente.
- O dígito verificador é conferido antes de consultar, para evitar a suspensão da conta que a API aplica após vários códigos inválidos.
- Mensagens claras para usuário ou senha incorretos, limite do plano, termos de uso pendentes, suspensão temporária e bloqueio de conexão pelo navegador.

### Alterado

- No cadastro de Novo produto, o campo "Código de barras" passou para o topo do formulário e já vem selecionado ao abrir, pronto para o leitor USB.

---

## [0.8.6] - 2026-11-07

### Alterado

- **Acesso rápido (botão ⊕):** as opções Nova venda, Novo produto e Nova compra em lote agora ficam dentro de uma caixa escura, com o ícone à esquerda e o nome à direita, e destaque na opção sob o cursor.
- **Fornecedor só nas entradas:** o fornecedor passa a ser informado apenas no registro de entrada e na Nova compra em lote ("Fornecedor da compra"). O campo de entrada sugere o fornecedor da compra mais recente desse produto que tenha um.

### Removido

- Campo "Fornecedor" do cadastro de novo produto, do formulário de produto novo dentro da compra em lote e da aba Dados do Painel do Produto ("Fornecedor principal").
- Selo "principal" na aba Fornecedores. O produto também não adota mais automaticamente o primeiro fornecedor informado numa entrada.

---

## [0.8.5] - 2026-11-07

### Alterado

- Desempenho: o card "Produtos parados" não aparece quando ainda não há produtos cadastrados no estoque (produtos arquivados não contam).

---

## [0.8.4] - 2026-11-07

### Adicionado

- **Nova compra em lote — código de barras:** botão com ícone de código de barras ao lado do campo de busca de cada item. Ele abre a câmera e, ao ler o código de um produto cadastrado, seleciona o produto na linha, preenche o custo da última compra e leva o cursor para a Quantidade.
- Leitor USB na compra em lote: com o campo de busca focado, a leitura (que termina com Enter) seleciona o produto pelo código de barras ou SKU. Enter também seleciona quando a busca tem um único resultado.
- Se o código lido não estiver cadastrado, o app avisa e guarda o código: ao escolher "Cadastrar novo produto" nessa linha, o produto novo já é criado com esse código de barras. Produtos arquivados não são selecionados (o app avisa para desarquivar).

---

## [0.8.3] - 2026-11-07

### Alterado

- Valores e números (preços, quantidades, totais, datas, gráficos) passaram a usar a fonte do texto, **IBM Plex Sans**, com algarismos de largura fixa (`tabular-nums`), para continuarem alinhados em colunas.

### Removido

- Fonte **IBM Plex Mono** removida do projeto (do carregamento do Google Fonts, da variável `--mono` do CSS e dos estilos no JavaScript).

---

## [0.8.2] - 2026-11-07

### Alterado

- Entradas sem fornecedor informado não são mais atribuídas ao fornecedor principal do produto. Na aba Fornecedores do Painel do Produto, elas aparecem num grupo próprio, **"Não informado"** (sempre por último, com borda tracejada), e na Composição do estoque aparecem como "Não informado".
- A aba Fornecedores continua aparecendo só quando o produto tem ao menos um fornecedor informado. O contador da aba conta apenas os fornecedores com nome.
- Na edição de movimentação, o campo Fornecedor vazio passou a significar "Não informado".

### Removido

- O asterisco (*) e a nota "Entrada antiga, atribuída ao fornecedor principal" da aba Fornecedores.

---

## [0.8.1] - 2026-11-07

### Alterado

- **Composição do estoque atual** (aba Estoque do Painel do Produto): os badges viraram uma lista agrupada por preço de custo. Cada grupo mostra o custo unitário, as unidades e o valor em estoque; abaixo, cada compra que ainda tem unidades, com data, fornecedor e quantas unidades restam (ex.: "5 de 30 un."). O lote mais antigo, que é o próximo a sair nas vendas, leva o selo "sai primeiro".
- No celular, os cards da aba Estoque do Painel do Produto ficam em 2 colunas, deixando o modal mais compacto.

---

## [0.8.0] - 2026-11-07

### Adicionado

**Módulo Desempenho**
- Novo item **Desempenho** na barra inferior (Estoque · Histórico · Desempenho · Financeiro · Configurações), com métricas e gráficos das vendas.
- Navegação por período igual à do Histórico: Hoje, Esta semana, Este mês, Este ano, Todo o período e Escolher período.
- **Desempenho de lucro**: faturamento, custo das vendas, lucro bruto e margem do período. O custo de cada venda é o do lote vendido (as unidades mais antigas saem primeiro, a mesma lógica da Composição do estoque).
- **Evolução no tempo**: gráfico de linha com faturamento e lucro por dia (ou por mês em períodos longos), com detalhes ao passar o mouse ou tocar.
- **Vendas por categoria**: faturamento por categoria, com unidades e margem.
- **Dias da semana**: faturamento por dia da semana, com o melhor dia em destaque e a média por dia nos detalhes.
- **Melhores datas**: os 5 dias com maior faturamento no período.
- **Produtos mais vendidos**: top 10 por unidades ou por faturamento, com o lucro de cada um.
- **Produtos parados**: produtos com estoque e sem venda há 30 dias ou mais, com o custo parado (não depende do período). Tocar abre o Painel do Produto.
- Vendas "a receber" ainda pendentes não entram nos números até o recebimento (o app avisa quantas unidades estão nessa situação).
- Opção **Este ano** também no menu de período do Histórico.

**Excluir movimentação**
- Na edição de movimentação (Histórico ou aba Movimentações do Painel do Produto, com toque e segure e senha do gerente), uma área "Excluir movimentação" permite apagar o registro.
- Dupla confirmação: a primeira mostra o efeito no estoque (de quantas para quantas unidades) e recomenda baixar um backup; a segunda avisa que a exclusão é definitiva.
- Atalho "↓ Backup" ao lado do botão de excluir, e aviso após a exclusão com o novo estoque e o botão "Baixar backup agora".
- A exclusão de uma aquisição é bloqueada se deixar o estoque negativo (parte das unidades já saiu); nesse caso o app sugere editar a quantidade.

### Corrigido

- Modais de confirmação, senha e aviso agora sempre aparecem por cima de outro modal aberto (antes, uma confirmação pedida de dentro da edição de movimentação podia ficar escondida atrás dela).
- A rolagem acontecia na página inteira, e a barra de rolagem passava por cima do cabeçalho e da barra inferior (visível principalmente no Financeiro). Agora o cabeçalho e a barra inferior ficam fixos e só a área de conteúdo rola, em todas as telas. No Histórico, continua rolando só a lista.

### Alterado

- O campo "Fornecedor da compra" da Nova compra em lote passou a fazer parte do `index.html` (antes era criado pelo JavaScript).
- Nome da loja padronizado como "Chinatown Imports" no `index.html` (título da página, `og:title`, texto alternativo do logo e subtítulo do cabeçalho).

---

## [0.7.0] - 2026-11-07

### Adicionado

**Painel do Produto em abas**
- O painel aberto com um toque no produto foi reorganizado em abas:
  - **Estoque**: os 6 cards (estoque atual, a receber, custo médio, preço de venda, lucro estimado, variação de custo) e a composição do estoque atual.
  - **Registrar**: os blocos de registrar entrada e registrar saída.
  - **Movimentações**: histórico do produto agrupado por dia, no mesmo layout do Histórico geral (com toque e segure para editar). Só aparece se houver movimentações.
  - **Dados**: edição do produto direto no painel, com Salvar, Arquivar/Desarquivar e Excluir.
  - **Fornecedores**: cada fornecedor com total comprado, unidades, data da última compra e a lista de entradas (data, quantidade e custo). Só aparece se houver fornecedor informado.
- "Editar informações do produto", nas ações rápidas (toque e segure), abre o painel direto na aba Dados.

**Fornecedor por entrada**
- Cada entrada agora pode registrar de qual fornecedor veio: campo "Fornecedor" no registro de entrada (já preenchido com o último fornecedor usado ou o principal do produto) e "Fornecedor da compra" na Nova compra em lote (vale para todos os itens).
- O campo sugere os fornecedores já usados, para evitar o mesmo nome escrito de jeitos diferentes.
- O fornecedor da entrada também pode ser corrigido na edição de movimentação.
- Entradas antigas, sem fornecedor próprio, são atribuídas ao fornecedor principal do produto (marcadas com * na aba Fornecedores).

### Alterado

- O campo "Fornecedor" do cadastro passou a se chamar "Fornecedor principal" na aba Dados. Se o produto ainda não tem fornecedor, o primeiro informado numa entrada vira o principal.
- O leitor de código de barras por câmera agora preenche o campo de onde foi aberto (cadastro de novo produto ou aba Dados).

---

## [0.6.0] - 2026-11-07

### Adicionado

**Tela Configurações**
- O item "Configurações" da barra inferior foi habilitado, com:
  - **Backup dos dados**: "Baixar backup" e "Restaurar backup", com a data do último backup baixado (em vermelho se nunca foi feito ou se tem 7 dias ou mais).
  - **Senha do gerente**: alteração com senha atual, nova senha e repetição (mínimo de 4 caracteres). A nova senha fica salva com os dados do navegador e entra no backup; sem alteração, vale a senha padrão do código.

**Histórico — navegação por período**
- Seletor "‹ Novembro 2026 ›" no topo, com menu: Hoje, Esta semana, Este mês, Todo o período e Escolher período. As setas avançam ou voltam um dia, semana, mês ou intervalo escolhido. Abre em "Este mês".

### Alterado

**Histórico — novo layout**
- Movimentações agrupadas por dia, com uma linha de data por dia (com dia da semana) e "Saldo no dia" ao fim de cada grupo. A coluna Data saiu da tabela.
- A coluna Valor mostra o total da movimentação com sinal do caixa (+ venda, − aquisição) e o valor unitário embaixo.
- Filtros numa barra discreta de fundo próprio: Tipo, Categoria, Valor (mín–máx, em pop-up), Ordenar (ordem dentro de cada dia), Mais recentes / Mais antigos e busca por produto ou marca. Filtros ativos ficam destacados.
- O filtro Tipo agora separa Venda, Aquisição, A receber e Outras saídas.
- Período, filtros e cabeçalho da lista ficam sempre visíveis; só a lista de movimentações rola. A data de cada dia também fica presa no topo enquanto o dia é rolado.

**Cores das movimentações (ponto de vista do caixa)**
- "Venda" e "Recebido" em verde; entradas de estoque passam a se chamar **"Aquisição"**, em vermelho; "A receber" pendente em âmbar; Perda, Devolução, Ajuste e Outros em cinza. Vale para o Histórico, o mini-histórico do painel do produto e o modal de edição.

- O botão ⊕ também não aparece na tela Configurações.

### Removido

- Botões "↓ Backup" e "↑ Restaurar" do cabeçalho (agora em Configurações).
- Campos "De" e "Até" dos filtros do Histórico (substituídos pela navegação por período).

---

## [0.5.1] - 2026-11-07

### Corrigido

- O botão ⊕ não aparece mais na tela Financeiro (as ações dele são do estoque).

---

## [0.5.0] - 2026-11-07

### Adicionado

**Tela Início**
- Nova tela inicial, a primeira exibida ao abrir o app, com os pontos de atenção do vendedor:
  - **Estoque baixo**: produtos no mínimo ou abaixo dele (arquivados não entram), com botão "+ Entrada" para registrar o reabastecimento na hora.
  - **Pagamentos pendentes**: saídas "a receber" ainda não recebidas, das mais antigas para as mais novas, com quantos dias estão pendentes e botão "Receber".
- Tocar no logo/título do cabeçalho volta para o Início, como num site.
- Contador discreto no canto superior direito do cabeçalho (sino) com o número de pontos de atenção; tocar nele abre o Início.

**Botão ⊕ flutuante**
- Botão no canto inferior direito que reúne **Nova venda**, **Novo produto** e **Nova compra em lote**.

**Editar movimentações**
- No Histórico, tocar e segurar uma movimentação permite editá-la, após a senha do gerente: data, quantidade, valor (custo na entrada; preço de venda ou valor recebido na saída) e motivo da saída. A movimentação é sobrescrita no lugar.
- A edição é bloqueada se deixar o estoque negativo. A lista do estoque, o painel do produto (com o mini-histórico) e a tela Início refletem a alteração na hora.

**Arquivar produtos**
- Produtos podem ser arquivados (pelo toque longo na lista, pelo painel do produto ou pela edição do produto) e desarquivados do mesmo jeito.
- Arquivados somem da lista do estoque, da contagem do filtro de categorias, da Nova venda, da Compra em lote e do Início, mas aparecem quando o usuário pesquisa por eles, com fundo listrado e o selo "Arquivado". O histórico de movimentações é mantido.

**Compra em lote**
- Botão "+" ao lado do campo de busca de cada item, para cadastrar um novo produto direto (a opção continua também no fim da lista de resultados).
- O botão de remover item virou um círculo vermelho no canto superior direito do item, longe do "+", e pede confirmação antes de remover.

### Alterado

- "Registrar venda", "+ Novo produto" e "+ Compra em lote" saíram do cabeçalho e passaram para o botão ⊕. Os modais foram renomeados para "Nova venda" e "Nova compra em lote".
- Excluir produto agora pede confirmação e a senha do gerente, e sugere arquivar como alternativa (excluir apaga o histórico do produto).

---

## [0.4.1] - 2026-11-06

### Corrigido

- A marca dos produtos na lista do estoque não aparecia e, no lugar dela, surgia uma linha cinza vertical atravessando a tela. A classe `.marca` das divisões do medidor do Financeiro (adicionada na 0.4.0) colidia com a `.marca` do nome do produto; a do medidor foi renomeada para `.fin-marca`.

---

## [0.4.0] - 2026-11-06

### Adicionado

**Módulo Financeiro — Faturamento MEI**
- Integração do app "Controle de Faturamento MEI" ao China Engine, como tela **Financeiro** da barra inferior, com o visual do app principal.
- Importação de XML de NF-e / NFC-e (vários arquivos de uma vez): número, série, data de emissão, cliente e valor total. A mesma nota não entra duas vezes (confere a chave de acesso).
- Teto anual por ano fiscal, com seletor de ano: R$ 81.000 até 2026 e R$ 110.000 a partir de 2027. Os valores ficam numa tabela no início do bloco financeiro do `app.js`, para facilitar mudanças futuras.
- Valor disponível para faturar em destaque, medidor com marcas em 50%, 75% e 90% e alertas por faixa (âmbar, laranja, vermelho).
- Faixa de tolerância de 20%: o medidor vai até 120% do teto, com o trecho acima do teto listrado. Acima do teto, o app mostra o excesso e quanto falta para o fim da tolerância; acima de 20%, avisa sobre o desenquadramento retroativo.
- Teto proporcional automático no ano de abertura: basta informar o mês de abertura do MEI em "Configurar teto" (teto ÷ 12 × meses, contando o mês de abertura). Também é possível definir um teto manual por ano.
- Notas canceladas: importar o XML do evento de cancelamento (110111) tira a nota do total; ela continua na lista, riscada e marcada como "cancelada". O cancelamento vale mesmo se a nota for importada depois.
- Aviso ao cruzar faixa: quando uma importação faz o faturamento passar de 50%, 75%, 90%, do teto ou da tolerância, um modal informa a nova situação.
- Remoção de nota com o modal de confirmação do app.

**Navegação**
- A barra inferior agora alterna entre as telas **Estoque**, **Histórico** e **Financeiro**. **Configurações** continua desabilitado.
- O título do cabeçalho muda conforme a tela, e os botões do cabeçalho mostram só as ações do módulo aberto. Backup e Restaurar aparecem em todas as telas.

### Alterado

- O histórico geral de movimentações deixou de ser um modal aberto pelo cabeçalho e passou a ser uma tela da barra inferior, com os mesmos filtros e ordenação.
- "Gestão", na barra inferior, deu lugar a "Financeiro".
- Backup único: o arquivo de backup (agora `backup-china-engine-AAAA-MM-DD.json`) inclui estoque e financeiro. Restaurar um backup antigo do app Faturamento MEI adiciona as notas ao Financeiro sem mexer no estoque.

### Corrigido

- O aviso (toast) vazio não aparece mais como uma pequena forma no rodapé quando está oculto.

### Removido

- Botão "Histórico" do cabeçalho (substituído pelo item da barra inferior).

---

## [0.3.1] - 2026-11-06

### Adicionado

**Registrar venda**
- Novo botão "Registrar venda" no cabeçalho, com fluxo de venda de vários produtos: busca por texto (nome, marca, código ou código de barras) ou leitura do código de barras (câmera ou leitor USB). Só aparecem produtos com estoque.
- Leitor USB: ao fim da leitura (Enter), o produto com aquele código de barras ou SKU é adicionado direto à venda. Enter também adiciona o produto quando a busca por texto tem um único resultado.
- Cada produto entra na lista da venda com quantidade ajustável (limitada ao estoque disponível). Adicionar o mesmo produto de novo soma uma unidade.
- Total da venda calculado em tempo real. Ao confirmar, todas as saídas são lançadas de uma vez com motivo "Venda", usando o preço de venda cadastrado e a data informada.

**Fornecedor**
- Novo campo opcional "Fornecedor" no cadastro de produto (ao lado da Categoria) e no formulário de novo produto da Compra em lote. O valor fica salvo no perfil do produto.

### Alterado

- Compra em lote: a seleção de produto deixou de ser um dropdown e passou a ser um campo de busca por texto (nome, marca, código ou código de barras), com resultados em lista flutuante. Ao escolher um produto, o custo unitário vem preenchido com o valor da última compra.
- Compra em lote: "Cadastrar novo produto" aparece sempre no fim da lista de resultados. O texto digitado na busca é usado para pré-preencher o nome do novo produto.
- O leitor de código de barras por câmera agora reconhece o contexto em que foi aberto: na venda, identifica o produto pelo código e o adiciona à lista (se não encontrar, joga o código na busca); no cadastro, preenche o campo "Código de barras" como antes.

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
[2.3.0]: #
[2.2.0]: #
[2.1.0]: #
[2.0.0]: #
[1.0.0]: #
[0.10.0]: #
[0.9.4]: #
[0.9.3]: #
[0.9.2]: #
[0.9.1]: #
[0.9.0]: #
[0.8.6]: #
[0.8.5]: #
[0.8.4]: #
[0.8.3]: #
[0.8.2]: #
[0.8.1]: #
[0.8.0]: #
[0.7.0]: #
[0.6.0]: #
[0.5.1]: #
[0.5.0]: #
[0.4.1]: #
[0.4.0]: #
[0.3.1]: #
[0.3.0]: #
[0.2.1]: #
[0.2.0]: #
[0.1.0]: #
