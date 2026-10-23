# Gamer Store API

Base técnica de uma API REST em FastAPI para um e-commerce de produtos gamer.

## Ambiente local

Requer Python 3.11 ou superior e PostgreSQL. Crie e ative um ambiente virtual, instale as dependências e copie `.env.example` para `.env`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env
```

Edite `DATABASE_URL` no `.env` para apontar ao PostgreSQL local. Para iniciar a API:

```bash
uvicorn app.main:app --reload
```

Health check: `GET http://127.0.0.1:8000/health`.

## Testes

```bash
pytest
```

## Migrations

Após adicionar modelos, gere uma migration com `alembic revision --autogenerate -m "descricao"`, revise o arquivo gerado e aplique com `alembic upgrade head`. Use `alembic downgrade -1` para reverter uma revisão quando apropriado. A conexão é configurada por `DATABASE_URL`.

## Autenticação administrativa

Depois de aplicar as migrations (`alembic upgrade head`), crie a conta única no terminal do servidor:

```bash
python -m app.cli
```

O comando solicita o nome de usuário e a senha sem exibir a senha; exige ao menos 12 caracteres e recusa criar uma segunda conta. A senha é persistida somente como hash scrypt (salt aleatório e parâmetros fixos). Não existe cadastro administrativo por HTTP. Sessões administrativas duram 1800 segundos por padrão ou 2592000 segundos quando `remember_me` é enviado como `true`; essas políticas são aplicadas pelo backend.

`POST /api/v1/auth/admin/login` recebe `{"username":"...","password":"..."}` e retorna um token bearer opaco. Envie `Authorization: Bearer <access_token>` nas operações protegidas. `GET /api/v1/auth/admin/me` retorna a identidade e o papel; `POST /api/v1/auth/admin/logout` revoga o token atual. Tokens têm validade persistida e são armazenados no banco apenas como SHA-256; logout os invalida imediatamente.

As consultas `GET /api/v1/products` e `GET /api/v1/products/{product_id}` permanecem públicas. `POST /api/v1/products`, `PUT /api/v1/products/{product_id}` e `DELETE /api/v1/products/{product_id}` exigem autenticação administrativa.

Como há apenas uma identidade e todas as credenciais válidas têm papel administrativo, o sistema não possui um cenário de identidade autenticada sem permissão para retornar 403. Identificadores e papéis da resposta não concedem acesso; a autorização usa a conta persistida e a sessão validada.

Exemplo com curl:

```bash
TOKEN=$(curl -sS http://127.0.0.1:8000/api/v1/auth/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"SEU_USUARIO","password":"SUA_SENHA"}' | python -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
curl http://127.0.0.1:8000/api/v1/auth/admin/me -H "Authorization: Bearer $TOKEN"
curl -X POST http://127.0.0.1:8000/api/v1/auth/admin/logout -H "Authorization: Bearer $TOKEN"
```

As dependências e metadados do projeto ficam em `pyproject.toml`; o grupo opcional `dev` contém as ferramentas de teste. `pip` é suficiente para instalar, e ferramentas como `uv` podem gerenciar o mesmo projeto.
