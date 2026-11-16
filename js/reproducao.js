// Reprodução por HISTÓRICO de cada égua (doadoras, matrizes e receptoras).
// Cada acontecimento é um evento datado na coleção "eventos"; nada é sobrescrito.
// A situação da égua (vazia, aguardando diagnóstico, prenhe) é calculada a partir do histórico.
const EV = {
  COBERTURA: { nome: 'Cobertura / inseminação', ic: '🐎', ordem: 1 },
  INOVULACAO: { nome: 'Inovulação (recebeu embrião)', ic: '🥚', ordem: 1 },
  COLETA: { nome: 'Coleta de embrião (lavado)', ic: '🧪', ordem: 2 },
  DG: { nome: 'Diagnóstico de gestação', ic: '🔍', ordem: 3 },
  RECONF: { nome: 'Reconfirmação de prenhez', ic: '✅', ordem: 4 },
  PERDA: { nome: 'Perda (absorção / aborto)', ic: '⚠️', ordem: 5 },
  PARTO: { nome: 'Parto', ic: '🍼', ordem: 6 },
  VAZIA: { nome: 'Marcada como vazia', ic: '⭕', ordem: 7 },
  OUTRO: { nome: 'Outro (cio, exame, tratamento)', ic: '📝', ordem: 0 },
};
const METODOS = ['Monta natural', 'Monta controlada', 'Inseminação artificial', 'IA sêmen fresco', 'IA sêmen resfriado', 'IA sêmen congelado'];
const GEST_TE = GESTACAO - 8; // na TE conta a partir da inovulação (embrião com ~8 dias)

const evDa = (id) => DB.list('eventos').filter(e => e.eguaId === id).sort((a, b) => (a.data || '').localeCompare(b.data || '') || (EV[a.tipo]?.ordem ?? 9) - (EV[b.tipo]?.ordem ?? 9) || (a.criadoEm || '').localeCompare(b.criadoEm || ''));
const nomeGar = (e) => (e && (aname(e.garanhaoId) || e.garanhaoExterno)) || '';
const eguasRepro = () => DB.list('animais').filter(a => a.sexo === 'Fêmea' && a.status === 'Ativo' && a.posse !== 'Pensão');

