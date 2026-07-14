import json
import re

from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from apps.usuarios.models import Usuario
from apps.usuarios.auditoria import registrar_auditoria
from .models import Tecnico


def validar_admin(request):
    if not request.user.is_authenticated:
        return JsonResponse(
            {
                "ok": False,
                "error": "Sesión Django no activa. Cierra sesión e inicia como admin nuevamente.",
            },
            status=401,
        )

    if request.user.rol != "admin":
        return JsonResponse({"ok": False, "error": "Solo admin puede modificar técnicos."}, status=403)

    return None


def separar_nombre(nombre):
    partes = nombre.strip().split()
    if not partes:
        return "", ""
    if len(partes) == 1:
        return partes[0], ""
    return partes[0], " ".join(partes[1:])


def obtener_datos_request(request):
    if request.content_type == "application/json":
        try:
            return json.loads(request.body.decode("utf-8")), None
        except json.JSONDecodeError:
            return None, JsonResponse({"ok": False, "error": "Datos inválidos."}, status=400)

    return request.POST, None


def serializar_tecnico(tecnico):
    usuario = tecnico.usuario
    return {
        "id": tecnico.id,
        "nombre": usuario.get_full_name() or usuario.username,
        "correo": usuario.email,
        "especialidad": tecnico.especialidad,
        "telefono": usuario.telefono,
        "estado": "Activo" if tecnico.estado == "activo" else "Inactivo",
        "username": usuario.username,
    }


@require_GET
def listar_tecnicos(request):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    tecnicos = Tecnico.objects.select_related("usuario").all()
    data = [serializar_tecnico(tecnico) for tecnico in tecnicos]
    return JsonResponse(
        {
            "ok": True,
            "tecnicos": data,
            "total": len(data),
        }
    )


@require_POST
def crear_tecnico(request):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    datos, error = obtener_datos_request(request)
    if error:
        return error

    nombre = datos.get("nombre", "").strip()
    username = datos.get("username", "").strip()
    correo = datos.get("correo", "").strip().lower()
    especialidad = datos.get("especialidad", "").strip()
    telefono = datos.get("telefono", "").strip()
    password = datos.get("password", "")
    estado = datos.get("estado", "Activo").strip()

    if not all([nombre, username, correo, especialidad, telefono, password, estado]):
        return JsonResponse({"ok": False, "error": "Completa todos los campos."}, status=400)

    if len(nombre) < 3:
        return JsonResponse({"ok": False, "error": "El nombre debe tener al menos 3 caracteres."}, status=400)

    if len(especialidad) < 3:
        return JsonResponse({"ok": False, "error": "La especialidad debe tener al menos 3 caracteres."}, status=400)

    if not re.fullmatch(r"[A-Za-z0-9._-]{4,30}", username):
        return JsonResponse({"ok": False, "error": "El usuario debe tener 4 a 30 caracteres válidos."}, status=400)

    if "@" not in correo or "." not in correo:
        return JsonResponse({"ok": False, "error": "Ingresa un correo válido."}, status=400)

    if len(password) < 8:
        return JsonResponse({"ok": False, "error": "La contraseña temporal debe tener al menos 8 caracteres."}, status=400)

    if not re.fullmatch(r"\d{4}-\d{4}", telefono):
        return JsonResponse({"ok": False, "error": "El teléfono debe tener el formato 7777-8888."}, status=400)

    if estado not in ["Activo", "Inactivo"]:
        return JsonResponse({"ok": False, "error": "Estado inválido."}, status=400)

    if Usuario.objects.filter(username__iexact=username).exists():
        return JsonResponse({"ok": False, "error": "Este usuario ya existe."}, status=409)

    if Usuario.objects.filter(email=correo).exists():
        return JsonResponse({"ok": False, "error": "Este correo ya esta en uso."}, status=409)

    first_name, last_name = separar_nombre(nombre)
    activo_user = estado == "Activo"

    usuario = Usuario.objects.create_user(
        username=username,
        email=correo,
        password=password,
        first_name=first_name,
        last_name=last_name,
        telefono=telefono,
        rol=Usuario.Rol.TECNICO,
        activo=activo_user,
    )
    tecnico = Tecnico.objects.create(
        usuario=usuario,
        especialidad=especialidad,
        estado="activo" if estado == "Activo" else "inactivo",
    )
    registrar_auditoria(request, "crear", "tecnicos", f"Tecnico creado: {usuario.username}.", tecnico.id)

    return JsonResponse({"ok": True, "tecnico": serializar_tecnico(tecnico)}, status=201)


@require_POST
def actualizar_tecnico(request, tecnico_id):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    try:
        tecnico = Tecnico.objects.select_related("usuario").get(id=tecnico_id)
    except Tecnico.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Técnico no encontrado."}, status=404)

    datos, error = obtener_datos_request(request)
    if error:
        return error

    nombre = datos.get("nombre", "").strip()
    correo = datos.get("correo", "").strip().lower()
    especialidad = datos.get("especialidad", "").strip()
    telefono = datos.get("telefono", "").strip()
    password = datos.get("password", "")
    estado = datos.get("estado", "Activo").strip()

    if not all([nombre, correo, especialidad, telefono, estado]):
        return JsonResponse({"ok": False, "error": "Completa todos los campos."}, status=400)

    if len(nombre) < 3:
        return JsonResponse({"ok": False, "error": "El nombre debe tener al menos 3 caracteres."}, status=400)

    if len(especialidad) < 3:
        return JsonResponse({"ok": False, "error": "La especialidad debe tener al menos 3 caracteres."}, status=400)

    if "@" not in correo or "." not in correo:
        return JsonResponse({"ok": False, "error": "Ingresa un correo válido."}, status=400)

    if password and len(password) < 8:
        return JsonResponse({"ok": False, "error": "La nueva contraseña temporal debe tener al menos 8 caracteres."}, status=400)

    if not re.fullmatch(r"\d{4}-\d{4}", telefono):
        return JsonResponse({"ok": False, "error": "El teléfono debe tener el formato 7777-8888."}, status=400)

    if estado not in ["Activo", "Inactivo"]:
        return JsonResponse({"ok": False, "error": "Estado inválido."}, status=400)

    usuario = tecnico.usuario
    if Usuario.objects.filter(email=correo).exclude(id=usuario.id).exists():
        return JsonResponse({"ok": False, "error": "Este correo ya esta en uso."}, status=409)

    first_name, last_name = separar_nombre(nombre)
    usuario.first_name = first_name
    usuario.last_name = last_name
    usuario.email = correo
    usuario.telefono = telefono
    usuario.activo = estado == "Activo"
    if password:
        usuario.set_password(password)
    usuario.save()

    tecnico.especialidad = especialidad
    tecnico.estado = "activo" if estado == "Activo" else "inactivo"
    tecnico.save()
    registrar_auditoria(request, "actualizar", "tecnicos", f"Tecnico actualizado: {usuario.username}.", tecnico.id)

    return JsonResponse({"ok": True, "tecnico": serializar_tecnico(tecnico)})


@require_POST
def eliminar_tecnico(request, tecnico_id):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    try:
        tecnico = Tecnico.objects.select_related("usuario").get(id=tecnico_id)
    except Tecnico.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Técnico no encontrado."}, status=404)

    registrar_auditoria(request, "eliminar", "tecnicos", f"Tecnico eliminado: {tecnico.usuario.username}.", tecnico.id)
    tecnico.usuario.delete()
    return JsonResponse({"ok": True})
