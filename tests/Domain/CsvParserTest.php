<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\CsvParser;
use Atoms\Domain\DomainException;
use PHPUnit\Framework\TestCase;

final class CsvParserTest extends TestCase
{
    public function test_maps_headers_and_quoted_commas(): void
    {
        $csv = "sku,name,min price\nSAM-A36,\"Galaxy, 128GB\",280000\n";
        $rows = (new CsvParser())->parse($csv);
        $this->assertCount(1, $rows);
        $this->assertSame('SAM-A36', $rows[0]['sku']);
        $this->assertSame('Galaxy, 128GB', $rows[0]['name']);
        $this->assertSame('280000', $rows[0]['min_selling_price']);
    }

    public function test_skips_blank_lines_and_bom(): void
    {
        $csv = "\xEF\xBB\xBFsku,name\n\nA1,Phone\n,\n";
        $rows = (new CsvParser())->parse($csv);
        $this->assertCount(1, $rows);
        $this->assertSame('A1', $rows[0]['sku']);
    }

    public function test_warranty_header_alias(): void
    {
        $this->assertSame('warranty_days', (new CsvParser())->header('warranty'));
        $this->assertSame('warranty_days', (new CsvParser())->header('Warranty days'));
    }

    public function test_empty_file_is_rejected(): void
    {
        $this->expectException(DomainException::class);
        (new CsvParser())->parse("   \n  ");
    }

    public function test_missing_required_columns_fail_before_import(): void
    {
        $parser = new CsvParser();
        $rows = $parser->parse("name,phone\nAda,0803\n");
        $this->expectException(DomainException::class);
        $parser->assertHeaders($rows[0], ['sku', 'name']);
    }
}