// ---------- situação calculada pelo histórico ----------
function situacaoEgua(id) {
  let st = { status: 'Vazia', ciclo: null, ult: null, desde: null, partoEm: null, perdaEm: null };
  for (const e of evDa(id)) {
    st.ult = e;
    if (e.tipo === 'COBERTURA') { st.status = 'Aguardando DG'; st.ciclo = { ev: e, data: e.data, te: false }; st.desde = e.data; }
    else if (e.tipo === 'INOVULACAO') { st.status = 'Aguardando DG'; st.ciclo = { ev: e, data: e.data, te: true }; st.desde = e.data; }
    else if (e.tipo === 'COLETA') { st.status = 'Vazia'; st.ciclo = null; st.desde = e.data; }
    else if (e.tipo === 'DG') { if (/Prenhe|Gemelar/.test(e.resultado || '')) { st.status = 'Prenhe'; } else { st.status = 'Vazia'; st.ciclo = null; st.desde = e.data; } }
    else if (e.tipo === 'RECONF') { if (/Perdeu/.test(e.resultado || '')) { st.status = 'Vazia'; st.ciclo = null; st.desde = e.data; st.perdaEm = e.data; } }
    else if (e.tipo === 'PERDA') { st.status = 'Vazia'; st.ciclo = null; st.desde = e.data; st.perdaEm = e.data; }
    else if (e.tipo === 'PARTO') { st.status = 'Vazia'; st.ciclo = null; st.desde = e.data; st.partoEm = e.data; }
    else if (e.tipo === 'VAZIA') { st.status = 'Vazia'; st.ciclo = null; st.desde = e.data; }
  }
  if (st.ciclo) {
    st.dias = -daysUntil(st.ciclo.data);
    st.garanhao = nomeGar(st.ciclo.ev);
    st.doadoraId = st.ciclo.ev.doadoraId || '';
    if (st.status === 'Prenhe') st.prevParto = addDays(st.ciclo.data, st.ciclo.te ? GEST_TE : GESTACAO);
  }
  return st;
}
function tagSituacao(st) {
  if (st.status === 'Prenhe') return `<span class="tag ok">Prenhe</span>`;
  if (st.status === 'Aguardando DG') return `<span class="tag warn">Aguardando diagnóstico</span>`;
  return `<span class="tag">Vazia</span>`;
}
function detalheSituacao(st) {
  if (st.status === 'Prenhe') return `${st.ciclo.te ? `Embrião de ${esc(aname(st.doadoraId) || '?')} × ` : ''}${esc(st.garanhao || '?')} · ${st.dias} dias · parto previsto <b>${fdate(st.prevParto)}</b> <span class="muted">(${daysUntil(st.prevParto) >= 0 ? 'faltam ' + daysUntil(st.prevParto) : 'passou ' + -daysUntil(st.prevParto)} dias)</span>`;
  if (st.status === 'Aguardando DG') return `${st.ciclo.te ? 'Inovulada' : esc(st.ciclo.ev.metodo || 'Coberta')} ${st.ciclo.te ? `(embrião de ${esc(aname(st.doadoraId) || '?')} × ${esc(st.garanhao || '?')})` : 'com ' + esc(st.garanhao || '?')} em ${fdate(st.ciclo.data)} · <b>${st.dias} dias</b>${st.dias >= 14 ? ' <span class="tag warn">fazer diagnóstico</span>' : ` · DG a partir de ${fdate(addDays(st.ciclo.data, 14))}`}`;
  const quando = (d) => daysUntil(d) > 0 ? `daqui a ${daysUntil(d)} dias` : daysUntil(d) === 0 ? 'hoje' : `há ${-daysUntil(d)} dias`;
  if (st.partoEm) return `Pariu em ${fdate(st.partoEm)} (${quando(st.partoEm)})`;
  if (st.perdaEm) return `Perdeu a gestação em ${fdate(st.perdaEm)}`;
  return st.ult ? `Último registro: ${EV[st.ult.tipo]?.nome || st.ult.tipo} em ${fdate(st.ult.data)}` : '<span class="muted">Sem registros</span>';
}

// ---------- ciclos (para estatísticas) ----------
function ciclosDe(id) {
  const cs = []; let c = null;
  for (const e of evDa(id)) {
    if (e.tipo === 'COBERTURA' || e.tipo === 'INOVULACAO') { c = { eguaId: id, ev: e, data: e.data, garanhao: nomeGar(e) || '—', te: e.tipo === 'INOVULACAO', dgPos: false, dgNeg: false, perda: false, parto: false }; cs.push(c); continue; }
    if (!c) continue;
    if (e.tipo === 'DG') { if (/Prenhe|Gemelar/.test(e.resultado || '')) c.dgPos = true; else { c.dgNeg = true; c = null; } }
    else if (e.tipo === 'RECONF' && /Perdeu/.test(e.resultado || '')) { c.perda = true; c = null; }
    else if (e.tipo === 'PERDA') { c.perda = true; c = null; }
    else if (e.tipo === 'PARTO') { c.parto = true; c.dgPos = true; c = null; }
    else if (e.tipo === 'COLETA' || e.tipo === 'VAZIA') c = null;
  }
  return cs;
}

