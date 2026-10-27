from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.core.security import hash_password
from app.main import create_app
from app.models import Admin, Categoria, Cliente, Marca, Produto, Subcategoria, Venda, VendaItem


def make_client_with_products(
    products: list[dict] | None = None,
    categories: list[dict] | None = None,
    subcategories: list[dict] | None = None,
    brands: list[dict] | None = None,
):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)

    with Session(engine) as database:
        database.add(Admin(id=1, username="admin-test", password_hash=hash_password("test-password-123")))
        for category in categories or []:
            database.add(Categoria(**category))
        database.flush()
        for subcategory in subcategories or []:
            database.add(Subcategoria(**subcategory))
        database.flush()
        for brand in brands or []:
            database.add(Marca(**brand))
        database.flush()
        for product in products or []:
            database.add(Produto(**product))
        database.commit()

    def override_get_db():
        with Session(engine) as database:
            yield database

    application = create_app()
    application.dependency_overrides[get_db] = override_get_db
    client = TestClient(application, backend_options={"use_uvloop": True})
    response = client.post("/api/v1/auth/admin/login", json={"username": "admin-test", "password": "test-password-123"})
    assert response.status_code == 200
    client.headers.update({"Authorization": f"Bearer {response.json()['access_token']}"})
    return client, engine


def public_product(
    id: int,
    *,
    nome="Teclado",
    descricao="Mecânico",
    preco="299.90",
    estoque=5,
    marca_id=None,
    marca=None,
    subcategoria_id=None,
    subcategoria=None,
):
    return {
        "id": id,
        "nome": nome,
        "descricao": descricao,
        "imagem_url": None,
        "marca_id": marca_id,
        "marca": marca,
        "preco": preco,
        "estoque": estoque,
        "subcategoria_id": subcategoria_id,
        "subcategoria": subcategoria,
    }


def catalog_page(items, *, page=1, page_size=20, total_items=None, total_pages=None):
    total_items = len(items) if total_items is None else total_items
    total_pages = (total_items + page_size - 1) // page_size if total_pages is None else total_pages
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total_items": total_items,
        "total_pages": total_pages,
    }


def test_list_products_returns_public_product_fields():
    client, engine = make_client_with_products(
        [{"nome": "Teclado", "descricao": "Mecânico", "preco": Decimal("299.90"), "estoque": 5}]
    )
    try:
        response = client.get("/api/v1/products")
        assert response.status_code == 200
        assert response.json() == catalog_page([public_product(1)])
    finally:
        client.close()
        engine.dispose()


def test_list_products_returns_empty_collection():
    client, engine = make_client_with_products()
    try:
        response = client.get("/api/v1/products")
        assert response.status_code == 200
        assert response.json() == catalog_page([])
    finally:
        client.close()
        engine.dispose()


def test_catalog_combines_filters_before_pagination_and_orders_deterministically():
    client, engine = make_client_with_products(
        [
            {"nome": "Teclado Alpha", "descricao": "Mecânico", "marca_id": 1, "preco": Decimal("100.00"), "estoque": 2, "subcategoria_id": 1},
            {"nome": "Teclado Beta", "descricao": "Membrana", "marca_id": 1, "preco": Decimal("200.00"), "estoque": 3, "subcategoria_id": 1},
            {"nome": "Mouse Gamma", "descricao": "Óptico", "marca_id": 2, "preco": Decimal("200.00"), "estoque": 4, "subcategoria_id": 2},
            {"nome": "GPU Delta", "descricao": "Radeon", "marca_id": None, "preco": Decimal("800.00"), "estoque": 1, "subcategoria_id": 3},
        ],
        categories=[{"id": 1, "nome": "Periféricos"}, {"id": 2, "nome": "Componentes"}],
        subcategories=[
            {"id": 1, "categoria_id": 1, "nome": "Teclados"},
            {"id": 2, "categoria_id": 1, "nome": "Mouses"},
            {"id": 3, "categoria_id": 2, "nome": "Placas de vídeo"},
        ],
        brands=[{"id": 1, "nome": "Logitech"}, {"id": 2, "nome": "Razer"}],
    )
    try:
        first_page = client.get("/api/v1/products?category_id=1&page=1&page_size=1")
        second_page = client.get("/api/v1/products?category_id=1&page=2&page_size=1")
        assert first_page.status_code == second_page.status_code == 200
        assert first_page.json() == catalog_page(
            [public_product(3, nome="Mouse Gamma", descricao="Óptico", preco="200.00", estoque=4, marca_id=2, marca={"id": 2, "nome": "Razer"}, subcategoria_id=2,
                            subcategoria={"id": 2, "nome": "Mouses", "categoria": {"id": 1, "nome": "Periféricos"}})],
            page=1, page_size=1, total_items=3, total_pages=3,
        )
        assert second_page.json()["items"][0]["nome"] == "Teclado Alpha"
        assert second_page.json()["total_items"] == 3

        combined = client.get(
            "/api/v1/products?q=teclado&category_id=1&subcategory_id=1&brand_id=1&min_price=150&max_price=250"
        )
        assert [item["nome"] for item in combined.json()["items"]] == ["Teclado Beta"]
        assert combined.json()["total_items"] == 1

        description_search = client.get("/api/v1/products?q=Radeon&category_id=2")
        assert [item["nome"] for item in description_search.json()["items"]] == ["GPU Delta"]

        tied_prices = client.get("/api/v1/products?category_id=1&sort=price_desc")
        assert [item["id"] for item in tied_prices.json()["items"]] == [2, 3, 1]
    finally:
        client.close()
        engine.dispose()


