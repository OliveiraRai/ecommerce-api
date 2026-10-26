# Contexto do projeto

## Aplicação e arquitetura

API REST para uma única loja virtual de produtos gamer, consumida por um frontend React + TypeScript separado. A aplicação usa Python 3.11+, FastAPI, Pydantic Settings, SQLAlchemy 2 síncrono, PostgreSQL via Psycopg 3, Alembic e Pytest. Configuração e dependências ficam em `pyproject.toml`; valores de ambiente são carregados em `app/core/config.py`.

## Organização

- `app/main.py`: criação da aplicação FastAPI.
- `app/core/config.py`: configuração por ambiente e `get_settings()` com cache.
- `app/db/base.py`: base declarativa e metadata SQLAlchemy.
- `app/db/session.py`: engine com `pool_pre_ping`, `SessionLocal` e dependência `get_db()`.
- `app/models/`: modelos de domínio/persistência SQLAlchemy.
- `app/api/v1/router.py` compõe as rotas versionadas; `app/api/v1/endpoints/health.py` fornece o health check, `products.py` contém as operações HTTP de produto e `dashboard.py` fornece os indicadores do painel administrativo.
- `app/api/v1/schemas/product.py` define os schemas de criação, atualização completa e representação pública de produto.
- `app/api/v1/schemas/dashboard.py` define a resposta administrativa com contagens de produtos e vendas e faturamento decimal.
- `app/api/v1/endpoints/auth.py` implementa login, identidade e logout administrativos; `app/api/v1/endpoints/customers.py` implementa cadastro, login, identidade e logout dos clientes.
- `app/api/v1/dependencies.py` contém `Security`, que resolve bearer tokens e exige identidade administrativa ou de cliente; mantém `get_current_admin` como dependência compatível.
- `app/core/security.py` fornece hash scrypt e tokens opacos; `app/cli.py` cria interativamente a única conta administrativa.
- `alembic/env.py`, `alembic.ini` e `alembic/versions/`: configuração e histórico de migrations.
- `tests/`: testes HTTP e testes de integração PostgreSQL.

## Modelos e relacionamentos

- `Produto` (`app/models/produto.py`) pertence diretamente ao catálogo da única loja; não há entidade ou associação de vendedor.
- `Cliente` (`app/models/cliente.py`) armazena nome, sobrenome, email único (sem distinção entre maiúsculas/minúsculas) e `senha_hash`; possui vários `Endereco` e pode realizar várias `Venda`.
- `Endereco` (`app/models/endereco.py`) pertence a exatamente um cliente e contém CEP, logradouro, número, complemento opcional, bairro, cidade e UF.
- `Venda` (`app/models/venda.py`) pertence a exatamente um cliente.
- `VendaItem` (`app/models/venda_item.py`) pertence a uma venda e referencia um produto; guarda quantidade e preço unitário histórico.

Cardinalidades: Cliente 1:N Endereco; Cliente 1:N Venda; Venda 1:N VendaItem; Produto 1:N VendaItem. `Admin` representa a identidade operacional única; `AdminSession` e `CustomerSession` persistem hashes de tokens e sua expiração/revogação para cada tipo de identidade. Não há tabela associativa de vendedores, pagamento ou relação entre venda e endereço.

## Integridade e decisões

- A aplicação atende uma única loja. Produtos não carregam `vendedor_id`; o CRUD não depende de registros de vendedor.
- Valores monetários usam `NUMERIC(12,2)`, nunca float. Preço de produto e preço histórico de item não podem ser negativos; estoque não pode ser negativo; quantidade de item deve ser positiva.
- Campos de associação são obrigatórios e indexados. Chaves estrangeiras usam `ON DELETE RESTRICT` e `ON UPDATE RESTRICT`; não há cascade destrutivo. Exclusões de produtos referenciados e de clientes com vendas/endereço são impedidas. A preservação dos itens e das vendas prevalece sobre exclusão física de entidades referenciadas.
- Alterações no preço corrente de produto não alteram `VendaItem.preco_unitario`. O item não duplica nome ou descrição do produto.
- Venda válida deve possuir ao menos um item, mas esta regra de negócio ainda não é imposta por constraint ou serviço nesta etapa. `Venda.data_venda` é um `DateTime` com timezone e default do banco para vendas novas; datas não existentes antes da migration permanecem nulas. Não há status, total, pagamento ou snapshot de endereço definidos.
- O email de Cliente é único sem distinção entre maiúsculas/minúsculas, imposto por índice único funcional no banco e normalizado para minúsculas no cadastro/login. `senha_hash` é obrigatório; senha original e confirmação não são persistidas. A senha cadastrada exige ao menos 12 caracteres, uma letra maiúscula, uma minúscula e um caractere especial (qualquer caractere fora de ASCII alfanumérico).
- Clientes e administradores usam bearer tokens opacos, persistidos apenas por SHA-256, com validade e revogação no banco. Os tipos de identidade ficam separados; cadastro de cliente nunca concede papel administrativo.

## Estado atual e limitações

