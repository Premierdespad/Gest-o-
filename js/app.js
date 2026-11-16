// Crina – Gestão de Haras. SPA em JavaScript puro.
DB.load();
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fdate = (d) => d ? d.split('-').reverse().join('/') : '';
const daysUntil = (d) => Math.round((new Date(d + 'T00:00') - new Date(today() + 'T00:00')) / 864e5);
const addDays = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const animal = (id) => DB.get('animais', id);
const aname = (id) => animal(id)?.nome || '';
const idade = (n) => { if (!n) return ''; const m = Math.floor((new Date() - new Date(n)) / (30.44 * 864e5)); return m < 24 ? m + ' meses' : Math.floor(m / 12) + ' anos'; };
const GESTACAO = 340;

// ---------- Perfis e permissões ----------
const MODULOS = [
  ['dashboard', 'Painel'], ['animais', 'Animais'], ['reproducao', 'Reprodução'], ['sanidade', 'Sanidade'],
  ['financeiro', 'Financeiro'], ['estoque', 'Estoque'], ['relatorios', 'Relatórios'], ['site', 'Site do Haras'],
  ['usuarios', 'Usuários'], ['config', 'Configurações'],
];
const PERFIS = {
  'Administrador': MODULOS.map(m => m[0]),
  'Veterinário': ['dashboard', 'animais', 'reproducao', 'sanidade', 'relatorios'],
  'Funcionário': ['dashboard', 'animais', 'sanidade', 'estoque'],
  'Financeiro': ['dashboard', 'financeiro', 'estoque', 'relatorios'],
};
function usuarioAtual() {
  const u = DB.get('usuarios', DB.data.config.usuarioAtual) || DB.list('usuarios')[0];
  return u || { nome: 'Admin', perfil: 'Administrador' };
}
const pode = (mod) => (PERFIS[usuarioAtual().perfil] || []).includes(mod);

// ---------- Formulários genéricos ----------
const animalOpts = (filtro) => DB.list('animais').filter(filtro || (() => true)).sort((a, b) => a.nome.localeCompare(b.nome)).map(a => [a.id, a.nome]);

function field(f, v) {
  const id = 'f_' + f.k, req = f.req ? 'required' : '';
  let input;
  if (f.t === 'select' || f.t === 'animal') {
    const opts = typeof f.opts === 'function' ? f.opts() : f.opts;
    input = `<select id="${id}" ${req}><option value="">—</option>${opts.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${val == v ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
  } else if (f.t === 'textarea') input = `<textarea id="${id}" rows="3">${esc(v)}</textarea>`;
  else if (f.t === 'file') input = `<input id="${id}" type="file" accept="image/*">${v ? `<img src="${v}" class="thumb" style="margin-top:6px">` : ''}`;
  else input = `<input id="${id}" type="${f.t || 'text'}" ${f.t === 'number' ? 'step="any"' : ''} value="${esc(v)}" ${req}>`;
  return `<div class="${f.full ? 'full' : ''}"><label for="${id}">${esc(f.l)}${f.req ? ' *' : ''}</label>${input}</div>`;
}

function openForm(title, fields, obj, onSave) {
  obj = obj || {};
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<form class="box"><div class="top"><h3 style="margin:0">${esc(title)}</h3><button type="button" class="sec" data-x>Fechar</button></div>
    <div class="grid">${fields.map(f => field(f, obj[f.k])).join('')}</div>
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" class="sec" data-x>Cancelar</button><button type="submit">Salvar</button></div></form>`;
  document.body.appendChild(m);
  m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => m.remove());
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const out = { ...obj };
    for (const f of fields) {
      const el = $('#f_' + f.k, m);
      if (f.t === 'file') { if (el.files[0]) out[f.k] = await resizeImage(el.files[0]); }
      else out[f.k] = f.t === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    }
    onSave(out); m.remove(); render();
  };
}

function resizeImage(file, max = 600) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.8));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

function table(cols, rows, actions) {
  if (!rows.length) return '<p class="muted">Nenhum registro encontrado.</p>';
  return `<div class="tw"><table><thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}${actions ? '<th></th>' : ''}</tr></thead><tbody>
    ${rows.map(r => `<tr>${cols.map(c => `<td>${c[1](r)}</td>`).join('')}${actions ? `<td class="right" style="white-space:nowrap">${actions(r)}</td>` : ''}</tr>`).join('')}
  </tbody></table></div>`;
}
const del = (col, id) => { if (confirm('Excluir este registro?')) { DB.remove(col, id); render(); } };
const statusTag = (dias) => dias < 0 ? `<span class="tag bad">Vencido há ${-dias}d</span>` : dias <= 15 ? `<span class="tag warn">Em ${dias}d</span>` : `<span class="tag ok">Em ${dias}d</span>`;

