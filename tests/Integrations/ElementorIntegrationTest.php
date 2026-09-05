<?php
declare(strict_types=1);

namespace Atoms\Tests\Integrations;

use Atoms\Integrations\Elementor\ElementorExtension;
use Atoms\Integrations\Shortcodes\ShortcodesHandler;
use PHPUnit\Framework\TestCase;

final class ElementorIntegrationTest extends TestCase
{
    public function test_category_constant_is_defined(): void
    {
        $this->assertSame('atoms-category', ElementorExtension::CATEGORY);
    }

    public function test_shortcodes_handler_can_instantiate(): void
    {
        $handler = new ShortcodesHandler();
        $this->assertInstanceOf(ShortcodesHandler::class, $handler);
    }

    public function test_public_shortcodes_emit_theme_attribute(): void
    {
        $handler = new ShortcodesHandler();
        $this->assertStringContainsString('data-theme="dark"', $handler->stockLookup(['theme' => 'dark']));
        $this->assertStringContainsString('data-theme="brand"', $handler->warrantyCheck(['theme' => 'brand']));
        $this->assertStringContainsString('data-theme="dark"', $handler->tradeInCalculator(['theme' => 'dark']));
        $this->assertStringContainsString('data-theme="light"', $handler->branchShowcase(['theme' => 'light']));
    }
}