// ---------- migração das coberturas antigas para eventos ----------
function migrarRepro() {
  if (typeof NUVEM !== 'undefined' && NUVEM.db && !NUVEM.ativo) return; // espera a nuvem carregar
  const pend = DB.list('reproducao').filter(r => !r.migrado);
  if (!pend.length) return;
  const evs = DB.list('eventos'), novo = (id, o) => { if (!evs.some(e => e.id === id)) evs.push({ id, criadoEm: new Date().toISOString(), ...o }); };
  for (const r of pend) {
    const R = r.id, gar = { garanhaoId: r.garanhaoId || '' }, dt = r.dataCobertura || r.dataInovulacao || '';
    const te = /Transfer/.test(r.metodo || '');
    const alvo = te && r.receptoraId ? r.receptoraId : r.eguaId; // quem carrega a gestação
    if (te && r.receptoraId) {
      if (r.dataCobertura) novo(`ev-${R}-cob`, { origem: R, eguaId: r.eguaId, tipo: 'COBERTURA', data: r.dataCobertura, metodo: 'Inseminação artificial', ...gar, obs: r.obs || '' });
      const dIno = r.dataInovulacao || (r.dataCobertura ? addDays(r.dataCobertura, 8) : '');
      if (dIno) { novo(`ev-${R}-col`, { origem: R, eguaId: r.eguaId, tipo: 'COLETA', data: dIno, resultado: 'Embrião recuperado', qtd: 1, receptoraId: r.receptoraId, ...gar });
        novo(`ev-${R}-ino`, { origem: R, eguaId: r.receptoraId, tipo: 'INOVULACAO', data: dIno, doadoraId: r.eguaId, ...gar }); }
    } else if (dt) {
      novo(`ev-${R}-cob`, { origem: R, eguaId: r.eguaId, tipo: 'COBERTURA', data: dt, metodo: te ? 'Transferência de embrião (receptora não informada)' : (r.metodo || ''), ...gar, obs: r.obs || '' });
    }
    const base = r.dataInovulacao || dt;
    const dDG = r.dataDG || (base ? addDays(base, 14) : ''), estim = r.dataDG ? '' : 'Data estimada (o registro antigo não tinha a data do diagnóstico)';
    const prenhe = /Prenhe|Gemelar/.test(r.resultadoDG || '') || r.status === 'Parida' || r.status === 'Gestante' || !!r.dataParto;
    if (prenhe && dDG) novo(`ev-${R}-dg`, { origem: R, eguaId: alvo, tipo: 'DG', data: dDG, resultado: r.resultadoDG === 'Gemelar' ? 'Gemelar' : 'Prenhe', obs: estim });
    else if (r.resultadoDG === 'Vazia' && dDG) novo(`ev-${R}-dg`, { origem: R, eguaId: alvo, tipo: 'DG', data: dDG, resultado: 'Vazia', obs: estim });
    if (/Reabs|Aborto/.test(r.resultadoDG || '') || r.status === 'Aborto') novo(`ev-${R}-perda`, { origem: R, eguaId: alvo, tipo: 'PERDA', data: r.dataDG || dDG, resultado: /Reabs/.test(r.resultadoDG || '') ? 'Reabsorção' : 'Aborto' });
    if (r.dataParto) novo(`ev-${R}-parto`, { origem: R, eguaId: alvo, tipo: 'PARTO', data: r.dataParto, resultado: 'Nascido vivo', potroId: r.potroId || '' });
    r.migrado = true;
  }
  DB.save();
}

