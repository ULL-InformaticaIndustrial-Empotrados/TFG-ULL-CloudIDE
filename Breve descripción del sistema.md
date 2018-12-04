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


