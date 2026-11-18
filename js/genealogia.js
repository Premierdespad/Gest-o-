// Árvore genealógica: preenchimento manual ou importação de um print/PDF da consulta da ABCCMM.
// Posições: p = pai, m = mãe; "pm" = mãe do pai, "mpp" = pai do pai da mãe, etc.
const POS_ARVORE = ['p', 'm', 'pp', 'pm', 'mp', 'mm', 'ppp', 'ppm', 'pmp', 'pmm', 'mpp', 'mpm', 'mmp', 'mmm'];
const NOMES_POS = { p: 'Pai', m: 'Mãe', pp: 'Avô paterno', pm: 'Avó paterna', mp: 'Avô materno', mm: 'Avó materna',
  ppp: 'Pai do avô paterno', ppm: 'Mãe do avô paterno', pmp: 'Pai da avó paterna', pmm: 'Mãe da avó paterna',
  mpp: 'Pai do avô materno', mpm: 'Mãe do avô materno', mmp: 'Pai da avó materna', mmm: 'Mãe da avó materna' };
const nomePos = (k) => NOMES_POS[k];
const sexoPos = (k) => (k.endsWith('p') ? 'Macho' : 'Fêmea');

// árvore atual de um animal, a partir dos vínculos pai/mãe
function arvoreAtual(id) {
  const out = {}, ir = (aid, pref) => { const a = animal(aid); if (!a || pref.length >= 3) return; [['p', a.paiId], ['m', a.maeId]].forEach(([l, x]) => { const k = pref + l, an = animal(x); if (an) { out[k] = { nome: an.nome, registro: an.registro || '' }; ir(an.id, k); } }); };
  ir(id, ''); return out;
}

// localiza um animal já cadastrado (pelo registro ou pelo nome) ou cria um "de fora" só para a genealogia
function resolverAncestral(nome, registro, sexo) {
  nome = String(nome || '').trim(); registro = String(registro || '').trim();
  if (!nome) return '';
  const reg = registro.replace(/\D/g, '').replace(/^0+/, '');
  let a = reg && DB.list('animais').find(x => String(x.registro || '').replace(/\D/g, '').replace(/^0+/, '') === reg);
  if (!a) a = nomeRepetido(nome);
  if (a) { if (registro && !a.registro) DB.upsert('animais', { ...a, registro }); return a.id; }
  return DB.upsert('animais', { nome, registro, sexo, status: 'Externo', posse: 'Próprio', categoria: sexo === 'Macho' ? 'Garanhão' : 'Matriz', origem: 'Genealogia (ABCCMM)' }).id;
}

// ---------- leitura do print/PDF com o Claude ----------
async function arquivoParaImagens(f) {
  if (/pdf/.test(f.type) || /\.pdf$/i.test(f.name)) {
    const lib = await carregarPdfJs(), pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise, out = [];
    for (let n = 1; n <= Math.min(pdf.numPages, 2); n++) {
      const pg = await pdf.getPage(n), v0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: Math.min(2.5, 1800 / v0.width) });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      out.push(await new Promise(r => c.toBlob(r, 'image/png')));
    }
    return out;
  }
  // foto/print: reduz se for muito grande
  const img = await new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = URL.createObjectURL(f); });
  const esc_ = Math.min(1, 2000 / Math.max(img.width, img.height)); if (esc_ === 1 && f.size < 3e6) return [f];
  const c = document.createElement('canvas'); c.width = img.width * esc_; c.height = img.height * esc_; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return [await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9))];
}
const PROMPT_ABCCMM = `As imagens são a consulta de genealogia de um cavalo Mangalarga Marchador (site da ABCCMM, certificado de registro ou pedigree).
Extraia exatamente o que está escrito (não invente nem complete nomes). Responda SOMENTE com JSON neste formato:
{"animal":{"nome":"","registro":"","sexo":"Macho|Fêmea|","nascimento":"AAAA-MM-DD ou vazio","pelagem":""},
 "arvore":{"p":{"nome":"","registro":""},"m":{...},"pp":{...},"pm":{...},"mp":{...},"mm":{...},"ppp":{...},"ppm":{...},"pmp":{...},"pmm":{...},"mpp":{...},"mpm":{...},"mmp":{...},"mmm":{...}}}
Códigos da árvore: p = pai, m = mãe do animal. Cada letra a mais sobe uma geração, lendo da esquerda para a direita: "pp" = pai do pai (avô paterno), "pm" = mãe do pai (avó paterna), "mp" = pai da mãe, "mm" = mãe da mãe, "ppp" = pai do avô paterno, "ppm" = mãe do avô paterno, "pmp" = pai da avó paterna, "pmm" = mãe da avó paterna, "mpp" = pai do avô materno, "mpm" = mãe do avô materno, "mmp" = pai da avó materna, "mmm" = mãe da avó materna.
Registro: só o número/código de registro (ex.: "0154356" ou "MM-123"). Use "" quando a informação não aparecer.`;
async function lerGenealogiaComClaude(arquivos, aviso) {
  const sample = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('sample') : null;
  if (!sample) throw new Error('a leitura automática só funciona com o sistema aberto pelo link do Claude. Use “Preencher manualmente”.');
  const lim = await sample.limits().catch(() => null);
  if (!lim?.images) throw new Error('a leitura de imagens não está liberada nesta tela. Use “Preencher manualmente”.');
  aviso('Preparando as imagens...');
  let imgs = []; for (const f of arquivos) imgs = imgs.concat(await arquivoParaImagens(f));
  imgs = imgs.slice(0, lim.images.maxCount || 4);
  aviso('Lendo a genealogia... (pode levar alguns segundos)');
  return sample.json(PROMPT_ABCCMM, { images: imgs, modelTier: 'default' });
}

