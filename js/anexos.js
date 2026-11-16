// Anexos dos animais (boletos, contratos, GTA, exames...).
// Os dados de cada anexo (nome, tipo, animal, negócio, parcela) ficam em DB.data.anexos, junto com o resto do sistema.
// O ARQUIVO em si fica:
//  - com servidor (server/crina_server.py): no servidor, em /api/arquivo/<id>;
//  - sem servidor: no IndexedDB deste navegador (aguenta PDFs e fotos, ao contrário do localStorage).
const ANEXO_TIPOS = ['Boleto', 'Comprovante de pagamento', 'Contrato', 'Nota / recibo', 'GTA', 'Registro / documento', 'Exame', 'Foto', 'Outro'];
const ANEXO_MAX = 25 * 1024 * 1024;

const ArqLocal = {
  _db: null,
  abrir() {
    if (this._db) return this._db;
    this._db = new Promise((ok, err) => {
      let r; try { r = indexedDB.open('cn_anexos', 1); } catch (e) { return err(e); }
      r.onupgradeneeded = () => r.result.createObjectStore('arquivos');
      r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error);
    });
    return this._db;
  },
  async op(modo, fn) { const db = await this.abrir(); return new Promise((ok, err) => { const tx = db.transaction('arquivos', modo); const req = fn(tx.objectStore('arquivos')); tx.oncomplete = () => ok(req && req.result); tx.onerror = () => err(tx.error); }); },
  salvar(id, blob) { return this.op('readwrite', s => s.put(blob, id)); },
  ler(id) { return this.op('readonly', s => s.get(id)); },
  apagar(id) { return this.op('readwrite', s => s.delete(id)); },
};
const noServidor = () => typeof SYNC !== 'undefined' && SYNC.modo === 'servidor';
async function salvarArquivo(id, blob) {
  if (!noServidor()) return ArqLocal.salvar(id, blob);
  const r = await fetch('api/arquivo/' + id, { method: 'PUT', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  if (!r.ok) throw new Error('o servidor recusou o arquivo (' + r.status + ')');
}
async function lerArquivo(id) {
  if (!noServidor()) return ArqLocal.ler(id);
  const r = await fetch('api/arquivo/' + id, { headers: { Authorization: 'Bearer ' + token() } });
  if (!r.ok) throw new Error('arquivo não encontrado no servidor');
  return r.blob();
}
async function apagarArquivo(id) {
  if (!noServidor()) return ArqLocal.apagar(id);
  await fetch('api/arquivo/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token() } });
}
const tamanho = (b) => b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const anexosDe = (filtro) => DB.list('anexos').filter(filtro).sort((a, b) => (b.data || '').localeCompare(a.data || ''));

// negócios do animal (compra/venda) para ligar o anexo a uma parcela
function negociosDoAnimal(id) { return DB.list('negocios').filter(n => n.animalId === id || n.doadoraId === id).sort((a, b) => b.data.localeCompare(a.data)); }

window.abaAnexos = (a) => {
  const L = anexosDe(x => x.animalId === a.id), ft = state.anxTipo || '';
  const vis = L.filter(x => !ft || x.tipo === ft);
  const negs = negociosDoAnimal(a.id);
  const parcelaTxt = (x) => { const n = x.negocioId && DB.get('negocios', x.negocioId); if (!n) return ''; return `${n.tipo} ${fdate(n.data)}` + (x.parcela ? ` · parcela ${x.parcela}${n.parcelasLista ? '/' + n.parcelasLista.length : ''}` : ''); };
  return `<div class="row" style="margin-bottom:12px"><button onclick="novoAnexo('${a.id}')">📎 Anexar arquivos</button>
      <select onchange="state.anxTipo=this.value;render()" style="max-width:240px"><option value="">Todos os tipos (${L.length})</option>${ANEXO_TIPOS.map(t => { const c = L.filter(x => x.tipo === t).length; return c ? `<option ${t === ft ? 'selected' : ''} value="${t}">${t} (${c})</option>` : ''; }).join('')}</select></div>
    ${table([
      ['Arquivo', x => `<a href="#" onclick="verAnexo('${x.id}');return false"><b>${/pdf/.test(x.mime) ? '📄' : /image/.test(x.mime) ? '🖼️' : '📎'} ${esc(x.nome)}</b></a><br><small class="muted">${tamanho(x.tamanho || 0)} · enviado em ${fdate(x.data)}</small>`],
      ['Tipo', x => `<span class="tag">${esc(x.tipo)}</span>`],
      ['Negócio / parcela', x => esc(parcelaTxt(x)) || '—'],
      ['Vencimento', x => x.vencimento ? fdate(x.vencimento) : '—'],
      ['Obs.', x => esc(x.obs || '')],
    ], vis, x => `<button class="lnk" onclick="verAnexo('${x.id}')">Ver</button><button class="lnk" onclick="baixarAnexo('${x.id}')">Baixar</button><button class="lnk" onclick="editarAnexo('${x.id}')">Editar</button><button class="del" onclick="excluirAnexo('${x.id}')">Excluir</button>`)}
    ${negs.length ? '' : '<p class="muted">Dica: com uma compra ou venda registrada para este animal, dá para ligar cada boleto à parcela certa.</p>'}
    <p class="muted">${noServidor() ? 'Os arquivos ficam guardados no servidor.' : 'Os arquivos ficam guardados neste navegador. Use “Exportar backup” em Configurações para levar junto com os dados.'}</p>`;
};

function camposAnexo(animalId, x = {}) {
  const negs = negociosDoAnimal(animalId);
  return `<div class="grid">
    <div><label>Tipo</label><select id="ax_tipo">${ANEXO_TIPOS.map(t => `<option ${t === (x.tipo || 'Boleto') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label>Negócio (compra/venda)</label><select id="ax_neg"><option value="">—</option>${negs.map(n => `<option value="${n.id}" ${n.id === x.negocioId ? 'selected' : ''}>${esc(n.tipo)} · ${fdate(n.data)} · ${brl(n.valor)}${n.contraparte ? ' · ' + esc(n.contraparte) : ''}</option>`).join('')}</select></div>
    <div><label>Nº da parcela</label><input id="ax_parc" type="number" min="1" step="1" value="${esc(x.parcela || '')}" placeholder="ex.: 5"></div>
    <div><label>Vencimento</label><input id="ax_venc" type="date" value="${esc(x.vencimento || '')}"></div>
    <div class="full"><label>Observação</label><input id="ax_obs" value="${esc(x.obs || '')}"></div></div>`;
}
function lerCamposAnexo(m) {
  const g = id => m.querySelector('#' + id).value;
  const negocioId = g('ax_neg'), parcela = Number(g('ax_parc')) || '';
  let vencimento = g('ax_venc');
  if (!vencimento && negocioId && parcela) vencimento = DB.get('negocios', negocioId)?.parcelasLista?.[parcela - 1]?.vencimento || '';
  return { tipo: g('ax_tipo'), negocioId, parcela, vencimento, obs: g('ax_obs') };
}

window.novoAnexo = (animalId, pre = {}) => {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<form class="box"><div class="top"><h3 style="margin:0">📎 Anexar em ${esc(aname(animalId))}</h3><button type="button" class="sec" data-x>Fechar</button></div>
    <label>Arquivos (PDF ou foto — pode escolher vários de uma vez)</label><input id="ax_arq" type="file" multiple accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" required style="margin-bottom:12px">
    ${camposAnexo(animalId, pre)}
    <p class="muted" style="margin-top:8px">Se escolher vários boletos de uma vez com o nº da parcela preenchido, eles são numerados em sequência (5, 6, 7...).</p>
    <p id="ax_msg" class="muted"></p>
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button type="button" class="sec" data-x>Cancelar</button><button type="submit">Salvar anexos</button></div></form>`;
  document.body.appendChild(m);
  m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => m.remove());
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const arqs = [...m.querySelector('#ax_arq').files]; if (!arqs.length) return;
    const grandes = arqs.filter(f => f.size > ANEXO_MAX); if (grandes.length) return alert(`Arquivo grande demais (máx. 25 MB): ${grandes.map(f => f.name).join(', ')}`);
    const base = lerCamposAnexo(m), msg = m.querySelector('#ax_msg'), btn = m.querySelector('[type=submit]'); btn.disabled = true;
    try {
      for (let i = 0; i < arqs.length; i++) {
        const f = arqs[i]; msg.textContent = `Salvando ${i + 1} de ${arqs.length}: ${f.name}...`;
        const parcela = base.parcela ? base.parcela + i : '';
        const venc = base.parcela && base.negocioId ? (DB.get('negocios', base.negocioId)?.parcelasLista?.[parcela - 1]?.vencimento || (i ? '' : base.vencimento)) : base.vencimento;
        const id = 'anx-' + uid();
        await salvarArquivo(id, f);
        DB.upsert('anexos', { id, animalId, nome: f.name, mime: f.type || '', tamanho: f.size, data: today(), ...base, parcela, vencimento: venc });
      }
      m.remove(); render();
    } catch (err) { btn.disabled = false; msg.textContent = ''; alert('Não consegui salvar o arquivo: ' + err.message); }
  };
};
window.editarAnexo = (id) => {
  const x = DB.get('anexos', id); const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<form class="box"><div class="top"><h3 style="margin:0">Editar: ${esc(x.nome)}</h3><button type="button" class="sec" data-x>Fechar</button></div>${camposAnexo(x.animalId, x)}
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button type="button" class="sec" data-x>Cancelar</button><button type="submit">Salvar</button></div></form>`;
  document.body.appendChild(m); m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => m.remove());
  m.querySelector('form').onsubmit = (e) => { e.preventDefault(); DB.upsert('anexos', { ...x, ...lerCamposAnexo(m) }); m.remove(); render(); };
};
window.excluirAnexo = async (id) => {
  const x = DB.get('anexos', id); if (!confirm(`Excluir o anexo "${x.nome}"? Isso não pode ser desfeito.`)) return;
  try { await apagarArquivo(id); } catch (e) { /* arquivo já não existia */ }
  DB.remove('anexos', id); render();
};
async function blobDoAnexo(id) {
  const x = DB.get('anexos', id), b = await lerArquivo(id);
  if (!b) throw new Error('o arquivo não está neste aparelho. Ele foi anexado em outro navegador ou aparelho.');
  return { x, b: b.type ? b : new Blob([b], { type: x.mime || 'application/octet-stream' }) };
}
window.baixarAnexo = async (id) => {
  try { const { x, b } = await blobDoAnexo(id); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = x.nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); }
  catch (e) { alert('Não foi possível abrir: ' + e.message); }
};
window.verAnexo = async (id) => {
  try {
    const { x, b } = await blobDoAnexo(id), url = URL.createObjectURL(b);
    const m = document.createElement('div'); m.className = 'modal';
    const corpo = /image/.test(b.type) ? `<img src="${url}" style="max-width:100%;border-radius:8px">` : /pdf/.test(b.type) ? `<iframe src="${url}" style="width:100%;height:70vh;border:1px solid var(--line);border-radius:8px"></iframe>` : '<p class="muted">Pré-visualização indisponível para este tipo de arquivo. Use “Baixar”.</p>';
    m.innerHTML = `<div class="box" style="max-width:960px"><div class="top"><h3 style="margin:0">${esc(x.nome)}</h3><div class="row"><button class="sec" id="ax_baixar">Baixar</button><button class="sec" data-x>Fechar</button></div></div>${corpo}</div>`;
    document.body.appendChild(m);
    m.querySelector('#ax_baixar').onclick = () => baixarAnexo(id);
    m.querySelectorAll('[data-x]').forEach(bt => bt.onclick = () => { m.remove(); URL.revokeObjectURL(url); });
  } catch (e) { alert('Não foi possível abrir: ' + e.message); }
};
// Na agenda de parcelas: anexos ligados a uma parcela
window.anexosDaParcela = (negocioId, parcela) => anexosDe(x => x.negocioId === negocioId && Number(x.parcela) === Number(parcela));

// ---------- backup com arquivos (modo local) ----------
const blobParaDataURL = (b) => new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = err; r.readAsDataURL(b); });
window.exportarBackup = async () => {
  const dados = JSON.parse(JSON.stringify(DB.data));
  if (!noServidor() && DB.list('anexos').length) {
    dados._arquivos = {};
    for (const x of DB.list('anexos')) { try { const b = await ArqLocal.ler(x.id); if (b) dados._arquivos[x.id] = await blobParaDataURL(b); } catch (e) { /* ignora */ } }
  }
  download(`backup-haras-${today()}.json`, JSON.stringify(dados), 'application/json');
};
window.restaurarArquivos = async (dados) => {
  const arqs = dados._arquivos; delete dados._arquivos; if (!arqs) return 0;
  let n = 0; for (const [id, url] of Object.entries(arqs)) { try { await salvarArquivo(id, await (await fetch(url)).blob()); n++; } catch (e) { /* ignora */ } }
  return n;
};
