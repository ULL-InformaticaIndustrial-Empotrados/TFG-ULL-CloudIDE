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

echo Instalamos Filebeat y ejecutamos dockerStats ========================
dpkg -i $ORIGEN/filebeat-6.6.1-amd64.deb
sleep 10
cp $DESTINO/$CARPETA/code/Filebeat/filebeat.yml /etc/filebeat/
sleep 10
/etc/init.d/filebeat start
while sleep 30; do (sh $DESTINO/$CARPETA/scripts/dockerStats.sh &) ; done &


cd $DESTINO/$CARPETA/$BACKEND

if [ $Actualiza -eq 1 ]
then
    echo Invocamos npm ================
    npm install --production
fi

# Carpeta para la base de datos sglite3
mkdir -p /var/lib/cloudide


echo ==============================
echo Descargamos las imagenes de che
echo ==============================

docker pull eclipse/che:6.12.0 >/dev/null
docker pull eclipse/cpp_gcc >/dev/null

echo ==============================
echo Comienza node
echo ==============================

node index.js
