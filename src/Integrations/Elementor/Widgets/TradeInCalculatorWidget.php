<?php
declare(strict_types=1);

namespace Atoms\Integrations\Elementor\Widgets;

use Atoms\Integrations\Elementor\ElementorExtension;
use Atoms\Integrations\Elementor\WidgetThemeControls;
use Atoms\Integrations\Shortcodes\ShortcodesHandler;

if (!class_exists('\Elementor\Widget_Base')) {
    return;
}

final class TradeInCalculatorWidget extends \Elementor\Widget_Base
{
    use WidgetThemeControls;
    public function get_name(): string
    {
        return 'atoms_trade_in_calculator';
    }

    public function get_title(): string
    {
        return 'Trade-In / Swap Calculator';
    }

    public function get_icon(): string
    {
        return 'eicon-exchange';
    }

    public function get_categories(): array
    {
        return [ElementorExtension::CATEGORY];
    }

    public function get_keywords(): array
    {
        return ['atoms', 'trade-in', 'swap', 'calculator', 'phone', 'upgrade', 'estimate'];
    }

    protected function register_controls(): void
    {
        $this->start_controls_section(
            'section_content',
            [
                'label' => 'Content & Copy',
                'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
            ]
        );

        $this->add_control(
            'widget_title',
            [
                'label'       => 'Title',
                'type'        => \Elementor\Controls_Manager::TEXT,
                'default'     => 'Device Trade-In / Swap Value Calculator',
                'label_block' => true,
            ]
        );

        $this->add_control(
            'widget_subtitle',
            [
                'label'       => 'Subtitle',
                'type'        => \Elementor\Controls_Manager::TEXTAREA,
                'default'     => 'Get an instant valuation estimate for your phone and upgrade in store today',
                'rows'        => 2,
            ]
        );

        $this->registerThemeControl();

        $this->end_controls_section();
    }

    protected function render(): void
    {
        $settings = $this->get_settings_for_display();
        $handler = new ShortcodesHandler();
        echo $handler->tradeInCalculator([
            'title'    => $settings['widget_title'] ?? 'Device Trade-In / Swap Value Calculator',
            'subtitle' => $settings['widget_subtitle'] ?? 'Get an instant valuation estimate for your phone and upgrade in store today',
            'theme'    => $this->themeFromSettings($settings),
        ]);
    }
}
