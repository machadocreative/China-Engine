/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */
const VERSAO = '2.1.0';
const CHAVE = 'chinatown_estoque_v1';

/* Senha do gerente para alterar preço (na saída e na edição do produto).
   OBS: por estar no código, ela serve como trava de operação
   (estilo caixa de supermercado), não como segurança real. */
const SENHA_ADMIN = 'CHINAMASTER999';   // senha padrão; pode ser trocada em Configurações

/* ===== Armazenamento (localStorage com fallback em memória) ===== */
let memoria = null;
const Armazenamento = {
  ler(){
    try{ const t = localStorage.getItem(CHAVE); return t ? JSON.parse(t) : null; }
    catch(e){ return memoria; }
  },
  gravar(dados){
    if(sandbox.ativo) return;   // sandbox: nada é gravado neste aparelho
    memoria = dados;
    try{ localStorage.setItem(CHAVE, JSON.stringify(dados)); }catch(e){}
  }
};
/* Sandbox (modo de teste): ver o bloco SANDBOX mais abaixo */
let sandbox = { ativo:false, copia:null };

/* ===== Estado ===== */
let estado = Armazenamento.ler() || criarExemplo();
let ordenarPor = 'nome';
let direcao = 'asc';

function salvar(){ Armazenamento.gravar(estado); if(typeof atualizarAlertas==='function') atualizarAlertas(); if(typeof syncMarcarAlteracao==='function') syncMarcarAlteracao(); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function hoje(){ return isoDe(new Date()); }   // data local do aparelho (não UTC: depois das 21h o UTC já é o dia seguinte)
function prod(id){ return estado.produtos.find(p=>p.id===id); }
function aberto(id){ return document.getElementById(id).classList.contains('aberto'); }
function val(id){ const el=document.getElementById(id); return el ? el.value : ''; }
function sanitizarCategoria(v){
  return v.replace(/[^A-Za-zÀ-ÿ0-9 \-\/&]/g,'').replace(/\s{2,}/g,' ');
}
/* SKU automático: prefixo da categoria + sufixo aleatório único */
function gerarSku(categoria){
  const base = (categoria||'').replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase() || 'SKU';
  let sku;
  do{ sku = base + '-' + Math.random().toString(36).slice(2,6).toUpperCase(); }
  while(estado.produtos.some(p=>p.codigo===sku));
  return sku;
}

/* =========================================================
   CÁLCULOS
   ========================================================= */
function entradas(p){ return p.movimentacoes.filter(m=>m.tipo==='entrada'); }
function saidas(p){ return p.movimentacoes.filter(m=>m.tipo==='saida'); }
function estoqueDe(p){
  return entradas(p).reduce((s,m)=>s+m.qtd,0) - saidas(p).reduce((s,m)=>s+m.qtd,0);
}
function custoMedioDe(p){
  const ent = entradas(p);
  const totalQtd = ent.reduce((s,m)=>s+m.qtd,0);
  if(totalQtd===0) return null;
  return ent.reduce((s,m)=>s+m.qtd*m.custoUnit,0) / totalQtd;
}
function custosLotes(p){
  const c = entradas(p).map(m=>m.custoUnit);
  if(c.length===0) return null;
  return { min:Math.min(...c), max:Math.max(...c) };
}
function ultimoCustoDe(p){
  const ent = [...entradas(p)].sort((a,b)=>b.data.localeCompare(a.data));
  return ent.length ? ent[0].custoUnit : null;
}
function aReceberDe(p){
  return saidas(p).filter(m=>m.motivo==='A receber' && !m.recebido).reduce((s,m)=>s+m.qtd,0);
}
function composicaoEstoque(p){
  const lotes = [...entradas(p)].sort((a,b)=>a.data.localeCompare(b.data))
                .map(m=>({custo:m.custoUnit, qtd:m.qtd}));
  let baixa = saidas(p).reduce((s,m)=>s+m.qtd,0);
  for(const l of lotes){
    if(baixa<=0) break;
    const tira = Math.min(l.qtd, baixa);
    l.qtd -= tira; baixa -= tira;
  }
  const grupos = [];
  for(const l of lotes){
    if(l.qtd<=0) continue;
    const g = grupos.find(x=>Math.abs(x.custo-l.custo)<0.001);
    if(g) g.qtd += l.qtd; else grupos.push({custo:l.custo, qtd:l.qtd});
  }
  return grupos;
}
/* Composição detalhada: o que sobrou de cada compra (FIFO), agrupado por preço de custo.
   Grupos na ordem em que vão sair (o lote mais antigo primeiro). */
function composicaoDetalhada(p){
  const lotes = entradas(p).map((m,i)=>({ m, i, resta:m.qtd }))
                .sort((a,b)=>a.m.data.localeCompare(b.m.data) || a.i-b.i);
  let baixa = saidas(p).reduce((s,m)=>s+m.qtd,0);
  for(const l of lotes){
    if(baixa<=0) break;
    const tira = Math.min(l.resta, baixa);
    l.resta -= tira; baixa -= tira;
  }
  const grupos = [];
  lotes.filter(l=>l.resta>0).forEach(l=>{
    let g = grupos.find(x=>Math.abs(x.custo-l.m.custoUnit)<0.001);
    if(!g){ g = { custo:l.m.custoUnit, qtd:0, lotes:[] }; grupos.push(g); }
    g.qtd += l.resta;
    g.lotes.push({ data:l.m.data, qtdCompra:l.m.qtd, resta:l.resta, fornecedor:fornecedorDaEntrada(p, l.m), inicial:!!l.m.inicial });
  });
  return grupos;
}
function lucroDe(p){
  const cm = custoMedioDe(p);
  if(!p.preco || cm==null) return null;
  const unit = p.preco - cm;
  const margem = p.preco>0 ? (unit/p.preco*100) : 0;
  return { unit, margem, total: unit*estoqueDe(p) };
}

/* ===== Formatação ===== */
const moeda = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
function fmtBRL(v){ return v==null ? '—' : moeda.format(v); }
function fmtData(iso){ if(!iso) return ''; const [a,m,d]=iso.split('-'); return `${d}/${m}/${a}`; }
function escapar(t){ return String(t).replace(/[&<>"]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }

/* =========================================================
   LISTA DE PRODUTOS
   ========================================================= */
function alternarDirecao(){
  direcao = direcao==='asc' ? 'desc' : 'asc';
  document.getElementById('btnDir').textContent = direcao==='asc' ? '↑' : '↓';
  render();
}

function render(){
  preencherFiltroCategorias();
  ordenarPor = document.getElementById('ordenarPor').value;
  const busca = document.getElementById('busca').value.toLowerCase().trim();
  const cat = document.getElementById('filtroCategoria').value;

  let lista = estado.produtos.filter(p=>{
    const okCat = !cat || p.categoria===cat;
    const alvo = `${p.nome} ${p.marca||''} ${p.codigo||''} ${p.codigoBarras||''}`.toLowerCase();
    if(p.arquivado && !busca) return false;   // arquivados só aparecem quando o usuário pesquisa
    return okCat && (!busca || alvo.includes(busca));
  });

  lista.sort((a,b)=>{
    let va, vb;
    switch(ordenarPor){
      case 'estoque': va=estoqueDe(a); vb=estoqueDe(b); break;
      case 'preco':   va=a.preco||0;   vb=b.preco||0;   break;
      case 'custo':   va=custoMedioDe(a)||0; vb=custoMedioDe(b)||0; break;
      case 'marca':   va=(a.marca||'').toLowerCase(); vb=(b.marca||'').toLowerCase(); break;
      case 'categoria': va=(a.categoria||'').toLowerCase(); vb=(b.categoria||'').toLowerCase(); break;
      default:        va=a.nome.toLowerCase(); vb=b.nome.toLowerCase();
    }
    let r = (typeof va==='string') ? va.localeCompare(vb,'pt-BR') : va-vb;
    if(ordenarPor==='marca' && !!a.marca!==!!b.marca) return a.marca ? -1 : 1;   // sem marca sempre no fim
    if(r===0 && (ordenarPor==='marca' || ordenarPor==='categoria')) r = a.nome.localeCompare(b.nome,'pt-BR');   // desempate pelo nome
    return direcao==='asc' ? r : -r;
  });

  const cont = document.getElementById('conteudo');

  if(estado.produtos.length===0){
    cont.innerHTML = `<div class="vazio">
      <img src="Chinego_Compras.png" alt="" onerror="this.style.display='none'">
      <h3>Seu estoque está vazio</h3>
      <p>Clique em “+ Novo produto” para começar a cadastrar.</p>
    </div>`;
    return;
  }

  let linhas = lista.map(p=>{
    const est = estoqueDe(p);
    const baixo = !p.arquivado && est <= (p.minimo||0);
    const ar = aReceberDe(p);
    const cm = custoMedioDe(p);
    const linha = `<div class="linha${p.arquivado?' arquivada':''}" data-id="${p.id}">
      <div class="nome">
        ${p.marca?`<span class="marca">${escapar(p.marca)}</span>`:''}
        ${escapar(p.nome)}
        ${p.arquivado?'<span class="badge-arquivado">Arquivado</span>':''}
        ${p.codigo?`<small class="codigo">${escapar(p.codigo)}</small>`:''}
      </div>
      <div class="col-cat"><span class="cat">${escapar(p.categoria)}</span></div>
      <div class="num" style="color:${baixo?'var(--vermelho)':'inherit'}">${est}${baixo?'<span class="badge-baixo"><span class="rot-l">estoque baixo</span><span class="rot-c">baixo</span></span>':''}</div>
      <div class="num">${fmtBRL(p.preco||null)}</div>
      <div class="num col-custo">${fmtBRL(cm)}</div>
    </div>`;
    const sub = ar>0 ? `<div class="subrow">
        <span>${ar} unidade(s) a receber</span>
        <button class="btn btn-amarelo btn-mini" onclick="abrirReceber('${p.id}')">Finalizar recebimento</button>
      </div>` : '';
    return linha + sub;
  }).join('');

  if(lista.length===0) linhas = `<div class="sem-resultado">Nenhum produto encontrado.</div>`;

  cont.innerHTML = `<div class="tabela">
    <div class="linha-cabecalho">
      <div>Produto</div>
      <div class="col-cat">Categoria</div>
      <div class="num">Estoque</div>
      <div class="num">Preço</div>
      <div class="num col-custo">Custo médio</div>
    </div>${linhas}</div>`;

  bindLinhas();
}

function preencherFiltroCategorias(){
  const filtro = document.getElementById('filtroCategoria');
  const atual = filtro.value;
  const contagem = {};
  estado.produtos.forEach(p=>{ if(!p.arquivado) contagem[p.categoria] = (contagem[p.categoria]||0)+1; });
  const comProdutos = estado.categorias.filter(c=>contagem[c]>0);
  filtro.innerHTML = '<option value="">Todas as categorias</option>' +
    comProdutos.map(c=>`<option value="${escapar(c)}" ${c===atual?'selected':''}>${escapar(c)} (${contagem[c]})</option>`).join('');
  if(atual && !comProdutos.includes(atual)) filtro.value = '';
}

/* ===== Toque/clique nas linhas: clique abre o painel, segurar abre ações ===== */
let pressTimer = null, longPress = false;
function bindLinhas(){
  document.querySelectorAll('.linha[data-id]').forEach(el=>{
    const id = el.dataset.id;
    const iniciar = ()=>{ longPress=false; pressTimer=setTimeout(()=>{ longPress=true; abrirAcoes(id); }, 500); };
    const cancelar = ()=> clearTimeout(pressTimer);
    el.addEventListener('mousedown', iniciar);
    el.addEventListener('touchstart', iniciar, {passive:true});
    el.addEventListener('mouseup', cancelar);
    el.addEventListener('mouseleave', cancelar);
    el.addEventListener('touchend', cancelar);
    el.addEventListener('touchmove', cancelar);
    el.addEventListener('contextmenu', e=>e.preventDefault());
    el.addEventListener('click', ()=>{
      if(longPress){ longPress=false; return; }
      abrirMov(id);
    });
  });
}

/* ===== Ações rápidas (toque e segure) ===== */
let acaoAtivo = null;
function abrirAcoes(id){
  acaoAtivo = id;
  document.getElementById('tituloAcoes').textContent = prod(id).nome;
  document.getElementById('btnAcaoArquivar').textContent = prod(id).arquivado ? 'Desarquivar produto' : 'Arquivar produto';
  abrir('modalAcoes');
}
function acaoEntrada(){ const id=acaoAtivo; fechar('modalAcoes'); abrirRegistroEntrada(id); }
function acaoSaida(){   const id=acaoAtivo; fechar('modalAcoes'); abrirRegistroSaida(id); }
function acaoEditar(){  const id=acaoAtivo; fechar('modalAcoes'); abrirMov(id, 'dados'); }
function acaoArquivar(){ const id=acaoAtivo; fechar('modalAcoes'); arquivarProduto(id, !prod(id).arquivado); }

/* =========================================================
   RECEBIMENTOS PENDENTES ("a receber")
   ========================================================= */
let receberAtivo = null;
function abrirReceber(id){ receberAtivo = id; renderReceber(); abrir('modalReceber'); }
function renderReceber(){
  const p = prod(receberAtivo);
  document.getElementById('tituloReceber').textContent = 'A receber — ' + p.nome;
  const pend = saidas(p).filter(m=>m.motivo==='A receber' && !m.recebido).sort((a,b)=>a.data.localeCompare(b.data));
  if(pend.length===0){
    document.getElementById('corpoReceber').innerHTML = '<p style="color:var(--texto-sec)">Nenhum recebimento pendente.</p>';
    return;
  }
  document.getElementById('corpoReceber').innerHTML =
    `<p style="margin-bottom:14px;color:var(--texto-sec)">As unidades já saíram do estoque — finalizar apenas registra o valor recebido.</p>` +
    pend.map(m=>`<div class="receber-linha">
        <div><b>${m.qtd} un.</b><br><span class="data">saída em ${fmtData(m.data)}</span></div>
        <input type="number" id="rec_${m.id}" min="0" step="0.01" value="${p.preco||''}" placeholder="valor un." aria-label="Valor recebido por unidade">
        <select id="recpag_${m.id}" aria-label="Forma de pagamento">${opcoesPagamento('')}</select>
        <button class="btn btn-amarelo btn-mini" onclick="finalizarRecebimento('${m.id}')">Receber</button>
      </div>`).join('');
}
function finalizarRecebimento(movId){
  const p = prod(receberAtivo);
  const m = p.movimentacoes.find(x=>x.id===movId);
  const v = parseFloat(document.getElementById('rec_'+movId).value);
  if(isNaN(v)||v<0){ toast('Informe o valor recebido.'); return; }
  m.recebido = true;
  m.precoVenda = v;
  m.dataRecebimento = hoje();
  const pg = val('recpag_'+movId);
  if(pg) m.pagamento = pg; else delete m.pagamento;
  salvar(); renderReceber(); render();
  if(aberto('modalMov')) renderMov();
  toast('Recebimento registrado.');
}

/* =========================================================
   PRODUTO (cadastro)
   ========================================================= */
function abrirProduto(id){
  const sel = document.getElementById('pCategoria');
  sel.innerHTML = estado.categorias.map(c=>`<option>${escapar(c)}</option>`).join('');
  const p = id ? prod(id) : null;
  document.getElementById('tituloProduto').textContent = p ? 'Editar produto' : 'Novo produto';
  atualizarListaFornecedores();
  document.getElementById('produtoId').value = p ? p.id : '';
  document.getElementById('pMarca').value        = p ? (p.marca||'') : '';
  document.getElementById('pNome').value         = p ? p.nome : '';
  document.getElementById('pCategoria').value    = p ? p.categoria : (estado.categorias[0]||'');
  document.getElementById('pCodigo').value       = p ? (p.codigo||'') : '';
  document.getElementById('pCodigoBarras').value = p ? (p.codigoBarras||'') : '';
  document.getElementById('pPreco').value        = p && p.preco ? p.preco : '';
  document.getElementById('pMinimo').value       = p ? (p.minimo||0) : 0;
  document.getElementById('btnExcluirProduto').style.display = p ? 'inline-flex' : 'none';
  const bArq = document.getElementById('btnArquivarProduto');
  bArq.style.display = p ? 'inline-flex' : 'none';
  bArq.textContent = p && p.arquivado ? 'Desarquivar' : 'Arquivar';
  document.getElementById('pWrapInicial').style.display = p ? 'none' : '';   // só no produto novo
  document.getElementById('pTemInicial').checked = false;
  document.getElementById('pBlocoInicial').style.display = 'none';
  document.getElementById('pQtdInicial').value = '';
  document.getElementById('pCustoInicial').value = '';
  abrir('modalProduto');
  if(!p) setTimeout(()=>document.getElementById('pCodigoBarras').focus(), 80);   // pronto para o leitor USB
}
function alternarEstoqueInicial(){
  const sim = document.getElementById('pTemInicial').checked;
  document.getElementById('pBlocoInicial').style.display = sim ? 'block' : 'none';
  if(sim) document.getElementById('pCustoInicial').focus();
}
function salvarProduto(){
  const id = document.getElementById('produtoId').value;
  const nome = document.getElementById('pNome').value.trim();
  if(!nome){ toast('Dê um nome ao produto.'); return; }
  const precoVal = parseFloat(document.getElementById('pPreco').value);
  const dados = {
    marca: document.getElementById('pMarca').value.trim(),
    nome,
    categoria: document.getElementById('pCategoria').value,
    codigo: document.getElementById('pCodigo').value.trim(),
    codigoBarras: document.getElementById('pCodigoBarras').value.trim(),
    preco: isNaN(precoVal) ? 0 : precoVal,
    minimo: parseInt(document.getElementById('pMinimo').value)||0
  };
  if(!dados.codigo) dados.codigo = gerarSku(dados.categoria);   // SKU automático se vazio

  if(id){
    const p = prod(id);
    const precoMudou = Math.abs((dados.preco||0) - (p.preco||0)) > 0.001;
    const aplicar = ()=>{ Object.assign(p, dados); salvar(); fechar('modalProduto'); render(); toast('Produto salvo.'); };
    if(precoMudou){
      pedirSenha(aplicar, 'O preço de venda foi alterado. Digite a senha do gerente para confirmar a mudança.');
    } else {
      aplicar();
    }
  } else {
    // Estoque inicial (opcional): mercadoria que já estava na loja — não é compra, fica fora do saldo do dia
    const temIni = document.getElementById('pTemInicial').checked;
    const qIni = temIni ? (parseInt(val('pQtdInicial'))||0) : 0;
    const cTxt = val('pCustoInicial').trim(), cIni = parseFloat(cTxt);
    if(temIni && (cTxt==='' || isNaN(cIni) || cIni<0)){ toast('Informe o custo por unidade do estoque inicial.'); document.getElementById('pCustoInicial').focus(); return; }
    if(temIni && qIni<1){ toast('Informe a quantidade do estoque inicial.'); document.getElementById('pQtdInicial').focus(); return; }
    const movs = qIni>0 ? [{ id:uid(), tipo:'entrada', inicial:true, data:hoje(), qtd:qIni, custoUnit:cIni }] : [];
    estado.produtos.push({ id:uid(), ...dados, movimentacoes:movs });
    salvar(); fechar('modalProduto'); render(); renderViewAtual();
    toast(qIni>0 ? `Produto salvo com ${qIni} un. de estoque inicial.` : 'Produto salvo.');
  }
}
function excluirProduto(){ excluirProdutoId(document.getElementById('produtoId').value); }
function excluirProdutoId(id){
  const p = prod(id);
  const n = p.movimentacoes.length;
  pedirConfirmacao(`Excluir “${p.nome}” e ${n?`as ${n} movimentação(ões) do histórico dele`:'o cadastro'}? Isso não pode ser desfeito. Para só tirar o produto da lista, use “Arquivar”.`, ()=>{
    pedirSenha(()=>{
      estado.produtos = estado.produtos.filter(x=>x.id!==id);
      salvar(); fechar('modalProduto'); fechar('modalMov'); render(); renderViewAtual(); toast('Produto excluído.');
    }, 'Excluir um produto apaga o histórico dele. Digite a senha do gerente para confirmar.');
  }, 'Excluir produto');
}

/* ===== Arquivar: tira o produto da lista sem apagar o histórico ===== */
function alternarArquivoProduto(){
  const id = document.getElementById('produtoId').value;
  fechar('modalProduto');
  arquivarProduto(id, !prod(id).arquivado);
}
function arquivarProduto(id, arquivar){
  const p = prod(id);
  if(arquivar){
    const est = estoqueDe(p);
    const msg = `Arquivar “${p.nome}”? Ele sai da lista do estoque, da Nova venda e da Compra em lote, mas o histórico é mantido e ele continua aparecendo quando você pesquisa pelo nome.`
      + (est>0 ? ` Atenção: ainda há ${est} unidade(s) em estoque.` : '');
    pedirConfirmacao(msg, ()=>{
      p.arquivado = true; p.dataArquivado = hoje();
      salvar(); render(); renderViewAtual(); if(aberto('modalMov')) renderMov(); toast('Produto arquivado.');
    }, 'Arquivar produto');
  } else {
    delete p.arquivado; delete p.dataArquivado;
    salvar(); render(); renderViewAtual(); if(aberto('modalMov')) renderMov(); toast('Produto desarquivado.');
  }
}

/* =========================================================
   PDV — PONTO DE VENDA (tela inicial do app)
   Pensado para o leitor de código de barras no PC: o campo de leitura recebe o código,
   o visor mostra o produto em destaque e a lista ao lado soma a venda.
   - "Iniciar venda" abre a venda; cada leitura acrescenta 1 unidade do produto.
   - "Consultar preço" mostra o produto sem colocar na venda (vale para a próxima leitura).
     Sem venda aberta, toda leitura é uma consulta.
   - Desconto por item e na venda toda (R$ ou %), sempre com a senha do gerente.
   - "Finalizar venda" pede a forma de pagamento (só registro: o app não processa pagamentos)
     e lança uma saída "Venda" por produto, todas com o mesmo vendaId.
   Cada item da venda: { pid, qtd, desc?:{tipo:'valor'|'pct', v} } (desconto sobre o total da linha).
   A venda em andamento fica na sessionStorage: sobrevive a um F5, mas não vai para o backup nem para a nuvem.
   ========================================================= */
const PAGAMENTOS = [
  { id:'especie', nome:'Espécie',           curto:'Espécie', icone:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>' },
  { id:'pix',     nome:'Pix',               curto:'Pix',     icone:'<path d="M12 3l9 9-9 9-9-9z"/><path d="M8 12h8M12 8v8"/>' },
  { id:'credito', nome:'Cartão de crédito', curto:'Crédito', icone:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>' },
  { id:'outros',  nome:'Outros',            curto:'Outros',  icone:'<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>' }
];
function nomePagamento(id, curto){ const p = PAGAMENTOS.find(x=>x.id===id); return p ? (curto ? p.curto : p.nome) : ''; }
function opcoesPagamento(sel){
  return `<option value="">Não informada</option>` + PAGAMENTOS.map(p=>`<option value="${p.id}" ${p.id===sel?'selected':''}>${p.nome}</option>`).join('');
}
function ehVendaMov(m){ return m.tipo==='saida' && (m.motivo==='Venda' || (m.motivo==='A receber' && m.recebido)); }

const PDV_CHAVE = 'chinatown_pdv_v1';
let vendaScanAtivo = false;   // a câmera foi aberta pelo PDV
let compraScanIdx = null;     // linha da compra em lote que abriu a câmera
function pdvVazio(){ return { ativa:false, itens:[], desconto:null, consulta:false }; }
function pdvCarregar(){
  try{
    const d = JSON.parse(sessionStorage.getItem(PDV_CHAVE));
    if(d && d.ativa && Array.isArray(d.itens)) return { ...pdvVazio(), ativa:true, itens:d.itens, desconto:d.desconto||null };
  }catch(e){}
  return pdvVazio();
}
function pdvGuardar(){
  try{
    if(pdv.ativa && !sandbox.ativo) sessionStorage.setItem(PDV_CHAVE, JSON.stringify({ ativa:true, itens:pdv.itens, desconto:pdv.desconto }));
    else sessionStorage.removeItem(PDV_CHAVE);
  }catch(e){}
}
let pdv = pdvCarregar();
let pdvVisor = { tipo:'livre' };   // livre | produto {pid, modo} | erro {titulo, texto} | concluida {...}
const cent = v => Math.round(v*100)/100;

/* Contas da venda em andamento */
function pdvResumo(){
  pdv.itens = pdv.itens.filter(it=>prod(it.pid));   // produto excluído em outro aparelho sai da lista
  const linhas = pdv.itens.map((it,i)=>{
    const p = prod(it.pid), unit = p.preco||0, bruto = cent(unit*it.qtd);
    const desc = it.desc ? Math.min(bruto, cent(it.desc.tipo==='pct' ? bruto*it.desc.v/100 : it.desc.v)) : 0;
    return { i, it, p, unit, bruto, desc, liquido:cent(bruto-desc) };
  });
  const bruto = cent(linhas.reduce((s,l)=>s+l.bruto,0)), subtotal = cent(linhas.reduce((s,l)=>s+l.liquido,0));
  const d = pdv.desconto;
  const descVenda = d ? Math.min(subtotal, cent(d.tipo==='pct' ? subtotal*d.v/100 : d.v)) : 0;
  return { linhas, bruto, subtotal, descVenda, total:cent(subtotal-descVenda), unidades:linhas.reduce((s,l)=>s+l.it.qtd,0) };
}
function rotuloDesconto(d){ return d.tipo==='pct' ? `${String(d.v).replace('.',',')}%` : fmtBRL(d.v); }

/* ----- Ações principais ----- */
function pdvFocar(){ if(viewAtual==='pdv' && window.matchMedia && matchMedia('(pointer:fine)').matches){ const b = document.getElementById('pdvBusca'); if(b) b.focus(); } }
function pdvIniciar(){
  pdv = { ...pdvVazio(), ativa:true };
  pdvVisor = { tipo:'livre' };
  pdvGuardar(); renderPdv(); pdvFocar();
}
/* Atalho do botão ⊕ (Estoque e Histórico): abre o PDV já com uma venda iniciada */
function pdvNovaVenda(){ mostrarView('pdv'); if(!pdv.ativa) pdvIniciar(); }
function pdvCancelar(){
  const zerar = ()=>{ pdv = pdvVazio(); pdvVisor = { tipo:'livre' }; pdvGuardar(); renderPdv(); pdvFocar(); };
  if(!pdv.itens.length){ zerar(); return; }
  pedirConfirmacao(`Cancelar a venda em andamento? Os ${pdv.itens.length} item(ns) da lista serão descartados. Nada foi baixado do estoque.`, zerar, 'Cancelar venda');
}
function pdvConsultar(){
  if(pdv.ativa) pdv.consulta = !pdv.consulta;
  else pdvVisor = { tipo:'livre' };
  renderPdv();
  const b = document.getElementById('pdvBusca'); if(b) b.focus();
}

/* ----- Leitura do código / busca ----- */
function pdvBuscar(q){
  q = q.toLowerCase().trim();
  if(!q) return [];
  return estado.produtos.filter(p=>!p.arquivado && `${p.nome} ${p.marca||''} ${p.codigo||''} ${p.codigoBarras||''}`.toLowerCase().includes(q)).slice(0,8);
}
function pdvFiltrar(){
  const res = document.getElementById('pdvResultados');
  const q = val('pdvBusca');
  const lista = pdvBuscar(q);
  if(!q.trim()){ res.innerHTML = ''; return; }
  res.innerHTML = lista.length ? lista.map(p=>{ const est = estoqueDe(p); return `
    <div class="pdv-res" onmousedown="event.preventDefault();pdvEscolher('${p.id}')">
      <span class="pdv-res-nome">${escapar(p.nome)}${p.marca?`<small>${escapar(p.marca)}</small>`:''}</span>
      <span class="pdv-res-est${est<=0?' zero':''}">${est<=0?'sem estoque':est+' un.'}</span>
      <b>${fmtBRL(p.preco||null)}</b>
    </div>`; }).join('') : '<div class="pdv-res vazio">Nenhum produto encontrado.</div>';
}
function pdvEscolher(id){ const p = prod(id); if(p) pdvProdutoLido(p); }
function pdvLimparBusca(){ document.getElementById('pdvBusca').value = ''; document.getElementById('pdvResultados').innerHTML = ''; }
/* Enter no campo (é o que o leitor USB envia ao fim da leitura):
   1º código de barras ou SKU exato; 2º o único resultado da busca. */
function pdvEnter(){
  const q = val('pdvBusca').trim();
  if(!q) return;
  const ql = q.toLowerCase();
  const exato = estado.produtos.find(p=>!p.arquivado && ((p.codigoBarras && p.codigoBarras===q) || (p.codigo && p.codigo.toLowerCase()===ql)));
  if(exato){ pdvProdutoLido(exato); return; }
  const lista = pdvBuscar(q);
  if(lista.length===1){ pdvProdutoLido(lista[0]); return; }
  if(lista.length>1){ toast('Mais de um resultado: escolha na lista.'); return; }
  pdvLimparBusca();
  pdvVisor = { tipo:'erro', titulo:'Código não encontrado', texto:q };
  renderPdv();
}
function pdvTeclaBusca(e){
  if(e.key==='Enter'){ e.preventDefault(); pdvEnter(); }
  else if(e.key==='Escape'){ pdvLimparBusca(); }
}
function pdvCodigoLido(cod){ document.getElementById('pdvBusca').value = cod; pdvEnter(); }   // leitura pela câmera
function pdvCamera(){ vendaScanAtivo = true; abrirScanner(); }

function pdvProdutoLido(p){
  pdvLimparBusca();
  if(!pdv.ativa || pdv.consulta){   // consulta de preço: não entra na venda
    pdv.consulta = false;
    pdvVisor = { tipo:'produto', pid:p.id, modo:'consulta' };
    renderPdv(); pdvFocar();
    return;
  }
  pdvAdicionar(p.id);
}
function pdvAdicionar(pid){
  const p = prod(pid); if(!p) return;
  if(!pdv.ativa) pdv = { ...pdvVazio(), ativa:true };
  const erro = (titulo, texto)=>{ pdvVisor = { tipo:'erro', titulo, texto, pid }; renderPdv(); pdvFocar(); };
  if(!(p.preco>0)) return erro('Produto sem preço de venda', `Cadastre o preço de “${p.nome}” no Estoque antes de vender.`);
  const est = estoqueDe(p), it = pdv.itens.find(x=>x.pid===pid), qtd = (it ? it.qtd : 0) + 1;
  if(qtd>est) return erro(est<=0 ? 'Sem estoque' : 'Estoque insuficiente', est<=0 ? p.nome : `${p.nome}: só há ${est} un. em estoque.`);
  if(it) it.qtd = qtd; else pdv.itens.push({ pid, qtd:1 });
  pdvVisor = { tipo:'produto', pid, modo:'adicionado' };
  pdvGuardar(); renderPdv(); pdvFocar();
}
function pdvIniciarCom(pid){ pdv = { ...pdvVazio(), ativa:true }; pdvAdicionar(pid); }

/* ----- Lista da venda ----- */
function pdvDefinirQtd(i, q){
  const it = pdv.itens[i]; if(!it) return;
  const est = estoqueDe(prod(it.pid));
  q = parseInt(q);
  if(!q || q<1) q = 1;
  if(q>est){ q = est; toast(`Estoque máximo: ${est} un.`); }
  it.qtd = q;
  pdvVisor = { tipo:'produto', pid:it.pid, modo:'adicionado' };
  pdvGuardar(); renderPdv();
}
function pdvQtd(i, delta){ const it = pdv.itens[i]; if(it) pdvDefinirQtd(i, it.qtd + delta); }
function pdvRemover(i){
  pdv.itens.splice(i,1);
  if(!pdv.itens.length) pdv.desconto = null;
  pdvVisor = { tipo:'livre' };
  pdvGuardar(); renderPdv(); pdvFocar();
}

/* ----- Desconto (item ou venda) — sempre com a senha do gerente ----- */
let dc = { alvo:'venda', tipo:'valor' };
function descontoBase(){ const r = pdvResumo(); return dc.alvo==='venda' ? r.subtotal : (r.linhas[dc.alvo] ? r.linhas[dc.alvo].bruto : 0); }
function abrirDesconto(alvo){
  if(!pdv.ativa || !pdv.itens.length){ toast('Adicione produtos à venda antes de aplicar desconto.'); return; }
  const atual = alvo==='venda' ? pdv.desconto : (pdv.itens[alvo] && pdv.itens[alvo].desc);
  dc = { alvo, tipo: atual ? atual.tipo : 'valor' };
  const r = pdvResumo();
  document.getElementById('dcTitulo').textContent = alvo==='venda' ? 'Desconto na venda' : 'Desconto no item';
  document.getElementById('dcSobre').textContent = alvo==='venda'
    ? `Sobre o subtotal de ${fmtBRL(r.subtotal)}.`
    : `${r.linhas[alvo].p.nome} · ${r.linhas[alvo].it.qtd} un. · ${fmtBRL(r.linhas[alvo].bruto)}`;
  document.getElementById('dcValor').value = atual ? atual.v : '';
  document.getElementById('dcRemover').style.display = atual ? '' : 'none';
  descontoTipo(dc.tipo);
  abrir('modalDesconto');
  setTimeout(()=>document.getElementById('dcValor').focus(), 80);
}
function descontoTipo(t){
  dc.tipo = t;
  document.getElementById('dcTipoValor').classList.toggle('ativo', t==='valor');
  document.getElementById('dcTipoPct').classList.toggle('ativo', t==='pct');
  document.getElementById('dcRotulo').textContent = t==='pct' ? 'Desconto (%)' : 'Desconto (R$)';
  document.getElementById('dcValor').placeholder = t==='pct' ? '0' : '0,00';
  descontoPrevia();
}
function descontoCalculado(){
  const v = parseFloat(val('dcValor')), base = descontoBase();
  if(isNaN(v) || v<=0) return null;
  const d = cent(dc.tipo==='pct' ? base*v/100 : v);
  return { v, d, base, invalido: dc.tipo==='pct' ? v>100 : d>base };
}
function descontoPrevia(){
  const c = descontoCalculado(), el = document.getElementById('dcPrevia');
  if(!c){ el.innerHTML = '<span>Informe o valor do desconto.</span>'; return; }
  if(c.invalido){ el.innerHTML = '<span style="color:var(--vermelho)">O desconto não pode ser maior que o valor.</span>'; return; }
  el.innerHTML = `<span>De ${fmtBRL(c.base)} por</span><b>${fmtBRL(cent(c.base-c.d))}</b><small>desconto de ${fmtBRL(c.d)}</small>`;
}
function descontoAplicar(){
  const c = descontoCalculado();
  if(!c){ toast('Informe o valor do desconto.'); return; }
  if(c.invalido){ toast('O desconto não pode ser maior que o valor.'); return; }
  const novo = { tipo:dc.tipo, v:c.v }, alvo = dc.alvo;
  pedirSenha(()=>{
    if(alvo==='venda') pdv.desconto = novo; else if(pdv.itens[alvo]) pdv.itens[alvo].desc = novo;
    fechar('modalDesconto'); pdvGuardar(); renderPdv(); pdvFocar();
    toast('Desconto aplicado.');
  }, `Desconto de ${fmtBRL(c.d)} ${alvo==='venda'?'na venda':'no item'}. Digite a senha do gerente para confirmar.`);
}
function descontoRemover(){
  if(dc.alvo==='venda') pdv.desconto = null; else if(pdv.itens[dc.alvo]) delete pdv.itens[dc.alvo].desc;
  fechar('modalDesconto'); pdvGuardar(); renderPdv(); pdvFocar();
  toast('Desconto removido.');
}

/* ----- Finalizar ----- */
let finPag = null;
function pdvFinalizar(){
  if(!pdv.ativa || !pdv.itens.length){ toast('Adicione ao menos um produto à venda.'); return; }
  const r = pdvResumo();
  for(const l of r.linhas){
    if(l.it.qtd>estoqueDe(l.p)){ toast(`Sem estoque suficiente: ${l.p.nome}`); return; }
  }
  const desc = cent(r.bruto - r.total);
  document.getElementById('finResumo').innerHTML = `
    <div><span>${r.linhas.length} produto(s) · ${r.unidades} un.</span><b>${fmtBRL(r.bruto)}</b></div>
    ${desc>0 ? `<div><span>Descontos</span><b>−${fmtBRL(desc)}</b></div>` : ''}
    <div class="pdv-fin-total"><span>Total</span><b>${fmtBRL(r.total)}</b></div>`;
  finPag = null; pdvRenderPags();
  document.getElementById('finData').value = hoje();
  abrir('modalFinalizar');
}
function pdvRenderPags(){
  document.getElementById('finPags').innerHTML = PAGAMENTOS.map((p,i)=>`
    <button type="button" class="pdv-pag${finPag===p.id?' ativo':''}" onclick="pdvEscolherPag('${p.id}')">
      <kbd>${i+1}</kbd><svg viewBox="0 0 24 24">${p.icone}</svg><span>${p.nome}</span></button>`).join('');
}
function pdvEscolherPag(id){ finPag = id; pdvRenderPags(); }
function pdvConfirmar(){
  if(!finPag){ toast('Escolha a forma de pagamento.'); return; }
  const r = pdvResumo();
  if(!r.linhas.length){ fechar('modalFinalizar'); return; }
  for(const l of r.linhas){
    if(l.it.qtd>estoqueDe(l.p)){ toast(`Sem estoque suficiente: ${l.p.nome}`); return; }
  }
  const data = val('finData') || hoje(), hora = new Date().toTimeString().slice(0,5), vendaId = uid();
  // Desconto da venda repartido entre as linhas na proporção de cada uma (a última leva o resto dos centavos).
  // Assim o preço unitário gravado já é o preço real cobrado, e o lucro do Desempenho continua certo.
  let resto = Math.round(r.total*100);
  r.linhas.forEach((l,i)=>{
    let liq = i===r.linhas.length-1 ? resto : Math.min(resto, Math.round((r.subtotal>0 ? l.liquido/r.subtotal : 0)*r.total*100));
    resto -= liq;
    const liquido = liq/100;
    const mov = { id:uid(), tipo:'saida', data, hora, qtd:l.it.qtd, motivo:'Venda', precoVenda:liquido/l.it.qtd, pagamento:finPag, vendaId };
    if(liquido < l.bruto - 0.004){ mov.precoCheio = l.unit; mov.desconto = cent(l.bruto - liquido); }
    l.p.movimentacoes.push(mov);
  });
  const feita = { total:r.total, unidades:r.unidades, produtos:r.linhas.length, pagamento:finPag, nomes:r.linhas.map(l=>l.p.nome) };
  pdv = pdvVazio();
  pdvVisor = { tipo:'concluida', ...feita };
  pdvGuardar();
  salvar(); render();
  fechar('modalFinalizar'); renderPdv(); pdvFocar();
  festejar();
  notificarVenda(feita);
}

/* ----- Desenho da tela ----- */
const PDV_ICONE_CAIXA = '<svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>';
function pdvFotoHtml(p){
  // Terreno pronto para as fotos: se o produto tiver p.foto (endereço da imagem), ela aparece aqui
  return `<div class="pdv-foto">${p && p.foto ? `<img src="${escapar(p.foto)}" alt="" onerror="this.remove()">` : ''}${PDV_ICONE_CAIXA}</div>`;
}
function pdvVisorHtml(){
  const v = pdvVisor;
  if(v.tipo==='produto' && prod(v.pid)){
    const p = prod(v.pid), est = estoqueDe(p), it = pdv.itens.find(x=>x.pid===p.id);
    const consulta = v.modo==='consulta';
    return `<div class="pdv-visor-in ${consulta?'consulta':'adicionado'}">
      <div class="pdv-selo">${consulta ? 'Consulta de preço · não entrou na venda' : `Na venda · ${it?it.qtd:1} un.`}</div>
      <div class="pdv-prod">
        ${pdvFotoHtml(p)}
        <div class="pdv-info">
          ${p.marca?`<div class="pdv-marca">${escapar(p.marca)}</div>`:''}
          <div class="pdv-nome">${escapar(p.nome)}</div>
          <div class="pdv-preco">${p.preco>0 ? fmtBRL(p.preco) : 'Sem preço'}</div>
          <div class="pdv-sub"><span class="${est<=0?'zero':''}">${est<=0 ? 'Sem estoque' : est+' un. em estoque'}</span> · ${escapar(p.categoria)}${p.codigoBarras?` · ${escapar(p.codigoBarras)}`:''}</div>
          ${consulta ? `<button class="btn btn-escuro pdv-visor-btn" onclick="${pdv.ativa?`pdvAdicionar('${p.id}')`:`pdvIniciarCom('${p.id}')`}">${pdv.ativa?'Adicionar à venda':'Iniciar venda com este produto'}</button>` : ''}
        </div>
      </div>
    </div>`;
  }
  if(v.tipo==='erro'){
    return `<div class="pdv-visor-in erro">
      <div class="pdv-selo">Atenção</div>
      <div class="pdv-msg"><b>${escapar(v.titulo)}</b><span>${escapar(v.texto||'')}</span></div>
    </div>`;
  }
  if(v.tipo==='concluida'){
    return `<div class="pdv-visor-in concluida">
      <div class="pdv-selo">Venda concluída</div>
      <div class="pdv-msg pdv-festa">
        <img class="pdv-mascote" src="icones/mascote-cabeca.png" alt="" onerror="this.remove()">
        <em>Parabéns pela venda!</em>
        <b>${fmtBRL(v.total)}</b>
        <span>${v.unidades} un. em ${v.produtos} produto(s) · ${escapar(nomePagamento(v.pagamento))}</span>
      </div>
    </div>`;
  }
  if(pdv.ativa){
    return `<div class="pdv-visor-in livre${pdv.consulta?' consulta':''}">
      <div class="pdv-selo">${pdv.consulta ? 'Consulta de preço' : 'Venda em andamento'}</div>
      <div class="pdv-msg"><b>${pdv.consulta ? 'Leia o código para consultar' : 'Passe os produtos'}</b>
        <span>${pdv.consulta ? 'O próximo produto lido só mostra o preço: não entra na venda.' : 'Leia o código de barras ou digite o nome no campo abaixo.'}</span></div>
    </div>`;
  }
  return `<div class="pdv-visor-in livre">
    <div class="pdv-selo">Caixa livre</div>
    <div class="pdv-msg"><b>Inicie uma venda</b><span>Ou leia um código de barras para consultar o preço.</span></div>
  </div>`;
}
function renderPdv(){
  if(!document.getElementById('pdvVisor')) return;
  const r = pdvResumo();
  document.getElementById('pdvVisor').innerHTML = pdvVisorHtml();
  document.querySelector('.pdv').classList.toggle('ativa', pdv.ativa);

  document.getElementById('pdvAcoes').innerHTML = pdv.ativa ? `
    <button class="pdv-btn${pdv.consulta?' ligado':''}" onclick="pdvConsultar()"><span>${pdv.consulta?'Consultando…':'Consultar preço'}</span><kbd>F4</kbd></button>
    <button class="pdv-btn" onclick="abrirDesconto('venda')"><span>Aplicar desconto</span><kbd>F8</kbd></button>
    <button class="pdv-btn primario" onclick="pdvFinalizar()"><span>Finalizar venda</span><kbd>F9</kbd></button>
    <button class="pdv-btn perigo" onclick="pdvCancelar()"><span>Cancelar venda</span></button>` : `
    <button class="pdv-btn primario" onclick="pdvIniciar()"><span>Iniciar venda</span><kbd>F2</kbd></button>
    <button class="pdv-btn" onclick="pdvConsultar()"><span>Consultar preço</span><kbd>F4</kbd></button>`;

  document.getElementById('pdvListaCab').innerHTML = pdv.ativa
    ? `<b>Venda em andamento</b><span>${r.linhas.length} produto(s) · ${r.unidades} un.</span>`
    : `<b>Itens da venda</b><span>Caixa livre</span>`;

  // o item mais recente fica no topo, sem precisar rolar
  document.getElementById('pdvLista').innerHTML = r.linhas.length ? [...r.linhas].reverse().map(l=>`
    <div class="pdv-item${pdvVisor.tipo==='produto' && pdvVisor.pid===l.p.id && pdvVisor.modo==='adicionado' ? ' atual':''}">
      <div class="pdv-item-nome">${escapar(l.p.nome)}<small>${l.p.marca?escapar(l.p.marca)+' · ':''}${fmtBRL(l.unit)}/un</small></div>
      <div class="pdv-qtd">
        <button type="button" onclick="pdvQtd(${l.i},-1)" aria-label="Diminuir">−</button>
        <input type="number" min="1" value="${l.it.qtd}" onchange="pdvDefinirQtd(${l.i},this.value)" onkeydown="if(event.key==='Enter')this.blur()" aria-label="Quantidade">
        <button type="button" onclick="pdvQtd(${l.i},1)" aria-label="Aumentar">+</button>
      </div>
      <div class="pdv-item-total">${fmtBRL(l.liquido)}${l.desc>0?`<small>−${fmtBRL(l.desc)} (${rotuloDesconto(l.it.desc)})</small>`:''}</div>
      <button type="button" class="pdv-ico${l.desc>0?' ligado':''}" onclick="abrirDesconto(${l.i})" title="Desconto neste item" aria-label="Desconto neste item">%</button>
      <button type="button" class="pdv-ico" onclick="pdvRemover(${l.i})" title="Remover da venda" aria-label="Remover da venda">×</button>
    </div>`).join('')
    : `<div class="pdv-lista-vazia">${pdv.ativa ? 'Os produtos lidos aparecem aqui.' : 'Clique em “Iniciar venda” para começar.'}</div>`;

  document.getElementById('pdvTotais').innerHTML = `
    <div class="pdv-tl"><span>Subtotal</span><b>${fmtBRL(r.subtotal)}</b></div>
    ${pdv.desconto ? `<div class="pdv-tl desc"><span>Desconto na venda (${rotuloDesconto(pdv.desconto)})
        <button type="button" onclick="abrirDesconto('venda')">alterar</button></span><b>−${fmtBRL(r.descVenda)}</b></div>` : ''}
    <div class="pdv-tl total"><span>Total</span><b>${fmtBRL(r.total)}</b></div>`;
}

/* ----- Comemoração da venda: chuva de confete nas cores da marca (~2,5 s) -----
   Quem pediu ao sistema para reduzir animações vê só a mensagem, sem confete. */
let festaAnim = null;
function festejar(){
  if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.getElementById('festa'); if(!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d'), dpr = Math.min(window.devicePixelRatio||1, 2);
  const W = window.innerWidth, H = window.innerHeight;
  cv.width = W*dpr; cv.height = H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
  const cores = ['#F7C600','#E0241B','#1A1A17','#2E7D32','#FFFFFF','#FFD84D'];
  // dois canhões nos cantos de baixo, atirando para o centro
  const pecas = Array.from({ length: Math.min(220, Math.round(W/6)) }, (_,i)=>{
    const esq = i%2===0, ang = (esq ? -60 : -120) + (Math.random()*30-15);
    const vel = (H*0.019) + Math.random()*(H*0.012);
    return { x: esq ? -10 : W+10, y: H*0.92, vx: Math.cos(ang*Math.PI/180)*vel, vy: Math.sin(ang*Math.PI/180)*vel,
      w: 7+Math.random()*7, h: 4+Math.random()*5, rot: Math.random()*6.28, vr: (Math.random()-.5)*.35,
      cor: cores[i%cores.length], forma: Math.random()<.25 ? 'c' : 'r', atraso: Math.random()*10 };
  });
  cancelAnimationFrame(festaAnim);
  cv.classList.add('ativa');
  const inicio = performance.now(), dur = 2600;
  const quadro = t=>{
    const dt = t - inicio;
    ctx.clearRect(0,0,W,H);
    ctx.globalAlpha = dt > dur-500 ? Math.max(0,(dur-dt)/500) : 1;   // some suavemente no fim
    pecas.forEach(p=>{
      if(p.atraso>0){ p.atraso--; return; }
      p.vy += H*0.00055; p.vx *= .99; p.vy *= .992;   // gravidade e resistência do ar
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.fillStyle = p.cor;
      if(p.cor==='#FFFFFF'){ ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1; }
      if(p.forma==='c'){ ctx.beginPath(); ctx.arc(0,0,p.h*.8,0,6.28); ctx.fill(); }
      else { ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h*Math.abs(Math.cos(p.rot*2))+1); }
      ctx.restore();
    });
    if(dt < dur) festaAnim = requestAnimationFrame(quadro);
    else { ctx.clearRect(0,0,W,H); cv.classList.remove('ativa'); }
  };
  festaAnim = requestAnimationFrame(quadro);
}

/* Atalhos do teclado no PDV (PC) e leitor USB: qualquer tecla digitada fora de um campo vai para o campo de leitura */
document.addEventListener('keydown', e=>{
  if(viewAtual!=='pdv') return;
  const emCampo = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  if(aberto('modalFinalizar')){
    if(emCampo) return;
    const n = parseInt(e.key);
    if(n>=1 && n<=PAGAMENTOS.length){ e.preventDefault(); pdvEscolherPag(PAGAMENTOS[n-1].id); }
    else if(e.key==='Enter'){ e.preventDefault(); pdvConfirmar(); }
    return;
  }
  if(document.querySelector('.overlay.aberto')) return;
  if(e.key==='F2'){ e.preventDefault(); if(!pdv.ativa) pdvIniciar(); }
  else if(e.key==='F4'){ e.preventDefault(); pdvConsultar(); }
  else if(e.key==='F8'){ e.preventDefault(); abrirDesconto('venda'); }
  else if(e.key==='F9'){ e.preventDefault(); pdvFinalizar(); }
  else if(!emCampo && e.key.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey){
    document.getElementById('pdvBusca').focus();   // a tecla já cai no campo de leitura
  }
});

/* ===== Leitor de código de barras por câmera (BarcodeDetector) ===== */
let scanStream = null, scanTimer = null, scanDetector = null, scanAlvo = 'pCodigoBarras';
async function abrirScanner(alvo){
  if(typeof alvo==='string') scanAlvo = alvo; else if(!vendaScanAtivo) scanAlvo = 'pCodigoBarras';
  if(!('BarcodeDetector' in window)){
    toast('Câmera não suportada neste navegador. Use o leitor USB ou digite o código.');
    vendaScanAtivo = false; compraScanIdx = null; return;
  }
  try{
    scanDetector = new window.BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39']});
  }catch(e){ scanDetector = new window.BarcodeDetector(); }
  try{
    scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
  }catch(e){
    toast('Não foi possível acessar a câmera. Verifique a permissão.');
    vendaScanAtivo = false; compraScanIdx = null; return;
  }
  const v = document.getElementById('scanVideo');
  v.srcObject = scanStream;
  await v.play();
  abrir('modalScanner');
  loopScan();
}
async function loopScan(){
  if(!scanStream) return;
  const v = document.getElementById('scanVideo');
  try{
    const codes = await scanDetector.detect(v);
    if(codes && codes.length){
      const raw = codes[0].rawValue;
      const paraVenda = vendaScanAtivo;   // guarda o contexto antes de fecharScanner() zerar a flag
      const paraCompra = compraScanIdx;
      fecharScanner();
      if(paraCompra!==null){
        compraCodigoLido(paraCompra, raw);
      } else if(paraVenda){
        pdvCodigoLido(raw);   // PDV: adiciona à venda ou consulta o preço
      } else {
        document.getElementById(scanAlvo).value = raw;
        toast('Código de barras lido.');
      }
      return;
    }
  }catch(e){}
  scanTimer = setTimeout(loopScan, 250);
}
function fecharScanner(){
  if(scanTimer){ clearTimeout(scanTimer); scanTimer=null; }
  if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); scanStream=null; }
  vendaScanAtivo = false; compraScanIdx = null;
  fechar('modalScanner');
}

/* =========================================================
   BLOCOS REUTILIZÁVEIS (entrada / saída)
   ========================================================= */
function ultimoFornecedorDe(p){
  const ent = [...entradas(p)].sort((a,b)=>b.data.localeCompare(a.data));
  const comForn = ent.find(m=>m.fornecedor);   // sugere o fornecedor da compra mais recente que tem um
  return comForn ? comForn.fornecedor : '';
}
function blocoEntrada(p){
  return `<div class="bloco entrada">
    <h4>Registrar entrada (compra)</h4>
    <div class="mini-campo"><label>Data</label><input type="date" id="eData" value="${hoje()}"></div>
    <div class="mini-campo"><label>Quantidade</label><input type="number" id="eQtd" min="1" placeholder="0"></div>
    <div class="mini-campo"><label>Custo por unidade (R$)</label><input type="number" id="eCusto" min="0" step="0.01" value="${ultimoCustoDe(p)||''}" placeholder="0,00"></div>
    <div class="mini-campo"><label>Fornecedor (opcional)</label><input type="text" id="eForn" list="listaFornecedores" value="${escapar(ultimoFornecedorDe(p))}" placeholder="De quem foi comprado"></div>
    <button class="btn btn-amarelo btn-mini" style="width:100%;margin-top:4px" onclick="registrarEntrada()">+ Adicionar entrada</button>
  </div>`;
}
function blocoSaida(p){
  return `<div class="bloco saida">
    <h4>Registrar saída (baixa)</h4>
    <div class="mini-campo"><label>Data</label><input type="date" id="sData" value="${hoje()}"></div>
    <div class="mini-campo"><label>Quantidade</label><input type="number" id="sQtd" min="1" placeholder="0"></div>
    <div class="mini-campo"><label>Motivo</label>
      <select id="sMotivo" onchange="ajustarCamposSaida()">
        <option>Venda</option>
        <option>A receber</option>
        <option>Perda / avaria</option>
        <option>Devolução</option>
        <option>Ajuste</option>
        <option>Outros</option>
      </select>
    </div>
    <div class="mini-campo" id="campoPrecoSaida">
      <label>Preço de venda (un.)</label>
      <input type="number" id="sPreco" min="0" step="0.01" value="${p.preco||''}" placeholder="0,00">
      <small style="color:var(--texto-sec);font-size:14px">Alterar o preço base exige senha do gerente.</small>
    </div>
    <div class="mini-campo" id="campoPagSaida">
      <label>Forma de pagamento</label>
      <select id="sPag">${opcoesPagamento('')}</select>
    </div>
    <div class="mini-campo" id="campoMotivoOutros" style="display:none">
      <label>Descreva o motivo</label>
      <input type="text" id="sMotivoTexto" placeholder="Ex: brinde, uso interno...">
    </div>
    <div class="mini-campo" id="notaReceber" style="display:none">
      <small style="color:#8A6D00">Registrado com valor R$ 0,00 e contado como “a receber”.</small>
    </div>
    <button class="btn btn-escuro btn-mini" style="width:100%;margin-top:4px" onclick="registrarSaida()">− Dar baixa</button>
  </div>`;
}

function abrirRegistroEntrada(id){
  produtoAtivo = id;
  atualizarListaFornecedores();
  document.getElementById('tituloRegEntrada').textContent = prod(id).nome;
  document.getElementById('corpoRegEntrada').innerHTML = blocoEntrada(prod(id));
  abrir('modalRegEntrada');
  setTimeout(()=>{ const el=document.getElementById('eQtd'); if(el) el.focus(); }, 80);
}
function abrirRegistroSaida(id){
  produtoAtivo = id;
  document.getElementById('tituloRegSaida').textContent = prod(id).nome;
  document.getElementById('corpoRegSaida').innerHTML = blocoSaida(prod(id));
  abrir('modalRegSaida');
  ajustarCamposSaida();
  setTimeout(()=>{ const el=document.getElementById('sQtd'); if(el) el.focus(); }, 80);
}

/* =========================================================
   COMPRA EM LOTE (vários produtos numa só vez)
   ========================================================= */
let compraSeq = 0;
function abrirCompra(){
  compraSeq = 0;
  atualizarListaFornecedores();
  document.getElementById('compraFornecedor').value = '';
  document.getElementById('compraData').value = hoje();
  document.getElementById('compraLinhas').innerHTML = '';
  adicionarLinhaCompra();
  abrir('modalCompra');
}
function linhaCompraHTML(idx){
  const cats = estado.categorias.map(c=>`<option>${escapar(c)}</option>`).join('');
  return `
   <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">
     <div style="flex:1;position:relative">
       <input type="text" id="lc_busca_${idx}" placeholder="Buscar por nome, marca, código ou cód. barras..."
         style="width:100%;padding:8px 10px;border:1px solid var(--borda);border-radius:8px;font-size:14px"
         oninput="filtrarLinhaBusca(${idx})" onkeydown="if(event.key==='Enter'){event.preventDefault();compraEnter(${idx});}" autocomplete="off">
       <div id="lc_resultados_${idx}" class="lc-resultados" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;
         border:1px solid var(--borda-forte);border-radius:8px;z-index:20;max-height:200px;overflow-y:auto;margin-top:2px"></div>
       <input type="hidden" id="lc_prod_${idx}" value="">
       <input type="hidden" id="lc_cb_${idx}" value="">
       <div id="lc_selecionado_${idx}" style="display:none;margin-top:4px;font-size:14px;color:var(--texto-sec)"></div>
     </div>
     <button type="button" class="btn btn-claro lc-icone-btn so-celular" title="Escanear código de barras" aria-label="Escanear código de barras" onclick="abrirScannerCompra(${idx})">
       <svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M16 8v8"/></svg></button>
     <button type="button" class="btn btn-claro lc-novo-btn" title="Cadastrar novo produto" onclick="selecionarLinhaProduto(${idx},'__novo__')">+</button>
   </div>
   <button type="button" class="lc-remover" title="Remover item" aria-label="Remover item" onclick="removerLinhaCompra(this)">×</button>
   <div id="lc_novo_${idx}" class="lc-novo" style="display:none">
     <div class="linha-campos">
       <div class="mini-campo" style="flex:.8"><label>Marca</label><input type="text" id="lc_marca_${idx}" placeholder="Marca"></div>
       <div class="mini-campo" style="flex:1.6"><label>Nome do novo produto</label><input type="text" id="lc_nome_${idx}" placeholder="Nome"></div>
     </div>
     <div class="linha-campos">
       <div class="mini-campo"><label>Categoria</label><select id="lc_cat_${idx}">${cats}</select></div>
     </div>
     <div class="linha-campos">
       <div class="mini-campo"><label>Preço de venda (R$)</label><input type="number" id="lc_preco_${idx}" min="0" step="0.01" placeholder="0,00"></div>
     </div>
   </div>
   <div class="linha-campos">
     <div class="mini-campo"><label>Quantidade</label><input type="number" id="lc_qtd_${idx}" min="1" placeholder="0"></div>
     <div class="mini-campo"><label>Custo unitário (R$)</label><input type="number" id="lc_custo_${idx}" min="0" step="0.01" placeholder="0,00"></div>
   </div>`;
}
/* Código de barras na compra em lote (câmera ou leitor USB) */
async function abrirScannerCompra(idx){
  compraScanIdx = idx;
  await abrirScanner('__compra');
}
function compraCodigoLido(idx, cod){
  if(!document.getElementById('lc_busca_'+idx)) return;   // linha removida enquanto a câmera estava aberta
  const p = estado.produtos.find(x=>x.codigoBarras && x.codigoBarras===cod);
  if(p && !p.arquivado){ selecionarLinhaProduto(idx, p.id); document.getElementById('lc_qtd_'+idx).focus(); toast('Produto encontrado: '+p.nome); return; }
  document.getElementById('lc_busca_'+idx).value = cod;
  filtrarLinhaBusca(idx);
  document.getElementById('lc_cb_'+idx).value = cod;   // guardado: vira o código de barras se cadastrar um produto novo nesta linha
  toast(p ? `“${p.nome}” está arquivado. Desarquive para comprar.` : 'Código não cadastrado. Escolha o produto ou cadastre um novo.');
}
/* Enter no campo (é o que o leitor USB envia): código de barras ou SKU exato; senão, o único resultado */
function compraEnter(idx){
  const q = val('lc_busca_'+idx).trim();
  if(!q) return;
  const ql = q.toLowerCase();
  const exato = estado.produtos.find(p=>!p.arquivado && ((p.codigoBarras && p.codigoBarras===q) || (p.codigo && p.codigo.toLowerCase()===ql)));
  if(exato){ selecionarLinhaProduto(idx, exato.id); document.getElementById('lc_qtd_'+idx).focus(); return; }
  const itens = document.querySelectorAll(`#lc_resultados_${idx} [data-pid]`);
  if(itens.length===1){ selecionarLinhaProduto(idx, itens[0].dataset.pid); document.getElementById('lc_qtd_'+idx).focus(); return; }
  if(/^\d{8,14}$/.test(q)) compraCodigoLido(idx, q);
  else toast(itens.length ? 'Mais de um resultado — escolha na lista.' : 'Produto não encontrado.');
}
function removerLinhaCompra(btn){
  const linha = btn.closest('.linha-compra');
  pedirConfirmacao('Remover este item da compra?', ()=>linha.remove(), 'Remover item');
}
function adicionarLinhaCompra(){
  const idx = compraSeq++;
  const div = document.createElement('div');
  div.className = 'linha-compra';
  div.dataset.idx = idx;
  div.innerHTML = linhaCompraHTML(idx);
  document.getElementById('compraLinhas').appendChild(div);
}
function filtrarLinhaBusca(idx){
  const q = document.getElementById('lc_busca_'+idx).value.toLowerCase().trim();
  const res = document.getElementById('lc_resultados_'+idx);
  document.getElementById('lc_prod_'+idx).value = '';
  document.getElementById('lc_cb_'+idx).value = '';
  document.getElementById('lc_selecionado_'+idx).style.display = 'none';
  document.getElementById('lc_novo_'+idx).style.display = 'none';
  if(!q){ res.style.display='none'; return; }
  const match = estado.produtos.filter(p=>{
    if(p.arquivado) return false;
    const alvo = `${p.nome} ${p.marca||''} ${p.codigo||''} ${p.codigoBarras||''}`.toLowerCase();
    return alvo.includes(q);
  }).slice(0,8);
  const items = match.map(p=>`<div style="padding:8px 12px;cursor:pointer;font-size:14px;border-bottom:1px solid var(--borda)"
    data-pid="${p.id}" onmousedown="selecionarLinhaProduto(${idx},'${p.id}')"
    onmouseenter="this.style.background='var(--amarelo-claro)'" onmouseleave="this.style.background=''">
    ${escapar(p.nome)}${p.marca?`<span style="color:var(--texto-sec)"> — ${escapar(p.marca)}</span>`:''}
    ${p.codigo?`<small style="color:var(--texto-sec);font-size:14px;display:block">${escapar(p.codigo)}</small>`:''}
  </div>`).join('');
  const novoItem = `<div style="padding:8px 12px;cursor:pointer;font-size:14px;color:var(--verde);font-weight:600"
    onmousedown="selecionarLinhaProduto(${idx},'__novo__')"
    onmouseenter="this.style.background='var(--amarelo-claro)'" onmouseleave="this.style.background=''">
    ➕ Cadastrar novo produto</div>`;
  res.innerHTML = items + novoItem;
  res.style.display = 'block';
}
function selecionarLinhaProduto(idx, id){
  const res = document.getElementById('lc_resultados_'+idx);
  res.style.display = 'none';
  document.getElementById('lc_prod_'+idx).value = id;
  const novoDiv = document.getElementById('lc_novo_'+idx);
  const selDiv  = document.getElementById('lc_selecionado_'+idx);
  if(id==='__novo__'){
    let q = document.getElementById('lc_busca_'+idx).value.trim();
    if(q==='Novo produto' || q===val('lc_cb_'+idx)) q = '';   // não usa o rótulo nem o código lido como nome
    document.getElementById('lc_busca_'+idx).value = 'Novo produto';
    // pré-preenche o nome com o que foi digitado
    const nomeEl = document.getElementById('lc_nome_'+idx);
    if(nomeEl && q) nomeEl.value = q;
    novoDiv.style.display = 'block';
    selDiv.style.display = 'none';
  } else {
    const p = prod(id);
    document.getElementById('lc_busca_'+idx).value = p.nome + (p.marca?' — '+p.marca:'');
    // sugere o último custo conhecido
    const ult = ultimoCustoDe(p);
    if(ult){ const custoEl=document.getElementById('lc_custo_'+idx); if(custoEl && !custoEl.value) custoEl.value=ult; }
    novoDiv.style.display = 'none';
    selDiv.innerHTML = p.codigo ? `SKU: ${escapar(p.codigo)}` : '';
    selDiv.style.display = p.codigo ? 'block' : 'none';
  }
}
function registrarCompraLote(){
  const data = document.getElementById('compraData').value || hoje();
  const fornCompra = val('compraFornecedor').trim();
  const linhas = [...document.querySelectorAll('#compraLinhas .linha-compra')];
  const itens = [];
  for(const el of linhas){
    const idx = el.dataset.idx;
    const sel = val('lc_prod_'+idx);
    if(!sel) continue; // linha não preenchida, ignora
    const qtd = parseInt(val('lc_qtd_'+idx));
    const custo = parseFloat(val('lc_custo_'+idx));
    if(!qtd||qtd<1||isNaN(custo)||custo<0){ toast('Verifique quantidade e custo de cada item.'); return; }
    if(sel==='__novo__'){
      const nome = val('lc_nome_'+idx).trim();
      if(!nome){ toast('Dê um nome ao novo produto.'); return; }
      itens.push({ novo:true, nome, marca:val('lc_marca_'+idx).trim(), codigoBarras:val('lc_cb_'+idx),
                   categoria:val('lc_cat_'+idx),
                   preco:parseFloat(val('lc_preco_'+idx))||0, qtd, custo });
    } else {
      itens.push({ novo:false, id:sel, qtd, custo });
    }
  }
  if(itens.length===0){ toast('Adicione ao menos um item.'); return; }

  itens.forEach(it=>{
    let p;
    if(it.novo){
      p = { id:uid(), marca:it.marca, nome:it.nome, categoria:it.categoria,
            codigo:gerarSku(it.categoria), codigoBarras:it.codigoBarras||'', preco:it.preco, minimo:0, movimentacoes:[] };
      estado.produtos.push(p);
    } else {
      p = prod(it.id);
    }
    const forn = fornCompra;
    p.movimentacoes.push({ id:uid(), tipo:'entrada', data, qtd:it.qtd, custoUnit:it.custo, ...(forn?{fornecedor:forn}:{}) });
  });
  salvar(); fechar('modalCompra'); render();
  toast(`Compra registrada: ${itens.length} item(ns).`);
}

/* =========================================================
   PAINEL DO PRODUTO (toque simples na lista) — em abas
   Estoque · Registrar · Movimentações · Dados · Fornecedores
   ========================================================= */
let produtoAtivo = null;
let ppAba = 'estoque';
const PP_ABAS = [
  { id:'estoque',      nome:'Estoque' },
  { id:'registrar',    nome:'Registrar' },
  { id:'movimentacoes',nome:'Movimentações' },
  { id:'dados',        nome:'Dados' },
  { id:'fornecedores', nome:'Fornecedores' }
];
function abrirMov(id, aba){
  produtoAtivo = id;
  ppAba = aba || 'estoque';
  renderMov();
  abrir('modalMov');
}
function trocarAbaProduto(aba){ ppAba = aba; renderMov(); }

/* Fornecedor de cada entrada: só o que foi informado na própria entrada.
   Entradas sem fornecedor ficam como "Não informado" (não herdam o fornecedor principal). */
function fornecedorDaEntrada(p, m){ return (m.fornecedor || '').trim(); }
/* Grupos por fornecedor; incluirSem = true acrescenta o grupo "Não informado" (sempre por último) */
function fornecedoresDe(p, incluirSem){
  const grupos = {}, sem = [];
  entradas(p).forEach(m=>{
    if(m.inicial) return;   // estoque inicial não é compra de fornecedor
    const f = fornecedorDaEntrada(p, m);
    if(!f){ sem.push(m); return; }
    (grupos[f] = grupos[f] || []).push(m);
  });
  const resumo = (nome, ents, naoInformado)=>{
    ents.sort((a,b)=>b.data.localeCompare(a.data));
    return { nome, ents, naoInformado, qtd:ents.reduce((s,m)=>s+m.qtd,0), total:ents.reduce((s,m)=>s+m.qtd*m.custoUnit,0) };
  };
  const lista = Object.entries(grupos).map(([nome, ents])=>resumo(nome, ents, false))
    .sort((a,b)=>b.ents[0].data.localeCompare(a.ents[0].data));
  if(incluirSem && sem.length) lista.push(resumo('Não informado', sem, true));
  return lista;
}
/* Todos os fornecedores já usados (para sugerir no campo, evitando nomes escritos de jeitos diferentes) */
function todosFornecedores(){
  const s = new Set();
  estado.produtos.forEach(p=>entradas(p).forEach(m=>{ if(m.fornecedor) s.add(m.fornecedor.trim()); }));
  return [...s].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function atualizarListaFornecedores(){
  let dl = document.getElementById('listaFornecedores');
  if(!dl){ dl = document.createElement('datalist'); dl.id = 'listaFornecedores'; document.body.appendChild(dl); }
  dl.innerHTML = todosFornecedores().map(f=>`<option value="${escapar(f)}">`).join('');
}

function abasVisiveis(p){
  return PP_ABAS.filter(a=>{
    if(a.id==='movimentacoes') return p.movimentacoes.length>0;
    if(a.id==='fornecedores')  return fornecedoresDe(p).length>0;
    return true;
  });
}

function renderMov(){
  const p = prod(produtoAtivo);
  if(!p){ fechar('modalMov'); return; }
  const abas = abasVisiveis(p);
  if(!abas.some(a=>a.id===ppAba)) ppAba = 'estoque';
  document.getElementById('tituloMov').innerHTML = escapar(p.nome) +
    (p.arquivado ? ' <span class="badge-arquivado">Arquivado</span>' : '');
  atualizarListaFornecedores();

  const nav = `<div class="pp-abas" role="tablist">${abas.map(a=>
    `<button role="tab" class="pp-aba${a.id===ppAba?' ativa':''}" aria-selected="${a.id===ppAba}" onclick="trocarAbaProduto('${a.id}')">${a.nome}${
      a.id==='movimentacoes' ? ` <small>${p.movimentacoes.length}</small>` :
      a.id==='fornecedores'  ? ` <small>${fornecedoresDe(p).length}</small>` : ''}</button>`).join('')}</div>`;

  const corpo = {
    estoque: ppEstoque, registrar: ppRegistrar, movimentacoes: ppMovimentacoes,
    dados: ppDados, fornecedores: ppFornecedores
  }[ppAba](p);

  document.getElementById('corpoMov').innerHTML = nav + `<div class="pp-conteudo">${corpo}</div>`;

  const abaAtiva = document.querySelector('#corpoMov .pp-aba.ativa');
  if(abaAtiva) abaAtiva.scrollIntoView({block:'nearest', inline:'nearest'});   // no celular, mantém a aba ativa visível
  if(ppAba==='registrar') ajustarCamposSaida();
  if(ppAba==='dados') document.getElementById('dpCategoria').value = p.categoria;
  if(ppAba==='movimentacoes'){
    document.querySelectorAll('#corpoMov .hx-linha[data-mid]').forEach(el=>
      toqueLongo(el, ()=>pedirEdicaoMov(el.dataset.pid, el.dataset.mid)));
  }
}

/* ----- Aba 1: Estoque ----- */
function ppEstoque(p){
  const cm = custoMedioDe(p);
  const lotes = custosLotes(p);
  const variacao = lotes && lotes.min!==lotes.max
    ? `${fmtBRL(lotes.min)} → ${fmtBRL(lotes.max)}` : (lotes ? fmtBRL(lotes.min) : '—');
  const ar = aReceberDe(p);
  const l = lucroDe(p);
  const cardLucro = l
    ? `<div class="caixa destaque"><span>Lucro estimado / un.</span>
         <b style="color:${l.unit>=0?'var(--verde)':'var(--vermelho)'}">${fmtBRL(l.unit)}</b>
         <div class="margem">margem ${l.margem.toFixed(1)}% · estoque ${fmtBRL(l.total)}</div></div>`
    : `<div class="caixa"><span>Lucro estimado</span>
         <b style="font-size:14px;font-family:var(--corpo);color:var(--texto-sec)">defina preço e custo</b></div>`;
  const comp = composicaoDetalhada(p);
  const compHtml = comp.length
    ? `<div class="cp-lista">${comp.map((g,gi)=>`
        <div class="cp-grupo">
          <div class="cp-cab">
            <span class="cp-preco">${fmtBRL(g.custo)}<small>/un</small></span>
            <span class="cp-qtd">${g.qtd} un.<small>${fmtBRL(g.qtd*g.custo)}</small></span>
          </div>
          ${g.lotes.map((l,li)=>`<div class="cp-lote">
            <span class="cp-data">${fmtData(l.data)}</span>
            <span class="cp-forn">${l.inicial?'<i>Estoque inicial</i>':l.fornecedor?escapar(l.fornecedor):'<i>Não informado</i>'}${gi===0 && li===0 && (comp.length>1 || g.lotes.length>1) ? ' <span class="cp-proximo" title="Lote mais antigo: é o próximo a sair nas vendas">sai primeiro</span>' : ''}</span>
            <span class="cp-resta">${l.resta===l.qtdCompra ? l.resta+' un.' : `${l.resta} <small>de ${l.qtdCompra}</small> un.`}</span>
          </div>`).join('')}
        </div>`).join('')}</div>`
    : '<p style="color:var(--texto-sec)">Sem unidades em estoque.</p>';
  return `
    <div class="resumo">
      <div class="caixa"><span>Estoque atual</span><b>${estoqueDe(p)} un.</b></div>
      <div class="caixa"><span>Unidades a receber</span><b>${ar} un.</b></div>
      <div class="caixa"><span>Custo médio</span><b>${fmtBRL(cm)}</b></div>
      <div class="caixa"><span>Preço de venda</span><b>${fmtBRL(p.preco||null)}</b></div>
      ${cardLucro}
      <div class="caixa"><span>Variação de custo entre lotes</span><b style="font-size:15px">${variacao}</b></div>
    </div>
    ${ar>0?`<div class="acoes-painel"><button class="btn btn-amarelo btn-mini" onclick="abrirReceber('${p.id}')">Finalizar recebimento (${ar})</button></div>`:''}
    <div class="sub" style="margin-top:4px">Composição do estoque atual</div>
    ${compHtml}`;
}

/* ----- Aba 2: Registrar ----- */
function ppRegistrar(p){
  return `<div class="forms-mov" style="margin-top:0">${blocoEntrada(p)}${blocoSaida(p)}</div>`;
}

/* ----- Aba 3: Movimentações (mesmo layout do histórico geral) ----- */
function ppMovimentacoes(p){
  const movs = [...p.movimentacoes].sort((a,b)=>b.data.localeCompare(a.data));
  const dias = [];
  movs.forEach(m=>{ const u = dias[dias.length-1]; if(u && u.data===m.data) u.itens.push(m); else dias.push({ data:m.data, itens:[m] }); });
  const sinal = v=> v>0 ? '+' : v<0 ? '−' : '';
  const sem = ['dom','seg','ter','qua','qui','sex','sáb'];
  return `<p class="dica" style="margin:0 0 8px">Toque e segure uma movimentação para editar (exige a senha do gerente).</p>
    <div class="pp-movs">` + dias.map(d=>`
    <div class="hx-dia">
      <div class="hx-data"><span>${fmtData(d.data)} <small>${sem[dataDe(d.data).getDay()]}</small></span><i></i></div>
      ${d.itens.map(m=>{ const c = classeMov(m), v = valorMov(m);
        const extra = m.tipo==='entrada' ? fornecedorDaEntrada(p, m) : '';
        return `<div class="hx-linha pp-linha" data-pid="${p.id}" data-mid="${m.id}" title="Toque e segure para editar">
          <div class="hx-mov">${tagMov(m)}${extra?`<small class="pp-forn">${escapar(extra)}</small>`:''}</div>
          <div class="num">${m.qtd} un.</div>
          <div class="num hx-valor ${v?c:''}">${valorHtml(v)}</div>
        </div>`; }).join('')}
    </div>`).join('') + `</div>`;
}

/* ----- Aba 4: Dados (edição do produto dentro do painel) ----- */
function ppDados(p){
  const cats = estado.categorias.map(c=>`<option>${escapar(c)}</option>`).join('');
  return `
    <div class="linha-campos">
      <div class="campo" style="flex:.8"><label>Marca</label><input type="text" id="dpMarca" value="${escapar(p.marca||'')}"></div>
      <div class="campo" style="flex:1.4"><label>Nome do produto</label><input type="text" id="dpNome" value="${escapar(p.nome)}"></div>
    </div>
    <div class="campo"><label>Categoria</label><select id="dpCategoria">${cats}</select></div>
    <div class="campo"><label>Código (SKU)</label>
      <div style="display:flex;gap:8px"><input type="text" id="dpCodigo" value="${escapar(p.codigo||'')}" placeholder="Gerado automaticamente se vazio" style="flex:1">
        <button type="button" class="btn btn-claro btn-mini" onclick="document.getElementById('dpCodigo').value=gerarSku(document.getElementById('dpCategoria').value)">Gerar</button></div>
    </div>
    <div class="campo"><label>Código de barras (opcional)</label>
      <div style="display:flex;gap:8px"><input type="text" id="dpCodigoBarras" value="${escapar(p.codigoBarras||'')}" placeholder="EAN/UPC — o leitor USB digita aqui" style="flex:1" inputmode="numeric">
        <button type="button" class="btn btn-claro btn-mini so-celular" onclick="abrirScanner('dpCodigoBarras')">Escanear</button></div>
    </div>
    <div class="campo"><label>Foto do produto (link da imagem, opcional)</label>
      <input type="url" id="dpFoto" value="${escapar(p.foto||'')}" placeholder="https://… — aparece no visor do PDV" autocapitalize="off" spellcheck="false"></div>
    <div class="linha-campos">
      <div class="campo"><label>Preço de venda (R$)</label><input type="number" id="dpPreco" min="0" step="0.01" value="${p.preco||''}" placeholder="0,00">
        <div class="dica">Alterar exige senha do gerente.</div></div>
      <div class="campo"><label>Estoque mínimo</label><input type="number" id="dpMinimo" min="0" value="${p.minimo||0}">
        <div class="dica">Abaixo disso, mostra aviso de estoque baixo.</div></div>
    </div>
    <div class="rodape-modal pp-rodape">
      <button class="btn btn-vermelho" onclick="excluirProdutoId('${p.id}')">Excluir</button>
      <button class="btn btn-claro" style="margin-right:auto" onclick="arquivarProduto('${p.id}', ${!p.arquivado})">${p.arquivado?'Desarquivar':'Arquivar'}</button>
      <button class="btn btn-amarelo" onclick="salvarDadosPainel()">Salvar alterações</button>
    </div>`;
}
function salvarDadosPainel(){
  const p = prod(produtoAtivo);
  const nome = val('dpNome').trim();
  if(!nome){ toast('Dê um nome ao produto.'); return; }
  const precoVal = parseFloat(val('dpPreco'));
  const dados = {
    marca: val('dpMarca').trim(), nome, categoria: val('dpCategoria'),
    codigo: val('dpCodigo').trim(), codigoBarras: val('dpCodigoBarras').trim(),
    preco: isNaN(precoVal) ? 0 : precoVal,
    minimo: parseInt(val('dpMinimo'))||0
  };
  const foto = val('dpFoto').trim();
  if(foto && !/^https?:\/\//i.test(foto)){ toast('O link da foto precisa começar com http:// ou https://'); return; }
  if(!dados.codigo) dados.codigo = gerarSku(dados.categoria);
  const aplicar = ()=>{ Object.assign(p, dados); if(foto) p.foto = foto; else delete p.foto; salvar(); render(); renderViewAtual(); renderMov(); toast('Produto salvo.'); };
  if(Math.abs((dados.preco||0)-(p.preco||0)) > 0.001)
    pedirSenha(aplicar, 'O preço de venda foi alterado. Digite a senha do gerente para confirmar a mudança.');
  else aplicar();
}

/* ----- Aba 5: Fornecedores ----- */
function ppFornecedores(p){
  return fornecedoresDe(p, true).map(f=>`
    <div class="pp-forn-bloco${f.naoInformado?' nao-informado':''}">
      <div class="pp-forn-cab">
        <div><b>${escapar(f.nome)}</b>
          <small>${f.ents.length} entrada(s) · ${f.qtd} un. · última em ${fmtData(f.ents[0].data)}</small></div>
        <div class="pp-forn-total">${fmtBRL(f.total)}<small>total comprado</small></div>
      </div>
      ${f.ents.map(m=>`<div class="pp-forn-ent">
        <span>${fmtData(m.data)}</span><span>${m.qtd} un.</span><span>${fmtBRL(m.custoUnit)}/un</span>
      </div>`).join('')}
    </div>`).join('') +
    (fornecedoresDe(p, true).some(f=>f.naoInformado)
      ? '<p class="dica">Para informar o fornecedor de uma entrada antiga, edite a movimentação na aba Movimentações (toque e segure).</p>' : '');
}

function ajustarCamposSaida(){
  const sel = document.getElementById('sMotivo');
  if(!sel) return;
  const m = sel.value;
  document.getElementById('campoPrecoSaida').style.display   = (m==='Venda') ? 'block' : 'none';
  document.getElementById('campoPagSaida').style.display     = (m==='Venda') ? 'block' : 'none';
  document.getElementById('campoMotivoOutros').style.display = (m==='Outros') ? 'block' : 'none';
  document.getElementById('notaReceber').style.display       = (m==='A receber') ? 'block' : 'none';
}

function aposMovimento(){
  if(aberto('modalRegEntrada')) fechar('modalRegEntrada');
  if(aberto('modalRegSaida'))   fechar('modalRegSaida');
  if(aberto('modalMov'))        renderMov();
  render();
}

/* ===== Entrada (com lembrete de custo da última compra) ===== */
let entradaPendente = null;
function registrarEntrada(){
  const p = prod(produtoAtivo);
  const qtd = parseInt(document.getElementById('eQtd').value);
  const custo = parseFloat(document.getElementById('eCusto').value);
  const data = document.getElementById('eData').value;
  const fornecedor = val('eForn').trim();
  if(!qtd||qtd<1){ toast('Informe a quantidade.'); return; }
  if(isNaN(custo)||custo<0){ toast('Informe o custo por unidade.'); return; }

  if(entradas(p).length > 0){
    entradaPendente = { pid:p.id, data, qtd, custo, fornecedor };
    abrirConfirmaEntrada(p, custo, qtd);
  } else {
    commitEntrada(p, { data, qtd, custoUnit:custo, fornecedor });
  }
}
function abrirConfirmaEntrada(p, custo, qtd){
  const ult = ultimoCustoDe(p);
  document.getElementById('corpoEntrada').innerHTML = `
    <p style="margin-bottom:14px">Sua última compra deste produto foi no custo unitário de <b>${fmtBRL(ult)}</b>. Confirma o valor?</p>
    <div class="resumo" style="margin-bottom:16px">
      <div class="caixa"><span>Quantidade</span><b>${qtd} un.</b></div>
      <div class="caixa"><span>Custo informado</span><b>${fmtBRL(custo)}</b></div>
    </div>
    <div id="entradaMudou" style="display:none">
      <div class="campo"><label>Novo custo unitário (R$)</label>
        <input type="number" id="novoCusto" min="0" step="0.01" value="${custo}" oninput="atualizaLucroEntrada()"></div>
      <div class="campo"><label>Novo preço de venda (R$)</label>
        <input type="number" id="novoPreco" min="0" step="0.01" value="${p.preco||''}" oninput="atualizaLucroEntrada()"></div>
      <div class="caixa destaque" style="margin-bottom:14px"><span>Lucro por unidade</span><b id="lucroEntrada">—</b></div>
    </div>
    <div class="rodape-modal" id="rodapeConfirma">
      <button class="btn btn-vermelho" onclick="entradaNao()">Não, mudou</button>
      <button class="btn btn-amarelo" onclick="entradaSim()">Sim, confirmar</button>
    </div>
    <div class="rodape-modal" id="rodapeMudou" style="display:none">
      <button class="btn btn-claro" onclick="fechar('modalEntrada')">Cancelar</button>
      <button class="btn btn-amarelo" onclick="entradaConfirmaNovo()">Registrar com novo valor</button>
    </div>`;
  abrir('modalEntrada');
}
function entradaSim(){
  const p = prod(entradaPendente.pid);
  commitEntrada(p, { data:entradaPendente.data, qtd:entradaPendente.qtd, custoUnit:entradaPendente.custo, fornecedor:entradaPendente.fornecedor });
  fechar('modalEntrada');
}
function entradaNao(){
  document.getElementById('entradaMudou').style.display = 'block';
  document.getElementById('rodapeConfirma').style.display = 'none';
  document.getElementById('rodapeMudou').style.display = 'flex';
  atualizaLucroEntrada();
}
function atualizaLucroEntrada(){
  const c = parseFloat(document.getElementById('novoCusto').value);
  const v = parseFloat(document.getElementById('novoPreco').value);
  const el = document.getElementById('lucroEntrada');
  if(isNaN(c)||isNaN(v)){ el.textContent='—'; el.style.color=''; return; }
  const lucro = v - c, margem = v>0 ? (lucro/v*100) : 0;
  el.textContent = `${fmtBRL(lucro)} · margem ${margem.toFixed(1)}%`;
  el.style.color = lucro>=0 ? 'var(--verde)' : 'var(--vermelho)';
}
function entradaConfirmaNovo(){
  const p = prod(entradaPendente.pid);
  const c = parseFloat(document.getElementById('novoCusto').value);
  const v = parseFloat(document.getElementById('novoPreco').value);
  if(isNaN(c)||c<0){ toast('Informe o novo custo.'); return; }
  if(!isNaN(v) && v>=0) p.preco = v;
  commitEntrada(p, { data:entradaPendente.data, qtd:entradaPendente.qtd, custoUnit:c, fornecedor:entradaPendente.fornecedor });
  fechar('modalEntrada');
}
function commitEntrada(p, mov){
  if(!mov.fornecedor) delete mov.fornecedor;
  p.movimentacoes.push({ id:uid(), tipo:'entrada', ...mov });
  salvar(); entradaPendente = null;
  aposMovimento(); toast('Entrada registrada.');
}

/* ===== Saída ===== */
function registrarSaida(){
  const p = prod(produtoAtivo);
  const qtd = parseInt(document.getElementById('sQtd').value);
  const data = document.getElementById('sData').value;
  const motivo = document.getElementById('sMotivo').value;
  if(!qtd||qtd<1){ toast('Informe a quantidade.'); return; }
  if(qtd>estoqueDe(p)){ toast('Não há estoque suficiente para essa baixa.'); return; }

  const mov = { id:uid(), tipo:'saida', data, qtd, motivo };

  if(motivo==='Venda'){
    const base = p.preco||0;
    const precoVenda = parseFloat(document.getElementById('sPreco').value);
    if(isNaN(precoVenda)||precoVenda<0){ toast('Informe o preço de venda.'); return; }
    mov.precoVenda = precoVenda;
    if(val('sPag')) mov.pagamento = val('sPag');
    if(base>0 && Math.abs(precoVenda-base)>0.001){
      pedirSenha(()=>efetivarSaida(p, mov),
        'O preço de venda foi alterado em relação ao preço base. Digite a senha do gerente para confirmar a baixa.');
      return;
    }
  } else if(motivo==='A receber'){
    mov.precoVenda = 0;
  } else if(motivo==='Outros'){
    const txt = document.getElementById('sMotivoTexto').value.trim();
    if(!txt){ toast('Descreva o motivo.'); return; }
    mov.motivoTexto = txt;
  }
  efetivarSaida(p, mov);
}
function efetivarSaida(p, mov){
  p.movimentacoes.push(mov);
  salvar(); aposMovimento(); toast('Baixa registrada.');
  if(mov.motivo==='Venda') notificarVenda({ total:mov.qtd*(mov.precoVenda||0), unidades:mov.qtd, produtos:1, pagamento:mov.pagamento, nomes:[p.nome] });
}

/* =========================================================
   SENHA DO GERENTE (genérica)
   ========================================================= */
let acaoSenha = null;
function pedirSenha(callback, mensagem){
  acaoSenha = callback;
  document.getElementById('senhaTexto').textContent = mensagem || 'Digite a senha de administrador para confirmar.';
  document.getElementById('senhaInput').value = '';
  abrir('modalSenha');
  setTimeout(()=>document.getElementById('senhaInput').focus(), 50);
}
function cancelarSenha(){ acaoSenha = null; fechar('modalSenha'); }
function confirmarSenha(){
  if(document.getElementById('senhaInput').value !== senhaGerente()){ toast('Senha incorreta.'); return; }
  fechar('modalSenha');
  const cb = acaoSenha; acaoSenha = null;
  if(cb) cb();
}

/* ===== Confirmação genérica ===== */
let acaoConfirma = null;
function pedirConfirmacao(mensagem, callback, titulo){
  acaoConfirma = callback;
  document.getElementById('confirmaTitulo').textContent = titulo || 'Confirmar';
  document.getElementById('confirmaTexto').textContent = mensagem;
  abrir('modalConfirma');
}
function cancelarConfirma(){ acaoConfirma = null; fechar('modalConfirma'); }
function confirmarConfirma(){
  fechar('modalConfirma');
  const cb = acaoConfirma; acaoConfirma = null;
  if(cb) cb();
}

/* =========================================================
   HISTÓRICO GERAL (filtros + ordenação)
   ========================================================= */
let histPor = 'data', histDir = 'desc';

/* ----- Cores e rótulos das movimentações (ponto de vista do caixa) -----
   Venda / recebido = dinheiro entra (verde) · Aquisição = dinheiro sai (vermelho)
   A receber pendente = âmbar · Perda, devolução, ajuste, outros = neutro */
function classeMov(m){
  if(m.tipo==='entrada') return m.inicial ? 'ini' : 'neg';
  if(m.motivo==='Venda') return 'pos';
  if(m.motivo==='A receber') return m.recebido ? 'pos' : 'pend';
  return 'neu';
}
function rotuloMov(m){
  if(m.tipo==='entrada') return m.inicial ? 'Estoque inicial' : 'Aquisição';
  if(m.motivo==='Outros' && m.motivoTexto) return m.motivoTexto;
  if(m.motivo==='A receber' && m.recebido) return 'Recebido';
  return m.motivo || 'Saída';
}
/* Valor total da movimentação com sinal do caixa (null = sem valor financeiro).
   Estoque inicial: mostra o valor em estoque (sem sinal), mas foraCaixa = true → não entra no saldo do dia. */
function valorMov(m){
  if(m.tipo==='entrada' && m.inicial) return { unit:m.custoUnit, total:m.qtd*m.custoUnit, foraCaixa:true };
  if(m.tipo==='entrada') return { unit:m.custoUnit, total:-(m.qtd*m.custoUnit) };
  if(m.motivo==='Venda' || (m.motivo==='A receber' && m.recebido)) return { unit:m.precoVenda, total:m.qtd*(m.precoVenda||0) };
  return null;
}
/* Selo do tipo; no celular, "Estoque inicial" vira "Inicial" para caber na coluna */
function tagMov(m){
  const r = rotuloMov(m), c = classeMov(m);
  const curto = m.inicial ? 'Inicial' : r;
  const pag = ehVendaMov(m) && m.pagamento ? `<small class="hx-pag" title="Forma de pagamento: ${escapar(nomePagamento(m.pagamento))}">${escapar(nomePagamento(m.pagamento, true))}</small>` : '';
  return (curto===r ? `<span class="hx-tag ${c}" title="${escapar(r)}">${escapar(r)}</span>`
    : `<span class="hx-tag ${c}" title="${escapar(r)}"><span class="rot-l">${escapar(r)}</span><span class="rot-c">${escapar(curto)}</span></span>`) + pag;
}
/* Célula de valor (Histórico e Painel do Produto) */
function valorHtml(v){
  if(!v) return '<span class="hx-sem">—</span>';
  if(v.foraCaixa) return `${fmtBRL(v.total)}<small>${fmtBRL(v.unit)}/un</small><span class="hx-fora">fora do saldo</span>`;
  const s = v.total>0 ? '+' : v.total<0 ? '−' : '';
  return `${s}${fmtBRL(Math.abs(v.total))}<small>${fmtBRL(v.unit)}/un</small>`;
}
function tipoFiltroMov(m){
  if(m.tipo==='entrada') return m.inicial ? 'inicial' : 'aquisicao';
  if(m.motivo==='Venda') return 'venda';
  if(m.motivo==='A receber') return 'areceber';
  return 'outras';
}

/* ----- Período (navegação estilo "‹ Novembro 2026 ›") ----- */
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
/* Um "período" é { tipo, ref } ou { tipo:'custom', de, ate }.
   tipo: dia | semana | mes | ano | tudo | custom. Usado pelo Histórico e pelo Desempenho. */
let hxPeriodo = { tipo:'mes', ref:hoje() };
function isoDe(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dataDe(iso){ const [a,m,d]=iso.split('-').map(Number); return new Date(a,m-1,d); }
function intervaloDe(P){
  if(P.tipo==='tudo') return { de:'', ate:'' };
  if(P.tipo==='custom') return { de:P.de, ate:P.ate };
  const r = dataDe(P.ref);
  if(P.tipo==='dia') return { de:isoDe(r), ate:isoDe(r) };
  if(P.tipo==='semana'){   // semana de domingo a sábado
    const ini = new Date(r); ini.setDate(r.getDate()-r.getDay());
    const fim = new Date(ini); fim.setDate(ini.getDate()+6);
    return { de:isoDe(ini), ate:isoDe(fim) };
  }
  if(P.tipo==='ano') return { de:`${r.getFullYear()}-01-01`, ate:`${r.getFullYear()}-12-31` };
  const ini = new Date(r.getFullYear(), r.getMonth(), 1), fim = new Date(r.getFullYear(), r.getMonth()+1, 0);
  return { de:isoDe(ini), ate:isoDe(fim) };
}
function rotuloDe(P){
  const h = hoje();
  if(P.tipo==='tudo') return 'Todo o período';
  if(P.tipo==='custom') return `${fmtData(P.de)} – ${fmtData(P.ate)}`;
  const { de, ate } = intervaloDe(P);
  if(P.tipo==='dia') return de===h ? 'Hoje' : fmtData(de);
  if(P.tipo==='semana') return (h>=de && h<=ate) ? 'Esta semana' : `${fmtData(de).slice(0,5)} – ${fmtData(ate).slice(0,5)}`;
  const r = dataDe(P.ref);
  if(P.tipo==='ano') return String(r.getFullYear());
  return `${MESES[r.getMonth()]} ${r.getFullYear()}`;
}
function passoDe(P, dir){
  if(P.tipo==='tudo') return;
  if(P.tipo==='custom'){   // anda pelo tamanho do intervalo escolhido
    const dias = Math.round((dataDe(P.ate)-dataDe(P.de))/86400000)+1;
    const de = dataDe(P.de), ate = dataDe(P.ate);
    de.setDate(de.getDate()+dir*dias); ate.setDate(ate.getDate()+dir*dias);
    P.de = isoDe(de); P.ate = isoDe(ate);
  } else {
    const r = dataDe(P.ref);
    if(P.tipo==='dia') r.setDate(r.getDate()+dir);
    else if(P.tipo==='semana') r.setDate(r.getDate()+7*dir);
    else if(P.tipo==='ano') { r.setDate(1); r.setMonth(0); r.setFullYear(r.getFullYear()+dir); }
    else { r.setDate(1); r.setMonth(r.getMonth()+dir); }
    P.ref = isoDe(r);
  }
}
/* Histórico */
function intervaloPeriodo(){ return intervaloDe(hxPeriodo); }
function rotuloPeriodo(){ return rotuloDe(hxPeriodo); }
function periodoPasso(dir){ passoDe(hxPeriodo, dir); renderHistorico(); }
function definirPeriodo(tipo){ hxPeriodo = { tipo, ref:hoje() }; fecharPops(); renderHistorico(); }

/* Escolher período (modal compartilhado): alvo 'hx' = Histórico, 'ds' = Desempenho */
let periodoAlvo = 'hx';
function abrirPeriodoPersonalizado(alvo){
  periodoAlvo = alvo || 'hx';
  fecharPops();
  const { de, ate } = intervaloDe(periodoAlvo==='ds' ? dsPeriodo : hxPeriodo);
  document.getElementById('perDe').value = de || hoje().slice(0,8)+'01';
  document.getElementById('perAte').value = ate || hoje();
  abrir('modalPeriodo');
}
function aplicarPeriodoPersonalizado(){
  let de = val('perDe'), ate = val('perAte');
  if(!de || !ate){ toast('Informe as duas datas.'); return; }
  if(de>ate) [de,ate] = [ate,de];
  fechar('modalPeriodo');
  if(periodoAlvo==='ds'){ dsPeriodo = { tipo:'custom', de, ate }; renderDesempenho(); }
  else { hxPeriodo = { tipo:'custom', de, ate }; renderHistorico(); }
}

/* ----- Pop-ups dos filtros ----- */
function fecharPops(){ document.querySelectorAll('.hx-pop.aberto').forEach(p=>p.classList.remove('aberto')); }
function alternarPop(id, ev){
  if(ev) ev.stopPropagation();
  const el = document.getElementById(id), abrirEste = !el.classList.contains('aberto');
  fecharPops();
  if(abrirEste) el.classList.add('aberto');
}
function alternarMenuPeriodo(ev){ alternarPop('hxMenuPeriodo', ev); }
document.addEventListener('click', fecharPops);
function limparValor(){ document.getElementById('fhValMin').value=''; document.getElementById('fhValMax').value=''; renderHistorico(); }

function prepararHistorico(){
  const sel = document.getElementById('fhCategoria');
  const atual = sel.value;
  sel.innerHTML = '<option value="">Categoria</option>' + estado.categorias.map(c=>`<option ${c===atual?'selected':''}>${escapar(c)}</option>`).join('');
  renderHistorico();
}
function histAlternarDir(){
  histDir = histDir==='asc' ? 'desc' : 'asc';
  document.getElementById('histDir').textContent = histDir==='asc' ? 'Mais antigos ↑' : 'Mais recentes ↓';
  renderHistorico();
}
/* A altura do Histórico vem do CSS (layout em "casca": só a área de conteúdo rola; no Histórico, só a lista) */

function renderHistorico(){
  histPor = document.getElementById('histOrdenar').value;
  document.getElementById('hxPeriodoRotulo').textContent = rotuloPeriodo() + ' ▾';
  document.querySelectorAll('.hx-seta').forEach(b=>b.disabled = hxPeriodo.tipo==='tudo');
  const fTipo = val('fhTipo');
  const fCat  = val('fhCategoria');
  const fProd = val('fhProduto').toLowerCase().trim();
  const { de:fDe, ate:fAte } = intervaloPeriodo();
  const fMin  = parseFloat(val('fhValMin'));
  const fMax  = parseFloat(val('fhValMax'));
  const temValor = !isNaN(fMin) || !isNaN(fMax);
  document.getElementById('hxValorBtn').textContent = temValor
    ? `Valor: ${isNaN(fMin)?'…':fMin}–${isNaN(fMax)?'…':fMax}` : 'Valor';
  ['fhTipo','fhCategoria','histOrdenar'].forEach(id=>document.getElementById(id).parentElement.classList.toggle('ativo', !!val(id) && val(id)!=='data'));
  document.getElementById('hxValorBtn').classList.toggle('ativo', temValor);

  let linhas = [];
  estado.produtos.forEach(p=>{
    p.movimentacoes.forEach(m=>{
      const v = valorMov(m);
      linhas.push({ pid:p.id, mid:m.id, m, nome:p.nome, marca:p.marca, categoria:p.categoria,
                    data:m.data, qtd:m.qtd, v, tipoF:tipoFiltroMov(m), arquivado:!!p.arquivado });
    });
  });

  linhas = linhas.filter(l=>{
    if(fTipo ? l.tipoF!==fTipo : l.tipoF==='inicial') return false;   // estoque inicial só aparece filtrando por ele
    if(fCat && l.categoria!==fCat) return false;
    if(fProd && !`${l.nome} ${l.marca||''}`.toLowerCase().includes(fProd)) return false;
    if(fDe && l.data < fDe) return false;
    if(fAte && l.data > fAte) return false;
    if(temValor){
      if(!l.v) return false;
      const t = Math.abs(l.v.total);
      if(!isNaN(fMin) && t < fMin) return false;
      if(!isNaN(fMax) && t > fMax) return false;
    }
    return true;
  });

  // dias na ordem escolhida; dentro de cada dia, pela ordenação do filtro
  const chave = l=>{
    switch(histPor){
      case 'tipo':      return rotuloMov(l.m).toLowerCase();
      case 'categoria': return l.categoria.toLowerCase();
      case 'nome':      return l.nome.toLowerCase();
      case 'valor':     return l.v ? l.v.total : 0;
      default:          return 0;
    }
  };
  linhas.sort((a,b)=>{
    const d = histDir==='asc' ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data);
    if(d) return d;
    const ka = chave(a), kb = chave(b);
    return (typeof ka==='string') ? ka.localeCompare(kb,'pt-BR') : (histPor==='valor' ? kb-ka : 0);
  });

  const cont = document.getElementById('histConteudo');
  if(linhas.length===0){
    cont.innerHTML = `<div class="hx-vazio">Nenhuma movimentação em <b>${escapar(rotuloPeriodo())}</b>${(fTipo||fCat||fProd||temValor)?' com esses filtros':''}.</div>`;
    return;
  }

  const dias = [];
  linhas.forEach(l=>{ const u = dias[dias.length-1]; if(u && u.data===l.data) u.itens.push(l); else dias.push({ data:l.data, itens:[l] }); });
  const sinal = v=> v>0 ? '+' : v<0 ? '−' : '';
  const fmtSem = v=> fmtBRL(Math.abs(v));

  cont.innerHTML = dias.map(d=>{
    const saldo = d.itens.reduce((s,l)=>s+(l.v && !l.v.foraCaixa ? l.v.total : 0),0);
    const ds = dataDe(d.data), sem = ['dom','seg','ter','qua','qui','sex','sáb'][ds.getDay()];
    return `<div class="hx-dia">
      <div class="hx-data"><span>${fmtData(d.data)} <small>${sem}</small></span><i></i></div>
      ${d.itens.map(l=>{ const c = classeMov(l.m); return `
      <div class="hx-linha" data-pid="${l.pid}" data-mid="${l.mid}" title="Toque e segure para editar">
        <div class="hx-mov">${tagMov(l.m)}</div>
        <div class="hx-prod">${escapar(l.nome)}${l.arquivado?' <span class="badge-arquivado">Arquivado</span>':''}${l.marca?`<small>${escapar(l.marca)}</small>`:''}</div>
        <div class="col-cat"><span class="cat">${escapar(l.categoria)}</span></div>
        <div class="num col-qtd">${l.qtd}</div>
        <div class="num hx-valor ${l.v?c:''}">${valorHtml(l.v)}<span class="hx-qtd-m">${l.qtd} un.</span></div>
      </div>`; }).join('')}
      <div class="hx-saldo">Saldo no dia <b class="${saldo>0?'pos':saldo<0?'neg':''}">${sinal(saldo)}${fmtSem(saldo)}</b></div>
    </div>`;
  }).join('');
  cont.querySelectorAll('.hx-linha[data-mid]').forEach(el=>
    toqueLongo(el, ()=>pedirEdicaoMov(el.dataset.pid, el.dataset.mid)));
}

/* Toque e segure genérico (mouse e toque) */
function toqueLongo(el, aoSegurar){
  let t = null;
  const iniciar = ()=>{ t = setTimeout(()=>{ t=null; aoSegurar(); }, 500); };
  const cancelar = ()=>{ if(t){ clearTimeout(t); t=null; } };
  el.addEventListener('mousedown', iniciar);
  el.addEventListener('touchstart', iniciar, {passive:true});
  ['mouseup','mouseleave','touchend','touchmove','touchcancel'].forEach(ev=>el.addEventListener(ev, cancelar));
  el.addEventListener('contextmenu', e=>e.preventDefault());
}

/* =========================================================
   EDITAR MOVIMENTAÇÃO (histórico) — exige senha do gerente
   Sobrescreve a movimentação original.
   ========================================================= */
let editMov = null;
function pedirEdicaoMov(pid, mid){
  const p = prod(pid); const m = p && p.movimentacoes.find(x=>x.id===mid);
  if(!m) return;
  pedirSenha(()=>abrirEdicaoMov(pid, mid),
    `Editar ${m.tipo==='entrada'?'a entrada':'a saída'} de ${m.qtd} un. de “${p.nome}” (${fmtData(m.data)}). Digite a senha do gerente.`);
}
function abrirEdicaoMov(pid, mid){
  atualizarListaFornecedores();
  const p = prod(pid), m = p.movimentacoes.find(x=>x.id===mid);
  editMov = { pid, mid };
  const ent = m.tipo==='entrada';
  const motivos = ['Venda','A receber','Perda / avaria','Devolução','Ajuste','Outros'];
  const valorSaida = (m.motivo==='Venda' || (m.motivo==='A receber' && m.recebido)) ? (m.precoVenda??'') : '';
  document.getElementById('corpoEditMov').innerHTML = `
    <p style="margin-bottom:14px"><span class="hx-tag ${classeMov(m)}">${escapar(rotuloMov(m))}</span> <b>${escapar(p.nome)}</b>${p.marca?` <span style="color:var(--texto-sec)">· ${escapar(p.marca)}</span>`:''}</p>
    <div class="linha-campos">
      <div class="campo"><label>Data</label><input type="date" id="emData" value="${m.data}"></div>
      <div class="campo"><label>Quantidade</label><input type="number" id="emQtd" min="1" value="${m.qtd}"></div>
    </div>
    ${ent ? `
    <div class="campo"><label>Custo por unidade (R$)</label><input type="number" id="emValor" min="0" step="0.01" value="${m.custoUnit}"></div>
    ${m.inicial ? '<p class="dica" style="margin:-6px 0 12px">Estoque inicial: conta no estoque, no custo e no lucro, mas fica fora do saldo do dia.</p>'
      : `<div class="campo"><label>Fornecedor</label><input type="text" id="emForn" list="listaFornecedores" value="${escapar(m.fornecedor||'')}" placeholder="Não informado"></div>`}
    ` : `
    <div class="campo"><label>Motivo</label>
      <select id="emMotivo" onchange="ajustarEdicaoMov()">${motivos.map(x=>`<option ${x===m.motivo?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="campo" id="emCampoValor"><label id="emValorLabel">Preço de venda (un.)</label>
      <input type="number" id="emValor" min="0" step="0.01" value="${valorSaida}"></div>
    <div class="campo" id="emCampoPag"><label>Forma de pagamento</label>
      <select id="emPag">${opcoesPagamento(m.pagamento||'')}</select></div>
    <div class="campo" id="emCampoOutros"><label>Descreva o motivo</label>
      <input type="text" id="emMotivoTexto" value="${escapar(m.motivoTexto||'')}"></div>
    <div class="campo" id="emCampoRecebido"><label style="display:flex;align-items:center;gap:8px;font-weight:600">
      <input type="checkbox" id="emRecebido" style="width:auto" ${m.recebido?'checked':''} onchange="ajustarEdicaoMov()"> Já recebido</label></div>
    `}
    <div class="rodape-modal">
      <button class="btn btn-claro" onclick="fechar('modalEditMov')">Cancelar</button>
      <button class="btn btn-amarelo" onclick="salvarEdicaoMov()">Salvar alterações</button>
    </div>
    <div class="em-perigo">
      <div><b>Excluir movimentação</b>
        <small>Apaga este registro de vez e ${ent?`<b>tira ${m.qtd} un.</b> do estoque`:`<b>devolve ${m.qtd} un.</b> ao estoque`}. Recomendado: baixe um backup antes.</small></div>
      <div class="em-perigo-acoes">
        <button class="btn btn-claro btn-mini" onclick="exportar()">↓ Backup</button>
        <button class="btn btn-vermelho btn-mini" onclick="excluirMovimentacao()">Excluir</button>
      </div>
    </div>`;
  abrir('modalEditMov');
  ajustarEdicaoMov();
}
function ajustarEdicaoMov(){
  const sel = document.getElementById('emMotivo');
  if(!sel) return;
  const mot = sel.value, rec = document.getElementById('emRecebido').checked;
  document.getElementById('emCampoOutros').style.display   = mot==='Outros' ? 'block' : 'none';
  document.getElementById('emCampoRecebido').style.display = mot==='A receber' ? 'block' : 'none';
  const mostraValor = mot==='Venda' || (mot==='A receber' && rec);
  document.getElementById('emCampoValor').style.display = mostraValor ? 'block' : 'none';
  document.getElementById('emCampoPag').style.display = mostraValor ? 'block' : 'none';
  document.getElementById('emValorLabel').textContent = mot==='Venda' ? 'Preço de venda (un.)' : 'Valor recebido (un.)';
}
/* Excluir movimentação: só a partir da edição (já passou pela senha do gerente) e com dupla confirmação */
function excluirMovimentacao(){
  const p = prod(editMov.pid), m = p.movimentacoes.find(x=>x.id===editMov.mid);
  if(!m) return;
  const ent = m.tipo==='entrada';
  const est = estoqueDe(p), depois = ent ? est - m.qtd : est + m.qtd;
  if(depois < 0){
    mostrarAviso('Não é possível excluir',
      `<p>Excluir ${m.inicial?'este estoque inicial':'esta aquisição'} de <b>${m.qtd} un.</b> deixaria o estoque de “${escapar(p.nome)}” negativo (${depois} un.), porque parte dessas unidades já saiu.</p>
       <p style="margin-top:10px;color:var(--texto-sec);font-size:14px">Se o registro está errado, edite a quantidade em vez de excluir.</p>`);
    return;
  }
  const desc = `${ent?(m.inicial?'o estoque inicial':'a aquisição'):'a saída “'+rotuloMov(m)+'”'} de ${m.qtd} un. de “${p.nome}” (${fmtData(m.data)})`;
  // 1ª confirmação: o efeito no estoque
  pedirConfirmacao(
    `Excluir ${desc}? Isso altera o estoque: ele passa de ${est} para ${depois} un.` +
    (ent ? ' O custo médio e a composição do estoque também mudam.' : ' Os números de vendas e lucro do Desempenho também mudam.') +
    ' Recomendamos baixar um backup antes (botão “↓ Backup” na tela de edição ou em Configurações).',
    ()=>{
      // 2ª confirmação: ação irreversível
      pedirConfirmacao(
        `Tem certeza? A exclusão é definitiva e não pode ser desfeita no app — só restaurando um backup. Confirmar a exclusão d${desc}?`,
        ()=>{
          p.movimentacoes = p.movimentacoes.filter(x=>x.id!==m.id);
          salvar(); fechar('modalEditMov');
          render(); renderViewAtual(); if(aberto('modalMov')) renderMov();
          mostrarAviso('Movimentação excluída',
            `<p>O estoque de “${escapar(p.nome)}” agora é de <b>${estoqueDe(p)} un.</b></p>
             <p style="margin-top:10px;color:var(--texto-sec);font-size:14px">Recomendamos baixar um backup agora, para guardar os dados já com essa alteração.</p>
             <p style="margin-top:12px"><button class="btn btn-claro btn-mini" onclick="exportar()">↓ Baixar backup agora</button></p>`);
        }, 'Confirmar exclusão definitiva');
    }, 'Excluir movimentação');
}
function salvarEdicaoMov(){
  const p = prod(editMov.pid), m = p.movimentacoes.find(x=>x.id===editMov.mid);
  const data = val('emData'), qtd = parseInt(val('emQtd'));
  if(!data){ toast('Informe a data.'); return; }
  if(!qtd || qtd<1){ toast('Informe a quantidade.'); return; }
  const novo = { data, qtd };
  if(m.tipo==='entrada'){
    const c = parseFloat(val('emValor'));
    if(isNaN(c)||c<0){ toast('Informe o custo por unidade.'); return; }
    novo.custoUnit = c;
    novo.fornecedor = m.inicial ? (m.fornecedor||'') : val('emForn').trim();
  } else {
    const mot = val('emMotivo');
    novo.motivo = mot;
    if(mot==='Venda'){
      const v = parseFloat(val('emValor'));
      if(isNaN(v)||v<0){ toast('Informe o preço de venda.'); return; }
      novo.precoVenda = v;
      if(val('emPag')) novo.pagamento = val('emPag');
    } else if(mot==='A receber'){
      if(document.getElementById('emRecebido').checked){
        const v = parseFloat(val('emValor'));
        if(isNaN(v)||v<0){ toast('Informe o valor recebido.'); return; }
        novo.precoVenda = v; novo.recebido = true;
        if(val('emPag')) novo.pagamento = val('emPag');
      } else { novo.precoVenda = 0; novo.recebido = false; }
    } else if(mot==='Outros'){
      const txt = val('emMotivoTexto').trim();
      if(!txt){ toast('Descreva o motivo.'); return; }
      novo.motivoTexto = txt;
    }
  }
  // o estoque não pode ficar negativo com a alteração
  const deltaAntes = m.tipo==='entrada' ? m.qtd : -m.qtd;
  const deltaDepois = m.tipo==='entrada' ? qtd : -qtd;
  if(estoqueDe(p) - deltaAntes + deltaDepois < 0){
    toast('Essa alteração deixaria o estoque negativo.'); return;
  }
  // sobrescreve no lugar (mantém o id da movimentação)
  m.data = novo.data; m.qtd = novo.qtd;
  if(m.tipo==='entrada'){ m.custoUnit = novo.custoUnit; if(novo.fornecedor) m.fornecedor = novo.fornecedor; else delete m.fornecedor; }
  else {
    // preço alterado na edição: o registro do desconto do PDV deixa de valer
    if(!('precoVenda' in novo) || Math.abs((novo.precoVenda||0)-(m.precoVenda||0))>0.004){ delete m.precoCheio; delete m.desconto; }
    ['precoVenda','motivoTexto','recebido','dataRecebimento','pagamento'].forEach(k=>{ if(!(k in novo)) delete m[k]; });
    Object.assign(m, novo);
    if(m.recebido && !m.dataRecebimento) m.dataRecebimento = hoje();
    if(m.recebido===false) delete m.recebido;
  }
  salvar(); fechar('modalEditMov');
  render(); renderHistorico(); if(aberto('modalMov')) renderMov();
  toast('Movimentação atualizada.');
}

/* =========================================================
   CATEGORIAS (criar / editar / remover)
   ========================================================= */
let catEditando = null;
/* Categorias são gerenciadas só em Configurações (bloco "Categorias de produtos") */
function renderCategorias(){
  const ativa = document.getElementById('cfgListaCat');
  if(!ativa) return;
  const total = document.getElementById('cfgCatTotal');
  if(total) total.textContent = `${estado.categorias.length} categoria(s)`;
  if(!estado.categorias.length){ ativa.innerHTML = '<li class="cat-vazia">Nenhuma categoria cadastrada.</li>'; return; }
  ativa.innerHTML = estado.categorias.map((c,i)=>{
    const n = estado.produtos.filter(p=>p.categoria===c).length;
    if(catEditando===i){
      return `<li>
        <input type="text" id="catInput" value="${escapar(c)}" style="flex:1;padding:7px 9px;border:1px solid var(--borda);border-radius:8px;font-size:14px" oninput="this.value=sanitizarCategoria(this.value)" onkeydown="if(event.key==='Enter')salvarEdicaoCategoria(${i});if(event.key==='Escape'){catEditando=null;renderCategorias()}">
        <button class="btn btn-amarelo btn-mini" onclick="salvarEdicaoCategoria(${i})">Salvar</button>
        <button class="btn btn-claro btn-mini" onclick="catEditando=null;renderCategorias()">Cancelar</button>
      </li>`;
    }
    return `<li><span class="cat-nome">${escapar(c)}<small>${n ? n+(n===1?' produto':' produtos') : 'sem produtos'}</small></span>
      <button class="btn btn-claro btn-mini" onclick="catEditando=${i};renderCategorias()">Editar</button>
      <button class="btn btn-claro btn-mini" onclick="removerCategoriaIdx(${i})" ${n?'disabled title="Em uso por produtos: mova os produtos para outra categoria antes de remover" style="opacity:.4"':''}>Remover</button></li>`;
  }).join('');
  if(catEditando!==null){ const inp=document.getElementById('catInput'); if(inp) setTimeout(()=>inp.focus(),30); }
}
function adicionarCategoria(){
  const campo = document.getElementById('cfgNovaCat');
  const v = sanitizarCategoria(campo.value).trim();
  if(!v){ toast('Informe um nome válido.'); return; }
  if(estado.categorias.some(c=>c.toLowerCase()===v.toLowerCase())){ toast('Essa categoria já existe.'); return; }
  estado.categorias.push(v);
  campo.value='';
  salvar(); renderCategorias(); render(); toast('Categoria adicionada.');
}
function salvarEdicaoCategoria(i){
  const antigo = estado.categorias[i];
  const novo = sanitizarCategoria(document.getElementById('catInput').value).trim();
  if(!novo){ toast('Informe um nome válido.'); return; }
  if(novo===antigo){ catEditando=null; renderCategorias(); return; }
  if(estado.categorias.some((c,idx)=>idx!==i && c.toLowerCase()===novo.toLowerCase())){
    toast('Já existe uma categoria com esse nome.'); return;
  }
  const temEstoqueAtivo = estado.produtos.some(p=>p.categoria===antigo && estoqueDe(p)>0);
  const aplicar = ()=>{
    estado.categorias[i] = novo;
    estado.produtos.forEach(p=>{ if(p.categoria===antigo) p.categoria=novo; });
    salvar(); catEditando=null; renderCategorias(); render(); toast('Categoria renomeada.');
  };
  if(temEstoqueAtivo){
    pedirConfirmacao(`Existe estoque ativo associado a “${antigo}”. Os produtos serão movidos para “${novo}”. Confirmar a renomeação?`, aplicar, 'Renomear categoria');
  } else {
    aplicar();
  }
}
function removerCategoriaIdx(i){
  const c = estado.categorias[i];
  if(estado.produtos.some(p=>p.categoria===c)){ toast('Categoria em uso — não pode ser removida.'); return; }
  pedirConfirmacao(`Remover a categoria “${c}”?`, ()=>{
    estado.categorias.splice(i,1); catEditando = null;
    salvar(); renderCategorias(); render(); toast('Categoria removida.');
  }, 'Remover categoria');
}

/* =========================================================
   BACKUP (exportar / importar JSON)
   ========================================================= */
function exportar(){
  if(emSandbox('baixar o backup')) return;
  estado.config = estado.config || {};
  estado.config.ultimoBackup = new Date().toISOString();
  salvar();
  if(viewAtual==='config') renderConfig();
  const blob = new Blob([JSON.stringify(estado,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup-china-engine-${hoje()}.json`;   // estoque + financeiro num só arquivo
  a.click();
  toast('Backup gerado.');
}
function importar(ev){
  const arq = ev.target.files[0]; if(!arq) return;
  if(emSandbox('restaurar um backup')){ ev.target.value = ''; return; }
  const leitor = new FileReader();
  leitor.onload = e=>{
    try{
      const dados = JSON.parse(e.target.result);
      // Backup antigo do app "Controle de Faturamento MEI": só notas e tetos → junta ao financeiro
      if(Array.isArray(dados.notas) && !dados.produtos){
        pedirConfirmacao(`Este é um backup do Faturamento MEI com ${dados.notas.length} nota(s). Elas serão adicionadas ao Financeiro (notas repetidas são ignoradas). O estoque não muda. Continuar?`, ()=>{
          const r = mesclarBackupMEI(dados);
          salvar(); renderFinanceiro(); toast(`${r} nota(s) adicionada(s) ao Financeiro.`);
        }, 'Importar backup do Faturamento MEI');
        return;
      }
      if(!dados.produtos||!dados.categorias) throw new Error();
      pedirConfirmacao('Isso vai substituir os dados atuais (estoque e financeiro) pelo backup. Continuar?', ()=>{
        estado = garantirFinanceiro(dados); salvar(); render(); renderViewAtual(); toast('Backup restaurado.');
      });
    }catch(err){ toast('Arquivo inválido.'); }
  };
  leitor.readAsText(arq);
  ev.target.value='';
}

/* ===== Utilidades de UI ===== */
const CORPO_DE = {
  modalMov:'corpoMov', modalRegEntrada:'corpoRegEntrada',
  modalRegSaida:'corpoRegSaida', modalEntrada:'corpoEntrada',
  modalReceber:'corpoReceber'
};
function abrir(id){ document.getElementById(id).classList.add('aberto'); }
function fechar(id){
  document.getElementById(id).classList.remove('aberto');
  if(CORPO_DE[id]) document.getElementById(CORPO_DE[id]).innerHTML = '';
}
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{
  if(e.target===o){
    if(o.id==='modalScanner'){ fecharScanner(); return; }
    if(o.id==='modalSenha') acaoSenha=null;
    if(o.id==='modalConfirma') acaoConfirma=null;
    if(o.id==='modalEntrada') entradaPendente=null;
    fechar(o.id);
  }
}));
let tToast;
function toast(msg){
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('mostra');
  clearTimeout(tToast); tToast = setTimeout(()=>t.classList.remove('mostra'),2200);
}

/* ===== Dados de exemplo (só na primeira abertura) ===== */
function criarExemplo(){
  return {
    categorias:['Celulares','Games','Consoles','Joysticks','Acessórios','Cabos','Memória e armazenamento'],
    produtos:[
      { id:uid(), marca:'Baseus', nome:'Cabo USB-C 1m', categoria:'Cabos', codigo:'CB-001', codigoBarras:'', minimo:10, preco:19.90,
        movimentacoes:[
          {id:uid(),tipo:'entrada',data:'2026-04-10',qtd:50,custoUnit:7.50},
          {id:uid(),tipo:'entrada',data:'2026-05-20',qtd:30,custoUnit:9.20},
          {id:uid(),tipo:'saida',data:'2026-05-28',qtd:72,motivo:'Venda',precoVenda:19.90}
        ]},
      { id:uid(), marca:'SanDisk', nome:'Pendrive 64GB', categoria:'Memória e armazenamento', codigo:'PD-64', codigoBarras:'', minimo:5, preco:49.90,
        movimentacoes:[
          {id:uid(),tipo:'entrada',data:'2026-05-02',qtd:40,custoUnit:22.00},
          {id:uid(),tipo:'saida',data:'2026-05-25',qtd:8,motivo:'Venda',precoVenda:49.90},
          {id:uid(),tipo:'saida',data:'2026-05-30',qtd:3,motivo:'A receber',precoVenda:0}
        ]},
      { id:uid(), marca:'Microsoft', nome:'Controle sem fio Xbox', categoria:'Joysticks', codigo:'JS-XB', codigoBarras:'', minimo:3, preco:399.00,
        movimentacoes:[
          {id:uid(),tipo:'entrada',data:'2026-04-15',qtd:12,custoUnit:215.00}
        ]}
    ]
  };
}

/* =========================================================
   NAVEGAÇÃO ENTRE MÓDULOS (barra inferior)
   ========================================================= */
const VIEWS = {
  pdv:        { secao:'viewPdv',        titulo:'PDV · Ponto de venda' },
  alertas:    { secao:'viewAlertas',    titulo:'Pontos de atenção' },
  estoque:    { secao:'viewEstoque',    titulo:'Controle de Estoque' },
  historico:  { secao:'viewHistorico',  titulo:'Histórico de movimentações' },
  financeiro: { secao:'viewFinanceiro', titulo:'Financeiro' },
  desempenho: { secao:'viewDesempenho', titulo:'Desempenho' },
  config:     { secao:'viewConfig',     titulo:'Configurações' }
};
let viewAtual = 'pdv', viewAnterior = 'pdv';
function mostrarView(v){
  if(!VIEWS[v]) return;
  if(viewAtual!==v && viewAtual!=='alertas' && viewAtual!=='config') viewAnterior = viewAtual;
  viewAtual = v;
  Object.entries(VIEWS).forEach(([k,cfg])=>{ document.getElementById(cfg.secao).hidden = (k!==v); });
  document.querySelectorAll('.nav-item[data-nav]').forEach(b=>b.classList.toggle('ativo', b.dataset.nav===v));
  document.querySelectorAll('header .acoes [data-view]').forEach(b=>b.classList.toggle('fora', b.dataset.view!==v));
  document.getElementById('tituloView').textContent = VIEWS[v].titulo;
  fecharFab();
  document.getElementById('notif').classList.toggle('ativo', v==='alertas');
  document.getElementById('btnAjustes').classList.toggle('ativo', v==='config');
  document.getElementById('fab').style.display = ['estoque','historico'].includes(v) ? '' : 'none';   // ⊕ só em Estoque e Histórico
  document.body.classList.toggle('modo-historico', v==='historico');   // trava a rolagem da página: só a lista do histórico rola
  document.body.classList.toggle('modo-pdv', v==='pdv');               // PDV usa a tela toda
  document.querySelector('main').scrollTop = 0;
  renderViewAtual();
  if(v==='pdv') pdvFocar();
}
/* Barra inferior: se os nomes dos 6 itens não couberem lado a lado, só o item ativo mostra o nome */
function ajustarNav(){
  const nav = document.querySelector('.barra-inferior'); if(!nav) return;
  nav.classList.remove('compacta');
  const precisa = [...nav.querySelectorAll('.nav-item span')].reduce((t,sp)=>t + sp.scrollWidth + 8, 0);   // 8px de respiro por item
  nav.classList.toggle('compacta', precisa > nav.clientWidth);
}
window.addEventListener('resize', ajustarNav);
if(document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarNav);
/* Sininho: abre os pontos de atenção; tocar de novo volta para a tela anterior */
function alternarAlertas(){ mostrarView(viewAtual==='alertas' ? viewAnterior : 'alertas'); }
/* Engrenagem (Ajustes) no cabeçalho: mesma lógica do sininho */
function alternarAjustes(){ mostrarView(viewAtual==='config' ? viewAnterior : 'config'); }
function renderViewAtual(){
  if(viewAtual==='pdv')        renderPdv();
  if(viewAtual==='alertas')    renderAlertas();
  if(viewAtual==='historico')  prepararHistorico();
  if(viewAtual==='financeiro') renderFinanceiro();
  if(viewAtual==='config')     renderConfig();
  if(viewAtual==='desempenho') renderDesempenho();
}

/* =========================================================
   CONFIGURAÇÕES (backup e senha do gerente)
   ========================================================= */
function senhaGerente(){ return (estado.config && estado.config.senhaGerente) || SENHA_ADMIN; }
function renderConfig(){
  syncRenderConfig(); pushRenderConfig(); sandboxTela();
  catEditando = null; renderCategorias();
  const u = estado.config && estado.config.ultimoBackup;
  const el = document.getElementById('cfgUltimoBackup');
  if(!u){ el.textContent = 'Nenhum backup baixado ainda neste navegador.'; el.style.color='var(--vermelho)'; return; }
  const d = new Date(u), dias = Math.floor((Date.now()-d)/86400000);
  el.textContent = `Último backup: ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}` + (dias>=7 ? ` (há ${dias} dias — vale baixar um novo)` : '');
  el.style.color = dias>=7 ? 'var(--vermelho)' : '';
}
function alterarSenha(){
  const atual = val('cfgSenhaAtual'), nova = val('cfgSenhaNova'), rep = val('cfgSenhaRep');
  if(atual !== senhaGerente()){ toast('Senha atual incorreta.'); return; }
  if(nova.length < 4){ toast('A nova senha precisa ter ao menos 4 caracteres.'); return; }
  if(nova !== rep){ toast('A nova senha e a repetição não conferem.'); return; }
  if(nova === atual){ toast('A nova senha é igual à atual.'); return; }
  estado.config = estado.config || {};
  estado.config.senhaGerente = nova;
  salvar();
  ['cfgSenhaAtual','cfgSenhaNova','cfgSenhaRep'].forEach(id=>document.getElementById(id).value='');
  mostrarAviso('Senha alterada', '<p>A senha do gerente foi alterada.</p><p style="margin-top:10px;color:var(--texto-sec);font-size:14px">Ela vale para este navegador e entra no próximo backup. Se você restaurar um backup antigo, volta a senha que estava nele.</p>');
}

/* A consulta de produtos pela API GTIN foi removida na 2.0.0 (não encontrava os produtos da loja).
   Limpa o endereço e a chave que as versões anteriores guardavam neste aparelho. */
try{ localStorage.removeItem('chinatown_gtin_v1'); localStorage.removeItem('chinatown_gtin_v2'); }catch(e){}

function normalizarUrlWorker(u){
  u = String(u||'').trim().replace(/\/+$/,'');
  if(u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

/* =========================================================
   PONTOS DE ATENÇÃO — tela aberta pelo sininho do cabeçalho
   (estoque baixo e pagamentos pendentes; não fica na barra inferior)
   ========================================================= */
function produtosEstoqueBaixo(){
  return estado.produtos.filter(p=>!p.arquivado && estoqueDe(p) <= (p.minimo||0))
    .sort((a,b)=>(estoqueDe(a)-(a.minimo||0))-(estoqueDe(b)-(b.minimo||0)) || a.nome.localeCompare(b.nome,'pt-BR'));
}
function recebimentosPendentes(){
  const lista = [];
  estado.produtos.forEach(p=>saidas(p).forEach(m=>{
    if(m.motivo==='A receber' && !m.recebido) lista.push({ p, m });
  }));
  return lista.sort((a,b)=>a.m.data.localeCompare(b.m.data));   // mais antigos primeiro
}
function diasDesde(iso){ return Math.floor((new Date(hoje()) - new Date(iso))/86400000); }

function atualizarAlertas(){
  const n = produtosEstoqueBaixo().length + recebimentosPendentes().length;
  const b = document.getElementById('notif');
  if(b){
    b.classList.toggle('tem', n>0);
    document.getElementById('notifContador').textContent = n>99 ? '99+' : n;
    b.title = n ? `${n} ponto(s) de atenção` : 'Nenhum ponto de atenção';
  }
  if(viewAtual==='alertas') renderAlertas();
}
function renderAlertas(){
  const baixos = produtosEstoqueBaixo();
  const pend = recebimentosPendentes();
  const totalPend = pend.reduce((s,x)=>s + x.m.qtd*(x.p.preco||0), 0);
  const cont = document.getElementById('alertasConteudo');

  const blocoBaixo = `<div class="ini-bloco baixo">
    <div class="ini-cab"><div><h3>Estoque baixo</h3><small>Atenção para reabastecer</small></div>
      <span class="ini-qtd">${baixos.length}</span></div>
    ${baixos.length ? baixos.map(p=>{ const est = estoqueDe(p); return `
      <div class="ini-item">
        <div class="nome">${escapar(p.nome)}<small>${p.marca?escapar(p.marca)+' · ':''}mínimo ${p.minimo||0} un.</small></div>
        <div class="val" style="color:${est<=0?'var(--vermelho)':'inherit'}">${est} un.<small>${est<=0?'sem estoque':'em estoque'}</small></div>
        <button class="btn btn-amarelo btn-mini" onclick="abrirRegistroEntrada('${p.id}')">+ Entrada</button>
      </div>`; }).join('') : '<div class="ini-vazio">Nenhum produto abaixo do mínimo.</div>'}
  </div>`;

  const blocoPend = `<div class="ini-bloco receber">
    <div class="ini-cab"><div><h3>Pagamentos pendentes</h3><small>Saídas “a receber” · cerca de ${fmtBRL(totalPend)} pelo preço atual</small></div>
      <span class="ini-qtd">${pend.length}</span></div>
    ${pend.length ? pend.map(({p,m})=>{ const d = diasDesde(m.data); return `
      <div class="ini-item">
        <div class="nome">${escapar(p.nome)}<small>${m.qtd} un. · saída em ${fmtData(m.data)}</small></div>
        <div class="val">${d<=0?'hoje':d+(d===1?' dia':' dias')}<small>pendente</small></div>
        <button class="btn btn-claro btn-mini" onclick="abrirReceber('${p.id}')">Receber</button>
      </div>`; }).join('') : '<div class="ini-vazio">Nenhum pagamento pendente.</div>'}
  </div>`;

  const tudoOk = !baixos.length && !pend.length;
  // cada bloco só aparece quando tem itens
  cont.innerHTML = tudoOk
    ? '<div class="ini-ok">✓ Tudo em dia: nenhum estoque baixo e nenhum pagamento pendente.</div>'
    : `${baixos.length ? blocoBaixo : ''}${pend.length ? blocoPend : ''}`;
}

/* ===== Botão de ação flutuante (⊕) ===== */
function alternarFab(){ document.getElementById('fabMenu').classList.contains('aberto') ? fecharFab() : abrirFab(); }
function abrirFab(){ ['fab','fabMenu','fabFundo'].forEach(id=>document.getElementById(id).classList.add('aberto')); }
function fecharFab(){ ['fab','fabMenu','fabFundo'].forEach(id=>document.getElementById(id).classList.remove('aberto')); }

/* =========================================================
   DESEMPENHO — métricas e gráficos das vendas
   Venda = saída "Venda" ou "A receber" já recebida (A receber pendente não entra).
   Lucro = receita − custo do lote vendido (FIFO: as unidades mais antigas saem primeiro,
   a mesma lógica da Composição do estoque).
   Gráficos em SVG puro (sem bibliotecas).
   ========================================================= */
let dsPeriodo = { tipo:'mes', ref:hoje() };
let dsRanking = 'unidades';   // produtos mais vendidos: 'unidades' | 'faturamento'
const DS_COR = { fat:'#2a78d6', lucro:'#eda100', neutro:'#D6D3CA' };   // paleta validada (CVD ok)
const DS_DIAS_PARADO = 30;
const SEMANA = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const SEMANA_CURTA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function dsPeriodoPasso(dir){ passoDe(dsPeriodo, dir); renderDesempenho(); }
function dsDefinirPeriodo(tipo){ dsPeriodo = { tipo, ref:hoje() }; fecharPops(); renderDesempenho(); }
function dsTrocarRanking(t){ dsRanking = t; renderDesempenho(); }

/* Custo FIFO de cada saída: Map(id da movimentação → custo total das unidades que saíram) */
function custosFIFO(){
  const mapa = new Map();
  estado.produtos.forEach(p=>{
    const lotes = entradas(p).map((m,i)=>({ data:m.data, i, qtd:m.qtd, custo:m.custoUnit }))
      .sort((a,b)=>a.data.localeCompare(b.data) || a.i-b.i);
    const cm = custoMedioDe(p) || 0;
    saidas(p).map((m,i)=>({ m, i })).sort((a,b)=>a.m.data.localeCompare(b.m.data) || a.i-b.i).forEach(({m})=>{
      let falta = m.qtd, custo = 0;
      for(const l of lotes){
        if(falta<=0) break;
        if(l.qtd<=0) continue;
        const tira = Math.min(l.qtd, falta);
        custo += tira*l.custo; l.qtd -= tira; falta -= tira;
      }
      if(falta>0) custo += falta*cm;   // dados inconsistentes (saída sem entrada suficiente): usa custo médio
      mapa.set(m.id, custo);
    });
  });
  return mapa;
}
function vendasDe(de, ate){
  const custos = custosFIFO(), lista = [];
  estado.produtos.forEach(p=>saidas(p).forEach(m=>{
    const ehVenda = m.motivo==='Venda' || (m.motivo==='A receber' && m.recebido);
    if(!ehVenda) return;
    if(de && m.data<de) return;
    if(ate && m.data>ate) return;
    const receita = m.qtd*(m.precoVenda||0), custo = custos.get(m.id)||0;
    lista.push({ p, m, data:m.data, qtd:m.qtd, receita, custo, lucro:receita-custo, pagamento:m.pagamento||'' });
  }));
  return lista;
}
function soma(lista, k){ return lista.reduce((s,x)=>s+x[k],0); }
function fmtCompacto(v){
  const a = Math.abs(v);
  if(a>=1e6) return 'R$ '+(v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi';
  if(a>=1e4) return 'R$ '+(v/1e3).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil';
  return 'R$ '+Math.round(v).toLocaleString('pt-BR');
}
function fmtPctDs(v){ return isFinite(v) ? v.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%' : '—'; }
/* "Topo" redondo para o eixo */
function topoEixo(max){
  if(max<=0) return 1;
  const pot = Math.pow(10, Math.floor(Math.log10(max)));
  for(const m of [1,1.2,1.5,2,2.5,3,4,5,6,8,10]) if(m*pot>=max) return m*pot;
  return 10*pot;
}

function renderDesempenho(){
  document.getElementById('dsPeriodoRotulo').textContent = rotuloDe(dsPeriodo) + ' ▾';
  document.querySelectorAll('.ds-seta').forEach(b=>b.disabled = dsPeriodo.tipo==='tudo');
  const { de, ate } = intervaloDe(dsPeriodo);
  const vendas = vendasDe(de, ate);
  const cont = document.getElementById('dsConteudo');

  const pendentes = [];
  estado.produtos.forEach(p=>saidas(p).forEach(m=>{
    if(m.motivo==='A receber' && !m.recebido && (!de || m.data>=de) && (!ate || m.data<=ate)) pendentes.push(m);
  }));
  const notaPend = pendentes.length
    ? `<p class="dica ds-nota">${soma(pendentes,'qtd')} un. em vendas “a receber” ainda pendentes neste período não entram nos números até o recebimento.</p>` : '';

  if(!vendas.length){
    cont.innerHTML = `<div class="ds-vazio"><b>Nenhuma venda em ${escapar(rotuloDe(dsPeriodo))}.</b><br>Use as setas ou o menu do período para ver outro intervalo.</div>${notaPend}` + dsBlocoParados();
    return;
  }

  const fat = soma(vendas,'receita'), custo = soma(vendas,'custo'), lucro = fat-custo;
  const margem = fat>0 ? lucro/fat*100 : NaN;

  cont.innerHTML = `
    <div class="ds-tiles">
      <div class="ds-tile"><span>Faturamento</span><b>${fmtBRL(fat)}</b><small>${soma(vendas,'qtd')} un. vendidas</small></div>
      <div class="ds-tile"><span>Custo das vendas</span><b>${fmtBRL(custo)}</b><small>custo dos lotes vendidos</small></div>
      <div class="ds-tile"><span>Lucro bruto</span><b class="${lucro<0?'neg':''}">${fmtBRL(lucro)}</b><small>faturamento − custo</small></div>
      <div class="ds-tile"><span>Margem</span><b class="${margem<0?'neg':''}">${fmtPctDs(margem)}</b><small>lucro ÷ faturamento</small></div>
    </div>
    ${notaPend}
    ${dsBlocoEvolucao(vendas, de, ate)}
    <div class="ds-grade">
      ${dsBlocoCategorias(vendas)}
      ${dsBlocoSemana(vendas, de, ate)}
    </div>
    <div class="ds-grade">
      ${dsBlocoMelhoresDatas(vendas)}
      ${dsBlocoProdutos(vendas)}
    </div>
    ${dsBlocoPagamentos(vendas)}
    ${dsBlocoParados()}`;
  ligarTooltips(cont);
  ligarCrosshair();
}

/* ----- Evolução no tempo (linha: faturamento e lucro, um eixo só em R$) ----- */
let dsSerie = null;
function dsBlocoEvolucao(vendas, de, ate){
  const ini = de || vendas.reduce((a,v)=>v.data<a?v.data:a, vendas[0].data);
  let fim = ate || vendas.reduce((a,v)=>v.data>a?v.data:a, vendas[0].data);
  if(fim > hoje()) fim = hoje();   // período atual: o gráfico para em hoje (sem dias futuros zerados)
  const dias = Math.round((dataDe(fim)-dataDe(ini))/86400000)+1;
  if(dias<2) return '';
  const porMes = dias>62;
  const pontos = [];
  if(porMes){
    const d = dataDe(ini); d.setDate(1);
    const f = dataDe(fim);
    while(d<=f){ pontos.push({ chave:isoDe(d).slice(0,7), rotulo:MESES[d.getMonth()].slice(0,3)+'/'+String(d.getFullYear()).slice(2), fat:0, lucro:0, n:0 }); d.setMonth(d.getMonth()+1); }
  } else {
    const d = dataDe(ini), f = dataDe(fim);
    while(d<=f){ pontos.push({ chave:isoDe(d), rotulo:fmtData(isoDe(d)).slice(0,5), fat:0, lucro:0, n:0 }); d.setDate(d.getDate()+1); }
  }
  const idx = new Map(pontos.map((p,i)=>[p.chave,i]));
  vendas.forEach(v=>{ const i = idx.get(porMes ? v.data.slice(0,7) : v.data); if(i==null) return; pontos[i].fat+=v.receita; pontos[i].lucro+=v.lucro; pontos[i].n+=v.qtd; });
  dsSerie = { pontos, porMes };
  return `<div class="ds-card">
    <div class="ds-cab"><div><h3>Evolução no tempo</h3><small>${porMes?'Por mês':'Por dia'} · faturamento e lucro</small></div>
      <div class="ds-legenda"><span><i style="background:${DS_COR.fat}"></i>Faturamento</span><span><i style="background:${DS_COR.lucro}"></i>Lucro</span></div></div>
    <div class="ds-linha-wrap" id="dsLinha">${svgLinha(pontos)}</div>
  </div>`;
}
function svgLinha(pontos){
  const W = Math.max(300, Math.min(944, (document.getElementById('dsConteudo')?.clientWidth||900) - 34)), H = 220;
  const m = { l:58, r:16, t:14, b:26 };
  const iw = W-m.l-m.r, ih = H-m.t-m.b;
  const maxV = topoEixo(Math.max(...pontos.map(p=>Math.max(p.fat,p.lucro)), 0));
  const minV = Math.min(0, ...pontos.map(p=>p.lucro));
  const minE = minV<0 ? -topoEixo(-minV) : 0;
  const y = v=> m.t + ih - (v-minE)/(maxV-minE)*ih;
  const x = i=> m.l + (pontos.length===1 ? iw/2 : i*iw/(pontos.length-1));
  const ticks = [minE, ...[0.25,0.5,0.75,1].map(f=>minE+(maxV-minE)*f)].filter((v,i,a)=>a.indexOf(v)===i);
  const grade = ticks.map(v=>`<line x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}" class="ds-grid${v===0?' zero':''}"/>
    <text x="${m.l-8}" y="${y(v)+4}" class="ds-eixo" text-anchor="end">${fmtCompacto(v)}</text>`).join('');
  const passo = Math.ceil(pontos.length/ Math.max(2, Math.floor(iw/62)));
  const rot = pontos.map((p,i)=> (i%passo===0 || i===pontos.length-1) ? `<text x="${x(i)}" y="${H-6}" class="ds-eixo" text-anchor="middle">${p.rotulo}</text>` : '').join('');
  const caminho = k=> pontos.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
  const area = `M${x(0)},${y(Math.max(0,minE))}` + pontos.map((p,i)=>`L${x(i).toFixed(1)},${y(p.fat).toFixed(1)}`).join('') + `L${x(pontos.length-1)},${y(Math.max(0,minE))}Z`;
  const ult = pontos.length-1;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Faturamento e lucro ${dsSerie&&dsSerie.porMes?'por mês':'por dia'}">
    ${grade}${rot}
    <path d="${area}" fill="${DS_COR.fat}" opacity=".1"/>
    <path d="${caminho('fat')}" fill="none" stroke="${DS_COR.fat}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${caminho('lucro')}" fill="none" stroke="${DS_COR.lucro}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(ult)}" cy="${y(pontos[ult].fat)}" r="4" fill="${DS_COR.fat}" stroke="#fff" stroke-width="2"/>
    <circle cx="${x(ult)}" cy="${y(pontos[ult].lucro)}" r="4" fill="${DS_COR.lucro}" stroke="#fff" stroke-width="2"/>
    <g id="dsCruz" style="display:none"><line class="ds-cruz" y1="${m.t}" y2="${m.t+ih}"/>
      <circle class="ds-cruz-f" r="5" fill="${DS_COR.fat}" stroke="#fff" stroke-width="2"/><circle class="ds-cruz-l" r="5" fill="${DS_COR.lucro}" stroke="#fff" stroke-width="2"/></g>
    <rect id="dsCaptura" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"
      data-ml="${m.l}" data-iw="${iw}" data-n="${pontos.length}" data-min="${minE}" data-max="${maxV}" data-t="${m.t}" data-ih="${ih}"/>
  </svg>`;
}
function ligarCrosshair(){
  const r = document.getElementById('dsCaptura');
  if(!r || !dsSerie) return;
  const d = r.dataset, n = +d.n, pontos = dsSerie.pontos;
  const y = v=> +d.t + +d.ih - (v - +d.min)/(+d.max - +d.min) * +d.ih;
  const xi = i=> +d.ml + (n===1 ? +d.iw/2 : i * +d.iw/(n-1));
  const g = document.getElementById('dsCruz');
  const mover = ev=>{
    const svg = r.ownerSVGElement, bx = svg.getBoundingClientRect();
    const px = (ev.touches?ev.touches[0].clientX:ev.clientX) - bx.left;
    const i = Math.max(0, Math.min(n-1, Math.round((px - +d.ml)/(+d.iw/Math.max(1,n-1)))));
    const p = pontos[i], X = xi(i);
    g.style.display = '';
    g.querySelector('line').setAttribute('x1',X); g.querySelector('line').setAttribute('x2',X);
    const cf = g.querySelector('.ds-cruz-f'), cl = g.querySelector('.ds-cruz-l');
    cf.setAttribute('cx',X); cf.setAttribute('cy',y(p.fat)); cl.setAttribute('cx',X); cl.setAttribute('cy',y(p.lucro));
    mostrarTip(`<b>${dsSerie.porMes ? p.rotulo : fmtData(p.chave)+' · '+SEMANA_CURTA[dataDe(p.chave).getDay()]}</b>
      <span><i style="background:${DS_COR.fat}"></i>Faturamento <em>${fmtBRL(p.fat)}</em></span>
      <span><i style="background:${DS_COR.lucro}"></i>Lucro <em>${fmtBRL(p.lucro)}</em></span>
      <span class="ds-tip-sec">${p.n} un. vendidas</span>`, bx.left+X, bx.top + +d.t);
  };
  r.addEventListener('mousemove', mover);
  r.addEventListener('touchstart', mover, {passive:true});
  r.addEventListener('touchmove', mover, {passive:true});
  r.addEventListener('mouseleave', ()=>{ g.style.display='none'; esconderTip(); });
}

/* ----- Vendas por categoria (barras horizontais, uma cor) ----- */
function dsBlocoCategorias(vendas){
  const g = {};
  vendas.forEach(v=>{ const c = v.p.categoria; g[c] = g[c] || { nome:c, fat:0, lucro:0, qtd:0 }; g[c].fat+=v.receita; g[c].lucro+=v.lucro; g[c].qtd+=v.qtd; });
  const lista = Object.values(g).sort((a,b)=>b.fat-a.fat);
  const max = lista[0].fat || 1, total = soma(lista,'fat') || 1;
  return `<div class="ds-card">
    <div class="ds-cab"><div><h3>Vendas por categoria</h3><small>Faturamento no período</small></div></div>
    <div class="ds-barras">${lista.map(c=>`
      <div class="ds-barra-linha" data-tip="<b>${escapar(c.nome)}</b><span>Faturamento <em>${fmtBRL(c.fat)}</em></span><span>Lucro <em>${fmtBRL(c.lucro)}</em></span><span>Margem <em>${fmtPctDs(c.fat?c.lucro/c.fat*100:NaN)}</em></span><span class='ds-tip-sec'>${c.qtd} un. · ${fmtPctDs(c.fat/total*100)} do faturamento</span>">
        <div class="ds-barra-rot">${escapar(c.nome)}<small>${c.qtd} un. · margem ${fmtPctDs(c.fat?c.lucro/c.fat*100:NaN)}</small></div>
        <div class="ds-barra-trilho"><div class="ds-barra" style="width:${Math.max(1.5, c.fat/max*100)}%;background:${DS_COR.fat}"></div></div>
        <div class="ds-barra-val">${fmtBRL(c.fat)}</div>
      </div>`).join('')}</div>
  </div>`;
}

/* ----- Formas de pagamento (só registro: o app não processa pagamentos) ----- */
function dsBlocoPagamentos(vendas){
  const g = {};
  vendas.forEach(v=>{ const k = v.pagamento || ''; g[k] = g[k] || { id:k, fat:0, qtd:0, vendas:new Set() }; g[k].fat += v.receita; g[k].qtd += v.qtd; g[k].vendas.add(v.m.vendaId || v.m.id); });
  const ordem = [...PAGAMENTOS.map(p=>p.id), ''];
  const lista = ordem.filter(k=>g[k]).map(k=>({ ...g[k], nome: k ? nomePagamento(k) : 'Não informada', n:g[k].vendas.size }));
  if(!lista.length) return '';
  const max = Math.max(...lista.map(x=>x.fat)) || 1, total = soma(lista,'fat') || 1;
  return `<div class="ds-card">
    <div class="ds-cab"><div><h3>Formas de pagamento</h3><small>Faturamento no período, pela forma registrada em cada venda</small></div></div>
    <div class="ds-barras">${lista.map(c=>`
      <div class="ds-barra-linha" data-tip="<b>${escapar(c.nome)}</b><span>Faturamento <em>${fmtBRL(c.fat)}</em></span><span>Vendas <em>${c.n}</em></span><span class='ds-tip-sec'>${c.qtd} un. · ${fmtPctDs(c.fat/total*100)} do faturamento</span>">
        <div class="ds-barra-rot">${escapar(c.nome)}<small>${c.n} venda(s) · ${fmtPctDs(c.fat/total*100)}</small></div>
        <div class="ds-barra-trilho"><div class="ds-barra" style="width:${Math.max(1.5, c.fat/max*100)}%;background:${c.id ? DS_COR.fat : DS_COR.neutro}"></div></div>
        <div class="ds-barra-val">${fmtBRL(c.fat)}</div>
      </div>`).join('')}</div>
  </div>`;
}

/* ----- Dias da semana (colunas; destaque no melhor dia) ----- */
function dsBlocoSemana(vendas, de, ate){
  const tot = Array.from({length:7},()=>({ fat:0, qtd:0 }));
  vendas.forEach(v=>{ const d = dataDe(v.data).getDay(); tot[d].fat+=v.receita; tot[d].qtd+=v.qtd; });
  // quantas vezes cada dia da semana aparece no período (para a média por dia)
  const ini = de || vendas.reduce((a,v)=>v.data<a?v.data:a, vendas[0].data);
  let fim = ate || vendas.reduce((a,v)=>v.data>a?v.data:a, vendas[0].data);
  if(fim > hoje()) fim = hoje();
  const ocorr = Array(7).fill(0);
  for(const d=dataDe(ini), f=dataDe(fim); d<=f; d.setDate(d.getDate()+1)) ocorr[d.getDay()]++;
  const max = Math.max(...tot.map(t=>t.fat)) || 1;
  const melhor = tot.findIndex(t=>t.fat===max);
  return `<div class="ds-card">
    <div class="ds-cab"><div><h3>Dias da semana</h3><small>Faturamento por dia da semana · melhor: <b>${SEMANA[melhor]}</b></small></div></div>
    <div class="ds-colunas">${tot.map((t,i)=>`
      <div class="ds-col" data-tip="<b>${SEMANA[i]}</b><span>Faturamento <em>${fmtBRL(t.fat)}</em></span><span>Média por ${SEMANA[i].toLowerCase()} <em>${fmtBRL(ocorr[i]?t.fat/ocorr[i]:0)}</em></span><span class='ds-tip-sec'>${t.qtd} un. · ${ocorr[i]} ${SEMANA[i].toLowerCase()}(s) no período</span>">
        <div class="ds-col-val">${i===melhor?fmtCompacto(t.fat):''}</div>
        <div class="ds-col-trilho"><div class="ds-col-barra" style="height:${t.fat?Math.max(3,t.fat/max*100):0}%;background:${i===melhor?DS_COR.fat:DS_COR.neutro}"></div></div>
        <div class="ds-col-rot${i===melhor?' forte':''}">${SEMANA_CURTA[i]}</div>
      </div>`).join('')}</div>
  </div>`;
}

/* ----- Melhores datas (ranking) ----- */
function dsBlocoMelhoresDatas(vendas){
  const g = {};
  vendas.forEach(v=>{ g[v.data] = g[v.data] || { data:v.data, fat:0, qtd:0, lucro:0 }; g[v.data].fat+=v.receita; g[v.data].qtd+=v.qtd; g[v.data].lucro+=v.lucro; });
  const lista = Object.values(g).sort((a,b)=>b.fat-a.fat).slice(0,5);
  const max = lista[0].fat || 1;
  return `<div class="ds-card">
    <div class="ds-cab"><div><h3>Melhores datas</h3><small>Os 5 dias com maior faturamento</small></div></div>
    <ol class="ds-rank">${lista.map((d,i)=>`
      <li data-tip="<b>${fmtData(d.data)} · ${SEMANA[dataDe(d.data).getDay()]}</b><span>Faturamento <em>${fmtBRL(d.fat)}</em></span><span>Lucro <em>${fmtBRL(d.lucro)}</em></span><span class='ds-tip-sec'>${d.qtd} un. vendidas</span>">
        <span class="ds-rank-n">${i+1}</span>
        <div class="ds-rank-corpo"><div class="ds-rank-topo"><span>${fmtData(d.data)} <small>${SEMANA_CURTA[dataDe(d.data).getDay()]}</small></span><b>${fmtBRL(d.fat)}</b></div>
          <div class="ds-mini"><div style="width:${d.fat/max*100}%;background:${DS_COR.fat}"></div></div>
          <small>${d.qtd} un. · lucro ${fmtBRL(d.lucro)}</small></div>
      </li>`).join('')}</ol>
  </div>`;
}

/* ----- Produtos mais vendidos ----- */
function dsBlocoProdutos(vendas){
  const g = {};
  vendas.forEach(v=>{ const id = v.p.id; g[id] = g[id] || { p:v.p, qtd:0, fat:0, lucro:0 }; g[id].qtd+=v.qtd; g[id].fat+=v.receita; g[id].lucro+=v.lucro; });
  const k = dsRanking==='unidades' ? 'qtd' : 'fat';
  const lista = Object.values(g).sort((a,b)=>b[k]-a[k] || b.fat-a.fat).slice(0,10);
  const max = lista[0][k] || 1;
  return `<div class="ds-card">
    <div class="ds-cab"><div><h3>Produtos mais vendidos</h3><small>Top ${lista.length} no período</small></div>
      <div class="ds-alterna" role="group">
        <button class="${dsRanking==='unidades'?'ativo':''}" onclick="dsTrocarRanking('unidades')">Unidades</button>
        <button class="${dsRanking==='faturamento'?'ativo':''}" onclick="dsTrocarRanking('faturamento')">Faturamento</button>
      </div></div>
    <ol class="ds-rank">${lista.map((x,i)=>`
      <li data-tip="<b>${escapar(x.p.nome)}</b><span>Unidades <em>${x.qtd}</em></span><span>Faturamento <em>${fmtBRL(x.fat)}</em></span><span>Lucro <em>${fmtBRL(x.lucro)}</em></span><span>Margem <em>${fmtPctDs(x.fat?x.lucro/x.fat*100:NaN)}</em></span>">
        <span class="ds-rank-n">${i+1}</span>
        <div class="ds-rank-corpo"><div class="ds-rank-topo"><span>${escapar(x.p.nome)}${x.p.arquivado?' <span class="badge-arquivado">Arquivado</span>':''}</span><b>${k==='qtd'?x.qtd+' un.':fmtBRL(x.fat)}</b></div>
          <div class="ds-mini"><div style="width:${x[k]/max*100}%;background:${DS_COR.fat}"></div></div>
          <small>${k==='qtd'?fmtBRL(x.fat):x.qtd+' un.'} · lucro ${fmtBRL(x.lucro)}</small></div>
      </li>`).join('')}</ol>
  </div>`;
}

/* ----- Produtos parados (independe do período) ----- */
function dsBlocoParados(){
  if(!estado.produtos.some(p=>!p.arquivado)) return '';   // sem produtos cadastrados: o card não aparece
  const lista = estado.produtos.filter(p=>!p.arquivado && estoqueDe(p)>0).map(p=>{
    const vendasP = saidas(p).filter(m=>m.motivo==='Venda' || m.motivo==='A receber').map(m=>m.data).sort();
    const ultVenda = vendasP[vendasP.length-1] || null;
    const desde = ultVenda || entradas(p).map(m=>m.data).sort()[0];
    const dias = desde ? diasDesde(desde) : 0;
    const custoParado = composicaoEstoque(p).reduce((s,g)=>s+g.qtd*g.custo,0);
    return { p, ultVenda, dias, est:estoqueDe(p), custoParado };
  }).filter(x=>x.dias>=DS_DIAS_PARADO).sort((a,b)=>b.custoParado-a.custoParado);
  const total = soma(lista,'custoParado');
  return `<div class="ds-card">
    <div class="ds-cab"><div><h3>Produtos parados</h3><small>Com estoque e sem venda há ${DS_DIAS_PARADO} dias ou mais · não depende do período</small></div>
      ${lista.length?`<div class="ds-total">${fmtBRL(total)}<small>em custo parado</small></div>`:''}</div>
    ${lista.length ? `<div class="ds-parados">${lista.map(x=>`
      <div class="ds-parado" onclick="abrirMov('${x.p.id}')" title="Abrir o Painel do Produto">
        <div class="nome">${escapar(x.p.nome)}<small>${x.p.marca?escapar(x.p.marca)+' · ':''}${x.ultVenda?'última venda em '+fmtData(x.ultVenda):'nunca vendido'}</small></div>
        <div class="val">${x.dias} dias<small>${x.est} un.</small></div>
        <div class="val">${fmtBRL(x.custoParado)}<small>custo</small></div>
      </div>`).join('')}</div>` : '<div class="ini-vazio">Nenhum produto parado. Tudo girando.</div>'}
  </div>`;
}

/* ----- Tooltip compartilhado ----- */
function mostrarTip(html, x, y){
  const t = document.getElementById('dsTip');
  t.innerHTML = html; t.classList.add('mostra');
  const w = t.offsetWidth, hgt = t.offsetHeight;
  let left = x - w/2, top = y - hgt - 10;
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
  if(top < 8) top = y + 18;
  t.style.left = left+'px'; t.style.top = top+'px';
}
function esconderTip(){ document.getElementById('dsTip').classList.remove('mostra'); }
function ligarTooltips(raiz){
  raiz.querySelectorAll('[data-tip]').forEach(el=>{
    const mostra = ()=>{ const r = el.getBoundingClientRect(); mostrarTip(el.dataset.tip, r.left + r.width/2, r.top); };
    el.addEventListener('mouseenter', mostra);
    el.addEventListener('mouseleave', esconderTip);
    el.addEventListener('touchstart', mostra, {passive:true});
  });
}
document.addEventListener('scroll', esconderTip, true);
let dsResizeT;
window.addEventListener('resize', ()=>{ clearTimeout(dsResizeT); dsResizeT = setTimeout(()=>{ if(viewAtual==='desempenho') renderDesempenho(); }, 150); });

/* =========================================================
   FINANCEIRO — FATURAMENTO MEI
   Dados em estado.financeiro = { notas, tetos, cancelamentos, abertura }
   - notas: lidas dos XMLs de NF-e / NFC-e
   - tetos: teto manual por ano (opcional), ex.: { "2027": 95000 }
   - cancelamentos: chaves de notas canceladas (eventos 110111)
   - abertura: mês de abertura do MEI ("AAAA-MM") → teto proporcional no 1º ano
   ========================================================= */
/* Teto anual do MEI por vigência (do mais novo para o mais antigo).
   Para mudar o valor no futuro, basta acrescentar uma linha aqui. */
const TETOS_MEI = [
  { desde:2027, valor:110000 },
  { desde:0,    valor:81000  }
];
const TOLERANCIA_MEI = 0.20;   // até 20% acima do teto: desenquadra só no ano seguinte

function garantirFinanceiro(e){
  if(!e.financeiro) e.financeiro = {};
  const f = e.financeiro;
  f.notas = f.notas || [];
  f.tetos = f.tetos || {};
  f.cancelamentos = f.cancelamentos || [];
  f.abertura = f.abertura || '';
  return e;
}
garantirFinanceiro(estado);
function fin(){ return estado.financeiro; }
let finAnoAtual = new Date().getFullYear();

function idNota(n){ return n.chave || `${n.numero}-${n.serie}-${n.ano}`; }
function notaCancelada(n){ return !!n.chave && fin().cancelamentos.some(c=>c.chave===n.chave); }
function tetoBase(ano){ return TETOS_MEI.find(t=>ano>=t.desde).valor; }
function tetoDoAno(ano){
  const manual = fin().tetos[ano];
  if(manual!=null) return { valor:manual, origem:'manual' };
  const base = tetoBase(ano);
  const ab = fin().abertura;
  if(ab && parseInt(ab.slice(0,4))===ano){
    const meses = 12 - parseInt(ab.slice(5,7)) + 1;
    return { valor: base/12*meses, origem:'proporcional', meses };
  }
  return { valor:base, origem:'padrao' };
}
function notasDoAno(ano){
  return fin().notas.filter(n=>n.ano===ano).sort((a,b)=>(b.dataEmissao||'').localeCompare(a.dataEmissao||''));
}
function faturadoDoAno(ano){
  return notasDoAno(ano).filter(n=>!notaCancelada(n)).reduce((s,n)=>s+(n.valor||0),0);
}
function fmtPct(p){ return (Math.round(p*10)/10).toLocaleString('pt-BR'); }

/* Faixas de alerta. nivel cresce com o uso: 0 ok · 1 50% · 2 75% · 3 90% · 4 tolerância · 5 acima de 20% */
function faixaDe(ano){
  const teto = tetoDoAno(ano).valor, fat = faturadoDoAno(ano);
  const pct = teto>0 ? fat/teto*100 : 0;
  const limiteTol = teto*(1+TOLERANCIA_MEI);
  if(fat>limiteTol) return { nivel:5, cor:'var(--vermelho)', fraca:'var(--vermelho-claro)', icone:'⛔',
    texto:`Faturamento acima da tolerância de 20% (${fmtBRL(limiteTol)}). Nesse caso o desenquadramento do MEI é retroativo a 1º de janeiro de ${ano} (ou à data de abertura). Procure seu contador.` };
  if(fat>teto) return { nivel:4, cor:'var(--vermelho)', fraca:'var(--vermelho-claro)', icone:'⚠',
    texto:`Faixa de tolerância: o teto foi ultrapassado em ${fmtBRL(fat-teto)}. Até ${fmtBRL(limiteTol)} (20% acima), o MEI é desenquadrado a partir de 1º de janeiro de ${ano+1} e paga imposto complementar sobre o excesso. Restam ${fmtBRL(limiteTol-fat)} até o fim da tolerância.` };
  if(pct>=90) return { nivel:3, cor:'var(--vermelho)', fraca:'var(--vermelho-claro)', icone:'⚠',
    texto:`Cuidado: ${fmtPct(pct)}% do teto usado. Restam apenas ${fmtBRL(teto-fat)} para ${ano}.` };
  if(pct>=75) return { nivel:2, cor:'var(--laranja)', fraca:'#FBEADB', icone:'▲',
    texto:`Atenção: você já usou ${fmtPct(pct)}% do teto anual.` };
  if(pct>=50) return { nivel:1, cor:'var(--ambar)', fraca:'var(--amarelo-claro)', icone:'●',
    texto:`Você atingiu ${fmtPct(pct)}% do teto anual.` };
  return { nivel:0, cor:'var(--verde)', fraca:'#E5F2E6', icone:'✓', texto:'' };
}
const NOMES_FAIXA = ['', 'passou de 50% do teto', 'passou de 75% do teto', 'passou de 90% do teto', 'ultrapassou o teto e entrou na faixa de tolerância', 'passou de 20% acima do teto'];

function anosFinanceiro(){
  const anos = new Set(fin().notas.map(n=>n.ano));
  anos.add(new Date().getFullYear()); anos.add(finAnoAtual);
  if(fin().abertura) anos.add(parseInt(fin().abertura.slice(0,4)));
  return [...anos].filter(Boolean).sort((a,b)=>b-a);
}

function renderFinanceiro(){
  const ano = finAnoAtual;
  const t = tetoDoAno(ano), teto = t.valor;
  const fat = faturadoDoAno(ano);
  const pct = teto>0 ? fat/teto*100 : 0;
  const faixa = faixaDe(ano);
  const raiz = document.getElementById('viewFinanceiro');
  raiz.style.setProperty('--faixa', faixa.cor);
  raiz.style.setProperty('--faixa-fraca', faixa.fraca);

  document.getElementById('finAno').innerHTML =
    anosFinanceiro().map(a=>`<option value="${a}" ${a===ano?'selected':''}>${a}</option>`).join('');

  const origem = t.origem==='manual' ? 'definido manualmente'
    : t.origem==='proporcional' ? `proporcional: ${t.meses} ${t.meses===1?'mês':'meses'} desde a abertura em ${fin().abertura.slice(5,7)}/${fin().abertura.slice(0,4)}`
    : 'padrão do MEI';
  document.getElementById('finTetoInfo').textContent = `Teto ${ano}: ${fmtBRL(teto)} (${origem})`;

  if(fat<=teto){
    document.getElementById('finRotulo').textContent = 'Disponível para faturar';
    document.getElementById('finDisponivel').textContent = fmtBRL(teto-fat);
  } else {
    document.getElementById('finRotulo').textContent = 'Acima do teto';
    document.getElementById('finDisponivel').textContent = '+ ' + fmtBRL(fat-teto);
  }
  document.getElementById('finUso').textContent = `${fmtBRL(fat)} de ${fmtBRL(teto)} utilizados · ${fmtPct(pct)}%`;

  // Medidor: a escala vai até 120% do teto; o trecho final listrado é a faixa de tolerância
  const escala = 100*(1+TOLERANCIA_MEI);
  const pos = p=>(p/escala*100)+'%';
  document.getElementById('finBarra').style.width = Math.min(100, pct/escala*100)+'%';
  const trilho = document.getElementById('finTrilho');
  trilho.querySelectorAll('.fin-marca').forEach(m=>m.remove());
  [50,75,90].forEach(p=>{ const m=document.createElement('span'); m.className='fin-marca'; m.style.left=pos(p); trilho.appendChild(m); });
  document.getElementById('finLegendas').innerHTML =
    `<span style="left:0">0</span><span style="left:${pos(50)}">50%</span><span style="left:${pos(100)}">Teto</span><span style="left:100%">+20%</span>`;

  const al = document.getElementById('finAlerta');
  al.classList.toggle('mostrar', !!faixa.texto);
  document.getElementById('finAlertaIcone').textContent = faixa.icone;
  document.getElementById('finAlertaTexto').textContent = faixa.texto;

  const notas = notasDoAno(ano);
  const validas = notas.filter(n=>!notaCancelada(n));
  const canc = notas.length - validas.length;
  document.getElementById('finStFaturado').textContent = fmtBRL(fat);
  document.getElementById('finStNotas').textContent = validas.length;
  document.getElementById('finStMedia').textContent = fmtBRL(validas.length ? fat/validas.length : 0);
  document.getElementById('finStCanc').textContent = canc;
  document.getElementById('finContagem').textContent = `${notas.length} ${notas.length===1?'nota':'notas'} em ${ano}`;

  const cont = document.getElementById('finNotas');
  if(!notas.length){
    cont.innerHTML = `<div class="nf-tabela"><div class="vazio" style="padding:34px 20px">
      <h3>Nenhuma nota em ${ano}</h3><p>Clique em “+ Importar XML” para adicionar notas fiscais.</p></div></div>`;
    return;
  }
  cont.innerHTML = `<div class="nf-tabela">
    <div class="nf-cab"><div>Nº / Série</div><div class="nf-col-data">Emissão</div><div>Cliente</div><div class="num">Valor</div><div></div></div>` +
    notas.map(n=>{
      const c = notaCancelada(n);
      return `<div class="nf-linha ${c?'cancelada':''}">
        <div class="nf-num">${escapar(n.numero||'—')}${n.serie?'/'+escapar(n.serie):''}${c?'<span class="tag-canc">cancelada</span>':''}</div>
        <div class="nf-num nf-col-data">${fmtData((n.dataEmissao||'').slice(0,10))}</div>
        <div>${escapar(n.cliente)}<small class="nf-data-mob">${fmtData((n.dataEmissao||'').slice(0,10))}</small></div>
        <div class="num">${fmtBRL(n.valor)}</div>
        <div><button class="btn-x" title="Remover nota" onclick="removerNota('${escapar(idNota(n))}')">✕</button></div>
      </div>`;
    }).join('') + `</div>`;
}

/* ===== Leitura de XML: NF-e / NFC-e ou evento de cancelamento ===== */
function lerXmlFiscal(texto){
  const doc = new DOMParser().parseFromString(texto, 'text/xml');
  if(doc.getElementsByTagName('parsererror').length) return null;
  const t = (tag, ctx=doc)=>ctx.getElementsByTagName(tag)[0]?.textContent?.trim() || '';

  const infNFe = doc.getElementsByTagName('infNFe')[0];
  if(infNFe){
    const dataEmissao = t('dhEmi') || t('dEmi');
    if(!dataEmissao) return null;
    const emit = doc.getElementsByTagName('emit')[0];
    const dest = doc.getElementsByTagName('dest')[0];
    return { tipo:'nota', nota:{
      chave: (infNFe.getAttribute('Id')||'').replace(/^NFe/i,''),
      numero: t('nNF'), serie: t('serie'),
      dataEmissao, ano: parseInt(dataEmissao.slice(0,4),10),
      emitente: emit ? t('xNome',emit) : '',
      cliente: (dest ? t('xNome',dest) : '') || 'Consumidor não identificado',
      valor: parseFloat(t('vNF')||'0') || 0
    }};
  }

  const infEvento = doc.getElementsByTagName('infEvento')[0];
  if(infEvento){
    if(t('tpEvento',infEvento)!=='110111') return { tipo:'outroEvento' };
    // Se o XML traz o retorno da SEFAZ, só aceita evento registrado (135 / 155)
    const ret = doc.getElementsByTagName('retEvento')[0];
    if(ret){ const st = t('cStat',ret); if(st && !['135','136','155'].includes(st)) return { tipo:'eventoRejeitado' }; }
    return { tipo:'cancelamento', chave:t('chNFe',infEvento), data:(t('dhEvento',infEvento)||'').slice(0,10) };
  }
  return null;
}

async function importarXMLs(ev){
  const arquivos = [...ev.target.files];
  ev.target.value = '';
  if(!arquivos.length) return;

  // faixas antes da importação, para avisar quando alguma for cruzada
  const anosAntes = new Set(fin().notas.map(n=>n.ano));
  const nivelAntes = {};
  const nivelDe = ano=>faixaDe(ano).nivel;

  let add=0, dup=0, inval=0, canc=0, outros=0, ultimoAno=null;
  const lidos = [];
  for(const f of arquivos){
    const r = lerXmlFiscal(await f.text());
    if(!r){ inval++; continue; }
    lidos.push(r);
  }
  // anos afetados (notas novas e notas canceladas)
  lidos.forEach(r=>{
    if(r.tipo==='nota') nivelAntes[r.nota.ano] ??= nivelDe(r.nota.ano);
    if(r.tipo==='cancelamento'){ const n=fin().notas.find(x=>x.chave===r.chave); if(n) nivelAntes[n.ano] ??= nivelDe(n.ano); }
  });

  for(const r of lidos){
    if(r.tipo==='nota'){
      const id = idNota(r.nota);
      if(fin().notas.some(n=>idNota(n)===id)){ dup++; continue; }
      fin().notas.push(r.nota); add++; ultimoAno = r.nota.ano;
    } else if(r.tipo==='cancelamento'){
      if(!r.chave){ inval++; continue; }
      if(fin().cancelamentos.some(c=>c.chave===r.chave)){ dup++; continue; }
      fin().cancelamentos.push({ chave:r.chave, data:r.data });   // vale mesmo se a nota for importada depois
      canc++;
    } else outros++;
  }
  salvar();
  if(ultimoAno) finAnoAtual = ultimoAno;
  renderFinanceiro();

  const partes = [];
  if(add)   partes.push(`${add} nota(s) importada(s)`);
  if(canc)  partes.push(`${canc} cancelamento(s) registrado(s)`);
  if(dup)   partes.push(`${dup} já existia(m)`);
  if(outros)partes.push(`${outros} evento(s) ignorado(s)`);
  if(inval) partes.push(`${inval} arquivo(s) não reconhecido(s)`);
  const resumo = partes.join(' · ') || 'Nada importado.';

  // aviso quando a importação faz o faturamento subir de faixa
  const cruzou = Object.keys(nivelAntes).map(Number).filter(a=>nivelDe(a)>nivelAntes[a]);
  if(cruzou.length){
    const linhas = cruzou.map(a=>{ const fx=faixaDe(a);
      return `<p style="margin-bottom:10px"><b>${a}:</b> o faturamento ${NOMES_FAIXA[fx.nivel]}.<br><span style="color:var(--texto-sec);font-size:14px">${escapar(fx.texto)}</span></p>`; }).join('');
    mostrarAviso('Faturamento mudou de faixa', `<p style="margin-bottom:12px">${escapar(resumo)}.</p>${linhas}`);
  } else {
    toast(resumo);
  }
}

function removerNota(id){
  const n = fin().notas.find(x=>idNota(x)===id);
  if(!n) return;
  pedirConfirmacao(`Remover a nota ${n.numero||''} de ${n.cliente} (${fmtBRL(n.valor)})? Ela deixa de contar no faturamento.`, ()=>{
    fin().notas = fin().notas.filter(x=>x!==n);
    salvar(); renderFinanceiro(); toast('Nota removida.');
  }, 'Remover nota fiscal');
}

/* Junta um backup antigo do app Faturamento MEI ({notas, tetos}) ao financeiro */
function mesclarBackupMEI(dados){
  let add = 0;
  (dados.notas||[]).forEach(n=>{
    if(!fin().notas.some(x=>idNota(x)===idNota(n))){ fin().notas.push(n); add++; }
  });
  Object.entries(dados.tetos||{}).forEach(([ano,v])=>{
    // o app antigo gravava 81000 como teto de todo ano; só mantém tetos diferentes do padrão
    if(fin().tetos[ano]==null && Number(v)!==tetoBase(Number(ano))) fin().tetos[ano] = Number(v);
  });
  return add;
}

/* ===== Configurar teto ===== */
function abrirConfigTeto(){
  document.getElementById('tetoAnoLabel').textContent = finAnoAtual;
  document.getElementById('tetoAbertura').value = fin().abertura || '';
  const m = fin().tetos[finAnoAtual];
  document.getElementById('tetoManual').value = m!=null ? m : '';
  previaTeto();
  abrir('modalTeto');
}
function previaTeto(){
  const ano = finAnoAtual;
  const ab = val('tetoAbertura');
  const manual = parseFloat(val('tetoManual'));
  const base = tetoBase(ano);
  let valor = base, info = `Padrão do MEI para ${ano}.`;
  if(!isNaN(manual) && manual>0){ valor = manual; info = 'Valor definido manualmente.'; }
  else if(ab && parseInt(ab.slice(0,4))===ano){
    const meses = 12 - parseInt(ab.slice(5,7)) + 1;
    valor = base/12*meses; info = `${fmtBRL(base/12)} × ${meses} ${meses===1?'mês':'meses'} (ano de abertura).`;
  }
  document.getElementById('tetoPrevia').textContent = fmtBRL(valor);
  document.getElementById('tetoPreviaInfo').textContent = info;
}
function salvarConfigTeto(){
  const manual = parseFloat(val('tetoManual'));
  fin().abertura = val('tetoAbertura') || '';
  if(!isNaN(manual) && manual>0) fin().tetos[finAnoAtual] = manual;
  else delete fin().tetos[finAnoAtual];
  salvar(); fechar('modalTeto'); renderFinanceiro(); toast('Teto atualizado.');
}

/* ===== Aviso informativo (modal) ===== */
function mostrarAviso(titulo, html, botao){
  document.getElementById('avisoTitulo').textContent = titulo;
  const b = document.getElementById('avisoBotao');
  b.textContent = botao || 'Entendi';
  b.className = 'btn ' + (botao ? 'btn-claro' : 'btn-amarelo');
  document.getElementById('avisoTexto').innerHTML = html;
  abrir('modalAviso');
}

/* =========================================================
   SINCRONIZAÇÃO NA NUVEM (Cloudflare Worker + banco D1 — código em cloudflare/sync-worker.js)
   - A nuvem guarda o mesmo conteúdo do backup JSON, com um número de versão.
   - Cada aparelho guarda a "base": a última versão que ele recebeu/enviou. Ao enviar, diz em
     qual versão se baseou; se a nuvem mudou nesse meio-tempo (outro aparelho enviou), o app
     junta as alterações dos dois lados (mesclar3) e envia de novo. Nada é sobrescrito às cegas.
   - Endereço, senha e base ficam em localStorage próprio, fora do `estado` e do backup.
   - Status só em Configurações; erros também aparecem como toast.
   ========================================================= */
const SYNC_CHAVE = 'chinatown_sync_v1';
const SYNC_BASE  = 'chinatown_sync_base';
const Sync = {
  _c: undefined, _base: undefined,
  ler(){
    if(this._c===undefined){ try{ this._c = JSON.parse(localStorage.getItem(SYNC_CHAVE)) || null; }catch(e){ this._c = null; } }
    return this._c;
  },
  gravar(d){ this._c = d; try{ if(d) localStorage.setItem(SYNC_CHAVE, JSON.stringify(d)); else localStorage.removeItem(SYNC_CHAVE); }catch(e){} },
  atualizar(p){ const d = this.ler(); if(d){ Object.assign(d, p); this.gravar(d); } },
  conectado(){ const d = this.ler(); return !!(d && d.url && d.senha && d.conectado); },
  lerBase(){
    if(this._base===undefined){ try{ const t = localStorage.getItem(SYNC_BASE); this._base = t ? JSON.parse(t) : null; }catch(e){ this._base = null; } }
    return this._base ? JSON.parse(JSON.stringify(this._base)) : undefined;
  },
  gravarBase(obj){
    this._base = obj ? JSON.parse(JSON.stringify(obj)) : null;
    try{ if(obj) localStorage.setItem(SYNC_BASE, JSON.stringify(obj)); else localStorage.removeItem(SYNC_BASE); }catch(e){}   // sem espaço: fica só na memória
  }
};

/* ----- Junção de três vias: base (último estado em comum), local e remoto -----
   - Mudou só de um lado → vale esse lado.
   - Listas com identificação (produtos, movimentações, notas, categorias) → item por item:
     itens novos dos dois lados entram; item apagado de um lado e intocado do outro sai;
     apagado de um lado e editado do outro → a edição vence (nada se perde).
   - Mesmo campo editado nos dois lados → vale o aparelho com a alteração mais recente. */
const ehObjeto = v => v!==null && typeof v==='object' && !Array.isArray(v);
function jsonEstavel(v){
  return JSON.stringify(v, (k,x)=> ehObjeto(x) ? Object.keys(x).sort().reduce((o,c)=>(o[c]=x[c],o),{}) : x);
}
function iguais(a, b){ return a===b || jsonEstavel(a)===jsonEstavel(b); }
function chaveItem(x){
  if(typeof x==='string' || typeof x==='number') return 'v:'+x;
  if(!ehObjeto(x)) return null;
  if(x.id!=null) return 'id:'+x.id;
  if(x.chave) return 'ch:'+x.chave;                                   // notas e cancelamentos
  if(x.numero!=null) return `nf:${x.numero}-${x.serie}-${x.ano}`;      // notas sem chave
  return null;
}
function mesclar3(b, l, r, localGanha){
  if(iguais(l, r)) return l;
  if(iguais(b, l)) return r;
  if(iguais(b, r)) return l;
  if(l===undefined) return r;    // apagado aqui, editado lá: mantém
  if(r===undefined) return l;
  if(ehObjeto(l) && ehObjeto(r)){
    const bo = ehObjeto(b) ? b : {}, out = {};
    new Set([...Object.keys(l), ...Object.keys(r)]).forEach(k=>{
      const v = mesclar3(bo[k], l[k], r[k], localGanha);
      if(v!==undefined) out[k] = v;
    });
    return out;
  }
  if(Array.isArray(l) && Array.isArray(r)){
    const ba = Array.isArray(b) ? b : [];
    const todos = [...ba, ...l, ...r];
    if(todos.every(x=>chaveItem(x)!==null)){
      const mapa = a=>{ const m = new Map(); a.forEach(x=>m.set(chaveItem(x), x)); return m; };
      const mb = mapa(ba), ml = mapa(l), mr = mapa(r);
      const ordem = [...new Set([...l.map(chaveItem), ...r.map(chaveItem)])];
      const out = [];
      ordem.forEach(k=>{ const v = mesclar3(mb.get(k), ml.get(k), mr.get(k), localGanha); if(v!==undefined) out.push(v); });
      return out;
    }
  }
  return localGanha ? l : r;
}
/* Depois de juntar: garante a estrutura e que toda categoria usada por um produto existe */
function normalizarEstado(e){
  e.categorias = Array.isArray(e.categorias) ? e.categorias : [];
  e.produtos = Array.isArray(e.produtos) ? e.produtos : [];
  e.produtos.forEach(p=>{
    p.movimentacoes = Array.isArray(p.movimentacoes) ? p.movimentacoes : [];
    if(p.categoria && !e.categorias.includes(p.categoria)) e.categorias.push(p.categoria);
  });
  e.config = e.config || {};
  return garantirFinanceiro(e);
}

/* ----- Comunicação com o Worker ----- */
class ErroSync extends Error{ constructor(tipo, msg){ super(msg); this.tipo = tipo; } }
async function syncReq(metodo, caminho, corpo){
  const d = Sync.ler();
  let r;
  try{
    r = await fetch(d.url + caminho, {
      method: metodo, cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + d.senha, ...(corpo ? {'Content-Type':'application/json'} : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
  }catch(e){
    throw new ErroSync('rede', navigator.onLine===false
      ? 'Sem internet. As alterações deste aparelho serão enviadas quando a conexão voltar.'
      : 'Não foi possível falar com o Worker da sincronização. Confira o endereço.');
  }
  let j = null; try{ j = await r.json(); }catch(e){}
  if(r.status===409) return { conflito:true, ...j };
  if(r.status===401) throw new ErroSync('senha', 'Senha da sincronização incorreta: ela precisa ser igual à SENHA_SYNC cadastrada no Worker.');
  if(!r.ok){
    const e = new ErroSync('api', (j && j.mensagem) || `O Worker respondeu com erro (${r.status}).`);
    e.codigo = j && j.erro;
    throw e;
  }
  return j || {};
}

/* ----- Status (aparece em Configurações) ----- */
let syncFase = { tipo:'', msg:'' };
function syncStatus(tipo, msg){
  const mudou = syncFase.tipo!==tipo || syncFase.msg!==msg;
  syncFase = { tipo, msg:msg||'' };
  if(tipo==='erro' && mudou) toast(msg);
  syncRenderStatus();
}

/* ----- Ciclo de sincronização ----- */
let syncRodando = false, syncDeNovo = false, syncTimer = null, syncPendenteDesde = 0;
const modalAberto = ()=> !!document.querySelector('.overlay.aberto');

/* Chamada pelo salvar(): marca alteração local e agenda o envio */
function syncMarcarAlteracao(){
  try{ if(sandbox.ativo || !Sync.conectado()) return; }catch(e){ return; }   // sandbox, ou chamado antes do módulo carregar: ignora
  const d = Sync.ler();
  if(!d.pendente) syncPendenteDesde = Date.now();
  Sync.atualizar({ pendente:true, modificadoEm:Date.now() });
  syncAgendar(4000);
}
function syncAgendar(ms){
  clearTimeout(syncTimer);
  // alterações seguidas adiam o envio, mas nunca por mais de 30 s
  const espera = (syncPendenteDesde && Date.now()-syncPendenteDesde > 30000) ? 0 : ms;
  syncTimer = setTimeout(sincronizar, espera);
}
function sincronizarAgora(){ if(emSandbox('sincronizar')) return; syncStatus('rodando'); sincronizar(); }

async function sincronizar(){
  if(sandbox.ativo || !Sync.conectado()) return;   // sandbox: a sincronização fica em pausa
  if(syncRodando){ syncDeNovo = true; return; }
  syncRodando = true; clearTimeout(syncTimer);
  let adiado = false;
  try{
    for(let tentativa=0; tentativa<4; tentativa++){
      const d = Sync.ler();
      if(d.pendente){
        if(syncFase.tipo!=='rodando') syncStatus('rodando');
        const marca = d.modificadoEm;
        const enviado = JSON.parse(JSON.stringify(estado));
        const r = await syncReq('PUT', '/dados', { base:d.versao||0, aparelho:d.aparelho, dados:enviado });
        if(!r.conflito){
          Sync.gravarBase(enviado);
          const aindaPendente = Sync.ler().modificadoEm!==marca;   // mudou algo durante o envio
          Sync.atualizar({ versao:r.versao, pendente:aindaPendente, sincronizadoEm:Date.now(), remotoEm:r.atualizadoEm, remotoAparelho:r.aparelho });
          if(aindaPendente) syncDeNovo = true; else syncPendenteDesde = 0;
          break;
        }
        // outro aparelho enviou antes: junta e tenta de novo (nunca com um formulário aberto)
        if(modalAberto()){ adiado = true; break; }
        syncAplicarJuncao(r);
      } else {
        const v = await syncReq('GET', '/versao');
        if(v.versao===(d.versao||0)){ Sync.atualizar({ sincronizadoEm:Date.now(), remotoEm:v.atualizadoEm, remotoAparelho:v.aparelho }); break; }
        if(modalAberto()){ adiado = true; break; }
        const rem = await syncReq('GET', '/dados');
        if(Sync.ler().pendente || modalAberto()){ if(modalAberto()){ adiado = true; break; } syncAplicarJuncao(rem); continue; }
        syncAdotarRemoto(rem);
        break;
      }
    }
    syncStatus(Sync.ler() && Sync.ler().pendente ? 'pendente' : 'ok');
    if(Sync.ler() && !Sync.ler().pendente && !adiado) await pushEnviarFila();   // dados na nuvem: agora saem os avisos de venda
  }catch(e){
    syncStatus(e.tipo==='rede' && navigator.onLine===false ? 'offline' : 'erro', e.message);
  }finally{
    syncRodando = false;
    if(adiado) syncAgendar(5000);
    else if(syncDeNovo){ syncDeNovo = false; syncAgendar(1500); }
  }
}
function syncAtualizarTela(){ render(); renderViewAtual(); if(typeof atualizarAlertas==='function') atualizarAlertas(); }
/* Recebe os dados da nuvem quando este aparelho não tem nada pendente */
function syncAdotarRemoto(rem){
  if(!rem.dados) return;
  estado = normalizarEstado(rem.dados);
  Armazenamento.gravar(estado);
  Sync.gravarBase(rem.dados);
  Sync.atualizar({ versao:rem.versao, pendente:false, sincronizadoEm:Date.now(), remotoEm:rem.atualizadoEm, remotoAparelho:rem.aparelho });
  syncAtualizarTela();
}
/* Junta as alterações deste aparelho com as que chegaram da nuvem (continua pendente para enviar) */
function syncAplicarJuncao(rem){
  const d = Sync.ler();
  if(rem.dados){
    const localGanha = (d.modificadoEm||0) > Date.parse(rem.atualizadoEm||0);
    estado = normalizarEstado(mesclar3(Sync.lerBase(), estado, rem.dados, localGanha));
    Armazenamento.gravar(estado);
    Sync.gravarBase(rem.dados);
    syncAtualizarTela();
  }
  Sync.atualizar({ versao:rem.versao||0, pendente:true, remotoEm:rem.atualizadoEm, remotoAparelho:rem.aparelho });
}

/* ----- Configurações: conectar, desconectar, cópias ----- */
function syncNomePadrao(){ return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Celular' : 'Computador'; }
function contagemDados(e){
  const p = (e && e.produtos) || [];
  return `${p.length} produto(s) e ${p.reduce((s,x)=>s+((x.movimentacoes||[]).length),0)} movimentação(ões)`;
}
let syncRemotoEscolha = null;
async function syncConectar(){
  if(emSandbox('conectar a sincronização')) return;
  const atual = Sync.ler();
  const url = normalizarUrlWorker(val('cfgSyncUrl'));
  let senha = val('cfgSyncSenha');
  if(senha==='••••••••' && atual) senha = atual.senha;
  const aparelho = val('cfgSyncAparelho').trim() || syncNomePadrao();
  if(!url || !senha){ syncStatus('erro', 'Informe o endereço do Worker e a senha da sincronização.'); return; }
  Sync.gravar({ url, senha, aparelho, conectado:false, versao:0 });
  Sync.gravarBase(null);
  syncStatus('rodando', 'Conectando…');
  try{
    const v = await syncReq('GET', '/versao');
    if(!v.versao){
      // nuvem vazia: este aparelho envia os dados dele
      Sync.atualizar({ conectado:true, pendente:true, modificadoEm:Date.now() });
      await sincronizar();
      if(Sync.ler().pendente) return;
      mostrarAviso('Sincronização ligada',
        `<p>Os dados deste aparelho (${contagemDados(estado)}) foram enviados para a nuvem.</p>
         <p style="margin-top:10px;color:var(--texto-sec);font-size:14px">Agora, no outro aparelho, abra Configurações e conecte com o mesmo endereço e a mesma senha.</p>`);
      return;
    }
    const rem = await syncReq('GET', '/dados');
    const vazio = estado.produtos.length===0 && fin().notas.length===0;
    if(vazio){
      Sync.atualizar({ conectado:true });
      syncAdotarRemoto(rem); syncStatus('ok');
      toast('Dados da nuvem carregados neste aparelho.');
      return;
    }
    syncRemotoEscolha = rem;
    syncStatus('', '');
    const quando = rem.atualizadoEm ? new Date(rem.atualizadoEm) : null;
    mostrarAviso('A nuvem já tem dados',
      `<p>Na nuvem: <b>${contagemDados(rem.dados)}</b>${quando?`, última alteração em ${quando.toLocaleDateString('pt-BR')} às ${quando.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:''}${rem.aparelho?` (${escapar(rem.aparelho)})`:''}.</p>
       <p style="margin-top:8px">Neste aparelho: <b>${contagemDados(estado)}</b>.</p>
       <p style="margin-top:10px;color:var(--texto-sec);font-size:14px">Escolha quais dados ficam. Os outros são substituídos — se tiver dúvida, baixe um backup deste aparelho antes.</p>
       <div class="sy-escolha">
         <button class="btn btn-amarelo" onclick="syncEscolher('nuvem')">Usar os dados da nuvem</button>
         <button class="btn btn-claro" onclick="syncEscolher('local')">Manter os deste aparelho</button>
         <button class="btn btn-claro btn-mini" onclick="exportar()">↓ Backup deste aparelho</button>
       </div>`, 'Agora não');
  }catch(e){
    Sync.gravar(null);
    syncStatus('erro', e.message);
  }
}
function syncEscolher(qual){
  const rem = syncRemotoEscolha; if(!rem) return;
  fechar('modalAviso');
  if(qual==='nuvem'){
    syncRemotoEscolha = null;
    Sync.atualizar({ conectado:true });
    syncAdotarRemoto(rem); syncStatus('ok');
    toast('Dados da nuvem carregados neste aparelho.');
    return;
  }
  pedirConfirmacao(`Os dados da nuvem (${contagemDados(rem.dados)}) serão substituídos pelos deste aparelho (${contagemDados(estado)}), também nos outros aparelhos conectados. Continuar?`, ()=>{
    syncRemotoEscolha = null;
    Sync.atualizar({ conectado:true, versao:rem.versao, pendente:true, modificadoEm:Date.now() });
    Sync.gravarBase(estado);   // base = local → o envio substitui a nuvem
    sincronizar().then(()=>{ if(!Sync.ler().pendente) toast('Dados deste aparelho enviados para a nuvem.'); });
  }, 'Substituir os dados da nuvem');
}
function syncDesconectar(){
  if(emSandbox('desconectar')) return;
  const d = Sync.ler();
  const aviso = d && d.pendente ? ' Atenção: há alterações deste aparelho que ainda não foram enviadas.' : '';
  pedirConfirmacao(`Desconectar este aparelho da sincronização? Os dados continuam aqui e na nuvem, mas este aparelho para de enviar e receber alterações.${aviso}`, ()=>{
    clearTimeout(syncTimer);
    pushDesativar(true).finally(()=>{   // tira este aparelho da lista de notificações antes de esquecer a senha
      Sync.gravar(null); Sync.gravarBase(null);
      syncFase = { tipo:'', msg:'' };
      syncRenderConfig(); toast('Aparelho desconectado da sincronização.');
    });
  }, 'Desconectar');
}
async function syncVerCopias(){
  const box = document.getElementById('cfgSyncCopias');
  box.innerHTML = '<div class="dica">Carregando cópias…</div>';
  try{
    const { copias } = await syncReq('GET', '/copias');
    box.innerHTML = !copias || !copias.length
      ? '<div class="dica">Ainda não há cópias diárias. A primeira é guardada no primeiro envio de um dia novo.</div>'
      : `<div class="dica" style="margin-bottom:6px">Como os dados estavam no fim de cada dia (últimos 30 dias). Baixe o arquivo e use “Restaurar backup” se precisar voltar.</div>
         <ul class="sy-copias">${copias.map(c=>`<li><span>${fmtData(c.dia)}<small>${c.aparelho?escapar(c.aparelho)+' · ':''}versão ${c.versao}</small></span>
           <button class="btn btn-claro btn-mini" onclick="syncBaixarCopia('${c.dia}')">↓ Baixar</button></li>`).join('')}</ul>`;
  }catch(e){ box.innerHTML = `<div class="dica" style="color:var(--vermelho)">${escapar(e.message)}</div>`; }
}
async function syncBaixarCopia(dia){
  try{
    const c = await syncReq('GET', '/copias/' + dia);
    const blob = new Blob([JSON.stringify(c.dados,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `backup-china-engine-nuvem-${dia}.json`; a.click();
    toast('Cópia baixada.');
  }catch(e){ toast(e.message); }
}
function syncRenderConfig(){
  const d = Sync.ler(), lig = Sync.conectado();
  document.getElementById('cfgSyncForm').style.display = lig ? 'none' : '';
  document.getElementById('cfgSyncLigado').style.display = lig ? '' : 'none';
  if(!lig){
    document.getElementById('cfgSyncUrl').value = d && d.url || '';
    document.getElementById('cfgSyncSenha').value = d && d.senha ? '••••••••' : '';
    document.getElementById('cfgSyncAparelho').value = d && d.aparelho || '';
    document.getElementById('cfgSyncCopias').innerHTML = '';
  }
  syncRenderStatus();
}
function syncRenderStatus(){
  const el = document.getElementById(Sync.conectado() ? 'cfgSyncStatus' : 'cfgSyncStatusForm');
  if(!el) return;
  const d = Sync.ler() || {};
  const hora = t=> new Date(t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const dataHora = t=>{ const x = new Date(t); return (x.toDateString()===new Date().toDateString() ? 'hoje' : x.toLocaleDateString('pt-BR')) + ' às ' + hora(t); };
  let cls = '', txt = '';
  if(!Sync.conectado()){
    cls = syncFase.tipo==='erro' ? 'erro' : syncFase.tipo==='rodando' ? 'carregando' : '';
    txt = syncFase.msg || 'Não conectado.';
  } else if(sandbox.ativo){ cls = 'aviso'; txt = 'Em pausa enquanto o sandbox está ligado.'; }
  else if(syncFase.tipo==='rodando'){ cls = 'carregando'; txt = 'Sincronizando…'; }
  else if(syncFase.tipo==='erro'){ cls = 'erro'; txt = syncFase.msg; }
  else if(syncFase.tipo==='offline'){ cls = 'aviso'; txt = syncFase.msg; }
  else if(d.pendente){ cls = 'aviso'; txt = 'Alterações deste aparelho aguardando envio…'; }
  else { cls = 'ok'; txt = d.sincronizadoEm ? `✓ Sincronizado às ${hora(d.sincronizadoEm)}` : '✓ Conectado'; }
  const det = Sync.conectado()
    ? `<small>Este aparelho: <b>${escapar(d.aparelho||'')}</b>${d.remotoEm?` · última alteração na nuvem ${dataHora(d.remotoEm)}${d.remotoAparelho?` (${escapar(d.remotoAparelho)})`:''}`:''}</small>` : '';
  el.className = 'sy-status ' + cls;
  el.innerHTML = escapar(txt) + det;
}

/* ----- Gatilhos automáticos ----- */
function syncIniciar(){
  if(Sync.conectado()) sincronizar();
  document.addEventListener('visibilitychange', ()=>{ if(Sync.conectado()) sincronizar(); });   // ao voltar ao app recebe; ao sair, envia o que faltar
  window.addEventListener('online', ()=>{ if(Sync.conectado()) sincronizar(); });
  setInterval(()=>{ if(Sync.conectado() && document.visibilityState==='visible' && !syncRodando) sincronizar(); }, 30000);
}

/* =========================================================
   SANDBOX (modo de teste) — Configurações
   Com o sandbox ligado, o app trabalha só na memória: nada é gravado neste aparelho,
   nada é enviado ou recebido da nuvem e nenhuma notificação sai. Ao desligar (ou ao
   recarregar a página), os dados voltam a ser exatamente os de antes.
   ========================================================= */
function emSandbox(acao){
  if(!sandbox.ativo) return false;
  toast(`Desligue o sandbox para ${acao}.`);
  return true;
}
function sandboxAlternar(ligar){ if(ligar) sandboxLigar(); else sandboxDesligar(); }
function sandboxLigar(){
  if(sandbox.ativo) return;
  if(pdv.ativa && pdv.itens.length){
    toast('Finalize ou cancele a venda em andamento antes de ligar o sandbox.');
    sandboxTela(); return;
  }
  sandbox = { ativo:true, copia:JSON.stringify(estado) };
  clearTimeout(syncTimer);
  pdv = pdvVazio(); pdvVisor = { tipo:'livre' }; pdvGuardar();
  sandboxTela(); renderViewAtual();
  toast('Sandbox ligado: nada do que for feito agora é salvo.');
}
function sandboxDesligar(){
  if(!sandbox.ativo) return;
  estado = JSON.parse(sandbox.copia);   // exatamente como estava antes de ligar
  sandbox = { ativo:false, copia:null };
  pdv = pdvVazio(); pdvVisor = { tipo:'livre' }; pdvGuardar();
  document.querySelectorAll('.overlay.aberto').forEach(o=>fechar(o.id));
  render(); atualizarAlertas(); sandboxTela(); renderViewAtual();
  if(Sync.conectado()) sincronizar();   // recebe o que mudou na nuvem enquanto o sandbox esteve ligado
  toast('Sandbox desligado: os dados voltaram ao que eram.');
}
function sandboxTela(){
  document.getElementById('sbxFaixa').hidden = !sandbox.ativo;
  document.body.classList.toggle('modo-sandbox', sandbox.ativo);
  const c = document.getElementById('cfgSandbox');
  if(c){ c.checked = sandbox.ativo; document.getElementById('cfgSandboxRotulo').textContent = sandbox.ativo ? 'Sandbox ligado: nada está sendo salvo' : 'Sandbox desligado'; }
}

/* =========================================================
   NOTIFICAÇÕES PUSH ENTRE APARELHOS (Web Push pelo Worker da sincronização)
   - Cada aparelho que quer receber avisos se inscreve (botão em Configurações): o navegador
     gera um endereço de entrega e o app guarda esse endereço no Worker.
   - Quando uma venda é concluída, o aparelho envia os dados para a nuvem e, em seguida, pede
     ao Worker para avisar os OUTROS aparelhos inscritos. O aviso chega mesmo com o app fechado
     (quem entrega é o service worker, sw.js).
   - Avisos que não puderam sair (sem internet) ficam numa fila por até 6 horas.
   - No iPhone/iPad o push só existe com o app instalado na Tela de Início.
   ========================================================= */
const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const EH_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
let swReg = null;
async function pushRegistrarSW(){
  if(!('serviceWorker' in navigator)) return null;
  if(swReg) return swReg;
  try{ swReg = await navigator.serviceWorker.register('sw.js'); }catch(e){ swReg = null; }
  return swReg;
}
function b64urlParaBytes(t){
  t = t.replace(/-/g,'+').replace(/_/g,'/'); while(t.length%4) t += '=';
  return Uint8Array.from(atob(t), c=>c.charCodeAt(0));
}
function bytesParaB64url(b){ return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function pushMensagemErro(e){
  if(e && e.codigo==='rota') return 'O Worker da sincronização ainda está na versão antiga. Publique no Cloudflare o código novo de cloudflare/sync-worker.js e tente de novo.';
  if(e && e.name==='NotAllowedError') return 'O navegador não permitiu as notificações para este site. Libere nas permissões do site e tente de novo.';
  if(e && e.name==='AbortError') return 'Não foi possível falar com o serviço de notificações do navegador. Confira a internet e tente de novo.';
  return (e && e.message) || 'Não foi possível concluir.';
}
function pushStatus(cls, txt){ const el = document.getElementById('cfgPushStatus'); if(el){ el.className = 'sy-status ' + cls; el.textContent = txt; } }

async function pushAtivar(){
  if(emSandbox('ativar as notificações')) return;
  if(!Sync.conectado()){ pushStatus('erro', 'Conecte a sincronização na nuvem primeiro: as notificações passam por ela.'); return; }
  if(!PUSH_OK){ pushRenderConfig(); return; }
  pushStatus('carregando', 'Ativando…');
  try{
    const perm = await Notification.requestPermission();
    if(perm!=='granted'){ pushRenderConfig(); return; }
    const reg = await pushRegistrarSW();
    if(!reg) throw new Error('Não foi possível instalar o serviço de notificações neste navegador.');
    await navigator.serviceWorker.ready;
    const { chave } = await syncReq('GET', '/push/chave');
    let sub = await reg.pushManager.getSubscription();
    if(sub){   // inscrição feita com outra chave (ex.: banco recriado): refaz
      const usada = sub.options && sub.options.applicationServerKey ? bytesParaB64url(sub.options.applicationServerKey) : null;
      if(usada && usada!==chave){ await sub.unsubscribe(); sub = null; }
    }
    if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:b64urlParaBytes(chave) });
    await syncReq('POST', '/push/inscricao', { aparelho:Sync.ler().aparelho, inscricao:sub.toJSON() });
    Sync.atualizar({ push:sub.endpoint });
    pushRenderConfig();
    toast('Notificações ativadas neste aparelho.');
  }catch(e){ pushStatus('erro', pushMensagemErro(e)); }
}
async function pushDesativar(silencioso){
  const d = Sync.ler();
  let endpoint = d && d.push;
  try{
    const reg = await pushRegistrarSW();
    const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    if(sub){ endpoint = endpoint || sub.endpoint; await sub.unsubscribe(); }
  }catch(e){}
  try{ if(endpoint && Sync.conectado()) await syncReq('DELETE', '/push/inscricao', { endpoint }); }catch(e){}
  Sync.atualizar({ push:null });
  if(silencioso!==true){ pushRenderConfig(); toast('Notificações desativadas neste aparelho.'); }
}
async function pushTestar(){
  if(emSandbox('enviar um teste')) return;
  const d = Sync.ler();
  if(!d || !d.push) return;
  pushStatus('carregando', 'Enviando teste…');
  try{
    const r = await syncReq('POST', '/push/enviar', { titulo:'Teste de notificação', corpo:`Enviado por ${d.aparelho}. Se você está vendo isto, está funcionando.`, tag:'teste', somente:d.push });
    if(r.enviadas>0){ await pushRenderConfig(); pushStatus('ok', '✓ Teste enviado. A notificação deve aparecer neste aparelho em alguns segundos.'); }
    else { Sync.atualizar({ push:null }); await pushRenderConfig(); pushStatus('erro', 'A inscrição deste aparelho não é mais válida. Ative as notificações de novo.'); }
  }catch(e){ pushStatus('erro', pushMensagemErro(e)); }
}
async function pushRenderConfig(){
  const bA = document.getElementById('cfgPushAtivar'); if(!bA) return;
  const bT = document.getElementById('cfgPushTestar'), bD = document.getElementById('cfgPushDesativar'), dica = document.getElementById('cfgPushDica');
  const mostrar = (a,t,d)=>{ bA.style.display = a?'':'none'; bT.style.display = t?'':'none'; bD.style.display = d?'':'none'; };
  dica.textContent = EH_IOS ? 'No iPhone e no iPad, as notificações só funcionam com o app instalado: no Safari, toque em Compartilhar → “Adicionar à Tela de Início” e abra o app por esse ícone.' : '';
  dica.style.display = EH_IOS ? '' : 'none';
  const d = Sync.ler();
  if(!Sync.conectado()){ mostrar(false,false,false); pushStatus('', 'Conecte a sincronização na nuvem para usar as notificações.'); return; }
  if(!PUSH_OK){ mostrar(false,false,false); pushStatus('aviso', EH_IOS ? 'Instale o app na Tela de Início para ativar as notificações neste aparelho.' : 'Este navegador não tem suporte a notificações push.'); return; }
  if(Notification.permission==='denied'){ mostrar(false,false,false); pushStatus('erro', 'As notificações estão bloqueadas para este site. Libere nas permissões do navegador e recarregue a página.'); return; }
  if(d.push){ mostrar(false,true,true); pushStatus('ok', `✓ Ativadas neste aparelho (${d.aparelho}).`); }
  else { mostrar(true,false,false); pushStatus('', 'Desativadas neste aparelho.'); }
}
/* Ao abrir o app: instala o service worker e confere se a inscrição deste aparelho continua valendo */
async function pushIniciar(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', e=>{
    if(e.data && e.data.tipo==='push' && Sync.conectado()) sincronizar();   // chegou aviso: busca os dados novos na hora
  });
  const reg = await pushRegistrarSW();
  const d = Sync.ler();
  if(!reg || !PUSH_OK || !d || !d.push) return;
  try{
    const sub = await reg.pushManager.getSubscription();
    if(!sub){ Sync.atualizar({ push:null }); }
    else if(sub.endpoint!==d.push){   // o navegador renovou o endereço de entrega
      await syncReq('POST', '/push/inscricao', { aparelho:d.aparelho, inscricao:sub.toJSON(), anterior:d.push });
      Sync.atualizar({ push:sub.endpoint });
    }
  }catch(e){}
  if(viewAtual==='config') pushRenderConfig();
}

/* Venda concluída: põe o aviso na fila e sincroniza (os dados sobem antes do aviso sair) */
const PUSH_VALIDADE = 6*3600*1000;
function notificarVenda(v){
  if(sandbox.ativo || !Sync.conectado()) return;
  const d = Sync.ler();
  const nomes = (v.nomes||[]).slice(0,3).join(', ') + ((v.nomes||[]).length>3 ? '…' : '');
  const linha1 = [`${v.unidades} un.`, nomePagamento(v.pagamento), d.aparelho].filter(Boolean).join(' · ');
  const fila = (d.fila||[]).filter(n=>Date.now()-n.em < PUSH_VALIDADE);
  fila.push({ em:Date.now(), titulo:`Venda concluída · ${fmtBRL(v.total)}`, corpo: nomes ? `${linha1}\n${nomes}` : linha1, tag:'venda-'+uid() });
  Sync.atualizar({ fila });
  sincronizar();
}
async function pushEnviarFila(){
  const d = Sync.ler();
  if(!d || !d.fila || !d.fila.length) return;
  const restam = [];
  for(const n of d.fila){
    if(Date.now()-n.em >= PUSH_VALIDADE) continue;
    try{ await syncReq('POST', '/push/enviar', { titulo:n.titulo, corpo:n.corpo, tag:n.tag, excluir:d.push||null }); }
    catch(e){ if(e.tipo==='rede') restam.push(n); }   // sem internet: tenta de novo depois; outros erros: descarta
  }
  Sync.atualizar({ fila:restam });
}

/* ===== Início ===== */
document.getElementById('versao').textContent = 'v'+VERSAO;
render();
atualizarAlertas();
mostrarView('pdv');
ajustarNav();
syncIniciar();
pushIniciar();