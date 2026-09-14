from django.contrib import admin

from .models import Garantia, ReingresoGarantia


class SoloLecturaAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return [campo.name for campo in self.model._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Garantia)
class GarantiaAdmin(SoloLecturaAdmin):
    list_display = (
        "id",
        "solicitud_original",
        "estado_visible",
        "fecha_inicio",
        "fecha_vencimiento",
        "creada_por_nombre",
    )
    list_filter = ("fecha_inicio", "fecha_vencimiento", "anulada_en")
    search_fields = (
        "solicitud_original__id",
        "creada_por_username",
        "creada_por_nombre",
    )

    @admin.display(description="Estado")
    def estado_visible(self, obj):
        return dict(Garantia.Estado.choices)[obj.estado_actual]


@admin.register(ReingresoGarantia)
class ReingresoGarantiaAdmin(SoloLecturaAdmin):
    list_display = (
        "id",
        "garantia",
        "solicitud_reingreso",
        "registrado_por_nombre",
        "registrado_en",
    )
    search_fields = (
        "garantia__solicitud_original__id",
        "solicitud_reingreso__id",
        "registrado_por_username",
        "registrado_por_nombre",
    )
