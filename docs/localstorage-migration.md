# Migracion de localStorage a Django

Este archivo sirve como guia para quitar `localStorage` sin romper el frontend actual.

## Regla de trabajo

No borrar una clave del frontend hasta que exista:

1. Modelo Django.
2. Vista o endpoint.
3. Validacion de permisos por rol.
4. Prueba manual del flujo.

## Claves actuales

| Clave | Uso actual | Destino Django |
| --- | --- | --- |
| `tecnitrackUsuarios` | Login demo, registro y gestion de usuarios | `usuarios.Usuario`, `clientes.Cliente`, `tecnicos.Tecnico` |
| `tecnitrackSolicitudes` | Solicitudes/ordenes entre cliente, admin y tecnico | `servicios.SolicitudServicio` |
| `tecnitrackTicketsSoporte` | Mensajes de ayuda y soporte | `soporte` |
| `tecnitrackTaller` | Datos del taller en configuracion y ayuda | futura app/configuracion o modelo `DatosTaller` |
| `tecnitrackResetsPassword` | Historial demo de reseteos | flujo real de usuarios/admin |
| `tecnitrackSesion` | Sesion demo por rol | autenticacion Django |
| `tecnitrackMensaje` | Mensajes temporales entre pantallas | mensajes Django o respuestas JSON |

## Orden recomendado

1. Reemplazar `tecnitrackUsuarios` con usuarios reales de Django.
2. Reemplazar `tecnitrackSolicitudes` con `SolicitudServicio`.
3. Reemplazar tickets de soporte.
4. Reemplazar configuracion del taller.
5. Quitar sesion demo y usar login Django.
