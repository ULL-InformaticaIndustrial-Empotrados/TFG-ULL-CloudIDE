#!/bin/bash

ORIGEN=/mnt/cloudIDE
DESTINO=/usr/local/src
CARPETA=TFG-ULL-CloudIDE
BACKEND=code/backend-vm

rsync -a -v \
   --delete \
   --exclude ".git*" \
   --exclude node_modules \
   --exclude memory \
   --exclude presentation \
   --exclude code/backend-vm/package-lock.json \
   $ORIGEN/$CARPETA $DESTINO/

cd $DESTINO/$CARPETA/$BACKEND

npm install

node index.js