// ---------- Definições dos cadastros ----------
const F_ANIMAL = [
  { k: 'nome', l: 'Nome', req: true }, { k: 'registro', l: 'Nº de registro' }, { k: 'chip', l: 'Microchip' },
  { k: 'sexo', l: 'Sexo', t: 'select', opts: ['Macho', 'Fêmea', 'Macho castrado'], req: true },
  { k: 'raca', l: 'Raça' }, { k: 'pelagem', l: 'Pelagem' }, { k: 'nascimento', l: 'Nascimento', t: 'date' },
  { k: 'categoria', l: 'Categoria', t: 'select', opts: ['Garanhão', 'Matriz', 'Potro', 'Potra', 'Doadora', 'Receptora', 'Serviço', 'Esporte'] },
  { k: 'status', l: 'Situação', t: 'select', opts: ['Ativo', 'Vendido', 'Morto', 'Emprestado', 'Externo'], req: true },
  { k: 'local', l: 'Local (baia/piquete)' },
  { k: 'paiId', l: 'Pai', t: 'animal', opts: () => animalOpts(a => a.sexo !== 'Fêmea') },
  { k: 'maeId', l: 'Mãe', t: 'animal', opts: () => animalOpts(a => a.sexo === 'Fêmea') },
  { k: 'proprietario', l: 'Proprietário' }, { k: 'criador', l: 'Criador' },
  { k: 'foto', l: 'Foto', t: 'file' },
  { k: 'aVenda', l: 'Exibir à venda no site?', t: 'select', opts: ['Não', 'Sim'] }, { k: 'preco', l: 'Preço de venda (R$)', t: 'number' },
  { k: 'descricaoVenda', l: 'Descrição para o site', t: 'textarea', full: true },
  { k: 'obs', l: 'Observações', t: 'textarea', full: true },
];
const F_BIO = [{ k: 'data', l: 'Data', t: 'date', req: true }, { k: 'peso', l: 'Peso (kg)', t: 'number' }, { k: 'altura', l: 'Altura cernelha (m)', t: 'number' }, { k: 'toracico', l: 'Perímetro torácico (m)', t: 'number' }, { k: 'canela', l: 'Perímetro de canela (m)', t: 'number' }, { k: 'escore', l: 'Escore corporal (1-9)', t: 'number' }];
const F_MOV = [{ k: 'tipo', l: 'Tipo', t: 'select', opts: ['Entrada', 'Saída'], req: true }, { k: 'data', l: 'Data', t: 'date', req: true }, { k: 'motivo', l: 'Motivo', t: 'select', opts: ['Nascimento', 'Compra', 'Venda', 'Empréstimo', 'Devolução', 'Exposição/Prova', 'Óbito', 'Transferência'] }, { k: 'origemDestino', l: 'Origem / destino' }, { k: 'gta', l: 'Nº GTA' }, { k: 'obs', l: 'Observações', t: 'textarea', full: true }];
const F_REPRO = [
  { k: 'eguaId', l: 'Égua', t: 'animal', opts: () => animalOpts(a => a.sexo === 'Fêmea'), req: true },
  { k: 'garanhaoId', l: 'Garanhão', t: 'animal', opts: () => animalOpts(a => a.sexo === 'Macho') },
  { k: 'metodo', l: 'Método', t: 'select', opts: ['Monta natural', 'Monta controlada', 'Inseminação (sêmen fresco)', 'Inseminação (sêmen resfriado)', 'Inseminação (sêmen congelado)', 'Transferência de embrião'] },
  { k: 'receptoraId', l: 'Receptora (TE)', t: 'animal', opts: () => animalOpts(a => a.sexo === 'Fêmea') },
  { k: 'dataCobertura', l: 'Data da cobertura/IA', t: 'date', req: true },
  { k: 'dataDG', l: 'Data do diagnóstico', t: 'date' },
  { k: 'resultadoDG', l: 'Resultado do diagnóstico', t: 'select', opts: ['Aguardando', 'Prenhe', 'Vazia', 'Gemelar', 'Reabsorção/Aborto'] },
  { k: 'status', l: 'Situação', t: 'select', opts: ['Coberta', 'Gestante', 'Vazia', 'Parida', 'Aborto'] },
  { k: 'dataParto', l: 'Data do parto', t: 'date' },
  { k: 'potroId', l: 'Produto (potro)', t: 'animal', opts: () => animalOpts() },
  { k: 'veterinario', l: 'Veterinário' }, { k: 'obs', l: 'Observações', t: 'textarea', full: true },
];
const F_SAN = [
  { k: 'animalId', l: 'Animal', t: 'animal', opts: () => animalOpts(a => a.status === 'Ativo'), req: true },
  { k: 'tipo', l: 'Tipo', t: 'select', opts: ['Vacina', 'Vermifugação', 'Exame', 'Tratamento', 'Consulta', 'Cirurgia', 'Casqueamento/Ferrageamento', 'Odontologia'], req: true },
  { k: 'produto', l: 'Produto / procedimento', req: true }, { k: 'data', l: 'Data de aplicação', t: 'date', req: true },
  { k: 'proxima', l: 'Próxima aplicação / retorno', t: 'date' }, { k: 'dose', l: 'Dose / lote' },
  { k: 'responsavel', l: 'Responsável / veterinário' }, { k: 'custo', l: 'Custo (R$)', t: 'number' },
  { k: 'obs', l: 'Observações / diagnóstico', t: 'textarea', full: true },
];
const F_FIN = () => [
  { k: 'tipo', l: 'Tipo', t: 'select', opts: ['Receita', 'Despesa'], req: true }, { k: 'data', l: 'Data / vencimento', t: 'date', req: true },
  { k: 'descricao', l: 'Descrição', req: true }, { k: 'valor', l: 'Valor (R$)', t: 'number', req: true },
  { k: 'centro', l: 'Centro de custo', t: 'select', opts: DB.data.centrosCusto },
  { k: 'animalId', l: 'Animal relacionado', t: 'animal', opts: () => animalOpts() },
  { k: 'status', l: 'Situação', t: 'select', opts: ['Pago', 'Pendente'], req: true },
  { k: 'forma', l: 'Forma de pagamento', t: 'select', opts: ['Pix', 'Dinheiro', 'Boleto', 'Cartão', 'Transferência', 'Cheque'] },
  { k: 'contraparte', l: 'Cliente / fornecedor' }, { k: 'obs', l: 'Observações', t: 'textarea', full: true },
];
const F_EST = [{ k: 'item', l: 'Item', req: true }, { k: 'categoria', l: 'Categoria', t: 'select', opts: ['Alimentação', 'Medicamento', 'Suplemento', 'Material', 'Sêmen', 'Outros'] }, { k: 'quantidade', l: 'Quantidade', t: 'number', req: true }, { k: 'unidade', l: 'Unidade' }, { k: 'minimo', l: 'Estoque mínimo', t: 'number' }, { k: 'custoUnit', l: 'Custo unitário (R$)', t: 'number' }, { k: 'validade', l: 'Validade', t: 'date' }];
const F_USU = [{ k: 'nome', l: 'Nome', req: true }, { k: 'email', l: 'E-mail', t: 'email' }, { k: 'perfil', l: 'Perfil de acesso', t: 'select', opts: Object.keys(PERFIS), req: true }, { k: 'ativo', l: 'Ativo', t: 'select', opts: ['Sim', 'Não'] }];