def test_catalog_rejects_invalid_price_ranges_and_contradictory_categories():
    client, engine = make_client_with_products(
        categories=[{"id": 1, "nome": "Periféricos"}, {"id": 2, "nome": "Componentes"}],
        subcategories=[{"id": 1, "categoria_id": 1, "nome": "Teclados"}],
    )
    try:
        assert client.get("/api/v1/products?min_price=-1").status_code == 422
        assert client.get("/api/v1/products?min_price=20&max_price=10").status_code == 422
        assert client.get("/api/v1/products?category_id=2&subcategory_id=1").status_code == 422
        assert client.get("/api/v1/products?page=0").status_code == 422
        assert client.get("/api/v1/products?page_size=101").status_code == 422
    finally:
        client.close()
        engine.dispose()


def test_public_category_tree_and_admin_protected_category_management():
    client, engine = make_client_with_products()
    try:
        client.headers.pop("Authorization")
        assert client.get("/api/v1/categories").json() == []
        assert client.post("/api/v1/categories", json={"nome": "Periféricos"}).status_code == 401

        client.headers["Authorization"] = "Bearer " + client.post(
            "/api/v1/auth/admin/login", json={"username": "admin-test", "password": "test-password-123"}
        ).json()["access_token"]
        category = client.post("/api/v1/categories", json={"nome": "Periféricos"})
        assert category.status_code == 201
        subcategory = client.post(
            f"/api/v1/categories/{category.json()['id']}/subcategories", json={"nome": "Teclados"}
        )
        assert subcategory.status_code == 201
        assert client.get("/api/v1/categories").json() == [{
            "id": category.json()["id"],
            "nome": "Periféricos",
            "subcategorias": [subcategory.json()],
        }]
    finally:
        client.close()
        engine.dispose()


def test_brands_are_public_to_read_admin_only_to_write_unique_and_restricted_on_delete():
    client, engine = make_client_with_products()
    try:
        client.headers.pop("Authorization")
        assert client.get("/api/v1/brands").json() == []
        assert client.post("/api/v1/brands", json={"nome": "Logitech"}).status_code == 401

        login = client.post(
            "/api/v1/auth/admin/login", json={"username": "admin-test", "password": "test-password-123"}
        )
        client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
        created = client.post("/api/v1/brands", json={"nome": "  Logitech  "})
        assert created.status_code == 201
        assert created.json() == {"id": 1, "nome": "Logitech"}
        assert client.post("/api/v1/brands", json={"nome": "LOGITECH"}).status_code == 409
        razer = client.post("/api/v1/brands", json={"nome": "Razer"})
        assert razer.status_code == 201
        assert client.put(f"/api/v1/brands/{razer.json()['id']}", json={"nome": "Razer Inc."}).json()["nome"] == "Razer Inc."
        assert client.get("/api/v1/brands").json() == [created.json(), {"id": 2, "nome": "Razer Inc."}]

        product = client.post("/api/v1/products", json={
            "nome": "Mouse", "preco": "50.00", "estoque": 1, "marca_id": created.json()["id"],
        })
        assert product.status_code == 201
        assert product.json()["marca"] == created.json()
        assert client.delete("/api/v1/brands/1").status_code == 409
        assert client.delete("/api/v1/brands/2").status_code == 204
        assert client.put("/api/v1/brands/999", json={"nome": "Inexistente"}).status_code == 404
        assert client.delete("/api/v1/brands/999").status_code == 404
        assert client.post("/api/v1/brands", json={"nome": "   "}).status_code == 422
    finally:
        client.close()
        engine.dispose()


