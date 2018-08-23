#!/bin/bash

if [ $2 -eq 1 ]
then
  rm -Rf $3/$4-$5
fi

if [ $2 -eq 2 ]
then
  rm -Rf $3/*-$4
fi
