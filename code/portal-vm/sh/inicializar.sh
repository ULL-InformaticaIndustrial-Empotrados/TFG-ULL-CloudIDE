#!/bin/bash

# Forma de invocación
# inicializar.sh interfaz_exterior interfaz_interior ip_server_interior

iptables -t nat -F
echo 1 | tee /proc/sys/net/ipv4/ip_forward
iptables -P FORWARD ACCEPT
iptables -t nat -A POSTROUTING -o $1 -j MASQUERADE

#aplicamos source nat, no es del todo necesario pero conviene.
#iptables -t nat -A POSTROUTING -p tcp -o $2 -j SNAT --to $3:1-65535

echo "Iptables vaciado"
