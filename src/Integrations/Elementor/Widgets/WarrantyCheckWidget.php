<?php
declare(strict_types=1);

namespace Atoms\Integrations\Elementor\Widgets;

use Atoms\Integrations\Elementor\ElementorExtension;
use Atoms\Integrations\Elementor\WidgetThemeControls;
use Atoms\Integrations\Shortcodes\ShortcodesHandler;

if (!class_exists('\Elementor\Widget_Base')) {
    return;
}

final class WarrantyCheckWidget extends \Elementor\Widget_Base
{
    use WidgetThemeControls;
    public function get_name(): string
    {
        return 'atoms_warranty_check';
    }

    public function get_title(): string
    {
        return 'IMEI Warranty Checker';
    }

    public function get_icon(): string
    {
        return 'eicon-shield-check';
    }

    public function get_categories(): array
    {
        return [ElementorExtension::CATEGORY];
    }

    public function get_keywords(): array
    {
        return ['atoms', 'warranty', 'imei', 'serial', 'verify', 'authenticity', 'device'];
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
                'default'     => 'Official IMEI & Warranty Verification',
                'label_block' => true,
            ]
        );

        $this->add_control(
            'widget_subtitle',
            [
                'label'       => 'Subtitle',
                'type'        => \Elementor\Controls_Manager::TEXTAREA,
                'default'     => 'Enter your 15-digit IMEI or Serial Number to check warranty status and device authenticity',
                'rows'        => 2,
            ]
        );

        $this->registerThemeControl();

        $this->end_controls_section();

        $this->start_controls_section(
            'section_style',
            [
                'label' => 'Styling',
                'tab'   => \Elementor\Controls_Manager::TAB_STYLE,
            ]
        );

        $this->add_control(
            'accent_color',
            [
                'label'     => 'Badge & Button Color',
                'type'      => \Elementor\Controls_Manager::COLOR,
                'default'   => '#2F3590',
                'selectors' => [
                    '{{WRAPPER}} .atoms-fe-btn.primary' => 'background-color: {{VALUE}};',
                ],
            ]
        );

        $this->end_controls_section();
    }

    protected function render(): void
    {
        $settings = $this->get_settings_for_display();
        $handler = new ShortcodesHandler();
        echo $handler->warrantyCheck([
            'title'    => $settings['widget_title'] ?? 'Official IMEI & Warranty Verification',
            'subtitle' => $settings['widget_subtitle'] ?? 'Enter your 15-digit IMEI or Serial Number to check warranty status and device authenticity',
            'theme'    => $this->themeFromSettings($settings),
        ]);
    }
}
