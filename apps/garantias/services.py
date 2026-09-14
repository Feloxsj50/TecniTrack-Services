from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.servicios.history import (
    registrar_creacion,
    registrar_garantia_activada,
    registrar_garantia_anulada,
    registrar_garantia_utilizada,
)
from apps.servicios.models import SolicitudServicio

from .models import Garantia, ReingresoGarantia


MAX_DURACION_DIAS = 32767
MAX_MOTIVO = 1000
MAX_OBSERVACIONES = 5000


class ErrorGarantia(ValueError):
    pass


def _texto(valor, nombre, maximo, requerido=False):
    if valor is None:
        texto = ""
    elif isinstance(valor, str):
        texto = valor.strip()
    else:
        raise ErrorGarantia(f"{nombre} debe enviarse como texto.")
    if requerido and not texto:
        raise ErrorGarantia(f"{nombre} es obligatorio.")
    if len(texto) > maximo:
        raise ErrorGarantia(f"{nombre} no puede superar {maximo} caracteres.")
    return texto


def _duracion_valida(valor):
    if isinstance(valor, bool):
        raise ErrorGarantia("La duración de la garantía no es válida.")
    if isinstance(valor, int):
        duracion = valor
    elif isinstance(valor, str) and valor.strip().isdecimal():
        duracion = int(valor)
    else:
        raise ErrorGarantia("La duración de la garantía debe ser un número entero.")
    if duracion <= 0 or duracion > MAX_DURACION_DIAS:
        raise ErrorGarantia(
            f"La duración debe estar entre 1 y {MAX_DURACION_DIAS} días."
        )
    return duracion


def _datos_actor(usuario):
    return {
        "usuario": usuario,
        "username": usuario.username,
        "nombre": usuario.get_full_name() or usuario.username,
        "rol": usuario.rol,
    }


@transaction.atomic
def crear_garantia(
    solicitud_id,
    duracion_dias,
    usuario,
    condiciones_publicas="",
    notas_internas="",
):
    solicitud = SolicitudServicio.objects.select_for_update().get(pk=solicitud_id)
    if solicitud.estado != SolicitudServicio.Estado.COMPLETADO:
        raise ErrorGarantia("Solo se puede crear una garantía para una orden completada.")
    if Garantia.objects.filter(solicitud_original=solicitud).exists():
        raise ErrorGarantia("La orden ya tiene una garantía registrada.")

    duracion = _duracion_valida(duracion_dias)
    inicio = timezone.localdate()
    actor = _datos_actor(usuario)
    garantia = Garantia(
        solicitud_original=solicitud,
        duracion_dias=duracion,
        fecha_inicio=inicio,
        fecha_vencimiento=inicio + timedelta(days=duracion),
        condiciones_publicas=_texto(
            condiciones_publicas,
            "Las condiciones públicas",
            MAX_OBSERVACIONES,
        ),
        notas_internas=_texto(
            notas_internas,
            "Las notas internas",
            MAX_OBSERVACIONES,
        ),
        creada_por=actor["usuario"],
        creada_por_username=actor["username"],
        creada_por_nombre=actor["nombre"],
        creada_por_rol=actor["rol"],
    )
    garantia.full_clean()
    try:
        garantia.save()
    except IntegrityError as exc:
        raise ErrorGarantia("La orden ya tiene una garantía registrada.") from exc

    registrar_garantia_activada(solicitud, usuario, garantia)
    return garantia


@transaction.atomic
def crear_reingreso(garantia_id, usuario, motivo, observaciones_internas=""):
    garantia = (
        Garantia.objects.select_for_update(of=("self",))
        .select_related("solicitud_original__cliente__usuario")
        .get(pk=garantia_id)
    )
    if garantia.estado_actual != Garantia.Estado.VIGENTE:
        raise ErrorGarantia("La garantía debe estar vigente para registrar un reingreso.")
    if ReingresoGarantia.objects.filter(garantia=garantia).exists():
        raise ErrorGarantia("La garantía ya fue utilizada en un reingreso.")

    motivo_limpio = _texto(motivo, "El motivo", MAX_MOTIVO, requerido=True)
    observaciones_limpias = _texto(
        observaciones_internas,
        "Las observaciones internas",
        MAX_OBSERVACIONES,
    )
    original = garantia.solicitud_original
    nueva_solicitud = SolicitudServicio.objects.create(
        cliente=original.cliente,
        cliente_nombre=original.cliente_nombre,
        tecnico=None,
        dispositivo=original.dispositivo,
        problema="Reingreso por garantía",
        fecha_preferida=timezone.localdate(),
        prioridad=original.prioridad,
        estado=SolicitudServicio.Estado.PENDIENTE,
    )

    actor = _datos_actor(usuario)
    reingreso = ReingresoGarantia(
        garantia=garantia,
        solicitud_reingreso=nueva_solicitud,
        motivo=motivo_limpio,
        observaciones_internas=observaciones_limpias,
        registrado_por=actor["usuario"],
        registrado_por_username=actor["username"],
        registrado_por_nombre=actor["nombre"],
        registrado_por_rol=actor["rol"],
    )
    reingreso.full_clean()
    try:
        reingreso.save()
    except IntegrityError as exc:
        raise ErrorGarantia("La garantía ya fue utilizada en un reingreso.") from exc

    registrar_creacion(nueva_solicitud, usuario)
    registrar_garantia_utilizada(original, nueva_solicitud, usuario, motivo_limpio)
    registrar_garantia_utilizada(nueva_solicitud, original, usuario, motivo_limpio)
    return reingreso


@transaction.atomic
def anular_garantia(garantia_id, usuario, motivo):
    garantia = Garantia.objects.select_for_update().get(pk=garantia_id)
    if garantia.anulada_en:
        raise ErrorGarantia("La garantía ya se encuentra anulada.")
    if ReingresoGarantia.objects.filter(garantia=garantia).exists():
        raise ErrorGarantia("No se puede anular una garantía que ya fue utilizada.")

    motivo_limpio = _texto(motivo, "El motivo de anulación", MAX_MOTIVO, requerido=True)
    actor = _datos_actor(usuario)
    garantia.anulada_en = timezone.now()
    garantia.anulada_por = actor["usuario"]
    garantia.anulada_por_username = actor["username"]
    garantia.anulada_por_nombre = actor["nombre"]
    garantia.anulada_por_rol = actor["rol"]
    garantia.motivo_anulacion = motivo_limpio
    garantia.save(update_fields=[
        "anulada_en",
        "anulada_por",
        "anulada_por_username",
        "anulada_por_nombre",
        "anulada_por_rol",
        "motivo_anulacion",
        "actualizado_en",
    ])
    registrar_garantia_anulada(garantia.solicitud_original, usuario)
    return garantia
