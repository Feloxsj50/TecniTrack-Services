from django.contrib import admin

from .models import Cliente


@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ("usuario", "documento", "creado_en")
    search_fields = ("usuario__username", "usuario__first_name", "usuario__last_name", "usuario__email", "documento")
