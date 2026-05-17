<?php

namespace App\Services;

use App\Models\Category;
use Illuminate\Support\Facades\Log;

class CategorySuggestionService
{
    protected string $modelPath;
    protected string $pythonBin;
    protected array $labelMap;

    public function __construct()
    {
        $this->modelPath = storage_path('app/ml/autocategorize.ftz');
        $this->pythonBin = env('PYTHON_BIN', base_path('../venv/bin/python3'));
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

        if (!file_exists($this->modelPath)) {
            Log::warning('CategorySuggestion: model not found at ' . $this->modelPath);
            return [];
        }

        $script = sprintf(
            'import json, fasttext; '
            . 'm = fasttext.load_model(%s); '
            . 'labels, scores = m.predict(%s, k=%d); '
            . 'print(json.dumps([{"label": l, "score": float(s)} for l, s in zip(labels, scores)]))',
            json_encode($this->modelPath, JSON_UNESCAPED_SLASHES),
            json_encode($note, JSON_UNESCAPED_SLASHES),
            $k
        );

        $cmd = sprintf(
            '%s -c %s 2>/dev/null',
            escapeshellcmd($this->pythonBin),
            escapeshellarg($script)
        );
        $output = shell_exec($cmd);

        if ($output === null || $output === '') {
            return [];
        }

        return $this->parseOutput(trim($output));
    }

    protected function parseOutput(string $output): array
    {
        $decoded = json_decode($output, true);
        if (!$decoded) {
            return [];
        }

        $results = [];
        foreach ($decoded as $item) {
            $label = $item['label'] ?? '';
            if (isset($this->labelMap[$label])) {
                $result = $this->labelMap[$label];
                $result['score'] = $item['score'] ?? 0;
                $results[] = $result;
            }
        }

        return $results;
    }

    protected function buildLabelMap(): array
    {
        $categories = Category::where('is_system', true)->get();
        $map = [];

        foreach ($categories as $cat) {
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
