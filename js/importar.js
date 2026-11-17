// Importa o backup (.db SQLite) do app de controle de criação.
// Registros importados recebem ids estáveis ("imp-<tabela>-<id>"), então uma nova importação ATUALIZA em vez de duplicar.
// O que foi criado direto neste sistema não é tocado.

function carregarSqlJs() {
  if (window._sqlPromise) return window._sqlPromise;
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
  const tentar = (base) => new Promise((ok, err) => {
    const s = document.createElement('script'); s.src = base + 'sql-wasm.js';
    s.onload = () => initSqlJs({ locateFile: f => base + f }).then(ok, err); s.onerror = err; document.head.appendChild(s);
  });
  // cópia local (funciona offline); se não existir, usa a CDN
  window._sqlPromise = tentar('vendor/').catch(() => tentar(CDN));
  return window._sqlPromise;
}

window.importarDb = async (file) => {
  if (!file) return;
  const st = document.getElementById('impStatus'); if (st) st.textContent = 'Lendo arquivo...';
  try {
    const SQL = await carregarSqlJs();
    const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
    const tabelas = new Set(db.exec("select name from sqlite_master where type='table'")[0]?.values.map(v => v[0]) || []);
    const rows = (t) => { if (!tabelas.has(t)) return []; const r = db.exec(`select * from ${t}`)[0]; return r ? r.values.map(v => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : []; };
    const res = importarDados({ cavalos: rows('cavalos'), coberturas: rows('coberturas'), sanidade: rows('sanidade'), transacoes: rows('transacoes'), parcelas: rows('parcelas'), despesas: rows('despesas') });
    db.close();
    const msg = `Importado: ${res.animais} animais (+${res.externos} pais/garanhões externos), ${res.reproducao} coberturas, ${res.sanidade} registros sanitários, ${res.negocios} compras/vendas, ${res.parcelas} parcelas, ${res.despesas} despesas.`;
    if (st) st.textContent = msg; alert(msg + (res.avisos.length ? '\n\nAtenção:\n- ' + res.avisos.join('\n- ') : ''));
    render();
  } catch (e) { console.error(e); if (st) st.textContent = ''; alert('Não foi possível ler o arquivo: ' + e.message); }
};

function importarDados(d) {
  const res = { animais: 0, externos: 0, reproducao: 0, sanidade: 0, negocios: 0, parcelas: 0, despesas: 0, avisos: [] };
  const L = (col) => DB.list(col);
  const put = (col, o) => { o.atualizadoEm = new Date().toISOString(); o.importado = true; const l = L(col), i = l.findIndex(x => x.id === o.id); if (i >= 0) l[i] = { ...l[i], ...o }; else l.push(o); return o; };
  const dia = (v) => v ? String(v).slice(0, 10) : '';
  const cid = (id) => id ? 'imp-cav-' + id : '';
  const slug = (t) => String(t).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');

  // Animais externos (pais e garanhões que só existem pelo nome) — usados na genealogia
  const nomesInternos = {}; d.cavalos.forEach(c => nomesInternos[slug(c.nome || '')] = cid(c.id));
  const externo = (nome, sexo) => {
    if (!nome || !String(nome).trim()) return '';
    const k = slug(nome); if (nomesInternos[k]) return nomesInternos[k];
    const id = 'imp-ext-' + k;
    if (!DB.get('animais', id)) res.externos++;
    put('animais', { id, nome: String(nome).trim(), sexo, status: 'Externo', posse: 'Próprio', categoria: sexo === 'Macho' ? 'Garanhão' : 'Matriz' });
    return id;
  };

  // ---- cavalos -> animais
  const idadeAnos = (n) => n ? (Date.now() - new Date(n)) / (365.25 * 864e5) : 99;
  d.cavalos.forEach(c => {
    const sexo = /f/i.test(c.sexo || '') ? 'Fêmea' : (/castr/i.test(c.sexo || '') ? 'Macho castrado' : 'Macho');
    const jovem = idadeAnos(c.nascimento) < 3;
    const categoria = c.funcao === 'Reprodutor' ? 'Garanhão' : c.funcao === 'Receptora' ? 'Receptora' : c.funcao === 'Doadora' ? 'Doadora' : c.funcao ? c.funcao
      : jovem ? (sexo === 'Fêmea' ? 'Potra' : 'Potro') : (sexo === 'Fêmea' ? 'Matriz' : '');
    const st = c.status === 'Vendido' ? 'Vendido' : c.status === 'Morto' ? 'Morto' : 'Ativo';
    const ex = DB.get('animais', cid(c.id)) || {};
    put('animais', {
      id: cid(c.id), nome: (c.nome || '').trim(), sexo, raca: c.raca || '', pelagem: c.pelagem || '', nascimento: dia(c.nascimento), registro: c.registro || '', chip: c.chip || '',
      paiId: c.pai_id ? cid(c.pai_id) : externo(c.pai_externo, 'Macho'), maeId: c.mae_id ? cid(c.mae_id) : externo(c.mae_externa, 'Fêmea'),
      status: st, categoria, origem: c.origem || '', valorEstimado: c.valor_estimado || '', obs: c.obs || '',
      posse: ex.posse || 'Próprio', pesoRateio: ex.pesoRateio || (jovem ? 0.5 : 1),
      dataEntrada: ex.dataEntrada || dia(c.data_compra) || (c.origem === 'Nascido no haras' ? dia(c.nascimento) : dia(c.criado_em)),
      aVenda: c.status === 'À venda' ? 'Sim' : (ex.aVenda || 'Não'), preco: c.status === 'À venda' ? (ex.preco || c.valor_estimado || '') : ex.preco,
    });
    res.animais++;
  });

  // ---- coberturas -> reprodução
  d.coberturas.forEach(r => {
    const dg = r.diagnostico || 'Aguardando';
    const status = dg === 'Pariu' ? 'Parida' : dg === 'Prenhe' ? 'Gestante' : dg === 'Vazia' ? 'Vazia' : /abort|reabs/i.test(dg) ? 'Aborto' : 'Coberta';
    const resultadoDG = dg === 'Pariu' ? 'Prenhe' : ['Prenhe', 'Vazia', 'Gemelar'].includes(dg) ? dg : /abort|reabs/i.test(dg) ? 'Reabsorção/Aborto' : 'Aguardando';
    put('reproducao', { id: 'imp-cob-' + r.id, eguaId: cid(r.egua_id), garanhaoId: r.garanhao_id ? cid(r.garanhao_id) : externo(r.garanhao_externo, 'Macho'),
      metodo: r.tipo || '', receptoraId: cid(r.receptora_id), dataInovulacao: dia(r.data_inovulacao), dataCobertura: dia(r.data_cobertura), resultadoDG, status,
      dataParto: dia(r.data_parto), potroId: cid(r.potro_id), custo: r.custo || '', obs: r.obs || '' });
    if (r.data_parto && r.data_cobertura && r.data_parto < r.data_cobertura) res.avisos.push(`Cobertura #${r.id}: data do parto (${dia(r.data_parto)}) é anterior à da cobertura (${dia(r.data_cobertura)}).`);
    if (Number(r.custo)) put('financeiro', { id: 'imp-cobcusto-' + r.id, tipo: 'Despesa', data: dia(r.data_cobertura), descricao: `${r.tipo || 'Cobertura'} – ${aname(cid(r.egua_id))}`, valor: Number(r.custo), centro: 'Reprodução', animalId: cid(r.egua_id), status: 'Pago' });
    res.reproducao++;
  });

  // ---- sanidade
  d.sanidade.forEach(x => { put('sanidade', { id: 'imp-san-' + x.id, animalId: cid(x.cavalo_id), tipo: x.tipo || 'Tratamento', produto: x.descricao || x.tipo || '', data: dia(x.data), proxima: dia(x.proxima), custo: x.custo || '', obs: x.obs || '' }); res.sanidade++; });

  // ---- despesas
  d.despesas.forEach(x => { put('financeiro', { id: 'imp-desp-' + x.id, tipo: 'Despesa', data: dia(x.data), descricao: x.descricao || x.categoria || 'Despesa', valor: Number(x.valor) || 0, centro: x.categoria || '', animalId: cid(x.cavalo_id), rateio: 'Todos os animais', status: 'Pago' }); res.despesas++; });

  // ---- transações + parcelas -> compra e venda
  let eu = DB.list('socios').find(s => s.proprio === 'Sim');
  if (!eu) { eu = { id: 'imp-socio-nos', nome: (DB.data.config.haras || 'Haras') + ' (nós)', proprio: 'Sim' }; put('socios', eu); }
  const parcelasDe = {}; d.parcelas.forEach(p => (parcelasDe[p.transacao_id] = parcelasDe[p.transacao_id] || []).push(p));
  const comNegocio = new Set();
  d.transacoes.forEach(t => {
    const id = 'imp-tr-' + t.id, ex = DB.get('negocios', id);
    const produto = t.produto === 'Animal' || !t.produto ? 'Animal' : t.produto;
    const pctObs = /(\d+(?:[.,]\d+)?)\s*%/.exec(t.obs || ''); // "Venda de 50% da minha potra"
    const pctAnimal = Number(t.percentual) || (pctObs ? Number(pctObs[1].replace(',', '.')) : 100);
    const lista = (parcelasDe[t.id] || []).sort((a, b) => a.numero - b.numero).map(p => ({ numero: p.numero, vencimento: dia(p.vencimento), valor: Number(p.valor) || 0, forma: p.forma || '', pagoEm: dia(p.pago_em) }));
    const somaParc = lista.reduce((s, p) => s + p.valor, 0);
    if (lista.length && Math.abs(somaParc - Number(t.valor)) > 1) res.avisos.push(`Transação #${t.id} (${t.tipo}): soma das parcelas ${somaParc.toLocaleString('pt-BR')} ≠ valor ${Number(t.valor).toLocaleString('pt-BR')}.`);
    const n = put('negocios', {
      id, tipo: t.tipo === 'Compra' ? 'Compra' : 'Venda', produto, animalId: produto === 'Animal' ? cid(t.cavalo_id) : '', doadoraId: cid(t.doadora_id),
      garanhaoId: t.garanhao_id ? cid(t.garanhao_id) : (t.garanhao_externo ? externo(t.garanhao_externo, 'Macho') : ''), quantidade: t.quantidade || 1,
      data: dia(t.data), contraparte: t.contraparte || '', telefone: t.telefone || '', valor: Number(t.valor) || 0, pctAnimal,
      comissaoPct: ex?.comissaoPct || 0, plano: (() => { try { return JSON.parse(t.plano || 'null'); } catch (e) { return null; } })(), parcelas: lista.length || 1, primeiroVenc: lista[0]?.vencimento || dia(t.data), quitado: 'Sim', parcelasLista: lista,
      participacoes: ex?.participacoes?.length ? ex.participacoes : [{ socioId: eu.id, pct: 100 }], obs: t.obs || '',
    });
    if (produto === 'Animal' && t.cavalo_id) comNegocio.add(t.tipo + ':' + t.cavalo_id);
    lancarFinanceiro(n); res.negocios++; res.parcelas += lista.length;
  });

  // Animais com valor de compra no cadastro mas sem transação de compra: cria a compra (à vista, sem parcelas detalhadas)
  d.cavalos.filter(c => Number(c.valor_compra) && !comNegocio.has('Compra:' + c.id)).forEach(c => {
    const ex = DB.get('negocios', 'imp-compra-cav-' + c.id);
    const data = dia(c.data_compra) || ex?.data || dia(c.criado_em); // data corrigida aqui no sistema é mantida
    if (!c.data_compra && !ex) res.avisos.push(`${c.nome}: compra de R$ ${Number(c.valor_compra).toLocaleString('pt-BR')} sem data; usei a data do cadastro (${data}). Corrija em Compra e Venda.`);
    const n = put('negocios', { id: 'imp-compra-cav-' + c.id, tipo: 'Compra', produto: 'Animal', animalId: cid(c.id), data, contraparte: ex?.contraparte || '', valor: Number(c.valor_compra), pctAnimal: 100,
      comissaoPct: 0, parcelas: ex?.parcelas || 1, parcelasLista: ex?.parcelasLista, primeiroVenc: data, quitado: 'Sim', participacoes: ex?.participacoes?.length ? ex.participacoes : [{ socioId: eu.id, pct: 100 }], obs: 'Criado a partir do valor de compra do cadastro do animal' });
    lancarFinanceiro(n); res.negocios++;
  });

  // Movimentações de entrada/saída para compras e vendas importadas
  L('negocios').filter(n => n.importado && n.animalId && !(n.tipo === 'Venda' && Number(n.pctAnimal || 100) < 100)).forEach(n => { // venda parcial não é saída do plantel
    const mid = 'imp-mov-' + n.id;
    if (!DB.get('movimentacoes', mid)) put('movimentacoes', { id: mid, animalId: n.animalId, tipo: n.tipo === 'Compra' ? 'Entrada' : 'Saída', data: n.data, motivo: n.tipo, origemDestino: n.contraparte, negocioId: n.id });
  });
  L('negocios').filter(n => n.importado && n.tipo === 'Venda' && Number(n.pctAnimal || 100) < 100).forEach(n => { if (DB.get('movimentacoes', 'imp-mov-' + n.id)) DB.remove('movimentacoes', 'imp-mov-' + n.id); });
  // animal marcado como vendido no app antigo, mas o haras ainda tem parte dele (venda parcial): continua no plantel
  if (typeof composicao === 'function' && typeof socioProprio === 'function' && socioProprio()) {
    L('animais').filter(a => a.status === 'Vendido' && a.id.startsWith('imp-cav-')).forEach(a => {
      if ((composicao(a.id)[socioProprio().id] || 0) > 0.01) { a.status = 'Ativo'; a.dataSaida = ''; res.avisos.push(`${a.nome}: estava como "Vendido", mas o haras ainda tem ${pct(composicao(a.id)[socioProprio().id])} — mantido no plantel.`); }
    });
  }
  DB.save();
  return res;
}
