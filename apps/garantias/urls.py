from django.urls import path

from . import views


app_name = "garantias"

urlpatterns = [
    path("solicitud/<int:solicitud_id>/", views.detalle_garantia, name="detalle"),
    path("crear/", views.crear, name="crear"),
    path("<int:garantia_id>/reingreso/", views.registrar_reingreso, name="reingreso"),
    path("<int:garantia_id>/anular/", views.anular, name="anular"),
]
