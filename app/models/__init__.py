"""Domain persistence models."""

from app.models.cliente import Cliente, CustomerSession
from app.models.admin import Admin, AdminSession
from app.models.endereco import Endereco
from app.models.produto import Produto
from app.models.venda import Venda
from app.models.venda_item import VendaItem

__all__ = ["Admin", "AdminSession", "Cliente", "CustomerSession", "Endereco", "Produto", "Venda", "VendaItem"]
