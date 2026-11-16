// Dados na nuvem (quando o sistema é aberto pelo link do Claude).
// Cada registro vira um documento no banco do link: <coleção>/<id>. O navegador continua com uma cópia
// local (abre rápido e aguenta falta de internet), mas a nuvem é a fonte da verdade e todos os aparelhos
// recebem as mudanças ao vivo. Os anexos vão para o armazenamento de arquivos do link.
const NUVEM = { db: null, assets: null, ativo: false, iniciado: null, sinc: {}, sincMeta: {}, enviando: false, sujo: false, pendentes: 0, erro: '', subs: [] };
const COLS_NUVEM = ['animais', 'biometria', 'movimentacoes', 'reproducao', 'sanidade', 'financeiro', 'estoque', 'negocios', 'socios', 'anexos', 'usuarios', 'eventos'];
const META_NUVEM = ['config', 'site', 'centrosCusto'];

// JSON com chaves em ordem: a mesma informação sempre gera o mesmo texto
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(x => x === undefined ? 'null' : canon(x)).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const semK = (o) => { const { _k, ...r } = o || {}; return r; };
function metaLocal(nome) {
  if (nome === 'config') { const { usuarioAtual, ...c } = DB.data.config || {}; return c; } // usuário escolhido é de cada aparelho
  if (nome === 'centrosCusto') return { itens: DB.data.centrosCusto || [] };
  return DB.data[nome] || {};
}
function aplicarMeta(nome, corpo) {
  if (nome === 'config') DB.data.config = { ...corpo, usuarioAtual: DB.data.config?.usuarioAtual || null };
  else if (nome === 'centrosCusto') DB.data.centrosCusto = corpo.itens || [];
  else DB.data[nome] = corpo;
}
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
async function comRetentativa(fn) {
  for (let t = 0; ; t++) {
    try { return await fn(); } catch (e) {
      if ((e?.code === 'resource_exhausted' || e?.code === 'unavailable' || e?.code === 'rate_limited' || e?.code === 'store_unavailable') && t < 6) { await esperar(800 * 2 ** t + Math.random() * 400); continue; }
      throw e;
    }
  }
}
// Executa operações com poucas em paralelo
async function emLotes(ops, paralelo = 4, aoAvancar) {
  let i = 0, feitos = 0;
  const trab = async () => { while (i < ops.length) { const op = ops[i++]; await comRetentativa(op); feitos++; aoAvancar && aoAvancar(feitos, ops.length); } };
  await Promise.all(Array.from({ length: Math.min(paralelo, ops.length) }, trab));
}

// ---------- envio das alterações locais ----------
function diferencas() {
  const ops = [];
  for (const col of COLS_NUVEM) {
    const sinc = NUVEM.sinc[col] || (NUVEM.sinc[col] = new Map()), vistos = new Set();
    for (const r of DB.list(col)) {
      if (!r || !r.id) continue; vistos.add(r.id);
      const c = canon(r);
      if (sinc.get(r.id) !== c) ops.push({ col, id: r.id, corpo: { ...JSON.parse(JSON.stringify(r)), _k: r.id }, c });
    }
    for (const id of sinc.keys()) if (!vistos.has(id)) ops.push({ col, id, apagar: true });
  }
  for (const m of META_NUVEM) { const c = canon(metaLocal(m)); if (NUVEM.sincMeta[m] !== c) ops.push({ meta: m, corpo: JSON.parse(JSON.stringify(metaLocal(m))), c }); }
  return ops;
}
async function enviarNuvem() {
  if (!NUVEM.ativo) return;
  if (NUVEM.enviando) { NUVEM.sujo = true; return; }
  NUVEM.enviando = true; NUVEM.sujo = false;
  try {
    const ops = diferencas(); NUVEM.pendentes = ops.length; if (ops.length) indicadorNuvem();
    await emLotes(ops.map(o => async () => {
      if (o.meta) { await NUVEM.db.doc('meta/' + o.meta).set(o.corpo); NUVEM.sincMeta[o.meta] = o.c; }
      else if (o.apagar) { await NUVEM.db.doc(o.col + '/' + o.id).delete(); NUVEM.sinc[o.col].delete(o.id); }
      else { await NUVEM.db.doc(o.col + '/' + o.id).set(o.corpo); NUVEM.sinc[o.col].set(o.id, o.c); }
      NUVEM.pendentes--;
    }), 4);
    NUVEM.erro = '';
  } catch (e) {
    NUVEM.erro = e?.code === 'quota_exceeded' ? 'O espaço do banco na nuvem acabou.' : 'Não consegui salvar na nuvem (' + (e?.code || e?.message || 'erro') + '). Vou tentar de novo.';
    if (e?.code !== 'quota_exceeded' && e?.code !== 'invalid_argument') setTimeout(enviarNuvem, 15000);
  }
  NUVEM.enviando = false; indicadorNuvem();
  if (NUVEM.sujo) enviarNuvem();
}
let _timerNuvem = null;
(function () {
  const anterior = DB.save.bind(DB);
  DB.save = function () { anterior(); if (NUVEM.ativo) { clearTimeout(_timerNuvem); _timerNuvem = setTimeout(enviarNuvem, 600); } };
})();

