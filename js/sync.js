// Sincronização com o servidor (server/crina_server.py).
// Se o site for aberto pelo servidor: carrega/salva os dados lá e incorpora AO VIVO os dados do app (reprodução, compra e venda...).
// Se for aberto como arquivo/hospedagem estática: continua funcionando só no navegador (modo local).
const SYNC = { modo: 'conectando', versao: 0, pronto: false, timer: null, salvando: false, pendente: false };
const TOKEN_KEY = 'crina_token';

(function () {
  const salvarLocal = DB.save.bind(DB);
  DB.save = function () {
    salvarLocal();
    if (SYNC.modo === 'servidor' && SYNC.pronto) { clearTimeout(SYNC.timer); SYNC.timer = setTimeout(enviar, 800); }
  };
})();

function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
function hdr() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }; }

// Representação estável (ordem por id, sem carimbo de data) para saber se algo mudou de verdade
function canonico(d) {
  return JSON.stringify(d, (k, v) => k === 'atualizadoEm' ? undefined : (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && 'id' in v[0]) ? v.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))) : v);
}

async function iniciarSync() {
  if (location.protocol === 'file:') return modoLocal();
  let r;
  try { r = await fetch('api/estado', { headers: hdr(), cache: 'no-store' }); } catch (e) { return modoLocal(); }
  if (r.status === 404 || !(r.headers.get('content-type') || '').includes('json')) return modoLocal();
  if (r.status === 401) return pedirLogin();
  if (!r.ok) return modoLocal('erro ' + r.status);
  const e = await r.json();
  SYNC.modo = 'servidor'; SYNC.versao = e.versao;
  if (e.crina) DB.data = e.crina;
  else { const nome = DB.data?.config?.haras; DB.data = emptyDb(); if (nome && nome !== 'Haras Vale Dourado') DB.data.config.haras = nome; }
  DB.load = () => DB.data; // não recarregar do navegador
  const antes = canonico(DB.data);
  try { importarDados(e.legado); } catch (err) { console.error('Falha ao incorporar dados do app', err); }
  SYNC.pronto = true;
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB.data)); } catch (err) { /* cache opcional */ }
  if (!e.crina || canonico(DB.data) !== antes) enviar();
  atualizarIndicador(); render();
}

async function enviar() {
  if (SYNC.salvando) { SYNC.pendente = true; return; }
  SYNC.salvando = true; atualizarIndicador('Salvando...');
  try {
    const r = await fetch('api/crina', { method: 'PUT', headers: hdr(), body: JSON.stringify({ dados: DB.data, versaoBase: SYNC.versao }) });
    if (r.status === 401) { SYNC.salvando = false; return pedirLogin(); }
    const j = await r.json();
    if (r.status === 409) {
      alert('Outra pessoa salvou alterações no sistema agora há pouco. A página será recarregada com os dados mais recentes; refaça a sua última alteração se ela não aparecer.');
      location.reload(); return;
    }
    if (!r.ok) throw new Error(j.erro || r.status);
    SYNC.versao = j.versao; atualizarIndicador();
  } catch (e) { atualizarIndicador('⚠ Não salvou no servidor (tentando de novo)'); setTimeout(enviar, 5000); }
  SYNC.salvando = false;
  if (SYNC.pendente) { SYNC.pendente = false; enviar(); }
}

function modoLocal(motivo) { SYNC.modo = 'local'; SYNC.pronto = true; atualizarIndicador(); if (motivo) console.warn(motivo); }

function atualizarIndicador(txt) {
  const el = document.getElementById('syncStatus'); if (!el) return;
  el.innerHTML = txt || (SYNC.modo === 'servidor' ? '<span style="color:#7fd19b">●</span> Conectado ao servidor' : SYNC.modo === 'local' ? '<span style="color:#d9a066">●</span> Modo local (só neste navegador)' : 'Conectando...');
}

function pedirLogin() {
  SYNC.modo = 'login';
  const m = document.createElement('div'); m.className = 'login';
  m.innerHTML = `<form><img src="assets/logo.jpg" alt="Haras Castro Neves"><input type="password" id="lgSenha" placeholder="Senha de acesso" autocomplete="current-password" autofocus><p id="lgErro" style="color:#ff8a80;min-height:1em"></p><button>Entrar</button></form>`;
  document.body.appendChild(m);
  m.querySelector('form').onsubmit = async (ev) => {
    ev.preventDefault();
    const r = await fetch('api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: $('#lgSenha', m).value }) });
    if (!r.ok) { $('#lgErro', m).textContent = 'Senha incorreta.'; return; }
    localStorage.setItem(TOKEN_KEY, (await r.json()).token); m.remove(); iniciarSync();
  };
}

window.addEventListener('DOMContentLoaded', () => { atualizarIndicador(); iniciarSync(); });