def test_product_can_be_assigned_a_subcategory_and_brand():
    client, engine = make_client_with_products(
        categories=[{"id": 1, "nome": "Periféricos"}],
        subcategories=[{"id": 1, "categoria_id": 1, "nome": "Teclados"}],
        brands=[{"id": 1, "nome": "Logitech"}],
    )
    try:
        response = client.post("/api/v1/products", json={
            "nome": "Teclado", "descricao": "Mecânico", "marca_id": 1, "preco": "299.90", "estoque": 5,
            "subcategoria_id": 1,
        })
        assert response.status_code == 201
        assert response.json() == public_product(
            1, marca_id=1, marca={"id": 1, "nome": "Logitech"}, subcategoria_id=1,
            subcategoria={"id": 1, "nome": "Teclados", "categoria": {"id": 1, "nome": "Periféricos"}},
        )
        assert client.post("/api/v1/products", json={
            "nome": "Produto inválido", "preco": "1", "estoque": 1, "subcategoria_id": 999,
        }).status_code == 422
        assert client.post("/api/v1/products", json={
            "nome": "Produto inválido", "preco": "1", "estoque": 1, "marca_id": 999,
        }).status_code == 422
    finally:
        client.close()
        engine.dispose()


def test_product_name_schema_accepts_200_characters_and_rejects_201_on_create_and_update():
    client, engine = make_client_with_products(
        [{"nome": "Nome inicial", "descricao": None, "preco": Decimal("10.00"), "estoque": 1}]
    )
    try:
        valid_name = "P" * 200
        payload = {"nome": valid_name, "preco": "10.00", "estoque": 1}
        created = client.post("/api/v1/products", json=payload)
        assert created.status_code == 201
        assert len(created.json()["nome"]) == 200

        assert client.post("/api/v1/products", json={**payload, "nome": valid_name + "P"}).status_code == 422
        assert client.put("/api/v1/products/1", json=payload).status_code == 200
        assert client.put("/api/v1/products/1", json={**payload, "nome": valid_name + "P"}).status_code == 422
    finally:
        client.close()
        engine.dispose()


def test_product_image_url_is_normalized_validated_and_returned_by_catalog():
    client, engine = make_client_with_products()
    try:
        response = client.post("/api/v1/products", json={
            "nome": "Webcam", "preco": "99.90", "estoque": 2,
            "imagem_url": "  HTTPS://images.example.com/webcam.png  ",
        })
        assert response.status_code == 201
        assert response.json()["imagem_url"] == "HTTPS://images.example.com/webcam.png"
        assert client.get("/api/v1/products").json()["items"][0]["imagem_url"] == "HTTPS://images.example.com/webcam.png"

        for invalid_url in (
            "file:///tmp/image.png", "javascript:alert(1)", "https:///missing-host", "not a URL", 42,
        ):
            invalid = client.post("/api/v1/products", json={
                "nome": "Produto inválido", "preco": "1.00", "estoque": 1, "imagem_url": invalid_url,
            })
            assert invalid.status_code == 422

        for empty_value in (None, "", "   "):
            created = client.post("/api/v1/products", json={
                "nome": "Sem imagem", "preco": "1.00", "estoque": 1, "imagem_url": empty_value,
            })
            assert created.status_code == 201
            assert created.json()["imagem_url"] is None
    finally:
        client.close()
        engine.dispose()


def test_product_put_preserves_omitted_image_url_and_clears_null_or_empty():
    client, engine = make_client_with_products([{
        "nome": "Webcam", "descricao": None, "imagem_url": "https://images.example.com/old.png",
        "preco": Decimal("99.90"), "estoque": 2,
    }])
    try:
        payload = {"nome": "Webcam atualizada", "preco": "89.90", "estoque": 3}
        preserved = client.put("/api/v1/products/1", json=payload)
        assert preserved.status_code == 200
        assert preserved.json()["imagem_url"] == "https://images.example.com/old.png"

        for value in (None, "   "):
            cleared = client.put("/api/v1/products/1", json={**payload, "imagem_url": value})
            assert cleared.status_code == 200
            assert cleared.json()["imagem_url"] is None

        replaced = client.put("/api/v1/products/1", json={
            **payload, "imagem_url": " https://images.example.com/new.png ",
        })
        assert replaced.status_code == 200
        assert replaced.json()["imagem_url"] == "https://images.example.com/new.png"
    finally:
        client.close()
        engine.dispose()


