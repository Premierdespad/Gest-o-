// Sanidade com PROTOCOLOS: cada vacina/vermífugo/exame tem um intervalo; a próxima dose sai sozinha
// e o quadro mostra, animal por animal, o que está em dia, vencendo ou vencido.
// Os registros continuam sendo o histórico (cada aplicação é um registro novo, nada é sobrescrito).
const PROTOCOLO_PADRAO = [
  { id: 'prot-influenza', nome: 'Influenza', tipo: 'Vacina', intervalo: 180, chaves: ['influenza', 'gripe'], obs: 'Reforço semestral' },
  { id: 'prot-tetano', nome: 'Tétano', tipo: 'Vacina', intervalo: 365, chaves: ['tetano'], obs: 'Reforço anual' },
  { id: 'prot-encefalo', nome: 'Encefalomielite', tipo: 'Vacina', intervalo: 365, chaves: ['encefalo', 'encefalomielite'], obs: 'Leste e Oeste · reforço anual' },
  { id: 'prot-raiva', nome: 'Raiva', tipo: 'Vacina', intervalo: 365, chaves: ['raiva', 'antirrabica'], obs: 'Reforço anual' },
  { id: 'prot-rino', nome: 'Rinopneumonite', tipo: 'Vacina', intervalo: 180, chaves: ['rino', 'rinopneumonite', 'herpes', 'ehv'], gestacao: [5, 7, 9], obs: 'Semestral · éguas prenhes no 5º, 7º e 9º mês' },
  { id: 'prot-garrotilho', nome: 'Garrotilho', tipo: 'Vacina', intervalo: 365, chaves: ['garrotilho', 'adenite', 'streptococcus'], obs: 'Anual (opcional: conforme o veterinário)', ativo: false },
  { id: 'prot-vermi', nome: 'Vermifugação', tipo: 'Vermifugação', intervalo: 90, chaves: [], porTipo: true, obs: 'A cada 3 meses' },
  { id: 'prot-aie', nome: 'Exame AIE', tipo: 'Exame', intervalo: 60, chaves: ['aie', 'anemia infecciosa'], obs: 'Validade de 60 dias para emitir GTA' },
  { id: 'prot-mormo', nome: 'Exame Mormo', tipo: 'Exame', intervalo: 60, chaves: ['mormo'], obs: 'Validade de 60 dias para emitir GTA' },
  { id: 'prot-casco', nome: 'Casqueamento', tipo: 'Casqueamento/Ferrageamento', intervalo: 60, chaves: ['casque', 'ferrage', 'casco'], porTipo: true, obs: 'A cada 60 dias' },
  { id: 'prot-dentes', nome: 'Odontologia', tipo: 'Odontologia', intervalo: 365, chaves: ['dente', 'odonto'], porTipo: true, obs: 'Revisão anual' },
];
const tirarAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function garantirProtocolos() {
  if (typeof NUVEM !== 'undefined' && NUVEM.db && !NUVEM.ativo) return; // espera a nuvem carregar
  if (DB.list('protocolos').length || DB.data.config?.protocolosCriados) return;
  PROTOCOLO_PADRAO.forEach(p => DB.list('protocolos').push({ ativo: true, ...p }));
  DB.data.config.protocolosCriados = true; DB.save();
}
const protocolos = (todos) => DB.list('protocolos').filter(p => todos || p.ativo !== false).sort((a, b) => PROTOCOLO_PADRAO.findIndex(x => x.id === a.id) - PROTOCOLO_PADRAO.findIndex(x => x.id === b.id));

