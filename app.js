/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */
const VERSAO = '0.2.1';
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
  return saidas(p).filter(m=>m.motivo==='A receber').reduce((s,m)=>s+m.qtd,0);
}
/* Composição do estoque atual por custo (FIFO: saídas consomem os lotes mais antigos) */
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
/* Lucro estimado a partir do preço de venda e do custo médio */
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
    const alvo = `${p.nome} ${p.marca||''} ${p.codigo||''}`.toLowerCase();
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
    return `<div class="linha" data-id="${p.id}">
      <div class="nome">
        ${p.marca?`<span class="marca">${escapar(p.marca)}</span>`:''}
        ${escapar(p.nome)}
        ${baixo?'<span class="badge-baixo">estoque baixo</span>':''}
        ${ar>0?`<span class="badge-receber">${ar} a receber</span>`:''}
        ${p.codigo?`<small class="codigo">${escapar(p.codigo)}</small>`:''}
      </div>
      <div class="col-cat"><span class="cat">${escapar(p.categoria)}</span></div>
      <div class="num" style="color:${baixo?'var(--vermelho)':'inherit'}">${est}</div>
      <div class="num">${fmtBRL(p.preco||null)}</div>
      <div class="num col-custo">${fmtBRL(cm)}</div>
    </div>`;
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
  filtro.innerHTML = '<option value="">Todas as categorias</option>' +
    estado.categorias.map(c=>`<option ${c===atual?'selected':''}>${escapar(c)}</option>`).join('');
}

/* ===== Toque/clique nas linhas: clique abre o painel inteiro, segurar abre ações ===== */
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
   PRODUTO (cadastro)
   ========================================================= */
function abrirProduto(id){
  const sel = document.getElementById('pCategoria');
  sel.innerHTML = estado.categorias.map(c=>`<option>${escapar(c)}</option>`).join('');
  const p = id ? prod(id) : null;
  document.getElementById('tituloProduto').textContent = p ? 'Editar produto' : 'Novo produto';
  document.getElementById('produtoId').value = p ? p.id : '';
  document.getElementById('pMarca').value    = p ? (p.marca||'') : '';
  document.getElementById('pNome').value     = p ? p.nome : '';
  document.getElementById('pCategoria').value= p ? p.categoria : (estado.categorias[0]||'');
  document.getElementById('pCodigo').value   = p ? (p.codigo||'') : '';
  document.getElementById('pPreco').value    = p && p.preco ? p.preco : '';
  document.getElementById('pMinimo').value   = p ? (p.minimo||0) : 0;
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
    codigo: document.getElementById('pCodigo').value.trim(),
    preco: isNaN(precoVal) ? 0 : precoVal,
    minimo: parseInt(document.getElementById('pMinimo').value)||0
  };

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
  if(!confirm('Excluir este produto e todo o histórico dele?')) return;
  estado.produtos = estado.produtos.filter(p=>p.id!==id);
  salvar(); fechar('modalProduto'); render(); toast('Produto excluído.');
}

