import json
import re

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth import update_session_auth_hash
from django.middleware.csrf import get_token
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from apps.clientes.models import Cliente
from apps.usuarios.models import ConfiguracionTaller, Notificacion, Usuario


def serializar_usuario(usuario):
    area = "Administracion" if usuario.rol == Usuario.Rol.ADMIN else "Cliente"
    if usuario.rol == Usuario.Rol.TECNICO and hasattr(usuario, "perfil_tecnico"):
        area = usuario.perfil_tecnico.especialidad or "Técnico"

    return {
        "id": usuario.id,
        "username": usuario.username,
        "nombre": usuario.get_full_name() or usuario.username,
        "email": usuario.email,
        "telefono": usuario.telefono,
        "rol": usuario.rol,
        "area": area,
        "activo": usuario.activo,
    }



def validar_admin(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)
    if request.user.rol != Usuario.Rol.ADMIN:
        return JsonResponse({"ok": False, "error": "Solo admin puede realizar esta acción."}, status=403)
    return None


def separar_nombre(nombre):
    partes = nombre.strip().split()
    if not partes:
        return "", ""
    if len(partes) == 1:
        return partes[0], ""
    return partes[0], " ".join(partes[1:])


def taller_actual():
    taller, _ = ConfiguracionTaller.objects.get_or_create(id=1)
    return taller


def serializar_taller(taller):
    return {
        "nombre": taller.nombre,
        "correo": taller.correo,
        "direccion": taller.direccion,
        "telefono": taller.telefono,
        "whatsapp": taller.whatsapp,
        "horario": taller.horario,
        "actualizadoEn": taller.actualizado_en.isoformat(),
    }


def iso(valor):
    if not valor:
        return ""
    if hasattr(valor, "isoformat"):
        return valor.isoformat()
    return str(valor)


def decimal_float(valor):
    return float(valor or 0)


def nombre_usuario(usuario):
    return usuario.get_full_name() or usuario.username
@ensure_csrf_cookie
@require_GET
def csrf_token(request):
    return JsonResponse({"ok": True, "csrfToken": get_token(request)})


def obtener_datos_request(request):
    if request.content_type == "application/json":
        try:
            return json.loads(request.body.decode("utf-8")), None
        except json.JSONDecodeError:
            return None, JsonResponse({"ok": False, "error": "Datos inválidos."}, status=400)

    return request.POST, None


@require_POST
def iniciar_sesion(request):
    datos, error = obtener_datos_request(request)
    if error:
        return error

    username = datos.get("usuario", "").strip()
    password = datos.get("password", "")

    if not username or not password:
        return JsonResponse({"ok": False, "error": "Completa usuario y contraseña."}, status=400)

    usuario = authenticate(request, username=username, password=password)

    if not usuario or not usuario.activo:
        return JsonResponse({"ok": False, "error": "Usuario o contraseña incorrectos."}, status=401)

    login(request, usuario)
    return JsonResponse({"ok": True, "usuario": serializar_usuario(usuario)})


@require_POST
def registrar_cliente(request):
    datos, error = obtener_datos_request(request)
    if error:
        return error

    nombres = datos.get("nombres", "").strip()
    apellidos = datos.get("apellidos", "").strip()
    username = datos.get("username", "").strip()
    email = datos.get("email", "").strip().lower()
    telefono = datos.get("telefono", "").strip()
    password = datos.get("password", "")
    confirmacion = datos.get("confirmPassword", "")

    if not all([nombres, apellidos, username, email, telefono, password, confirmacion]):
        return JsonResponse({"ok": False, "error": "Completa todos los campos."}, status=400)

    if len(nombres) < 2 or len(apellidos) < 2:
        return JsonResponse({"ok": False, "error": "Nombre y apellido deben tener al menos 2 letras."}, status=400)

    if not re.fullmatch(r"[A-Za-z0-9._-]{4,30}", username):
        return JsonResponse(
            {"ok": False, "error": "El nombre de usuario debe tener 4 a 30 caracteres válidos."},
            status=400,
        )

    if "@" not in email or "." not in email:
        return JsonResponse({"ok": False, "error": "Ingresa un correo válido."}, status=400)

    if not re.fullmatch(r"\d{4}-\d{4}", telefono):
        return JsonResponse({"ok": False, "error": "El teléfono debe tener el formato 7777-8888."}, status=400)

    if len(password) < 8:
        return JsonResponse({"ok": False, "error": "La contraseña debe tener al menos 8 caracteres."}, status=400)

    if password != confirmacion:
        return JsonResponse({"ok": False, "error": "Las contraseñas no coinciden."}, status=400)

    if Usuario.objects.filter(email=email).exists():
        return JsonResponse({"ok": False, "error": "Este correo ya esta registrado."}, status=409)

    if Usuario.objects.filter(username__iexact=username).exists():
        return JsonResponse({"ok": False, "error": "Este nombre de usuario ya esta en uso."}, status=409)

    usuario = Usuario.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=nombres,
        last_name=apellidos,
        telefono=telefono,
        rol=Usuario.Rol.CLIENTE,
        activo=True,
    )
    Cliente.objects.create(usuario=usuario)

    return JsonResponse({"ok": True, "usuario": serializar_usuario(usuario)}, status=201)


