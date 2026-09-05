<?php
declare(strict_types=1);

namespace Atoms\Integrations\Elementor\Widgets;

use Atoms\Integrations\Elementor\ElementorExtension;
use Atoms\Integrations\Elementor\WidgetThemeControls;
use Atoms\Integrations\Shortcodes\ShortcodesHandler;

if (!class_exists('\Elementor\Widget_Base')) {
    return;
}

final class StockLookupWidget extends \Elementor\Widget_Base
{
    use WidgetThemeControls;
    public function get_name(): string
    {
        return 'atoms_stock_lookup';
    }

    public function get_title(): string
    {
        return 'Live Stock Checker';
    }

    public function get_icon(): string
    {
        return 'eicon-search-results';
    }

    public function get_categories(): array
    {
        return [ElementorExtension::CATEGORY];
    }

    public function get_keywords(): array
    {
        return ['atoms', 'stock', 'inventory', 'phones', 'search', 'availability', 'catalog'];
    }

    protected function register_controls(): void
    {
        $this->start_controls_section(
            'section_content',
            [
                'label' => 'Content & Settings',
                'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
            ]
        );

        $this->add_control(
            'widget_title',
            [
                'label'       => 'Header Title',
                'type'        => \Elementor\Controls_Manager::TEXT,
                'default'     => 'Search Available Devices & Stock',
                'placeholder' => 'Enter section title',
                'label_block' => true,
            ]
        );

        $this->add_control(
            'widget_subtitle',
            [
                'label'       => 'Header Subtitle',
                'type'        => \Elementor\Controls_Manager::TEXTAREA,
                'default'     => 'Real-time inventory lookup across our retail branches',
                'rows'        => 2,
            ]
        );

        $this->add_control(
            'show_price',
            [
                'label'        => 'Show Selling Price',
                'type'         => \Elementor\Controls_Manager::SWITCHER,
                'label_on'     => 'Show',
                'label_off'    => 'Hide',
                'return_value' => 'yes',
                'default'      => 'yes',
            ]
        );

        $this->add_control(
            'cta_text',
            [
                'label'       => 'Button CTA Text',
                'type'        => \Elementor\Controls_Manager::TEXT,
                'default'     => 'Inquire on WhatsApp',
            ]
        );

        $this->registerThemeControl();

        $this->end_controls_section();

        // Style Tab
        $this->start_controls_section(
            'section_style',
            [
                'label' => 'Container Styling',
                'tab'   => \Elementor\Controls_Manager::TAB_STYLE,
            ]
        );

        $this->add_control(
            'primary_color',
            [
                'label'     => 'Primary Accent Color',
                'type'      => \Elementor\Controls_Manager::COLOR,
                'default'   => '#2F3590',
                'selectors' => [
                    '{{WRAPPER}} .atoms-fe-btn.primary' => 'background-color: {{VALUE}};',
                    '{{WRAPPER}} .atoms-fe-badge'       => 'color: {{VALUE}}; border-color: {{VALUE}};',
                ],
            ]
        );

        $this->add_control(
            'card_border_radius',
            [
                'label'      => 'Card Border Radius',
                'type'       => \Elementor\Controls_Manager::SLIDER,
                'size_units' => ['px', '%'],
                'range'      => [
                    'px' => ['min' => 0, 'max' => 32],
                ],
                'default'    => ['unit' => 'px', 'size' => 14],
                'selectors'  => [
                    '{{WRAPPER}} .atoms-fe-widget' => 'border-radius: {{SIZE}}{{UNIT}};',
                    '{{WRAPPER}} .atoms-fe-catalog-card' => 'border-radius: {{SIZE}}{{UNIT}};',
                ],
            ]
        );

        $this->end_controls_section();
    }

    protected function render(): void
    {
        $settings = $this->get_settings_for_display();

        $handler = new ShortcodesHandler();
        echo $handler->stockLookup([
            'title'      => $settings['widget_title'] ?? 'Search Available Devices & Stock',
            'subtitle'   => $settings['widget_subtitle'] ?? 'Real-time inventory lookup across our retail branches',
            'show_price' => $settings['show_price'] ?? 'yes',
            'cta_text'   => $settings['cta_text'] ?? 'Inquire on WhatsApp',
            'theme'      => $this->themeFromSettings($settings),
        ]);
    }
}
