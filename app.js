/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */
const VERSAO = '0.3.1';
const CHAVE = 'chinatown_estoque_v1';

/* Senha do gerente para alterar preço (na saída e na edição do produto).
   OBS: por estar no código, ela serve como trava de operação
   (estilo caixa de supermercado), não como segurança real. */
const SENHA_ADMIN = 'CHINAMASTER999';

/* ===== Armazenamento (localStorage com fallback em memória) ===== */
let memoria = null;
const Armazenamento = {
  ler(){
    try{ const t = localStorage.getItem(CHAVE); return t ? JSON.parse(t) : null; }
    catch(e){ return memoria; }
  },
  gravar(dados){
    memoria = dados;
    try{ localStorage.setItem(CHAVE, JSON.stringify(dados)); }catch(e){}
  }
};

/* ===== Estado ===== */
let estado = Armazenamento.ler() || criarExemplo();
let ordenarPor = 'nome';
let direcao = 'asc';

function salvar(){ Armazenamento.gravar(estado); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function hoje(){ return new Date().toISOString().slice(0,10); }
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
    return okCat && (!busca || alvo.includes(busca));
  });

  lista.sort((a,b)=>{
    let va, vb;
    switch(ordenarPor){
      case 'estoque': va=estoqueDe(a); vb=estoqueDe(b); break;
      case 'preco':   va=a.preco||0;   vb=b.preco||0;   break;
      case 'custo':   va=custoMedioDe(a)||0; vb=custoMedioDe(b)||0; break;
      default:        va=a.nome.toLowerCase(); vb=b.nome.toLowerCase();
    }
    const r = (typeof va==='string') ? va.localeCompare(vb,'pt-BR') : va-vb;
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
    const baixo = est <= (p.minimo||0);
    const ar = aReceberDe(p);
    const cm = custoMedioDe(p);
    const linha = `<div class="linha" data-id="${p.id}">
      <div class="nome">
        ${p.marca?`<span class="marca">${escapar(p.marca)}</span>`:''}
        ${escapar(p.nome)}
        ${baixo?'<span class="badge-baixo">estoque baixo</span>':''}
        ${p.codigo?`<small class="codigo">${escapar(p.codigo)}</small>`:''}
      </div>
      <div class="col-cat"><span class="cat">${escapar(p.categoria)}</span></div>
      <div class="num" style="color:${baixo?'var(--vermelho)':'inherit'}">${est}</div>
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
  estado.produtos.forEach(p=>{ contagem[p.categoria] = (contagem[p.categoria]||0)+1; });
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
  abrir('modalAcoes');
}
function acaoEntrada(){ const id=acaoAtivo; fechar('modalAcoes'); abrirRegistroEntrada(id); }
function acaoSaida(){   const id=acaoAtivo; fechar('modalAcoes'); abrirRegistroSaida(id); }
function acaoEditar(){  const id=acaoAtivo; fechar('modalAcoes'); abrirProduto(id); }

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
        <input type="number" id="rec_${m.id}" min="0" step="0.01" value="${p.preco||''}" placeholder="valor un.">
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
  document.getElementById('produtoId').value = p ? p.id : '';
  document.getElementById('pMarca').value        = p ? (p.marca||'') : '';
  document.getElementById('pNome').value         = p ? p.nome : '';
  document.getElementById('pCategoria').value    = p ? p.categoria : (estado.categorias[0]||'');
  document.getElementById('pFornecedor').value   = p ? (p.fornecedor||'') : '';
  document.getElementById('pCodigo').value       = p ? (p.codigo||'') : '';
  document.getElementById('pCodigoBarras').value = p ? (p.codigoBarras||'') : '';
  document.getElementById('pPreco').value        = p && p.preco ? p.preco : '';
  document.getElementById('pMinimo').value       = p ? (p.minimo||0) : 0;
  document.getElementById('btnExcluirProduto').style.display = p ? 'inline-flex' : 'none';
  abrir('modalProduto');
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
    fornecedor: document.getElementById('pFornecedor').value.trim(),
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
    estado.produtos.push({ id:uid(), ...dados, movimentacoes:[] });
    salvar(); fechar('modalProduto'); render(); toast('Produto salvo.');
  }
}
function excluirProduto(){
  const id = document.getElementById('produtoId').value;
  pedirConfirmacao('Excluir este produto e todo o histórico dele?', ()=>{
    estado.produtos = estado.produtos.filter(p=>p.id!==id);
    salvar(); fechar('modalProduto'); render(); toast('Produto excluído.');
  });
}

/* =========================================================
   REGISTRAR VENDA (scanner + busca)
   Pertence ao módulo de estoque: resultado = saída com motivo Venda.
   No futuro, o módulo financeiro acrescenta forma de pagamento aqui.
   ========================================================= */
let vendaScanAtivo = false;
function abrirVenda(){
  document.getElementById('vendaBusca').value = '';
  document.getElementById('vendaResultados').innerHTML = '';
  document.getElementById('vendaItens').innerHTML = '';
  document.getElementById('vendaData').value = hoje();
  document.getElementById('vendaTotal').textContent = '—';
  abrir('modalVenda');
  setTimeout(()=>document.getElementById('vendaBusca').focus(), 80);
}
function vendaFiltrar(){
  const q = document.getElementById('vendaBusca').value.toLowerCase().trim();
  const res = document.getElementById('vendaResultados');
  if(!q){ res.innerHTML=''; return; }
  const match = estado.produtos.filter(p=>{
    if(estoqueDe(p)<=0) return false;
    const alvo = `${p.nome} ${p.marca||''} ${p.codigo||''} ${p.codigoBarras||''}`.toLowerCase();
    return alvo.includes(q);
  }).slice(0,8);
  if(match.length===0){ res.innerHTML=`<p style="padding:10px;font-size:13px;color:var(--texto-sec)">Nenhum produto com estoque encontrado.</p>`; return; }
  res.innerHTML = match.map(p=>`<div class="venda-resultado" onmousedown="vendaAdicionarItem('${p.id}')"
    onmouseenter="this.style.background='var(--amarelo-claro)'" onmouseleave="this.style.background=''">
    <span>${escapar(p.nome)}${p.marca?` <small style="color:var(--texto-sec)">${escapar(p.marca)}</small>`:''}</span>
    <span style="font-family:var(--mono);font-weight:600;margin-left:auto">${fmtBRL(p.preco||null)}</span>
    <span style="font-size:12px;color:var(--texto-sec);margin-left:8px">${estoqueDe(p)} un.</span>
  </div>`).join('');
}
/* Enter na busca (é o que o leitor USB envia ao fim da leitura):
   1º código de barras ou SKU exato; 2º se a busca tiver um único resultado, adiciona ele. */
function vendaEnter(){
  const q = document.getElementById('vendaBusca').value.trim();
  if(!q) return;
  const ql = q.toLowerCase();
  const exato = estado.produtos.find(p=>(p.codigoBarras && p.codigoBarras===q) || (p.codigo && p.codigo.toLowerCase()===ql));
  if(exato){
    if(estoqueDe(exato)<=0){ toast(`Sem estoque: ${exato.nome}`); return; }
    vendaAdicionarItem(exato.id); toast('Produto adicionado.'); return;
  }
  const res = document.querySelectorAll('#vendaResultados .venda-resultado');
  if(res.length===1){ res[0].dispatchEvent(new MouseEvent('mousedown')); return; }
  toast(res.length ? 'Mais de um resultado — escolha na lista.' : 'Código não encontrado.');
}
function vendaAdicionarItem(id){
  document.getElementById('vendaBusca').value = '';
  document.getElementById('vendaResultados').innerHTML = '';
  const p = prod(id);
  const est = estoqueDe(p);
  if(est<=0){ toast('Sem estoque disponível.'); return; }
  const existing = document.getElementById('vit_'+id);
  if(existing){
    const qtdEl = existing.querySelector('.vit-qtd');
    const novaQtd = parseInt(qtdEl.value)+1;
    if(novaQtd>est){ toast(`Estoque máximo: ${est} un.`); return; }
    qtdEl.value = novaQtd;
    vendaAtualizarTotal(); return;
  }
  const div = document.createElement('div');
  div.className = 'venda-item'; div.id = 'vit_'+id; div.dataset.id = id;
  div.innerHTML = `<span class="vit-nome">${escapar(p.nome)}${p.marca?`<small> ${escapar(p.marca)}</small>`:''}</span>
    <input class="vit-qtd" type="number" min="1" max="${est}" value="1"
      style="width:54px;padding:5px 6px;border:1px solid var(--borda);border-radius:7px;text-align:center;font-family:var(--mono)"
      oninput="vendaAtualizarTotal()">
    <span class="vit-preco" data-preco="${p.preco||0}"
      style="font-family:var(--mono);font-weight:600;min-width:72px;text-align:right">${fmtBRL(p.preco||null)}/un</span>
    <button class="btn btn-claro btn-mini" onclick="this.closest('.venda-item').remove();vendaAtualizarTotal()">✕</button>`;
  document.getElementById('vendaItens').appendChild(div);
  vendaAtualizarTotal();
}
function vendaAtualizarTotal(){
  let total = 0;
  document.querySelectorAll('.venda-item').forEach(el=>{
    const qtd = parseInt(el.querySelector('.vit-qtd').value)||0;
    const preco = parseFloat(el.querySelector('.vit-preco').dataset.preco)||0;
    total += qtd*preco;
  });
  document.getElementById('vendaTotal').textContent = fmtBRL(total);
}
function confirmarVenda(){
  const data = document.getElementById('vendaData').value || hoje();
  const itens = [...document.querySelectorAll('.venda-item')];
  if(itens.length===0){ toast('Adicione ao menos um produto.'); return; }
  for(const el of itens){
    const qtd = parseInt(el.querySelector('.vit-qtd').value)||0;
    if(qtd<1){ toast('Quantidade inválida em um item.'); return; }
    if(qtd>estoqueDe(prod(el.dataset.id))){ toast(`Sem estoque suficiente: ${prod(el.dataset.id).nome}`); return; }
  }
  itens.forEach(el=>{
    const p = prod(el.dataset.id);
    const qtd = parseInt(el.querySelector('.vit-qtd').value);
    const preco = parseFloat(el.querySelector('.vit-preco').dataset.preco)||0;
    p.movimentacoes.push({ id:uid(), tipo:'saida', data, qtd, motivo:'Venda', precoVenda:preco });
  });
  salvar(); fechar('modalVenda'); render();
  toast(`Venda registrada: ${itens.length} item(ns).`);
}
async function abrirScannerVenda(){
  vendaScanAtivo = true;
  await abrirScanner();
}

/* ===== Leitor de código de barras por câmera (BarcodeDetector) ===== */
let scanStream = null, scanTimer = null, scanDetector = null;
async function abrirScanner(){
  if(!('BarcodeDetector' in window)){
    toast('Câmera não suportada neste navegador. Use o leitor USB ou digite o código.');
    vendaScanAtivo = false; return;
  }
  try{
    scanDetector = new window.BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39']});
  }catch(e){ scanDetector = new window.BarcodeDetector(); }
  try{
    scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
  }catch(e){
    toast('Não foi possível acessar a câmera. Verifique a permissão.');
    vendaScanAtivo = false; return;
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
      fecharScanner();
      if(paraVenda){
        // encontra produto pelo código de barras e adiciona à venda
        const p = estado.produtos.find(x=>x.codigoBarras===raw);
        if(p){ vendaAdicionarItem(p.id); toast('Produto adicionado.'); }
        else { toast('Código não encontrado. Digite na busca.'); document.getElementById('vendaBusca').value=raw; vendaFiltrar(); }
      } else {
        document.getElementById('pCodigoBarras').value = raw;
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
  vendaScanAtivo = false;
  fechar('modalScanner');
}

/* =========================================================
   BLOCOS REUTILIZÁVEIS (entrada / saída)
   ========================================================= */
function blocoEntrada(p){
  return `<div class="bloco entrada">
    <h4>Registrar entrada (compra)</h4>
    <div class="mini-campo"><label>Data</label><input type="date" id="eData" value="${hoje()}"></div>
    <div class="mini-campo"><label>Quantidade</label><input type="number" id="eQtd" min="1" placeholder="0"></div>
    <div class="mini-campo"><label>Custo por unidade (R$)</label><input type="number" id="eCusto" min="0" step="0.01" value="${ultimoCustoDe(p)||''}" placeholder="0,00"></div>
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
      <small style="color:var(--texto-sec);font-size:11px">Alterar o preço base exige senha do gerente.</small>
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
         oninput="filtrarLinhaBusca(${idx})" autocomplete="off">
       <div id="lc_resultados_${idx}" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;
         border:1px solid var(--borda-forte);border-radius:8px;z-index:20;max-height:200px;overflow-y:auto;margin-top:2px"></div>
       <input type="hidden" id="lc_prod_${idx}" value="">
       <div id="lc_selecionado_${idx}" style="display:none;margin-top:4px;font-size:13px;color:var(--texto-sec)"></div>
     </div>
     <button class="btn btn-claro btn-mini" style="margin-top:1px" title="Remover item" onclick="this.closest('.linha-compra').remove()">✕</button>
   </div>
   <div id="lc_novo_${idx}" class="lc-novo" style="display:none">
     <div class="linha-campos">
       <div class="mini-campo" style="flex:.8"><label>Marca</label><input type="text" id="lc_marca_${idx}" placeholder="Marca"></div>
       <div class="mini-campo" style="flex:1.6"><label>Nome do novo produto</label><input type="text" id="lc_nome_${idx}" placeholder="Nome"></div>
     </div>
     <div class="linha-campos">
       <div class="mini-campo"><label>Categoria</label><select id="lc_cat_${idx}">${cats}</select></div>
       <div class="mini-campo"><label>Fornecedor (opcional)</label><input type="text" id="lc_forn_${idx}" placeholder="Ex: Atacado China"></div>
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
  document.getElementById('lc_selecionado_'+idx).style.display = 'none';
  document.getElementById('lc_novo_'+idx).style.display = 'none';
  if(!q){ res.style.display='none'; return; }
  const match = estado.produtos.filter(p=>{
    const alvo = `${p.nome} ${p.marca||''} ${p.codigo||''} ${p.codigoBarras||''}`.toLowerCase();
    return alvo.includes(q);
  }).slice(0,8);
  const items = match.map(p=>`<div style="padding:8px 12px;cursor:pointer;font-size:14px;border-bottom:1px solid var(--borda)"
    onmousedown="selecionarLinhaProduto(${idx},'${p.id}')"
    onmouseenter="this.style.background='var(--amarelo-claro)'" onmouseleave="this.style.background=''">
    ${escapar(p.nome)}${p.marca?`<span style="color:var(--texto-sec)"> — ${escapar(p.marca)}</span>`:''}
    ${p.codigo?`<small style="color:var(--texto-sec);font-size:11px;display:block">${escapar(p.codigo)}</small>`:''}
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
    const q = document.getElementById('lc_busca_'+idx).value.trim();
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
      itens.push({ novo:true, nome, marca:val('lc_marca_'+idx).trim(),
                   fornecedor:val('lc_forn_'+idx).trim(),
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
            fornecedor:it.fornecedor||'',
            codigo:gerarSku(it.categoria), codigoBarras:'', preco:it.preco, minimo:0, movimentacoes:[] };
      estado.produtos.push(p);
    } else {
      p = prod(it.id);
    }
    p.movimentacoes.push({ id:uid(), tipo:'entrada', data, qtd:it.qtd, custoUnit:it.custo });
  });
  salvar(); fechar('modalCompra'); render();
  toast(`Compra registrada: ${itens.length} item(ns).`);
}

/* =========================================================
   PAINEL COMPLETO DO PRODUTO (toque simples)
   ========================================================= */
let produtoAtivo = null;
function abrirMov(id){
  produtoAtivo = id;
  document.getElementById('tituloMov').textContent = prod(id).nome;
  renderMov();
  abrir('modalMov');
}
function renderMov(){
  const p = prod(produtoAtivo);
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

  const comp = composicaoEstoque(p);
  const compHtml = comp.length
    ? comp.map(g=>`<div class="lote"><b>${g.qtd} un.</b> <span>a</span> <b>${fmtBRL(g.custo)}</b></div>`).join('')
    : '<p style="color:var(--texto-sec)">Sem unidades em estoque.</p>';

  const movs = [...p.movimentacoes].sort((a,b)=>b.data.localeCompare(a.data)).map(m=>{
    let valor = '';
    if(m.tipo==='entrada') valor = fmtBRL(m.custoUnit)+'/un';
    else if(m.motivo==='Venda') valor = fmtBRL(m.precoVenda)+'/un';
    else if(m.motivo==='A receber') valor = m.recebido ? fmtBRL(m.precoVenda)+'/un' : 'a receber';
    let texto = m.motivo;
    if(m.motivo==='Outros' && m.motivoTexto) texto = m.motivoTexto;
    else if(m.motivo==='A receber' && m.recebido) texto = 'A receber (recebido)';
    const rotulo = m.tipo==='saida' ? ` · ${escapar(texto)}` : '';
    return `<div class="mov">
      <span class="tag ${m.tipo==='entrada'?'e':'s'}">${m.tipo==='entrada'?'entrada':'saída'}</span>
      <span class="data">${fmtData(m.data)}</span>
      <span>${m.qtd} un.${rotulo}</span>
      <span class="valor">${valor}</span>
    </div>`;
  }).join('');

  document.getElementById('corpoMov').innerHTML = `
    <div class="resumo">
      <div class="caixa"><span>Estoque atual</span><b>${estoqueDe(p)} un.</b></div>
      <div class="caixa"><span>Unidades a receber</span><b>${ar} un.</b></div>
      <div class="caixa"><span>Custo médio</span><b>${fmtBRL(cm)}</b></div>
      <div class="caixa"><span>Preço de venda</span><b>${fmtBRL(p.preco||null)}</b></div>
      ${cardLucro}
      <div class="caixa"><span>Variação de custo entre lotes</span><b style="font-size:15px">${variacao}</b></div>
    </div>

    <div class="acoes-painel">
      <button class="btn btn-claro btn-mini" onclick="fechar('modalMov');abrirProduto('${p.id}')">Editar dados do produto</button>
      ${ar>0?`<button class="btn btn-amarelo btn-mini" onclick="abrirReceber('${p.id}')">Finalizar recebimento (${ar})</button>`:''}
    </div>

    <div class="sub">Composição do estoque atual</div>
    <div class="composicao">${compHtml}</div>

    <div class="forms-mov">
      ${blocoEntrada(p)}
      ${blocoSaida(p)}
    </div>

    <div class="sub">Histórico de movimentações</div>
    <div class="historico">${movs || '<p style="color:var(--texto-sec);padding:8px 0">Nenhuma movimentação ainda.</p>'}</div>`;

  ajustarCamposSaida();
}

function ajustarCamposSaida(){
  const sel = document.getElementById('sMotivo');
  if(!sel) return;
  const m = sel.value;
  document.getElementById('campoPrecoSaida').style.display   = (m==='Venda') ? 'block' : 'none';
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
  if(!qtd||qtd<1){ toast('Informe a quantidade.'); return; }
  if(isNaN(custo)||custo<0){ toast('Informe o custo por unidade.'); return; }

  if(entradas(p).length > 0){
    entradaPendente = { pid:p.id, data, qtd, custo };
    abrirConfirmaEntrada(p, custo, qtd);
  } else {
    commitEntrada(p, { data, qtd, custoUnit:custo });
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
  commitEntrada(p, { data:entradaPendente.data, qtd:entradaPendente.qtd, custoUnit:entradaPendente.custo });
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
  commitEntrada(p, { data:entradaPendente.data, qtd:entradaPendente.qtd, custoUnit:c });
  fechar('modalEntrada');
}
function commitEntrada(p, mov){
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
  if(document.getElementById('senhaInput').value !== SENHA_ADMIN){ toast('Senha incorreta.'); return; }
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
function abrirHistorico(){
  document.getElementById('fhCategoria').innerHTML =
    '<option value="">Todas</option>' + estado.categorias.map(c=>`<option>${escapar(c)}</option>`).join('');
  renderHistorico();
  abrir('modalHistorico');
}
function histAlternarDir(){
  histDir = histDir==='asc' ? 'desc' : 'asc';
  document.getElementById('histDir').textContent = histDir==='asc' ? '↑' : '↓';
  renderHistorico();
}
function renderHistorico(){
  histPor = document.getElementById('histOrdenar').value;
  const fTipo = val('fhTipo');
  const fCat  = val('fhCategoria');
  const fProd = val('fhProduto').toLowerCase().trim();
  const fDe   = val('fhDataDe');
  const fAte  = val('fhDataAte');
  const fMin  = parseFloat(val('fhValMin'));
  const fMax  = parseFloat(val('fhValMax'));
  const temValor = !isNaN(fMin) || !isNaN(fMax);

  let linhas = [];
  estado.produtos.forEach(p=>{
    p.movimentacoes.forEach(m=>{
      let valor = null;
      if(m.tipo==='entrada') valor = m.custoUnit;
      else if(m.motivo==='Venda') valor = m.precoVenda;
      else if(m.motivo==='A receber') valor = m.recebido ? m.precoVenda : 0;
      linhas.push({ tipo:m.tipo, nome:p.nome, marca:p.marca, categoria:p.categoria,
                    data:m.data, qtd:m.qtd, valor, motivo:m.motivo, motivoTexto:m.motivoTexto, recebido:m.recebido });
    });
  });

  linhas = linhas.filter(l=>{
    if(fTipo && l.tipo!==fTipo) return false;
    if(fCat && l.categoria!==fCat) return false;
    if(fProd && !`${l.nome} ${l.marca||''}`.toLowerCase().includes(fProd)) return false;
    if(fDe && l.data < fDe) return false;
    if(fAte && l.data > fAte) return false;
    if(temValor){
      if(l.valor==null) return false;
      if(!isNaN(fMin) && l.valor < fMin) return false;
      if(!isNaN(fMax) && l.valor > fMax) return false;
    }
    return true;
  });

  linhas.sort((a,b)=>{
    let va, vb;
    switch(histPor){
      case 'tipo':      va=a.tipo; vb=b.tipo; break;
      case 'categoria': va=a.categoria.toLowerCase(); vb=b.categoria.toLowerCase(); break;
      case 'nome':      va=a.nome.toLowerCase(); vb=b.nome.toLowerCase(); break;
      case 'valor':     va=a.valor==null?-1:a.valor; vb=b.valor==null?-1:b.valor; break;
      default:          va=a.data; vb=b.data;
    }
    const r = (typeof va==='string') ? va.localeCompare(vb,'pt-BR') : va-vb;
    return histDir==='asc' ? r : -r;
  });

  const cont = document.getElementById('histConteudo');
  if(linhas.length===0){ cont.innerHTML = '<p class="sem-resultado">Nenhuma movimentação encontrada.</p>'; return; }

  cont.innerHTML = `<div class="hist-tabela">
    <div class="hist-cab">
      <div>Tipo</div><div>Produto</div><div class="col-cat">Categoria</div>
      <div class="num">Qtd</div><div class="num">Data</div><div class="num">Valor</div>
    </div>` +
    linhas.map(l=>{
      let rotulo = l.tipo==='entrada' ? 'entrada' : (l.motivo||'saída');
      if(l.motivo==='Outros' && l.motivoTexto) rotulo = l.motivoTexto;
      else if(l.motivo==='A receber' && l.recebido) rotulo = 'recebido';
      return `<div class="hist-linha">
        <div><span class="tag ${l.tipo==='entrada'?'e':'s'}">${escapar(rotulo)}</span></div>
        <div class="nome">${escapar(l.nome)}${l.marca?`<small>${escapar(l.marca)}</small>`:''}</div>
        <div class="col-cat"><span class="cat">${escapar(l.categoria)}</span></div>
        <div class="num">${l.qtd}</div>
        <div class="num">${fmtData(l.data)}</div>
        <div class="num">${l.valor==null?'—':fmtBRL(l.valor)}</div>
      </div>`;
    }).join('') + `</div>`;
}

/* =========================================================
   CATEGORIAS (criar / editar / remover)
   ========================================================= */
let catEditando = null;
function abrirCategorias(){ catEditando=null; renderCategorias(); abrir('modalCat'); }
function renderCategorias(){
  document.getElementById('listaCat').innerHTML = estado.categorias.map((c,i)=>{
    const emUso = estado.produtos.some(p=>p.categoria===c);
    if(catEditando===i){
      return `<li>
        <input type="text" id="catInput" value="${escapar(c)}" style="flex:1;padding:7px 9px;border:1px solid var(--borda);border-radius:8px;font-size:14px" oninput="this.value=sanitizarCategoria(this.value)" onkeydown="if(event.key==='Enter')salvarEdicaoCategoria(${i})">
        <button class="btn btn-amarelo btn-mini" onclick="salvarEdicaoCategoria(${i})">Salvar</button>
        <button class="btn btn-claro btn-mini" onclick="catEditando=null;renderCategorias()">Cancelar</button>
      </li>`;
    }
    return `<li><span style="flex:1">${escapar(c)}</span>
      <button class="btn btn-claro btn-mini" onclick="catEditando=${i};renderCategorias()">Editar</button>
      <button class="btn btn-claro btn-mini" onclick="removerCategoriaIdx(${i})" ${emUso?'disabled title="Em uso por produtos" style="opacity:.4"':''}>Remover</button></li>`;
  }).join('');
  if(catEditando!==null){ const inp=document.getElementById('catInput'); if(inp) setTimeout(()=>inp.focus(),30); }
}
function adicionarCategoria(){
  const v = sanitizarCategoria(document.getElementById('novaCat').value).trim();
  if(!v){ toast('Informe um nome válido.'); return; }
  if(estado.categorias.some(c=>c.toLowerCase()===v.toLowerCase())){ toast('Essa categoria já existe.'); return; }
  estado.categorias.push(v);
  document.getElementById('novaCat').value='';
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
  estado.categorias.splice(i,1);
  salvar(); renderCategorias(); render();
}

/* =========================================================
   BACKUP (exportar / importar JSON)
   ========================================================= */
function exportar(){
  const blob = new Blob([JSON.stringify(estado,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup-estoque-${hoje()}.json`;
  a.click();
  toast('Backup gerado.');
}
function importar(ev){
  const arq = ev.target.files[0]; if(!arq) return;
  const leitor = new FileReader();
  leitor.onload = e=>{
    try{
      const dados = JSON.parse(e.target.result);
      if(!dados.produtos||!dados.categorias) throw new Error();
      pedirConfirmacao('Isso vai substituir os dados atuais pelo backup. Continuar?', ()=>{
        estado = dados; salvar(); render(); toast('Backup restaurado.');
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

/* ===== Início ===== */
document.getElementById('versao').textContent = 'v'+VERSAO;
render();