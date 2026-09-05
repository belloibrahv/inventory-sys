<?php
declare(strict_types=1);

$autoload = dirname(__DIR__) . '/vendor/autoload.php';
$fallback = dirname(__DIR__) . '/src/Support/Autoload.php';

if (is_readable($autoload)) {
    require $autoload;
} else {
    require $fallback;
}
