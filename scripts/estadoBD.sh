#!/bin/bash

CMD="mysql -c -t -u usuario --password=usuario cloudIDE"
echo "Asignaciones ===================="
$CMD -e 'select motivo, usuario, ip_vm, puerto from Asignaciones order by motivo, usuario, ip_vm, puerto;' 2>/dev/null
echo "Cola ============================"
$CMD -e 'select * from Cola;' 2>/dev/null
echo "Pendientes ======================"
$CMD -e 'select motivo, usuario, ip_vm, tipo from Pendientes order by motivo, usuario, ip_vm;' 2>/dev/null
echo "Ovirt ==========================="
$CMD -e 'select * from Ovirt;' 2>/dev/null
echo "VMS ============================"
$CMD -e 'select * from VMS;' 2>/dev/null
echo "Ovirt_Pendientes ==============="
$CMD -e 'select * from Ovirt_Pendientes;' 2>/dev/null
echo "Ovirt_Pendientes_up_addstart ==="
$CMD -e 'select * from Ovirt_Pendientes_Up_AddStart;' 2>/dev/null
