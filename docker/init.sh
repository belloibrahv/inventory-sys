#!/usr/bin/env bash
set -euo pipefail

cd /var/www/html

echo "Waiting for WordPress files..."
for i in $(seq 1 60); do
  if [[ -f wp-includes/version.php ]]; then
    break
  fi
  sleep 2
done

echo "Waiting for database..."
for i in $(seq 1 60); do
  if wp db check --allow-root >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! wp core is-installed --allow-root; then
  wp core install \
    --url="http://localhost:8081" \
    --title="Abu Twins Invent" \
    --admin_user="admin" \
    --admin_password="admin" \
    --admin_email="admin@abutwins.local" \
    --skip-email \
    --allow-root
fi

wp plugin activate atoms --allow-root
wp rewrite structure '/%postname%/' --allow-root
wp rewrite flush --allow-root

echo "Abu Twins Invent is ready at http://localhost:8081/wp-admin/admin.php?page=atoms"
echo "Login: admin / admin"
