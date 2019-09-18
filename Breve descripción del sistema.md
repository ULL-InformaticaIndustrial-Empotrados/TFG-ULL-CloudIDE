# Breve descripción del sistema


## Máquina portal

La máquina principal del sistema es la máquina portal
`cloudide.iaas.ull.es` en Ovirt figura como `ULL-CloudIDE-Portal`.

Esta máquina consta de dos interfaces de red. El `eth0` tiene salida
al exterior, mientras que el `eth1` está en red interna aislada
(sin conexión a internet) `10.6.134.0/24`.

Se accede a ella como usuario `root`
(solo permite acceso con clave pública):

```bash
ssh root@cloudide.iaas.ull.es
```

### Código de la aplicación

El código de la aplicación se encuentra en `/mnt/cloudIDE/TFG-ULL-CloudIDE/`

La carpeta `code/portal-vm` corresponde al servidor NodeJS que
se ejecuta en la máquina portal.

El arranque de la aplicación se realiza a través del servicio
`cloudideportal` definido en `systemd`.
El fichero de definición del servicio puede verse en
`/mnt/cloudIDE/TFG-ULL-CloudIDE/scripts/cloudideportal.service`.

En la carpeta `code/backen-vm` está el código que ejecuata el
servidor NodeJS en las máquinas *backend*.

## Máquinas *backend*

Las máquinas *backend* se crean a partir de la plantilla
`ULL-CloudIDE-backend-tpl`.

Su tarjeta de red estará en la red interna.
La máquina portal es la que hace de *gateway* para que esas máquinas
tengan salida al exterior,
configurando adecuadamente su *firewall* mediante `iptables`.


La dirección IP de estas las máquinas se asigna en el momento de
levantarlas. El rango de IPs (supuestamente) disponibles
va del 50 al 254, aunque la dirección 50 la utiliza la máquina portal
y la 51 la máquina *plantilla*.

Para arrancar una máquina backend con la dirección 200 (por ejemplo)
hay que ejecutar:

```bash
cd /mnt/cloudIDE/TFG-ULL-CloudIDE/code/portal-vm
python ./ovirtpython/add_and_start_vm.py ULL-CloudIDE-backend-10.6.134.200 10.6.134.200
```

Una vez activa, se podrá acceder a la misma por `ssh` desde la máquina
portal:

```bash
ssh root@10.6.134.200
```

### Aplicación en máquinas *backend*

La aplicación en las maquinas *backend* se encuentra en
`/usr/local/src/TFG-ULL-CloudIDE`.

Esta carpeta se actualiza después de cada arranque desde la carpeta
`/mnt/cloudIDE/TFG-ULL-CloudIDE/` a través del scritp
`/mnt/cloudIDE/TFG-ULL-CloudIDE/scripts/actualizaArrancaBackend.sh`.
Este script está definido como un servicio `cloudidebackend` de `systemd`.
Su fichero de definición está en
`/mnt/cloudIDE/TFG-ULL-CloudIDE/scripts/cloudidebackend.service`.

La carpeta `/mnt/cloudIDE` se monta por NFS en todas las *backend*
y contiene, además de la aplicación, los datos de todos los usuarios
que han entrado al sistema.


## Vitácoras

Los ficheros de vitácora (*log*) de las aplicaciones pueden verse en:

- Para el portal en `/var/log/cloudideportal/portal.log`.
Para ver los mensajes asociados al servicio `systemd` se debe usar el
comando `journalctl -u cloudideportal`.



- Para el backend en `/var/log/cloudidebackend/backend.log`.
Para ver los mensajes asociados al servicio `systemd` se debe usar el
comando `journalctl -u cloudidebackend`

## Base de datos

Las tablas de la BD se dividen en 2 grandes grupos.
Las que dan persistencia entre ejecuciones a la aplicación
y las dinámicas que se utilizan en distintos procesos de la misma.

### Tablas *estáticas*

| Nombre Tabla | Campos   | Funionalidad  |
|--------------|----------|---------------|
|`Banco_ip`    |`ip` varchar| Contiene lista de IPs disponibles para máquinas backend. Se gestiona manualmente (queda rango de 52 a 253) |
| `Profesores` |`usuario` varchar| Contiene los usuarios que son considerados Profesores y tienen privilegios. Por ahora se maneja manualmente |
|`Servicios` | `motivo` text, `usuario` text | Contiene los servicios existentes y los profesores que gestionan el servicio. Se gestiona por web al crear o eliminar servicios |
|`Ultima_conexion`|`usuario` text,  `motivo` text, `fecha` timestamp | Contiene instante de la última conexión de usuario a servicio. Se muestra a los profesores cuando visitan usuarios asociados a un servicio |

### Tablas dinámincas

Son internas a la aplicación

#### Gestión de VMs

| Nombre Tabla | Campos   | Funionalidad  |
|--------------|----------|---------------|
| `Servidores` | `ip_server` text| Se apuntan los servidores PORTAL que están funcionando en cada momento. Suele haber solo uno. |
|`Ovirt` | `Name` text, `ip_vm` varchar | Máquinas que están encendiéndose o ya encendidas. Se elimianan cuando Ovirt termina de apagar la máquina
|`Ovirt_Pendientes`| `Name` text,`ip_vm` text, `tipo` text|Maquinas que Ovirt está levantando ('up') o bajando ('down'). Si subiendo, se eliminan cuando se establece socket con aplicación backend. Si bajando, se elimina cuando Ovirt termina su trabajo.|
| `Ovirt_Pendientes_Up_AddStart`|`Name` text, `ip_vm` text| Máquinas que Ovirt está levantando. Se eliminan cuando Ovirt termina su trabajo |
| `VMS` | `ip_vm` text, `prioridad` int| Contiene lista de máquinas que están listas para ser usadas por la aplicación (tiene backend funcionando) y tienen sitio para más usuarios. Prioridad 0 si tienen algún usuario ya asignado. Prioridad 1 si no tienen ningún usuario asignado. |

#### Gestion de servicios

| Nombre Tabla | Campos   | Funionalidad  |
|--------------|----------|---------------|
| `Eliminar_servicio_usuario` | `motivo` text, `usuario` text|Se apuntan mientras se está eliminando usuario particular de un servicio. Se borrará cundo se pare el Che correspondiente, se borre la carpeta y sea borrado de Matriculado.
|`Eliminar_servicio`| `motivo` text| Apuntar los servicios que se están borrando. Se borrará cuando todos los usuarios paren sus servicios, se borren sus carpetas y el servicio sea borrado de `Servicios`.|


#### Ejecuciones de Che

| Nombre Tabla | Campos   | Funionalidad  |
|--------------|----------|---------------|
| `Asignaciones`| `ip_vm` text, `usuario` text, `motivo` text, `puerto` int| Apunta cuando del Che de un usuario-motivo está arrancado, nos dice en que máquina y con que socket.|
| `Cola`| `motivo` text, `usuario` text| Apunta cuando se solicita levantar un usuario-motivo. Se elimina cuando petición se asigna y envía a máquina backend|
|`Pendientes`|  `ip_vm` text, `motivo` text, `usuario` text, `tipo` text| Apunta cuando usuaro-motivo está en proceso de arrancar ('up') o parar ('down') el Che. Se elimina cuando la maquina backend avisa que el Che arrancó o paro|


#### Firewal

| Nombre Tabla | Campos   | Funionalidad  |
|--------------|----------|---------------|
| `Firewall` |   `usuario` text, `ip_origen` text | Apunta la dirección IP desde la que está accediendo el usuario. Se elimina cuando hace logout o entra desde otra dirección.|

