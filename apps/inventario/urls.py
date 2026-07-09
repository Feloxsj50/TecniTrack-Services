from django.urls import path

from . import views

app_name = "inventario"

urlpatterns = [
    path("", views.listar_productos, name="listar_productos"),
    path("crear/", views.crear_producto, name="crear_producto"),
    path("<int:producto_id>/actualizar/", views.actualizar_producto, name="actualizar_producto"),
    path("<int:producto_id>/eliminar/", views.eliminar_producto, name="eliminar_producto"),
]
