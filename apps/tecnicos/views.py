import json
import re

from django.http import JsonResponse
from django.utils.text import slugify
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from apps.usuarios.models import Usuario
from .models import Tecnico


def validar_admin(request):
    if not request.user.is_authenticated:
        return JsonResponse(
            {
                "ok": False,
                "error": "Sesion Django no activa. Cierra sesion e inicia como admin nuevamente.",
            },
            status=401,
        )

    if request.user.rol != "admin":
        return JsonResponse({"ok": False, "error": "Solo admin puede modificar tecnicos."}, status=403)

    return None


def separar_nombre(nombre):
    partes = nombre.strip().split()
    if not partes:
        return "", ""
    if len(partes) == 1:
        return partes[0], ""
    return partes[0], " ".join(partes[1:])


def generar_username_unico(nombre):
    base = slugify(nombre).replace("-", ".")
    if not base:
        base = "tecnico"
    username = base
    contador = 1
    while Usuario.objects.filter(username=username).exists():
        username = f"{base}{contador}"
        contador += 1
    return username


def serializar_tecnico(tecnico):
    usuario = tecnico.usuario
    return {
        "id": tecnico.id,
        "nombre": usuario.get_full_name() or usuario.username,
        "especialidad": tecnico.especialidad,
        "telefono": usuario.telefono,
        "estado": "Activo" if tecnico.estado == "activo" else "Inactivo",
        "username": usuario.username,
    }


@require_GET
def listar_tecnicos(request):
    tecnicos = Tecnico.objects.select_related("usuario").all()
    data = [serializar_tecnico(tecnico) for tecnico in tecnicos]
    return JsonResponse(
        {
            "ok": True,
            "tecnicos": data,
            "total": len(data),
        }
    )


@csrf_exempt
@require_POST
def crear_tecnico(request):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    try:
        datos = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "Datos invalidos."}, status=400)

    nombre = datos.get("nombre", "").strip()
    especialidad = datos.get("especialidad", "").strip()
    telefono = datos.get("telefono", "").strip()
    estado = datos.get("estado", "Activo").strip()

    if not all([nombre, especialidad, telefono, estado]):
        return JsonResponse({"ok": False, "error": "Completa todos los campos."}, status=400)

    if len(nombre) < 3:
        return JsonResponse({"ok": False, "error": "El nombre debe tener al menos 3 caracteres."}, status=400)

    if len(especialidad) < 3:
        return JsonResponse({"ok": False, "error": "La especialidad debe tener al menos 3 caracteres."}, status=400)

    if not re.fullmatch(r"\d{4}-\d{4}", telefono):
        return JsonResponse({"ok": False, "error": "El telefono debe tener el formato 7777-8888."}, status=400)

    if estado not in ["Activo", "Inactivo"]:
        return JsonResponse({"ok": False, "error": "Estado invalido."}, status=400)

    username = generar_username_unico(nombre)
    email = f"{username}@tecnitrack.com"
    first_name, last_name = separar_nombre(nombre)
    activo_user = estado == "Activo"

    # Create the user
    usuario = Usuario.objects.create_user(
        username=username,
        email=email,
        password="Tecni1234*",
        first_name=first_name,
        last_name=last_name,
        telefono=telefono,
        rol=Usuario.Rol.TECNICO,
        activo=activo_user,
    )

    # Create the technician profile
    tecnico = Tecnico.objects.create(
        usuario=usuario,
        especialidad=especialidad,
        estado="activo" if estado == "Activo" else "inactivo",
    )

    return JsonResponse({"ok": True, "tecnico": serializar_tecnico(tecnico)}, status=201)


@csrf_exempt
@require_POST
def actualizar_tecnico(request, tecnico_id):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    try:
        tecnico = Tecnico.objects.select_related("usuario").get(id=tecnico_id)
    except Tecnico.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Tecnico no encontrado."}, status=404)

    try:
        datos = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "Datos invalidos."}, status=400)

    nombre = datos.get("nombre", "").strip()
    especialidad = datos.get("especialidad", "").strip()
    telefono = datos.get("telefono", "").strip()
    estado = datos.get("estado", "Activo").strip()

    if not all([nombre, especialidad, telefono, estado]):
        return JsonResponse({"ok": False, "error": "Completa todos los campos."}, status=400)

    if len(nombre) < 3:
        return JsonResponse({"ok": False, "error": "El nombre debe tener al menos 3 caracteres."}, status=400)

    if len(especialidad) < 3:
        return JsonResponse({"ok": False, "error": "La especialidad debe tener al menos 3 caracteres."}, status=400)

    if not re.fullmatch(r"\d{4}-\d{4}", telefono):
        return JsonResponse({"ok": False, "error": "El telefono debe tener el formato 7777-8888."}, status=400)

    if estado not in ["Activo", "Inactivo"]:
        return JsonResponse({"ok": False, "error": "Estado invalido."}, status=400)

    usuario = tecnico.usuario
    first_name, last_name = separar_nombre(nombre)
    usuario.first_name = first_name
    usuario.last_name = last_name
    usuario.telefono = telefono
    usuario.activo = estado == "Activo"
    usuario.save()

    tecnico.especialidad = especialidad
    tecnico.estado = "activo" if estado == "Activo" else "inactivo"
    tecnico.save()

    return JsonResponse({"ok": True, "tecnico": serializar_tecnico(tecnico)})


@csrf_exempt
@require_POST
def eliminar_tecnico(request, tecnico_id):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    try:
        tecnico = Tecnico.objects.select_related("usuario").get(id=tecnico_id)
    except Tecnico.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Tecnico no encontrado."}, status=404)

    tecnico.usuario.delete()
    return JsonResponse({"ok": True})
