#!/bin/bash

if [ $2 -eq 1 ]
then
  ls -d $3/$4-$5
  rm -Rf $3/$4-$5
fi

if [ $2 -eq 2 ]
then
  ls -d $3/*-$4
  rm -Rf $3/*-$4
fi
