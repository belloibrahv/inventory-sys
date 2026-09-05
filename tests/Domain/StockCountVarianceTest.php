<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\StockCountVariance;
use PHPUnit\Framework\TestCase;

final class StockCountVarianceTest extends TestCase
{
    public function test_found_snapshot_imei_is_a_match(): void
    {
        $v = new StockCountVariance();
        $this->assertSame(
            StockCountVariance::MATCH,
            $v->classify(['branch_id' => 1, 'status' => 'available'], 1, true)
        );
    }

    public function test_missing_and_unknown_and_wrong_branch(): void
    {
        $v = new StockCountVariance();
        $this->assertSame(StockCountVariance::UNKNOWN, $v->classify(null, 1, false));
        $this->assertSame(
            StockCountVariance::WRONG_BRANCH,
            $v->classify(['branch_id' => 2, 'status' => 'available'], 1, false)
        );
        $this->assertSame(
            StockCountVariance::UNEXPECTED_STATUS,
            $v->classify(['branch_id' => 1, 'status' => 'reserved'], 1, false)
        );
    }

    public function test_any_missing_device_needs_approval_before_stock_changes(): void
    {
        $v = new StockCountVariance();
        $summary = $v->summary([
            ['variance' => StockCountVariance::MATCH],
            ['variance' => StockCountVariance::MISSING],
        ]);
        $this->assertSame(1, $summary[StockCountVariance::MISSING]);
        $this->assertTrue($v->needsApproval($summary));
        $this->assertFalse($v->needsApproval($v->summary([['variance' => StockCountVariance::MATCH]])));
        $this->assertTrue($v->canDispose('available'));
        $this->assertFalse($v->canDispose('reserved'));
    }

    public function test_quantity_variance_classification(): void
    {
        $v = new StockCountVariance();
        $this->assertSame(StockCountVariance::MATCH, $v->classifyQuantity(50, 50));
        $this->assertSame(StockCountVariance::MISSING, $v->classifyQuantity(50, 48));
        $this->assertSame(StockCountVariance::UNEXPECTED_STATUS, $v->classifyQuantity(50, 52));
    }
}