// ---------- Views ----------
let state = { view: 'dashboard', animalId: null, tab: 'dados', filtro: '', finMes: today().slice(0, 7) };
const V = {};

V.dashboard = () => {
  const ativos = DB.list('animais').filter(a => a.status === 'Ativo');
  const gest = DB.list('reproducao').filter(r => r.status === 'Gestante');
  const alertas = DB.list('sanidade').filter(s => s.proxima && daysUntil(s.proxima) <= 30).sort((a, b) => a.proxima.localeCompare(b.proxima));
  const mes = today().slice(0, 7), fin = DB.list('financeiro').filter(f => f.data.startsWith(mes));
  const rec = fin.filter(f => f.tipo === 'Receita').reduce((s, f) => s + f.valor, 0), desp = fin.filter(f => f.tipo === 'Despesa').reduce((s, f) => s + f.valor, 0);
  const partos = gest.map(r => ({ ...r, prev: addDays(r.dataCobertura, GESTACAO) })).sort((a, b) => a.prev.localeCompare(b.prev));
  const baixo = DB.list('estoque').filter(e => Number(e.quantidade) <= Number(e.minimo));
  const dgPend = DB.list('reproducao').filter(r => r.resultadoDG === 'Aguardando');
  const porCat = {}; ativos.forEach(a => porCat[a.categoria || 'Sem categoria'] = (porCat[a.categoria || 'Sem categoria'] || 0) + 1);
  return `<div class="kpis">
    <div class="kpi"><small>Animais ativos</small><b>${ativos.length}</b></div>
    <div class="kpi"><small>Éguas gestantes</small><b>${gest.length}</b></div>
    <div class="kpi"><small>Alertas sanitários (30d)</small><b>${alertas.length}</b></div>
    ${pode('financeiro') ? `<div class="kpi"><small>Resultado do mês</small><b style="color:${rec - desp >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(rec - desp)}</b></div>` : ''}
  </div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
    <div class="card"><h3>Agenda sanitária</h3>${table([['Animal', s => esc(aname(s.animalId))], ['Tipo', s => esc(s.tipo)], ['Produto', s => esc(s.produto)], ['Quando', s => fdate(s.proxima) + ' ' + statusTag(daysUntil(s.proxima))]], alertas.slice(0, 8))}</div>
    <div class="card"><h3>Previsão de partos</h3>${table([['Égua', r => esc(aname(r.eguaId))], ['Garanhão', r => esc(aname(r.garanhaoId))], ['Previsão', r => fdate(r.prev) + ` <span class="muted">(${daysUntil(r.prev)}d)</span>`]], partos)}
      ${dgPend.length ? `<p><span class="tag warn">${dgPend.length} diagnóstico(s) de gestação pendente(s)</span></p>` : ''}</div>
    <div class="card"><h3>Plantel por categoria</h3>${Object.entries(porCat).map(([k, v]) => `<div style="margin:8px 0"><div class="row" style="justify-content:space-between"><span>${esc(k)}</span><b>${v}</b></div><div class="bar"><i style="width:${v / ativos.length * 100}%"></i></div></div>`).join('') || '<p class="muted">Sem animais.</p>'}</div>
    <div class="card"><h3>Estoque abaixo do mínimo</h3>${table([['Item', e => esc(e.item)], ['Qtd.', e => `${e.quantidade} ${esc(e.unidade || '')}`], ['Mínimo', e => e.minimo]], baixo)}</div>
  </div>`;
};

V.animais = () => {
  if (state.animalId) return V.animal();
  const q = state.filtro.toLowerCase();
  const rows = DB.list('animais').filter(a => !q || [a.nome, a.registro, a.raca, a.categoria, a.status, a.local].join(' ').toLowerCase().includes(q)).sort((a, b) => a.nome.localeCompare(b.nome));
  return `<div class="card"><div class="row" style="margin-bottom:12px"><input placeholder="Buscar por nome, registro, raça, categoria, situação..." value="${esc(state.filtro)}" oninput="state.filtro=this.value;render();this.focus();this.setSelectionRange(this.value.length,this.value.length)" style="max-width:420px"></div>
  ${table([
    ['', a => a.foto ? `<img src="${a.foto}" class="thumb">` : '<span class="thumb"></span>'],
    ['Nome', a => `<a href="#" onclick="state.animalId='${a.id}';state.tab='dados';render();return false"><b>${esc(a.nome)}</b></a><br><small class="muted">${esc(a.registro || '')}</small>`],
    ['Sexo', a => esc(a.sexo)], ['Idade', a => idade(a.nascimento)], ['Raça', a => esc(a.raca)], ['Categoria', a => esc(a.categoria)], ['Local', a => esc(a.local)],
    ['Situação', a => `<span class="tag ${a.status === 'Ativo' ? 'ok' : a.status === 'Morto' ? 'bad' : ''}">${esc(a.status)}</span>`],
  ], rows, a => `<button class="lnk" onclick="editAnimal('${a.id}')">Editar</button><button class="del" onclick="del('animais','${a.id}')">Excluir</button>`)}</div>`;
};
window.editAnimal = (id) => openForm(id ? 'Editar animal' : 'Novo animal', F_ANIMAL, id ? animal(id) : { status: 'Ativo', aVenda: 'Não' }, o => DB.upsert('animais', o));

function node(id, cls, depth) {
  const a = animal(id);
  return `<div class="n ${cls}">${a ? `<a href="#" onclick="state.animalId='${a.id}';render();return false">${esc(a.nome)}</a><br><small class="muted">${esc(a.registro || a.pelagem || '')}</small>` : '<span class="muted">Desconhecido</span>'}</div>`;
}
function genealogia(a) {
  const p = animal(a.paiId), m = animal(a.maeId);
  return `<div class="tree">
    <div class="col">${node(a.paiId, 'm')}${node(a.maeId, 'f')}</div>
    <div class="col">${node(p?.paiId, 'm')}${node(p?.maeId, 'f')}${node(m?.paiId, 'm')}${node(m?.maeId, 'f')}</div>
    <div class="col">${[p?.paiId, p?.maeId, m?.paiId, m?.maeId].map(x => { const y = animal(x); return node(y?.paiId, 'm') + node(y?.maeId, 'f'); }).join('')}</div></div>`;
}

V.animal = () => {
  const a = animal(state.animalId); if (!a) { state.animalId = null; return V.animais(); }
  const filhos = DB.list('animais').filter(x => x.paiId === a.id || x.maeId === a.id);
  const bio = DB.list('biometria').filter(b => b.animalId === a.id).sort((x, y) => y.data.localeCompare(x.data));
  const mov = DB.list('movimentacoes').filter(b => b.animalId === a.id).sort((x, y) => y.data.localeCompare(x.data));
  const san = DB.list('sanidade').filter(b => b.animalId === a.id).sort((x, y) => y.data.localeCompare(x.data));
  const rep = DB.list('reproducao').filter(r => r.eguaId === a.id || r.garanhaoId === a.id || r.receptoraId === a.id);
  const fin = DB.list('financeiro').filter(f => f.animalId === a.id);
  const tabs = [['dados', 'Dados'], ['genealogia', 'Genealogia'], ['biometria', 'Biometria'], ['movimentacoes', 'Entradas e saídas'], ['sanidade', 'Prontuário'], ['reproducao', 'Reprodução'], ['financeiro', 'Custos']];
  let body = '';
  if (state.tab === 'dados') body = `<div class="row" style="align-items:flex-start;gap:20px">${a.foto ? `<img src="${a.foto}" class="photo">` : '<div class="photo"></div>'}
    <div class="grid" style="flex:1">${[['Registro', a.registro], ['Microchip', a.chip], ['Sexo', a.sexo], ['Raça', a.raca], ['Pelagem', a.pelagem], ['Nascimento', fdate(a.nascimento) + (a.nascimento ? ` (${idade(a.nascimento)})` : '')], ['Categoria', a.categoria], ['Situação', a.status], ['Local', a.local], ['Pai', aname(a.paiId)], ['Mãe', aname(a.maeId)], ['Proprietário', a.proprietario], ['Criador', a.criador], ['À venda', a.aVenda === 'Sim' ? 'Sim – ' + brl(a.preco) : 'Não']].map(([k, v]) => `<div><label>${k}</label>${esc(v) || '—'}</div>`).join('')}
    ${a.obs ? `<div class="full"><label>Observações</label>${esc(a.obs)}</div>` : ''}</div></div>
    <h4>Filhos (${filhos.length})</h4>${filhos.map(f => `<a href="#" onclick="state.animalId='${f.id}';render();return false">${esc(f.nome)}</a>`).join(' · ') || '<span class="muted">Nenhum</span>'}`;
  if (state.tab === 'genealogia') body = genealogia(a);
  if (state.tab === 'biometria') body = `<button onclick="openForm('Nova medição',F_BIO,{animalId:'${a.id}',data:today()},o=>DB.upsert('biometria',o))">+ Medição</button><br><br>` +
    table([['Data', b => fdate(b.data)], ['Peso (kg)', b => b.peso], ['Altura (m)', b => b.altura], ['Torácico (m)', b => b.toracico], ['Canela (m)', b => b.canela], ['Escore', b => b.escore ?? '']], bio, b => `<button class="del" onclick="del('biometria','${b.id}')">Excluir</button>`);
  if (state.tab === 'movimentacoes') body = `<button onclick="openForm('Nova movimentação',F_MOV,{animalId:'${a.id}',data:today()},o=>DB.upsert('movimentacoes',o))">+ Movimentação</button><br><br>` +
    table([['Data', b => fdate(b.data)], ['Tipo', b => `<span class="tag ${b.tipo === 'Entrada' ? 'ok' : 'warn'}">${b.tipo}</span>`], ['Motivo', b => esc(b.motivo)], ['Origem/destino', b => esc(b.origemDestino)], ['GTA', b => esc(b.gta)]], mov, b => `<button class="del" onclick="del('movimentacoes','${b.id}')">Excluir</button>`);
  if (state.tab === 'sanidade') body = `<button onclick="openForm('Novo registro sanitário',F_SAN,{animalId:'${a.id}',data:today()},o=>DB.upsert('sanidade',o))">+ Registro</button><br><br>` +
    table([['Data', s => fdate(s.data)], ['Tipo', s => esc(s.tipo)], ['Produto', s => esc(s.produto)], ['Próxima', s => s.proxima ? fdate(s.proxima) : ''], ['Responsável', s => esc(s.responsavel)], ['Obs.', s => esc(s.obs)]], san, s => `<button class="del" onclick="del('sanidade','${s.id}')">Excluir</button>`);
  if (state.tab === 'reproducao') body = table([['Cobertura', r => fdate(r.dataCobertura)], ['Égua', r => esc(aname(r.eguaId))], ['Garanhão', r => esc(aname(r.garanhaoId))], ['Método', r => esc(r.metodo)], ['DG', r => esc(r.resultadoDG)], ['Situação', r => esc(r.status)]], rep);
  if (state.tab === 'financeiro') { const tot = fin.reduce((s, f) => s + (f.tipo === 'Receita' ? f.valor : -f.valor), 0) - san.reduce((s, x) => s + (Number(x.custo) || 0), 0);
    body = table([['Data', f => fdate(f.data)], ['Descrição', f => esc(f.descricao)], ['Tipo', f => f.tipo], ['Valor', f => brl(f.valor)]], fin) + `<p>Custos sanitários: <b>${brl(san.reduce((s, x) => s + (Number(x.custo) || 0), 0))}</b> · Saldo do animal: <b>${brl(tot)}</b></p>`; }
  return `<div class="card"><div class="row" style="justify-content:space-between"><div><button class="sec" onclick="state.animalId=null;render()">← Voltar</button> <b style="font-size:20px;margin-left:8px">${esc(a.nome)}</b></div>
    <div class="row"><button class="sec" onclick="window.print()">Imprimir ficha</button><button onclick="editAnimal('${a.id}')">Editar</button></div></div><br>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${state.tab === k ? 'on' : ''}" onclick="state.tab='${k}';render()">${l}</button>`).join('')}</div>${body}</div>`;
};

