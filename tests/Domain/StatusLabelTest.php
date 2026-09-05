<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\StatusLabel;
use PHPUnit\Framework\TestCase;

final class StatusLabelTest extends TestCase
{
    public function test_cashiers_see_business_words_not_machine_keys(): void
    {
        $l = new StatusLabel();
        $this->assertSame('In stock', $l->of('available'));
        $this->assertSame('Waiting for approval', $l->of('pending_approval'));
        $this->assertSame('In transit', $l->of('transferred'));
        $this->assertSame('On the way', $l->of('dispatched'));
        $this->assertSame('Faulty', $l->of('faulty'));
        $this->assertSame('In stock', \Atoms\Domain\ImeiStatus::Available->label());
        $this->assertSame('In repair', \Atoms\Domain\ImeiStatus::UnderRepair->label());
    }
}
