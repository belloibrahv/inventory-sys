<?php
declare(strict_types=1);

namespace Atoms\Integrations\Elementor\Widgets;

use Atoms\Integrations\Elementor\ElementorExtension;
use Atoms\Integrations\Shortcodes\ShortcodesHandler;

if (!class_exists('\Elementor\Widget_Base')) {
    return;
}

final class PosPortalWidget extends \Elementor\Widget_Base
{
    public function get_name(): string
    {
        return 'atoms_pos_portal';
    }

    public function get_title(): string
    {
        return 'Staff Operations Portal';
    }

    public function get_icon(): string
    {
        return 'eicon-apps';
    }

    public function get_categories(): array
    {
        return [ElementorExtension::CATEGORY];
    }

    public function get_keywords(): array
    {
        return ['atoms', 'pos', 'portal', 'staff', 'sales', 'terminal', 'dashboard'];
    }

    protected function register_controls(): void
    {
        $this->start_controls_section(
            'section_content',
            [
                'label' => 'Portal Settings',
                'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
            ]
        );

        $this->add_control(
            'portal_height',
            [
                'label'      => 'Height',
                'type'       => \Elementor\Controls_Manager::SLIDER,
                'size_units' => ['px', 'vh'],
                'range'      => [
                    'px' => ['min' => 500, 'max' => 1400],
                    'vh' => ['min' => 50, 'max' => 100],
                ],
                'default'    => ['unit' => 'px', 'size' => 850],
                'selectors'  => [
                    '{{WRAPPER}} .atoms-fe-portal-container iframe' => 'height: {{SIZE}}{{UNIT}} !important;',
                ],
            ]
        );

        $this->end_controls_section();
    }

    protected function render(): void
    {
        $handler = new ShortcodesHandler();
        echo $handler->posPortal();
    }
}
