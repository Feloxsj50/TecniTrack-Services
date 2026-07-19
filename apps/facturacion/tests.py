import json
from datetime import date
from decimal import Decimal

from django.test import Client, TestCase

from apps.clientes.models import Cliente
from apps.inventario.models import MovimientoInventario, ProductoInventario
from apps.servicios.models import SolicitudServicio
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Usuario
from .models import Factura


class FacturacionInventarioTests(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_superuser("admin_fact", "admin@test.local", "AdminFact123!")
        self.admin.rol = Usuario.Rol.ADMIN
        self.admin.activo = True
        self.admin.save(update_fields=["rol", "activo"])
        cliente_usuario = Usuario.objects.create_user(
            "cliente_fact", password="ClienteFact123!", first_name="Cliente", last_name="Fact",
            email="cliente.fact@test.local", telefono="7777-2000", rol=Usuario.Rol.CLIENTE,
        )
        self.cliente = Cliente.objects.create(usuario=cliente_usuario)
        tecnico_usuario = Usuario.objects.create_user(
            "tecnico_fact", password="TecnicoFact123!", first_name="Tecnico", last_name="Fact",
            email="tecnico.fact@test.local", telefono="7777-2001", rol=Usuario.Rol.TECNICO,
        )
        self.tecnico = Tecnico.objects.create(usuario=tecnico_usuario, especialidad="Reparacion")
        self.orden = SolicitudServicio.objects.create(
            cliente=self.cliente, tecnico=self.tecnico, dispositivo="Laptop", problema="Cambio de bateria",
            fecha_preferida=date.today(), estado=SolicitudServicio.Estado.COMPLETADO,
            diagnostico="Trabajo terminado correctamente.",
        )
        self.producto = ProductoInventario.objects.create(
            nombre="Bateria de prueba", categoria=ProductoInventario.Categoria.BATERIAS,
            stock=2, stock_minimo=1, precio_compra=Decimal("20.00"), precio_venta=Decimal("35.00"),
            ubicacion="Estante A",
        )

    def test_factura_descuenta_y_eliminar_factura_restaura_stock(self):
        admin_client = Client()
        self.assertTrue(admin_client.login(username="admin_fact", password="AdminFact123!"))
        respuesta = admin_client.post(
            "/facturacion/crear/",
            data=json.dumps({
                "solicitudId": self.orden.id,
                "montoServicio": "45.00",
                "productos": [{"producto": self.producto.nombre, "cantidad": 1, "precio": "35.00"}],
                "metodoPago": "Efectivo",
                "estado": "Pagado",
                "garantia": "30 dias",
            }),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 201)
        factura = Factura.objects.get(solicitud=self.orden)
        self.producto.refresh_from_db()
        self.assertEqual(factura.total, Decimal("80.00"))
        self.assertEqual(self.producto.stock, 1)
        self.assertTrue(MovimientoInventario.objects.filter(tipo=MovimientoInventario.Tipo.SALIDA).exists())

        respuesta = admin_client.post(f"/facturacion/{factura.id}/eliminar/")
        self.assertEqual(respuesta.status_code, 200)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 2)
        self.assertFalse(Factura.objects.filter(id=factura.id).exists())

    def test_tecnico_no_puede_crear_facturas(self):
        tecnico_client = Client()
        self.assertTrue(tecnico_client.login(username="tecnico_fact", password="TecnicoFact123!"))
        respuesta = tecnico_client.post(
            "/facturacion/crear/",
            data=json.dumps({"solicitudId": self.orden.id, "montoServicio": "10.00", "productos": []}),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 403)

    def test_no_permite_usar_stock_insuficiente(self):
        self.producto.stock = 0
        self.producto.save(update_fields=["stock"])
        admin_client = Client()
        self.assertTrue(admin_client.login(username="admin_fact", password="AdminFact123!"))
        respuesta = admin_client.post(
            "/facturacion/crear/",
            data=json.dumps({
                "solicitudId": self.orden.id,
                "montoServicio": "45.00",
                "productos": [{"producto": self.producto.nombre, "cantidad": 1, "precio": "35.00"}],
            }),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertFalse(Factura.objects.filter(solicitud=self.orden).exists())

    def test_repetir_factura_no_crea_registros_duplicados(self):
        admin_client = Client()
        self.assertTrue(admin_client.login(username="admin_fact", password="AdminFact123!"))
        datos = json.dumps({
            "solicitudId": self.orden.id,
            "montoServicio": "45.00",
            "productos": [],
        })
        self.assertEqual(admin_client.post("/facturacion/crear/", data=datos, content_type="application/json").status_code, 201)
        self.assertEqual(admin_client.post("/facturacion/crear/", data=datos, content_type="application/json").status_code, 201)
        self.assertEqual(Factura.objects.filter(solicitud=self.orden).count(), 1)
