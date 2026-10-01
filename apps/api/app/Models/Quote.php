<?php

namespace App\Models;

/**
 * Class Quote
 * Alias / wrapper for RepairQuote to support both conventions.
 */
class Quote extends RepairQuote
{
    protected $table = 'repair_quotes';
}
