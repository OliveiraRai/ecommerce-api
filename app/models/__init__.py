"""Domain persistence models."""

from app.models.cliente import Cliente
from app.models.endereco import Endereco
from app.models.produto import Produto
from app.models.venda import Venda
from app.models.venda_item import VendaItem
from app.models.vendedor import Vendedor

__all__ = ["Cliente", "Endereco", "Produto", "Venda", "VendaItem", "Vendedor"]