// ---------- recebimento ao vivo ----------
let _timerRender = null;
const renderLogo = () => { clearTimeout(_timerRender); _timerRender = setTimeout(() => { try { localStorage.setItem(DB_KEY, JSON.stringify(DB.data)); } catch (e) { /* cache opcional */ } render(); }, 400); };
function assinar() {
  const carregadas = new Set(), total = COLS_NUVEM.length + 1;
  return new Promise((pronto) => {
    const marcar = (k) => { if (!carregadas.has(k)) { carregadas.add(k); if (carregadas.size === total) pronto(); } };
    COLS_NUVEM.forEach(col => {
      const un = NUVEM.db.collection(col).onSnapshot(snap => {
        const sinc = NUVEM.sinc[col] || (NUVEM.sinc[col] = new Map());
        if (!carregadas.has(col)) {
          if (snap.metadata.fromCache) return; // espera a versão confirmada pela nuvem
          DB.data[col] = snap.docs.map(d => semK(JSON.parse(JSON.stringify(d.data()))));
          sinc.clear(); DB.data[col].forEach(r => sinc.set(r.id, canon(r)));
          marcar(col); return;
        }
        let mudou = false;
        for (const ch of snap.docChanges()) {
          if (ch.doc.metadata.hasPendingWrites) continue;
          const id = ch.doc.id, lista = DB.list(col), i = lista.findIndex(r => r.id === id);
          const localIgualSinc = i < 0 || canon(lista[i]) === sinc.get(id); // não sobrescreve o que este aparelho ainda vai enviar
          if (ch.type === 'removed') { if (i >= 0 && localIgualSinc) { lista.splice(i, 1); mudou = true; } sinc.delete(id); continue; }
          const rec = semK(JSON.parse(JSON.stringify(ch.doc.data()))), c = canon(rec);
          if (sinc.get(id) === c) continue;
          if (localIgualSinc) { if (i >= 0) lista[i] = rec; else lista.push(rec); mudou = true; }
          sinc.set(id, c);
        }
        if (mudou && NUVEM.ativo) renderLogo();
      }, err => { NUVEM.erro = 'Conexão com a nuvem interrompida (' + err.code + '). Recarregue a página.'; indicadorNuvem(); });
      NUVEM.subs.push(un);
    });
    const unm = NUVEM.db.collection('meta').onSnapshot(snap => {
      if (snap.metadata.fromCache && !carregadas.has('meta')) return;
      let mudou = false;
      for (const d of snap.docs) {
        if (!META_NUVEM.includes(d.id) || d.metadata.hasPendingWrites) continue;
        const corpo = JSON.parse(JSON.stringify(d.data())), c = canon(corpo);
        if (NUVEM.sincMeta[d.id] === c) continue;
        if (!carregadas.has('meta') || canon(metaLocal(d.id)) === NUVEM.sincMeta[d.id]) { aplicarMeta(d.id, corpo); mudou = true; }
        NUVEM.sincMeta[d.id] = c;
      }
      if (!carregadas.has('meta')) marcar('meta'); else if (mudou && NUVEM.ativo) renderLogo();
    }, () => {});
    NUVEM.subs.push(unm);
  });
}

