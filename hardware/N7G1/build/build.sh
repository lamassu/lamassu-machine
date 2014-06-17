#!/bin/sh

TARGET_BASE=/Users/josh/Documents/lamassu/n7/build
BUILD_DIR=/Users/josh/projects/sencha-brain/hardware/N7G1/build
LAMASSU_CERT=/Users/josh/projects/sencha-brain/hardware/N7G1/build/template/creds/certs/lamassu.pem
LAMASSU_KEY=/Users/josh/projects/sencha-brain/server/privkey.pem
KEYS=./creds/keys
SOURCE_ROOT=/Users/josh/projects/sencha-server/build/package
TEMPLATE_DIR=$BUILD_DIR/template
ssn=$1
country=$2
country_long=$3
state=$4
city=$5
company=$6

TARGET=$TARGET_BASE/$ssn

echo $company

rm -rf $TARGET
cp -a $TEMPLATE_DIR $TARGET
cd $TARGET 
mkdir -p $KEYS
ln -s $SOURCE_ROOT

PASS=$(openssl rand -base64 18)
SALT=$(openssl rand -base64 6)
HASHED_PASS=\$6\$$SALT\$$(echo -n $PASS | openssl dgst -binary -sha512 | openssl enc -base64 | tr -d "\n=")
SHADOW_LINE=root:$HASHED_PASS:15923:0:::::

echo $PASS > pass.txt
echo $company > company.txt

echo $SHADOW_LINE > etc-shadow.txt
cat etc-shadow.orig.txt >> etc-shadow.txt
chmod 640 etc-shadow.txt

# Generate SSL certificate
SUBJ="/C=$country/ST=$state/O=$company/L=$city/CN=$company/"

openssl genrsa -out $KEYS/client.key 1024 > /dev/null 2>&1
openssl req -key $KEYS/client.key -new -out client.req -batch -subj "$SUBJ" > /dev/null 2>&1
openssl x509 -req -in client.req -CA $LAMASSU_CERT -CAkey $LAMASSU_KEY \
	-CAserial $BUILD_DIR/file.srl -out $KEYS/client.pem -days 730 
