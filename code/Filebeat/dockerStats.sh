#!/bin/bash
# dockerStats.sh

while sleep 30;
do
  docker stats --no-stream \
    --format "container:{{ .Container }}, name:{{ .Name }}, memoryRaw:{{ .MemUsage }}, memoryPercent:{{ .MemPerc }}, cpu:{{ .CPUPerc }}" \
   >> /var/log/dockerStats.log

  LANG=C df -h / | tail -1 \
  | awk '{ print "total:" $2, "used:" $3, "available:" $4, "percent:" $5 }'\
  >> /var/log/diskUsage.log

  LANG=C free -m -w | grep 'Mem:' \
  | awk '{ print "Memory total:" $2, "used:" $3, "available:" $4,  "percent:" ($3/$2)*100}'\
  >> /var/log/memUsage.log
done