// um registro sanitário vale para quais protocolos?
function protocolosDoRegistro(r) {
  if (r.protocoloId) return [r.protocoloId];
  const txt = tirarAcento(r.produto + ' ' + (r.obs || '')), tipo = tirarAcento(r.tipo);
  return DB.list('protocolos').filter(p => (p.chaves || []).some(k => txt.includes(tirarAcento(k))) || (p.porTipo && tirarAcento(p.tipo).split('/').some(t => tipo.includes(t)))).map(p => p.id);
}
// situação de um animal em um protocolo
function situacaoProtocolo(a, p) {
  const regs = DB.list('sanidade').filter(r => r.animalId === a.id && protocolosDoRegistro(r).includes(p.id)).sort((x, y) => (y.data || '').localeCompare(x.data || ''));
  const ult = regs[0];
  let venc = ult ? (ult.proxima || addDays(ult.data, Number(p.intervalo) || 365)) : null, motivo = '';
  // rinopneumonite: égua prenhe tem doses no 5º, 7º e 9º mês da gestação
  if (p.gestacao && a.sexo === 'Fêmea' && typeof situacaoEgua === 'function') {
    const st = situacaoEgua(a.id);
    if (st.status === 'Prenhe' && st.ciclo) {
      const doses = p.gestacao.map(m => addDays(st.ciclo.data, Math.round(m * 30.4)));
      const pend = doses.find(d => !regs.some(r => r.data >= addDays(d, -20)) && addDays(d, 30) >= today()) || doses.filter(d => !regs.some(r => r.data >= addDays(d, -20))).pop(); // todas passaram: mostra a mais recente que faltou
      if (pend) { venc = !venc || pend < venc ? pend : venc; motivo = `dose do ${p.gestacao[doses.indexOf(pend)]}º mês de gestação`; }
    }
  }
  if (!ult && !motivo) return { cor: 'sem', ult: null, venc: null };
  const d = daysUntil(venc);
  return { ult, venc, motivo, dias: d, cor: d < 0 ? 'bad' : d <= 15 ? 'warn' : 'ok' };
}
const animaisSanidade = () => DB.list('animais').filter(a => a.status === 'Ativo');

// pendências (painel e lista de próximas doses): substitui a versão antiga
pendenciasSanitarias = function () {
  garantirProtocolos();
  const out = [];
  for (const a of animaisSanidade()) for (const p of protocolos()) {
    const s = situacaoProtocolo(a, p);
    if (s.venc) out.push({ id: s.ult?.id || '', animalId: a.id, tipo: p.tipo, produto: p.nome + (s.motivo ? ` (${s.motivo})` : ''), proxima: s.venc, protocoloId: p.id });
  }
  return out.sort((x, y) => x.proxima.localeCompare(y.proxima));
};