def test_product_put_preserves_omitted_catalog_fields_and_clears_explicit_nulls():
    client, engine = make_client_with_products(
        [{
            "nome": "Teclado", "descricao": "Mecânico", "marca_id": 1, "preco": Decimal("299.90"),
            "estoque": 5, "subcategoria_id": 1,
        }],
        categories=[{"id": 1, "nome": "Periféricos"}],
        subcategories=[{"id": 1, "categoria_id": 1, "nome": "Teclados"}],
        brands=[{"id": 1, "nome": "Logitech"}],
    )
    try:
        legacy_payload = {"nome": "Teclado atualizado", "descricao": None, "preco": "280.00", "estoque": 4}
        preserved = client.put("/api/v1/products/1", json=legacy_payload)
        assert preserved.status_code == 200
        assert preserved.json()["marca_id"] == 1
        assert preserved.json()["marca"] == {"id": 1, "nome": "Logitech"}
        assert preserved.json()["subcategoria_id"] == 1

        cleared = client.put("/api/v1/products/1", json={
            **legacy_payload, "marca_id": None, "subcategoria_id": None,
        })
        assert cleared.status_code == 200
        assert cleared.json()["marca_id"] is None
        assert cleared.json()["marca"] is None
        assert cleared.json()["subcategoria_id"] is None
        assert cleared.json()["subcategoria"] is None
    finally:
        client.close()
        engine.dispose()


def test_category_and_subcategory_write_operations_require_admin_and_work_for_admin():
    client, engine = make_client_with_products()
    try:
        client.headers.pop("Authorization")
        assert client.put("/api/v1/categories/1", json={"nome": "Nova"}).status_code == 401
        assert client.delete("/api/v1/categories/1").status_code == 401
        assert client.post("/api/v1/categories/1/subcategories", json={"nome": "Teclados"}).status_code == 401
        assert client.put("/api/v1/categories/subcategories/1", json={"nome": "Novos"}).status_code == 401
        assert client.delete("/api/v1/categories/subcategories/1").status_code == 401

        login = client.post(
            "/api/v1/auth/admin/login", json={"username": "admin-test", "password": "test-password-123"}
        )
        client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
        category = client.post("/api/v1/categories", json={"nome": "Periféricos"})
        category_id = category.json()["id"]
        subcategory = client.post(
            f"/api/v1/categories/{category_id}/subcategories", json={"nome": "Teclados"}
        )
        subcategory_id = subcategory.json()["id"]

        assert client.put(f"/api/v1/categories/{category_id}", json={"nome": "Hardware"}).status_code == 200
        assert client.put(
            f"/api/v1/categories/subcategories/{subcategory_id}", json={"nome": "Periféricos de entrada"}
        ).status_code == 200
        assert client.delete(f"/api/v1/categories/subcategories/{subcategory_id}").status_code == 204
        assert client.delete(f"/api/v1/categories/{category_id}").status_code == 204
    finally:
        client.close()
        engine.dispose()


def test_category_and_subcategory_deletes_return_conflict_when_referenced():
    client, engine = make_client_with_products(
        products=[{
            "nome": "Mouse", "descricao": None, "preco": Decimal("50.00"), "estoque": 2,
            "subcategoria_id": 10,
        }],
        categories=[{"id": 1, "nome": "Periféricos"}],
        subcategories=[{"id": 10, "categoria_id": 1, "nome": "Mouses"}],
    )
    try:
        assert client.delete("/api/v1/categories/1").status_code == 409
        assert client.delete("/api/v1/categories/subcategories/10").status_code == 409
        assert client.get("/api/v1/categories").json() == [{
            "id": 1, "nome": "Periféricos", "subcategorias": [{"id": 10, "categoria_id": 1, "nome": "Mouses"}],
        }]
        with Session(engine) as database:
            product = database.get(Produto, 1)
            assert product is not None
            assert product.subcategoria_id == 10
    finally:
        client.close()
        engine.dispose()


def test_get_product_returns_product_and_404_when_missing():
    client, engine = make_client_with_products(
        [{"nome": "Teclado", "descricao": "Mecânico", "preco": Decimal("299.90"), "estoque": 5}]
    )
    try:
        response = client.get("/api/v1/products/1")
        assert response.status_code == 200
        assert response.json() == public_product(1)
        assert client.get("/api/v1/products/999").status_code == 404
    finally:
        client.close()
        engine.dispose()