// ---------- formulário de evento ----------
function camposEvento(tipo, e, eguaId) {
  const st = situacaoEgua(eguaId), cic = st.ciclo?.ev || {};
  const machos = () => animalOpts(a => a.sexo !== 'Fêmea'), femeas = () => animalOpts(a => a.sexo === 'Fêmea' && a.id !== eguaId);
  const garanhao = [{ k: 'garanhaoId', l: 'Garanhão (cadastrado)', t: 'animal', opts: machos }, { k: 'garanhaoExterno', l: 'ou garanhão de fora (nome)' }];
  const F = {
    COBERTURA: [{ k: 'metodo', l: 'Método', t: 'select', opts: METODOS, req: true }, ...garanhao],
    INOVULACAO: [{ k: 'doadoraId', l: 'Doadora do embrião', t: 'animal', opts: femeas, req: true }, ...garanhao],
    COLETA: [...garanhao, { k: 'resultado', l: 'Resultado', t: 'select', opts: ['Embrião recuperado', 'Sem embrião'], req: true }, { k: 'qtd', l: 'Nº de embriões', t: 'number' }, { k: 'receptoraId', l: 'Inovulado na receptora (cria o registro nela)', t: 'animal', opts: () => animalOpts(a => a.sexo === 'Fêmea' && a.id !== eguaId && a.status === 'Ativo') }],
    DG: [{ k: 'resultado', l: 'Resultado', t: 'select', opts: ['Prenhe', 'Vazia', 'Gemelar'], req: true }],
    RECONF: [{ k: 'resultado', l: 'Resultado', t: 'select', opts: ['Prenhez confirmada', 'Perdeu a gestação'], req: true }],
    PERDA: [{ k: 'resultado', l: 'Tipo de perda', t: 'select', opts: ['Reabsorção', 'Aborto'], req: true }],
    PARTO: [{ k: 'resultado', l: 'Resultado', t: 'select', opts: ['Nascido vivo', 'Natimorto'], req: true }, ...(e.id ? [] : [{ k: 'potroNome', l: 'Nome do potro (para cadastrar)' }, { k: 'potroSexo', l: 'Sexo do potro', t: 'select', opts: ['Macho', 'Fêmea'] }, { k: 'potroPelagem', l: 'Pelagem do potro' }])],
    VAZIA: [],
    OUTRO: [{ k: 'resultado', l: 'O que foi (ex.: cio, ultrassom, tratamento)', req: true }],
  }[tipo] || [];
  const def = { ...e };
  if (!e.id && (tipo === 'COLETA') && cic.garanhaoId !== undefined) { def.garanhaoId = def.garanhaoId ?? cic.garanhaoId; def.garanhaoExterno = def.garanhaoExterno ?? cic.garanhaoExterno; }
  if (!e.id && tipo === 'COLETA' && !def.resultado) def.resultado = 'Embrião recuperado';
  return [{ k: 'data', l: 'Data', t: 'date', req: true }, ...F, { k: 'responsavel', l: 'Veterinário / responsável' }, { k: 'custo', l: 'Custo (R$)', t: 'number' }, { k: 'obs', l: 'Observações', t: 'textarea', full: true }].map(f => ({ f, v: def[f.k] }));
}
window.novoEvento = (eguaId, tipo, id) => {
  const e = id ? JSON.parse(JSON.stringify(DB.get('eventos', id))) : { eguaId, tipo: tipo || 'COBERTURA', data: today() };
  if (!e.eguaId) e.eguaId = eguaId;
  const st = situacaoEgua(e.eguaId);
  if (!id && !tipo) e.tipo = st.status === 'Aguardando DG' ? 'DG' : st.status === 'Prenhe' ? (st.dias >= 300 ? 'PARTO' : 'RECONF') : 'COBERTURA';
  const m = document.createElement('div'); m.className = 'modal';
  const desenhar = () => {
    const fs = camposEvento(e.tipo, e, e.eguaId);
    m.innerHTML = `<form class="box"><div class="top"><h3 style="margin:0">${id ? 'Editar registro' : 'Novo registro'} · ${esc(aname(e.eguaId))}</h3><button type="button" class="sec" data-x>Fechar</button></div>
      ${e.eguaId ? '' : `<div style="margin-bottom:10px">${field({ k: 'egua', l: 'Égua', t: 'animal', opts: () => eguasRepro().sort((a, b) => a.nome.localeCompare(b.nome)).map(a => [a.id, a.nome]), req: true }, '')}</div>`}
      <div style="margin-bottom:10px"><label>O que aconteceu</label><select id="ev_tipo">${Object.entries(EV).map(([k, v]) => `<option value="${k}" ${k === e.tipo ? 'selected' : ''}>${v.ic} ${v.nome}</option>`).join('')}</select></div>
      ${st.ciclo && !id ? `<p class="muted" style="margin-top:0">Situação atual: ${tagSituacao(st)} ${detalheSituacao(st)}</p>` : ''}
      <div class="grid">${fs.map(({ f, v }) => field(f, v)).join('')}</div>
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" class="sec" data-x>Cancelar</button><button type="submit">Salvar</button></div></form>`;
    m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => m.remove());
    const sel = m.querySelector('#ev_tipo'); sel.onchange = () => { guardar(); e.tipo = sel.value; desenhar(); };
    const eg = m.querySelector('#f_egua'); if (eg) eg.onchange = () => { e.eguaId = eg.value; guardar(); desenhar(); };
    m.querySelector('form').onsubmit = salvar;
  };
  const guardar = () => { camposEvento(e.tipo, e, e.eguaId).forEach(({ f }) => { const el = m.querySelector('#f_' + f.k); if (el) e[f.k] = f.t === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value; }); };
  const salvar = async (ev) => {
    ev.preventDefault(); guardar();
    if (!e.eguaId) return avisar('Escolha a égua.');
    const { potroNome, potroSexo, potroPelagem, ...rec } = e;
    if (!rec.criadoEm) rec.criadoEm = new Date().toISOString();
    const salvo = DB.upsert('eventos', rec);
    // coleta com embrião inovulado: cria o registro na receptora
    if (rec.tipo === 'COLETA' && rec.receptoraId && /recuperado/.test(rec.resultado || '')) {
      const idIno = salvo.id + '-ino';
      DB.upsert('eventos', { ...(DB.get('eventos', idIno) || { criadoEm: new Date().toISOString() }), id: idIno, origem: salvo.id, eguaId: rec.receptoraId, tipo: 'INOVULACAO', data: rec.data, doadoraId: rec.eguaId, garanhaoId: rec.garanhaoId || '', garanhaoExterno: rec.garanhaoExterno || '' });
    }
    // parto com potro: cadastra o animal
    if (rec.tipo === 'PARTO' && !id && potroNome && rec.resultado === 'Nascido vivo') {
      const cic = situacaoEgua(rec.eguaId); // já sem ciclo; pega o ciclo anterior ao parto
      const ult = evDa(rec.eguaId).filter(x => (x.tipo === 'COBERTURA' || x.tipo === 'INOVULACAO') && x.data <= rec.data).pop() || {};
      const mae = ult.tipo === 'INOVULACAO' ? ult.doadoraId : rec.eguaId, maeA = animal(mae) || {};
      const potro = DB.upsert('animais', { nome: potroNome, sexo: potroSexo || 'Macho', pelagem: potroPelagem || '', nascimento: rec.data, raca: maeA.raca || '', maeId: mae, paiId: ult.garanhaoId || '', categoria: potroSexo === 'Fêmea' ? 'Potra' : 'Potro', status: 'Ativo', posse: 'Próprio', pesoRateio: 0.5, dataEntrada: rec.data, origem: 'Nascido no haras', criador: DB.data.config.haras, aVenda: 'Não', obs: ult.tipo === 'INOVULACAO' ? `Gerado por TE na receptora ${aname(rec.eguaId)}` : '' });
      DB.upsert('movimentacoes', { animalId: potro.id, tipo: 'Entrada', data: rec.data, motivo: 'Nascimento', origemDestino: DB.data.config.haras });
      DB.upsert('eventos', { ...salvo, potroId: potro.id }); void cic;
    }
    m.remove(); render();
  };
  document.body.appendChild(m); desenhar();
};
window.excluirEvento = async (id) => {
  const e = DB.get('eventos', id); if (!(await confirmar(`Excluir o registro "${EV[e.tipo]?.nome}" de ${fdate(e.data)}?`, 'Excluir', true))) return;
  DB.remove('eventos', id); render();
};

