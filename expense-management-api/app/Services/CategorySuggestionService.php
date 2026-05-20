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
        $isWindows = DIRECTORY_SEPARATOR === '\\';
        $this->pythonBin = env('PYTHON_BIN', $isWindows
            ? base_path('../venv/Scripts/python.exe')
            : base_path('../venv/bin/python3'));
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

        $output = $this->runPython($script);
        if ($output === '') {
            return [];
        }

        return $this->parseOutput(trim($output));
    }

    protected function runPython(string $script): string
    {
        $process = proc_open(
            [$this->pythonBin, '-c', $script],
            [
                1 => ['pipe', 'w'],
                2 => ['pipe', 'w'],
            ],
            $pipes,
            null,
            null,
            ['bypass_shell' => true]
        );

        if (!is_resource($process)) {
            Log::warning('CategorySuggestion: failed to start python process', [
                'python_bin' => $this->pythonBin,
            ]);
            return '';
        }

        $stdout = stream_get_contents($pipes[1]) ?: '';
        $stderr = stream_get_contents($pipes[2]) ?: '';
        fclose($pipes[1]);
        fclose($pipes[2]);

        $exitCode = proc_close($process);
        if ($exitCode !== 0) {
            Log::warning('CategorySuggestion: python prediction failed', [
                'python_bin' => $this->pythonBin,
                'exit_code' => $exitCode,
                'stderr' => trim($stderr),
            ]);
            return '';
        }

        return $stdout;
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