V.reproducao = () => {
  const rows = DB.list('reproducao').slice().sort((a, b) => b.dataCobertura.localeCompare(a.dataCobertura));
  const st = (r) => { const c = { Gestante: 'ok', Parida: 'ok', Vazia: 'bad', Aborto: 'bad', Coberta: 'warn' }[r.status]; return `<span class="tag ${c || ''}">${esc(r.status)}</span>`; };
  const cnt = (s) => rows.filter(r => r.status === s).length;
  const dgs = rows.filter(r => r.resultadoDG && r.resultadoDG !== 'Aguardando'); const taxa = dgs.length ? Math.round(dgs.filter(r => r.resultadoDG === 'Prenhe' || r.resultadoDG === 'Gemelar').length / dgs.length * 100) : 0;
  return `<div class="kpis"><div class="kpi"><small>Cobertas (aguardando DG)</small><b>${cnt('Coberta')}</b></div><div class="kpi"><small>Gestantes</small><b>${cnt('Gestante')}</b></div><div class="kpi"><small>Paridas</small><b>${cnt('Parida')}</b></div><div class="kpi"><small>Taxa de prenhez</small><b>${taxa}%</b></div></div>
  <div class="card">${table([
    ['Égua', r => esc(aname(r.eguaId))], ['Garanhão', r => esc(aname(r.garanhaoId))], ['Método', r => esc(r.metodo)],
    ['Cobertura', r => fdate(r.dataCobertura) + `<br><small class="muted">${daysUntil(r.dataCobertura) * -1} dias</small>`],
    ['DG', r => esc(r.resultadoDG || '') + (r.dataDG ? `<br><small class="muted">${fdate(r.dataDG)}</small>` : (r.resultadoDG === 'Aguardando' ? `<br><small class="muted">sugerido ${fdate(addDays(r.dataCobertura, 14))}</small>` : ''))],
    ['Previsão parto', r => r.status === 'Gestante' ? fdate(addDays(r.dataCobertura, GESTACAO)) : (r.dataParto ? 'Pariu ' + fdate(r.dataParto) : '—')],
    ['Situação', st],
  ], rows, r => `${r.status === 'Gestante' ? `<button class="lnk" onclick="registrarParto('${r.id}')">Registrar parto</button>` : ''}<button class="lnk" onclick="openForm('Editar evento reprodutivo',F_REPRO,DB.get('reproducao','${r.id}'),o=>DB.upsert('reproducao',o))">Editar</button><button class="del" onclick="del('reproducao','${r.id}')">Excluir</button>`)}</div>`;
};
window.registrarParto = (id) => {
  const r = DB.get('reproducao', id);
  openForm('Registrar parto e cadastrar potro', [{ k: 'dataParto', l: 'Data do parto', t: 'date', req: true }, { k: 'nome', l: 'Nome do potro', req: true }, { k: 'sexo', l: 'Sexo', t: 'select', opts: ['Macho', 'Fêmea'], req: true }, { k: 'pelagem', l: 'Pelagem' }, { k: 'obs', l: 'Observações do parto', t: 'textarea', full: true }],
    { dataParto: today() }, o => {
      const mae = animal(r.eguaId);
      const potro = DB.upsert('animais', { nome: o.nome, sexo: o.sexo, pelagem: o.pelagem, nascimento: o.dataParto, raca: mae?.raca, paiId: r.garanhaoId, maeId: r.eguaId, categoria: o.sexo === 'Macho' ? 'Potro' : 'Potra', status: 'Ativo', aVenda: 'Não', criador: DB.data.config.haras });
      DB.upsert('movimentacoes', { animalId: potro.id, tipo: 'Entrada', data: o.dataParto, motivo: 'Nascimento', origemDestino: DB.data.config.haras });
      DB.upsert('reproducao', { ...r, status: 'Parida', dataParto: o.dataParto, potroId: potro.id, obs: [r.obs, o.obs].filter(Boolean).join(' | ') });
    });
};

