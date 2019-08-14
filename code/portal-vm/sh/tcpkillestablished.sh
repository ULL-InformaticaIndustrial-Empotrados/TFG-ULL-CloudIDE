#!/bin/bash

# Forma de invocación:
# tcpkillestablished.sh ${ipSource}

tcpkill host $1 and portrange 8082-8089 and portrange 32768-65535  &

sleep 20

kill -9 $!