Implementados: aplicação FastAPI e health check; operações `GET`, `POST`, `PUT` e `DELETE` em `/api/v1/products`; consultas públicas e mutações protegidas por `get_current_admin`. Criar e editar produtos não requerem associação externa; `PUT` substitui `nome`, `descricao`, `preco` e `estoque`. Exclusões de produtos referenciados por vendas retornam 409 para preservar o histórico. O painel administrativo fornece `GET /api/v1/admin/dashboard/summary`, `GET /api/v1/admin/dashboard/recent-sales` e `GET /api/v1/admin/sales[/{id}]`, protegidos por `get_current_admin`; vendas recentes aceitam limite de 3 a 5 (padrão 5), ordenam datas conhecidas em ordem decrescente com desempate por ID decrescente e carregam itens em lote. Vendas antigas sem `data_venda` aparecem depois das datadas; valores de receita vêm de quantidade vezes preço histórico. Admin: `POST /api/v1/auth/admin/login`, `GET /api/v1/auth/admin/me`, `POST /api/v1/auth/admin/logout`. Cliente: `POST /api/v1/auth/customers/register`, `POST /api/v1/auth/customers/login`, `GET /api/v1/auth/customers/me`, `POST /api/v1/auth/customers/logout`. Tokens opacos administrativos e de cliente são armazenados apenas em hash. Senhas usam scrypt; `Security` separa identidades e clientes não podem executar mutações do catálogo. Crie a conta administrativa após `alembic upgrade head` usando `python -m app.cli`. Testes HTTP usam SQLite em memória; testes de persistência PostgreSQL em `tests/test_persistence.py` exigem `TEST_DATABASE_URL` dedicado.

Migration `0003_cliente_credentials` adiciona os campos obrigatórios do cliente somente quando não há clientes antigos; se houver linhas, aborta sem alterá-las e exige uma migração de dados aprovada com valores reais antes da aplicação. Migration `0004_customer_sessions` cria armazenamento de sessões revogáveis para clientes.

Validação Linux de 2026-10-26 (Python 3.12): 58 testes backend passaram sem `tests/test_persistence.py`. O endpoint de vendas recentes foi coberto com autenticação, ordenação por data e desempate de ID, limite e estados vazios. Os 7 testes PostgreSQL dessa suíte não conseguem conectar ao `localhost:5432` configurado. Os 6 testes pertinentes de vendas/migration passaram, e um `alembic upgrade 0005 -> head -> 0005` real em SQLite temporário preservou os itens, deixou datas antigas nulas e aplicou o default a uma venda nova. `alembic check` confirmou metadata e schema migrado. Frontend: 26 testes e build de produção passaram. O Pytest emite o aviso de depreciação Starlette/AnyIO já conhecido.

### Painel administrativo de produtos e vendas (2026-10)

- `src/App.tsx` e `src/components/AdminLayout.tsx` integram `/products` e `/sales` na navegação existente; a checagem da sessão é compartilhada com o dashboard.
- `src/components/ProductsPage.tsx` consulta produtos reais e permite detalhes, criação, edição completa e exclusão confirmada. O formulário usa apenas `nome`, `descricao`, `preco` e `estoque`.
- `src/api/products.ts` mantém todas as chamadas no cliente autenticado `apiRequest`; listagem, detalhe, criação, edição e exclusão usam os endpoints preexistentes `/api/v1/products` sem campos de vendedor.
- `src/components/SalesPage.tsx` mostra vendas persistidas, `cliente_id`, `data_venda`, quantidades, produtos por ID, preços históricos e total calculado pela soma quantidade × preço unitário. `GET /api/v1/admin/sales` e `GET /api/v1/admin/sales/{id}` são protegidos para administrador e carregam os itens; o domínio não fornece status, nome de cliente nem snapshot de produto. A API não tem fluxo para criar ou alterar vendas.
- `GET /api/v1/admin/dashboard/recent-sales` retorna até cinco vendas ordenadas por `data_venda` decrescente e `id` decrescente, com limite validado de 3 a 5 e itens carregados por `selectinload`. O dashboard apresenta cliente por ID, data (ou “Data não registrada”) e total calculado pelos preços históricos dos itens.
- Respostas 401 usam o evento compartilhado que limpa e encerra a sessão; o listener do App é registrado em layout effect para anteceder requisições das páginas. Respostas 403 mostram falta de permissão sem encerrar a sessão.
- Migration `0005_remove_vendors` remove a FK, o índice e `produtos.vendedor_id`, e a tabela `vendedores`; preserva linhas e IDs de produtos, vendas e itens. A relação `venda_itens.produto_id` continua `RESTRICT`, então produto vendido não pode ser apagado e `preco_unitario` histórico permanece intacto. O downgrade recria tabela/coluna/FK vazias e nullable; IDs/associações de vendedores antigos não podem ser recuperados, portanto o downgrade não é reversão sem perda.
- Migration `0006_sale_timestamp` adiciona `vendas.data_venda` como `DateTime(timezone=True)`, nullable, com `now()` como default do banco. Registros antigos ficam `NULL` para não atribuir a eles falsamente o horário da migration. O downgrade remove a coluna e os timestamps gravados depois da migration. O schema de resposta usa `datetime | None`.
- Persistência e endpoints são cobertos por SQLite em memória nos testes HTTP. A validação da migration em PostgreSQL e os testes de integração PostgreSQL dependem do servidor configurado por `TEST_DATABASE_URL`.

Decisões pendentes: necessidade de timestamps, status e total de venda; necessidade futura de endereço congelado na venda. Não assumir essas regras antes de decisão de produto.
