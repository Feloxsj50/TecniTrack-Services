from django.contrib import admin

from .models import TicketSoporte


@admin.register(TicketSoporte)
class TicketSoporteAdmin(admin.ModelAdmin):
    list_display = ("id", "usuario", "area", "asunto", "estado", "creado_en", "respondido_en")
    list_filter = ("estado", "area", "rol")
    search_fields = ("usuario__username", "nombre", "correo", "asunto", "detalle")