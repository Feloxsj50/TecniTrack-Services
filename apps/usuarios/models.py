from django.contrib.auth.models import AbstractUser
from django.db import models


class Usuario(AbstractUser):
    class Rol(models.TextChoices):
        ADMIN = "admin", "Admin"
        TECNICO = "tecnico", "Tecnico"
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
