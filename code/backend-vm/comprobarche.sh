echo $1 | sudo -S su
#limpiamos ids de docker que hayan podido quedarse y que no estén ejecutandose
sudo docker rm $(sudo docker ps -aq)
existe=$(sudo docker ps -qf "name=ULLcloudIDE-$2")
#echo ${#existe}
if [ "${#existe}" = "0" ]; then
  echo "no existe";
else
  echo "si existe";
fi
