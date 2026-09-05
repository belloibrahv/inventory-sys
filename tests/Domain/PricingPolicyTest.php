<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\PriceBulkUpdate;
use Atoms\Domain\PricingPolicy;
use PHPUnit\Framework\TestCase;

final class PricingPolicyTest extends TestCase
{
    public function test_reduction_threshold_triggers_approval(): void
    {
        $policy = new PricingPolicy();
        // 12% drop from 500000 kobo
        $this->assertTrue($policy->requiresApproval(50000000, 44000000, 10.0));
        $this->assertFalse($policy->requiresApproval(50000000, 48000000, 10.0));
        $this->assertFalse($policy->requiresApproval(50000000, 55000000, 10.0));
    }

    public function test_below_minimum(): void
    {
        $policy = new PricingPolicy();
        $this->assertTrue($policy->belowMinimum(40000000, 45000000));
        $this->assertFalse($policy->belowMinimum(50000000, 45000000));
    }

    public function test_field_columns(): void
    {
        $bulk = new PriceBulkUpdate();
        $this->assertSame('current_selling_price', $bulk->columnForField('current'));
        $this->assertSame('min_selling_price', $bulk->columnForField('min'));
        $this->assertSame('market_price', $bulk->columnForField('market'));
        $this->assertSame('recent_inbound', $bulk->normalizeScope('recent_inbound'));
    }
}
