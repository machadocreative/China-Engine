/* =========================================================
   ARMAZENAMENTO
   Tenta usar o localStorage (funciona no GitHub Pages).
   Se o navegador bloquear, guarda só na memória da sessão.
   O backup de verdade é o botão "Backup" (arquivo JSON).
   ========================================================= */
const CHAVE = 'chinatown_estoque_v1';

/* Senha do gerente para alterar o preço de venda numa baixa.
   OBS: por estar no código, ela serve como trava de operação
   (estilo caixa de supermercado), não como segurança real. */
const SENHA_ADMIN = 'CHINAMASTER999';

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

/* ===== Cálculos ===== */
function entradas(p){ return p.movimentacoes.filter(m=>m.tipo==='entrada'); }
function saidas(p){ return p.movimentacoes.filter(m=>m.tipo==='saida'); }
function estoqueDe(p){
  const e = entradas(p).reduce((s,m)=>s+m.qtd,0);
  const s = saidas(p).reduce((a,m)=>a+m.qtd,0);
  return e - s;
}
function custoMedioDe(p){
  const ent = entradas(p);
  const totalQtd = ent.reduce((s,m)=>s+m.qtd,0);
  if(totalQtd===0) return null;
  const totalCusto = ent.reduce((s,m)=>s+m.qtd*m.custoUnit,0);
  return totalCusto/totalQtd;
}
function custosLotes(p){
  const custos = entradas(p).map(m=>m.custoUnit);
  if(custos.length===0) return null;
  return { min:Math.min(...custos), max:Math.max(...custos) };
}
function aReceberDe(p){
  return saidas(p).filter(m=>m.motivo==='A receber').reduce((s,m)=>s+m.qtd,0);
}
/* Lucro com base no preço de venda e no custo médio dos lotes em estoque */
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
   RENDER DA LISTA
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
    return `<div class="linha" onclick="abrirMov('${p.id}')">
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
}

function preencherFiltroCategorias(){
  const filtro = document.getElementById('filtroCategoria');
  const atual = filtro.value;
  filtro.innerHTML = '<option value="">Todas as categorias</option>' +
    estado.categorias.map(c=>`<option ${c===atual?'selected':''}>${escapar(c)}</option>`).join('');
}

/* =========================================================
   PRODUTO (cadastro)
   ========================================================= */
function abrirProduto(id){
  const sel = document.getElementById('pCategoria');
  sel.innerHTML = estado.categorias.map(c=>`<option>${escapar(c)}</option>`).join('');
  const p = id ? estado.produtos.find(x=>x.id===id) : null;
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
    Object.assign(estado.produtos.find(p=>p.id===id), dados);
  }else{
    estado.produtos.push({ id:uid(), ...dados, movimentacoes:[] });
  }
  salvar(); fechar('modalProduto'); render(); toast('Produto salvo.');
}
function excluirProduto(){
  const id = document.getElementById('produtoId').value;
  if(!confirm('Excluir este produto e todo o histórico dele?')) return;
  estado.produtos = estado.produtos.filter(p=>p.id!==id);
  salvar(); fechar('modalProduto'); render(); toast('Produto excluído.');
}

/* =========================================================
   MOVIMENTAÇÕES (entradas e saídas)
   ========================================================= */
let produtoAtivo = null;
function abrirMov(id){
  produtoAtivo = id;
  document.getElementById('tituloMov').textContent = estado.produtos.find(p=>p.id===id).nome;
  renderMov();
  abrir('modalMov');
}
function renderMov(){
  const p = estado.produtos.find(x=>x.id===produtoAtivo);
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

  const movs = [...p.movimentacoes].sort((a,b)=>b.data.localeCompare(a.data)).map(m=>{
    let valor = '';
    if(m.tipo==='entrada') valor = fmtBRL(m.custoUnit)+'/un';
    else if(m.motivo==='Venda') valor = fmtBRL(m.precoVenda)+'/un';
    else if(m.motivo==='A receber') valor = 'a receber';
    const rotuloMotivo = m.tipo==='saida'
      ? ` · ${escapar(m.motivo==='Outros' && m.motivoTexto ? m.motivoTexto : m.motivo)}` : '';
    return `<div class="mov">
      <span class="tag ${m.tipo==='entrada'?'e':'s'}">${m.tipo==='entrada'?'entrada':'saída'}</span>
      <span class="data">${fmtData(m.data)}</span>
      <span>${m.qtd} un.${rotuloMotivo}</span>
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

    <div class="forms-mov">
      <div class="bloco entrada">
        <h4>Registrar entrada (compra)</h4>
        <div class="mini-campo"><label>Data</label><input type="date" id="eData" value="${hoje()}"></div>
        <div class="mini-campo"><label>Quantidade</label><input type="number" id="eQtd" min="1" placeholder="0"></div>
        <div class="mini-campo"><label>Custo por unidade (R$)</label><input type="number" id="eCusto" min="0" step="0.01" placeholder="0,00"></div>
        <button class="btn btn-amarelo btn-mini" style="width:100%;justify-content:center;margin-top:4px" onclick="registrarEntrada()">+ Adicionar entrada</button>
      </div>
      <div class="bloco saida">
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
        <button class="btn btn-escuro btn-mini" style="width:100%;justify-content:center;margin-top:4px" onclick="registrarSaida()">− Dar baixa</button>
      </div>
    </div>

    <div class="sub">Histórico de movimentações</div>
    <div class="historico">${movs || '<p style="color:var(--texto-sec);padding:8px 0">Nenhuma movimentação ainda.</p>'}</div>

    <div class="rodape-modal" style="margin-top:18px">
      <button class="btn btn-claro btn-mini" onclick="fechar('modalMov');abrirProduto('${p.id}')">Editar dados do produto</button>
    </div>`;

  ajustarCamposSaida();
}

function ajustarCamposSaida(){
  const m = document.getElementById('sMotivo').value;
  document.getElementById('campoPrecoSaida').style.display   = (m==='Venda') ? 'block' : 'none';
  document.getElementById('campoMotivoOutros').style.display = (m==='Outros') ? 'block' : 'none';
  document.getElementById('notaReceber').style.display       = (m==='A receber') ? 'block' : 'none';
}

function registrarEntrada(){
  const p = estado.produtos.find(x=>x.id===produtoAtivo);
  const qtd = parseInt(document.getElementById('eQtd').value);
  const custo = parseFloat(document.getElementById('eCusto').value);
  const data = document.getElementById('eData').value;
  if(!qtd||qtd<1){ toast('Informe a quantidade.'); return; }
  if(isNaN(custo)||custo<0){ toast('Informe o custo por unidade.'); return; }
  p.movimentacoes.push({ id:uid(), tipo:'entrada', data, qtd, custoUnit:custo });
  salvar(); renderMov(); render(); toast('Entrada registrada.');
}

/* Saída: monta a movimentação e decide se precisa de senha */
let saidaPendente = null;
function registrarSaida(){
  const p = estado.produtos.find(x=>x.id===produtoAtivo);
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
    // Preço diferente do preço base → pede senha do gerente
    if(base>0 && Math.abs(precoVenda-base)>0.001){
      saidaPendente = mov;
      abrirSenha();
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
  salvar(); renderMov(); render();
  toast('Baixa registrada.');
}
function apagarMov(id){
  const p = estado.produtos.find(x=>x.id===produtoAtivo);
  p.movimentacoes = p.movimentacoes.filter(m=>m.id!==id);
  salvar(); renderMov(); render();
}

/* ===== Senha do gerente ===== */
function abrirSenha(){
  document.getElementById('senhaInput').value = '';
  abrir('modalSenha');
  setTimeout(()=>document.getElementById('senhaInput').focus(), 50);
}
function cancelarSenha(){ saidaPendente = null; fechar('modalSenha'); }
function confirmarSenha(){
  if(document.getElementById('senhaInput').value !== SENHA_ADMIN){ toast('Senha incorreta.'); return; }
  fechar('modalSenha');
  if(saidaPendente){
    const p = estado.produtos.find(x=>x.id===produtoAtivo);
    efetivarSaida(p, saidaPendente);
    saidaPendente = null;
  }
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
function abrir(id){ document.getElementById(id).classList.add('aberto'); }
function fechar(id){ document.getElementById(id).classList.remove('aberto'); }
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{
  if(e.target===o){ if(o.id==='modalSenha') saidaPendente=null; o.classList.remove('aberto'); }
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

render();
