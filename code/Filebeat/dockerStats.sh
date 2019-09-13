#!/bin/bash
# dockerStats.sh
(docker stats --no-stream \
  --format "container:{{ .Container }}, name:{{ .Name }}, memoryRaw:{{ .MemUsage }}, memoryPercent:{{ .MemPerc }}, cpu:{{ .CPUPerc }}" \
  && \
  df -hT /dev/mapper/ubuntu--vg-root | sed -e /S.ficheros/d \
  | awk '{ printf gensub(",", ".", 1) }' \
  | awk '{ print "total:" $3, "used:" $4, "available:" $5, $8}'\
) >> /var/log/dockerStats.log
sleep 5;
# ---
