from .models import RegistroAuditoria


def registrar_auditoria(request, accion, modulo, descripcion, objeto_id=""):
    usuario = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
    return RegistroAuditoria.objects.create(
        usuario=usuario,
        accion=accion,
        modulo=modulo,
        objeto_id=str(objeto_id or ""),
        descripcion=descripcion,
    )
