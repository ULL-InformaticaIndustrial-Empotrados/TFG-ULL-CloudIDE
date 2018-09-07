#!/bin/bash

ORIGEN=/mnt/cloudIDE
DESTINO=/usr/local/src
CARPETA=TFG-ULL-CloudIDE
BACKEND=code/backend-vm

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
   $ORIGEN/$CARPETA $DESTINO/

cd $DESTINO/$CARPETA/$BACKEND

if [ $Actualiza -eq 1 ]
then
    echo Invocamos npm ================
    npm install
fi

echo ==============================
echo Comienza node
echo ==============================

node index.js
