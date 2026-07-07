from django.contrib import admin

from .models import SolicitudServicio


@admin.register(SolicitudServicio)
class SolicitudServicioAdmin(admin.ModelAdmin):
    list_display = ("cliente", "dispositivo", "prioridad", "estado", "tecnico", "creado_en")
    list_filter = ("estado", "prioridad", "tecnico")
    search_fields = ("cliente__usuario__first_name", "cliente__usuario__last_name", "dispositivo", "problema")