// ---------- tela de revisão (manual ou depois da leitura) ----------
window.editarArvore = (id, modoImportar) => {
  const a = animal(id), atual = arvoreAtual(id), m = document.createElement('div'); m.className = 'modal';
  const caixa = (k) => `<div style="border:1px solid var(--line);border-left:4px solid ${k.endsWith('p') ? '#4a78b5' : '#c0577d'};border-radius:8px;padding:6px 8px;background:#fffaf3">
      <small class="muted">${nomePos(k)}</small><input data-k="${k}" data-c="nome" placeholder="Nome" value="${esc(atual[k]?.nome || '')}" style="margin:3px 0"><input data-k="${k}" data-c="registro" placeholder="Registro" value="${esc(atual[k]?.registro || '')}" style="font-size:12px;padding:5px 8px"></div>`;
  m.innerHTML = `<form class="box" style="max-width:1100px"><div class="top"><h3 style="margin:0">🌳 Árvore genealógica · ${esc(a.nome)}</h3><button type="button" class="sec" data-x>Fechar</button></div>
    <div class="card" style="background:var(--bg);margin-bottom:12px"><b>Importar da ABCCMM:</b> consulte o animal no site da ABCCMM, salve a página (print da tela ou "Imprimir → Salvar como PDF") e escolha o arquivo aqui. O sistema lê e preenche a árvore para você conferir.
      <div class="row" style="margin-top:8px"><input type="file" id="gn_arq" accept="image/*,application/pdf" multiple style="max-width:340px"><button type="button" id="gn_ler">📄 Ler arquivo</button><button type="button" class="sec" onclick="verABCCMM('${id}')">🔎 Abrir ABCCMM</button>
      <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="gn_anexar" checked style="width:auto"> guardar o arquivo nos anexos do animal</label></div>
      <p class="muted" id="gn_msg" style="margin:6px 0 0"></p><div id="gn_extra"></div></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;align-items:center;overflow-x:auto;min-width:0">
      <div style="display:grid;gap:8px">${['p', 'm'].map(caixa).join('')}</div>
      <div style="display:grid;gap:8px">${['pp', 'pm', 'mp', 'mm'].map(caixa).join('')}</div>
      <div style="display:grid;gap:6px">${['ppp', 'ppm', 'pmp', 'pmm', 'mpp', 'mpm', 'mmp', 'mmm'].map(caixa).join('')}</div></div>
    <p class="muted">Ao salvar, cada nome é ligado ao animal já cadastrado (pelo registro ou pelo nome). Quem não existir é criado como "pai/garanhão de fora", só para a genealogia — não entra no plantel.</p>
    <div class="row" style="justify-content:flex-end"><button type="button" class="sec" data-x>Cancelar</button><button type="submit">Salvar árvore</button></div></form>`;
  document.body.appendChild(m);
  const $m = (s) => m.querySelector(s), msg = (t) => { $m('#gn_msg').textContent = t; };
  let animalLido = null;
  m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => m.remove());
  $m('#gn_ler').onclick = async () => {
    const fs = [...$m('#gn_arq').files]; if (!fs.length) return avisar('Escolha o print ou o PDF da consulta da ABCCMM.');
    $m('#gn_ler').disabled = true;
    try {
      const r = await lerGenealogiaComClaude(fs, msg), arv = r?.arvore || {};
      let n = 0; POS_ARVORE.forEach(k => { const x = arv[k] || {}; if (x.nome) { m.querySelector(`[data-k="${k}"][data-c="nome"]`).value = String(x.nome).trim(); m.querySelector(`[data-k="${k}"][data-c="registro"]`).value = String(x.registro || '').trim(); n++; } });
      animalLido = r?.animal || null;
      msg(n ? `Li ${n} de 14 posições. Confira os nomes e registros antes de salvar.` : 'Não encontrei a genealogia no arquivo. Confira se é a página certa ou preencha manualmente.');
      if (animalLido && animalLido.nome && chaveNome(animalLido.nome) !== chaveNome(a.nome)) $m('#gn_extra').innerHTML = `<p class="tag bad" style="display:inline-block;margin-top:6px">Atenção: o arquivo parece ser de “${esc(animalLido.nome)}”, não de ${esc(a.nome)}.</p>`;
      else if (animalLido) { const falt = [['registro', 'Registro'], ['nascimento', 'Nascimento'], ['pelagem', 'Pelagem']].filter(([k]) => animalLido[k] && !a[k]); if (falt.length) $m('#gn_extra').innerHTML = `<label style="display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" id="gn_dados" checked style="width:auto"> completar no cadastro: ${falt.map(([k, l]) => `${l} ${esc(k === 'nascimento' ? fdate(animalLido[k]) : animalLido[k])}`).join(' · ')}</label>`; }
    } catch (e) { msg('Não consegui ler: ' + (e?.message || e?.code || e)); }
    $m('#gn_ler').disabled = false;
  };
  m.querySelector('form').onsubmit = async (ev) => {
    ev.preventDefault();
    const v = {}; POS_ARVORE.forEach(k => { v[k] = { nome: m.querySelector(`[data-k="${k}"][data-c="nome"]`).value.trim(), registro: m.querySelector(`[data-k="${k}"][data-c="registro"]`).value.trim() }; });
    if (POS_ARVORE.some(k => !v[k].nome && POS_ARVORE.some(f => f.length > k.length && f.startsWith(k) && v[f].nome))) {
      if (!(await confirmar('Há ancestrais preenchidos sem o filho correspondente (ex.: avô preenchido, mas o pai em branco). Eles serão ignorados. Salvar mesmo assim?', 'Salvar'))) return;
    }
    const ids = { '': id };
    for (const k of POS_ARVORE) { const pai = ids[k.slice(0, -1)]; if (!pai || !v[k].nome) continue; ids[k] = resolverAncestral(v[k].nome, v[k].registro, sexoPos(k)); }
    for (const k of POS_ARVORE) { const filho = ids[k.slice(0, -1)]; if (!filho || !ids[k]) continue; const f = animal(filho); DB.upsert('animais', { ...f, [k.endsWith('p') ? 'paiId' : 'maeId']: ids[k] }); }
    if ($m('#gn_dados')?.checked && animalLido) { const b = animal(id), up = {}; ['registro', 'nascimento', 'pelagem'].forEach(k => { if (animalLido[k] && !b[k]) up[k] = String(animalLido[k]).trim(); }); if (Object.keys(up).length) DB.upsert('animais', { ...b, ...up }); }
    const arqs = [...($m('#gn_arq').files || [])];
    if (arqs.length && $m('#gn_anexar').checked && typeof salvarArquivo === 'function') {
      for (const f of arqs) { try { const aid = 'anx-' + uid(), extra = (await salvarArquivo(aid, f)) || {}; DB.upsert('anexos', { id: aid, animalId: id, nome: f.name, mime: f.type || '', tamanho: f.size, data: today(), tipo: 'Registro / documento', obs: 'Genealogia ABCCMM', ...extra }); } catch (e) { /* anexo opcional */ } }
    }
    m.remove(); render();
  };
  if (modoImportar) setTimeout(() => $m('#gn_arq').click(), 50);
};
