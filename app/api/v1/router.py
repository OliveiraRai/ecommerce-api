from fastapi import APIRouter

from app.api.v1.endpoints.brands import router as brands_router
from app.api.v1.endpoints.categories import router as categories_router
from app.api.v1.endpoints.products import router as products_router
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.customers import router as customers_router
from app.api.v1.endpoints.dashboard import router as dashboard_router
from app.api.v1.endpoints.sales import router as sales_router

api_router = APIRouter()
api_router.include_router(brands_router)
api_router.include_router(categories_router)
api_router.include_router(products_router)
api_router.include_router(auth_router)
api_router.include_router(customers_router)
api_router.include_router(dashboard_router)
api_router.include_router(sales_router)
