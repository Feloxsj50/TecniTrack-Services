import json

from django.http import JsonResponse

from .models import Usuario


def obtener_datos_request(request):
    if request.content_type and request.content_type.startswith("application/json"):
        try:
            return json.loads(request.body.decode("utf-8")), None
        except json.JSONDecodeError:
            return None, JsonResponse({"ok": False, "error": "Datos invalidos."}, status=400)
    return request.POST, None


def validar_admin(request, mensaje="Solo el administrador puede realizar esta accion."):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "No hay una sesion activa."}, status=401)
    if request.user.rol != Usuario.Rol.ADMIN:
        return JsonResponse({"ok": False, "error": mensaje}, status=403)
    return None
