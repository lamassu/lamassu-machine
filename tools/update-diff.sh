#!/bin/bash
set -e

if [ -z "$1" ] || [ -z "$2" ]
  then
    echo "Compares node_modules contents between two update.tar files, given their URL"
    echo -e "\nUsage:"
    echo -e "update-diff <update.tar URL 1> <update.tar URL 2> > <output log file>\n"
    exit 1
fi

TMP_FOLDER=/tmp/lamassu
FOLDER_1=$TMP_FOLDER/update-1
FOLDER_2=$TMP_FOLDER/update-2

NODE_MODULES_PATH_1=package/subpackage/hardware/aaeon/node_modules/
NODE_MODULES_PATH_2=package/subpackage/hardware/ssuboard/node_modules/
NODE_MODULES_PATH_3=package/subpackage/hardware/upboard/node_modules/
NODE_MODULES_PATH_4=package/subpackage/hardware/upboard-4000/node_modules/
NODE_MODULES_PATH_5=package/subpackage/lamassu-machine/node_modules/

mkdir -p $TMP_FOLDER
mkdir -p $FOLDER_1
mkdir -p $FOLDER_2

wget -c $1 -O update1.tar && tar -xf update1.tar -C $FOLDER_1/ && tar -xvf $FOLDER_1/package/subpackage.tgz -C $FOLDER_1/package/
wget -c $2 -O update2.tar && tar -xf update2.tar -C $FOLDER_2/ && tar -xvf $FOLDER_2/package/subpackage.tgz -C $FOLDER_2/package/

echo -e "\n\n\n\nRetrieving diff between aaeon folders..."
(cd $FOLDER_1/$NODE_MODULES_PATH_1 ; find -maxdepth 2 -type d | sort > $TMP_FOLDER/aaeon-update-1.txt)
(cd $FOLDER_2/$NODE_MODULES_PATH_1 ; find -maxdepth 2 -type d | sort > $TMP_FOLDER/aaeon-update-2.txt)
echo -e "\nOnly in $1"
echo -e "--------------------------"
comm -23 $TMP_FOLDER/aaeon-update-1.txt $TMP_FOLDER/aaeon-update-2.txt
echo -e "\nOnly in $2"
echo -e "--------------------------"
comm -13 $TMP_FOLDER/aaeon-update-1.txt $TMP_FOLDER/aaeon-update-2.txt

echo -e "\n\n\n\nRetrieving diff between ssuboard folders..."
(cd $FOLDER_1/$NODE_MODULES_PATH_2 ; find -maxdepth 2 -type d | sort > $TMP_FOLDER/ssuboard-update-1.txt)
(cd $FOLDER_2/$NODE_MODULES_PATH_2 ; find -maxdepth 2 -type d | sort > $TMP_FOLDER/ssuboard-update-2.txt)
echo -e "\nOnly in $1"
echo -e "--------------------------"
comm -23 $TMP_FOLDER/ssuboard-update-1.txt $TMP_FOLDER/ssuboard-update-2.txt
echo -e "\nOnly in $2"
echo -e "--------------------------"
comm -13 $TMP_FOLDER/ssuboard-update-1.txt $TMP_FOLDER/ssuboard-update-2.txt

echo -e "\n\n\n\nRetrieving diff between upboard folders..."
(cd $FOLDER_1/$NODE_MODULES_PATH_3 ; find -maxdepth 2 -type d | sort > $TMP_FOLDER/upboard-update-1.txt)
(cd $FOLDER_2/$NODE_MODULES_PATH_3 ; find -maxdepth 2 -type d | sort > $TMP_FOLDER/upboard-update-2.txt)
echo -e "\nOnly in $1"
echo -e "--------------------------"
comm -23 $TMP_FOLDER/upboard-update-1.txt $TMP_FOLDER/upboard-update-2.txt
echo -e "\nOnly in $2"
echo -e "--------------------------"
comm -13 $TMP_FOLDER/upboard-update-1.txt $TMP_FOLDER/upboard-update-2.txt

echo -e "\n\n\n\nRetrieving diff between upboard-4000 folders..."
(cd $FOLDER_1/$NODE_MODULES_PATH_4 ; find -maxdepth 2 -type d | sort > $TMP_FOLDER/upboard-4000-update-1.txt)
(cd $FOLDER_2/$NODE_MODULES_PATH_4 ; find -maxdepth 2 -type d | sort > $TMP_FOLDER/upboard-4000-update-2.txt)
echo -e "\nOnly in $1"
echo -e "--------------------------"
comm -23 $TMP_FOLDER/upboard-4000-update-1.txt $TMP_FOLDER/upboard-4000-update-2.txt
echo -e "\nOnly in $2"
echo -e "--------------------------"
comm -13 $TMP_FOLDER/upboard-4000-update-1.txt $TMP_FOLDER/upboard-4000-update-2.txt

echo -e "\n\n\n\nRetrieving diff between lamassu-machine folders..."
(cd $FOLDER_1/$NODE_MODULES_PATH_5 ; find -maxdepth 2 -type d | sort > $TMP_FOLDER/machine-update-1.txt)
(cd $FOLDER_2/$NODE_MODULES_PATH_5 ; find -maxdepth 2 -type d | sort > $TMP_FOLDER/machine-update-2.txt)
echo -e "\nOnly in $1"
echo -e "--------------------------"
comm -23 $TMP_FOLDER/machine-update-1.txt $TMP_FOLDER/machine-update-2.txt
echo -e "\nOnly in $2"
echo -e "--------------------------"
comm -13 $TMP_FOLDER/machine-update-1.txt $TMP_FOLDER/machine-update-2.txt

rm -rf $TMP_FOLDER/*
rm update1.tar
rm update2.tar
