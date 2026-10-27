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

As consultas `GET /api/v1/products`, `GET /api/v1/products/{product_id}`, `GET /api/v1/categories` e `GET /api/v1/brands` são públicas. As operações de escrita em produtos, categorias, subcategorias e marcas exigem autenticação administrativa.

### Catálogo público

`GET /api/v1/products` aceita os parâmetros opcionais:

- `q`: busca parcial, sem diferenciar maiúsculas/minúsculas, em `nome` e `descricao` (até 200 caracteres).
- `category_id` e `subcategory_id`: IDs positivos. Quando ambos forem informados e a subcategoria existir, a API retorna `422` se ela pertencer a outra categoria. IDs sem correspondência retornam uma página sem produtos.
- `brand_id`: ID positivo de uma marca cadastrada.
- `min_price` e `max_price`: limites inclusivos e não negativos; o mínimo não pode exceder o máximo.
- `page`: página começando em 1 (padrão 1); `page_size`: quantidade de 1 a 100 (padrão 20).
- `sort`: `name_asc` (padrão), `name_desc`, `price_asc` ou `price_desc`. O ID crescente desempata todos os modos de ordenação.

Os filtros são combinados no backend antes da paginação. A resposta contém `items`, `page`, `page_size`, `total_items` e `total_pages`; para catálogo vazio, `items` fica vazio e `total_pages` é `0`. Cada produto usa este formato:

```json
{
  "items": [
    {
      "id": 12,
      "nome": "Teclado mecânico K2",
      "descricao": "Switch tátil, layout ABNT2",
      "imagem_url": "https://images.example.com/teclado.png",
      "marca_id": 3,
      "marca": {"id": 3, "nome": "Logitech"},
      "preco": "349.90",
      "estoque": 8,
      "subcategoria_id": 5,
      "subcategoria": {
        "id": 5,
        "nome": "Teclados",
        "categoria": {"id": 2, "nome": "Periféricos"}
      }
    }
  ],
  "page": 1,
  "page_size": 20,
  "total_items": 1,
  "total_pages": 1
}
```

`marca_id` e `marca` podem ser `null` para produtos sem marca. `imagem_url` também pode ser `null`. `subcategoria_id` e `subcategoria` podem ser `null` para produtos ainda não classificados; quando presente, a subcategoria referencia exatamente uma categoria. A migration gerenciada descarta os valores do campo textual antigo e deixa produtos sem marca até que uma marca seja selecionada.

Exemplo de consulta: `GET /api/v1/products?q=teclado&category_id=2&subcategory_id=5&brand_id=3&min_price=100&max_price=500&page=1&page_size=20&sort=price_asc`.

As categorias e subcategorias são gerenciadas pelo administrador em `POST /api/v1/categories` e `POST /api/v1/categories/{category_id}/subcategories`; `GET /api/v1/categories` retorna a árvore pública. Atualização e exclusão também exigem autenticação administrativa. Uma categoria ou subcategoria referenciada não pode ser excluída.

Marcas são listadas publicamente em `GET /api/v1/brands` e administradas em `POST /api/v1/brands`, `PUT /api/v1/brands/{brand_id}` e `DELETE /api/v1/brands/{brand_id}`. Nomes são únicos sem distinção entre maiúsculas/minúsculas. A exclusão de uma marca associada a produtos retorna `409 Conflict`.

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
