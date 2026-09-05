<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\DocxExporter;
use PHPUnit\Framework\TestCase;

final class DocxExporterTest extends TestCase
{
    public function test_builds_docx_zip_with_headers_and_rows(): void
    {
        if (!class_exists(\ZipArchive::class)) {
            $this->markTestSkipped('ZipArchive not available');
        }

        $binary = (new DocxExporter())->fromTable('Sales report', ['Invoice', 'Total'], [
            ['INV-1', '100.00'],
            ['INV-2', '250.50'],
        ]);

        $this->assertNotSame('', $binary);
        $this->assertSame('PK', substr($binary, 0, 2));

        $tmp = tempnam(sys_get_temp_dir(), 'docx-test-');
        $path = $tmp . '.docx';
        @unlink($tmp);
        file_put_contents($path, $binary);
        $zip = new \ZipArchive();
        $this->assertTrue($zip->open($path) === true);
        $doc = $zip->getFromName('word/document.xml');
        $zip->close();
        @unlink($path);

        $this->assertIsString($doc);
        $this->assertStringContainsString('Sales report', $doc);
        $this->assertStringContainsString('INV-1', $doc);
        $this->assertStringContainsString('250.50', $doc);
    }
}
