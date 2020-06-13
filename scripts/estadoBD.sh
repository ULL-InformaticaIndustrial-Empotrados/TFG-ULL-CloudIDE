#!/bin/bash

mysql -c -t -u usuario --password=usuario cloudIDE <<__EOF__
select "Asignaciones";
select * from Asignaciones;
select "Cola";
select * from Cola;
select "Pendientes";
select * from Pendientes;
select "Ovirt";
select * from Ovirt;
select "VMS";
select * from VMS;
select "Ovirt_Pendientes";
select * from Ovirt_Pendientes;
select "Ovirt_Pendientes_up_addstart";
select * from Ovirt_Pendientes_Up_AddStart;
__EOF__
