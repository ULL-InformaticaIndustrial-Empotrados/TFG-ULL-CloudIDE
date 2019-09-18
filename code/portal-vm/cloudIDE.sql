-- phpMyAdmin SQL Dump
-- version 4.5.4.1deb2ubuntu2.1
-- http://www.phpmyadmin.net
--
-- Servidor: localhost
-- Tiempo de generación: 22-09-2018 a las 13:30:23
-- Versión del servidor: 5.7.23-0ubuntu0.16.04.1
-- Versión de PHP: 7.0.32-0ubuntu0.16.04.1

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `cloudIDE`
--

-- --------------------------------------------------------

-- --------------------------------------------------------

--
-- Contiene los usuarios que son considerados Profesores y tienen
-- Privilegios. Por ahora se maneja manualmente.
--

CREATE TABLE `Profesores` (
  `usuario` varchar(200) CHARACTER SET utf8
    COLLATE utf8_bin NOT NULL COMMENT 'usuario considerado profesor'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- Indices de la tabla `Profesores`
--
ALTER TABLE `Profesores`
  ADD PRIMARY KEY (`usuario`);

-- --------------------------------------------------------

--
--  Contiene lista de IPs disponibles para máquinas backend
--  50 - portal, 51 - Template, 254 - ELK
--  queda rango de 52 a 253
-- Se gestiona manualmente.
--

CREATE TABLE `Banco_ip` (
  `ip` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
--  Contiene los servicios que tiene un usuario disponible.
--  Lo gestionan profesores al añadir usuarios a servicios.
--

CREATE TABLE `Matriculados` (
  `usuario` varchar(200) NOT NULL,
  `motivo` varchar(200) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
--  Contiene los servicios existentes y los profesores que gestionan
--  el servicio
--

CREATE TABLE `Servicios` (
  `motivo` text NOT NULL,
  `usuario` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
--  Contiene instante de la última conexión de usuario a servicio
--  Se muestra a los profesores cuando visitan usuarios asociados a un servicio
--

CREATE TABLE `Ultima_conexion` (
  `usuario` text NOT NULL,
  `motivo` text NOT NULL,
  `fecha` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


-- -----------------------------------------------------------
-- TABLAS DINÁMICAS INTERNAS A LA GESTIÓN
-- -----------------------------------------------------------

--
--  Se apuntan los servidores PORTAL que están funcionando en cada momento
--  suele haber solo uno.
--

CREATE TABLE `Servidores` (
  `ip_server` text
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------
-- OVIRT
--
-- Máquinas que están encendiéndose o ya encendidas
--  se elimianan cuando Ovirt termina de apagar la máquina
--

CREATE TABLE `Ovirt` (
  `Name` text NOT NULL,
  `ip_vm` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Maquinas que Ovirt está levantando ('up') o bajando ('down')
--  Si subiendo, se eliminan cuando se establece socket con aplicación backend
--  Si bajando, se elimina cuando Ovirt termina su trabajo.
--

CREATE TABLE `Ovirt_Pendientes` (
  `Name` text NOT NULL,
  `ip_vm` text NOT NULL,
  `tipo` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Máquinas que Ovirt está levantando
--  se eliminan cuando Ovirt termina su trabajo
--

CREATE TABLE `Ovirt_Pendientes_Up_AddStart` (
  `Name` text NOT NULL,
  `ip_vm` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Contiene lista de máquinas que están listas para ser usadas por
--   la aplicación (tiene backend funcionando) y tienen sitio para
--   más usuarios.
-- Prioridad 0 si tienen algún usuario ya asignado.
-- Prioridad 1 si no tienen ningún usuario asignado
--

CREATE TABLE `VMS` (
  `prioridad` int(11) DEFAULT NULL,
  `ip_vm` text
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------
-- GESTIÓN DE LOS SERVICIOS
-- --------------------------------------------------------
--
-- Se apuntan mientras se está eliminando usuario particular
--  de un servicio.
-- Se borrará cundo se pare el Che correspondiente, se borre la
--   carpeta y sea borrado de Matriculado.
--

CREATE TABLE `Eliminar_servicio_usuario` (
  `motivo` text NOT NULL,
  `usuario` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------
--
-- Apuntar los servicios que se están borrando
--  se borrará cuando todos los usuarios paren sus servicios,
--  se borren sus carpetas y
--  el servicio sea borrado de `Servicios`
--

CREATE TABLE `Eliminar_servicio` (
  `motivo` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------
-- ASIGNACIONES E CHE
-- --------------------------------------------------------
--
-- Apunta cuando del Che de un usuario-motivo está arrancado, nos
--  dice en que máquina y con que socket
--

CREATE TABLE `Asignaciones` (
  `ip_vm` text,
  `usuario` text,
  `motivo` text,
  `puerto` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- Apunta cuando se solicita levantar un usuario-motivo
--

CREATE TABLE `Cola` (
  `motivo` text,
  `usuario` text
) ENGINE=InnoDB DEFAULT CHARSET=latin1;


--
-- Apunta cuando usuaro-motivo está en proceso de arrancar ('up')
--   o parar ('down') el Che.
--  Se elimina cuando la maquina backend avisa que el Che arrancó o paro,
--

CREATE TABLE `Pendientes` (
  `ip_vm` text,
  `motivo` text,
  `usuario` text,
  `tipo` text
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------


 --------------------------------------------------------

--
-- Apunta la dirección IP desde la que está accediendo el usuario
--  se elimina cuando hace logout o entra desde otra dirección.
--

CREATE TABLE `Firewall` (
  `usuario` text,
  `ip_origen` text
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------



-- --------------------------------------------------------------
-- --------------------------------------------------------------
--
-- Volcado de datos para la tabla `Banco_ip`
--

INSERT INTO `Banco_ip` (`ip`) VALUES
('10.6.134.52'),
('10.6.134.53'),
('10.6.134.54'),
('10.6.134.55'),
('10.6.134.56'),
('10.6.134.57'),
('10.6.134.58'),
('10.6.134.59'),
('10.6.134.60'),
('10.6.134.61'),
('10.6.134.62'),
('10.6.134.63'),
('10.6.134.64'),
('10.6.134.65'),
('10.6.134.66'),
('10.6.134.67'),
('10.6.134.68'),
('10.6.134.69'),
('10.6.134.70'),
('10.6.134.71'),
('10.6.134.72'),
('10.6.134.73'),
('10.6.134.74'),
('10.6.134.75'),
('10.6.134.76'),
('10.6.134.77'),
('10.6.134.78'),
('10.6.134.79'),
('10.6.134.80'),
('10.6.134.81'),
('10.6.134.82'),
('10.6.134.83'),
('10.6.134.84'),
('10.6.134.85'),
('10.6.134.86'),
('10.6.134.87'),
('10.6.134.88'),
('10.6.134.89'),
('10.6.134.90'),
('10.6.134.91'),
('10.6.134.92'),
('10.6.134.93'),
('10.6.134.94'),
('10.6.134.95'),
('10.6.134.96'),
('10.6.134.97'),
('10.6.134.98'),
('10.6.134.99'),
('10.6.134.100'),
('10.6.134.101'),
('10.6.134.102'),
('10.6.134.103'),
('10.6.134.104'),
('10.6.134.105'),
('10.6.134.106'),
('10.6.134.107'),
('10.6.134.108'),
('10.6.134.109'),
('10.6.134.110'),
('10.6.134.111'),
('10.6.134.112'),
('10.6.134.113'),
('10.6.134.114'),
('10.6.134.115'),
('10.6.134.116'),
('10.6.134.117'),
('10.6.134.118'),
('10.6.134.119'),
('10.6.134.120'),
('10.6.134.121'),
('10.6.134.122'),
('10.6.134.123'),
('10.6.134.124'),
('10.6.134.125'),
('10.6.134.126'),
('10.6.134.127'),
('10.6.134.128'),
('10.6.134.129'),
('10.6.134.130'),
('10.6.134.131'),
('10.6.134.132'),
('10.6.134.133'),
('10.6.134.134'),
('10.6.134.135'),
('10.6.134.136'),
('10.6.134.137'),
('10.6.134.138'),
('10.6.134.139'),
('10.6.134.140'),
('10.6.134.141'),
('10.6.134.142'),
('10.6.134.143'),
('10.6.134.144'),
('10.6.134.145'),
('10.6.134.146'),
('10.6.134.147'),
('10.6.134.148'),
('10.6.134.149'),
('10.6.134.150'),
('10.6.134.151'),
('10.6.134.152'),
('10.6.134.153'),
('10.6.134.154'),
('10.6.134.155'),
('10.6.134.156'),
('10.6.134.157'),
('10.6.134.158'),
('10.6.134.159'),
('10.6.134.160'),
('10.6.134.161'),
('10.6.134.162'),
('10.6.134.163'),
('10.6.134.164'),
('10.6.134.165'),
('10.6.134.166'),
('10.6.134.167'),
('10.6.134.168'),
('10.6.134.169'),
('10.6.134.170'),
('10.6.134.171'),
('10.6.134.172'),
('10.6.134.173'),
('10.6.134.174'),
('10.6.134.175'),
('10.6.134.176'),
('10.6.134.177'),
('10.6.134.178'),
('10.6.134.179'),
('10.6.134.180'),
('10.6.134.181'),
('10.6.134.182'),
('10.6.134.183'),
('10.6.134.184'),
('10.6.134.185'),
('10.6.134.186'),
('10.6.134.187'),
('10.6.134.188'),
('10.6.134.189'),
('10.6.134.190'),
('10.6.134.191'),
('10.6.134.192'),
('10.6.134.193'),
('10.6.134.194'),
('10.6.134.195'),
('10.6.134.196'),
('10.6.134.197'),
('10.6.134.198'),
('10.6.134.199'),
('10.6.134.200'),
('10.6.134.201'),
('10.6.134.202'),
('10.6.134.203'),
('10.6.134.204'),
('10.6.134.205'),
('10.6.134.206'),
('10.6.134.207'),
('10.6.134.208'),
('10.6.134.209'),
('10.6.134.210'),
('10.6.134.211'),
('10.6.134.212'),
('10.6.134.213'),
('10.6.134.214'),
('10.6.134.215'),
('10.6.134.216'),
('10.6.134.217'),
('10.6.134.218'),
('10.6.134.219'),
('10.6.134.220'),
('10.6.134.221'),
('10.6.134.222'),
('10.6.134.223'),
('10.6.134.224'),
('10.6.134.225'),
('10.6.134.226'),
('10.6.134.227'),
('10.6.134.228'),
('10.6.134.229'),
('10.6.134.230'),
('10.6.134.231'),
('10.6.134.232'),
('10.6.134.233'),
('10.6.134.234'),
('10.6.134.235'),
('10.6.134.236'),
('10.6.134.237'),
('10.6.134.238'),
('10.6.134.239'),
('10.6.134.240'),
('10.6.134.241'),
('10.6.134.242'),
('10.6.134.243'),
('10.6.134.244'),
('10.6.134.245'),
('10.6.134.246'),
('10.6.134.247'),
('10.6.134.248'),
('10.6.134.249'),
('10.6.134.250'),
('10.6.134.251'),
('10.6.134.252'),
('10.6.134.253');

--
-- Volcado de datos para la tabla `Matriculados`
-- Desactualizado
--

INSERT INTO `Matriculados` (`usuario`, `motivo`) VALUES
('albham', 'InformáticaIndustrial');

--
-- Volcado de datos para la tabla `Servicios`
-- Desactualizado
--

INSERT INTO `Servicios` (`motivo`, `usuario`) VALUES
('InformáticaIndustrial', 'albham'),
('Empotrados', 'albham');



/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