@require_POST
def cerrar_sesion(request):
    logout(request)
    return JsonResponse({"ok": True})


@require_GET
def usuario_actual(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    return JsonResponse({"ok": True, "usuario": serializar_usuario(request.user)})


@require_GET
def listar_notificaciones(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesiÃ³n activa."}, status=401)
    notificaciones = Notificacion.objects.filter(usuario=request.user)[:30]
    data = [{
        "id": item.id,
        "titulo": item.titulo,
        "mensaje": item.mensaje,
        "tipo": item.tipo,
        "url": item.url,
        "leida": item.leida,
        "creadoEn": item.creado_en.isoformat(),
    } for item in notificaciones]
    return JsonResponse({"ok": True, "notificaciones": data, "noLeidas": sum(not item.leida for item in notificaciones)})


@require_POST
def marcar_notificacion_leida(request, notificacion_id):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesiÃ³n activa."}, status=401)
    actualizada = Notificacion.objects.filter(id=notificacion_id, usuario=request.user).update(leida=True)
    if not actualizada:
        return JsonResponse({"ok": False, "error": "Notificación no encontrada."}, status=404)
    return JsonResponse({"ok": True})


@require_POST
def actualizar_perfil(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    datos, error = obtener_datos_request(request)
    if error:
        return error

    nombre = datos.get("nombre", "").strip()
    email = datos.get("email", "").strip().lower()
    telefono = datos.get("telefono", "").strip()

    if not all([nombre, email, telefono]):
        return JsonResponse({"ok": False, "error": "Completa nombre, correo y teléfono."}, status=400)

    if len(nombre) < 3:
        return JsonResponse({"ok": False, "error": "El nombre debe tener al menos 3 caracteres."}, status=400)

    if "@" not in email or "." not in email:
        return JsonResponse({"ok": False, "error": "Ingresa un correo válido."}, status=400)

    if not re.fullmatch(r"\d{4}-\d{4}", telefono):
        return JsonResponse({"ok": False, "error": "El teléfono debe tener el formato 7777-8888."}, status=400)

    if Usuario.objects.filter(email=email).exclude(id=request.user.id).exists():
        return JsonResponse({"ok": False, "error": "Este correo ya esta en uso."}, status=409)

    partes = nombre.split()
    request.user.first_name = partes[0]
    request.user.last_name = " ".join(partes[1:])
    request.user.email = email
    request.user.telefono = telefono
    request.user.save()

    return JsonResponse({"ok": True, "usuario": serializar_usuario(request.user)})


@require_POST
def cambiar_password(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    datos, error = obtener_datos_request(request)
    if error:
        return error

    actual = datos.get("actual", "")
    nueva = datos.get("nueva", "")
    confirmacion = datos.get("confirmacion", "")

    if not all([actual, nueva, confirmacion]):
        return JsonResponse({"ok": False, "error": "Completa todos los campos de contraseña."}, status=400)

    if not request.user.check_password(actual):
        return JsonResponse({"ok": False, "error": "La contraseña actual no es correcta."}, status=400)

    if len(nueva) < 8:
        return JsonResponse({"ok": False, "error": "La nueva contraseña debe tener al menos 8 caracteres."}, status=400)

    if nueva != confirmacion:
        return JsonResponse({"ok": False, "error": "La nueva contraseña y la confirmacion no coinciden."}, status=400)

    request.user.set_password(nueva)
    request.user.save()
    update_session_auth_hash(request, request.user)

    return JsonResponse({"ok": True})
@require_GET
def listar_usuarios_admin(request):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    usuarios = Usuario.objects.all().order_by("rol", "username")
    data = [serializar_usuario(usuario) for usuario in usuarios]
    return JsonResponse({"ok": True, "usuarios": data, "total": len(data)})


@require_POST
def cambiar_estado_usuario(request, usuario_id):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    if request.user.id == usuario_id:
        return JsonResponse({"ok": False, "error": "No puedes desactivar tu propia cuenta."}, status=400)

    try:
        usuario = Usuario.objects.get(id=usuario_id)
    except Usuario.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Usuario no encontrado."}, status=404)

    datos, error = obtener_datos_request(request)
    if error:
        return error

    activo = datos.get("activo")
    if not isinstance(activo, bool):
        return JsonResponse({"ok": False, "error": "Estado inválido."}, status=400)

    usuario.activo = activo
    usuario.save(update_fields=["activo", "actualizado_en"])
    return JsonResponse({"ok": True, "usuario": serializar_usuario(usuario)})


@require_POST
def resetear_password_usuario(request, usuario_id):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    try:
        usuario = Usuario.objects.get(id=usuario_id)
    except Usuario.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Usuario no encontrado."}, status=404)

    datos, error = obtener_datos_request(request)
    if error:
        return error

    password = datos.get("password", "")
    if len(password) < 8:
        return JsonResponse({"ok": False, "error": "La contraseña temporal debe tener al menos 8 caracteres."}, status=400)

    usuario.set_password(password)
    usuario.save()
    return JsonResponse({"ok": True})


@require_GET
def obtener_taller(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    return JsonResponse({"ok": True, "taller": serializar_taller(taller_actual())})


@require_POST
def actualizar_taller(request):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    datos, error = obtener_datos_request(request)
    if error:
        return error

    nombre = datos.get("nombre", "").strip()
    correo = datos.get("correo", "").strip().lower()
    direccion = datos.get("direccion", "").strip()
    telefono = datos.get("telefono", "").strip()
    whatsapp = datos.get("whatsapp", "").strip()
    horario = datos.get("horario", "").strip()

    if not all([nombre, correo, direccion, telefono, whatsapp, horario]):
        return JsonResponse({"ok": False, "error": "Completa todos los datos del taller."}, status=400)
    if "@" not in correo or "." not in correo:
        return JsonResponse({"ok": False, "error": "Ingresa un correo válido."}, status=400)
    if not re.fullmatch(r"\d{4}-\d{4}", telefono) or not re.fullmatch(r"\d{4}-\d{4}", whatsapp):
        return JsonResponse({"ok": False, "error": "Telefono y WhatsApp deben tener formato 7777-8888."}, status=400)

    taller = taller_actual()
    taller.nombre = nombre
    taller.correo = correo
    taller.direccion = direccion
    taller.telefono = telefono
    taller.whatsapp = whatsapp
    taller.horario = horario
    taller.save()
    return JsonResponse({"ok": True, "taller": serializar_taller(taller)})


@require_GET
def exportar_backup(request):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    from apps.facturacion.models import Factura
    from apps.inventario.models import ProductoInventario
    from apps.servicios.models import SolicitudServicio
    from apps.soporte.models import TicketSoporte
    from apps.tecnicos.models import Tecnico

    usuarios = Usuario.objects.all().order_by("rol", "username")
    clientes = Cliente.objects.select_related("usuario").all()
    tecnicos = Tecnico.objects.select_related("usuario").all()
    servicios = SolicitudServicio.objects.select_related("cliente__usuario", "tecnico__usuario").all()
    inventario = ProductoInventario.objects.all()
    facturas = Factura.objects.select_related("solicitud__cliente__usuario", "solicitud__tecnico__usuario").all()
    tickets = TicketSoporte.objects.select_related("usuario").all()

    resumen = {
        "usuarios": usuarios.count(),
        "clientes": clientes.count(),
        "tecnicos": tecnicos.count(),
        "servicios": servicios.count(),
        "inventario": inventario.count(),
        "facturas": facturas.count(),
        "tickets": tickets.count(),
    }

    if request.GET.get("resumen") == "1":
        return JsonResponse({
            "ok": True,
            "metadata": {
                "sistema": "TecniTrack",
                "version": "1.0",
                "generadoEn": timezone.now().isoformat(),
                "generadoPor": request.user.username,
            },
            "resumen": resumen,
        })

    backup = {
        "metadata": {
            "sistema": "TecniTrack",
            "version": "1.0",
            "generadoEn": timezone.now().isoformat(),
            "generadoPor": request.user.username,
            "formato": "json",
            "nota": "Respaldo administrativo generado desde Django.",
        },
        "resumen": resumen,
        "taller": serializar_taller(taller_actual()),
        "usuarios": [serializar_usuario(usuario) for usuario in usuarios],
        "clientes": [
            {
                "id": cliente.id,
                "usuario": cliente.usuario.username,
                "nombre": nombre_usuario(cliente.usuario),
                "correo": cliente.usuario.email,
                "telefono": cliente.usuario.telefono,
                "estado": "Activo" if cliente.usuario.activo else "Inactivo",
                "creadoEn": iso(cliente.creado_en),
            }
            for cliente in clientes
        ],
        "tecnicos": [
            {
                "id": tecnico.id,
                "usuario": tecnico.usuario.username,
                "nombre": nombre_usuario(tecnico.usuario),
                "correo": tecnico.usuario.email,
                "telefono": tecnico.usuario.telefono,
                "especialidad": tecnico.especialidad,
                "estado": "Activo" if tecnico.usuario.activo else "Inactivo",
                "creadoEn": iso(tecnico.creado_en),
            }
            for tecnico in tecnicos
        ],
        "servicios": [
            {
                "id": servicio.id,
                "codigo": f"SOL-{servicio.id:03d}",
                "cliente": nombre_usuario(servicio.cliente.usuario) if servicio.cliente else servicio.cliente_nombre,
                "tecnico": nombre_usuario(servicio.tecnico.usuario) if servicio.tecnico else "Sin asignar",
                "dispositivo": servicio.dispositivo,
                "problema": servicio.problema,
                "fechaPreferida": iso(servicio.fecha_preferida),
                "prioridad": servicio.get_prioridad_display(),
                "estado": servicio.get_estado_display(),
                "diagnostico": servicio.diagnostico,
                "repuestoUsado": servicio.repuesto_usado,
                "facturada": hasattr(servicio, "factura"),
                "creadoEn": iso(servicio.creado_en),
            }
            for servicio in servicios
        ],
        "inventario": [
            {
                "id": producto.id,
                "codigo": producto.codigo,
                "nombre": producto.nombre,
                "categoria": producto.categoria,
                "proveedor": producto.proveedor,
                "serie": producto.serie,
                "stock": producto.stock,
                "stockMinimo": producto.stock_minimo,
                "precioCompra": decimal_float(producto.precio_compra),
                "precioVenta": decimal_float(producto.precio_venta),
                "ubicacion": producto.ubicacion,
                "estado": producto.estado,
                "activo": producto.activo,
            }
            for producto in inventario
        ],
        "facturas": [
            {
                "id": factura.id,
                "numero": factura.numero,
                "fecha": iso(factura.fecha),
                "solicitud": f"SOL-{factura.solicitud_id:03d}",
                "cliente": nombre_usuario(factura.solicitud.cliente.usuario) if factura.solicitud.cliente else factura.solicitud.cliente_nombre,
                "servicio": factura.solicitud.problema,
                "metodoPago": factura.get_metodo_pago_display(),
                "estado": factura.get_estado_display(),
                "montoServicio": decimal_float(factura.servicio_monto),
                "montoRepuestos": decimal_float(factura.repuestos_monto),
                "total": decimal_float(factura.total),
                "garantia": factura.garantia,
                "productos": factura.productos,
            }
            for factura in facturas
        ],
        "tickets": [
            {
                "id": ticket.id,
                "codigo": f"TK-{ticket.id:03d}",
                "usuario": ticket.usuario.username,
                "rol": ticket.rol,
                "nombre": ticket.nombre,
                "correo": ticket.correo,
                "area": ticket.area,
                "asunto": ticket.asunto,
                "detalle": ticket.detalle,
                "respuesta": ticket.respuesta,
                "estado": ticket.get_estado_display(),
                "creadoEn": iso(ticket.creado_en),
                "respondidoEn": iso(ticket.respondido_en),
            }
            for ticket in tickets
        ],
    }
    return JsonResponse({"ok": True, "backup": backup})
