# Unidad II · Fundamentos Matemáticos

Sitio interactivo de **Ecuaciones e inecuaciones**, construido con la misma estructura académica y funcional de la Unidad I.

## Contenido

1. Ecuaciones de primer grado.
2. Desigualdades lineales.
3. Sistemas de ecuaciones lineales con dos incógnitas.
4. Ecuaciones de segundo grado.

Cada tema contiene teoría paso a paso, ejemplos guiados y seis módulos de práctica con cinco ejercicios por recorrido: respuesta abierta, opción múltiple, relacionar, memoria, ordenar pasos y verdadero/falso.

La fuente prioritaria de ejercicios es *Matemáticas simplificadas*, en particular los capítulos 6, 8, 12 y 13. Los enunciados se adaptaron al formato interactivo y se añadieron retroalimentaciones propias.

## Configuración

El proyecto reutiliza las cuentas, grupos y docentes de Supabase de la Unidad I, pero guarda el avance en `progreso.u2`, separado de `progreso.u1` o del progreso anterior.

Crea en desarrollo un archivo `.env.local`, o configura en Netlify estas variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
TEACHER_LOGIN_EMAIL=
SUPABASE_SERVICE_ROLE_KEY=
```

La clave `SUPABASE_SERVICE_ROLE_KEY` solo se utiliza en el servidor para restablecer contraseñas y archivar intentos. Nunca debe agregarse al repositorio.

## Ejecución

```bash
npm install
npm run dev
```

Para validar la versión de producción:

```bash
npm run build
```

El cierre automático por inactividad ocurre después de 30 minutos. El panel docente conserva la asignación: `DOCENTE001` (1B y 1C), `DOCENTE002` (1D y 1E) y `DOCENTE003` (1A).
