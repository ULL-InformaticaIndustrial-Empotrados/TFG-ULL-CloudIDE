# Arrancando WS

Se nos ocurre que si copiamos el directorio que a acreado un usuario en
`/mnt/cloudide/<usuario>-<servicio>` a otro usuario
tendrá la misma configuración.

Hacemos prueba y vemos que es así.

La idea es que los profesores creen servicio y configuren WS
con lo que deban tener los alumnos.
Esa carpeta del profesor se copiará a los alumnos y tendrán
el mismos WS.

Lo ideal es que, cuando entre el alumno, se arranque el WS
correspondiente al servicio y se le muestre directamente el WS.

## Swager

Mirando documentación de CHE6, vemos que existe API para gestionar
el servidor CHE.

A esta se accede a través de la ruta `/swagger`,
en nuestro caso `http://cloudide.iaas.ull.es:8082/swagger/`.

Las funcionalidades más interesantes son las asociadas a `workspace`.

### Lista WS

Haciendo GET sobre
`http://cloudide.iaas.ull.es:8082/api/workspace?skipCount=0&maxItems=30`
devuelve en JSON información de todos los WS asociados al servidor CHE:

```
curl -X GET --header 'Accept: application/json' \
  'http://cloudide.iaas.ull.es:8082/api/workspace?skipCount=0&maxItems=30'
```

### WS según nombre

Permite obtener el id (junto con otra mucha información)
del WS apartir del nombre completo en la forma
`namespace:nombre`.
Por defecto los WS están en namespace `che`

Un ejemplo sería

```
curl -X GET --header 'Accept: application/json' \
'http://cloudide.iaas.ull.es:8082/api/workspace/che%3Ainformaticaindustrial?includeInternalServers=false'
```

donde los dos puntos (`:`) se han tenido que codificar
con su entidad `%3A`.


### Arranque del WS

Una vez se tiene el `id` se puede arrancar un WS
haciendo POST sobre
`http://cloudide.iaas.ull.es:8082/api/workspace/{id}/runtime`

Un ejemplo sería

```
curl -X POST --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  'http://cloudide.iaas.ull.es:8082/api/workspace/workspace69fl7dnfh9jdgt3r/runtime'
```

### Parada del WS

Una vez se tiene el `id` se puede parar un WS
haciendo un DELETE sobre
`http://cloudide.iaas.ull.es:8082/api/workspace/{id}/runtime`

Un ejemplo sería

```
curl -X DELETE --header 'Accept: application/json' \
  'http://cloudide.iaas.ull.es:8082/api/workspace/workspace69fl7dnfh9jdgt3r/runtime'
```

### Desde máquina backend

Desde las máquinas backend, la dirección de acceso es `localhost` y
el puerto el que corresponda al servidor CHE arrancado para el ususario.
