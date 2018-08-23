#!/bin/bash

iptables -t nat -F
echo 1 | tee /proc/sys/net/ipv4/ip_forward
iptables -P FORWARD ACCEPT
iptables -t nat -A POSTROUTING -o $2 -j MASQUERADE
#iptables -t nat -A POSTROUTING -p tcp -o $3 -j SNAT --to $4:1-65535 #aplicamos source nat, no es del todo necesario pero conviene.

echo "Iptables vaciado"