// ---------- registrar aplicação (um ou vários animais de uma vez) ----------
window.registrarAplicacao = (pre = {}) => {
  garantirProtocolos();
  const ps = protocolos(), m = document.createElement('div'); m.className = 'modal';
  const lista = animaisSanidade().sort((a, b) => a.nome.localeCompare(b.nome));
  const marcados = new Set(pre.animais || (pre.animalId ? [pre.animalId] : []));
  const grupos = { todos: ['Todos', () => true], eguas: ['Éguas', a => a.sexo === 'Fêmea'], machos: ['Machos', a => a.sexo !== 'Fêmea'], potros: ['Potros', a => a.nascimento && -daysUntil(a.nascimento) < 730], prenhes: ['Éguas prenhes', a => typeof situacaoEgua === 'function' && a.sexo === 'Fêmea' && situacaoEgua(a.id).status === 'Prenhe'], proprios: ['Só meus', a => a.posse !== 'Pensão'], pensao: ['Só pensão', a => a.posse === 'Pensão'] };
  m.innerHTML = `<form class="box" style="max-width:820px"><div class="top"><h3 style="margin:0">💉 Registrar aplicação / exame</h3><button type="button" class="sec" data-x>Fechar</button></div>
    <div class="grid">
      <div><label>Protocolo</label><select id="ap_prot"><option value="">— outro (preencher abaixo) —</option>${ps.map(p => `<option value="${p.id}" ${p.id === pre.protocoloId ? 'selected' : ''}>${esc(p.nome)} · a cada ${p.intervalo} dias</option>`).join('')}</select></div>
      <div><label>Tipo</label><select id="ap_tipo">${F_SAN.find(f => f.k === 'tipo').opts.map(t => `<option>${t}</option>`).join('')}</select></div>
      <div><label>Produto / vacina / exame *</label><input id="ap_prod" required placeholder="ex.: Ivermectina, Influenza + Tétano"></div>
      <div><label>Data da aplicação *</label><input id="ap_data" type="date" value="${pre.data || today()}" required></div>
      <div><label>Próxima dose (calculada)</label><input id="ap_prox" type="date"></div>
      <div><label>Dose / lote</label><input id="ap_lote"></div>
      <div><label>Responsável / veterinário</label><input id="ap_resp"></div>
      <div><label>Custo por animal (R$)</label><input id="ap_custo" type="number" step="any"></div>
      <div class="full"><label>Observações</label><input id="ap_obs"></div>
      <div class="full"><label>Animais (<span id="ap_n">0</span> marcados)</label>
        <div class="row" style="margin:4px 0 8px">${Object.entries(grupos).map(([k, [l]]) => `<button type="button" class="sec" data-g="${k}" style="padding:5px 10px;font-size:13px">${l}</button>`).join('')}<button type="button" class="sec" data-g="nenhum" style="padding:5px 10px;font-size:13px">Limpar</button></div>
        <div id="ap_lista" style="max-height:240px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px 10px;columns:2 220px">${lista.map(a => `<label style="display:flex;gap:6px;align-items:center;margin:3px 0;color:var(--ink);font-size:14px;break-inside:avoid"><input type="checkbox" value="${a.id}" style="width:auto" ${marcados.has(a.id) ? 'checked' : ''}> ${esc(a.nome)}${a.posse === 'Pensão' ? ' <small class="muted">(pensão)</small>' : ''}</label>`).join('')}</div></div>
    </div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button type="button" class="sec" data-x>Cancelar</button><button type="submit">Salvar</button></div></form>`;
  document.body.appendChild(m);
  const $m = (s) => m.querySelector(s), cont = () => { $m('#ap_n').textContent = m.querySelectorAll('#ap_lista input:checked').length; };
  const calcProx = () => { const p = DB.get('protocolos', $m('#ap_prot').value), d = $m('#ap_data').value; if (p && d) $m('#ap_prox').value = addDays(d, Number(p.intervalo) || 365); };
  const usarProt = () => { const p = DB.get('protocolos', $m('#ap_prot').value); if (!p) return; $m('#ap_tipo').value = p.tipo; if (!$m('#ap_prod').value || ps.some(x => x.nome === $m('#ap_prod').value)) $m('#ap_prod').value = p.nome; calcProx(); };
  $m('#ap_prot').onchange = usarProt; $m('#ap_data').onchange = calcProx; usarProt();
  m.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { const g = grupos[b.dataset.g]; m.querySelectorAll('#ap_lista input').forEach(i => { const a = animal(i.value); i.checked = g ? (i.checked || g[1](a)) : false; }); cont(); });
  m.querySelector('#ap_lista').onchange = cont; cont();
  m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => m.remove());
  m.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const ids = [...m.querySelectorAll('#ap_lista input:checked')].map(i => i.value);
    if (!ids.length) return avisar('Marque pelo menos um animal.');
    const base = { protocoloId: $m('#ap_prot').value || '', tipo: $m('#ap_tipo').value, produto: $m('#ap_prod').value, data: $m('#ap_data').value, proxima: $m('#ap_prox').value, dose: $m('#ap_lote').value, responsavel: $m('#ap_resp').value, custo: Number($m('#ap_custo').value) || '', obs: $m('#ap_obs').value };
    ids.forEach(id => DB.upsert('sanidade', { ...base, animalId: id }));
    m.remove(); render();
    if (ids.length > 1) avisar(`${ids.length} registros criados.`);
  };
};
window.editarProtocolo = (id) => openForm(id ? 'Editar protocolo' : 'Novo protocolo', [
  { k: 'nome', l: 'Nome', req: true }, { k: 'tipo', l: 'Tipo', t: 'select', opts: F_SAN.find(f => f.k === 'tipo').opts, req: true },
  { k: 'intervalo', l: 'Intervalo até a próxima dose (dias)', t: 'number', req: true }, { k: 'ativo', l: 'Usar no quadro?', t: 'select', opts: [['true', 'Sim'], ['false', 'Não']] },
  { k: 'chavesTxt', l: 'Palavras que identificam nos registros antigos (separadas por vírgula)', full: true }, { k: 'obs', l: 'Observação', full: true }],
  id ? { ...DB.get('protocolos', id), ativo: String(DB.get('protocolos', id).ativo !== false), chavesTxt: (DB.get('protocolos', id).chaves || []).join(', ') } : { ativo: 'true', intervalo: 365 },
  o => { const { chavesTxt, ...r } = o; DB.upsert('protocolos', { ...r, ativo: o.ativo !== 'false', intervalo: Number(o.intervalo) || 365, chaves: String(chavesTxt || '').split(',').map(x => x.trim()).filter(Boolean) }); });

