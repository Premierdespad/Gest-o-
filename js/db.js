// Camada de dados: persistência local (localStorage) com backup/restauração em JSON.
const DB_KEY = 'crina_db_v1';

const DB = {
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { this.data = null; }
    // Dados iniciais do haras (arquivo opcional js/dados-iniciais.js, fora do repositório): substituem o exemplo
    const ini = window.DADOS_INICIAIS;
    if (ini && ini.config?.dadosIniciais && this.data?.config?.dadosIniciais !== ini.config.dadosIniciais) {
      const soExemploOuImportado = !this.data || this.data.config?.haras === 'Haras Vale Dourado' || !(this.data.animais || []).some(a => !a.importado && a.status !== 'Externo');
      if (soExemploOuImportado) { this.data = JSON.parse(JSON.stringify(ini)); this.save(); }
    }
    if (!this.data) { this.data = seed(); this.save(); }
    // migração de versões anteriores
    (this.data.animais || []).forEach(a => { a.posse = a.posse || 'Próprio'; if (!a.pesoRateio) a.pesoRateio = 1; });
    this.data.negocios = this.data.negocios || []; this.data.socios = this.data.socios || [];
    if (!this.data.centrosCusto.includes('Pensão')) this.data.centrosCusto.unshift('Pensão');
    return this.data;
  },
  save() { localStorage.setItem(DB_KEY, JSON.stringify(this.data)); },
  list(col) { return this.data[col] || (this.data[col] = []); },
  get(col, id) { return this.list(col).find(x => x.id === id); },
  upsert(col, obj) {
    const l = this.list(col);
    obj.atualizadoEm = new Date().toISOString(); // usado na sincronização com o site
    if (!obj.id) { obj.id = uid(); l.push(obj); }
    else { const i = l.findIndex(x => x.id === obj.id); i >= 0 ? (l[i] = { ...l[i], ...obj }) : l.push(obj); }
    this.save(); return obj;
  },
  remove(col, id) { this.data[col] = this.list(col).filter(x => x.id !== id); this.save(); },
  reset() { this.data = seed(); this.save(); },
  clear() { this.data = emptyDb(); this.save(); },
};

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function today(offset = 0) { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); }

function emptyDb() {
  return {
    config: { haras: 'Meu Haras', usuarioAtual: null },
    animais: [], biometria: [], movimentacoes: [], reproducao: [], sanidade: [],
    financeiro: [], centrosCusto: ['Pensão', 'Reprodução', 'Alimentação', 'Sanidade', 'Pessoal', 'Instalações', 'Vendas', 'Eventos'],
    estoque: [], negocios: [], socios: [], usuarios: [{ id: uid(), nome: 'Administrador', email: 'admin@haras.local', perfil: 'Administrador', ativo: 'Sim' }],
    site: { titulo: 'Meu Haras', slogan: 'Criação com tradição e qualidade', sobre: '', telefone: '', email: '', endereco: '', instagram: '', cor: '#7a4b2a', banner: '' },
  };
}

