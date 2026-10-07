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

As dependências e metadados do projeto ficam em `pyproject.toml`; o grupo opcional `dev` contém as ferramentas de teste. `pip` é suficiente para instalar, e ferramentas como `uv` podem gerenciar o mesmo projeto.
