from django.contrib import admin

from .models import Tecnico


@admin.register(Tecnico)
class TecnicoAdmin(admin.ModelAdmin):
    list_display = ("usuario", "especialidad", "estado", "creado_en")
    list_filter = ("estado",)
    search_fields = ("usuario__username", "usuario__first_name", "usuario__last_name", "especialidad")
