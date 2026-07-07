from django.urls import path

from . import views

app_name = "clientes"

urlpatterns = [
    path("", views.listar_clientes, name="lista"),
    path("crear/", views.crear_cliente, name="crear"),
    path("<int:cliente_id>/actualizar/", views.actualizar_cliente, name="actualizar"),
    path("<int:cliente_id>/eliminar/", views.eliminar_cliente, name="eliminar"),
]
