# Crina – Gestão de Haras

Sistema web para gestão de criatórios de cavalos (qualquer raça). Roda 100% no navegador, sem servidor: os dados ficam no `localStorage`, com backup e restauração em JSON. Pode ser instalado no celular (PWA) e funciona offline.

## Páginas
- `index.html`: página de apresentação (recursos, planos, dúvidas)
- `app.html`: o sistema
- `vitrine.html`: site público do haras com os animais à venda

## Módulos
- **Painel**: indicadores, agenda sanitária, previsão de partos, plantel por categoria, estoque baixo
- **Animais**: ficha com foto, registro, microchip, genealogia de 3 gerações, biometria, entradas e saídas (GTA), prontuário, histórico reprodutivo e custos por animal
- **Reprodução**: monta, IA (fresco/resfriado/congelado), TE, diagnóstico de gestação, previsão de parto (340 dias), registro de parto com cadastro automático do potro, taxa de prenhez
- **Sanidade**: vacinas, vermifugação, exames, tratamentos, alertas de vencimento, aplicação em lote
- **Financeiro**: receitas e despesas, centros de custo, contas pendentes, demonstrativo por centro de custo
- **Estoque**: entradas e saídas, estoque mínimo, lançamento da compra no financeiro
- **Relatórios**: plantel, calendário sanitário, desempenho reprodutivo por garanhão, financeiro anual, animais à venda (imprimir e exportar CSV)
- **Site do haras**: editor da vitrine pública
- **Usuários**: perfis Administrador, Veterinário, Funcionário e Financeiro com permissões por módulo
- **Configurações**: backup, importação e dados de demonstração

## Como rodar
```bash
python3 -m http.server 8080
# abra http://localhost:8080
```
Também pode ser publicado como site estático (GitHub Pages, Netlify, Vercel).
