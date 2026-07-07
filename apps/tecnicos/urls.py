from django.urls import path

from . import views

app_name = "tecnicos"

urlpatterns = [
    path("", views.listar_tecnicos, name="lista"),
    path("crear/", views.crear_tecnico, name="crear"),
    path("<int:tecnico_id>/actualizar/", views.actualizar_tecnico, name="actualizar"),
    path("<int:tecnico_id>/eliminar/", views.eliminar_tecnico, name="eliminar"),
]
