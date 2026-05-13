<?php

namespace App\Services;

use App\Models\Category;
use Illuminate\Support\Facades\Log;

class CategorySuggestionService
{
    protected string $modelPath;

    protected string $cliPath;

    protected array $labelMap;

    public function __construct()
    {
        $this->modelPath = storage_path('app/ml/autocategorize.ftz');
        $this->cliPath = '/tmp/fastText/fasttext';
        $this->labelMap = $this->buildLabelMap();
    }

    /**
     * Predict category from a note text.
     *
     * @return array [{ category_id, category_name }]
     */
    public function suggest(string $note, int $k = 3): array
    {
        $note = trim($note);
        if (empty($note)) {
            return [];
        }

        if (!file_exists($this->modelPath) || !file_exists($this->cliPath)) {
            Log::warning('CategorySuggestion: model or CLI not found');
            return [];
        }

        $cmd = escapeshellcmd($this->cliPath) . ' predict '
             . escapeshellarg($this->modelPath) . ' - ' . (int) $k;

        $output = shell_exec('echo ' . escapeshellarg($note) . ' | ' . $cmd);

        if ($output === null || $output === '') {
            return [];
        }

        return $this->parseOutput(trim($output));
    }

    protected function parseOutput(string $output): array
    {
        $results = [];
        $parts = preg_split('/\s+/', trim($output));

        foreach ($parts as $label) {
            $label = trim($label);
            if (empty($label)) continue;
            if (isset($this->labelMap[$label])) {
                $results[] = $this->labelMap[$label];
            }
        }

        return $results;
    }

    protected function buildLabelMap(): array
    {
        $categories = Category::where('is_system', true)->get();
        $map = [];

        foreach ($categories as $cat) {
            // Must match Python labelize(): replace &→and, then spaces→underscores
            $name = str_replace(' & ', ' and ', $cat->name);
            $label = '__label__' . str_replace(
                [' ', '-', '/'],
                ['_', '_', '_'],
                $name
            );
            $map[$label] = [
                'category_id' => $cat->id,
                'category_name' => $cat->name,
            ];
        }

        return $map;
    }
}
