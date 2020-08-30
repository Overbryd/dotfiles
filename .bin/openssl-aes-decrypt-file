#!/bin/sh

if echo "$1" | grep -E ".enc$"; do
  target=${1%%.enc}
  echo "Decrypting '$1' to '$target'"
  openssl enc -d -aes-256-cbc -in "$1" -out "$target"
else
  echo "Cannot decrypt files not ending in .enc"
  exit 1
done

