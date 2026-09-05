<?php
declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    $prefix = 'Atoms\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $relative = substr($class, strlen($prefix));
    $file     = dirname(__DIR__) . '/' . str_replace('\\', '/', $relative) . '.php';

    if (is_readable($file)) {
        require $file;
    }
});
