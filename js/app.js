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
// Previsão de parto: pela cobertura; na TE sem data de cobertura, pela inovulação (embrião ~8 dias)
const previsaoParto = (r) => r.status !== 'Gestante' || r.dataParto ? null : r.dataCobertura ? addDays(r.dataCobertura, GESTACAO) : r.dataInovulacao ? addDays(r.dataInovulacao, GESTACAO - 8) : null;
// Só o último registro de cada (animal, tipo, produto) define a próxima dose
function pendenciasSanitarias() {
  const ult = {};
  DB.list('sanidade').forEach(x => { const k = [x.animalId, x.tipo, (x.produto || '').toLowerCase()].join('|'); if (!ult[k] || (x.data || '') > (ult[k].data || '')) ult[k] = x; });
  return Object.values(ult).filter(x => x.proxima && animal(x.animalId)?.status === 'Ativo').sort((a, b) => a.proxima.localeCompare(b.proxima));
}
const ABCCMM_URL = 'https://www.abccmm.org.br/animais';
window.verABCCMM = (id) => { const n = animal(id)?.nome || ''; navigator.clipboard?.writeText(n).catch(() => {}); window.open(ABCCMM_URL, '_blank', 'noopener'); };

// ---------- Perfis e permissões ----------
const MODULOS = [
  ['dashboard', 'Painel'], ['animais', 'Animais'], ['reproducao', 'Reprodução'], ['negocios', 'Compra e Venda'], ['sanidade', 'Sanidade'],
  ['financeiro', 'Financeiro'], ['custos', 'Criação, Custos e Pensão'], ['estoque', 'Estoque'], ['relatorios', 'Relatórios'], ['site', 'Site do Haras'],
  ['usuarios', 'Usuários'], ['config', 'Configurações'],
];
const PERFIS = {
  'Administrador': MODULOS.map(m => m[0]),
  'Veterinário': ['dashboard', 'animais', 'reproducao', 'sanidade', 'relatorios'],
  'Funcionário': ['dashboard', 'animais', 'sanidade', 'estoque'],
  'Financeiro': ['dashboard', 'negocios', 'financeiro', 'custos', 'estoque', 'relatorios'],
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
  { k: 'categoria', l: 'Categoria', t: 'select', opts: ['Garanhão', 'Matriz', 'Doadora', 'Receptora', 'Potro', 'Potra', 'Recria', 'Serviço', 'Esporte', 'Outro'] },
  { k: 'status', l: 'Situação', t: 'select', opts: ['Ativo', 'Vendido', 'Morto', 'Emprestado', 'Externo'], req: true },
  { k: 'local', l: 'Local (baia/piquete)' },
  { k: 'posse', l: 'Posse', t: 'select', opts: ['Próprio', 'Pensão'], req: true },
  { k: 'dataEntrada', l: 'Entrada no haras', t: 'date' }, { k: 'dataSaida', l: 'Saída do haras', t: 'date' },
  { k: 'pesoRateio', l: 'Peso no rateio de custos (1 = adulto)', t: 'number' },
  { k: 'valorPensao', l: 'Pensão: valor mensal cobrado (R$)', t: 'number' }, { k: 'telefoneProp', l: 'Pensão: telefone do proprietário' },
  { k: 'paiId', l: 'Pai', t: 'animal', opts: () => animalOpts(a => a.sexo !== 'Fêmea') },
  { k: 'maeId', l: 'Mãe', t: 'animal', opts: () => animalOpts(a => a.sexo === 'Fêmea') },
  { k: 'proprietario', l: 'Proprietário' }, { k: 'criador', l: 'Criador' },
  { k: 'origem', l: 'Origem', t: 'select', opts: ['Nascido no haras', 'Comprado', 'Recebido em troca', 'Outro'] }, { k: 'valorEstimado', l: 'Valor estimado (R$)', t: 'number' },
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
  { k: 'metodo', l: 'Método', t: 'select', opts: ['Monta natural', 'Monta controlada', 'Inseminação (sêmen fresco)', 'Inseminação (sêmen resfriado)', 'Inseminação (sêmen congelado)', 'Inseminação artificial', 'Transferência de embrião'] },
  { k: 'dataInovulacao', l: 'Data da inovulação (TE)', t: 'date' },
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
  { k: 'tipo', l: 'Tipo', t: 'select', opts: ['Vacina', 'Vermifugação', 'Exame', 'Tratamento', 'Consulta', 'Cirurgia', 'Casqueamento', 'Ferrageamento', 'Casqueamento/Ferrageamento', 'Odontologia', 'Outro'], req: true },
  { k: 'produto', l: 'Produto / procedimento', req: true }, { k: 'data', l: 'Data de aplicação', t: 'date', req: true },
  { k: 'proxima', l: 'Próxima aplicação / retorno', t: 'date' }, { k: 'dose', l: 'Dose / lote' },
  { k: 'responsavel', l: 'Responsável / veterinário' }, { k: 'custo', l: 'Custo (R$)', t: 'number' },
  { k: 'obs', l: 'Observações / diagnóstico', t: 'textarea', full: true },
];
const RATEIOS = ['Todos os animais', 'Somente criação', 'Somente pensão', 'Não ratear'];
const F_FIN = () => [
  { k: 'tipo', l: 'Tipo', t: 'select', opts: ['Receita', 'Despesa'], req: true }, { k: 'data', l: 'Data / vencimento', t: 'date', req: true },
  { k: 'descricao', l: 'Descrição', req: true }, { k: 'valor', l: 'Valor (R$)', t: 'number', req: true },
  { k: 'centro', l: 'Centro de custo', t: 'select', opts: DB.data.centrosCusto },
  { k: 'animalId', l: 'Animal relacionado (custo/receita direto)', t: 'animal', opts: () => animalOpts() },
  { k: 'rateio', l: 'Sem animal: ratear despesa entre', t: 'select', opts: RATEIOS },
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
  const alertas = pendenciasSanitarias().filter(s => daysUntil(s.proxima) <= 30);
  const mes = today().slice(0, 7), fin = DB.list('financeiro').filter(f => f.data.startsWith(mes));
  const rec = fin.filter(f => f.tipo === 'Receita').reduce((s, f) => s + f.valor, 0), desp = fin.filter(f => f.tipo === 'Despesa').reduce((s, f) => s + f.valor, 0);
  const partos = gest.map(r => ({ ...r, prev: previsaoParto(r) })).filter(r => r.prev).sort((a, b) => a.prev.localeCompare(b.prev));
  const pend = DB.list('financeiro').filter(f => f.status === 'Pendente'), somaF = (arr, t) => arr.filter(f => f.tipo === t).reduce((s, f) => s + Number(f.valor), 0);
  const pendMes = pend.filter(f => f.data.startsWith(mes)), atrasadas = pend.filter(f => f.data < today());
  const nAte2 = ativos.filter(a => a.nascimento && daysUntil(a.nascimento) > -730).length;
  const baixo = DB.list('estoque').filter(e => Number(e.quantidade) <= Number(e.minimo));
  const dgPend = DB.list('reproducao').filter(r => r.resultadoDG === 'Aguardando');
  const porCat = {}; ativos.forEach(a => porCat[a.categoria || 'Sem categoria'] = (porCat[a.categoria || 'Sem categoria'] || 0) + 1);
  const proprios = ativos.filter(a => a.posse !== 'Pensão');
  return `<div class="kpis">
    <div class="kpi"><small>Animais ativos</small><b>${ativos.length}</b><small>${proprios.filter(a => a.sexo === 'Fêmea').length} éguas · ${proprios.filter(a => a.sexo !== 'Fêmea').length} machos · ${nAte2} até 2 anos</small></div>
    ${pode('custos') ? `<div class="kpi" style="cursor:pointer" onclick="state.ctab='criacao';location.hash='custos'"><small>Patrimônio em animais (estimado)</small><b style="color:var(--ok)">${brl(patrimonio().total)}</b><small>nossa parte · ver detalhes</small></div>` : ''}
    <div class="kpi"><small>À venda · receptoras</small><b>${ativos.filter(a => a.aVenda === 'Sim').length} · ${ativos.filter(a => a.categoria === 'Receptora').length}</b></div>
    <div class="kpi"><small>Éguas gestantes</small><b>${gest.length}</b></div>
    <div class="kpi"><small>Alertas sanitários (30d)</small><b>${alertas.length}</b></div>
    ${pode('financeiro') ? `<div class="kpi"><small>Resultado do mês</small><b style="color:${rec - desp >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(rec - desp)}</b></div>` : ''}
    ${pode('custos') ? (() => { const C = calcCustos(mes + '-01', today()); const P = Object.entries(C).filter(([id]) => animal(id)?.posse === 'Pensão'); const r = P.reduce((s, [, c]) => s + c.receitas - c.diretos - c.rateio, 0); return `<div class="kpi"><small>Pensão: lucro/prejuízo no mês</small><b style="color:${r >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(r)}</b><small>${P.length} cavalo(s) de pensão</small></div>`; })() : ''}
  </div>
  ${pode('financeiro') ? `<div class="kpis"><div class="kpi"><small>A receber em ${mes.slice(5)}/${mes.slice(0, 4)}</small><b style="color:var(--ok)">${brl(somaF(pendMes, 'Receita'))}</b></div><div class="kpi"><small>A pagar em ${mes.slice(5)}/${mes.slice(0, 4)}</small><b style="color:var(--bad)">${brl(somaF(pendMes, 'Despesa'))}</b></div><div class="kpi" style="cursor:pointer" onclick="location.hash='financeiro'"><small>Parcelas atrasadas</small><b style="color:${atrasadas.length ? 'var(--bad)' : 'inherit'}">${atrasadas.length}</b><small>${brl(somaF(atrasadas, 'Receita'))} a receber · ${brl(somaF(atrasadas, 'Despesa'))} a pagar</small></div></div>` : ''}
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
    <div class="card"><h3>Agenda sanitária</h3>${table([['Animal', s => esc(aname(s.animalId))], ['Tipo', s => esc(s.tipo)], ['Produto', s => esc(s.produto)], ['Quando', s => fdate(s.proxima) + ' ' + statusTag(daysUntil(s.proxima))]], alertas.slice(0, 8))}</div>
    <div class="card"><h3>Previsão de partos</h3>${table([['Égua', r => r.receptoraId ? `${esc(aname(r.receptoraId))} <span class="tag">receptora</span><br><small class="muted">embrião de ${esc(aname(r.eguaId))}</small>` : esc(aname(r.eguaId))], ['Garanhão', r => esc(aname(r.garanhaoId))], ['Previsão', r => fdate(r.prev) + ` <span class="muted">(${daysUntil(r.prev)}d)</span>`]], partos)}
      ${dgPend.length ? `<p><span class="tag warn">${dgPend.length} diagnóstico(s) de gestação pendente(s)</span></p>` : ''}</div>
    <div class="card"><h3>Plantel por categoria</h3>${Object.entries(porCat).map(([k, v]) => `<div style="margin:8px 0"><div class="row" style="justify-content:space-between"><span>${esc(k)}</span><b>${v}</b></div><div class="bar"><i style="width:${v / ativos.length * 100}%"></i></div></div>`).join('') || '<p class="muted">Sem animais.</p>'}</div>
    <div class="card"><h3>Estoque abaixo do mínimo</h3>${table([['Item', e => esc(e.item)], ['Qtd.', e => `${e.quantidade} ${esc(e.unidade || '')}`], ['Mínimo', e => e.minimo]], baixo)}</div>
  </div>`;
};

V.animais = () => {
  if (state.animalId) return V.animal();
  const q = state.filtro.toLowerCase(), fs = state.fAnimais || 'ativos';
  const FILTROS = { ativos: ['Ativos (plantel)', a => a.status !== 'Externo' && !['Vendido', 'Morto'].includes(a.status)], haras: ['Todos do haras (inclui vendidos)', a => a.status !== 'Externo'], proprios: ['Só meus (sem pensão)', a => a.status === 'Ativo' && a.posse !== 'Pensão'], pensao: ['Só pensão', a => a.status === 'Ativo' && a.posse === 'Pensão'], vendidos: ['Vendidos', a => a.status === 'Vendido'], mortos: ['Mortos', a => a.status === 'Morto'], externos: ['Pais e garanhões de fora (só genealogia)', a => a.status === 'Externo'] };
  const rows = DB.list('animais').filter(FILTROS[fs][1]).filter(a => !q || [a.nome, a.registro, a.raca, a.categoria, a.status, a.local].join(' ').toLowerCase().includes(q)).sort((a, b) => a.nome.localeCompare(b.nome));
  return `<div class="card"><div class="row" style="margin-bottom:12px"><input placeholder="Buscar por nome, registro, raça, categoria..." value="${esc(state.filtro)}" oninput="state.filtro=this.value;render();this.focus();this.setSelectionRange(this.value.length,this.value.length)" style="max-width:380px">
    <select onchange="state.fAnimais=this.value;render()" style="max-width:280px">${Object.entries(FILTROS).map(([k, [l]]) => `<option value="${k}" ${k === fs ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="muted">${rows.length} animal(is)</span></div>
  ${table([
    ['', a => a.foto ? `<img src="${a.foto}" class="thumb">` : '<span class="thumb"></span>'],
    ['Nome', a => `<a href="#" onclick="state.animalId='${a.id}';state.tab='dados';render();return false"><b>${esc(a.nome)}</b></a><br><small class="muted">${esc(a.registro || '')}</small>`],
    ['Sexo', a => esc(a.sexo)], ['Idade', a => idade(a.nascimento)], ['Posse', a => a.posse === 'Pensão' ? `<span class="tag warn">Pensão</span><br><small class="muted">${esc(a.proprietario || '')}</small>` : '<span class="tag">Próprio</span>'], ['Raça', a => esc(a.raca)], ['Categoria', a => esc(a.categoria)], ['Local', a => esc(a.local)],
    ['Situação', a => `<span class="tag ${a.status === 'Ativo' ? 'ok' : a.status === 'Morto' ? 'bad' : ''}">${esc(a.status)}</span>`],
  ], rows, a => `<button class="lnk" onclick="editAnimal('${a.id}')">Editar</button><button class="del" onclick="del('animais','${a.id}')">Excluir</button>`)}</div>`;
};
window.editAnimal = (id) => openForm(id ? 'Editar animal' : 'Novo animal', F_ANIMAL, id ? animal(id) : { status: 'Ativo', aVenda: 'Não', posse: 'Próprio', pesoRateio: 1, dataEntrada: today() }, o => DB.upsert('animais', o));

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
  const tabs = [['dados', 'Dados'], ['genealogia', 'Genealogia'], ['biometria', 'Biometria'], ['movimentacoes', 'Entradas e saídas'], ['sanidade', 'Prontuário'], ['reproducao', 'Reprodução'], ['financeiro', 'Custos e resultado']];
  let body = '';
  if (state.tab === 'dados') body = `<div class="row" style="align-items:flex-start;gap:20px">${a.foto ? `<img src="${a.foto}" class="photo">` : '<div class="photo"></div>'}
    <div class="grid" style="flex:1">${[['Registro', a.registro], ['Microchip', a.chip], ['Sexo', a.sexo], ['Raça', a.raca], ['Pelagem', a.pelagem], ['Nascimento', fdate(a.nascimento) + (a.nascimento ? ` (${idade(a.nascimento)})` : '')], ['Categoria', a.categoria], ['Situação', a.status], ['Local', a.local], ['Pai', aname(a.paiId)], ['Mãe', aname(a.maeId)], ['Proprietário', a.proprietario], ['Criador', a.criador], ['Origem', a.origem], ['Valor estimado', a.valorEstimado ? brl(a.valorEstimado) : ''], ['À venda', a.aVenda === 'Sim' ? 'Sim – ' + brl(a.preco) : 'Não']].map(([k, v]) => `<div><label>${k}</label>${esc(v) || '—'}</div>`).join('')}
    ${(() => { const eu = socioProprio(), comp = composicao(a.id), nossa = eu ? (comp[eu.id] || 0) : 100; const compra = DB.list('negocios').filter(n => n.animalId === a.id && n.tipo === 'Compra' && (!n.produto || n.produto === 'Animal')).reduce((t, n) => t + Number(n.valor), 0); const dif = a.valorEstimado && compra ? a.valorEstimado - compra : null;
      return (nossa < 99.99 && a.posse !== 'Pensão' ? `<div><label>Participação do haras</label><b>${pct(Math.max(nossa, 0))}</b>${a.valorEstimado && nossa > 0 ? ` · nossa parte ${brl(a.valorEstimado * nossa / 100)}` : ''}</div>` : '') +
        (compra ? `<div><label>Valor de compra</label>${brl(compra)}</div>` : '') +
        (dif !== null ? `<div><label>Valorização</label><b style="color:${dif >= 0 ? 'var(--ok)' : 'var(--bad)'}">${dif >= 0 ? '+' : ''}${brl(dif)} (${dif >= 0 ? '+' : ''}${Math.round(dif / compra * 100)}%)</b></div>` : ''); })()}
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
  if (state.tab === 'financeiro') {
    const ini = a.dataEntrada || a.nascimento || '2000-01-01', c = calcCustos(ini, today())[a.id] || { dias: 0, diretos: 0, rateio: 0, receitas: 0, itens: [] };
    const cm = calcCustos(today().slice(0, 7) + '-01', today())[a.id] || { diretos: 0, rateio: 0, receitas: 0 };
    body = `<div class="kpis"><div class="kpi"><small>Custo total desde ${fdate(ini)}</small><b>${brl(c.diretos + c.rateio)}</b><small>${c.dias} dias · ${brl((c.diretos + c.rateio) / Math.max(c.dias, 1))}/dia</small></div>
      <div class="kpi"><small>Custo no mês atual</small><b>${brl(cm.diretos + cm.rateio)}</b></div>
      <div class="kpi"><small>Receitas ligadas ao animal</small><b>${brl(c.receitas)}</b></div>
      <div class="kpi"><small>Resultado acumulado</small><b style="color:${c.receitas - c.diretos - c.rateio >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(c.receitas - c.diretos - c.rateio)}</b></div></div>
      <p class="muted">Custos diretos: ${brl(c.diretos)} · Rateio de custos gerais: ${brl(c.rateio)}</p>` +
      table([['Data', i => fdate(i.data)], ['Origem', i => esc(i.origem)], ['Descrição', i => esc(i.desc)], ['Valor', i => `<span style="color:${i.v >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(i.v)}</span>`]], c.itens.slice().sort((x, y) => y.data.localeCompare(x.data)).slice(0, 200));
  }
  return `<div class="card"><div class="row" style="justify-content:space-between"><div><button class="sec" onclick="state.animalId=null;render()">← Voltar</button> <b style="font-size:20px;margin-left:8px">${esc(a.nome)}</b></div>
    <div class="row"><button class="sec" onclick="verABCCMM('${a.id}')" title="Copia o nome e abre a busca da ABCCMM">🔎 ABCCMM</button>${a.sexo === 'Fêmea' && a.status === 'Ativo' ? `<button class="sec" onclick="openForm('Nova cobertura',F_REPRO,{eguaId:'${a.id}',dataCobertura:today(),resultadoDG:'Aguardando',status:'Coberta'},o=>DB.upsert('reproducao',o))">+ Cobertura</button><button class="sec" onclick="editNegocio(null,'Venda',{produto:'Embrião',doadoraId:'${a.id}'})">Vender embrião</button>` : ''}${a.status === 'Ativo' && a.posse !== 'Pensão' ? `<button class="sec" onclick="editNegocio(null,'Venda',{animalId:'${a.id}'})">Registrar venda</button>` : ''}<button class="sec" onclick="window.print()">Imprimir ficha</button><button onclick="editAnimal('${a.id}')">Editar</button></div></div><br>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${state.tab === k ? 'on' : ''}" onclick="state.tab='${k}';render()">${l}</button>`).join('')}</div>${body}</div>`;
};

function situacaoReceptora(r) {
  const dt = c => c.dataInovulacao || c.dataCobertura || '';
  const ult = DB.list('reproducao').filter(c => c.receptoraId === r.id).sort((a, b) => dt(b).localeCompare(dt(a)))[0];
  if (!ult) return { ordem: 3, rotulo: 'Disponível', cls: '', info: 'Ainda sem inovulação registrada' };
  const emb = `Embrião de ${aname(ult.eguaId)} × ${aname(ult.garanhaoId) || '?'}`;
  if (ult.dataParto || ult.status === 'Parida') return { ordem: 2, rotulo: 'Parida', cls: '', cob: ult, info: (ult.dataParto ? `Pariu em ${fdate(ult.dataParto)} (há ${-daysUntil(ult.dataParto)} dias)` : 'Pariu') + (ult.potroId ? ` · potro: ${aname(ult.potroId)}` : '') };
  if (ult.status === 'Gestante') { const pv = previsaoParto(ult); return { ordem: 0, rotulo: 'Prenhe', cls: 'ok', cob: ult, info: emb + (pv ? ` · parto previsto ${fdate(pv)} (${daysUntil(pv) >= 0 ? 'faltam ' + daysUntil(pv) : 'passou ' + -daysUntil(pv)} dias)` : '') }; }
  if (ult.status === 'Coberta' || ult.resultadoDG === 'Aguardando') return { ordem: 1, rotulo: 'Aguardando diagnóstico', cls: 'warn', cob: ult, info: emb + (ult.dataInovulacao ? ` · inovulada em ${fdate(ult.dataInovulacao)} (há ${-daysUntil(ult.dataInovulacao)} dias)` : '') };
  return { ordem: 3, rotulo: 'Disponível', cls: '', cob: ult, info: `Última: ${ult.resultadoDG || ult.status} (${fdate(dt(ult))})` };
}
V.receptoras = () => {
  const rs = DB.list('animais').filter(a => a.categoria === 'Receptora' && a.status === 'Ativo').map(r => ({ r, s: situacaoReceptora(r) })).sort((a, b) => a.s.ordem - b.s.ordem || a.r.nome.localeCompare(b.r.nome));
  const conta = o => rs.filter(x => x.s.ordem === o).length;
  return `<div class="kpis"><div class="kpi"><small>Receptoras</small><b>${rs.length}</b></div><div class="kpi"><small>Prenhes</small><b style="color:var(--ok)">${conta(0)}</b></div><div class="kpi"><small>Aguardando diagnóstico</small><b>${conta(1)}</b></div><div class="kpi"><small>Disponíveis</small><b>${conta(3)}</b></div></div>
  <div class="card">${table([['Receptora', x => `<a href="#" onclick="location.hash='animais';setTimeout(()=>{state.animalId='${x.r.id}';render()});return false"><b>${esc(x.r.nome)}</b></a>`], ['Situação', x => `<span class="tag ${x.s.cls}">${x.s.rotulo}</span>`], ['Detalhes', x => esc(x.s.info)]], rs,
    x => (x.s.cob ? `<button class="lnk" onclick="openForm('Editar transferência',F_REPRO,DB.get('reproducao','${x.s.cob.id}'),o=>DB.upsert('reproducao',o))">Abrir</button>` : '') + (x.s.ordem >= 2 ? `<button class="lnk" onclick="openForm('Registrar inovulação',F_REPRO,{metodo:'Transferência de embrião',receptoraId:'${x.r.id}',dataInovulacao:today(),resultadoDG:'Aguardando',status:'Coberta'},o=>DB.upsert('reproducao',o))">+ Inovulação</button>` : ''))}
  ${rs.length ? '' : '<p class="muted">Cadastre as receptoras em Animais com a categoria “Receptora”.</p>'}</div>`;
};
V.reproducao = () => {
  if (state.rtab === 'receptoras') return abasRepro() + V.receptoras();
  return abasRepro() + V.coberturas();
};
const abasRepro = () => `<div class="tabs">${[['coberturas', 'Coberturas'], ['receptoras', 'Receptoras']].map(([k, l]) => `<button class="${(state.rtab || 'coberturas') === k ? 'on' : ''}" onclick="state.rtab='${k}';render()">${l}</button>`).join('')}</div>`;
V.coberturas = () => {
  const dt = r => r.dataCobertura || r.dataInovulacao || '';
  const rows = DB.list('reproducao').slice().sort((a, b) => dt(b).localeCompare(dt(a)));
  const st = (r) => { const c = { Gestante: 'ok', Parida: 'ok', Vazia: 'bad', Aborto: 'bad', Coberta: 'warn' }[r.status]; return `<span class="tag ${c || ''}">${esc(r.status)}</span>`; };
  const cnt = (s) => rows.filter(r => r.status === s).length;
  const dgs = rows.filter(r => r.resultadoDG && r.resultadoDG !== 'Aguardando'); const taxa = dgs.length ? Math.round(dgs.filter(r => r.resultadoDG === 'Prenhe' || r.resultadoDG === 'Gemelar').length / dgs.length * 100) : 0;
  return `<div class="kpis"><div class="kpi"><small>Cobertas (aguardando DG)</small><b>${cnt('Coberta')}</b></div><div class="kpi"><small>Gestantes</small><b>${cnt('Gestante')}</b></div><div class="kpi"><small>Paridas</small><b>${cnt('Parida')}</b></div><div class="kpi"><small>Taxa de prenhez</small><b>${taxa}%</b></div></div>
  <div class="card">${table([
    ['Égua', r => esc(aname(r.eguaId)) + (r.receptoraId ? `<br><small class="muted">receptora: ${esc(aname(r.receptoraId))}</small>` : '')], ['Garanhão', r => esc(aname(r.garanhaoId))], ['Método', r => esc(r.metodo)],
    ['Cobertura', r => dt(r) ? fdate(dt(r)) + `<br><small class="muted">${daysUntil(dt(r)) * -1} dias${!r.dataCobertura ? ' (inovulação)' : ''}</small>` : '—'],
    ['DG', r => esc(r.resultadoDG || '') + (r.dataDG ? `<br><small class="muted">${fdate(r.dataDG)}</small>` : (r.resultadoDG === 'Aguardando' && dt(r) ? `<br><small class="muted">sugerido ${fdate(addDays(dt(r), 14))}</small>` : ''))],
    ['Previsão parto', r => previsaoParto(r) ? fdate(previsaoParto(r)) : (r.dataParto ? 'Pariu ' + fdate(r.dataParto) : '—')],
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
  const pend = pendenciasSanitarias();
  return `<div class="card"><h3>Próximas doses e retornos</h3>${table([['Animal', s => esc(aname(s.animalId))], ['Tipo', s => esc(s.tipo)], ['Produto', s => esc(s.produto)], ['Quando', s => fdate(s.proxima) + ' ' + statusTag(daysUntil(s.proxima))]], pend,
    s => `<button class="lnk" onclick="openForm('Registrar aplicação',F_SAN,{animalId:'${s.animalId}',tipo:${esc(JSON.stringify(s.tipo))},produto:${esc(JSON.stringify(s.produto || ''))},data:today()},o=>DB.upsert('sanidade',o))">Registrar aplicação</button>`)}</div>
  <div class="card"><h3>Histórico</h3>${table([
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
  const atras = all.filter(f => f.status === 'Pendente' && f.data < today()).sort((a, b) => a.data.localeCompare(b.data));
  return `${atras.length ? `<div class="card" style="border-color:var(--bad)"><h3>⚠️ Parcelas atrasadas (${atras.length})</h3>${table([['Vencimento', f => fdate(f.data) + ` <span class="tag bad">${-daysUntil(f.data)}d</span>`], ['Descrição', f => esc(f.descricao) + (f.contraparte ? `<br><small class="muted">${esc(f.contraparte)}</small>` : '')], ['Valor', f => `<b style="color:${f.tipo === 'Receita' ? 'var(--ok)' : 'var(--bad)'}">${f.tipo === 'Despesa' ? '-' : ''}${brl(f.valor)}</b>`]], atras.slice(0, 50), f => `<button class="lnk" onclick="baixar('${f.id}')">Baixar</button>`)}</div>` : ''}
  <div class="card row"><label style="margin:0">Período:</label><input type="month" value="${mes}" onchange="state.finMes=this.value;render()" style="max-width:180px"><button class="sec" onclick="state.finMes='';render()">Todo o período</button>
    <span class="muted">Centros de custo:</span> ${DB.data.centrosCusto.map(c => `<span class="tag">${esc(c)}</span>`).join(' ')} <button class="lnk" onclick="novoCentro()">+ centro</button></div>
  <div class="kpis"><div class="kpi"><small>Receitas</small><b style="color:var(--ok)">${brl(rec)}</b></div><div class="kpi"><small>Despesas</small><b style="color:var(--bad)">${brl(desp)}</b></div><div class="kpi"><small>Resultado</small><b>${brl(rec - desp)}</b></div><div class="kpi"><small>Contas pendentes</small><b>${pend.length}</b><small>${brl(pend.reduce((s, f) => s + (f.tipo === 'Despesa' ? -1 : 1) * f.valor, 0))}</small></div></div>
  <div class="card"><h3>Demonstrativo por centro de custo</h3>${table([['Centro', ([c]) => esc(c)], ['Receitas', ([, v]) => brl(v.r)], ['Despesas', ([, v]) => brl(v.d)], ['Resultado', ([, v]) => `<b style="color:${v.r - v.d >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(v.r - v.d)}</b>`]], Object.entries(porCentro))}</div>
  <div class="card"><h3>Lançamentos</h3>${table([
    ['Data', f => fdate(f.data)], ['Descrição', f => esc(f.descricao) + (f.contraparte ? `<br><small class="muted">${esc(f.contraparte)}</small>` : '')], ['Centro', f => esc(f.centro)], ['Animal / rateio', f => f.animalId ? esc(aname(f.animalId)) : f.tipo === 'Despesa' ? `<small class="muted">${esc(f.rateio || 'Todos os animais')}</small>` : ''],
    ['Valor', f => `<b style="color:${f.tipo === 'Receita' ? 'var(--ok)' : 'var(--bad)'}">${f.tipo === 'Despesa' ? '-' : ''}${brl(f.valor)}</b>`],
    ['Situação', f => `<span class="tag ${f.status === 'Pago' ? 'ok' : 'warn'}">${f.status}</span>`],
  ], rows, f => `${f.status === 'Pendente' ? `<button class="lnk" onclick="baixar('${f.id}')">Baixar</button>` : ''}<button class="lnk" onclick="openForm('Editar lançamento',F_FIN(),DB.get('financeiro','${f.id}'),o=>DB.upsert('financeiro',o))">Editar</button><button class="del" onclick="del('financeiro','${f.id}')">Excluir</button>`)}</div>`;
};
window.baixar = (id) => {
  const f = DB.get('financeiro', id); DB.upsert('financeiro', { ...f, status: 'Pago', pagoEm: today() });
  const n = f.negocioId && DB.get('negocios', f.negocioId);
  if (n && n.parcelasLista && n.parcelasLista[f.parcelaIdx]) { n.parcelasLista[f.parcelaIdx].pagoEm = today(); DB.upsert('negocios', n); }
  render();
};
window.novoCentro = () => { const n = prompt('Nome do novo centro de custo:'); if (n && !DB.data.centrosCusto.includes(n)) { DB.data.centrosCusto.push(n); DB.save(); render(); } };


// ---------- Motor de custos: diretos + rateio de custos gerais ----------
function saidaDe(a) {
  if (a.dataSaida) return a.dataSaida;
  if (['Vendido', 'Morto'].includes(a.status)) { const m = DB.list('movimentacoes').filter(x => x.animalId === a.id && x.tipo === 'Saída').sort((x, y) => y.data.localeCompare(x.data))[0]; return m ? m.data : null; }
  return null;
}
function presente(a, d) {
  if (a.status === 'Externo') return false;
  const ent = a.dataEntrada || a.nascimento || '1900-01-01', sai = saidaDe(a);
  return d >= ent && (!sai || d <= sai);
}
function diasPresente(a, ini, fim) {
  const ent = a.dataEntrada || a.nascimento || '1900-01-01', sai = saidaDe(a) || '9999-12-31';
  const i = ent > ini ? ent : ini, f = sai < fim ? sai : fim;
  return a.status === 'Externo' || f < i ? 0 : Math.round((new Date(f) - new Date(i)) / 864e5) + 1;
}
// Retorna { [animalId]: { dias, diretos, rateio, receitas, itens[] } } para o período [ini, fim]
function calcCustos(ini, fim) {
  const out = {}, an = DB.list('animais');
  const R = (id) => out[id] || (out[id] = { dias: diasPresente(animal(id) || {}, ini, fim), diretos: 0, rateio: 0, receitas: 0, itens: [] });
  an.forEach(a => { if (diasPresente(a, ini, fim) > 0) R(a.id); });
  const noPer = (d) => d && d >= ini && d <= fim;
  DB.list('financeiro').filter(f => noPer(f.data) && !f.negocioId).forEach(f => { // compra/venda = investimento, fica no módulo Compra e Venda
    const v = Number(f.valor) || 0;
    if (f.animalId) {
      const r = R(f.animalId);
      if (f.tipo === 'Receita') { r.receitas += v; r.itens.push({ data: f.data, origem: 'Receita', desc: f.descricao, v }); }
      else { r.diretos += v; r.itens.push({ data: f.data, origem: 'Despesa direta', desc: f.descricao, v: -v }); }
    } else if (f.tipo === 'Despesa' && f.rateio !== 'Não ratear') {
      const esc_ = f.rateio || 'Todos os animais';
      const el = an.filter(a => presente(a, f.data) && (esc_ === 'Todos os animais' || (esc_ === 'Somente pensão') === (a.posse === 'Pensão')));
      const W = el.reduce((s, a) => s + (Number(a.pesoRateio) || 1), 0); if (!W) return;
      el.forEach(a => { const parte = v * (Number(a.pesoRateio) || 1) / W; const r = R(a.id); r.rateio += parte; r.itens.push({ data: f.data, origem: 'Rateio (' + esc_ + ')', desc: f.descricao, v: -parte }); });
    }
  });
  DB.list('sanidade').filter(x => noPer(x.data) && Number(x.custo)).forEach(x => { const r = R(x.animalId); r.diretos += Number(x.custo); r.itens.push({ data: x.data, origem: 'Sanidade', desc: x.tipo + ' – ' + x.produto, v: -Number(x.custo) }); });
  return out;
}
const PERIODOS = { 'Mês atual': () => [today().slice(0, 7) + '-01', today()], 'Mês anterior': () => { const d = new Date(); d.setDate(0); const f = d.toISOString().slice(0, 10); return [f.slice(0, 8) + '01', f]; }, 'Últimos 3 meses': () => [today(-90), today()], 'Ano atual': () => [today().slice(0, 4) + '-01-01', today()], 'Últimos 12 meses': () => [today(-365), today()] };

V.custos = () => {
  if (!state.cIni) [state.cIni, state.cFim] = PERIODOS['Mês atual']();
  const ini = state.cIni, fim = state.cFim, C = calcCustos(ini, fim), tab = state.ctab || 'criacao';
  const meses = Math.max(diasPresente({ dataEntrada: ini }, ini, fim) / 30.44, 0.0001);
  const linhas = (filtro) => Object.entries(C).map(([id, c]) => ({ a: animal(id), ...c, custo: c.diretos + c.rateio })).filter(x => x.a && filtro(x.a));
  const res = (v) => `<b style="color:${v >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(v)}</b>`;
  const head = `<div class="card row noprint"><label style="margin:0">Período</label><input type="date" value="${ini}" onchange="state.cIni=this.value;render()" style="max-width:160px"> até <input type="date" value="${fim}" onchange="state.cFim=this.value;render()" style="max-width:160px">
    ${Object.keys(PERIODOS).map(k => `<button class="sec" onclick="[state.cIni,state.cFim]=PERIODOS['${k}']();render()">${k}</button>`).join('')}</div>
    <div class="tabs">${[['criacao', 'Criação: patrimônio e custos'], ['pensao', 'Pensão: custo × cobrado'], ['clientes', 'Por cliente'], ['geral', 'Visão geral']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" onclick="state.ctab='${k}';render()">${l}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'pensao') {
    const L = linhas(a => a.posse === 'Pensão');
    const cob = L.reduce((s, x) => s + x.receitas, 0), cus = L.reduce((s, x) => s + x.custo, 0);
    const pend = DB.list('financeiro').filter(f => f.status === 'Pendente' && f.tipo === 'Receita' && animal(f.animalId)?.posse === 'Pensão');
    body = `<div class="kpis"><div class="kpi"><small>Cavalos de pensão</small><b>${L.length}</b></div><div class="kpi"><small>Valor cobrado no período</small><b style="color:var(--ok)">${brl(cob)}</b></div><div class="kpi"><small>Custo no período</small><b style="color:var(--bad)">${brl(cus)}</b></div><div class="kpi"><small>Lucro / prejuízo da pensão</small><b style="color:${cob - cus >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(cob - cus)}</b><small>Margem: ${cob ? Math.round((cob - cus) / cob * 100) : 0}%</small></div></div>
    ${pend.length ? `<div class="card"><span class="tag bad">${pend.length} cobrança(s) em aberto: ${brl(pend.reduce((s, f) => s + Number(f.valor), 0))}</span> <a href="#financeiro">ver no financeiro</a></div>` : ''}
    <div class="card"><h3>Resultado por cavalo de pensão</h3>${table([
      ['Cavalo', x => `<a href="#" onclick="location.hash='animais';setTimeout(()=>{state.animalId='${x.a.id}';state.tab='financeiro';render()});return false"><b>${esc(x.a.nome)}</b></a>`], ['Proprietário', x => esc(x.a.proprietario)],
      ['Dias', x => x.dias], ['Pensão mensal', x => brl(x.a.valorPensao)], ['Cobrado (pensão + extras)', x => brl(x.receitas)],
      ['Custo direto', x => brl(x.diretos)], ['Rateio', x => brl(x.rateio)], ['Custo total', x => brl(x.custo)], ['Custo/mês', x => brl(x.custo / Math.max(x.dias / 30.44, 0.0001))],
      ['Resultado', x => res(x.receitas - x.custo)],
    ], L)}<p class="muted"><b>Custo/mês</b> mostra quanto cada cavalo custa por mês: compare com a pensão cobrada para saber se o preço cobre o custo.</p></div>`;
  }
  if (tab === 'clientes') {
    const by = {}; linhas(a => a.posse === 'Pensão').forEach(x => { const k = x.a.proprietario || 'Sem proprietário'; by[k] = by[k] || { n: 0, r: 0, c: 0, p: 0 }; by[k].n++; by[k].r += x.receitas; by[k].c += x.custo; });
    DB.list('financeiro').filter(f => f.status === 'Pendente' && f.tipo === 'Receita' && animal(f.animalId)?.posse === 'Pensão').forEach(f => { const k = animal(f.animalId).proprietario || 'Sem proprietário'; by[k] = by[k] || { n: 0, r: 0, c: 0, p: 0 }; by[k].p += Number(f.valor); });
    body = `<div class="card">${table([['Cliente', ([k]) => `<b>${esc(k)}</b>`], ['Cavalos', ([, v]) => v.n], ['Cobrado', ([, v]) => brl(v.r)], ['Custo', ([, v]) => brl(v.c)], ['Resultado', ([, v]) => res(v.r - v.c)], ['Em aberto', ([, v]) => v.p ? `<span class="tag bad">${brl(v.p)}</span>` : '<span class="tag ok">Em dia</span>']], Object.entries(by))}</div>`;
  }
  if (tab === 'criacao') {
    const L = linhas(a => a.posse !== 'Pensão');
    const tot = L.reduce((s, x) => s + x.custo, 0), rec = L.reduce((s, x) => s + x.receitas, 0);
    const porCat = {}; L.forEach(x => { const k = x.a.categoria || 'Sem categoria'; porCat[k] = porCat[k] || { n: 0, c: 0 }; porCat[k].n++; porCat[k].c += x.custo; });
    body = blocoPatrimonio() + `<div class="kpis"><div class="kpi"><small>Animais de criação</small><b>${L.length}</b></div><div class="kpi"><small>Custo total no período</small><b style="color:var(--bad)">${brl(tot)}</b></div><div class="kpi"><small>Custo médio por animal/mês</small><b>${brl(tot / Math.max(L.length, 1) / meses)}</b></div><div class="kpi"><small>Receitas ligadas aos animais (coberturas etc.)</small><b style="color:var(--ok)">${brl(rec)}</b></div></div>
    <div class="card"><h3>Custo por categoria</h3>${table([['Categoria', ([k]) => esc(k)], ['Animais', ([, v]) => v.n], ['Custo no período', ([, v]) => brl(v.c)], ['Custo médio/animal/mês', ([, v]) => brl(v.c / v.n / meses)]], Object.entries(porCat))}</div>
    <div class="card"><h3>Custo por animal</h3>${table([
      ['Animal', x => `<a href="#" onclick="location.hash='animais';setTimeout(()=>{state.animalId='${x.a.id}';state.tab='financeiro';render()});return false"><b>${esc(x.a.nome)}</b></a>`], ['Categoria', x => esc(x.a.categoria)],
      ['Custo direto', x => brl(x.diretos)], ['Rateio', x => brl(x.rateio)], ['Custo total', x => brl(x.custo)], ['Custo/mês', x => brl(x.custo / Math.max(x.dias / 30.44, 0.0001))],
      ['Custo acumulado (desde a entrada)', x => { const t = calcCustos(x.a.dataEntrada || x.a.nascimento || '2000-01-01', today())[x.a.id]; return t ? brl(t.diretos + t.rateio) : '—'; }],
      ['Receitas', x => brl(x.receitas)], ['Resultado', x => res(x.receitas - x.custo)],
    ], L.sort((p, q) => q.custo - p.custo))}<p class="muted">O <b>custo acumulado</b> ajuda a definir o preço mínimo de venda de cada potro.</p></div>`;
  }
  if (tab === 'geral') {
    const fin = DB.list('financeiro').filter(f => f.data >= ini && f.data <= fim);
    const s = (fn) => fin.filter(fn).reduce((t, f) => t + Number(f.valor), 0);
    const P = linhas(a => a.posse === 'Pensão'), Cr = linhas(a => a.posse !== 'Pensão');
    const naoRat = s(f => f.tipo === 'Despesa' && !f.animalId && f.rateio === 'Não ratear');
    const neg = (t) => fin.filter(f => f.negocioId && f.tipo === t).reduce((a, f) => a + Number(f.valor), 0);
    const rows = [['Pensão', P.reduce((t, x) => t + x.receitas, 0), P.reduce((t, x) => t + x.custo, 0)], ['Criação', Cr.reduce((t, x) => t + x.receitas, 0), Cr.reduce((t, x) => t + x.custo, 0)], ['Receitas sem animal / despesas não rateadas', s(f => f.tipo === 'Receita' && !f.animalId), naoRat], ['Compra e venda de animais (nossa parte)', neg('Receita'), neg('Despesa')]];
    const R_ = rows.reduce((t, r) => t + r[1], 0), D_ = rows.reduce((t, r) => t + r[2], 0);
    body = `<div class="card"><h3>Resultado do haras no período</h3>${table([['Atividade', r => `<b>${r[0]}</b>`], ['Receitas', r => brl(r[1])], ['Custos', r => brl(r[2])], ['Resultado', r => res(r[1] - r[2])]], rows.concat([['TOTAL', R_, D_]]))}
    <p class="muted">Como os custos são calculados: despesas lançadas <b>com animal</b> e custos do prontuário sanitário são <b>custos diretos</b>. Despesas <b>sem animal</b> (ração, salários, energia, instalações...) são <b>rateadas</b> entre os animais presentes na data, conforme a opção escolhida no lançamento e o <b>peso no rateio</b> de cada animal (ex.: potro = 0,5). Atenção: se o custo de uma vacina já está no prontuário sanitário, não lance de novo no financeiro com o mesmo animal, para não contar em dobro.</p></div>`;
  }
  return head + body;
};
window.gerarCobrancas = () => {
  const mes = today().slice(0, 7); const P = DB.list('animais').filter(a => a.posse === 'Pensão' && presente(a, today()) && Number(a.valorPensao));
  const ja = new Set(DB.list('financeiro').filter(f => f.centro === 'Pensão' && f.tipo === 'Receita' && f.data.startsWith(mes) && /^Pensão/.test(f.descricao)).map(f => f.animalId));
  const novos = P.filter(a => !ja.has(a.id));
  if (!novos.length) return alert('Todas as pensões deste mês já foram lançadas.');
  if (!confirm(`Gerar ${novos.length} cobrança(s) de pensão de ${mes.slice(5)}/${mes.slice(0, 4)}?`)) return;
  novos.forEach(a => DB.upsert('financeiro', { tipo: 'Receita', data: today(), descricao: 'Pensão - ' + a.nome, valor: Number(a.valorPensao), centro: 'Pensão', animalId: a.id, contraparte: a.proprietario, status: 'Pendente' }));
  render();
};
window.cobrarExtra = () => openForm('Cobrar serviço extra do proprietário', [
  { k: 'animalId', l: 'Cavalo de pensão', t: 'animal', opts: () => animalOpts(a => a.posse === 'Pensão'), req: true }, { k: 'descricao', l: 'Serviço (ferrageamento, veterinário, medicamento...)', req: true },
  { k: 'custo', l: 'Quanto custou para você (R$)', t: 'number' }, { k: 'valor', l: 'Quanto vai cobrar do proprietário (R$)', t: 'number', req: true }, { k: 'data', l: 'Data', t: 'date', req: true }],
  { data: today() }, o => {
    const a = animal(o.animalId);
    if (o.custo) DB.upsert('financeiro', { tipo: 'Despesa', data: o.data, descricao: o.descricao + ' - ' + a.nome, valor: o.custo, centro: 'Pensão', animalId: a.id, status: 'Pago' });
    DB.upsert('financeiro', { tipo: 'Receita', data: o.data, descricao: 'Extra: ' + o.descricao + ' - ' + a.nome, valor: o.valor, centro: 'Pensão', animalId: a.id, contraparte: a.proprietario, status: 'Pendente' });
  });

// ---------- Patrimônio: valor estimado dos animais de criação (só a nossa parte) ----------
function patrimonio() {
  const eu = socioProprio();
  const L = DB.list('animais').filter(a => a.status === 'Ativo' && a.posse !== 'Pensão').map(a => {
    const nossa = eu ? (composicao(a.id)[eu.id] ?? 0) : 100;
    const compra = DB.list('negocios').filter(n => n.animalId === a.id && n.tipo === 'Compra' && (!n.produto || n.produto === 'Animal')).reduce((t, n) => t + Number(n.valor) * ((n.participacoes || []).find(p => p.socioId === eu?.id)?.pct ?? 100) / 100, 0);
    const v = Number(a.valorEstimado) || 0;
    return { a, nossa: Math.max(nossa, 0), valor: v, parte: v * Math.max(nossa, 0) / 100, compra };
  }).filter(x => x.nossa > 0.001);
  const total = L.reduce((t, x) => t + x.parte, 0), invest = L.reduce((t, x) => t + x.compra, 0);
  return { L, total, invest, semValor: L.filter(x => !x.valor) };
}
window.editarValor = (id) => {
  const a = animal(id), v = prompt(`Valor estimado de ${a.nome} (animal inteiro, em R$):`, a.valorEstimado || '');
  if (v === null) return; const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  if (isNaN(n)) return alert('Valor inválido.'); DB.upsert('animais', { ...a, valorEstimado: n || '' }); render();
};
function blocoPatrimonio() {
  const P = patrimonio(), porCat = {};
  P.L.forEach(x => { const k = x.a.categoria || 'Sem categoria'; porCat[k] = porCat[k] || { n: 0, v: 0 }; porCat[k].n++; porCat[k].v += x.parte; });
  return `<div class="card" style="border-color:var(--brand2)"><h3>💎 Patrimônio em animais de criação (estimativa)</h3>
    <div class="kpis"><div class="kpi"><small>Valor estimado total (nossa parte)</small><b style="color:var(--ok)">${brl(P.total)}</b><small>${P.L.length} animais</small></div>
      <div class="kpi"><small>Investido na compra (nossa parte)</small><b>${brl(P.invest)}</b></div>
      <div class="kpi"><small>Animais sem valor estimado</small><b style="color:${P.semValor.length ? 'var(--warn)' : 'inherit'}">${P.semValor.length}</b><small>${P.semValor.length ? 'preencha para a estimativa ficar completa' : 'todos avaliados'}</small></div></div>
    ${table([['Categoria', ([k]) => esc(k)], ['Animais', ([, v]) => v.n], ['Valor (nossa parte)', ([, v]) => brl(v.v)], ['% do total', ([, v]) => P.total ? Math.round(v.v / P.total * 100) + '%' : '—']], Object.entries(porCat).sort((a, b) => b[1].v - a[1].v))}
    <details style="margin-top:10px"><summary style="cursor:pointer"><b>Ver animal por animal</b></summary>${table([
      ['Animal', x => `<b>${esc(x.a.nome)}</b><br><small class="muted">${esc(x.a.categoria || '')}${x.a.nascimento ? ' · ' + idade(x.a.nascimento) : ''}</small>`],
      ['Valor estimado', x => x.valor ? brl(x.valor) : '<span class="tag warn">sem valor</span>'], ['Nossa %', x => pct(x.nossa)], ['Nossa parte', x => `<b>${brl(x.parte)}</b>`],
      ['Compra', x => x.compra ? brl(x.compra) : '—'], ['Valorização', x => x.compra && x.valor ? (() => { const d = x.parte - x.compra; return `<span style="color:${d >= 0 ? 'var(--ok)' : 'var(--bad)'}">${d >= 0 ? '+' : ''}${brl(d)}</span>`; })() : '—'],
    ], P.L.sort((a, b) => b.parte - a.parte), x => `<button class="lnk" onclick="editarValor('${x.a.id}')">Alterar valor</button>`)}</details>
    <p class="muted">Soma do <b>valor atual estimado</b> de cada animal ativo de criação (cadastro do animal), multiplicado pela participação do haras. Animais de pensão não entram.</p></div>`;
}

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
  <div class="card"><h3>Importar do sistema anterior (arquivo .db)</h3><p class="muted">Envie o backup do app de controle de criação (arquivo <b>.db</b>). Animais, coberturas, sanidade, compras/vendas e parcelas são trazidos. Pode importar de novo sempre que quiser: os registros já importados são <b>atualizados</b>, sem duplicar.</p>
  <label class="btn" style="margin:0;color:#fff;font-size:14px">Escolher arquivo .db<input type="file" accept=".db,.sqlite,.sqlite3" hidden onchange="importarDb(this.files[0])"></label> <span id="impStatus" class="muted"></span></div>
  <div class="card"><h3>Zona de risco</h3><div class="row"><button class="sec" onclick="if(confirm('Recarregar dados de demonstração? Os dados atuais serão perdidos.')){DB.reset();render()}">Restaurar dados de demonstração</button><button class="sec" style="color:var(--bad)" onclick="if(confirm('Apagar TODOS os dados?')){DB.clear();render()}">Começar do zero</button></div></div>`;
window.importar = (f) => { const r = new FileReader(); r.onload = () => { try { DB.data = JSON.parse(r.result); DB.save(); alert('Backup importado!'); render(); } catch (e) { alert('Arquivo inválido.'); } }; r.readAsText(f); };

// ---------- Compra e Venda com sociedade ----------
// negocios: { tipo:'Compra'|'Venda', animalId, data, contraparte, valor (valor total da fração negociada), pctAnimal (% do animal negociado),
//             participacoes:[{socioId,pct}] (somam 100% do negócio), parcelas, primeiroVenc, comissaoPct, intermediario, obs }
const socio = (id) => DB.get('socios', id);
const sname = (id) => socio(id)?.nome || '?';
const socioProprio = () => DB.list('socios').find(s => s.proprio === 'Sim');
const pct = (v) => (Math.round(Number(v) * 100) / 100).toLocaleString('pt-BR') + '%';

// Composição societária atual de um animal (em % do animal), a partir do histórico de negócios
const negLabel = (n) => (n.produto && n.produto !== 'Animal') ? `${n.produto}${n.quantidade > 1 ? ' ×' + n.quantidade : ''}: ${aname(n.doadoraId) || '?'}${n.garanhaoId || n.garanhaoExterno ? ' × ' + (aname(n.garanhaoId) || n.garanhaoExterno) : ''}` : aname(n.animalId);
function composicao(animalId, ate = '9999-12-31') {
  const c = {}, ns = DB.list('negocios').filter(n => n.animalId === animalId && (!n.produto || n.produto === 'Animal'));
  // animal sem compra registrada (nascido no haras, por exemplo) começa 100% nosso
  const eu = socioProprio(), an = animal(animalId);
  if (eu && an && an.status !== 'Externo' && an.posse !== 'Pensão' && !ns.some(n => n.tipo === 'Compra')) c[eu.id] = 100;
  DB.list('negocios').filter(n => n.animalId === animalId && (!n.produto || n.produto === 'Animal') && n.data <= ate).sort((a, b) => a.data.localeCompare(b.data)).forEach(n => {
    (n.participacoes || []).forEach(p => { const fr = Number(n.pctAnimal || 100) * Number(p.pct) / 100; c[p.socioId] = (c[p.socioId] || 0) + (n.tipo === 'Compra' ? fr : -fr); });
  });
  Object.keys(c).forEach(k => { if (Math.abs(c[k]) < 0.001) delete c[k]; });
  return c;
}
const valorLiquido = (n) => Number(n.valor) * (1 - (Number(n.comissaoPct) || 0) / 100);

function lancarFinanceiro(n) {
  // remove lançamentos anteriores deste negócio e recria só a parte do haras (sócio "proprio")
  DB.data.financeiro = DB.list('financeiro').filter(f => f.negocioId !== n.id);
  const eu = socioProprio(); const p = (n.participacoes || []).find(x => x.socioId === eu?.id);
  if (p && Number(p.pct)) {
    const total = (n.tipo === 'Venda' ? valorLiquido(n) : Number(n.valor)) * Number(p.pct) / 100;
    const fator = Number(p.pct) / 100 * (n.tipo === 'Venda' ? 1 - (Number(n.comissaoPct) || 0) / 100 : 1);
    if (n.parcelasLista && n.parcelasLista.length) {
      const np = n.parcelasLista.length;
      n.parcelasLista.forEach((q, i) => DB.data.financeiro.push({ id: n.id + '-p' + i, negocioId: n.id, parcelaIdx: i, tipo: n.tipo === 'Venda' ? 'Receita' : 'Despesa', data: q.vencimento, descricao: `${n.tipo} ${negLabel(n)}` + (Number(p.pct) !== 100 ? ` (${pct(p.pct)} do negócio)` : '') + (np > 1 ? ` – parcela ${q.numero || i + 1}/${np}` : ''), valor: Math.round(Number(q.valor) * fator * 100) / 100, centro: n.tipo === 'Venda' ? 'Vendas' : 'Compra de animais', animalId: n.animalId || n.doadoraId, contraparte: n.contraparte, forma: q.forma, status: q.pagoEm ? 'Pago' : 'Pendente', pagoEm: q.pagoEm || '' }));
    } else {
    const np = Math.max(1, Number(n.parcelas) || 1);
    for (let i = 0; i < np; i++) {
      const venc = addMonths(n.primeiroVenc || n.data, i);
      DB.data.financeiro.push({ id: n.id + '-p' + i, negocioId: n.id, tipo: n.tipo === 'Venda' ? 'Receita' : 'Despesa', data: venc, descricao: `${n.tipo} ${negLabel(n)} (${pct(p.pct)} do negócio)` + (np > 1 ? ` – parcela ${i + 1}/${np}` : ''), valor: Math.round(total / np * 100) / 100, centro: n.tipo === 'Venda' ? 'Vendas' : 'Compra de animais', animalId: n.animalId, contraparte: n.contraparte, status: venc <= today() && n.quitado !== 'Não' ? 'Pago' : 'Pendente' });
    }
    }
  }
  if (!DB.data.centrosCusto.includes('Compra de animais')) DB.data.centrosCusto.push('Compra de animais');
  DB.save();
}
function addMonths(d, m) { const x = new Date(d + 'T00:00'); x.setMonth(x.getMonth() + m); return x.toISOString().slice(0, 10); }

function gerarParcelas(plano) { const out = []; plano.forEach(g => { for (let k = 0; k < g.qtd; k++) out.push({ numero: out.length + 1, vencimento: addMonths(g.inicio, k), valor: g.valor, forma: g.forma, pagoEm: '' }); }); return out; }
const FORMAS = ['PIX', 'Boleto', 'Transferência', 'Cheque', 'Promissória', 'Cartão', 'Dinheiro', 'Permuta'];
window.editNegocio = (id, tipoPadrao, extra) => {
  const n = id ? JSON.parse(JSON.stringify(DB.get('negocios', id))) : { tipo: tipoPadrao || 'Compra', produto: 'Animal', data: today(), pctAnimal: 100, comissaoPct: 0, participacoes: socioProprio() ? [{ socioId: socioProprio().id, pct: 100 }] : [], ...(extra || {}) };
  const planoIni = n.plano && n.plano.length ? n.plano : [{ qtd: Number(n.parcelas) || 1, valor: n.valor ? Math.round(n.valor / (Number(n.parcelas) || 1) * 100) / 100 : '', forma: 'PIX', inicio: n.primeiroVenc || n.data }];
  const linhaGrupo = (g, i) => `<div class="row grp" style="margin-bottom:6px;flex-wrap:wrap"><input type="number" min="1" step="1" data-k="qtd" value="${g.qtd || 1}" style="max-width:80px" title="Nº de parcelas"> × <input type="number" step="any" data-k="valor" value="${g.valor ?? ''}" placeholder="valor de cada" style="max-width:150px"> <select data-k="forma" style="max-width:150px">${FORMAS.map(f => `<option ${f === g.forma ? 'selected' : ''}>${f}</option>`).join('')}</select> 1º venc. <input type="date" data-k="inicio" value="${g.inicio || today()}" style="max-width:170px">${i > 0 ? '<button type="button" class="del" onclick="this.parentNode.remove();window._negCalc()">✕</button>' : ''}</div>`;
  const m = document.createElement('div'); m.className = 'modal';
  const socOpts = (sel) => DB.list('socios').map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.nome)}</option>`).join('');
  const linhaSoc = (p = {}) => `<div class="row soc" style="margin-bottom:6px"><select style="flex:2">${socOpts(p.socioId)}</select><input type="number" step="any" placeholder="%" value="${p.pct ?? ''}" style="flex:1;max-width:110px"><span class="muted vl" style="min-width:120px"></span><button type="button" class="del" onclick="this.parentNode.remove();window._negCalc()">✕</button></div>`;
  m.innerHTML = `<form class="box"><div class="top"><h3 style="margin:0">${id ? 'Editar' : 'Nova'} ${n.tipo === 'Venda' ? 'venda' : 'compra'}</h3><button type="button" class="sec" data-x>Fechar</button></div>
    <div class="grid">
      ${field({ k: 'tipo', l: 'Tipo', t: 'select', opts: ['Compra', 'Venda'], req: true }, n.tipo)}
      ${field({ k: 'produto', l: 'O que foi negociado', t: 'select', opts: ['Animal', 'Embrião', 'Sêmen', 'Outro'] }, n.produto || 'Animal')}
      ${field({ k: 'doadoraId', l: 'Embrião: doadora', t: 'animal', opts: () => animalOpts(a => a.sexo === 'Fêmea') }, n.doadoraId)}
      ${field({ k: 'garanhaoId', l: 'Embrião/sêmen: garanhão', t: 'animal', opts: () => animalOpts(a => a.sexo !== 'Fêmea') }, n.garanhaoId)}
      ${field({ k: 'quantidade', l: 'Quantidade', t: 'number' }, n.quantidade || 1)}
      <div><label>Animal *</label><select id="f_animalId"><option value="">— ${n.tipo === 'Compra' ? 'novo animal (preencha o nome ao lado)' : 'selecione'} —</option>${animalOpts().map(([v, l]) => `<option value="${v}" ${v === n.animalId ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      ${id ? '' : field({ k: 'novoNome', l: 'Nome do animal novo (se não cadastrado)' }, '')}
      ${field({ k: 'data', l: 'Data do negócio', t: 'date', req: true }, n.data)}
      ${field({ k: 'contraparte', l: n.tipo === 'Venda' ? 'Comprador' : 'Vendedor' }, n.contraparte)}
      ${field({ k: 'pctAnimal', l: '% do animal negociado (100 = animal inteiro)', t: 'number', req: true }, n.pctAnimal)}
      ${field({ k: 'comissaoPct', l: 'Comissão / corretagem (%)', t: 'number' }, n.comissaoPct)}
      ${field({ k: 'intermediario', l: 'Corretor / leilão' }, n.intermediario)}
      <div class="full"><label>Condições de pagamento (ex.: 1 × 15.000 PIX de entrada + 40 × 1.100 boleto)</label><div id="grupos">${planoIni.map(linhaGrupo).join('')}</div>
        <div class="row"><button type="button" class="sec" id="addGrupo">+ Condição</button><b id="totalPlano"></b></div>
        ${id ? (n.parcelasLista || []).some(q => q.pagoEm) ? '<p class="muted">Se mudar as condições, as parcelas são refeitas; as que já estão pagas continuam pagas.</p>' : '' : `<label style="margin-top:8px"><input type="checkbox" id="f_quitarVencidas" style="width:auto"> Marcar como pagas as parcelas já vencidas (para lançar negócios antigos)</label>`}</div>
      <div class="full"><label>Sociedade: participação de cada sócio neste negócio (deve somar 100%)</label><div id="socs">${(n.participacoes.length ? n.participacoes : [{}]).map(linhaSoc).join('')}</div>
        <div class="row"><button type="button" class="sec" id="addSoc">+ Sócio</button><button type="button" class="lnk" onclick="novoSocio(()=>{})">Cadastrar novo sócio</button><b id="somaPct"></b></div>
        <p class="muted" id="sugestao"></p></div>
      ${field({ k: 'obs', l: 'Observações', t: 'textarea', full: true }, n.obs)}
    </div><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" class="sec" data-x>Cancelar</button><button type="submit">Salvar</button></div></form>`;
  document.body.appendChild(m);
  m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => m.remove());
  $('#addSoc', m).onclick = () => { $('#socs', m).insertAdjacentHTML('beforeend', linhaSoc()); window._negCalc(); };
  const lerPlano = () => [...m.querySelectorAll('.grp')].map(r => { const v = k => r.querySelector(`[data-k="${k}"]`).value; return { qtd: parseInt(v('qtd')) || 0, valor: Number(v('valor')) || 0, forma: v('forma'), inicio: v('inicio') }; });
  $('#addGrupo', m).onclick = () => { const p = lerPlano(), u = p[p.length - 1]; $('#grupos', m).insertAdjacentHTML('beforeend', linhaGrupo({ qtd: 1, valor: '', forma: u?.forma || 'PIX', inicio: u?.inicio ? addMonths(u.inicio, u.qtd || 1) : today() }, 1)); window._negCalc(); };
  window._negCalc = () => {
    const plano = lerPlano(), v = plano.reduce((t, g) => t + g.qtd * g.valor, 0), nq = plano.reduce((t, g) => t + g.qtd, 0);
    $('#totalPlano', m).textContent = ` Total: ${brl(v)} em ${nq} parcela(s)`;
    const liq = v * (1 - (Number($('#f_comissaoPct', m).value) || 0) / 100); let s = 0;
    m.querySelectorAll('.soc').forEach(r => { const p = Number(r.querySelector('input').value) || 0; s += p; r.querySelector('.vl').textContent = brl(liq * p / 100); });
    $('#somaPct', m).innerHTML = ` Soma: <span style="color:${Math.abs(s - 100) < 0.01 ? 'var(--ok)' : 'var(--bad)'}">${pct(s)}</span>`;
    const aid = $('#f_animalId', m).value, isVenda = $('#f_tipo', m).value === 'Venda';
    const prodAnimal = $('#f_produto', m).value === 'Animal';
    const nn = $('#f_novoNome', m); if (nn) nn.parentNode.style.display = isVenda || !prodAnimal ? 'none' : '';
    ['doadoraId', 'garanhaoId', 'quantidade'].forEach(k => $('#f_' + k, m).parentNode.style.display = prodAnimal ? 'none' : '');
    $('#f_animalId', m).parentNode.style.display = prodAnimal ? '' : 'none';
    let html = '';
    if (isVenda && aid) { const c = composicao(aid); html = 'Composição atual do animal: ' + (Object.entries(c).map(([k, v]) => `${esc(sname(k))} ${pct(v)}`).join(' · ') || 'sem sociedade registrada') + (Object.keys(c).length ? ` <button type="button" class="lnk" id="usarComp">usar esta divisão</button>` : ''); }
    if ($('#sugestao', m).innerHTML !== html) $('#sugestao', m).innerHTML = html;
  };
  const usarComp = () => {
    const c = composicao($('#f_animalId', m).value), tot = Object.values(c).reduce((a, b) => a + b, 0); if (!tot) return;
    $('#socs', m).innerHTML = Object.entries(c).map(([k, v]) => linhaSoc({ socioId: k, pct: Math.round(v / tot * 10000) / 100 })).join('');
    $('#f_pctAnimal', m).value = Math.round(tot * 100) / 100; window._negCalc();
  };
  m.addEventListener('click', e => { if (e.target.id === 'usarComp') usarComp(); });
  // numa venda nova, ao escolher o animal já preenche a divisão pela composição atual
  $('#f_animalId', m).addEventListener('change', () => { if (!id && $('#f_tipo', m).value === 'Venda') usarComp(); });
  m.addEventListener('input', window._negCalc); m.addEventListener('change', window._negCalc); window._negCalc();
  if (!id && n.tipo === 'Venda' && n.animalId) usarComp();
  m.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const g = (k) => $('#f_' + k, m)?.value ?? '';
    const parts = [...m.querySelectorAll('.soc')].map(r => ({ socioId: r.querySelector('select').value, pct: Number(r.querySelector('input').value) || 0 })).filter(p => p.socioId && p.pct);
    const soma = parts.reduce((a, p) => a + p.pct, 0);
    if (Math.abs(soma - 100) > 0.01) return alert(`A participação dos sócios precisa somar 100% (está em ${pct(soma)}).`);
    let animalId = g('animalId');
    if (!animalId && g('novoNome') && g('tipo') === 'Compra') animalId = DB.upsert('animais', { nome: g('novoNome'), sexo: 'Macho', status: 'Ativo', posse: 'Próprio', pesoRateio: 1, dataEntrada: g('data'), aVenda: 'Não' }).id;
    const produto = g('produto');
    if (produto !== 'Animal') animalId = '';
    else if (!animalId) return alert('Selecione o animal (ou informe o nome do animal novo, na compra).');
    const plano = lerPlano();
    if (plano.some(gr => gr.qtd < 1 || !gr.inicio || !gr.valor)) return alert('Confira as condições de pagamento (quantidade, valor e 1º vencimento).');
    const valorTotal = Math.round(plano.reduce((t, gr) => t + gr.qtd * gr.valor, 0) * 100) / 100;
    let parcelasLista = n.parcelasLista;
    if (!parcelasLista || JSON.stringify(plano) !== JSON.stringify(n.plano || null)) {
      const antigas = n.parcelasLista || [];
      parcelasLista = gerarParcelas(plano).map((q, i) => ({ ...q, pagoEm: antigas[i]?.pagoEm || ($('#f_quitarVencidas', m)?.checked && q.vencimento <= today() ? q.vencimento : '') }));
    }
    const o = { ...n, tipo: g('tipo'), produto, doadoraId: g('doadoraId'), garanhaoId: g('garanhaoId'), quantidade: Number(g('quantidade')) || 1, animalId, data: g('data'), contraparte: g('contraparte'), pctAnimal: Number(g('pctAnimal')) || 100, valor: valorTotal, comissaoPct: Number(g('comissaoPct')) || 0, intermediario: g('intermediario'), plano, parcelasLista, parcelas: parcelasLista.length, primeiroVenc: parcelasLista[0]?.vencimento || g('data'), participacoes: parts, obs: g('obs') };
    DB.upsert('negocios', o); lancarFinanceiro(o);
    // movimentação e situação do animal
    if (!animalId) { m.remove(); render(); return; }
    const a = animal(animalId), restante = Object.values(composicao(animalId)).reduce((x, y) => x + y, 0);
    if (o.tipo === 'Compra' && !DB.list('movimentacoes').some(x => x.negocioId === o.id)) DB.upsert('movimentacoes', { animalId, tipo: 'Entrada', data: o.data, motivo: 'Compra', origemDestino: o.contraparte, negocioId: o.id });
    if (o.tipo === 'Venda' && restante <= 0.01) { DB.upsert('animais', { ...a, status: 'Vendido', aVenda: 'Não', dataSaida: o.data }); if (!DB.list('movimentacoes').some(x => x.negocioId === o.id)) DB.upsert('movimentacoes', { animalId, tipo: 'Saída', data: o.data, motivo: 'Venda', origemDestino: o.contraparte, negocioId: o.id }); }
    m.remove(); render();
  };
};
window.novoSocio = (cb, id) => openForm(id ? 'Editar sócio' : 'Novo sócio', [{ k: 'nome', l: 'Nome', req: true }, { k: 'telefone', l: 'Telefone' }, { k: 'documento', l: 'CPF / CNPJ' }, { k: 'proprio', l: 'É o próprio haras (nós)?', t: 'select', opts: ['Não', 'Sim'] }, { k: 'obs', l: 'Observações', t: 'textarea', full: true }],
  id ? socio(id) : { proprio: 'Não' }, o => { if (o.proprio === 'Sim') DB.list('socios').forEach(s => { if (s.id !== o.id) s.proprio = 'Não'; }); DB.upsert('socios', o); DB.list('negocios').forEach(lancarFinanceiro); cb && cb(); });
window.delNegocio = (id) => { if (!confirm('Excluir este negócio e seus lançamentos financeiros?')) return; DB.data.financeiro = DB.list('financeiro').filter(f => f.negocioId !== id); DB.data.movimentacoes = DB.list('movimentacoes').filter(f => f.negocioId !== id); DB.remove('negocios', id); render(); };

// ---------- Agenda de parcelas (fluxo de caixa de compra e venda, pela nossa parte) ----------
function agendaParcelas() {
  const tipo = state.agTipo || 'todos', sit = state.agSit || 'aberto', per = state.agPer || '6';
  const hoje = today(), negSel = state.agNeg && DB.get('negocios', state.agNeg);
  const fimPer = per === 'tudo' ? '9999-12-31' : addMonths(hoje.slice(0, 7) + '-01', Number(per)).slice(0, 10);
  let L = DB.list('financeiro').filter(f => f.negocioId && DB.get('negocios', f.negocioId));
  if (negSel) L = L.filter(f => f.negocioId === negSel.id);
  L = L.filter(f => tipo === 'todos' || (tipo === 'pagar' ? f.tipo === 'Despesa' : f.tipo === 'Receita'))
    .filter(f => sit === 'todas' || (sit === 'aberto' ? f.status !== 'Pago' : sit === 'atrasadas' ? f.status !== 'Pago' && f.data < hoje : f.status === 'Pago'))
    .filter(f => negSel || sit === 'pagas' || sit === 'atrasadas' || f.data < fimPer)
    .sort((a, b) => a.data.localeCompare(b.data));
  const neg = f => DB.get('negocios', f.negocioId) || {};
  const parc = f => { const n = neg(f), tot = (n.parcelasLista || []).length; return tot > 1 ? `${(f.parcelaIdx ?? 0) + 1}/${tot}` : 'única'; };
  const meses = {}; L.forEach(f => { const m = f.data.slice(0, 7); meses[m] = meses[m] || { r: 0, p: 0, n: 0 }; meses[m][f.tipo === 'Receita' ? 'r' : 'p'] += Number(f.valor); meses[m].n++; });
  let acum = 0; const resumo = Object.entries(meses).sort().map(([m, v]) => { acum += v.r - v.p; return { m, ...v, acum }; });
  const nomeMes = m => new Date(m + '-15T12:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
  const soma = t => L.filter(f => f.tipo === t).reduce((a, f) => a + Number(f.valor), 0);
  const atrasadas = DB.list('financeiro').filter(f => f.negocioId && f.status !== 'Pago' && f.data < hoje);
  const btn = (estado, k, l) => `<button class="${(state[estado] || ({ agTipo: 'todos', agSit: 'aberto', agPer: '6' })[estado]) === k ? '' : 'sec'}" onclick="state.${estado}='${k}';render()">${l}</button>`;
  return `${negSel ? `<div class="card row"><b>Parcelas de: ${esc(negSel.tipo)} ${esc(negLabel(negSel))}</b>${negSel.contraparte ? ` · ${esc(negSel.contraparte)}` : ''}<button class="sec" onclick="state.agNeg=null;render()">Ver todos os negócios</button></div>` : ''}
  <div class="card"><div class="row" style="margin-bottom:8px"><b style="min-width:70px">Mostrar:</b>${btn('agTipo', 'todos', 'Tudo')}${btn('agTipo', 'pagar', '🔴 A pagar (compras)')}${btn('agTipo', 'receber', '🟢 A receber (vendas)')}</div>
    <div class="row" style="margin-bottom:8px"><b style="min-width:70px">Situação:</b>${btn('agSit', 'aberto', 'Em aberto')}${btn('agSit', 'atrasadas', `Atrasadas (${atrasadas.length})`)}${btn('agSit', 'pagas', 'Já pagas')}${btn('agSit', 'todas', 'Todas')}</div>
    ${negSel || ['pagas', 'atrasadas'].includes(sit) ? '' : `<div class="row"><b style="min-width:70px">Período:</b>${btn('agPer', '1', 'Este mês')}${btn('agPer', '3', '3 meses')}${btn('agPer', '6', '6 meses')}${btn('agPer', '12', '12 meses')}${btn('agPer', 'tudo', 'Tudo')}</div>`}</div>
  <div class="kpis"><div class="kpi"><small>A receber (vendas)</small><b style="color:var(--ok)">${brl(soma('Receita'))}</b></div><div class="kpi"><small>A pagar (compras)</small><b style="color:var(--bad)">${brl(soma('Despesa'))}</b></div><div class="kpi"><small>Saldo</small><b style="color:${soma('Receita') - soma('Despesa') >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(soma('Receita') - soma('Despesa'))}</b></div><div class="kpi"><small>Parcelas</small><b>${L.length}</b></div></div>
  <div class="card"><h3>Fluxo por mês</h3>${table([['Mês', x => `<b>${nomeMes(x.m)}</b>`], ['Entra (vendas)', x => `<span style="color:var(--ok)">${brl(x.r)}</span>`], ['Sai (compras)', x => `<span style="color:var(--bad)">${brl(x.p)}</span>`], ['Saldo do mês', x => `<b style="color:${x.r - x.p >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(x.r - x.p)}</b>`], ['Saldo acumulado', x => `<span style="color:${x.acum >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(x.acum)}</span>`]], resumo)}</div>
  ${resumo.map(x => `<div class="card"><h3>${nomeMes(x.m)} <small class="muted" style="font-weight:normal">· entra ${brl(x.r)} · sai ${brl(x.p)}</small></h3>${table([
    ['Dia', f => `<b>${fdate(f.data).slice(0, 5)}</b>` + (f.status !== 'Pago' && f.data < hoje ? ` <span class="tag bad">${-daysUntil(f.data)}d atraso</span>` : f.status !== 'Pago' && daysUntil(f.data) <= 7 ? ` <span class="tag warn">em ${daysUntil(f.data)}d</span>` : '')],
    ['', f => f.tipo === 'Receita' ? '<span class="tag ok">Receber</span>' : '<span class="tag bad">Pagar</span>'],
    ['Animal / negócio', f => `<b>${esc(negLabel(neg(f)))}</b><br><small class="muted">${esc(neg(f).tipo || '')}${neg(f).contraparte ? ' · ' + esc(neg(f).contraparte) : ''}</small>`],
    ['Parcela', f => parc(f)], ['Forma', f => esc(f.forma || '')],
    ['Valor', f => `<b style="color:${f.tipo === 'Receita' ? 'var(--ok)' : 'var(--bad)'}">${brl(f.valor)}</b>`],
    ['Situação', f => f.status === 'Pago' ? `<span class="tag ok">Paga${f.pagoEm ? ' em ' + fdate(f.pagoEm) : ''}</span>` : '<span class="tag warn">Em aberto</span>'],
  ], L.filter(f => f.data.startsWith(x.m)), f => f.status === 'Pago' ? `<button class="lnk" onclick="reabrirParcela('${f.id}')">Desfazer</button>` : `<button class="lnk" onclick="baixar('${f.id}')">✓ Marcar paga</button>`)}</div>`).join('') || '<div class="card"><p class="muted">Nenhuma parcela com esses filtros.</p></div>'}
  <p class="muted">Valores pela <b>nossa parte</b> em cada negócio (descontada a parte dos sócios e a comissão nas vendas).</p>`;
}
window.reabrirParcela = (id) => {
  const f = DB.get('financeiro', id); DB.upsert('financeiro', { ...f, status: 'Pendente', pagoEm: '' });
  const n = f.negocioId && DB.get('negocios', f.negocioId);
  if (n && n.parcelasLista && n.parcelasLista[f.parcelaIdx]) { n.parcelasLista[f.parcelaIdx].pagoEm = ''; DB.upsert('negocios', n); }
  render();
};

V.negocios = () => {
  const tab = state.ntab || 'negocios', eu = socioProprio();
  const ns = DB.list('negocios').slice().sort((a, b) => b.data.localeCompare(a.data));
  const minha = (n) => (n.participacoes || []).find(p => p.socioId === eu?.id)?.pct || 0;
  const tabs = `<div class="tabs">${[['negocios', 'Compras e vendas'], ['agenda', '📅 Agenda de parcelas'], ['animais', 'Resultado por animal'], ['socios', 'Sócios']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" onclick="state.ntab='${k}';render()">${l}</button>`).join('')}</div>`;
  const aviso = eu ? '' : `<div class="card"><span class="tag warn">Cadastre o próprio haras como sócio (marcando “É o próprio haras”) para o sistema calcular a sua parte e lançar no financeiro.</span> <button class="lnk" onclick="novoSocio(()=>{})">Cadastrar agora</button></div>`;
  const ano = today().slice(0, 4), doAno = ns.filter(n => n.data.startsWith(ano));
  const tot = (t) => doAno.filter(n => n.tipo === t).reduce((s, n) => s + (t === 'Venda' ? valorLiquido(n) : Number(n.valor)) * minha(n) / 100, 0);
  let body = '';
  const ft = state.nFiltro || 'todos';
  const nsF = ns.filter(n => ft === 'todos' || (ft === 'compras' ? n.tipo === 'Compra' : n.tipo === 'Venda'));
  const statusPg = (n) => { const ps = n.parcelasLista || []; if (!ps.length) return ''; const pg = ps.filter(q => q.pagoEm).length, atr = ps.some(q => !q.pagoEm && q.vencimento < today());
    return pg === ps.length ? '<span class="tag ok">Quitado</span>' : `<span class="tag ${atr ? 'bad' : 'warn'}">${pg}/${ps.length} pagas${atr ? ' · atraso' : ''}</span>`; };
  const botoesFiltro = `<div class="row" style="margin-bottom:12px">${[['todos', 'Todos'], ['compras', 'Só compras'], ['vendas', 'Só vendas']].map(([k, l]) => `<button class="${ft === k ? '' : 'sec'}" onclick="state.nFiltro='${k}';render()">${l}</button>`).join('')}<span class="muted">${nsF.length} negócio(s)</span></div>`;
  if (tab === 'negocios') body = `<div class="kpis"><div class="kpi"><small>Compras em ${ano} (nossa parte)</small><b style="color:var(--bad)">${brl(tot('Compra'))}</b></div><div class="kpi"><small>Vendas em ${ano} (nossa parte, líquido)</small><b style="color:var(--ok)">${brl(tot('Venda'))}</b></div><div class="kpi"><small>Negócios em ${ano}</small><b>${doAno.length}</b></div></div>
    <div class="card">${botoesFiltro}${table([
      ['Data', n => fdate(n.data)], ['Tipo', n => `<span class="tag ${n.tipo === 'Venda' ? 'ok' : 'warn'}">${n.tipo}</span>`], ['Pagamento', statusPg], ['Animal / produto', n => `<b>${esc(negLabel(n))}</b>` + (Number(n.pctAnimal) !== 100 ? `<br><small class="muted">${pct(n.pctAnimal)} do animal</small>` : '')],
      ['Comprador / vendedor', n => esc(n.contraparte)], ['Valor total', n => brl(n.valor) + (n.parcelasLista ? `<br><small class="muted">${n.parcelasLista.length} parcela(s), ${n.parcelasLista.filter(q => q.pagoEm).length} paga(s)</small>` : n.parcelas > 1 ? `<br><small class="muted">${n.parcelas}x de ${brl(n.valor / n.parcelas)}</small>` : '') + (n.comissaoPct ? `<br><small class="muted">comissão ${pct(n.comissaoPct)}</small>` : '')],
      ['Sociedade', n => (n.participacoes || []).map(p => `<span class="tag" title="${brl((n.tipo === 'Venda' ? valorLiquido(n) : n.valor) * p.pct / 100)}">${esc(sname(p.socioId))} ${pct(p.pct)}</span>`).join(' ')],
      ['Nossa parte', n => `<b>${brl((n.tipo === 'Venda' ? valorLiquido(n) : Number(n.valor)) * minha(n) / 100)}</b>`],
    ], nsF, n => `<button class="lnk" onclick="state.ntab='agenda';state.agNeg='${n.id}';render()">Parcelas</button><button class="lnk" onclick="editNegocio('${n.id}')">Editar</button><button class="del" onclick="delNegocio('${n.id}')">Excluir</button>`)}</div>`;
  if (tab === 'agenda') body = agendaParcelas();
  if (tab === 'animais') {
    const ids = [...new Set(ns.filter(n => n.animalId && (!n.produto || n.produto === 'Animal')).map(n => n.animalId))];
    const L = ids.map(id => { const a = animal(id) || { nome: '?' }; const N = ns.filter(n => n.animalId === id);
      const inv = N.filter(n => n.tipo === 'Compra').reduce((s, n) => s + Number(n.valor) * minha(n) / 100, 0), ven = N.filter(n => n.tipo === 'Venda').reduce((s, n) => s + valorLiquido(n) * minha(n) / 100, 0);
      const comp = composicao(id), nossa = eu ? (comp[eu.id] || 0) : 0;
      const c = calcCustos(a.dataEntrada || a.nascimento || '2000-01-01', today())[id]; const manut = c ? c.diretos + c.rateio : 0;
      return { a, id, inv, ven, comp, nossa, manut }; });
    body = `<div class="card">${table([
      ['Animal', x => `<b>${esc(x.a.nome)}</b><br><small class="muted">${esc(x.a.status || '')}</small>`],
      ['Composição atual', x => Object.entries(x.comp).map(([k, v]) => `<span class="tag">${esc(sname(k))} ${pct(v)}</span>`).join(' ') || '<span class="muted">vendido</span>'],
      ['Nossa % hoje', x => pct(x.nossa)], ['Investido (nossa parte)', x => brl(x.inv)], ['Recebido em vendas (nossa parte)', x => brl(x.ven)],
      ['Custo de manutenção', x => brl(x.manut)], ['Resultado', x => { const r = x.ven - x.inv - x.manut; return `<b style="color:${r >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(r)}</b>`; }],
    ], L)}<p class="muted"><b>Resultado</b> = vendas − compras − custo de manutenção (custos diretos + rateio do módulo Custos), tudo pela nossa parte nos negócios. Enquanto o animal não for vendido, o resultado mostra quanto já foi investido nele.</p></div>`;
  }
  if (tab === 'socios') {
    const S = DB.list('socios').map(s => { let inv = 0, rec = 0; ns.forEach(n => { const p = (n.participacoes || []).find(x => x.socioId === s.id); if (!p) return; if (n.tipo === 'Compra') inv += Number(n.valor) * p.pct / 100; else rec += valorLiquido(n) * p.pct / 100; });
      const animais = DB.list('animais').map(a => [a, composicao(a.id)[s.id]]).filter(([, v]) => v > 0.001); return { s, inv, rec, animais }; });
    body = `<div class="card">${table([
      ['Sócio', x => `<b>${esc(x.s.nome)}</b>${x.s.proprio === 'Sim' ? ' <span class="tag ok">nós</span>' : ''}<br><small class="muted">${esc(x.s.telefone || '')}</small>`],
      ['Animais em sociedade hoje', x => x.animais.map(([a, v]) => `<span class="tag">${esc(a.nome)} ${pct(v)}</span>`).join(' ') || '—'],
      ['Total investido', x => brl(x.inv)], ['Total recebido', x => brl(x.rec)], ['Saldo', x => `<b style="color:${x.rec - x.inv >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(x.rec - x.inv)}</b>`],
    ], S, x => `<button class="lnk" onclick="novoSocio(null,'${x.s.id}')">Editar</button><button class="del" onclick="del('socios','${x.s.id}')">Excluir</button>`)}</div>`;
  }
  return aviso + tabs + body;
};

// ---------- Ações do topo por módulo ----------
const ACOES = {
  animais: () => state.animalId ? '' : `<button onclick="editAnimal()">+ Novo animal</button>`,
  reproducao: () => `<button onclick="openForm('Nova cobertura / inseminação',F_REPRO,{dataCobertura:today(),resultadoDG:'Aguardando',status:'Coberta'},o=>DB.upsert('reproducao',o))">+ Nova cobertura</button>`,
  sanidade: () => `<button class="sec" onclick="aplicacaoLote()">Aplicação em lote</button><button onclick="openForm('Novo registro sanitário',F_SAN,{data:today()},o=>DB.upsert('sanidade',o))">+ Novo registro</button>`,
  financeiro: () => `<button onclick="openForm('Novo lançamento',F_FIN(),{data:today(),tipo:'Despesa',status:'Pago'},o=>DB.upsert('financeiro',o))">+ Novo lançamento</button>`,
  custos: () => `<button class="sec" onclick="cobrarExtra()">Cobrar serviço extra</button><button onclick="gerarCobrancas()">Gerar cobranças de pensão do mês</button>`,
  negocios: () => state.ntab === 'socios' ? `<button onclick="novoSocio(()=>{})">+ Novo sócio</button>` : `<button class="sec" onclick="editNegocio(null,'Venda')">+ Venda</button><button onclick="editNegocio(null,'Compra')">+ Compra</button>`,
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