V.sanidade = () => {
  const rows = DB.list('sanidade').slice().sort((a, b) => b.data.localeCompare(a.data));
  return `<div class="card">${table([
    ['Data', s => fdate(s.data)], ['Animal', s => esc(aname(s.animalId))], ['Tipo', s => esc(s.tipo)], ['Produto / procedimento', s => esc(s.produto)],
    ['Próxima', s => s.proxima ? fdate(s.proxima) + ' ' + statusTag(daysUntil(s.proxima)) : '—'], ['Responsável', s => esc(s.responsavel)], ['Custo', s => s.custo ? brl(s.custo) : ''],
  ], rows, s => `<button class="lnk" onclick="openForm('Editar registro',F_SAN,DB.get('sanidade','${s.id}'),o=>DB.upsert('sanidade',o))">Editar</button><button class="del" onclick="del('sanidade','${s.id}')">Excluir</button>`)}</div>`;
};
window.aplicacaoLote = () => {
  const ativos = DB.list('animais').filter(a => a.status === 'Ativo');
  const flds = F_SAN.filter(f => f.k !== 'animalId').concat([{ k: 'alvo', l: 'Aplicar em', t: 'select', opts: ['Todos os ativos', 'Somente éguas', 'Somente machos', 'Somente potros'], req: true }]);
  openForm('Aplicação em lote (todo o plantel)', flds, { data: today(), alvo: 'Todos os ativos' }, o => {
    const alvo = ativos.filter(a => o.alvo === 'Somente éguas' ? a.sexo === 'Fêmea' : o.alvo === 'Somente machos' ? a.sexo !== 'Fêmea' : o.alvo === 'Somente potros' ? /Potr/.test(a.categoria || '') : true);
    const { alvo: _, ...base } = o; alvo.forEach(a => DB.upsert('sanidade', { ...base, id: undefined, animalId: a.id }));
    alert(`${alvo.length} registros criados.`);
  });
};

