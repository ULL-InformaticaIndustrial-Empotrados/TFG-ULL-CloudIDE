# Ficheros configuracion ELK

En esta carpeta están los ficheros de configuración de
ELK.

Deben situarse en carpeta `/etc/logstash/conf.d` del docker que
corre ELK.

## Imagen Docker

La imagen docker utilizada es `sebp/elk`.
Tiene documentación detallada [aqui](https://elk-docker.readthedocs.io/).

## Arranque del docker

Se hará con el siguiente comando para el arranque *desconectado*

```
docker run -d -p 5601:5601 -p 9200:9200 -p 5044:5044 -it --name elk sebp/elk
```

Queremos poder modificar la configuración de `logstash` desde
maquina anfitriona, para lo que *mount bind* su directorio de configuración

Queremos persistir los datos de `elk`, para lo que *mount bind* su
directorio de datos.

El comando (como root) sería

```
docker run -d \
  -p 5601:5601 -p 9200:9200 -p 5044:5044  \
  -v /root/ELK/logstash_conf.d:/etc/logstash/conf.d \
  -v /root/ELK/elk_data:/var/lib/elasticsearch \
  -it --name elk \
  sebp/elk

```


## Acceso al contenedor

Con el comando

```
docker exec -it elk /bin/bash
```

Para hacer pruebas con `logstash` en consola, primero tenemos que pararlo con

```
/etc/init.d/logstash stop
```

Y luego arrancarlos (para que refresque la configuración) con:

```
/opt/logstash/bin/logstash  --config.reload.automatic
```

según se indica en la documentación de [Logstash][logDocu].

[logDocu]: https://www.elastic.co/guide/en/logstash/7.3/advanced-pipeline.html

## Mejoras ELK

Viendo los mensajes [1][1] y sobre todo [2][2],
vemos la forma *correcta* de recibir distintos tipos de mensajes.

También vemos el uso de `index` al enviar a `elasticsearch`, que
supongo que será fundamental para separar los tipos de eventos.

[1]: https://discuss.elastic.co/t/different-kinds-of-events-from-filebeat-to-logstash-assorting-and-parsing/140391
[2]: https://discuss.elastic.co/t/filter-multiple-different-file-beat-logs-in-logstash/76847/3

Para modificar la configuracíon en la imagen podemos hacer un
[]`mount bind`](https://docs.docker.com/storage/bind-mounts/)
como sugiere en el apartado correspondiente de
la [documentación de la imagen](https://elk-docker.readthedocs.io/#tweaking-the-image).