// ---------- início ----------
async function iniciarNuvem() {
  if (!window.claude || typeof window.claude.use !== 'function') return;
  let db; try { db = await window.claude.use('db'); } catch (e) { db = null; }
  if (!db) return;
  if (typeof SYNC !== 'undefined' && SYNC.modo === 'servidor') return; // servidor próprio tem prioridade
  NUVEM.db = db;
  try { NUVEM.assets = await window.claude.use('assets'); } catch (e) { NUVEM.assets = null; }
  if (typeof SYNC !== 'undefined') SYNC.modo = 'nuvem';
  indicadorNuvem('Conectando à nuvem...');
  const timer = setTimeout(() => { if (!NUVEM.ativo) indicadorNuvem('⚠ A nuvem ainda não respondeu. Usando os dados deste aparelho.'); }, 10000);
  let est;
  try { est = await comRetentativa(() => db.doc('meta/estado').get()); } catch (e) { clearTimeout(timer); NUVEM.erro = 'Não consegui ler a nuvem (' + (e?.code || 'erro') + ').'; indicadorNuvem(); return; }
  NUVEM.iniciado = est.exists && est.data()?.iniciado;
  if (!NUVEM.iniciado) {
    clearTimeout(timer); indicadorNuvem(); render();
    // se outro aparelho enviar os dados, este passa a usar a nuvem sozinho
    const un = db.doc('meta/estado').onSnapshot(s => { if (s.exists && s.data()?.iniciado && !NUVEM.ativo && !NUVEM.migrando) { un(); NUVEM.iniciado = true; ligarNuvem(); } }, () => {});
    return;
  }
  await ligarNuvem(); clearTimeout(timer);
}
async function ligarNuvem() {
  await assinar();
  NUVEM.ativo = true;
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB.data)); } catch (e) { /* cache opcional */ }
  indicadorNuvem(); render();
  enviarNuvem(); // completa campos novos (ex.: migração de versão)
}
const ID_APARELHO = (() => { try { let i = sessionStorage.getItem('cn_aparelho'); if (!i) sessionStorage.setItem('cn_aparelho', i = uid()); return i; } catch (e) { return uid(); } })();

// Primeira vez: envia para a nuvem os dados que estão neste navegador
window.enviarParaNuvem = async () => {
  if (!NUVEM.db || NUVEM.iniciado || NUVEM.migrando) return;
  const n = (c) => DB.list(c).length;
  if (!(await confirmar(`Enviar os dados DESTE navegador para a nuvem?\n\n${DB.list('animais').filter(a => a.status !== 'Externo').length} animais · ${n('reproducao')} coberturas · ${n('negocios')} compras/vendas · ${n('financeiro')} lançamentos · ${n('anexos')} anexos\n\nFaça isso no aparelho onde você fez os lançamentos. Depois, todos os aparelhos passam a usar estes dados.`, 'Enviar'))) return;
  // confere de novo na hora do clique: outro aparelho pode ter enviado (ou estar enviando) os dados
  let est; try { est = (await NUVEM.db.doc('meta/estado').get()).data() || {}; } catch (e) { est = {}; }
  if (est.iniciado) { await avisar('Os dados já foram enviados para a nuvem por outro aparelho. Este aparelho vai passar a usar os dados da nuvem.'); NUVEM.iniciado = true; return ligarNuvem(); }
  if (est.iniciando && est.aparelho !== ID_APARELHO && Date.now() - new Date(est.em).getTime() < 15 * 60000) return avisar('Outro aparelho está enviando os dados para a nuvem agora. Espere alguns minutos: quando terminar, este aparelho passa a usar a nuvem sozinho.');
  const msg = (t) => { const el = document.getElementById('nuvemMsg'); if (el) el.textContent = t; indicadorNuvem(t); };
  NUVEM.migrando = true;
  try {
    await NUVEM.db.doc('meta/estado').set({ iniciando: true, iniciado: false, aparelho: ID_APARELHO, em: new Date().toISOString() });
    // 1) anexos guardados no navegador -> armazenamento de arquivos do link
    const semNuvem = DB.list('anexos').filter(x => !x.assetId);
    if (semNuvem.length && NUVEM.assets) {
      let k = 0;
      for (const x of semNuvem) {
        msg(`Enviando anexos: ${++k} de ${semNuvem.length}...`);
        try { const b = await ArqLocal.ler(x.id); if (b) { const r = await comRetentativa(() => NUVEM.assets.upload(b, b.type ? undefined : { type: x.mime || 'application/pdf' })); x.assetId = r.id; } } catch (e) { console.warn('anexo não enviado', x.nome, e); }
      }
      DB.save();
    }
    // 2) todos os registros
    const ops = diferencas();
    await emLotes(ops.map(o => async () => {
      if (o.meta) { await NUVEM.db.doc('meta/' + o.meta).set(o.corpo); NUVEM.sincMeta[o.meta] = o.c; }
      else if (!o.apagar) { await NUVEM.db.doc(o.col + '/' + o.id).set(o.corpo); NUVEM.sinc[o.col].set(o.id, o.c); }
    }), 4, (f, t) => msg(`Enviando dados: ${f} de ${t}...`));
    // 3) marca a nuvem como pronta e passa a escutar
    await NUVEM.db.doc('meta/estado').set({ iniciado: true, aparelho: ID_APARELHO, em: new Date().toISOString() });
    NUVEM.iniciado = true; NUVEM.migrando = false;
    await assinar(); NUVEM.ativo = true; msg('');
    alert('Pronto! Os dados estão na nuvem. Agora qualquer aparelho que abrir o link vê as mesmas informações.');
    render();
  } catch (e) { NUVEM.migrando = false; msg(''); alert('O envio parou no meio (' + (e?.code || e?.message) + '). Pode clicar de novo: o que já foi enviado não é duplicado.'); }
};

