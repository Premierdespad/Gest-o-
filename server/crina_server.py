#!/usr/bin/env python3
"""Servidor do Crina integrado ao banco SQLite do app de controle de criação.

- Serve o site (index.html, app.html, vitrine.html...) a partir da pasta do projeto.
- Lê AO VIVO as tabelas do app (cavalos, coberturas, sanidade, transacoes, parcelas, despesas):
  o que for lançado no app aparece no site no próximo carregamento, sem backup manual.
- Guarda os dados próprios do site (custos, pensão, sócios, estoque, etc.) numa tabela nova,
  `crina_estado`, no MESMO arquivo .db. As tabelas do app nunca são alteradas.

Uso (no mesmo servidor do app, lendo o arquivo .db):
    python3 server/crina_server.py --db /caminho/do/haras.db --porta 8090 --senha "minha-senha"

Uso (em OUTRO servidor, lendo o app pela API dele na internet):
    CRINA_APP_SENHA="senha-do-app" python3 server/crina_server.py --app-url https://endereco-do-app \
        --db crina.db --porta 8090 --senha "minha-senha"
  Nesse modo o .db indicado guarda só os dados do Crina, e uma cópia do backup do app é
  baixada todo dia para a pasta backups/ (guarda os últimos 60).

Só usa a biblioteca padrão do Python (3.8+). Pode rodar ao lado do servidor do app,
ou as funções `estado()` / `salvar()` podem ser montadas dentro do servidor existente.
"""
import argparse, glob, hashlib, hmac, http.cookiejar, json, os, secrets, sqlite3, threading, time, urllib.error, urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TABELAS_APP = ["cavalos", "coberturas", "sanidade", "transacoes", "parcelas", "despesas"]
SESSOES = {}  # token -> expira (memória)
CFG = {}


