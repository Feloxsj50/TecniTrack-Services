from django.contrib.auth.models import AbstractUser
from django.db import models


class Usuario(AbstractUser):
    class Rol(models.TextChoices):
        ADMIN = "admin", "Admin"
        TECNICO = "tecnico", "Técnico"
        CLIENTE = "cliente", "Cliente"

    rol = models.CharField(max_length=20, choices=Rol.choices, default=Rol.CLIENTE)
    telefono = models.CharField(max_length=25, blank=True)
    direccion = models.CharField(max_length=180, blank=True)
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    def __str__(self):
        nombre = self.get_full_name()
        return nombre or self.username

class ConfiguracionTaller(models.Model):
    nombre = models.CharField(max_length=120, default="TecniTrack Services")
    correo = models.EmailField(default="soporte@tecnitrack.com")
    direccion = models.CharField(max_length=180, default="Managua")
    telefono = models.CharField(max_length=25, default="8888-0000")
    whatsapp = models.CharField(max_length=25, default="8888-0000")
    horario = models.CharField(max_length=120, default="Lun-Sab")
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuracion del taller"
        verbose_name_plural = "Configuracion del taller"

    def __str__(self):
        return self.nombre


class Notificacion(models.Model):
    usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE, related_name="notificaciones")
    titulo = models.CharField(max_length=120)
    mensaje = models.CharField(max_length=240)
    tipo = models.CharField(max_length=20, default="info")
    url = models.CharField(max_length=240, blank=True)
    leida = models.BooleanField(default=False)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-creado_en"]