def test_product_details_are_public_and_return_existing_product():
    client, engine = make_client_with_products(
        [{"nome": "Teclado", "descricao": "Mecânico", "preco": Decimal("299.90"), "estoque": 5}]
    )
    try:
        response = client.get("/api/v1/products/1")
        assert response.status_code == 200
        assert response.json() == {
            "id": 1,
            "nome": "Teclado",
            "descricao": "Mecânico",
            "imagem_url": None,
            "marca_id": None,
            "marca": None,
            "preco": "299.90",
            "estoque": 5,
            "subcategoria_id": None,
            "subcategoria": None,
        }
        client.headers.pop("Authorization")
        assert client.get("/api/v1/products/1").status_code == 200
    finally:
        client.close()
        engine.dispose()


def test_create_product_persists_without_vendor_and_rejects_invalid_or_internal_fields():
    client, engine = make_client_with_products(brands=[{"id": 1, "nome": "Logitech"}])
    payload = {
        "nome": "Teclado",
        "descricao": "Mecânico",
        "marca_id": 1,
        "preco": "299.90",
        "estoque": 5,
    }
    try:
        response = client.post("/api/v1/products", json=payload)
        assert response.status_code == 201
        assert response.json() == public_product(1, marca_id=1, marca={"id": 1, "nome": "Logitech"})
        with Session(engine) as database:
            product = database.get(Produto, 1)
            assert product is not None
            assert product.nome == "Teclado"
            assert product.preco == Decimal("299.90")
            assert product.estoque == 5
            assert product.marca_id == 1
            assert product.marca.nome == "Logitech"
            assert product.subcategoria_id is None

        assert client.post("/api/v1/products", json={**payload, "vendedor_id": 1}).status_code == 422
        assert client.post("/api/v1/products", json={**payload, "id": 100}).status_code == 422
        assert client.post("/api/v1/products", json={"nome": "Sem preço"}).status_code == 422
        assert client.post("/api/v1/products", json={**payload, "preco": "-1"}).status_code == 422
    finally:
        client.close()
        engine.dispose()


def test_put_replaces_product_fields_and_returns_404_when_missing():
    client, engine = make_client_with_products(
        [{"nome": "Teclado", "descricao": "Mecânico", "preco": Decimal("299.90"), "estoque": 5}]
    )
    payload = {
        "nome": "Mouse",
        "descricao": None,
        "marca_id": None,
        "preco": "49.90",
        "estoque": 12,
        "subcategoria_id": None,
    }
    try:
        response = client.put("/api/v1/products/1", json=payload)
        assert response.status_code == 200
        assert response.json() == public_product(1, nome="Mouse", descricao=None, preco="49.90", estoque=12)
        with Session(engine) as database:
            product = database.get(Produto, 1)
            assert product is not None
            assert product.nome == "Mouse"
            assert product.descricao is None
            assert product.preco == Decimal("49.90")
            assert product.estoque == 12
        assert client.put("/api/v1/products/999", json=payload).status_code == 404
        assert client.put("/api/v1/products/1", json={"nome": "Parcial"}).status_code == 422
        assert client.put("/api/v1/products/1", json={**payload, "id": 2}).status_code == 422
    finally:
        client.close()
        engine.dispose()


def test_delete_product_removes_unreferenced_and_protects_sales_history():
    client, engine = make_client_with_products(
        [
            {"nome": "Mouse", "descricao": None, "preco": Decimal("50.00"), "estoque": 1},
            {"nome": "Teclado", "descricao": None, "preco": Decimal("100.00"), "estoque": 1},
        ]
    )
    try:
        response = client.delete("/api/v1/products/1")
        assert response.status_code == 204
        with Session(engine) as database:
            assert database.get(Produto, 1) is None

            cliente = Cliente(
                nome="Cliente",
                sobrenome="Teste",
                email="cliente@example.com",
                senha_hash="stored-hash-only",
            )
            database.add(cliente)
            database.flush()
            venda = Venda(cliente_id=cliente.id)
            database.add(venda)
            database.flush()
            item = VendaItem(
                venda_id=venda.id,
                produto_id=2,
                quantidade=1,
                preco_unitario=Decimal("100.00"),
            )
            database.add(item)
            database.commit()
            item_id = item.id

        blocked = client.delete("/api/v1/products/2")
        assert blocked.status_code == 409
        assert client.delete("/api/v1/products/999").status_code == 404
        with Session(engine) as database:
            assert database.get(Produto, 2) is not None
            assert database.get(VendaItem, item_id) is not None
    finally:
        client.close()
        engine.dispose()
