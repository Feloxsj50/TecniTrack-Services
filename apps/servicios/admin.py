from django.contrib import admin

from .models import SolicitudServicio


@admin.register(SolicitudServicio)
class SolicitudServicioAdmin(admin.ModelAdmin):
    list_display = ("cliente", "dispositivo", "prioridad", "estado", "tecnico", "creado_en")
    list_filter = ("estado", "prioridad", "tecnico")
    search_fields = ("cliente__usuario__first_name", "cliente__usuario__last_name", "dispositivo", "problema")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
