<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\ImeiStatus;
use Atoms\Domain\ImeiStatusMachine;
use Atoms\Domain\DomainException;
use PHPUnit\Framework\TestCase;

final class ImeiStatusMachineTest extends TestCase
{
    private ImeiStatusMachine $machine;

    protected function setUp(): void
    {
        $this->machine = new ImeiStatusMachine();
    }

    public function test_available_device_can_be_sold(): void
    {
        $to = $this->machine->apply(ImeiStatus::Available, 'complete_sale');
        $this->assertSame(ImeiStatus::Sold, $to);
    }

    public function test_cannot_sell_faulty_stock(): void
    {
        $this->expectException(DomainException::class);
        $this->machine->apply(ImeiStatus::Faulty, 'complete_sale');
    }

    public function test_cannot_sell_reserved_via_complete_without_reserve_path(): void
    {
        $this->assertTrue($this->machine->canTransition(ImeiStatus::Reserved, 'complete_sale'));
        $this->assertFalse($this->machine->canTransition(ImeiStatus::Sold, 'complete_sale'));
    }

    public function test_transfer_round_trip(): void
    {
        $this->assertTrue($this->machine->canTransition(ImeiStatus::Reserved, 'confirm_inbound'));
        $confirmed = $this->machine->apply(ImeiStatus::Reserved, 'confirm_inbound');
        $this->assertSame(ImeiStatus::Available, $confirmed);

        $inTransit = $this->machine->apply(ImeiStatus::Available, 'transfer_dispatch');
        $this->assertSame(ImeiStatus::Transferred, $inTransit);
        $back = $this->machine->apply($inTransit, 'transfer_receive');
        $this->assertSame(ImeiStatus::Available, $back);
    }

    public function test_faulty_return_separates_stock(): void
    {
        $to = $this->machine->apply(ImeiStatus::Sold, 'return_faulty');
        $this->assertSame(ImeiStatus::Faulty, $to);
    }

    public function test_good_return_restores_availability(): void
    {
        $to = $this->machine->apply(ImeiStatus::Sold, 'return_good');
        $this->assertSame(ImeiStatus::Available, $to);
    }

    public function test_warranty_repair_returns_device_to_customer(): void
    {
        $this->assertTrue($this->machine->canTransition(ImeiStatus::Sold, 'send_to_repair'));
        $under = $this->machine->apply(ImeiStatus::Sold, 'send_to_repair');
        $this->assertSame(ImeiStatus::UnderRepair, $under);
        $this->assertSame(ImeiStatus::Sold, $this->machine->apply($under, 'repair_return_customer'));
    }

    public function test_missing_at_stock_count_disposes_available_or_faulty(): void
    {
        $this->assertSame(ImeiStatus::Disposed, $this->machine->apply(ImeiStatus::Available, 'count_missing'));
        $this->assertSame(ImeiStatus::Disposed, $this->machine->apply(ImeiStatus::Faulty, 'count_missing'));
        $this->assertFalse($this->machine->canTransition(ImeiStatus::Sold, 'count_missing'));
        $this->assertFalse($this->machine->canTransition(ImeiStatus::Reserved, 'count_missing'));
    }

    public function test_swap_sells_the_outgoing_device(): void
    {
        $this->assertSame(ImeiStatus::Sold, $this->machine->apply(ImeiStatus::Available, 'swap_out'));
        $this->assertSame(ImeiStatus::Available, $this->machine->apply(ImeiStatus::Available, 'swap_in'));
        $this->assertFalse($this->machine->canTransition(ImeiStatus::Sold, 'swap_out'));
    }
}
