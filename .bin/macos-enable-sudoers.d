#!/bin/sh

die() {
  echo >&2 "$@"
  exit 1
}

# Check that we are superuser (i.e. $(id -u) is zero)
[ `id -u` -eq 0 ] || die "This script needs to run as root"

/usr/bin/sed \
    -i'' \
    -e 's/#includedir \/private\/etc\/sudoers\.d/includedir\/private\/etc\/sudoers\.d/' \
   /etc/sudoers

echo "Contents of /etc/sudoers"
echo "# ... snip ..."
tail -n5 /etc/pam.d/sudo
