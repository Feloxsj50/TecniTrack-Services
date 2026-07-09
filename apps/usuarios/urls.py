from django.urls import path

from . import views

app_name = "usuarios"

urlpatterns = [
    path("csrf/", views.csrf_token, name="csrf"),
    path("registro/", views.registrar_cliente, name="registro"),
    path("login/", views.iniciar_sesion, name="login"),
    path("logout/", views.cerrar_sesion, name="logout"),
    path("me/", views.usuario_actual, name="me"),
    path("perfil/actualizar/", views.actualizar_perfil, name="actualizar_perfil"),
    path("password/cambiar/", views.cambiar_password, name="cambiar_password"),
    path("admin/usuarios/", views.listar_usuarios_admin, name="listar_usuarios_admin"),
    path("admin/usuarios/<int:usuario_id>/estado/", views.cambiar_estado_usuario, name="cambiar_estado_usuario"),
    path("admin/usuarios/<int:usuario_id>/password/", views.resetear_password_usuario, name="resetear_password_usuario"),
    path("taller/", views.obtener_taller, name="obtener_taller"),
    path("taller/actualizar/", views.actualizar_taller, name="actualizar_taller"),
    path("backup/", views.exportar_backup, name="exportar_backup"),
]
