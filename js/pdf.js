// PDFs gerados no próprio navegador (ficha do animal e relatórios), com o logo do haras.
// Dentro do link do Claude a janela de impressão é bloqueada; o PDF é salvo pelo recurso de downloads.
function carregarJsPDF() {
  if (window._jspdf) return window._jspdf;
  const sc = (src) => new Promise((ok, err) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => err(new Error('não consegui carregar o gerador de PDF')); document.head.appendChild(s); });
  window._jspdf = sc('vendor/jspdf/jspdf.umd.min.js').then(() => sc('vendor/jspdf/jspdf.plugin.autotable.min.js')).then(() => window.jspdf.jsPDF).catch(e => { window._jspdf = null; throw e; });
  return window._jspdf;
}
async function logoDataURL() {
  if (window._logoPDF) return window._logoPDF;
  try { const b = await (await fetch('assets/logo.jpg')).blob(); window._logoPDF = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); } catch (e) { window._logoPDF = null; }
  return window._logoPDF;
}
const COR = { escuro: [18, 12, 10], ouro: [189, 133, 56], texto: [36, 27, 20], cinza: [122, 109, 96], linha: [229, 220, 205], azul: [74, 120, 181], rosa: [192, 87, 125], fundo: [255, 250, 243] };
function cabecalhoPDF(doc, titulo, logo) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...COR.escuro); doc.rect(0, 0, W, 26, 'F');
  if (logo) doc.addImage(logo, 'JPEG', 10, 3, 20, 20);
  doc.setTextColor(...COR.ouro); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text((DB.data.config.haras || 'Haras').toUpperCase(), logo ? 34 : 12, 12);
  doc.setTextColor(230, 220, 205); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(titulo, logo ? 34 : 12, 19);
  doc.setFontSize(8); doc.text('Emitido em ' + fdate(today()), W - 12, 19, { align: 'right' });
  doc.setTextColor(...COR.texto);
}
function rodapesPDF(doc) {
  const n = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(...COR.cinza); doc.text(`${DB.data.config.haras || ''} · página ${i} de ${n}`, W / 2, H - 6, { align: 'center' }); }
}
const tituloSecao = (doc, y, t) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...COR.ouro); doc.text(t.toUpperCase(), 12, y); doc.setDrawColor(...COR.ouro); doc.setLineWidth(0.4); doc.line(12, y + 1.5, doc.internal.pageSize.getWidth() - 12, y + 1.5); doc.setTextColor(...COR.texto); doc.setFont('helvetica', 'normal'); return y + 6; };
const garantirEspaco = (doc, y, h) => { if (y + h > doc.internal.pageSize.getHeight() - 14) { doc.addPage(); return 16; } return y; };
const tabelaPDF = (doc, y, head, body, extra = {}) => { doc.autoTable({ startY: y, head: head ? [head] : undefined, body, theme: 'grid', margin: { left: 12, right: 12 }, styles: { fontSize: 8.5, cellPadding: 1.8, textColor: COR.texto, lineColor: COR.linha }, headStyles: { fillColor: COR.escuro, textColor: COR.ouro, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [250, 246, 240] }, ...extra }); return doc.lastAutoTable.finalY + 6; };

