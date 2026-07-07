from django.urls import path

from . import views

app_name = "usuarios"

urlpatterns = [
    path("csrf/", views.csrf_token, name="csrf"),
    path("registro/", views.registrar_cliente, name="registro"),
    path("login/", views.iniciar_sesion, name="login"),
    path("logout/", views.cerrar_sesion, name="logout"),
    path("me/", views.usuario_actual, name="me"),
]
