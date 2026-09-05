<?php
declare(strict_types=1);

namespace Atoms\Integrations\Elementor\Widgets;

use Atoms\Integrations\Elementor\ElementorExtension;
use Atoms\Integrations\Elementor\WidgetThemeControls;
use Atoms\Integrations\Shortcodes\ShortcodesHandler;

if (!class_exists('\Elementor\Widget_Base')) {
    return;
}

final class BranchShowcaseWidget extends \Elementor\Widget_Base
{
    use WidgetThemeControls;
    public function get_name(): string
    {
        return 'atoms_branch_showcase';
    }

    public function get_title(): string
    {
        return 'Store Branch Showcase';
    }

    public function get_icon(): string
    {
        return 'eicon-map-pin';
    }

    public function get_categories(): array
    {
        return [ElementorExtension::CATEGORY];
    }

    public function get_keywords(): array
    {
        return ['atoms', 'branches', 'stores', 'locations', 'map', 'contact', 'whatsapp'];
    }

    protected function register_controls(): void
    {
        $this->start_controls_section(
            'section_content',
            [
                'label' => 'Store Directory Content',
                'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
            ]
        );

        $this->add_control(
            'widget_title',
            [
                'label'       => 'Title',
                'type'        => \Elementor\Controls_Manager::TEXT,
                'default'     => 'Our Retail Store Locations',
                'label_block' => true,
            ]
        );

        $this->add_control(
            'widget_subtitle',
            [
                'label'       => 'Subtitle',
                'type'        => \Elementor\Controls_Manager::TEXTAREA,
                'default'     => 'Visit any of our walk-in retail stores or chat with our branch representatives',
                'rows'        => 2,
            ]
        );

        $this->add_control(
            'columns',
            [
                'label'   => 'Columns (Desktop)',
                'type'    => \Elementor\Controls_Manager::SELECT,
                'default' => '3',
                'options' => [
                    '1' => '1 Column',
                    '2' => '2 Columns',
                    '3' => '3 Columns',
                    '4' => '4 Columns',
                ],
            ]
        );

        $this->registerThemeControl();

        $this->end_controls_section();
    }

    protected function render(): void
    {
        $settings = $this->get_settings_for_display();
        $handler = new ShortcodesHandler();
        echo $handler->branchShowcase([
            'title'    => $settings['widget_title'] ?? 'Our Retail Store Locations',
            'subtitle' => $settings['widget_subtitle'] ?? 'Visit any of our walk-in retail stores or chat with our branch representatives',
            'columns'  => $settings['columns'] ?? '3',
            'theme'    => $this->themeFromSettings($settings),
        ]);
    }
}
