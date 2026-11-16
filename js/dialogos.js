// Janelas de aviso, confirmação e pergunta feitas na própria página.
// As do navegador (alert/confirm/prompt) são bloqueadas quando o sistema roda dentro do link do Claude:
// confirm() devolve "Cancelar" sem aparecer nada. Por isso o sistema usa estas.
(function () {
  const esc_ = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function caixa(msg, { ok = 'OK', cancelar = null, campo = null, perigo = false } = {}) {
    return new Promise((resolver) => {
      const m = document.createElement('div'); m.className = 'modal'; m.style.alignItems = 'center'; m.style.zIndex = 80;
      m.innerHTML = `<form class="box" style="max-width:460px"><p style="white-space:pre-line;margin-top:0;font-size:15px;line-height:1.5">${esc_(msg)}</p>
        ${campo !== null ? `<input id="dlgCampo" value="${esc_(campo)}" style="margin-bottom:6px">` : ''}
        <div class="row" style="justify-content:flex-end;margin-top:12px">${cancelar ? `<button type="button" class="sec" data-c>${esc_(cancelar)}</button>` : ''}<button type="submit" ${perigo ? 'style="background:var(--bad)"' : ''}>${esc_(ok)}</button></div></form>`;
      document.body.appendChild(m);
      const fim = (v) => { m.remove(); document.removeEventListener('keydown', tecla); resolver(v); };
      const tecla = (e) => { if (e.key === 'Escape') fim(campo !== null ? null : false); };
      document.addEventListener('keydown', tecla);
      m.querySelector('form').onsubmit = (e) => { e.preventDefault(); fim(campo !== null ? m.querySelector('#dlgCampo').value : true); };
      const c = m.querySelector('[data-c]'); if (c) c.onclick = () => fim(campo !== null ? null : false);
      setTimeout(() => (m.querySelector('#dlgCampo') || m.querySelector('[type=submit]')).focus(), 30);
    });
  }
  window.avisar = (msg) => caixa(msg);
  window.confirmar = (msg, ok = 'Confirmar', perigo = false) => caixa(msg, { ok, cancelar: 'Cancelar', perigo });
  window.perguntar = (msg, padrao = '') => caixa(msg, { ok: 'OK', cancelar: 'Cancelar', campo: String(padrao ?? '') });
  // alert() em qualquer parte do sistema passa a usar a janela própria
  window.alert = (msg) => { caixa(msg); };
})();