/* =========================================================
   BLOCOS REUTILIZÁVEIS (entrada / saída)
   Usados tanto no painel completo quanto nos modais avulsos.
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

/* ===== Modais avulsos a partir das ações rápidas ===== */
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
    else if(m.motivo==='A receber') valor = 'a receber';
    const rotulo = m.tipo==='saida'
      ? ` · ${escapar(m.motivo==='Outros' && m.motivoTexto ? m.motivoTexto : m.motivo)}` : '';
    return `<div class="mov">
      <span class="tag ${m.tipo==='entrada'?'e':'s'}">${m.tipo==='entrada'?'entrada':'saída'}</span>
      <span class="data">${fmtData(m.data)}</span>
      <span>${m.qtd} un.${rotulo}</span>
      <span class="valor">${valor}</span>
      <button class="apagar" title="Apagar" onclick="apagarMov('${m.id}')">&times;</button>
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

    <div style="margin:-4px 0 18px">
      <button class="btn btn-claro btn-mini" onclick="fechar('modalMov');abrirProduto('${p.id}')">Editar dados do produto</button>
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

/* Refresca a UI depois de registrar uma movimentação, venha de onde vier */
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
  if(!isNaN(v) && v>=0) p.preco = v;   // atualiza o preço de venda do produto
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
function apagarMov(id){
  const p = prod(produtoAtivo);
  p.movimentacoes = p.movimentacoes.filter(m=>m.id!==id);
  salvar(); renderMov(); render();
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

/* =========================================================
   HISTÓRICO GERAL
   ========================================================= */
let histPor = 'data', histDir = 'desc';
function abrirHistorico(){ renderHistorico(); abrir('modalHistorico'); }
function histAlternarDir(){
  histDir = histDir==='asc' ? 'desc' : 'asc';
  document.getElementById('histDir').textContent = histDir==='asc' ? '↑' : '↓';
  renderHistorico();
}
function renderHistorico(){
  histPor = document.getElementById('histOrdenar').value;
  const linhas = [];
  estado.produtos.forEach(p=>{
    p.movimentacoes.forEach(m=>{
      let valor = null;
      if(m.tipo==='entrada') valor = m.custoUnit;
      else if(m.motivo==='Venda') valor = m.precoVenda;
      else if(m.motivo==='A receber') valor = 0;
      linhas.push({ tipo:m.tipo, nome:p.nome, marca:p.marca, categoria:p.categoria,
                    data:m.data, qtd:m.qtd, valor, motivo:m.motivo, motivoTexto:m.motivoTexto });
    });
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
  if(linhas.length===0){ cont.innerHTML = '<p class="sem-resultado">Nenhuma movimentação registrada.</p>'; return; }

  cont.innerHTML = `<div class="hist-tabela">
    <div class="hist-cab">
      <div>Tipo</div><div>Produto</div><div class="col-cat">Categoria</div>
      <div class="num">Qtd</div><div class="num">Data</div><div class="num">Valor</div>
    </div>` +
    linhas.map(l=>{
      const rotulo = l.tipo==='entrada' ? 'entrada' : (l.motivo==='Outros' && l.motivoTexto ? l.motivoTexto : (l.motivo||'saída'));
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
   CATEGORIAS
   ========================================================= */
function abrirCategorias(){ renderCategorias(); abrir('modalCat'); }
function renderCategorias(){
  document.getElementById('listaCat').innerHTML = estado.categorias.map(c=>{
    const emUso = estado.produtos.some(p=>p.categoria===c);
    return `<li><span>${escapar(c)}</span>
      <button class="btn btn-claro btn-mini" onclick="removerCategoria('${escapar(c)}')" ${emUso?'disabled title="Em uso por produtos" style="opacity:.4"':''}>Remover</button></li>`;
  }).join('');
}
function adicionarCategoria(){
  const v = document.getElementById('novaCat').value.trim();
  if(!v) return;
  if(estado.categorias.includes(v)){ toast('Essa categoria já existe.'); return; }
  estado.categorias.push(v);
  document.getElementById('novaCat').value='';
  salvar(); renderCategorias(); render(); toast('Categoria adicionada.');
}
function removerCategoria(c){
  estado.categorias = estado.categorias.filter(x=>x!==c);
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
      if(!confirm('Isso vai substituir os dados atuais pelo backup. Continuar?')) return;
      estado = dados; salvar(); render(); toast('Backup restaurado.');
    }catch(err){ toast('Arquivo inválido.'); }
  };
  leitor.readAsText(arq);
  ev.target.value='';
}

/* ===== Utilidades de UI ===== */
/* Containers gerados dinamicamente: limpamos ao fechar para não duplicar IDs */
const CORPO_DE = {
  modalMov:'corpoMov', modalRegEntrada:'corpoRegEntrada',
  modalRegSaida:'corpoRegSaida', modalEntrada:'corpoEntrada'
};
function abrir(id){ document.getElementById(id).classList.add('aberto'); }
function fechar(id){
  document.getElementById(id).classList.remove('aberto');
  if(CORPO_DE[id]) document.getElementById(CORPO_DE[id]).innerHTML = '';
}
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{
  if(e.target===o){
    if(o.id==='modalSenha') acaoSenha=null;
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
      { id:uid(), marca:'Baseus', nome:'Cabo USB-C 1m', categoria:'Cabos', codigo:'CB-001', minimo:10, preco:19.90,
        movimentacoes:[
          {id:uid(),tipo:'entrada',data:'2026-04-10',qtd:50,custoUnit:7.50},
          {id:uid(),tipo:'entrada',data:'2026-05-20',qtd:30,custoUnit:9.20},
          {id:uid(),tipo:'saida',data:'2026-05-28',qtd:72,motivo:'Venda',precoVenda:19.90}
        ]},
      { id:uid(), marca:'SanDisk', nome:'Pendrive 64GB', categoria:'Memória e armazenamento', codigo:'PD-64', minimo:5, preco:49.90,
        movimentacoes:[
          {id:uid(),tipo:'entrada',data:'2026-05-02',qtd:40,custoUnit:22.00},
          {id:uid(),tipo:'saida',data:'2026-05-25',qtd:8,motivo:'Venda',precoVenda:49.90},
          {id:uid(),tipo:'saida',data:'2026-05-30',qtd:3,motivo:'A receber',precoVenda:0}
        ]},
      { id:uid(), marca:'Microsoft', nome:'Controle sem fio Xbox', categoria:'Joysticks', codigo:'JS-XB', minimo:3, preco:399.00,
        movimentacoes:[
          {id:uid(),tipo:'entrada',data:'2026-04-15',qtd:12,custoUnit:215.00}
        ]}
    ]
  };
}

/* ===== Início ===== */
document.getElementById('versao').textContent = 'v'+VERSAO;
render();
