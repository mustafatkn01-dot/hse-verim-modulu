#!/bin/sh
# Önbellek sürümünü günceller: ./bump.sh 20261010a
V=${1:?sürüm gerekli}
sed -i -E "s#\?v=[0-9a-z]+#?v=$V#g" index.html js/*.js