// ---------- linha do tempo (por ano, em ordem cronológica) ----------
function descricaoEvento(e) {
  const g = nomeGar(e);
  switch (e.tipo) {
    case 'COBERTURA': return `${esc(e.metodo || 'Cobertura')}${g ? ' com <b>' + esc(g) + '</b>' : ''}`;
    case 'INOVULACAO': return `Recebeu embrião de <b>${esc(aname(e.doadoraId) || '?')}</b>${g ? ' × ' + esc(g) : ''}`;
    case 'COLETA': return `${esc(e.resultado || '')}${e.qtd ? ` (${e.qtd})` : ''}${g ? ' · ' + esc(g) : ''}${e.receptoraId ? ` → inovulado em <b>${esc(aname(e.receptoraId))}</b>` : ''}`;
    case 'DG': return `<b>${esc(e.resultado || '')}</b>`;
    case 'RECONF': return `<b>${esc(e.resultado || '')}</b>`;
    case 'PERDA': return `<b>${esc(e.resultado || 'Perda')}</b>`;
    case 'PARTO': return `${esc(e.resultado || 'Parto')}${e.potroId ? ` · potro: <a href="#" onclick="location.hash='animais';setTimeout(()=>{state.animalId='${e.potroId}';state.tab='dados';render()});return false">${esc(aname(e.potroId))}</a>` : ''}`;
    case 'VAZIA': return 'Égua liberada como vazia';
    default: return esc(e.resultado || '');
  }
}
window.timelineEgua = (id) => {
  const evs = evDa(id), st = situacaoEgua(id);
  const anos = {}; evs.forEach(e => (anos[(e.data || '????').slice(0, 4)] = anos[(e.data || '????').slice(0, 4)] || []).push(e));
  const ciclos = ciclosDe(id);
  const resumoAno = (a) => { const cs = ciclos.filter(c => c.data.startsWith(a)); const n = (f) => cs.filter(f).length; return cs.length ? `${n(() => true)} cobertura(s)/inovulação(ões) · ${n(c => c.dgPos)} prenhez(es) · ${n(c => c.perda)} perda(s) · ${n(c => c.parto)} parto(s)` : ''; };
  const acoes = st.status === 'Aguardando DG' ? [['DG', '🔍 Registrar diagnóstico'], ['PERDA', '⚠️ Perda']] : st.status === 'Prenhe' ? [['RECONF', '✅ Reconfirmação'], ['PERDA', '⚠️ Perda / absorção'], ['PARTO', '🍼 Registrar parto']] : [['COBERTURA', '🐎 Cobertura / inseminação'], ['COLETA', '🧪 Coleta de embrião'], ['INOVULACAO', '🥚 Inovulação']];
  return `<div class="card" style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><div>${tagSituacao(st)} ${detalheSituacao(st)}</div>
      <div class="row">${acoes.map(([t, l]) => `<button class="sec" onclick="novoEvento('${id}','${t}')">${l}</button>`).join('')}<button onclick="novoEvento('${id}','OUTRO')">+ Outro registro</button></div></div></div>
    ${Object.keys(anos).sort().reverse().map(a => `<div class="card"><h3 style="margin-bottom:4px">${a}</h3><p class="muted" style="margin-top:0">${resumoAno(a)}</p>
      ${table([['Data', e => `<b>${fdate(e.data)}</b>`], ['', e => EV[e.tipo]?.ic || ''], ['Registro', e => `<b>${EV[e.tipo]?.nome || e.tipo}</b><br>${descricaoEvento(e)}`], ['Obs.', e => esc(e.obs || '') + (e.responsavel ? `<br><small class="muted">${esc(e.responsavel)}</small>` : '') + (e.custo ? `<br><small class="muted">${brl(e.custo)}</small>` : '')]],
        anos[a], e => `<button class="lnk" onclick="novoEvento('${e.eguaId}',null,'${e.id}')">Editar</button><button class="del" onclick="excluirEvento('${e.id}')">Excluir</button>`)}</div>`).join('') || '<div class="card"><p class="muted">Nenhum registro ainda. Use os botões acima para começar o histórico desta égua.</p></div>'}`;
};

