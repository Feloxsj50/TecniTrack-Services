from django.urls import path

from . import views

app_name = "dashboard"

urlpatterns = [
    path("reportes/", views.reportes, name="reportes"),
    path("actividad-reciente/", views.actividad_reciente, name="actividad_reciente"),
]
