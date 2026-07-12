from django.urls import path

from . import views

app_name = "facturacion"

urlpatterns = [
    path("", views.listar_facturas, name="listar_facturas"),
    path("servicios-completados/", views.listar_servicios_completados, name="servicios_completados"),
    path("crear/", views.crear_factura, name="crear_factura"),
    path("<int:factura_id>/eliminar/", views.eliminar_factura, name="eliminar_factura"),
]