V.financeiro = () => {
  const mes = state.finMes; const all = DB.list('financeiro');
  const rows = all.filter(f => !mes || f.data.startsWith(mes)).sort((a, b) => b.data.localeCompare(a.data));
  const sum = (arr, t) => arr.filter(f => f.tipo === t).reduce((s, f) => s + Number(f.valor), 0);
  const rec = sum(rows, 'Receita'), desp = sum(rows, 'Despesa');
  const pend = all.filter(f => f.status === 'Pendente');
  const porCentro = {}; rows.forEach(f => { const c = f.centro || 'Sem centro'; porCentro[c] = porCentro[c] || { r: 0, d: 0 }; porCentro[c][f.tipo === 'Receita' ? 'r' : 'd'] += Number(f.valor); });
  return `<div class="card row"><label style="margin:0">Período:</label><input type="month" value="${mes}" onchange="state.finMes=this.value;render()" style="max-width:180px"><button class="sec" onclick="state.finMes='';render()">Todo o período</button>
    <span class="muted">Centros de custo:</span> ${DB.data.centrosCusto.map(c => `<span class="tag">${esc(c)}</span>`).join(' ')} <button class="lnk" onclick="novoCentro()">+ centro</button></div>
  <div class="kpis"><div class="kpi"><small>Receitas</small><b style="color:var(--ok)">${brl(rec)}</b></div><div class="kpi"><small>Despesas</small><b style="color:var(--bad)">${brl(desp)}</b></div><div class="kpi"><small>Resultado</small><b>${brl(rec - desp)}</b></div><div class="kpi"><small>Contas pendentes</small><b>${pend.length}</b><small>${brl(pend.reduce((s, f) => s + (f.tipo === 'Despesa' ? -1 : 1) * f.valor, 0))}</small></div></div>
  <div class="card"><h3>Demonstrativo por centro de custo</h3>${table([['Centro', ([c]) => esc(c)], ['Receitas', ([, v]) => brl(v.r)], ['Despesas', ([, v]) => brl(v.d)], ['Resultado', ([, v]) => `<b style="color:${v.r - v.d >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(v.r - v.d)}</b>`]], Object.entries(porCentro))}</div>
  <div class="card"><h3>Lançamentos</h3>${table([
    ['Data', f => fdate(f.data)], ['Descrição', f => esc(f.descricao) + (f.contraparte ? `<br><small class="muted">${esc(f.contraparte)}</small>` : '')], ['Centro', f => esc(f.centro)], ['Animal', f => esc(aname(f.animalId))],
    ['Valor', f => `<b style="color:${f.tipo === 'Receita' ? 'var(--ok)' : 'var(--bad)'}">${f.tipo === 'Despesa' ? '-' : ''}${brl(f.valor)}</b>`],
    ['Situação', f => `<span class="tag ${f.status === 'Pago' ? 'ok' : 'warn'}">${f.status}</span>`],
  ], rows, f => `${f.status === 'Pendente' ? `<button class="lnk" onclick="DB.upsert('financeiro',{...DB.get('financeiro','${f.id}'),status:'Pago'});render()">Baixar</button>` : ''}<button class="lnk" onclick="openForm('Editar lançamento',F_FIN(),DB.get('financeiro','${f.id}'),o=>DB.upsert('financeiro',o))">Editar</button><button class="del" onclick="del('financeiro','${f.id}')">Excluir</button>`)}</div>`;
};
window.novoCentro = () => { const n = prompt('Nome do novo centro de custo:'); if (n && !DB.data.centrosCusto.includes(n)) { DB.data.centrosCusto.push(n); DB.save(); render(); } };

V.estoque = () => `<div class="card">${table([
  ['Item', e => esc(e.item)], ['Categoria', e => esc(e.categoria)], ['Quantidade', e => `${e.quantidade} ${esc(e.unidade || '')}` + (Number(e.quantidade) <= Number(e.minimo) ? ' <span class="tag bad">Baixo</span>' : '')],
  ['Mínimo', e => e.minimo ?? ''], ['Custo unit.', e => e.custoUnit ? brl(e.custoUnit) : ''], ['Valor em estoque', e => brl(e.quantidade * (e.custoUnit || 0))], ['Validade', e => e.validade ? fdate(e.validade) : ''],
], DB.list('estoque'), e => `<button class="lnk" onclick="movEstoque('${e.id}',1)">+ Entrada</button><button class="lnk" onclick="movEstoque('${e.id}',-1)">− Saída</button><button class="lnk" onclick="openForm('Editar item',F_EST,DB.get('estoque','${e.id}'),o=>DB.upsert('estoque',o))">Editar</button><button class="del" onclick="del('estoque','${e.id}')">Excluir</button>`)}</div>`;
window.movEstoque = (id, sinal) => {
  const e = DB.get('estoque', id); const q = Number(prompt(`${sinal > 0 ? 'Entrada' : 'Saída'} de ${e.item} — quantidade:`)); if (!q) return;
  DB.upsert('estoque', { ...e, quantidade: Number(e.quantidade) + sinal * q });
  if (sinal > 0 && e.custoUnit && confirm('Lançar a compra como despesa no financeiro?')) DB.upsert('financeiro', { tipo: 'Despesa', data: today(), descricao: `Compra: ${q} ${e.unidade || ''} ${e.item}`, valor: q * e.custoUnit, centro: e.categoria === 'Medicamento' ? 'Sanidade' : 'Alimentação', status: 'Pago' });
  render();
};

V.relatorios = () => {
  const r = state.rel || 'plantel'; let out = '';
  const rels = [['plantel', 'Plantel'], ['vacinal', 'Calendário sanitário'], ['reprodutivo', 'Reprodutivo'], ['financeiro', 'Financeiro anual'], ['vendas', 'Animais à venda']];
  if (r === 'plantel') out = table([['Nome', a => esc(a.nome)], ['Registro', a => esc(a.registro)], ['Sexo', a => esc(a.sexo)], ['Nascimento', a => fdate(a.nascimento)], ['Raça', a => esc(a.raca)], ['Pelagem', a => esc(a.pelagem)], ['Pai', a => esc(aname(a.paiId))], ['Mãe', a => esc(aname(a.maeId))], ['Situação', a => esc(a.status)]], DB.list('animais').filter(a => a.status !== 'Externo'));
  if (r === 'vacinal') out = table([['Animal', s => esc(aname(s.animalId))], ['Tipo', s => esc(s.tipo)], ['Produto', s => esc(s.produto)], ['Última', s => fdate(s.data)], ['Próxima', s => fdate(s.proxima)], ['Status', s => statusTag(daysUntil(s.proxima))]], DB.list('sanidade').filter(s => s.proxima).sort((a, b) => a.proxima.localeCompare(b.proxima)));
  if (r === 'reprodutivo') { const by = {}; DB.list('reproducao').forEach(x => { const g = aname(x.garanhaoId) || '—'; by[g] = by[g] || { c: 0, p: 0, n: 0 }; by[g].c++; if (['Prenhe', 'Gemelar'].includes(x.resultadoDG)) by[g].p++; if (x.status === 'Parida') by[g].n++; });
    out = table([['Garanhão', ([g]) => esc(g)], ['Coberturas', ([, v]) => v.c], ['Prenhezes', ([, v]) => v.p], ['Nascimentos', ([, v]) => v.n], ['Taxa de prenhez', ([, v]) => Math.round(v.p / v.c * 100) + '%']], Object.entries(by)); }
  if (r === 'financeiro') { const ano = today().slice(0, 4); const ms = [...Array(12)].map((_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    const v = (m, t) => DB.list('financeiro').filter(f => f.data.startsWith(m) && f.tipo === t).reduce((s, f) => s + Number(f.valor), 0);
    out = `<h4>Exercício ${ano}</h4>` + table([['Mês', m => m.slice(5) + '/' + ano], ['Receitas', m => brl(v(m, 'Receita'))], ['Despesas', m => brl(v(m, 'Despesa'))], ['Resultado', m => brl(v(m, 'Receita') - v(m, 'Despesa'))]], ms); }
  if (r === 'vendas') out = table([['Nome', a => esc(a.nome)], ['Sexo', a => esc(a.sexo)], ['Idade', a => idade(a.nascimento)], ['Pai × Mãe', a => esc(aname(a.paiId) + ' × ' + aname(a.maeId))], ['Preço', a => brl(a.preco)]], DB.list('animais').filter(a => a.aVenda === 'Sim'));
  return `<div class="card noprint row">${rels.map(([k, l]) => `<button class="${r === k ? '' : 'sec'}" onclick="state.rel='${k}';render()">${l}</button>`).join('')}<button class="sec" onclick="exportCSV()">Exportar CSV</button></div>
    <div class="card"><h3>${esc(DB.data.config.haras)} — ${rels.find(x => x[0] === r)[1]}</h3><small class="muted">Emitido em ${fdate(today())}</small>${out}</div>`;
};
window.exportCSV = () => {
  const t = document.querySelector('.main table'); if (!t) return;
  const csv = [...t.rows].map(r => [...r.cells].map(c => '"' + c.innerText.replace(/"/g, '""') + '"').join(';')).join('\n');
  download('relatorio.csv', '﻿' + csv, 'text/csv');
};
function download(name, content, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); }

V.site = () => {
  const s = DB.data.site; const venda = DB.list('animais').filter(a => a.aVenda === 'Sim');
  const F = [{ k: 'titulo', l: 'Nome do haras', req: true }, { k: 'slogan', l: 'Slogan' }, { k: 'telefone', l: 'Telefone / WhatsApp' }, { k: 'email', l: 'E-mail' }, { k: 'endereco', l: 'Localização' }, { k: 'instagram', l: 'Instagram' }, { k: 'cor', l: 'Cor principal', t: 'color' }, { k: 'banner', l: 'Imagem de capa', t: 'file' }, { k: 'sobre', l: 'Sobre o haras', t: 'textarea', full: true }];
  return `<div class="card"><p>Monte a vitrine pública do seu haras. Os dados abaixo e os animais marcados como <b>“à venda”</b> aparecem automaticamente no site.</p>
    <div class="row"><button onclick="editarSite()">Editar conteúdo do site</button><a class="btn sec" href="vitrine.html" target="_blank">Abrir site público ↗</a></div></div>
    <div class="card"><div class="grid">${F.filter(f => f.t !== 'file').map(f => `<div class="${f.full ? 'full' : ''}"><label>${f.l}</label>${f.t === 'color' ? `<span class="tag" style="background:${esc(s[f.k])};color:#fff">${esc(s[f.k])}</span>` : esc(s[f.k]) || '—'}</div>`).join('')}</div></div>
    <div class="card"><h3>Animais publicados (${venda.length})</h3>${table([['', a => a.foto ? `<img src="${a.foto}" class="thumb">` : '<span class="thumb"></span>'], ['Nome', a => esc(a.nome)], ['Preço', a => brl(a.preco)]], venda, a => `<button class="lnk" onclick="DB.upsert('animais',{...animal('${a.id}'),aVenda:'Não'});render()">Despublicar</button>`)}</div>`;
};
window.editarSite = () => openForm('Conteúdo do site', [{ k: 'titulo', l: 'Nome do haras', req: true }, { k: 'slogan', l: 'Slogan' }, { k: 'telefone', l: 'Telefone / WhatsApp' }, { k: 'email', l: 'E-mail' }, { k: 'endereco', l: 'Localização' }, { k: 'instagram', l: 'Instagram' }, { k: 'cor', l: 'Cor principal', t: 'color' }, { k: 'banner', l: 'Imagem de capa', t: 'file' }, { k: 'sobre', l: 'Sobre o haras', t: 'textarea', full: true }], DB.data.site, o => { DB.data.site = o; DB.save(); });

V.usuarios = () => `<div class="card"><p class="muted">Cada perfil tem acesso a módulos específicos:</p>${table([['Perfil', ([p]) => `<b>${p}</b>`], ['Módulos permitidos', ([, m]) => m.map(x => MODULOS.find(y => y[0] === x)[1]).join(', ')]], Object.entries(PERFIS))}</div>
  <div class="card">${table([['Nome', u => esc(u.nome)], ['E-mail', u => esc(u.email)], ['Perfil', u => `<span class="tag">${esc(u.perfil)}</span>`], ['Ativo', u => esc(u.ativo)]], DB.list('usuarios'), u => `<button class="lnk" onclick="openForm('Editar usuário',F_USU,DB.get('usuarios','${u.id}'),o=>DB.upsert('usuarios',o))">Editar</button><button class="del" onclick="del('usuarios','${u.id}')">Excluir</button>`)}</div>`;

V.config = () => `<div class="card"><h3>Dados do haras</h3><div class="row"><input id="cfgHaras" value="${esc(DB.data.config.haras)}" style="max-width:320px"><button onclick="DB.data.config.haras=$('#cfgHaras').value;DB.save();render()">Salvar</button></div></div>
  <div class="card"><h3>Backup e sincronização</h3><p class="muted">Os dados ficam salvos neste navegador. Exporte um backup para guardar ou levar para outro dispositivo.</p>
  <div class="row"><button onclick="download('backup-haras-${today()}.json',JSON.stringify(DB.data),'application/json')">Exportar backup</button>
  <label class="btn sec" style="margin:0;color:var(--ink);font-size:14px">Importar backup<input type="file" accept=".json" hidden onchange="importar(this.files[0])"></label></div></div>
  <div class="card"><h3>Zona de risco</h3><div class="row"><button class="sec" onclick="if(confirm('Recarregar dados de demonstração? Os dados atuais serão perdidos.')){DB.reset();render()}">Restaurar dados de demonstração</button><button class="sec" style="color:var(--bad)" onclick="if(confirm('Apagar TODOS os dados?')){DB.clear();render()}">Começar do zero</button></div></div>`;
window.importar = (f) => { const r = new FileReader(); r.onload = () => { try { DB.data = JSON.parse(r.result); DB.save(); alert('Backup importado!'); render(); } catch (e) { alert('Arquivo inválido.'); } }; r.readAsText(f); };

// ---------- Ações do topo por módulo ----------
const ACOES = {
  animais: () => state.animalId ? '' : `<button onclick="editAnimal()">+ Novo animal</button>`,
  reproducao: () => `<button onclick="openForm('Nova cobertura / inseminação',F_REPRO,{dataCobertura:today(),resultadoDG:'Aguardando',status:'Coberta'},o=>DB.upsert('reproducao',o))">+ Nova cobertura</button>`,
  sanidade: () => `<button class="sec" onclick="aplicacaoLote()">Aplicação em lote</button><button onclick="openForm('Novo registro sanitário',F_SAN,{data:today()},o=>DB.upsert('sanidade',o))">+ Novo registro</button>`,
  financeiro: () => `<button onclick="openForm('Novo lançamento',F_FIN(),{data:today(),tipo:'Despesa',status:'Pago'},o=>DB.upsert('financeiro',o))">+ Novo lançamento</button>`,
  estoque: () => `<button onclick="openForm('Novo item',F_EST,{},o=>DB.upsert('estoque',o))">+ Novo item</button>`,
  relatorios: () => `<button onclick="window.print()">Imprimir</button>`,
  usuarios: () => `<button onclick="openForm('Novo usuário',F_USU,{perfil:'Funcionário',ativo:'Sim'},o=>DB.upsert('usuarios',o))">+ Novo usuário</button>`,
};

function render() {
  if (!pode(state.view)) state.view = 'dashboard';
  const u = usuarioAtual();
  $('#nav').innerHTML = MODULOS.filter(([k]) => pode(k)).map(([k, l]) => `<a href="#${k}" class="${state.view === k ? 'on' : ''}">${l}</a>`).join('');
  $('#user').innerHTML = `<label style="color:#bfae9c">Usuário conectado</label><select onchange="DB.data.config.usuarioAtual=this.value;DB.save();render()">${DB.list('usuarios').filter(x => x.ativo !== 'Não').map(x => `<option value="${x.id}" ${x.id === u.id ? 'selected' : ''}>${esc(x.nome)} (${esc(x.perfil)})</option>`).join('')}</select>`;
  $('#harasNome').textContent = DB.data.config.haras;
  $('#title').textContent = MODULOS.find(m => m[0] === state.view)[1];
  $('#actions').innerHTML = (ACOES[state.view] || (() => ''))();
  $('#content').innerHTML = V[state.view]();
  $('.side').classList.remove('open');
}
window.addEventListener('hashchange', () => { state.view = location.hash.slice(1) || 'dashboard'; state.animalId = null; state.filtro = ''; render(); });
state.view = location.hash.slice(1) || 'dashboard';
render();