def conectar():
    c = sqlite3.connect(CFG["db"], timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA busy_timeout=10000")
    return c


def preparar():
    with conectar() as c:
        c.execute("CREATE TABLE IF NOT EXISTS crina_estado (id INTEGER PRIMARY KEY CHECK (id = 1), dados TEXT NOT NULL, versao INTEGER NOT NULL DEFAULT 0, atualizado_em TEXT)")


# ---------- leitura do app pela API (modo --app-url) ----------
class AppRemoto:
    def __init__(self, url, senha):
        self.url, self.senha = url.rstrip("/"), senha
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.cache, self.cache_em, self.trava = None, 0, threading.Lock()

    def _req(self, caminho, dados=None):
        corpo = json.dumps(dados).encode() if dados is not None else None
        rq = urllib.request.Request(self.url + "/api/" + caminho, data=corpo, headers={"Content-Type": "application/json", "User-Agent": "Crina/1.0"})
        return self.op.open(rq, timeout=30)

    def _login(self):
        self._req("login", {"senha": self.senha}).read()

    def _get(self, caminho):
        try:
            return self._req(caminho)
        except urllib.error.HTTPError as e:
            if e.code != 401:
                raise
            self._login()
            return self._req(caminho)

    def tudo(self, validade=15):
        with self.trava:
            if self.cache is None or time.time() - self.cache_em > validade:
                d = json.loads(self._get("tudo").read())
                self.cache, self.cache_em = {t: d.get(t, []) for t in TABELAS_APP}, time.time()
            return self.cache

    def baixar_backup(self, pasta, manter=60):
        os.makedirs(pasta, exist_ok=True)
        dados = self._get("backup").read()
        if dados[:15] != b"SQLite format 3":
            raise ValueError("o backup baixado não é um banco SQLite")
        destino = os.path.join(pasta, time.strftime("app-backup-%Y-%m-%d.db"))
        with open(destino + ".tmp", "wb") as f:
            f.write(dados)
        os.replace(destino + ".tmp", destino)
        for velho in sorted(glob.glob(os.path.join(pasta, "app-backup-*.db")))[:-manter]:
            os.remove(velho)
        return destino


def rotina_backup(app, pasta):
    while True:
        try:
            print("backup do app salvo em", app.baixar_backup(pasta), flush=True)
        except Exception as e:  # noqa
            print("falha ao baixar backup do app:", e, flush=True)
        time.sleep(24 * 3600)


def estado():
    """Dados do site + tabelas do app (somente leitura)."""
    with conectar() as c:
        if CFG.get("app"):
            legado = CFG["app"].tudo()
        else:
            existentes = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            legado = {t: [dict(r) for r in c.execute(f"SELECT * FROM {t}")] if t in existentes else [] for t in TABELAS_APP}
        r = c.execute("SELECT dados, versao, atualizado_em FROM crina_estado WHERE id = 1").fetchone()
    return {"crina": json.loads(r["dados"]) if r else None, "versao": r["versao"] if r else 0,
            "atualizadoEm": r["atualizado_em"] if r else None, "legado": legado}


def salvar(dados, versao_base):
    """Grava os dados do site. Recusa se alguém salvou uma versão mais nova nesse meio tempo."""
    with conectar() as c:
        c.execute("BEGIN IMMEDIATE")
        r = c.execute("SELECT versao FROM crina_estado WHERE id = 1").fetchone()
        atual = r["versao"] if r else 0
        if versao_base is not None and versao_base != atual:
            c.execute("ROLLBACK")
            return False, atual
        agora = time.strftime("%Y-%m-%d %H:%M:%S")
        c.execute("INSERT INTO crina_estado (id, dados, versao, atualizado_em) VALUES (1, ?, ?, ?) "
                  "ON CONFLICT(id) DO UPDATE SET dados = excluded.dados, versao = excluded.versao, atualizado_em = excluded.atualizado_em",
                  (json.dumps(dados, ensure_ascii=False), atual + 1, agora))
        c.execute("COMMIT")
        return True, atual + 1


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=RAIZ, **k)

    def end_headers(self):
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        corpo = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _corpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 50 * 1024 * 1024:
            raise ValueError("corpo grande demais")
        return json.loads(self.rfile.read(n) or b"{}")

    def _autorizado(self):
        if not CFG.get("senha"):
            return True
        tok = (self.headers.get("Authorization") or "").replace("Bearer ", "")
        exp = SESSOES.get(tok)
        return bool(exp and exp > time.time())

    def do_GET(self):
        if self.path == "/api/estado":
            if not self._autorizado():
                return self._json(401, {"erro": "login necessário"})
            try:
                return self._json(200, estado())
            except Exception as e:  # noqa  (ex.: app fora do ar)
                return self._json(502, {"erro": "não consegui ler o app: " + str(e)})
        if self.path == "/api/vitrine":  # público: só o necessário para o site do haras
            e = estado()["crina"] or {}
            venda = [a for a in e.get("animais", []) if a.get("aVenda") == "Sim"]
            nomes = {a["id"]: a.get("nome") for a in e.get("animais", [])}
            campos = ["id", "nome", "sexo", "raca", "pelagem", "nascimento", "foto", "preco", "descricaoVenda"]
            return self._json(200, {"site": e.get("site", {}), "animais": [dict({k: a.get(k) for k in campos}, pai=nomes.get(a.get("paiId")), mae=nomes.get(a.get("maeId"))) for a in venda]})
        if self.path.startswith(("/server/", "/.", "/backups")) or "/." in self.path or self.path.split("?")[0].endswith((".db", ".py")):
            return self._json(404, {"erro": "não encontrado"})
        return super().do_GET()

    def do_POST(self):
        try:
            if self.path == "/api/login":
                senha = str(self._corpo().get("senha", ""))
                if CFG.get("senha") and not hmac.compare_digest(hashlib.sha256(senha.encode()).digest(), hashlib.sha256(CFG["senha"].encode()).digest()):
                    time.sleep(1)
                    return self._json(401, {"erro": "senha incorreta"})
                tok = secrets.token_urlsafe(32)
                SESSOES[tok] = time.time() + 30 * 86400
                return self._json(200, {"token": tok})
            return self._json(404, {"erro": "não encontrado"})
        except Exception as e:  # noqa
            return self._json(400, {"erro": str(e)})

    def do_PUT(self):
        if self.path != "/api/crina":
            return self._json(404, {"erro": "não encontrado"})
        if not self._autorizado():
            return self._json(401, {"erro": "login necessário"})
        try:
            b = self._corpo()
            ok, versao = salvar(b["dados"], b.get("versaoBase"))
            return self._json(200 if ok else 409, {"ok": ok, "versao": versao})
        except Exception as e:  # noqa
            return self._json(400, {"erro": str(e)})


def main():
    p = argparse.ArgumentParser(description="Servidor do Crina integrado ao banco do app")
    p.add_argument("--db", required=True, help="arquivo .db do app (mesmo servidor) ou, com --app-url, arquivo onde o Crina guarda os dados dele")
    p.add_argument("--app-url", default=os.environ.get("CRINA_APP_URL", ""), help="endereço do app para ler pela API (ex.: https://meu-app.exemplo)")
    p.add_argument("--backups", default=os.path.join(RAIZ, "backups"), help="pasta das cópias diárias do backup do app (modo --app-url)")
    p.add_argument("--porta", type=int, default=8090)
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--senha", default=os.environ.get("CRINA_SENHA", ""), help="senha de acesso ao sistema (ou variável CRINA_SENHA)")
    a = p.parse_args()
    CFG.update(db=a.db, senha=a.senha)
    if a.app_url:
        senha_app = os.environ.get("CRINA_APP_SENHA", "")
        if not senha_app:
            p.error("defina a senha do app na variável CRINA_APP_SENHA")
        CFG["app"] = AppRemoto(a.app_url, senha_app)
        CFG["app"].tudo()  # testa a conexão já na partida
        print("Conectado ao app em", a.app_url)
        threading.Thread(target=rotina_backup, args=(CFG["app"], a.backups), daemon=True).start()
    preparar()
    if not a.senha:
        print("ATENÇÃO: sem --senha, qualquer pessoa na rede acessa os dados.")
    print(f"Crina em http://{a.host}:{a.porta}  (banco: {a.db})")
    ThreadingHTTPServer((a.host, a.porta), Handler).serve_forever()


if __name__ == "__main__":
    main()