// ---------- ficha do animal ----------
async function gerarFichaPDF(id, op) {
  const JsPDF = await carregarJsPDF(), logo = await logoDataURL(), a = animal(id);
  const doc = new JsPDF({ unit: 'mm', format: 'a4' }), W = doc.internal.pageSize.getWidth();
  cabecalhoPDF(doc, 'Ficha do animal', logo);
  let y = 36;
  const temFoto = !!(a.foto && /^data:image\/(jpe?g|png)/.test(a.foto));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text(a.nome || '', 12, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...COR.cinza);
  doc.text([a.raca, a.registro ? 'Registro ' + a.registro : '', a.categoria].filter(Boolean).join('  ·  '), 12, y + 6); doc.setTextColor(...COR.texto);
  if (temFoto) { try { doc.addImage(a.foto, /png/.test(a.foto) ? 'PNG' : 'JPEG', W - 62, 30, 50, 50, undefined, 'FAST'); } catch (e) { /* foto opcional */ } }
  const dados = [['Sexo', a.sexo], ['Nascimento', a.nascimento ? `${fdate(a.nascimento)} (${idade(a.nascimento)})` : ''], ['Pelagem', a.pelagem], ['Registro', a.registro], ['Microchip', a.chip], ['Pai', aname(a.paiId)], ['Mãe', aname(a.maeId)], ['Criador', a.criador], ['Origem', a.origem]].filter(([, v]) => v);
  if (op.preco && a.preco) dados.push(['Valor', brl(a.preco)]);
  y = tabelaPDF(doc, y + 11, null, dados.map(([k, v]) => [k, String(v)]), { theme: 'plain', tableWidth: temFoto ? W - 24 - 56 : 'auto', columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32, textColor: COR.cinza } }, styles: { fontSize: 10, cellPadding: 1.4 } });
  if (temFoto) y = Math.max(y, 86);
  if (op.preco && a.descricaoVenda) { y = tituloSecao(doc, y, 'Descrição'); doc.setFontSize(10); const t = doc.splitTextToSize(a.descricaoVenda, W - 24); doc.text(t, 12, y); y += t.length * 4.6 + 4; }

  if (op.genealogia) {
    y = garantirEspaco(doc, y, 112); y = tituloSecao(doc, y, 'Genealogia');
    const arv = typeof arvoreAtual === 'function' ? arvoreAtual(id) : {}, cw = (W - 24 - 8) / 3, h = 11, gap = 1.6, topo = y + 1;
    const caixa = (k, x, yy, hh) => {
      const n = arv[k]; doc.setFillColor(...COR.fundo); doc.setDrawColor(...COR.linha); doc.rect(x, yy, cw, hh, 'FD');
      doc.setFillColor(...(k.endsWith('p') ? COR.azul : COR.rosa)); doc.rect(x, yy, 1.4, hh, 'F');
      doc.setFontSize(6.5); doc.setTextColor(...COR.cinza); doc.text((typeof NOMES_POS !== 'undefined' ? NOMES_POS[k] : k).toUpperCase(), x + 3, yy + 3.4);
      doc.setFontSize(8.5); doc.setTextColor(...COR.texto); doc.setFont('helvetica', 'bold'); doc.text(doc.splitTextToSize(n?.nome || '—', cw - 5)[0], x + 3, yy + 7.3);
      doc.setFont('helvetica', 'normal'); if (n?.registro) { doc.setFontSize(6.8); doc.setTextColor(...COR.cinza); doc.text('Reg. ' + n.registro, x + 3, yy + 10); }
      doc.setTextColor(...COR.texto);
    };
    const bis = ['ppp', 'ppm', 'pmp', 'pmm', 'mpp', 'mpm', 'mmp', 'mmm'], avos = ['pp', 'pm', 'mp', 'mm'], pais = ['p', 'm'];
    bis.forEach((k, i) => caixa(k, 12 + 2 * (cw + 4), topo + i * (h + gap), h));
    avos.forEach((k, i) => caixa(k, 12 + cw + 4, topo + i * 2 * (h + gap) + (h + gap) / 2, h));
    pais.forEach((k, i) => caixa(k, 12, topo + i * 4 * (h + gap) + 1.5 * (h + gap), h));
    y = topo + 8 * (h + gap) + 5;
  }

  if (op.reproducao && a.sexo === 'Fêmea' && typeof evDa === 'function') {
    const evs = evDa(id).slice(-12).reverse(), st = situacaoEgua(id);
    if (evs.length) {
      y = garantirEspaco(doc, y, 30); y = tituloSecao(doc, y, 'Reprodução');
      doc.setFontSize(9.5); const sit = st.status === 'Prenhe' ? `Prenhe de ${st.garanhao || '?'} · parto previsto ${fdate(st.prevParto)}` : st.status === 'Aguardando DG' ? `Coberta em ${fdate(st.ciclo.data)} · aguardando diagnóstico` : 'Vazia';
      doc.text('Situação atual: ' + sit, 12, y); y += 4;
      y = tabelaPDF(doc, y, ['Data', 'Registro', 'Detalhe'], evs.map(e => [fdate(e.data), EV[e.tipo]?.nome || e.tipo, String(descricaoEvento(e)).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')]), { columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 55 } } });
    }
  }

  if (op.sanidade && typeof protocolos === 'function') {
    const linhas = protocolos().map(p => { const s = situacaoProtocolo(a, p); return s.ult ? [p.nome, fdate(s.ult.data), s.ult.produto || '', s.venc ? fdate(s.venc) : '', s.dias < 0 ? 'Vencida' : 'Em dia'] : null; }).filter(Boolean);
    if (linhas.length) { y = garantirEspaco(doc, y, 30); y = tituloSecao(doc, y, 'Sanidade'); y = tabelaPDF(doc, y, ['Protocolo', 'Última aplicação', 'Produto', 'Válida até', 'Situação'], linhas); }
  }
  if (op.obs && a.obs) { y = garantirEspaco(doc, y, 20); y = tituloSecao(doc, y, 'Observações'); doc.setFontSize(9.5); const t = doc.splitTextToSize(a.obs, W - 24); doc.text(t, 12, y); y += t.length * 4.4; }
  rodapesPDF(doc);
  return doc.output('blob');
}
window.exportarFicha = (id) => {
  const a = animal(id), m = document.createElement('div'); m.className = 'modal'; m.style.alignItems = 'center';
  const ck = (k, l, on, ok = true) => ok ? `<label style="display:flex;gap:8px;align-items:center;margin:6px 0;color:var(--ink);font-size:15px"><input type="checkbox" id="pf_${k}" ${on ? 'checked' : ''} style="width:auto"> ${l}</label>` : '';
  m.innerHTML = `<form class="box" style="max-width:440px"><div class="top"><h3 style="margin:0">📄 Ficha em PDF · ${esc(a.nome)}</h3><button type="button" class="sec" data-x>Fechar</button></div>
    <p class="muted" style="margin-top:0">Escolha o que vai na ficha. Valores de compra, custos e sócios <b>nunca</b> entram — pode mandar para o cliente.</p>
    ${ck('genealogia', 'Árvore genealógica (pai a bisavós)', true)}${ck('reproducao', 'Histórico reprodutivo', a.sexo === 'Fêmea', a.sexo === 'Fêmea')}${ck('sanidade', 'Vacinas e exames', true)}${ck('preco', 'Preço de venda e descrição', a.aVenda === 'Sim', !!(a.preco || a.descricaoVenda))}${ck('obs', 'Observações do cadastro', false, !!a.obs)}
    <p class="muted" id="pf_msg"></p><div class="row" style="justify-content:flex-end"><button type="button" class="sec" data-x>Cancelar</button><button type="submit">Gerar PDF</button></div></form>`;
  document.body.appendChild(m);
  m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => m.remove());
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault(); const g = k => !!m.querySelector('#pf_' + k)?.checked, btn = m.querySelector('[type=submit]'); btn.disabled = true; m.querySelector('#pf_msg').textContent = 'Gerando o PDF...';
    try { const b = await gerarFichaPDF(id, { genealogia: g('genealogia'), reproducao: g('reproducao'), sanidade: g('sanidade'), preco: g('preco'), obs: g('obs') }); await download(`Ficha ${a.nome}.pdf`.replace(/[\\/:*?"<>|]/g, ''), b, 'application/pdf'); m.remove(); }
    catch (err) { btn.disabled = false; m.querySelector('#pf_msg').textContent = 'Não consegui gerar o PDF: ' + (err?.message || err); }
  };
};

// ---------- relatórios: exporta a tela atual em PDF ----------
window.exportarRelatorioPDF = async () => {
  try {
    const JsPDF = await carregarJsPDF(), logo = await logoDataURL(), card = [...document.querySelectorAll('#content .card')].find(c => c.querySelector('table'));
    if (!card) return avisar('Não há tabela neste relatório para exportar.');
    const tab = card.querySelector('table'), ncol = tab.rows[0]?.cells.length || 0, titulo = card.querySelector('h3')?.textContent || 'Relatório';
    const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: ncol > 6 ? 'landscape' : 'portrait' });
    cabecalhoPDF(doc, titulo.replace(/^.*?—\s*/, ''), logo);
    const intro = card.querySelector('p.muted:not(:last-child)')?.textContent; let y = 34;
    if (intro) { doc.setFontSize(9); doc.setTextColor(...COR.cinza); const t = doc.splitTextToSize(intro, doc.internal.pageSize.getWidth() - 24); doc.text(t, 12, y); y += t.length * 4 + 2; doc.setTextColor(...COR.texto); }
    // tira a coluna de botões (última coluna sem título)
    const head = [...tab.tHead.rows[0].cells].map(c => c.innerText.trim()), corta = head[head.length - 1] === '' ? head.length - 1 : head.length;
    const body = [...tab.tBodies[0].rows].map(r => [...r.cells].slice(0, corta).map(c => c.innerText.replace(/\s*\n\s*/g, ' · ').trim()));
    tabelaPDF(doc, y, head.slice(0, corta), body);
    rodapesPDF(doc);
    await download(`Relatorio ${titulo.replace(/^.*?—\s*/, '').replace(/[^\p{L}\p{N} ()-]/gu, '').trim()} ${today()}.pdf`, doc.output('blob'), 'application/pdf');
  } catch (err) { avisar('Não consegui gerar o PDF: ' + (err?.message || err)); }
};
