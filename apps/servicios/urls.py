from django.urls import path

from . import views

app_name = "servicios"

urlpatterns = [
    path("", views.listar_solicitudes, name="lista"),
    path("crear/", views.crear_solicitud, name="crear"),
    path("<int:solicitud_id>/actualizar/", views.actualizar_solicitud, name="actualizar"),
    path("<int:solicitud_id>/historial/", views.historial_solicitud, name="historial"),
    path("<int:solicitud_id>/eliminar/", views.eliminar_solicitud, name="eliminar"),
]