// ---------- tela Reprodução ----------
V.reproducao = () => {
  migrarRepro();
  if (state.reproEgua && animal(state.reproEgua)) {
    const a = animal(state.reproEgua);
    return `<div class="card row" style="justify-content:space-between"><div><button class="sec" onclick="state.reproEgua=null;render()">← Todas as éguas</button> <b style="font-size:20px;margin-left:8px">${esc(a.nome)}</b> <span class="muted">${esc(a.categoria || '')}${a.nascimento ? ' · ' + idade(a.nascimento) : ''}</span></div>
      <button class="sec" onclick="location.hash='animais';setTimeout(()=>{state.animalId='${a.id}';state.tab='dados';render()})">Ficha completa</button></div>` + timelineEgua(a.id);
  }
  const t = state.rtab || 'eguas';
  const abas = `<div class="tabs">${[['eguas', 'Éguas'], ['estatisticas', 'Estatísticas']].map(([k, l]) => `<button class="${t === k ? 'on' : ''}" onclick="state.rtab='${k}';render()">${l}</button>`).join('')}</div>`;
  if (t === 'estatisticas') return abas + estatisticasRepro();
  const potras = !!state.rPotras, fl = state.rFiltro || 'todas';
  let L = eguasRepro().filter(a => potras || !a.nascimento || -daysUntil(a.nascimento) >= 730 || evDa(a.id).length).map(a => ({ a, st: situacaoEgua(a.id) }));
  const cnt = (f) => L.filter(f).length;
  const FIL = { todas: ['Todas', () => true], prenhes: ['Prenhes', x => x.st.status === 'Prenhe'], dg: ['Aguardando diagnóstico', x => x.st.status === 'Aguardando DG'], vazias: ['Vazias', x => x.st.status === 'Vazia'], receptoras: ['Receptoras', x => x.a.categoria === 'Receptora'], doadoras: ['Doadoras / matrizes', x => x.a.categoria !== 'Receptora'] };
  const ordem = { Prenhe: 0, 'Aguardando DG': 1, Vazia: 2 };
  const vis = L.filter(FIL[fl][1]).sort((x, y) => ordem[x.st.status] - ordem[y.st.status] || (x.st.prevParto || '').localeCompare(y.st.prevParto || '') || x.a.nome.localeCompare(y.a.nome));
  const proxPartos = L.filter(x => x.st.prevParto && daysUntil(x.st.prevParto) <= 60).length;
  return abas + `<div class="kpis"><div class="kpi"><small>Éguas</small><b>${L.length}</b></div><div class="kpi"><small>Prenhes</small><b style="color:var(--ok)">${cnt(x => x.st.status === 'Prenhe')}</b><small>${proxPartos} parto(s) nos próximos 60 dias</small></div><div class="kpi"><small>Aguardando diagnóstico</small><b>${cnt(x => x.st.status === 'Aguardando DG')}</b><small>${cnt(x => x.st.status === 'Aguardando DG' && x.st.dias >= 14)} já podem ser examinadas</small></div><div class="kpi"><small>Vazias</small><b>${cnt(x => x.st.status === 'Vazia')}</b></div></div>
  <div class="card"><div class="row" style="margin-bottom:10px">${Object.entries(FIL).map(([k, [l]]) => `<button class="${fl === k ? '' : 'sec'}" onclick="state.rFiltro='${k}';render()">${l}</button>`).join('')}
    <label style="margin:0 0 0 8px;display:flex;gap:6px;align-items:center"><input type="checkbox" style="width:auto" ${potras ? 'checked' : ''} onchange="state.rPotras=this.checked;render()"> mostrar potras (menos de 2 anos)</label></div>
  ${table([
    ['Égua', x => `<a href="#" onclick="state.reproEgua='${x.a.id}';render();return false"><b>${esc(x.a.nome)}</b></a><br><small class="muted">${esc(x.a.categoria || '')}${x.a.nascimento ? ' · ' + idade(x.a.nascimento) : ''}</small>`],
    ['Situação', x => tagSituacao(x.st)], ['Detalhes', x => detalheSituacao(x.st)],
  ], vis, x => { const p = x.st.status === 'Aguardando DG' ? ['DG', 'Diagnóstico'] : x.st.status === 'Prenhe' ? (x.st.dias >= 300 ? ['PARTO', 'Parto'] : ['RECONF', 'Reconfirmar']) : ['COBERTURA', 'Cobertura'];
    return `<button class="lnk" onclick="novoEvento('${x.a.id}','${p[0]}')">+ ${p[1]}</button><button class="lnk" onclick="state.reproEgua='${x.a.id}';render()">Histórico</button>`; })}
  <p class="muted">Clique na égua para ver o histórico completo, ano a ano. A situação é calculada pelos registros: depois do parto ou de uma perda ela volta a ficar vazia.</p></div>`;
};
function estatisticasRepro() {
  const todos = eguasRepro().concat(DB.list('animais').filter(a => a.sexo === 'Fêmea' && !eguasRepro().includes(a))).flatMap(a => ciclosDe(a.id));
  const anos = [...new Set(todos.map(c => c.data.slice(0, 4)))].sort().reverse();
  const linha = (cs) => { const n = f => cs.filter(f).length, com = cs.filter(c => c.dgPos || c.dgNeg || c.perda || c.parto); return { c: cs.length, p: n(c => c.dgPos), l: n(c => c.perda), pa: n(c => c.parto), taxa: com.length ? Math.round(n(c => c.dgPos) / com.length * 100) + '%' : '—' }; };
  const porGar = {}; todos.forEach(c => (porGar[c.garanhao] = porGar[c.garanhao] || []).push(c));
  const cols = [['Coberturas / inovulações', r => r.c], ['Prenhezes', r => r.p], ['Perdas', r => r.l], ['Partos', r => r.pa], ['Taxa de prenhez', r => r.taxa]];
  return `<div class="card"><h3>Por ano</h3>${table([['Ano', r => `<b>${r.ano}</b>`], ...cols], anos.map(a => ({ ano: a, ...linha(todos.filter(c => c.data.startsWith(a))) })))}</div>
    <div class="card"><h3>Por garanhão</h3>${table([['Garanhão', r => `<b>${esc(r.g)}</b>`], ...cols], Object.entries(porGar).map(([g, cs]) => ({ g, ...linha(cs) })).sort((a, b) => b.c - a.c))}
    <p class="muted">Taxa de prenhez = prenhezes ÷ coberturas que já têm resultado (diagnóstico, perda ou parto).</p></div>`;
}

// custos dos registros reprodutivos entram como custo direto da égua
(function () {
  const orig = calcCustos;
  calcCustos = function (ini, fim) {
    const out = orig(ini, fim);
    DB.list('eventos').filter(e => Number(e.custo) && e.data >= ini && e.data <= fim).forEach(e => {
      const r = out[e.eguaId] || (out[e.eguaId] = { dias: diasPresente(animal(e.eguaId) || {}, ini, fim), diretos: 0, rateio: 0, receitas: 0, itens: [] });
      r.diretos += Number(e.custo); r.itens.push({ data: e.data, origem: 'Reprodução', desc: EV[e.tipo]?.nome || e.tipo, v: -Number(e.custo) });
    });
    return out;
  };
})();
