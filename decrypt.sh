#!/bin/sh

for file in `find . -name '*.enc'`; do
  target=${file%%.enc}
  echo "Decrypting '$file' to '$target'..."
  openssl enc -d -aes-256-cbc -in "$file" -out "$target"
done