// ---------- telas ----------
const corCelula = { ok: '#dff0e5', warn: '#fbefd8', bad: '#f6dddd', sem: 'transparent' };
V.sanidade = () => {
  garantirProtocolos();
  const t = state.sTab || 'quadro';
  const abas = `<div class="tabs">${[['quadro', '📋 Quadro por animal'], ['proximas', 'Próximas doses'], ['historico', 'Histórico'], ['protocolos', 'Protocolos']].map(([k, l]) => `<button class="${t === k ? 'on' : ''}" onclick="state.sTab='${k}';render()">${l}</button>`).join('')}</div>`;
  const ps = protocolos();
  if (t === 'quadro') {
    const fs = state.sFiltro || 'proprios';
    const F = { proprios: ['Meus animais', a => a.posse !== 'Pensão'], pensao: ['Pensão', a => a.posse === 'Pensão'], todos: ['Todos', () => true] };
    const L = animaisSanidade().filter(F[fs][1]).sort((a, b) => a.nome.localeCompare(b.nome));
    const grade = L.map(a => ({ a, s: ps.map(p => situacaoProtocolo(a, p)) }));
    const conta = (c) => grade.reduce((t, g) => t + g.s.filter(x => x.cor === c).length, 0);
    return abas + `<div class="kpis"><div class="kpi"><small>🔴 Vencidas</small><b style="color:var(--bad)">${conta('bad')}</b></div><div class="kpi"><small>🟡 Vencem em até 15 dias</small><b style="color:var(--warn)">${conta('warn')}</b></div><div class="kpi"><small>🟢 Em dia</small><b style="color:var(--ok)">${conta('ok')}</b></div><div class="kpi"><small>⚪ Sem registro</small><b>${conta('sem')}</b></div></div>
    <div class="card"><div class="row" style="margin-bottom:10px">${Object.entries(F).map(([k, [l, f]]) => `<button class="${fs === k ? '' : 'sec'}" onclick="state.sFiltro='${k}';render()">${l} (${animaisSanidade().filter(f).length})</button>`).join('')}<span class="muted">Clique numa célula para registrar a aplicação.</span></div>
    <div class="tw"><table><thead><tr><th style="position:sticky;left:0;background:#fff;min-width:170px">Animal</th>${ps.map(p => `<th title="${esc(p.obs || '')}" style="text-align:center;min-width:92px">${esc(p.nome)}<br><small style="text-transform:none;font-weight:normal">${p.intervalo} dias</small></th>`).join('')}</tr></thead><tbody>
    ${grade.map(({ a, s }) => `<tr><td style="position:sticky;left:0;background:#fff"><b>${esc(a.nome)}</b><br><small class="muted">${esc(a.categoria || '')}${a.posse === 'Pensão' ? ' · pensão' : ''}</small></td>${s.map((x, i) => `<td style="text-align:center;background:${corCelula[x.cor]};cursor:pointer;font-size:12px" onclick="registrarAplicacao({animalId:'${a.id}',protocoloId:'${ps[i].id}'})" title="${x.ult ? 'Última: ' + fdate(x.ult.data) + ' · ' + esc(x.ult.produto) : 'Sem registro'}${x.motivo ? ' · ' + x.motivo : ''}">${x.venc ? `<b>${fdate(x.venc).slice(0, 5)}</b><br>${x.dias < 0 ? `${-x.dias}d atraso` : x.dias === 0 ? 'hoje' : `em ${x.dias}d`}` : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="muted">Cada célula mostra quando vence a próxima dose ou a validade do exame, a partir do último registro do animal. 🟡 vence em até 15 dias · 🔴 vencido. Na Rinopneumonite, as éguas prenhes seguem as doses do 5º, 7º e 9º mês da gestação (pela aba Reprodução).</p></div>`;
  }
  if (t === 'proximas') {
    const todasPend = pendenciasSanitarias(), pend = todasPend.filter(x => daysUntil(x.proxima) <= (Number(state.sDias) || 30));
    const logo15 = [...new Set(pend.filter(x => daysUntil(x.proxima) <= 15).map(x => x.animalId))];
    return abas + `<div class="card"><div class="row" style="margin-bottom:8px"><b>Mostrar até:</b>${[15, 30, 60, 90].map(d => `<button class="${(Number(state.sDias) || 30) === d ? '' : 'sec'}" onclick="state.sDias=${d};render()">${d} dias (${todasPend.filter(x => daysUntil(x.proxima) <= d).length})</button>`).join('')}</div>${table([['Quando', s => fdate(s.proxima) + ' ' + statusTag(daysUntil(s.proxima))], ['Animal', s => esc(aname(s.animalId))], ['O quê', s => esc(s.produto)]], pend,
      s => `<button class="lnk" onclick="registrarAplicacao({animalId:'${s.animalId}',protocoloId:'${s.protocoloId}'})">Registrar aplicação</button>`)}
      ${logo15.length ? `<button class="sec" style="margin-top:10px" onclick='registrarAplicacao({animais:${esc(JSON.stringify(logo15))}})'>Registrar para todos que vencem em até 15 dias</button>` : ''}</div>`;
  }
  if (t === 'protocolos') return abas + `<div class="card"><p>Intervalos usados para calcular a próxima dose. Baseado no calendário mais comum para equinos no Brasil — <b>confirme com o veterinário do haras</b> e ajuste o que precisar.</p>
    ${table([['Protocolo', p => `<b>${esc(p.nome)}</b><br><small class="muted">${esc(p.tipo)}</small>`], ['Intervalo', p => `${p.intervalo} dias`], ['Observação', p => esc(p.obs || '')], ['No quadro', p => p.ativo === false ? '<span class="tag">Não</span>' : '<span class="tag ok">Sim</span>']], protocolos(true),
      p => `<button class="lnk" onclick="editarProtocolo('${p.id}')">Editar</button><button class="del" onclick="del('protocolos','${p.id}')">Excluir</button>`)}
    <button style="margin-top:10px" onclick="editarProtocolo()">+ Novo protocolo</button></div>`;
  const rows = DB.list('sanidade').slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return abas + `<div class="card">${table([
    ['Data', s => fdate(s.data)], ['Animal', s => esc(aname(s.animalId))], ['Tipo', s => esc(s.tipo)], ['Produto / procedimento', s => esc(s.produto)],
    ['Próxima', s => s.proxima ? fdate(s.proxima) : '—'], ['Responsável', s => esc(s.responsavel)], ['Custo', s => s.custo ? brl(s.custo) : ''],
  ], rows, s => `<button class="lnk" onclick="openForm('Editar registro',F_SAN,DB.get('sanidade','${s.id}'),o=>DB.upsert('sanidade',o))">Editar</button><button class="del" onclick="del('sanidade','${s.id}')">Excluir</button>`)}</div>`;
};
ACOES.sanidade = () => `<button onclick="registrarAplicacao()">💉 Registrar aplicação / exame</button>`;

// prontuário na ficha do animal: situação + linha do tempo por ano
window.prontuarioAnimal = (id) => {
  garantirProtocolos();
  const a = animal(id), ps = protocolos(), regs = DB.list('sanidade').filter(r => r.animalId === id).sort((x, y) => (x.data || '').localeCompare(y.data || ''));
  const anos = {}; regs.forEach(r => (anos[(r.data || '????').slice(0, 4)] = anos[(r.data || '????').slice(0, 4)] || []).push(r));
  return `<div class="row" style="margin-bottom:10px"><button onclick="registrarAplicacao({animalId:'${id}'})">💉 Registrar aplicação / exame</button></div>
    <div class="card" style="margin-bottom:12px"><div class="row" style="gap:6px">${ps.map(p => { const s = situacaoProtocolo(a, p); return `<span class="tag ${s.cor === 'sem' ? '' : s.cor}" title="${esc(p.obs || '')}" style="cursor:pointer" onclick="registrarAplicacao({animalId:'${id}',protocoloId:'${p.id}'})">${esc(p.nome)}: ${s.venc ? (s.dias < 0 ? 'vencida' : 'até ' + fdate(s.venc)) : 'sem registro'}</span>`; }).join('')}</div></div>
    ${Object.keys(anos).sort().reverse().map(y => `<div class="card"><h3>${y}</h3>${table([['Data', r => `<b>${fdate(r.data)}</b>`], ['Tipo', r => esc(r.tipo)], ['Produto', r => esc(r.produto) + (r.dose ? `<br><small class="muted">${esc(r.dose)}</small>` : '')], ['Próxima', r => r.proxima ? fdate(r.proxima) : '—'], ['Obs.', r => esc(r.obs || '') + (r.responsavel ? `<br><small class="muted">${esc(r.responsavel)}</small>` : '') + (r.custo ? `<br><small class="muted">${brl(r.custo)}</small>` : '')]],
      anos[y], r => `<button class="lnk" onclick="openForm('Editar registro',F_SAN,DB.get('sanidade','${r.id}'),o=>DB.upsert('sanidade',o))">Editar</button><button class="del" onclick="del('sanidade','${r.id}')">Excluir</button>`)}</div>`).join('') || '<div class="card"><p class="muted">Nenhum registro sanitário ainda.</p></div>'}`;
};
