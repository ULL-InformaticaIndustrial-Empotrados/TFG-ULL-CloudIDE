#!/bin/bash

docker rm $(docker ps -aq) #limpiamos ids de docker que hayan podido quedarse y que no estén ejecutandose
existe=$(docker ps -qf "name=ULLcloudIDE-$2")
#echo ${#existe}
if [ "${#existe}" = "0" ]; then
  echo "no existe";
else
  echo "si existe";
fi
