# Contexto do projeto

## Aplicação e arquitetura

API REST para uma única loja virtual de produtos gamer, consumida por um frontend React + TypeScript separado. A aplicação usa Python 3.11+, FastAPI, Pydantic Settings, SQLAlchemy 2 síncrono, PostgreSQL via Psycopg 3, Alembic e Pytest. Configuração e dependências ficam em `pyproject.toml`; valores de ambiente são carregados em `app/core/config.py`.

## Organização

- `app/main.py`: criação da aplicação FastAPI.
- `app/core/config.py`: configuração por ambiente e `get_settings()` com cache.
- `app/db/base.py`: base declarativa e metadata SQLAlchemy.
- `app/db/session.py`: engine com `pool_pre_ping`, `SessionLocal` e dependência `get_db()`.
- `app/models/`: modelos de domínio/persistência SQLAlchemy.
- `app/api/v1/router.py` compõe as rotas versionadas; `app/api/v1/endpoints/health.py` fornece o health check e `products.py` contém as operações HTTP de produto.
- `app/api/v1/schemas/product.py` define os schemas de criação, atualização completa e representação pública de produto.
- `app/api/v1/endpoints/auth.py` implementa login, identidade e logout administrativos; `app/api/v1/endpoints/customers.py` implementa cadastro, login, identidade e logout dos clientes.
- `app/api/v1/dependencies.py` contém `Security`, que resolve bearer tokens e exige identidade administrativa ou de cliente; mantém `get_current_admin` como dependência compatível.
- `app/core/security.py` fornece hash scrypt e tokens opacos; `app/cli.py` cria interativamente a única conta administrativa.
- `alembic/env.py`, `alembic.ini` e `alembic/versions/`: configuração e histórico de migrations.
- `tests/`: testes HTTP e testes de integração PostgreSQL.

## Modelos e relacionamentos

- `Vendedor` (`app/models/vendedor.py`) representa a única loja no domínio atual e possui vários `Produto`.
- `Produto` (`app/models/produto.py`) pertence a exatamente um vendedor; preço decimal e estoque ficam no produto.
- `Cliente` (`app/models/cliente.py`) armazena nome, sobrenome, email único (sem distinção entre maiúsculas/minúsculas) e `senha_hash`; possui vários `Endereco` e pode realizar várias `Venda`.
- `Endereco` (`app/models/endereco.py`) pertence a exatamente um cliente e contém CEP, logradouro, número, complemento opcional, bairro, cidade e UF.
- `Venda` (`app/models/venda.py`) pertence a exatamente um cliente.
- `VendaItem` (`app/models/venda_item.py`) pertence a uma venda e referencia um produto; guarda quantidade e preço unitário histórico.

Cardinalidades: Vendedor 1:N Produto; Cliente 1:N Endereco; Cliente 1:N Venda; Venda 1:N VendaItem; Produto 1:N VendaItem. `Admin` representa a identidade operacional única, separada de `Vendedor`; `AdminSession` e `CustomerSession` persistem hashes de tokens e sua expiração/revogação para cada tipo de identidade. Não há `VendedorProduto`, pagamento ou relação entre venda e endereço.

## Integridade e decisões

- A única loja é uma regra do domínio atual, não um singleton imposto no banco. O modelo permite estruturalmente outros registros de vendedor; não há múltiplos vendedores independentes no escopo atual.
- Valores monetários usam `NUMERIC(12,2)`, nunca float. Preço de produto e preço histórico de item não podem ser negativos; estoque não pode ser negativo; quantidade de item deve ser positiva.
- Campos de associação são obrigatórios e indexados. Chaves estrangeiras usam `ON DELETE RESTRICT` e `ON UPDATE RESTRICT`; não há cascade destrutivo. Exclusões de produtos referenciados e de clientes com vendas/endereço são impedidas. A preservação dos itens e das vendas prevalece sobre exclusão física de entidades referenciadas.
- Alterações no preço corrente de produto não alteram `VendaItem.preco_unitario`. O item não duplica nome ou descrição do produto.
- Venda válida deve possuir ao menos um item, mas esta regra de negócio ainda não é imposta por constraint ou serviço nesta etapa. Não há status, total, pagamento, timestamps ou snapshot de endereço definidos.
- O email de Cliente é único sem distinção entre maiúsculas/minúsculas, imposto por índice único funcional no banco e normalizado para minúsculas no cadastro/login. `senha_hash` é obrigatório; senha original e confirmação não são persistidas. A senha cadastrada exige ao menos 12 caracteres, uma letra maiúscula, uma minúscula e um caractere especial (qualquer caractere fora de ASCII alfanumérico).
- Clientes e administradores usam bearer tokens opacos, persistidos apenas por SHA-256, com validade e revogação no banco. Os tipos de identidade ficam separados; cadastro de cliente nunca concede papel administrativo.

## Estado atual e limitações

Implementados: aplicação FastAPI e health check; operações `GET`, `POST`, `PUT` e `DELETE` em `/api/v1/products`; consultas de produto públicas e mutações protegidas por autenticação administrativa. Admin: `POST /api/v1/auth/admin/login`, `GET /api/v1/auth/admin/me` e `POST /api/v1/auth/admin/logout`. Cliente: `POST /api/v1/auth/customers/register` aceita nome, sobrenome, email, senha e confirmar_senha; `POST /api/v1/auth/customers/login` aceita email e senha; `GET /api/v1/auth/customers/me` retorna a identidade autenticada; `POST /api/v1/auth/customers/logout` revoga a sessão. Tokens opacos têm validade padrão de 1800 segundos, configurada por `ADMIN_SESSION_TTL_SECONDS` e `CUSTOMER_SESSION_TTL_SECONDS`, e são armazenados apenas em hash. Senhas usam scrypt da biblioteca padrão com salt aleatório. `Security` valida a sessão e separa papéis; clientes não podem executar mutações de produtos. Crie a conta administrativa após `alembic upgrade head` usando `python -m app.cli`. `POST` e `PUT` exigem `vendedor_id` por ser obrigatório no modelo; `PUT` substitui todos os campos editáveis. Produtos inexistentes retornam 404 e a exclusão bloqueada por itens de venda retorna 409 para preservar o histórico. Testes HTTP usam SQLite em memória; testes de persistência PostgreSQL em `tests/test_persistence.py` exigem `TEST_DATABASE_URL` dedicado.

Migration `0003_cliente_credentials` adiciona os campos obrigatórios do cliente somente quando não há clientes antigos; se houver linhas, aborta sem alterá-las e exige uma migração de dados aprovada com valores reais antes da aplicação. Migration `0004_customer_sessions` cria armazenamento de sessões revogáveis para clientes.

Validação desta etapa: `tests/test_customer_registration.py` passou (22 testes); `tests/test_customer_auth.py` e `tests/test_admin_auth.py` passaram (16 testes); a suíte sem PostgreSQL passou (45 testes). A suíte completa teve 45 aprovados e 7 erros de conexão ao iniciar os testes PostgreSQL, pois o `TEST_DATABASE_URL` configurado apontou para `localhost:5432`, sem servidor acessível. `compileall`, `alembic history` e `git diff --check` passaram.

Decisões pendentes: necessidade de timestamps, status e total de venda; necessidade futura de endereço congelado na venda. Não assumir essas regras antes de decisão de produto.
