#!/bin/bash

ORIGEN=/mnt/cloudIDE
DESTINO=/usr/local/src
CARPETA=TFG-ULL-CloudIDE
BACKEND=code/backend-vm

echo Actualizamos Hostname ========================
IP=$(ifconfig eth0 | grep "inet:" | sed -e's/^.*inet:\([0-9.]*\) .*$/\1/')
NUM_MAQ=$(echo $IP | cut -d. -f4 )
NombreMaq="backend_${NUM_MAQ}"
echo "Fijando nombre a -$NombreMaq-"
hostnamectl set-hostname $NombreMaq

Actualiza=0
if ! diff -q $DESTINO/$CARPETA/$BACKEND/package.json \
        $ORIGEN/$CARPETA/$BACKEND/package.json &> /dev/null
then
    echo package.json cambiado ============
    Actualiza=1
fi

rsync -a -v \
   --delete \
   --exclude ".git*" \
   --exclude node_modules \
   --exclude memory \
   --exclude presentation \
   --exclude code/backend-vm/package-lock.json \
   --exclude scripts/cloudidebackend.service \
   $ORIGEN/$CARPETA $DESTINO/

echo Activamos Filebeat y ejecutamos dockerStats ========================
systemctl stop filebeat.service
cp $DESTINO/$CARPETA/code/Filebeat/filebeat.yml /etc/filebeat/
systemctl start filebeat.service

$DESTINO/$CARPETA/code/Filebeat/dockerStats.sh &


cd $DESTINO/$CARPETA/$BACKEND

if [ $Actualiza -eq 1 ]
then
    echo Invocamos npm ================
    npm install --production
fi

# Carpeta para la base de datos sglite3
mkdir -p /var/lib/cloudide


CHE_VERSION=6.15.0
echo ==============================
echo Descargamos las imagenes de che ${CHE_VERSION}
echo ==============================
docker pull eclipse/che:${CHE_VERSION} >/dev/null
docker pull eclipse/che-action:${CHE_VERSION} >/dev/null
docker pull eclipse/che-test:${CHE_VERSION} >/dev/null
docker pull eclipse/che-server:${CHE_VERSION} >/dev/null
docker pull eclipse/che-dir:${CHE_VERSION} >/dev/null
docker pull eclipse/che-mount:${CHE_VERSION} >/dev/null
docker pull eclipse/che-init:${CHE_VERSION} >/dev/null
docker pull eclipse/che-ip:${CHE_VERSION} >/dev/null

docker pull eclipse/cpp_gcc >/dev/null

echo ==============================
echo Comienza node
echo ==============================

NODE_ENV=production node index.js
