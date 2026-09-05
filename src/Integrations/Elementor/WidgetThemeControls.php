<?php
declare(strict_types=1);

namespace Atoms\Integrations\Elementor;

/** Shared Elementor theme selector for public inventory widgets. */
trait WidgetThemeControls
{
    protected function registerThemeControl(): void
    {
        $this->add_control(
            'widget_theme',
            [
                'label'   => 'Color theme',
                'type'    => \Elementor\Controls_Manager::SELECT,
                'default' => 'light',
                'options' => [
                    'light' => 'Light',
                    'dark'  => 'Dark',
                    'brand' => 'Brand accent',
                ],
            ]
        );
    }

    /**
     * @param array<string, mixed> $settings
     */
    protected function themeFromSettings(array $settings): string
    {
        $theme = sanitize_key((string) ($settings['widget_theme'] ?? 'light'));

        return in_array($theme, ['light', 'dark', 'brand'], true) ? $theme : 'light';
    }
}
