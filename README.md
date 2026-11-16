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
- **Compra e Venda (com sociedade)**:
  - Cada compra/venda registra o % do animal negociado (ex.: venda de uma cota de 20%) e a participação de cada sócio no negócio (soma 100%)
  - Composição societária de cada animal calculada automaticamente pelo histórico; na venda, a divisão atual é sugerida
  - Valor, parcelas, comissão/corretagem; a parte do haras vira lançamentos no financeiro (parcela a parcela)
  - Compra de animal novo já cria o cadastro; venda de 100% marca o animal como vendido e registra a saída
  - Abas: negócios, resultado por animal (investido × recebido × custo de manutenção) e sócios (investido, recebido, saldo, animais em sociedade)
- **Sanidade**: vacinas, vermifugação, exames, tratamentos, alertas de vencimento, aplicação em lote
- **Financeiro**: receitas e despesas, centros de custo, contas pendentes, demonstrativo por centro de custo
- **Custos e Pensão**:
  - *Pensão: custo × cobrado*: lucro ou prejuízo por cavalo de pensão, custo/mês comparado com a pensão cobrada, cobranças em aberto
  - *Por cliente*: resultado e inadimplência por proprietário
  - *Criação*: custo direto + rateio de cada animal próprio, custo por categoria, custo acumulado desde a entrada (base para preço de venda)
  - *Visão geral*: resultado do haras separado em pensão × criação
  - Botões **Gerar cobranças de pensão do mês** e **Cobrar serviço extra** (registra o custo e o valor repassado ao proprietário)
  - Regra de custo: despesa com animal = custo direto; despesa sem animal (ração, salários, energia...) = rateada entre os animais presentes na data (todos, só criação ou só pensão), ponderada pelo "peso no rateio" de cada animal
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

## Sincronização (planejada)
Todo registro tem `id` e `atualizadoEm`, para sincronizar com o site de controle de criação já existente: reprodução e compra/venda atualizadas pelo app e enviadas ao site; os demais dados continuam sendo editados no site.