function seed() {
  const db = emptyDb();
  db.config.haras = 'Haras Vale Dourado';
  const A = (o) => { o.id = uid(); db.animais.push(o); return o; };
  const avo1 = A({ nome: 'Trovão do Sul', sexo: 'Macho', raca: 'Mangalarga Marchador', pelagem: 'Castanha', nascimento: '2005-10-02', status: 'Externo', categoria: 'Garanhão' });
  const avo2 = A({ nome: 'Estrela Real', sexo: 'Fêmea', raca: 'Mangalarga Marchador', pelagem: 'Alazã', nascimento: '2007-09-12', status: 'Externo', categoria: 'Matriz' });
  const g = A({ nome: 'Imperador VD', registro: 'MM-102938', sexo: 'Macho', raca: 'Mangalarga Marchador', pelagem: 'Castanha', nascimento: '2013-11-04', status: 'Ativo', categoria: 'Garanhão', local: 'Baia 01', chip: '982000123456789', paiId: avo1.id, maeId: avo2.id, aVenda: 'Não' });
  const m1 = A({ nome: 'Princesa VD', registro: 'MM-203948', sexo: 'Fêmea', raca: 'Mangalarga Marchador', pelagem: 'Tordilha', nascimento: '2015-08-20', status: 'Ativo', categoria: 'Matriz', local: 'Piquete 2' });
  const m2 = A({ nome: 'Aurora VD', registro: 'MM-203111', sexo: 'Fêmea', raca: 'Mangalarga Marchador', pelagem: 'Alazã', nascimento: '2016-09-15', status: 'Ativo', categoria: 'Matriz', local: 'Piquete 2' });
  A({ nome: 'Duque VD', registro: 'MM-305566', sexo: 'Macho', raca: 'Mangalarga Marchador', pelagem: 'Castanha', nascimento: '2022-10-10', status: 'Ativo', categoria: 'Potro', local: 'Piquete 4', paiId: g.id, maeId: m1.id, aVenda: 'Sim', preco: 45000, descricaoVenda: 'Potro de excelente marcha, filho do Imperador VD.' });
  A({ nome: 'Brisa VD', sexo: 'Fêmea', raca: 'Mangalarga Marchador', pelagem: 'Alazã', nascimento: '2023-11-01', status: 'Ativo', categoria: 'Potra', local: 'Piquete 4', paiId: g.id, maeId: m2.id, aVenda: 'Sim', preco: 38000 });
  A({ nome: 'Relâmpago', sexo: 'Macho castrado', raca: 'Quarto de Milha', pelagem: 'Baia', nascimento: '2012-03-03', status: 'Ativo', categoria: 'Serviço', local: 'Baia 05' });
  const p1 = A({ nome: 'Zorro', sexo: 'Macho castrado', raca: 'Crioulo', pelagem: 'Gateada', nascimento: '2015-05-01', status: 'Ativo', categoria: 'Esporte', local: 'Baia 07', posse: 'Pensão', proprietario: 'Carlos Mendes', telefoneProp: '(35) 98888-1111', valorPensao: 1200, dataEntrada: today(-200), pesoRateio: 1 });
  const p2 = A({ nome: 'Bela Vista', sexo: 'Fêmea', raca: 'Quarto de Milha', pelagem: 'Alazã', nascimento: '2017-02-01', status: 'Ativo', categoria: 'Esporte', local: 'Baia 08', posse: 'Pensão', proprietario: 'Ana Ribeiro', valorPensao: 900, dataEntrada: today(-90), pesoRateio: 1 });
  db.animais.forEach(a => { a.posse = a.posse || 'Próprio'; a.pesoRateio = a.pesoRateio || (/Potr/.test(a.categoria || '') ? 0.5 : 1); if (!a.dataEntrada && a.status !== 'Externo') a.dataEntrada = a.nascimento; });
  db.biometria.push({ id: uid(), animalId: g.id, data: today(-60), peso: 480, altura: 1.52, toracico: 1.82, canela: 0.20 });
  db.biometria.push({ id: uid(), animalId: g.id, data: today(-5), peso: 488, altura: 1.52, toracico: 1.84, canela: 0.20 });
  db.movimentacoes.push({ id: uid(), animalId: g.id, tipo: 'Entrada', data: '2016-02-10', motivo: 'Compra', origemDestino: 'Haras Serra Azul' });
  db.reproducao.push({ id: uid(), eguaId: m1.id, garanhaoId: g.id, metodo: 'Inseminação (sêmen fresco)', dataCobertura: today(-150), dataDG: today(-135), resultadoDG: 'Prenhe', status: 'Gestante', obs: '' });
  db.reproducao.push({ id: uid(), eguaId: m2.id, garanhaoId: g.id, metodo: 'Monta natural', dataCobertura: today(-10), resultadoDG: 'Aguardando', status: 'Coberta', obs: 'Agendar DG aos 14 dias' });
  db.sanidade.push({ id: uid(), animalId: g.id, tipo: 'Vacina', produto: 'Influenza + Tétano', data: today(-340), proxima: today(25), responsavel: 'Dr. Paulo', custo: 120, obs: '' });
  db.sanidade.push({ id: uid(), animalId: m1.id, tipo: 'Vermifugação', produto: 'Ivermectina', data: today(-85), proxima: today(5), responsavel: 'João', custo: 45, obs: '' });
  db.sanidade.push({ id: uid(), animalId: m2.id, tipo: 'Exame', produto: 'Anemia Infecciosa (AIE)', data: today(-170), proxima: today(-2), responsavel: 'Dr. Paulo', custo: 90, obs: 'Exame vencendo' });
  const F = (o) => db.financeiro.push({ id: uid(), status: 'Pago', ...o });
  F({ tipo: 'Receita', data: today(-40), descricao: 'Venda de potra', valor: 35000, centro: 'Vendas' });
  F({ tipo: 'Receita', data: today(-12), descricao: 'Cobertura externa - Imperador VD', valor: 4000, centro: 'Reprodução', animalId: g.id });
  F({ tipo: 'Despesa', data: today(-30), descricao: 'Ração e feno', valor: 3800, centro: 'Alimentação' });
  F({ tipo: 'Despesa', data: today(-20), descricao: 'Salários', valor: 6200, centro: 'Pessoal' });
  F({ tipo: 'Despesa', data: today(-8), descricao: 'Vacinas e vermífugos', valor: 650, centro: 'Sanidade' });
  F({ tipo: 'Despesa', data: today(10), descricao: 'Manutenção das baias', valor: 1500, centro: 'Instalações', status: 'Pendente' });
  F({ tipo: 'Receita', data: today(-15), descricao: 'Pensão - Zorro', valor: 1200, centro: 'Pensão', animalId: p1.id, contraparte: 'Carlos Mendes' });
  F({ tipo: 'Receita', data: today(-15), descricao: 'Pensão - Bela Vista', valor: 900, centro: 'Pensão', animalId: p2.id, contraparte: 'Ana Ribeiro', status: 'Pendente' });
  F({ tipo: 'Despesa', data: today(-14), descricao: 'Ferrageamento - Zorro', valor: 180, centro: 'Sanidade', animalId: p1.id });
  F({ tipo: 'Receita', data: today(-14), descricao: 'Reembolso ferrageamento - Zorro', valor: 180, centro: 'Pensão', animalId: p1.id, contraparte: 'Carlos Mendes' });
  F({ tipo: 'Despesa', data: today(-25), descricao: 'Energia e água', valor: 700, centro: 'Instalações', rateio: 'Todos os animais' });
  F({ tipo: 'Despesa', data: today(-5), descricao: 'Serragem para baias de pensão', valor: 400, centro: 'Pensão', rateio: 'Somente pensão' });
  const eu = { id: uid(), nome: 'Haras Vale Dourado (nós)', proprio: 'Sim' }, s1 = { id: uid(), nome: 'Roberto Lima', telefone: '(35) 97777-2222', proprio: 'Não' }, s2 = { id: uid(), nome: 'Marcos Andrade', proprio: 'Não' };
  db.socios.push(eu, s1, s2);
  db.negocios.push({ id: uid(), tipo: 'Compra', animalId: m2.id, data: '2019-03-10', contraparte: 'Haras Boa Esperança', pctAnimal: 100, valor: 60000, comissaoPct: 0, parcelas: 1, primeiroVenc: '2019-03-10', quitado: 'Sim', participacoes: [{ socioId: eu.id, pct: 50 }, { socioId: s1.id, pct: 50 }] });
  db.negocios.push({ id: uid(), tipo: 'Compra', animalId: g.id, data: '2016-02-10', contraparte: 'Haras Serra Azul', pctAnimal: 100, valor: 120000, comissaoPct: 0, parcelas: 1, primeiroVenc: '2016-02-10', quitado: 'Sim', participacoes: [{ socioId: eu.id, pct: 60 }, { socioId: s1.id, pct: 20 }, { socioId: s2.id, pct: 20 }] });
  db.negocios.push({ id: uid(), tipo: 'Venda', animalId: g.id, data: today(-20), contraparte: 'Fazenda Santa Clara', pctAnimal: 20, valor: 40000, comissaoPct: 5, parcelas: 4, primeiroVenc: today(-20), quitado: 'Sim', participacoes: [{ socioId: s2.id, pct: 100 }], obs: 'Marcos vendeu a cota dele (20%)' });
  db.estoque.push({ id: uid(), item: 'Ração (saco 40kg)', categoria: 'Alimentação', quantidade: 25, unidade: 'saco', minimo: 10, custoUnit: 110 });
  db.estoque.push({ id: uid(), item: 'Feno (fardo)', categoria: 'Alimentação', quantidade: 6, unidade: 'fardo', minimo: 15, custoUnit: 35 });
  db.estoque.push({ id: uid(), item: 'Ivermectina', categoria: 'Medicamento', quantidade: 12, unidade: 'dose', minimo: 5, custoUnit: 30 });
  db.usuarios.push({ id: uid(), nome: 'Dr. Paulo', email: 'vet@haras.local', perfil: 'Veterinário', ativo: 'Sim' });
  db.usuarios.push({ id: uid(), nome: 'João', email: 'joao@haras.local', perfil: 'Funcionário', ativo: 'Sim' });
  db.site = { titulo: 'Haras Vale Dourado', slogan: 'Mangalarga Marchador com marcha e morfologia de campeões', sobre: 'Criatório familiar dedicado à seleção do Mangalarga Marchador desde 2010.', telefone: '(35) 99999-0000', email: 'contato@valedourado.exemplo', endereco: 'Sul de Minas - MG', instagram: '@valedourado', cor: '#7a4b2a', banner: '' };
  return db;
}
