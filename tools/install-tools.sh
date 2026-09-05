#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/tools"
cd "$ROOT/tools"
if [[ ! -f phpunit.phar ]]; then
  curl -fsSL -o phpunit.phar "https://phar.phpunit.de/phpunit-10.5.phar"
fi
if [[ ! -f composer.phar ]]; then
  curl -fsSL -o composer.phar "https://github.com/composer/composer/releases/download/2.8.8/composer.phar"
fi
chmod +x phpunit.phar composer.phar
echo "PHPUnit $(../bin/php phpunit.phar --version)"
echo "Composer ready."
