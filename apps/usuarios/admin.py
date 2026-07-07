from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Usuario


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("TecniTrack", {"fields": ("rol", "telefono", "direccion", "activo")}),
    )
    list_display = ("username", "email", "first_name", "last_name", "rol", "activo", "is_staff")
    list_filter = ("rol", "activo", "is_staff", "is_superuser")
