<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ReceiptScanService
{
    public function scan(string $imageData, string $mimeType = 'image/jpeg'): ?array
    {
        $result = $this->scanWithGemini($imageData, $mimeType)
            ?? $this->scanWithGroq($imageData, $mimeType);

        if ($result) {
            $result['total'] = $this->convertToBdt($result['total'], $result['currency'] ?? 'BDT');
            $result['currency'] = 'BDT';
        }

        return $result;
    }

    protected function convertToBdt(float $amount, string $currency): float
    {
        $currency = strtoupper($currency);
        if ($currency === 'BDT') return $amount;

        $rates = [
            'USD' => (float) env('EXCHANGE_RATE_USD', 110),
            'EUR' => (float) env('EXCHANGE_RATE_EUR', 120),
            'GBP' => (float) env('EXCHANGE_RATE_GBP', 140),
            'INR' => (float) env('EXCHANGE_RATE_INR', 1.3),
            'SAR' => (float) env('EXCHANGE_RATE_SAR', 29),
            'AED' => (float) env('EXCHANGE_RATE_AED', 30),
            'MYR' => (float) env('EXCHANGE_RATE_MYR', 24),
            'SGD' => (float) env('EXCHANGE_RATE_SGD', 82),
        ];

        $rate = $rates[$currency] ?? null;
        if ($rate === null) return $amount;

        return round($amount * $rate, 2);
    }

    protected function scanWithGemini(string $imageData, string $mimeType): ?array
    {
        $apiKey = config('services.gemini.api_key', env('GEMINI_API_KEY', ''));
        if (empty($apiKey) || $apiKey === 'MY_GEMINI_API_KEY') return null;

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' . $apiKey;

        $response = Http::timeout(30)->post($url, [
            'contents' => [[
                'parts' => [
                    ['text' => $this->buildPrompt()],
                    ['inline_data' => ['mime_type' => $mimeType, 'data' => $imageData]],
                ],
            ]],
            'generationConfig' => ['temperature' => 0.1, 'maxOutputTokens' => 1024],
        ]);

        if (!$response->successful()) {
            Log::warning('Gemini scan failed: ' . $response->status() . ' ' . $response->body());
            return null;
        }

        return $this->parseResponse($response->json());
    }

    protected function scanWithGroq(string $imageData, string $mimeType): ?array
    {
        $apiKey = config('services.groq.api_key', env('GROQ_API_KEY', ''));
        if (empty($apiKey)) return null;

        $dataUrl = "data:{$mimeType};base64,{$imageData}";

        $response = Http::timeout(30)->withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
        ])->post('https://api.groq.com/openai/v1/chat/completions', [
            'model'    => 'meta-llama/llama-4-scout-17b-16e-instruct',
            'messages' => [
                [
                    'role'    => 'user',
                    'content' => [
                        ['type' => 'text', 'text' => $this->buildPrompt()],
                        ['type' => 'image_url', 'image_url' => ['url' => $dataUrl]],
                    ],
                ],
            ],
            'temperature' => 0.1,
            'max_tokens'  => 1024,
        ]);

        if (!$response->successful()) {
            Log::warning('Groq scan failed: ' . $response->status() . ' ' . $response->body());
            return null;
        }

        $body = $response->json();
        $text = $body['choices'][0]['message']['content'] ?? null;
        if (!$text) return null;

        $text = preg_replace('/^```(?:json)?\s*|\s*```$/i', '', trim($text));
        $parsed = json_decode($text, true);
        if (!$parsed || !isset($parsed['total'])) return null;

        return [
            'merchant'      => $parsed['merchant'] ?? null,
            'total'         => (float) ($parsed['total'] ?? 0),
            'date'          => $parsed['date'] ?? null,
            'currency'      => $parsed['currency'] ?? 'BDT',
            'items'         => $parsed['items'] ?? [],
            'category_hint' => $parsed['category_hint'] ?? null,
        ];
    }

    protected function buildPrompt(): string
    {
        return <<<PROMPT
Extract the following from this receipt image and return ONLY valid JSON (no markdown, no code blocks):
{
  "merchant": "store or restaurant name",
  "total": 0.00,
  "date": "YYYY-MM-DD",
  "currency": "BDT, USD, EUR, GBP, INR, SAR, AED, MYR, SGD or other",
  "items": [{"name": "item", "price": 0.00}],
  "category_hint": "one word hint like food, travel, shopping, groceries, transport, utilities, entertainment, health, education"
}
Return ONLY the JSON object.
PROMPT;
    }

    protected function parseResponse(array $body): ?array
    {
        $text = $body['candidates'][0]['content']['parts'][0]['text'] ?? null;
        if (!$text) return null;

        $text = preg_replace('/^```(?:json)?\s*|\s*```$/i', '', trim($text));
        $parsed = json_decode($text, true);
        if (!$parsed || !isset($parsed['total'])) return null;

        return [
            'merchant'      => $parsed['merchant'] ?? null,
            'total'         => (float) ($parsed['total'] ?? 0),
            'date'          => $parsed['date'] ?? null,
            'currency'      => $parsed['currency'] ?? 'BDT',
            'items'         => $parsed['items'] ?? [],
            'category_hint' => $parsed['category_hint'] ?? null,
        ];
    }
}
