import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from threading import Barrier

from django.db import close_old_connections
from django.test import Client, TransactionTestCase

from apps.clientes.models import Cliente
from apps.inventario.models import MovimientoInventario, ProductoInventario
from apps.servicios.models import SolicitudServicio
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Usuario

from .models import Factura


class FacturacionConcurrenciaTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.password_admin = "AdminConcurrencia123!"
        self.admin = Usuario.objects.create_user(
            username="admin_concurrencia",
            password=self.password_admin,
            email="admin.concurrencia@test.local",
            rol=Usuario.Rol.ADMIN,
            activo=True,
        )
        cliente_usuario = Usuario.objects.create_user(
            username="cliente_concurrencia",
            password="ClienteConcurrencia123!",
            email="cliente.concurrencia@test.local",
            rol=Usuario.Rol.CLIENTE,
        )
        self.cliente = Cliente.objects.create(usuario=cliente_usuario)
        tecnico_usuario = Usuario.objects.create_user(
            username="tecnico_concurrencia",
            password="TecnicoConcurrencia123!",
            email="tecnico.concurrencia@test.local",
            rol=Usuario.Rol.TECNICO,
        )
        self.tecnico = Tecnico.objects.create(
            usuario=tecnico_usuario,
            especialidad="Reparacion",
        )
        self.orden = self.crear_orden("Laptop principal")
        self.producto = ProductoInventario.objects.create(
            nombre="Bateria concurrente",
            categoria=ProductoInventario.Categoria.BATERIAS,
            stock=2,
            stock_minimo=1,
            precio_compra=Decimal("20.00"),
            precio_venta=Decimal("35.00"),
            ubicacion="Estante concurrente",
        )

    def crear_orden(self, dispositivo):
        return SolicitudServicio.objects.create(
            cliente=self.cliente,
            tecnico=self.tecnico,
            dispositivo=dispositivo,
            problema="Reparacion concurrente",
            fecha_preferida=date.today(),
            estado=SolicitudServicio.Estado.COMPLETADO,
        )

    def facturar_en_hilo(self, solicitud_id, productos, barrera):
        close_old_connections()
        try:
            cliente = Client()
            if not cliente.login(
                username=self.admin.username,
                password=self.password_admin,
            ):
                return 500, {"error": "No se pudo iniciar la sesion de prueba."}
            barrera.wait(timeout=10)
            respuesta = cliente.post(
                "/facturacion/crear/",
                data=json.dumps({
                    "solicitudId": solicitud_id,
                    "montoServicio": "45.00",
                    "productos": productos,
                    "metodoPago": "Efectivo",
                    "estado": "Pagado",
                }),
                content_type="application/json",
            )
            return respuesta.status_code, respuesta.json()
        finally:
            close_old_connections()

    def ejecutar_en_paralelo(self, operaciones):
        barrera = Barrier(len(operaciones))
        with ThreadPoolExecutor(max_workers=len(operaciones)) as executor:
            futuros = [
                executor.submit(
                    self.facturar_en_hilo,
                    solicitud_id,
                    productos,
                    barrera,
                )
                for solicitud_id, productos in operaciones
            ]
            return [futuro.result(timeout=30) for futuro in futuros]

    def test_dos_hilos_no_facturan_dos_veces_la_misma_orden(self):
        productos = [{
            "producto": self.producto.nombre,
            "cantidad": 1,
            "precio": "35.00",
        }]

        resultados = self.ejecutar_en_paralelo([
            (self.orden.id, productos),
            (self.orden.id, productos),
        ])

        self.assertEqual(sorted(estado for estado, _ in resultados), [201, 409])
        self.assertEqual(Factura.objects.filter(solicitud=self.orden).count(), 1)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 1)
        self.assertEqual(
            MovimientoInventario.objects.filter(tipo=MovimientoInventario.Tipo.SALIDA).count(),
            1,
        )

    def test_dos_ordenes_compiten_por_la_ultima_unidad(self):
        self.producto.stock = 1
        self.producto.save(update_fields=["stock"])
        otra_orden = self.crear_orden("Laptop secundaria")
        productos = [{
            "producto": self.producto.nombre,
            "cantidad": 1,
            "precio": "35.00",
        }]

        resultados = self.ejecutar_en_paralelo([
            (self.orden.id, productos),
            (otra_orden.id, productos),
        ])

        self.assertEqual(sorted(estado for estado, _ in resultados), [201, 400])
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 0)
        self.assertEqual(Factura.objects.count(), 1)
        self.assertEqual(
            MovimientoInventario.objects.filter(tipo=MovimientoInventario.Tipo.SALIDA).count(),
            1,
        )

    def test_facturas_concurrentes_reciben_numeros_distintos(self):
        otra_orden = self.crear_orden("Laptop para numeracion")

        resultados = self.ejecutar_en_paralelo([
            (self.orden.id, []),
            (otra_orden.id, []),
        ])

        self.assertEqual(sorted(estado for estado, _ in resultados), [201, 201])
        facturas = list(Factura.objects.order_by("id"))
        self.assertEqual(len(facturas), 2)
        self.assertEqual(len({factura.numero for factura in facturas}), 2)
        for factura in facturas:
            self.assertEqual(factura.numero, f"F-{factura.id:03d}")