function indicadorNuvem(txt) {
  const el = document.getElementById('syncStatus'); if (!el || (typeof SYNC !== 'undefined' && SYNC.modo !== 'nuvem')) return;
  el.innerHTML = txt ? esc(txt)
    : NUVEM.erro ? `<span style="color:#ff8a80">⚠ ${esc(NUVEM.erro)}</span>`
    : NUVEM.ativo ? (NUVEM.pendentes > 0 ? `<span style="color:#d8b25f">●</span> Salvando na nuvem (${NUVEM.pendentes})...` : '<span style="color:#7fd19b">●</span> Salvo na nuvem · todos os aparelhos')
    : NUVEM.iniciado === false ? '<a href="#config" style="padding:0;border:0;background:none;color:#d8b25f">☁️ Ativar dados na nuvem →</a>' : 'Conectando à nuvem...';
}

// Cartão em Configurações
window.cartaoNuvem = () => {
  if (!NUVEM.db) return `<div class="card"><h3>☁️ Dados na nuvem</h3><p class="muted">A nuvem só funciona quando o sistema é aberto pelo link do Claude${typeof SYNC !== 'undefined' && SYNC.modo === 'servidor' ? ' (aqui os dados já estão no seu servidor)' : ''}.</p></div>`;
  if (NUVEM.ativo) return `<div class="card"><h3>☁️ Dados na nuvem</h3><p><span class="tag ok">Ativo</span> Tudo o que é lançado fica salvo na nuvem e aparece em todos os aparelhos que abrem o link.</p><p class="muted">Para dar acesso a um sócio ou funcionário, use o botão <b>Compartilhar</b> do link (com permissão para editar, se ele for lançar dados).</p></div>`;
  return `<div class="card" style="border-color:var(--brand2)"><h3>☁️ Ativar dados na nuvem</h3>
    <p>Hoje os dados estão só neste navegador. Ative a nuvem para usar o sistema em qualquer aparelho, com todos vendo as mesmas informações.</p>
    <p class="muted">Faça isso <b>no aparelho onde você fez os lançamentos</b>: os dados deste navegador (${DB.list('animais').filter(a => a.status !== 'Externo').length} animais, ${DB.list('negocios').length} compras/vendas, ${DB.list('financeiro').length} lançamentos, ${DB.list('anexos').length} anexos) serão enviados.</p>
    <button onclick="enviarParaNuvem()">☁️ Enviar meus dados para a nuvem</button> <span id="nuvemMsg" class="muted"></span></div>`;
};

setTimeout(iniciarNuvem, 0);
