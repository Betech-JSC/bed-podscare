<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Notification;
use App\Models\RepairOrder;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Notification>
 */
class NotificationFactory extends Factory
{
    protected $model = Notification::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => null,
            'branch_id' => null,
            'type' => fake()->randomElement(['order_status', 'sla_warning', 'qc_action', 'quote_action']),
            'title' => fake()->sentence(4),
            'message' => fake()->paragraph(1),
            'order_id' => null,
            'severity' => fake()->randomElement(['info', 'warning', 'danger', 'success']),
            'is_read' => false,
            'read_at' => null,
        ];
    }

    /**
     * Indicate that the notification is read.
     */
    public function read(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_read' => true,
            'read_at' => now(),
        ]);
    }
}
