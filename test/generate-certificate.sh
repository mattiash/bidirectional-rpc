#!/bin/sh

openssl genrsa -out server-key.pem 2048
openssl req -new -sha256 -key server-key.pem -nodes -days 365 -subj '/CN=test.holmlund.se' -out server-csr.pem
openssl x509 -req -in server-csr.pem -signkey server-key.pem -out server-cert.pem
