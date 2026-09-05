<?php
declare(strict_types=1);

namespace Atoms\Integrations\Elementor;

use Atoms\Integrations\Elementor\Widgets\BranchShowcaseWidget;
use Atoms\Integrations\Elementor\Widgets\PosPortalWidget;
use Atoms\Integrations\Elementor\Widgets\StockLookupWidget;
use Atoms\Integrations\Elementor\Widgets\TradeInCalculatorWidget;
use Atoms\Integrations\Elementor\Widgets\WarrantyCheckWidget;

final class ElementorExtension
{
    public const CATEGORY = 'atoms-category';

    public function register(): void
    {
        add_action('elementor/elements/categories_registered', [$this, 'registerCategory']);
        add_action('elementor/widgets/register', [$this, 'registerWidgets']);
    }

    public function registerCategory(\Elementor\Elements_Manager $elementsManager): void
    {
        $elementsManager->add_category(
            self::CATEGORY,
            [
                'title' => 'Abu Twins Invent',
                'icon'  => 'fa fa-cube',
            ]
        );
    }

    public function registerWidgets(\Elementor\Widgets_Manager $widgetsManager): void
    {
        if (class_exists(StockLookupWidget::class)) {
            $widgetsManager->register(new StockLookupWidget());
        }
        if (class_exists(WarrantyCheckWidget::class)) {
            $widgetsManager->register(new WarrantyCheckWidget());
        }
        if (class_exists(TradeInCalculatorWidget::class)) {
            $widgetsManager->register(new TradeInCalculatorWidget());
        }
        if (class_exists(BranchShowcaseWidget::class)) {
            $widgetsManager->register(new BranchShowcaseWidget());
        }
        if (class_exists(PosPortalWidget::class)) {
            $widgetsManager->register(new PosPortalWidget());
        }
    }
}
